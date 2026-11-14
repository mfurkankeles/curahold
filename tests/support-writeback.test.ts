// Support write-back: Zendesk, Freshdesk, Intercom and Front against stubs of
// their APIs (what a change, a new ticket and a reply send, in each service's
// own words), Jira Service Management staying read only, the routes that create
// and answer tickets, and reconnecting a connection whose key stopped working.
import { beforeAll, describe, expect, it } from 'vitest';
import { READ_ONLY_PROVIDERS } from '../shared/src/sync';
import { freshdesk, front, intercom, jsm, zendesk } from '../api/src/sync/adapters/support';
import { CrmError, type CrmAdapter, type CrmCtx } from '../api/src/sync/adapters/types';
import { login, setup, type Client, type Env } from './helpers';

type Call = { method: string; url: string; body: any };

function stub(config: Record<string, any>, answer: (c: Call) => unknown = () => ({})) {
  const calls: Call[] = [];
  const ctx: CrmCtx = {
    config,
    now: () => new Date('2026-11-11T10:00:00Z'),
    token: async () => 'Bearer t',
    refresh: async () => 'Bearer t',
    fetch: (async (u: string, init: RequestInit = {}) => {
      const call = { method: init.method ?? 'GET', url: String(u), body: init.body ? JSON.parse(String(init.body)) : null };
      calls.push(call);
      const out = answer(call);
      return out instanceof Response ? out : Response.json(out);
    }) as typeof fetch,
  };
  return { ctx, calls };
}

const bodies = (calls: Call[]) => calls.map((c) => [c.method, c.url.replace(/^https:\/\/[^/]+/, ''), c.body]);

describe('Zendesk write-back', () => {
  it('changes status, priority and assignee; solved stands in for closed; creates and answers', async () => {
    const { ctx, calls } = stub({ subdomain: 'acme' }, (c) => (c.method === 'POST' && c.url.endsWith('/tickets.json') ? { ticket: { id: 77 } } : {}));
    await zendesk.update(ctx, 'tickets', '5', { status: 'closed', priority: 'high', assignee: '501' }, []);
    await zendesk.update(ctx, 'tickets', '5', {}, []);
    expect(await zendesk.create(ctx, 'tickets', { subject: ' Cannot log in ', requester: 'nora@cedarmoor.example', description: 'SSO loops', priority: 'urgent' }, [])).toBe('77');
    await zendesk.reply!(ctx, '5', { body: 'We are on it' });
    await zendesk.reply!(ctx, '5', { body: 'Check the SSO log', internal: true });
    expect(bodies(calls)).toEqual([
      ['PUT', '/api/v2/tickets/5.json', { ticket: { status: 'solved', priority: 'high', assignee_id: 501 } }],
      ['POST', '/api/v2/tickets.json', { ticket: { subject: 'Cannot log in', comment: { body: 'SSO loops' }, requester: { email: 'nora@cedarmoor.example' }, priority: 'urgent' } }],
      ['PUT', '/api/v2/tickets/5.json', { ticket: { comment: { body: 'We are on it', public: true } } }],
      ['PUT', '/api/v2/tickets/5.json', { ticket: { comment: { body: 'Check the SSO log', public: false } } }],
    ]);
    await expect(zendesk.create(ctx, 'tickets', { subject: 'No requester' }, [])).rejects.toThrow(/requester/);
    await expect(zendesk.update(ctx, 'organizations', '1', { name: 'x' }, [])).rejects.toThrow(/only read/);
  });

  it('marks what it can change as writable and what it must have to create', async () => {
    const f = Object.fromEntries((await zendesk.fields(stub({ subdomain: 'acme' }).ctx, 'tickets')).map((x) => [x.name, x]));
    expect(f.subject).toMatchObject({ updatable: true, createable: true, required: true });
    expect(f.requester).toMatchObject({ updatable: false, createable: true, required: true });
    expect(f.status.updatable && f.priority.updatable && f.assignee.updatable).toBe(true);
    expect(f.opened.updatable).toBe(false);
    expect(zendesk.readOnly).toBeFalsy();
  });
});

