// backend/src/routes/settings.routes.js
const router  = require('express').Router();
const ctrl    = require('../controllers/settings.controller');
const { authenticate } = require('../middleware/auth');
const { requireRole }  = require('../middleware/roleCheck');
const { apiLimiter }   = require('../middleware/rateLimiter');

router.use(authenticate, apiLimiter);

router.get('/',          ctrl.getAll);
router.patch('/',        requireRole('superadmin'), ctrl.update);
router.post('/reset',    requireRole('superadmin'), ctrl.resetToDefaults);

module.exports = router;
