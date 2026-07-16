// backend/src/controllers/approval.controller.js
'use strict';

// FIX LOG:
// FIX-05a — suggestedApprovers: isFinalLevel now uses mapping-based check (see resolveIsFinalLevel).
// FIX-05b — approve(): isFinalLevel determined by absence of a mapping for level+1, not a
//            hardcoded `>= 2` or fragile `_max.level || 2` fallback.
// FIX-06  — QR-per-approval: each approval now generates its OWN QR (qrService.generateApprovalQr)
//            BEFORE pdfService.overlayEsign() is called, and persists it to approval.qrPath.
//            Previously overlayEsign read document.qrPathEsign (one generic QR reused at every
//            level). Now every level — Staff, SPV, Marketing/Final — gets a QR pointing to
//            /e/approval/{approvalId}, identifying exactly who signed at that point.

const fs     = require('fs');
const path   = require('path');
const Joi    = require('joi')
const { prisma }    = require('../config/prisma');
const pdfService    = require('../services/pdf.service');
const qrService      = require('../services/qr.service');
const notifService  = require('../services/notification.service');
const emailService  = require('../services/email.service');
const auditService  = require('../services/audit.service');
const logger        = require('../config/logger');
const { STORAGE_PATH } = require('../middleware/upload');

const positionSchema = Joi.object({
  pageNumber: Joi.number().integer().min(1).required(),
  xPercent:   Joi.number().min(0).max(100).required(),
  yPercent:   Joi.number().min(0).max(100).required(),
  widthPt:    Joi.number().min(10).max(200).required(),
  heightPt:   Joi.number().min(10).max(200).required(),
});

const footerPositionSchema = Joi.object({
  pageNumber: Joi.number().integer().min(1).required(),
  xPercent:   Joi.number().min(0).max(100).required(),
  yPercent:   Joi.number().min(0).max(100).required(),
  widthPt:    Joi.number().min(50).max(400).required(),
  heightPt:   Joi.number().min(15).max(100).required(),
  fontSize:   Joi.number().min(5).max(24).default(7),
  rotation:   Joi.number().valid(0, 90, 180, 270).default(0),
});

// ─── Helper: determine if an approval is at the final level ──────────────────
async function resolveIsFinalLevel(approval) {
  const groupId   = approval.document?.productCategory?.groupId;
  const nextLevel = approval.level + 1;

  if (!groupId) return approval.level >= 2;

  const nextMapping = await prisma.productApproverMapping.findFirst({
    where: { productGroupId: groupId, level: nextLevel },
  });

  return !nextMapping;
}

