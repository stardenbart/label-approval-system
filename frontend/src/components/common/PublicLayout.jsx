// frontend/src/components/common/PublicLayout.jsx
import React from 'react';
import { Outlet } from 'react-router-dom';
import { Shield } from 'lucide-react';

export default function PublicLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header
        className="fixed top-0 left-0 right-0 h-16 z-50 flex items-center justify-between px-6"
        style={{
          background:
            'linear-gradient(135deg,#1B3A6F 0%,#15305B 60%,#E63946 100%)'
        }}
      >
        <div className="flex items-center gap-3 text-white">

          <img
            src="/Logo_Cimory.png"
            className="w-20"
            alt="logo"
          />

          <div className="leading-tight">
            <p className="text-sm font-semibold">
              Digital Approval Label
            </p>
            <p className="text-xs text-white/70">
              PT CISARUA MOUNTAIN DAIRY TBK
            </p>
          </div>

        </div>


      </header>
      <main className="max-w-3xl mx-auto px-4 py-8 mt-5">
        <Outlet />
      </main>
    </div>
  );
}
