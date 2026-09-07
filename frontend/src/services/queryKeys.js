// frontend/src/services/queryKeys.js
//
// Satu-satunya tempat query key React Query didefinisikan.
//
// Sebelum berkas ini ada, key ditulis ulang di tiap halaman dan sudah menyimpang
// di dua tempat — dengan akibat yang nyata di layar:
//
//   • Daftar grup produk di-cache sebagai ['groups'] di ProductCategoryPage &
//     UserManagementPage, tapi ['product-groups'] di DocumentListPage. Menyimpan
//     grup baru meng-invalidate ['groups'] saja, sehingga filter grup di daftar
//     dokumen tetap menampilkan data lama.
//   • Daftar kategori di-cache sebagai ['categories'] di ProductCategoryPage tapi
//     ['product-categories'] di DocumentUploadPage & UserManagementPage. Menambah
//     produk baru tidak pernah memunculkannya di dropdown halaman upload.
//
// Impor dari sini, jangan pernah menulis literal key lagi.

export const qk = {
  // ── Dokumen & approval ──────────────────────────────────────────
  documents:      (filters)    => ['documents', filters],
  document:       (id)         => ['document', id],
  myPending:      ()           => ['my-pending'],
  approval:       (approvalId) => ['approval', approvalId],

  // ── Notifikasi ──────────────────────────────────────────────────
  notifications:      () => ['notifications', 'list'],
  notificationCount:  () => ['notifications', 'count'],

  // ── Master data ─────────────────────────────────────────────────
  users:              ()           => ['users'],
  approverCandidates: ()           => ['approver-candidates'],
  mappings:           ()           => ['mappings'],
  suggestLevel0:      (categoryId) => ['suggest-level0', categoryId],
  productGroups:      ()           => ['product-groups'],
  productCategories:  ()           => ['product-categories'],
  settings:           ()           => ['settings'],

  // ── Label check ─────────────────────────────────────────────────
  labelCheckParams: ()      => ['label-check-params'],
  labelCheckForm:   (docId) => ['label-check-form', docId],

  // ── Lain-lain ───────────────────────────────────────────────────
  audit: (filters) => ['audit', filters],

  // ── Halaman publik (tanpa login) ────────────────────────────────
  esignPublic:         (uuid)       => ['esign-public', uuid],
  esignApprovalPublic: (approvalId) => ['esign-approval-public', approvalId],
};

// Prefix untuk invalidate sekelompok query sekaligus. React Query mencocokkan
// key secara prefix, jadi ['documents'] mengenai setiap kombinasi filter.
export const qkPrefix = {
  documents:    ['documents'],
  notifications: ['notifications'],
  audit:        ['audit'],
  suggestLevel0: ['suggest-level0'],
};
