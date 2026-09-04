// frontend/.eslintrc.cjs
//
// Skrip `npm run lint` sudah ada sejak awal, tapi tidak pernah bisa jalan —
// ESLint berhenti dengan "couldn't find a configuration file" karena berkas ini
// tidak pernah dibuat. Konfigurasi sengaja disusun hanya dari paket yang memang
// sudah terpasang (eslint + eslint-plugin-react), supaya lint bisa dipakai tanpa
// menambah dependency baru lebih dulu.
//
// Berformat .eslintrc (ESLint 8). Ekstensi .cjs wajib karena package.json
// frontend memakai "type": "module" — tanpa itu berkas ini dibaca sebagai ESM
// dan module.exports gagal.

module.exports = {
  root: true,
  env: {
    browser: true,
    es2022:  true,
  },
  parserOptions: {
    ecmaVersion:  'latest',
    sourceType:   'module',
    ecmaFeatures: { jsx: true },
  },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    // Vite memakai automatic JSX runtime, jadi `import React` tidak wajib —
    // tanpa baris ini setiap berkas JSX dilaporkan salah.
    'plugin:react/jsx-runtime',
  ],
  settings: {
    react: { version: 'detect' },
  },
  rules: {
    // Variabel/argumen berawalan _ memang sengaja tidak dipakai.
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    // `catch (_) {}` dipakai secara sadar di beberapa tempat untuk menelan error
    // yang tidak fatal (mis. QR belum siap). Blok kosong lain tetap dilaporkan.
    'no-empty': ['error', { allowEmptyCatch: true }],
    // Proyek ini tidak memakai PropTypes maupun TypeScript.
    'react/prop-types': 'off',
    // Aturan ini menandai tanda kutip dan apostrof biasa di teks antarmuka —
    // 14 temuan, semuanya kalimat yang memang benar. Menggantinya dengan
    // &quot;/&apos; hanya membuat copy lebih sulit dibaca di kode, tanpa
    // memperbaiki apa pun: JSX modern merender keduanya dengan benar.
    'react/no-unescaped-entities': 'off',
  },
};
