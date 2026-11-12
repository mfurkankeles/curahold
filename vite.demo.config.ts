import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

// The try-it-now demo: the whole product (API, Postgres with its row-level
// security, and the app) running inside one browser tab with invented data.
// Nothing is sent anywhere, so it costs nothing to host and can be embedded
// anywhere a static page can (the sales site, a claude.ai page).
//
//   npx vite build --config vite.demo.config.ts   →   dist/demo/
//
// The app normally keeps its screens in the address bar. A demo embedded in
// someone else's page cannot, so here `location` and `history` are swapped
// for an in-memory stand-in (web/src/demo/memory.ts) at build time.
const memoryLocation = (): Plugin => ({
  name: 'curahold-memory-location',
  enforce: 'pre',
  transform(code, id) {
    if (!/\/web\/(src|portal)\//.test(id) || /\/web\/src\/demo\//.test(id) || !/\.[jt]sx?$/.test(id)) return null;
    const out = code
      .replace(/(?<![.\w$])location\./g, 'twLocation.')
      .replace(/(?<![.\w$])history\.(pushState|replaceState)\b/g, 'twHistory.$1');
    return out === code ? null : { code: out, map: null };
  },
});

// Static hosts do not all serve a ".data" file; Postgres' bundled files go out
// under a name every host accepts and are handed to PGlite directly.
const FS_BUNDLE = 'assets/pglite-fs.wasm';
const renameFsBundle = (): Plugin => ({
  name: 'curahold-fs-bundle',
  apply: 'build',
  generateBundle(_options, bundle) {
    for (const [name, file] of Object.entries(bundle)) {
      if (file.type !== 'asset' || !name.endsWith('.data')) continue;
      delete bundle[name];
      this.emitFile({ type: 'asset', fileName: FS_BUNDLE, source: file.source });
    }
  },
});

export default defineConfig({
  root: 'web/demo',
  base: './',
  plugins: [memoryLocation(), react(), renameFsBundle()],
  define: { 'import.meta.env.APP_DEMO': 'true', __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version) },
  build: {
    outDir: '../../dist/demo',
    emptyOutDir: true,
    sourcemap: false,
    // Fonts and small images inline; the database engine stays a file of its own.
    assetsInlineLimit: 200_000,
    chunkSizeWarningLimit: 4000,
  },
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  server: { port: 5174 },
});
