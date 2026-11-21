// A request sent twice does its work once (lib/repeats.ts): a retry after a lost
// answer, a double click, a queue replaying.
import { beforeAll, describe, expect, it } from 'vitest';
import { cleanUp } from '../api/src/lib/scheduler';
import { Client, login, setup, type Env } from './helpers';

let env: Env;
let ada: Client;
let mert: Client;
let board: string;
const count = async (title: string) => (await env.db.system((q) => q.query(`select count(*)::int as n from tasks where title = $1`, [title])))[0].n;
const send = (c: Client, key: string, body: unknown, path = '/api/tasks', method = 'POST') => c.req(method, path, body, { 'idempotency-key': key });

beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
  mert = await login(env, 'acme', 'mert@demo.example');
  board = env.a.boards.csBoard;
});

describe('the same change sent again', () => {
  it('is done once, and answered the same way both times', async () => {
    const body = { boardId: board, title: 'Sent twice' };
    const one = await send(ada, 'key-sent-twice-0001', body);
    const two = await send(ada, 'key-sent-twice-0001', body);
    expect(one.status).toBe(201);
    expect(two.status).toBe(201);
    expect(two.json.task.id).toBe(one.json.task.id);
    expect(two.headers.get('idempotent-replayed')).toBe('true');
    expect(one.headers.get('idempotent-replayed')).toBeNull();
    expect(await count('Sent twice')).toBe(1);
  });

  it('is done once when both copies arrive at the same moment', async () => {
    const body = { boardId: board, title: 'Double click' };
    const both = await Promise.all([send(ada, 'key-double-click-01', body), send(ada, 'key-double-click-01', body)]);
    expect(both.map((r) => r.status).sort()).toEqual([201, 201]);
    expect(await count('Double click')).toBe(1);
  });

  it('with another key is another change', async () => {
    const body = { boardId: board, title: 'Meant twice' };
    await send(ada, 'key-meant-twice-01', body);
    await send(ada, 'key-meant-twice-02', body);
    expect(await count('Meant twice')).toBe(2);
  });

  it('covers edits and deletes too', async () => {
    const { task } = (await send(ada, 'key-edit-create-01', { boardId: board, title: 'To edit' })).json;
    const a = await send(ada, 'key-edit-patch-001', { baseVersion: task.version, title: 'Edited once' }, `/api/tasks/${task.id}`, 'PATCH');
    const b = await send(ada, 'key-edit-patch-001', { baseVersion: task.version, title: 'Edited once' }, `/api/tasks/${task.id}`, 'PATCH');
    // Without the key the second copy would be refused as out of date; with it, it is the first answer again.
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(b.json.task.version).toBe(a.json.task.version);
    const gone = await send(ada, 'key-edit-delete-01', undefined, `/api/tasks/${task.id}`, 'DELETE');
    const again = await send(ada, 'key-edit-delete-01', undefined, `/api/tasks/${task.id}`, 'DELETE');
    expect(again.status).toBe(gone.status);
  });
});

describe('a key means one change', () => {
  it('is refused on a different request, and nothing changes', async () => {
    await send(ada, 'key-one-change-001', { boardId: board, title: 'The first' });
    const other = await send(ada, 'key-one-change-001', { boardId: board, title: 'Something else' });
    expect(other.status).toBe(422);
    expect(other.json.error).toBe('repeat_mismatch');
    expect(await count('Something else')).toBe(0);
  });

  it('is not used up by a request that failed before changing anything', async () => {
    const bad = await send(ada, 'key-failed-first-01', { boardId: board, title: '' });
    expect(bad.status).toBe(400);
    const good = await send(ada, 'key-failed-first-01', { boardId: board, title: 'Second try' });
    expect(good.status).toBe(201);
  });

  it('belongs to one person: the same key from someone else is their own change', async () => {
    const body = { boardId: board, title: 'Each their own' };
    expect((await send(ada, 'key-per-person-0001', body)).status).toBe(201);
    expect((await send(mert, 'key-per-person-0001', body)).status).toBe(201);
    expect(await count('Each their own')).toBe(2);
  });

  it('must look like a key', async () => {
    expect((await send(ada, 'short', { boardId: board, title: 'Bad key' })).status).toBe(400);
  });
});

