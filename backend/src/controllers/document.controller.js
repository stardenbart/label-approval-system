// backend/src/controllers/document.controller.js
'use strict';

// FIX LOG (upload function):
// FIX-04: SPV lookup was using findFirst(role=superadmin, id≠self) — ignoring productApproverMapping.
//         This fails when there is only ONE superadmin (the uploader), because excluding self
//         returns null → NO_APPROVER error even though the mapping IS configured.
//         Fix: look up Level 1 approver from productApproverMapping for the document's product group.
//         Fallback: if no mapping exists for the group, find any active admin/superadmin (including self).

const path   = require('path');
const fs     = require('fs');
const Joi    = require('joi');
const { prisma }       = require('../config/prisma');
const pdfService       = require('../services/pdf.service');
const qrService        = require('../services/qr.service');
const idGenService     = require('../services/id-generator.service');
const auditService     = require('../services/audit.service');
const notifService     = require('../services/notification.service');
const emailService     = require('../services/email.service');
const logger           = require('../config/logger');
const { STORAGE_PATH } = require('../middleware/upload');
const { resolveLevel0Approver } = require('../services/approver-resolution.service');

const APPROVAL_SELECT = {
  id: true, level: true, status: true,
  signedAt: true, notes: true, createdAt: true,
  approverId: true, assignedBy: true, nextApproverId: true,
  approver: { select: { id: true, name: true, role: true } },
  esignPosition: true,
};

const APPROVAL_DETAIL_SELECT = {
  ...APPROVAL_SELECT,
  qrPath: true,
};

const positionSchema = Joi.object({
  pageNumber: Joi.number().integer().min(1).default(1),
  xPercent:   Joi.number().min(0).max(100).required(),
  yPercent:   Joi.number().min(0).max(100).required(),
  widthPt:    Joi.number().min(10).max(500).required(),
  heightPt:   Joi.number().min(10).max(500).required(),
}).optional().allow(null);

const footerPositionSchema = Joi.object({
  pageNumber: Joi.number().integer().min(1).default(1),
  xPercent:   Joi.number().min(0).max(100).required(),
  yPercent:   Joi.number().min(0).max(100).required(),
  widthPt:    Joi.number().min(50).max(400).required(),
  heightPt:   Joi.number().min(15).max(100).required(),
}).optional().allow(null);

exports.list = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
    const skip  = (page - 1) * limit;

    const ALLOWED_DATE_FIELDS = ['tanggalTerima', 'tanggalPeriksa', 'tanggalApproval', 'createdAt'];
    const dateField = ALLOWED_DATE_FIELDS.includes(req.query.dateField)
      ? req.query.dateField : 'tanggalTerima';

    const { status, groupId, search, dateFrom, dateTo } = req.query;
    const where = { deletedAt: null };

    if (req.user.role === 'approver') {
      const myPendingDocIds = await prisma.documentApproval.findMany({
        where:  { approverId: req.user.id, status: 'PENDING' },
        select: { documentId: true },
      });
      const pendingIds = myPendingDocIds.map(a => a.documentId);
      where.AND = [{ OR: [{ status: 'APPROVED' }, { id: { in: pendingIds } }] }];
    } else if (req.user.role === 'viewer') {
      where.status = 'APPROVED';
    } else if (req.user.role === 'uploader') {
      // Same visibility as viewer (approved-only), plus their own uploads
      // regardless of status, so they can track what they submitted.
      where.AND = [{ OR: [{ status: 'APPROVED' }, { uploadedBy: req.user.id }] }];
    }

    if (groupId) where.productCategory = { groupId: parseInt(groupId) };

    if (search) {
      const clause = {
        OR: [
          { labelName:        { contains: search } },
          { regulatoryId:     { contains: search } },
          { fileNameOriginal: { contains: search } },
        ],
      };
      where.AND = [...(where.AND || []), clause];
    }

    if (dateFrom || dateTo) {
      where[dateField] = {};
      if (dateFrom) where[dateField].gte = new Date(dateFrom);
      if (dateTo)   where[dateField].lte = new Date(dateTo);
    }

    const statusCountWhere = { ...where };
    if (status && !where.status) where.status = status;

    const [items, total, groupedStatusCounts] = await Promise.all([
      prisma.document.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, regulatoryId: true, labelName: true,
          fileNameOriginal: true, status: true,
          tanggalTerima: true, tanggalPeriksa: true, tanggalVerifikasi: true, tanggalApproval: true,
          createdAt: true,
          productCategory: { select: { id: true, name: true, subGroup: true, group: { select: { id: true, name: true, code: true } } } },
          uploader:        { select: { id: true, name: true } },
          approvals: { orderBy: { level: 'asc' }, select: APPROVAL_SELECT },
        },
      }),
      prisma.document.count({ where }),
      prisma.document.groupBy({
        by: ['status'],
        where: statusCountWhere,
        _count: { _all: true },
      }),
    ]);

    const statusCounts = {
      pending:  0,
      approved: 0,
      declined: 0,
      total:    0,
    };
    groupedStatusCounts.forEach(row => {
      const count = row._count._all;
      if (row.status === 'PENDING_APPROVAL') statusCounts.pending = count;
      if (row.status === 'APPROVED')         statusCounts.approved = count;
      if (row.status === 'DECLINED')         statusCounts.declined = count;
      statusCounts.total += count;
    });

    res.json({
      success: true,
      data: { items, statusCounts, pagination: { page, limit, total, pages: Math.ceil(total / limit) } },
    });
  } catch (err) { next(err); }
};

