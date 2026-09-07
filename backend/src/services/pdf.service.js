// backend/src/services/pdf.service.js
'use strict';

/**
 * PDF Service
 * Handles: overlay QR stamp onto PDF, versioning, coordinate conversion
 * Uses: pdf-lib
 *
 * Coordinate system notes:
 * - Browser / frontend: origin TOP-LEFT, pixels
 * - PDF (pdf-lib): origin BOTTOM-LEFT, points (1pt = 1/72 inch)
 * - We store x_percent, y_percent (0-100%) relative to page size
 * - Conversion: xPt = (xPercent/100) * pageWidthPt
 *               yPt = pageHeightPt - (yPercent/100) * pageHeightPt - heightPt
 *               (flip Y because PDF origin is bottom-left)
 *
 * Satu QR per dokumen — bukan satu per level:
 *   Level 0 (Staff)  menentukan posisi QR dokumen + footer stamp dan MEMBEKUKAN
 *                    keputusannya ke document.stampManifest. Tidak ada berkas
 *                    yang ditulis di sini.
 *   Level 1 & 2      tidak menggambar apa pun dan tidak menulis berkas baru.
 *                    Persetujuan mereka tercatat di database dan langsung
 *                    terlihat di halaman publik yang dituju QR itu.
 *
 *   QR yang ditempel adalah `document.qrPathOriginal` → /e/{docUuid}, halaman
 *   yang menampilkan SELURUH rantai approval. Sebelumnya tiap level menempel
 *   QR miliknya sendiri (/e/approval/{approvalId}), sehingga satu label bisa
 *   membawa tiga QR yang masing-masing cuma mewakili satu approver.
 *
 *   Dokumen lama tetap punya approval.qrPath dan halaman /e/approval/:id-nya
 *   tetap dilayani — label yang sudah tercetak masih dipindai orang.
 *
 * Berkas hasil penempelan tidak lagi disimpan per level:
 *
 *   Diukur pada storage nyata, `signed_level0.pdf` adalah salinan UTUH
 *   `original.pdf` yang bedanya cuma 0,1–6,2 KB (QR + tiga baris teks), tapi
 *   memakan tempat sebesar aslinya. Berkas turunan seperti itu mengambil 50%
 *   dari seluruh storage. Merendernya ulang cuma perlu ~25 ms — lebih cepat
 *   daripada mengirimkannya lewat jaringan.
 *
 *   Karena itu alurnya sekarang:
 *     resolveStampManifest()  -> bekukan APA yang digambar (disimpan di DB)
 *     renderStamped()         -> gambar; fungsi murni, deterministik
 *     writeFinalArchive()     -> tulis ke disk; HANYA saat approval final
 *
 *   Yang diminta sebelum approval final dilayani stamped-cache.service.js,
 *   yang boleh dikosongkan kapan saja tanpa kehilangan data.
 *
 *   Berkas arsip itu kemudian dikompresi Ghostscript (lihat
 *   pdf-compress.service.js). Kompresinya lossy dan tidak bisa dibalik, tapi
 *   `original.pdf` tetap utuh dan manifest tetap tersimpan — jadi versi mutu
 *   penuh selalu bisa dibuat ulang, dan itulah yang dilayani endpoint
 *   /documents/:id/signed?quality=full.
 */

const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');
const { prisma } = require('../config/prisma');
const logger     = require('../config/logger');
const { QR_SIZE_LIMIT_PT, SETTING_DEFAULTS, MAX_APPROVAL_LEVEL } = require('../config/stamp');
const compressService = require('./pdf-compress.service');

/**
 * Footer stamp (ID Regulatory / Nama Label / Nama File):
 * Drawn ONCE, at Level 0 (Staff Regulatory's own upload/approval step), at a
 * position Staff Regulatory drags on-screen — same drag UX as the QR box.
 * Because each subsequent level's overlay reads and rebuilds on top of the
 * PREVIOUS level's already-stamped output file (see signing chain above),
 * the footer drawn at Level 0 is physically baked into every later file —
 * it is NEVER redrawn at level 1/2, which would create duplicate/overlapping
 * text. See overlayEsign() below.
 *
 * Placed ONLY on the single page the staff selected (footerPos.pageNumber),
 * same as the QR stamp — NOT auto-repeated across every page of the PDF.
 */
