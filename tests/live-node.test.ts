// The live channel end to end on the Node server: a real WebSocket (Node's own
// client, as a browser's), the server's hand-written handshake and frames, the
// database's NOTIFY at commit, and the API's ticket. A change made by someone
// else arrives as a signal in well under a second; another company's never does.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startLocal } from '../api/src/node';
import { seedDemo } from '../scripts/seed-demo';
import type { ServerMessage } from '../api/src/live/protocol';

const PORT = 9601;
const BASE = `http://127.0.0.1:${PORT}`;
let stack: Awaited<ReturnType<typeof startLocal>>;

type Body = { devToken?: string; boards: { id: string }[]; k: string; n: number; w: string[] };

class Person {
  cookie = '';
  device = `live-test-${Math.random().toString(36).slice(2)}`;
  constructor(public org: string) {}
  async req(method: string, path: string, body?: unknown) {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        'x-curahold-org': this.org,
        'x-curahold-device': this.device,
        'content-type': 'application/json',
        ...(this.cookie ? { cookie: this.cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const m = /app_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '');
    if (m) this.cookie = `app_session=${m[1]}`;
    return { status: res.status, json: (await res.json().catch(() => null)) as Body };
  }
  static async in(org: string, email: string) {
    const p = new Person(org);
    const start = await p.req('POST', '/api/auth/start', { email });
    await p.req('POST', '/api/auth/verify', { token: start.json.devToken, deviceId: p.device, deviceLabel: 'Live test' });
    return p;
  }
}

/** A socket and everything it heard. */
async function connect(p: Person, w: string[] = [], since?: number) {
  const ticket = (await p.req('POST', '/api/live/ticket', { w })).json;
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/api/live?k=${encodeURIComponent(ticket.k)}${since !== undefined ? `&n=${since}` : ''}`);
  const got: ServerMessage[] = [];
  const waiters: (() => void)[] = [];
  ws.onmessage = (e) => {
    if (e.data === 'pong') return;
    got.push(JSON.parse(String(e.data)));
    waiters.splice(0).forEach((f) => f());
  };
  const closed = new Promise<number>((r) => (ws.onclose = (e) => r(e.code)));
  /** The next message that matches, or null after `ms`. */
  const next = (pred: (m: ServerMessage) => boolean, ms = 3000) =>
    new Promise<ServerMessage | null>((resolve) => {
      const look = () => {
        const i = got.findIndex(pred);
        if (i >= 0) {
          clearTimeout(timer);
          resolve(got.splice(i, 1)[0]);
        } else waiters.push(look);
      };
      const timer = setTimeout(() => resolve(null), ms);
      look();
    });
  await next((m) => m.t === 'hi');
  return { ws, got, next, closed, ticket };
}

beforeAll(async () => {
  stack = await startLocal({ port: PORT, publicPort: PORT, serveStatic: false, quiet: true });
  await seedDemo(stack.db, { slug: 'other', locale: 'en' });
}, 120_000);

afterAll(async () => {
  await stack.live.close();
  stack.server.close();
});

describe('the live channel on Node', () => {
  it("brings someone else's change to an open board in well under a second, and never to another company", async () => {
    const admin = await Person.in('demo', stack.demo.adminEmail);
    const board = (await admin.req('GET', '/api/boards')).json.boards[0].id;
    const watcher = await connect(admin, [`b:${board}`]);
    const outsider = await Person.in('other', stack.demo.adminEmail);
    const theirs = await connect(outsider);

    const lat: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      const made = await admin.req('POST', '/api/tasks', { boardId: board, title: `Live ${i}` });
      expect([200, 201]).toContain(made.status);
      const m = await watcher.next((x) => x.t === 'c' && !!x.b?.includes(board));
      expect(m).not.toBeNull();
      lat.push(performance.now() - t0);
    }
    expect(Math.max(...lat)).toBeLessThan(1000);
    expect(theirs.got.filter((m) => m.t === 'c')).toEqual([]);
    expect(stack.live.size().rooms).toBe(2);
    watcher.ws.close();
    theirs.ws.close();
  });

  it('after a lost connection, picks up from the last number it had', async () => {
    const admin = await Person.in('demo', stack.demo.adminEmail);
    const board = (await admin.req('GET', '/api/boards')).json.boards[0].id;
    const first = await connect(admin, [`b:${board}`]);
    const had = first.ticket.n as number;
    first.ws.close();
    await first.closed;
    await admin.req('POST', '/api/tasks', { boardId: board, title: 'While nobody listened' });
    const again = await connect(admin, [`b:${board}`], had);
    // The replay comes before "hi", so it is already in hand.
    const all = [...again.got];
    const replay = all.find((m) => m.t === 'c') ?? (await again.next((m) => m.t === 'c', 500));
    expect(replay).toMatchObject({ t: 'c', f: had, b: [board] });
    again.ws.close();
  });

  it('refuses a socket without a good ticket, and anything but text', async () => {
    const bad = new WebSocket(`ws://127.0.0.1:${PORT}/api/live?k=nonsense`);
    const code = await new Promise<number>((r) => (bad.onclose = (e) => r(e.code)));
    expect(code).toBe(4401);
    const admin = await Person.in('demo', stack.demo.adminEmail);
    const c = await connect(admin);
    c.ws.send(new Uint8Array([1, 2, 3]));
    expect(await c.closed).toBe(1003);
    // A ping is answered at once.
    const d = await connect(admin);
    const pong = new Promise<string>((r) => d.ws.addEventListener('message', (e) => r(String(e.data))));
    d.ws.send('ping');
    expect(await pong).toBe('pong');
    d.ws.close();
  });
});
