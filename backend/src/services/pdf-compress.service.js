// backend/src/services/pdf-compress.service.js
'use strict';

/**
 * Kompresi PDF arsip lewat Ghostscript.
 *
 * DIUKUR pada storage nyata DAL (bukan angka dari dokumentasi Ghostscript).
 * Berkas contoh 1.487 KB, 7 halaman, 12 gambar:
 *
 *   preset     dimensi gambar   ukuran      piksel bergeser >8 @600dpi
 *   asli       1249x706 Flate   1.487 KB    —
 *   prepress   1249x706 JPEG    1.277 KB    0,03%
 *   ebook      1249x706 JPEG      623 KB    0,82%
 *   screen      416x235 JPEG      151 KB    4,02%
 *
 * Yang penting dari tabel itu: pada berkas DAL, `/ebook` TIDAK menurunkan
 * resolusi — dimensi gambarnya sama persis dengan aslinya. Ghostscript hanya
 * menurunkan resolusi kalau gambar melebihi 1,5x target, dan artwork label di
 * sini efektif ~200 dpi, jadi di bawah ambang itu. Penghematan 58% datang murni
 * dari mengganti Flate dengan JPEG bermutu sedang. `/screen` beda urusan: itu
 * benar-benar memangkas ke 416x235 dan terlihat.
 *
 * Kompresinya LOSSY dan tidak bisa dibalik. Yang membuatnya tetap aman:
 * `original.pdf` tidak pernah disentuh, dan `stamp_manifest` menyimpan apa yang
 * digambar — jadi versi mutu penuh selalu bisa dibuat ulang dari sumber aslinya
 * (lihat stamped-cache.service). Yang dikompresi hanya berkas arsip, yaitu
 * salinan untuk dipakai sehari-hari.
 *
 * Ghostscript adalah dependensi OPSIONAL. Kalau `gs` tidak ada, kompresi
 * dilewati dengan peringatan dan arsipnya disimpan apa adanya — tidak ada alur
 * kerja yang berhenti gara-gara ini. Di server: `apt install ghostscript`.
 * Binernya bisa ditunjuk lewat env `GS_BINARY`.
 */

const fs   = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { PDFDocument } = require('pdf-lib');
const { prisma } = require('../config/prisma');
const { SETTING_DEFAULTS } = require('../config/stamp');
const logger = require('../config/logger');

const SETTING_KEY = 'archive_compression_preset';

/**
 * Argumen tambahan per preset. `none` mematikan kompresi sama sekali.
 *
 * -dDetectDuplicateImages menyatukan gambar yang isinya sama di dalam satu
 * dokumen — logo yang diulang di tiap halaman jadi satu objek.
 */
const PRESETS = {
  none:     null,
  prepress: ['-dPDFSETTINGS=/prepress'],
  ebook:    ['-dPDFSETTINGS=/ebook'],
  screen:   ['-dPDFSETTINGS=/screen'],
};

const TIMEOUT_MS = Number(process.env.GS_TIMEOUT_MS || 120_000);

function gsBinary() {
  return process.env.GS_BINARY || 'gs';
}

let availability = null; // null = belum diperiksa
let tmpCounter   = 0;

/** Apakah Ghostscript bisa dipanggil? Hasilnya diingat supaya tidak menjalankan
 *  proses baru pada setiap upload. */
function isAvailable() {
  if (availability !== null) return Promise.resolve(availability);
  return new Promise((resolve) => {
    execFile(gsBinary(), ['--version'], { timeout: 10_000 }, (err, stdout) => {
      availability = !err;
      if (err) {
        logger.warn(
          `Ghostscript tidak tersedia (${gsBinary()}): kompresi arsip dilewati. ` +
          `Pasang dengan "apt install ghostscript" atau setel GS_BINARY.`
        );
      } else {
        logger.info(`Ghostscript ${String(stdout).trim()} siap untuk kompresi arsip`);
      }
      resolve(availability);
    });
  });
}

/** Preset yang berlaku, dari system_settings; nilai tak dikenal jadi 'none'. */
async function resolvePreset() {
  let value;
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: SETTING_KEY } });
    value = row?.value;
  } catch (err) {
    logger.warn(`Gagal membaca ${SETTING_KEY}: ${err.message}`);
  }
  const preset = value || SETTING_DEFAULTS[SETTING_KEY];
  if (!(preset in PRESETS)) {
    logger.warn(`Preset kompresi "${preset}" tidak dikenal — kompresi dimatikan`);
    return 'none';
  }
  return preset;
}

