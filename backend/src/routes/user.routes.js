// backend/src/routes/user.routes.js
const router  = require('express').Router();
const ctrl    = require('../controllers/user.controller');
const { authenticate } = require('../middleware/auth');
const { requireRole }  = require('../middleware/roleCheck');
const { apiLimiter }   = require('../middleware/rateLimiter');

router.use(authenticate);

router.get('/',         apiLimiter, requireRole('superadmin'), ctrl.list);
router.post('/',        apiLimiter, requireRole('superadmin'), ctrl.create);
router.get('/:id',      apiLimiter, requireRole('superadmin'), ctrl.getOne);
router.patch('/:id',    apiLimiter, requireRole('superadmin'), ctrl.update);
router.delete('/:id',   apiLimiter, requireRole('superadmin'), ctrl.deactivate);
router.post('/:id/reset-password', apiLimiter, requireRole('superadmin'), ctrl.resetPassword);

// Product approver mappings
router.get('/mappings/all',       apiLimiter, requireRole('superadmin'), ctrl.getMappings);
router.post('/mappings',          apiLimiter, requireRole('superadmin'), ctrl.setMapping);
router.delete('/mappings/:id',    apiLimiter, requireRole('superadmin'), ctrl.deleteMapping);

module.exports = router;
