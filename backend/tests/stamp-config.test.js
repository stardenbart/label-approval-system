// backend/tests/stamp-config.test.js
'use strict';

/**
 * config/stamp.js ada justru karena angka-angka ini pernah tersebar di lima
 * tempat dan menyimpang: form settings mengizinkan 400pt sementara validasi
 * approve memasang max 200 sebagai angka mati. Test ini menjaga agar isinya
 * tetap konsisten terhadap dirinya sendiri.
 */

const {
  QR_SIZE_LIMIT_PT, QR_SIZE_ADVISORY_MIN_PT, FOOTER_SIZE_LIMIT_PT,
  SETTING_DEFAULTS, MAX_APPROVAL_LEVEL, ARCHIVE_COMPRESSION_PRESETS, toMm, toPt,
} = require('../src/config/stamp');

test('batas QR masuk akal terhadap dirinya sendiri', () => {
  expect(QR_SIZE_LIMIT_PT.min).toBeLessThan(QR_SIZE_LIMIT_PT.max);
  expect(QR_SIZE_ADVISORY_MIN_PT).toBeGreaterThanOrEqual(QR_SIZE_LIMIT_PT.min);
  expect(QR_SIZE_ADVISORY_MIN_PT).toBeLessThanOrEqual(QR_SIZE_LIMIT_PT.max);
});

test('batas footer masuk akal terhadap dirinya sendiri', () => {
  expect(FOOTER_SIZE_LIMIT_PT.minW).toBeLessThan(FOOTER_SIZE_LIMIT_PT.maxW);
  expect(FOOTER_SIZE_LIMIT_PT.minH).toBeLessThan(FOOTER_SIZE_LIMIT_PT.maxH);
  expect(FOOTER_SIZE_LIMIT_PT.minFont).toBeLessThan(FOOTER_SIZE_LIMIT_PT.maxFont);
});

test('default QR berada di dalam rentang kebijakan bawaan', () => {
  // Inilah bug yang dulu terjadi: default di-seed 60 sementara fallback di
  // pdf.service 10, dan keduanya tidak pernah dibandingkan.
  const min = parseFloat(SETTING_DEFAULTS.qr_min_width_pt);
  const max = parseFloat(SETTING_DEFAULTS.qr_max_width_pt);
  expect(min).toBeLessThan(max);
  for (const k of ['qr_default_width_pt', 'qr_default_height_pt']) {
    const v = parseFloat(SETTING_DEFAULTS[k]);
    expect(v).toBeGreaterThanOrEqual(min);
    expect(v).toBeLessThanOrEqual(max);
  }
});

test('rentang kebijakan bawaan berada di dalam batas teknis', () => {
  expect(parseFloat(SETTING_DEFAULTS.qr_min_width_pt)).toBeGreaterThanOrEqual(QR_SIZE_LIMIT_PT.min);
  expect(parseFloat(SETTING_DEFAULTS.qr_max_width_pt)).toBeLessThanOrEqual(QR_SIZE_LIMIT_PT.max);
});

test('default persen berada di 0–100 dan halaman minimal 1', () => {
  for (const k of ['qr_default_x_percent', 'qr_default_y_percent',
                   'footer_default_x_percent', 'footer_default_y_percent']) {
    const v = parseFloat(SETTING_DEFAULTS[k]);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(100);
  }
  expect(parseFloat(SETTING_DEFAULTS.qr_default_page)).toBeGreaterThanOrEqual(1);
});

test('rotasi footer hanya salah satu dari empat sudut yang didukung', () => {
  expect([0, 90, 180, 270]).toContain(parseFloat(SETTING_DEFAULTS.footer_default_rotation));
});

test('preset kompresi bawaan ada di daftar yang diizinkan', () => {
  expect(ARCHIVE_COMPRESSION_PRESETS).toContain(SETTING_DEFAULTS.archive_compression_preset);
});

test('MAX_APPROVAL_LEVEL aturan bisnis tiga tingkat', () => {
  expect(MAX_APPROVAL_LEVEL).toBe(2);
});

test('konversi pt <-> mm bolak-balik', () => {
  expect(toMm(72)).toBeCloseTo(25.4, 6);
  expect(toPt(25.4)).toBeCloseTo(72, 6);
  expect(toPt(toMm(123.45))).toBeCloseTo(123.45, 6);
});
