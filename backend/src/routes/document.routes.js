// backend/src/routes/document.routes.js
const router     = require('express').Router();
const ctrl       = require('../controllers/document.controller');
const { authenticate }    = require('../middleware/auth');
const { requireRole }     = require('../middleware/roleCheck');
const { uploadPdf }       = require('../middleware/upload');
const { uploadLimiter, apiLimiter } = require('../middleware/rateLimiter');

router.use(authenticate);

// List & Upload
router.get('/',              apiLimiter, ctrl.list);
router.get('/my-pending',    apiLimiter, ctrl.myPending);
router.post('/',             uploadLimiter, uploadPdf, ctrl.upload);

// Single document
router.get('/:id',           apiLimiter, ctrl.getOne);
router.delete('/:id',        requireRole('superadmin','admin'), ctrl.remove);

// File serve (protected download)
router.get('/:id/original',      apiLimiter, ctrl.serveOriginal);
router.get('/:id/signed-level0', apiLimiter, ctrl.serveSignedLevel0);
router.get('/:id/signed-level1', apiLimiter, ctrl.serveSignedLevel1);
router.get('/:id/signed',        apiLimiter, ctrl.serveSigned);
router.get('/:id/report',        apiLimiter, ctrl.serveReport);

// QR download
router.get('/:id/approvals/:approvalId/qr', apiLimiter, ctrl.downloadApprovalQr);
router.get('/:id/qr/esign',                 apiLimiter, ctrl.downloadQrEsign);
router.get('/:id/qr/original',              apiLimiter, ctrl.downloadQrOriginal);

module.exports = router;
