import { describe, expect, test } from 'vitest';
import {
  footerPreviewLayout,
  logicalFooterSize,
  rotatedFooterSize,
} from '../footerGeometry.js';

describe('footer geometry', () => {
  test.each([
    [0,   { w: 220, h: 30 }],
    [90,  { w: 30,  h: 220 }],
    [180, { w: 220, h: 30 }],
    [270, { w: 30,  h: 220 }],
  ])('bounding box rotasi %i benar', (rotation, expected) => {
    expect(rotatedFooterSize(220, 30, rotation)).toEqual(expected);
  });

  test.each([0, 90, 180, 270])('resize rotasi %i dapat dibalik', (rotation) => {
    const display = rotatedFooterSize(220, 30, rotation);
    expect(logicalFooterSize(display.w, display.h, rotation)).toEqual({ w: 220, h: 30 });
  });

  test('preview vertikal berpusat di bounding box yang sudah ditukar', () => {
    expect(footerPreviewLayout(264, 36, 90)).toEqual({
      left: -114,
      top: 114,
      transform: 'rotate(-90deg)',
    });
    expect(footerPreviewLayout(264, 36, 270)).toEqual({
      left: -114,
      top: 114,
      transform: 'rotate(-270deg)',
    });
  });
});
