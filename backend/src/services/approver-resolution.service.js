// backend/src/services/approver-resolution.service.js
'use strict';

const { prisma } = require('../config/prisma');

/**
 * Resolve who should act as Level-0 Staff Regulatory for a document, in order:
 *   1. Product-specific override (ProductApproverMapping.productCategoryId, level 0)
 *   2. Product-group default        (ProductApproverMapping.productGroupId, level 0, productCategoryId IS NULL)
 *   3. Any active superadmin (fallback, matches document.controller.js's legacy behavior)
 *
 * @param {Object} params
 * @param {number} params.productCategoryId
 * @param {number} params.productGroupId
 * @returns {Promise<{ approver: Object|null, source: 'category'|'group'|'fallback'|null }>}
 */
async function resolveLevel0Approver({ productCategoryId, productGroupId }) {
  if (productCategoryId) {
    const categoryMapping = await prisma.productApproverMapping.findFirst({
      where:   { productCategoryId, level: 0 },
      include: { approver: true },
    });
    if (categoryMapping?.approver?.isActive) {
      return { approver: categoryMapping.approver, source: 'category' };
    }
  }

  if (productGroupId) {
    const groupMapping = await prisma.productApproverMapping.findFirst({
      where:   { productGroupId, productCategoryId: null, level: 0 },
      include: { approver: true },
    });
    if (groupMapping?.approver?.isActive) {
      return { approver: groupMapping.approver, source: 'group' };
    }
  }

  const fallback = await prisma.user.findFirst({
    where: { role: 'superadmin', isActive: true },
  });
  if (fallback) return { approver: fallback, source: 'fallback' };

  return { approver: null, source: null };
}

module.exports = { resolveLevel0Approver };
