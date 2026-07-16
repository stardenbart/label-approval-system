// frontend/src/pages/UserManagementPage.jsx
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Edit2, Key, UserX, UserCheck, Loader2, X, Link2, Trash2, Shield } from 'lucide-react';
import api         from '../services/api';
import useAuthStore from '../store/authStore';
import toast        from 'react-hot-toast';

const ROLES = ['superadmin','admin','approver','viewer','uploader'];
const ROLE_COLOR = {
  superadmin: 'bg-purple-100 text-purple-700',
  admin:      'bg-blue-100 text-blue-700',
  approver:   'bg-green-100 text-green-700',
  viewer:     'bg-gray-100 text-gray-600',
  uploader:   'bg-amber-100 text-amber-700',
};

// Mapping levels: keep in one place so the form, the grid, and copy stay in sync.
const MAPPING_LEVELS = [
  { level: 0, label: 'Level 0 — Staff Regulatory',       shortLabel: 'Staff Regulatory',       description: 'Initial reviewer for documents uploaded via the Uploader role', tone: 'amber' },
  { level: 1, label: 'Level 1 — SPV Regulatory',          shortLabel: 'SPV Regulatory',          description: 'First document recipient',                                    tone: 'blue' },
  { level: 2, label: 'Level 2 — Manager Regulatory',   shortLabel: 'Manager Regulatory',   description: 'Final approver',                                               tone: 'green' },
];

const LEVEL_TONE_CLASSES = {
  amber: { header: 'bg-amber-50 border-amber-100', badge: 'text-amber-700 bg-amber-100', title: 'text-amber-900', hint: 'text-amber-500' },
  blue:  { header: 'bg-blue-50 border-blue-100',   badge: 'text-blue-700 bg-blue-100',   title: 'text-blue-900',  hint: 'text-blue-500' },
  green: { header: 'bg-green-50 border-green-100', badge: 'text-green-700 bg-green-100', title: 'text-green-900', hint: 'text-green-500' },
};

