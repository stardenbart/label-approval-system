// backend/src/services/notification.service.js
'use strict';

const { prisma } = require('../config/prisma');
const logger     = require('../config/logger');

/**
 * Create a notification for a user
 */
async function create({ userId, type, title, message, entityType, entityId }) {
  try {
    return await prisma.notification.create({
      data: { userId, type, title, message, entityType, entityId },
    });
  } catch (err) {
    logger.error('Failed to create notification:', err.message);
  }
}

module.exports = { create };
