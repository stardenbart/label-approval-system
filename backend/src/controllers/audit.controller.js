// backend/src/controllers/audit.controller.js
'use strict';

const { prisma } = require('../config/prisma');

exports.list = async (req, res, next) => {
  try {
    const { page=1, limit=50, action, entity, userId, dateFrom, dateTo } = req.query;
    const skip  = (parseInt(page)-1) * parseInt(limit);
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
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id:true, name:true, email:true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      success: true,
      data: { items, pagination: { page: parseInt(page), limit: parseInt(limit), total } },
    });
  } catch (err) { next(err); }
};