const FOOTER_FONT_SIZE  = 7;
const FOOTER_COLOR      = rgb(0.55, 0.55, 0.55); // gray
const FOOTER_MARGIN_PT  = 18; // legacy fallback margin, used only if no position/default is resolvable

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

/**
 * Rotate a local (x,y) offset by angleDeg around the origin. Used to keep the
 * 3-line footer block rigid as one unit when rotated, instead of each line
 * spinning independently around its own anchor (see drawFooter below).
 */
function rotatePoint(x, y, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: x * Math.cos(rad) - y * Math.sin(rad),
    y: x * Math.sin(rad) + y * Math.cos(rad),
  };
}

/**
 * Tiga baris teks footer, diambil dari record dokumen.
 *
 * Dipisah dari drawFooter() karena isinya harus DIBEKUKAN ke dalam manifest
 * saat penempelan terjadi. Kalau teksnya dibaca ulang dari database waktu
 * merender, mengedit `labelName` bulan depan akan diam-diam mengubah stamp
 * pada berkas yang sudah disetujui — dan berkas hasil regenerasi tidak lagi
 * sama dengan yang dulu benar-benar dicetak.
 */
function footerLinesFor(document) {
  return [
    `ID Regulatory: ${document.regulatoryId}`,
    `Nama Label: ${truncate(document.labelName, 90)}`,
    `Nama File: ${truncate(document.fileNameOriginal, 90)}`,
  ];
}

/**
 * @param {Object}   footerPos - { pageNumber, xPercent, yPercent, widthPt, heightPt,
 *                                fontSize, rotation } (already resolved/validated by the caller)
 *                               rotation is one of 0 (Horizontal) / 90 (Vertical) /
 *                               180 (Flip Horizontal) / 270 (Flip Vertical).
 * @param {string[]} lines     - teks yang digambar, sudah dibekukan oleh pemanggil.
 */
async function drawFooter(pdfDoc, footerPos, lines) {
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const fontSize = footerPos?.fontSize || FOOTER_FONT_SIZE;
  const rotation = footerPos?.rotation || 0;
  const lineGap  = fontSize + 2;

  // Stamp only the single page the staff selected — same as the QR box —
  // instead of repeating it on every page of the document.
  const pages     = pdfDoc.getPages();
  const pageIndex = Math.max(0, Math.min(pages.length - 1, (footerPos?.pageNumber || 1) - 1));
  const page      = pages[pageIndex];

  const { width, height } = page.getSize();
  const xPt = footerPos ? (footerPos.xPercent / 100) * width : FOOTER_MARGIN_PT;
  // Same convention as the QR box: xPercent/yPercent is the box's top-left
  // corner (percent-of-page, top-left origin); subtract heightPt to land on
  // the bottom of the box, which is where the 3-line block's baseline sits.
  const yPt = footerPos
    ? height - (footerPos.yPercent / 100) * height - footerPos.heightPt
    : FOOTER_MARGIN_PT;
  const maxWidth = footerPos ? footerPos.widthPt : width - FOOTER_MARGIN_PT * 2;

  lines.forEach((line, i) => {
    // Local offset (unrotated) from the block's pivot point, same stacking
    // order as before; rotated around the pivot so all 3 lines move as one
    // rigid block instead of spinning independently around their own anchor.
    const localOffsetY = (lines.length - 1 - i) * lineGap;
    const { x: dx, y: dy } = rotatePoint(0, localOffsetY, rotation);

    page.drawText(line, {
      x: xPt + dx,
      y: yPt + dy,
      size: fontSize,
      font,
      color: FOOTER_COLOR,
      maxWidth,
      rotate: degrees(rotation),
    });
  });
}

/**
 * Get system settings as parsed floats
 */
