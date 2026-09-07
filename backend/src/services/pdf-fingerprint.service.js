// backend/src/services/pdf-fingerprint.service.js
'use strict';

/**
 * Ciri visual sebuah PDF — cukup untuk membuktikan dua berkas menggambar hal
 * yang sama, tanpa menuntut byte-nya sama.
 *
 * Perbandingan byte tidak dipakai karena pdf-lib dan Ghostscript menyusun
 * objek, metadata, dan urutan stream secara berbeda tiap kali menyimpan,
 * walaupun halaman yang dihasilkan identik.
 *
 * Dipakai dua tempat, dan keduanya mengambil keputusan yang TIDAK BISA
 * DIBATALKAN:
 *   - backfill-stamp-manifest.js --prune   menghapus berkas
 *   - compress-archives.js --apply         menimpa arsip dengan versi lossy
 *
 * ── Kenapa isi gambar ikut di-hash ────────────────────────────────────────
 *
 * Versi pertama berkas ini hanya menghitung JUMLAH gambar per halaman. Itu
 * kebetulan cukup untuk data pengembangan: dokumen lama di sana membawa 2-3 QR
 * (satu per level), jadi selisih jumlahnya langsung terlihat.
 *
 * Di produksi keberuntungan itu habis. Ada 20 dokumen yang berhenti di Level 0
 * dan karena itu hanya membawa SATU QR — struktur berkasnya identik dengan
 * hasil render kode sekarang: 1 gambar, ukuran halaman sama, teks sama. Yang
 * berbeda hanya tujuan QR-nya:
 *
 *     berkas lama  ->  /e/approval/<id-approval>
 *     render baru  ->  /e/<id-dokumen>
 *
 * Perbandingan berbasis jumlah menyatakan keduanya SAMA, sehingga berkas lama
 * boleh dihapus dan digantikan render yang QR-nya menunjuk ke tempat lain —
 * tanpa satu pun peringatan. Terbukti dengan reproduksi langsung sebelum
 * perbaikan ini dibuat.
 *
 * ── Akibat yang harus dipahami ────────────────────────────────────────────
 *
 * Arsip yang SUDAH dikompresi Ghostscript tidak akan pernah cocok dengan render
 * segar: gambarnya sudah menjadi JPEG sementara render menghasilkan Flate.
 * Itu benar dan memang begitu adanya. Verifikasi ini adalah gerbang SEBELUM
 * kompresi, bukan pemeriksaan yang bisa diulang sesudahnya.
 *
 * Karena itu sekarang byte tiap stream gambar ikut di-hash. Yang di-hash adalah
 * stream MENTAH seperti tersimpan di berkas, bukan hasil dekompresinya: murah,
 * tidak perlu merender, dan tidak memuat puluhan MB piksel ke memori.
 */

const crypto = require('crypto');
const { PDFDocument, PDFRawStream, PDFName } = require('pdf-lib');

/** Sidik jari halaman: geometri, jumlah gambar, dan teks. */
async function pageShape(bytes) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc   = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const pg  = await doc.getPage(i);
    const vp  = pg.getViewport({ scale: 1 });
    const ops = await pg.getOperatorList();
    let images = 0;
    for (const fn of ops.fnArray) {
      if (fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintJpegXObject) images++;
    }
    const text = (await pg.getTextContent()).items.map(t => t.str).join('').replace(/\s+/g, '');
    pages.push({ w: Math.round(vp.width), h: Math.round(vp.height), images, text });
  }
  return { numPages: doc.numPages, pages };
}

/**
 * Hash tiap stream gambar di dalam dokumen, diurutkan.
 *
 * Diurutkan karena urutan objek di dalam berkas bukan sesuatu yang berarti —
 * pdf-lib dan Ghostscript menyusunnya berbeda. Yang berarti adalah HIMPUNAN
 * gambar yang dibawa dokumen itu.
 *
 * @returns {string[]} daftar hash, terurut
 */
async function imageDigests(bytes) {
  const doc     = await PDFDocument.load(bytes, { updateMetadata: false });
  const digests = [];

  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const subtype = obj.dict.get(PDFName.of('Subtype'));
    if (!subtype || subtype.asString?.() !== '/Image') continue;
    digests.push(crypto.createHash('sha256').update(obj.contents).digest('hex').slice(0, 16));
  }
  return digests.sort();
}

async function fingerprint(bytes) {
  const shape = await pageShape(bytes);
  return { ...shape, images: await imageDigests(bytes) };
}

/**
 * @returns {string|null} alasan ketidakcocokan, atau null bila cocok
 */
function sameFingerprint(a, b) {
  if (a.numPages !== b.numPages) return `jumlah halaman ${a.numPages} vs ${b.numPages}`;

  for (let i = 0; i < a.numPages; i++) {
    const x = a.pages[i], y = b.pages[i];
    if (x.w !== y.w || x.h !== y.h) return `halaman ${i + 1}: ukuran ${x.w}x${x.h} vs ${y.w}x${y.h}`;
    if (x.images !== y.images)      return `halaman ${i + 1}: jumlah gambar ${x.images} vs ${y.images}`;
    if (x.text !== y.text)          return `halaman ${i + 1}: teks berbeda`;
  }

  // Sidik jari lama tidak punya daftar ini. Menganggapnya cocok akan
  // menghidupkan kembali celah yang justru ditutup berkas ini, jadi ketiadaan
  // daftar diperlakukan sebagai ketidakcocokan.
  if (!Array.isArray(a.images) || !Array.isArray(b.images)) {
    return 'sidik jari tanpa daftar isi gambar — tidak bisa dibandingkan dengan aman';
  }
  if (a.images.length !== b.images.length) {
    return `jumlah gambar dokumen ${a.images.length} vs ${b.images.length}`;
  }
  for (let i = 0; i < a.images.length; i++) {
    if (a.images[i] !== b.images[i]) {
      // Inilah yang menangkap QR yang tujuannya berbeda padahal jumlahnya sama.
      return `isi gambar berbeda (${a.images[i]} vs ${b.images[i]})`;
    }
  }
  return null;
}

module.exports = { fingerprint, sameFingerprint, imageDigests };
