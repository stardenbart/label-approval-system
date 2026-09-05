// backend/scripts/backfill-stamp-manifest.js
'use strict';

/**
 * Isi documents.stamp_manifest untuk dokumen yang sudah di-stamp sebelum
 * manifest ada, lalu — sebagai langkah TERPISAH — buang berkas turunannya.
 *
 * Kenapa dua langkah, bukan satu:
 *   Mengisi kolom itu tidak merusak apa pun dan bisa diulang. Menghapus berkas
 *   tidak bisa dibatalkan. Keduanya tidak boleh terjadi dalam satu perintah
 *   yang sama, supaya ada jeda untuk memverifikasi hasilnya.
 *
 *   node scripts/backfill-stamp-manifest.js            # dry run
 *   node scripts/backfill-stamp-manifest.js --apply    # isi kolom manifest
 *   node scripts/backfill-stamp-manifest.js --verify   # bandingkan render vs berkas lama
 *   node scripts/backfill-stamp-manifest.js --prune    # buang berkas turunan (butuh --verify lolos)
 *
 * --prune HANYA menyentuh dokumen yang lolos --verify: hasil render dari
 * manifest harus cocok dengan berkas lama dalam jumlah halaman, ukuran halaman,
 * jumlah & posisi gambar, dan teks yang terekstrak. Perbandingan byte tidak
 * dipakai karena pdf-lib menulis metadata dan urutan objek yang berbeda tiap
 * kali menyimpan, walau gambarnya identik.
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const pdfService = require('../src/services/pdf.service');
const { fingerprint, sameFingerprint } = require('../src/services/pdf-fingerprint.service');

const APPLY  = process.argv.includes('--apply');
const VERIFY = process.argv.includes('--verify');
const PRUNE  = process.argv.includes('--prune');
const prisma = new PrismaClient();

const mb = (b) => `${(b / 1024 / 1024).toFixed(2)} MB`;

async function main() {
  const modes = [APPLY && '--apply', VERIFY && '--verify', PRUNE && '--prune'].filter(Boolean);
  console.log(modes.length ? `MODE: ${modes.join(' ')}\n` : 'MODE: dry run (tidak ada yang diubah)\n');

  if (PRUNE && !VERIFY) {
    console.error('--prune wajib dijalankan bersama --verify. Berkas hanya boleh dibuang setelah terbukti bisa dibuat ulang.');
    process.exitCode = 1;
    return;
  }

  const docs = await prisma.document.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      esignPositions: { include: { approval: { select: { level: true, approverId: true } } } },
      footerPosition: true,
    },
  });

  let filled = 0, skipped = 0, verified = 0, mismatched = 0, pruned = 0, freed = 0;

  for (const d of docs) {
    const label = `${d.regulatoryId} (${d.id.slice(0, 8)})`;

    // ── 1. Susun manifest dari data yang sudah tersimpan ────────────────
    let manifest = d.stampManifest;
    if (!manifest) {
      // Posisi milik approval Level 0 — itulah satu-satunya yang pernah
      // benar-benar digambar. Baris untuk level lain adalah sisa dari era
      // ketika tiap level menempel QR-nya sendiri.
      const pos = d.esignPositions.find(p => p.approval?.level === 0);
      if (!pos || !d.qrPathOriginal) {
        console.log(`lewati  ${label} — belum pernah di-stamp`);
        skipped++;
        continue;
      }
      if (!d.pathOriginal || !fs.existsSync(d.pathOriginal)) {
        console.log(`LEWATI  ${label} — original.pdf tidak ada`);
        skipped++;
        continue;
      }

      try {
        manifest = await pdfService.resolveStampManifest(
          d,
          { pageNumber: pos.pageNumber, xPercent: +pos.xPercent, yPercent: +pos.yPercent,
            widthPt: +pos.widthPt, heightPt: +pos.heightPt },
          d.footerPosition
            ? { pageNumber: d.footerPosition.pageNumber, xPercent: +d.footerPosition.xPercent,
                yPercent: +d.footerPosition.yPercent, widthPt: +d.footerPosition.widthPt,
                heightPt: +d.footerPosition.heightPt, fontSize: d.footerPosition.fontSize,
                rotation: d.footerPosition.rotation }
            : null,
          pos.approval?.approverId || null,
        );
      } catch (err) {
        console.log(`GAGAL   ${label} — ${err.message}`);
        skipped++;
        continue;
      }

      // Waktu stamp yang sebenarnya, bukan waktu skrip ini dijalankan.
      manifest.stampedAt = (pos.createdAt || d.createdAt).toISOString();

      if (APPLY) {
        await prisma.document.update({ where: { id: d.id }, data: { stampManifest: manifest } });
      }
      console.log(`${APPLY ? 'diisi  ' : 'akan diisi'} ${label}`);
      filled++;
    }

    if (!VERIFY) continue;

    // ── 2. Buktikan hasil render sama dengan berkas lamanya ─────────────
    const legacyPath = d.pathSignedFinal || d.pathSignedLevel0;
    if (!legacyPath || !fs.existsSync(legacyPath)) {
      console.log(`  verifikasi dilewati — tidak ada berkas lama untuk dibandingkan`);
      continue;
    }

    let verdict;
    try {
      const rendered = await pdfService.renderStamped(d, manifest);
      verdict = sameFingerprint(await fingerprint(fs.readFileSync(legacyPath)), await fingerprint(rendered));
    } catch (err) {
      verdict = `render gagal: ${err.message}`;
    }

    if (verdict) {
      console.log(`  BEDA    ${label} — ${verdict}`);
      mismatched++;
      continue;
    }
    console.log(`  cocok   ${label}`);
    verified++;

    // ── 3. Buang berkas turunan yang tidak perlu lagi ───────────────────
    if (!PRUNE) continue;

    // Dokumen APPROVED tetap menyimpan SATU berkas arsip. Yang dibuang adalah
    // turunan antara: signed_level1 dan salinan level0 yang bukan arsip.
    const keep = new Set([d.pathSignedFinal].filter(Boolean));
    const candidates = [d.pathSignedLevel0, d.pathSignedLevel1]
      .filter(p => p && !keep.has(p) && fs.existsSync(p));

    for (const p of candidates) {
      const size = fs.statSync(p).size;
      fs.unlinkSync(p);
      freed += size;
      pruned++;
      console.log(`  dibuang ${path.basename(p)} (${mb(size)})`);
    }

    await prisma.document.update({
      where: { id: d.id },
      data: {
        pathSignedLevel1: null,
        pathSignedLevel0: d.pathSignedFinal || null,
      },
    });
  }

  console.log('\n──────────────────────────────────────────');
  console.log(`Manifest diisi : ${filled}`);
  console.log(`Dilewati       : ${skipped}`);
  if (VERIFY) console.log(`Cocok          : ${verified}\nTidak cocok    : ${mismatched}`);
  if (PRUNE)  console.log(`Berkas dibuang : ${pruned}\nDibebaskan     : ${mb(freed)}`);
  if (!APPLY && filled > 0) console.log('\nJalankan ulang dengan --apply untuk menerapkannya.');
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
