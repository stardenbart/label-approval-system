// backend/jest.config.cjs
//
// Test di sini sengaja TIDAK menyentuh database maupun storage sungguhan.
// Yang diuji adalah logika yang, kalau rusak, MERUSAK BERKAS ORANG tanpa
// bersuara: penautan hard link, penentuan apa yang digambar ke PDF, dan
// penjagaan sebelum berkas ditimpa hasil kompresi.
//
// Berkas sementara dibuat di folder khusus per test dan dibersihkan sendiri.
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setup.js'],
  testMatch: ['**/tests/**/*.test.js'],
  // Test menyentuh filesystem; jalankan berurutan supaya tidak berebut folder.
  maxWorkers: 1,
  collectCoverageFrom: [
    'src/services/storage-dedup.service.js',
    'src/services/pdf-compress.service.js',
    'src/services/pdf-fingerprint.service.js',
    'src/config/stamp.js',
  ],
};
