'use strict';

function normalizeRotation(rotation) {
  const value = Number(rotation);
  return [0, 90, 180, 270].includes(value) ? value : 0;
}

function rotatedBox(width, height, rotation) {
  switch (normalizeRotation(rotation)) {
    case 90:
      return { visualWidth: height, visualHeight: width, minX: -height, minY: 0 };
    case 180:
      return { visualWidth: width, visualHeight: height, minX: -width, minY: -height };
    case 270:
      return { visualWidth: height, visualHeight: width, minX: 0, minY: -width };
    default:
      return { visualWidth: width, visualHeight: height, minX: 0, minY: 0 };
  }
}

// xPercent/yPercent adalah kiri-atas bounding box visual, sama seperti canvas.
// pdf-lib memutar dari origin teks pada koordinat kiri-bawah, sehingga origin
// perlu digeser berdasarkan sudut agar hasilnya menempati bounding box itu.
function placeFooterBox({ pageWidth, pageHeight, xPercent, yPercent, width, height, rotation }) {
  const box = rotatedBox(width, height, rotation);
  const requestedLeft = (xPercent / 100) * pageWidth;
  const requestedTop  = (yPercent / 100) * pageHeight;
  const left = Math.max(0, Math.min(requestedLeft, pageWidth - box.visualWidth));
  const top  = Math.max(0, Math.min(requestedTop, pageHeight - box.visualHeight));
  const bottom = pageHeight - top - box.visualHeight;

  return {
    ...box,
    left,
    top,
    originX: left - box.minX,
    originY: bottom - box.minY,
  };
}

module.exports = { normalizeRotation, rotatedBox, placeFooterBox };
