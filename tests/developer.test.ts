// The developer platform: personal API keys, signed webhooks, OAuth for apps
// and the AI-assistant connector (MCP). Every route acts as its owner, so
// the same access rules hold as in the app.
import { createHash, createHmac } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { deliverWebhooks } from '../api/src/lib/webhooks';
import { BASE, Client, login, setup, type Env } from './helpers';

let env: Env;
let ada: Client; // admin
let lena: Client; // member
let sofia: Client; // viewer

const URL_OF = (path: string) => `https://acme.${BASE}${path}`;
const bearer = (token: string, method = 'GET', path = '/api/me', body?: unknown) =>
  env.app.request(URL_OF(path), {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
  sofia = await login(env, 'acme', 'sofia@demo.example');
});

describe('API keys', () => {
  it('a read-only key reads as its owner and cannot write', async () => {
    const made = await lena.post('/api/dev/keys', { name: 'Reports', canWrite: false });
    expect(made.status).toBe(201);
    expect(made.json.token).toMatch(/^chk_/);
    const me = await bearer(made.json.token);
    expect(me.status).toBe(200);
    expect((await me.json()).user.email).toBe('lena@demo.example');
    const boards = (await lena.get('/api/boards')).json.boards;
    const write = await bearer(made.json.token, 'POST', '/api/tasks', { boardId: boards[0].id, title: 'From a script' });
    expect(write.status).toBe(403);
    expect((await write.json()).error).toBe('read_only_token');
  });

  it('a writing key can open tasks; a key cannot make more keys; revoking ends it', async () => {
    const { token, key } = (await lena.post('/api/dev/keys', { name: 'Zapier', canWrite: true })).json;
    const boards = (await lena.get('/api/boards')).json.boards;
    const made = await bearer(token, 'POST', '/api/tasks', { boardId: boards[0].id, title: 'From a script' });
    expect(made.status).toBe(201);
    expect((await bearer(token, 'POST', '/api/dev/keys', { name: 'more' })).status).toBe(403);
    expect((await lena.get('/api/dev/keys')).json.keys.map((k: any) => k.name)).toContain('Zapier');
    expect((await lena.del(`/api/dev/keys/${key.id}`)).status).toBe(200);
    expect((await bearer(token)).status).toBe(401);
  });

  it('a viewer cannot make a writing key, and keys of others stay private', async () => {
    expect((await sofia.post('/api/dev/keys', { name: 'x', canWrite: true })).status).toBe(403);
    expect((await sofia.get('/api/dev/keys')).json.keys).toEqual([]);
    const all = (await ada.get('/api/dev/keys?scope=all')).json.keys;
    expect(all.length).toBeGreaterThan(0);
  });

  it('an unknown token is turned away', async () => {
    expect((await bearer('chk_not-a-real-token-at-all')).status).toBe(401);
  });
});