// ─── Approve ──────────────────────────────────────────────────────────────────
exports.approve = async (req, res, next) => {
  try {
    const approval = await prisma.documentApproval.findFirst({
      where:   { id: req.params.approvalId, status: 'PENDING' },
      include: { document: { include: { productCategory: true } }, approver: true },
    });

    if (!approval) return res.status(404).json({ success: false, message: 'Approval not found or already processed' });
    if (approval.approverId !== req.user.id && req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: 'Not authorized for this approval' });
    }

    const isFinalLevel = await resolveIsFinalLevel(approval);

    const schema = Joi.object({
      notes:          Joi.string().max(2000).allow('', null),
      nextApproverId: Joi.string().uuid().when('$requireNext', { is: true, then: Joi.required() }),
      position:       positionSchema.optional(),
      footerPosition: footerPositionSchema.optional(),
    });
    const { error, value } = schema.validate(req.body, { context: { requireNext: !isFinalLevel } });
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });

    if (!isFinalLevel && !value.nextApproverId) {
      return res.status(400).json({ success: false, message: 'Next approver is required for non-final levels' });
    }

    // Footer stamp position can only be set once, at Level 0 (Staff Regulatory).
    // Levels 1/2 must not move it — enforce server-side, not just hide it in the UI.
    if (value.footerPosition && approval.level !== 0) {
      return res.status(400).json({ success: false, message: 'Footer stamp position can only be set at Level 0' });
    }

    let nextApprover = null;
    if (value.nextApproverId) {
      nextApprover = await prisma.user.findFirst({
        where: { id: value.nextApproverId, isActive: true, role: { in: ['superadmin', 'admin', 'approver'] } },
      });
      if (!nextApprover) return res.status(400).json({ success: false, message: 'Invalid next approver' });
    }

    // ── FIX-06: Generate THIS approval's own QR before overlay ───────────
    // Must happen before overlayEsign, since overlayEsign now reads approval.qrPath.
    const docStorageDir = path.dirname(approval.document.pathOriginal);
    let qrPath = null;
    try {
      qrPath = await qrService.generateApprovalQr(approval.id, docStorageDir, approval.level);
    } catch (qrErr) {
      logger.error('Approval QR generation failed:', qrErr);
      return res.status(500).json({ success: false, message: 'Failed to generate approval QR', code: 'QR_ERROR' });
    }

    // Persist qrPath onto the approval record BEFORE overlay so overlayEsign can read it.
    // (overlayEsign receives the in-memory `approval` object directly, so attach it there too.)
    await prisma.documentApproval.update({ where: { id: approval.id }, data: { qrPath } });
    approval.qrPath = qrPath;

    // Process PDF overlay BEFORE transaction — rollback file on TX failure
    const position = value.position || null;
    // Only meaningful at level 0 — pdfService ignores it for level > 0 anyway,
    // but only forward it there defensively (matches the level check above).
    const footerPosition = approval.level === 0 ? (value.footerPosition || null) : null;
    let signedPath = null;
    try {
      signedPath = await pdfService.overlayEsign(approval.document, approval, position, isFinalLevel, footerPosition);
    } catch (pdfErr) {
      logger.error('PDF overlay failed:', pdfErr);
      return res.status(500).json({ success: false, message: 'Failed to process PDF signature', code: 'PDF_ERROR' });
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.documentApproval.update({
          where: { id: approval.id },
          data: {
            status:         'APPROVED',
            signedAt:       new Date(),
            notes:          value.notes,
            nextApproverId: value.nextApproverId || null,
            pathSigned:     signedPath,
            // qrPath already persisted above
          },
        });

        if (value.position) {
          await tx.documentEsignPosition.create({
            data: {
              documentId: approval.documentId,
              approvalId: approval.id,
              pageNumber: value.position.pageNumber,
              xPercent:   value.position.xPercent,
              yPercent:   value.position.yPercent,
              widthPt:    value.position.widthPt,
              heightPt:   value.position.heightPt,
            },
          });
        }

        if (approval.level === 0) {
          const footerSettings = await pdfService.getSettings();
          const footerData = {
            pageNumber: footerPosition?.pageNumber ?? footerSettings.footerDefaultPage,
            xPercent:   footerPosition?.xPercent   ?? footerSettings.footerDefaultXPercent,
            yPercent:   footerPosition?.yPercent   ?? footerSettings.footerDefaultYPercent,
            widthPt:    footerPosition?.widthPt    ?? footerSettings.footerDefaultWidthPt,
            heightPt:   footerPosition?.heightPt   ?? footerSettings.footerDefaultHeightPt,
            fontSize:   footerPosition?.fontSize   ?? footerSettings.footerDefaultFontSize,
            rotation:   footerPosition?.rotation   ?? footerSettings.footerDefaultRotation,
          };
          await tx.documentFooterPosition.upsert({
            where:  { documentId: approval.documentId },
            create: { documentId: approval.documentId, ...footerData },
            update: footerData,
          });
        }

        if (isFinalLevel) {
          const documentUpdateData = {
            status:          'APPROVED',
            pathSignedFinal: signedPath,
            tanggalApproval: new Date(),
          };
          if (approval.level === 1) documentUpdateData.tanggalVerifikasi = new Date();

          await tx.document.update({
            where: { id: approval.documentId },
            data: documentUpdateData,
          });
        } else {
          const levelField = approval.level === 1 ? 'pathSignedLevel1' : `pathSignedLevel${approval.level}`;
          const documentUpdateData = { [levelField]: signedPath };
          if (approval.level === 1) documentUpdateData.tanggalVerifikasi = new Date();

          await tx.document.update({
            where: { id: approval.documentId },
            data:  documentUpdateData,
          });
          await tx.documentApproval.create({
            data: {
              documentId: approval.documentId,
              approverId: value.nextApproverId,
              assignedBy: req.user.id,
              level:      approval.level + 1,
              status:     'PENDING',
            },
          });
        }
      });
    } catch (txErr) {
      if (signedPath && fs.existsSync(signedPath)) {
        try { fs.unlinkSync(signedPath); } catch (_) {}
      }
      throw txErr;
    }

    // Notifications (after successful commit)
    if (isFinalLevel) {
      const uploader = await prisma.user.findUnique({ where: { id: approval.document.uploadedBy } });
      await notifService.create({
        userId:     approval.document.uploadedBy,
        type:       'APPROVAL_DONE',
        title:      'Dokumen Fully Approved',
        message:    `Dokumen "${approval.document.labelName}" telah disetujui semua level.`,
        entityType: 'documents',
        entityId:   approval.documentId,
      });
      if (uploader) await emailService.sendApprovalDone(uploader.email, { doc: approval.document });
    } else {
      await notifService.create({
        userId:     value.nextApproverId,
        type:       'APPROVAL_ASSIGNED',
        title:      'Dokumen Menunggu Approval Anda',
        message:    `Dokumen "${approval.document.labelName}" diteruskan untuk approval Anda.`,
        entityType: 'documents',
        entityId:   approval.documentId,
      });
      await emailService.sendApprovalAssigned(nextApprover.email, {
        docName:      approval.document.labelName,
        regulatoryId: approval.document.regulatoryId,
        approverName: nextApprover.name,
      });
    }

    await auditService.log(req.user.id, 'DOCUMENT_APPROVED', 'documents', approval.documentId, req.ip, {
      level: approval.level, approvalId: approval.id,
    });

    res.json({ success: true, message: 'Approval submitted successfully' });
  } catch (err) { next(err); }
};

