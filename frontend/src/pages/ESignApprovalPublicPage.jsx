// frontend/src/pages/ESignApprovalPublicPage.jsx
import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery }  from '@tanstack/react-query';
import { format }    from 'date-fns';
import { CheckCircle, XCircle, Clock, Shield, UserCheck } from 'lucide-react';
import axios from 'axios';

const LEVEL_LABEL = {
  0: 'Staff (Self-Sign)',
  1: 'SPV',
  2: 'Marketing (Final)',
};

function levelLabel(level) {
  return LEVEL_LABEL[level] || `Level ${level}`;
}

function StatusBadge({ status }) {
  if (status === 'APPROVED')
    return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-800"><CheckCircle size={14}/>APPROVED</span>;
  if (status === 'DECLINED')
    return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-red-100 text-red-800"><XCircle size={14}/>DECLINED</span>;
  return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-yellow-100 text-yellow-800"><Clock size={14}/>PENDING</span>;
}

function fmtDate(d) {
  if (!d) return '—';
  return format(new Date(d), 'dd MMMM yyyy');
}
function fmtDateTime(d) {
  if (!d) return '—';
  return format(new Date(d), 'dd MMM yyyy HH:mm');
}

function Row({ label, value }) {
  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="py-2 pr-4 text-sm text-gray-500 font-medium w-48 align-top">{label}</td>
      <td className="py-2 text-sm text-gray-900">{value || '—'}</td>
    </tr>
  );
}

/**
 * Public verification page for a SPECIFIC approval's QR.
 * Each signer (Staff, SPV, Marketing/Final) has their own QR pointing here —
 * scanning it shows exactly who signed at that step, plus the document
 * identity and the full chain as supporting context.
 */
export default function ESignApprovalPublicPage() {
  const { approvalId } = useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ['esign-approval-public', approvalId],
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
        <p className="text-sm text-gray-400 mt-1">QR Code mungkin tidak valid atau approval telah dihapus.</p>
      </div>
    );
  }

  const { approval, document: doc } = data;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">
      {/* Headline: THIS approver's identity — the reason someone scanned this QR */}
      <div className="rounded-3xl border border-green-200 bg-gradient-to-br from-green-50 to-white p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">

          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center">
                <Shield size={32} className="text-green-600" />
            </div>

            <div>
                <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
                Digital Signature Verification
                </p>

                <h1 className="text-2xl font-bold text-gray-900 mt-1">
                {approval.approver?.name}
                </h1>

                <p className="text-sm text-gray-500 mt-1">
                {levelLabel(approval.level)} • {approval.approver?.role}
                </p>

                {approval.signedAt && (
                <p className="text-sm text-gray-500 mt-3">
                    Signed on {fmtDateTime(approval.signedAt)}
                </p>
                )}
            </div>
          </div>

            <StatusBadge status={approval.status} />
      </div>

        {approval.notes && (
            <div className="mt-5 p-4 bg-white rounded-xl border border-gray-200">
            <p className="text-sm text-gray-700 italic">
                "{approval.notes}"
            </p>
            </div>
        )}
        </div>

      {/* Document identity */}
      <div className="card p-5">
        <h3 className="text-lg font-bold text-gray-900 mb-5 flex items-center gap-2">
          Identitas Dokumen
        </h3>
        <table className="w-full">
          <tbody>
            <Row label="ID Regulatory"     value={doc.regulatoryId} />
            <Row label="Nama Label"        value={doc.labelName} />
            <Row label="Nama File"         value={doc.fileNameOriginal} />
            <Row label="Kategori Produk"   value={
              `${doc.productCategory?.group?.name || ''} · ${doc.productCategory?.name || ''}${doc.productCategory?.subGroup ? ` (${doc.productCategory.subGroup})` : ''}`
            } />
            <Row label="Tanggal Terima"    value={fmtDate(doc.tanggalTerima)} />
            <Row label="Tanggal Periksa"   value={fmtDate(doc.tanggalPeriksa)} />
            <Row label="Status Dokumen"    value={<StatusBadge status={doc.status} />} />
          </tbody>
        </table>
      </div>

      {/* Full chain as supporting context — this approval is highlighted */}
      <div className="card p-5">
        <h3 className="text-lg font-bold text-gray-900 mb-5">Rantai Persetujuan</h3>
        <div className="space-y-3">
          {doc.approvals?.map((a) => {
            const isThisOne = a.id === approval.id;
            return (
              <div
                key={a.id}
                className={`flex gap-4 p-4 rounded-xl border ${
                  isThisOne
                    ? 'bg-brand-50 border-brand-300 ring-1 ring-brand-300'
                    : a.status === 'APPROVED'  ? 'bg-green-50 border-green-200'
                    : a.status === 'DECLINED'  ? 'bg-red-50 border-red-200'
                    :                             'bg-gray-50 border-gray-200'
                }`}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0
                  ${a.status === 'APPROVED' ? 'bg-green-100' : a.status === 'DECLINED' ? 'bg-red-100' : 'bg-gray-200'}`}>
                  {a.status === 'APPROVED' ? <CheckCircle size={18} className="text-green-600" />
                   : a.status === 'DECLINED' ? <XCircle size={18} className="text-red-500" />
                   : <Clock size={18} className="text-gray-400" />}
                </div>
                <div>
                  <p className="font-semibold text-sm text-gray-900">
                    {levelLabel(a.level)} — {a.approver?.name}
                    {isThisOne && (
                      <span className="ml-2 text-xs bg-brand-500 text-white px-2 py-0.5 rounded-full">
                        QR ini
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 capitalize">{a.approver?.role}</p>
                  <p className="text-xs font-medium mt-1 capitalize">{a.status}</p>
                  {a.signedAt && (
                    <p className="text-xs text-gray-500">{fmtDateTime(a.signedAt)}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>


      <div className="rounded-2xl bg-blue-50 border border-blue-200 p-4 flex gap-3">
        <div>
            <p className="font-semibold text-blue-900">
            Signature Verification Successful
            </p>

            <p className="text-sm text-blue-700">
            QR Code ini terhubung langsung dengan data approval yang tersimpan
            dalam sistem Digital Approval Label dan dapat digunakan sebagai
            bukti validasi tanda tangan elektronik internal.
            </p>
        </div>
      </div>

      <div className="text-center">
        <p className="text-xs text-gray-300 mt-1">
          Powered by Digital Transformation Plant Sentul
        </p>
      </div>
    </div>
  );
}