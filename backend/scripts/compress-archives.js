// backend/scripts/compress-archives.js
'use strict';

/**
 * Kompres berkas arsip yang sudah terlanjur tersimpan tanpa kompresi.
 *
 * HANYA menyentuh berkas arsip (path_signed_final / path_signed_level0).
 * `original.pdf` tidak pernah ikut — itu sumber kebenarannya, dan kompresi di
 * sini lossy. Skrip menolak jalan kalau path arsip ternyata sama dengan path
 * original, berapa pun isinya.
 *
 *   node scripts/compress-archives.js            # dry run
 *   node scripts/compress-archives.js --apply
 *   node scripts/compress-archives.js --apply --preset=prepress
 *   node scripts/compress-archives.js --apply --force   # termasuk yang tak bisa dibuat ulang
 *
 * Secara bawaan skrip HANYA mengompresi arsip yang terbukti bisa dibuat ulang
 * dari original.pdf + stamp_manifest. Alasannya: kompresi di sini lossy, jadi
 * pada arsip yang tidak bisa dibuat ulang ia menghapus mutu untuk selamanya
 * tanpa jaring pengaman. Dokumen yang di-stamp sebelum aturan "satu QR per
 * dokumen" berlaku termasuk kategori itu — berkasnya memuat QR per level yang
 * tidak akan pernah digambar lagi. --force melewati pemeriksaan ini.
 *
 * Aman diulang: berkas yang sudah dikompresi tidak akan mengecil lagi secara
 * berarti, dan hasil yang tidak lebih kecil otomatis dibuang oleh
 * pdf-compress.service.
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const compressService = require('../src/services/pdf-compress.service');
const pdfService      = require('../src/services/pdf.service');
const { fingerprint, sameFingerprint } = require('../src/services/pdf-fingerprint.service');

const APPLY  = process.argv.includes('--apply');
const FORCE  = process.argv.includes('--force');
const presetArg = process.argv.find(a => a.startsWith('--preset='));
const PRESET = presetArg ? presetArg.split('=')[1] : null;
const prisma = new PrismaClient();

const kb = (b) => `${(b / 1024).toFixed(0)} KB`;
const mb = (b) => `${(b / 1024 / 1024).toFixed(2)} MB`;

/**
 * Apakah arsip ini bisa dihasilkan ulang dari original.pdf + manifest?
 * @returns {Promise<string|null>} alasan kalau TIDAK bisa, null kalau bisa
 */
async function reproducibilityCheck(doc, archivePath) {
  if (!doc.stampManifest) return 'tidak ada stamp_manifest';
  // Sama seperti --prune: manifest hasil backfill adalah tebakan yang masuk
  // akal, bukan rekaman. Kompresi di sini lossy dan tidak bisa dibatalkan.
  if (!pdfService.manifestIsTrustworthy(doc.stampManifest)) {
    return 'manifest hasil backfill, bukan rekaman saat penempelan';
  }
  if (!doc.pathOriginal || !fs.existsSync(doc.pathOriginal)) return 'original.pdf tidak ada';
  try {
    const rendered = await pdfService.renderStamped(doc, doc.stampManifest);
    return sameFingerprint(await fingerprint(fs.readFileSync(archivePath)), await fingerprint(rendered));
  } catch (err) {
    return `render gagal: ${err.message}`;
  }
}

async function main() {
  if (PRESET && !(PRESET in compressService.PRESETS)) {
    console.error(`Preset "${PRESET}" tidak dikenal. Pilihan: ${Object.keys(compressService.PRESETS).join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const preset = PRESET || await compressService.resolvePreset();
  console.log(APPLY ? `MODE: --apply (preset ${preset})\n` : `MODE: dry run (preset ${preset}, tidak ada yang diubah)\n`);

  if (preset === 'none') {
    console.log('Preset "none" — kompresi dimatikan, tidak ada yang dikerjakan.');
    return;
  }
  if (!await compressService.isAvailable()) {
    console.error('Ghostscript tidak ditemukan. Pasang dengan "apt install ghostscript", atau setel GS_BINARY.');
    process.exitCode = 1;
    return;
  }

  const docs = await prisma.document.findMany({
    select: { id: true, regulatoryId: true, status: true, pathOriginal: true,
              pathSignedFinal: true, pathSignedLevel0: true, stampManifest: true,
              qrPathOriginal: true },
    orderBy: { createdAt: 'asc' },
  });

  let done = 0, skipped = 0, failed = 0, before = 0, after = 0;

  for (const d of docs) {
    // Satu berkas arsip per dokumen; final menang bila keduanya ada.
    const archive = d.pathSignedFinal || d.pathSignedLevel0;
    const label   = `${d.regulatoryId} (${d.id.slice(0, 8)})`;

    if (!archive || !fs.existsSync(archive)) { skipped++; continue; }

    // Penjaga mutlak: apa pun yang terjadi, jangan sentuh berkas asli.
    if (path.resolve(archive) === path.resolve(d.pathOriginal || '')) {
      console.log(`LEWATI  ${label} — arsip menunjuk original.pdf, tidak dikompresi`);
      skipped++;
      continue;
    }

    // Bisakah arsip ini dibuat ulang? Kalau ya, kompresi lossy masih punya
    // jaring pengaman: versi mutu penuh selalu bisa dirender lagi dari
    // original.pdf yang tidak pernah disentuh.
    if (!FORCE) {
      const reason = await reproducibilityCheck(d, archive);
      if (reason) {
        console.log(`LEWATI  ${label} — tidak bisa dibuat ulang (${reason}); pakai --force bila memang disengaja`);
        skipped++;
        continue;
      }
    }

    const size  = fs.statSync(archive).size;
    const links = fs.statSync(archive).nlink;
    if (links > 1) {
      // Rename tetap aman (link lain memegang inode lama), tapi ini pertanda
      // ada dokumen lain yang mengharapkan isi yang sama — sebut saja.
      console.log(`  catatan: ${path.basename(archive)} berbagi inode dengan ${links - 1} berkas lain`);
    }

    if (!APPLY) {
      console.log(`akan dikompresi ${label} — ${kb(size)}`);
      before += size;
      done++;
      continue;
    }

    const r = await compressService.compressInPlace(archive, preset);
    if (r.ok) {
      console.log(`dikompresi ${label} — ${kb(r.before)} -> ${kb(r.after)} (hemat ${((1 - r.after / r.before) * 100).toFixed(0)}%)`);
      before += r.before; after += r.after; done++;
    } else {
      console.log(`LEWATI  ${label} — ${r.reason}`);
      failed++;
    }
  }

  console.log('\n──────────────────────────────────────────');
  console.log(`Dikompresi : ${done}`);
  console.log(`Dilewati   : ${skipped}`);
  if (APPLY) {
    console.log(`Gagal      : ${failed}`);
    console.log(`Sebelum    : ${mb(before)}`);
    console.log(`Sesudah    : ${mb(after)}`);
    if (before) console.log(`Hemat      : ${mb(before - after)} (${((1 - after / before) * 100).toFixed(0)}%)`);
  } else if (done) {
    console.log(`Total arsip: ${mb(before)}`);
    console.log('\nJalankan ulang dengan --apply untuk menerapkannya.');
  }
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
