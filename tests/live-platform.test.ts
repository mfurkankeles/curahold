// The console's live room (api/src/live/platform.ts): Curahold's own console
// hears within a moment that something it shows changed, and nothing else.
// The rules first, on fake connections (as tests/live-room.test.ts); then end
// to end on the Node server with real sockets (as tests/live-node.test.ts): a
// staff member signed in on the desk host with both steps, a company person
// writing through the real API, and every way in that must stay shut.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startLocal } from '../api/src/node';
import { consolePulse } from '../api/src/lib/console';
import { base32Decode, hotp, stepOf } from '../api/src/lib/totp';
import { PlatformRoom, readPlatformTicket, signPlatformTicket, touchesConsole, type PlatformConn, type PlatformMessage, type PlatformState } from '../api/src/live/platform';
import { CLOSE, signTicket } from '../api/src/live/protocol';

const SECRET = 'platform-room-test-secret-0123456789abcdef';
const STAFF = 'deniz.aksoy@curahold.test';
const STAFF_KEY = 'platform-room-test-staff-key-000001';

class FakeConn implements PlatformConn {
  got: PlatformMessage[] = [];
  raw: string[] = [];
  closedWith: number | null = null;
  state: PlatformState | null = null;
  send(t: string) {
    this.raw.push(t);
    if (t !== 'pong') this.got.push(JSON.parse(t));
  }
  close(code: number) {
    this.closedWith = code;
    this.state = null;
  }
  get() {
    return this.state;
  }
  set(s: PlatformState) {
    this.state = s;
  }
  take() {
    return this.got.splice(0);
  }
}

describe('the console room: rules', () => {
  const make = (opts: { staff?: string[]; now?: () => number } = {}) => {
    let v = 'a'.repeat(16);
    let looks = 0;
    const conns: FakeConn[] = [];
    const room = new PlatformRoom({
      secret: SECRET,
      look: async () => {
        looks++;
        await new Promise((r) => setTimeout(r, 5));
        return v;
      },
      conns: () => conns,
      staff: () => opts.staff ?? [STAFF],
      now: opts.now,
    });
    const join = async (raw: string) => {
      const c = new FakeConn();
      conns.push(c);
      await room.open(c, raw);
      return c;
    };
    return { room, conns, join, set: (x: string) => (v = x), looks: () => looks };
  };
  const ticket = (over: { email?: string; until?: number } = {}, now = Date.now()) => signPlatformTicket(SECRET, { email: over.email ?? STAFF, until: over.until ?? now + 3600_000 }, now);

  it('says where things stand on joining, then only that something moved: a fingerprint, never a figure', async () => {
    const r = make();
    const c = await r.join(await ticket());
    expect(c.take()).toEqual([{ t: 'hi', v: 'a'.repeat(16) }]);
    await r.room.poke();
    expect(c.take(), 'nothing moved, nothing said').toEqual([]);
    r.set('b'.repeat(16));
    await r.room.poke();
    expect(c.take()).toEqual([{ t: 'c', v: 'b'.repeat(16) }]);
    for (const m of c.raw) expect(Object.keys(JSON.parse(m)).sort()).toEqual(['t', 'v']);
  });

  it('a burst of writes costs at most two looks, and the last one sees the last write', async () => {
    const r = make();
    const c = await r.join(await ticket());
    c.take();
    const before = r.looks();
    r.set('c'.repeat(16));
    await Promise.all(Array.from({ length: 20 }, () => r.room.poke()));
    expect(r.looks() - before).toBeLessThanOrEqual(2);
    expect(c.take()).toEqual([{ t: 'c', v: 'c'.repeat(16) }]);
  });

  it('nobody connected: nothing is read', async () => {
    const r = make();
    await r.room.poke();
    expect(r.looks()).toBe(0);
  });

  it('turns away a company ticket, an expired ticket, an ended session, a forged one and someone not on the list', async () => {
    const r = make();
    const company = await signTicket(SECRET, { o: '00000000-0000-4000-8000-000000000001', s: 'acme', u: '00000000-0000-4000-8000-000000000002', w: [], e: Date.now() + 60_000 });
    const old = await ticket({}, Date.now() - 120_000);
    const ended = await ticket({ until: Date.now() - 1 });
    const forged = await signPlatformTicket('another-secret-entirely-0123456789abcdef', { email: STAFF, until: Date.now() + 3600_000 });
    const stranger = await ticket({ email: 'someone@example.test' });
    for (const raw of [company, old, ended, forged, stranger, '', 'x.y']) {
      const c = await r.join(raw);
      expect(c.closedWith).toBe(CLOSE.ticket);
      expect(c.got).toEqual([]);
    }
    // And a console ticket is no company ticket: the company channel's own reader refuses it.
    const { readTicket } = await import('../api/src/live/protocol');
    expect(await readTicket(SECRET, await ticket())).toBeNull();
    expect(await readPlatformTicket(SECRET, company)).toBeNull();
  });

  it('lets go of a session that ended and of someone taken off the staff list', async () => {
    let now = Date.now();
    const staff = [STAFF, 'ada.yilmaz@curahold.test'];
    const r = make({ staff, now: () => now });
    const short = await r.join(await ticket({ until: now + 1000 }, now));
    const ada = await r.join(await ticket({ email: 'ada.yilmaz@curahold.test' }, now));
    const stays = await r.join(await ticket({}, now));
    now += 5000;
    staff.splice(1, 1);
    r.set('d'.repeat(16));
    await r.room.poke();
    expect(short.closedWith).toBe(CLOSE.ticket);
    expect(ada.closedWith).toBe(CLOSE.ticket);
    expect(stays.closedWith).toBeNull();
    expect(stays.take().at(-1)).toEqual({ t: 'c', v: 'd'.repeat(16) });
  });

  it('a console only keeps its line open: "ping" is answered, anything else closes it', async () => {
    const r = make();
    const c = await r.join(await ticket());
    r.room.message(c, 'ping');
    expect(c.raw.at(-1)).toBe('pong');
    r.room.message(c, JSON.stringify({ t: 'w', k: 'anything' }));
    expect(c.closedWith).toBe(CLOSE.bad);
  });

  it('is told by the writes that can change the console, and not by the others', () => {
    for (const [m, p] of [
      ['POST', '/api/billing/webhook'],
      ['POST', '/api/inbound/billing/paddle'],
      ['POST', '/api/billing/cancel'],
      ['PATCH', '/api/billing/profile'],
      ['POST', '/api/signup/complete'],
      ['POST', '/api/help'],
      ['POST', '/api/help/1/messages'],
      ['POST', '/api/help/1/solve'],
      ['PUT', '/api/support/requests/CH-000001'],
      ['POST', '/api/desk/requests/CH-000001/messages'],
      ['PUT', '/api/desk/requests/CH-000001/owner'],
      ['POST', '/api/desk/mail'],
    ])
      expect(touchesConsole(m, p), `${m} ${p}`).toBe(true);
    for (const [m, p] of [
      ['GET', '/api/billing'],
      ['GET', '/api/desk/today'],
      ['POST', '/api/desk/sign-in'],
      ['POST', '/api/desk/sign-in/second'],
      ['POST', '/api/desk/sign-out'],
      ['POST', '/api/desk/live/ticket'],
      ['POST', '/api/tasks'],
      ['POST', '/api/live/ticket'],
      ['POST', '/api/helpers'],
      ['PATCH', '/api/me'],
    ])
      expect(touchesConsole(m, p), `${m} ${p}`).toBe(false);
  });
});