// ─── Decline ──────────────────────────────────────────────────────────────────
exports.decline = async (req, res, next) => {
  try {
    const { error, value } = Joi.object({ notes: Joi.string().min(5).max(2000).required() }).validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });

    const approval = await prisma.documentApproval.findFirst({
      where:   { id: req.params.approvalId, status: 'PENDING' },
      include: { document: true },
    });
    if (!approval) return res.status(404).json({ success: false, message: 'Approval not found' });
    if (approval.approverId !== req.user.id && req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.documentApproval.update({
        where: { id: approval.id },
        data:  { status: 'DECLINED', signedAt: new Date(), notes: value.notes },
      });
      await tx.document.update({
        where: { id: approval.documentId },
        data:  { status: 'DECLINED' },
      });
    });

    const uploader = await prisma.user.findUnique({ where: { id: approval.document.uploadedBy } });
    await notifService.create({
      userId:     approval.document.uploadedBy,
      type:       'APPROVAL_DECLINED',
      title:      'Dokumen Ditolak',
      message:    `Dokumen "${approval.document.labelName}" ditolak. Alasan: ${value.notes}`,
      entityType: 'documents',
      entityId:   approval.documentId,
    });
    if (uploader) await emailService.sendApprovalDeclined(uploader.email, { doc: approval.document, notes: value.notes });

    await auditService.log(req.user.id, 'DOCUMENT_DECLINED', 'documents', approval.documentId, req.ip, {
      level: approval.level, reason: value.notes,
    });

    res.json({ success: true, message: 'Document declined' });
  } catch (err) { next(err); }
};

