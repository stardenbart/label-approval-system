'use strict';

const { normalizeMode, normalizeLayout, placeNext } = require('../src/services/qr-layout.service');

const input = {
  base: { pageNumber: 1, xPercent: 10, yPercent: 10, widthPt: 100, heightPt: 100 },
  pageWidth: 600,
  pageHeight: 800,
};

describe('QR layout per level', () => {
  test('nilai asing kembali ke kebijakan aman', () => {
    expect(normalizeMode('aneh')).toBe('per_level');
    expect(normalizeLayout('aneh')).toBe('horizontal');
  });

  test('horizontal menambah slot ke kanan', () => {
    const result = placeNext({ ...input, index: 1, layout: 'horizontal' });
    expect(result.xPercent).toBeCloseTo((60 + 112) / 600 * 100);
    expect(result.yPercent).toBe(10);
  });

  test('vertical menambah slot ke bawah', () => {
    const result = placeNext({ ...input, index: 2, layout: 'vertical' });
    expect(result.xPercent).toBe(10);
    expect(result.yPercent).toBeCloseTo((80 + 224) / 800 * 100);
  });

  test('slot tidak pernah keluar halaman', () => {
    const result = placeNext({ ...input, index: 20, layout: 'horizontal' });
    expect(result.xPercent).toBeGreaterThanOrEqual(0);
    expect(result.xPercent).toBeLessThanOrEqual((600 - 100) / 600 * 100);
  });

  test('bila ruang kanan habis, slot berikutnya memakai ruang kiri tanpa bertumpuk', () => {
    const centered = { ...input, base: { ...input.base, xPercent: 50 } };
    const level1 = placeNext({ ...centered, index: 1, layout: 'horizontal' });
    const level2 = placeNext({ ...centered, index: 2, layout: 'horizontal' });
    expect(level1.xPercent).toBeGreaterThan(50);
    expect(level2.xPercent).toBeLessThan(50);
  });
});