function runGhostscript(srcPath, outPath, presetArgs) {
  return new Promise((resolve, reject) => {
    execFile(gsBinary(), [
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.7',
      '-dNOPAUSE', '-dQUIET', '-dBATCH', '-dSAFER',
      '-dDetectDuplicateImages=true',
      '-dCompressFonts=true',
      ...presetArgs,
      `-sOutputFile=${outPath}`,
      srcPath,
    ], { timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 }, (err, _stdout, stderr) => {
      if (err) return reject(new Error(`${err.killed ? 'timeout' : err.code}: ${String(stderr).trim().slice(0, 300)}`));
      resolve();
    });
  });
}

/**
 * Kompres satu PDF di tempat.
 *
 * Hasilnya hanya dipakai kalau LOLOS tiga pemeriksaan. Ghostscript bisa
 * menghasilkan berkas yang terbuka tapi isinya rusak — halaman hilang, atau
 * malah membesar — dan arsip yang sudah disetujui bukan tempat untuk berharap.
 *
 * @param {string} filePath berkas yang akan dikompresi, ditimpa bila berhasil
 * @param {string} [preset] paksa preset tertentu; default dari system_settings
 * @returns {Promise<{ok:boolean, reason?:string, preset:string, before:number, after?:number, saved?:number}>}
 */
async function compressInPlace(filePath, preset = null) {
  const chosen = preset || await resolvePreset();
  const before = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;

  // Preset yang dioper langsung ikut diperiksa. resolvePreset() sudah menjaga
  // nilai dari database, tapi pemanggil yang memaksa preset sendiri melewati
  // penjagaan itu — dan tanpa pemeriksaan ini yang terjadi adalah TypeError di
  // tengah pemrosesan, bukan penolakan yang jelas.
  if (!(chosen in PRESETS)) {
    return { ok: false, reason: `preset tidak dikenal: ${chosen}`, preset: chosen, before };
  }
  if (chosen === 'none')            return { ok: false, reason: 'dimatikan', preset: chosen, before };
  if (!before)                      return { ok: false, reason: 'berkas tidak ada', preset: chosen, before };
  if (!await isAvailable())         return { ok: false, reason: 'ghostscript tidak ada', preset: chosen, before };

  // Nama unik per panggilan, bukan per proses: dua kompresi berurutan pada
  // berkas yang sama (approval diulang, skrip backfill dijalankan dua kali)
  // akan memakai nama yang sama dan saling menimpa keluaran.
  const tmp = `${filePath}.gs-${process.pid}-${(tmpCounter += 1)}.tmp`;
  try {
    await runGhostscript(filePath, tmp, PRESETS[chosen]);

    // 1. Ada isinya?
    if (!fs.existsSync(tmp) || fs.statSync(tmp).size === 0) {
      throw new Error('keluaran kosong');
    }
    const after = fs.statSync(tmp).size;

    // 2. Jumlah halaman harus sama. Ini penjaga paling penting: PDF yang
    //    kehilangan halaman tetap terbuka normal di viewer.
    const [srcPages, outPages] = await Promise.all([
      PDFDocument.load(fs.readFileSync(filePath)).then(d => d.getPageCount()),
      PDFDocument.load(fs.readFileSync(tmp)).then(d => d.getPageCount()),
    ]);
    if (srcPages !== outPages) {
      throw new Error(`jumlah halaman berubah ${srcPages} -> ${outPages}`);
    }

    // 3. Benar-benar lebih kecil? PDF yang isinya teks saja sering justru
    //    membesar setelah ditulis ulang.
    if (after >= before) {
      fs.unlinkSync(tmp);
      return { ok: false, reason: `tidak lebih kecil (${before} -> ${after})`, preset: chosen, before, after };
    }

    fs.renameSync(tmp, filePath);
    logger.info(
      `Arsip dikompresi [${chosen}]: ${path.basename(filePath)} ` +
      `${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB ` +
      `(hemat ${((1 - after / before) * 100).toFixed(0)}%)`
    );
    return { ok: true, preset: chosen, before, after, saved: before - after };
  } catch (err) {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* abaikan */ }
    // Berkas aslinya tidak pernah disentuh sampai rename berhasil, jadi
    // kegagalan di sini tidak pernah merusak arsip.
    logger.warn(`Kompresi arsip gagal untuk ${path.basename(filePath)}: ${err.message}`);
    return { ok: false, reason: err.message, preset: chosen, before };
  }
}

module.exports = { compressInPlace, isAvailable, resolvePreset, PRESETS, SETTING_KEY };
