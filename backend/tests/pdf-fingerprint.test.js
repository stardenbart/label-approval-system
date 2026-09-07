// backend/tests/pdf-fingerprint.test.js
'use strict';

/**
 * Sidik jari inilah yang memutuskan boleh-tidaknya sebuah berkas DIHAPUS
 * (--prune) atau DIKOMPRESI secara lossy. Kalau ia terlalu longgar, berkas yang
 * sebenarnya berbeda akan dibuang; kalau terlalu ketat, tidak ada yang pernah
 * bisa dirapikan.
 */

const { sameFingerprint } = require('../src/services/pdf-fingerprint.service');

const fp = (pages) => ({ numPages: pages.length, pages });
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

test('perbedaan di halaman kedua tetap tertangkap', () => {
  const a = fp([page(), page({ images: 1 })]);
  const b = fp([page(), page({ images: 4 })]);
  expect(sameFingerprint(a, b)).toMatch(/halaman 2/);
});
