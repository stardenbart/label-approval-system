// frontend/src/pages/DocumentDetailPage.jsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Download, QrCode, FileText, CheckCircle, XCircle, Clock, ArrowLeft, Trash2, ExternalLink, Loader2 } from 'lucide-react';
import api          from '../services/api';
import { qk } from '../services/queryKeys';
import { afterDocumentDelete } from '../services/cacheSync';
import useAuthStore from '../store/authStore';
import toast        from 'react-hot-toast';
import { buildApprovalQrRows } from './documentQrPresentation.js';

function StatusBadge({ status }) {
  if (status === 'APPROVED')  return <span className="badge-approved flex items-center gap-1"><CheckCircle size={12} />APPROVED</span>;
  if (status === 'DECLINED')  return <span className="badge-declined flex items-center gap-1"><XCircle size={12} />DECLINED</span>;
  return <span className="badge-pending flex items-center gap-1"><Clock size={12} />PENDING</span>;
}

function InfoRow({ label, value }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 py-2 border-b border-gray-100 last:border-0">
      <span className="text-xs font-medium text-gray-500 w-44 shrink-0">{label}</span>
      <span className="text-sm text-gray-900">{value || '—'}</span>
    </div>
  );
}

function fmtDate(d) {
  if (!d) return null;
  return format(new Date(d), 'dd MMMM yyyy');
}