describe('keys do not pile up', () => {
  it('are cleared after a day', async () => {
    await env.db.system((q) => q.query(`update idempotency_keys set created_at = now() - interval '25 hours' where key = 'key-sent-twice-0001'`));
    await cleanUp(env.deps);
    const left = await env.db.system((q) => q.query(`select key from idempotency_keys where key in ('key-sent-twice-0001', 'key-meant-twice-01') order by 1`));
    expect(left.map((r: any) => r.key)).toEqual(['key-meant-twice-01']);
  });
});

// Security audit M1: what is shown once is never kept for a repeat.
describe('an answer with a secret in it', () => {
  const kept = async (key: string) =>
    (await env.db.system((q) => q.query<{ status: number | null; response: unknown }>(`select status, response from idempotency_keys where key = $1`, [key])))[0];

  it('a new API key: only the status is kept, and the repeat does not show the key again', async () => {
    const body = { name: 'Kept once', canWrite: false };
    const one = await send(ada, 'key-api-key-once-01', body, '/api/dev/keys');
    expect(one.status).toBe(201);
    expect(one.json.token).toMatch(/^chk_/);
    const row = await kept('key-api-key-once-01');
    expect(row).toEqual({ status: 201, response: null });
    const two = await send(ada, 'key-api-key-once-01', body, '/api/dev/keys');
    expect(two.status).toBe(201);
    expect(two.json).toEqual({ ok: true, repeated: true });
    expect(JSON.stringify(two.json)).not.toContain('chk_');
    const keys = (await ada.get('/api/dev/keys')).json.keys.filter((k: any) => k.name === 'Kept once');
    expect(keys).toHaveLength(1);
  });

  it('an authenticator secret and recovery codes are not kept either', async () => {
    const totp = await send(mert, 'key-totp-start-0001', {}, '/api/me/security/totp');
    expect(totp.status).toBe(200);
    expect(totp.json.secret).toBeTruthy();
    // (This route writes outside the request transaction, so it may claim no key at all: either way nothing is kept.)
    expect((await kept('key-totp-start-0001'))?.response ?? null).toBeNull();
    const hook = await send(ada, 'key-webhook-made-01', { url: 'https://hooks.example.com/in', events: ['task.created'] }, '/api/dev/webhooks');
    expect(hook.status).toBe(201);
    expect((await kept('key-webhook-made-01')).response).toBeNull();
  });

  // Review S2: the personal calendar feed address is a secret too (only its hash is stored on the person).
  it('a calendar feed address is not kept', async () => {
    const r = await send(mert, 'key-calendar-link-01', {}, '/api/me/calendar');
    expect(r.status).toBe(200);
    expect(r.json.url).toMatch(/\/api\/calendar\/[A-Za-z0-9_-]{16,}\.ics$/);
    expect(await kept('key-calendar-link-01')).toEqual({ status: 200, response: null });
    const again = await send(mert, 'key-calendar-link-01', {}, '/api/me/calendar');
    expect(again.json).toEqual({ ok: true, repeated: true });
  });

  it('ordinary answers are still kept whole', async () => {
    await send(ada, 'key-ordinary-kept-1', { boardId: board, title: 'Kept whole' });
    expect((await kept('key-ordinary-kept-1')).response).toMatchObject({ task: { title: 'Kept whole' } });
  });

  it('the detector finds secrets by name and by shape, at any depth', async () => {
    const { holdsSecret } = await import('../api/src/lib/repeats');
    expect(holdsSecret({ key: { id: 'x' }, token: 'abc' })).toBe(true);
    expect(holdsSecret({ list: [{ deep: { recoveryCodes: ['a1'] } }] })).toBe(true);
    expect(holdsSecret({ note: 'use chr_abcdefgh12345678 now' })).toBe(true);
    expect(holdsSecret({ uri: 'otpauth://totp/x?secret=Y' })).toBe(true);
    expect(holdsSecret({ url: 'https://acme.example/api/inbound/tickets/AbCdEfGhIjKlMnOpQr' })).toBe(true);
    expect(holdsSecret({ url: 'https://acme.example/api/calendar/AbCdEfGhIjKlMnOpQr.ics' })).toBe(true);
    expect(holdsSecret({ url: 'https://acme.example/support/enter#token=AbCdEfGhIjKlMnOpQr' })).toBe(true);
    expect(holdsSecret({ task: { title: 'Call Ada', token: null } })).toBe(false);
  });
});