// ─── Suggested approvers ──────────────────────────────────────────────────────
exports.suggestedApprovers = async (req, res, next) => {
  try {
    const approval = await prisma.documentApproval.findFirst({
      where:   { id: req.params.approvalId },
      include: { document: { include: { productCategory: true, footerPosition: true } } },
    });
    if (!approval) return res.status(404).json({ success: false, message: 'Approval not found' });
    if (approval.approverId !== req.user.id && req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: 'Not authorized for this approval' });
    }

    const groupId   = approval.document.productCategory.groupId;
    const nextLevel = approval.level + 1;

    const nextMapping = await prisma.productApproverMapping.findFirst({
      where: { productGroupId: groupId, level: nextLevel },
    });
    const isFinalLevel = !nextMapping;

    const mappings = await prisma.productApproverMapping.findMany({
      where:   { productGroupId: groupId, level: nextLevel },
      include: { approver: { select: { id: true, name: true, email: true, role: true } } },
    });
    const suggested = mappings.map(m => m.approver);

    const others = await prisma.user.findMany({
      where: {
        isActive: true,
        role:     { in: ['superadmin', 'admin', 'approver'] },
        id:       { notIn: suggested.map(u => u.id) },
      },
      select: { id: true, name: true, email: true, role: true },
    });

    res.json({
      success: true,
      data: {
        documentId:    approval.documentId,
        approvalLevel: approval.level,
        isFinalLevel,
        document: {
          id:               approval.document.id,
          labelName:        approval.document.labelName,
          regulatoryId:     approval.document.regulatoryId,
          fileNameOriginal: approval.document.fileNameOriginal,
          status:           approval.document.status,
        },
        footerPosition: approval.document.footerPosition
          ? {
              pageNumber: approval.document.footerPosition.pageNumber,
              xPercent:   Number(approval.document.footerPosition.xPercent),
              yPercent:   Number(approval.document.footerPosition.yPercent),
              widthPt:    Number(approval.document.footerPosition.widthPt),
              heightPt:   Number(approval.document.footerPosition.heightPt),
              fontSize:   Number(approval.document.footerPosition.fontSize),
              rotation:   Number(approval.document.footerPosition.rotation),
            }
          : null,
        suggested,
        others,
      },
    });
  } catch (err) { next(err); }
};

// ─── Reassign (superadmin) ────────────────────────────────────────────────────
exports.reassign = async (req, res, next) => {
  try {
    const { error, value } = Joi.object({ newApproverId: Joi.string().uuid().required() }).validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });

    const approval = await prisma.documentApproval.findFirst({ where: { id: req.params.approvalId, status: 'PENDING' } });
    if (!approval) return res.status(404).json({ success: false, message: 'Approval not found' });

    const newApprover = await prisma.user.findFirst({ where: { id: value.newApproverId, isActive: true } });
    if (!newApprover) return res.status(400).json({ success: false, message: 'Invalid approver' });

    await prisma.documentApproval.update({
      where: { id: approval.id },
      data:  { approverId: value.newApproverId, assignedBy: req.user.id },
    });

    await notifService.create({
      userId:     value.newApproverId,
      type:       'APPROVAL_ASSIGNED',
      title:      'Anda Ditugaskan sebagai Approver',
      message:    'Anda telah ditugaskan (reassign) sebagai approver untuk dokumen yang memerlukan persetujuan.',
      entityType: 'approvals',
      entityId:   approval.id,
    });

    await auditService.log(req.user.id, 'APPROVER_REASSIGNED', 'approvals', approval.id, req.ip, {
      from: approval.approverId, to: value.newApproverId,
    });

    res.json({ success: true, message: 'Approver reassigned' });
  } catch (err) { next(err); }
};

// ─── Download this approval's own QR (authenticated) ─────────────────────────
// New endpoint (FIX-06) — replaces document.controller's old downloadQrEsign,
// since QR is now per-approval, not per-document.
exports.downloadQr = async (req, res, next) => {
  try {
    const approval = await prisma.documentApproval.findFirst({
      where:   { id: req.params.approvalId },
      include: { document: true },
    });
    if (!approval) return res.status(404).json({ success: false, message: 'Approval not found' });

    // Same visibility rule as the document itself
    const doc = approval.document;
    if (req.user.role === 'viewer' && doc.status !== 'APPROVED') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (req.user.role === 'approver') {
      const isAssigned = await prisma.documentApproval.count({
        where: { documentId: doc.id, approverId: req.user.id, status: 'PENDING' },
      });
      if (doc.status !== 'APPROVED' && isAssigned === 0 && approval.approverId !== req.user.id) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    if (!approval.qrPath || !require('fs').existsSync(approval.qrPath)) {
      return res.status(404).json({ success: false, message: 'QR not ready yet for this approval.' });
    }

    await auditService.log(req.user.id, 'APPROVAL_QR_DOWNLOADED', 'document_approvals', approval.id, req.ip);
    res.setHeader('Content-Type',        'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="qr_level${approval.level}_${doc.regulatoryId}.png"`);
    res.setHeader('Cache-Control',       'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma',              'no-cache');
    res.setHeader('Expires',            '0');
    res.sendFile(require('path').resolve(approval.qrPath));
  } catch (err) { next(err); }
};
