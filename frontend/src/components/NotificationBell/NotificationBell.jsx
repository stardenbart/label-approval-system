// frontend/src/components/NotificationBell/NotificationBell.jsx
import { useState, useEffect, useRef } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import api from '../../services/api';
import { qk } from '../../services/queryKeys';
import { afterNotificationRead } from '../../services/cacheSync';

const TYPE_ICON = {
  APPROVAL_ASSIGNED: '📋',
  APPROVAL_DONE:     '✅',
  APPROVAL_DECLINED: '❌',
  FORGOT_PASSWORD:   '🔐',
  SYSTEM:            '🔔',
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate    = useNavigate();
  const queryClient = useQueryClient();

  // Lonceng ini dulu berdiri sendiri: useState + setInterval sendiri, di luar
  // React Query. Akibatnya badge-nya tidak pernah tahu kalau ada aksi lain yang
  // membuat notifikasi baru — approve dokumen tidak memperbarui badge sampai
  // poll 30 detik berikutnya. Sekarang ikut cache bersama, jadi cacheSync bisa
  // meng-invalidate-nya seperti data lain.
  const { data: count = 0 } = useQuery({
    queryKey: qk.notificationCount(),
    queryFn:  () => api.get('/notifications/count').then(r => r.data.data.count),
    refetchInterval: 30_000,
  });

  // Daftar isinya baru diambil saat dropdown dibuka — tidak ada gunanya
  // menarik 20 notifikasi tiap 30 detik untuk panel yang tertutup.
  const { data: notifs = [], isLoading: loading } = useQuery({
    queryKey: qk.notifications(),
    queryFn:  () => api.get('/notifications').then(r => r.data.data),
    enabled:  open,
    refetchInterval: open ? 30_000 : false,
  });

  // Close on outside click
  useEffect(() => {
    function handler(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function openDropdown() {
    setOpen((v) => !v);
  }

  // Badge diperbarui optimistis lebih dulu supaya terasa instan, lalu
  // di-invalidate agar angka sebenarnya datang dari server.
  async function markAll() {
    try {
      queryClient.setQueryData(qk.notificationCount(), 0);
      queryClient.setQueryData(qk.notifications(), (prev) =>
        (prev || []).map(n => ({ ...n, isRead: true })));
      await api.patch('/notifications/read-all');
    } catch (_) {
    } finally {
      afterNotificationRead(queryClient);
    }
  }

  async function handleMarkRead(notif) {
    if (notif.isRead) return;
    try {
      queryClient.setQueryData(qk.notificationCount(), (prev) => Math.max(0, (prev || 0) - 1));
      queryClient.setQueryData(qk.notifications(), (prev) =>
        (prev || []).map(n => n.id === notif.id ? { ...n, isRead: true } : n));
      await api.patch(`/notifications/${notif.id}/read`);
    } catch (_) {
    } finally {
      afterNotificationRead(queryClient);
    }
  }

  function handleClick(notif) {
    handleMarkRead(notif);
    setOpen(false);

    if (notif.entityType === 'documents' && notif.entityId) {
      navigate(`/documents/${notif.entityId}`);
    } else if (notif.entityType === 'users' && notif.type === 'FORGOT_PASSWORD') {
      navigate('/users');
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={openDropdown}
        className="relative p-2 rounded-lg hover:bg-[#122854] transition-colors"
        title="Notifikasi"
      >
        <Bell size={20} className="text-white" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-xl border border-gray-200 z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="font-semibold text-sm text-gray-900">Notifikasi</span>
            <button onClick={markAll} className="text-xs text-brand-600 hover:underline flex items-center gap-1">
              <CheckCheck size={12} /> Tandai semua dibaca
            </button>
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
            {loading && (
              <div className="px-4 py-8 text-center text-sm text-gray-400">Memuat...</div>
            )}
            {!loading && notifs.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-gray-400">Tidak ada notifikasi</div>
            )}
            {!loading && notifs.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${!n.isRead ? 'bg-brand-50' : ''}`}
              >
                <div className="flex gap-3">
                  <span className="text-lg shrink-0 mt-0.5">{TYPE_ICON[n.type] || '🔔'}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${!n.isRead ? 'font-semibold text-gray-900' : 'text-gray-700'} truncate`}>
                      {n.title}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: localeId })}
                    </p>
                  </div>
                  {!n.isRead && <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0 mt-2" />}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
