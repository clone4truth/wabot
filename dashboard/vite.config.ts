import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

// SPA di-build ke /dashboard-dist supaya Fastify bisa disajikan sebagai static
// file (satu container, satu reverse proxy).
export default defineConfig({
  // WAJIB: Fastify menyajikan SPA di /dashboard. Tanpa base ini Vite menulis
  // /assets/... di index.html dan browser meminta ke root yang tidak ada route
  // (404) — SPA render kosong.
  base: '/dashboard/',
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: '../dashboard-dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.DASHBOARD_API_TARGET || 'http://127.0.0.1:3010', changeOrigin: true },
    },
  },
})
