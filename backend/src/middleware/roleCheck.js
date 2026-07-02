// backend/src/middleware/roleCheck.js

/**
 * requireRole('superadmin', 'admin')
 * Returns 403 if req.user.role is not in the allowed list
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHORIZED' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions', code: 'FORBIDDEN' });
    }
    next();
  };
}

module.exports = { requireRole };
