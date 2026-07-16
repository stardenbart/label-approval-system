// backend/prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ─── System Settings ─────────────────────────────────────────
  const settings = [
    { key: 'qr_default_width_pt',  value: '100', description: 'Lebar default QR stamp (PDF points)' },
    { key: 'qr_default_height_pt', value: '100', description: 'Tinggi default QR stamp (PDF points)' },
    { key: 'qr_default_page',      value: '1',   description: 'Halaman default penempatan QR stamp' },
    { key: 'qr_default_x_percent', value: '85',  description: 'Posisi X default (% lebar halaman)' },
    { key: 'qr_default_y_percent', value: '5',   description: 'Posisi Y default (% tinggi halaman dari bawah untuk PDF)' },
    { key: 'qr_min_width_pt',      value: '60',  description: 'Minimum ukuran QR (points)' },
    { key: 'qr_max_width_pt',      value: '200', description: 'Maksimum ukuran QR (points)' },
    { key: 'footer_default_x_percent', value: '3',  description: 'Posisi X default stamp footer (% lebar halaman)' },
    { key: 'footer_default_y_percent', value: '97', description: 'Posisi Y default stamp footer (% tinggi halaman dari atas)' },
    { key: 'footer_default_width_pt',  value: '220', description: 'Lebar default stamp footer (PDF points)' },
    { key: 'footer_default_height_pt', value: '30',  description: 'Tinggi default stamp footer (PDF points)' },
    { key: 'footer_default_page',      value: '1',   description: 'Halaman default penempatan stamp footer' },
    { key: 'footer_default_font_size', value: '7',   description: 'Ukuran font default stamp footer (pt)' },
    { key: 'footer_default_rotation',  value: '0',   description: 'Orientasi default stamp footer (0=Horizontal, 90=Vertical, 180=Flip Horizontal, 270=Flip Vertical)' },
  ];

  for (const s of settings) {
    await prisma.systemSetting.upsert({
      where:  { key: s.key },
      update: {},
      create: s,
    });
  }
  console.log('System settings seeded');

  // ─── Superadmin ───────────────────────────────────────────────
  const seedPassword = process.env.SEED_ADMIN_PASSWORD || 'Cimory@2025';
  const passwordHash = await bcrypt.hash(seedPassword, 12);
  await prisma.user.upsert({
    where:  { email: 'abdullah.farauk@cimory.com' },
    update: {},
    create: {
      name:         'Abdullah Farauk',
      email:        'abdullah.farauk@cimory.com',
      passwordHash,
      role:         'superadmin',
      isActive:     true,
      mustChangePwd: true,
    },
  });
  console.log(`Superadmin created — email: abdullah.farauk@cimory.com  pass: ${seedPassword}`);

  // ─── Product Groups & Categories ─────────────────────────────
  const groupData = [
    { code: 'CYD01', name: 'CYD' },
    { code: 'ESL01', name: 'ESL' },
    { code: 'UHTM1', name: 'UHT Milk' },
    { code: 'YGHT1', name: 'Yoghurt' },
    { code: 'STCK1', name: 'Stickpack' },
    { code: 'OTH01', name: 'Others' },
  ];

  const groups = {};
  for (const g of groupData) {
    const grp = await prisma.productGroup.upsert({
      where:  { code: g.code },
      update: {},
      create: g,
    });
    groups[g.code] = grp.id;
  }

  const categories = [
    { groupCode: 'CYD01', name: 'CYD 240ml',     subGroup: 'Regular',       productCode: 'CYD01' },
    { groupCode: 'CYD01', name: 'CYD 240ml',     subGroup: 'No Added Sugar', productCode: 'CYD02' },
    { groupCode: 'CYD01', name: 'CYD 65ml',      subGroup: null,            productCode: 'CYD03' },
    { groupCode: 'CYD01', name: 'CYD UHT 200ml', subGroup: null,            productCode: 'CYD04' },
    { groupCode: 'CYD01', name: 'CYD UHT 125ml', subGroup: null,            productCode: 'CYD05' },
    { groupCode: 'ESL01', name: 'ESL 950ml',     subGroup: null,            productCode: 'ESL01' },
    { groupCode: 'UHTM1', name: 'UHT Milk 250ml', subGroup: null,           productCode: 'UHT01' },
    { groupCode: 'UHTM1', name: 'UHT Milk 225ml', subGroup: null,           productCode: 'UHT02' },
    { groupCode: 'UHTM1', name: 'UHT Milk 125ml', subGroup: null,           productCode: 'UHT03' },
    { groupCode: 'YGHT1', name: 'Yoghurt Squeeze', subGroup: 'Regular',     productCode: 'YGH01' },
    { groupCode: 'YGHT1', name: 'Yoghurt Squeeze', subGroup: 'Bites',       productCode: 'YGH02' },
    { groupCode: 'STCK1', name: 'Stickpack',     subGroup: '30gr',          productCode: 'STK01' },
    { groupCode: 'STCK1', name: 'Stickpack',     subGroup: '40gr',          productCode: 'STK02' },
    { groupCode: 'OTH01', name: 'Eat Milk',      subGroup: null,            productCode: 'OTH01' },
    { groupCode: 'OTH01', name: 'Frutas',        subGroup: null,            productCode: 'OTH02' },
  ];

  for (const cat of categories) {
    const existing = await prisma.productCategory.findFirst({
      where: { productCode: cat.productCode },
    });
    if (!existing) {
      await prisma.productCategory.create({
        data: {
          groupId:     groups[cat.groupCode],
          name:        cat.name,
          subGroup:    cat.subGroup,
          productCode: cat.productCode,
        },
      });
    }
  }
  console.log('Product groups & categories seeded');

  // ─── Default Product-Approver Mappings ─────────────────────────
  // Level 0 = Staff RnI (only relevant when a document is uploaded by an
  //           `uploader` user — see document.controller.js upload()).
  //           Direct upload by `superadmin` bypasses level 0 entirely,
  //           exactly like before this feature existed.
  // Level 1 = SPV
  // Seed the superadmin as both Level 0 and Level 1 approver for ALL groups.
  // Superadmin should update this via User Management → Product-Approver Mapping.
  const superadminUser = await prisma.user.findFirst({ where: { role: 'superadmin' } });
  if (superadminUser) {
    // Group-default rows (productCategoryId null) have no DB unique constraint to upsert
    // against — see schema.prisma note on ProductApproverMapping — so find-then-create.
    async function upsertGroupDefault(groupId, level) {
      const existing = await prisma.productApproverMapping.findFirst({
        where: { productGroupId: groupId, level, productCategoryId: null },
      });
      if (existing) return;
      await prisma.productApproverMapping.create({
        data: { productGroupId: groupId, approverUserId: superadminUser.id, level },
      });
    }

    const allGroups = await prisma.productGroup.findMany();
    for (const grp of allGroups) {
      await upsertGroupDefault(grp.id, 0);
      await upsertGroupDefault(grp.id, 1);
    }
    console.log(`Default Level 0 & Level 1 mappings created (→ ${superadminUser.name}). Update via User Management.`);
  }

  // ─── Sample Uploader user (role: uploader) ──────────────────────
  // Uploads documents WITHOUT e-sign; document goes to Level 0 (Staff RnI)
  // as PENDING instead of auto-approved. Change/remove this account for
  // real deployments — this is here so the flow is testable out of the box.
  const uploaderPassword = process.env.SEED_UPLOADER_PASSWORD || 'Uploader@DAL2026!';
  const uploaderHash = await bcrypt.hash(uploaderPassword, 12);
  await prisma.user.upsert({
    where:  { email: 'uploader@dal.internal' },
    update: {},
    create: {
      name:          'Sample Uploader',
      email:         'uploader@dal.internal',
      passwordHash:  uploaderHash,
      role:          'uploader',
      isActive:      true,
      mustChangePwd: true,
    },
  });
  console.log(`Sample uploader created — email: uploader@dal.internal  pass: ${uploaderPassword}`);

  // ─── Label Check Parameters (Sprint 3) ───────────────────────
  const params = [
    'Nama Produk',
    'Komposisi',
    'Berat Netto / Isi Bersih',
    'Nama & Alamat Produsen / Importir',
    'Negara Asal',
    'Halal',
    'Nomor Registrasi (BPOM / Dinkes)',
    'Tanggal Produksi / Expired',
    'Kode Produksi / Batch',
    'Informasi Nilai Gizi',
    'Petunjuk Penyimpanan',
    'Petunjuk Penggunaan / Penyajian',
    'Peringatan / Allergen',
    'Barcode / QR Code',
    'Desain Visual & Warna',
  ];

  for (let i = 0; i < params.length; i++) {
    const existing = await prisma.labelCheckParameter.findFirst({
      where: { name: params[i] },
    });
    if (!existing) {
      await prisma.labelCheckParameter.create({
        data: { name: params[i], orderIndex: i + 1 },
      });
    }
  }
  console.log('Label check parameters seeded');

  console.log('\nSeeding complete!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
