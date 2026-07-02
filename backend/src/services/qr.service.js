// backend/src/services/qr.service.js
'use strict';

const QRCode = require('qrcode');
const path   = require('path');

const QR_OPTS = {
  type:                 'png',
  width:                300,
  margin:               2,
  color:                { dark: '#000000', light: '#ffffff' },
  errorCorrectionLevel: 'M',
};

/**
 * Generate the QR for the ORIGINAL file (pre-signing state).
 * Target: /e/{docUuid} — shows document identity, not tied to any approver.
 * Called once at upload time. UNCHANGED from previous behavior.
 */
async function generateOriginalQr(docUuid, storageDir) {
  const baseUrl = process.env.APP_URL || 'https://localhost';
  const qrOriginalUrl  = `${baseUrl}/e/${docUuid}`;
  const qrOriginalPath = path.join(storageDir, 'qr_original.png');

  await QRCode.toFile(qrOriginalPath, qrOriginalUrl, QR_OPTS);
  return qrOriginalPath;
}

/**
 * Generate the QR for a SPECIFIC approval (one per level: 0=Staff, 1=SPV, 2=Marketing...).
 * Target: /e/approval/{approvalId} — shows that specific approver's identity + document info.
 * This is the SAME image file used both as:
 *   1. The public verification target (scanned by anyone)
 *   2. The stamp image embedded into the PDF at that level (pdf.service.overlayEsign)
 *
 * Called each time an approval is finalized (staff self-sign at upload, or approve()).
 *
 * @param {string} approvalId  - DocumentApproval.id
 * @param {string} storageDir  - document's storage directory
 * @param {number} level       - approval level, used only for a readable filename
 * @returns {string} absolute path to the generated QR PNG
 */
async function generateApprovalQr(approvalId, storageDir, level) {
  const baseUrl = process.env.APP_URL || 'https://localhost';
  const qrUrl   = `${baseUrl}/e/approval/${approvalId}`;
  const qrPath  = path.join(storageDir, `qr_approval_level${level}.png`);

  await QRCode.toFile(qrPath, qrUrl, QR_OPTS);
  return qrPath;
}

/**
 * @deprecated Kept only for backward compatibility with any code path that
 * has not yet migrated to generateApprovalQr(). Do NOT call from new code —
 * QR is now per-approval, not a single generic per-document QR.
 * Old documents that already have qrPathEsign set will keep working for
 * read access (downloadQrEsign), this just stops new ones being generated this way.
 */
async function generateForDocument(docUuid, regulatoryId, storageDir) {
  const qrOriginalPath = await generateOriginalQr(docUuid, storageDir);
  return { qrOriginalPath, qrEsignPath: null };
}

/**
 * Generate a QR as a data URL (e.g. for inline preview without writing a file).
 */
async function toDataURL(content) {
  return QRCode.toDataURL(content, {
    width: 300, margin: 1, errorCorrectionLevel: 'M',
  });
}

module.exports = {
  generateOriginalQr,
  generateApprovalQr,
  generateForDocument, // deprecated — see notice above
  toDataURL,
};