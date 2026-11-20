// Timed customer-style run of every integration (tests/vendors/flow.ts) over real HTTP against the local app.
//
//   npx tsx scripts/integrations/onboard.ts                 vendor mocks, each call answered after a realistic
//                                                           delay (tests/vendors/index.ts REALISTIC_LATENCY_MS)
//   REAL=1 npx tsx scripts/integrations/onboard.ts          the real vendors' free sandboxes, for every vendor whose
//                                                           credentials are in the environment; the rest are skipped
//
// Environment for REAL=1 (nothing is ever written to disk). A vendor without its values is skipped and says so.
//   CRMs
//     SALESFORCE_, HUBSPOT_, DYNAMICS_, PIPEDRIVE_, ZOHO_ + CLIENT_ID/_SECRET   app registrations; the sign-in is done by
//                                                       a person: the runner prints the address and waits (5 minutes)
//     BITRIX24_WEBHOOK                                  the inbound webhook address
//     ODOO_URL, ODOO_DB, ODOO_LOGIN, ODOO_API_KEY       an Odoo trial database and a user's API key (CRM and accounting)
//     FRESHSALES_DOMAIN, FRESHSALES_API_KEY · ZENDESKSELL_TOKEN
//     GSHEETS_FILE / EXCEL_FILE: the sheet's address (with GOOGLE_ / MICROSOFT_ CLIENT_ID/_SECRET)
//     BIGQUERY_SERVICE_ACCOUNT (JSON), _QUERY, _ID_COLUMN, _MODIFIED_COLUMN (+ _LOCATION)
//     SNOWFLAKE_ACCOUNT, _USER, _PRIVATE_KEY, _QUERY, _ID_COLUMN, _MODIFIED_COLUMN (+ _WAREHOUSE, _ROLE)
//   Support desks (key-based)
//     ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, ZENDESK_API_TOKEN · FRESHDESK_DOMAIN, FRESHDESK_API_KEY
//     INTERCOM_TOKEN (+ INTERCOM_REGION us|eu|au) · JSM_SITE, JSM_EMAIL, JSM_API_TOKEN
//   Jira
//     JIRA_SITE, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT (a project key)
//   Mailboxes (a person signs in)
//     GOOGLE_CLIENT_ID/_SECRET (Gmail), MICROSOFT_CLIENT_ID/_SECRET (Outlook); REAL_MAIL_TO: where the reply step may send
//   Accounting
//     XERO_, QUICKBOOKS_, FREEE_ + CLIENT_ID/_SECRET; Zoho Books uses ZOHO_CLIENT_ID/_SECRET
//     PARASUT_COMPANY_ID, PARASUT_CLIENT_ID, PARASUT_CLIENT_SECRET, PARASUT_USERNAME, PARASUT_PASSWORD
//   What the sandbox was seeded with by hand, so the first read has something to check (optional; without it the first
//   read only has to finish cleanly). Seed each sandbox before the run:
//     <VENDOR>_EXPECT   support: a ticket's subject, under an organisation named like a demo customer (Quillfield Retail)
//                       Jira: an issue's summary in JIRA_PROJECT · mailbox: the subject of a mail from a customer contact
//                       accounting: a customer named like a demo customer, with one invoice
// Steps that need the vendor's side changed or broken on purpose (a change made there, a rate limit, a withdrawn key)
// are recorded as skipped in a real run; they are covered by the mocks.
// Output: one JSON line per integration (steps with ms, time to connected, time to first data) and a table.
import { bootIntegrations } from './boot';
import { runAccountingFlow, runFlow, runJiraFlow, runMailboxFlow, runSupportFlow, type Http, type RealSide } from '../../tests/vendors/flow';
import { ACCOUNTING_SPECS, JIRA_SPECS, MAILBOX_SPECS, SPECS, SUPPORT_SPECS } from '../../tests/vendors/specs';

const PORT = Number(process.env.PORT ?? 9760);
const REAL = process.env.REAL === '1';

/** The key values a key-based vendor needs, from the named variables; null when any is missing. */
function keysFrom(map: Record<string, string>, optional: Record<string, string> = {}): Record<string, string> | null {
  const e = process.env;
  if (Object.values(map).some((v) => !e[v])) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) out[k] = e[v]!;
  for (const [k, v] of Object.entries(optional)) if (e[v]) out[k] = e[v]!;
  return out;
}

