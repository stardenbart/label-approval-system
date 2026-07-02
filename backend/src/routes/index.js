// backend/src/routes/index.js
const router = require('express').Router();

const authRoutes         = require('./auth.routes');
const documentRoutes     = require('./document.routes');
const approvalRoutes     = require('./approval.routes');
const userRoutes         = require('./user.routes');
const productRoutes      = require('./product.routes');
const notificationRoutes = require('./notification.routes');
const settingsRoutes     = require('./settings.routes');
const auditRoutes        = require('./audit.routes');
const publicRoutes       = require('./public.routes');
const labelCheckRoutes   = require('./labelcheck.routes');

// Public — no auth required
router.use('/auth',   authRoutes);
router.use('/e',      publicRoutes);          // QR E-Sign public page data

// Protected
router.use('/documents',     documentRoutes);
router.use('/approvals',     approvalRoutes);
router.use('/users',         userRoutes);
router.use('/products',      productRoutes);
router.use('/notifications', notificationRoutes);
router.use('/settings',      settingsRoutes);
router.use('/audit',         auditRoutes);
router.use('/label-check',   labelCheckRoutes);

module.exports = router;