// ---------------------------------------------------------------- end to end on the Node server

const PORT = 10141;
/** The desk's host for this test: Node cannot send another Host header, so the console is at the IP, companies at "localhost". */
const DESK = `http://127.0.0.1:${PORT}`;
const APP = `http://localhost:${PORT}`;
let stack: Awaited<ReturnType<typeof startLocal>>;
let deskCookie = '';

async function call(base: string, method: string, path: string, opts: { body?: unknown; cookie?: string; headers?: Record<string, string> } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(opts.cookie ? { cookie: opts.cookie } : {}), ...opts.headers },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return { status: res.status, cookie: res.headers.get('set-cookie') ?? '', json: (await res.json().catch(() => null)) as any };
}

/** Curahold staff signing in on the desk host: the emailed code, then the authenticator app. */
async function staffSession(): Promise<string> {
  const h = { 'x-curahold-desk': '1' };
  const first = await call(DESK, 'POST', '/api/desk/sign-in', { body: { email: STAFF }, headers: h });
  const verify = await call(DESK, 'POST', '/api/desk/sign-in/verify', { body: { email: STAFF, code: first.json.devCode }, headers: h });
  const { ticket, secret } = verify.json.second;
  const second = await call(DESK, 'POST', '/api/desk/sign-in/second', { body: { ticket, code: await hotp(base32Decode(secret), stepOf(Date.now())) }, headers: h });
  expect(second.status).toBe(200);
  return /desk_session=[^;]+/.exec(second.cookie)![0];
}

/** A company person, signed in through the real API (development: the company from a header). */
async function person(email: string) {
  const device = `platform-test-${Math.random().toString(36).slice(2)}`;
  const h = { 'x-curahold-org': 'demo', 'x-curahold-device': device };
  const start = await call(APP, 'POST', '/api/auth/start', { body: { email }, headers: h });
  const v = await call(APP, 'POST', '/api/auth/verify', { body: { token: start.json.devToken, deviceId: device, deviceLabel: 'Platform test' }, headers: h });
  const cookie = /app_session=[^;]+/.exec(v.cookie)![0];
  return (method: string, path: string, body?: unknown) => call(APP, method, path, { body, cookie, headers: h });
}

