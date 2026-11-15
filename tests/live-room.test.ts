// The live channel's rules, on the real schema: every write is numbered per
// company without gaps; a room hears only its own company; each connection
// hears only what its ticket allows; a lost connection resumes where it
// stopped (or is told to reload); presence shows who is looking and typing.
import { beforeAll, describe, expect, it } from 'vitest';
import { CLOSE, signTicket, type ServerMessage, type Ticket } from '../api/src/live/protocol';
import { LiveRoom, type Conn, type ConnState } from '../api/src/live/room';
import { dbSource } from '../api/src/live/source';
import { Client, login, setup, type Env } from './helpers';

let env: Env;
let ada: Client;
let lena: Client;
let other: Client;

class FakeConn implements Conn {
  got: ServerMessage[] = [];
  closedWith: number | null = null;
  state: ConnState | null = null;
  send(t: string) {
    if (t !== 'pong') this.got.push(JSON.parse(t));
  }
  close(code: number) {
    this.closedWith = code;
  }
  get() {
    return this.state;
  }
  set(s: ConnState) {
    this.state = s;
  }
  take() {
    return this.got.splice(0);
  }
}

const orgOf = (slug: 'acme' | 'beta') => env.db.system(async (q) => (await q.query('select id from orgs where slug = $1', [slug]))[0].id as string);
const userOf = (email: string, org: string) =>
  env.db.system(async (q) => (await q.query('select id from users where email = $1 and org_id = $2', [email, org]))[0].id as string);
const head = (org: string) => dbSource(env.db).head(org);

function roomOf(orgId: string) {
  const conns: FakeConn[] = [];
  const room = new LiveRoom({ orgId, secret: env.config.authSecret, source: dbSource(env.db), conns: () => conns });
  const join = async (t: Partial<Ticket> & Pick<Ticket, 'u'>, since: number | null = null) => {
    const c = new FakeConn();
    conns.push(c);
    await room.open(c, await signTicket(env.config.authSecret, { o: orgId, s: 'acme', w: [], e: Date.now() + 60_000, ...t }), since);
    return c;
  };
  const leave = (c: FakeConn) => {
    room.closed(c);
    conns.splice(conns.indexOf(c), 1);
  };
  return { room, conns, join, leave };
}

let acme: string;
let beta: string;
let adaId: string;
let lenaId: string;

beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
  other = await login(env, 'beta', 'mert@demo.example');
  acme = await orgOf('acme');
  beta = await orgOf('beta');
  adaId = await userOf('ada@demo.example', acme);
  lenaId = await userOf('lena@demo.example', acme);
});

