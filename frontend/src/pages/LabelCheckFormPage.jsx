// frontend/src/pages/LabelCheckFormPage.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckSquare, AlertTriangle, Save, Send, ArrowLeft, Loader2, Upload, Trash2, Plus, X } from 'lucide-react';
import api   from '../services/api';
import toast from 'react-hot-toast';

const STATUS_OPT = [
  { value: 'OK', label: '✅ OK', activeClass: 'bg-green-100 text-green-800 border-green-400 ring-green-400' },
  { value: 'NG', label: '❌ NG', activeClass: 'bg-red-100 text-red-800 border-red-400 ring-red-400'   },
];

// ─── Remark row — shows saved remarks from DB ─────────────────────
function RemarkRow({ remark, resultId, onDeleted }) {
  // Load image via authenticated fetch (not direct img src)
  const [imgUrl, setImgUrl] = useState(null);

  useEffect(() => {
    if (!remark.id) return;
    let blobUrl = null;
    // Fetch remark image via authenticated endpoint
    api.get(`/label-check/remarks/${remark.id}/image`, { responseType: 'blob' })
      .then(res => { blobUrl = URL.createObjectURL(res.data); setImgUrl(blobUrl); })
      .catch(() => {}); // image may not exist
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [remark.id]);

  return (
    <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
      {imgUrl && (
        <img src={imgUrl} alt="remark" className="w-16 h-16 object-cover rounded border shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-red-800">{remark.description || '(no description)'}</p>
        <p className="text-xs text-red-600 mt-0.5">{remark.remarksText || '(no remarks)'}</p>
        {remark.imageFilename && <p className="text-xs text-gray-400 mt-0.5">{remark.imageFilename}</p>}
      </div>
    </div>
  );
}

// ─── Add remark modal ─────────────────────────────────────────────
function AddRemarkModal({ resultId, onClose, onAdded }) {
  const [desc,    setDesc]    = useState('');
  const [remarks, setRemarks] = useState('');
  const [file,    setFile]    = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);

  function handleFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!['image/jpeg','image/png'].includes(f.type)) { toast.error('Hanya JPG/PNG'); return; }
    if (f.size > 5 * 1024 * 1024) { toast.error('Maksimal 5MB'); return; }
    setFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target.result);
    reader.readAsDataURL(f);
  }

  // Cleanup preview on unmount
  useEffect(() => {
    return () => { if (preview) {} }; // data URL doesn't need revocation
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file)             { toast.error('Pilih gambar terlebih dahulu'); return; }
    if (!desc.trim())      { toast.error('Deskripsi wajib diisi'); return; }
    if (!remarks.trim())   { toast.error('Catatan perbaikan wajib diisi'); return; }

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('image',       file);
      fd.append('description', desc.trim());
      fd.append('remarksText', remarks.trim());
      await api.post(`/label-check/remarks/${resultId}/image`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Remark berhasil ditambahkan');
      onAdded();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal upload remark');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="font-semibold text-gray-900">Tambah Remark NG</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="label">Deskripsi Masalah <span className="text-red-500">*</span></label>
            <input type="text" className="input" value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Contoh: Font size terlalu kecil di bagian komposisi" />
          </div>
          <div>
            <label className="label">Catatan Perbaikan <span className="text-red-500">*</span></label>
            <textarea rows={3} className="input resize-none" value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="Contoh: Perbesar font menjadi minimal 8pt sesuai regulasi BPOM" />
          </div>
          <div>
            <label className="label">Foto / Screenshot <span className="text-red-500">*</span></label>
            <input type="file" accept="image/jpeg,image/png" className="input text-sm"
              onChange={handleFileChange} />
            {preview && (
              <img src={preview} alt="preview" className="mt-2 h-28 rounded border object-cover" />
            )}
            <p className="text-xs text-gray-400 mt-1">Format: JPG/PNG, maksimal 5MB</p>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Batal</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              {loading ? 'Mengupload...' : 'Simpan Remark'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────
export default function LabelCheckFormPage() {
  const { id }      = useParams();
  const navigate    = useNavigate();

  const [results,    setResults]    = useState({});  // { parameterId: 'OK'|'NG' }
  const [saving,     setSaving]     = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [remarkModal, setRemarkModal] = useState(null); // resultId to add remark for

  const { data: params, isLoading: loadingParams } = useQuery({
    queryKey: ['label-check-params'],
    queryFn:  () => api.get('/label-check/parameters').then(r => r.data.data),
  });

  const { data: form, refetch: refetchForm, isLoading: loadingForm } = useQuery({
    queryKey: ['label-check-form', id],
    queryFn:  () => api.get(`/label-check/form/${id}`).then(r => r.data.data),
  });

  // Pre-fill statuses from existing form
  useEffect(() => {
    if (form?.results?.length > 0) {
      const map = {};
      form.results.forEach(r => { map[r.parameterId] = r.status; });
      setResults(map);
    }
  }, [form]);

  function setStatus(parameterId, status) {
    setResults(prev => ({ ...prev, [parameterId]: status }));
  }

  async function handleSave() {
    const entries = Object.entries(results);
    if (entries.length === 0) { toast.error('Isi minimal 1 parameter sebelum menyimpan'); return; }
    setSaving(true);
    try {
      await api.post(`/label-check/form/${id}`, {
        results: entries.map(([parameterId, status]) => ({ parameterId: parseInt(parameterId), status })),
      });
      toast.success('Form tersimpan sebagai draft');
      refetchForm();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    // Validate all required parameters are filled
    const requiredIds = (params || []).filter(p => p.isRequired).map(p => p.id);
    const missing = requiredIds.filter(pid => !results[pid]);
    if (missing.length > 0) {
      toast.error(`${missing.length} parameter wajib belum diisi status-nya`);
      return;
    }

    // Validate all NG parameters have at least 1 remark
    if (form?.results) {
      for (const r of form.results) {
        if (results[r.parameterId] === 'NG') {
          if (!r.remarks || r.remarks.length === 0) {
            toast.error(`Parameter NG "${r.parameter?.name}" wajib memiliki minimal 1 remark`);
            return;
          }
        }
      }
    }

    if (!confirm('Submit form pengecekan? Laporan PDF akan digenerate secara otomatis.')) return;

    setSubmitting(true);
    try {
      // Always save latest statuses first, then submit
      await api.post(`/label-check/form/${id}`, {
        results: Object.entries(results).map(([parameterId, status]) => ({
          parameterId: parseInt(parameterId), status,
        })),
      });
      await api.patch(`/label-check/form/${id}/submit`);
      toast.success('Form berhasil disubmit! Laporan pengecekan sedang digenerate.');
      navigate(`/documents/${id}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal submit form');
    } finally {
      setSubmitting(false);
    }
  }

  const isSubmitted  = !!form?.submittedAt;
  const okCount      = Object.values(results).filter(s => s === 'OK').length;
  const ngCount      = Object.values(results).filter(s => s === 'NG').length;
  const totalFilled  = okCount + ngCount;
  const totalParams  = params?.length || 0;

  // Build lookup: parameterId → result record (contains id for adding remarks)
  const resultByParamId = {};
  if (form?.results) {
    form.results.forEach(r => { resultByParamId[r.parameterId] = r; });
  }

  if (loadingParams || loadingForm) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {remarkModal && (
        <AddRemarkModal
          resultId={remarkModal}
          onClose={() => setRemarkModal(null)}
          onAdded={() => { refetchForm(); setRemarkModal(null); }}
        />
      )}

      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate(`/documents/${id}`)} className="btn-secondary py-1.5 px-2 mt-0.5">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-gray-900">Form Pengecekan Label Design</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Isi status OK/NG per parameter. Parameter NG <strong>wajib</strong> dilengkapi dengan remarks + foto.
          </p>
        </div>
        {/* Progress badge */}
        <div className="text-right shrink-0">
          <p className="text-2xl font-bold text-gray-900">{totalFilled}<span className="text-base text-gray-400">/{totalParams}</span></p>
          <p className="text-xs text-gray-400">parameter diisi</p>
        </div>
      </div>

      {/* Submitted banner */}
      {isSubmitted && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <CheckSquare size={20} className="text-green-600 shrink-0" />
          <div>
            <p className="font-semibold text-green-800 text-sm">Form telah disubmit</p>
            <p className="text-xs text-green-600">
              Overall Status: <strong>{form?.overallStatus}</strong>
            </p>
          </div>
        </div>
      )}

      {/* Parameters */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900 text-sm">Daftar Parameter Pengecekan</h3>
        </div>
        <div className="divide-y divide-gray-100">
          {(params || []).map((param, idx) => {
            const currentStatus  = results[param.id];
            const existingResult = resultByParamId[param.id];
            const remarksList    = existingResult?.remarks || [];
            const isNG           = currentStatus === 'NG';
            const ngMissingRemark = isNG && !isSubmitted && existingResult && remarksList.length === 0;

            return (
              <div
                key={param.id}
                className={`p-4 transition-colors ${
                  isNG ? 'bg-red-50/60' : currentStatus === 'OK' ? 'bg-green-50/30' : ''
                }`}
              >
                <div className="flex items-start gap-4">
                  <span className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-medium text-gray-900 text-sm">{param.name}</p>
                      {param.isRequired && <span className="text-red-400 text-xs">*</span>}
                    </div>
                    {param.description && (
                      <p className="text-xs text-gray-500 mt-0.5">{param.description}</p>
                    )}

                    {/* Remarks for NG parameters */}
                    {isNG && (
                      <div className="mt-3 space-y-2">
                        {remarksList.map(r => (
                          <RemarkRow key={r.id} remark={r} resultId={existingResult?.id} />
                        ))}

                        {/* Warning if NG has no remarks */}
                        {ngMissingRemark && (
                          <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">
                            <AlertTriangle size={12} className="shrink-0" />
                            Wajib tambahkan minimal 1 remark untuk parameter NG sebelum submit
                          </div>
                        )}

                        {/* Add remark button */}
                        {!isSubmitted && (
                          existingResult?.id ? (
                            <button
                              onClick={() => setRemarkModal(existingResult.id)}
                              className="btn-secondary text-xs py-1 px-2.5 mt-1"
                            >
                              <Plus size={12} /> Tambah Remark
                            </button>
                          ) : (
                            <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                              <AlertTriangle size={12} />
                              Simpan draft dulu untuk bisa menambah remarks
                            </p>
                          )
                        )}

                        {remarksList.length > 0 && (
                          <p className="text-xs text-green-600 font-medium">✅ {remarksList.length} remark tersimpan</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Status buttons */}
                  <div className="flex gap-2 shrink-0">
                    {STATUS_OPT.map(opt => (
                      <button
                        key={opt.value}
                        disabled={isSubmitted}
                        onClick={() => setStatus(param.id, opt.value)}
                        className={`px-3 py-1.5 rounded-lg border text-sm font-semibold transition-all
                          ${currentStatus === opt.value
                            ? `${opt.activeClass} ring-2 ring-offset-1`
                            : 'border-gray-200 bg-white text-gray-400 hover:border-gray-400 hover:text-gray-600'
                          }
                          ${isSubmitted ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}
                        `}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary */}
      {totalFilled > 0 && (
        <div className={`card p-4 flex items-center gap-4 ${
          ngCount > 0 ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'
        }`}>
          {ngCount > 0
            ? <AlertTriangle size={20} className="text-red-500 shrink-0" />
            : <CheckSquare size={20} className="text-green-600 shrink-0" />
          }
          <div>
            <p className={`font-semibold text-sm ${ngCount > 0 ? 'text-red-800' : 'text-green-800'}`}>
              Overall: {ngCount > 0 ? `NOT OK — ${ngCount} parameter NG` : 'OK — Semua parameter terpenuhi'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              ✅ OK: {okCount} &nbsp;·&nbsp; ❌ NG: {ngCount} &nbsp;·&nbsp; ⬜ Belum diisi: {totalParams - totalFilled}
            </p>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {!isSubmitted && (
        <div className="flex gap-3 justify-end">
          <button onClick={() => navigate(`/documents/${id}`)} className="btn-secondary">
            Batal
          </button>
          <button onClick={handleSave} disabled={saving || submitting} className="btn-secondary">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? 'Menyimpan...' : 'Simpan Draft'}
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || submitting || totalFilled === 0}
            className="btn-primary"
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {submitting ? 'Memproses...' : 'Submit & Generate Laporan'}
          </button>
        </div>
      )}
    </div>
  );
}