exports.myPending = async (req, res, next) => {
  try {
    const approvals = await prisma.documentApproval.findMany({
      where:   { approverId: req.user.id, status: 'PENDING' },
      select: {
        id: true, level: true, status: true, createdAt: true,
        document: {
          select: {
            id: true, regulatoryId: true, labelName: true, status: true,
            tanggalTerima: true,
            productCategory: { select: { name: true, group: { select: { name: true } } } },
            uploader:        { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ success: true, data: approvals });
  } catch (err) { next(err); }
};

exports.upload = async (req, res, next) => {
  try {
    // Two roles may upload:
    //  - 'superadmin' (= Staff RnI acting directly): unchanged legacy flow,
    //    level 0 is auto-APPROVED at upload time, exactly as before.
    //  - 'uploader': new role, uploads WITHOUT e-sign. Level 0 is created as
    //    PENDING and routed to whichever user is mapped as Staff RnI
    //    (ProductApproverMapping level 0) for the document's product group.
    if (!['superadmin', 'uploader', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Only Staff Regulatory or Uploader can upload documents', code: 'FORBIDDEN' });
    }
    const isUploaderRole = req.user.role === 'uploader';

    const metaSchema = Joi.object({
      labelName:         Joi.string().max(200).required(),
      productCategoryId: Joi.number().integer().required(),
      tanggalTerima:     Joi.date().required(),
      tanggalPeriksa:    Joi.date().required(),
      // position / footerPosition sent as JSON strings from multipart/form-data
      position:          Joi.string().optional().allow('', null),
      footerPosition:    Joi.string().optional().allow('', null),
      // uploader-role only: manual override of the suggested Level-0 approver
      targetApproverId:  Joi.string().uuid().optional().allow('', null),
    });
    const { error: metaErr, value } = metaSchema.validate(req.body);
    if (metaErr) return res.status(400).json({ success: false, message: metaErr.details[0].message });

    let position = null;
    if (value.position) {
      try {
        const parsed = JSON.parse(value.position);
        const { error: posErr, value: posVal } = positionSchema.validate(parsed);
        if (!posErr) position = posVal;
      } catch { /* ignore malformed position JSON */ }
    }

    let footerPosition = null;
    if (value.footerPosition) {
      try {
        const parsed = JSON.parse(value.footerPosition);
        const { error: footerErr, value: footerVal } = footerPositionSchema.validate(parsed);
        if (!footerErr) footerPosition = footerVal;
      } catch { /* ignore malformed footerPosition JSON */ }
    }

    if (!req.file) return res.status(400).json({ success: false, message: 'PDF file is required', code: 'FILE_MISSING' });

    // Validate PDF magic bytes
    const fileBuf = fs.readFileSync(req.file.path);
    if (!fileBuf.slice(0, 5).toString().startsWith('%PDF')) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: 'Invalid PDF file', code: 'INVALID_FILE_TYPE' });
    }

    const category = await prisma.productCategory.findFirst({
      where: { id: value.productCategoryId, isActive: true },
      include: { group: true },
    });
    if (!category) return res.status(400).json({ success: false, message: 'Product category not found' });

    // ─── Resolve who gets assigned as Level-0 Staff RnI (uploader flow) or ──
    // ─── Level-1 SPV (superadmin/direct flow) ────────────────────────────────
    // FIX-04 (legacy): findFirst(superadmin, id≠self) — broke when there was
    //   only one superadmin. Fixed by querying productApproverMapping first,
    //   falling back to any active admin/superadmin (including self, to
    //   unblock single-user testing).
    // Uploader-role flow (per-product PIC mapping): the uploader may pick a
    // specific Staff RnI via the "route to" dropdown (targetApproverId). If
    // that pick is missing, stale, or invalid, fall back to the resolution
    // chain: product-specific mapping → group mapping → any active superadmin.
    let approverForNextStep = null;
    let targetApproverSource = null;

    if (isUploaderRole) {
      if (value.targetApproverId) {
        const picked = await prisma.user.findFirst({
          where: { id: value.targetApproverId, isActive: true, role: { in: ['superadmin', 'admin', 'approver'] } },
        });
        if (picked) {
          approverForNextStep = picked;
          targetApproverSource = 'client';
        }
      }
      if (!approverForNextStep) {
        const resolved = await resolveLevel0Approver({
          productCategoryId: category.id,
          productGroupId:    category.groupId,
        });
        approverForNextStep = resolved.approver;
        targetApproverSource = resolved.source;
      }
    } else {
      // Legacy/direct flow — unchanged: Level-1 SPV via group mapping.
      const mapping = await prisma.productApproverMapping.findFirst({
        where:   { productGroupId: category.groupId, level: 1 },
        include: { approver: true },
      });
      if (mapping?.approver?.isActive) {
        approverForNextStep = mapping.approver;
        targetApproverSource = 'group';
      }
      if (!approverForNextStep) {
        approverForNextStep = await prisma.user.findFirst({
          where: { role: { in: ['superadmin', 'admin'] }, isActive: true },
        });
        targetApproverSource = 'fallback';
      }
    }

    if (!approverForNextStep) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(400).json({
        success: false,
        message: isUploaderRole
          ? 'No Staff RnI configured. Set up a Level 0 mapping in User Management.'
          : 'No SPV approver configured. Set up a Level 1 mapping in User Management.',
        code:    'NO_APPROVER',
      });
    }
    // Keep the old variable name alive for the (unchanged) superadmin-flow code below.
    const spv = approverForNextStep;
    // ────────────────────────────────────────────────────────────────────────

    const { id: docUuid, regulatoryId } = await idGenService.generate({
      productCode:    category.productCode,
      tanggalTerima:  value.tanggalTerima,
      tanggalPeriksa: value.tanggalPeriksa,
    });

    const docStorageDir = path.join(STORAGE_PATH, 'documents', docUuid);
    fs.mkdirSync(docStorageDir, { recursive: true });
    const permanentPath = path.join(docStorageDir, 'original.pdf');
    fs.renameSync(req.file.path, permanentPath);

    const approvalLevel0Uuid = require('crypto').randomUUID();
    // Only used in the superadmin/direct flow — uploader flow does NOT
    // pre-create level 1; it gets created dynamically when Staff RnI approves
    // level 0, via the existing generic approval.controller.js#approve().
    const approvalLevel1Uuid = require('crypto').randomUUID();

    let doc;
    try {
      doc = await prisma.$transaction(async (tx) => {
        const created = await tx.document.create({
          data: {
            id:                docUuid,
            regulatoryId,
            productCategoryId: value.productCategoryId,
            labelName:         value.labelName,
            fileNameOriginal:  req.file.originalname,
            pathOriginal:      permanentPath,
            uploadedBy:        req.user.id,
            tanggalTerima:     new Date(value.tanggalTerima),
            tanggalPeriksa:    new Date(value.tanggalPeriksa),
            status:            'PENDING_APPROVAL',
          },
        });

        if (isUploaderRole) {
          // Level 0: Staff RnI — PENDING. Uploader has NOT e-signed anything;
          // the document sits with Staff RnI until they approve/decline via
          // the normal /approvals/:approvalId/approve endpoint (unchanged).
          await tx.documentApproval.create({
            data: {
              id:         approvalLevel0Uuid,
              documentId: docUuid,
              approverId: spv.id, // resolved above as Level-0 Staff RnI mapping
              assignedBy: req.user.id,
              level:      0,
              status:     'PENDING',
            },
          });
        } else {
          // Legacy/direct flow — UNCHANGED from before this feature.
          await tx.documentApproval.create({
            data: {
              id:         approvalLevel0Uuid,
              documentId: docUuid,
              approverId: req.user.id,
              level:      0,
              status:     'APPROVED',
              signedAt:   new Date(),
            },
          });

          await tx.documentApproval.create({
            data: {
              id:         approvalLevel1Uuid,
              documentId: docUuid,
              approverId: spv.id, // resolved above as Level-1 SPV mapping
              level:      1,
              status:     'PENDING',
            },
          });
        }

        return created;
      });
    } catch (txErr) {
      try { fs.rmSync(docStorageDir, { recursive: true, force: true }); } catch (_) {}
      throw txErr;
    }

    // Original QR (identifies the raw uploaded file) is generated regardless
    // of role — it doesn't depend on any approval having happened yet.
    qrService.generateOriginalQr(docUuid, docStorageDir)
      .then(async (qrOriginalPath) => {
        await prisma.document.update({ where: { id: docUuid }, data: { qrPathOriginal: qrOriginalPath } });
      })
      .catch((err) => {
        logger.error(`Original QR generation failed for doc ${docUuid}: ${err.message}`);
      });

    if (!isUploaderRole) {
      // ── Legacy/direct flow ONLY — Fire-and-forget: generate QR, then stamp
      //    Level 0 PDF immediately, exactly as before this feature existed.
      //    isFinalLevel is always false: this branch requires a Level-1 SPV
      //    mapping to exist (NO_APPROVER check above), so Level 0 can never
      //    be the final level here.
      qrService.generateApprovalQr(approvalLevel0Uuid, docStorageDir, 0)
        .then(async (approvalQrPath) => {
          await prisma.documentApproval.update({ where: { id: approvalLevel0Uuid }, data: { qrPath: approvalQrPath } });

          const freshDoc        = await prisma.document.findUnique({ where: { id: docUuid } });
          const level0Approval  = await prisma.documentApproval.findUnique({ where: { id: approvalLevel0Uuid } });

          const signedLevel0Path = await pdfService.overlayEsign(freshDoc, level0Approval, position, false, footerPosition);
          const settings = await pdfService.getSettings();

          await prisma.$transaction(async (tx) => {
            await tx.document.update({ where: { id: docUuid }, data: { pathSignedLevel0: signedLevel0Path } });
            await tx.documentEsignPosition.create({
              data: {
                documentId: docUuid,
                approvalId: approvalLevel0Uuid,
                pageNumber: position?.pageNumber ?? settings.defaultPage,
                xPercent: position?.xPercent ?? settings.defaultXPercent,
                yPercent: position?.yPercent ?? settings.defaultYPercent,
                widthPt: position?.widthPt ?? settings.defaultWidthPt,
                heightPt: position?.heightPt ?? settings.defaultHeightPt,
              },
            });
            await tx.documentFooterPosition.create({
              data: {
                documentId: docUuid,
                pageNumber: footerPosition?.pageNumber ?? settings.footerDefaultPage,
                xPercent:   footerPosition?.xPercent   ?? settings.footerDefaultXPercent,
                yPercent:   footerPosition?.yPercent   ?? settings.footerDefaultYPercent,
                widthPt:    footerPosition?.widthPt    ?? settings.footerDefaultWidthPt,
                heightPt:   footerPosition?.heightPt   ?? settings.footerDefaultHeightPt,
              },
            });
          });

          logger.info(`Level 0 stamp done for doc ${docUuid}`);
        })
        .catch((err) => {
          logger.error(`Upload post-processing failed for doc ${docUuid}: ${err.message}`);
          logger.error(err.stack);
        });
    }
    // Uploader flow: NO QR/stamp for level 0 here — nothing to stamp yet
    // since Staff RnI hasn't signed. QR + overlayEsign for level 0 (and every
    // level after) happens inside the existing approve() endpoint instead.

    await notifService.create({
      userId:     spv.id,
      type:       'APPROVAL_ASSIGNED',
      title:      'New Document Waiting for Approval',
      message:    isUploaderRole
        ? `Document "${value.labelName}" (${regulatoryId}) uploaded and waiting your review as Staff RnI.`
        : `Document "${value.labelName}" (${regulatoryId}) Waiting you approval.`,
      entityType: 'documents',
      entityId:   docUuid,
    });
    await emailService.sendApprovalAssigned(spv.email, {
      docName: value.labelName, regulatoryId, approverName: spv.name,
    });
    await auditService.log(req.user.id, 'DOCUMENT_UPLOADED', 'documents', docUuid, req.ip, {
      regulatoryId, viaUploaderRole: isUploaderRole, targetApproverSource,
    });

    res.status(201).json({ success: true, data: { id: docUuid, regulatoryId, labelName: value.labelName } });
  } catch (err) { next(err); }
};

exports.getOne = async (req, res, next) => {
  try {
    const doc = await prisma.document.findFirst({
      where: { id: req.params.id, deletedAt: null },
      select: {
        id: true, regulatoryId: true, labelName: true, fileNameOriginal: true,
        status: true, uploadedBy: true, productCategoryId: true,
        tanggalTerima: true, tanggalPeriksa: true,
        tanggalVerifikasi: true, tanggalApproval: true,
        createdAt: true, updatedAt: true,
        qrPathEsign: true, qrPathOriginal: true,
        pathSignedLevel0: true, pathSignedLevel1: true,
        pathSignedFinal: true, pathCheckReport: true,
        productCategory: { include: { group: true } },
        uploader:        { select: { id: true, name: true } },
        approvals: { orderBy: { level: 'asc' }, select: APPROVAL_DETAIL_SELECT },
        labelCheckForm: {
          select: {
            id: true, overallStatus: true, submittedAt: true, createdAt: true,
            checker: { select: { id: true, name: true } },
            results: {
              select: {
                id: true, parameterId: true, status: true, parameter: true,
                remarks: {
                  select: { id: true, description: true, remarksText: true, imageFilename: true, createdAt: true },
                },
              },
            },
          },
        },
      },
    });

    if (!doc) return res.status(404).json({ success: false, message: 'Document not found', code: 'NOT_FOUND' });

    if (req.user.role === 'viewer' && doc.status !== 'APPROVED') {
      return res.status(403).json({ success: false, message: 'Access denied', code: 'FORBIDDEN' });
    }
    if (req.user.role === 'approver') {
      const isAssigned = doc.approvals.some(a => a.approverId === req.user.id && a.status === 'PENDING');
      if (doc.status !== 'APPROVED' && !isAssigned) {
        return res.status(403).json({ success: false, message: 'Access denied', code: 'FORBIDDEN' });
      }
    }
    if (req.user.role === 'uploader' && doc.status !== 'APPROVED' && doc.uploadedBy !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied', code: 'FORBIDDEN' });
    }

    // Strip internal file paths from response — expose only boolean flags
    const {
      qrPathEsign, qrPathOriginal,
      pathSignedLevel0, pathSignedLevel1, pathSignedFinal, pathCheckReport,
      ...safeDoc
    } = doc;

    const approvals = safeDoc.approvals.map(({ qrPath, ...approval }) => ({
      ...approval,
      hasQr: !!qrPath,
    }));
    const approvalQrs = safeDoc.approvals
      .filter(a => !!a.qrPath)
      .map(a => ({
        approvalId:   a.id,
        level:        a.level,
        status:       a.status,
        signedAt:     a.signedAt,
        approverName: a.approver?.name || null,
        approverRole: a.approver?.role || null,
      }));

    const sanitized = {
      ...safeDoc,
      approvals,
      approvalQrs,
      hasQrEsign:      approvalQrs.length > 0 || !!qrPathEsign,
      hasQrOriginal:   !!qrPathOriginal,
      hasSignedLevel0: !!pathSignedLevel0,
      hasSignedLevel1: !!pathSignedLevel1,
      hasSignedFinal:  !!pathSignedFinal,
      hasCheckReport:  !!pathCheckReport,
    };

    res.json({ success: true, data: sanitized });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    const doc = await prisma.document.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });

    const pendingCount = await prisma.documentApproval.count({
      where: { documentId: req.params.id, status: 'PENDING' },
    });
    if (pendingCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete document with pending approvals. Decline first.',
        code:    'HAS_PENDING_APPROVALS',
      });
    }

    await prisma.document.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    await auditService.log(req.user.id, 'DOCUMENT_DELETED', 'documents', req.params.id, req.ip);
    res.json({ success: true, message: 'Document deleted' });
  } catch (err) { next(err); }
};

