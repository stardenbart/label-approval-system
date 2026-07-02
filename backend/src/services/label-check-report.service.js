// backend/src/services/label-check-report.service.js
'use strict';

/**
 * Label Design Checking Report — PDF Generation (Sprint 3)
 * Generates a 3-section PDF report using pdf-lib:
 *   Part 1 — Summary: document header, parameter table, overall status
 *   Part 2 — Remarks table: NG parameters with description, notes, image thumbnails
 *   Part 3 — Attachment: pages from the original PDF appended
 */

const fs   = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb, PageSizes } = require('pdf-lib');
const { prisma }  = require('../config/prisma');
const logger      = require('../config/logger');
const { STORAGE_PATH } = require('../middleware/upload');

const MARGIN  = 50;
const LINE_H  = 18;
const FONT_SM = 9;
const FONT_MD = 11;
const FONT_LG = 14;
const FONT_XL = 18;

/**
 * Generate report PDF and return its path
 */
async function generate(formId, document) {
  const form = await prisma.labelCheckForm.findUnique({
    where:   { id: formId },
    include: {
      checker: { select: { name: true } },
      results: {
        orderBy:  { parameter: { orderIndex: 'asc' } },
        include: {
          parameter: true,
          remarks:   true,
        },
      },
    },
  });

  if (!form) throw new Error('Label check form not found: ' + formId);

  const pdfDoc   = await PDFDocument.create();
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const A4       = PageSizes.A4; // [595.28, 841.89]

  // ─── Part 1: Summary ─────────────────────────────────────────────
  await drawSummaryPage(pdfDoc, fontReg, fontBold, form, document, A4);

  // ─── Part 2: Remarks (only if NG exists) ──────────────────────────
  const ngResults = form.results.filter(r => r.status === 'NG');
  if (ngResults.length > 0) {
    await drawRemarksPages(pdfDoc, fontReg, fontBold, ngResults, A4);
  }

  // ─── Part 3: Append original PDF pages ────────────────────────────
  if (document.pathOriginal && fs.existsSync(document.pathOriginal)) {
    const origBytes  = fs.readFileSync(document.pathOriginal);
    const origDoc    = await PDFDocument.load(origBytes);
    const copiedPages = await pdfDoc.copyPages(origDoc, origDoc.getPageIndices());
    copiedPages.forEach(p => pdfDoc.addPage(p));
  }

  // Save
  const docStorageDir  = path.join(STORAGE_PATH, 'documents', document.id);
  fs.mkdirSync(docStorageDir, { recursive: true });
  const reportPath     = path.join(docStorageDir, 'label_check_report.pdf');
  const pdfBytes       = await pdfDoc.save();
  fs.writeFileSync(reportPath, pdfBytes);

  logger.info(`Label check report generated: ${reportPath}`);
  return reportPath;
}

// ─── Helper: draw text with auto newline ──────────────────────────
function drawText(page, text, x, y, font, size, color = rgb(0,0,0), maxWidth) {
  if (!maxWidth) {
    page.drawText(String(text), { x, y, font, size, color });
    return y - LINE_H;
  }
  // Simple word-wrap
  const words = String(text).split(' ');
  let line = '';
  let cy   = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      page.drawText(line, { x, y: cy, font, size, color });
      cy   -= LINE_H;
      line  = word;
    } else {
      line = test;
    }
  }
  if (line) {
    page.drawText(line, { x, y: cy, font, size, color });
    cy -= LINE_H;
  }
  return cy;
}

