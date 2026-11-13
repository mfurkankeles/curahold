// Support tickets: the four support tools against stubs of their APIs, the
// sync that files tickets under the right customer (and leaves out what it
// cannot place), Salesforce/Dynamics cases, the ticket API and the inbound
// webhook, and what tickets do to the health score and timeline.
import { describe, expect, it, beforeAll } from 'vitest';
import { DEFAULT_HEALTH } from '../shared/src/health';
import { freshdesk, intercom, jsm, zendesk } from '../api/src/sync/adapters/support';
import type { CrmCtx } from '../api/src/sync/adapters/types';
import { BASE, Client, login, setup, type Env } from './helpers';

const json = (v: unknown) => Response.json(v);

function ctxFor(config: Record<string, any>, routes: [RegExp, (url: string, init?: RequestInit) => unknown][]): { ctx: CrmCtx; calls: { url: string; auth: string | null; body: any }[] } {
  const calls: { url: string; auth: string | null; body: any }[] = [];
  const ctx: CrmCtx = {
    config,
    now: () => new Date('2026-11-11T10:00:00Z'),
    token: async () => 'Basic abc',
    refresh: async () => 'Basic abc',
    fetch: (async (u: string, init: RequestInit = {}) => {
      calls.push({ url: String(u), auth: new Headers(init.headers).get('authorization'), body: init.body ? JSON.parse(String(init.body)) : null });
      for (const [re, fn] of routes) if (re.test(`${init.method ?? 'GET'} ${u}`)) return json(fn(String(u), init));
      return new Response('no route', { status: 404 });
    }) as typeof fetch,
  };
  return { ctx, calls };
}

