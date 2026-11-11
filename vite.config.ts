import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Local development: open http://demo.localhost:5173. The proxy keeps the
// Host header, so the API sees the company subdomain exactly as in production.
export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: '../dist/web', emptyOutDir: true, sourcemap: false },
  server: {
    host: true,
    port: 5173,
    allowedHosts: ['.localhost'],
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: false } },
  },
});
