// frontend/src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import axios from 'axios';
import App from './App.jsx';
import useAuthStore from './store/authStore.js';
import './index.css';

// Kebijakan kesegaran data.
//
// Sebelumnya SETIAP query di-poll 30 detik sekali — termasuk system settings,
// master produk, dan audit log yang praktis tidak pernah berubah sendiri. Itu
// beban sia-sia untuk server, sekaligus tetap terasa lambat pada data yang benar
// -benar hidup karena 30 detik masih terlalu jarang untuk antrean approval.
//
// Sekarang dibalik: default TIDAK polling, dan polling dipasang eksplisit hanya
// di query yang memang berubah karena orang lain (lihat masing-masing halaman).
// Kesegaran selebihnya datang dari dua arah:
//   • refetch saat tab kembali fokus / koneksi pulih
//   • invalidate setelah tiap aksi — lihat services/cacheSync.js
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry:                1,
      staleTime:            15_000,
      refetchInterval:      false,
      refetchOnMount:       true,
      refetchOnWindowFocus: true,
      refetchOnReconnect:   true,
      // Tab yang tersembunyi berhenti polling — tidak ada gunanya menyegarkan
      // layar yang tidak dilihat siapa pun.
      refetchIntervalInBackground: false,
    },
  },
});

// MED-10: Attempt silent token refresh on app startup
// If user has a persisted session (refresh cookie), restore access token
async function initAuth() {
  const store = useAuthStore.getState();
  if (store.user && !store.accessToken) {
    try {
      const { data } = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
      store.setToken(data.data.accessToken);
    } catch (_) {
      // Refresh token expired or invalid — force clean login
      store.clearAuth();
    }
  }
}

initAuth().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: { borderRadius: '8px', fontSize: '14px' },
            }}
          />
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>
  );
});
