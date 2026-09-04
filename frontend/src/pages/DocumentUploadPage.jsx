// frontend/src/pages/DocumentUploadPage.jsx
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, Link }       from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload, FileText, X, Loader2, AlertTriangle, AlertCircle, PenTool, Info } from 'lucide-react';
import api          from '../services/api';
import { qk } from '../services/queryKeys';
import { afterDocumentUpload } from '../services/cacheSync';
import toast        from 'react-hot-toast';
import ESignCanvas  from '../components/ESignCanvas/ESignCanvas.jsx';
import useAuthStore from '../store/authStore';

export default function DocumentUploadPage() {
  const navigate = useNavigate();
  const fileRef  = useRef(null);
  const { user } = useAuthStore();

  // 'uploader' uploads WITHOUT e-sign — document goes to Staff RnI (Level 0,
  // PENDING) instead of being auto-signed. 'superadmin' keeps the original
  // direct-sign flow untouched. See document.controller.js#upload().
  const isUploaderRole = user?.role === 'uploader';
  const queryClient    = useQueryClient();

  const [file,     setFile]     = useState(null);
  const [form,     setForm]     = useState({
    labelName:         '',
    productCategoryId: '',
    tanggalTerima:     '',
    tanggalPeriksa:    '',
  });
  const [position,       setPosition]       = useState(null);
  const [footerPosition, setFooterPosition] = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [dragOver,   setDragOver]   = useState(false);
  const [showCanvas, setShowCanvas] = useState(false);

  // ── Route to (Staff Regulatory) — uploader role only ─────────────────────
  const [targetApproverId, setTargetApproverId] = useState('');
  const [manuallyChanged,  setManuallyChanged]  = useState(false);

  const { data: categoriesData } = useQuery({
    queryKey: qk.productCategories(),
    queryFn:  () => api.get('/products/categories').then(r => r.data.data),
  });

  const { data: mappingsData } = useQuery({
    queryKey: qk.mappings(),
    queryFn:  () => api.get('/users/mappings/all').then(r => r.data.data),
  });

  const { data: settings } = useQuery({
    queryKey: qk.settings(),
    queryFn:  () => api.get('/settings').then(r => r.data.data),
    enabled:  !isUploaderRole, // QR position settings are irrelevant — uploader never sees the canvas
  });

  const { data: candidatesData } = useQuery({
    queryKey: qk.approverCandidates(),
    queryFn:  () => api.get('/users/approver-candidates').then(r => r.data.data),
    enabled:  isUploaderRole,
  });

  const { data: suggestedApprover } = useQuery({
    queryKey: qk.suggestLevel0(form.productCategoryId),
    queryFn:  () => api.get('/users/mappings/suggest-level0', {
      params: { productCategoryId: form.productCategoryId },
    }).then(r => r.data.data),
    enabled: isUploaderRole && !!form.productCategoryId,
  });

  // Pre-fill targetApproverId with the suggestion unless the uploader already
  // made a deliberate manual choice for the currently selected category.
  useEffect(() => {
    if (!isUploaderRole) return;
    if (manuallyChanged) return;
    setTargetApproverId(suggestedApprover?.approver?.id || '');
  }, [suggestedApprover, isUploaderRole, manuallyChanged]);

  useEffect(() => {
    setManuallyChanged(false);
  }, [form.productCategoryId]);

  // Required approver level differs by role: uploader needs a Level 0 (Staff
  // RnI) mapping; direct superadmin upload needs a Level 1 (SPV) mapping.
  // Getting this wrong here doesn't break the backend (it has its own
  // fallback + NO_APPROVER check), but it WOULD show a misleading "SPV not
  // configured" warning to an uploader when the actual missing piece is
  // Staff RnI — so this must track the backend's targetLevel logic exactly.
  const requiredLevel   = isUploaderRole ? 0 : 1;
  const approverLabel   = isUploaderRole ? 'Staff Regulatory (Level 0)' : 'SPV (Level 1)';
  const requiredMappings = (mappingsData || []).filter(m => m.level === requiredLevel);
  // For the uploader role, a manually-picked or suggested target approver is
  // sufficient to proceed even without a group/category mapping on file — the
  // mapping-based warning becomes informational only in that case.
  const hasNoRequiredMapping = isUploaderRole
    ? !targetApproverId && !suggestedApprover?.approver
    : mappingsData !== undefined && requiredMappings.length === 0;

  const selectedCategory = (categoriesData || []).find(
    c => c.id === parseInt(form.productCategoryId)
  );
  const selectedGroupId = selectedCategory?.groupId;
  const hasGroupMapping = selectedGroupId
    ? requiredMappings.some(m => m.productGroup?.id === selectedGroupId || m.productGroupId === selectedGroupId)
    : true;

  const grouped = (categoriesData || []).reduce((acc, cat) => {
    const key = cat.group?.name || 'Others';
    if (!acc[key]) acc[key] = [];
    acc[key].push(cat);
    return acc;
  }, {});

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

  const footerDefaults = settings ? {
    xPercent:   parseFloat(settings.footer_default_x_percent || 3),
    yPercent:   parseFloat(settings.footer_default_y_percent || 97),
    widthPt:    parseFloat(settings.footer_default_width_pt  || 220),
    heightPt:   parseFloat(settings.footer_default_height_pt || 30),
    pageNumber: parseInt(settings.footer_default_page        || 1),
    fontSize:   parseFloat(settings.footer_default_font_size || 7),
    rotation:   parseInt(settings.footer_default_rotation    || 0),
  } : null;

  const selectedFileLabel = file?.name || '(file belum dipilih)';
  const footerPreviewLines = [
    'ID Regulatory: (di-generate saat upload)',
    `Nama Label: ${form.labelName || '(belum diisi)'}`,
    `Nama File: ${selectedFileLabel}`,
  ];

  function handleFileDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) validateAndSetFile(f);
  }

  function validateAndSetFile(f) {
    if (f.type !== 'application/pdf') { toast.error('PDF only'); return; }
    if (f.size > 10 * 1024 * 1024)   { toast.error('PDF max size 10MB'); return; }
    setFile(f);
    // Uploader role never e-signs, so never show the position canvas for them.
    setShowCanvas(!isUploaderRole);
    setPosition(null);
  }

  function handleRemoveFile() {
    setFile(null);
    setShowCanvas(false);
    setPosition(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) { toast.error('Select PDF first'); return; }

    const fd = new FormData();
    fd.append('file',              file);
    fd.append('labelName',         form.labelName.trim());
    fd.append('productCategoryId', form.productCategoryId);
    fd.append('tanggalTerima',     form.tanggalTerima);
    fd.append('tanggalPeriksa',    form.tanggalPeriksa);

    // Position / footerPosition are only meaningful for the direct-sign
    // (superadmin) flow — the backend ignores them for the uploader flow
    // anyway (nothing is stamped at upload time), but we avoid sending
    // stale/irrelevant data.
    if (position && !isUploaderRole) {
      fd.append('position', JSON.stringify(position));
    }
    if (footerPosition && !isUploaderRole) {
      fd.append('footerPosition', JSON.stringify(footerPosition));
    }
    if (isUploaderRole && targetApproverId) {
      fd.append('targetApproverId', targetApproverId);
    }

    setLoading(true);
    try {
      const { data } = await api.post('/documents', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(
        isUploaderRole
          ? `Document successfully uploaded! ID: ${data.data.regulatoryId} — waiting for Staff Regulatory review.`
          : `Document successfully uploaded! ID: ${data.data.regulatoryId}`
      );
      afterDocumentUpload(queryClient);
      navigate(`/documents/${data.data.id}`);
    } catch (err) {
      const code    = err.response?.data?.code;
      const message = err.response?.data?.message || 'Upload fail';
      if (code === 'NO_APPROVER') {
        toast.error(
          isUploaderRole
            ? 'Staff Regulatory approver have not configured yet.'
            : 'SPV approver have not configured yet.'
        );
      } else {
        toast.error(message);
      }
    } finally {
      setLoading(false);
    }
  }

  // Memoized so dragging the QR/footer stamp box (which updates position/footerPosition
  // state and re-renders this component) does NOT mint a new blob URL every time —
  // otherwise ESignCanvas's pdfUrl effect sees a "changed" URL and reloads the whole
  // PDF from scratch on every drag, causing a visible flicker/reload each time.
  const localPdfUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    return () => { if (localPdfUrl) URL.revokeObjectURL(localPdfUrl); };
  }, [localPdfUrl]);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Upload Document</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          {isUploaderRole
            ? 'Upload Design Label Regulatory — PDF, Max 10MB. Document will be forwarded to Staff Regulatory.'
            : 'Upload Design Label Regulatory — PDF, Max 10MB'}
        </p>
      </div>

      {hasNoRequiredMapping && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-800 text-sm">Configure {approverLabel} first!</p>
            <p className="text-xs text-red-600 mt-1">
              Document upload will fail because no {approverLabel} approver has been specified.
            </p>
            <Link to="/users" className="text-xs font-semibold text-red-700 underline mt-1 inline-block">
              → User Management → Tab "Product-Approver Mapping"
            </Link>
          </div>
        </div>
      )}

      {!hasNoRequiredMapping && selectedGroupId && !hasGroupMapping && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800 text-sm">
              "{selectedCategory?.group?.name}" group does not yet have a {approverLabel}
            </p>
            <p className="text-xs text-amber-600 mt-1">
              The system will use {approverLabel} from another group / any active superadmin as a fallback.
            </p>
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        onKeyDown={e => { if (e.key === 'Enter' && e.target.type !== 'submit') e.preventDefault(); }}
        className="space-y-5"
      >

        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            dragOver ? 'border-brand-400 bg-brand-50' :
            file     ? 'border-green-400 bg-green-50' :
                       'border-gray-300 hover:border-brand-300 hover:bg-gray-50'
          }`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleFileDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={e => e.target.files?.[0] && validateAndSetFile(e.target.files[0])}
          />
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <FileText size={24} className="text-green-600 shrink-0" />
              <div className="text-left">
                <p className="font-medium text-green-800 text-sm">{file.name}</p>
                <p className="text-xs text-green-600">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); handleRemoveFile(); }}
                className="ml-2 text-gray-400 hover:text-red-500 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          ) : (
            <div>
              <Upload size={32} className="mx-auto text-gray-300 mb-2" />
              <p className="font-medium text-gray-600 text-sm">Click or drag & drop PDF file here</p>
              <p className="text-xs text-gray-400 mt-1">PDF Only · Max. 10MB</p>
            </div>
          )}
        </div>

        {isUploaderRole && file && (
          <div className="card p-4 bg-blue-50 border border-blue-200 flex items-start gap-3">
            <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700">
              This document file will be forwarded to Staff Regulatory for approval.
            </p>
          </div>
        )}

        {!isUploaderRole && showCanvas && localPdfUrl && qrDefaults && (
          <div className="card p-4">
            <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2 text-sm">
              <PenTool size={15} className="text-brand-500" />
              Staff Signature Position (QR Stamp Level 0)
            </h3>
            <p className="text-xs text-gray-400 mb-3">
              Determine the position of your QR stamp on the document before forwarding it to the SPV.
            </p>

            <ESignCanvas
              pdfUrl={localPdfUrl}
              qrDataUrl={null}
              defaults={qrDefaults}
              limits={qrLimits}
              onChange={setPosition}
              footerBox={footerDefaults ? {
                enabled:      true,
                draggable:    true,
                defaults:     footerDefaults,
                onChange:     setFooterPosition,
                previewLines: footerPreviewLines,
              } : undefined}
            />

            {position ? (
              <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-2">
                <p className="text-xs text-green-700 font-medium">
                  Position configured — Page {position.pageNumber} ·
                  X: {position.xPercent?.toFixed(1)}% · Y: {position.yPercent?.toFixed(1)}% ·
                  {position.widthPt?.toFixed(0)}pt × {position.heightPt?.toFixed(0)}pt
                </p>
              </div>
            ) : (
              <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-2">
                <p className="text-xs text-amber-700">
                  The default position will be used if not dragged..
                </p>
              </div>
            )}
          </div>
        )}

        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-gray-900 text-sm">Document Metadata</h3>

          <div>
            <label className="label">Label Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              className="input"
              placeholder="Example: CYD 240ml Regular - Variant Strawberry"
              value={form.labelName}
              onChange={e => setForm(f => ({ ...f, labelName: e.target.value }))}
              required
              maxLength={200}
            />
          </div>

          <div>
            <label className="label">Product Category <span className="text-red-500">*</span></label>
            <select
              className="input"
              value={form.productCategoryId}
              onChange={e => setForm(f => ({ ...f, productCategoryId: e.target.value }))}
              required
            >
              <option value="">— Choose Category —</option>
              {Object.entries(grouped).map(([groupName, cats]) => (
                <optgroup key={groupName} label={groupName}>
                  {cats.filter(c => c.isActive).map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.subGroup ? ` (${c.subGroup})` : ''} — {c.productCode}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {isUploaderRole && (
            <div>
              <label className="label">
                Route to (Staff Regulatory)
                {form.productCategoryId && <span className="text-red-500 ml-1">*</span>}
              </label>
              <select
                className="input"
                value={targetApproverId}
                onChange={e => { setTargetApproverId(e.target.value); setManuallyChanged(true); }}
              >
                <option value="">— Select Staff Regulatory —</option>
                {(candidatesData || []).map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role}){u.id === suggestedApprover?.approver?.id ? ' — Suggested' : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                {suggestedApprover?.approver
                  ? `Suggested based on ${suggestedApprover.source === 'category' ? 'product-specific' : suggestedApprover.source === 'group' ? 'product group' : 'fallback'} mapping — pilih user lain kalau perlu.`
                  : 'Pilih Product Category dulu untuk melihat suggestion, atau pilih manual.'}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Received Date <span className="text-red-500">*</span></label>
              <input
                type="date"
                className="input"
                value={form.tanggalTerima}
                onChange={e => setForm(f => ({ ...f, tanggalTerima: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="label">Check Date <span className="text-red-500">*</span></label>
              <input
                type="date"
                className="input"
                value={form.tanggalPeriksa}
                onChange={e => setForm(f => ({ ...f, tanggalPeriksa: e.target.value }))}
                required
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <button type="button" onClick={() => navigate('/documents')} className="btn-secondary">
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || hasNoRequiredMapping}
            className="btn-primary"
            title={hasNoRequiredMapping ? `Configure ${approverLabel} first` : ''}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {loading ? 'Uploading...' : (isUploaderRole ? 'Upload Document' : 'Upload & Sign')}
          </button>
        </div>
      </form>
    </div>
  );
}
