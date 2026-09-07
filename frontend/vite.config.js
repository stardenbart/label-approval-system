// frontend/vite.config.js
// FIX-01: define key was 'process.env.NODE.ENV' (dot) — should be 'process.env.NODE_ENV' (underscore).
//         With the wrong key, libraries that check process.env.NODE_ENV don't get the value,
//         causing React to stay in development mode in production builds
//         and potentially breaking tree-shaking of dev-only code.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  define: {
    // FIX-01: was 'process.env.NODE.ENV' — dot is invalid, must be underscore
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
  // Port dan target proxy bisa dioverride lewat environment supaya satu salinan
  // kode bisa menjalankan dev dan staging berdampingan tanpa saling menimpa
  // (lihat deploy/staging-local.sh). Tanpa env, nilainya persis seperti dulu.
  //
  // VITE_DEV_HOST=0.0.0.0 membuat server bisa dijangkau dari perangkat lain di
  // jaringan yang sama — itu syarat untuk menguji pemindaian QR dengan ponsel,
  // karena localhost pada ponsel menunjuk ke ponsel itu sendiri.
  server: {
    port: Number(process.env.VITE_DEV_PORT) || 5173,
    host: process.env.VITE_DEV_HOST || 'localhost',
    proxy: {
      '/api': {
        target:       process.env.VITE_API_TARGET || 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure:       false,
      },
    },
  },
  build: {
    outDir:        'dist',
    sourcemap:     false,
    rollupOptions: {
      output: {
        manualChunks: {
          react:    ['react', 'react-dom'],
          router:   ['react-router-dom'],
          pdfjs:    ['pdfjs-dist'],
          query:    ['@tanstack/react-query'],
        },
      },
    },
  },
});