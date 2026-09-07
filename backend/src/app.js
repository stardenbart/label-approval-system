// backend/src/app.js
'use strict';

require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');
const cookieParser = require('cookie-parser');
const cron     = require('node-cron');
const stampedCache = require('./services/stamped-cache.service');
const compressService = require('./services/pdf-compress.service');
const { randomUUID } = require('crypto');

const logger         = require('./config/logger');
const { prisma }     = require('./config/prisma');
const routes         = require('./routes');
const { errorHandler } = require('./middleware/errorHandler');

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

// ─── Cron ─────────────────────────────────────────────────────────
//
// PM2 menjalankan aplikasi ini dalam mode cluster dengan beberapa instance
// (lihat deploy/ecosystem.config.js: instances: 2). Tanpa penjaga, SETIAP
// instance memasang cron-nya sendiri, sehingga tiap pekerjaan berjalan
// sebanyak jumlah worker — dua DELETE bersamaan pada tabel yang sama, dua
// proses membuang isi cache yang sama.
//
// PM2 memberi nomor urut instance lewat NODE_APP_INSTANCE. Hanya nomor 0 yang
// menjalankan cron. Di luar PM2 (dev, atau mode fork) variabel itu tidak ada,
// dan cron tetap jalan seperti biasa.
const CRON_INSTANCE = process.env.NODE_APP_INSTANCE;
const isCronWorker  = CRON_INSTANCE === undefined || CRON_INSTANCE === '0';

if (!isCronWorker) {
  logger.info(`[CRON] Instance ${CRON_INSTANCE} tidak menjalankan cron (hanya instance 0)`);
}

/** Pasang cron hanya pada worker yang berhak. */
const schedule = (expr, name, fn) => {
  if (!isCronWorker) return;
  cron.schedule(expr, async () => {
    try {
      await fn();
    } catch (err) {
      logger.error(`[CRON] ${name} error:`, err);
    }
  });
};

// ─── Cron: cleanup old notifications (>30 days) ───────────────────
schedule('0 2 * * *', 'notification cleanup', async () => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const { count } = await prisma.notification.deleteMany({
    where: { createdAt: { lt: thirtyDaysAgo }, isRead: true },
  });
  logger.info(`[CRON] Cleaned ${count} old notifications`);
});

// ─── Cron: cleanup expired/revoked refresh tokens (MED-03) ────────
schedule('0 3 * * *', 'refresh token cleanup', async () => {
  const { count } = await prisma.refreshToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: new Date() } }, { revoked: true }] },
  });
  logger.info(`[CRON] Cleaned ${count} expired/revoked refresh tokens`);
});

// ─── Cron: buang cache PDF hasil penempelan yang sudah tua ────────
// Isinya bisa dibuat ulang kapan saja dari original.pdf + stamp manifest
// (~25 ms), jadi membuangnya tidak pernah menghilangkan data — hanya
// menahan agar foldernya tidak tumbuh tanpa batas.
schedule('30 3 * * *', 'stamped cache eviction', () => {
  const { removed, bytesFreed } = stampedCache.evict();
  if (removed) logger.info(`[CRON] Cache stamped: ${removed} berkas dibuang, ${(bytesFreed / 1048576).toFixed(1)} MB`);
});

// ─── Start ────────────────────────────────────────────────────────
async function start() {
  try {
    await prisma.$connect();
    logger.info('✅ DB connected');

    app.listen(PORT, '127.0.0.1', () => {
      logger.info(`🚀 DAL Backend running on port ${PORT}`);
    });

    // Probe Ghostscript saat start, bukan saat approval pertama.
    //
    // Kompresi arsip sengaja gagal diam-diam kalau gs tidak ada — supaya tidak
    // ada alur kerja yang berhenti gara-gara dependensi opsional. Efek
    // sampingnya: kalau lupa memasangnya di server, tidak ada yang menyadari
    // sampai seseorang membandingkan ukuran berkas berminggu-minggu kemudian.
    // Satu baris di log boot menutup celah itu.
    compressService.isAvailable().catch(() => { /* sudah dilog di dalam */ });
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
