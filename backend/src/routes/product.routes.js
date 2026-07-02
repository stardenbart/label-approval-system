// backend/src/routes/product.routes.js
const router  = require('express').Router();
const ctrl    = require('../controllers/product.controller');
const { authenticate }  = require('../middleware/auth');
const { requireRole }   = require('../middleware/roleCheck');
const { apiLimiter, uploadLimiter } = require('../middleware/rateLimiter');
const { uploadExcel }   = require('../middleware/upload');

router.use(authenticate, apiLimiter);

router.get('/groups',             ctrl.listGroups);
router.post('/groups',            requireRole('superadmin','admin'), ctrl.createGroup);
router.patch('/groups/:id',       requireRole('superadmin','admin'), ctrl.updateGroup);
router.delete('/groups/:id',      requireRole('superadmin','admin'), ctrl.deleteGroup);

router.get('/categories',         ctrl.listCategories);
router.post('/categories',        requireRole('superadmin','admin'), ctrl.createCategory);
router.patch('/categories/:id',   requireRole('superadmin','admin'), ctrl.updateCategory);
router.delete('/categories/:id',  requireRole('superadmin','admin'), ctrl.deleteCategory);

// Import/Export — same permission tier as category writes.
router.get('/categories/export',  requireRole('superadmin','admin'), ctrl.exportCategories);
router.post('/categories/import', requireRole('superadmin','admin'), uploadLimiter, uploadExcel, ctrl.importCategories);

module.exports = router;
