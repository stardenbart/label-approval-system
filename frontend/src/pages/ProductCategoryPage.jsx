// frontend/src/pages/ProductCategoryPage.jsx
import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Grid, Plus, Edit2, Trash2, Loader2, X,
  Download, Upload as UploadIcon,
  AlertTriangle, CheckCircle2, Layers,
} from 'lucide-react';
import api   from '../services/api';
import { qk } from '../services/queryKeys';
import { afterProductChange } from '../services/cacheSync';
import toast from 'react-hot-toast';

// ─── Group Modal (Add / Edit) ──────────────────────────────────────
function GroupModal({ group, onClose, onSaved }) {
  const isEdit = !!group?.id;
  const [form, setForm] = useState({
    code: group?.code || '',
    name: group?.name || '',
  });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isEdit && form.code.trim().length < 2) {
      toast.error('Group code minimum 2 characters');
      return;
    }
    setLoading(true);
    try {
      if (isEdit) {
        await api.patch(`/products/groups/${group.id}`, { name: form.name.trim() });
        toast.success('Product Group successfully updated');
      } else {
        await api.post('/products/groups', {
          code: form.code.trim().toUpperCase(),
          name: form.name.trim(),
        });
        toast.success('New Product Group successfully added');
      }
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save group');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Layers size={16} className="text-brand-500" />
            {isEdit ? 'Edit Product Group' : 'Add Product Group'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <form
          onSubmit={handleSubmit}
          onKeyDown={e => { if (e.key === 'Enter' && e.target.type !== 'submit') e.preventDefault(); }}
          className="p-6 space-y-4"
        >
          {!isEdit && (
            <div>
              <label className="label">
                Group Code
              </label>
              <input
                type="text"
                className="input font-mono uppercase"
                placeholder="Example: CYD01"
                value={form.code}
                maxLength={10}
                onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                required
              />
              <p className="text-xs text-gray-400 mt-1">
                The code cannot be changed once saved — choose carefully.
              </p>
            </div>
          )}
          {isEdit && (
            <div>
              <label className="label">Group Code</label>
              <input
                type="text"
                className="input font-mono bg-gray-50 cursor-not-allowed"
                value={group.code}
                disabled
              />
            </div>
          )}
          <div>
            <label className="label">Group Name</label>
            <input
              type="text"
              className="input"
              placeholder="Example: UHT Milk 250 ml"
              value={form.name}
              maxLength={100}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
              {loading && <Loader2 size={15} className="animate-spin" />}
              {isEdit ? 'Save' : 'Add Group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Category Modal (Add / Edit) ──────────────────────────────────
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
        await api.patch(`/products/categories/${cat.id}`, {
          name:     form.name.trim(),
          subGroup: form.subGroup.trim() || null,
        });
        toast.success('Category successfully updated');
      } else {
        await api.post('/products/categories', {
          ...form,
          name:     form.name.trim(),
          subGroup: form.subGroup.trim() || null,
          groupId:  parseInt(form.groupId),
        });
        toast.success('Category successfully added');
      }
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save category');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">
            {isEdit ? 'Edit Category' : 'Add Category'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <form
          onSubmit={handleSubmit}
          onKeyDown={e => { if (e.key === 'Enter' && e.target.type !== 'submit') e.preventDefault(); }}
          className="p-6 space-y-4"
        >
          <div>
            <label className="label">Product Group</label>
            <select
              className="input"
              value={form.groupId}
              onChange={e => setForm(f => ({ ...f, groupId: e.target.value }))}
              disabled={isEdit}
            >
              {groups?.filter(g => g.isActive).map(g => (
                <option key={g.id} value={g.id}>{g.name} ({g.code})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Category Name</label>
            <input
              type="text"
              className="input"
              value={form.name}
              maxLength={150}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="label">Sub Grup (optional)</label>
            <input
              type="text"
              className="input"
              placeholder="Example: Regular, No Added Sugar"
              value={form.subGroup}
              maxLength={100}
              onChange={e => setForm(f => ({ ...f, subGroup: e.target.value }))}
            />
          </div>
          {!isEdit && (
            <div>
              <label className="label">
                Product Code{' '}
              </label>
              <input
                type="text"
                className="input font-mono tracking-widest"
                placeholder="CYD01"
                value={form.productCode}
                maxLength={100}
                onChange={e => setForm(f => ({ ...f, productCode: e.target.value.toUpperCase() }))}
                required
              />
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
              {loading && <Loader2 size={15} className="animate-spin" />}
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Import Result Modal ───────────────────────────────────────────
function ImportResultModal({ result, onClose }) {
  const hasErrors = result.errors?.length > 0;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Import Results</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <p className="text-lg font-bold text-purple-700">{result.groupsAutoCreated ?? 0}</p>
              <p className="text-xs text-purple-600">Group Added</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-lg font-bold text-green-700">{result.created ?? 0}</p>
              <p className="text-xs text-green-600">New Category</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-lg font-bold text-blue-700">{result.updated ?? 0}</p>
              <p className="text-xs text-blue-600">Updated</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-lg font-bold text-red-700">{result.errors?.length ?? 0}</p>
              <p className="text-xs text-red-600">Error</p>
            </div>
          </div>

          {/* Auto-created groups */}
          {(result.groupsAutoCreated ?? 0) > 0 && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm">
              <p className="font-medium text-purple-800 mb-1">
                {result.groupsAutoCreated} new groups are automatically created from non-existing code:
              </p>
              <p className="text-xs text-purple-600 font-mono">
                {result.newGroupCodes?.join(', ')}
              </p>
            </div>
          )}

          {!hasErrors && (
            <div className="flex items-center gap-2 text-green-700 text-sm">
              <CheckCircle2 size={16} /> All rows imported successfully.
            </div>
          )}

          {hasErrors && (
            <div>
              <p className="text-xs font-semibold text-red-700 mb-2 flex items-center gap-1">
                <AlertTriangle size={14} />
                Failed rows (fix in Excel file then re-upload only those rows):
              </p>
              <div className="border border-red-100 rounded-lg divide-y divide-red-50 max-h-60 overflow-y-auto">
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

// ─── Main Page ─────────────────────────────────────────────────────
export default function ProductCategoryPage() {
  const queryClient   = useQueryClient();
  const [activeTab,   setActiveTab]   = useState('categories'); // 'groups' | 'categories'
  const [modal,       setModal]       = useState(null);         // { type: 'group'|'category', item }
  const [importResult, setImportResult] = useState(null);
  const [importing,   setImporting]   = useState(false);
  const [exporting,   setExporting]   = useState(false);
  const importInputRef = useRef(null);

  const { data: groups, isLoading: loadingGroups } = useQuery({
    queryKey: qk.productGroups(),
    queryFn:  () => api.get('/products/groups').then(r => r.data.data),
  });
  const { data: categories, isLoading: loadingCats } = useQuery({
    queryKey: qk.productCategories(),
    queryFn:  () => api.get('/products/categories').then(r => r.data.data),
  });

  function refresh() {
    // Kategori & grup juga dipakai halaman upload dan mapping approver — daftar
    // lengkap apa saja yang ikut basi ada di services/cacheSync.js.
    afterProductChange(queryClient);
    setModal(null);
  }

  // ── Group actions ──────────────────────────────────────────────
  async function deleteGroup(group) {
    if (!confirm(`Deactivate group "${group.name}" (${group.code})?\n\nCategories in this group will not be deleted.`)) return;
    try {
      await api.delete(`/products/groups/${group.id}`);
      toast.success('Group successfully deactivated');
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to deactivate group');
    }
  }

  // ── Category actions ───────────────────────────────────────────
  async function deleteCategory(cat) {
    if (!confirm(`Deactivate category "${cat.name}"?`)) return;
    try {
      await api.delete(`/products/categories/${cat.id}`);
      toast.success('Category successfully deactivated');
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to deactivate category');
    }
  }

  // ── Import / Export ────────────────────────────────────────────
  async function handleExport() {
    setExporting(true);
    try {
      const res = await api.get('/products/export', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `produk_dal_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Export gagal');
    } finally {
      setExporting(false);
    }
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (importInputRef.current) importInputRef.current.value = '';

    const fd = new FormData();
    fd.append('file', file);

    setImporting(true);
    try {
      const { data } = await api.post('/products/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportResult(data.data);
      refresh();
      if (!data.data.errors?.length) {
        toast.success(
          `Import finish: ${data.data.groupsAutoCreated ?? 0} new group, ` +
          `${data.data.created} new category, ${data.data.updated} updated.`
        );
      } else {
        toast.error(`Import completed with ${data.data.errors.length} problematic lines — check details.`);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  // ── Group category grouping for categories tab ─────────────────
  const grouped = (categories || []).reduce((acc, cat) => {
    const key = cat.group?.name || 'Others';
    if (!acc[key]) acc[key] = [];
    acc[key].push(cat);
    return acc;
  }, {});

  const TABS = [
    { id: 'categories', label: 'Product Category', icon: Grid },
    { id: 'groups',     label: 'Product Group',     icon: Layers },
  ];

  return (
    <div className="space-y-5">
      {/* ── Modals ─────────────────────────────────────────────── */}
      {modal?.type === 'group' && (
        <GroupModal group={modal.item} onClose={() => setModal(null)} onSaved={refresh} />
      )}
      {modal?.type === 'category' && (
        <CategoryModal cat={modal.item} groups={groups || []} onClose={() => setModal(null)} onSaved={refresh} />
      )}
      {importResult && (
        <ImportResultModal result={importResult} onClose={() => setImportResult(null)} />
      )}

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Product Management</h2>
          <p className="text-sm text-gray-500 mt-0.5">Manage product groups and categories for label classification</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Import/Export — always visible */}
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
            title="Upsert-only: Old data that is no longer in the file will be retained. A new Group Code will be automatically created.."
          >
            {importing ? <Loader2 size={16} className="animate-spin" /> : <UploadIcon size={16} />}
            Import Excel
          </button>
          <button onClick={handleExport} disabled={exporting} className="btn-secondary">
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Export Excel
          </button>

          {/* Add button — depends on active tab */}
          {activeTab === 'groups' ? (
            <button onClick={() => setModal({ type: 'group', item: null })} className="btn-primary">
              <Plus size={16} /> Add Group
            </button>
          ) : (
            <button onClick={() => setModal({ type: 'category', item: null })} className="btn-primary">
              <Plus size={16} /> Add Category
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={15} />
              {tab.label}
              {tab.id === 'groups' && (
                <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                  {(groups || []).length}
                </span>
              )}
              {tab.id === 'categories' && (
                <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                  {(categories || []).length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab: Grup Produk ────────────────────────────────────── */}
      {activeTab === 'groups' && (
        <div className="card overflow-hidden">
          {loadingGroups ? (
            <div className="p-10 text-center">
              <Loader2 size={24} className="animate-spin text-brand-500 mx-auto" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Group Code','Group Name','Number of Categories','Status','Action'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(groups || []).length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">
                        There are no product groups yet
                      </td>
                    </tr>
                  )}
                  {(groups || []).map(g => {
                    const catCount = (categories || []).filter(c => c.groupId === g.id).length;
                    return (
                      <tr key={g.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded font-semibold">
                            {g.code}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">{g.name}</td>
                        <td className="px-4 py-3 text-gray-500 text-sm">{catCount} category</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                            g.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {g.isActive ? 'Active' : 'Deactivated'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setModal({ type: 'group', item: g })}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                              title="Edit group"
                            >
                              <Edit2 size={13} />
                            </button>
                            {g.isActive && catCount === 0 && (
                              <button
                                onClick={() => deleteGroup(g)}
                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
                                title="Deactivate group"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                            {g.isActive && catCount > 0 && (
                              <span className="text-xs text-gray-400 pl-1">
                                Delete the category first
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Kategori Produk ─────────────────────────────────── */}
      {activeTab === 'categories' && (
        <>
          {loadingCats && (
            <div className="card p-10 text-center">
              <Loader2 size={24} className="animate-spin text-brand-500 mx-auto" />
            </div>
          )}
          {Object.entries(grouped).map(([groupName, cats]) => (
            <div key={groupName} className="card overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Grid size={16} className="text-brand-500" />
                  {groupName}
                  <span className="text-xs text-gray-400 font-normal">({cats.length} category)</span>
                </h3>
              </div>
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="w-[30%] px-4 py-3 text-left text-xs font-semibold text-gray-500">Name</th>
                    <th className="w-[20%] px-4 py-3 text-left text-xs font-semibold text-gray-500">Sub Group</th>
                    <th className="w-[15%] px-4 py-3 text-left text-xs font-semibold text-gray-500">Product Code</th>
                    <th className="w-[15%] px-4 py-3 text-left text-xs font-semibold text-gray-500">Status</th>
                    <th className="w-[20%] px-4 py-3 text-center text-xs font-semibold text-gray-500">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {cats.map(cat => (
                    <tr key={cat.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900 truncate">{cat.name}</td>
                      <td className="px-4 py-3 text-gray-600 truncate">{cat.subGroup || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">
                          {cat.productCode}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                          cat.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {cat.isActive ? 'Active' : 'Deactivated'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => setModal({ type: 'category', item: cat })}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                            title="Edit category"
                          >
                            <Edit2 size={13} />
                          </button>
                          {cat.isActive && (
                            <button
                              onClick={() => deleteCategory(cat)}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
                              title="Deactivate category"
                            >
                              <Trash2 size={13} />
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
          {!loadingCats && Object.keys(grouped).length === 0 && (
            <div className="card p-10 text-center text-gray-400 text-sm">
              There are no categories yet. Add a category or import from Excel.
            </div>
          )}
        </>
      )}

      {/* ── Import hint ─────────────────────────────────────────── */}
      <div className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
        <strong>Import Tips:</strong> Export first to get the Excel template with the correct format..
        Imports are<em>upsert-only</em> — old data that is no longer in the file remains in the database.
        If the <em>Group Code column</em> contains a new code that does not exist yet, the group will be automatically created.
      </div>
    </div>
  );
}