// ─── File serving helpers ───────────────────────────────────────────────────

async function serveFile(filePath, fileName, req, res, action, docId, mode = 'attachment') {
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'File not found' });
  }
  await auditService.log(req.user.id, action, 'documents', docId, req.ip);

  const asciiName   = fileName.replace(/[^\x20-\x7E]/g, '_');
  const encodedName = encodeURIComponent(fileName).replace(/'/g, '%27');

  res.setHeader('Content-Type',           'application/pdf');
  res.setHeader('Content-Disposition',    `${mode}; filename="${asciiName}"; filename*=UTF-8''${encodedName}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control',          'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma',                 'no-cache');
  res.setHeader('Expires',               '0');

  res.sendFile(path.resolve(filePath));
}

async function checkDocAccess(docId, user) {
  const doc = await prisma.document.findFirst({ where: { id: docId, deletedAt: null } });
  if (!doc) return null;
  if (user.role === 'viewer' && doc.status !== 'APPROVED') return 'forbidden';
  if (user.role === 'approver') {
    const isAssigned = await prisma.documentApproval.count({
      where: { documentId: docId, approverId: user.id, status: 'PENDING' },
    });
    if (doc.status !== 'APPROVED' && isAssigned === 0) return 'forbidden';
  }
  if (user.role === 'uploader' && doc.status !== 'APPROVED' && doc.uploadedBy !== user.id) {
    return 'forbidden';
  }
  return doc;
}

exports.serveOriginal = async (req, res, next) => {
  try {
    const result = await checkDocAccess(req.params.id, req.user);
    if (!result)                return res.status(404).json({ success: false, message: 'Document not found' });
    if (result === 'forbidden') return res.status(403).json({ success: false, message: 'Access denied' });
    const mode = req.query.download === 'true' ? 'attachment' : 'inline';
    await serveFile(result.pathOriginal, result.fileNameOriginal, req, res, 'DOCUMENT_DOWNLOADED', result.id, mode);
  } catch (err) { next(err); }
};

exports.serveSignedLevel0 = async (req, res, next) => {
  try {
    const result = await checkDocAccess(req.params.id, req.user);
    if (!result)                return res.status(404).json({ success: false, message: 'Document not found' });
    if (result === 'forbidden') return res.status(403).json({ success: false, message: 'Access denied' });
    if (!result.pathSignedLevel0) {
      return res.status(404).json({ success: false, message: 'Staff-signed PDF not yet available. QR stamping may still be in progress (usually < 5 seconds).' });
    }
    const mode = req.query.download === 'true' ? 'attachment' : 'inline';
    await serveFile(result.pathSignedLevel0, `signed_level0_${result.fileNameOriginal}`, req, res, 'DOCUMENT_DOWNLOADED', result.id, mode);
  } catch (err) { next(err); }
};

exports.serveSignedLevel1 = async (req, res, next) => {
  try {
    const result = await checkDocAccess(req.params.id, req.user);
    if (!result)                return res.status(404).json({ success: false, message: 'Document not found' });
    if (result === 'forbidden') return res.status(403).json({ success: false, message: 'Access denied' });
    if (!result.pathSignedLevel1) {
      return res.status(404).json({ success: false, message: 'SPV-signed PDF not yet available.' });
    }
    const mode = req.query.download === 'true' ? 'attachment' : 'inline';
    await serveFile(result.pathSignedLevel1, `signed_level1_${result.fileNameOriginal}`, req, res, 'DOCUMENT_DOWNLOADED', result.id, mode);
  } catch (err) { next(err); }
};

exports.serveSigned = async (req, res, next) => {
  try {
    const result = await checkDocAccess(req.params.id, req.user);
    if (!result)                return res.status(404).json({ success: false, message: 'Document not found' });
    if (result === 'forbidden') return res.status(403).json({ success: false, message: 'Access denied' });
    if (result.status !== 'APPROVED') {
      return res.status(400).json({ success: false, message: 'Signed document not yet available' });
    }
    await serveFile(result.pathSignedFinal, `signed_${result.fileNameOriginal}`, req, res, 'DOCUMENT_DOWNLOADED', result.id, 'attachment');
  } catch (err) { next(err); }
};

exports.serveReport = async (req, res, next) => {
  try {
    const result = await checkDocAccess(req.params.id, req.user);
    if (!result)                return res.status(404).json({ success: false, message: 'Document not found' });
    if (result === 'forbidden') return res.status(403).json({ success: false, message: 'Access denied' });
    if (!result.pathCheckReport) return res.status(404).json({ success: false, message: 'Report not found' });
    await serveFile(result.pathCheckReport, `laporan_${result.regulatoryId}.pdf`, req, res, 'DOCUMENT_DOWNLOADED', result.id, 'attachment');
  } catch (err) { next(err); }
};

exports.downloadQrEsign = async (req, res, next) => {
  try {
    const result = await checkDocAccess(req.params.id, req.user);
    if (!result)                return res.status(404).json({ success: false, message: 'Document not found' });
    if (result === 'forbidden') return res.status(403).json({ success: false, message: 'Access denied' });
    if (!result.qrPathEsign || !fs.existsSync(result.qrPathEsign)) {
      return res.status(404).json({ success: false, message: 'QR not ready yet. Try again in a few seconds.' });
    }
    await auditService.log(req.user.id, 'QR_ESIGN_DOWNLOADED', 'documents', result.id, req.ip);
    res.setHeader('Content-Type',        'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="qr_esign_${result.regulatoryId}.png"`);
    res.setHeader('Cache-Control',       'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma',              'no-cache');
    res.setHeader('Expires',            '0');
    res.sendFile(path.resolve(result.qrPathEsign));
  } catch (err) { next(err); }
};

