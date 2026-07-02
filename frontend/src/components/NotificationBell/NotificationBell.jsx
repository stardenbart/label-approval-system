// frontend/src/components/NotificationBell/NotificationBell.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, CheckCheck, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import api from '../../services/api';

const TYPE_ICON = {
  APPROVAL_ASSIGNED: '📋',
  APPROVAL_DONE:     '✅',
  APPROVAL_DECLINED: '❌',
  FORGOT_PASSWORD:   '🔐',
  SYSTEM:            '🔔',
};

export default function NotificationBell() {
  const [count,       setCount]       = useState(0);
  const [notifs,      setNotifs]      = useState([]);
  const [open,        setOpen]        = useState(false);
  const [loading,     setLoading]     = useState(false);
  const dropdownRef = useRef(null);
  const navigate    = useNavigate();

  // Poll unread count every 30s
  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Close on outside click
  useEffect(() => {
    function handler(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function fetchCount() {
    try {
      const { data } = await api.get('/notifications/count');
      setCount(data.data.count);
    } catch (_) {}
  }

  async function openDropdown() {
    setOpen((v) => !v);
    if (!open) {
      setLoading(true);
      try {
        const { data } = await api.get('/notifications');
        setNotifs(data.data);
      } catch (_) {}
      setLoading(false);
    }
  }

  async function markAll() {
    try {
      await api.patch('/notifications/read-all');
      setNotifs(prev => prev.map(n => ({ ...n, isRead: true })));
      setCount(0); // Immediate UI update — no need to wait for 30s poll
    } catch (_) {}
  }

  async function handleMarkRead(notif) {
    if (notif.isRead) return;
    try {
      await api.patch(`/notifications/${notif.id}/read`);
      setNotifs(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n));
      setCount(prev => Math.max(0, prev - 1)); // Immediate badge update
    } catch (_) {}
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
