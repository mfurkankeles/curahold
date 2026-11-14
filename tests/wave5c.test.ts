// Wave-5C end to end: a Gmail mailbox whose mail lands on the matching customer
// as activities and whose reply is logged, and Segment events pushed to the
// signed inbound address becoming activities. Both match the customer by email,
// keep companies apart, and never attach the same message twice. Mirrors the
// end-to-end style of tests/sync.test.ts and tests/keyed-crm.test.ts.
import { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';
import { hmacHex } from '../api/src/lib/crypto';
import { segmentInboundRoutes } from '../api/src/routes/segment';
import type { AppEnv } from '../api/src/context';
import { BASE, Client, login, setup, type Env } from './helpers';

let env: Env;
let ada: Client;
let quillId: string;
let gmailId: string;

/** The matching customer gets a contact with this address; mail and events from it are attached to the customer. */
const PARTNER = 'buyer@quillfield.example';
const MAILBOX = 'sales@acme.example';

const header = (name: string, value: string) => ({ name, value });
function message(id: string, from: string, to: string, subject: string, snippet: string) {
  return { id, internalDate: String(Date.parse('2026-11-14T09:00:00Z')), snippet, payload: { headers: [header('From', from), header('To', to), header('Subject', subject), header('Date', 'Fri, 14 Nov 2026 09:00:00 +0000')] } };
}
const MESSAGES: Record<string, ReturnType<typeof message>> = {
  m1: message('m1', `Buyer <${PARTNER}>`, MAILBOX, 'Renewal question', 'When does our plan renew?'),
  m2: message('m2', MAILBOX, `Buyer <${PARTNER}>`, 'Re: Renewal question', 'It renews on 1 February.'),
  m3: message('m3', 'Stranger <stranger@nowhere.example>', MAILBOX, 'Unrelated', 'Hello there'),
};

const gmailStub = async (url: string, init?: RequestInit): Promise<Response> => {
  if (/oauth2\.googleapis\.com\/token/.test(url)) return Response.json({ access_token: 'a2', expires_in: 3600 });
  if (/\/users\/me\/profile/.test(url)) return Response.json({ emailAddress: MAILBOX });
  if (/\/users\/me\/messages\/send/.test(url)) {
    void init;
    return Response.json({ id: 'sent-1', threadId: 't1' });
  }
  const one = /\/users\/me\/messages\/(m\d)\?/.exec(url);
  if (one) return Response.json(MESSAGES[one[1]]);
  if (/\/users\/me\/messages\?/.test(url)) return Response.json({ messages: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }], nextPageToken: null });
  return new Response('no route', { status: 404 });
};

const gmailActivities = (orgId: string) =>
  env.db.system((q) => q.query<{ account_id: string; body: string; external_id: string; contact_ids: string[] }>(`select account_id, body, external_id, contact_ids from activities where org_id = $1 and source = 'gmail' order by external_id`, [orgId]));

beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
  env.fetchHolder.impl = gmailStub;
  // A contact at the customer with the partner's address, so mail and events from it find the customer.
  const contactType = (await ada.post('/api/record-types', { kind: 'contact' })).json.type;
  quillId = (await ada.get('/api/accounts?q=Quillfield')).json.accounts[0].id;
  await ada.post('/api/records', { typeId: contactType.id, accountId: quillId, fields: { first_name: 'Buyer', last_name: 'One', email: PARTNER } });
});

describe('a Gmail mailbox end to end', () => {
  it('is offered as a two-way source, signed in where Google is registered', async () => {
    const list = (await ada.get('/api/connections')).json.providers.filter((p: any) => p.kind === 'source');
    expect(list.find((p: any) => p.id === 'gmail')).toMatchObject({ twoWay: true, available: true, setup: 'oauth' });
    // Without a Microsoft app the same server still offers Outlook, connected with a token.
    expect(list.find((p: any) => p.id === 'outlook')).toMatchObject({ twoWay: true, available: true, setup: 'key' });
  });

  it('connects with an injected token, learning the mailbox address, and seals the token', async () => {
    const r = await ada.post('/api/connections/key', { provider: 'gmail', values: { refreshToken: 'r1', accessToken: 'a1' } });
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    gmailId = r.json.id;
    const d = (await ada.get(`/api/connections/${gmailId}/sync`)).json;
    expect(d.connection).toMatchObject({ provider: 'gmail', label: MAILBOX, mailbox: true, tabular: false });
    const [row] = await env.db.system((q) => q.query('select config::text as config, secret::text as secret from connections where id = $1', [gmailId]));
    expect(row.config).toContain(MAILBOX);
    expect(`${row.config} ${row.secret}`).not.toContain('"r1"');
  });

  it('first read attaches mail to the matching customer as activities, received and sent, and skips unmatched mail', async () => {
    const run = (await ada.post(`/api/connections/${gmailId}/sync/run`, { start: true })).json.run;
    expect(run.status, JSON.stringify(run.errors)).toBe('ok');
    expect(run.stats.messages.created).toBe(2);
    const acts = await gmailActivities(env.a.orgId);
    expect(acts.map((a) => a.external_id)).toEqual(['m1', 'm2']);
    expect(acts.every((a) => a.account_id === quillId)).toBe(true);
    expect(acts.find((a) => a.external_id === 'm1')!.body).toContain('Renewal question');
    expect(acts.find((a) => a.external_id === 'm2')!.body).toMatch(/^Sent to/);
  });

  it('a second read attaches nothing new (a message is never attached twice)', async () => {
    env.clock.now = new Date(Date.now() + 60_000);
    const run = (await ada.post(`/api/connections/${gmailId}/sync/run`, {})).json.run;
    expect(run.stats.messages?.created ?? 0).toBe(0);
    expect((await gmailActivities(env.a.orgId)).length).toBe(2);
    env.clock.now = null;
  });

  it('sends a reply from the mailbox and logs it as an outgoing activity', async () => {
    const r = await ada.post(`/api/connections/${gmailId}/mail/reply`, { accountId: quillId, to: PARTNER, subject: 'Re: Renewal question', body: 'Happy to help — it renews on 1 February.' });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json.id).toBe('sent-1');
    const acts = await gmailActivities(env.a.orgId);
    expect(acts.map((a) => a.external_id)).toContain('sent-1');
    expect(acts.find((a) => a.external_id === 'sent-1')!.body).toContain('Happy to help');
  });

  it('keeps companies apart: the other company sees none of these mailbox activities', async () => {
    const other = await gmailActivities(env.b.orgId);
    expect(other.length).toBe(0);
  });
});

