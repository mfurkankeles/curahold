// Errors are recorded (migration 0032): a browser error through /client-error
// and a server error through the app's own handler both land in error_log.
// An administrator reads their own company's; another company never sees them;
// one person cannot flood it; no request body is kept.
import { beforeAll, describe, expect, it } from 'vitest';
import { recordError } from '../api/src/lib/errlog';
import { Client, login, setup, type Env } from './helpers';

let env: Env;
let ada: Client; // administrator
let lena: Client; // member
let sofia: Client; // viewer
let beta: Client; // administrator at another company

const errors = async (who: Client, q = '') => (await who.get(`/api/admin/errors${q}`)).json.errors as any[];

beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
  sofia = await login(env, 'acme', 'sofia@demo.example');
  beta = await login(env, 'beta', 'ada@demo.example');
});

describe('errors are recorded', () => {
  it('a browser error is reported and an administrator can read it; a member cannot', async () => {
    const r = await lena.req('POST', '/api/client-error', { message: 'Cannot read x of undefined', detail: 'at Foo (app.js:1)', path: '/accounts/123' }, { 'user-agent': 'TestBrowser/1' });
    expect(r.status).toBe(204);
    const mine = (await errors(ada, '?source=browser')).find((e) => e.message === 'Cannot read x of undefined');
    expect(mine).toMatchObject({ source: 'browser', path: '/accounts/123', byId: env.a.ids.lena, agent: 'TestBrowser/1' });
    expect((await lena.get('/api/admin/errors')).status).toBe(403);
  });

  it('a server error reads back for an administrator', async () => {
    await recordError(env.deps, { source: 'server', orgId: env.a.orgId, userId: env.a.ids.mert, method: 'POST', path: '/api/accounts', message: 'boom', detail: 'Error: boom\n  at x' });
    const list = await errors(ada, '?source=server');
    expect(list.find((e) => e.message === 'boom')).toMatchObject({ source: 'server', method: 'POST', path: '/api/accounts' });
  });

  it('a fault before sign-in (no company) stays with Curahold, not any administrator', async () => {
    await recordError(env.deps, { source: 'server', orgId: null, message: 'before any company', path: '/api/auth/verify' });
    expect((await errors(ada)).some((e) => e.message === 'before any company')).toBe(false);
  });

  it('another company never sees these', async () => {
    expect((await errors(beta)).some((e) => e.message === 'boom' || e.message === 'Cannot read x of undefined')).toBe(false);
  });

  it('a person flooding the browser channel is capped', async () => {
    for (let i = 0; i < 35; i++) await sofia.post('/api/client-error', { message: `flood ${i}` });
    const flood = (await errors(ada, '?source=browser&limit=200')).filter((e) => e.byId === env.a.ids.sofia);
    expect(flood.length).toBeLessThanOrEqual(30);
    expect(flood.length).toBeGreaterThan(0);
  });
});
