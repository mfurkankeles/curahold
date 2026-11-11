import { beforeAll, describe, expect, it } from 'vitest';
import { Client, setup, type Env } from './helpers';

let env: Env;
beforeAll(async () => {
  env = await setup();
});

async function signUp(email: string, over: Record<string, unknown> = {}) {
  const central = new Client(env, 'app');
  const start = await central.post('/api/signup/start', { email, locale: 'tr' });
  expect(start.status).toBe(200);
  const v = await central.post('/api/signup/verify', { token: start.json.devToken });
  expect(v.status).toBe(200);
  const done = await central.post('/api/signup/complete', {
    ticket: v.json.ticket,
    company: 'Northwind Traders',
    slug: 'northwind',
    name: 'Nora Wind',
    locale: 'tr',
    timezone: 'Europe/Istanbul',
    currency: 'TRY',
    template: 'customer_success',
    ...over,
  });
  return { central, start, v, done };
}

describe('self-serve sign-up', () => {
  it('suggests a name and address from the work email', async () => {
    const central = new Client(env, 'app');
    const start = await central.post('/api/signup/start', { email: 'nora@northwind-traders.example', locale: 'en' });
    expect(env.email.last('nora@northwind-traders.example').text).toContain('/signup/verify#token=');
    const v = await central.post('/api/signup/verify', { token: start.json.devToken });
    expect(v.json).toMatchObject({ email: 'nora@northwind-traders.example', domain: 'northwind-traders.example', suggestedName: 'Northwind Traders', suggestedSlug: 'northwind-traders' });
  });

  it('creates the company from a template and signs the founder straight in', async () => {
    const { done } = await signUp('nora@northwind.example');
    expect(done.status).toBe(201);
    expect(done.json.url).toMatch(/^https:\/\/northwind\.tendwell\.test\/auth\/verify#token=.+&m=signup$/);

    const token = /token=([^&]+)/.exec(done.json.url)![1];
    const me = new Client(env, 'northwind');
    const v = await me.post('/api/auth/verify', { token, deviceId: me.device, deviceLabel: 'Test' });
    expect(v.json.status).toBe('ok');
    const info = (await me.get('/api/me')).json;
    expect(info.user).toMatchObject({ name: 'Nora Wind', roleKey: 'admin' });
    expect(info.org).toMatchObject({ name: 'Northwind Traders', locale: 'tr', currency: 'TRY', template: 'customer_success', domains: ['northwind.example'] });
    expect(info.org.accountFields.map((f: any) => f.key)).toContain('renewal_date');
    expect(info.org.setup.finishedAt).toBeUndefined();

    const boards = (await me.get('/api/boards')).json.boards.map((b: any) => b.name);
    expect(boards).toEqual(['Müşteri işleri', 'Onboarding', 'Yenilemeler']);
    const rules = (await me.get('/api/automations')).json.automations;
    expect(rules.map((r: any) => r.preset).sort()).toEqual(['no_contact', 'onboarding', 'overdue_notify', 'renewal_plan']);
    expect(rules.find((r: any) => r.preset === 'renewal_plan').name).toBe('Yenilemeden 90 gün önce plan aç');
  });

  it('checks addresses: format, reserved words, taken', async () => {
    const c = new Client(env, 'app');
    expect((await c.get('/api/signup/slug?slug=a')).json).toEqual({ available: false, reason: 'format' });
    expect((await c.get('/api/signup/slug?slug=admin')).json).toEqual({ available: false, reason: 'reserved' });
    expect((await c.get('/api/signup/slug?slug=acme')).json).toEqual({ available: false, reason: 'taken' });
    expect((await c.get('/api/signup/slug?slug=brand-new-co')).json).toEqual({ available: true });
  });

  it('refuses a taken address and an unverified or reused ticket', async () => {
    const r = await signUp('sam@southwind.example', { slug: 'acme' });
    expect(r.done.status).toBe(409);
    expect(r.done.json.error).toBe('slug_taken');
    const fake = await r.central.post('/api/signup/complete', { ...JSON.parse('{}'), ticket: 'x'.repeat(40), company: 'X', slug: 'xco', name: 'X', locale: 'en', timezone: 'UTC', currency: 'USD', template: 'blank' });
    expect(fake.json.error).toBe('invalid_token');
    const ok = await signUp('sam@southwind.example', { slug: 'southwind' });
    expect(ok.done.status).toBe(201);
    const again = await ok.central.post('/api/signup/complete', { ticket: ok.v.json.ticket, company: 'Again', slug: 'southwind-2', name: 'Sam', locale: 'en', timezone: 'UTC', currency: 'USD', template: 'blank' });
    expect(again.json.error).toBe('invalid_token');
  });

  it('gives no domain to a public email address', async () => {
    const { done } = await signUp('solo.founder@gmail.com', { slug: 'solo-shop', template: 'blank' });
    expect(done.status).toBe(201);
    const [org] = await env.db.system((q) => q.query(`select domains from orgs where slug = 'solo-shop'`));
    expect(org.domains).toEqual([]);
  });

  it('points colleagues to the company that already uses their domain', async () => {
    const c = new Client(env, 'app');
    const s = await c.post('/api/signup/start', { email: 'kim@northwind.example' });
    const v = await c.post('/api/signup/verify', { token: s.json.devToken });
    expect(v.json.existing).toEqual([{ name: 'Northwind Traders', url: 'https://northwind.tendwell.test', joinRequests: true }]);
  });

  it('limits sign-up emails per address', async () => {
    const c = new Client(env, 'app');
    for (let i = 0; i < 5; i++) expect((await c.post('/api/signup/start', { email: 'spam@limit.example' })).status).toBe(200);
    expect((await c.post('/api/signup/start', { email: 'spam@limit.example' })).status).toBe(429);
  });

  it('is off for a self-hosted single-company install', async () => {
    const solo = await setup({ singleTenantSlug: 'acme' });
    const r = await new Client(solo, 'app').post('/api/signup/start', { email: 'x@y.example' });
    expect(r.status).toBe(404);
  });
});
