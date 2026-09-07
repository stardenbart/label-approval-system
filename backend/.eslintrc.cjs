// backend/.eslintrc.cjs
//
// Backend sebelumnya tidak punya lint sama sekali — ESLint tidak terpasang dan
// tidak ada skrip `lint`. Dipasang belakangan menyusul frontend, memakai versi
// dan format konfigurasi yang sama (ESLint 8, format .eslintrc) supaya keduanya
// berperilaku serupa dan tidak perlu dua cara berpikir yang berbeda.
//
// Ekstensi .cjs sebenarnya tidak wajib di sini (backend/package.json tidak
// memakai "type": "module"), tapi disamakan dengan frontend agar konsisten.

module.exports = {
  root: true,
  env: {
    node:   true,
    es2022: true,
    jest:   true,   // tests/ memakai jest + supertest
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType:  'script',   // CommonJS — seluruh backend memakai require()
  },
  extends: ['eslint:recommended'],
  rules: {
    // Argumen berawalan _ memang sengaja tidak dipakai — pola ini dipakai luas
    // di middleware Express, mis. (err, req, res, _next).
    'no-unused-vars': ['warn', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      // `const { deletedAt, ...doc } = row` adalah cara sengaja membuang satu
      // field sebelum dikirim ke client (public.controller.js). Sisa destructure
      // seperti ini bukan variabel mati.
      ignoreRestSiblings: true,
    }],
    // `catch (_) {}` dipakai secara sadar untuk menelan error yang tidak fatal,
    // mis. gagal menghapus berkas sementara saat rollback. Blok kosong selain
    // catch tetap dilaporkan.
    'no-empty': ['error', { allowEmptyCatch: true }],
    // Sengaja TIDAK memakai 'require-atomic-updates'. Saya coba pasang, dan satu-
    // satunya temuannya adalah false positive: `approval.qrPath = qrPath` di
    // approval.controller.js. Objek `approval` itu lokal per request, jadi tidak
    // ada state yang dibagi dan tidak ada balapan — tapi aturannya tetap menandai
    // setiap penulisan properti setelah await. Menyenangkan aturan itu berarti
    // memutar kode yang sudah benar; lint yang berisik justru berhenti dibaca.
  },
};
