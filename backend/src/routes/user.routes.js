// backend/src/routes/user.routes.js
const router  = require('express').Router();
const ctrl    = require('../controllers/user.controller');
const { authenticate } = require('../middleware/auth');
const { requireRole }  = require('../middleware/roleCheck');
const { apiLimiter }   = require('../middleware/rateLimiter');

router.use(authenticate);

// NOTE: these must be registered BEFORE the `/:id` routes below, otherwise
// Express matches single-segment paths like `/approver-candidates` against
// `/:id` first (multi-segment paths like `/mappings/all` are unaffected).

// Product approver mappings (superadmin-only CRUD)
router.get('/mappings/all',       apiLimiter, requireRole('superadmin'), ctrl.getMappings);
router.post('/mappings',          apiLimiter, requireRole('superadmin'), ctrl.setMapping);
router.delete('/mappings/:id',    apiLimiter, requireRole('superadmin'), ctrl.deleteMapping);

// Level-0 suggestion + candidate list — any authenticated role (incl. uploader)
// needs these to populate the "route to" dropdown on the upload page.
router.get('/mappings/suggest-level0', apiLimiter, ctrl.suggestLevel0Approver);
router.get('/approver-candidates',     apiLimiter, ctrl.listApproverCandidates);

router.get('/',         apiLimiter, requireRole('superadmin'), ctrl.list);
router.post('/',        apiLimiter, requireRole('superadmin'), ctrl.create);
router.get('/:id',      apiLimiter, requireRole('superadmin'), ctrl.getOne);
router.patch('/:id',    apiLimiter, requireRole('superadmin'), ctrl.update);
router.delete('/:id',   apiLimiter, requireRole('superadmin'), ctrl.deactivate);
router.post('/:id/reset-password', apiLimiter, requireRole('superadmin'), ctrl.resetPassword);

module.exports = router;
