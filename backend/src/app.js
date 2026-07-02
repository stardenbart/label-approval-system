// backend/src/app.js
'use strict';

require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');
const cookieParser = require('cookie-parser');
const cron     = require('node-cron');
const { randomUUID } = require('crypto');

const logger         = require('./config/logger');
const { prisma }     = require('./config/prisma');
const routes         = require('./routes');
const { errorHandler } = require('./middleware/errorHandler');
const notificationService = require('./services/notification.service');

const app  = express();
const PORT = process.env.PORT || 3001;

// ─── Request ID (LOW-04) ─────────────────────────────────────────
// Attach a unique ID to every request for log correlation
app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  next();
});

// ─── Trust Proxy (CRIT-05) ───────────────────────────────────────
// Must be set BEFORE any middleware that uses req.ip (rate limiting, auth, logging)
// Nginx is the first and only proxy, so trust 1 hop
app.set('trust proxy', 1);

// ─── Security ────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'"],
      imgSrc:     ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameSrc:   ["'none'"],
      objectSrc:  ["'none'"],
    },
  },
  xFrameOptions: { action: 'deny' },
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));

// ─── CORS ─────────────────────────────────────────────────────────
app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods:     ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

// ─── Body & Cookie ────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.COOKIE_SECRET));

// ─── Logging ──────────────────────────────────────────────────────
app.use(morgan('combined', {
  stream: { write: (msg) => logger.info(msg.trim()) },
}));

// ─── Routes ───────────────────────────────────────────────────────
app.use('/api', routes);

// ─── Health check ─────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date() }));

// ─── Error Handler ────────────────────────────────────────────────
app.use(errorHandler);

// ─── Cron: cleanup old notifications (>30 days) ───────────────────
cron.schedule('0 2 * * *', async () => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const { count } = await prisma.notification.deleteMany({
      where: { createdAt: { lt: thirtyDaysAgo }, isRead: true },
    });
    logger.info(`[CRON] Cleaned ${count} old notifications`);
  } catch (err) {
    logger.error('[CRON] Notification cleanup error:', err);
  }
});

// ─── Cron: cleanup expired/revoked refresh tokens (MED-03) ────────
cron.schedule('0 3 * * *', async () => {
  try {
    const { count } = await prisma.refreshToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: new Date() } }, { revoked: true }] },
    });
    logger.info(`[CRON] Cleaned ${count} expired/revoked refresh tokens`);
  } catch (err) {
    logger.error('[CRON] Refresh token cleanup error:', err);
  }
});

// ─── Start ────────────────────────────────────────────────────────
async function start() {
  try {
    await prisma.$connect();
    logger.info('✅ DB connected');

    app.listen(PORT, '127.0.0.1', () => {
      logger.info(`🚀 DAL Backend running on port ${PORT}`);
    });
  } catch (err) {
    logger.error('Fatal startup error:', err);
    process.exit(1);
  }
}

start();

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down');
  await prisma.$disconnect();
  process.exit(0);
});

module.exports = app;
