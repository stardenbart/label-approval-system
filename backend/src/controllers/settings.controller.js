// backend/src/controllers/settings.controller.js
'use strict';

const Joi    = require('joi');
const { prisma } = require('../config/prisma');
const auditService = require('../services/audit.service');

const DEFAULTS = {
  qr_default_width_pt:  '100',
  qr_default_height_pt: '100',
  qr_default_page:      '1',
  qr_default_x_percent: '85',
  qr_default_y_percent: '5',
  qr_min_width_pt:      '60',
  qr_max_width_pt:      '200',
};

exports.getAll = async (req, res, next) => {
  try {
    const rows = await prisma.systemSetting.findMany();
    const data = Object.fromEntries(rows.map(r => [r.key, r.value]));
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const schema = Joi.object({
      qr_default_width_pt:  Joi.number().min(60).max(200),
      qr_default_height_pt: Joi.number().min(60).max(200),
      qr_default_page:      Joi.number().integer().min(1),
      qr_default_x_percent: Joi.number().min(0).max(100),
      qr_default_y_percent: Joi.number().min(0).max(100),
      qr_min_width_pt:      Joi.number().min(20).max(100),
      qr_max_width_pt:      Joi.number().min(100).max(400),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });

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
