// backend/src/services/id-generator.service.js
'use strict';

const { v4: uuidv4 } = require('uuid');
const { prisma }     = require('../config/prisma');

/**
 * Generate Regulatory ID: [PRODCODE]-[DDMMYY_terima]-[DDMMYY_periksa]-[4RAND]
 * Collision handling: retry max 5x on random 4-char
 *
 * @param {object} opts
 * @param {string} opts.productCode     - e.g. 'CYD01'
 * @param {Date}   opts.tanggalTerima
 * @param {Date}   opts.tanggalPeriksa
 * @returns {{ id: string, regulatoryId: string }}
 */
async function generate({ productCode, tanggalTerima, tanggalPeriksa }) {
  function pad(d) {
    const date = new Date(d);
    const dd   = String(date.getDate()).padStart(2, '0');
    const mm   = String(date.getMonth() + 1).padStart(2, '0');
    const yy   = String(date.getFullYear()).slice(-2);
    return `${dd}${mm}${yy}`;
  }

  const terimaStr  = pad(tanggalTerima);
  const periksaStr = pad(tanggalPeriksa);
  const prefix     = `${productCode}-${terimaStr}-${periksaStr}`;

  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const docId = uuidv4();

  for (let attempt = 0; attempt < 5; attempt++) {
    const rand4 = Array.from({ length: 4 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
    const regulatoryId = `${prefix}-${rand4}`;

    const exists = await prisma.document.findFirst({ where: { regulatoryId } });
    if (!exists) {
      return { id: docId, regulatoryId };
    }
  }

  throw new Error('Failed to generate unique Regulatory ID after 5 attempts');
}

module.exports = { generate };
