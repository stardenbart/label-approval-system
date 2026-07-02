// backend/src/middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_LOGIN_WINDOW_MS  || 900000),
  max:      parseInt(process.env.RATE_LIMIT_LOGIN_MAX        || 5),
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Too many login attempts, try again later', code: 'RATE_LIMITED' },
  keyGenerator: (req) => req.ip + ':' + (req.body?.email || ''),
});

const uploadLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_UPLOAD_WINDOW_MS || 60000),
  max:      parseInt(process.env.RATE_LIMIT_UPLOAD_MAX       || 10),
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Upload rate limit exceeded', code: 'RATE_LIMITED' },
  keyGenerator: (req) => req.user?.id || req.ip,
});

const publicLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_PUBLIC_WINDOW_MS || 60000),
  max:      parseInt(process.env.RATE_LIMIT_PUBLIC_MAX       || 60),
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Rate limit exceeded', code: 'RATE_LIMITED' },
});

const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_API_WINDOW_MS || 60000),
  max:      parseInt(process.env.RATE_LIMIT_API_MAX       || 100),
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'API rate limit exceeded', code: 'RATE_LIMITED' },
  keyGenerator: (req) => req.user?.id || req.ip,
});

module.exports = { loginLimiter, uploadLimiter, publicLimiter, apiLimiter };
