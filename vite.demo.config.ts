import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { i18nForBrowser } from './shared/src/i18n/vite-plugin';

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
      .replace(/(?<![.\w$])location\./g, 'appLocation.')
      .replace(/(?<![.\w$])history\.(pushState|replaceState|go|back|forward|state|length)\b/g, 'appHistory.$1');
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

// The API runs in the tab, so whatever it imports is bundled. A module built on
// Node (crypto, zlib, util…) cannot run there: Vite swaps such imports for an
// empty stand-in and the demo then dies at start-up with an error that names
// nothing (`(0, i.deprecate) is not a function` — that was SAML). So:
//  * the few API modules that are server-only by nature get a demo stand-in
//    (SERVER_ONLY below), and
//  * any other import of a Node built-in that Vite would empty out fails the
//    build, naming the module that asked for it. tests/demo-bundle.test.ts and
//    the CI "Demo boots" step run this build.
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
export const SERVER_ONLY: Record<string, string> = {
  // @node-saml/node-saml: XML signatures on Node's crypto. The demo has no IdP.
  [here('./api/src/lib/saml.ts')]: here('./web/src/demo/saml.ts'),
};
// Packages whose imports of Node built-ins are known to be guarded at run time.
const NODE_ALLOWED: RegExp[] = [
  // PGlite reaches for fs, zlib and module only when it runs under Node (its IN_NODE check).
  /\/node_modules\/@electric-sql\/pglite\//,
];
const NODE_BUILTINS = new Set(builtinModules.map((m) => m.replace(/^node:/, '')));
export const demoServerBoundary = (standIns: Record<string, string> = SERVER_ONLY): Plugin => ({
  name: 'curahold-demo-server-boundary',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    if (!importer) return null;
    const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
    const stand = resolved && standIns[resolved.id.split('?')[0]];
    if (stand) return stand;
    const bare = source.replace(/^node:/, '').split('/')[0];
    if (!NODE_BUILTINS.has(bare)) return null;
    if (NODE_ALLOWED.some((from) => from.test(importer))) return null;
    if (resolved && !resolved.external && !resolved.id.includes('browser-external') && !NODE_BUILTINS.has(resolved.id.replace(/^node:/, ''))) return null;
    this.error(
      `demo: "${importer.replace(/^.*\/node_modules\//, 'node_modules/')}" imports Node's "${source}", which does not exist in a browser tab. ` +
        'Keep that module out of the demo (give it a stand-in in SERVER_ONLY in vite.demo.config.ts) instead of shimming Node.',
    );
  },
});

export default defineConfig({
  root: 'web/demo',
  base: './',
  // The API runs in the tab and needs every language, so no swap; the app's
  // loader still asks for its language through the plugin's modules.
  plugins: [demoServerBoundary(), memoryLocation(), i18nForBrowser({ swap: false }), react(), renameFsBundle()],
  define: { 'import.meta.env.APP_DEMO': 'true', 'import.meta.env.APP_DOCS_URL': JSON.stringify(process.env.DEMO_DOCS_URL ?? ''), __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version) },
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
