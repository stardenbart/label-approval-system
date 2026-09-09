'use strict';

const { placeFooterBox, rotatedBox } = require('../src/services/footer-geometry');

describe('footer geometry', () => {
  test.each([
    [0,   { visualWidth: 220, visualHeight: 30,  minX: 0,    minY: 0 }],
    [90,  { visualWidth: 30,  visualHeight: 220, minX: -30,  minY: 0 }],
    [180, { visualWidth: 220, visualHeight: 30,  minX: -220, minY: -30 }],
    [270, { visualWidth: 30,  visualHeight: 220, minX: 0,    minY: -220 }],
  ])('bounding box PDF rotasi %i benar', (rotation, expected) => {
    expect(rotatedBox(220, 30, rotation)).toEqual(expected);
  });

  test.each([
    [0,   { originX: 59.5, originY: 727.8 }],
    [90,  { originX: 89.5, originY: 537.8 }],
    [180, { originX: 279.5, originY: 757.8 }],
    [270, { originX: 59.5, originY: 757.8 }],
  ])('origin rotasi %i menjaga kiri-atas visual yang sama', (rotation, expected) => {
    const placed = placeFooterBox({
      pageWidth: 595,
      pageHeight: 842,
      xPercent: 10,
      yPercent: 10,
      width: 220,
      height: 30,
      rotation,
    });
    expect(placed.originX).toBeCloseTo(expected.originX, 6);
    expect(placed.originY).toBeCloseTo(expected.originY, 6);
  });

  test('kotak vertikal di dekat bawah dijepit agar tidak keluar halaman', () => {
    const placed = placeFooterBox({
      pageWidth: 595,
      pageHeight: 842,
      xPercent: 3,
      yPercent: 97,
      width: 220,
      height: 30,
      rotation: 90,
    });

    expect(placed.top).toBe(842 - 220);
    expect(placed.originY).toBe(0);
  });
});
