// backend/tests/pdf-fingerprint.test.js
'use strict';

/**
 * Sidik jari inilah yang memutuskan boleh-tidaknya sebuah berkas DIHAPUS
 * (--prune) atau DIKOMPRESI secara lossy. Kalau ia terlalu longgar, berkas yang
 * sebenarnya berbeda akan dibuang; kalau terlalu ketat, tidak ada yang pernah
 * bisa dirapikan.
 */

const { sameFingerprint } = require('../src/services/pdf-fingerprint.service');

// `images` di tingkat dokumen adalah daftar hash isi tiap gambar. Fixture di
// bawah memakai daftar kosong karena yang diuji di blok ini adalah geometri dan
// teks; isi gambar diuji tersendiri dengan PDF sungguhan di bawah.
const fp = (pages, images = []) => ({ numPages: pages.length, pages, images });
const page = (o = {}) => ({ w: 595, h: 842, images: 1, text: 'abc', ...o });

test('sidik jari identik dianggap sama', () => {
  expect(sameFingerprint(fp([page()]), fp([page()]))).toBeNull();
});

test('jumlah halaman berbeda ditolak', () => {
  expect(sameFingerprint(fp([page()]), fp([page(), page()])))
    .toMatch(/jumlah halaman 1 vs 2/);
});

test('ukuran halaman berbeda ditolak', () => {
  expect(sameFingerprint(fp([page()]), fp([page({ w: 420 })])))
    .toMatch(/ukuran 595x842 vs 420x842/);
});

test('jumlah gambar berbeda ditolak — inilah yang menangkap dokumen pra-refactor', () => {
  // Berkas lama membawa QR per level; renderer sekarang menggambar satu.
  expect(sameFingerprint(fp([page({ images: 3 })]), fp([page({ images: 2 })])))
    .toMatch(/jumlah gambar 3 vs 2/);
});

test('teks berbeda ditolak', () => {
  expect(sameFingerprint(fp([page()]), fp([page({ text: 'lain' })])))
    .toMatch(/teks berbeda/);
});

test('jumlah gambar tingkat dokumen berbeda ditolak', () => {
  expect(sameFingerprint(fp([page()], ['aaa']), fp([page()], ['aaa', 'bbb'])))
    .toMatch(/jumlah gambar dokumen 1 vs 2/);
});

test('perbedaan di halaman kedua tetap tertangkap', () => {
  const a = fp([page(), page({ images: 1 })]);
  const b = fp([page(), page({ images: 4 })]);
  expect(sameFingerprint(a, b)).toMatch(/halaman 2/);
});

// ─── Isi gambar, bukan sekadar jumlahnya ────────────────────────────────────
//
// Versi pertama sidik jari ini hanya menghitung jumlah gambar. Di produksi ada
// 20 dokumen yang berhenti di Level 0 dan hanya membawa SATU QR — struktur
// berkasnya identik dengan hasil render kode sekarang, yang berbeda cuma tujuan
// QR-nya. Perbandingan berbasis jumlah menyatakan keduanya sama, sehingga
// berkas lama boleh dihapus dan digantikan render yang menunjuk ke tempat lain.

const { PDFDocument } = require('pdf-lib');
const QRCode = require('qrcode');
const { fingerprint, imageDigests } = require('../src/services/pdf-fingerprint.service');

async function pdfWithQr(payload) {
  const doc  = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  page.drawText('Label produk', { x: 60, y: 700, size: 14 });
  const img = await doc.embedPng(await QRCode.toBuffer(payload, { width: 300 }));
  page.drawImage(img, { x: 400, y: 700, width: 100, height: 100 });
  return Buffer.from(await doc.save());
}

describe('isi gambar ikut dibandingkan', () => {
  jest.setTimeout(20000);

  test('QR dengan tujuan berbeda DITOLAK meski jumlah gambarnya sama', async () => {
    const lama = await pdfWithQr('http://dal.local/e/approval/17aee472-ec1f-49e5-8e51-36163655fe40');
    const baru = await pdfWithQr('http://dal.local/e/08f3466d-26e6-4bdd-ab0f-c0fe319d56d5');

    const [a, b] = [await fingerprint(lama), await fingerprint(baru)];
    expect(a.pages[0].images).toBe(b.pages[0].images);   // jumlahnya memang sama
    expect(sameFingerprint(a, b)).toMatch(/isi gambar berbeda/);
  });

  test('dua render identik tetap dianggap cocok — bukan false negative', async () => {
    const url = 'http://dal.local/e/08f3466d-26e6-4bdd-ab0f-c0fe319d56d5';
    const a = await fingerprint(await pdfWithQr(url));
    const b = await fingerprint(await pdfWithQr(url));
    expect(sameFingerprint(a, b)).toBeNull();
  });

  test('sidik jari lama tanpa daftar gambar ditolak, bukan diloloskan', async () => {
    // Kalau ketiadaan daftar dianggap "cocok", celah yang ditutup berkas ini
    // hidup lagi diam-diam.
    const b = await fingerprint(await pdfWithQr('http://dal.local/e/x'));
    const lama = { numPages: b.numPages, pages: b.pages };
    expect(sameFingerprint(lama, b)).toMatch(/tanpa daftar isi gambar/);
  });

  test('imageDigests terurut, jadi urutan objek di berkas tidak berpengaruh', async () => {
    const d = await imageDigests(await pdfWithQr('http://dal.local/e/x'));
    expect(d).toEqual([...d].sort());
    expect(d).toHaveLength(1);
  });

  test('PDF tanpa gambar menghasilkan daftar kosong, bukan melempar', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]);
    expect(await imageDigests(Buffer.from(await doc.save()))).toEqual([]);
  });
});

// ─── Manifest hasil backfill tidak boleh jadi dasar penghapusan ─────────────

jest.mock('../src/config/prisma', () => ({ prisma: { systemSetting: { findMany: async () => [] } } }));
const { manifestIsTrustworthy, MANIFEST_ORIGIN } = require('../src/services/pdf.service');

describe('manifestIsTrustworthy', () => {
  test('manifest yang dibuat saat penempelan dipercaya', () => {
    expect(manifestIsTrustworthy({ origin: MANIFEST_ORIGIN.STAMP })).toBe(true);
  });

  test('manifest hasil backfill TIDAK dipercaya', () => {
    expect(manifestIsTrustworthy({ origin: MANIFEST_ORIGIN.BACKFILL })).toBe(false);
  });

  test('manifest lama tanpa origin diperlakukan sebagai backfill', () => {
    // Gagal ke arah aman: yang asal-usulnya tidak diketahui tidak boleh jadi
    // dasar menghapus berkas.
    expect(manifestIsTrustworthy({ v: 1 })).toBe(false);
    expect(manifestIsTrustworthy(null)).toBe(false);
    expect(manifestIsTrustworthy(undefined)).toBe(false);
  });
});