describe('change numbers', () => {
  it('every write is numbered per company, one after another, and names what it touched', async () => {
    const a0 = await head(acme);
    const b0 = await head(beta);
    const t = (await ada.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Numbered' })).json.task;
    await ada.post(`/api/tasks/${t.id}/comments`, { body: 'A note' });
    const a1 = await head(acme);
    expect(a1).toBeGreaterThanOrEqual(a0 + 2);
    // The other company's counter did not move.
    expect(await head(beta)).toBe(b0);
    const rows = await dbSource(env.db).changes(acme, a0, 100);
    expect(rows.map((r) => r.seq)).toEqual(Array.from({ length: a1 - a0 }, (_, i) => a0 + 1 + i));
    expect(rows.some((r) => r.kind === 'tasks' && r.boards.includes(env.a.boards.csBoard))).toBe(true);
    // A request role reads only its own company's numbers.
    const seen = await env.db.tenant({ orgId: beta, userId: null }, (q) => q.query('select count(*)::int as n from live_changes where org_id = $1', [acme]));
    expect(seen[0].n).toBe(0);
  });

  it('a transaction that fails leaves no number behind', async () => {
    const a0 = await head(acme);
    await expect(
      env.db.tenant({ orgId: acme, userId: adaId }, async (q) => {
        await q.query(`update tasks set title = title where board_id = $1`, [env.a.boards.csBoard]);
        throw new Error('rolled back');
      }),
    ).rejects.toThrow('rolled back');
    expect(await head(acme)).toBe(a0);
  });
});

describe('the room', () => {
  it('refuses a ticket for another company, a forged one and an expired one', async () => {
    const { room } = roomOf(acme);
    const c = new FakeConn();
    await room.open(c, await signTicket(env.config.authSecret, { o: beta, s: 'beta', u: adaId, w: [], e: Date.now() + 60_000 }), null);
    expect(c.closedWith).toBe(CLOSE.ticket);
    const d = new FakeConn();
    await room.open(d, await signTicket('another-secret-another-secret-123456', { o: acme, s: 'acme', u: adaId, w: [], e: Date.now() + 60_000 }), null);
    expect(d.closedWith).toBe(CLOSE.ticket);
    const e = new FakeConn();
    await room.open(e, await signTicket(env.config.authSecret, { o: acme, s: 'acme', u: adaId, w: [], e: Date.now() - 1 }), null);
    expect(e.closedWith).toBe(CLOSE.ticket);
    expect([c, d, e].every((x) => x.state === null && x.got.length === 0)).toBe(true);
  });

  it("tells each connection only its own company's changes, and only the boards it may follow", async () => {
    const A = roomOf(acme);
    const B = roomOf(beta);
    const watching = await A.join({ u: lenaId, w: [`b:${env.a.boards.csBoard}`] });
    const elsewhere = await A.join({ u: adaId });
    const stranger = await B.join({ u: await userOf('mert@demo.example', beta) });
    for (const c of [watching, elsewhere, stranger]) expect(c.take()).toEqual([{ t: 'hi', n: expect.any(Number) }]);

    await ada.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'For the room' });
    await Promise.all([A.room.poke(), B.room.poke()]);
    const [w] = watching.take();
    expect(w).toMatchObject({ t: 'c', k: ['tasks'], b: [env.a.boards.csBoard] });
    const [e] = elsewhere.take();
    expect(e).toMatchObject({ t: 'c', k: ['tasks'] });
    expect((e as { b?: string[] }).b).toBeUndefined();
    // Beta's room heard nothing of Acme's work.
    expect(stranger.take()).toEqual([]);

    // Beta's own write reaches Beta only.
    const betaBoard = (await other.get('/api/boards')).json.boards[0].id as string;
    await other.post('/api/tasks', { boardId: betaBoard, title: 'Beta only' });
    await Promise.all([A.room.poke(), B.room.poke()]);
    expect(watching.take()).toEqual([]);
    expect(stranger.take()).toMatchObject([{ t: 'c', k: ['tasks'] }]);

    // A task given to Lena: her bell hears it, Ada hears only that the number moved on.
    await ada.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'For Lena', assigneeIds: [lenaId] });
    await A.room.poke();
    expect((watching.take()[0] as { k: string[] }).k).toContain('unread');
    expect((elsewhere.take()[0] as { k: string[] }).k).not.toContain('unread');
  });

  it('a connection that comes back gets what it missed, in one go; too far behind, it is told to reload', async () => {
    const A = roomOf(acme);
    const first = await A.join({ u: lenaId, w: [`b:${env.a.boards.csBoard}`] });
    const had = (first.take()[0] as { n: number }).n;
    A.leave(first);
    await ada.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'While away' });
    await ada.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Also while away' });
    const now = await head(acme);
    const back = await A.join({ u: lenaId, w: [`b:${env.a.boards.csBoard}`] }, had);
    const got = back.take();
    expect(got[0]).toMatchObject({ t: 'c', f: had, n: now, b: [env.a.boards.csBoard] });
    expect(got[1]).toEqual({ t: 'hi', n: now });
    // Up to date: just "hi".
    const same = await A.join({ u: lenaId }, now);
    expect(same.take()).toEqual([{ t: 'hi', n: now }]);
    // Numbers the company never had (another database, a restore): reload.
    const lost = await A.join({ u: lenaId }, now + 50);
    expect(lost.take()[0]).toEqual({ t: 'reset', n: now });
    // Cleared away (kept: the last 5000): reload, never a silent gap.
    await env.db.system((q) => q.query('delete from live_changes where org_id = $1 and seq = $2', [acme, had + 1]));
    const late = await A.join({ u: lenaId }, had);
    expect(late.take()[0]).toEqual({ t: 'reset', n: now });
  });

  it('shows who is looking and typing, only to those looking at the same thing', async () => {
    const A = roomOf(acme);
    const task = `t:${(await ada.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Looked at' })).json.task.id}`;
    const a = await A.join({ u: adaId, w: [task] });
    const l = await A.join({ u: lenaId, w: [task] });
    const away = await A.join({ u: lenaId, w: [] });
    const quiet = await A.join({ u: adaId, w: [task], q: 1 });
    for (const c of [a, l, away, quiet]) c.take();
    await A.room.message(a, JSON.stringify({ t: 'h', on: task, y: 0 }));
    expect(a.take()).toEqual([{ t: 'p', on: task, who: [[adaId, 0]] }]);
    await A.room.message(l, JSON.stringify({ t: 'h', on: task, y: 1 }));
    expect(a.take()).toEqual([
      {
        t: 'p',
        on: task,
        who: [
          [adaId, 0],
          [lenaId, 1],
        ],
      },
    ]);
    expect(l.take()).toEqual([
      {
        t: 'p',
        on: task,
        who: [
          [adaId, 0],
          [lenaId, 1],
        ],
      },
    ]);
    // Not in its ticket: not shown anywhere. Through someone else's eyes: not shown either.
    await A.room.message(away, JSON.stringify({ t: 'h', on: task, y: 1 }));
    await A.room.message(quiet, JSON.stringify({ t: 'h', on: task, y: 1 }));
    expect(a.take()).toEqual([]);
    expect(away.state?.on).toBeNull();
    // Gone: the others are told.
    A.leave(l);
    expect(a.take()).toEqual([{ t: 'p', on: task, who: [[adaId, 0]] }]);
    // Something that is not a message closes the connection.
    await A.room.message(a, 'not json');
    expect(a.closedWith).toBe(CLOSE.bad);
  });
});

