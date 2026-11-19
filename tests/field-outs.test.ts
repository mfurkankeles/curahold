// Field-level permission, every way out. A field one role may not see stays out of
// everything that reaches that role: the list and one customer (tests/views.test.ts),
// reports (tests/report-builder.test.ts), and here: export pages, the export file, the analytics feed, search, an API key,
// the AI connector, webhooks (as their creator may see), the health "why", the
// timeline, the weekly summary email, and the whitespace table.
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_HEALTH } from '../shared/src/health';
import { buildWeekly } from '../api/src/lib/weekly';
import { deliverWebhooks } from '../api/src/lib/webhooks';
import { BASE, login, setup, type Client, type Env } from './helpers';

const SECRET = 4242424; // a value nobody would see by accident
let env: Env;
let ada: Client;
let mert: Client;
let lena: Client;
let account = '';
let all: any[] = [];

const has = (x: unknown) => JSON.stringify(x).includes(String(SECRET));

beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
  mert = await login(env, 'acme', 'mert@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
  account = env.a.accounts['Cedarmoor Health'];
  // Health on, with a signal read from the hidden field.
  await mert.put('/api/health/config', { config: { ...DEFAULT_HEALTH, enabled: true, signals: [...DEFAULT_HEALTH.signals, { id: 'arr_size', key: 'number', weight: 10, good: 5_000_000, bad: 0, field: 'arr' }] } });
  all = (await ada.get('/api/me')).json.org.accountFields;
  const fields = all.map((f: any) => (f.key === 'arr' ? { ...f, access: { view: ['admin', 'manager'] } } : f));
  expect((await ada.put('/api/account-fields', { fields })).status).toBe(200);
  expect((await ada.patch(`/api/accounts/${account}`, { fields: { arr: SECRET } })).status).toBe(200);
});