describe('Segment events into the inbound address', () => {
  let secret: string;
  let sourceId: string;

  /** A minimal app that mounts the pre-auth inbound router with the company resolved, as the hub's app.ts hook does. */
  const inboundApp = (orgId: string) => {
    const app = new Hono<AppEnv>();
    app.use('*', async (c, next) => {
      c.set('deps', env.deps);
      c.set('org', { id: orgId } as any);
      await next();
    });
    app.route('/api', segmentInboundRoutes);
    return app;
  };
  const postEvent = async (app: ReturnType<typeof inboundApp>, src: string, event: Record<string, unknown>, signWith: string) => {
    const raw = JSON.stringify(event);
    const sig = await hmacHex(signWith, raw);
    const res = await app.request(`https://acme.${BASE}/api/inbound/segment/${src}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-signature': sig }, body: raw });
    return { status: res.status, json: (await res.json().catch(() => null)) as any };
  };
  const segmentActivities = (orgId: string) =>
    env.db.system((q) => q.query<{ external_id: string; account_id: string; contact_ids: string[] }>(`select external_id, account_id, contact_ids from activities where org_id = $1 and source like 'segment:%' order by external_id`, [orgId]));

  it('connects with a shared secret and shows the signed inbound address', async () => {
    secret = 'shared-secret-abcdef-123456';
    const r = await ada.post('/api/connections/key', { provider: 'segment', values: { signingSecret: secret } });
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    const d = (await ada.get(`/api/connections/${r.json.id}/sync`)).json;
    expect(d.connection).toMatchObject({ provider: 'segment', inbound: true });
    expect(d.connection.inboundUrl).toMatch(/\/api\/inbound\/segment\/[\w-]+$/);
    sourceId = d.connection.inboundUrl.split('/').pop();
    // Too short a secret is refused.
    expect((await ada.post('/api/connections/key', { provider: 'segment', values: { signingSecret: 'short' } })).status).toBeGreaterThanOrEqual(400);
  });

  it('verifies the signature, matches the customer by email, and attaches one activity per event', async () => {
    const app = inboundApp(env.a.orgId);
    const ok = await postEvent(app, sourceId, { type: 'identify', messageId: 'evt-1', traits: { email: PARTNER, name: 'Buyer One' }, timestamp: '2026-11-14T09:30:00Z' }, secret);
    expect(ok.status, JSON.stringify(ok.json)).toBe(200);
    expect(ok.json).toMatchObject({ ingested: 1, matched: 1 });
    const acts = await segmentActivities(env.a.orgId);
    expect(acts.map((a) => a.external_id)).toEqual(['evt-1']);
    expect(acts[0].account_id).toBe(quillId);
    expect(acts[0].contact_ids.length).toBe(1);
    // A track event for the same person is attached too.
    const track = await postEvent(app, sourceId, { type: 'track', event: 'Order Completed', messageId: 'evt-2', properties: { email: PARTNER } }, secret);
    expect(track.json).toMatchObject({ ingested: 1, matched: 1 });
  });

  it('ignores a redelivered event, and an event whose email matches no customer', async () => {
    const app = inboundApp(env.a.orgId);
    const again = await postEvent(app, sourceId, { type: 'identify', messageId: 'evt-1', traits: { email: PARTNER } }, secret);
    expect(again.json).toMatchObject({ ingested: 0, matched: 1 });
    const unmatched = await postEvent(app, sourceId, { type: 'identify', messageId: 'evt-3', traits: { email: 'nobody@elsewhere.example' } }, secret);
    expect(unmatched.json).toMatchObject({ ingested: 0, matched: 0 });
    expect((await segmentActivities(env.a.orgId)).map((a) => a.external_id)).toEqual(['evt-1', 'evt-2']);
  });

  it('rejects a bad signature and an unknown source, and keeps the source to its own company', async () => {
    const app = inboundApp(env.a.orgId);
    const badSig = await postEvent(app, sourceId, { type: 'identify', messageId: 'evt-9', traits: { email: PARTNER } }, 'wrong-secret');
    expect(badSig.status).toBe(401);
    const unknown = await postEvent(app, 'not-a-real-source-id', { type: 'identify', messageId: 'evt-9', traits: { email: PARTNER } }, secret);
    expect(unknown.status).toBe(404);
    // The other company cannot post to this company's source, even with the right secret.
    const crossOrg = await postEvent(inboundApp(env.b.orgId), sourceId, { type: 'identify', messageId: 'evt-9', traits: { email: PARTNER } }, secret);
    expect(crossOrg.status).toBe(404);
    expect((await segmentActivities(env.b.orgId)).length).toBe(0);
  });
});