describe('the ticket', () => {
  it('keeps only what the person can see', async () => {
    const r = await lena.post('/api/live/ticket', { w: [`b:${env.a.boards.csBoard}`, `b:${env.a.boards.privateBoard}`] });
    expect(r.status).toBe(200);
    expect(r.json.w).toEqual([`b:${env.a.boards.csBoard}`]);
    const mine = await ada.post('/api/live/ticket', { w: [`b:${env.a.boards.privateBoard}`] });
    expect(mine.json.w).toEqual([`b:${env.a.boards.privateBoard}`]);
    // Another company's board is not "seen" by anyone here.
    const betaBoard = (await other.get('/api/boards')).json.boards[0].id as string;
    expect((await ada.post('/api/live/ticket', { w: [`b:${betaBoard}`] })).json.w).toEqual([]);
    // And a ticket from here does not open Beta's room.
    const { room } = roomOf(beta);
    const c = new FakeConn();
    await room.open(c, mine.json.k, null);
    expect(c.closedWith).toBe(CLOSE.ticket);
  });

  it('needs a signed-in person', async () => {
    const anon = new Client(env, 'acme');
    expect((await anon.post('/api/live/ticket', { w: [] })).status).toBe(401);
  });
});

describe('order of messages', () => {
  it('a "here" sent right after a new ticket counts against the new ticket', async () => {
    const A = roomOf(acme);
    const task = `t:${(await ada.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Opened later' })).json.task.id}`;
    const c = await A.join({ u: adaId, w: [] });
    c.take();
    const k = await signTicket(env.config.authSecret, { o: acme, s: 'acme', u: adaId, w: [task], e: Date.now() + 60_000 });
    // Not awaited one by one: as they arrive from the socket.
    await Promise.all([A.room.message(c, JSON.stringify({ t: 'w', k })), A.room.message(c, JSON.stringify({ t: 'h', on: task, y: 0 }))]);
    expect(c.state?.on).toBe(task);
    expect(c.take()).toEqual([{ t: 'p', on: task, who: [[adaId, 0]] }]);
  });
});