describe('a field hidden from a role', () => {
  it('is in what the roles that may see it get', async () => {
    expect(has((await mert.get(`/api/accounts/${account}`)).json)).toBe(true);
  });

  it('stays out of every list page, including the deep pages an export reads', async () => {
    for (const offset of [0, 500, 1000]) expect(has((await lena.get(`/api/accounts?limit=500&offset=${offset}`)).json)).toBe(false);
  });

  it('stays out of an export file, for a role that may export but not see the field', async () => {
    // Members may not export by default: given the permission for this, the hidden field still stays out.
    await env.db.system((q) => q.query(`update roles set perms = perms || '{data.export}' where org_id = $1 and key = 'member'`, [env.a.orgId]));
    const lenaCsv = await lena.post('/api/exports', { source: 'accounts', format: 'csv', q: 'Cedarmoor' });
    expect(lenaCsv.status).toBe(200);
    expect(String(lenaCsv.json)).toContain('Cedarmoor Health');
    expect(has(lenaCsv.json)).toBe(false);
    // The same file for a role that may see it carries it (the test reads what it thinks it reads).
    expect(has((await mert.post('/api/exports', { source: 'accounts', format: 'csv', q: 'Cedarmoor' })).json)).toBe(true);
    await env.db.system((q) => q.query(`update roles set perms = array_remove(perms, 'data.export') where org_id = $1 and key = 'member'`, [env.a.orgId]));
  });

  it('stays out of the analytics feed: not a column in $metadata, not a value in any face', async () => {
    await env.db.system((q) => q.query(`update roles set perms = perms || '{data.export}' where org_id = $1 and key = 'member'`, [env.a.orgId]));
    const made = await lena.post('/api/dev/analytics/keys', { name: 'BI' });
    expect(made.status).toBe(201);
    const read = async (token: string, path: string) =>
      (await env.app.request(`https://acme.${BASE}${path}`, { headers: { authorization: `Basic ${btoa(`bi:${token}`)}` } })).text();
    const paths = ['/api/analytics/odata/$metadata', '/api/analytics/odata/Customers', '/api/analytics/odata/Renewals', '/api/analytics/v1/Customers.csv', '/api/analytics/v1/'];
    for (const p of paths) expect(has(await read(made.json.token, p)), p).toBe(false);
    expect(await read(made.json.token, '/api/analytics/odata/$metadata')).not.toContain('Name="Arr"');
    // The same feed for a role that may see the field carries it.
    const mertKey = (await mert.post('/api/dev/analytics/keys', { name: 'BI' })).json.token;
    expect(has(await read(mertKey, '/api/analytics/odata/Customers'))).toBe(true);
    await env.db.system((q) => q.query(`update roles set perms = array_remove(perms, 'data.export') where org_id = $1 and key = 'member'`, [env.a.orgId]));
  });

  it('stays out of search', async () => {
    expect(has((await lena.get('/api/search?q=Cedarmoor')).json)).toBe(false);
    expect(has((await lena.get(`/api/search?q=${SECRET}`)).json)).toBe(false);
  });

  it('stays out of what an API key and the AI connector read', async () => {
    const { token } = (await lena.post('/api/dev/keys', { name: 'Reader', canWrite: false })).json;
    const bearer = (path: string) => env.app.request(`https://acme.${BASE}${path}`, { headers: { authorization: `Bearer ${token}` } });
    expect(has(await (await bearer(`/api/accounts/${account}`)).json())).toBe(false);
    const rpc = async (name: string, args: unknown) =>
      (
        await (
          await env.app.request(`https://acme.${BASE}/mcp`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
          })
        ).json()
      ).result;
    const fetched = await rpc('fetch', { id: `account:${account}` });
    expect(fetched.isError).toBeFalsy();
    expect(has(fetched)).toBe(false);
    expect(has(await rpc('list_accounts', { query: 'Cedarmoor' }))).toBe(false);
    expect(has(await rpc('portfolio_summary', {}))).toBe(false);
  });

  it('stays out of the health "why" (the points stay, the value does not)', async () => {
    const mine = (await lena.get(`/api/accounts/${account}/health`)).json;
    expect(mine.health.parts.find((p: any) => p.id === 'arr_size')).toBeTruthy();
    expect(has(mine)).toBe(false);
    expect(has((await mert.get(`/api/accounts/${account}/health`)).json)).toBe(true);
  });

  it('stays out of the timeline of changes', async () => {
    expect(has((await lena.get(`/api/accounts/${account}/timeline`)).json)).toBe(false);
  });

  it('goes to a webhook only when the person who set it up may see it', async () => {
    const [ops] = await env.db.system((q) =>
      q.query(`insert into roles (org_id, key, name, perms) values ($1, 'ops', 'Ops', '{connections.manage,accounts.view_all}') returning id`, [env.a.orgId]),
    );
    await env.db.system((q) => q.query(`update users set role_id = $2 where org_id = $1 and email = 'omar@demo.example'`, [env.a.orgId, ops.id]));
    const omar = await login(env, 'acme', 'omar@demo.example');
    const sent: { url: string; body: any }[] = [];
    env.fetchHolder.impl = async (url, init) => {
      sent.push({ url, body: JSON.parse(String(init?.body ?? '{}')) });
      return new Response('ok');
    };
    expect((await omar.post('/api/dev/webhooks', { url: 'https://ops.example.com/hook', events: ['account.updated'] })).status).toBe(201);
    expect((await ada.post('/api/dev/webhooks', { url: 'https://admin.example.com/hook', events: ['account.updated'] })).status).toBe(201);
    await ada.patch(`/api/accounts/${account}`, { fields: { arr: SECRET + 1 } });
    await env.settle();
    await deliverWebhooks(env.deps, 50);
    const toOps = sent.filter((s) => s.url.startsWith('https://ops.') && s.body.event === 'account.updated');
    const toAdmin = sent.filter((s) => s.url.startsWith('https://admin.') && s.body.event === 'account.updated');
    expect(toOps.length).toBeGreaterThan(0);
    expect(toAdmin.length).toBeGreaterThan(0);
    expect(toOps.every((s) => s.body.data.fields.arr === undefined)).toBe(true);
    expect(toAdmin.some((s) => s.body.data.fields.arr === SECRET + 1)).toBe(true);
  });

  it('stays out of the weekly summary email', async () => {
    const renewalHidden = all.map((f: any) => (f.key === 'arr' || f.key === 'renewal_date' ? { ...f, access: { view: ['admin', 'manager'] } } : f));
    expect((await ada.put('/api/account-fields', { fields: renewalHidden })).status).toBe(200);
    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    await ada.patch(`/api/accounts/${account}`, { ownerId: env.a.ids.lena, fields: { renewal_date: soon } });
    const forLena = await env.db.system((q) => buildWeekly(q, env.a.orgId, env.a.ids.lena, new Date(), 'en'));
    expect(JSON.stringify(forLena ?? {})).not.toContain(soon);
    expect(has(forLena ?? {})).toBe(false);
    await ada.patch(`/api/accounts/${account}`, { ownerId: env.a.ids.mert });
    const forMert = await env.db.system((q) => buildWeekly(q, env.a.orgId, env.a.ids.mert, new Date(), 'en'));
    expect(JSON.stringify(forMert ?? {})).toContain(soon);
  });

  it('cannot be counted through the whitespace table either', async () => {
    const deals = (await ada.post('/api/record-types', { kind: 'opportunity' })).json.type;
    const stage = deals.fields.find((f: any) => f.type === 'select');
    expect((await lena.get(`/api/accounts/whitespace?type=${deals.id}&field=${stage.key}`)).status).toBe(200);
    await ada.patch(`/api/record-types/${deals.id}`, { fields: deals.fields.map((f: any) => (f.key === stage.key ? { ...f, access: { view: ['admin'] } } : f)) });
    expect((await lena.get(`/api/accounts/whitespace?type=${deals.id}&field=${stage.key}`)).status).toBe(400);
    expect((await ada.get(`/api/accounts/whitespace?type=${deals.id}&field=${stage.key}`)).status).toBe(200);
  });
});
