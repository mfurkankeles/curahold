// Curahold's own integration surfaces run the way a customer's administrator sets them up, timed: the BI feed
// (analytics key → OData service document → first rows → replace secret → revoke), the public API (key →
// read → write → revoke), webhooks (endpoint → test ping → a signed event → a receiver that is down is
// retried → remove) and Segment's pushed events (secret → inbound address → signed batch → refusal → remove). MCP/OAuth, SSO, the mail relay and the Zapier/Make apps have their own end-to-end tests
// (developer, sso, smtp-relay, integrations); this file is the onboarding view of the three above.
import { createHmac } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { deliverWebhooks } from '../api/src/lib/webhooks';
import { BASE, Client, login, setup, type Env } from './helpers';

let env: Env;
let ada: Client;
const timings: Record<string, { connectedMs: number; firstDataMs: number }> = {};
const raw = (path: string, headers: Record<string, string>, method = 'GET', body?: unknown) =>
  env.app.request(`https://acme.${BASE}${path}`, { method, headers: { ...headers, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });

beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
});

describe("Curahold's own surfaces, customer-style", () => {
  it('BI feed: key, service document, first rows, replace secret, revoke', async () => {
    const t0 = Date.now();
    const made = await ada.post('/api/dev/analytics/keys', { name: 'Power BI sales dashboard' });
    expect(made.status).toBe(201);
    const basic = (k: string) => ({ authorization: `Basic ${btoa(`powerbi:${k}`)}` });
    const doc = await raw('/api/analytics/odata/', basic(made.json.token));
    expect(doc.status).toBe(200);
    const connectedMs = Date.now() - t0;
    const rows = await raw('/api/analytics/odata/Customers', basic(made.json.token));
    expect(rows.status).toBe(200);
    expect(((await rows.json()) as any).value.length).toBeGreaterThan(0);
    timings.bi = { connectedMs, firstDataMs: Date.now() - t0 };
    const id = (await ada.get('/api/dev/analytics/keys')).json.keys.find((k: any) => k.name === 'Power BI sales dashboard').id;
    const rotated = await ada.post(`/api/dev/analytics/keys/${id}/rotate`);
    expect((await raw('/api/analytics/odata/', basic(made.json.token))).status).toBe(401);
    expect((await raw('/api/analytics/odata/', basic(rotated.json.token))).status).toBe(200);
    expect((await ada.del(`/api/dev/analytics/keys/${id}`)).status).toBe(200);
    expect((await raw('/api/analytics/odata/', basic(rotated.json.token))).status).toBe(401);
  });

  it('public API: key, a read, a write, revoke', async () => {
    const t0 = Date.now();
    const made = await ada.post('/api/dev/keys', { name: 'Nightly import', canWrite: true });
    expect(made.status).toBe(201);
    const bearer = { authorization: `Bearer ${made.json.token}` };
    const boards = await raw('/api/boards', bearer);
    expect(boards.status).toBe(200);
    const connectedMs = Date.now() - t0;
    const board = ((await boards.json()) as any).boards[0];
    const task = await raw('/api/tasks', bearer, 'POST', { boardId: board.id, title: 'Made by the nightly import' });
    expect(task.status).toBe(201);
    timings.api = { connectedMs, firstDataMs: Date.now() - t0 };
    const id = made.json.key?.id ?? (await ada.get('/api/dev/keys')).json.keys.find((k: any) => k.name === 'Nightly import').id;
    expect((await ada.del(`/api/dev/keys/${id}`)).status).toBe(200);
    expect((await raw('/api/boards', bearer)).status).toBe(401);
  });

  it('webhooks: endpoint, test ping, a signed event, a receiver that is down, remove', async () => {
    const t0 = Date.now();
    const got: { headers: Headers; body: string }[] = [];
    let down = false;
    env.fetchHolder.impl = async (url, init) => {
      if (url !== 'https://hooks.quillfield.example/curahold') return new Response('no', { status: 404 });
      if (down) return new Response('down', { status: 503 });
      got.push({ headers: new Headers(init?.headers), body: String(init?.body) });
      return new Response('ok');
    };
    const made = await ada.post('/api/dev/webhooks', { url: 'https://hooks.quillfield.example/curahold', events: ['task.created'] });
    expect(made.status).toBe(201);
    const ping = await ada.post(`/api/dev/webhooks/${made.json.webhook?.id ?? (await ada.get('/api/dev/webhooks')).json.webhooks[0].id}/test`);
    expect(ping.json).toMatchObject({ ok: true });
    const connectedMs = Date.now() - t0;
    const boards = (await ada.get('/api/boards')).json.boards;
    const task = (await ada.post('/api/tasks', { boardId: boards[0].id, title: 'Tell the receiver' })).json.task;
    await env.settle();
    await deliverWebhooks(env.deps, 50);
    const mine = got.filter((g) => g.body.includes(task.id));
    expect(mine).toHaveLength(1);
    const [, t, v1] = /^t=(\d+),v1=([0-9a-f]+)$/.exec(mine[0].headers.get('curahold-signature')!)!;
    expect(v1).toBe(createHmac('sha256', made.json.secret).update(`${t}.${mine[0].body}`).digest('hex'));
    timings.webhooks = { connectedMs, firstDataMs: Date.now() - t0 };
    down = true;
    await ada.post('/api/tasks', { boardId: boards[0].id, title: 'Receiver is down' });
    await env.settle();
    await deliverWebhooks(env.deps, 50);
    const hooks = (await ada.get('/api/dev/webhooks')).json.webhooks;
    expect(hooks[0].lastStatus).toBe(503);
    expect((await ada.del(`/api/dev/webhooks/${hooks[0].id}`)).status).toBe(200);
    expect((await ada.get('/api/dev/webhooks')).json.webhooks).toHaveLength(0);
  });

  it('Segment (events pushed to us): secret, inbound address, a signed batch lands on the customer, a bad signature is refused, disconnect', async () => {
    const t0 = Date.now();
    const secret = 'seg-shared-secret-0123456789';
    const made = await ada.post('/api/connections/key', { provider: 'segment', values: { signingSecret: secret } });
    expect(made.status).toBe(201);
    const inbound: string = (await ada.get(`/api/connections/${made.json.id}/sync`)).json.connection.inboundUrl;
    expect(inbound).toMatch(/\/api\/inbound\/segment\/[\w-]+$/);
    const connectedMs = Date.now() - t0;
    const send = (payload: unknown, key = secret) => {
      const body = JSON.stringify(payload);
      return env.app.request(inbound, { method: 'POST', headers: { 'content-type': 'application/json', 'x-signature': createHmac('sha256', key).update(body).digest('hex') }, body });
    };
    const event = { type: 'track', event: 'Report exported', messageId: 'seg-msg-1', properties: { email: 'buyer@quillfield.example' }, timestamp: new Date().toISOString() };
    expect((await send(event)).status).toBeLessThan(300);
    const acc = ((await ada.get('/api/accounts?q=Quillfield')).json.accounts as any[]).find((a) => a.name === 'Quillfield Retail');
    const tl = (await ada.get(`/api/accounts/${acc.id}/timeline`)).json.items as any[];
    expect(JSON.stringify(tl)).toContain('Report exported');
    timings.segment = { connectedMs, firstDataMs: Date.now() - t0 };
    expect((await send({ ...event, messageId: 'seg-msg-2' }, 'wrong-secret-0000000000')).status).toBe(401);
    expect((await ada.del(`/api/connections/${made.json.id}`)).status).toBe(200);
    expect((await send({ ...event, messageId: 'seg-msg-3' })).status).toBe(404);
    console.log(`[own-surfaces] ${JSON.stringify(timings)}`);
  });
});
