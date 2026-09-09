export function normalizeFooterRotation(rotation) {
  const value = Number(rotation);
  return [0, 90, 180, 270].includes(value) ? value : 0;
}

export function isQuarterTurn(rotation) {
  const value = normalizeFooterRotation(rotation);
  return value === 90 || value === 270;
}

// Ukuran yang tersimpan adalah ukuran teks sebelum diputar. Kotak yang dilihat
// dan digeser user harus mengikuti bounding box sesudah rotasi.
export function rotatedFooterSize(width, height, rotation) {
  return isQuarterTurn(rotation)
    ? { w: height, h: width }
    : { w: width, h: height };
}

export function logicalFooterSize(displayWidth, displayHeight, rotation) {
  return isQuarterTurn(rotation)
    ? { w: displayHeight, h: displayWidth }
    : { w: displayWidth, h: displayHeight };
}

// Pusat elemen logis ditempatkan tepat di pusat bounding box visual. Dengan
// begitu rotasi tidak bergantung pada urutan translate/rotate milik browser.
export function footerPreviewLayout(widthPx, heightPx, rotation) {
  const normalized = normalizeFooterRotation(rotation);
  const visual = rotatedFooterSize(widthPx, heightPx, normalized);
  return {
    left: (visual.w - widthPx) / 2,
    top: (visual.h - heightPx) / 2,
    transform: normalized ? `rotate(${-normalized}deg)` : 'none',
  };
}
