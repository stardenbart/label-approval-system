// frontend/src/pages/SystemSettingsPage.jsx
import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings, Save, RotateCcw, Loader2 } from 'lucide-react';
import api   from '../services/api';
import { qk } from '../services/queryKeys';
import { afterSettingsChange } from '../services/cacheSync';
import toast from 'react-hot-toast';

export default function SystemSettingsPage() {
  const queryClient = useQueryClient();
  const [form,    setForm]    = useState({});
  const [loading, setLoading] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: qk.settings(),
    queryFn:  () => api.get('/settings').then(r => r.data.data),
  });

  useEffect(() => {
    if (settings) setForm({ ...settings });
  }, [settings]);

  function field(key, label, min, max, step = 1) {
    return (
      <div key={key}>
        <label className="label">{label}</label>
        <input
          type="number"
          className="input"
          min={min} max={max} step={step}
          value={form[key] || ''}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        />
      </div>
    );
  }

  async function handleSave(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.patch('/settings', {
        qr_default_width_pt:  parseFloat(form.qr_default_width_pt),
        qr_default_height_pt: parseFloat(form.qr_default_height_pt),
        qr_default_page:      parseInt(form.qr_default_page),
        qr_default_x_percent: parseFloat(form.qr_default_x_percent),
        qr_default_y_percent: parseFloat(form.qr_default_y_percent),
        qr_min_width_pt:      parseFloat(form.qr_min_width_pt),
        qr_max_width_pt:      parseFloat(form.qr_max_width_pt),
        footer_default_x_percent: parseFloat(form.footer_default_x_percent),
        footer_default_y_percent: parseFloat(form.footer_default_y_percent),
        footer_default_width_pt:  parseFloat(form.footer_default_width_pt),
        footer_default_height_pt: parseFloat(form.footer_default_height_pt),
        footer_default_page:      parseInt(form.footer_default_page),
        footer_default_font_size: parseFloat(form.footer_default_font_size),
        footer_default_rotation:  parseInt(form.footer_default_rotation),
      });
      afterSettingsChange(queryClient);
      toast.success('Settings berhasil disimpan');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menyimpan');
    } finally {
      setLoading(false);
    }
  }

  async function handleReset() {
    if (!confirm('Reset semua settings ke nilai default?')) return;
    setLoading(true);
    try {
      await api.post('/settings/reset');
      afterSettingsChange(queryClient);
      toast.success('Settings direset ke default');
    } catch (_) {
      toast.error('Gagal reset');
    } finally {
      setLoading(false);
    }
  }

  // Preview: show QR position on A4-like box
  const previewW = 200;
  const previewH = 283; // A4 ratio
  const qxPx  = ((parseFloat(form.qr_default_x_percent) || 85) / 100) * previewW;
  const qyPx  = ((parseFloat(form.qr_default_y_percent) || 5)  / 100) * previewH;
  const qwPx  = ((parseFloat(form.qr_default_width_pt)  || 100) / 595) * previewW;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Settings size={24} className="text-brand-600" />
        <div>
          <h2 className="text-xl font-bold text-gray-900">System Settings</h2>
          <p className="text-sm text-gray-500">Global default QR stamp e-sign configuration</p>
        </div>
      </div>

      {isLoading ? (
        <div className="card p-12 text-center">
          <Loader2 size={24} className="animate-spin text-brand-500 mx-auto" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form */}
          <div className="lg:col-span-2">
            <form
              onSubmit={handleSave}
              onKeyDown={e => { if (e.key === 'Enter' && e.target.type !== 'submit') e.preventDefault(); }}
              className="card p-6 space-y-5"
            >
              <h3 className="font-semibold text-gray-900">Default QR Stamp</h3>

              <div className="grid grid-cols-2 gap-4">
                {field('qr_default_width_pt',  'Default Width (pt)',  60, 200)}
                {field('qr_default_height_pt', 'Default Height (pt)', 60, 200)}
                {field('qr_default_page',      'Default Page',     1, 99)}
                {field('qr_default_x_percent', 'X Default (%)', 0, 100, 0.5)}
                {field('qr_default_y_percent', 'Y Default (%)', 0, 100, 0.5)}
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium text-gray-700 mb-3 text-sm">Resize Range</h4>
                <div className="grid grid-cols-2 gap-4">
                  {field('qr_min_width_pt', 'Minimum Width (pt)', 20, 100)}
                  {field('qr_max_width_pt', 'Maximum Width (pt)', 100, 400)}
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium text-gray-700 mb-3 text-sm">Default Footer Stamp (ID Regulatory / Nama Label / Nama File)</h4>
                <div className="grid grid-cols-2 gap-4">
                  {field('footer_default_width_pt',  'Default Width (pt)',  50, 400)}
                  {field('footer_default_height_pt', 'Default Height (pt)', 15, 100)}
                  {field('footer_default_page',      'Default Page',     1, 99)}
                  {field('footer_default_x_percent', 'X Default (%)', 0, 100, 0.5)}
                  {field('footer_default_y_percent', 'Y Default (%)', 0, 100, 0.5)}
                  {field('footer_default_font_size', 'Font Size (pt)', 5, 24, 0.5)}
                  <div>
                    <label className="label">Orientation</label>
                    <select
                      className="input"
                      value={form.footer_default_rotation ?? '0'}
                      onChange={e => setForm(f => ({ ...f, footer_default_rotation: e.target.value }))}
                    >
                      <option value="0">Horizontal</option>
                      <option value="90">Vertical</option>
                      <option value="180">Flip Horizontal</option>
                      <option value="270">Flip Vertical</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={loading} className="btn-primary">
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Save
                </button>
                <button type="button" onClick={handleReset} disabled={loading} className="btn-secondary">
                  <RotateCcw size={16} /> Reset Default
                </button>
              </div>
            </form>
          </div>

          {/* Preview */}
          <div className="card p-5">
            <h4 className="font-semibold text-gray-900 mb-3 text-sm">Position Preview</h4>
            <p className="text-xs text-gray-400 mb-3">A4 page representation</p>
            <div
              className="relative bg-white border border-gray-300 rounded mx-auto"
              style={{ width: previewW, height: previewH }}
            >
              {/* Page lines */}
              <div className="absolute inset-3 border border-dashed border-gray-200 rounded" />
              {/* QR stamp */}
              <div
                className="absolute bg-brand-100 border-2 border-brand-400 rounded flex items-center justify-center"
                style={{
                  left:   qxPx,
                  top:    qyPx,
                  width:  Math.max(10, qwPx),
                  height: Math.max(10, qwPx),
                }}
                title={`X: ${form.qr_default_x_percent}% Y: ${form.qr_default_y_percent}%`}
              >
                <span className="text-brand-600 text-xs font-bold">QR</span>
              </div>
              <div className="absolute bottom-1 left-0 right-0 text-center">
                <span className="text-xs text-gray-300">A4</span>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3">
              X: {form.qr_default_x_percent}% · Y: {form.qr_default_y_percent}%
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
