// Session recording for support: the browser sends batches of events, the
// support desk reads them back, a company never can, and old recordings go.
import { gzipSync, strToU8 } from 'fflate';
import { beforeAll, describe, expect, it } from 'vitest';
import { cleanUp } from '../api/src/lib/scheduler';
import { BASE, Client, login, setup, type Env } from './helpers';

const STAFF_KEY = 'staff-key-staff-key-staff-key-9090';
const DESK = `https://desk.${BASE}`;

let env: Env;
let lena: Client;
let ada: Client;

const b64url = (bytes: Uint8Array) => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
/** A batch of rrweb-ish events, gzipped and base64url'd, the way the browser sends it. */
const chunk = (session: string, seq: number, extra: Record<string, unknown> = {}) => {
  const events = [{ type: 2, data: { seq }, timestamp: 1 }, { type: 3, data: {}, timestamp: 2 }];
  return { session, seq, count: events.length, events: b64url(gzipSync(strToU8(JSON.stringify(events)))), ...extra };
};
const sys = (sql: string, params: unknown[] = []) => env.db.system((q) => q.query(sql, params)) as Promise<any[]>;
const desk = (method: string, path: string, body?: unknown) =>
  env.app.request(`${DESK}/api/desk${path}`, {
    method,
    headers: { 'x-curahold-staff-key': STAFF_KEY, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeAll(async () => {
  env = await setup({ staffKey: STAFF_KEY, support: { email: 'desk@curahold.test' } });
  lena = await login(env, 'acme', 'lena@demo.example');
  ada = await login(env, 'acme', 'ada@demo.example');
  // Recording is off until an administrator turns it on (see the first test).
  await ada.put('/api/support/recording', { on: true });
});

describe('recording is off until a company turns it on', () => {
  it('a new company records nothing, and drops what a browser sends anyway', async () => {
    const fresh = await setup({ staffKey: STAFF_KEY, support: { email: 'desk@curahold.test' } });
    const lenaFresh = await login(fresh, 'acme', 'lena@demo.example');
    expect((await lenaFresh.get('/api/me')).json.org.recordSessions).toBe(false);
    const id = crypto.randomUUID();
    const r = await lenaFresh.post('/api/replay', chunk(id, 0));
    expect(r.status).toBe(204);
    expect(r.headers.get('x-curahold-record')).toBe('off');
    const rows = await fresh.db.system((q) => q.query(`select count(*)::int as n from replay_sessions where id = $1`, [id]));
    expect(rows[0].n).toBe(0);
  });
});

describe('taking in a recording', () => {
  it('opens a recording, adds to it, and keeps nothing a form could not have sent', async () => {
    const id = crypto.randomUUID();
    const first = await lena.post('/api/replay', chunk(id, 0, { page: '/accounts?token=secret#x', agent: 'Chrome 141 · macOS' }));
    expect(first.status).toBe(204);
    const second = await lena.post('/api/replay', chunk(id, 1, { error: true, page: '/renewals' }));
    expect(second.status).toBe(204);

    const [s] = await sys(`select * from replay_sessions where id = $1`, [id]);
    expect(s.events).toBe(4);
    expect(Number(s.bytes)).toBeGreaterThan(0);
    expect(s.had_error).toBe(true);
    // The address is kept without its query values or fragment.
    expect(s.page_first).toBe('/accounts?token');
    expect(s.page_last).toBe('/renewals');
    expect((await sys(`select count(*)::int as n from replay_chunks where session_id = $1`, [id]))[0].n).toBe(2);
  });

  it('the same batch twice is written once, and a stranger cannot add to a recording', async () => {
    const id = crypto.randomUUID();
    await lena.post('/api/replay', chunk(id, 0));
    await lena.post('/api/replay', chunk(id, 0)); // a retry
    expect((await sys(`select count(*)::int as n from replay_chunks where session_id = $1`, [id]))[0].n).toBe(1);
    // Someone else cannot append to a recording that is not theirs.
    expect((await ada.post('/api/replay', chunk(id, 1))).status).toBe(403);
  });

  it('a company can never read its recordings: the app role has no way to', async () => {
    const orgId = env.a.orgId;
    const userId = env.a.ids.lena;
    await expect(env.db.tenant({ orgId, userId }, (q) => q.query('select * from replay_sessions'))).rejects.toThrow();
    await expect(env.db.tenant({ orgId, userId }, (q) => q.query('select * from replay_chunks'))).rejects.toThrow();
  });

  it('off for the company: the batch is dropped and the browser is told to stop', async () => {
    const off = await ada.put('/api/support/recording', { on: false });
    expect(off.status).toBe(200);
    const id = crypto.randomUUID();
    const r = await lena.post('/api/replay', chunk(id, 0));
    expect(r.status).toBe(204);
    expect(r.headers.get('x-curahold-record')).toBe('off');
    expect((await sys(`select count(*)::int as n from replay_sessions where id = $1`, [id]))[0].n).toBe(0);
    // /me stops advertising it too.
    await ada.put('/api/support/recording', { on: true });
    const me = await lena.get('/api/me');
    expect(me.json.org.recordSessions).toBe(true);
  });
});

describe('the support desk watches a recording', () => {
  it('lists the asker’s recordings on their request and plays one, writing the playback down', async () => {
    const id = crypto.randomUUID();
    await lena.post('/api/replay', chunk(id, 0, { error: true, page: '/renewals' }));
    const ref = (await lena.post('/api/help', { category: 'bug', subject: 'Renewals board is blank', description: 'It will not open this morning.' })).json.request.ref as string;
    await env.settle();

    const detail = await (await desk('GET', `/requests/${ref}`)).json();
    // The asker's recent recordings, newest first; this one is among them, flagged as hitting an error.
    expect(detail.request.replays[0].id).toBe(id);
    expect(detail.request.replays.find((r: any) => r.id === id)).toMatchObject({ hadError: true });

    const play = await desk('GET', `/requests/${ref}/replays/${id}`);
    expect(play.status).toBe(200);
    const body = await play.json();
    expect(body.chunks).toHaveLength(1);
    // The playback is in the desk's own log.
    const [log] = await sys(`select action, message_id from desk_log where action = 'replay' and ref = $1 order by id desc limit 1`, [ref]);
    expect(log.message_id).toBe(id);

    // A recording that is not this person's does not open under their request.
    const other = crypto.randomUUID();
    await ada.post('/api/replay', chunk(other, 0));
    expect((await desk('GET', `/requests/${ref}/replays/${other}`)).status).toBe(404);
  });
});

describe('recordings do not pile up', () => {
  it('a recording older than its week is cleared, chunks and all', async () => {
    const id = crypto.randomUUID();
    await env.db.system(async (q) => {
      await q.query(`insert into replay_sessions (id, org_id, user_id, started_at, last_at) values ($1, $2, $3, now() - interval '8 days', now() - interval '8 days')`, [id, env.a.orgId, env.a.ids.lena]);
      await q.query(`insert into replay_chunks (session_id, org_id, seq, body) values ($1, $2, 0, 'x')`, [id, env.a.orgId]);
    });
    await cleanUp(env.deps);
    expect((await sys(`select count(*)::int as n from replay_sessions where id = $1`, [id]))[0].n).toBe(0);
    expect((await sys(`select count(*)::int as n from replay_chunks where session_id = $1`, [id]))[0].n).toBe(0);
  });
});
