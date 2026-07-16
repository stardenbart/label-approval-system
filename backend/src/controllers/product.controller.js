// backend/src/controllers/product.controller.js
'use strict';

const Joi    = require('joi');
const { prisma }     = require('../config/prisma');
const importExport   = require('../services/product-import-export.service');
const logger         = require('../config/logger');

// ─── Groups ───────────────────────────────────────────────────────
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

// ─── Categories ───────────────────────────────────────────────────
exports.listCategories = async (req, res, next) => {
  try {
    const cats = await prisma.productCategory.findMany({
      include: { group: true }, orderBy: { name: 'asc' },
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
      productCode: Joi.string().min(1).max(50).required(),
    }).validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });
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

// ─── Export ───────────────────────────────────────────────────────
exports.exportExcel = async (req, res, next) => {
  try {
    const buffer = await importExport.exportToExcel();
    const now    = new Date();
    const stamp  = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    res.setHeader('Content-Type',        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="produk_dal_${stamp}.xlsx"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(buffer);
  } catch (err) { next(err); }
};

// ─── Import ───────────────────────────────────────────────────────
exports.importExcel = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'File Excel (.xlsx) wajib diupload', code: 'FILE_MISSING' });

    const buffer = req.file.buffer;
    const result = await importExport.importFromExcel(buffer);

    const nothingDone = result.created === 0 && result.updated === 0;
    if (result.errors.length > 0 && nothingDone) {
      return res.status(422).json({
        success: false,
        message: 'Import failed — no data was successfully processed. Check data.errors for details..',
        data:    result,
      });
    }

    const parts = [];
    if (result.groupsAutoCreated > 0) parts.push(result.groupsAutoCreated + ' new group created');
    parts.push(result.created + ' new category, ' + result.updated + ' updated');
    if (result.errors.length > 0) parts.push(result.errors.length + ' error');

    res.json({
      success: true,
      message: 'Import finish: ' + parts.join(', ') + '.',
      data:    result,
    });
  } catch (err) {
    if (err.code === 'INVALID_FILE_TYPE' || err.code === 'EMPTY_FILE' || err.code === 'TOO_MANY_ROWS') {
      return res.status(err.status || 400).json({ success: false, message: err.message, code: err.code });
    }
    next(err);
  }
};