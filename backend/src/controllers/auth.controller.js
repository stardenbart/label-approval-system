// backend/src/controllers/auth.controller.js
'use strict';

const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const Joi    = require('joi');
const { prisma }     = require('../config/prisma');
const auditService   = require('../services/audit.service');
const emailService   = require('../services/email.service');
const notifService   = require('../services/notification.service');

// ─── DB-backed login attempt tracking (CRIT-04) ───────────────────
// Safe for PM2 cluster mode unlike in-memory Map
// Uses audit_logs table to avoid extra migration — or use a dedicated table
// Here we use a simple approach: track in DB via a JSON meta field in AuditLog

const MAX_ATTEMPTS   = parseInt(process.env.LOGIN_LOCK_ATTEMPTS    || 5);
const LOCK_DURATION  = parseInt(process.env.LOGIN_LOCK_DURATION_MS || 1800000); // 30min
const ATTEMPT_WINDOW = 900000; // 15 min window to count attempts

async function checkLock(ip, email) {
  const windowStart = new Date(Date.now() - LOCK_DURATION);
  // Check for a recent ACCOUNT_LOCKED log — if exists and within lock duration, still locked
  const lockLog = await prisma.auditLog.findFirst({
    where: {
      action:    'ACCOUNT_LOCKED',
      ipAddress: ip,
      meta:      { path: '$.email', equals: email },
      createdAt: { gt: windowStart },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (lockLog) return true;
  return false;
}

async function recordAttempt(ip, email, success) {
  if (success) return; // successful login — no tracking needed

  const attemptWindowStart = new Date(Date.now() - ATTEMPT_WINDOW);
  const recentFailures = await prisma.auditLog.count({
    where: {
      action:    'LOGIN_FAILED',
      ipAddress: ip,
      meta:      { path: '$.email', equals: email },
      createdAt: { gt: attemptWindowStart },
    },
  });

  // +1 for the current attempt being recorded (not yet saved)
  if (recentFailures + 1 >= MAX_ATTEMPTS) {
    // Lock the account — record in audit log
    await prisma.auditLog.create({
      data: {
        action:    'ACCOUNT_LOCKED',
        ipAddress: ip,
        meta:      { email, lockedUntil: new Date(Date.now() + LOCK_DURATION).toISOString() },
      },
    });
  }
}

function generateTokens(user) {
  const payload = { sub: user.id, role: user.role, email: user.email };

  const accessToken = jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
  });

  const refreshToken = crypto.randomBytes(64).toString('hex');
  return { accessToken, refreshToken };
}

function setRefreshCookie(res, token) {
  res.cookie('refresh_token', token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days
    path:     '/api/auth',
  });
}

