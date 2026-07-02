// frontend/src/pages/DocumentListPage.jsx
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Upload,
  Eye,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import api           from '../services/api';
import useAuthStore  from '../store/authStore';
import { format }    from 'date-fns';

// Roles allowed to upload — MUST stay in sync with:
//   - App.jsx            RequireRole on /documents/upload
//   - AppLayout.jsx       NAV entry for /documents/upload
//   - backend document.controller.js exports.upload role check
const UPLOAD_ROLES = ['superadmin', 'uploader', 'admin'];

function StatusBadge({ status }) {
  if (status === 'APPROVED') return <span className="badge-approved">APPROVED</span>;
  if (status === 'DECLINED') return <span className="badge-declined">DECLINED</span>;
  return <span className="badge-pending">PENDING</span>;
}

export default function DocumentListPage() {
  const { user }   = useAuthStore();
  const navigate   = useNavigate();
  const [page,     setPage]     = useState(1);
  const [search,   setSearch]   = useState('');
  const [status,   setStatus]   = useState('');
  const [groupId,  setGroupId]  = useState('');
  const [dateField, setDateField] = useState('tanggalTerima');
  const [dateFrom,  setDateFrom]  = useState('');
  const [dateTo,    setDateTo]    = useState('');

  const { data: groupsData } = useQuery({
    queryKey: ['product-groups'],
    queryFn:  () => api.get('/products/groups').then(r => r.data.data),
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['documents', page, search, status, groupId, dateField, dateFrom, dateTo],
    queryFn:  () => api.get('/documents', {
      params: {
        page,
        limit: 10,
        search: search || undefined,
        status: status || undefined,
        groupId: groupId || undefined,
        dateField: dateField || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      },
    }).then(r => r.data.data),
    keepPreviousData: true,
  });

  const items      = data?.items      || [];
  const pagination = data?.pagination || {};
  const counts     = data?.statusCounts || { pending: 0, approved: 0, declined: 0, total: 0 };

  function fmtDate(d) {
    if (!d) return '-';
    return format(new Date(d), 'dd/MM/yyyy');
  }

  function setStatusFilter(nextStatus) {
    setStatus(current => current === nextStatus ? '' : nextStatus);
    setPage(1);
  }

  const kpis = [
    {
      label: 'Pending',
      value: counts.pending,
      status: 'PENDING_APPROVAL',
      icon: Clock,
      tone: 'border-yellow-200 bg-yellow-50 text-yellow-700',
    },
    {
      label: 'Approved',
      value: counts.approved,
      status: 'APPROVED',
      icon: CheckCircle,
      tone: 'border-green-200 bg-green-50 text-green-700',
    },
    {
      label: 'Declined',
      value: counts.declined,
      status: 'DECLINED',
      icon: XCircle,
      tone: 'border-red-200 bg-red-50 text-red-700',
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">All Documents</h2>
          <p className="text-sm text-gray-500 mt-0.5">Design Label Regulatory</p>
        </div>
        {/* FIX: was `user?.role === 'superadmin'` — silently hid this entry point
            for the 'uploader' role even though App.jsx / AppLayout.jsx / the
            backend controller all already permit uploader to upload documents.
            Uploaders could still reach /documents/upload via the sidebar nav
            link, but this page-level button was a dead end for them. */}
        {UPLOAD_ROLES.includes(user?.role) && (
          <Link to="/documents/upload" className="btn-primary w-full justify-center sm:w-auto">
            <Upload size={16} /> Upload Document
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {kpis.map(({ label, value, status: kpiStatus, icon: Icon, tone }) => (
          <button
            key={kpiStatus}
            type="button"
            onClick={() => setStatusFilter(kpiStatus)}
            className={`card p-4 text-left transition-all hover:shadow-md ${status === kpiStatus ? 'ring-2 ring-brand-500' : ''}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-gray-500">{label}</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
              </div>
              <div className={`w-10 h-10 rounded-lg border flex items-center justify-center ${tone}`}>
                <Icon size={20} />
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="card p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
        <div className="relative md:col-span-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search Nama Label, ID, Nama File..."
            className="input pl-9"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select className="input md:col-span-2" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All Status</option>
          <option value="PENDING_APPROVAL">PENDING</option>
          <option value="APPROVED">APPROVED</option>
          <option value="DECLINED">DECLINED</option>
        </select>
        <select className="input md:col-span-3" value={groupId} onChange={e => { setGroupId(e.target.value); setPage(1); }}>
          <option value="">All Product Group</option>
          {groupsData?.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <select className="input md:col-span-3" value={dateField} onChange={e => { setDateField(e.target.value); setPage(1); }}>
          <option value="tanggalTerima">Tanggal Terima</option>
          <option value="tanggalPeriksa">Tanggal Periksa</option>
          <option value="tanggalApproval">Tanggal Approval</option>
          <option value="createdAt">Tanggal Upload</option>
        </select>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:col-span-6">
          <input
            type="date"
            className="input min-w-0"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPage(1); }}
          />
          <input
            type="date"
            className="input min-w-0"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setPage(1); }}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setSearch('');
            setStatus('');
            setGroupId('');
            setDateField('tanggalTerima');
            setDateFrom('');
            setDateTo('');
            setPage(1);
          }}
          className="btn-secondary justify-center md:col-span-2"
        >
          Reset
        </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        {(isLoading || isFetching) && (
          <div className="h-1 bg-brand-100">
            <div className="h-full bg-brand-500 animate-pulse" style={{ width: '60%' }} />
          </div>
        )}

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['ID Regulatory','Nama Label','Kategori','Status','Tgl Terima','Tgl Verifikasi','Tgl Approval','Aksi'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.length === 0 && !isLoading && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">Tidak ada dokumen</td></tr>
              )}
              {items.map(doc => (
                <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">{doc.regulatoryId}</td>
                  <td className="px-4 py-3 max-w-xs">
                    <p className="font-medium text-gray-900 truncate">{doc.labelName}</p>
                    <p className="text-xs text-gray-400 truncate">{doc.fileNameOriginal}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    <span>{doc.productCategory?.group?.name}</span>
                    {doc.productCategory?.subGroup && <span className="text-gray-400"> - {doc.productCategory.subGroup}</span>}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={doc.status} /></td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(doc.tanggalTerima)}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(doc.tanggalVerifikasi)}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(doc.tanggalApproval)}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => navigate(`/documents/${doc.id}`)} className="btn-secondary py-1 px-3 text-xs">
                      <Eye size={12} /> Detail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="md:hidden divide-y divide-gray-100">
          {items.length === 0 && !isLoading && (
            <div className="px-4 py-10 text-center text-sm text-gray-400">Tidak ada dokumen</div>
          )}
          {items.map(doc => (
            <div key={doc.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{doc.labelName}</p>
                  <p className="text-xs font-mono text-gray-500 mt-0.5">{doc.regulatoryId}</p>
                </div>
                <StatusBadge status={doc.status} />
              </div>
              <div className="text-xs text-gray-500 space-y-1">
                <p className="truncate">{doc.fileNameOriginal}</p>
                <p>
                  {doc.productCategory?.group?.name}
                  {doc.productCategory?.subGroup && <span className="text-gray-400"> - {doc.productCategory.subGroup}</span>}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-gray-400">Terima</p>
                  <p className="font-medium text-gray-700">{fmtDate(doc.tanggalTerima)}</p>
                </div>
                <div>
                  <p className="text-gray-400">Verifikasi</p>
                  <p className="font-medium text-gray-700">{fmtDate(doc.tanggalVerifikasi)}</p>
                </div>
                <div>
                  <p className="text-gray-400">Approval</p>
                  <p className="font-medium text-gray-700">{fmtDate(doc.tanggalApproval)}</p>
                </div>
              </div>
              <button onClick={() => navigate(`/documents/${doc.id}`)} className="btn-secondary w-full justify-center py-1.5 text-xs">
                <Eye size={12} /> Detail
              </button>
            </div>
          ))}
        </div>

        {pagination.pages > 1 && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              Menampilkan {items.length} dari {pagination.total} dokumen
            </p>
            <div className="flex items-center justify-between sm:justify-end gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary py-1 px-2">
                <ChevronLeft size={14} />
              </button>
              <span className="text-sm text-gray-600">{page} / {pagination.pages}</span>
              <button disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)} className="btn-secondary py-1 px-2">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}