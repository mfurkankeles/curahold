// Request limits (api/src/lib/ratelimit.ts): both sides of every budget. What the
// app itself does when pages open stays inside; a flood from one address,
// person, connection or company is refused with 429, Retry-After and a sentence
// in the person's language.
import { beforeAll, describe, expect, it } from 'vitest';
import { BUDGETS, INVITES_PER_HOUR, Limiter, isExport, isInvite, isSignIn } from '../api/src/lib/ratelimit';
import { createPortalApp } from '../api/src/portal';
import { BASE, login, setup, type Client, type Env } from './helpers';

const PORTAL = 'curahold-portal.test';
let env: Env;
let ada: Client;
let ipSeq = 0;
const freshIp = () => `198.51.100.${++ipSeq}`;

beforeAll(async () => {
  env = await setup({ limitScale: 1, clientIp: 'cf', portalDomain: PORTAL });
  ada = await login(env, 'acme', 'ada@demo.example');
});

describe('the buckets', () => {
  it('refill at their rate, refuse with the wait in seconds, and deduct nothing for a refusal', () => {
    let now = 0;
    const l = new Limiter(10, () => now);
    const b = { cap: 3, perSec: 0.5 };
    expect([l.take('k', b), l.take('k', b), l.take('k', b)]).toEqual([0, 0, 0]);
    expect(l.take('k', b)).toBe(2);
    expect(l.take('k', b)).toBe(2);
    now = 2000;
    expect(l.take('k', b)).toBe(0);
    expect(l.take('k', b)).toBe(2);
  });

  it('stay bounded in memory however many callers come', () => {
    const l = new Limiter(100);
    for (let i = 0; i < 1000; i++) l.take(`k${i}`, BUDGETS.person);
    expect(l.size).toBe(100);
  });

  it('sort the doors an attacker leans on into their own budgets', () => {
    expect(isSignIn('POST', '/api/auth/start')).toBe(true);
    expect(isSignIn('POST', '/api/signup/start')).toBe(true);
    expect(isSignIn('POST', '/papi/auth/code')).toBe(true);
    expect(isSignIn('POST', '/oauth/token')).toBe(true);
    expect(isSignIn('GET', '/api/sso/acme/start')).toBe(true);
    expect(isSignIn('GET', '/api/auth/me')).toBe(false);
    expect(isInvite('POST', '/api/portal/users')).toBe(true);
    expect(isInvite('POST', '/api/portal/users/0b1c/resend')).toBe(true);
    expect(isInvite('GET', '/api/portal/users')).toBe(false);
    expect(isExport('GET', '/api/accounts', new URL('https://x/api/accounts?limit=500&offset=1500'))).toBe(true);
    expect(isExport('GET', '/api/accounts', new URL('https://x/api/accounts?limit=500'))).toBe(false);
  });
});

