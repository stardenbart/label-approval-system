// backend/scripts/storage-doctor.js
'use strict';

/**
 * Pemeriksaan kesiapan penyimpanan. Dijalankan DI MESIN TUJUAN sebelum deploy,
 * dan lagi sesudahnya.
 *
 *   npm run storage:doctor
 *
 * Keluar dengan kode 1 kalau ada yang GAGAL, supaya bisa dipakai sebagai gerbang
 * di skrip deploy atau CI. Peringatan tidak menggagalkan — itu hal yang perlu
 * diketahui, bukan yang menghentikan.
 *
 * Yang diperiksa ada tiga kelompok:
 *
 *   LINGKUNGAN  Hal-hal yang bikin fitur diam-diam tidak bekerja: hard link
 *               tidak didukung filesystem, folder tmp berbeda partisi dengan
 *               folder dokumen (dedup jatuh ke salinan penuh tanpa suara),
 *               Ghostscript tidak terpasang (kompresi dilewati diam-diam).
 *
 *   SKEMA       Kolom yang dibutuhkan kode ini ada atau tidak. Aplikasi akan
 *               meledak saat runtime kalau migrasi belum jalan; lebih baik tahu
 *               sekarang.
 *
 *   DATA        Gambaran kondisi sekarang: berapa dokumen, berapa yang punya
 *               manifest, berapa besar yang dihemat, cache seberapa gemuk.
 *               Bukan lulus/gagal, tapi inilah angka yang dibandingkan
 *               sebelum dan sesudah migrasi.
 */

require('dotenv').config();
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, '../storage');
const DOCS_DIR     = path.join(STORAGE_PATH, 'documents');
const TMP_DIR      = path.join(STORAGE_PATH, 'tmp');
const CACHE_DIR    = path.join(STORAGE_PATH, 'cache', 'stamped');

let failures = 0, warnings = 0;

const mb = (b) => `${(b / 1048576).toFixed(2)} MB`;
const gb = (b) => `${(b / 1073741824).toFixed(1)} GB`;

function ok(label, detail = '')   { console.log(`  \x1b[32mOK\x1b[0m    ${label}${detail ? ' — ' + detail : ''}`); }
function warn(label, detail = '') { warnings++; console.log(`  \x1b[33mWARN\x1b[0m  ${label}${detail ? ' — ' + detail : ''}`); }
function fail(label, detail = '') { failures++; console.log(`  \x1b[31mGAGAL\x1b[0m ${label}${detail ? ' — ' + detail : ''}`); }
function info(label, detail = '') { console.log(`  ·     ${label}${detail ? ' — ' + detail : ''}`); }
function section(t) { console.log(`\n\x1b[1m${t}\x1b[0m`); }

// ─── LINGKUNGAN ──────────────────────────────────────────────────────────────

function checkStoragePath() {
  if (!process.env.STORAGE_PATH) {
    warn('STORAGE_PATH tidak disetel', `memakai bawaan ${STORAGE_PATH}`);
  } else if (!path.isAbsolute(process.env.STORAGE_PATH)) {
    // Path relatif ikut berubah kalau cwd berubah. PM2 menyetel cwd sendiri,
    // dan skrip cron biasanya tidak — dua-duanya menulis ke folder berbeda
    // tanpa keluhan apa pun.
    warn('STORAGE_PATH relatif', `"${process.env.STORAGE_PATH}" — pakai path absolut di produksi`);
  } else {
    ok('STORAGE_PATH absolut', process.env.STORAGE_PATH);
  }

  for (const [label, dir] of [['documents', DOCS_DIR], ['tmp', TMP_DIR]]) {
    if (!fs.existsSync(dir)) { fail(`folder ${label} tidak ada`, dir); continue; }
    try {
      fs.accessSync(dir, fs.constants.W_OK);
      ok(`folder ${label} bisa ditulis`, dir);
    } catch {
      fail(`folder ${label} TIDAK bisa ditulis`, dir);
    }
  }
}

/** Hard link cuma bekerja dalam satu filesystem, dan tidak semua filesystem
 *  mendukungnya. Kalau tidak, dedup diam-diam jatuh ke salinan penuh. */
function checkHardlinks() {
  if (!fs.existsSync(DOCS_DIR)) return;
  const a = path.join(DOCS_DIR, `.doctor-${process.pid}-a`);
  const b = path.join(DOCS_DIR, `.doctor-${process.pid}-b`);
  try {
    fs.writeFileSync(a, 'x');
    fs.linkSync(a, b);
    const shared = fs.statSync(a).ino === fs.statSync(b).ino;
    shared ? ok('hard link didukung', 'dedup penyimpanan aktif')
           : fail('hard link tidak berbagi inode', 'dedup tidak akan menghemat apa pun');
  } catch (err) {
    fail('hard link gagal', `${err.code} — dedup akan jatuh ke salinan penuh`);
  } finally {
    for (const f of [a, b]) { try { fs.existsSync(f) && fs.unlinkSync(f); } catch { /* abaikan */ } }
  }
}

