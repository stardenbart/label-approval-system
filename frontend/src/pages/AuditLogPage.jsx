// frontend/src/pages/AuditLogPage.jsx
import React, { useState } from 'react';
import { useQuery }  from '@tanstack/react-query';
import { format }    from 'date-fns';
import { ClipboardList, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import api from '../services/api';

export default function AuditLogPage() {
  const [page,     setPage]     = useState(1);
  const [action,   setAction]   = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['audit', page, action, dateFrom, dateTo],
    queryFn:  () => api.get('/audit', {
      params: { page, limit: 30, action: action || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined },
    }).then(r => r.data.data),
    keepPreviousData: true,
  });

  const items      = data?.items      || [];
  const pagination = data?.pagination || {};

  const ACTION_COLOR = {
    LOGIN_SUCCESS:       'bg-green-100 text-green-700',
    LOGIN_FAILED:        'bg-red-100 text-red-700',
    LOGOUT:              'bg-gray-100 text-gray-600',
    DOCUMENT_UPLOADED:   'bg-blue-100 text-blue-700',
    DOCUMENT_APPROVED:   'bg-emerald-100 text-emerald-700',
    DOCUMENT_DECLINED:   'bg-red-100 text-red-700',
    DOCUMENT_DOWNLOADED: 'bg-purple-100 text-purple-700',
    DOCUMENT_DELETED:    'bg-red-100 text-red-700',
    USER_CREATED:        'bg-blue-100 text-blue-700',
    PASSWORD_CHANGED:    'bg-amber-100 text-amber-700',
    PASSWORD_RESET:      'bg-amber-100 text-amber-700',
    SETTINGS_UPDATED:    'bg-indigo-100 text-indigo-700',
    QR_ESIGN_ACCESSED:   'bg-cyan-100 text-cyan-700',
    QR_ORIGINAL_ACCESSED:'bg-cyan-100 text-cyan-700',
    LABEL_CHECK_SUBMITTED:'bg-teal-100 text-teal-700',
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <ClipboardList size={22} className="text-brand-600" />
        <div>
          <h2 className="text-xl font-bold text-gray-900">Audit Log</h2>
          <p className="text-sm text-gray-500">All activity recorded on the system</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Filter action (LOGIN, DOCUMENT...)"
          className="input w-56 uppercase"
          value={action}
          onChange={e => { setAction(e.target.value.toUpperCase()); setPage(1); }}
        />
        <div className="flex items-center gap-2">
          <input type="date" className="input w-36" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} />
          <span className="text-gray-400 text-sm">s/d</span>
          <input type="date" className="input w-36" value={dateTo}   onChange={e => { setDateTo(e.target.value); setPage(1); }} />
        </div>
      </div>

      <div className="card overflow-hidden">
        {(isLoading || isFetching) && (
          <div className="h-1 bg-brand-100"><div className="h-full w-2/3 bg-brand-500 animate-pulse" /></div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Waktu','User','Action','Entity','IP','Meta'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading && (
                <tr><td colSpan={6} className="px-4 py-10 text-center"><Loader2 size={20} className="animate-spin text-brand-400 mx-auto" /></td></tr>
              )}
              {!isLoading && items.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">Tidak ada log</td></tr>
              )}
              {items.map(log => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-500">
                    {format(new Date(log.createdAt), 'dd/MM/yy HH:mm:ss')}
                  </td>
                  <td className="px-4 py-2.5 max-w-[140px]">
                    <p className="font-medium text-gray-800 truncate text-xs">{log.user?.name || 'System'}</p>
                    <p className="text-gray-400 truncate text-xs">{log.user?.email || ''}</p>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${ACTION_COLOR[log.action] || 'bg-gray-100 text-gray-600'}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">
                    {log.entity && <span>{log.entity}</span>}
                    {log.entityId && <span className="block font-mono text-gray-400 text-xs truncate max-w-[100px]">{log.entityId}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">{log.ipAddress || '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-400 max-w-[180px]">
                    {log.meta ? (
                      <details className="cursor-pointer">
                        <summary className="text-brand-500 hover:underline">Lihat</summary>
                        <pre className="mt-1 text-xs bg-gray-100 p-1.5 rounded overflow-auto max-h-24">
                          {JSON.stringify(log.meta, null, 2)}
                        </pre>
                      </details>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pagination.total > 30 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">Total: {pagination.total} log</p>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p-1)} className="btn-secondary py-1 px-2">
                <ChevronLeft size={14} />
              </button>
              <span className="text-sm text-gray-600">{page} / {Math.ceil(pagination.total / 30)}</span>
              <button disabled={page >= Math.ceil(pagination.total/30)} onClick={() => setPage(p => p+1)} className="btn-secondary py-1 px-2">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
