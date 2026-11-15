import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { i18nForBrowser } from './shared/src/i18n/vite-plugin';

// Local development: open http://demo.localhost:5173. The proxy keeps the
// Host header, so the API sees the company subdomain exactly as in production.
export default defineConfig({
  root: 'web',
  define: { __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version) },
  // One language at a time: see shared/src/i18n/vite-plugin.ts.
  plugins: [i18nForBrowser({ swap: true }), react()],
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
    sourcemap: false,
    // Which chunks each screen needs (.vite/manifest.json): read by scripts/quality/static.mts.
    manifest: true,
    rollupOptions: {
      output: {
        // Pull the large, slow-changing code out of the entry chunk so it caches
        // on its own and the app shell stays small. Only modules matched below are
        // relocated; everything else keeps Vite's automatic splitting, which
        // already gives rrweb / rrweb-player / Desk their own on-demand chunks — we
        // deliberately match none of those, so they stay lazy.
        advancedChunks: {
          groups: [
            // React core, needed on first paint. Higher priority than vendor-dnd so
            // the shared react / react-dom implementation is claimed here instead of
            // being absorbed into the dnd chunk.
            { name: 'vendor-react', test: /[\\/]node_modules[\\/](react-dom|react|scheduler)[\\/]/, priority: 50 },
            { name: 'vendor-dnd', test: /[\\/]node_modules[\\/]@dnd-kit[\\/]/, priority: 40 },
            { name: 'vendor-fflate', test: /[\\/]node_modules[\\/]fflate[\\/]/, priority: 40 },
          ],
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts: ['.localhost'],
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: false } },
  },
});
