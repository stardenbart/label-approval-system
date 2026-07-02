// backend/src/services/product-import-export.service.js
'use strict';

/**
 * Product Category Import/Export (Excel .xlsx)
 *
 * Behavior confirmed with requester (2026-07-02):
 *   - Format: .xlsx only.
 *   - Import is UPSERT-ONLY: rows in the DB that are NOT present in the
 *     uploaded file are left untouched (never deactivated or deleted).
 *   - Matching key: `productCode` (case-insensitive — normalized to
 *     uppercase before comparing/writing, matching the unique DB constraint
 *     added in migration 20260702000000_uploader_role_footer_import).
 *
 * Column layout (export produces this; import expects this):
 *   A: Group Code      (must match an existing product_groups.code)
 *   B: Category Name
 *   C: Sub Group       (optional, blank allowed)
 *   D: Product Code    (5 characters, unique — the upsert key)
 *   E: Active          (TRUE/FALSE, defaults to TRUE if blank)
 *
 * Design note: import is row-independent and partial-success by design — one
 * bad row (unknown group code, malformed product code) is reported as an
 * error for that row only, and does not block the other valid rows in the
 * same file. This matches how the rest of this codebase treats bulk
 * operations (e.g. seed.js uses per-row upsert, not all-or-nothing).
 */

const XLSX = require('xlsx');
const { prisma } = require('../config/prisma');

const HEADER = ['Group Code', 'Category Name', 'Sub Group', 'Product Code', 'Active'];

function normalizeProductCode(raw) {
  return String(raw || '').trim().toUpperCase();
}

function parseActive(raw) {
  if (raw === undefined || raw === null || raw === '') return true;
  const s = String(raw).trim().toLowerCase();
  return !['false', '0', 'no', 'n', 'tidak', 'inactive'].includes(s);
}

/**
 * Export all product categories (including inactive ones — the export is
 * meant as a full round-trippable snapshot, not just what's currently active)
 * as an .xlsx buffer.
 */
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

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Import categories from an .xlsx buffer. Upsert-only by productCode.
 * Returns { created, updated, errors: [{ row, message }] }.
 */
async function importFromExcel(fileBuffer) {
  let workbook;
  try {
    workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  } catch (e) {
    const err = new Error('File is not a valid .xlsx workbook');
    err.status = 400;
    err.code = 'INVALID_FILE_TYPE';
    throw err;
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (rawRows.length === 0) {
    const err = new Error('Excel file has no data rows');
    err.status = 400;
    err.code = 'EMPTY_FILE';
    throw err;
  }
  if (rawRows.length > 5000) {
    const err = new Error('Import is limited to 5000 rows per file');
    err.status = 400;
    err.code = 'TOO_MANY_ROWS';
    throw err;
  }

  // Pre-load groups once (small table) instead of a query per row.
  const groups = await prisma.productGroup.findMany();
  const groupByCode = new Map(groups.map(g => [g.code.toUpperCase(), g]));

  let created = 0;
  let updated = 0;
  const errors = [];

  // Sequential, not Promise.all: keeps error reporting deterministic
  // (row N failing shouldn't race with row N+1's DB write) and avoids
  // opening 5000 concurrent DB connections.
  for (let i = 0; i < rawRows.length; i++) {
    const excelRowNumber = i + 2; // +1 for 0-index, +1 for header row
    const row = rawRows[i];

    const groupCode    = String(row['Group Code'] || '').trim().toUpperCase();
    const name          = String(row['Category Name'] || '').trim();
    const subGroupRaw   = row['Sub Group'];
    const subGroup      = subGroupRaw ? String(subGroupRaw).trim() : null;
    const productCode   = normalizeProductCode(row['Product Code']);
    const isActive       = parseActive(row['Active']);

    if (!name) {
      errors.push({ row: excelRowNumber, message: 'Category Name is required' });
      continue;
    }
    if (productCode.length > 100) {
      errors.push({ row: excelRowNumber, message: `Product Code must not exceed 100 characters (got "${productCode}")` });
      continue;
    }
    const group = groupByCode.get(groupCode);
    if (!group) {
      errors.push({ row: excelRowNumber, message: `Unknown Group Code "${row['Group Code']}" — create the group first` });
      continue;
    }

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
    } catch (e) {
      errors.push({ row: excelRowNumber, message: e.message || 'Unknown error writing this row' });
    }
  }

  return { created, updated, errors, totalRows: rawRows.length };
}

module.exports = { exportToExcel, importFromExcel };
