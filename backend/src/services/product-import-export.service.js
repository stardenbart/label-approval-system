// backend/src/services/product-import-export.service.js
'use strict';

/**
 * Product Category Import/Export (Excel .xlsx)
 *
 * Behavior:
 *   - Format: .xlsx only.
 *   - Import is UPSERT-ONLY: rows in the DB not present in the file are left untouched.
 *   - Matching key: productCode (normalized to uppercase).
 *   - NEW: if a Group Code in column A does not exist in the DB,
 *     the group is automatically created (name = code, editable via UI after).
 *
 * Column layout:
 *   A: Group Code      (existing OR new — auto-created if not found)
 *   B: Category Name
 *   C: Sub Group       (optional)
 *   D: Product Code    (upsert key, case-insensitive)
 *   E: Active          (TRUE/FALSE, defaults TRUE if blank)
 *
 * Return: { created, updated, groupsAutoCreated, newGroupCodes, errors, totalRows }
 */

const XLSX   = require('xlsx');
const { prisma } = require('../config/prisma');
const logger     = require('../config/logger');

const HEADER = ['Group Code', 'Category Name', 'Sub Group', 'Product Code', 'Active'];

function normalizeCode(raw) {
  return String(raw || '').trim().toUpperCase();
}

function parseActive(raw) {
  if (raw === undefined || raw === null || raw === '') return true;
  const s = String(raw).trim().toLowerCase();
  return !['false', '0', 'no', 'n', 'tidak', 'inactive'].includes(s);
}

// ─── Export ───────────────────────────────────────────────────────
async function exportToExcel() {
  const categories = await prisma.productCategory.findMany({
    include: { group: true },
    orderBy: [{ group: { name: 'asc' } }, { name: 'asc' }],
  });

  const rows = categories.map(c => ({
    'Group Code':    c.group.code,
    'Category Name': c.name,
    'Sub Group':     c.subGroup || '',
    'Product Code':  c.productCode,
    'Active':        c.isActive,
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows, { header: HEADER });
  worksheet['!cols'] = [{ wch: 14 }, { wch: 30 }, { wch: 18 }, { wch: 14 }, { wch: 10 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Product Categories');

  // Instruction sheet
  const instructions = [
    ['PETUNJUK IMPORT / EXPORT'],
    [''],
    ['• Group Code baru otomatis dibuat jika belum ada di database.'],
    ['  Nama grup = kode itu sendiri — ubah nama via UI setelah import.'],
    ['• Import bersifat UPSERT-ONLY: data lama yang tidak ada di file tetap ada.'],
    ['• Matching key: Product Code (case-insensitive).'],
    ['• Kolom Active: TRUE/FALSE atau Y/N. Kosong = TRUE.'],
    ['• Baris dengan Category Name kosong diabaikan otomatis.'],
    ['• Maksimal 5000 baris per file.'],
  ];
  const wsInfo = XLSX.utils.aoa_to_sheet(instructions);
  wsInfo['!cols'] = [{ wch: 70 }];
  XLSX.utils.book_append_sheet(workbook, wsInfo, 'Petunjuk');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

// ─── Import ───────────────────────────────────────────────────────
async function importFromExcel(fileBuffer) {
  let workbook;
  try {
    workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  } catch {
    const err = new Error('File is not a valid .xlsx workbook');
    err.status = 400; err.code = 'INVALID_FILE_TYPE'; throw err;
  }

  const sheet   = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (rawRows.length === 0) {
    const err = new Error('Excel file has no data rows');
    err.status = 400; err.code = 'EMPTY_FILE'; throw err;
  }
  if (rawRows.length > 5000) {
    const err = new Error('Import is limited to 5000 rows per file');
    err.status = 400; err.code = 'TOO_MANY_ROWS'; throw err;
  }

  // Pre-load existing groups (small table, load once)
  const existingGroups = await prisma.productGroup.findMany();
  const groupByCode    = new Map(existingGroups.map(g => [g.code.toUpperCase(), g]));

  let created           = 0;
  let updated           = 0;
  let groupsAutoCreated = 0;
  const newGroupCodes   = [];
  const errors          = [];

  for (let i = 0; i < rawRows.length; i++) {
    const excelRow    = i + 2;
    const row         = rawRows[i];
    const groupCode   = normalizeCode(row['Group Code']);
    const name        = String(row['Category Name'] || '').trim();
    const subGroup    = String(row['Sub Group'] || '').trim() || null;
    const productCode = normalizeCode(row['Product Code']);
    const isActive    = parseActive(row['Active']);

    // Skip blank rows silently
    if (!name) continue;

    // Validation
    if (!groupCode) {
      errors.push({ row: excelRow, message: 'Group Code must be filled' });
      continue;
    }
    if (!productCode) {
      errors.push({ row: excelRow, message: 'Product Code must be filled' });
      continue;
    }
    if (productCode.length > 100) {
      errors.push({ row: excelRow, message: 'Product Code is too long (max 100 characters): "' + productCode + '"' });
      continue;
    }

    // Auto-create group if not found
    let group = groupByCode.get(groupCode);
    if (!group) {
      try {
        group = await prisma.productGroup.create({
          data: { code: groupCode, name: groupCode, isActive: true },
        });
        groupByCode.set(groupCode, group);
        groupsAutoCreated++;
        newGroupCodes.push(groupCode);
        logger.info('[import] Auto-created product group: ' + groupCode);
      } catch (createErr) {
        // Race condition: handle unique constraint violation (P2002)
        if (createErr.code === 'P2002') {
          const refreshed = await prisma.productGroup.findFirst({ where: { code: groupCode } });
          if (refreshed) { group = refreshed; groupByCode.set(groupCode, group); }
          else { errors.push({ row: excelRow, message: 'Failed to create group "' + groupCode + '": ' + createErr.message }); continue; }
        } else {
          errors.push({ row: excelRow, message: 'Failed to create group "' + groupCode + '": ' + createErr.message });
          continue;
        }
      }
    }

    // Upsert category by productCode
    try {
      const existing = await prisma.productCategory.findFirst({ where: { productCode } });
      if (existing) {
        await prisma.productCategory.update({
          where: { id: existing.id },
          data:  { groupId: group.id, name, subGroup, isActive },
        });
        updated++;
      } else {
        await prisma.productCategory.create({
          data: { groupId: group.id, name, subGroup, productCode, isActive },
        });
        created++;
      }
    } catch (dbErr) {
      errors.push({ row: excelRow, message: dbErr.message || 'Unknown error writing this row' });
    }
  }

  logger.info(
    '[import] done — ' + created + ' created, ' + updated + ' updated, ' +
    groupsAutoCreated + ' groups auto-created, ' + errors.length + ' errors'
  );

  return { created, updated, groupsAutoCreated, newGroupCodes, errors, totalRows: rawRows.length };
}

module.exports = { exportToExcel, importFromExcel };
