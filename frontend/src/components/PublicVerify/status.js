// frontend/src/components/PublicVerify/status.js
//
// Keputusan "status apa → tampil bagaimana", dipisahkan dari JSX supaya bisa
// diuji tanpa merender apa pun.
//
// Halaman per-level dulu keliru justru di sini: warna dan kalimatnya ditulis
// mati sebagai "sukses", jadi approval yang MENUNGGU maupun yang DITOLAK
// sama-sama tampil hijau dengan tulisan "Signature Verification Successful".

/** Nada warna per status. Status dokumen memakai PENDING_APPROVAL untuk keadaan
 *  yang sama dengan PENDING pada approval. */
export function toneFor(status) {
  if (status === 'APPROVED') return 'green';
  if (status === 'DECLINED') return 'red';
  return 'amber';
}

/** Judul dan kalimat pembuka hero, mengikuti status LEVEL yang QR-nya dipindai. */
export function headlineFor(status, approverName) {
  const n = approverName || '—';
  if (status === 'APPROVED') return { title: 'Disetujui', lead: `Ditandatangani oleh ${n}` };
  if (status === 'DECLINED') return { title: 'Ditolak',   lead: `Ditolak oleh ${n}` };
  return { title: 'Menunggu Persetujuan', lead: `Ditugaskan kepada ${n} — belum ditandatangani` };
}

/**
 * Apakah status dokumen berlawanan arah dengan status level ini?
 *
 * Rantai L0 setuju -> L1 setuju -> L2 TOLAK membuat dokumen DITOLAK, sementara
 * QR Level 1 tetap berstatus APPROVED — dan itu memang benar untuk level itu.
 * Tanpa peringatan, orang yang memindai QR Level 1 pada label tercetak akan
 * menyimpulkan labelnya sah.
 */
export function documentContradicts(approvalStatus, docStatus) {
  return (approvalStatus === 'APPROVED' && docStatus === 'DECLINED')
      || (approvalStatus === 'DECLINED' && docStatus === 'APPROVED');
}

/**
 * Kalimat penutup. Hanya boleh berbunyi "terverifikasi" kalau level ini memang
 * disetujui DAN dokumennya tidak berakhir ditolak.
 */
export function closingNote(approvalStatus, docStatus) {
  if (approvalStatus === 'APPROVED' && docStatus === 'DECLINED') {
    return {
      tone: 'amber',
      title: 'Tanda tangan level ini sah, tetapi dokumen ditolak',
      body:  'Persetujuan pada level ini benar tercatat, namun dokumen tidak lolos pada level berikutnya. Label ini tidak sah untuk dipakai.',
    };
  }
  if (approvalStatus === 'APPROVED') {
    return {
      tone: 'blue',
      title: 'Tanda tangan terverifikasi',
      body:  'QR Code ini terhubung langsung dengan data approval yang tersimpan dalam sistem Digital Approval Label dan dapat digunakan sebagai bukti validasi tanda tangan elektronik internal.',
    };
  }
  if (approvalStatus === 'DECLINED') {
    return {
      tone: 'red',
      title: 'Level ini ditolak',
      body:  'Tidak ada tanda tangan elektronik yang sah pada level ini. Periksa riwayat persetujuan di bawah untuk melihat alasannya.',
    };
  }
  return {
    tone: 'amber',
    title: 'Belum ada tanda tangan pada level ini',
    body:  'Level ini masih menunggu persetujuan. Data di halaman ini akan berubah dengan sendirinya begitu approval dilakukan — QR yang sama tidak perlu dicetak ulang.',
  };
}

/** Kelas Tailwind untuk kotak penutup, dipisah supaya nada di atas tetap murni. */
export const NOTE_CLASS = {
  blue:  'bg-blue-50 border-blue-200 text-blue-900',
  amber: 'bg-amber-50 border-amber-200 text-amber-900',
  red:   'bg-red-50 border-red-200 text-red-900',
};