exports.downloadApprovalQr = async (req, res, next) => {
  try {
    const result = await checkDocAccess(req.params.id, req.user);
    if (!result)                return res.status(404).json({ success: false, message: 'Document not found' });
    if (result === 'forbidden') return res.status(403).json({ success: false, message: 'Access denied' });

    const approval = await prisma.documentApproval.findFirst({
      where: {
        id:         req.params.approvalId,
        documentId: result.id,
      },
      select: {
        id: true, level: true, qrPath: true,
      },
    });

    if (!approval) {
      return res.status(404).json({ success: false, message: 'Approval QR not found' });
    }
    if (!approval.qrPath || !fs.existsSync(approval.qrPath)) {
      return res.status(404).json({ success: false, message: 'QR not ready yet for this approval.' });
    }

    await auditService.log(req.user.id, 'APPROVAL_QR_DOWNLOADED', 'document_approvals', approval.id, req.ip);
    res.setHeader('Content-Type',        'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="qr_level${approval.level}_${result.regulatoryId}.png"`);
    res.setHeader('Cache-Control',       'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma',              'no-cache');
    res.setHeader('Expires',            '0');
    res.sendFile(path.resolve(approval.qrPath));
  } catch (err) { next(err); }
};

exports.downloadQrOriginal = async (req, res, next) => {
  try {
    const result = await checkDocAccess(req.params.id, req.user);
    if (!result)                return res.status(404).json({ success: false, message: 'Document not found' });
    if (result === 'forbidden') return res.status(403).json({ success: false, message: 'Access denied' });
    if (!result.qrPathOriginal || !fs.existsSync(result.qrPathOriginal)) {
      return res.status(404).json({ success: false, message: 'QR not ready yet. Try again in a few seconds.' });
    }
    await auditService.log(req.user.id, 'QR_ORIGINAL_DOWNLOADED', 'documents', result.id, req.ip);
    res.setHeader('Content-Type',        'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="qr_original_${result.regulatoryId}.png"`);
    res.setHeader('Cache-Control',       'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma',              'no-cache');
    res.setHeader('Expires',            '0');
    res.sendFile(path.resolve(result.qrPathOriginal));
  } catch (err) { next(err); }
};