describe('one person', () => {
  it('opening pages the way the app does never meets a limit', async () => {
    // The heaviest page opens with about 20 requests; ten pages opened back to back.
    const page = ['/api/me', '/api/boards', '/api/accounts?limit=500', '/api/people', '/api/search?q=a'];
    for (let i = 0; i < 40; i++) for (const p of page) expect((await ada.get(p)).status).toBe(200);
  });

  it('a flood is refused with 429, Retry-After and a plain sentence in their language', async () => {
    const mert = await login(env, 'acme', 'mert@demo.example');
    let refused: Awaited<ReturnType<Client['get']>> | null = null;
    let ok = 0;
    for (let i = 0; i < 500 && !refused; i++) {
      const r = await mert.req('GET', '/api/boards', undefined, { 'x-curahold-locale': 'tr' });
      if (r.status === 429) refused = r;
      else ok++;
    }
    expect(ok).toBeGreaterThanOrEqual(BUDGETS.person.cap);
    expect(refused?.json.error).toBe('too_many_requests');
    expect(Number(refused?.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
    expect(refused?.json.message).toMatch(/saniye sonra tekrar dene/);
    // Someone else at the same company is not slowed by it.
    expect((await ada.get('/api/boards')).status).toBe(200);
  });

  it('search has a budget of its own', async () => {
    const zeynep = await login(env, 'acme', 'zeynep@demo.example');
    let refusedAt = 0;
    for (let i = 1; i <= BUDGETS.search.cap + 40 && !refusedAt; i++) if ((await zeynep.get(`/api/search?q=q${i}`)).status === 429) refusedAt = i;
    expect(refusedAt).toBeGreaterThan(BUDGETS.search.cap);
    // Other reads still go through.
    expect((await zeynep.get('/api/boards')).status).toBe(200);
  });

  it('reading a whole list page by page (an export) has a budget of its own', async () => {
    const lena = await login(env, 'acme', 'lena@demo.example');
    let refusedAt = 0;
    for (let i = 1; i <= BUDGETS.export.cap + 10 && !refusedAt; i++) if ((await lena.get('/api/accounts?limit=50&offset=1000')).status === 429) refusedAt = i;
    expect(refusedAt).toBeGreaterThan(BUDGETS.export.cap);
    expect((await lena.get('/api/accounts?limit=50')).status).toBe(200);
  });
});

describe('sign-in from one address', () => {
  it('a person signing in a few times is never stopped; a script trying many addresses is', async () => {
    const ip = freshIp();
    const start = (email: string, from = ip) =>
      env.app.request(`https://acme.${BASE}/api/auth/start`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-curahold-device': 'd', 'cf-connecting-ip': from }, body: JSON.stringify({ email }) });
    for (let i = 0; i < 3; i++) expect((await start(`nobody${i}@demo.example`)).status).toBe(200);
    let refused: Response | null = null;
    for (let i = 3; i < BUDGETS.signin.cap + 5 && !refused; i++) {
      const r = await start(`nobody${i}@demo.example`);
      if (r.status === 429) refused = r;
    }
    expect(refused).not.toBeNull();
    expect(Number(refused!.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
    // Another address is not affected.
    expect((await start('someone@demo.example', freshIp())).status).toBe(200);
  });
});

describe('invitations', () => {
  it('stop at the company\'s hourly count kept in the database, exact on every isolate', async () => {
    const quill = env.a.accounts['Quillfield Retail'];
    await ada.put('/api/portal/settings', { enabled: true });
    expect((await ada.post('/api/portal/users', { accountId: quill, email: 'first@quillfield.example', name: 'First Contact' })).status).toBe(201);
    const [org] = await env.db.system((q) => q.query(`select id from orgs where slug = 'acme'`));
    await env.db.system((q) =>
      q.query(`insert into audit_log (org_id, action, entity) select $1, 'user.invited', 'user' from generate_series(1, $2)`, [org.id, INVITES_PER_HOUR]),
    );
    const r = await ada.post('/api/portal/users', { accountId: quill, email: 'second@quillfield.example', name: 'Second Contact' });
    expect(r.status).toBe(429);
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(60);
    // Last hour's only: an hour later the company may invite again.
    await env.db.system((q) => q.query(`update audit_log set at = at - interval '2 hours' where org_id = $1 and action = 'user.invited'`, [org.id]));
    expect((await ada.post('/api/portal/users', { accountId: quill, email: 'second@quillfield.example', name: 'Second Contact' })).status).toBe(201);
  });
});

describe('the AI connector', () => {
  it('has a budget per connection', async () => {
    const { token } = (await ada.post('/api/dev/keys', { name: 'Assistant', canWrite: false })).json;
    const ping = (i: number) =>
      env.app.request(`https://acme.${BASE}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: '2.0', id: i, method: 'ping' }) });
    let refusedAt = 0;
    for (let i = 1; i <= BUDGETS.mcp.cap + 10 && !refusedAt; i++) if ((await ping(i)).status === 429) refusedAt = i;
    expect(refusedAt).toBeGreaterThan(BUDGETS.mcp.cap);
  });
});

describe('the portal', () => {
  it('limits sign-in steps from one address too', async () => {
    const portal = createPortalApp(env.deps);
    const ip = freshIp();
    const start = (from: string) =>
      portal.request(`https://acme.${PORTAL}/papi/auth/start`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-curahold-portal': '1', 'cf-connecting-ip': from }, body: JSON.stringify({ email: 'nobody@quillfield.example' }) });
    let refusedAt = 0;
    for (let i = 1; i <= BUDGETS.signin.cap + 5 && !refusedAt; i++) if ((await start(ip)).status === 429) refusedAt = i;
    expect(refusedAt).toBeGreaterThan(BUDGETS.signin.cap);
    expect((await start(freshIp())).status).not.toBe(429);
  });
});

describe('switched off', () => {
  it('limitScale 0 turns every limit off (the test suite, a measurement run)', async () => {
    const off = await setup({ limitScale: 0, clientIp: 'cf' });
    const p = await login(off, 'acme', 'ada@demo.example');
    for (let i = 0; i < BUDGETS.search.cap + 5; i++) expect((await p.get('/api/search?q=x')).status).toBe(200);
  });
});
