// The local app with every vendor answered by the mocks in tests/vendors (nothing leaves the machine),
// or — with REAL=1 — by the real vendors, using the sandbox credentials in the environment
// (the variable names are listed in the header of scripts/integrations/onboard.ts).
//
//   PORT=9760 npx tsx scripts/integrations/boot.ts          (serves until stopped; for a look by hand)
import { startLocal } from '../../api/src/node';
import type { Config } from '../../api/src/context';
import { REALISTIC_LATENCY_MS, VENDOR_MOCKS } from '../../tests/vendors';
import { vendorWorld, type VendorWorld } from '../../tests/vendors/kit';

/** OAuth registrations read from the environment (real mode), e.g. SALESFORCE_CLIENT_ID / SALESFORCE_CLIENT_SECRET. */
export function realRegistrations(env: NodeJS.ProcessEnv = process.env) {
  const crm: NonNullable<Config['connectors']['crm']> = {};
  for (const p of ['salesforce', 'hubspot', 'dynamics', 'pipedrive', 'zoho', 'jira', 'xero', 'freee', 'quickbooks'] as const) {
    const id = env[`${p.toUpperCase()}_CLIENT_ID`];
    const secret = env[`${p.toUpperCase()}_CLIENT_SECRET`];
    if (id && secret) crm[p] = { clientId: id, clientSecret: secret };
  }
  const oauth: Config['oauth'] = {};
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) oauth.google = { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
  if (env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET) oauth.microsoft = { clientId: env.MICROSOFT_CLIENT_ID, clientSecret: env.MICROSOFT_CLIENT_SECRET };
  return { crm, oauth };
}

export async function bootIntegrations(opts: { port: number; real?: boolean; latency?: boolean; locale?: 'en' | 'tr' }) {
  let world: VendorWorld | null = null;
  let connectors: Config['connectors'];
  let oauth: Config['oauth'];
  if (opts.real) {
    const reg = realRegistrations();
    connectors = { crm: reg.crm };
    oauth = reg.oauth;
  } else {
    world = vendorWorld(VENDOR_MOCKS, { latencyMs: opts.latency === false ? () => 0 : (v) => REALISTIC_LATENCY_MS[v] ?? REALISTIC_LATENCY_MS.default });
    const mock = { clientId: 'mock-client', clientSecret: 'mock-secret' };
    connectors = { crm: { salesforce: mock, hubspot: mock, dynamics: mock, pipedrive: mock, zoho: mock, jira: mock, xero: mock, freee: mock, quickbooks: mock } };
    oauth = { google: mock, microsoft: mock };
  }
  for (const m of VENDOR_MOCKS) m.reset();
  const local = await startLocal({ port: opts.port, publicPort: opts.port, serveStatic: true, quiet: true, locale: opts.locale ?? 'en', signupMode: 'instant', connectors, oauth, ...(world ? { fetch: world.fetch } : {}) });
  return { ...local, world, origin: `http://demo.localhost:${opts.port}` };
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const port = Number(process.env.PORT ?? 9760);
  const s = await bootIntegrations({ port, real: process.env.REAL === '1', locale: (['en', 'tr'] as const).find((l) => l === process.env.DEMO_LOCALE) ?? 'en' });
  console.log(`integrations stack on ${s.origin} (${s.world ? 'vendor mocks' : 'REAL vendors'}); sign in as ${s.demo.adminEmail}`);
  const stop = Number(process.env.STOP_AFTER_S ?? 0);
  if (stop) setTimeout(() => process.exit(0), stop * 1000).unref();
}
