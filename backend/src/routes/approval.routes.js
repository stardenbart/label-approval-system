// backend/src/routes/approval.routes.js
const router  = require('express').Router();
const ctrl    = require('../controllers/approval.controller');
const { authenticate }    = require('../middleware/auth');
const { requireRole }     = require('../middleware/roleCheck');
const { apiLimiter }      = require('../middleware/rateLimiter');

router.use(authenticate);

// Approve a document (with optional drag-and-drop position)
router.post('/:approvalId/approve', apiLimiter,
  requireRole('superadmin','admin','approver'), ctrl.approve);

// Decline a document
router.post('/:approvalId/decline', apiLimiter,
  requireRole('superadmin','admin','approver'), ctrl.decline);

// Get suggested next approvers for a document
router.get('/:approvalId/suggested-approvers', apiLimiter, ctrl.suggestedApprovers);

// Download this approval's own QR (authenticated) — the QR that was stamped
// onto the PDF and that points to /e/approval/:approvalId publicly.
// ?preview=true renders the same QR in memory when the stamped file does not
// exist yet, so the approval screen can show the real stamp before approving.
router.get('/:approvalId/qr', apiLimiter, ctrl.downloadQr);

// Superadmin reassign
router.patch('/:approvalId/reassign', apiLimiter,
  requireRole('superadmin'), ctrl.reassign);

module.exports = router;