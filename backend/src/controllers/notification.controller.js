// backend/src/controllers/notification.controller.js
'use strict';

const { prisma } = require('../config/prisma');

exports.list = async (req, res, next) => {
  try {
    const notifs = await prisma.notification.findMany({
      where:   { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take:    20,
    });
    res.json({ success: true, data: notifs });
  } catch (err) { next(err); }
};

exports.unreadCount = async (req, res, next) => {
  try {
    const count = await prisma.notification.count({ where: { userId: req.user.id, isRead: false } });
    res.json({ success: true, data: { count } });
  } catch (err) { next(err); }
};

exports.markRead = async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data:  { isRead: true },
    });
    res.json({ success: true });
  } catch (err) { next(err); }
};

exports.markAllRead = async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false },
      data:  { isRead: true },
    });
    res.json({ success: true });
  } catch (err) { next(err); }
};
