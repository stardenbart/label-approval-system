// backend/src/controllers/user.controller.js
'use strict';

const bcrypt = require('bcrypt');
const crypto = require('crypto');
const Joi    = require('joi');
const { prisma }        = require('../config/prisma');
const auditService      = require('../services/audit.service');
const emailService      = require('../services/email.service');
const notifService      = require('../services/notification.service');
const { resolveLevel0Approver } = require('../services/approver-resolution.service');
const { MAX_APPROVAL_LEVEL }    = require('../services/pdf.service');

// Single source of truth for the UserRole enum in schema.prisma. Kept in one
// place because create() and update() previously drifted: 'uploader' was valid
// on create but missing on update, so an uploader could be created and then
// never edited again.
const USER_ROLES = ['superadmin', 'admin', 'approver', 'viewer', 'uploader'];

exports.list = async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      select: { id:true, name:true, email:true, role:true, isActive:true, mustChangePwd:true, createdAt:true },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: users });
  } catch (err) { next(err); }
};

exports.getOne = async (req, res, next) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, deletedAt: null },
      select: { id:true, name:true, email:true, role:true, isActive:true, mustChangePwd:true, createdAt:true },
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const schema = Joi.object({
      name:     Joi.string().max(100).required(),
      email:    Joi.string().email().required(),
      role:     Joi.string().valid(...USER_ROLES).required(),
      password: Joi.string().min(8).required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });

    const exists = await prisma.user.findUnique({ where: { email: value.email } });
    if (exists) return res.status(409).json({ success: false, message: 'Email already exists' });

    const passwordHash = await bcrypt.hash(value.password, 12);
    const user = await prisma.user.create({
      data: { name: value.name, email: value.email, passwordHash, role: value.role, mustChangePwd: true },
      select: { id:true, name:true, email:true, role:true },
    });

    await auditService.log(req.user.id, 'USER_CREATED', 'users', user.id, req.ip, { email: value.email, role: value.role });
    res.status(201).json({ success: true, data: user });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const schema = Joi.object({
      name:     Joi.string().max(100),
      role:     Joi.string().valid(...USER_ROLES),
      isActive: Joi.boolean(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });

    // LOW-08: Prevent superadmin from deactivating/demoting their own account
    if (req.params.id === req.user.id) {
      if (value.isActive === false) {
        return res.status(400).json({ success: false, message: 'Tidak dapat menonaktifkan akun sendiri' });
      }
      if (value.role && value.role !== req.user.role) {
        return res.status(400).json({ success: false, message: 'Tidak dapat mengubah role akun sendiri' });
      }
    }

    // Check if deactivating user with pending approvals
    if (value.isActive === false) {
      const pendingCount = await prisma.documentApproval.count({
        where: { approverId: req.params.id, status: 'PENDING' },
      });
      if (pendingCount > 0) {
        // Alert superadmins
        const admins = await prisma.user.findMany({ where: { role:'superadmin', isActive:true } });
        const targetUser = await prisma.user.findUnique({ where:{ id: req.params.id }, select:{name:true,email:true} });
        for (const admin of admins) {
          await notifService.create({
            userId: admin.id, type:'SYSTEM',
            title: 'User Dinonaktifkan — Perlu Reassign',
            message: `${targetUser.name} dinonaktifkan namun masih memiliki ${pendingCount} dokumen pending. Harap reassign.`,
            entityType: 'users', entityId: req.params.id,
          });
        }
      }
    }

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data:  value,
      select: { id:true, name:true, email:true, role:true, isActive:true },
    });
    await auditService.log(req.user.id, 'USER_UPDATED', 'users', req.params.id, req.ip, value);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
};

exports.deactivate = async (req, res, next) => {
  try {
    await prisma.user.update({ where: { id: req.params.id }, data: { isActive: false } });
    await auditService.log(req.user.id, 'USER_DEACTIVATED', 'users', req.params.id, req.ip);
    res.json({ success: true, message: 'User deactivated' });
  } catch (err) { next(err); }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const user = await prisma.user.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const tempPwd      = crypto.randomBytes(8).toString('hex');
    const passwordHash = await bcrypt.hash(tempPwd, 12);

    await prisma.user.update({ where: { id: req.params.id }, data: { passwordHash, mustChangePwd: true } });
    await emailService.sendPasswordReset(user.email, user.name, tempPwd);
    await auditService.log(req.user.id, 'PASSWORD_RESET', 'users', req.params.id, req.ip);

    res.json({ success: true, message: 'Password reset and sent to user email' });
  } catch (err) { next(err); }
};