describe('webhooks', () => {
  it('only public https addresses are accepted', async () => {
    for (const url of ['http://hooks.example.com/x', 'https://127.0.0.1/x', 'https://10.0.0.8/x', 'https://localhost/x']) {
      expect((await ada.post('/api/dev/webhooks', { url, events: ['task.created'] })).status).toBe(400);
    }
    expect((await lena.post('/api/dev/webhooks', { url: 'https://hooks.example.com/x', events: ['task.created'] })).status).toBe(403);
  });

  it('a change is delivered once, signed with the secret', async () => {
    const made = await ada.post('/api/dev/webhooks', { url: 'https://hooks.example.com/curahold', events: ['task.created', 'comment.created'] });
    expect(made.status).toBe(201);
    const secret: string = made.json.secret;
    expect(secret).toMatch(/^whsec_/);
    const got: { headers: Headers; body: string }[] = [];
    env.fetchHolder.impl = async (url, init) => {
      if (url === 'https://hooks.example.com/curahold') got.push({ headers: new Headers(init?.headers), body: String(init?.body) });
      return new Response('ok');
    };
    const boards = (await ada.get('/api/boards')).json.boards;
    const task = (await ada.post('/api/tasks', { boardId: boards[0].id, title: 'Webhook me' })).json.task;
    await env.settle();
    await deliverWebhooks(env.deps, 50);
    const mine = got.filter((g) => JSON.parse(g.body).data?.id === task.id);
    expect(mine).toHaveLength(1);
    const { headers, body } = mine[0];
    expect(headers.get('curahold-event')).toBe('task.created');
    const [, t, v1] = /^t=(\d+),v1=([0-9a-f]+)$/.exec(headers.get('curahold-signature')!)!;
    expect(v1).toBe(createHmac('sha256', secret).update(`${t}.${body}`).digest('hex'));
    expect(JSON.parse(body).data.title).toBe('Webhook me');
    // Already sent: nothing goes out twice.
    await deliverWebhooks(env.deps, 50);
    expect(got.filter((g) => JSON.parse(g.body).data?.id === task.id)).toHaveLength(1);
  });

  it('a failing receiver is retried later, and a test ping reports its answer', async () => {
    const hooks = (await ada.get('/api/dev/webhooks')).json.webhooks;
    env.fetchHolder.impl = async () => new Response('down', { status: 503 });
    const ping = await ada.post(`/api/dev/webhooks/${hooks[0].id}/test`);
    expect(ping.json).toEqual({ status: 503, ok: false });
    const boards = (await ada.get('/api/boards')).json.boards;
    await ada.post('/api/tasks', { boardId: boards[0].id, title: 'Retry me' });
    await env.settle();
    await deliverWebhooks(env.deps, 50);
    const [ev] = await env.db.system((q) => q.query(`select state, attempts, next_at > now() as later from webhook_events order by created_at desc limit 1`));
    expect(ev).toMatchObject({ state: 'pending', attempts: 1, later: true });
    expect((await ada.get('/api/dev/webhooks')).json.webhooks[0].lastStatus).toBe(503);
  });
});

