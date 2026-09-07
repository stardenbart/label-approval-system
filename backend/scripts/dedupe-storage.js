// backend/scripts/dedupe-storage.js
'use strict';

/**
 * Backfill dedup penyimpanan untuk dokumen yang sudah ada.
 *
 * Dua pekerjaan:
 *   1. Mengisi documents.original_sha256 yang masih kosong.
 *   2. Mengganti PDF asli yang isinya identik dengan hard link ke salinan
 *      tertua, sehingga hanya satu salinan fisik yang tersisa.
 *
 * Aman dijalankan berulang: berkas yang sudah berbagi inode dilewati.
 *
 *   node scripts/dedupe-storage.js            # dry run — hanya melaporkan
 *   node scripts/dedupe-storage.js --apply    # benar-benar menautkan
 *
 * Sebelum --apply di produksi: backup database DAN berkasnya. tar sudah
 * mempertahankan hard link secara bawaan; rsync TIDAK — di sana -H wajib.
 * Tanpa itu tautan mekar lagi jadi salinan penuh di arsip.
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { hashFile }     = require('../src/services/storage-dedup.service');

const APPLY  = process.argv.includes('--apply');
const prisma = new PrismaClient();

const kb = (b) => `${(b / 1024).toFixed(0)} KB`;
const mb = (b) => `${(b / 1024 / 1024).toFixed(2)} MB`;

async function main() {
  console.log(APPLY ? 'MODE: --apply (berkas akan ditautkan)\n' : 'MODE: dry run (tidak ada yang diubah)\n');

  const docs = await prisma.document.findMany({
    select: { id: true, labelName: true, pathOriginal: true, originalSha256: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  // ── 1. Hitung hash yang belum ada ────────────────────────────────
  const rows = [];
  let missingFiles = 0;

  for (const d of docs) {
    if (!d.pathOriginal || !fs.existsSync(d.pathOriginal)) { missingFiles++; continue; }
    const st = fs.statSync(d.pathOriginal);
    let sha = d.originalSha256;
    if (!sha) {
      sha = await hashFile(d.pathOriginal);
      if (APPLY) {
        await prisma.document.update({ where: { id: d.id }, data: { originalSha256: sha } });
      }
    }
    rows.push({ ...d, sha, size: st.size, ino: st.ino });
  }

  console.log(`Dokumen diperiksa : ${docs.length}`);
  console.log(`Berkas tidak ada  : ${missingFiles}`);
  console.log(`Berkas terbaca    : ${rows.length}`);
  console.log(`Total terpakai    : ${mb(rows.reduce((s, r) => s + r.size, 0))}\n`);

  // ── 2. Kelompokkan menurut isi ───────────────────────────────────
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.sha)) groups.set(r.sha, []);
    groups.get(r.sha).push(r);
  }

  const dupGroups = [...groups.values()].filter(g => g.length > 1);
  if (dupGroups.length === 0) {
    console.log('Tidak ada PDF asli yang identik — tidak ada yang bisa dihemat.');
    return;
  }

  let linked = 0, skipped = 0, saved = 0, failed = 0;

  for (const group of dupGroups) {
    const [keeper, ...rest] = group;   // tertua jadi acuan
    console.log(`\n${group.length} salinan · ${kb(keeper.size)} · sha ${keeper.sha.slice(0, 12)}…`);
    console.log(`  acuan: ${keeper.labelName}`);

    for (const dup of rest) {
      if (dup.ino === keeper.ino) {
        console.log(`  lewati: ${dup.labelName} (sudah berbagi inode)`);
        skipped++;
        continue;
      }
      if (dup.size !== keeper.size) {
        console.log(`  LEWATI: ${dup.labelName} — ukuran beda, tidak ditautkan`);
        failed++;
        continue;
      }

      if (!APPLY) {
        console.log(`  akan ditautkan: ${dup.labelName} (hemat ${kb(dup.size)})`);
        linked++; saved += dup.size;
        continue;
      }

      // Tautkan lewat berkas sementara lalu rename: kalau prosesnya mati di
      // tengah, berkas asli tidak pernah dalam keadaan hilang.
      const tmp = `${dup.pathOriginal}.dedup-tmp`;
      try {
        fs.linkSync(keeper.pathOriginal, tmp);
        fs.renameSync(tmp, dup.pathOriginal);
        console.log(`  ditautkan: ${dup.labelName} (hemat ${kb(dup.size)})`);
        linked++; saved += dup.size;
      } catch (err) {
        try { fs.existsSync(tmp) && fs.unlinkSync(tmp); } catch { /* abaikan */ }
        console.log(`  GAGAL: ${dup.labelName} — ${err.code}: ${err.message}`);
        failed++;
      }
    }
  }

  console.log('\n──────────────────────────────────────────');
  console.log(`Ditautkan  : ${linked}`);
  console.log(`Dilewati   : ${skipped} (sudah berbagi inode)`);
  console.log(`Gagal      : ${failed}`);
  console.log(`Penghematan: ${mb(saved)}`);
  if (!APPLY && linked > 0) console.log('\nJalankan ulang dengan --apply untuk menerapkannya.');
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
