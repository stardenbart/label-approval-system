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
 *   Level 0 (Staff)  membaca pathOriginal, menempel QR dokumen + footer stamp,
 *                    menulis satu berkas: pathSignedLevel0.
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
 */

const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');
const path   = require('path');
const fs     = require('fs');
const { prisma } = require('../config/prisma');
const logger     = require('../config/logger');
const { QR_SIZE_LIMIT_PT, SETTING_DEFAULTS, MAX_APPROVAL_LEVEL } = require('../config/stamp');

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
 * @param {Object} footerPos - { pageNumber, xPercent, yPercent, widthPt, heightPt,
 *                                fontSize, rotation } (already resolved/validated by the caller)
 *                              rotation is one of 0 (Horizontal) / 90 (Vertical) /
 *                              180 (Flip Horizontal) / 270 (Flip Vertical).
 */
async function drawFooter(pdfDoc, document, footerPos) {
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const lines = [
    `ID Regulatory: ${document.regulatoryId}`,
    `Nama Label: ${truncate(document.labelName, 90)}`,
    `Nama File: ${truncate(document.fileNameOriginal, 90)}`,
  ];

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
 * Nama berkas hasil penempelan. Satu per dokumen, bukan satu per level:
 * Level 0 menempel QR dokumen dan footer, level berikutnya tidak menggambar
 * apa pun sehingga tidak ada yang perlu ditulis ulang.
 *
 * Nama `signed_level0.pdf` dipertahankan supaya path dokumen lama di database
 * tetap sah dan tidak perlu migrasi.
 */
const SIGNED_FILENAME = 'signed_level0.pdf';

/**
 * Tempelkan QR dokumen (dan footer stamp) ke PDF. Dipanggil SEKALI saja, oleh
 * Level 0.
 *
 * Sebelumnya tiap level menempel QR miliknya sendiri, sehingga satu label bisa
 * membawa tiga QR yang masing-masing hanya mewakili satu approver. Sekarang
 * yang ditempel adalah QR milik dokumen (`document.qrPathOriginal`, menuju
 * `/e/{docUuid}`), dan halaman publiknya menampilkan seluruh rantai approval —
 * satu QR, isinya hidup dan bertambah seiring approval berjalan.
 *
 * @param {Object}      document - record Prisma; WAJIB punya `qrPathOriginal`
 * @param {Object}      approval - record approval Level 0 (dipakai untuk log)
 * @param {Object|null} position - posisi & ukuran QR, null = pakai default settings
 * @param {Object|null} footerPosition - posisi stamp ID/Label/Nama File
 * @returns {string} path PDF hasil penempelan
 */
async function overlayEsign(document, approval, position, footerPosition = null) {
  const settings = await getSettings();

  const pos = position
    ? validatePosition(position)
    : {
        pageNumber: settings.defaultPage,
        xPercent:   settings.defaultXPercent,
        yPercent:   settings.defaultYPercent,
        widthPt:    settings.defaultWidthPt,
        heightPt:   settings.defaultHeightPt,
      };

  const sourcePath = resolveSourcePath(document);

  const pdfBytes = fs.readFileSync(sourcePath);
  const pdfDoc   = await PDFDocument.load(pdfBytes);
  const pages    = pdfDoc.getPages();

  const pageIndex = Math.max(0, Math.min(pages.length - 1, pos.pageNumber - 1));
  const page      = pages[pageIndex];
  const { width: pageWidthPt, height: pageHeightPt } = page.getSize();

  // Batas paling atas yang sesungguhnya adalah kertasnya sendiri, bukan angka
  // tetap: QR tidak boleh lebih besar dari halaman tempat ia dicetak. Halaman
  // A4, A5, atau ukuran tidak lazim masing-masing dijepit ke dirinya sendiri.
  const maxOnPage = Math.min(pageWidthPt, pageHeightPt);
  if (pos.widthPt > maxOnPage || pos.heightPt > maxOnPage) {
    logger.warn(
      `QR ${pos.widthPt}x${pos.heightPt}pt melebihi halaman ${pageWidthPt.toFixed(0)}x` +
      `${pageHeightPt.toFixed(0)}pt — dijepit ke ${maxOnPage.toFixed(0)}pt`
    );
    pos.widthPt  = Math.min(pos.widthPt,  maxOnPage);
    pos.heightPt = Math.min(pos.heightPt, maxOnPage);
  }

  const xPt = (pos.xPercent / 100) * pageWidthPt;
  const yPt = pageHeightPt - (pos.yPercent / 100) * pageHeightPt - pos.heightPt;

  // QR milik DOKUMEN, bukan milik approval. Dibuat sekali saat upload dan
  // menunjuk ke /e/{docUuid} — halaman yang menampilkan seluruh rantai.
  const qrPath = document.qrPathOriginal;
  if (!qrPath || !fs.existsSync(qrPath)) {
    throw new Error(
      `Document QR not found for document ${document.id}. ` +
      `qrService.generateOriginalQr() must finish and be persisted before overlayEsign().`
    );
  }

  const qrImageBytes = fs.readFileSync(qrPath);
  const qrImage      = await pdfDoc.embedPng(qrImageBytes);

  page.drawImage(qrImage, {
    x:      xPt,
    y:      Math.max(0, yPt),
    width:  pos.widthPt,
    height: pos.heightPt,
  });

  {
    const resolvedFooterPos = footerPosition
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
    await drawFooter(pdfDoc, document, resolvedFooterPos);
  }
  const storageDir = path.dirname(sourcePath);
  const outPath    = path.join(storageDir, SIGNED_FILENAME);

  const signedBytes = await pdfDoc.save();
  fs.writeFileSync(outPath, signedBytes);

  logger.info(
    `PDF signed [approval ${approval.id}]: ${outPath} | ` +
    `page ${pos.pageNumber} | x=${xPt.toFixed(1)}pt y=${yPt.toFixed(1)}pt`
  );

  return outPath;
}

module.exports = { overlayEsign, getSettings, checkQrSize, MAX_APPROVAL_LEVEL, QR_SIZE_LIMIT_PT };