describe('Freshdesk write-back', () => {
  it('speaks in numeric codes and replies publicly or as a private note', async () => {
    const { ctx, calls } = stub({ domain: 'acme' }, (c) => (c.method === 'POST' && c.url.endsWith('/tickets') ? { id: 91 } : {}));
    await freshdesk.update(ctx, 'tickets', '9', { status: 'pending', priority: 'urgent', assignee: '12', subject: 'New title' }, []);
    expect(await freshdesk.create(ctx, 'tickets', { subject: 'Invoice question', requester: 'a@velto.example' }, [])).toBe('91');
    await freshdesk.reply!(ctx, '9', { body: 'Sent the invoice again' });
    await freshdesk.reply!(ctx, '9', { body: 'Finance has it', internal: true });
    expect(bodies(calls)).toEqual([
      ['PUT', '/api/v2/tickets/9', { subject: 'New title', status: 3, priority: 4, responder_id: 12 }],
      // Freshdesk wants a first message, a status and a priority even when none was given.
      ['POST', '/api/v2/tickets', { subject: 'Invoice question', email: 'a@velto.example', description: 'Invoice question', status: 2, priority: 2 }],
      ['POST', '/api/v2/tickets/9/reply', { body: 'Sent the invoice again' }],
      ['POST', '/api/v2/tickets/9/notes', { body: 'Finance has it', private: true }],
    ]);
  });
});

describe('Intercom write-back', () => {
  it('changes a conversation by adding steps to it, as the admin the token acts as', async () => {
    const { ctx, calls } = stub({ region: 'us', appId: 'abc', adminId: '777' });
    await intercom.update(ctx, 'tickets', 'c1', { status: 'solved', assignee: '42' }, []);
    await intercom.update(ctx, 'tickets', 'c1', { status: 'pending' }, []);
    await intercom.reply!(ctx, 'c1', { body: 'Fixed' });
    await intercom.reply!(ctx, 'c1', { body: 'Customer is on the plan with SSO', internal: true });
    expect(bodies(calls)).toEqual([
      ['POST', '/conversations/c1/parts', { type: 'admin', admin_id: '777', message_type: 'close' }],
      ['POST', '/conversations/c1/parts', { type: 'admin', admin_id: '777', message_type: 'assignment', assignee_id: '42' }],
      ['POST', '/conversations/c1/reply', { message_type: 'comment', type: 'admin', admin_id: '777', body: 'Fixed' }],
      ['POST', '/conversations/c1/reply', { message_type: 'note', type: 'admin', admin_id: '777', body: 'Customer is on the plan with SSO' }],
    ]);
    expect(calls.every((c) => c.url.startsWith('https://api.intercom.io/'))).toBe(true);
  });

  it('starts a conversation from the person with that email, making them a lead when there is none', async () => {
    const { ctx, calls } = stub({ region: 'eu', appId: 'abc', adminId: '777' }, (c) => {
      if (c.url.endsWith('/contacts/search')) return { data: [] };
      if (c.url.endsWith('/contacts')) return { id: 'ct1' };
      if (c.url.endsWith('/conversations')) return { type: 'user_message', conversation_id: 'conv-9' };
      return {};
    });
    expect(await intercom.create(ctx, 'tickets', { requester: 'Mila@Duskvale.example', subject: 'Hi', description: 'Can you call me?' }, [])).toBe('conv-9');
    expect(bodies(calls).map((c) => [c[0], c[1]])).toEqual([['POST', '/contacts/search'], ['POST', '/contacts'], ['POST', '/conversations']]);
    expect(calls[0].body.query.value).toBe('mila@duskvale.example');
    expect(calls[2].body).toEqual({ from: { type: 'user', id: 'ct1' }, body: 'Can you call me?' });
  });

  it('asks which admin it is once when the connection was made before that was kept', async () => {
    const { ctx, calls } = stub({ region: 'us', appId: 'abc' }, (c) => (c.url.endsWith('/me') ? { id: 555, app: { id_code: 'abc' } } : {}));
    await intercom.reply!(ctx, 'c2', { body: 'a' });
    await intercom.reply!(ctx, 'c2', { body: 'b' });
    expect(calls.filter((c) => c.url.endsWith('/me'))).toHaveLength(1);
    expect(calls.at(-1)!.body.admin_id).toBe('555');
  });
});

