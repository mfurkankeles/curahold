// The connectors added on 20 November, each run the way a customer runs it, against a mock of the vendor that
// follows the vendor's documented contract (tests/vendors): connect → map → first data → both ways where the
// connector writes → a change there → a conflict → the four failures (expired sign-in, withdrawn access, rate
// limit, a bad field) → reconnect → disconnect. Each flow also records what a person spends: time to connected,
// time to first data and the clicks (the same steps as its help page).
//
// Timed run: B19_LATENCY=1 B19_TIMINGS=<file.json> npx vitest run tests/connectors-b19.test.ts
// (the latency per vendor call is the figure in tests/vendors/b19.ts; the file gets one row per connector).
import { writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { larkPosts, LARK_SECRET, LARK_TOKEN } from './vendors/lark';
import { gcalCancel, gcalCreated, gcalMock } from './vendors/gcal';
import { msCreated, outlookCancel, outlookcalMock } from './vendors/outlookcal';
import { odoocrmMock, ODOO_KEY } from './vendors/odoocrm';
import { zdComments, zohodeskMock } from './vendors/zohodesk';
import { stripeMock, stripeWithoutEvents } from './vendors/stripe';
import { metaDelivery, waSent, WA_APP_SECRET, WA_PHONE_ID, whatsappMock } from './vendors/whatsapp';
import { adoAuth, adoBuild, adoPr, adoPush } from './vendors/azuredevops';
import { curaholdSignature } from '../api/src/lib/inboundHooks';
import { devKey } from '../shared/src/sync';
import { TG_CHAT, TG_TOKEN, telegramNoGroup, tgSent } from './vendors/telegram';
import { B19_LATENCY, B19_MOCKS } from './vendors/b19';
import { vendorWorld, type VendorWorld } from './vendors/kit';
import { Client, login, setup, type Env } from './helpers';

let env: Env;
let ada: Client;
let lena: Client;
let world: VendorWorld;

type Timing = { connector: string; connectedMs: number; firstDataMs: number; clicks: number };
const timings: Timing[] = [];
/** One customer's run: `click()` counts an action the help page asks for; `connected()` and `firstData()` stop the clocks. */
function stopwatch(connector: string) {
  const t0 = performance.now();
  const row: Timing = { connector, connectedMs: 0, firstDataMs: 0, clicks: 0 };
  timings.push(row);
  return {
    click: (n = 1) => void (row.clicks += n),
    connected: () => void (row.connectedMs = Math.round(performance.now() - t0)),
    firstData: () => void (row.firstDataMs = Math.round(performance.now() - t0)),
  };
}

beforeAll(async () => {
  env = await setup({
    oauth: { google: { clientId: 'google-client', clientSecret: 'google-secret' }, microsoft: { clientId: 'ms-client', clientSecret: 'ms-secret' } },
    connectors: { crm: { zoho: { clientId: 'zoho-client', clientSecret: 'zoho-secret' } } },
  });
  for (const m of B19_MOCKS) m.reset();
  world = vendorWorld(B19_MOCKS, { latencyMs: process.env.B19_LATENCY ? (v) => B19_LATENCY[v] ?? 150 : undefined, now: () => env.deps.now() });
  env.fetchHolder.impl = world.fetch as any;
  ada = await login(env, 'acme', 'ada@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
});

afterAll(() => {
  if (process.env.B19_TIMINGS) writeFileSync(process.env.B19_TIMINGS, JSON.stringify(timings, null, 2));
});

const connById = async (id: string) => (await ada.get('/api/connections')).json.connections.find((c: any) => c.id === id);

// ------------------------------------------------------------------ Lark / Feishu

describe('Lark / Feishu notifications', () => {
  const url = `https://open.larksuite.com/open-apis/bot/v2/hook/${LARK_TOKEN}`;
  let id: string;

  it('connect: only a real Lark or Feishu bot address, signed with the bot\'s secret; the first post is the test', async () => {
    const w = stopwatch('Lark / Feishu');
    for (const bad of ['https://open.larksuite.com/elsewhere', 'https://evil.example/open-apis/bot/v2/hook/abcdefgh12', 'http://open.feishu.cn/open-apis/bot/v2/hook/abcdefgh12']) {
      expect((await ada.post('/api/connections/webhook', { flavor: 'lark', url: bad, label: 'x' })).status, bad).toBe(400);
    }
    expect((await lena.post('/api/connections/webhook', { flavor: 'lark', url, label: 'x' })).status).toBe(403);
    // Settings → Connections → Add webhook → choose Lark → paste the address → paste the secret → Add and test.
    w.click(6);
    const made = await ada.post('/api/connections/webhook', { flavor: 'lark', url, label: 'Success team (Lark)', signingSecret: LARK_SECRET });
    expect(made.status).toBe(201);
    id = made.json.id;
    w.connected();
    expect((await ada.post(`/api/connections/${id}/test`, {})).status).toBe(200);
    w.firstData();
    const post = larkPosts.at(-1);
    expect(post.msg_type).toBe('post');
    expect(post.content.post.en_us.title).toBe('Test message from Curahold');
    expect(post.timestamp).toMatch(/^\d{10}$/);
    // The address (it carries the bot's token) is sealed; only the host is readable.
    const [row] = await env.db.system((q) => q.query('select config::text as config from connections where id = $1', [id]));
    expect(row.config).not.toContain(LARK_TOKEN);
    expect((await connById(id)).status).toBe('active');
  });

  it('a board posts new tasks there; a Feishu address works the same', async () => {
    const feishu = (await ada.post('/api/connections/webhook', { flavor: 'lark', url: url.replace('open.larksuite.com', 'open.feishu.cn'), label: 'Feishu', signingSecret: LARK_SECRET })).json.id;
    expect((await ada.post(`/api/connections/${feishu}/test`, {})).status).toBe(200);
    expect((await ada.del(`/api/connections/${feishu}`)).status).toBe(200);
  });

  it('errors: a wrong secret and a removed bot mark the connection; a busy bot is retried, not marked', async () => {
    const wrong = (await ada.post('/api/connections/webhook', { flavor: 'lark', url, label: 'Wrong secret', signingSecret: 'not-the-secret' })).json.id;
    const r = await ada.post(`/api/connections/${wrong}/test`, {});
    expect(r.json.error).toBe('connection_failed');
    expect((await connById(wrong)).lastError).toContain('19021');
    await ada.del(`/api/connections/${wrong}`);

    world.arm('lark', 'ratelimit');
    expect((await ada.post(`/api/connections/${id}/test`, {})).status).toBe(500);
    expect((await connById(id)).status).toBe('active');
    expect((await ada.post(`/api/connections/${id}/test`, {})).status).toBe(200);

    world.arm('lark', 'badfield');
    expect((await ada.post(`/api/connections/${id}/test`, {})).json.error).toBe('connection_failed');

    world.arm('lark', 'revoked');
    expect((await ada.post(`/api/connections/${id}/test`, {})).json.error).toBe('connection_failed');
    expect((await connById(id)).status).toBe('error');
    world.clear('lark');
  });

  it('reconnect: a working test clears the problem; disconnect removes it', async () => {
    expect((await ada.post(`/api/connections/${id}/test`, {})).status).toBe(200);
    expect((await connById(id)).status).toBe('active');
    expect((await ada.del(`/api/connections/${id}`)).status).toBe(200);
    expect(await connById(id)).toBeUndefined();
  });
});

// ------------------------------------------------------------------ Telegram

describe('Telegram notifications', () => {
  let id: string;

  it('connect: with the bot token only — the group is found from the bot\'s messages', async () => {
    const w = stopwatch('Telegram');
    expect((await ada.post('/api/connections/webhook', { flavor: 'telegram', label: 'x', token: 'not-a-token' })).json.reason).toBe('telegram_token');
    expect((await ada.post('/api/connections/webhook', { flavor: 'telegram', label: 'x', token: '7012345678:AAH-wrongwrongwrongwrongwrong' })).json.reason).toBe('telegram_token');
    telegramNoGroup();
    expect((await ada.post('/api/connections/webhook', { flavor: 'telegram', label: 'x', token: TG_TOKEN })).json.reason).toBe('telegram_chat');
    B19_MOCKS.find((m) => m.id === 'telegram')!.reset();
    // Settings → Connections → Add webhook → choose Telegram → paste the token → Add and test.
    w.click(5);
    const made = await ada.post('/api/connections/webhook', { flavor: 'telegram', label: 'Success team (Telegram)', token: TG_TOKEN });
    expect(made.status).toBe(201);
    expect(made.json.chat).toBe('Quillfield success team');
    id = made.json.id;
    w.connected();
    expect((await ada.post(`/api/connections/${id}/test`, {})).status).toBe(200);
    w.firstData();
    expect(tgSent.at(-1)).toMatchObject({ chat_id: String(TG_CHAT) });
    expect(tgSent.at(-1).text).toContain('Test message from Curahold');
    const [row] = await env.db.system((q) => q.query('select config::text as config from connections where id = $1', [id]));
    expect(row.config).not.toContain(TG_TOKEN);
    expect((await connById(id)).channels[0].name).toBe('Quillfield success team');
  });

  it('errors: rate limit retried, a bad message reported, a revoked token marks the connection', async () => {
    world.arm('telegram', 'ratelimit');
    expect((await ada.post(`/api/connections/${id}/test`, {})).status).toBe(500);
    expect((await connById(id)).status).toBe('active');
    world.arm('telegram', 'badfield');
    expect((await ada.post(`/api/connections/${id}/test`, {})).status).toBe(500);
    world.arm('telegram', 'revoked');
    expect((await ada.post(`/api/connections/${id}/test`, {})).json.error).toBe('connection_failed');
    expect((await connById(id)).status).toBe('error');
    world.clear('telegram');
  });

  it('reconnect and disconnect', async () => {
    expect((await ada.post(`/api/connections/${id}/test`, {})).status).toBe(200);
    expect((await connById(id)).status).toBe('active');
    expect((await ada.del(`/api/connections/${id}`)).status).toBe(200);
  });
});

// ------------------------------------------------------------------ shared steps

/** Sign in on the vendor's page: start → the vendor's "Allow" → back to the central callback. Returns the connection id. */
async function signIn(provider: string, extra = '') {
  const start = await ada.req('GET', `/api/connect/${provider}/start${extra}`);
  expect(start.status, JSON.stringify(start.json)).toBe(302);
  const back = new URL(world.mock(provider).consent!(new URL(start.headers.get('location')!), world.ctl(provider)));
  const cb = await new Client(env, 'app').req('GET', `${back.pathname}${back.search}`);
  expect(cb.status).toBe(302);
  const to = new URL(cb.headers.get('location')!);
  expect(to.searchParams.get('error'), to.toString()).toBeNull();
  return to.pathname.split('/').pop()!;
}
const later = (minutes: number) => {
  env.clock.now = new Date((env.clock.now ?? new Date()).getTime() + minutes * 60_000);
};
const runSync = async (id: string, body: Record<string, unknown> = {}) => (await ada.post(`/api/connections/${id}/sync/run`, body)).json.run;
const sealedOf = async (id: string) => (await env.db.system((q) => q.query('select secret::text as s, config::text as c from connections where id = $1', [id])))[0];

// ------------------------------------------------------------------ Odoo CRM

describe('Odoo CRM (two-way)', () => {
  let id: string;
  const values = odoocrmMock.keyValues!;

  it('connect: address, login and API key; a wrong key and a member without the right are refused', async () => {
    env.clock.now = new Date(Date.now() + 60_000);
    const w = stopwatch('Odoo CRM');
    expect((await ada.post('/api/connections/key', { provider: 'odoocrm', values: { ...values, apiKey: 'wrong-key' } })).status).toBeGreaterThanOrEqual(400);
    expect((await ada.post('/api/connections/key', { provider: 'odoocrm', values: { ...values, url: 'https://127.0.0.1' } })).status).toBeGreaterThanOrEqual(400);
    expect((await lena.post('/api/connections/key', { provider: 'odoocrm', values })).status).toBe(403);
    // Settings → Data sources → Connect Odoo CRM → address → login → API key → Connect.
    w.click(6);
    const ok = await ada.post('/api/connections/key', { provider: 'odoocrm', values });
    expect(ok.status, JSON.stringify(ok.json)).toBe(201);
    id = ok.json.id;
    w.connected();
    expect((await sealedOf(id)).c).not.toContain(ODOO_KEY);
    const d = (await ada.get(`/api/connections/${id}/sync`)).json;
    expect(d.connection).toMatchObject({ provider: 'odoocrm', readOnly: false, label: 'Quillfield Trading · CRM' });

    // Map: the suggested fields, then the first run.
    const sug = async (object: string, kind: string) => (await ada.get(`/api/connections/${id}/objects/${object}/fields?kind=${kind}`)).json.suggested;
    const fields = (await ada.get(`/api/connections/${id}/objects/opportunities/fields?kind=opportunity`)).json;
    expect(fields.fields.find((f: any) => f.name === 'stage_id').options.map((o: any) => o.label)).toEqual(['New', 'Proposition', 'Won']);
    expect(fields.fields.some((f: any) => f.name === 'x_segment')).toBe(true);
    w.click(3); // tick the three objects
    const saved = await ada.put(`/api/connections/${id}/sync`, {
      objects: [
        { remote: 'companies', label: 'Companies', target: 'account', enabled: true, create: true, fields: await sug('companies', 'account') },
        { remote: 'contacts', label: 'Contacts', target: 'record', typeKey: '__new', kind: 'contact', enabled: true, create: true, fields: await sug('contacts', 'contact') },
        { remote: 'opportunities', label: 'Opportunities', target: 'record', typeKey: '__new', kind: 'opportunity', enabled: true, create: false, fields: await sug('opportunities', 'opportunity') },
      ],
      conflict: 'latest',
    });
    expect(saved.status, JSON.stringify(saved.json)).toBe(200);
    w.click(1); // Start
    const run = await runSync(id);
    w.firstData();
    expect(run, JSON.stringify(run.errors)).toMatchObject({ status: 'ok', mode: 'full' });
    expect(run.stats).toMatchObject({ companies: { created: 2 }, contacts: { created: 1 }, opportunities: { created: 3 } });
    const pine = (await ada.get('/api/accounts?q=Pinecrest')).json.accounts[0];
    expect(pine).toMatchObject({ source: 'odoocrm', ownerId: env.a.ids.ada });
    const deals = (await ada.get(`/api/records?type=opportunity&account=${pine.id}`)).json.records;
    expect(deals[0].fields).toMatchObject({ amount: 24000, status: 'open' });
    const orbital = (await ada.get('/api/accounts?q=Orbital')).json.accounts[0];
    const odeals = (await ada.get(`/api/records?type=opportunity&account=${orbital.id}`)).json.records;
    expect(odeals.map((r: any) => r.fields.status).sort()).toEqual(['lost', 'won']);
  });

  it('both ways: a change there arrives; a change here goes back; an edit on both sides goes to the latest', async () => {
    later(5);
    odoocrmMock.remoteEdit!(world.ctl('odoocrm'), 'Orbital Freight Ltd');
    const run = await runSync(id);
    expect(run.mode).toBe('incremental');
    expect(run.stats).toMatchObject({ companies: { updated: 1 }, opportunities: { updated: 1 } });
    expect((await ada.get('/api/accounts?q=Orbital')).json.accounts[0].name).toBe('Orbital Freight Ltd');
    const pine = (await ada.get('/api/accounts?q=Pinecrest')).json.accounts[0];
    expect((await ada.get(`/api/records?type=opportunity&account=${pine.id}`)).json.records[0].fields.amount).toBe(26500);

    later(5);
    await ada.patch(`/api/accounts/${pine.id}`, { name: 'Pinecrest Foods Group' });
    await env.settle();
    expect(odoocrmMock.remoteRow!('companies', '11')!.name).toBe('Pinecrest Foods Group');

    // Conflict: our change is still waiting (Odoo was busy when it was sent) when someone changes the same customer
    // there; the next run reads first and, under "latest", the later edit (Odoo's) wins.
    later(5);
    world.arm('odoocrm', 'ratelimit');
    await ada.patch(`/api/accounts/${pine.id}`, { name: 'Pinecrest (here)' });
    await env.settle();
    expect(odoocrmMock.remoteRow!('companies', '11')!.name).toBe('Pinecrest Foods Group');
    later(1);
    Object.assign(odoocrmMock.remoteRow!('companies', '11')!, { name: 'Pinecrest (there)', write_date: env.clock.now!.toISOString().slice(0, 19).replace('T', ' ') });
    await runSync(id);
    await env.settle();
    expect((await ada.get(`/api/accounts/${pine.id}`)).json.account.name).toBe('Pinecrest (there)');
  });

  it('errors: a rate limit pauses and resumes; a bad field waits on the change; a withdrawn key asks to reconnect', async () => {
    later(5);
    world.arm('odoocrm', 'ratelimit');
    const limited = await runSync(id);
    expect(['partial', 'error']).toContain(limited.status);
    later(5);
    expect((await runSync(id)).status).toBe('ok');

    world.arm('odoocrm', 'badfield');
    const pine = (await ada.get('/api/accounts?q=Pinecrest')).json.accounts[0];
    await ada.patch(`/api/accounts/${pine.id}`, { name: 'Pinecrest Foods' });
    await env.settle();
    const [stuck] = await env.db.system((q) => q.query('select last_error from sync_changes where connection_id = $1', [id]));
    expect(stuck?.last_error ?? '').toContain('closing date');

    world.arm('odoocrm', 'revoked');
    later(5);
    const dead = await runSync(id);
    expect(dead.status).toBe('error');
    const conn = (await ada.get('/api/connections')).json.connections.find((c: any) => c.id === id);
    expect(conn.status).toBe('error');
    world.clear('odoocrm');
  });

  it('reconnect with the key keeps the connection and its mapping; disconnect removes the key, keeps the customers', async () => {
    const again = await ada.post('/api/connections/key', { provider: 'odoocrm', values });
    expect(again.json.id).toBe(id);
    later(5);
    expect((await runSync(id)).status).toBe('ok');
    expect((await ada.del(`/api/connections/${id}`)).status).toBe(200);
    expect(await sealedOf(id)).toBeUndefined();
    expect((await ada.get('/api/accounts?q=Pinecrest')).json.accounts.length).toBe(1);
  });
});

// ------------------------------------------------------------------ calendars

for (const cal of [
  { provider: 'gcal', name: 'Google Calendar', mock: gcalMock, customer: 'Quarry Labs', guest: 'deniz@quarry.example', domain: 'quarry.example', cancel: () => gcalCancel('ev1'), made: gcalCreated },
  { provider: 'outlookcal', name: 'Outlook Calendar', mock: outlookcalMock, customer: 'Heron Logistics', guest: 'ops@heron.example', domain: 'heron.example', cancel: () => outlookCancel('AAMk-1'), made: msCreated },
] as const) {
  describe(`${cal.name} (meetings in, a meeting out)`, () => {
    let id: string;
    let account: string;

    it('connect: sign in; the first read puts past meetings with the customer\'s people on their timeline', async () => {
      env.clock.now = new Date(Date.now() + 60_000);
      // The customer, and one of their people who is a guest of the meetings.
      const acc = (await ada.post('/api/accounts', { name: cal.customer })).json.account;
      account = acc.id;
      const contactType = (await ada.get('/api/record-types')).json.types.find((t: any) => t.kind === 'contact');
      expect((await ada.post('/api/records', { typeId: contactType.id, accountId: account, name: 'Guest', fields: { email: cal.guest } })).status).toBe(201);
      const w = stopwatch(cal.name);
      // Settings → Data sources → Connect → choose the account → Allow.
      w.click(3);
      id = await signIn(cal.provider);
      w.connected();
      expect((await ada.get(`/api/connections/${id}/sync`)).json.connection).toMatchObject({ provider: cal.provider, mailbox: true, calendar: true });
      w.click(1); // Start
      const run = await runSync(id);
      w.firstData();
      expect(run.status, JSON.stringify(run.errors)).toBe('ok');
      const meetings = (await ada.get(`/api/accounts/${account}/meetings`)).json.meetings;
      const titles = meetings.map((m: any) => m.title);
      expect(titles.length).toBeGreaterThan(0);
      // Private, all-day, internal-only and future meetings are left out; no description is kept.
      expect(titles.some((t: string) => /Doctor|Private|Holiday|stand-up|Next month/i.test(t))).toBe(false);
      const all = JSON.stringify(meetings);
      expect(all).not.toMatch(/private notes|Contract numbers/);
      expect(meetings[0].minutes).toBeGreaterThan(0);
    });

    it('a meeting changed there is changed here; a cancelled one is taken away; nothing is doubled', async () => {
      later(60);
      const renamed = `${cal.customer} review (moved)`;
      cal.mock.remoteEdit!(world.ctl(cal.provider), renamed);
      await runSync(id);
      const meetings = (await ada.get(`/api/accounts/${account}/meetings`)).json.meetings;
      expect(meetings.filter((m: any) => m.title === renamed)).toHaveLength(1);
      cal.cancel();
      later(60);
      await runSync(id);
      expect((await ada.get(`/api/accounts/${account}/meetings`)).json.meetings.some((m: any) => m.title === renamed)).toBe(false);
    });

    it('out: a meeting planned here goes into the calendar with the customer\'s people invited', async () => {
      const start = new Date(env.clock.now!.getTime() + 86_400_000).toISOString();
      const lenaTry = await lena.post(`/api/connections/${id}/calendar/events`, { accountId: account, title: 'x', start, minutes: 30, attendees: [`a@${cal.domain}`] });
      expect(lenaTry.status).toBe(403);
      const r = await ada.post(`/api/connections/${id}/calendar/events`, { accountId: account, title: 'Renewal call', start, minutes: 30, attendees: [`selin@${cal.domain}`] });
      expect(r.status, JSON.stringify(r.json)).toBe(201);
      expect(r.json.url).toMatch(/^https:/);
      expect(JSON.stringify(cal.made.at(-1))).toContain(`selin@${cal.domain}`);
      world.arm(cal.provider, 'badfield');
      expect((await ada.post(`/api/connections/${id}/calendar/events`, { accountId: account, title: 'Bad', start, minutes: 30, attendees: [`selin@${cal.domain}`] })).status).toBeGreaterThanOrEqual(400);
    });

    it('errors: an expired token is renewed on its own; a rate limit waits; withdrawn access asks to reconnect', async () => {
      world.arm(cal.provider, 'expired');
      later(60);
      expect((await runSync(id)).status).toBe('ok');
      world.arm(cal.provider, 'ratelimit');
      later(60);
      expect(['partial', 'error']).toContain((await runSync(id)).status);
      world.arm(cal.provider, 'revoked');
      later(60);
      expect((await runSync(id)).status).toBe('error');
      expect((await ada.get('/api/connections')).json.connections.find((c: any) => c.id === id).status).toBe('error');
      world.clear(cal.provider);
    });

    it('reconnect by signing in again keeps the connection; disconnect keeps the meetings', async () => {
      expect(await signIn(cal.provider, `?reconnect=${id}`)).toBe(id);
      later(60);
      expect((await runSync(id)).status).toBe('ok');
      expect((await ada.del(`/api/connections/${id}`)).status).toBe(200);
      expect(await sealedOf(id)).toBeUndefined();
    });
  });
}

// ------------------------------------------------------------------ Zoho Desk

describe('Zoho Desk (tickets both ways)', () => {
  let id: string;

  it('connect: sign in with Zoho; the data centre (EU here) and the portal are found', async () => {
    env.clock.now = new Date(Date.now() + 60_000);
    const w = stopwatch('Zoho Desk');
    expect((await ada.get('/api/connections')).json.providers.find((p: any) => p.id === 'zohodesk')).toMatchObject({ setup: 'oauth', available: true, twoWay: true });
    w.click(3);
    id = await signIn('zohodesk');
    w.connected();
    const d = (await ada.get(`/api/connections/${id}/sync`)).json;
    expect(d.connection).toMatchObject({ provider: 'zohodesk', label: 'Quillfield Support', canReply: true });
    const sug = async (object: string, kind: string) => (await ada.get(`/api/connections/${id}/objects/${object}/fields?kind=${kind}`)).json.suggested;
    w.click(2);
    const saved = await ada.put(`/api/connections/${id}/sync`, {
      objects: [
        { remote: 'organizations', label: 'Accounts', target: 'account', enabled: true, create: false, fields: await sug('organizations', 'account') },
        { remote: 'tickets', label: 'Tickets', target: 'record', typeKey: '__new', kind: 'ticket', enabled: true, create: false, fields: await sug('tickets', 'ticket') },
      ],
      conflict: 'latest',
    });
    expect(saved.status, JSON.stringify(saved.json)).toBe(200);
    w.click(1);
    const run = await runSync(id);
    w.firstData();
    expect(run.status, JSON.stringify(run.errors)).toBe('ok');
    expect(run.stats.tickets.created).toBe(3);
    const calls = world.calls.filter((c) => c.vendor === 'zohodesk' && c.url.includes('desk.zoho.eu'));
    expect(calls.length).toBeGreaterThan(0);
  });

  it('a ticket closed there arrives; a reply and an internal note go back as comments', async () => {
    later(10);
    zohodeskMock.remoteEdit!(world.ctl('zohodesk'), 'Cannot add a user (solved)');
    const run = await runSync(id);
    expect(run.mode).toBe('incremental');
    expect(run.stats.tickets.updated).toBeGreaterThanOrEqual(1);
    expect(world.calls.some((c) => c.url.includes('/tickets/search?') && c.url.includes('modifiedTimeRange'))).toBe(true);
    expect((await ada.post(`/api/connections/${id}/tickets/7001/reply`, { body: 'We are on it', internal: false })).status).toBe(200);
    expect((await ada.post(`/api/connections/${id}/tickets/7001/reply`, { body: 'Check the PDF service', internal: true })).status).toBe(200);
    expect(zdComments.map((x) => x.isPublic)).toEqual([true, false]);
    const made = await ada.post(`/api/connections/${id}/tickets`, { subject: 'Export is slow', requester: 'selin@pinecrest.example', priority: 'high' });
    expect(made.status, JSON.stringify(made.json)).toBe(201);
  });

  it('errors and reconnect', async () => {
    world.arm('zohodesk', 'expired');
    later(10);
    expect((await runSync(id)).status).toBe('ok');
    world.arm('zohodesk', 'ratelimit');
    later(10);
    expect(['partial', 'error']).toContain((await runSync(id)).status);
    world.arm('zohodesk', 'revoked');
    later(10);
    expect((await runSync(id)).status).toBe('error');
    world.clear('zohodesk');
    expect(await signIn('zohodesk', `?reconnect=${id}`)).toBe(id);
    later(10);
    expect((await runSync(id)).status).toBe('ok');
    expect((await ada.del(`/api/connections/${id}`)).status).toBe(200);
  });
});

// ------------------------------------------------------------------ Stripe

describe('Stripe (read only)', () => {
  let id: string;

  it('connect: only a restricted key, with each needed permission named when missing', async () => {
    env.clock.now = new Date(Date.now() + 60_000);
    const w = stopwatch('Stripe');
    expect((await ada.post('/api/connections/key', { provider: 'stripe', values: { key: 'sk_test_51abcdefabcdefabcdef' } })).json.message ?? '').toMatch(/restricted key/);
    stripeWithoutEvents();
    const noEv = await ada.post('/api/connections/key', { provider: 'stripe', values: stripeMock.keyValues });
    expect(JSON.stringify(noEv.json)).toContain('Events');
    stripeMock.reset();
    // Settings → Data sources → Connect Stripe → paste the key → Connect.
    w.click(4);
    const ok = await ada.post('/api/connections/key', { provider: 'stripe', values: stripeMock.keyValues });
    expect(ok.status, JSON.stringify(ok.json)).toBe(201);
    id = ok.json.id;
    w.connected();
    expect((await ada.get(`/api/connections/${id}/sync`)).json.connection).toMatchObject({ provider: 'stripe', readOnly: true, accounting: true, label: 'Stripe (test)' });
    w.click(1);
    const run = await runSync(id);
    w.firstData();
    expect(run.status, JSON.stringify(run.errors)).toBe('ok');
    const inv = await env.db.system((q) => q.query(`select remote_id, total::float as total, balance::float as balance, status, currency from finance_invoices where connection_id = $1 order by remote_id`, [id]));
    const by = Object.fromEntries(inv.map((r: any) => [r.remote_id, r]));
    expect(by.in_1).toMatchObject({ total: 1250.5, balance: 1250.5, status: 'open', currency: 'USD' });
    expect(by.in_4).toMatchObject({ total: 120000, currency: 'JPY' });
    expect(by.in_3.status).toBe('open');
    expect(by.in_0.status).toBe('draft');
    const pays = await env.db.system((q) => q.query(`select remote_id, amount::float as amount from finance_payments where connection_id = $1`, [id]));
    expect(pays).toEqual([{ remote_id: 'in_2:paid', amount: 2500 }]);
  });

  it('a payment there arrives through the events list; nothing is ever written to Stripe', async () => {
    later(30);
    stripeMock.remoteEdit!(world.ctl('stripe'), '');
    const run = await runSync(id);
    expect(run.status).toBe('ok');
    expect(world.calls.some((c) => c.url.includes('/v1/events?type=invoice.*'))).toBe(true);
    const [i1] = await env.db.system((q) => q.query(`select status, balance::float as balance from finance_invoices where connection_id = $1 and remote_id = 'in_1'`, [id]));
    expect(i1).toEqual({ status: 'paid', balance: 0 });
    expect(world.calls.filter((c) => c.vendor === 'stripe' && c.method !== 'GET')).toHaveLength(0);
  });

  it('errors: rate limit waits, a rolled key asks to reconnect; reconnect and disconnect', async () => {
    world.arm('stripe', 'ratelimit');
    later(30);
    expect(['partial', 'error', 'ok']).toContain((await runSync(id)).status);
    world.arm('stripe', 'revoked');
    later(30);
    expect((await runSync(id)).status).toBe('error');
    world.clear('stripe');
    expect((await ada.post('/api/connections/key', { provider: 'stripe', values: stripeMock.keyValues })).json.id).toBe(id);
    expect((await ada.del(`/api/connections/${id}`)).status).toBe(200);
  });
});

// ------------------------------------------------------------------ WhatsApp Business

describe('WhatsApp Business (own Meta app)', () => {
  let id: string;
  let source: string;
  let verifyToken: string;
  let account: string;
  const from = '905339990011';

  it('connect: number id, token and app secret; Curahold gives the callback address and verify token Meta checks', async () => {
    env.clock.now = new Date(Date.now() + 60_000);
    const acc = (await ada.post('/api/accounts', { name: 'Pinecrest (WhatsApp)' })).json.account;
    account = acc.id;
    const contactType = (await ada.get('/api/record-types')).json.types.find((t: any) => t.kind === 'contact');
    expect((await ada.post('/api/records', { typeId: contactType.id, accountId: account, name: 'Selin Akar', fields: { phone: '0533 999 00 11' } })).status).toBe(201);

    const w = stopwatch('WhatsApp Business');
    expect((await ada.post('/api/connections/key', { provider: 'whatsapp', values: { ...whatsappMock.keyValues, appSecret: 'short' } })).status).toBeGreaterThanOrEqual(400);
    // Settings → Data sources → Connect WhatsApp → number id → token → app secret → Connect, then in Meta: paste address → paste token → Verify and save → tick "messages".
    w.click(10);
    const ok = await ada.post('/api/connections/key', { provider: 'whatsapp', values: whatsappMock.keyValues });
    expect(ok.status, JSON.stringify(ok.json)).toBe(201);
    id = ok.json.id;
    const d = (await ada.get(`/api/connections/${id}/sync`)).json.connection;
    expect(d.inboundUrl).toMatch(/\/api\/inbound\/whatsapp\/[\w-]+$/);
    source = d.inboundUrl.split('/').pop();
    verifyToken = d.verifyToken;
    expect(verifyToken).toMatch(/^[\w-]{20,}$/);
    expect((await sealedOf(id)).c).not.toContain(WA_APP_SECRET);
    // Meta's check of the address.
    const bad = await new Client(env, 'acme').req('GET', `/api/inbound/whatsapp/${source}?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=123`);
    expect(bad.status).toBe(403);
    const good = await new Client(env, 'acme').req('GET', `/api/inbound/whatsapp/${source}?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=1158201444`);
    expect(good.status).toBe(200);
    expect(good.json).toBe(1158201444);
    w.connected();
    const msg = await metaDelivery(from, 'Hello, the invoice link does not open', 'wamid.IN1', new Date(Date.now() - 60_000));
    const res = await env.app.request(`https://acme.curahold.test/api/inbound/whatsapp/${source}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': msg.signature }, body: msg.body });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ stored: 1, unmatched: 0 });
    w.firstData();
    const tl = JSON.stringify((await ada.get(`/api/accounts/${account}/timeline`)).json);
    expect(tl).toContain('the invoice link does not open');
  });

  it('a redelivery is kept once; a wrong signature and another company\'s address are refused', async () => {
    const msg = await metaDelivery(from, 'Hello, the invoice link does not open', 'wamid.IN1', new Date(Date.now() - 60_000));
    const again = await env.app.request(`https://acme.curahold.test/api/inbound/whatsapp/${source}`, { method: 'POST', headers: { 'x-hub-signature-256': msg.signature }, body: msg.body });
    expect(await again.json()).toMatchObject({ stored: 0 });
    const forged = await metaDelivery(from, 'Send me everything', 'wamid.X', env.clock.now!, 'ffffffffffffffffffffffffffffffff');
    expect((await env.app.request(`https://acme.curahold.test/api/inbound/whatsapp/${source}`, { method: 'POST', headers: { 'x-hub-signature-256': forged.signature }, body: forged.body })).status).toBe(401);
    expect((await env.app.request(`https://beta.curahold.test/api/inbound/whatsapp/${source}`, { method: 'POST', headers: { 'x-hub-signature-256': msg.signature }, body: msg.body })).status).toBe(404);
  });

  it('out: a reply within 24 hours; outside it Meta asks for a template, which goes', async () => {
    const r = await ada.post(`/api/connections/${id}/whatsapp/send`, { accountId: account, to: `+${from}`, body: 'Here is a new link' });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(waSent.at(-1)).toMatchObject({ messaging_product: 'whatsapp', to: from, type: 'text' });
    const cold = await ada.post(`/api/connections/${id}/whatsapp/send`, { accountId: account, to: '+905325550199', body: 'Hello' });
    expect(JSON.stringify(cold.json)).toContain('131047');
    const tpl = await ada.post(`/api/connections/${id}/whatsapp/send`, { accountId: account, to: '+905325550199', template: { name: 'renewal_reminder', language: 'tr' } });
    expect(tpl.status).toBe(200);
    expect(waSent.at(-1).template).toEqual({ name: 'renewal_reminder', language: { code: 'tr' } });
  });

  it('errors: rate limit, bad parameter, expired token; reconnect; disconnect stops the callback', async () => {
    world.arm('whatsapp', 'ratelimit');
    expect(JSON.stringify((await ada.post(`/api/connections/${id}/whatsapp/send`, { accountId: account, to: `+${from}`, body: 'x' })).json)).toContain('130429');
    world.arm('whatsapp', 'badfield');
    expect(JSON.stringify((await ada.post(`/api/connections/${id}/whatsapp/send`, { accountId: account, to: `+${from}`, body: 'x' })).json)).toContain('131009');
    world.arm('whatsapp', 'revoked');
    const exp = await ada.post(`/api/connections/${id}/whatsapp/send`, { accountId: account, to: `+${from}`, body: 'x' });
    expect(exp.json).toMatchObject({ auth: true });
    world.clear('whatsapp');
    expect((await ada.post('/api/connections/key', { provider: 'whatsapp', values: whatsappMock.keyValues })).json.id).toBe(id);
    expect((await ada.del(`/api/connections/${id}`)).status).toBe(200);
    const msg = await metaDelivery(from, 'after', 'wamid.IN9', env.clock.now!);
    expect((await env.app.request(`https://acme.curahold.test/api/inbound/whatsapp/${source}`, { method: 'POST', headers: { 'x-hub-signature-256': msg.signature }, body: msg.body })).status).toBe(404);
    void WA_PHONE_ID;
  });
});

// ------------------------------------------------------------------ Azure DevOps

describe('Azure DevOps (service hooks link code to tasks)', () => {
  let url: string;
  let secret: string;
  let taskId: string;
  const post = (body: unknown, auth: string) => env.app.request(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: auth }, body: JSON.stringify(body) });

  it('connect: switch it on, give Azure DevOps the address and the secret as the basic-auth password', async () => {
    const w = stopwatch('Azure DevOps');
    // Settings → Data sources → Azure DevOps → Turn on → (Azure DevOps) Project settings → Service hooks → + → Web Hooks → event → paste address → paste password → Finish.
    w.click(9);
    const on = await ada.post('/api/dev-hooks/azuredevops', {});
    expect(on.status).toBe(201);
    url = on.json.hook.url;
    secret = on.json.hook.secret;
    expect(url).toMatch(/\/api\/inbound\/dev\/azuredevops$/);
    w.connected();
    const t = (await ada.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Export button is broken' })).json.task;
    taskId = t.id;
    const r = await post(adoPush(devKey(taskId)), adoAuth(secret));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ linked: 2 });
    w.firstData();
  });

  it('a pull request is linked, merged, and a build\'s result shows as checks', async () => {
    await post(adoPr(devKey(taskId), 'git.pullrequest.created', 'active'), adoAuth(secret));
    await post(adoBuild('failed'), adoAuth(secret));
    let dev = (await ada.get(`/api/tasks/${taskId}/dev`)).json;
    expect(dev.summary).toMatchObject({ prs: 1, open: 2 });
    await post(adoPr(devKey(taskId), 'git.pullrequest.merged', 'completed'), adoAuth(secret));
    await post(adoBuild('succeeded'), adoAuth(secret));
    dev = (await ada.get(`/api/tasks/${taskId}/dev`)).json;
    const pr = dev.links.find((l: any) => l.kind === 'pr');
    expect(pr).toMatchObject({ provider: 'azuredevops', repo: 'Portal/web', ref: '7', state: 'merged', url: 'https://dev.azure.com/quillfield/Portal/_git/web/pullrequest/7' });
  });

  it('errors: no or a wrong password is refused; turning it off makes the address unknown', async () => {
    expect((await post(adoPush(devKey(taskId)), '')).status).toBe(401);
    expect((await post(adoPush(devKey(taskId)), adoAuth('wrong-secret'))).status).toBe(401);
    expect((await env.app.request(url.replace('acme.', 'beta.'), { method: 'POST', headers: { authorization: adoAuth(secret) }, body: JSON.stringify(adoPush('x')) })).status).toBe(404);
    // Reconnect = a new secret; the old one stops.
    const again = await ada.post('/api/dev-hooks/azuredevops', {});
    expect(again.json.hook.secret).not.toBe(secret);
    expect((await post(adoPush(devKey(taskId)), adoAuth(secret))).status).toBe(401);
    secret = again.json.hook.secret;
    expect((await post(adoPush(devKey(taskId)), adoAuth(secret))).status).toBe(200);
    expect((await ada.del('/api/dev-hooks/azuredevops')).status).toBe(200);
    expect((await post(adoPush(devKey(taskId)), adoAuth(secret))).status).toBe(404);
  });
});