describe('apps and AI assistants (OAuth + MCP)', () => {
  const redirect = 'https://assistant.example.com/callback';
  const verifier = 'a-long-random-verifier-string-for-pkce-0123456789';
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  let clientId = '';
  let access = '';
  let refresh = '';

  const form = (path: string, fields: Record<string, string>) =>
    env.app.request(URL_OF(path), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() });
  const rpc = (token: string | null, body: unknown) =>
    env.app.request(URL_OF('/mcp'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });

  it('an assistant without a token is told where to sign in', async () => {
    const res = await rpc(null, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain(`resource_metadata="https://acme.${BASE}/.well-known/oauth-protected-resource"`);
    const meta = await (await env.app.request(URL_OF('/.well-known/oauth-protected-resource'))).json();
    expect(meta.authorization_servers).toEqual([`https://acme.${BASE}`]);
    const as = await (await env.app.request(URL_OF('/.well-known/oauth-authorization-server'))).json();
    expect(as.code_challenge_methods_supported).toEqual(['S256']);
  });

  it('register → authorize → the person allows → tokens', async () => {
    const reg = await env.app.request(URL_OF('/oauth/register'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_name: 'Assistant', redirect_uris: [redirect] }),
    });
    expect(reg.status).toBe(201);
    clientId = (await reg.json()).client_id;
    const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz', scope: 'read write' });
    const auth = await env.app.request(URL_OF(`/oauth/authorize?${q}`));
    expect(auth.status).toBe(302);
    const consent = new URL(auth.headers.get('location')!, URL_OF('/'));
    expect(consent.pathname).toBe('/connect-ai');
    const req = consent.searchParams.get('req')!;
    const info = await lena.get(`/api/oauth/request?req=${encodeURIComponent(req)}`);
    expect(info.json).toMatchObject({ app: 'Assistant', redirectHost: 'assistant.example.com', write: true, canWrite: true });
    const ok = await lena.post('/api/oauth/approve', { req, allow: true, write: true });
    const back = new URL(ok.json.redirect);
    expect(back.origin + back.pathname).toBe(redirect);
    expect(back.searchParams.get('state')).toBe('xyz');
    const code = back.searchParams.get('code')!;
    // A wrong verifier gets nothing; the right one gets tokens, once.
    expect((await form('/oauth/token', { grant_type: 'authorization_code', code, client_id: clientId, redirect_uri: redirect, code_verifier: 'wrong' })).status).toBe(400);
    const again = await lena.post('/api/oauth/approve', { req, allow: true, write: true });
    const code2 = new URL(again.json.redirect).searchParams.get('code')!;
    const tok = await form('/oauth/token', { grant_type: 'authorization_code', code: code2, client_id: clientId, redirect_uri: redirect, code_verifier: verifier });
    expect(tok.status).toBe(200);
    const t = await tok.json();
    expect(t.access_token).toMatch(/^cha_/);
    expect(t.refresh_token).toMatch(/^chr_/);
    access = t.access_token;
    refresh = t.refresh_token;
    expect((await form('/oauth/token', { grant_type: 'authorization_code', code: code2, client_id: clientId, redirect_uri: redirect, code_verifier: verifier })).status).toBe(400);
  });

  it('declining sends the app away with access_denied', async () => {
    const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256' });
    const req = new URL((await env.app.request(URL_OF(`/oauth/authorize?${q}`))).headers.get('location')!, URL_OF('/')).searchParams.get('req')!;
    const no = await lena.post('/api/oauth/approve', { req, allow: false });
    expect(new URL(no.json.redirect).searchParams.get('error')).toBe('access_denied');
  });

  it('the assistant sees the tools and works as the person', async () => {
    const init = await (await rpc(access, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })).json();
    expect(init.result.serverInfo.name).toBe('curahold');
    const tools = (await (await rpc(access, { jsonrpc: '2.0', id: 2, method: 'tools/list' })).json()).result.tools.map((t: any) => t.name);
    expect(tools).toEqual(expect.arrayContaining(['search', 'fetch', 'list_accounts', 'list_tasks', 'portfolio_summary', 'create_task', 'update_task']));

    const call = async (name: string, args: Record<string, unknown> = {}) => (await (await rpc(access, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name, arguments: args } })).json()).result;
    const found = await call('search', { query: 'Cedarmoor' });
    expect(found.structuredContent.results[0]).toMatchObject({ id: expect.stringMatching(/^account:/), title: 'Cedarmoor Health' });
    const acc = await call('fetch', { id: found.structuredContent.results[0].id });
    expect(acc.structuredContent.account.name).toBe('Cedarmoor Health');

    const made = await call('create_task', { title: 'Send the renewal deck', account: 'Cedarmoor Health', due_date: '2030-01-15', assignees: ['zeynep@demo.example'], priority: 'high' });
    expect(made.isError).toBe(false);
    const task = made.structuredContent.task;
    expect(task).toMatchObject({ title: 'Send the renewal deck', dueDate: '2030-01-15', priority: 'high' });
    const seen = (await lena.get(`/api/tasks/${task.id}`)).json.task;
    expect(seen.createdBy).toBe((await lena.get('/api/me')).json.user.id);

    const done = await call('update_task', { task_id: task.id, status: 'done', comment: 'Sent.' });
    expect(done.structuredContent.task.status).toBe('done');
    expect(done.structuredContent.comment.body).toBe('Sent.');

    const summary = await call('portfolio_summary');
    expect(summary.structuredContent.cards.length).toBeGreaterThan(0);
    const unknown = await call('create_task', { title: 'x', board: 'No such board' });
    expect(unknown.isError).toBe(true);
  });

  it('refreshing rotates the tokens, and a read-only connection gets read tools only', async () => {
    const r = await form('/oauth/token', { grant_type: 'refresh_token', refresh_token: refresh, client_id: clientId });
    expect(r.status).toBe(200);
    const next = await r.json();
    expect(next.access_token).not.toBe(access);
    expect((await rpc(access, { jsonrpc: '2.0', id: 1, method: 'ping' })).status).toBe(401);
    expect((await form('/oauth/token', { grant_type: 'refresh_token', refresh_token: refresh, client_id: clientId })).status).toBe(400);

    const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256' });
    const req = new URL((await env.app.request(URL_OF(`/oauth/authorize?${q}`))).headers.get('location')!, URL_OF('/')).searchParams.get('req')!;
    const code = new URL((await sofia.post('/api/oauth/approve', { req, allow: true, write: true })).json.redirect).searchParams.get('code')!;
    const ro = await (await form('/oauth/token', { grant_type: 'authorization_code', code, client_id: clientId, redirect_uri: redirect, code_verifier: verifier })).json();
    expect(ro.scope).toBe('read'); // a viewer's connection never writes
    const tools = (await (await rpc(ro.access_token, { jsonrpc: '2.0', id: 2, method: 'tools/list' })).json()).result.tools.map((t: any) => t.name);
    expect(tools).not.toContain('create_task');
  });
});