export default function DocumentDetailPage() {
  const { id }      = useParams();
  const navigate    = useNavigate();
  const { user }    = useAuthStore();
  const queryClient = useQueryClient();

  // HIGH-02: Load QR images via authenticated api call (img tag can't send auth headers)
  const [qrEsignUrls,  setQrEsignUrls]  = useState({});
  const [qrOriginalUrl, setQrOriginalUrl] = useState(null);
  const [approvalQrUrls, setApprovalQrUrls] = useState({});
  const [approvalQrLoading, setApprovalQrLoading] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: qk.document(id),
    queryFn:  () => api.get(`/documents/${id}`).then(r => r.data.data),
    // Berhenti polling begitu dokumen selesai — tidak akan berubah lagi.
    refetchInterval: (query) =>
      query.state.data?.status === 'PENDING_APPROVAL' ? 20_000 : false,
  });

  const approvalQrRows = buildApprovalQrRows(data?.approvals, data?.approvalQrs);
  const approvedQrEntries = approvalQrRows.filter(row => row.hasQr).map(row => row.qr);
  const approvedQrKey = approvedQrEntries.map(qr => qr.approvalId).join('|');

  // Load QR images after doc data arrives. Semua request memakai API client
  // authenticated; URL berkas internal tidak pernah dikirim ke browser.
  useEffect(() => {
    if (!data) return;
    let isActive = true;
    const blobUrls = [];
    let origBlobUrl = null;

    setQrEsignUrls({});
    setQrOriginalUrl(null);
    setApprovalQrUrls({});
    setApprovalQrLoading(approvedQrEntries.length > 0);

    // QR per level tidak dimuat semua di muka agar halaman detail tetap ringan.
    // Masing-masing tetap bisa diunduh dari riwayat dan, untuk mode per-level,
    // masing-masing ikut dicetak pada PDF.
    //
    // Dokumen paling lawas (sebelum QR per-approval ada) hanya punya satu
    // qrPathEsign generik dan tidak punya QR dokumen — untuk mereka, itulah
    // yang tercetak di kertasnya, jadi tetap ditampilkan.
    if (!data.hasQrOriginal && data.hasQrEsign) {
      api.get(`/documents/${id}/qr/esign`, { responseType: 'blob' })
        .then(res => {
          const url = URL.createObjectURL(res.data);
          blobUrls.push(url);
          if (isActive) setQrEsignUrls({ legacy: url });
          else URL.revokeObjectURL(url);
        })
        .catch(() => {});
    }
    if (data.hasQrOriginal) {
      api.get(`/documents/${id}/qr/original`, { responseType: 'blob' })
        .then(res => {
          origBlobUrl = URL.createObjectURL(res.data);
          if (isActive) setQrOriginalUrl(origBlobUrl);
          else URL.revokeObjectURL(origBlobUrl);
        })
        .catch(() => {});
    }

    Promise.allSettled(approvedQrEntries.map(async qr => {
      const res = await api.get(
        `/documents/${id}/approvals/${qr.approvalId}/qr?preview=true`,
        { responseType: 'blob' },
      );
      const url = URL.createObjectURL(res.data);
      if (!isActive) {
        URL.revokeObjectURL(url);
        return null;
      }
      blobUrls.push(url);
      return [qr.approvalId, url];
    })).then(results => {
      if (!isActive) return;
      const urls = Object.fromEntries(
        results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value),
      );
      setApprovalQrUrls(urls);
      setApprovalQrLoading(false);
    });

    // MED-09: Revoke blob URLs on cleanup to prevent memory leak
    return () => {
      isActive = false;
      blobUrls.forEach(url => URL.revokeObjectURL(url));
      if (origBlobUrl)   URL.revokeObjectURL(origBlobUrl);
    };
  }, [data?.hasQrOriginal, data?.hasQrEsign, approvedQrKey, id]);

  if (isLoading) return <div className="text-center py-16 text-gray-400">Loading document...</div>;
  if (error)     return <div className="text-center py-16 text-red-500">Document unavailable</div>;

  const doc = data;
  const myPendingApproval = doc.approvals?.find(
    a => a.approverId === user?.id && a.status === 'PENDING'
  );

  async function handleDelete() {
    if (!confirm(`Hapus dokumen "${doc.labelName}"? This action cannot be undone.`)) return;
    try {
      await api.delete(`/documents/${id}`);
      toast.success('Dokumen dihapus');
      afterDocumentDelete(queryClient, id);
      navigate('/documents');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete');
    }
  }

  function downloadFile(endpoint, filename) {
    api.get(endpoint, { responseType: 'blob' }).then(res => {
      const url = URL.createObjectURL(res.data);
      const a   = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      // MED-09: Revoke object URL after use to prevent memory leak
      setTimeout(() => URL.revokeObjectURL(url), 100);
    }).catch(() => toast.error('Fail to download file'));
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate(-1)} className="btn-secondary py-1.5 px-2 mt-0.5">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-bold text-gray-900">{doc.labelName}</h2>
            <StatusBadge status={doc.status} />
          </div>
          <p className="text-sm text-gray-500 font-mono mt-1">{doc.regulatoryId}</p>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {myPendingApproval && (
            <button
              onClick={() => navigate(`/approvals/${myPendingApproval.id}`)}
              className="btn-primary"
            >
              <CheckCircle size={16} /> Review & Approve
            </button>
          )}
          {['superadmin','admin'].includes(user?.role) && (
            <button onClick={handleDelete} className="btn-danger py-2 px-3">
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — Info */}
        <div className="lg:col-span-2 space-y-5">
          {/* Metadata */}
          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Document Information</h3>
            <InfoRow label="ID Regulatory"    value={doc.regulatoryId} />
            <InfoRow label="Label Name"        value={doc.labelName} />
            <InfoRow label="Original File Name"     value={doc.fileNameOriginal} />
            <InfoRow label="Product Category"   value={`${doc.productCategory?.group?.name} · ${doc.productCategory?.name}${doc.productCategory?.subGroup ? ` (${doc.productCategory.subGroup})` : ''}`} />
            <InfoRow label="Uploaded by"     value={doc.uploader?.name} />
            <InfoRow label="Received Date"    value={fmtDate(doc.tanggalTerima)} />
            <InfoRow label="Check Date"   value={fmtDate(doc.tanggalPeriksa)} />
            <InfoRow label="Verification Date" value={fmtDate(doc.tanggalVerifikasi)} />
            <InfoRow label="Approval Date"  value={fmtDate(doc.tanggalApproval)} />
          </div>

          {/* Approval History */}
          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Approval History</h3>
            {doc.approvals?.length === 0 && <p className="text-sm text-gray-400">There's no approval yet</p>}
            <div className="space-y-3">
              {doc.approvals?.map((a) => (
                <div key={a.id} className="flex gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5
                    ${a.status === 'APPROVED' ? 'bg-green-100' : a.status === 'DECLINED' ? 'bg-red-100' : 'bg-yellow-100'}`}>
                    {a.status === 'APPROVED' ? <CheckCircle size={16} className="text-green-600" />
                     : a.status === 'DECLINED' ? <XCircle size={16} className="text-red-600" />
                     : <Clock size={16} className="text-yellow-600" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-gray-900">Level {a.level} — {a.approver?.name}</span>
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full
                        ${a.status === 'APPROVED' ? 'bg-green-100 text-green-700'
                        : a.status === 'DECLINED' ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'}`}>{a.status}</span>
                    </div>
                    <p className="text-xs text-gray-400 capitalize">{a.approver?.role}</p>
                    {a.signedAt && <p className="text-xs text-gray-400">{format(new Date(a.signedAt), 'dd MMM yyyy HH:mm')}</p>}
                    {a.notes && <p className="text-xs text-gray-600 mt-1 bg-gray-50 rounded p-2 italic">"{a.notes}"</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Downloads */}
          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Download Document</h3>
            <div className="space-y-2">
              <button
                onClick={() => downloadFile(`/documents/${id}/original`, doc.fileNameOriginal)}
                className="btn-secondary w-full justify-start"
              >
                <FileText size={16} /> Download Original PDF
              </button>
              {doc.status === 'APPROVED' && doc.hasSignedFinal && (
                <button
                  onClick={() => downloadFile(`/documents/${id}/signed`, `signed_${doc.fileNameOriginal}`)}
                  className="btn-primary w-full justify-start"
                >
                  <CheckCircle size={16} /> Download Final Signed PDF
                </button>
              )}
              {doc.hasCheckReport && (
                <button
                  onClick={() => downloadFile(`/documents/${id}/report`, `laporan_${doc.regulatoryId}.pdf`)}
                  className="btn-secondary w-full justify-start"
                >
                  <FileText size={16} /> Download Checking Report
                </button>
              )}
              {user?.role === 'superadmin' && !doc.labelCheckForm && (
                <button
                  onClick={() => navigate(`/documents/${id}/label-check`)}
                  className="btn-secondary w-full justify-start"
                >
                  <FileText size={16} /> Fill Label Checking Form
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Kanan — QR dokumen sebagai pintu ke riwayat lengkap. QR approval
            per level tetap tersedia dari daftar konfirmasi di bawah. */}
        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <QrCode size={16} /> QR Code Dokumen
            </h3>

            <div className="flex flex-col items-center gap-3">
              <div className="w-36 h-36 bg-gray-100 rounded-lg flex items-center justify-center border">
                {(qrOriginalUrl || qrEsignUrls.legacy)
                  ? <img src={qrOriginalUrl || qrEsignUrls.legacy} alt="QR Code Dokumen" className="w-32 h-32" />
                  : <QrCode size={40} className="text-gray-300" />
                }
              </div>

              <p className="text-[11px] text-gray-400 text-center">
                {qrOriginalUrl
                  ? doc.qrStampMode === 'per_level'
                    ? `PDF memakai QR setiap level · susunan ${doc.qrLayout || 'horizontal'}. QR ini membuka riwayat lengkap dokumen.`
                    : 'QR ini ditempel pada PDF dan membuka seluruh rantai approval.'
                  : 'Dokumen lama — QR e-sign tunggal'}
              </p>

              <div className="flex gap-2">
                {doc.hasQrOriginal && (
                  <button
                    onClick={() => downloadFile(`/documents/${id}/qr/original`, `qr_${doc.regulatoryId}.png`)}
                    className="btn-secondary text-xs py-1.5"
                  >
                    <Download size={12} /> Download QR
                  </button>
                )}
                {!doc.hasQrOriginal && doc.hasQrEsign && (
                  <button
                    onClick={() => downloadFile(`/documents/${id}/qr/esign`, `qr_esign_${doc.regulatoryId}.png`)}
                    className="btn-secondary text-xs py-1.5"
                  >
                    <Download size={12} /> Download QR
                  </button>
                )}
                <a
                  href={`/e/${id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary text-xs py-1.5"
                >
                  Buka Halaman ↗
                </a>
              </div>
            </div>

          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <QrCode size={16} /> QR Approval per Level
            </h3>
            <p className="text-[11px] text-gray-400 mt-1 mb-4">
              QR diterbitkan setelah approval selesai dan membuka bukti user pada level tersebut.
              {doc.qrStampMode === 'document' && ' PDF dokumen ini tetap memakai mode satu QR dokumen.'}
            </p>

            {(!doc.approvals || doc.approvals.length === 0) && (
              <p className="text-xs text-gray-400">Belum ada level approval.</p>
            )}

            <div className="space-y-4">
              {approvalQrRows.map(({ approval: a, hasQr: approved }) => {
                const qrUrl = approvalQrUrls[a.id];
                return (
                  <div key={a.id} className={`rounded-xl border p-3 ${
                    approved ? 'border-green-200 bg-green-50/50' :
                    a.status === 'DECLINED' ? 'border-red-200 bg-red-50/40' : 'border-amber-200 bg-amber-50/40'
                  }`}>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-800">
                          Level {a.level} — {a.approver?.name || '—'}
                        </p>
                        <p className="text-[11px] text-gray-500 capitalize">
                          {a.approver?.role || 'approver'}
                          {a.signedAt && ` · ${new Date(a.signedAt).toLocaleString('id-ID', {
                            day: '2-digit', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}`}
                        </p>
                      </div>
                      <StatusBadge status={a.status} />
                    </div>

                    {approved ? (
                      <>
                        <div className="w-36 h-36 mx-auto bg-white rounded-lg border flex items-center justify-center">
                          {qrUrl ? (
                            <img src={qrUrl} alt={`QR Approval Level ${a.level}`} className="w-32 h-32" />
                          ) : approvalQrLoading ? (
                            <Loader2 size={24} className="animate-spin text-brand-400" />
                          ) : (
                            <div className="text-center text-gray-400">
                              <QrCode size={32} className="mx-auto" />
                              <p className="text-[10px] mt-1">Gagal memuat QR</p>
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-3">
                          <button
                            onClick={() => downloadFile(
                              `/documents/${id}/approvals/${a.id}/qr`,
                              `qr_level${a.level}_${doc.regulatoryId}.png`,
                            )}
                            className="btn-secondary text-xs py-1.5 justify-center"
                          >
                            <Download size={12} /> Unduh
                          </button>
                          <a
                            href={`/e/approval/${a.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-secondary text-xs py-1.5 justify-center"
                          >
                            <ExternalLink size={12} /> Verifikasi
                          </a>
                        </div>
                      </>
                    ) : (
                      <div className="h-24 rounded-lg border border-dashed border-current/20 flex flex-col items-center justify-center text-gray-400">
                        {a.status === 'DECLINED' ? <XCircle size={24} /> : <Clock size={24} />}
                        <p className="text-[11px] mt-1">
                          {a.status === 'DECLINED' ? 'QR tidak diterbitkan' : 'Menunggu approval'}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
