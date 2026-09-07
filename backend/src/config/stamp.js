// backend/src/config/stamp.js
//
// Satu-satunya tempat angka batas stamp hidup.
//
// Sebelum berkas ini ada, ukuran QR dijaga lima lapis yang tidak saling tahu dan
// sudah menyimpang: form settings mengizinkan sampai 400pt, tapi validasi saat
// approve memasang `Joi.number().max(200)` sebagai angka mati — jadi menaikkan
// batas lewat System Settings tampak berhasil lalu ditolak beberapa detik
// kemudian. Saat upload batasnya lain lagi (500).
//
// Ada dua jenis batas, dan keduanya sengaja dipisah:
//
//   BATAS TEKNIS (di berkas ini) — pagar keselamatan yang tidak masuk akal untuk
//   dilewati siapa pun. Di bawah minimum QR tidak terpindai; di atas maksimum QR
//   lebih lebar dari kertasnya. Ini bukan kebijakan, ini fisika.
//
//   BATAS KEBIJAKAN (di tabel system_settings) — rentang yang boleh dipakai
//   approver sehari-hari, ditentukan superadmin lewat System Settings. Ini yang
//   dimaksud "dinamis": ubah di UI, langsung berlaku, tanpa menyentuh kode.
//
// Selain itu overlayEsign() masih menjepit ukuran akhir ke dimensi halaman PDF
// yang sebenarnya — jadi batas paling atas sesungguhnya mengikuti kertasnya,
// bukan angka tetap di sini.

// 20pt ≈ 7mm — di bawah ini QR praktis tidak terpindai kamera ponsel.
// 595pt ≈ 210mm — selebar A4; lebih dari ini pasti keluar halaman pada ukuran
// kertas yang dipakai DAL. Halaman berukuran lain dijepit lagi saat menggambar.
const QR_SIZE_LIMIT_PT = { min: 20, max: 595 };

// Di bawah angka ini QR masih diterima, tapi UI sebaiknya memperingatkan —
// 57pt ≈ 20mm adalah ukuran terkecil yang masih nyaman dipindai dari jarak baca.
const QR_SIZE_ADVISORY_MIN_PT = 57;

// Nilai awal tabel system_settings. Dipakai seeder, tombol "reset to defaults",
// DAN sebagai fallback saat pdf.service membaca setting yang belum ada — dulu
// ketiganya punya salinan sendiri dan sempat berbeda (fallback minimum di
// pdf.service 10, sementara default yang di-seed 60).
const SETTING_DEFAULTS = {
  qr_default_width_pt:  '100',
  qr_default_height_pt: '100',
  qr_default_page:      '1',
  qr_default_x_percent: '85',
  qr_default_y_percent: '5',
  qr_min_width_pt:      '60',
  qr_max_width_pt:      '200',
  footer_default_x_percent: '3',
  footer_default_y_percent: '97',
  footer_default_width_pt:  '220',
  footer_default_height_pt: '30',
  footer_default_page:      '1',
  footer_default_font_size: '7',
  footer_default_rotation:  '0',
  // Preset kompresi berkas arsip. Diukur pada storage DAL: 'ebook' memangkas
  // 52-58% TANPA menurunkan resolusi gambar (hanya Flate -> JPEG bermutu
  // sedang), 'prepress' 5-14%, 'screen' 77-90% tapi resolusinya benar-benar
  // dipangkas dan terlihat. 'none' mematikan kompresi.
  // Lihat pdf-compress.service.js untuk tabel lengkapnya.
  archive_compression_preset: 'ebook',
};

// Preset yang boleh dipilih. Ada di sini, bukan di service, supaya validator
// settings dan daftar pilihan di UI membaca sumber yang sama.
const ARCHIVE_COMPRESSION_PRESETS = ['none', 'prepress', 'ebook', 'screen'];

// Kotak footer bukan persegi dan bukan gambar — batasnya beda dari QR, tapi
// prinsipnya sama: satu tempat, dipakai validator server maupun kontrol di UI.
const FOOTER_SIZE_LIMIT_PT = {
  minW: 50, maxW: 400,
  minH: 15, maxH: 100,
  minFont: 5, maxFont: 24,
};

// Jumlah level approval: Staff Regulatory (0) → SPV (1) → Manager (2).
//
// Dulu angka ini diturunkan dari daftar nama berkas PDF di pdf.service, karena
// tiap level menulis berkas sendiri — jadi batas levelnya terikat pada batas
// teknis penulisan berkas. Sejak QR ditempel sekali saja di Level 0, level
// berikutnya tidak menulis PDF apa pun, dan keterikatan itu hilang. Yang
// tersisa murni aturan bisnis (PRD OI-03: tiga tingkat).
const MAX_APPROVAL_LEVEL = 2;

const PT_PER_MM = 72 / 25.4;

const toMm = (pt) => pt * 25.4 / 72;
const toPt = (mm) => mm * PT_PER_MM;

module.exports = {
  MAX_APPROVAL_LEVEL,
  ARCHIVE_COMPRESSION_PRESETS,
  QR_SIZE_LIMIT_PT,
  FOOTER_SIZE_LIMIT_PT,
  QR_SIZE_ADVISORY_MIN_PT,
  SETTING_DEFAULTS,
  toMm,
  toPt,
};
