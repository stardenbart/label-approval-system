import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  Menu, FileText, Upload, Clock, Users, Settings,
  Grid, ClipboardList, LogOut
} from 'lucide-react';

import { useQueryClient } from '@tanstack/react-query';

import useAuthStore from '../../store/authStore';
import api from '../../services/api';
import { afterLogout } from '../../services/cacheSync';
import NotificationBell from '../NotificationBell/NotificationBell.jsx';

const NAV = [
  { to: '/documents', label: 'All Documents', icon: FileText, roles: ['superadmin','admin','approver','viewer','uploader'] },
  { to: '/documents/upload', label: 'Upload Document', icon: Upload, roles: ['superadmin','uploader'] },
  { to: '/my-pending', label: 'Waiting Approval', icon: Clock, roles: ['superadmin','admin','approver'] },
  { to: '/users', label: 'User Management', icon: Users, roles: ['superadmin'] },
  { to: '/products', label: 'Product Management', icon: Grid, roles: ['superadmin','admin'] },
  { to: '/settings', label: 'System Settings', icon: Settings, roles: ['superadmin'] },
  { to: '/audit', label: 'Audit Log', icon: ClipboardList, roles: ['superadmin'] },
];

export default function AppLayout() {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const visibleNav = NAV.filter(n => n.roles.includes(user?.role));

  async function handleLogout() {
    try { await api.post('/auth/logout'); } catch {}
    clearAuth();
    // Tanpa ini cache user sebelumnya masih di memori dan sempat terlihat oleh
    // user berikutnya yang login di tab yang sama.
    afterLogout(queryClient);
    navigate('/login');
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-gray-50">
      <header
        className="fixed top-0 left-0 right-0 h-16 z-50 flex items-center justify-between gap-3 px-3 sm:px-6"
        style={{
          background:
            'linear-gradient(135deg,#1B3A6F 0%,#15305B 60%,#E63946 100%)'
        }}
      >
        <div className="flex min-w-0 items-center gap-2 sm:gap-3 text-white">

          <button
            onClick={() => setSidebarOpen(v => !v)}
            className="shrink-0 p-2 rounded-lg hover:bg-white/10"
            aria-label="Toggle navigation"
          >
            <Menu size={20} />
          </button>

          <img
            src="/Logo_Cimory.png"
            className="h-8 w-auto max-w-[5.5rem] shrink-0 object-contain sm:h-9 sm:max-w-[7rem]"
            alt="logo"
          />

          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold sm:text-base">
              Digital Approval Label
            </p>
          </div>

        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-4 text-white">
          <NotificationBell />

          <span className="hidden max-w-[12rem] truncate text-sm sm:inline">
            Halo, <b>{user?.name}</b>
          </span>
        </div>

      </header>

      <aside
        className={`
          fixed top-16 left-0 bottom-0 z-40
          bg-[#1B3A6F] text-white
          transition-all duration-300
          overflow-hidden
          ${sidebarOpen ? 'w-64' : 'w-0'}
        `}
      >

        <nav className="px-3 py-4 space-y-1">
          {visibleNav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-[#C62833] text-white'
                    : 'text-white/70 hover:bg-[#E63946] hover:text-white'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="absolute bottom-0 w-full px-4 py-4 border-t border-[#C62833]">
          <p className="text-sm">{user?.name}</p>
          <button
            onClick={handleLogout}
            className="text-xs text-white/70 hover:text-white flex items-center gap-2"
          >
            <LogOut size={14} />
            Logout
          </button>
        </div>
      </aside>
      
      <main
        className={`pt-16 h-full overflow-y-auto transition-all duration-300 ${sidebarOpen ? 'md:ml-64' : 'md:ml-0'}`}
      >
        <div className="p-4 sm:p-6">
          <Outlet />
        </div>
      </main>

    </div>
  );
}
