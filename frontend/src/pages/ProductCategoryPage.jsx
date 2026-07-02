// frontend/src/pages/ProductCategoryPage.jsx
import React, { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Grid, Plus, Edit2, Trash2, Loader2, X, Download, Upload as UploadIcon, AlertTriangle, CheckCircle2 } from 'lucide-react';
import api   from '../services/api';
import toast from 'react-hot-toast';

function CategoryModal({ cat, groups, onClose, onSaved }) {
  const isEdit = !!cat?.id;
  const [form, setForm] = useState({
    groupId:     cat?.groupId     || (groups?.[0]?.id || ''),
    name:        cat?.name        || '',
    subGroup:    cat?.subGroup    || '',
    productCode: cat?.productCode || '',
  });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      if (isEdit) {
        await api.patch(`/products/categories/${cat.id}`, { name: form.name, subGroup: form.subGroup || null });
      } else {
        await api.post('/products/categories', { ...form, groupId: parseInt(form.groupId) });
      }
      toast.success(isEdit ? 'Category updated' : 'Category added');
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">{isEdit ? 'Edit Category' : 'Add Category'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="label">Product Group</label>
            <select className="input" value={form.groupId}
              onChange={e => setForm(f => ({...f, groupId: e.target.value}))} disabled={isEdit}>
              {groups?.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Category Name</label>
            <input type="text" className="input" value={form.name}
              onChange={e => setForm(f => ({...f, name: e.target.value}))} required />
          </div>
          <div>
            <label className="label">Sub Group (optional)</label>
            <input type="text" className="input" value={form.subGroup}
              onChange={e => setForm(f => ({...f, subGroup: e.target.value}))} />
          </div>
          {!isEdit && (
            <div>
              <label className="label">Product Code <span className="text-xs text-gray-400">(5 char only, unique)</span></label>
              <input type="text" className="input font-mono" value={form.productCode} maxLength={5} minLength={5}
                onChange={e => setForm(f => ({...f, productCode: e.target.value.toUpperCase()}))} required />
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
              {loading ? <Loader2 size={15} className="animate-spin" /> : null}
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Shows the row-by-row result of an Excel import: created/updated counts plus
// any per-row errors (unknown group code, bad product code, etc). Import is
// upsert-only and partial-success by design (see product-import-export.service.js)
// — a bad row does NOT roll back the good rows, so surfacing exactly which
// rows failed and why is not optional, it's how the user finds out something
// in their file needs fixing.
function ImportResultModal({ result, onClose }) {
  const hasErrors = result.errors?.length > 0;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Import Result</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-lg font-bold text-green-700">{result.created}</p>
              <p className="text-xs text-green-600">Created</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-lg font-bold text-blue-700">{result.updated}</p>
              <p className="text-xs text-blue-600">Updated</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-lg font-bold text-red-700">{result.errors?.length || 0}</p>
              <p className="text-xs text-red-600">Errors</p>
            </div>
          </div>

          {!hasErrors && (
            <div className="flex items-center gap-2 text-green-700 text-sm">
              <CheckCircle2 size={16} /> All rows imported successfully.
            </div>
          )}

          {hasErrors && (
            <div>
              <p className="text-xs font-semibold text-red-700 mb-2 flex items-center gap-1">
                <AlertTriangle size={14} /> Rows that failed (fix these in your Excel file and re-upload just those rows):
              </p>
              <div className="border border-red-100 rounded-lg divide-y divide-red-50 max-h-64 overflow-y-auto">
                {result.errors.map((e, i) => (
                  <div key={i} className="px-3 py-2 text-xs">
                    <span className="font-mono font-semibold text-red-700">Row {e.row}</span>
                    <span className="text-gray-600"> — {e.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
          <button onClick={onClose} className="btn-primary">Close</button>
        </div>
      </div>
    </div>
  );
}

export default function ProductCategoryPage() {
  const queryClient = useQueryClient();
  const [modal, setModal] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const importInputRef = useRef(null);

  const { data: groups }     = useQuery({ queryKey: ['groups'],     queryFn: () => api.get('/products/groups').then(r => r.data.data) });
  const { data: categories, isLoading } = useQuery({ queryKey: ['categories'], queryFn: () => api.get('/products/categories').then(r => r.data.data) });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['categories'] });
    queryClient.invalidateQueries({ queryKey: ['groups'] });
    setModal(null);
  }

  async function deleteCategory(cat) {
    if (!confirm(`Deactivate category "${cat.name}"?`)) return;
    try {
      await api.delete(`/products/categories/${cat.id}`);
      toast.success('Category successfully deactivated');
      refresh();
    } catch (err) { toast.error(err.response?.data?.message || 'Gagal'); }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await api.get('/products/categories/export', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `product_categories_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (importInputRef.current) importInputRef.current.value = ''; // allow re-selecting the same file next time

    const fd = new FormData();
    fd.append('file', file);

    setImporting(true);
    try {
      const { data } = await api.post('/products/categories/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportResult(data.data);
      // Data was written even if some rows errored (upsert-only, partial-success)
      // — always refresh so the table reflects what actually landed in the DB.
      refresh();
      if (data.data.errors?.length === 0) {
        toast.success(`Import selesai: ${data.data.created} baru, ${data.data.updated} diperbarui.`);
      } else {
        toast.error(`Import selesai dengan ${data.data.errors.length} baris bermasalah — cek detail.`);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  // Group categories
  const grouped = (categories || []).reduce((acc, cat) => {
    const key = cat.group?.name || 'Lainnya';
    if (!acc[key]) acc[key] = [];
    acc[key].push(cat);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {modal !== null && (
        <CategoryModal cat={modal.cat} groups={groups || []} onClose={() => setModal(null)} onSaved={refresh} />
      )}
      {importResult && (
        <ImportResultModal result={importResult} onClose={() => setImportResult(null)} />
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Product Category</h2>
          <p className="text-sm text-gray-500">Group and product category for label classification</p>
        </div>
        <div className="flex gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={handleImportFile}
          />
          <button
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
            className="btn-secondary"
            title="Upsert-only: baris di DB yang tidak ada di file tetap dipertahankan."
          >
            {importing ? <Loader2 size={16} className="animate-spin" /> : <UploadIcon size={16} />}
            Import Excel
          </button>
          <button onClick={handleExport} disabled={exporting} className="btn-secondary">
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Export Excel
          </button>
          <button onClick={() => setModal({ cat: null })} className="btn-primary">
            <Plus size={16} /> Add Category
          </button>
        </div>
      </div>

      {isLoading && <div className="card p-10 text-center"><Loader2 size={24} className="animate-spin text-brand-500 mx-auto" /></div>}

      {Object.entries(grouped).map(([groupName, cats]) => (
        <div key={groupName} className="card overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Grid size={16} className="text-brand-500" /> {groupName}
            </h3>
          </div>
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="w-[30%] px-4 py-3 text-left text-xs font-semibold text-gray-500">
                  Name
                </th>
                <th className="w-[20%] px-4 py-3 text-left text-xs font-semibold text-gray-500">
                  Sub Group
                </th>
                <th className="w-[15%] px-4 py-3 text-left text-xs font-semibold text-gray-500">
                  Product Code
                </th>
                <th className="w-[15%] px-4 py-3 text-left text-xs font-semibold text-gray-500">
                  Status
                </th>
                <th className="w-[20%] px-4 py-3 text-center text-xs font-semibold text-gray-500">
                  Action
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-50">
              {cats.map(cat => (
                <tr
                  key={cat.id}
                  className="hover:bg-slate-50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 truncate">
                      {cat.name}
                    </div>
                  </td>

                  <td className="px-4 py-3 text-gray-600 truncate">
                    {cat.subGroup || '—'}
                  </td>

                  <td className="px-4 py-3">
                    <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">
                      {cat.productCode}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                        cat.isActive
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {cat.isActive ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() => setModal({ cat })}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50"
                      >
                        <Edit2 size={14} />
                      </button>

                      {cat.isActive && (
                        <button
                          onClick={() => deleteCategory(cat)}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-red-200 text-red-500 hover:bg-red-50"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}