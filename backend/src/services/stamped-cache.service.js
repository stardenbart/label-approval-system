// backend/src/services/stamped-cache.service.js
'use strict';

/**
 * Cache berkas PDF hasil penempelan.
 *
 * BUKAN sumber kebenaran. Seluruh isinya boleh dihapus kapan saja — `rm -rf`
 * pada foldernya tidak menghilangkan data apa pun, cuma membuat permintaan
 * berikutnya perlu ~25 ms lebih lama untuk merender ulang.
 *
 * Sumber kebenarannya adalah `original.pdf` (tidak pernah disentuh) ditambah
 * `document.stampManifest` (di database). Keduanya cukup untuk menghasilkan
 * berkas yang identik, kapan pun.
 *
 * Kunci cache memuat hash manifest:
 *
 *     storage/cache/stamped/<docId>-<manifestHash>.pdf
 *
 * sehingga manifest yang berubah otomatis meleset ke berkas lain. Tidak ada
 * langkah invalidasi terpisah yang bisa terlupa dipanggil — kesalahan yang
 * paling sering terjadi pada cache berbasis berkas.
 */

const fs   = require('fs');
const path = require('path');
const pdfService = require('./pdf.service');
const logger     = require('../config/logger');

const CACHE_DIR = path.join(process.env.STORAGE_PATH || './storage', 'cache', 'stamped');

/** Batas bawaan; dilewati kalau evict() dipanggil dengan angka lain. */
const MAX_AGE_DAYS = 7;
const MAX_BYTES    = 500 * 1024 * 1024;

function ensureDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function cachePathFor(documentId, manifest) {
  return path.join(CACHE_DIR, `${documentId}-${pdfService.manifestHash(manifest)}.pdf`);
}

/**
 * Byte PDF hasil penempelan untuk sebuah dokumen.
 *
 * Urutan yang dicoba:
 *   1. Arsip final yang memang disimpan permanen (dokumen APPROVED)
 *   2. Berkas turunan milik dokumen lama, dari sebelum manifest ada
 *   3. Cache
 *   4. Render, lalu simpan ke cache
 *
 * @returns {Promise<Buffer|null>} null bila dokumen belum pernah di-stamp
 */
async function getStamped(document) {
  // 1 & 2 — berkas yang sudah ada di disk selalu menang. Untuk dokumen lama
  // inilah satu-satunya sumber, dan untuk dokumen APPROVED berkas arsiplah yang
  // sah secara kepatuhan, bukan hasil render ulang.
  for (const p of [document.pathSignedFinal, document.pathSignedLevel0]) {
    if (p && fs.existsSync(p)) return fs.readFileSync(p);
  }

  const manifest = document.stampManifest;
  if (!manifest) return null;

  const cached = cachePathFor(document.id, manifest);
  if (fs.existsSync(cached)) {
    // Sentuh mtime supaya evict() tahu berkas ini masih dipakai (LRU).
    try { fs.utimesSync(cached, new Date(), new Date()); } catch { /* tidak penting */ }
    return fs.readFileSync(cached);
  }

  const bytes = await pdfService.renderStamped(document, manifest);

  // Tulis lewat berkas sementara lalu rename: dua permintaan yang datang
  // bersamaan tidak akan pernah saling membaca berkas yang setengah tertulis.
  try {
    ensureDir();
    const tmp = `${cached}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, bytes);
    fs.renameSync(tmp, cached);
  } catch (err) {
    // Cache penuh, read-only, apa pun — bukan kondisi fatal. Yang penting
    // byte-nya sudah ada di tangan dan bisa dikirim ke peminta.
    logger.warn(`Gagal menulis cache stamped untuk ${document.id}: ${err.message}`);
  }

  return bytes;
}

/**
 * Buang isi cache yang sudah tua, lalu — kalau masih kelebihan — yang paling
 * lama tidak dipakai, sampai di bawah batas.
 *
 * @returns {{ removed: number, bytesFreed: number, remaining: number }}
 */
function evict({ maxAgeDays = MAX_AGE_DAYS, maxBytes = MAX_BYTES } = {}) {
  if (!fs.existsSync(CACHE_DIR)) return { removed: 0, bytesFreed: 0, remaining: 0 };

  const cutoff = Date.now() - maxAgeDays * 86400_000;
  let entries = [];

  for (const name of fs.readdirSync(CACHE_DIR)) {
    const full = path.join(CACHE_DIR, name);
    try {
      const st = fs.statSync(full);
      if (st.isFile()) entries.push({ full, size: st.size, atime: st.mtimeMs });
    } catch { /* berkas hilang di tengah jalan — abaikan */ }
  }

  let removed = 0, bytesFreed = 0;
  const drop = (e) => {
    try { fs.unlinkSync(e.full); removed++; bytesFreed += e.size; return true; } catch { return false; }
  };

  entries = entries.filter(e => !(e.atime < cutoff && drop(e)));

  entries.sort((a, b) => a.atime - b.atime); // paling lama tidak dipakai lebih dulu
  let total = entries.reduce((s, e) => s + e.size, 0);
  while (total > maxBytes && entries.length) {
    const e = entries.shift();
    if (drop(e)) total -= e.size;
  }

  if (removed) logger.info(`Cache stamped: ${removed} berkas dibuang, ${(bytesFreed / 1048576).toFixed(1)} MB dibebaskan`);
  return { removed, bytesFreed, remaining: total };
}

module.exports = { getStamped, evict, cachePathFor, CACHE_DIR };