exports.getMappings = async (req, res, next) => {
  try {
    const mappings = await prisma.productApproverMapping.findMany({
      include: {
        productGroup:    true,
        productCategory: { select: { id: true, name: true, productCode: true } },
        approver:        { select: { id:true, name:true, email:true } },
      },
    });
    res.json({ success: true, data: mappings });
  } catch (err) { next(err); }
};

exports.setMapping = async (req, res, next) => {
  try {
    const { error, value } = Joi.object({
      productGroupId:    Joi.number().integer().required(),
      productCategoryId: Joi.number().integer().optional().allow(null),
      approverUserId:    Joi.string().uuid().required(),
      // Ceiling comes from pdf.service — it can only sign levels 0..MAX_APPROVAL_LEVEL.
      // A mapping above it would create an approval nobody can ever sign.
      level:             Joi.number().integer().min(0).max(MAX_APPROVAL_LEVEL).default(MAX_APPROVAL_LEVEL),
    }).validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });

    if (value.productCategoryId && value.level !== 0) {
      return res.status(400).json({ success: false, message: 'Product-specific mapping is only allowed at Level 0' });
    }

    if (value.productCategoryId) {
      const category = await prisma.productCategory.findFirst({
        where: { id: value.productCategoryId, groupId: value.productGroupId },
      });
      if (!category) {
        return res.status(400).json({ success: false, message: 'Selected product does not belong to the selected group' });
      }
    }

    let mapping;
    if (value.productCategoryId) {
      // Unique per specific product+level is safely DB-enforced (uq_category_level) —
      // productCategoryId is never null in this branch, so MySQL's unique index applies cleanly.
      mapping = await prisma.productApproverMapping.upsert({
        where:  { uq_category_level: { productCategoryId: value.productCategoryId, level: value.level } },
        create: value,
        update: { approverUserId: value.approverUserId },
      });
    } else {
      // Group-default row (productCategoryId null): no DB unique constraint covers this
      // combination (see schema.prisma note), so find-then-create/update instead of upsert.
      const existing = await prisma.productApproverMapping.findFirst({
        where: { productGroupId: value.productGroupId, level: value.level, productCategoryId: null },
      });
      mapping = existing
        ? await prisma.productApproverMapping.update({
            where: { id: existing.id },
            data:  { approverUserId: value.approverUserId },
          })
        : await prisma.productApproverMapping.create({
            data: { ...value, productCategoryId: null },
          });
    }
    res.json({ success: true, data: mapping });
  } catch (err) { next(err); }
};

exports.deleteMapping = async (req, res, next) => {
  try {
    await prisma.productApproverMapping.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ success: true, message: 'Mapping deleted' });
  } catch (err) { next(err); }
};

// ─── Level-0 suggestion + candidates (any authenticated role, incl. uploader) ──

exports.suggestLevel0Approver = async (req, res, next) => {
  try {
    const { error, value } = Joi.object({
      productCategoryId: Joi.number().integer().required(),
    }).validate(req.query);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });

    const category = await prisma.productCategory.findFirst({
      where: { id: value.productCategoryId, isActive: true },
    });
    if (!category) return res.status(400).json({ success: false, message: 'Product category not found' });

    const { approver, source } = await resolveLevel0Approver({
      productCategoryId: category.id,
      productGroupId:    category.groupId,
    });

    res.json({
      success: true,
      data: {
        source,
        approver: approver
          ? { id: approver.id, name: approver.name, email: approver.email, role: approver.role }
          : null,
      },
    });
  } catch (err) { next(err); }
};

exports.listApproverCandidates = async (req, res, next) => {
  try {
    const candidates = await prisma.user.findMany({
      where:  { isActive: true, role: { in: ['superadmin', 'admin', 'approver'] } },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: candidates });
  } catch (err) { next(err); }
};
