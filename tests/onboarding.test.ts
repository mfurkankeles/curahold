// Zero-code onboarding (api/src/routes/onboarding): provisioning a company makes
// it, starts its 3-month trial, sends the welcome, and opens its checklist; the
// checklist then tracks the first-run steps, readable by the company and written
// by its administrators.
import { beforeAll, describe, expect, it } from 'vitest';
import { provisionOrg } from '../api/src/routes/onboarding';
import { setup, type Env } from './helpers';
import { billingApp, caller } from './billing-harness';

const SECRET = 'pdl_ntfset_test_secret';
const PRICES = { team: { month: 'pri_team_m', year: 'pri_team_y' }, business: { month: 'pri_biz_m', year: 'pri_biz_y' } };

let env: Env;
let app: ReturnType<typeof billingApp>;

beforeAll(async () => {
  env = await setup({ billing: { provider: 'paddle', env: 'sandbox', apiKey: 'pdl_key', webhookSecret: SECRET, clientToken: 'test_token', prices: PRICES } });
  app = billingApp(env);
});

describe('provisioning', () => {
  it('makes the company, starts its trial, sends the welcome, and opens its checklist', async () => {
    const created = await provisionOrg(env.deps, {
      slug: 'newco',
      name: 'Newco',
      locale: 'en',
      admin: { email: 'founder@demo.example', name: 'Founder Demir' },
    });
    expect(created.orgId).toBeTruthy();

    // A 3-month trial in the subscriptions table.
    const [sub] = await env.db.system((q) => q.query('select status, trial_ends_at from subscriptions where org_id = $1', [created.orgId]));
    expect(sub.status).toBe('trialing');
    const months = (new Date(sub.trial_ends_at).getTime() - Date.now()) / (86_400_000 * 30);
    expect(months).toBeGreaterThan(2.7);
    expect(months).toBeLessThan(3.3);

    // The welcome went out through the mailer (MemoryEmail here).
    expect(env.email.sent.some((m) => m.to === 'founder@demo.example')).toBe(true);

    // The checklist row exists, with the welcome marked sent.
    const [row] = await env.db.system((q) => q.query('select welcomed_at from onboarding_checklists where org_id = $1', [created.orgId]));
    expect(row.welcomed_at).toBeTruthy();
  });
});

describe('the checklist', () => {
  let adminId: string;
  beforeAll(async () => {
    const [u] = await env.db.system((q) => q.query("select id from users where email = 'founder@demo.example'"));
    adminId = u.id;
  });

  it('starts empty, then follows what the administrator ticks off', async () => {
    const newco = caller(app, 'newco');
    const start = await newco('GET', '/onboarding/checklist', { user: adminId });
    expect(start.status).toBe(200);
    expect(start.json.steps.length).toBeGreaterThan(0);
    expect(start.json.steps.every((s: { done: boolean }) => !s.done)).toBe(true);
    expect(start.json.complete).toBe(false);
    expect(start.json.trial).toMatchObject({ status: 'trialing' });

    const tick = await newco('POST', '/onboarding/checklist', { user: adminId, body: { step: 'create_board', done: true } });
    expect(tick.status).toBe(200);
    expect(tick.json.done).toContain('create_board');

    const after = await newco('GET', '/onboarding/checklist', { user: adminId });
    expect(after.json.steps.find((s: { key: string }) => s.key === 'create_board').done).toBe(true);

    // Untick.
    await newco('POST', '/onboarding/checklist', { user: adminId, body: { step: 'create_board', done: false } });
    expect((await newco('GET', '/onboarding/checklist', { user: adminId })).json.steps.find((s: { key: string }) => s.key === 'create_board').done).toBe(false);
  });

  it('is readable by any member but only administrators may change it', async () => {
    const acme = caller(app, 'acme');
    expect((await acme('GET', '/onboarding/checklist', { user: env.a.ids.lena })).status).toBe(200);
    expect((await acme('POST', '/onboarding/checklist', { user: env.a.ids.lena, body: { step: 'first_task', done: true } })).status).toBe(403);
  });
});
