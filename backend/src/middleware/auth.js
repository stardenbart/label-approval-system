// backend/src/middleware/auth.js
const jwt    = require('jsonwebtoken');
const { prisma } = require('../config/prisma');

function authenticate(req, res, next) {
  try {
    // Access token is always sent via Authorization: Bearer header
    // (access_token is stored in memory/Zustand, not in a cookie)
    const authHeader = req.headers.authorization;
    const token = (authHeader && authHeader.startsWith('Bearer '))
      ? authHeader.split(' ')[1]
      : null;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHORIZED' });
    }

    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    req.user = { id: payload.sub, role: payload.role, email: payload.email };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token', code: 'INVALID_TOKEN' });
  }
}

// Optional auth — sets req.user if token present, but doesn't block
function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    if (token) {
      const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      req.user = { id: payload.sub, role: payload.role, email: payload.email };
    }
  } catch (_) { /* ignore */ }
  next();
}

module.exports = { authenticate, optionalAuth };
