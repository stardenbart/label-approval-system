// backend/src/services/storage-dedup.service.js
'use strict';

/**
 * Dedup penyimpanan PDF asli lewat hard link.
 *
 * Kenapa perlu: label yang sama di-upload berulang kali selama revisi, dan
 * tiap upload menyimpan salinan penuhnya sendiri. Pada sampel storage yang
 * diukur, 6 dari 9 PDF asli ternyata identik byte-per-byte — dua kelompok
 * masing-masing 3 salinan. Di produksi dengan revisi bolak-balik, polanya
 * kemungkinan lebih parah.
 *
 * Kenapa hard link, bukan blob store content-addressed:
 *   - Tidak ada perubahan bentuk penyimpanan. Tiap dokumen tetap punya
 *     path-nya sendiri, jadi seluruh kode yang membaca `path_original` tidak
 *     perlu tahu apa-apa.
 *   - Tidak butuh refcount. Menghapus satu path tidak menyentuh path lain;
 *     inode baru hilang saat link terakhir dilepas — dan `remove()` di DAL
 *     itu soft delete yang bahkan tidak pernah menghapus berkas.
 *   - Bisa dibatalkan kapan saja: salin ulang berkasnya, selesai.
 *
 * Yang harus diperhatikan:
 *   - Hard link hanya bisa dalam SATU filesystem. Kalau STORAGE_PATH dipindah
 *     ke volume lain, linkOrMove() otomatis jatuh ke penyalinan biasa (EXDEV).
 *   - Berkas ber-link TIDAK BOLEH ditulis ulang di tempat, karena perubahannya
 *     akan terlihat oleh semua dokumen yang berbagi inode. Di DAL, original.pdf
 *     memang tidak pernah diubah setelah upload — hasil penempelan ditulis ke
 *     berkas terpisah (signed_level0.pdf). Jangan langgar itu.
 *   - Saat backup, pakai `tar -H`/`rsync -H`; tanpa itu link mekar lagi jadi
 *     salinan penuh dan penghematannya hilang di arsip.
 */

const fs     = require('fs');
const crypto = require('crypto');
const logger = require('../config/logger');

/**
 * sha256 sebuah berkas, dibaca bertahap supaya PDF besar tidak masuk memori
 * sekaligus.
 * @returns {Promise<string>} hex digest
 */
function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash   = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data',  (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end',   () => resolve(hash.digest('hex')));
  });
}

/** Dua berkas benar-benar sama isinya? Dipakai sebagai sabuk pengaman sebelum
 *  menautkan — sha256 sudah lebih dari cukup, tapi menautkan berkas yang salah
 *  akan merusak dokumen milik orang lain, jadi ukurannya tetap diperiksa. */
function sameSize(a, b) {
  try {
    return fs.statSync(a).size === fs.statSync(b).size;
  } catch {
    return false;
  }
}

/**
 * Pindahkan berkas upload ke tempat permanennya — sebagai hard link ke salinan
 * yang sudah ada bila isinya identik, atau sebagai pemindahan biasa bila belum.
 *
 * @param {string} tempPath  berkas sementara hasil multer
 * @param {string} destPath  tujuan permanen
 * @param {string|null} twinPath  path berkas lain dengan sha256 sama, bila ada
 * @returns {{ deduped: boolean, bytesSaved: number }}
 */
function linkOrMove(tempPath, destPath, twinPath) {
  const size = fs.statSync(tempPath).size;

  if (twinPath && fs.existsSync(twinPath) && sameSize(tempPath, twinPath)) {
    try {
      fs.linkSync(twinPath, destPath);
      fs.unlinkSync(tempPath);
      logger.info(`Dedup: ${destPath} di-link ke ${twinPath} (hemat ${(size / 1024).toFixed(0)} KB)`);
      return { deduped: true, bytesSaved: size };
    } catch (err) {
      // EXDEV = beda filesystem, EPERM/ENOSYS = filesystem tidak mendukung link.
      // Semuanya bukan kondisi fatal: simpan biasa saja.
      logger.warn(`Dedup gagal (${err.code}), disimpan sebagai salinan penuh: ${err.message}`);
    }
  }

  fs.renameSync(tempPath, destPath);
  return { deduped: false, bytesSaved: 0 };
}

/**
 * Cari dokumen lain yang PDF aslinya identik dan berkasnya masih ada.
 * Dokumen yang sudah di-soft-delete ikut dipertimbangkan — berkasnya memang
 * tidak pernah dihapus, jadi masih sah jadi sasaran link.
 *
 * @returns {Promise<string|null>} path yang bisa ditautkan, atau null
 */
async function findTwinPath(prisma, sha256, excludeDocumentId = null) {
  const candidates = await prisma.document.findMany({
    where: {
      originalSha256: sha256,
      ...(excludeDocumentId ? { id: { not: excludeDocumentId } } : {}),
    },
    select:  { pathOriginal: true },
    orderBy: { createdAt: 'asc' },
    take:    5,
  });
  return candidates.find(c => c.pathOriginal && fs.existsSync(c.pathOriginal))?.pathOriginal || null;
}

module.exports = { hashFile, linkOrMove, findTwinPath };
