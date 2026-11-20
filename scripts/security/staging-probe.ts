// Black-box checks against Curahold's own staging copy (docs/security/testing-calendar.md, monthly).
//
//   STAGING_URL=https://app.curahold-staging.com npx tsx scripts/security/staging-probe.ts
//
// SECURITY: this sends requests, so it refuses every host but our own staging domain and a local
// server. Production and anyone else's system are never targets (owner rule; the Senior Security
// Engineer seat's playbook says the same) — there is deliberately no switch to widen the list.
// Read-only probes only: GET and OPTIONS, no sign-in, no writes, a handful of requests.
import { pathToFileURL } from 'node:url';

/** Hosts the probe may touch: a local server, and curahold-staging.com with its subdomains. */
export function allowedTarget(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') return true;
  return u.protocol === 'https:' && (h === 'curahold-staging.com' || h.endsWith('.curahold-staging.com'));
}

/** One check's outcome. */
export interface ProbeResult {
  check: string;
  ok: boolean;
  detail: string;
}

/** The headers every app page must carry (api/src/lib/headers.ts sets them; a proxy could strip them). */
const HEADERS = ['content-security-policy', 'x-content-type-options', 'referrer-policy', 'x-frame-options'];

/** Runs the read-only checks against `base` (already allowed) and returns one line per check. */
export async function probe(base: string, get: typeof fetch = fetch): Promise<ProbeResult[]> {
  if (!allowedTarget(base)) throw new Error(`refusing ${base}: only localhost or *.curahold-staging.com`);
  const at = (p: string) => new URL(p, base).toString();
  const out: ProbeResult[] = [];
  const home = await get(at('/'), { redirect: 'manual' });
  for (const h of HEADERS) out.push({ check: `header ${h}`, ok: home.headers.has(h), detail: home.headers.get(h) ?? 'missing' });
  if (base.startsWith('https:')) {
    const hsts = home.headers.get('strict-transport-security') ?? '';
    out.push({ check: 'header strict-transport-security', ok: /max-age=\d{7,}/.test(hsts), detail: hsts || 'missing' });
  }
  const txt = await get(at('/.well-known/security.txt'));
  const body = txt.ok ? await txt.text() : '';
  out.push({ check: 'security.txt has Contact and Expires', ok: /^Contact:/m.test(body) && /^Expires:/m.test(body), detail: `status ${txt.status}` });
  // Signed out, the API must refuse; a 200 here would mean a session is not required.
  const me = await get(at('/api/me'));
  out.push({ check: 'GET /api/me signed out is refused', ok: me.status === 401 || me.status === 403, detail: `status ${me.status}` });
  // An unknown address answers with a plain error code, never a stack trace or a file path.
  const nf = await get(at('/api/__probe_not_found__'));
  const nfText = await nf.text();
  out.push({ check: 'unknown API address leaks no stack trace', ok: !/\bat \S+\.(ts|js):\d+/.test(nfText) && !/node_modules|\/src\//.test(nfText), detail: `status ${nf.status}` });
  // CORS: a foreign origin must not be echoed back as allowed.
  const pre = await get(at('/api/me'), { method: 'OPTIONS', headers: { Origin: 'https://probe.invalid', 'Access-Control-Request-Method': 'GET' } });
  const acao = pre.headers.get('access-control-allow-origin') ?? '';
  out.push({ check: 'foreign origin not allowed by CORS', ok: acao !== '*' && acao !== 'https://probe.invalid', detail: acao || 'no header' });
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = process.env.STAGING_URL ?? '';
  if (!base) {
    console.error('Set STAGING_URL to the staging copy (https://app.curahold-staging.com) or a local server.');
    process.exit(2);
  }
  const results = await probe(base);
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.check}  (${r.detail})`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
