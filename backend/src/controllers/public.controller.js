// backend/src/controllers/public.controller.js
'use strict';

const { prisma }     = require('../config/prisma');
const auditService   = require('../services/audit.service');

// Bentuk data rantai approval — SATU definisi untuk kedua halaman publik.
//
// Dulu keduanya punya select sendiri dan sudah menyimpang: halaman dokumen
// mengirim `notes` tapi tidak `id`, halaman per-level sebaliknya. Karena kedua
// halaman kini memakai komponen tampilan yang sama di frontend, bentuk datanya
// harus sama juga.
//
// Tidak ada yang baru terbuka di sini: kedua field sudah pernah dikirim salah
// satu endpoint, dan mengetahui id approval hanya membuka /e/approval/<id> —
// halaman yang isinya sama.
const CHAIN_SELECT = {
  id:       true,
  level:    true,
  status:   true,
  signedAt: true,
  notes:    true,
  approver: { select: { name: true, role: true } },
};

/**
 * Ringkasan rantai approval.
 *
 * Dipakai KEDUA halaman publik supaya keduanya tidak pernah menjawab berbeda
 * tentang dokumen yang sama. Sebelumnya ini ditulis inline hanya di esignPage,
 * sehingga halaman per-level tidak punya cara menyebut "ditolak di Level 2".
 *
 * Tidak ada "dari N": jumlah level ditentukan data mapping saat approval
 * berjalan, jadi total yang sebenarnya belum diketahui sampai rantainya tuntas.
 * Menampilkan angka total yang ditebak akan menyesatkan.
 */
function buildProgress(doc) {
  const approved = doc.approvals.filter(a => a.status === 'APPROVED');
  const pending  = doc.approvals.find(a => a.status === 'PENDING');
  const declined = doc.approvals.find(a => a.status === 'DECLINED');
  return {
    approvedCount:   approved.length,
    isComplete:      doc.status === 'APPROVED',
    isDeclined:      doc.status === 'DECLINED',
    waitingLevel:    pending ? pending.level : null,
    waitingFor:      pending?.approver?.name || null,
    declinedAtLevel: declined ? declined.level : null,
  };
}

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
        approvals: { orderBy: { level: 'asc' }, select: CHAIN_SELECT },
        // IMPORTANT: No file paths exposed here!
      },
    });

    if (!doc) return res.status(404).json({ success: false, message: 'Document not found', code: 'NOT_FOUND' });

    await auditService.log(null, 'QR_ESIGN_ACCESSED', 'documents', doc.id, req.ip, { uuid: doc.id });

    // Ringkasan rantai. Sejak satu label hanya membawa SATU QR, halaman inilah
    // satu-satunya tempat orang melihat berapa banyak yang sudah menyetujui —
    // jadi jangan biarkan pembaca menghitung sendiri dari daftar.
    res.json({ success: true, data: { ...doc, progress: buildProgress(doc) } });
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
            approvals: { orderBy: { level: 'asc' }, select: CHAIN_SELECT },
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
        // Konteks dokumen lengkap, termasuk rantai dan ringkasannya.
        //
        // `progress` WAJIB ada di sini, bukan hanya di halaman dokumen: status
        // sebuah level dan status dokumen bisa berlawanan — Level 1 disetujui,
        // lalu Level 2 menolak, dan dokumennya DITOLAK. Tanpa ringkasan ini,
        // halaman per-level tidak punya cara memberi tahu pemindai bahwa
        // labelnya sudah tidak sah.
        document: { ...doc, progress: buildProgress(doc) },
      },
    });
  } catch (err) { next(err); }
};