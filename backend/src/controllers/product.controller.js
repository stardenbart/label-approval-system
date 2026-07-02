// backend/src/controllers/product.controller.js
'use strict';

const Joi    = require('joi');
const { prisma } = require('../config/prisma');
const auditService = require('../services/audit.service');

exports.listGroups = async (req, res, next) => {
  try {
    const groups = await prisma.productGroup.findMany({ orderBy: { name: 'asc' } });
    res.json({ success: true, data: groups });
  } catch (err) { next(err); }
};

exports.createGroup = async (req, res, next) => {
  try {
    const { error, value } = Joi.object({
      name: Joi.string().max(100).required(),
      code: Joi.string().max(10).uppercase().required(),
    }).validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });

    const group = await prisma.productGroup.create({ data: value });
    res.status(201).json({ success: true, data: group });
  } catch (err) { next(err); }
};

exports.updateGroup = async (req, res, next) => {
  try {
    const { error, value } = Joi.object({
      name:     Joi.string().max(100),
      isActive: Joi.boolean(),
    }).validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });

    const updated = await prisma.productGroup.update({ where: { id: parseInt(req.params.id) }, data: value });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
};

exports.deleteGroup = async (req, res, next) => {
  try {
    const docs = await prisma.document.count({
      where: { productCategory: { groupId: parseInt(req.params.id) }, deletedAt: null },
    });
    if (docs > 0) return res.status(400).json({ success: false, message: 'Group has associated documents. Deactivate instead.' });

    await prisma.productGroup.update({ where: { id: parseInt(req.params.id) }, data: { isActive: false } });
    res.json({ success: true, message: 'Group deactivated' });
  } catch (err) { next(err); }
};

exports.listCategories = async (req, res, next) => {
  try {
    const cats = await prisma.productCategory.findMany({
      include: { group: true },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: cats });
  } catch (err) { next(err); }
};

exports.createCategory = async (req, res, next) => {
  try {
    const { error, value } = Joi.object({
      groupId:     Joi.number().integer().required(),
      name:        Joi.string().max(150).required(),
      subGroup:    Joi.string().max(100).allow(null,''),
      productCode: Joi.string().length(100).required(),
    }).validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });

    // productCode drives regulatoryId generation (id-generator.service.js) and
    // is unique in the DB (see migration 20260702000000) — normalize case here
    // so 'cyd01' and 'CYD01' are treated as the same product identity even
    // before hitting the DB constraint.
    value.productCode = value.productCode.toUpperCase();

    const dup = await prisma.productCategory.findFirst({ where: { productCode: value.productCode } });
    if (dup) {
      return res.status(409).json({
        success: false,
        message: `Product code "${value.productCode}" is already used by "${dup.name}". Product code must be unique.`,
        code:    'DUPLICATE_PRODUCT_CODE',
      });
    }

    const cat = await prisma.productCategory.create({ data: value });
    res.status(201).json({ success: true, data: cat });
  } catch (err) { next(err); }
};

exports.updateCategory = async (req, res, next) => {
  try {
    const { error, value } = Joi.object({
      name:     Joi.string().max(150),
      subGroup: Joi.string().max(100).allow(null,''),
      isActive: Joi.boolean(),
    }).validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });

    const updated = await prisma.productCategory.update({ where: { id: parseInt(req.params.id) }, data: value });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
};

exports.deleteCategory = async (req, res, next) => {
  try {
    const docs = await prisma.document.count({
      where: { productCategoryId: parseInt(req.params.id), deletedAt: null },
    });
    if (docs > 0) return res.status(400).json({ success: false, message: 'Category has associated documents. Deactivate instead.' });

    await prisma.productCategory.update({ where: { id: parseInt(req.params.id) }, data: { isActive: false } });
    res.json({ success: true, message: 'Category deactivated' });
  } catch (err) { next(err); }
};

// ─── Import / Export (Excel) ────────────────────────────────────────────────
const importExportService = require('../services/product-import-export.service');

exports.exportCategories = async (req, res, next) => {
  try {
    const buffer = await importExportService.exportToExcel();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="product_categories_export.xlsx"`);
    res.send(buffer);
  } catch (err) { next(err); }
};

exports.importCategories = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Excel file (.xlsx) is required', code: 'FILE_MISSING' });
    }
    const result = await importExportService.importFromExcel(req.file.buffer);

    await auditService.log(req.user.id, 'PRODUCT_CATEGORIES_IMPORTED', 'product_categories', null, req.ip, {
      created: result.created, updated: result.updated, errorCount: result.errors.length,
    });

    // 207-style partial-success response: import always reports what happened
    // per row rather than all-or-nothing, since a single bad row (unknown
    // group code, missing productCode) shouldn't block the valid rows.
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};