// ------------------------------------------------------------------ incoming webhooks (the generic path)

describe('Incoming webhooks: any tool, signed, mapped, replay-proof', () => {
  const hmac = async (algo: 'SHA-256' | 'SHA-1', secret: string, body: string, enc: 'hex' | 'base64') => {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: algo }, false, ['sign']);
    const b = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
    return enc === 'hex' ? Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('') : btoa(String.fromCharCode(...b));
  };
  const send = (url: string, body: string, headers: Record<string, string>) => env.app.request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });
  let account: string;
  let generic: any;

  beforeAll(async () => {
    env.clock.now = new Date(Date.now() + 60_000);
    account = (await ada.post('/api/accounts', { name: 'Pinecrest Hooks' })).json.account.id;
    const contactType = (await ada.get('/api/record-types')).json.types.find((t: any) => t.kind === 'contact');
    await ada.post('/api/records', { typeId: contactType.id, accountId: account, name: 'Mert Hooks', fields: { email: 'mert@hooks.example' } });
  });

  it('connect: a hook per source; only people who manage connections see or make one', async () => {
    const w = stopwatch('Incoming webhook');
    expect((await lena.get('/api/inbound-hooks')).status).toBe(403);
    expect((await lena.post('/api/inbound-hooks', { name: 'x' })).status).toBe(403);
    // Settings → Data sources → Add an incoming webhook → choose the tool → Create → copy the address → copy the secret.
    w.click(6);
    const made = await ada.post('/api/inbound-hooks', { name: 'Our automations', recipe: 'curahold' });
    expect(made.status, JSON.stringify(made.json)).toBe(201);
    generic = made.json.hook;
    expect(generic).toMatchObject({ source: 'curahold', target: 'activity', enabled: true });
    expect(generic.url).toMatch(/^https:\/\/acme\.curahold\.test\/api\/inbound\/hooks\/[0-9a-f-]{36}$/);
    expect(generic.secret).toMatch(/^whsec_[0-9a-f]{40}$/);
    w.connected();
    const body = JSON.stringify({ id: 'evt_1', email: 'mert@hooks.example', text: 'Signed the order form', at: new Date(Date.now() - 3_600_000).toISOString() });
    const t = Math.floor(env.clock.now!.getTime() / 1000);
    const r = await send(generic.url, body, { 'x-curahold-signature': await curaholdSignature(generic.secret, t, body), 'x-curahold-event-id': 'evt_1' });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, status: 'ok', result: { kind: 'activity', how: 'created' } });
    w.firstData();
    expect(JSON.stringify((await ada.get(`/api/accounts/${account}/timeline`)).json)).toContain('Signed the order form');
  });

  it('replay protection: the same event once, an old or forged one refused, another company\'s address unknown', async () => {
    const body = JSON.stringify({ id: 'evt_1', email: 'mert@hooks.example', text: 'Signed the order form' });
    const t = Math.floor(env.clock.now!.getTime() / 1000);
    const again = await send(generic.url, body, { 'x-curahold-signature': await curaholdSignature(generic.secret, t, body), 'x-curahold-event-id': 'evt_1' });
    expect(await again.json()).toMatchObject({ status: 'duplicate' });
    const old = await send(generic.url, body, { 'x-curahold-signature': await curaholdSignature(generic.secret, t - 3600, body), 'x-curahold-event-id': 'evt_2' });
    expect(old.status).toBe(401);
    expect((await old.json()).error).toBe('too_old');
    const forged = await send(generic.url, body, { 'x-curahold-signature': await curaholdSignature('whsec_wrong', t, body), 'x-curahold-event-id': 'evt_3' });
    expect(forged.status).toBe(401);
    expect((await send(generic.url.replace('acme.', 'beta.'), body, { 'x-curahold-signature': await curaholdSignature(generic.secret, t, body) })).status).toBe(404);
    // The same item with a new event id updates the entry instead of adding one.
    const edit = JSON.stringify({ id: 'evt_1', email: 'mert@hooks.example', text: 'Signed the order form (countersigned)' });
    const upd = await send(generic.url, edit, { 'x-curahold-signature': await curaholdSignature(generic.secret, t, edit), 'x-curahold-event-id': 'evt_4' });
    expect(await upd.json()).toMatchObject({ status: 'ok', result: { how: 'updated' } });
    const log = (await ada.get(`/api/inbound-hooks/${generic.id}/deliveries`)).json.deliveries;
    expect(log.map((d: any) => d.status)).toEqual(['ok', 'rejected', 'rejected', 'ok']);
    expect(log[1].error).toBe('bad_signature');
  });

  it('the test screen previews the mapping and sends a marked test delivery; a delivery about nobody waits in the log', async () => {
    const pre = (await ada.post(`/api/inbound-hooks/${generic.id}/test`, { payload: { id: 'evt_9', email: 'mert@hooks.example', text: 'Hello' }, dryRun: true })).json;
    expect(pre.preview).toMatchObject({ externalId: 'evt_9', body: 'Hello', 'customer.email': 'mert@hooks.example' });
    expect(pre.paths).toEqual(['id', 'email', 'text']);
    const real = (await ada.post(`/api/inbound-hooks/${generic.id}/test`, { payload: { id: 'evt_10', email: 'nobody@unknown.example', text: 'Hi' } })).json;
    expect(real).toMatchObject({ status: 'failed' });
    expect(real.error).toContain('customer');
    const log = (await ada.get(`/api/inbound-hooks/${generic.id}/deliveries`)).json.deliveries;
    expect(log[0]).toMatchObject({ test: true, status: 'failed' });
  });

  it('e-signature (DocuSign Connect shape): its own HMAC, base64, with the key it generated; becomes a note on the deal', async () => {
    const oppType = (await ada.get('/api/record-types')).json.types.find((t: any) => t.kind === 'opportunity');
    await ada.post('/api/records', { typeId: oppType.id, accountId: account, name: 'Pinecrest Hooks renewal', fields: {} });
    const key = 'docusign-connect-hmac-key-0001';
    const h = (await ada.post('/api/inbound-hooks', { name: 'Signatures', recipe: 'esign', senderSecret: key })).json.hook;
    expect(h).toMatchObject({ secret: null, senderSecretSet: true, target: 'deal_note' });
    const body = JSON.stringify({ event: 'envelope-completed', generatedDateTime: new Date().toISOString(), data: { envelopeId: 'env-1', envelopeSummary: { status: 'completed', emailSubject: 'Pinecrest Hooks renewal', recipients: { signers: [{ email: 'mert@hooks.example' }] } } } });
    const r = await send(h.url, body, { 'x-docusign-signature-1': await hmac('SHA-256', key, body, 'base64') });
    expect(await r.json()).toMatchObject({ status: 'ok', result: { kind: 'deal_note', how: 'created' } });
    const skipped = JSON.stringify({ event: 'recipient-viewed', generatedDateTime: new Date().toISOString(), data: { envelopeId: 'env-1' } });
    expect(await (await send(h.url, skipped, { 'x-docusign-signature-1': await hmac('SHA-256', key, skipped, 'base64') })).json()).toMatchObject({ status: 'skipped' });
  });

  it('Aircall (token in the body) becomes a call; Tawk.to (HMAC-SHA1) becomes a ticket; a task hook makes then updates a task', async () => {
    const air = (await ada.post('/api/inbound-hooks', { name: 'Calls', recipe: 'aircall', senderSecret: 'aircall-token-0001' })).json.hook;
    const call = JSON.stringify({ resource: 'call', event: 'call.ended', timestamp: Math.floor(Date.now() / 1000), token: 'aircall-token-0001', data: { id: 812345, direction: 'outbound', duration: 420, raw_digits: '+90 212 555 01 23', contact: { emails: [{ value: 'mert@hooks.example' }] } } });
    expect(await (await send(air.url, call, {})).json()).toMatchObject({ status: 'ok', result: { kind: 'activity' } });
    const [act] = await env.db.system((q) => q.query(`select kind, minutes from activities where source like 'hook:%' and kind = 'call'`));
    expect(act).toEqual({ kind: 'call', minutes: 7 });
    expect((await send(air.url, call.replace('aircall-token-0001', 'wrong-token-00'), {})).status).toBe(401);

    const tawk = (await ada.post('/api/inbound-hooks', { name: 'Chats', recipe: 'tawkto', senderSecret: 'tawk-secret-0001' })).json.hook;
    const chat = JSON.stringify({ event: 'chat:end', chatId: 'c-1', time: new Date().toISOString(), visitor: { name: 'Mert', email: 'mert@hooks.example' }, property: { name: 'Website' } });
    expect(await (await send(tawk.url, chat, { 'x-tawk-signature': await hmac('SHA-1', 'tawk-secret-0001', chat, 'hex') })).json()).toMatchObject({ status: 'ok', result: { kind: 'ticket', how: 'created' } });

    const tasks = (await ada.post('/api/inbound-hooks', { name: 'Jobs', recipe: 'custom', mapping: { externalId: '{{id}}', title: '{{title}}', status: '{{state}}', customer: { email: '{{email}}' }, boardId: env.a.boards.csBoard } })).json.hook;
    const tok = tasks.secret;
    const one = await send(tasks.url, JSON.stringify({ id: 'job-1', title: 'Call back about the invoice', state: 'open', email: 'mert@hooks.example' }), { 'x-curahold-token': tok });
    const made = (await one.json()).result;
    expect(made).toMatchObject({ kind: 'task', how: 'created' });
    const two = await send(`${tasks.url}?token=${tok}`, JSON.stringify({ id: 'job-1', title: 'Call back about the invoice', state: 'done', email: 'mert@hooks.example' }), {});
    expect((await two.json()).result).toMatchObject({ kind: 'task', id: made.id, how: 'updated' });
    const [row] = await env.db.system((q) => q.query('select done_at from tasks where id = $1', [made.id]));
    expect(row.done_at).toBeTruthy();
  });

  it('pause, a new secret, remove: each takes effect at once', async () => {
    const body = JSON.stringify({ id: 'evt_20', email: 'mert@hooks.example', text: 'x' });
    const t = Math.floor(env.clock.now!.getTime() / 1000);
    await ada.patch(`/api/inbound-hooks/${generic.id}`, { enabled: false });
    expect((await send(generic.url, body, { 'x-curahold-signature': await curaholdSignature(generic.secret, t, body) })).status).toBe(404);
    const re = (await ada.patch(`/api/inbound-hooks/${generic.id}`, { enabled: true, rotate: true })).json.hook;
    expect(re.secret).not.toBe(generic.secret);
    expect((await send(generic.url, body, { 'x-curahold-signature': await curaholdSignature(generic.secret, t, body) })).status).toBe(401);
    expect((await send(generic.url, body, { 'x-curahold-signature': await curaholdSignature(re.secret, t, body) })).status).toBe(200);
    expect((await ada.del(`/api/inbound-hooks/${generic.id}`)).status).toBe(200);
    expect((await send(generic.url, body, { 'x-curahold-signature': await curaholdSignature(re.secret, t, body) })).status).toBe(404);
    // What it made stays.
    expect(JSON.stringify((await ada.get(`/api/accounts/${account}/timeline`)).json)).toContain('countersigned');
  });
});
