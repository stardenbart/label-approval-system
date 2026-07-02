// backend/src/config/logger.js
const winston = require('winston');
require('winston-daily-rotate-file');
const path = require('path');

const logDir = process.env.LOG_DIR || path.join(__dirname, '../../logs');

const fileRotateTransport = new winston.transports.DailyRotateFile({
  dirname:       logDir,
  filename:      'dal-%DATE%.log',
  datePattern:   'YYYY-MM-DD',
  maxFiles:      '30d',
  zippedArchive: true,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    fileRotateTransport,
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

module.exports = logger;