async function getSettings() {
  const rows = await prisma.systemSetting.findMany();
  const stored = Object.fromEntries(rows.map(r => [r.key, parseFloat(r.value)]));
  // Fallback diambil dari SETTING_DEFAULTS, sumber yang sama dengan seeder dan
  // tombol "reset to defaults". Dulu berkas ini punya salinan angkanya sendiri
  // dan sudah menyimpang — minimum di sini 10 sementara yang di-seed 60.
  const map = { ...Object.fromEntries(
    Object.entries(SETTING_DEFAULTS).map(([k, v]) => [k, parseFloat(v)])
  ), ...stored };
  return {
    defaultWidthPt:  map.qr_default_width_pt,
    defaultHeightPt: map.qr_default_height_pt,
    defaultPage:     map.qr_default_page,
    defaultXPercent: map.qr_default_x_percent,
    defaultYPercent: map.qr_default_y_percent,
    minWidthPt:      map.qr_min_width_pt,
    maxWidthPt:      map.qr_max_width_pt,
    // Footer stamp defaults — chosen to reproduce the old hardcoded bottom-left
    // ~18pt margin look on an A4-ish (~595pt wide) page for documents that are
    // never dragged (e.g. legacy behavior before this feature existed).
    footerDefaultXPercent: map.footer_default_x_percent,
    footerDefaultYPercent: map.footer_default_y_percent,
    footerDefaultWidthPt:  map.footer_default_width_pt,
    footerDefaultHeightPt: map.footer_default_height_pt,
    footerDefaultPage:     map.footer_default_page,
    footerDefaultFontSize: map.footer_default_font_size,
    footerDefaultRotation: [0, 90, 180, 270].includes(map.footer_default_rotation) ? map.footer_default_rotation : 0,
  };
}

/**
 * Validate and clamp position values
 */
function validatePosition(pos) {
  const xPercent = Math.max(0, Math.min(100, pos.xPercent));
  const yPercent = Math.max(0, Math.min(100, pos.yPercent));
  // CATATAN: ukuran TIDAK lagi dipotong diam-diam ke rentang settings di sini.
  // Dulu approver bisa memilih 180pt lalu mendapat 120pt tercetak tanpa satu pun
  // pesan. Pelanggaran rentang kebijakan sekarang ditolak lebih awal oleh
  // checkQrSize() di controller, dengan pesan yang menyebut angkanya. Yang masih
  // dijepit adalah batas fisik halaman — dilakukan di overlayEsign(), tempat
  // ukuran halaman sebenarnya diketahui.
  return {
    pageNumber: pos.pageNumber || 1,
    xPercent,
    yPercent,
    widthPt:  pos.widthPt,
    heightPt: pos.heightPt,
  };
}

/**
 * Apakah ukuran ini berada dalam rentang kebijakan yang disetel superadmin?
 * Dipakai controller supaya penolakan datang sebagai 400 dengan pesan jelas,
 * bukan sebagai gambar yang diam-diam mengecil.
 *
 * @returns {{ ok: boolean, message?: string }}
 */
function checkQrSize(position, settings) {
  if (!position) return { ok: true };
  const { minWidthPt: min, maxWidthPt: max } = settings;
  for (const [field, val] of [['widthPt', position.widthPt], ['heightPt', position.heightPt]]) {
    if (val < min || val > max) {
      return {
        ok: false,
        message:
          `Ukuran QR ${field} ${val}pt di luar rentang yang diizinkan ${min}–${max}pt. ` +
          `Superadmin dapat mengubah rentang ini di System Settings.`,
      };
    }
  }
  return { ok: true };
}

/**
 * Validate and clamp footer position values
 */
function validateFooterPosition(pos) {
  const xPercent = Math.max(0, Math.min(100, pos.xPercent));
  const yPercent = Math.max(0, Math.min(100, pos.yPercent));
  const widthPt  = Math.max(50, Math.min(400, pos.widthPt));
  const heightPt = Math.max(15, Math.min(100, pos.heightPt));
  const fontSize = Math.max(5, Math.min(24, pos.fontSize || FOOTER_FONT_SIZE));
  const rotation = [0, 90, 180, 270].includes(pos.rotation) ? pos.rotation : 0;
  return { pageNumber: pos.pageNumber || 1, xPercent, yPercent, widthPt, heightPt, fontSize, rotation };
}

/**
 * Sumber PDF untuk penempelan. Hanya Level 0 yang pernah menggambar, jadi
 * sumbernya selalu berkas asli — tidak ada lagi rantai baca-tulis antar level.
 */
