// frontend/src/pages/ApprovalPage.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate }      from 'react-router-dom';
import { useQuery }                    from '@tanstack/react-query';
import { CheckCircle, XCircle, Loader2, Search, ArrowLeft, FileText, Info } from 'lucide-react';
import api          from '../services/api';
import toast        from 'react-hot-toast';
import ESignCanvas  from '../components/ESignCanvas/ESignCanvas.jsx';

export default function ApprovalPage() {
  const { approvalId } = useParams();
  const navigate       = useNavigate();

  const [notes,          setNotes]         = useState('');
  const [nextApproverId, setNextApproverId] = useState('');
  const [approverSearch, setApproverSearch] = useState('');
  const [position,       setPosition]      = useState(null);
  const [submitting,     setSubmitting]    = useState(false);
  const [declineMode,    setDeclineMode]   = useState(false);
  const [declineNotes,   setDeclineNotes]  = useState('');

  // QR stamp sebagai blob URL (image PNG — aman di-prefetch di parent)
  const [qrDataUrl, setQrDataUrl] = useState(null);

  // ── Fetch approval metadata ────────────────────────────────────
  const { data: approvalData, isLoading: loadingApproval, error: approvalError } = useQuery({
    queryKey: ['approval', approvalId],
    queryFn:  () => api.get(`/approvals/${approvalId}/suggested-approvers`).then(r => r.data.data),
  });

  // ── Fetch system settings (QR defaults) ───────────────────────
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn:  () => api.get('/settings').then(r => r.data.data),
  });

  const documentId   = approvalData?.documentId;
  const isFinalLevel = approvalData?.isFinalLevel ?? false;
  const document     = approvalData?.document;

  // ── Pre-fetch QR stamp sebagai blob URL ────────────────────────
  // QR adalah image PNG statis — aman di-prefetch di parent.
  // PDF TIDAK di-prefetch di sini — ESignCanvas handle sendiri via
  // axios interceptor (auth header + auto-refresh). Lihat ESignCanvas FIX-01.
  useEffect(() => {
    if (!documentId) return;
    let blobUrl = null;
    let cancelled = false;

    api.get(`/documents/${documentId}/qr/esign`, { responseType: 'blob' })
      .then(res => {
        if (cancelled) return;
        blobUrl = URL.createObjectURL(res.data);
        setQrDataUrl(blobUrl);
      })
      .catch(() => {
        // QR mungkin belum selesai digenerate — tidak fatal, stamp tampil kosong
      });

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [documentId]);

  // ── Approver list ──────────────────────────────────────────────
  const suggested = approvalData?.suggested || [];
  const others    = approvalData?.others    || [];

  const allApprovers = [
    ...suggested.map(u => ({ ...u, isSuggested: true  })),
    ...others   .map(u => ({ ...u, isSuggested: false })),
  ].filter(u =>
    !approverSearch ||
    u.name .toLowerCase().includes(approverSearch.toLowerCase()) ||
    u.email.toLowerCase().includes(approverSearch.toLowerCase())
  );

  // ── QR/PDF defaults dari system settings ──────────────────────
  const qrDefaults = settings ? {
    xPercent:   parseFloat(settings.qr_default_x_percent || 85),
    yPercent:   parseFloat(settings.qr_default_y_percent || 5),
    widthPt:    parseFloat(settings.qr_default_width_pt  || 100),
    heightPt:   parseFloat(settings.qr_default_height_pt || 100),
    pageNumber: parseInt(settings.qr_default_page        || 1),
  } : null;

  const qrLimits = settings ? {
    minWidthPt: parseFloat(settings.qr_min_width_pt || 60),
    maxWidthPt: parseFloat(settings.qr_max_width_pt || 200),
  } : null;

  // ── Actions ────────────────────────────────────────────────────
  async function handleApprove() {
    if (!isFinalLevel && !nextApproverId) {
      toast.error('Select next level approver first');
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/approvals/${approvalId}/approve`, {
        notes:          notes.trim() || undefined,
        nextApproverId: isFinalLevel ? undefined : nextApproverId,
        position:       position    || undefined,
      });
      toast.success(isFinalLevel ? 'Final document approved!' : 'Document approved and forwarded to next approver!');
      navigate('/my-pending');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDecline() {
    if (declineNotes.trim().length < 5) {
      toast.error('Decline comment must have 5 character or more');
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/approvals/${approvalId}/decline`, { notes: declineNotes.trim() });
      toast.success('Document declined');
      navigate('/my-pending');
    } catch (err) {
      toast.error(err.response?.data?.message || 'failed to decline');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render states ──────────────────────────────────────────────
  if (loadingApproval) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="animate-spin text-brand-500" />
      </div>
    );
  }

  if (approvalError || !approvalData) {
    return (
      <div className="card p-10 text-center max-w-md mx-auto mt-10">
        <XCircle size={36} className="text-red-400 mx-auto mb-3" />
        <p className="font-semibold text-gray-700">Approval unfound</p>
        <p className="text-sm text-gray-400 mt-1">Maybe it's already been processed or there's no access</p>
        <button onClick={() => navigate('/my-pending')} className="btn-secondary mt-4">
          <ArrowLeft size={15} /> Back to Pending List
        </button>
      </div>
    );
  }

  const canApprove = isFinalLevel || !!nextApproverId;

  const approvalLevel = Number(approvalData?.approvalLevel ?? 1);

  let pdfPreviewUrl = `/documents/${documentId}/original`;
  if (approvalLevel === 1) {
    pdfPreviewUrl = `/documents/${documentId}/signed-level0`;
  }
  if (approvalLevel === 2) {
    pdfPreviewUrl = `/documents/${documentId}/signed-level1`;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate('/my-pending')} className="btn-secondary py-1.5 px-2 mt-0.5">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-gray-900">Review & E-Sign Dokumen</h2>
          {document && (
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="text-sm font-medium text-gray-700 truncate">{document.labelName}</span>
              <code className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded font-mono">
                {document.regulatoryId}
              </code>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                isFinalLevel
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-blue-100 text-blue-700'
              }`}>
                Level {approvalData.approvalLevel} · {isFinalLevel ? 'Final Approval' : 'Intermediate'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

        {/* Left: PDF canvas (3/5 width) */}
        <div className="xl:col-span-3 card p-4">
          <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2 text-sm">
            <FileText size={15} className="text-brand-500" />
            Document Preview & Signature Position (QR Stamp)
          </h3>
          <p className="text-xs text-gray-400 mb-3">
            Drag QR Box specified position.
          </p>

          {/* Tunggu documentId + qrDefaults tersedia sebelum mount ESignCanvas.
              ESignCanvas yang handle fetch PDF sendiri via axios (FIX-01 s/d FIX-04).
              pdfUrl dikirim sebagai path relatif tanpa '/api' prefix — ESignCanvas
              yang normalize dan strip prefix sesuai axios baseURL. */}
          {documentId && qrDefaults ? (
            <ESignCanvas
              pdfUrl={pdfPreviewUrl}
              qrDataUrl={qrDataUrl}
              defaults={qrDefaults}
              limits={qrLimits}
              onChange={setPosition}
            />
          ) : (
            <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg border border-dashed border-gray-300">
              <Loader2 size={24} className="animate-spin text-brand-400" />
            </div>
          )}
        </div>

        {/* Right: Form (2/5 width) */}
        <div className="xl:col-span-2 space-y-4">

          {/* Info card final level */}
          {isFinalLevel && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
              <p className="text-sm font-semibold text-purple-800">Final Level Approval</p>
              <p className="text-xs text-purple-600 mt-0.5">
                Once you approve, the document status will be fully <strong>APPROVED</strong>.
                There's no need to select next approver.
              </p>
            </div>
          )}

          {/* Catatan */}
          <div className="card p-4">
            <label className="label">Remarks (optional)</label>
            <textarea
              rows={3}
              className="input resize-none"
              placeholder="Remarks for this approval..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              maxLength={2000}
            />
            <p className="text-right text-xs text-gray-400 mt-1">{notes.length}/2000</p>
          </div>

          {/* Next approver — only for non-final levels */}
          {!isFinalLevel && (
            <div className="card p-4">
              <label className="label">
                Forward to Approver Level {(approvalData.approvalLevel ?? 1) + 1}
                <span className="text-red-500 ml-1">*</span>
              </label>
              <p className="text-xs text-gray-400 mb-2">
                {suggested.length > 0
                  ? `${suggested.length} approver is suggested based on product group mapping`
                  : 'Select approvers manually (no mapping for this group yet)'
                }
              </p>

              {/* Search */}
              <div className="relative mb-2">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  className="input pl-9 text-sm"
                  placeholder="Search name or email..."
                  value={approverSearch}
                  onChange={e => setApproverSearch(e.target.value)}
                />
              </div>

              {/* List */}
              <div className="max-h-52 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-50">
                {allApprovers.length === 0 && (
                  <div className="px-3 py-4 text-center text-xs text-gray-400">
                    {approverSearch ? 'No approver found' : 'No approver available'}
                  </div>
                )}
                {allApprovers.map(u => (
                  <button
                    key={u.id}
                    onClick={() => setNextApproverId(prev => prev === u.id ? '' : u.id)}
                    className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors flex items-center gap-2 ${
                      nextApproverId === u.id
                        ? 'bg-brand-50 border-l-2 border-brand-500'
                        : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {u.name}
                        {u.isSuggested && (
                          <span className="ml-1.5 text-xs bg-brand-50 text-brand-600 border border-brand-200 px-1.5 py-0.5 rounded-full">
                            Suggested
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{u.email} · {u.role}</p>
                    </div>
                    {nextApproverId === u.id && (
                      <CheckCircle size={16} className="text-brand-500 shrink-0" />
                    )}
                  </button>
                ))}
              </div>

              {nextApproverId && (
                <p className="text-xs text-brand-600 mt-2 font-medium flex items-center gap-1">
                  <CheckCircle size={11} />
                  {allApprovers.find(u => u.id === nextApproverId)?.name} selected
                </p>
              )}
            </div>
          )}

          {/* QR position info */}
          {position ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-green-800">QR Stamp position configured</p>
              <p className="text-xs text-green-600 mt-0.5">
                Hal {position.pageNumber} · X: {position.xPercent?.toFixed(1)}% ·
                Y: {position.yPercent?.toFixed(1)}% · {position.widthPt?.toFixed(0)}pt × {position.heightPt?.toFixed(0)}pt
              </p>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-amber-800 flex items-center gap-1">
                <Info size={12} /> Default position will be used
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                Drag QR stamp to change its position.
              </p>
            </div>
          )}

          {/* Action buttons */}
          {!declineMode ? (
            <div className="flex flex-col gap-2">
              <button
                onClick={handleApprove}
                disabled={submitting || !canApprove}
                className="btn-primary justify-center py-2.5"
              >
                {submitting
                  ? <Loader2 size={16} className="animate-spin" />
                  : <CheckCircle size={16} />
                }
                {submitting
                  ? 'Processing...'
                  : isFinalLevel
                    ? 'Final Approve'
                    : 'Approve & Forward'
                }
              </button>

              {!canApprove && (
                <p className="text-xs text-center text-amber-600">
                  Select Level {(approvalData.approvalLevel || 1) + 1} approver first
                </p>
              )}

              <button
                onClick={() => setDeclineMode(true)}
                disabled={submitting}
                className="btn-danger justify-center py-2.5"
              >
                <XCircle size={16} /> Decline Document
              </button>
            </div>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
              <h4 className="font-semibold text-red-800 text-sm">Decline Confirmation</h4>
              <textarea
                rows={4}
                className="input resize-none border-red-300 focus:ring-red-400 focus:border-red-400"
                placeholder="Write decline comment (min. 5 characters)..."
                value={declineNotes}
                onChange={e => setDeclineNotes(e.target.value)}
                maxLength={2000}
              />
              <p className="text-xs text-right text-gray-400">{declineNotes.length}/2000</p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setDeclineMode(false); setDeclineNotes(''); }}
                  className="btn-secondary flex-1 justify-center"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDecline}
                  disabled={submitting || declineNotes.trim().length < 5}
                  className="btn-danger flex-1 justify-center"
                >
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                  Confirm Decline
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}