function listen(url: string) {
  const ws = new WebSocket(url);
  const got: { m: PlatformMessage; at: number }[] = [];
  const waiters: (() => void)[] = [];
  ws.onmessage = (e) => {
    if (e.data === 'pong') return;
    got.push({ m: JSON.parse(String(e.data)), at: performance.now() });
    waiters.splice(0).forEach((f) => f());
  };
  const closed = new Promise<number>((r) => (ws.onclose = (e) => r(e.code)));
  const next = (pred: (m: PlatformMessage) => boolean, ms = 3000) =>
    new Promise<{ m: PlatformMessage; at: number } | null>((resolve) => {
      const look = () => {
        const i = got.findIndex((g) => pred(g.m));
        if (i >= 0) {
          clearTimeout(timer);
          resolve(got.splice(i, 1)[0]);
        } else waiters.push(look);
      };
      const timer = setTimeout(() => resolve(null), ms);
      look();
    });
  return { ws, got, next, closed };
}

beforeAll(async () => {
  stack = await startLocal({ port: PORT, publicPort: PORT, serveStatic: false, quiet: true, supportStaff: [STAFF], staffKey: STAFF_KEY });
  stack.config.deskHost = '127.0.0.1';
  // One sign-in for the file: an authenticator code works once per 30-second step.
  deskCookie = await staffSession();
}, 120_000);

afterAll(async () => {
  await stack?.live.close();
  stack?.server.close();
});

describe('the console room on the Node server', () => {
  it('a staff member signed in with both steps hears a company’s write in well under a second (p95)', async () => {
    const t = await call(DESK, 'POST', '/api/desk/live/ticket', { cookie: deskCookie, headers: { 'x-curahold-desk': '1' } });
    expect(t.status).toBe(200);
    const s = listen(`ws://127.0.0.1:${PORT}/api/desk/live?k=${encodeURIComponent(t.json.k)}`);
    const hi = await s.next((m) => m.t === 'hi');
    expect(hi?.m.v).toMatch(/^[0-9a-f]{16}$/);
    expect(hi?.m.v).toBe(await consolePulse({ db: stack.db }));

    const ada = await person(stack.demo.adminEmail);
    const opened = await ada('POST', '/api/help', { category: 'question', subject: 'Renewal dates after import', description: 'The renewal dates did not come across from the sheet.' });
    expect(opened.status).toBe(201);
    expect((await s.next((m) => m.t === 'c'))?.m.t).toBe('c');

    const waits: number[] = [];
    for (let i = 0; i < 20; i++) {
      const at = performance.now();
      const r = await ada('POST', `/api/help/${opened.json.request.id}/messages`, { body: `One more detail, number ${i + 1}.` });
      expect(r.status).toBe(201);
      const heard = await s.next((m) => m.t === 'c', 2000);
      expect(heard, `write ${i + 1} was not heard`).not.toBeNull();
      waits.push(heard!.at - at);
    }
    waits.sort((a, b) => a - b);
    const p95 = waits[Math.ceil(waits.length * 0.95) - 1];
    console.log(`    console room: a company's write heard by the console in p50 ${waits[9].toFixed(0)} ms, p95 ${p95.toFixed(0)} ms (20 writes, through the API)`);
    expect(p95).toBeLessThan(1000);

    // A write that changes nothing the console shows says nothing.
    expect((await ada('POST', '/api/tasks', { title: 'Not the console’s business', boardId: stack.demo.boards.csBoard })).status).toBe(201);
    expect(await s.next((m) => m.t === 'c', 600)).toBeNull();
    for (const g of s.got) expect(Object.keys(g.m).sort()).toEqual(['t', 'v']);
    s.ws.close();
  });

  it('stays shut to a company session, a staff key, a company ticket, and on any host but the desk’s', async () => {
    const ada = await person(stack.demo.adminEmail);
    // A company session cannot ask for a console ticket, on its own host or the desk's.
    expect((await ada('POST', '/api/desk/live/ticket')).status).toBe(403);
    // Tooling with a staff key reads the desk; it does not listen to it.
    expect((await call(DESK, 'POST', '/api/desk/live/ticket', { headers: { 'x-curahold-desk': '1', 'x-curahold-staff-key': STAFF_KEY } })).status).toBe(403);
    expect((await call(DESK, 'GET', '/api/desk/today', { headers: { 'x-curahold-staff-key': STAFF_KEY } })).status, 'the key itself works').toBe(200);
    // A company's live ticket does not open the console room.
    const company = (await ada('POST', '/api/live/ticket', { w: [] })).json.k as string;
    expect(await listen(`ws://127.0.0.1:${PORT}/api/desk/live?k=${encodeURIComponent(company)}`).closed).toBe(CLOSE.ticket);
    // A console ticket opens nothing on a company's host, and is no company ticket either.
    const k = (await call(DESK, 'POST', '/api/desk/live/ticket', { cookie: deskCookie, headers: { 'x-curahold-desk': '1' } })).json.k as string;
    expect(await listen(`ws://localhost:${PORT}/api/desk/live?k=${encodeURIComponent(k)}`).closed).toBe(CLOSE.ticket);
    expect(await listen(`ws://127.0.0.1:${PORT}/api/live?k=${encodeURIComponent(k)}`).closed).toBe(CLOSE.ticket);
    // Without a ticket: closed.
    expect(await listen(`ws://127.0.0.1:${PORT}/api/desk/live`).closed).toBe(CLOSE.ticket);
  });
});
