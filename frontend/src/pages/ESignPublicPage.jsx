// frontend/src/pages/ESignPublicPage.jsx
import { useParams } from 'react-router-dom';
import { useQuery }  from '@tanstack/react-query';
import { format }    from 'date-fns';
import { CheckCircle, XCircle, Clock, Shield } from 'lucide-react';
import axios from 'axios';
import { qk } from '../services/queryKeys';

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
        <p className="text-gray-400 mt-3">Loading document data...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card p-8 text-center">
        <XCircle size={40} className="text-red-400 mx-auto mb-3" />
        <p className="font-semibold text-gray-700">Document unavailable</p>
        <p className="text-sm text-gray-400 mt-1">QR Code might be invalid or document has been deleted.</p>
      </div>
    );
  }

  const doc = data;

  return (
    <div className="space-y-6">
      {/* Status banner */}
      <div className={`rounded-2xl p-6 border mt-10 ${
        doc.status === 'APPROVED' ? 'bg-green-50 border-green-200'
        : doc.status === 'DECLINED' ? 'bg-red-50 border-red-200'
        : 'bg-yellow-50 border-yellow-200'
      }`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Shield size={28} className={
              doc.status === 'APPROVED' ? 'text-green-600'
              : doc.status === 'DECLINED' ? 'text-red-500'
              : 'text-yellow-600'
            } />
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Document Status</p>
              <p className="font-bold text-lg text-gray-900">{doc.labelName}</p>
            </div>
          </div>
          <StatusBadge status={doc.status} />
        </div>
      </div>

      {/* Document Info */}
      <div className="card p-5">
        <h3 className="font-semibold text-gray-900 mb-4">Document Identity</h3>
        <table className="w-full">
          <tbody>
            <Row label="Regulatory ID"    value={doc.regulatoryId} />
            <Row label="Label Name"        value={doc.labelName} />
            <Row label="File Name"         value={doc.fileNameOriginal} />
            <Row label="Product Category"   value={
              `${doc.productCategory?.group?.name || ''} · ${doc.productCategory?.name || ''}${doc.productCategory?.subGroup ? ` (${doc.productCategory.subGroup})` : ''}`
            } />
            <Row label="Received Date"    value={fmtDate(doc.tanggalTerima)} />
            <Row label="Check Date"   value={fmtDate(doc.tanggalPeriksa)} />
            <Row label="Verification Date" value={fmtDate(doc.tanggalVerifikasi)} />
            <Row label="Approval Date"  value={fmtDate(doc.tanggalApproval)} />
          </tbody>
        </table>
      </div>

      {/* Signing History */}
      <div className="card p-5">
        <h3 className="font-semibold text-gray-900 mb-4">Signing History</h3>
        {doc.approvals?.length === 0 && (
          <p className="text-sm text-gray-400">There's no signing history yet</p>
        )}
        <div className="space-y-3">
          {doc.approvals?.map((a, i) => (
            <div key={i} className={`flex gap-4 p-4 rounded-xl border ${
              a.status === 'APPROVED' ? 'bg-green-50 border-green-200'
              : a.status === 'DECLINED' ? 'bg-red-50 border-red-200'
              : 'bg-gray-50 border-gray-200'
            }`}>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0
                ${a.status === 'APPROVED' ? 'bg-green-100' : a.status === 'DECLINED' ? 'bg-red-100' : 'bg-gray-200'}`}>
                {a.status === 'APPROVED' ? <CheckCircle size={18} className="text-green-600" />
                 : a.status === 'DECLINED' ? <XCircle size={18} className="text-red-500" />
                 : <Clock size={18} className="text-gray-400" />}
              </div>
              <div>
                <p className="font-semibold text-sm text-gray-900">
                  Level {a.level} — {a.approver?.name}
                </p>
                <p className="text-xs text-gray-500 capitalize">{a.approver?.role}</p>
                <p className="text-xs font-medium mt-1 capitalize">{a.status}</p>
                {a.signedAt && (
                  <p className="text-xs text-gray-500">{fmtDateTime(a.signedAt)}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer note */}
      <div className="text-center">
        <p className="text-xs text-gray-300 mt-1">
          Powered by Digital Transformation Plant Sentul
        </p>
      </div>
    </div>
  );
}