describe('Front', () => {
  it('connects by its token, reads conversations newest first and keeps the key on its own address', async () => {
    const { ctx, calls } = stub({}, (c) => {
      if (c.url.endsWith('/me')) return { _links: { self: 'https://acme.api.frontapp.com/me' }, name: 'Acme Inc' };
      if (c.url.includes('/teammates')) return { _results: [{ id: 'tea_1', email: 'lena@demo.example', first_name: 'Lena', last_name: 'Fischer' }], _pagination: {} };
      return {
        _results: [
          { id: 'cnv_1', subject: 'Cannot export', status: 'assigned', assignee: { id: 'tea_1' }, recipient: { handle: 'nora@cedarmoor.example', role: 'from' }, created_at: 1762000000, last_message: { created_at: 1762100000, type: 'email' } },
          { id: 'cnv_2', subject: 'Done', status: 'archived', recipient: { handle: 'x@velto.example' }, created_at: 1761000000 },
          { id: 'cnv_3', subject: 'Junk', status: 'spam', recipient: { handle: 'spam@x.example' }, created_at: 1761000000 },
        ],
        _pagination: { next: 'https://evil.example/conversations?page_token=x' },
      };
    });
    const made = await front.keyed!.connect(ctx.fetch, { token: ' frnt_abc ' }, new Date());
    expect(made).toMatchObject({ instanceId: 'acme', label: 'Acme Inc', secret: { accessToken: 'Bearer frnt_abc' } });
    expect((await front.users(ctx))[0]).toEqual({ id: 'tea_1', name: 'Lena Fischer', email: 'lena@demo.example' });
    const page = await front.list(ctx, 'tickets', { since: '2026-11-01T00:00:00Z', cursor: null, fields: [] });
    expect(calls.at(-1)!.url).toBe(`https://api2.frontapp.com/conversations/search/after%3A${Date.parse('2026-11-01T00:00:00Z') / 1000}?limit=100`);
    expect(page.rows.map((r) => r.id)).toEqual(['cnv_1', 'cnv_2']);
    expect(page.rows[0].values).toMatchObject({ subject: 'Cannot export', status: 'open', requester: 'nora@cedarmoor.example', assignee: 'tea_1', link: 'https://app.frontapp.com/open/cnv_1', __requesterDomain: 'cedarmoor.example' });
    expect(page.rows[1].values.status).toBe('solved');
    // A "next page" that is not Front's own is never followed.
    expect(page.next).toBeNull();
    expect((await front.objects(ctx)).map((o) => o.name)).toEqual(['tickets']);
  });

  it('archives what is solved, assigns, replies to the customer or leaves a comment; creating is Front\'s own', async () => {
    const { ctx, calls } = stub({});
    await front.update(ctx, 'tickets', 'cnv_1', { status: 'closed', assignee: 'tea_2' }, []);
    await front.update(ctx, 'tickets', 'cnv_1', { status: 'open', assignee: null }, []);
    await front.reply!(ctx, 'cnv_1', { body: 'On it' });
    await front.reply!(ctx, 'cnv_1', { body: 'Ask finance', internal: true });
    expect(bodies(calls)).toEqual([
      ['PATCH', '/conversations/cnv_1', { status: 'archived', assignee_id: 'tea_2' }],
      ['PATCH', '/conversations/cnv_1', { status: 'open', assignee_id: null }],
      ['POST', '/conversations/cnv_1/messages', { body: 'On it', options: { archive: false } }],
      ['POST', '/conversations/cnv_1/comments', { body: 'Ask finance' }],
    ]);
    await expect(front.create(ctx, 'tickets', { subject: 'x' }, [])).rejects.toBeInstanceOf(CrmError);
  });
});

describe('which sources take changes', () => {
  it('Jira Service Management and BigQuery only read; the four support tools write', () => {
    expect(READ_ONLY_PROVIDERS).toEqual(['jsm', 'bigquery', 'snowflake', 'segment']);
    expect(jsm.readOnly).toBe(true);
    for (const a of [zendesk, freshdesk, intercom, front] as CrmAdapter[]) expect(a.readOnly).toBeFalsy();
    for (const a of [zendesk, freshdesk, intercom, front] as CrmAdapter[]) expect(typeof a.reply).toBe('function');
    expect(jsm.reply).toBeUndefined();
  });
});