describe('support tool adapters fold their tickets into one shape', () => {
  it('Zendesk: incremental tickets with requesters, organisations with domains', async () => {
    const { ctx, calls } = ctxFor({ subdomain: 'acme' }, [
      [/incremental\/tickets\/cursor/, () => ({ tickets: [{ id: 7, subject: 'Export fails', status: 'hold', priority: 'urgent', created_at: '2026-11-01T09:00:00Z', updated_at: '2026-11-02T09:00:00Z', requester_id: 3, organization_id: 9, via: { channel: 'email' } }, { id: 8, status: 'deleted' }], users: [{ id: 3, email: 'Selin@Quillfield.example' }], end_of_stream: true })],
      [/organizations\.json/, () => ({ organizations: [{ id: 9, name: 'Quillfield', domain_names: ['quillfield.example'], updated_at: '2026-11-01T00:00:00Z' }], meta: { has_more: false } })],
    ]);
    const page = await zendesk.list(ctx, 'tickets', { since: '2026-11-01T00:00:00Z', cursor: null, fields: [] });
    expect(calls[0].url).toContain(`start_time=${Date.parse('2026-11-01T00:00:00Z') / 1000}`);
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0].values).toMatchObject({ subject: 'Export fails', status: 'pending', priority: 'urgent', requester: 'selin@quillfield.example', organization: '9', channel: 'email', __requesterDomain: 'quillfield.example' });
    expect(page.next).toBeNull();
    const orgs = await zendesk.list(ctx, 'organizations', { since: null, cursor: null, fields: [] });
    expect(orgs.rows[0].values.__domains).toEqual(['quillfield.example']);
  });

  it('Freshdesk: numeric states and priorities', async () => {
    const { ctx } = ctxFor({ domain: 'acme' }, [[/\/tickets\?/, () => [{ id: 1, subject: 'Login loop', status: 4, priority: 3, created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-03T00:00:00Z', company_id: 5, requester: { email: 'a@velto.example' }, stats: { resolved_at: '2026-11-03T00:00:00Z' }, source: 1 }]]]);
    const page = await freshdesk.list(ctx, 'tickets', { since: null, cursor: null, fields: [] });
    expect(page.rows[0].values).toMatchObject({ status: 'solved', priority: 'high', channel: 'email', organization: '5', solved: '2026-11-03T00:00:00.000Z' });
  });

  it('Intercom: conversations found by the person, not a company', async () => {
    const { ctx, calls } = ctxFor({ region: 'eu', appId: 'abc' }, [[/conversations\/search/, () => ({ conversations: [{ id: '42', state: 'snoozed', priority: 'priority', created_at: 1762000000, updated_at: 1762100000, source: { subject: '', body: '<p>Can’t <b>export</b> the report</p>', author: { email: 'mila@duskvale.example' }, delivered_as: 'customer_initiated' } }], pages: {} })]]);
    const page = await intercom.list(ctx, 'tickets', { since: null, cursor: null, fields: [] });
    expect(calls[0].url).toBe('https://api.eu.intercom.io/conversations/search');
    expect(page.rows[0].values).toMatchObject({ subject: 'Can’t export the report', status: 'pending', priority: 'high', __requesterDomain: 'duskvale.example' });
    expect((await intercom.fields(ctx, 'tickets')).some((f) => f.name === 'organization')).toBe(false);
  });

  it('Jira Service Management: status categories and the organisations field', async () => {
    const { ctx, calls } = ctxFor({ site: 'acme', projects: ['HELP'], orgField: 'customfield_10002' }, [
      [/search\/jql/, () => ({ issues: [{ key: 'HELP-3', fields: { summary: 'Sync stuck', status: { name: 'Done', statusCategory: { key: 'done' } }, priority: { name: 'Highest' }, created: '2026-11-01T10:00:00.000+0000', updated: '2026-11-02T10:00:00.000+0000', resolutiondate: '2026-11-02T10:00:00.000+0000', reporter: { emailAddress: 'x@fjordnet.example' }, customfield_10002: [{ id: '17', name: 'Fjordnet' }] } }] })],
    ]);
    const page = await jsm.list(ctx, 'tickets', { since: '2026-11-01T00:00:00Z', cursor: null, fields: [] });
    expect(calls[0].body.jql).toContain('project in ("HELP") AND updated >= "2026-10-31 23:59"');
    expect(page.rows[0]).toMatchObject({ id: 'HELP-3', values: { status: 'solved', priority: 'urgent', organization: '17', link: 'https://acme.atlassian.net/browse/HELP-3' } });
  });
});

describe('connecting a support tool and filing its tickets', () => {
  let env: Env;
  let ada: Client;
  let connId = '';
  beforeAll(async () => {
    env = await setup();
    ada = await login(env, 'acme', 'ada@demo.example');
  });

  const zendeskApi = (url: string) => {
    if (url.includes('/users/me.json')) return json({ user: { id: 1, role: 'admin' } });
    if (url.includes('/users.json')) return json({ users: [{ id: 501, name: 'Lena Fischer', email: 'lena@demo.example' }], meta: { has_more: false } });
    if (url.includes('/organizations.json'))
      return json({
        organizations: [
          { id: 1, name: 'Cedarmoor Health', domain_names: [], updated_at: '2026-11-01T00:00:00Z' },
          { id: 2, name: 'Not A Customer Ltd', domain_names: ['nobody.example'], updated_at: '2026-11-01T00:00:00Z' },
          { id: 3, name: 'HLB Group', domain_names: ['harborline.example'], updated_at: '2026-11-01T00:00:00Z' },
        ],
        meta: { has_more: false },
      });
    if (url.includes('/incremental/tickets/cursor'))
      return json({
        tickets: [
          { id: 11, subject: 'Dashboard is blank', status: 'open', priority: 'urgent', created_at: '2026-11-09T09:00:00Z', updated_at: '2026-11-09T09:00:00Z', organization_id: 1, requester_id: 91, assignee_id: 501 },
          { id: 12, subject: 'Pricing question', status: 'new', priority: 'low', created_at: '2026-11-09T09:00:00Z', updated_at: '2026-11-09T09:00:00Z', organization_id: 2, requester_id: 92 },
          { id: 13, subject: 'Report export', status: 'pending', priority: 'normal', created_at: '2026-11-08T09:00:00Z', updated_at: '2026-11-08T09:00:00Z', organization_id: null, requester_id: 93 },
          { id: 14, subject: 'Hi', status: 'open', priority: 'normal', created_at: '2026-11-08T09:00:00Z', updated_at: '2026-11-08T09:00:00Z', organization_id: null, requester_id: 94 },
          { id: 15, subject: 'Statement mismatch', status: 'solved', priority: 'high', created_at: '2026-11-01T09:00:00Z', updated_at: '2026-11-05T09:00:00Z', organization_id: 3, requester_id: 95 },
        ],
        users: [
          { id: 91, email: 'nora@cedarmoor.example' },
          { id: 92, email: 'x@nobody.example' },
          { id: 93, email: 'ece@velto.example' },
          { id: 94, email: 'someone@gmail.com' },
          { id: 95, email: 'defne@harborline.example' },
        ],
        end_of_stream: true,
      });
    return new Response('no route', { status: 404 });
  };

  it('connects with the address and API token, checked right away', async () => {
    env.fetchHolder.impl = async (url) => (url.includes('/users/me.json') ? new Response('{"error":"Couldn’t authenticate you"}', { status: 401 }) : zendeskApi(url));
    const bad = await ada.post('/api/connections/key', { provider: 'zendesk', values: { subdomain: 'acme', email: 'ada@demo.example', token: 'wrong' } });
    expect(bad.status).toBeGreaterThanOrEqual(400);
    env.fetchHolder.impl = async (url, init) => {
      const r = zendeskApi(url);
      expect(new Headers(init?.headers).get('authorization')).toBe(`Basic ${btoa('ada@demo.example/token:secret-token')}`);
      return r;
    };
    const ok = await ada.post('/api/connections/key', { provider: 'zendesk', values: { subdomain: 'https://Acme.zendesk.com/', email: 'ada@demo.example', token: 'secret-token' } });
    expect(ok.status).toBe(201);
    connId = ok.json.id;
    const d = (await ada.get(`/api/connections/${connId}/sync`)).json;
    expect(d.connection).toMatchObject({ provider: 'zendesk', label: 'acme.zendesk.com', readOnly: false, canReply: true });
    const lena = await login(env, 'acme', 'lena@demo.example');
    expect((await lena.post('/api/connections/key', { provider: 'zendesk', values: {} })).status).toBe(403);
  });

  it('files tickets under the right customer and leaves out what it cannot place', async () => {
    const tf = (await ada.get(`/api/connections/${connId}/objects/tickets/fields?kind=ticket`)).json;
    expect(tf.suggested.map((f: any) => `${f.remote}>${f.local}`)).toEqual(expect.arrayContaining(['subject>name', 'status>f:status', 'priority>f:priority', 'organization>account', 'opened>f:opened_at', 'requester>f:requester', 'link>f:url', 'assignee>owner']));
    // What Zendesk lets be changed goes both ways; what it keeps to itself (dates, links) is only read.
    expect(Object.fromEntries(tf.suggested.map((f: any) => [f.remote, f.dir]))).toMatchObject({ subject: 'both', status: 'both', priority: 'both', assignee: 'both', opened: 'pull', link: 'pull' });
    const of = (await ada.get(`/api/connections/${connId}/objects/organizations/fields?kind=account`)).json;
    const saved = await ada.put(`/api/connections/${connId}/sync`, {
      objects: [
        { remote: 'organizations', label: 'Organizations', target: 'account', enabled: true, create: false, linkOnly: true, fields: of.suggested },
        { remote: 'tickets', label: 'Tickets', target: 'record', typeKey: '__new', kind: 'ticket', enabled: true, create: false, linkOnly: true, fields: tf.suggested },
      ],
    });
    expect(saved.status).toBe(200);
    const run = await ada.post(`/api/connections/${connId}/sync/run`, {});
    expect(run.status).toBe(200);
    const accounts = (await ada.get('/api/accounts?limit=100')).json.accounts;
    // Unknown organisations are not added, and a matched one does not rename the customer.
    expect(accounts.some((a: any) => a.name === 'Not A Customer Ltd' || a.name === 'HLB Group')).toBe(false);
    expect(run.json.run.stats.organizations).toMatchObject({ created: 0, updated: 0 });
    const tickets = (await ada.get('/api/records?type=ticket&limit=50')).json.records;
    const by = Object.fromEntries(tickets.map((t: any) => [t.name, t]));
    expect(Object.keys(by).sort()).toEqual(['Dashboard is blank', 'Report export', 'Statement mismatch']);
    expect(by['Dashboard is blank']).toMatchObject({ accountName: 'Cedarmoor Health', fields: { status: 'open', priority: 'urgent', requester: 'nora@cedarmoor.example' } });
    expect(by['Report export']).toMatchObject({ accountName: 'Velto Mobility', fields: { status: 'pending' } });
    expect(by['Statement mismatch']).toMatchObject({ accountName: 'Harborline Bank', fields: { status: 'solved' } });
    expect(by['Dashboard is blank'].ownerId).toBe(env.a.ids.lena);
    expect(by['Dashboard is blank'].links[0].url).toBe('https://acme.zendesk.com/agent/tickets/11');
  });

  it('a change made here goes back to Zendesk in its own words', async () => {
    const sent: { method: string; url: string; body: any }[] = [];
    env.fetchHolder.impl = async (url, init) => {
      if (init?.method === 'PUT') {
        sent.push({ method: 'PUT', url, body: JSON.parse(String(init.body)) });
        return json({ ticket: { id: 13 } });
      }
      return zendeskApi(url);
    };
    const t = (await ada.get('/api/records?type=ticket&limit=50')).json.records.find((r: any) => r.name === 'Report export');
    await ada.patch(`/api/records/${t.id}`, { fields: { priority: 'low' } });
    await ada.post(`/api/connections/${connId}/problems/retry`, {});
    expect(sent).toEqual([{ method: 'PUT', url: 'https://acme.zendesk.com/api/v2/tickets/13.json', body: { ticket: { priority: 'low' } } }]);
    const [n] = await env.db.system((q) => q.query('select count(*)::int as n from sync_changes where connection_id = $1', [connId]));
    expect(n.n).toBe(0);
  });

  it('open tickets weigh on the health score and appear on the timeline', async () => {
    await ada.put('/api/health/config', { config: { ...DEFAULT_HEALTH, enabled: true } });
    const h = (await ada.get(`/api/accounts/${env.a.accounts['Cedarmoor Health']}/health`)).json.health;
    const support = h.parts.find((p: any) => p.key === 'support');
    expect(support).toMatchObject({ points: 60, detail: { count: 1, urgent: 1 } });
    const tl = (await ada.get(`/api/accounts/${env.a.accounts['Cedarmoor Health']}/timeline`)).json.items;
    expect(tl.find((i: any) => i.type === 'ticket_opened')).toMatchObject({ title: 'Dashboard is blank', priority: 'urgent', url: 'https://acme.zendesk.com/agent/tickets/11' });
    const harbor = (await ada.get(`/api/accounts/${env.a.accounts['Harborline Bank']}/timeline`)).json.items;
    expect(harbor.some((i: any) => i.type === 'ticket_solved')).toBe(true);
  });
});

describe('tickets from any tool: the API and the inbound address', () => {
  let env: Env;
  let ada: Client;
  beforeAll(async () => {
    env = await setup();
    ada = await login(env, 'acme', 'ada@demo.example');
  });
  const put = (token: string, source: string, id: string, body: unknown) =>
    env.app.request(`https://acme.${BASE}/api/tickets/${source}/${id}`, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });

  it('creates once, updates after, finds the customer by web address or requester', async () => {
    const { token } = (await ada.post('/api/dev/keys', { name: 'Helpdesk', canWrite: true })).json;
    const one = await put(token, 'my-desk', 'T-1', { subject: 'Cannot log in', status: 'New', priority: 'P1 - Critical', requester: 'nora@cedarmoor.example' });
    expect(one.status).toBe(201);
    const made = (await one.json()).ticket;
    expect(made.accountId).toBe(env.a.accounts['Cedarmoor Health']);
    const again = await put(token, 'my-desk', 'T-1', { subject: 'Cannot log in (SSO)', status: 'Resolved', account: { domain: 'https://www.cedarmoor.example/' } });
    expect(again.status).toBe(200);
    const rec = (await ada.get(`/api/records/${made.id}`)).json.record;
    expect(rec).toMatchObject({ name: 'Cannot log in (SSO)', fields: { status: 'solved', priority: 'urgent' } });
    expect(rec.fields.solved_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const lost = await put(token, 'my-desk', 'T-2', { subject: 'Who am I', requester: 'someone@gmail.com' });
    expect(lost.status).toBe(400);
    const { token: ro } = (await ada.post('/api/dev/keys', { name: 'read', canWrite: false })).json;
    expect((await put(ro, 'my-desk', 'T-3', { subject: 'x', account: { name: 'Velto Mobility' } })).status).toBe(403);
  });

  it('the inbound address takes tickets from servers, and stops when turned off', async () => {
    const { url } = (await ada.post('/api/dev/inbound')).json;
    expect(url).toMatch(/\/api\/inbound\/tickets\/[A-Za-z0-9_-]+$/);
    const post = (u: string, body: unknown) => env.app.request(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const ok = await post(url, { source: 'forms', externalId: '77', subject: 'Feature request', account: { name: 'Velto Mobility' }, priority: 'low' });
    expect(ok.status).toBe(201);
    expect((await post(url.replace(/[^/]+$/, 'wrong-token'), { source: 'forms', externalId: '78', subject: 'x', account: { name: 'Velto Mobility' } })).status).toBe(404);
    expect((await post(url, { source: 'forms', externalId: '79', subject: 'x', requester: 'a@gmail.com' })).status).toBe(422);
    expect((await post(url, { subject: 'no ids' })).status).toBe(400);
    expect((await ada.get('/api/dev/inbound')).json).toMatchObject({ enabled: true });
    await ada.del('/api/dev/inbound');
    expect((await post(url, { source: 'forms', externalId: '80', subject: 'x', account: { name: 'Velto Mobility' } })).status).toBe(404);
  });
});