function resolveSourcePath(document) {
  if (!document.pathOriginal || !fs.existsSync(document.pathOriginal)) {
    throw new Error(`Original PDF not found for document ${document.id}`);
  }
  return document.pathOriginal;
}

/**
 * Nama berkas arsip. Satu per dokumen, ditulis SEKALI saat approval final.
 *
 * `signed_level0.pdf` dipertahankan sebagai nama karena dokumen lama menunjuk
 * ke sana lewat path_signed_level0 dan path_signed_final; mengganti namanya
 * berarti migrasi path di database tanpa manfaat apa pun.
 */
const SIGNED_FILENAME = 'signed_level0.pdf';

/**
 * Versi bentuk manifest. Dinaikkan kalau arti sebuah field berubah, supaya
 * manifest lama tetap bisa dikenali dan dirender dengan aturan lamanya.
 */
const MANIFEST_VERSION = 1;

/**
 * Field yang benar-benar menentukan rupa berkas hasil render. Dipakai untuk
 * menghitung kunci cache: dua manifest dengan field-field ini sama PASTI
 * menghasilkan PDF yang sama, jadi hasilnya boleh dipakai ulang.
 *
 * `stampedAt` dan `stampedBy` sengaja TIDAK ikut — keduanya jejak audit, tidak
 * tergambar di halaman.
 */
const RENDER_KEYS = ['v', 'qr', 'footer', 'footerText', 'qrFile', 'sourceSha'];

/**
 * Dari mana manifest ini berasal.
 *
 *   stamp     dibuat resolveStampManifest() pada saat penempelan. Berkas hasil
 *             render dijamin sama dengan yang dulu benar-benar dicetak.
 *   backfill  disusun scripts/backfill-stamp-manifest.js dari baris posisi yang
 *             tersimpan. Tebakan yang masuk akal, TAPI tidak ada yang menyaksikan
 *             penempelan aslinya — dokumen yang di-stamp versi lama memakai QR
 *             per approval, bukan QR dokumen, dan itu tidak terekam di mana pun.
 */
const MANIFEST_ORIGIN = { STAMP: 'stamp', BACKFILL: 'backfill' };

/**
 * Bolehkah manifest ini dipakai sebagai dasar operasi yang TIDAK BISA
 * DIBATALKAN (menghapus berkas, menimpanya dengan versi lossy)?
 *
 * Manifest lama yang belum punya `origin` diperlakukan sebagai backfill —
 * gagal ke arah aman.
 */
function manifestIsTrustworthy(manifest) {
  return manifest?.origin === MANIFEST_ORIGIN.STAMP;
}

/**
 * Kunci cache: sha256 dari bagian manifest yang mempengaruhi hasil render.
 * Ikut masuk ke nama berkas cache, sehingga manifest berubah = cache otomatis
 * meleset. Tidak ada invalidasi eksplisit yang bisa terlupa.
 */
function manifestHash(manifest) {
  const subset = {};
  for (const k of RENDER_KEYS) subset[k] = manifest[k] ?? null;
  return crypto.createHash('sha256').update(JSON.stringify(subset)).digest('hex').slice(0, 16);
}

/**
 * Tentukan apa yang akan digambar — dan bekukan.
 *
 * Semua fallback ke System Settings diselesaikan DI SINI, sekali, pada saat
 * penempelan. Yang tersimpan adalah angka jadi, bukan "pakai default". Kalau
 * superadmin menaikkan default ukuran QR tahun depan, dokumen yang sudah
 * disetujui tetap dirender persis seperti saat disetujui.
 *
 * Ukuran juga sudah dijepit ke halaman di sini, sehingga renderStamped() tidak
 * perlu mengambil keputusan apa pun.
 *
 * @param {Object}      document - record Prisma; WAJIB punya pathOriginal & qrPathOriginal
 * @param {Object|null} position - posisi & ukuran QR pilihan approver, null = pakai default
 * @param {Object|null} footerPosition - posisi footer stamp, null = pakai default
 * @param {string|null} stampedBy - user id, untuk jejak audit
 * @returns {Promise<Object>} manifest
 */
