// backend/src/routes/audit.routes.js
const router  = require('express').Router();
const ctrl    = require('../controllers/audit.controller');
const { authenticate } = require('../middleware/auth');
const { requireRole }  = require('../middleware/roleCheck');
const { apiLimiter }   = require('../middleware/rateLimiter');

router.use(authenticate, apiLimiter, requireRole('superadmin'));

router.get('/', ctrl.list);

module.exports = router;
