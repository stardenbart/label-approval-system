// backend/src/controllers/settings.controller.js
'use strict';

const Joi    = require('joi');
const { prisma } = require('../config/prisma');
const auditService = require('../services/audit.service');
const { SETTING_DEFAULTS, QR_SIZE_LIMIT_PT, QR_SIZE_ADVISORY_MIN_PT } = require('../config/stamp');

const DEFAULTS = SETTING_DEFAULTS;

exports.getAll = async (req, res, next) => {
  try {
    const rows = await prisma.systemSetting.findMany();
    const data = Object.fromEntries(rows.map(r => [r.key, r.value]));

    // Batas teknis ikut dikirim supaya frontend tidak perlu menyalin angkanya
    // sendiri — dulu form System Settings dan kanvas e-sign masing-masing punya
    // min/max hardcoded yang diam-diam berbeda dari server.
    data.limits = {
      qrMinPt:        QR_SIZE_LIMIT_PT.min,
      qrMaxPt:        QR_SIZE_LIMIT_PT.max,
      qrAdvisoryMinPt: QR_SIZE_ADVISORY_MIN_PT,
    };

    res.json({ success: true, data });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const schema = Joi.object({
      qr_default_width_pt:  Joi.number().min(QR_SIZE_LIMIT_PT.min).max(QR_SIZE_LIMIT_PT.max),
      qr_default_height_pt: Joi.number().min(QR_SIZE_LIMIT_PT.min).max(QR_SIZE_LIMIT_PT.max),
      qr_default_page:      Joi.number().integer().min(1),
      qr_default_x_percent: Joi.number().min(0).max(100),
      qr_default_y_percent: Joi.number().min(0).max(100),
      qr_min_width_pt:      Joi.number().min(QR_SIZE_LIMIT_PT.min).max(QR_SIZE_LIMIT_PT.max),
      qr_max_width_pt:      Joi.number().min(QR_SIZE_LIMIT_PT.min).max(QR_SIZE_LIMIT_PT.max),
      footer_default_x_percent: Joi.number().min(0).max(100),
      footer_default_y_percent: Joi.number().min(0).max(100),
      footer_default_width_pt:  Joi.number().min(50).max(400),
      footer_default_height_pt: Joi.number().min(15).max(100),
      footer_default_page:      Joi.number().integer().min(1),
      footer_default_font_size: Joi.number().min(5).max(24),
      footer_default_rotation:  Joi.number().valid(0, 90, 180, 270),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });

    // Rentang kebijakan harus tetap masuk akal terhadap dirinya sendiri. Nilai
    // yang tidak dikirim diambil dari yang tersimpan, supaya mengubah salah satu
    // saja tetap tervalidasi terhadap pasangannya.
    const stored  = Object.fromEntries((await prisma.systemSetting.findMany()).map(r => [r.key, r.value]));
    const num     = (k) => parseFloat(value[k] ?? stored[k] ?? DEFAULTS[k]);
    const minW    = num('qr_min_width_pt');
    const maxW    = num('qr_max_width_pt');
    if (minW > maxW) {
      return res.status(400).json({
        success: false,
        message: `Minimum width (${minW}pt) tidak boleh lebih besar dari maximum width (${maxW}pt)`,
      });
    }
    for (const k of ['qr_default_width_pt', 'qr_default_height_pt']) {
      const v = num(k);
      if (v < minW || v > maxW) {
        return res.status(400).json({
          success: false,
          message: `${k} (${v}pt) harus berada di antara minimum ${minW}pt dan maximum ${maxW}pt`,
        });
      }
    }

    for (const [key, val] of Object.entries(value)) {
      await prisma.systemSetting.upsert({
        where:  { key },
        create: { key, value: String(val) },
        update: { value: String(val) },
      });
    }

    await auditService.log(req.user.id, 'SETTINGS_UPDATED', 'system_settings', null, req.ip, value);
    res.json({ success: true, message: 'Settings updated' });
  } catch (err) { next(err); }
};

exports.resetToDefaults = async (req, res, next) => {
  try {
    for (const [key, value] of Object.entries(DEFAULTS)) {
      await prisma.systemSetting.upsert({
        where:  { key },
        create: { key, value },
        update: { value },
      });
    }
    await auditService.log(req.user.id, 'SETTINGS_RESET', 'system_settings', null, req.ip);
    res.json({ success: true, message: 'Settings reset to defaults' });
  } catch (err) { next(err); }
};