// ─── Login ────────────────────────────────────────────────────────
exports.login = async (req, res, next) => {
  try {
    const schema = Joi.object({
      email:    Joi.string().email().required(),
      password: Joi.string().min(1).required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });

    const ip = req.ip;

    // CRIT-04: DB-backed lock check (safe across PM2 cluster workers)
    if (await checkLock(ip, value.email)) {
      return res.status(429).json({
        success: false,
        message: 'Account temporarily locked due to too many failed attempts. Try again in 30 minutes.',
        code:    'ACCOUNT_LOCKED',
      });
    }

    const user = await prisma.user.findUnique({ where: { email: value.email } });

    if (!user || !user.isActive) {
      await auditService.log(null, 'LOGIN_FAILED', null, null, ip, { email: value.email });
      await recordAttempt(ip, value.email, false);
      return res.status(401).json({ success: false, message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }

    const match = await bcrypt.compare(value.password, user.passwordHash);
    if (!match) {
      await auditService.log(user.id, 'LOGIN_FAILED', 'users', user.id, ip, { email: value.email });
      await recordAttempt(ip, value.email, false);
      return res.status(401).json({ success: false, message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }

    // Successful login
    await auditService.log(user.id, 'LOGIN_SUCCESS', 'users', user.id, ip);

    const { accessToken, refreshToken } = generateTokens(user);

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.refreshToken.create({ data: { userId: user.id, tokenHash, expiresAt } });

    setRefreshCookie(res, refreshToken);

    res.json({
      success: true,
      data: {
        accessToken,
        user: {
          id:            user.id,
          name:          user.name,
          email:         user.email,
          role:          user.role,
          mustChangePwd: user.mustChangePwd,
        },
      },
    });
  } catch (err) { next(err); }
};

// ─── Refresh ──────────────────────────────────────────────────────
exports.refresh = async (req, res, next) => {
  try {
    const raw = req.cookies?.refresh_token;
    if (!raw) return res.status(401).json({ success: false, message: 'No refresh token', code: 'UNAUTHORIZED' });

    const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
    const stored    = await prisma.refreshToken.findFirst({
      where: { tokenHash, revoked: false, expiresAt: { gt: new Date() } },
      include: { user: true },
    });

    if (!stored || !stored.user.isActive) {
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token', code: 'UNAUTHORIZED' });
    }

    // Rotate: revoke old, issue new
    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked: true } });

    const { accessToken, refreshToken: newRaw } = generateTokens(stored.user);
    const newHash   = crypto.createHash('sha256').update(newRaw).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.refreshToken.create({ data: { userId: stored.userId, tokenHash: newHash, expiresAt } });

    setRefreshCookie(res, newRaw);

    res.json({ success: true, data: { accessToken } });
  } catch (err) { next(err); }
};

// ─── Logout ───────────────────────────────────────────────────────
exports.logout = async (req, res, next) => {
  try {
    const raw = req.cookies?.refresh_token;
    if (raw) {
      const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
      await prisma.refreshToken.updateMany({ where: { tokenHash }, data: { revoked: true } });
    }
    res.clearCookie('refresh_token', { path: '/api/auth' });
    await auditService.log(req.user.id, 'LOGOUT', 'users', req.user.id, req.ip);
    res.json({ success: true, message: 'Logged out' });
  } catch (err) { next(err); }
};

// ─── Forgot Password (notif to superadmin) ────────────────────────
exports.forgotPassword = async (req, res, next) => {
  try {
    const { error, value } = Joi.object({ email: Joi.string().email().required() }).validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });

    const user = await prisma.user.findUnique({ where: { email: value.email } });
    // Always respond OK to prevent email enumeration
    if (user && user.isActive) {
      const admins = await prisma.user.findMany({ where: { role: 'superadmin', isActive: true } });
      for (const admin of admins) {
        await notifService.create({
          userId:     admin.id,
          type:       'FORGOT_PASSWORD',
          title:      'Permintaan Reset Password',
          message:    `${user.name} (${user.email}) meminta reset password.`,
          entityType: 'users',
          entityId:   user.id,
        });
        await emailService.sendForgotPasswordAlert(admin.email, user);
      }
    }
    res.json({ success: true, message: 'Jika email terdaftar, permintaan sudah dikirim ke Superadmin.' });
  } catch (err) { next(err); }
};

// ─── Change Password ──────────────────────────────────────────────
exports.changePassword = async (req, res, next) => {
  try {
    const schema = Joi.object({
      currentPassword: Joi.string().required(),
      newPassword:     Joi.string().min(8).pattern(/^(?=.*[A-Z])(?=.*[0-9])/).required()
        .messages({ 'string.pattern.base': 'Password must contain at least 1 uppercase and 1 number' }),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const match = await bcrypt.compare(value.currentPassword, user.passwordHash);
    if (!match) return res.status(400).json({ success: false, message: 'Current password is incorrect' });

    const passwordHash = await bcrypt.hash(value.newPassword, 12);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash, mustChangePwd: false },
    });

    // MED-06: Revoke ALL existing sessions after password change
    await prisma.refreshToken.updateMany({
      where: { userId: req.user.id, revoked: false },
      data:  { revoked: true },
    });
    res.clearCookie('refresh_token', { path: '/api/auth' });

    await auditService.log(req.user.id, 'PASSWORD_CHANGED', 'users', req.user.id, req.ip);
    res.json({ success: true, message: 'Password updated successfully. Please log in again.' });
  } catch (err) { next(err); }
};