/** tmp dan documents HARUS satu filesystem. Kalau tidak, setiap upload kena
 *  EXDEV dan disimpan sebagai salinan penuh — dedup mati tanpa satu pun error. */
function checkSameFilesystem() {
  if (!fs.existsSync(DOCS_DIR) || !fs.existsSync(TMP_DIR)) return;
  const d = fs.statSync(DOCS_DIR).dev;
  const t = fs.statSync(TMP_DIR).dev;
  d === t ? ok('tmp dan documents satu filesystem')
          : fail('tmp dan documents BEDA filesystem', 'setiap upload akan disalin penuh, dedup tidak jalan');
}

function checkDiskSpace() {
  try {
    const st = fs.statfsSync(STORAGE_PATH);
    const free  = st.bavail * st.bsize;
    const total = st.blocks * st.bsize;
    const pct   = (free / total) * 100;
    const detail = `${gb(free)} bebas dari ${gb(total)} (${pct.toFixed(0)}%)`;
    if (pct < 10)      fail('ruang disk kritis', detail);
    else if (pct < 20) warn('ruang disk menipis', detail);
    else               ok('ruang disk cukup', detail);
  } catch (err) {
    warn('ruang disk tidak terbaca', err.message);
  }
}

function checkGhostscript() {
  const bin = process.env.GS_BINARY || 'gs';
  return new Promise((resolve) => {
    execFile(bin, ['--version'], { timeout: 15_000 }, (err, stdout) => {
      if (err) {
        // Bukan kegagalan fatal: kompresi memang opsional. Tapi kalau tidak
        // sengaja, penghematan 58% hilang tanpa ada yang menyadari.
        warn('Ghostscript tidak ada', `"${bin}" — kompresi arsip akan dilewati; "apt install ghostscript"`);
      } else {
        ok('Ghostscript siap', `${String(stdout).trim()} (${bin})`);
      }
      resolve();
    });
  });
}

function checkNodeAndCron() {
  info('Node', process.version);
  info('platform', `${os.platform()} ${os.release()}`);
  const inst = process.env.NODE_APP_INSTANCE;
  if (inst === undefined) info('NODE_APP_INSTANCE', 'tidak ada (bukan PM2 cluster) — cron aktif');
  else info('NODE_APP_INSTANCE', `${inst} — cron ${inst === '0' ? 'aktif' : 'nonaktif di instance ini'}`);
}

// ─── SKEMA ───────────────────────────────────────────────────────────────────

async function checkSchema() {
  const required = [
    ['original_sha256', 'dedup penyimpanan'],
    ['stamp_manifest',  'render arsip saat diminta'],
  ];
  let cols;
  try {
    cols = await prisma.$queryRawUnsafe(
      `SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents'`
    );
  } catch (err) {
    fail('database tidak terhubung', err.message);
    return;
  }
  const have = new Set(cols.map(r => r.c));
  for (const [col, why] of required) {
    have.has(col) ? ok(`kolom documents.${col}`, why)
                  : fail(`kolom documents.${col} TIDAK ADA`, `jalankan "npx prisma migrate deploy" (${why})`);
  }

  const applied = await prisma.$queryRawUnsafe(
    'SELECT migration_name AS m, finished_at AS f FROM _prisma_migrations ORDER BY finished_at'
  ).catch(() => []);
  const pending = applied.filter(r => !r.f);
  if (pending.length) fail(`${pending.length} migrasi belum selesai`, pending.map(p => p.m).join(', '));
  else                ok(`${applied.length} migrasi tercatat`, applied.at(-1)?.m || '-');
}

async function checkSettings() {
  const { PRESETS } = require('../src/services/pdf-compress.service');
  const { SETTING_DEFAULTS } = require('../src/config/stamp');
  const row = await prisma.systemSetting.findUnique({ where: { key: 'archive_compression_preset' } }).catch(() => null);
  const val = row?.value;
  if (!val) {
    warn('archive_compression_preset belum ada di system_settings',
         `memakai bawaan "${SETTING_DEFAULTS.archive_compression_preset}"; jalankan seeder agar muncul di UI`);
  } else if (!(val in PRESETS)) {
    fail('archive_compression_preset tidak dikenal', `"${val}" — kompresi akan dimatikan`);
  } else {
    ok('preset kompresi', val);
  }
}

// ─── DATA ────────────────────────────────────────────────────────────────────

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    e.isDirectory() ? walk(f, out) : out.push(f);
  }
  return out;
}