// ─── User Create/Edit Modal ────────────────────────────────────────
function UserModal({ user, onClose, onSaved }) {
  const isEdit = !!user?.id;
  const [form, setForm] = useState({
    name:     user?.name  || '',
    email:    user?.email || '',
    role:     user?.role  || 'approver',
    password: '',
  });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      if (isEdit) {
        await api.patch(`/users/${user.id}`, { name: form.name, role: form.role });
        toast.success('User successfully updated');
      } else {
        await api.post('/users', form);
        toast.success('User successfully added');
      }
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save user data');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">{isEdit ? 'Edit User' : 'Add User'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <form
          onSubmit={handleSubmit}
          onKeyDown={e => { if (e.key === 'Enter' && e.target.type !== 'submit') e.preventDefault(); }}
          className="p-6 space-y-4"
        >
          <div>
            <label className="label">Full Name</label>
            <input type="text" className="input" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required maxLength={100} />
          </div>
          {!isEdit && (
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
            </div>
          )}
          <div>
            <label className="label">Role</label>
            <select className="input" value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              {ROLES.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            {form.role === 'uploader' && (
              <p className="text-xs text-amber-500 mt-1">
                Uploader submits documents without e-sign; they route to whoever is mapped as Level 0 (Staff Regulatory) below.
              </p>
            )}
          </div>
          {!isEdit && (
            <div>
              <label className="label">Password</label>
              <input type="password" className="input" value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Min 8 karakter, 1 huruf kapital, 1 angka" required minLength={8} />
              <p className="text-xs text-amber-500 mt-1">
                User need to change password after first login
              </p>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
              {loading && <Loader2 size={15} className="animate-spin" />}
              {isEdit ? 'Save' : 'Add User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Product-Approver Mapping Tab ─────────────────────────────────
function MappingTab() {
  const queryClient = useQueryClient();
  const [form, setForm]     = useState({ productGroupId: '', productCategoryId: '', approverUserId: '', level: '1', scope: 'group' });
  const [loading, setLoading] = useState(false);

  const { data: mappings, isLoading: loadingMappings } = useQuery({
    queryKey: ['mappings'],
    queryFn:  () => api.get('/users/mappings/all').then(r => r.data.data),
  });
  const { data: groups }     = useQuery({ queryKey: ['groups'],  queryFn: () => api.get('/products/groups').then(r => r.data.data) });
  const { data: users }      = useQuery({ queryKey: ['users'],   queryFn: () => api.get('/users').then(r => r.data.data) });
  const { data: categories } = useQuery({ queryKey: ['product-categories'], queryFn: () => api.get('/products/categories').then(r => r.data.data) });

  const isLevel0 = form.level === '0';
  const categoriesInGroup = (categories || []).filter(
    c => c.isActive && (c.groupId === parseInt(form.productGroupId) || c.group?.id === parseInt(form.productGroupId))
  );

  // NOTE: intentionally excludes 'uploader' — uploaders submit documents, they
  // are never valid targets for a mapping at any level (0, 1, or 2). This list
  // mirrors what the backend's fallback logic treats as a plausible approver.
  const eligibleApprovers = (users || []).filter(u =>
    u.isActive && ['superadmin','admin','approver'].includes(u.role)
  );

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.productGroupId || !form.approverUserId) {
      toast.error('Select group product and approver');
      return;
    }
    const useCategory = isLevel0 && form.scope === 'category';
    if (useCategory && !form.productCategoryId) {
      toast.error('Select the specific product for this override');
      return;
    }
    setLoading(true);
    try {
      await api.post('/users/mappings', {
        productGroupId:    parseInt(form.productGroupId),
        productCategoryId: useCategory ? parseInt(form.productCategoryId) : null,
        approverUserId:    form.approverUserId,
        level:             parseInt(form.level),
      });
      toast.success(`Mapping Level ${form.level} saved`);
      queryClient.invalidateQueries({ queryKey: ['mappings'] });
      setForm(f => ({ ...f, approverUserId: '', productCategoryId: '' }));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save mapping');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this mapping?')) return;
    try {
      await api.delete(`/users/mappings/${id}`);
      toast.success('Mapping deleted');
      queryClient.invalidateQueries({ queryKey: ['mappings'] });
    } catch (_) {
      toast.error('Failed to delete mapping');
    }
  }

  // Group mappings by level for display
  const mappingsByLevel = MAPPING_LEVELS.reduce((acc, { level }) => {
    acc[level] = (mappings || []).filter(m => m.level === level);
    return acc;
  }, {});

  return (
    <div className="space-y-6">

      {/* Add mapping form */}
      <div className="card p-5">
        <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Plus size={16} className="text-brand-500" /> Add / Update Mapping
        </h4>
        <form
          onSubmit={handleAdd}
          onKeyDown={e => { if (e.key === 'Enter' && e.target.type !== 'submit') e.preventDefault(); }}
          className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
        >
          <div>
            <label className="label">Product Group</label>
            <select className="input" value={form.productGroupId}
              onChange={e => setForm(f => ({ ...f, productGroupId: e.target.value, productCategoryId: '' }))} required>
              <option value="">— Select Group —</option>
              {(groups || []).filter(g => g.isActive).map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Level</label>
            <select className="input" value={form.level}
              onChange={e => setForm(f => ({ ...f, level: e.target.value, scope: 'group', productCategoryId: '' }))}>
              {MAPPING_LEVELS.map(({ level, label }) => (
                <option key={level} value={String(level)}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Approver</label>
            <select className="input" value={form.approverUserId}
              onChange={e => setForm(f => ({ ...f, approverUserId: e.target.value }))} required>
              <option value="">— Select User —</option>
              {eligibleApprovers.map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={loading} className="btn-primary justify-center">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
            Save
          </button>

          {isLevel0 && (
            <div className="sm:col-span-4 flex items-center gap-4 -mt-1">
              <label className="flex items-center gap-1.5 text-sm text-gray-600">
                <input type="radio" name="mapping-scope" checked={form.scope === 'group'}
                  onChange={() => setForm(f => ({ ...f, scope: 'group', productCategoryId: '' }))} />
                Whole Group
              </label>
              <label className="flex items-center gap-1.5 text-sm text-gray-600">
                <input type="radio" name="mapping-scope" checked={form.scope === 'category'}
                  onChange={() => setForm(f => ({ ...f, scope: 'category' }))} />
                Specific Product
              </label>
            </div>
          )}

          {isLevel0 && form.scope === 'category' && (
            <div className="sm:col-span-4">
              <label className="label">Specific Product</label>
              <select className="input" value={form.productCategoryId}
                onChange={e => setForm(f => ({ ...f, productCategoryId: e.target.value }))} required
                disabled={!form.productGroupId}>
                <option value="">— Select Product —</option>
                {categoriesInGroup.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.subGroup ? ` (${c.subGroup})` : ''} — {c.productCode}
                  </option>
                ))}
              </select>
              {!form.productGroupId && (
                <p className="text-xs text-amber-500 mt-1">Select a Product Group first</p>
              )}
            </div>
          )}
        </form>
        <p className="text-xs text-gray-400 mt-2">
          If a mapping for the same group/product + level already exists, it will be automatically replaced (upsert).
          Product-specific override is only available at Level 0 (Staff Regulatory) — a product without its own override falls back to the group's default.
        </p>
      </div>

      {/* Existing mappings */}
      {loadingMappings ? (
        <div className="card p-8 text-center"><Loader2 size={20} className="animate-spin text-brand-400 mx-auto" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {MAPPING_LEVELS.map(({ level, shortLabel, description, tone }) => {
            const rows    = mappingsByLevel[level] || [];
            const classes = LEVEL_TONE_CLASSES[tone];
            return (
              <div key={level} className="card overflow-hidden">
                <div className={`px-4 py-3 border-b flex items-center gap-2 ${classes.header}`}>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${classes.badge}`}>Level {level}</span>
                  <span className={`text-sm font-semibold ${classes.title}`}>{shortLabel}</span>
                </div>
                <p className={`px-4 pt-2 text-xs ${classes.hint}`}>{description}</p>
                {rows.length === 0 ? (
                  <div className="p-4 text-center">
                    <p className="text-sm text-amber-600 font-medium">There is no Level {level} mapping yet</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {level === 0
                        ? 'Uploads via the Uploader role will fall back to any active Superadmin as Staff Regulatory — not necessarily who you intend.'
                        : level === 1
                          ? 'Uploads will fall back to any active Superadmin/Admin as SPV — not necessarily who you intend.'
                          : 'SPV can select the Manager Regulatory approver manually during their approval.'}
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs text-gray-500">
                          {level === 0 ? 'Product Group / Specific Product' : 'Product Group'}
                        </th>
                        <th className="px-4 py-2 text-left text-xs text-gray-500">Approver</th>
                        <th className="px-4 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {rows
                        .slice()
                        .sort((a, b) => (a.productCategory ? 1 : 0) - (b.productCategory ? 1 : 0))
                        .map(m => (
                        <tr key={m.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-medium text-gray-800">
                            {m.productCategory ? (
                              <>
                                <span className="text-xs bg-brand-50 text-brand-600 border border-brand-200 px-1.5 py-0.5 rounded-full mr-1.5">Product</span>
                                {m.productCategory.name} ({m.productCategory.productCode})
                                <span className="block text-xs font-normal text-gray-400">{m.productGroup?.name}</span>
                              </>
                            ) : (
                              <>
                                {level === 0 && (
                                  <span className="text-xs bg-gray-100 text-gray-500 border border-gray-200 px-1.5 py-0.5 rounded-full mr-1.5">Group default</span>
                                )}
                                {m.productGroup?.name}
                              </>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <p className="text-sm text-gray-900">{m.approver?.name}</p>
                            <p className="text-xs text-gray-400">{m.approver?.email}</p>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button onClick={() => handleDelete(m.id)} className="text-red-400 hover:text-red-600">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────
export default function UserManagementPage() {
  const queryClient  = useQueryClient();
  const currentUser  = useAuthStore(s => s.user);
  const [activeTab,  setActiveTab]  = useState('users'); // 'users' | 'mappings'
  const [modal,      setModal]      = useState(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn:  () => api.get('/users').then(r => r.data.data),
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['users'] });
    setModal(null);
  }

  async function toggleActive(user) {
    if (user.id === currentUser?.id) {
      toast.error('Cannot deactivate own account');
      return;
    }
    const action = user.isActive ? 'Deactive' : 'Activate';
    if (!confirm(`${action} user ${user.name}?`)) return;
    try {
      await api.patch(`/users/${user.id}`, { isActive: !user.isActive });
      toast.success(`User successfullet ${action.toLowerCase()}`);
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'failed');
    }
  }

  async function resetPassword(user) {
    if (!confirm(`Reset password ${user.name}? New password sent via email.`)) return;
    try {
      await api.post(`/users/${user.id}/reset-password`);
      toast.success('Password reset and informed to user via email');
    } catch (_) {
      toast.error('Failed to reset password');
    }
  }

  const TABS = [
    { id: 'users',    label: 'User List',              icon: Users },
    { id: 'mappings', label: 'Product-Approver Mapping', icon: Link2 },
  ];

  return (
    <div className="space-y-5">
      {modal !== null && (
        <UserModal user={modal.user} onClose={() => setModal(null)} onSaved={refresh} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">User Management</h2>
          <p className="text-sm text-gray-500 mt-0.5">Manage user and configure approval structure</p>
        </div>
        {activeTab === 'users' && (
          <button onClick={() => setModal({ user: null })} className="btn-primary">
            <Plus size={16} /> Add User
          </button>
        )}
      </div>

      {/* Tabs */}
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
            </button>
          );
        })}
      </div>

      {/* Tab: Users */}
      {activeTab === 'users' && (
        <div className="card overflow-hidden">
          {isLoading ? (
            <div className="p-10 text-center"><Loader2 size={24} className="animate-spin text-brand-500 mx-auto" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Name','Email','Role','Status','Action'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(users || []).map(u => (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{u.name}</p>
                        {u.mustChangePwd && (
                          <p className="text-xs text-amber-500 flex items-center gap-1 mt-0.5">
                            ● Need to change password
                          </p>
                        )}
                        {u.id === currentUser?.id && (
                          <p className="text-xs text-brand-500 mt-0.5">● Your Account</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_COLOR[u.role]}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          u.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                        }`}>
                          {u.isActive ? 'Activate' : 'Deactivate'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button onClick={() => setModal({ user: u })} className="btn-secondary py-1 px-2 text-xs">
                            <Edit2 size={11} /> Edit
                          </button>
                          <button onClick={() => resetPassword(u)} className="btn-secondary py-1 px-2 text-xs">
                            <Key size={11} /> Reset Password
                          </button>
                          {u.id !== currentUser?.id && (
                            <button onClick={() => toggleActive(u)}
                              className={`btn-secondary py-1 px-2 text-xs ${u.isActive ? 'text-red-500 hover:text-red-700' : 'text-green-600 hover:text-green-800'}`}>
                              {u.isActive ? <UserX size={11} /> : <UserCheck size={11} />}
                              {u.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Mappings */}
      {activeTab === 'mappings' && <MappingTab />}
    </div>
  );
}
