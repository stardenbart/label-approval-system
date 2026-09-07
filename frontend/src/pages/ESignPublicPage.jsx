// frontend/src/pages/ESignPublicPage.jsx
//
// Halaman yang dituju QR DOKUMEN (/e/:uuid) — satu-satunya QR yang ditempel ke
// PDF sejak aturan "satu QR per dokumen". Isinya hidup: bertambah sendiri
// setiap kali sebuah level menyetujui, tanpa label perlu dicetak ulang.
//
// Bagian identitas dan riwayat kini datang dari komponen bersama, sama persis
// dengan yang dilihat pemindai QR per level. Sebelumnya keduanya punya salinan
// sendiri dan sudah menyimpang — halaman ini berbahasa Inggris dengan 8 baris
// identitas, yang satunya berbahasa Indonesia dengan 7 baris.

import { useParams } from 'react-router-dom';
import { useQuery }  from '@tanstack/react-query';
import { XCircle, Shield } from 'lucide-react';
import axios from 'axios';
import { qk } from '../services/queryKeys';
import {
  viewFor, StatusBadge, DocumentIdentity, ApprovalChain, PublicFooter,
} from '../components/PublicVerify/index.jsx';

export default function ESignPublicPage() {
  const { uuid } = useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: qk.esignPublic(uuid),
    queryFn:  () => axios.get(`/api/e/${uuid}`).then(r => r.data.data),
  });

  if (isLoading) {
    return (
      <div className="text-center py-16">
        <div className="inline-block w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400 mt-3">Memuat data dokumen...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card p-8 text-center">
        <XCircle size={40} className="text-red-400 mx-auto mb-3" />
        <p className="font-semibold text-gray-700">Dokumen tidak tersedia</p>
        <p className="text-sm text-gray-400 mt-1">QR Code mungkin tidak valid atau dokumen telah dihapus.</p>
      </div>
    );
  }

  const doc = data;
  const v   = viewFor(doc.status);

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">

      <div className={`rounded-2xl p-6 border ${v.card}`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${v.heroIcon}`}>
              <Shield size={24} />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Status Dokumen</p>
              <p className="font-bold text-lg text-gray-900">{doc.labelName}</p>
            </div>
          </div>
          <StatusBadge status={doc.status} />
        </div>
      </div>

      <DocumentIdentity doc={doc} />

      <ApprovalChain approvals={doc.approvals} progress={doc.progress} />

      <PublicFooter />
    </div>
  );
}
