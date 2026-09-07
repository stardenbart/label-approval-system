// frontend/src/services/cacheSync.js
//
// "Aksi apa membuat data apa jadi basi" — dikumpulkan di satu tempat.
//
// Setiap mutasi memanggil satu fungsi dari sini, bukan menyusun daftar
// invalidateQueries-nya sendiri. Alasannya: efek sebuah aksi hampir selalu
// melebar ke layar lain. Approve satu dokumen mengubah antrean pending, daftar
// dokumen, detail dokumen, lonceng notifikasi, dan audit log sekaligus —
// gampang sekali kelewat satu kalau daftarnya ditulis ulang di tiap halaman.
//
// Semua fungsi mengembalikan Promise dari invalidateQueries. Umumnya tidak perlu
// di-await: React Query menandai data basi seketika, lalu me-refetch query yang
// sedang terpasang; halaman tujuan setelah navigate ikut refetch saat mount.

import { qk, qkPrefix } from './queryKeys';

/**
 * Approve / decline / reassign sebuah approval.
 * Menyentuh paling banyak layar dari semua aksi di aplikasi ini.
 */
export function afterApprovalAction(qc, { documentId, approvalId } = {}) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: qkPrefix.documents }),
    qc.invalidateQueries({ queryKey: qk.myPending() }),
    qc.invalidateQueries({ queryKey: qkPrefix.notifications }),
    qc.invalidateQueries({ queryKey: qkPrefix.audit }),
    documentId ? qc.invalidateQueries({ queryKey: qk.document(documentId) }) : null,
    approvalId ? qc.invalidateQueries({ queryKey: qk.approval(approvalId) }) : null,
  ].filter(Boolean));
}

/** Upload dokumen baru — memunculkan antrean baru untuk approver level 0. */
export function afterDocumentUpload(qc) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: qkPrefix.documents }),
    qc.invalidateQueries({ queryKey: qk.myPending() }),
    qc.invalidateQueries({ queryKey: qkPrefix.notifications }),
    qc.invalidateQueries({ queryKey: qkPrefix.audit }),
  ]);
}

/** Hapus dokumen (soft delete). */
export function afterDocumentDelete(qc, documentId) {
  qc.removeQueries({ queryKey: qk.document(documentId) });
  return Promise.all([
    qc.invalidateQueries({ queryKey: qkPrefix.documents }),
    qc.invalidateQueries({ queryKey: qk.myPending() }),
    qc.invalidateQueries({ queryKey: qkPrefix.audit }),
  ]);
}

/**
 * Perubahan master produk (grup / kategori / import Excel).
 * Kategori ikut dipakai halaman upload dan mapping approver, jadi keduanya
 * harus ikut basi — inilah yang dulu terlewat karena key-nya menyimpang.
 */
export function afterProductChange(qc) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: qk.productGroups() }),
    qc.invalidateQueries({ queryKey: qk.productCategories() }),
    qc.invalidateQueries({ queryKey: qk.mappings() }),
    qc.invalidateQueries({ queryKey: qkPrefix.suggestLevel0 }),
  ]);
}

/** Tambah/ubah/nonaktifkan user, reset password, dan perubahan mapping approver. */
export function afterUserChange(qc) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: qk.users() }),
    qc.invalidateQueries({ queryKey: qk.approverCandidates() }),
    qc.invalidateQueries({ queryKey: qk.mappings() }),
    qc.invalidateQueries({ queryKey: qkPrefix.suggestLevel0 }),
    qc.invalidateQueries({ queryKey: qkPrefix.audit }),
  ]);
}

/** Ubah / reset system settings — dipakai posisi default QR & footer stamp. */
export function afterSettingsChange(qc) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: qk.settings() }),
    qc.invalidateQueries({ queryKey: qkPrefix.audit }),
  ]);
}

/** Simpan / submit Label Check Form, termasuk upload gambar remark. */
export function afterLabelCheckChange(qc, documentId) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: qk.labelCheckForm(documentId) }),
    qc.invalidateQueries({ queryKey: qk.document(documentId) }),
    qc.invalidateQueries({ queryKey: qkPrefix.audit }),
  ]);
}

/** Tandai notifikasi terbaca (satu atau semua). */
export function afterNotificationRead(qc) {
  return qc.invalidateQueries({ queryKey: qkPrefix.notifications });
}

/**
 * Logout — buang seluruh cache. Tanpa ini, data user sebelumnya masih tersimpan
 * di memori dan sempat terlihat oleh user berikutnya yang login di tab yang sama
 * sebelum refetch pertama selesai.
 */
export function afterLogout(qc) {
  qc.clear();
}