// ─── Part 1: Summary page ─────────────────────────────────────────
async function drawSummaryPage(pdfDoc, fontReg, fontBold, form, document, A4) {
  const [pageW, pageH] = A4;
  const page = pdfDoc.addPage(A4);
  let y = pageH - MARGIN;

  // Title
  page.drawText('LAPORAN PENGECEKAN LABEL DESIGN', {
    x: MARGIN, y, font: fontBold, size: FONT_XL, color: rgb(0.1, 0.1, 0.5),
  });
  y -= 30;

  // Header info box
  const headerData = [
    ['ID Regulatory',  document.regulatoryId],
    ['Nama Produk',    document.labelName],
    ['Tanggal Terima', fmtDate(document.tanggalTerima)],
    ['Tanggal Periksa',fmtDate(document.tanggalPeriksa)],
    ['Diperiksa Oleh', form.checker.name],
    ['Tanggal Laporan', fmtDate(new Date())],
    ['Overall Status', form.overallStatus || '-'],
  ];

  for (const [label, val] of headerData) {
    page.drawText(`${label}:`, { x: MARGIN, y, font: fontBold, size: FONT_MD });
    page.drawText(String(val), { x: MARGIN + 160, y, font: fontReg, size: FONT_MD,
      color: val === 'NOT_OK' ? rgb(0.8,0,0) : val === 'OK' ? rgb(0,0.6,0) : rgb(0,0,0) });
    y -= LINE_H + 2;
  }

  y -= 10;
  // Divider
  page.drawLine({ start:{x:MARGIN,y}, end:{x:pageW-MARGIN,y}, thickness:1, color:rgb(0.7,0.7,0.7) });
  y -= 20;

  // Parameter table header
  page.drawText('HASIL PENGECEKAN PARAMETER', { x:MARGIN, y, font:fontBold, size:FONT_LG });
  y -= 20;

  // Table
  const col1W = 360;
  const col2W = 80;
  // Header row
  page.drawRectangle({ x:MARGIN, y:y-2, width:pageW-2*MARGIN, height:LINE_H+4, color:rgb(0.85,0.85,0.95) });
  page.drawText('Parameter', { x:MARGIN+4, y:y+2, font:fontBold, size:FONT_MD });
  page.drawText('Status',    { x:MARGIN+col1W+4, y:y+2, font:fontBold, size:FONT_MD });
  y -= LINE_H + 4;

  let okCount = 0, ngCount = 0;
  for (const result of form.results) {
    const bgColor = result.status === 'NG' ? rgb(1,0.92,0.92) : rgb(0.93,1,0.93);
    page.drawRectangle({ x:MARGIN, y:y-2, width:pageW-2*MARGIN, height:LINE_H+2, color:bgColor });
    page.drawText(result.parameter.name, { x:MARGIN+4, y:y+1, font:fontReg, size:FONT_MD });
    page.drawText(result.status, {
      x: MARGIN+col1W+4, y:y+1, font:fontBold, size:FONT_MD,
      color: result.status === 'NG' ? rgb(0.8,0,0) : rgb(0,0.6,0),
    });
    y -= LINE_H + 2;
    if (result.status === 'OK') okCount++; else ngCount++;

    if (y < MARGIN + 60) {
      // New page if running out of space
      const newPage = pdfDoc.addPage(A4);
      y = A4[1] - MARGIN;
    }
  }

  // Summary row
  y -= 10;
  page.drawText(`Total OK: ${okCount}   Total NG: ${ngCount}   Overall: ${form.overallStatus || '-'}`, {
    x: MARGIN, y, font: fontBold, size: FONT_MD,
    color: ngCount > 0 ? rgb(0.8,0,0) : rgb(0,0.6,0),
  });
}

// ─── Part 2: Remarks pages ────────────────────────────────────────
async function drawRemarksPages(pdfDoc, fontReg, fontBold, ngResults, A4) {
  const [pageW, pageH] = A4;
  let page = pdfDoc.addPage(A4);
  let y    = pageH - MARGIN;

  page.drawText('TABEL REMARKS', { x:MARGIN, y, font:fontBold, size:FONT_XL, color:rgb(0.1,0.1,0.5) });
  y -= 30;

  let no = 1;
  for (const result of ngResults) {
    for (const remark of result.remarks) {
      if (y < MARGIN + 150) {
        page = pdfDoc.addPage(A4);
        y    = pageH - MARGIN;
      }

      // Remark block
      page.drawRectangle({ x:MARGIN, y:y-2, width:pageW-2*MARGIN, height:LINE_H, color:rgb(0.9,0.9,1) });
      page.drawText(`${no}. ${result.parameter.name}`, { x:MARGIN+4, y:y+2, font:fontBold, size:FONT_MD });
      y -= LINE_H + 4;

      page.drawText('Deskripsi Masalah:', { x:MARGIN+10, y, font:fontBold, size:FONT_SM });
      y -= LINE_H;
      y = drawText(page, remark.description, MARGIN+20, y, fontReg, FONT_SM, rgb(0,0,0), pageW-2*MARGIN-20);
      y -= 4;

      page.drawText('Catatan Perbaikan:', { x:MARGIN+10, y, font:fontBold, size:FONT_SM });
      y -= LINE_H;
      y = drawText(page, remark.remarksText, MARGIN+20, y, fontReg, FONT_SM, rgb(0,0,0), pageW-2*MARGIN-20);
      y -= 4;

      // Image thumbnail (embed if exists)
      if (remark.imagePath && fs.existsSync(remark.imagePath)) {
        try {
          const imgBytes = fs.readFileSync(remark.imagePath);
          const ext      = path.extname(remark.imagePath).toLowerCase();
          const img      = ext === '.png'
            ? await pdfDoc.embedPng(imgBytes)
            : await pdfDoc.embedJpg(imgBytes);

          const thumbW  = 120;
          const thumbH  = (img.height / img.width) * thumbW;

          if (y - thumbH < MARGIN) {
            page = pdfDoc.addPage(A4);
            y    = pageH - MARGIN;
          }

          page.drawText('Gambar:', { x:MARGIN+10, y, font:fontBold, size:FONT_SM });
          y -= thumbH + 4;
          page.drawImage(img, { x:MARGIN+20, y, width:thumbW, height:thumbH });
          y -= 10;
        } catch (imgErr) {
          logger.warn('Could not embed remark image:', imgErr.message);
        }
      }

      y -= 14;
      page.drawLine({ start:{x:MARGIN,y}, end:{x:pageW-MARGIN,y}, thickness:0.5, color:rgb(0.8,0.8,0.8) });
      y -= 10;
      no++;
    }
  }
}

function fmtDate(d) {
  if (!d) return '-';
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`;
}

module.exports = { generate };
