// backend/src/controllers/labelcheck.controller.js
'use strict';

const path   = require('path');
const fs     = require('fs');
const Joi    = require('joi');
const { prisma }       = require('../config/prisma');
const auditService     = require('../services/audit.service');
const reportService    = require('../services/label-check-report.service');
const { STORAGE_PATH, IMG_TMP } = require('../middleware/upload');

// ─── Parameters ───────────────────────────────────────────────────
exports.listParameters = async (req, res, next) => {
  try {
    const params = await prisma.labelCheckParameter.findMany({
      where:   { isActive: true },
      orderBy: { orderIndex: 'asc' },
    });
    res.json({ success: true, data: params });
  } catch (err) { next(err); }
};

exports.createParameter = async (req, res, next) => {
  try {
    const { error, value } = Joi.object({
      name:        Joi.string().max(200).required(),
      description: Joi.string().allow('',null),
      isRequired:  Joi.boolean().default(true),
      orderIndex:  Joi.number().integer().default(0),
    }).validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });

    const param = await prisma.labelCheckParameter.create({ data: value });
    res.status(201).json({ success: true, data: param });
  } catch (err) { next(err); }
};

exports.updateParameter = async (req, res, next) => {
  try {
    const { error, value } = Joi.object({
      name:        Joi.string().max(200),
      description: Joi.string().allow('',null),
      isRequired:  Joi.boolean(),
      orderIndex:  Joi.number().integer(),
      isActive:    Joi.boolean(),
    }).validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });

    const updated = await prisma.labelCheckParameter.update({ where: { id: parseInt(req.params.id) }, data: value });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
};

exports.deleteParameter = async (req, res, next) => {
  try {
    await prisma.labelCheckParameter.update({ where: { id: parseInt(req.params.id) }, data: { isActive: false } });
    res.json({ success: true, message: 'Parameter deactivated' });
  } catch (err) { next(err); }
};

// ─── Form ─────────────────────────────────────────────────────────
exports.getForm = async (req, res, next) => {
  try {
    const form = await prisma.labelCheckForm.findFirst({
      where: { documentId: req.params.documentId },
      include: {
        results: {
          include: {
            parameter: true,
            remarks:   true,
          },
        },
        checker: { select: { id:true, name:true } },
      },
    });
    res.json({ success: true, data: form });
  } catch (err) { next(err); }
};

exports.saveForm = async (req, res, next) => {
  try {
    const schema = Joi.object({
      results: Joi.array().items(Joi.object({
        parameterId: Joi.number().integer().required(),
        status:      Joi.string().valid('OK','NG').required(),
      })).required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });

    const docId = req.params.documentId;
    const doc   = await prisma.document.findFirst({ where: { id: docId, deletedAt: null } });
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });

    // Upsert form
    let form = await prisma.labelCheckForm.findFirst({ where: { documentId: docId } });
    if (!form) {
      form = await prisma.labelCheckForm.create({
        data: { documentId: docId, checkedBy: req.user.id },
      });
    }

    // Upsert results
    for (const r of value.results) {
      await prisma.labelCheckResult.upsert({
        where:  { uq_form_parameter: { formId: form.id, parameterId: r.parameterId } },
        create: { formId: form.id, parameterId: r.parameterId, status: r.status },
        update: { status: r.status },
      });
    }

    res.json({ success: true, data: { formId: form.id } });
  } catch (err) { next(err); }
};

exports.submitForm = async (req, res, next) => {
  try {
    const form = await prisma.labelCheckForm.findFirst({
      where: { documentId: req.params.documentId },
      include: { results: true },
    });
    if (!form) return res.status(404).json({ success: false, message: 'Form not found' });

    const hasNG = form.results.some(r => r.status === 'NG');
    const overallStatus = hasNG ? 'NOT_OK' : 'OK';

    // If NG, check all have remarks
    if (hasNG) {
      for (const r of form.results.filter(r => r.status === 'NG')) {
        const remark = await prisma.labelCheckRemark.findFirst({ where: { resultId: r.id } });
        if (!remark) return res.status(400).json({
          success: false,
          message: `Parameter NG belum memiliki remarks. Harap isi semua remarks sebelum submit.`,
        });
      }
    }

    await prisma.labelCheckForm.update({
      where: { id: form.id },
      data:  { overallStatus, submittedAt: new Date() },
    });

    // Generate PDF report
    const doc = await prisma.document.findUnique({ where: { id: req.params.documentId } });
    const reportPath = await reportService.generate(form.id, doc);

    await prisma.document.update({
      where: { id: req.params.documentId },
      data:  { pathCheckReport: reportPath },
    });

    await auditService.log(req.user.id, 'LABEL_CHECK_SUBMITTED', 'documents', req.params.documentId, req.ip);

    res.json({ success: true, message: 'Form submitted and report generated' });
  } catch (err) { next(err); }
};

exports.uploadRemarkImage = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Image required' });

    const result = await prisma.labelCheckResult.findFirst({
      where: { id: req.params.resultId },
      include: { form: { include: { document: true } } },
    });
    if (!result) return res.status(404).json({ success: false, message: 'Result not found' });

    const docId     = result.form.documentId;
    const remarksDir = path.join(STORAGE_PATH, 'documents', docId, 'remarks');
    fs.mkdirSync(remarksDir, { recursive: true });

    const ext      = path.extname(req.file.originalname).toLowerCase();
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
    const destPath = path.join(remarksDir, fileName);
    fs.renameSync(req.file.path, destPath);

    const remark = await prisma.labelCheckRemark.create({
      data: {
        resultId:      result.id,
        description:   req.body.description || '',
        remarksText:   req.body.remarksText || '',
        imagePath:     destPath,
        imageFilename: req.file.originalname,
      },
    });

    res.status(201).json({ success: true, data: remark });
  } catch (err) { next(err); }
};

// ─── Serve remark image (authenticated) ──────────────────────────
exports.serveRemarkImage = async (req, res, next) => {
  try {
    const remark = await prisma.labelCheckRemark.findFirst({
      where:   { id: req.params.remarkId },
      include: { result: { include: { form: { include: { document: true } } } } },
    });

    if (!remark) return res.status(404).json({ success: false, message: 'Remark not found' });

    // Check user has access to the parent document
    const doc = remark.result.form.document;
    if (req.user.role === 'viewer' && doc.status !== 'APPROVED') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (!remark.imagePath || !require('fs').existsSync(remark.imagePath)) {
      return res.status(404).json({ success: false, message: 'Image file not found' });
    }

    const ext      = require('path').extname(remark.imagePath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(require('path').resolve(remark.imagePath));
  } catch (err) { next(err); }
};
