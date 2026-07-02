// backend/src/routes/public.routes.js
const router  = require('express').Router();
const ctrl    = require('../controllers/public.controller');
const { publicLimiter } = require('../middleware/rateLimiter');

// IMPORTANT: this specific route MUST be registered BEFORE the wildcard
// '/:uuid' route below. Express matches routes in registration order —
// if '/:uuid' came first, a request to '/approval/xyz' would match it with
// uuid='approval' and ctrl.esignApprovalPage would never be reached.

// Public page for a SPECIFIC approval's QR (Staff / SPV / Marketing each
// have their own QR pointing here) — shows that approver's identity +
// document context.
router.get('/approval/:approvalId', publicLimiter, ctrl.esignApprovalPage);

// Public page for the ORIGINAL document QR — full document identity +
// entire approval history. Must stay last since it's a catch-all param route.
router.get('/:uuid', publicLimiter, ctrl.esignPage);

module.exports = router;