async function resolveStampManifest(document, position, footerPosition, stampedBy = null) {
  const settings   = await getSettings();
  const sourcePath = resolveSourcePath(document);

  const qrFile = document.qrPathOriginal;
  if (!qrFile || !fs.existsSync(qrFile)) {
    throw new Error(
      `Document QR not found for document ${document.id}. ` +
      `qrService.generateOriginalQr() must finish and be persisted before stamping.`
    );
  }

  const pos = position
    ? validatePosition(position)
    : {
        pageNumber: settings.defaultPage,
        xPercent:   settings.defaultXPercent,
        yPercent:   settings.defaultYPercent,
        widthPt:    settings.defaultWidthPt,
        heightPt:   settings.defaultHeightPt,
      };

  const fp = footerPosition
    ? validateFooterPosition(footerPosition)
    : {
        pageNumber: settings.footerDefaultPage,
        xPercent:   settings.footerDefaultXPercent,
        yPercent:   settings.footerDefaultYPercent,
        widthPt:    settings.footerDefaultWidthPt,
        heightPt:   settings.footerDefaultHeightPt,
        fontSize:   settings.footerDefaultFontSize,
        rotation:   settings.footerDefaultRotation,
      };

  // Jepit ke halaman sebenarnya. Batas paling atas adalah kertasnya sendiri,
  // bukan angka tetap: A4, A5, atau ukuran tidak lazim masing-masing dijepit ke
  // dirinya sendiri. Dilakukan sekarang supaya angka di manifest sudah final.
  const srcBytes = fs.readFileSync(sourcePath);
  const probe    = await PDFDocument.load(srcBytes);
  const pages    = probe.getPages();
  const pageIdx  = Math.max(0, Math.min(pages.length - 1, pos.pageNumber - 1));
  const { width: pw, height: ph } = pages[pageIdx].getSize();
  const maxOnPage = Math.min(pw, ph);

  if (pos.widthPt > maxOnPage || pos.heightPt > maxOnPage) {
    logger.warn(
      `QR ${pos.widthPt}x${pos.heightPt}pt melebihi halaman ${pw.toFixed(0)}x${ph.toFixed(0)}pt ` +
      `— dijepit ke ${maxOnPage.toFixed(0)}pt`
    );
    pos.widthPt  = Math.min(pos.widthPt,  maxOnPage);
    pos.heightPt = Math.min(pos.heightPt, maxOnPage);
  }

  return {
    v: MANIFEST_VERSION,
    qr: {
      page: pos.pageNumber,
      xPct: pos.xPercent,
      yPct: pos.yPercent,
      wPt:  pos.widthPt,
      hPt:  pos.heightPt,
    },
    footer: {
      page:     fp.pageNumber,
      xPct:     fp.xPercent,
      yPct:     fp.yPercent,
      wPt:      fp.widthPt,
      hPt:      fp.heightPt,
      fontSize: fp.fontSize,
      rotation: fp.rotation,
    },
    footerText: footerLinesFor(document),
    qrFile,
    // Mengunci manifest ke isi berkas asli yang benar. Kalau original.pdf
    // ternyata bukan yang dulu di-stamp, regenerasi harus berhenti, bukan
    // diam-diam menghasilkan berkas yang berbeda.
    sourceSha: crypto.createHash('sha256').update(srcBytes).digest('hex'),
    stampedAt: new Date().toISOString(),
    stampedBy,
    // Dibuat SAAT penempelan, jadi berkas hasil render dijamin sama dengan apa
    // yang benar-benar dicetak. Manifest yang disusun belakangan oleh skrip
    // backfill menandai dirinya 'backfill' dan TIDAK memberi jaminan itu —
    // lihat manifestIsTrustworthy().
    origin: MANIFEST_ORIGIN.STAMP,
  };
}

/**
 * Gambar manifest ke atas PDF asli.
 *
 * Fungsi murni: tidak membaca System Settings, tidak menyentuh database, tidak
 * menulis berkas. Masukan yang sama selalu menghasilkan keluaran yang sama —
 * itulah yang membuat berkas hasil penempelan tidak perlu disimpan.
 *
 * @param {Object} document - butuh pathOriginal saja
 * @param {Object} manifest - hasil resolveStampManifest()
 * @returns {Promise<Buffer>} byte PDF hasil penempelan
 */
