// backend/src/routes/labelcheck.routes.js
const router   = require('express').Router();
const ctrl     = require('../controllers/labelcheck.controller');
const { authenticate }   = require('../middleware/auth');
const { requireRole }    = require('../middleware/roleCheck');
const { uploadImage }    = require('../middleware/upload');
const { apiLimiter, uploadLimiter } = require('../middleware/rateLimiter');

router.use(authenticate, apiLimiter);

// Parameters (config)
router.get('/parameters',          ctrl.listParameters);
router.post('/parameters',         requireRole('superadmin','admin'), ctrl.createParameter);
router.patch('/parameters/:id',    requireRole('superadmin','admin'), ctrl.updateParameter);
router.delete('/parameters/:id',   requireRole('superadmin','admin'), ctrl.deleteParameter);

// Form per document
router.get('/form/:documentId',    ctrl.getForm);
router.post('/form/:documentId',   requireRole('superadmin'), ctrl.saveForm);
router.patch('/form/:documentId/submit', requireRole('superadmin'), ctrl.submitForm);

// Remarks image upload + serve
router.post('/remarks/:resultId/image', uploadLimiter, uploadImage, ctrl.uploadRemarkImage);
router.get('/remarks/:remarkId/image',  apiLimiter, ctrl.serveRemarkImage);

module.exports = router;
