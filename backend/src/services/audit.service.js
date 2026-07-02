// backend/src/services/audit.service.js
'use strict';

const { prisma } = require('../config/prisma');
const logger     = require('../config/logger');

/**
 * Log an audit event
 * @param {string|null} userId
 * @param {string} action
 * @param {string|null} entity
 * @param {string|null} entityId
 * @param {string|null} ipAddress
 * @param {object|null} meta
 */
async function log(userId, action, entity, entityId, ipAddress, meta) {
  try {
    await prisma.auditLog.create({
      data: {
        userId:    userId   || null,
        action,
        entity:    entity   || null,
        entityId:  entityId ? String(entityId) : null,
        ipAddress: ipAddress || null,
        meta:      meta || undefined,
      },
    });
  } catch (err) {
    logger.error('Audit log failed:', err.message);
  }
}

module.exports = { log };
