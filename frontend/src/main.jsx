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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry:              1,
      staleTime:          15_000,
      refetchInterval:    30_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
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
