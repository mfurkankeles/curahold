// Every integration run the way a customer's administrator runs it, against the vendor mocks in
// tests/vendors (no real account, nothing leaves the machine): connect, map, first sync, a change on
// each side, both at once, an expired token, a rate limit, a refused field, withdrawn access,
// reconnect and disconnect. scripts/integrations/onboard.ts times the same flow.
import { beforeAll, describe, expect, it } from 'vitest';
import { runAccountingFlow, runFlow, type FlowSpec, type Http } from './vendors/flow';
import { VENDOR_MOCKS } from './vendors';
import { vendorWorld, type VendorWorld } from './vendors/kit';
import { BASE, Client, login, setup, type Env } from './helpers';

export const SPECS: FlowSpec[] = [
  { provider: 'salesforce', objects: [{ remote: 'Account', target: 'account' }, { remote: 'Contact', target: 'record', kind: 'contact' }, { remote: 'Opportunity', target: 'record', kind: 'opportunity' }], expect: 'Pinecrest Foods', twoWay: true },
  { provider: 'hubspot', objects: [{ remote: 'companies', target: 'account' }, { remote: 'contacts', target: 'record', kind: 'contact' }, { remote: 'deals', target: 'record', kind: 'opportunity' }], expect: 'Pinecrest Foods', twoWay: true },
  { provider: 'bitrix24', objects: [{ remote: 'company', target: 'account' }, { remote: 'contact', target: 'record', kind: 'contact' }, { remote: 'deal', target: 'record', kind: 'opportunity' }], expect: 'Pinecrest Foods', twoWay: true },
];

export const ACCOUNTING_SPECS = [{ provider: 'odoo', customer: 'Quillfield Retail' }];

function httpFor(env: Env, ada: Client): Http {
  return {
    get: (p) => ada.get(p),
    post: (p, b) => ada.post(p, b),
    put: (p, b) => ada.put(p, b),
    patch: (p, b) => ada.patch(p, b),
    del: (p) => ada.del(p),
    async location(p) {
      const url = p.startsWith('http') ? p : `https://acme.${BASE}${p}`;
      const res = await env.app.request(url, { headers: { cookie: ada.cookie, 'x-curahold-device': ada.device } });
      return res.headers.get('location');
    },
    settle: () => env.settle(),
    advance(ms) {
      env.clock.now = new Date((env.clock.now ?? new Date()).getTime() + ms);
    },
  };
}

describe('integrations, customer-style, against the vendor mocks', () => {
  let env: Env;
  let ada: Client;
  let world: VendorWorld;
  beforeAll(async () => {
    const reg = { clientId: 'mock-client', clientSecret: 'mock-secret' };
    env = await setup({ connectors: { crm: { salesforce: reg, hubspot: reg, pipedrive: reg, zoho: reg, dynamics: reg, jira: reg, xero: reg, freee: reg, quickbooks: reg } }, oauth: { google: reg, microsoft: reg } });
    // The app's clock runs from the real moment: queued writes are stamped by the database's own clock.
    env.clock.now = new Date();
    world = vendorWorld(VENDOR_MOCKS, { now: () => env.deps.now() });
    env.fetchHolder.impl = (u, i) => world.fetch(u, i);
    ada = await login(env, 'acme', 'ada@demo.example');
  });

  for (const spec of SPECS) {
    it(`${spec.provider}: every step of the run works`, async () => {
      const { steps } = await runFlow(httpFor(env, ada), world, spec);
      const failed = steps.filter((s) => !s.ok).map((s) => `${s.step}: ${s.note}`);
      expect(failed).toEqual([]);
    });
  }

  for (const spec of ACCOUNTING_SPECS) {
    it(`${spec.provider} (accounting, read only): every step of the run works`, async () => {
      const { steps } = await runAccountingFlow(httpFor(env, ada), world, spec);
      expect(steps.filter((s) => !s.ok).map((s) => `${s.step}: ${s.note}`)).toEqual([]);
    });
  }
});