async function reportData() {
  const docs = await prisma.document.findMany({
    select: { id: true, deletedAt: true, status: true, originalSha256: true, stampManifest: true,
              pathOriginal: true, pathSignedLevel0: true, pathSignedFinal: true },
  }).catch(() => null);
  if (!docs) return;

  const live = docs.filter(d => !d.deletedAt);
  info('dokumen', `${docs.length} total, ${live.length} aktif, ${docs.length - live.length} terhapus`);
  info('punya sha256', `${docs.filter(d => d.originalSha256).length}/${docs.length}`);
  info('punya manifest', `${docs.filter(d => d.stampManifest).length}/${docs.length}`);

  // Logis vs fisik: selisihnya adalah penghematan hard link.
  const files = walk(DOCS_DIR).filter(f => f.endsWith('.pdf'));
  const seen = new Set();
  let logical = 0, physical = 0;
  for (const f of files) {
    const st = fs.statSync(f);
    logical += st.size;
    if (!seen.has(st.ino)) { seen.add(st.ino); physical += st.size; }
  }
  info('PDF di disk', `${files.length} berkas, ${seen.size} salinan fisik`);
  info('ukuran', `${mb(logical)} logis -> ${mb(physical)} fisik`);
  if (logical > physical) info('dihemat dedup', `${mb(logical - physical)} (${((1 - physical / logical) * 100).toFixed(0)}%)`);

  const archives = files.filter(f => path.basename(f).startsWith('signed_'));
  const archiveBytes = archives.reduce((s, f) => s + fs.statSync(f).size, 0);
  info('berkas arsip', `${archives.length} berkas, ${mb(archiveBytes)}`);

  const cache = walk(CACHE_DIR);
  const cacheBytes = cache.reduce((s, f) => s + fs.statSync(f).size, 0);
  info('cache stamped', `${cache.length} berkas, ${mb(cacheBytes)} (boleh dihapus kapan saja)`);

  // Berkas yang dirujuk database tapi hilang dari disk — penyebab 404 di UI.
  let missing = 0;
  for (const d of live) {
    for (const p of [d.pathOriginal, d.pathSignedFinal, d.pathSignedLevel0]) {
      if (p && !fs.existsSync(p)) missing++;
    }
  }
  missing ? fail(`${missing} berkas dirujuk database tapi tidak ada di disk`)
          : ok('semua berkas yang dirujuk database ada di disk');
}

function checkBackup() {
  // Cari backup terbaru di lokasi yang lazim. Bukan penilaian mutu backup —
  // hanya "kapan terakhir ada sesuatu", karena dedup, prune, dan kompresi
  // semuanya mengubah berkas secara permanen.
  const spots = [
    path.join(__dirname, '../../backups'),
    process.env.BACKUP_DIR,
    '/var/backups/dal',
  ].filter(Boolean);

  let newest = null;
  for (const dir of spots) {
    if (!fs.existsSync(dir)) continue;
    for (const f of walk(dir)) {
      const st = fs.statSync(f);
      if (!newest || st.mtimeMs > newest.mtimeMs) newest = { f, mtimeMs: st.mtimeMs, size: st.size };
    }
  }
  if (!newest) {
    warn('tidak ditemukan backup', `dicari di: ${spots.join(', ')} — jalankan deploy/backup.sh sebelum migrasi`);
    return;
  }
  const ageH = (Date.now() - newest.mtimeMs) / 3600_000;
  const detail = `${path.basename(newest.f)}, ${mb(newest.size)}, ${ageH.toFixed(0)} jam lalu`;
  if (ageH > 48) warn('backup terakhir sudah lama', detail);
  else           ok('backup terakhir', detail);
}

// ─── Jalan ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n\x1b[1mDAL — Pemeriksaan Kesiapan Penyimpanan\x1b[0m');
  console.log(`${new Date().toISOString()}  ·  NODE_ENV=${process.env.NODE_ENV || '(tidak disetel)'}`);

  section('Lingkungan');
  checkNodeAndCron();
  checkStoragePath();
  checkSameFilesystem();
  checkHardlinks();
  checkDiskSpace();
  await checkGhostscript();

  section('Skema database');
  await checkSchema();
  await checkSettings();

  section('Kondisi data');
  await reportData();

  section('Backup');
  checkBackup();

  console.log('\n──────────────────────────────────────────');
  console.log(failures ? `\x1b[31m${failures} GAGAL\x1b[0m, ${warnings} peringatan`
                       : `\x1b[32mSemua pemeriksaan lolos\x1b[0m, ${warnings} peringatan`);
  if (failures) {
    console.log('Perbaiki yang GAGAL sebelum menjalankan skrip penyimpanan atau melanjutkan deploy.');
    process.exitCode = 1;
  }
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
