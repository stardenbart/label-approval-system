// backend/src/routes/product.routes.js
const router  = require('express').Router();
const ctrl    = require('../controllers/product.controller');
const { authenticate }   = require('../middleware/auth');
const { requireRole }    = require('../middleware/roleCheck');
const { apiLimiter, uploadLimiter } = require('../middleware/rateLimiter');
const multer  = require('multer');

// multer: store xlsx in memory (no disk write needed — parsed directly in service)
const xlsxUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10MB cap
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.originalname.toLowerCase().endsWith('.xlsx');
    if (ok) return cb(null, true);
    cb(Object.assign(new Error('Only .xlsx files are allowed'), { code: 'INVALID_FILE_TYPE' }));
  },
}).single('file');

// Wrap multer to return clean JSON errors instead of Express default HTML
function xlsxMiddleware(req, res, next) {
  xlsxUpload(req, res, (err) => {
    if (!err) return next();
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    res.status(status).json({ success: false, message: err.message, code: err.code || 'UPLOAD_ERROR' });
  });
}

router.use(authenticate, apiLimiter);

// ─── Groups ───────────────────────────────────────────────────────
router.get('/groups',           ctrl.listGroups);
router.post('/groups',          requireRole('superadmin', 'admin'), ctrl.createGroup);
router.patch('/groups/:id',     requireRole('superadmin', 'admin'), ctrl.updateGroup);
router.delete('/groups/:id',    requireRole('superadmin', 'admin'), ctrl.deleteGroup);

// ─── Categories ───────────────────────────────────────────────────
router.get('/categories',       ctrl.listCategories);
router.post('/categories',      requireRole('superadmin', 'admin'), ctrl.createCategory);
router.patch('/categories/:id', requireRole('superadmin', 'admin'), ctrl.updateCategory);
router.delete('/categories/:id',requireRole('superadmin', 'admin'), ctrl.deleteCategory);

// ─── Import / Export ──────────────────────────────────────────────
// IMPORTANT: these MUST be registered BEFORE any /:id wildcard routes.
// Express matches routes top-to-bottom; if /:id were above, the literal
// string "export" would be captured as the :id param and never reach here.

router.get('/export',
  requireRole('superadmin', 'admin'),
  ctrl.exportExcel
);

router.post('/import',
  requireRole('superadmin', 'admin'),
  uploadLimiter,
  xlsxMiddleware,
  ctrl.importExcel
);

module.exports = router;
