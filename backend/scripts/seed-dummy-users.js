// backend/scripts/seed-dummy-users.js
'use strict';

/**
 * Akun uji untuk staging/development — SATU akun per role, plus pemetaan
 * approver supaya rantai Level 0 -> 1 -> 2 melewati tiga orang yang berbeda.
 *
 *   node scripts/seed-dummy-users.js
 *
 * Tanpa ini, seeder utama memetakan seluruh level ke superadmin, sehingga satu
 * orang menyetujui tiga kali dan alur perpindahan antar-approver tidak pernah
 * benar-benar teruji.
 *
 * MENOLAK jalan kalau NODE_ENV=production. Password di berkas ini sengaja
 * seragam dan lemah; ia tidak boleh pernah ada di sistem yang dipakai orang.
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const { MAX_APPROVAL_LEVEL } = require('../src/config/stamp');

const prisma = new PrismaClient();

const PASSWORD = process.env.DUMMY_PASSWORD || 'Dummy@1234';

const USERS = [
  { email: 'superadmin@dummy.com', name: 'Dummy Superadmin', role: 'superadmin' },
  { email: 'admin@dummy.com',      name: 'Dummy Admin',      role: 'admin'      },
  { email: 'approver@dummy.com',   name: 'Dummy Approver',   role: 'approver'   },
  { email: 'uploader@dummy.com',   name: 'Dummy Uploader',   role: 'uploader'   },
  { email: 'viewer@dummy.com',     name: 'Dummy Viewer',     role: 'viewer'     },
];

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('DITOLAK: skrip ini membuat akun dengan password lemah dan seragam.');
    console.error('Jangan pernah dijalankan di produksi.');
    process.exitCode = 1;
    return;
  }

  const hash = await bcrypt.hash(PASSWORD, 12);
  const made = {};

  for (const u of USERS) {
    const row = await prisma.user.upsert({
      where:  { email: u.email },
      update: { name: u.name, role: u.role, isActive: true, passwordHash: hash, mustChangePwd: false },
      create: { ...u, passwordHash: hash, isActive: true, mustChangePwd: false },
    });
    made[u.role] = row;
    console.log(`  ${u.role.padEnd(11)} ${u.email}`);
  }

  // ─── Pemetaan approver ───────────────────────────────────────────
  //
  // Level 0 MENENTUKAN siapa yang menerima dokumen saat upload; level 1 dan 2
  // hanya menyarankan, karena approver sebelumnya yang memilih penerus. Tetap
  // dipetakan supaya sarannya masuk akal dan alur tiga orang bisa diuji apa
  // adanya tanpa memilih manual tiap kali.
  const chain = {
    0: made.approver,   // Staff Regulatory menerima upload
    1: made.admin,      // SPV
    2: made.superadmin, // Manager / final
  };

  const groups = await prisma.productGroup.findMany();
  if (groups.length === 0) {
    console.log('\nTidak ada product group — jalankan "node prisma/seed.js" dulu.');
    return;
  }

  let mapped = 0;
  for (const g of groups) {
    for (let level = 0; level <= MAX_APPROVAL_LEVEL; level++) {
      const who = chain[level];
      if (!who) continue;
      // Baris default grup (productCategoryId null) tidak punya unique
      // constraint untuk di-upsert — lihat catatan di schema.prisma.
      const existing = await prisma.productApproverMapping.findFirst({
        where: { productGroupId: g.id, level, productCategoryId: null },
      });
      if (existing) {
        await prisma.productApproverMapping.update({
          where: { id: existing.id }, data: { approverUserId: who.id },
        });
      } else {
        await prisma.productApproverMapping.create({
          data: { productGroupId: g.id, approverUserId: who.id, level },
        });
      }
      mapped++;
    }
  }

  console.log(`\n  password semua akun : ${PASSWORD}`);
  console.log(`  pemetaan approver   : ${mapped} baris di ${groups.length} product group`);
  console.log('  rantai              : L0 approver@ -> L1 admin@ -> L2 superadmin@');
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
