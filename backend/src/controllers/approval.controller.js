// backend/src/controllers/approval.controller.js
'use strict';

// FIX LOG:
// FIX-05a — suggestedApprovers: isFinalLevel now uses mapping-based check (see resolveIsFinalLevel).
// FIX-05b — approve(): isFinalLevel determined by absence of a mapping for level+1, not a
//            hardcoded `>= 2` or fragile `_max.level || 2` fallback.
// FIX-06  — Kebijakan QR kini dipilih per dokumen: satu QR dokumen atau QR
//            approval pada setiap level. Keduanya memakai satu manifest dan
//            satu arsip final, tanpa salinan PDF per level.

const fs     = require('fs');
const path   = require('path');
const Joi    = require('joi')
const { prisma }    = require('../config/prisma');
const pdfService    = require('../services/pdf.service');
const { QR_SIZE_LIMIT_PT, FOOTER_SIZE_LIMIT_PT } = require('../config/stamp');
const qrService      = require('../services/qr.service');
const notifService  = require('../services/notification.service');
const emailService  = require('../services/email.service');
const auditService  = require('../services/audit.service');
const logger        = require('../config/logger');

const positionSchema = Joi.object({
  pageNumber: Joi.number().integer().min(1).required(),
  xPercent:   Joi.number().min(0).max(100).required(),
  yPercent:   Joi.number().min(0).max(100).required(),
  // Batas TEKNIS saja — pagar keselamatan yang sama dipakai saat upload maupun
  // approve. Batas kebijakan (rentang yang boleh dipakai sehari-hari) datang
  // dari System Settings dan diperiksa terpisah lewat pdfService.checkQrSize.
  // Dulu di sini tertulis .max(200) sebagai angka mati, sehingga menaikkan batas
  // lewat System Settings tidak pernah benar-benar berlaku.
  widthPt:    Joi.number().min(QR_SIZE_LIMIT_PT.min).max(QR_SIZE_LIMIT_PT.max).required(),
  heightPt:   Joi.number().min(QR_SIZE_LIMIT_PT.min).max(QR_SIZE_LIMIT_PT.max).required(),
});

const footerPositionSchema = Joi.object({
  pageNumber: Joi.number().integer().min(1).required(),
  xPercent:   Joi.number().min(0).max(100).required(),
  yPercent:   Joi.number().min(0).max(100).required(),
  widthPt:    Joi.number().min(FOOTER_SIZE_LIMIT_PT.minW).max(FOOTER_SIZE_LIMIT_PT.maxW).required(),
  heightPt:   Joi.number().min(FOOTER_SIZE_LIMIT_PT.minH).max(FOOTER_SIZE_LIMIT_PT.maxH).required(),
  fontSize:   Joi.number().min(FOOTER_SIZE_LIMIT_PT.minFont).max(FOOTER_SIZE_LIMIT_PT.maxFont).default(7),
  rotation:   Joi.number().valid(0, 90, 180, 270).default(0),
});

// ─── Helper: determine if an approval is at the final level ──────────────────
// Ceiling first, mapping data second. pdf.service can only read/write levels
// 0..MAX_APPROVAL_LEVEL, so the top level is always final regardless of what the
// mapping table says. Without this, a stray level+1 mapping row — only reachable
// by a direct DB insert, since setMapping refuses it — would spawn an approval
// that overlayEsign can never sign ("Unsupported approval level"), leaving the
// document stuck with no way to finish it.
async function resolveIsFinalLevel(approval) {
  if (approval.level >= pdfService.MAX_APPROVAL_LEVEL) return true;

  const groupId = approval.document?.productCategory?.groupId;
  if (!groupId) return false;

  const nextMapping = await prisma.productApproverMapping.findFirst({
    where: { productGroupId: groupId, level: approval.level + 1 },
  });

  return !nextMapping;
}

