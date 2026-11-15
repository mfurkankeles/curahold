// The live demo bundles the whole API into a browser tab (web/src/demo/server.ts).
// A server-only module in that graph (one built on Node's crypto, zlib, util…)
// does not fail the build by itself: Vite empties the import and the demo dies at
// start-up. That happened with SAML. These checks build the demo's API graph with
// the demo's own boundary plugin (vite.demo.config.ts) and fail when it leaks.
import { fileURLToPath } from 'node:url';
import { build, type Rolldown } from 'vite';
import { describe, expect, it } from 'vitest';
import { demoServerBoundary } from '../vite.demo.config';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

async function bundle(input: string[], standIns?: Record<string, string>): Promise<string> {
  const out = (await build({
    configFile: false,
    logLevel: 'silent',
    root: at('..'),
    plugins: [demoServerBoundary(standIns)],
    define: { 'import.meta.env.APP_DEMO': 'true' },
    build: { write: false, minify: false, rollupOptions: { input, preserveEntrySignatures: 'strict' } },
  })) as Rolldown.RolldownOutput | Rolldown.RolldownOutput[];
  const outputs = (Array.isArray(out) ? out : [out]).flatMap((o) => o.output);
  return outputs.map((f) => (f.type === 'chunk' ? f.code : '')).join('\n');
}

describe('the demo bundle holds no server-only code', () => {
  it("the API and portal the demo runs build for a browser tab, without SAML's Node library", async () => {
    const code = await bundle([at('../api/src/app.ts'), at('../api/src/portal.ts')]);
    expect(code).toContain('single sign-on does not run in the demo');
    expect(code).not.toMatch(/node-saml|xml-crypto|xml-encryption|__vite-browser-external/);
  }, 120_000);

  it('a server-only module without a stand-in fails the build and is named', async () => {
    await expect(bundle([at('../api/src/lib/saml.ts')], {})).rejects.toThrow(/node-saml.*imports Node's "(util|crypto|url|zlib|querystring)"/s);
  }, 120_000);
});
