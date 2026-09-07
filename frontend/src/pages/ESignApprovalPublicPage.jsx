// frontend/src/pages/ESignApprovalPublicPage.jsx
//
// Halaman yang dituju QR PER LEVEL (/e/approval/:approvalId).
//
// Sejak satu label hanya membawa satu QR dokumen, halaman ini praktis hanya
// dijangkau oleh orang yang memindai LABEL LAMA — label yang sudah tercetak
// sebelum aturan itu berlaku, dan masih membawa QR per level di badannya.
// Mereka tidak punya jalan lain, jadi halaman ini harus tetap jujur.
//
// Dulu halaman ini SELALU hijau, berjudul "Digital Signature Verification",
// menampilkan nama approver sebagai headline, dan ditutup kalimat "Signature
// Verification Successful" — apa pun statusnya. Approval yang masih menunggu
// tampak seperti sudah ditandatangani; approval yang DITOLAK pun begitu.

import { useParams } from 'react-router-dom';
import { useQuery }  from '@tanstack/react-query';
import { XCircle, AlertTriangle } from 'lucide-react';
import axios from 'axios';
import { qk } from '../services/queryKeys';
import {
  viewFor, StatusBadge, DocumentIdentity, ApprovalChain, PublicFooter,
  levelLabel, fmtDateTime,
} from '../components/PublicVerify/index.jsx';
import {
  headlineFor, closingNote, documentContradicts, NOTE_CLASS,
} from '../components/PublicVerify/status.js';

export default function ESignApprovalPublicPage() {
  const { approvalId } = useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: qk.esignApprovalPublic(approvalId),
    queryFn:  () => axios.get(`/api/e/approval/${approvalId}`).then(r => r.data.data),
  });

  if (isLoading) {
    return (
      <div className="text-center py-16">
        <div className="inline-block w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400 mt-3">Memuat data verifikasi...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card p-8 text-center">
        <XCircle size={40} className="text-red-400 mx-auto mb-3" />
        <p className="font-semibold text-gray-700">Data tidak ditemukan</p>
        <p className="text-sm text-gray-400 mt-1">QR Code mungkin tidak valid atau dokumen telah dihapus.</p>
      </div>
    );
  }

  const { approval, document: doc } = data;
  const v    = viewFor(approval.status);
  const Icon = v.icon;
  const head = headlineFor(approval.status, approval.approver?.name);
  const note = closingNote(approval.status, doc.status);

  // Status level dan status dokumen bisa berlawanan: Level 1 disetujui, lalu
  // Level 2 menolak, dan dokumennya DITOLAK. Orang yang memindai QR Level 1
  // pada label tercetak akan menyimpulkan labelnya sah — kecuali diberi tahu.
  const docContradicts = documentContradicts(approval.status, doc.status);

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">

      {/* Hero — warnanya, ikonnya, dan kalimatnya mengikuti status level ini */}
      <div className={`rounded-3xl border p-8 shadow-sm ${v.hero}`}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${v.heroIcon}`}>
              <Icon size={32} />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
                Verifikasi Tanda Tangan Elektronik
              </p>
              <h1 className="text-2xl font-bold text-gray-900 mt-1">{head.title}</h1>
              <p className="text-sm text-gray-600 mt-1">{head.lead}</p>
              <p className="text-sm text-gray-500 mt-1">
                {levelLabel(approval.level)} · {approval.approver?.role || '—'}
              </p>
              {approval.signedAt && (
                <p className="text-sm text-gray-500 mt-3">{fmtDateTime(approval.signedAt)}</p>
              )}
            </div>
          </div>
          <StatusBadge status={approval.status} />
        </div>

        {approval.notes && (
          <div className="mt-5 p-4 bg-white rounded-xl border border-gray-200">
            <p className="text-sm text-gray-700 italic break-words">"{approval.notes}"</p>
          </div>
        )}
      </div>

      {/* Peringatan saat status dokumen berlawanan dengan status level ini */}
      {docContradicts && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 flex gap-3">
          <AlertTriangle size={22} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-900">
              {approval.status === 'APPROVED'
                ? `Level ini disetujui, tetapi dokumen DITOLAK${doc.progress?.declinedAtLevel != null ? ` di Level ${doc.progress.declinedAtLevel}` : ''}.`
                : 'Level ini ditolak, tetapi dokumen berstatus DISETUJUI.'}
            </p>
            <p className="text-sm text-amber-800 mt-0.5">
              {approval.status === 'APPROVED'
                ? 'Label ini tidak sah untuk dipakai. Status satu level tidak mewakili status dokumen.'
                : 'Periksa riwayat persetujuan di bawah untuk melihat urutan yang sebenarnya.'}
            </p>
          </div>
        </div>
      )}

      <DocumentIdentity doc={doc} />

      <ApprovalChain
        approvals={doc.approvals}
        progress={doc.progress}
        highlightId={approval.id}
      />

      <div className={`rounded-2xl border p-4 ${NOTE_CLASS[note.tone]}`}>
        <p className="font-semibold">{note.title}</p>
        <p className="text-sm mt-0.5">{note.body}</p>
      </div>

      <PublicFooter />
    </div>
  );
}