// ─── Approve ──────────────────────────────────────────────────────────────────
exports.approve = async (req, res, next) => {
  try {
    const approval = await prisma.documentApproval.findFirst({
      where:   { id: req.params.approvalId, status: 'PENDING', document: { deletedAt: null } },
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

    // Ukuran QR harus berada dalam rentang yang disetel superadmin. Diperiksa di
    // sini supaya jawabannya 400 dengan angka batasnya, bukan gambar yang
    // diam-diam mengecil di PDF.
    if (value.position) {
      const sizeCheck = pdfService.checkQrSize(value.position, await pdfService.getSettings());
      if (!sizeCheck.ok) {
        return res.status(400).json({ success: false, message: sizeCheck.message, code: 'QR_SIZE_OUT_OF_RANGE' });
      }
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

    // Kebijakan dipilih per dokumen. Mode `document` mempertahankan satu QR
    // ringkas; mode `per_level` menambahkan QR approval aktual setiap kali level
    // menyetujui. Keduanya tetap memakai satu original + satu arsip final.
    const isLevel0 = approval.level === 0;
    const qrStampMode = approval.document.qrStampMode || 'document';
    const stampsThisLevel = isLevel0 || qrStampMode === 'per_level';
    const position = value.position || null;

    if (qrStampMode === 'per_level' && approval.document.qrLayout === 'manual' && !isLevel0 && !position) {
      return res.status(400).json({
        success: false,
        message: 'Layout manual memerlukan posisi QR untuk level ini. Geser QR sebelum menyetujui.',
        code: 'QR_POSITION_REQUIRED',
      });
    }

    const docStorageDir = path.dirname(approval.document.pathOriginal);
    let approvalQrPath = null;
    try {
      approvalQrPath = await qrService.generateApprovalQr(approval.id, docStorageDir, approval.level);
    } catch (qrErr) {
      logger.error('Approval QR generation failed:', qrErr);
      return res.status(500).json({ success: false, message: 'Failed to generate approval QR', code: 'QR_ERROR' });
    }

    if (position && !stampsThisLevel) {
      return res.status(400).json({
        success: false,
        message: 'Dokumen ini memakai mode satu QR; posisi hanya dapat diatur di Level 0',
      });
    }

    // ── Level 0 membekukan keputusan, bukan menulis berkas ──────────────
    //
    // Yang disimpan adalah manifest: posisi QR, posisi & isi footer, berkas QR
    // yang dipakai, sha256 sumbernya. Berkas hasil penempelannya dulu ditulis
    // di sini dan disimpan selamanya, padahal isinya salinan utuh original.pdf
    // yang bedanya cuma beberapa KB — 50% dari seluruh storage habis untuk itu.
    // Sekarang berkasnya dirender saat diminta (~25 ms) dan hanya diarsipkan
    // permanen ketika approval final tercapai.
    let manifest = null;
    if (isLevel0) {
      try {
        manifest = await pdfService.resolveStampManifest(
          approval.document, position, value.footerPosition || null, req.user.id,
          { approval, qrFile: approvalQrPath },
        );
      } catch (pdfErr) {
        logger.error('Stamp manifest resolution failed:', pdfErr);
        return res.status(500).json({ success: false, message: 'Failed to process PDF signature', code: 'PDF_ERROR' });
      }
    } else if (qrStampMode === 'per_level') {
      try {
        manifest = await pdfService.appendApprovalQr(
          approval.document,
          approval.document.stampManifest,
          approval,
          approvalQrPath,
          position,
        );
      } catch (pdfErr) {
        logger.error('Per-level QR manifest update failed:', pdfErr);
        return res.status(500).json({ success: false, message: 'Failed to add this level QR to PDF', code: 'PDF_ERROR' });
      }
    }
    const stampEntry = manifest
      ? pdfService.manifestQrs(manifest).find(qr =>
          qrStampMode === 'per_level' ? qr.approvalId === approval.id : isLevel0
        )
      : null;

    // ── Approval final menulis SATU arsip permanen ──────────────────────
    //
    // Inilah berkas yang harus bisa ditunjukkan bertahun-tahun kemudian dalam
    // bentuk yang persis sama, jadi ia disimpan sungguhan — bukan dirender ulang
    // setiap kali diminta.
    let archivePath  = null;
    let wroteArchive = false;
    if (isFinalLevel) {
      const effectiveManifest = manifest || approval.document.stampManifest;
      try {
        if (effectiveManifest) {
          archivePath = await pdfService.writeFinalArchive(
            { ...approval.document, stampManifest: effectiveManifest }, effectiveManifest,
          );
          wroteArchive = true;
        } else {
          // Dokumen lama, di-stamp sebelum manifest ada: berkas turunannya sudah
          // di disk dan itulah arsipnya. Jangan dirender ulang — hasil render
          // hari ini belum tentu sama dengan yang dulu benar-benar dicetak.
          archivePath = approval.document.pathSignedLevel0;
        }
      } catch (pdfErr) {
        logger.error('Final archive write failed:', pdfErr);
        return res.status(500).json({ success: false, message: 'Failed to write final signed PDF', code: 'PDF_ERROR' });
      }
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
            // Hanya approval yang benar-benar menghasilkan berkas yang mengisi
            // ini. Level 0 tidak lagi menulis apa pun, jadi nilainya null.
            pathSigned:     archivePath,
            qrPath:         approvalQrPath,
          },
        });

        if (stampEntry) {
          await tx.documentEsignPosition.upsert({
            where: { approvalId: approval.id },
            update: {
              pageNumber: stampEntry.page,
              xPercent:   stampEntry.xPct,
              yPercent:   stampEntry.yPct,
              widthPt:    stampEntry.wPt,
              heightPt:   stampEntry.hPt,
            },
            create: {
              documentId: approval.documentId,
              approvalId: approval.id,
              pageNumber: stampEntry.page,
              xPercent:   stampEntry.xPct,
              yPercent:   stampEntry.yPct,
              widthPt:    stampEntry.wPt,
              heightPt:   stampEntry.hPt,
            },
          });
        }

        if (isLevel0) {
          const fp = value.footerPosition;
          const footerSettings = await pdfService.getSettings();
          const footerData = {
            pageNumber: fp?.pageNumber ?? footerSettings.footerDefaultPage,
            xPercent:   fp?.xPercent   ?? footerSettings.footerDefaultXPercent,
            yPercent:   fp?.yPercent   ?? footerSettings.footerDefaultYPercent,
            widthPt:    fp?.widthPt    ?? footerSettings.footerDefaultWidthPt,
            heightPt:   fp?.heightPt   ?? footerSettings.footerDefaultHeightPt,
            fontSize:   fp?.fontSize   ?? footerSettings.footerDefaultFontSize,
            rotation:   fp?.rotation   ?? footerSettings.footerDefaultRotation,
          };
          await tx.documentFooterPosition.upsert({
            where:  { documentId: approval.documentId },
            create: { documentId: approval.documentId, ...footerData },
            update: footerData,
          });
        }

        // Hanya ada SATU berkas hasil penempelan, dan ia baru ditulis saat
        // approval final. Nama kolom pathSignedLevel0/pathSignedFinal
        // dipertahankan supaya dokumen lama tetap terbaca; untuk dokumen baru
        // keduanya menunjuk berkas arsip yang sama.
        if (isFinalLevel) {
          const documentUpdateData = {
            status:          'APPROVED',
            pathSignedFinal: archivePath,
            pathSignedLevel0: archivePath,
            tanggalApproval: new Date(),
          };
          if (manifest) documentUpdateData.stampManifest = manifest;
          if (approval.level === 1) documentUpdateData.tanggalVerifikasi = new Date();

          await tx.document.update({
            where: { id: approval.documentId },
            data: documentUpdateData,
          });
        } else {
          const documentUpdateData = {};
          if (manifest) documentUpdateData.stampManifest = manifest;
          if (approval.level === 1) documentUpdateData.tanggalVerifikasi = new Date();

          if (Object.keys(documentUpdateData).length > 0) {
            await tx.document.update({
              where: { id: approval.documentId },
              data:  documentUpdateData,
            });
          }
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
      // Hanya buang berkas yang transaksi ini sendiri tulis. Kalau archivePath
      // menunjuk berkas turunan lama milik dokumen legacy, menghapusnya berarti
      // menghancurkan arsip yang sah.
      if (wroteArchive && archivePath && fs.existsSync(archivePath)) {
        try { fs.unlinkSync(archivePath); } catch (_) {}
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
      where:   { id: req.params.approvalId, status: 'PENDING', document: { deletedAt: null } },
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
      where:   { id: req.params.approvalId, document: { deletedAt: null } },
      include: { document: { include: { productCategory: true, footerPosition: true } } },
    });
    if (!approval) return res.status(404).json({ success: false, message: 'Approval not found' });
    if (approval.approverId !== req.user.id && req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: 'Not authorized for this approval' });
    }

    const groupId   = approval.document.productCategory.groupId;
    const nextLevel = approval.level + 1;

    // Same helper approve() uses — the UI must not offer a "next approver" for a
    // level that approve() will then treat as final (FIX-05a).
    const isFinalLevel = await resolveIsFinalLevel(approval);
    const qrStampMode = approval.document.qrStampMode || 'document';
    const qrLayout = approval.document.qrLayout || 'horizontal';
    const stampsThisLevel = approval.level === 0 || qrStampMode === 'per_level';
    const qrPosition = stampsThisLevel
      ? await pdfService.suggestedApprovalQrPosition(
          approval.document,
          approval.document.stampManifest,
          qrLayout,
        )
      : null;

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
        qrStampMode,
        qrLayout,
        qrPosition,
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

    const approval = await prisma.documentApproval.findFirst({
      where: { id: req.params.approvalId, status: 'PENDING', document: { deletedAt: null } },
    });
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
      where:   { id: req.params.approvalId, document: { deletedAt: null } },
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

    // ?preview=true — the approval screen asking "what will my stamp look like?".
    // approval.qrPath only appears once approve() runs (generateApprovalQr), so
    // a PENDING approval has nothing on disk; render the same QR in memory
    // instead of 404-ing. Without the flag the behaviour is unchanged: this
    // endpoint hands back the actual stored QR, or 404.
    const wantsPreview = req.query.preview === 'true';
    const hasStampedQr = !!approval.qrPath && fs.existsSync(approval.qrPath);

    if (!hasStampedQr && !wantsPreview) {
      return res.status(404).json({ success: false, message: 'QR not ready yet for this approval.' });
    }

    res.setHeader('Content-Type',  'image/png');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma',        'no-cache');
    res.setHeader('Expires',      '0');

    if (!hasStampedQr) {
      // Deliberately not audit-logged: this fires on every render of the approval
      // page and is not a download of a signed artifact.
      const png = await qrService.renderApprovalQr(approval.id);
      res.setHeader('Content-Disposition', `inline; filename="qr_preview_level${approval.level}.png"`);
      return res.send(png);
    }

    if (!wantsPreview) {
      await auditService.log(req.user.id, 'APPROVAL_QR_DOWNLOADED', 'document_approvals', approval.id, req.ip);
    }
    res.setHeader(
      'Content-Disposition',
      `${wantsPreview ? 'inline' : 'attachment'}; filename="qr_level${approval.level}_${doc.regulatoryId}.png"`
    );
    res.sendFile(path.resolve(approval.qrPath));
  } catch (err) { next(err); }
};