async function renderStamped(document, manifest) {
  if (!manifest || manifest.v !== MANIFEST_VERSION) {
    throw new Error(`Unsupported stamp manifest version: ${manifest?.v}`);
  }

  const sourcePath = resolveSourcePath(document);
  const pdfDoc     = await PDFDocument.load(fs.readFileSync(sourcePath));
  const pages      = pdfDoc.getPages();

  const { qr } = manifest;
  const pageIndex = Math.max(0, Math.min(pages.length - 1, qr.page - 1));
  const page      = pages[pageIndex];
  const { width: pageWidthPt, height: pageHeightPt } = page.getSize();

  if (!fs.existsSync(manifest.qrFile)) {
    throw new Error(`QR image missing for document ${document.id}: ${manifest.qrFile}`);
  }
  const qrImage = await pdfDoc.embedPng(fs.readFileSync(manifest.qrFile));

  const xPt = (qr.xPct / 100) * pageWidthPt;
  const yPt = pageHeightPt - (qr.yPct / 100) * pageHeightPt - qr.hPt;

  page.drawImage(qrImage, {
    x:      xPt,
    y:      Math.max(0, yPt),
    width:  qr.wPt,
    height: qr.hPt,
  });

  const f = manifest.footer;
  await drawFooter(
    pdfDoc,
    {
      pageNumber: f.page,
      xPercent:   f.xPct,
      yPercent:   f.yPct,
      widthPt:    f.wPt,
      heightPt:   f.hPt,
      fontSize:   f.fontSize,
      rotation:   f.rotation,
    },
    manifest.footerText,
  );

  return Buffer.from(await pdfDoc.save());
}

/**
 * Tulis arsip permanen dari manifest. Dipanggil SEKALI, saat approval final.
 *
 * Inilah satu-satunya berkas hasil penempelan yang disimpan. Level 0 hanya
 * menyimpan manifest; apa pun yang diminta orang sebelum approval final
 * dirender saat itu juga lewat stamped-cache.service.
 *
 * @returns {Promise<string>} path berkas arsip
 */
async function writeFinalArchive(document, manifest, { compress = true } = {}) {
  const outPath = path.join(path.dirname(resolveSourcePath(document)), SIGNED_FILENAME);
  fs.writeFileSync(outPath, await renderStamped(document, manifest));
  logger.info(`Arsip final ditulis: ${outPath}`);

  // Kompresi berjalan SETELAH berkasnya utuh di disk, dan menimpanya hanya
  // kalau hasilnya lolos pemeriksaan (halaman utuh, benar-benar lebih kecil).
  // Gagal apa pun — Ghostscript tidak terpasang, timeout, keluaran rusak —
  // meninggalkan arsip mutu penuh apa adanya. Tidak ada yang perlu ditangani
  // pemanggil.
  if (compress) {
    await compressService.compressInPlace(outPath);
  }
  return outPath;
}

/**
 * Tempelkan QR dokumen + footer, lalu tulis berkasnya — resolve, render, tulis.
 *
 * Dipertahankan sebagai satu langkah utuh untuk pemanggil yang memang ingin
 * berkasnya ada saat itu juga. Alur approval TIDAK lagi memakainya di Level 0:
 * di sana hanya manifest yang disimpan.
 *
 * @returns {Promise<{ path: string, manifest: Object }>}
 */
async function overlayEsign(document, approval, position, footerPosition = null) {
  const manifest = await resolveStampManifest(document, position, footerPosition, approval?.approverId || null);
  const outPath  = await writeFinalArchive(document, manifest);
  logger.info(
    `PDF signed [approval ${approval?.id}]: ${outPath} | ` +
    `page ${manifest.qr.page} | x=${manifest.qr.xPct}% y=${manifest.qr.yPct}%`
  );
  return { path: outPath, manifest };
}

module.exports = {
  overlayEsign,
  resolveStampManifest,
  renderStamped,
  writeFinalArchive,
  manifestHash,
  manifestIsTrustworthy,
  MANIFEST_ORIGIN,
  footerLinesFor,
  getSettings,
  checkQrSize,
  resolveSourcePath,
  SIGNED_FILENAME,
  MANIFEST_VERSION,
  MAX_APPROVAL_LEVEL,
  QR_SIZE_LIMIT_PT,
};
