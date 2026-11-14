import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// Local development: open http://demo.localhost:5173. The proxy keeps the
// Host header, so the API sees the company subdomain exactly as in production.
export default defineConfig({
  root: 'web',
  define: { __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version) },
  plugins: [react()],
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        // Pull the large, slow-changing code out of the entry chunk so it caches
        // on its own and the app shell stays small. Only modules matched below are
        // relocated; everything else keeps Vite's automatic splitting, which
        // already gives rrweb / rrweb-player / Desk their own on-demand chunks — we
        // deliberately match none of those, so they stay lazy.
        advancedChunks: {
          groups: [
            // The locale dictionaries (all nine languages, ~1.9 MB of strings) are
            // statically imported, so they load eagerly either way — but kept in
            // their own chunk they stop dominating the entry and cache separately
            // from app code. (Deferring the inactive locales would need the static
            // imports in shared/src/i18n/index.ts turned into dynamic ones.)
            { name: 'i18n', test: /[\\/]shared[\\/]src[\\/]i18n[\\/]/, priority: 100 },
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
