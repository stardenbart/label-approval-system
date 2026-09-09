'use strict';

const QR_STAMP_MODES = ['document', 'per_level'];
const QR_LAYOUTS = ['horizontal', 'vertical', 'grid', 'manual'];
const GAP_PT = 12;

function normalizeMode(value) {
  return QR_STAMP_MODES.includes(value) ? value : 'per_level';
}

function normalizeLayout(value) {
  return QR_LAYOUTS.includes(value) ? value : 'horizontal';
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Menentukan posisi awal QR level berikutnya dari QR pertama. Koordinat tetap
 * memakai top-left percent seperti canvas. Hasil selalu berada di halaman;
 * approver masih boleh menggesernya sebelum menyetujui.
 */
function placeNext({ base, index, layout, pageWidth, pageHeight }) {
  const normalized = normalizeLayout(layout);
  const w = Number(base.widthPt);
  const h = Number(base.heightPt);
  const startX = (Number(base.xPercent) / 100) * pageWidth;
  const startY = (Number(base.yPercent) / 100) * pageHeight;

  let x = startX;
  let y = startY;

  if (normalized === 'horizontal') {
    const step = w + GAP_PT;
    const rightCapacity = Math.max(0, Math.floor((pageWidth - w - startX) / step));
    x += index <= rightCapacity
      ? index * step
      : -(index - rightCapacity) * step;
  } else if (normalized === 'vertical') {
    const step = h + GAP_PT;
    const downCapacity = Math.max(0, Math.floor((pageHeight - h - startY) / step));
    y += index <= downCapacity
      ? index * step
      : -(index - downCapacity) * step;
  } else if (normalized === 'grid') {
    const columns = Math.max(1, Math.floor((pageWidth - startX + GAP_PT) / (w + GAP_PT)));
    x += (index % columns) * (w + GAP_PT);
    y += Math.floor(index / columns) * (h + GAP_PT);
  }
  // manual: posisi awal sama dengan QR pertama; user menentukan sendiri.

  return {
    pageNumber: base.pageNumber,
    xPercent: (clamp(x, 0, Math.max(0, pageWidth - w)) / pageWidth) * 100,
    yPercent: (clamp(y, 0, Math.max(0, pageHeight - h)) / pageHeight) * 100,
    widthPt: w,
    heightPt: h,
  };
}

module.exports = {
  QR_STAMP_MODES,
  QR_LAYOUTS,
  normalizeMode,
  normalizeLayout,
  placeNext,
};
