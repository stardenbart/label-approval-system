// backend/src/controllers/public.controller.js
'use strict';

const { prisma }     = require('../config/prisma');
const auditService   = require('../services/audit.service');

// GET /api/e/:uuid — Public page data for the ORIGINAL document QR.
// Shows full document identity + entire approval history.
// UNCHANGED — kept for documents/QRs generated before the per-approval change,
// and as the entry point for the original-file QR which is not approver-specific.
exports.esignPage = async (req, res, next) => {
  try {
    const doc = await prisma.document.findFirst({
      where: { id: req.params.uuid, deletedAt: null },
      select: {
        id:                 true,
        regulatoryId:       true,
        labelName:          true,
        fileNameOriginal:   true,
        status:             true,
        tanggalTerima:      true,
        tanggalPeriksa:     true,
        tanggalVerifikasi:  true,
        tanggalApproval:    true,
        createdAt:          true,
        productCategory: {
          select: {
            name:    true,
            subGroup: true,
            group:   { select: { name: true, code: true } },
          },
        },
        approvals: {
          orderBy: { level: 'asc' },
          select: {
            level:    true,
            status:   true,
            signedAt: true,
            notes:    true,
            approver: { select: { name: true, role: true } },
          },
        },
        // IMPORTANT: No file paths exposed here!
      },
    });

    if (!doc) return res.status(404).json({ success: false, message: 'Document not found', code: 'NOT_FOUND' });

    await auditService.log(null, 'QR_ESIGN_ACCESSED', 'documents', doc.id, req.ip, { uuid: doc.id });

    res.json({ success: true, data: doc });
  } catch (err) { next(err); }
};

// GET /api/e/approval/:approvalId — Public page data for a SPECIFIC approval's QR.
// Shows the document identity + highlights ONLY this approver's signature,
// with the rest of the approval chain shown as supporting context (so a
// viewer can still see "this is step 2 of 3", but the headline identity is
// the one approver whose QR was scanned).
exports.esignApprovalPage = async (req, res, next) => {
  try {
    const approval = await prisma.documentApproval.findFirst({
      where: { id: req.params.approvalId },
      select: {
        id:         true,
        level:      true,
        status:     true,
        signedAt:   true,
        notes:      true,
        approver:   { select: { name: true, role: true } },
        document: {
          select: {
            id:                 true,
            regulatoryId:       true,
            labelName:          true,
            fileNameOriginal:   true,
            status:             true,
            tanggalTerima:      true,
            tanggalPeriksa:     true,
            tanggalVerifikasi:  true,
            tanggalApproval:    true,
            createdAt:          true,
            deletedAt:          true,
            productCategory: {
              select: {
                name:     true,
                subGroup: true,
                group:    { select: { name: true, code: true } },
              },
            },
            approvals: {
              orderBy: { level: 'asc' },
              select: {
                id:       true,
                level:    true,
                status:   true,
                signedAt: true,
                approver: { select: { name: true, role: true } },
              },
            },
          },
        },
        // IMPORTANT: No file paths exposed here either!
      },
    });

    if (!approval || approval.document.deletedAt) {
      return res.status(404).json({ success: false, message: 'Approval not found', code: 'NOT_FOUND' });
    }

    await auditService.log(null, 'QR_APPROVAL_ACCESSED', 'document_approvals', approval.id, req.ip, {
      documentId: approval.document.id,
      level:      approval.level,
    });

    const { deletedAt, ...doc } = approval.document;

    res.json({
      success: true,
      data: {
        // This approval — the one whose QR was scanned, the headline identity
        approval: {
          id:       approval.id,
          level:    approval.level,
          status:   approval.status,
          signedAt: approval.signedAt,
          notes:    approval.notes,
          approver: approval.approver,
        },
        // Full document context, including the complete chain for transparency
        document: doc,
      },
    });
  } catch (err) { next(err); }
};