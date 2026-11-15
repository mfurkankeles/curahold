import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { i18nForBrowser } from './shared/src/i18n/vite-plugin';

const web = (p: string) => fileURLToPath(new URL(`./web/${p}`, import.meta.url));

// The first screen's hints for index.html's first script (which starts the downloads
// before the app's code has arrived): each language's first part, and the home
// screen's chunks that the entry does not already preload. Data, not code: the
// script stays the same, so its hash in the content security policy does too.
function firstScreenHints(): Plugin {
  return {
    name: 'curahold-first-screen',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const chunks = Object.values(ctx.bundle ?? {}).filter((c) => c.type === 'chunk');
        const entry = chunks.find((c) => c.isEntry);
        const home = chunks.find((c) => c.facadeModuleId?.endsWith('/src/pages/Home.tsx'));
        if (!entry || !home) return;
        const byFile = new Map(chunks.map((c) => [c.fileName, c]));
        const preloaded = new Set<string>();
        const walk = (f: string, into: Set<string>) => {
          if (into.has(f)) return;
          into.add(f);
          for (const i of byFile.get(f)?.imports ?? []) walk(i, into);
        };
        walk(entry.fileName, preloaded);
        const homeFiles = new Set<string>();
        walk(home.fileName, homeFiles);
        const dict: Record<string, string> = {};
        for (const c of chunks) {
          const m = /^\0curahold-dict:(.+)$/.exec(c.facadeModuleId ?? '');
          if (m) dict[m[1]] = `/${c.fileName}`;
        }
        const hints = { dict, home: [...homeFiles].filter((f) => !preloaded.has(f)).map((f) => `/${f}`) };
        return [{ tag: 'script', attrs: { type: 'application/json', id: 'first-screen' }, children: JSON.stringify(hints), injectTo: 'head-prepend' }];
      },
    },
  };
}

// Local development: open http://demo.localhost:5173. The proxy keeps the
// Host header, so the API sees the company subdomain exactly as in production.
export default defineConfig({
  root: 'web',
  define: { __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version) },
  // One language at a time, in two parts: the first screen's phrases (what the
  // app shell and Home reach without a lazy import), then the rest — which every
  // other screen waits for. See shared/src/i18n/vite-plugin.ts.
  plugins: [
    i18nForBrowser({
      swap: true,
      first: { entries: [web('src/main.tsx'), web('src/pages/Home.tsx')], dirs: [web('src')], loader: web('src/lib/i18n.tsx') },
    }),
    react(),
    firstScreenHints(),
  ],
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
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: false, ws: true } },
  },
});
