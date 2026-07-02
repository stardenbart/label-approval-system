// backend/src/middleware/errorHandler.js
const logger = require('../config/logger');

function errorHandler(err, req, res, _next) {
  logger.error('Unhandled error:', {
    message:  err.message,
    stack:    err.stack,
    url:      req.url,
    method:   req.method,
    userId:   req.user?.id,
  });

  // Prisma errors
  if (err.code === 'P2002') {
    return res.status(409).json({ success: false, message: 'Duplicate entry', code: 'CONFLICT' });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ success: false, message: 'Record not found', code: 'NOT_FOUND' });
  }

  const status  = err.status || err.statusCode || 500;
  const message = status < 500 ? err.message : 'Internal server error';

  res.status(status).json({ success: false, message, code: err.code || 'SERVER_ERROR' });
}

// Helper to create HTTP errors
function createError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.code   = code || `HTTP_${status}`;
  return err;
}

module.exports = { errorHandler, createError };