describe('creating and answering tickets from Curahold, and reconnecting', () => {
  let env: Env;
  let ada: Client;
  let lena: Client;
  let connId = '';
  const sent: Call[] = [];
  let alive = true;
  const api = (url: string, init?: RequestInit): Response => {
    if (!alive) return new Response('{"error":"Couldn’t authenticate you"}', { status: 401 });
    const method = init?.method ?? 'GET';
    if (url.includes('/users/me.json')) return Response.json({ user: { id: 1, role: 'admin' } });
    if (method !== 'GET') {
      sent.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null });
      return Response.json(url.endsWith('/tickets.json') ? { ticket: { id: 301 } } : {});
    }
    return Response.json({});
  };
  beforeAll(async () => {
    env = await setup();
    ada = await login(env, 'acme', 'ada@demo.example');
    lena = await login(env, 'acme', 'lena@demo.example');
    env.fetchHolder.impl = async (url, init) => api(url, init);
    connId = (await ada.post('/api/connections/key', { provider: 'zendesk', values: { subdomain: 'acme', email: 'ada@demo.example', token: 'secret-token' } })).json.id;
  });

  it('creates a ticket and answers one, only for those who manage connections', async () => {
    const made = await ada.post(`/api/connections/${connId}/tickets`, { subject: 'Welcome call', requester: 'nora@cedarmoor.example', description: 'Shall we book the call?' });
    expect(made.status).toBe(201);
    expect(made.json).toEqual({ id: '301', url: 'https://acme.zendesk.com/agent/tickets/301' });
    const reply = await ada.post(`/api/connections/${connId}/tickets/301/reply`, { body: 'Booked for Tuesday', internal: false });
    expect(reply.status).toBe(200);
    expect(sent.map((s) => [s.method, s.url.replace('https://acme.zendesk.com', '')])).toEqual([['POST', '/api/v2/tickets.json'], ['PUT', '/api/v2/tickets/301.json']]);
    expect(sent[1].body).toEqual({ ticket: { comment: { body: 'Booked for Tuesday', public: true } } });
    expect((await lena.post(`/api/connections/${connId}/tickets/301/reply`, { body: 'x' })).status).toBe(403);
    expect((await ada.post(`/api/connections/${connId}/tickets`, { subject: 'No email', requester: 'nope' })).status).toBe(400);
  });

  it('a connection that lost its key shows as an error, and a new key for the same workspace brings it back', async () => {
    await env.db.system((q) => q.query(`update connections set status = 'error', last_error = 'Unauthorized' where id = $1`, [connId]));
    const shown = (await ada.get('/api/connections')).json.connections.find((c: any) => c.id === connId);
    expect(shown).toMatchObject({ status: 'error', lastError: 'Unauthorized' });
    const d = (await ada.get(`/api/connections/${connId}/sync`)).json.connection;
    expect(d).toMatchObject({ status: 'error', lastError: 'Unauthorized', reconnect: 'key', prefill: { subdomain: 'acme' } });
    // A key for some other Zendesk would be a second connection: refused, and nothing changes.
    const other = await ada.post('/api/connections/key', { provider: 'zendesk', values: { subdomain: 'other', email: 'ada@demo.example', token: 'k' }, reconnect: connId });
    expect(other.status).toBe(400);
    expect((await ada.get(`/api/connections/${connId}/sync`)).json.connection.status).toBe('error');
    const again = await ada.post('/api/connections/key', { provider: 'zendesk', values: { subdomain: 'acme', email: 'ada@demo.example', token: 'fresh-token' }, reconnect: connId });
    expect(again.status).toBe(201);
    expect(again.json.id).toBe(connId);
    expect((await ada.get(`/api/connections/${connId}/sync`)).json.connection).toMatchObject({ status: 'active', lastError: null });
  });

  it('a key that stops working marks the connection as needing a reconnect when it is read', async () => {
    await ada.put(`/api/connections/${connId}/sync`, { objects: [{ remote: 'tickets', label: 'Tickets', target: 'record', typeKey: '__new', kind: 'ticket', enabled: true, create: false, linkOnly: true, fields: [{ remote: 'subject', local: 'name', dir: 'pull' }] }] });
    alive = false;
    const run = await ada.post(`/api/connections/${connId}/sync/run`, {});
    expect(run.status).toBe(200);
    const d = (await ada.get(`/api/connections/${connId}/sync`)).json.connection;
    expect(d.status).toBe('error');
    expect(d.reconnect).toBe('key');
  });
});
