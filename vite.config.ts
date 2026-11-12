import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// Local development: open http://demo.localhost:5173. The proxy keeps the
// Host header, so the API sees the company subdomain exactly as in production.
export default defineConfig({
  root: 'web',
  define: { __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version) },
  plugins: [react()],
  build: { outDir: '../dist/web', emptyOutDir: true, sourcemap: false },
  server: {
    host: true,
    port: 5173,
    allowedHosts: ['.localhost'],
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: false } },
  },
});