/** Vendors that connect with a key, and the variables each key value comes from. */
const KEYED: Record<string, () => Record<string, string> | null> = {
  bitrix24: () => keysFrom({ webhook: 'BITRIX24_WEBHOOK' }),
  odoo: () => keysFrom({ url: 'ODOO_URL', login: 'ODOO_LOGIN', apiKey: 'ODOO_API_KEY' }, { database: 'ODOO_DB' }),
  odoocrm: () => keysFrom({ url: 'ODOO_URL', login: 'ODOO_LOGIN', apiKey: 'ODOO_API_KEY' }, { database: 'ODOO_DB' }),
  zendesk: () => keysFrom({ subdomain: 'ZENDESK_SUBDOMAIN', email: 'ZENDESK_EMAIL', token: 'ZENDESK_API_TOKEN' }),
  freshdesk: () => keysFrom({ domain: 'FRESHDESK_DOMAIN', token: 'FRESHDESK_API_KEY' }),
  intercom: () => {
    const k = keysFrom({ token: 'INTERCOM_TOKEN' });
    return k && { region: process.env.INTERCOM_REGION ?? 'us', ...k };
  },
  jsm: () => keysFrom({ site: 'JSM_SITE', email: 'JSM_EMAIL', token: 'JSM_API_TOKEN' }),
  jira: () => keysFrom({ site: 'JIRA_SITE', email: 'JIRA_EMAIL', token: 'JIRA_API_TOKEN' }),
  freshsales: () => keysFrom({ domain: 'FRESHSALES_DOMAIN', token: 'FRESHSALES_API_KEY' }),
  zendesksell: () => keysFrom({ token: 'ZENDESKSELL_TOKEN' }),
  bigquery: () => {
    const k = keysFrom({ serviceAccount: 'BIGQUERY_SERVICE_ACCOUNT', query: 'BIGQUERY_QUERY', idColumn: 'BIGQUERY_ID_COLUMN', modifiedColumn: 'BIGQUERY_MODIFIED_COLUMN' }, { location: 'BIGQUERY_LOCATION' });
    return k && { name: 'Warehouse (sandbox)', ...k };
  },
  snowflake: () => {
    const k = keysFrom(
      { account: 'SNOWFLAKE_ACCOUNT', user: 'SNOWFLAKE_USER', privateKey: 'SNOWFLAKE_PRIVATE_KEY', query: 'SNOWFLAKE_QUERY', idColumn: 'SNOWFLAKE_ID_COLUMN', modifiedColumn: 'SNOWFLAKE_MODIFIED_COLUMN' },
      { warehouse: 'SNOWFLAKE_WAREHOUSE', role: 'SNOWFLAKE_ROLE' },
    );
    return k && { name: 'Warehouse (sandbox)', ...k };
  },
  parasut: () => keysFrom({ companyId: 'PARASUT_COMPANY_ID', clientId: 'PARASUT_CLIENT_ID', clientSecret: 'PARASUT_CLIENT_SECRET', username: 'PARASUT_USERNAME', password: 'PARASUT_PASSWORD' }),
};
/** Vendors a person signs in to, and the registration that must be in the environment for it. */
const SIGN_IN: Record<string, string> = { gmail: 'GOOGLE', outlook: 'MICROSOFT', gsheets: 'GOOGLE', excel: 'MICROSOFT', zohobooks: 'ZOHO' };

function realSide(provider: string): RealSide | null {
  const e = process.env;
  const expect = e[`${provider.toUpperCase()}_EXPECT`] || undefined;
  const file = e[`${provider.toUpperCase()}_FILE`];
  const extra = { ...(expect ? { expect } : {}), ...(file ? { file } : {}), ...(provider === 'jira' && e.JIRA_PROJECT ? { project: e.JIRA_PROJECT } : {}) };
  // A spreadsheet run needs the sheet to read (its address).
  if ((provider === 'gsheets' || provider === 'excel') && !file) return null;
  if (KEYED[provider]) {
    const keyValues = KEYED[provider]();
    if (!keyValues || (provider === 'jira' && !e.JIRA_PROJECT)) return null;
    return { keyValues, ...extra };
  }
  const id = e[`${SIGN_IN[provider] ?? provider.toUpperCase()}_CLIENT_ID`];
  if (!id) return null;
  return {
    ...extra,
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
// Support desks, Jira, mailboxes and accounting: the mocks, or (REAL=1) each sandbox whose values are in the environment.
const row = (provider: string, r: { steps: { ok: boolean; step: string; note?: string }[]; connectedMs: number; firstDataMs: number | null }) => {
  console.log(JSON.stringify({ provider, ...r }));
  const bad = r.steps.filter((s) => !s.ok).map((s) => s.step);
  const skipped = r.steps.filter((s) => s.note?.startsWith('skipped')).length;
  rows.push(
    `| ${provider} | ${(r.connectedMs / 1000).toFixed(1)} s | ${r.firstDataMs === null ? '–' : `${(r.firstDataMs / 1000).toFixed(1)} s`} | ${bad.length ? `failed: ${bad.join(', ')}` : 'all steps ok'}${skipped ? ` (${skipped} by hand, skipped)` : ''} |`,
  );
};
const each = async <S extends { provider: string }>(specs: readonly S[], run: (spec: S, real?: RealSide) => Promise<Parameters<typeof row>[1]>) => {
  for (const spec of specs) {
    const real = REAL ? realSide(spec.provider) : undefined;
    if (REAL && !real) rows.push(`| ${spec.provider} | – | – | skipped: no credentials in the environment |`);
    else row(spec.provider, await run(spec, real ?? undefined));
  }
};
await each(SUPPORT_SPECS, (spec, real) => runSupportFlow(http, stack.world, spec, real));
await each(JIRA_SPECS, (spec, real) => runJiraFlow(http, stack.world, spec, real));
await each(MAILBOX_SPECS, (spec, real) => runMailboxFlow(http, stack.world, spec, real));
await each(ACCOUNTING_SPECS, (spec, real) => runAccountingFlow(http, stack.world, spec, real));
console.log(`\n| integration | time to connected | time to first data | result |\n| --- | --- | --- | --- |\n${rows.join('\n')}`);
process.exit(0);
