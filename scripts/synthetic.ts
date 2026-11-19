// The synthetic check: the addresses people open, called from outside like a
// visitor would, each timed. Free: run it from any machine, or from a free
// scheduled CI job (docs/go-live/README.tr.md → İzleme). Nothing is bought.
//
//   SYN_APP=https://app.curahold.com SYN_SITE=https://curahold.com \
//   SYN_PORTAL=https://curahold-portal.com npx tsx scripts/synthetic.ts [--json status.json]
//
// Exit 0: every check passed. Exit 1: at least one failed (the output names it).
// --json writes the same results in the shape the public status page reads.
// SYN_SLOW_MS (1500): slower than this is "slow" (still up). SYN_TIMEOUT_MS (10000).
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export interface Check {
  id: string;
  url: string;
  /** What the answer must contain (JSON key path "ok" true, or a text). */
  expect?: { json?: 'ok' } | { text: string };
}
export interface CheckResult {
  id: string;
  url: string;
  state: 'up' | 'slow' | 'down';
  status: number | null;
  ms: number;
  error?: string;
}

export function checksFrom(env: Record<string, string | undefined>): Check[] {
  const app = (env.SYN_APP || 'https://app.curahold.com').replace(/\/$/, '');
  const site = (env.SYN_SITE || 'https://curahold.com').replace(/\/$/, '');
  const portal = env.SYN_PORTAL?.replace(/\/$/, '');
  return [
    { id: 'app', url: `${app}/api/health`, expect: { json: 'ok' } },
    { id: 'database', url: `${app}/api/health/ready`, expect: { json: 'ok' } },
    { id: 'docs', url: `${app}/docs/`, expect: { text: '<html' } },
    { id: 'site', url: `${site}/`, expect: { text: '<html' } },
    { id: 'security-txt', url: `${app}/.well-known/security.txt`, expect: { text: 'Contact:' } },
    ...(portal ? [{ id: 'portal', url: `${portal}/papi/health`, expect: { json: 'ok' as const } }] : []),
  ];
}

export async function runChecks(checks: Check[], opts: { fetch?: typeof fetch; slowMs?: number; timeoutMs?: number } = {}): Promise<CheckResult[]> {
  const f = opts.fetch ?? fetch;
  const slow = opts.slowMs ?? 1500;
  return Promise.all(
    checks.map(async (c): Promise<CheckResult> => {
      const t0 = Date.now();
      try {
        const r = await f(c.url, { headers: { 'user-agent': 'curahold-synthetic/1' }, redirect: 'follow', signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000) });
        const body = await r.text();
        const ms = Date.now() - t0;
        let ok = r.ok;
        if (ok && c.expect && 'json' in c.expect) ok = (() => { try { return JSON.parse(body).ok === true; } catch { return false; } })();
        if (ok && c.expect && 'text' in c.expect) ok = body.toLowerCase().includes(c.expect.text.toLowerCase());
        return { id: c.id, url: c.url, status: r.status, ms, state: !ok ? 'down' : ms > slow ? 'slow' : 'up', ...(ok ? {} : { error: `unexpected answer (${r.status})` }) };
      } catch (e) {
        return { id: c.id, url: c.url, status: null, ms: Date.now() - t0, state: 'down', error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
}

/** The status page's file: overall state and one line per component. */
export const statusJson = (results: CheckResult[], at = new Date()) => ({
  at: at.toISOString(),
  state: results.some((r) => r.state === 'down') ? 'down' : results.some((r) => r.state === 'slow') ? 'slow' : 'up',
  components: results.map(({ id, state, ms, status }) => ({ id, state, ms, status })),
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const results = await runChecks(checksFrom(process.env), { slowMs: Number(process.env.SYN_SLOW_MS) || 1500, timeoutMs: Number(process.env.SYN_TIMEOUT_MS) || 10_000 });
  for (const r of results) console.log(`${r.state.padEnd(4)} ${String(r.status ?? '---').padEnd(4)} ${String(r.ms).padStart(6)} ms  ${r.id.padEnd(13)} ${r.url}${r.error ? `  (${r.error})` : ''}`);
  const i = process.argv.indexOf('--json');
  if (i > 0 && process.argv[i + 1]) writeFileSync(process.argv[i + 1], JSON.stringify(statusJson(results), null, 2));
  process.exit(results.some((r) => r.state === 'down') ? 1 : 0);
}
