// Timed customer-style run of every integration (tests/vendors/flow.ts) over real HTTP against the local app.
//
//   npx tsx scripts/integrations/onboard.ts                 vendor mocks, each call answered after a realistic
//                                                           delay (tests/vendors/index.ts REALISTIC_LATENCY_MS)
//   REAL=1 npx tsx scripts/integrations/onboard.ts          the real vendors' free sandboxes, for every vendor whose
//                                                           credentials are in the environment; the rest are skipped
//
// Environment for REAL=1 (nothing is ever written to disk):
//   SALESFORCE_CLIENT_ID/_SECRET, HUBSPOT_CLIENT_ID/_SECRET     app registrations; the sign-in is done by a person:
//                                                               the runner prints the address and waits (5 minutes)
//   BITRIX24_WEBHOOK                                            the inbound webhook address
//   ODOO_URL, ODOO_DB, ODOO_LOGIN, ODOO_API_KEY                 an Odoo trial database and a user's API key
// Output: one JSON line per integration (steps with ms, time to connected, time to first data) and a table.
import { bootIntegrations } from './boot';
import { runAccountingFlow, runFlow, runJiraFlow, runMailboxFlow, runSupportFlow, type Http, type RealSide } from '../../tests/vendors/flow';
import { ACCOUNTING_SPECS, JIRA_SPECS, MAILBOX_SPECS, SPECS, SUPPORT_SPECS } from '../../tests/vendors/specs';

const PORT = Number(process.env.PORT ?? 9760);
const REAL = process.env.REAL === '1';

function realSide(provider: string): RealSide | null {
  const e = process.env;
  if (provider === 'bitrix24') return e.BITRIX24_WEBHOOK ? { keyValues: { webhook: e.BITRIX24_WEBHOOK } } : null;
  if (provider === 'odoo') return e.ODOO_URL && e.ODOO_LOGIN && e.ODOO_API_KEY ? { keyValues: { url: e.ODOO_URL, database: e.ODOO_DB ?? '', login: e.ODOO_LOGIN, apiKey: e.ODOO_API_KEY } } : null;
  const id = e[`${provider.toUpperCase()}_CLIENT_ID`];
  if (!id) return null;
  return {
    signIn: async (start) => {
      console.log(`\nOpen this address, sign in to the ${provider} sandbox and choose Allow:\n${start}\n`);
      // The app's callback lands the browser on /settings/sources/<id>; the runner watches for the new connection.
      const until = Date.now() + 5 * 60_000;
      while (Date.now() < until) {
        await new Promise((r) => setTimeout(r, 3000));
        const list = (await http.get('/api/connections')).json.connections ?? [];
        const made = list.find((c: any) => c.provider === provider);
        if (made) return `/settings/sources/${made.id}`;
      }
      return null;
    },
  };
}

const origin = `http://demo.localhost:${PORT}`;
let cookie = '';
const device = `onboard-${Date.now().toString(36)}`;
async function req(method: string, path: string, body?: unknown) {
  const url = new URL(path.startsWith('http') ? path : `${origin}${path}`);
  // Node does not resolve *.localhost: ask 127.0.0.1 and name the site in the Host header, as a browser would.
  const host = url.host;
  if (url.hostname.endsWith('localhost')) url.hostname = '127.0.0.1';
  const res = await fetch(url, { method, redirect: 'manual', headers: { host, ...(host.startsWith('demo.') ? { 'x-curahold-org': 'demo' } : {}), cookie, 'x-curahold-device': device, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const set = res.headers.get('set-cookie');
  const m = set && /app_session=([^;]*)/.exec(set);
  if (m) cookie = `app_session=${m[1]}`;
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, location: res.headers.get('location') };
}
const http: Http = {
  get: (p) => req('GET', p),
  post: (p, b) => req('POST', p, b ?? {}),
  put: (p, b) => req('PUT', p, b),
  patch: (p, b) => req('PATCH', p, b),
  del: (p) => req('DELETE', p),
  location: async (p) => (await req('GET', p)).location,
  // Writes go out right after the answer; give them the time a real round trip takes.
  settle: () => new Promise((r) => setTimeout(r, 1500)),
  // Over HTTP the app keeps real time; the vendor mocks stamp changes with real time too.
  advance: () => undefined,
};

const stack = await bootIntegrations({ port: PORT, real: REAL });
const start = await req('POST', '/api/auth/start', { email: stack.demo.adminEmail });
await req('POST', '/api/auth/verify', { token: start.json.devToken, deviceId: device, deviceLabel: 'Integration run' });

const rows: string[] = [];
for (const spec of SPECS) {
  const real = REAL ? realSide(spec.provider) : undefined;
  if (REAL && !real) {
    rows.push(`| ${spec.provider} | – | – | skipped: no credentials in the environment |`);
    continue;
  }
  const r = await runFlow(http, stack.world, spec, real ?? undefined);
  console.log(JSON.stringify({ provider: spec.provider, ...r }));
  const bad = r.steps.filter((s) => !s.ok).map((s) => s.step);
  rows.push(`| ${spec.provider} | ${(r.connectedMs / 1000).toFixed(1)} s | ${r.firstDataMs === null ? '–' : `${(r.firstDataMs / 1000).toFixed(1)} s`} | ${bad.length ? `failed: ${bad.join(', ')}` : 'all steps ok'} |`);
}
if (!REAL) {
  // The other kinds of run need the vendor's side changed by hand, so they are timed against the mocks only.
  const row = (provider: string, r: { steps: { ok: boolean; step: string }[]; connectedMs: number; firstDataMs: number | null }) => {
    console.log(JSON.stringify({ provider, ...r }));
    const bad = r.steps.filter((s) => !s.ok).map((s) => s.step);
    rows.push(`| ${provider} | ${(r.connectedMs / 1000).toFixed(1)} s | ${r.firstDataMs === null ? '–' : `${(r.firstDataMs / 1000).toFixed(1)} s`} | ${bad.length ? `failed: ${bad.join(', ')}` : 'all steps ok'} |`);
  };
  for (const spec of SUPPORT_SPECS) row(spec.provider, await runSupportFlow(http, stack.world!, spec));
  for (const spec of JIRA_SPECS) row(spec.provider, await runJiraFlow(http, stack.world!, spec));
  for (const spec of MAILBOX_SPECS) row(spec.provider, await runMailboxFlow(http, stack.world!, spec));
  for (const spec of ACCOUNTING_SPECS) row(spec.provider, await runAccountingFlow(http, stack.world!, spec));
}
console.log(`\n| integration | time to connected | time to first data | result |\n| --- | --- | --- | --- |\n${rows.join('\n')}`);
process.exit(0);
