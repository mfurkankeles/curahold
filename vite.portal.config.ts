import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// The customer portal: its own small bundle, served on its own domain
// (acme.tendwell-portal.com) — none of the app's code ships with it.
//
//   npx vite build --config vite.portal.config.ts   →   dist/portal/
export default defineConfig({
  root: 'web/portal',
  define: { __TW_VERSION__: JSON.stringify(JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version) },
  plugins: [react()],
  build: { outDir: '../../dist/portal', emptyOutDir: true, sourcemap: false },
  server: {
    host: true,
    port: 5174,
    allowedHosts: ['.localhost'],
    proxy: { '/papi': { target: 'http://localhost:8787', changeOrigin: false } },
  },
});
