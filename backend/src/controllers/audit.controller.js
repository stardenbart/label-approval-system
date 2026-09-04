// backend/src/controllers/audit.controller.js
'use strict';

const { prisma } = require('../config/prisma');

exports.list = async (req, res, next) => {
  try {
    // MED-08 / HIGH-03: clamp before use — an unclamped page=0 produces a negative
    // skip (Prisma throws → 500) and an unclamped limit lets ?limit=1000000 pull the
    // whole audit table in one request. Same pattern as document.controller.js#list.
    const { action, entity, userId, dateFrom, dateTo } = req.query;
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const skip  = (page - 1) * limit;
    const where = {};

    if (action)   where.action   = { contains: action };
    if (entity)   where.entity   = entity;
    if (userId)   where.userId   = userId;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo)   where.createdAt.lte = new Date(dateTo);
    }

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id:true, name:true, email:true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      success: true,
      data: { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } },
    });
  } catch (err) { next(err); }
};
