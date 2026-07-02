// backend/src/routes/notification.routes.js
const router  = require('express').Router();
const ctrl    = require('../controllers/notification.controller');
const { authenticate } = require('../middleware/auth');
const { apiLimiter }   = require('../middleware/rateLimiter');

router.use(authenticate, apiLimiter);

router.get('/',           ctrl.list);
router.get('/count',      ctrl.unreadCount);
router.patch('/:id/read', ctrl.markRead);
router.patch('/read-all', ctrl.markAllRead);

module.exports = router;
