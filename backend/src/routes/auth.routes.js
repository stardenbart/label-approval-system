// backend/src/routes/auth.routes.js
const router      = require('express').Router();
const controller  = require('../controllers/auth.controller');
const { loginLimiter } = require('../middleware/rateLimiter');
const { authenticate } = require('../middleware/auth');

router.post('/login',   loginLimiter, controller.login);
router.post('/refresh', controller.refresh);
router.post('/logout',  authenticate, controller.logout);
router.post('/forgot-password', controller.forgotPassword);
router.post('/change-password', authenticate, controller.changePassword);

module.exports = router;
