// frontend/src/components/PublicVerify/index.jsx
//
// Bagian tampilan yang dipakai BERSAMA oleh dua halaman publik:
//
//   /e/:uuid            QR dokumen — satu-satunya QR yang tercetak sekarang
//   /e/approval/:id     QR per level — masih dilayani karena label LAMA yang
//                       sudah tercetak membawanya di badannya
//
// Dulu keduanya punya salinan sendiri dan sudah menyimpang: tabel identitas
// yang satu berbahasa Inggris dengan 8 baris, yang lain berbahasa Indonesia
// dengan 7 baris — dokumen yang sama, dua jawaban berbeda. StatusBadge juga
// disalin dua kali. Semua itu sekarang hidup di sini.

import { format } from 'date-fns';
import { CheckCircle, XCircle, Clock } from 'lucide-react';

// ─── Satu status → satu tampilan ────────────────────────────────────────────
//
// Warna, ikon, dan kata tidak boleh lagi ditulis lepas di masing-masing
// halaman. Itulah yang membuat halaman per-level bisa berwarna hijau untuk
// approval yang berstatus PENDING.
export const STATUS_VIEW = {
  APPROVED: {
    icon: CheckCircle,
    badge: 'bg-green-100 text-green-800',
    card:  'bg-green-50 border-green-200',
    dot:   'bg-green-100 text-green-600',
    hero:  'border-green-200 bg-gradient-to-br from-green-50 to-white',
    heroIcon: 'bg-green-100 text-green-600',
  },
  DECLINED: {
    icon: XCircle,
    badge: 'bg-red-100 text-red-800',
    card:  'bg-red-50 border-red-200',
    dot:   'bg-red-100 text-red-500',
    hero:  'border-red-200 bg-gradient-to-br from-red-50 to-white',
    heroIcon: 'bg-red-100 text-red-500',
  },
  PENDING: {
    icon: Clock,
    badge: 'bg-amber-100 text-amber-800',
    card:  'bg-amber-50 border-amber-200',
    dot:   'bg-amber-100 text-amber-600',
    hero:  'border-amber-200 bg-gradient-to-br from-amber-50 to-white',
    heroIcon: 'bg-amber-100 text-amber-600',
  },
};

/** Status dokumen memakai nilai lain (PENDING_APPROVAL) untuk keadaan yang sama. */
export function viewFor(status) {
  if (status === 'APPROVED') return STATUS_VIEW.APPROVED;
  if (status === 'DECLINED') return STATUS_VIEW.DECLINED;
  return STATUS_VIEW.PENDING;
}

export function fmtDate(d)     { return d ? format(new Date(d), 'dd MMMM yyyy')    : '—'; }
export function fmtDateTime(d) { return d ? format(new Date(d), 'dd MMM yyyy HH:mm') : '—'; }

export function StatusBadge({ status, label }) {
  const v = viewFor(status);
  const Icon = v.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${v.badge}`}>
      <Icon size={14} />{label || status}
    </span>
  );
}

function Row({ label, value }) {
  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="py-2 pr-4 text-sm text-gray-500 font-medium w-48 align-top">{label}</td>
      <td className="py-2 text-sm text-gray-900">{value || '—'}</td>
    </tr>
  );
}

/** Identitas dokumen — satu susunan baris, dipakai kedua halaman. */
export function DocumentIdentity({ doc }) {
  const kategori = [
    doc.productCategory?.group?.name,
    doc.productCategory?.name,
  ].filter(Boolean).join(' · ') + (doc.productCategory?.subGroup ? ` (${doc.productCategory.subGroup})` : '');

  return (
    <div className="card p-5">
      <h3 className="font-semibold text-gray-900 mb-4">Identitas Dokumen</h3>
      <table className="w-full">
        <tbody>
          <Row label="ID Regulatory"      value={doc.regulatoryId} />
          <Row label="Nama Label"         value={doc.labelName} />
          <Row label="Nama File"          value={doc.fileNameOriginal} />
          <Row label="Kategori Produk"    value={kategori} />
          <Row label="Tanggal Terima"     value={fmtDate(doc.tanggalTerima)} />
          <Row label="Tanggal Periksa"    value={fmtDate(doc.tanggalPeriksa)} />
          <Row label="Tanggal Verifikasi" value={fmtDate(doc.tanggalVerifikasi)} />
          <Row label="Tanggal Approval"   value={fmtDate(doc.tanggalApproval)} />
          <Row label="Status Dokumen"     value={<StatusBadge status={doc.status} />} />
        </tbody>
      </table>
    </div>
  );
}

/** Ringkasan rantai dalam satu kalimat. Datanya dihitung server (buildProgress). */
export function ProgressPill({ progress }) {
  if (!progress) return null;
  const tone = progress.isDeclined ? 'bg-red-100 text-red-700'
             : progress.isComplete ? 'bg-green-100 text-green-700'
             : 'bg-amber-100 text-amber-700';
  const text = progress.isDeclined
    ? `Ditolak di Level ${progress.declinedAtLevel}`
    : progress.isComplete
      ? `Disetujui lengkap · ${progress.approvedCount} level`
      : `${progress.approvedCount} level disetujui · menunggu Level ${progress.waitingLevel}`;
  return <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${tone}`}>{text}</span>;
}

export const LEVEL_LABEL = {
  0: 'Staff Regulatory',
  1: 'SPV',
  2: 'Manager (Final)',
};
export function levelLabel(level) {
  return LEVEL_LABEL[level] || `Level ${level}`;
}

/**
 * Riwayat persetujuan.
 *
 * @param {string} [highlightId] approval yang QR-nya baru dipindai, ditandai
 *                               supaya pemindai tahu baris mana yang miliknya.
 */
export function ApprovalChain({ approvals, progress, highlightId }) {
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h3 className="font-semibold text-gray-900">Riwayat Persetujuan</h3>
        <ProgressPill progress={progress} />
      </div>

      {(!approvals || approvals.length === 0) && (
        <p className="text-sm text-gray-400">Belum ada riwayat persetujuan.</p>
      )}

      <div className="space-y-3">
        {approvals?.map((a, i) => {
          const v = viewFor(a.status);
          const Icon = v.icon;
          const mine = highlightId && a.id === highlightId;
          return (
            <div
              key={a.id || i}
              className={`flex gap-4 p-4 rounded-xl border ${
                mine ? 'bg-brand-50 border-brand-300 ring-1 ring-brand-300' : v.card
              }`}
            >
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${v.dot}`}>
                <Icon size={18} />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm text-gray-900">
                  {levelLabel(a.level)} — {a.approver?.name || '—'}
                  {mine && (
                    <span className="ml-2 text-xs bg-brand-500 text-white px-2 py-0.5 rounded-full">
                      QR ini
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-500 capitalize">{a.approver?.role}</p>
                <p className="text-xs font-medium mt-1">
                  {a.status === 'APPROVED' ? 'Disetujui' : a.status === 'DECLINED' ? 'Ditolak' : 'Menunggu'}
                </p>
                {a.signedAt && <p className="text-xs text-gray-500">{fmtDateTime(a.signedAt)}</p>}
                {a.notes && <p className="text-xs text-gray-600 italic mt-1 break-words">"{a.notes}"</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PublicFooter() {
  return (
    <div className="text-center">
      <p className="text-xs text-gray-300 mt-1">Powered by Digital Transformation Plant Sentul</p>
    </div>
  );
}
