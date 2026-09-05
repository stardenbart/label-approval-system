// backend/src/services/pdf-fingerprint.service.js
'use strict';

/**
 * Ciri visual sebuah PDF — cukup untuk membuktikan dua berkas menggambar hal
 * yang sama, tanpa menuntut byte-nya sama.
 *
 * Perbandingan byte tidak dipakai karena pdf-lib dan Ghostscript menyusun objek,
 * metadata, dan urutan stream secara berbeda tiap kali menyimpan, walaupun
 * halaman yang dihasilkan identik. Yang dibandingkan: jumlah halaman, ukuran
 * tiap halaman, jumlah gambar per halaman, dan teks yang terekstrak.
 *
 * Dipakai dua tempat, dan itulah alasan berkas ini ada:
 *   - backfill-stamp-manifest.js  membuktikan berkas lama bisa dibuat ulang
 *                                 sebelum berani menghapusnya
 *   - compress-archives.js        membuktikan arsip bisa dibuat ulang sebelum
 *                                 berani mengompresinya secara lossy
 */

async function fingerprint(bytes) {
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

/** @returns {string|null} alasan ketidakcocokan, atau null bila cocok */
function sameFingerprint(a, b) {
  if (a.numPages !== b.numPages) return `jumlah halaman ${a.numPages} vs ${b.numPages}`;
  for (let i = 0; i < a.numPages; i++) {
    const x = a.pages[i], y = b.pages[i];
    if (x.w !== y.w || x.h !== y.h) return `halaman ${i + 1}: ukuran ${x.w}x${x.h} vs ${y.w}x${y.h}`;
    if (x.images !== y.images)      return `halaman ${i + 1}: jumlah gambar ${x.images} vs ${y.images}`;
    if (x.text !== y.text)          return `halaman ${i + 1}: teks berbeda`;
  }
  return null;
}

module.exports = { fingerprint, sameFingerprint };
