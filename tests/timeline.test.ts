// The customer timeline, the explainable health score and the weekly summary.
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_HEALTH } from '../shared/src/health';
import { flushHealth } from '../api/src/lib/health';
import { render, loadRenderCtx } from '../api/src/lib/notify';
import { buildWeekly, sendWeekly } from '../api/src/lib/weekly';
import { Client, login, setup, type Env } from './helpers';

let env: Env;
let ada: Client; // admin
let mert: Client; // manager
let lena: Client; // member
let zeynep: Client; // member
let sofia: Client; // viewer
let acc: Record<string, string>;

beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
  mert = await login(env, 'acme', 'mert@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
  zeynep = await login(env, 'acme', 'zeynep@demo.example');
  sofia = await login(env, 'acme', 'sofia@demo.example');
  acc = env.a.accounts;
});

describe('activities and the timeline', () => {
  it('people log notes and calls; only the writer or a customer manager changes them', async () => {
    const made = await lena.post(`/api/accounts/${acc['Cedarmoor Health']}/activities`, { kind: 'call', body: 'Talked through the rollout plan.' });
    expect(made.status).toBe(201);
    const id = made.json.activity.id;
    expect(made.json.activity).toMatchObject({ kind: 'call', pinned: false });
    expect((await sofia.post(`/api/accounts/${acc['Cedarmoor Health']}/activities`, { body: 'x' })).status).toBe(403);
    expect((await zeynep.patch(`/api/activities/${id}`, { body: 'changed' })).status).toBe(403);
    const edited = await lena.patch(`/api/activities/${id}`, { body: 'Talked through the rollout plan and training.', pinned: true });
    expect(edited.json.activity).toMatchObject({ pinned: true });
    expect(edited.json.activity.editedAt).not.toBeNull();
    expect((await mert.patch(`/api/activities/${id}`, { pinned: false })).status).toBe(200);
    // A date in the future is refused; an earlier one is fine.
    expect((await lena.post(`/api/accounts/${acc['Cedarmoor Health']}/activities`, { body: 'later', happenedAt: '2099-01-01T10:00:00Z' })).status).toBe(400);
    const past = await lena.post(`/api/accounts/${acc['Cedarmoor Health']}/activities`, { kind: 'meeting', body: 'Quarterly review.', happenedAt: new Date(Date.now() - 3 * 86400000).toISOString() });
    expect(past.status).toBe(201);
  });

  it('the timeline brings activities, tasks, finished tasks, comments and contacts together, newest first', async () => {
    const boards = (await ada.get('/api/boards')).json.boards;
    const board = boards[0];
    const task = (await lena.post('/api/tasks', { boardId: board.id, title: 'Send the training deck', accountId: acc['Cedarmoor Health'] })).json.task;
    await lena.post(`/api/tasks/${task.id}/comments`, { body: 'Deck is ready.' });
    const doneCol = board.columns.find((c: any) => c.done).key;
    await lena.patch(`/api/tasks/${task.id}`, { baseVersion: task.version, status: doneCol });
    const type = (await ada.post('/api/record-types', { kind: 'contact' })).json.type;
    await ada.post('/api/records', { typeId: type.id, accountId: acc['Cedarmoor Health'], fields: { first_name: 'Nora', last_name: 'Lind', stance: 'champion', decision: 'decision_maker' } });

    const tl = (await lena.get(`/api/accounts/${acc['Cedarmoor Health']}/timeline`)).json;
    const types = tl.items.map((i: any) => i.type);
    expect(types).toEqual(expect.arrayContaining(['activity', 'task_created', 'task_done', 'comment', 'contact']));
    const ats = tl.items.map((i: any) => i.at);
    expect([...ats].sort().reverse()).toEqual(ats);
    // Older items page by date.
    const page = (await lena.get(`/api/accounts/${acc['Cedarmoor Health']}/timeline?limit=5`)).json;
    expect(page.items).toHaveLength(5);
    const rest = (await lena.get(`/api/accounts/${acc['Cedarmoor Health']}/timeline?limit=5&before=${encodeURIComponent(page.next)}`)).json;
    expect(rest.items.every((i: any) => i.at < page.next)).toBe(true);
  });

  it('a finished task keeps when it was finished; reopening clears it', async () => {
    const board = (await ada.get('/api/boards')).json.boards[0];
    const t = (await ada.post('/api/tasks', { boardId: board.id, title: 'Close the loop' })).json.task;
    const done = board.columns.find((c: any) => c.done).key;
    const open = board.columns.find((c: any) => !c.done).key;
    const v2 = (await ada.patch(`/api/tasks/${t.id}`, { baseVersion: t.version, status: done })).json.task;
    const [r1] = await env.db.system((q) => q.query('select done_at from tasks where id = $1', [t.id]));
    expect(r1.done_at).not.toBeNull();
    await ada.patch(`/api/tasks/${t.id}`, { baseVersion: v2.version, status: open });
    const [r2] = await env.db.system((q) => q.query('select done_at from tasks where id = $1', [t.id]));
    expect(r2.done_at).toBeNull();
  });

  it('a customer someone cannot reach has no timeline for them', async () => {
    const roles = Object.fromEntries((await ada.get('/api/admin/roles')).json.roles.map((r: any) => [r.key, r]));
    const member = roles.member;
    await ada.patch(`/api/admin/roles/${member.id}`, { perms: member.perms.filter((p: string) => p !== 'accounts.view_all') });
    expect((await lena.get(`/api/accounts/${acc['Velto Mobility']}/timeline`)).status).toBe(404);
    expect((await lena.post(`/api/accounts/${acc['Velto Mobility']}/activities`, { body: 'x' })).status).toBe(404);
    await ada.patch(`/api/admin/roles/${member.id}`, { perms: member.perms });
  });

  it('a logged touch takes a customer off the "gone quiet" card', async () => {
    const pages = (await ada.get('/api/pages')).json.pages;
    const page = pages.find((p: any) => p.cards.some((c: any) => c.type === 'quiet'));
    const card = page.cards.find((c: any) => c.type === 'quiet');
    const before = (await ada.get(`/api/pages/${page.id}/data`)).json.data[card.id];
    const quietIds = before.rows.map((r: any) => r.accountId);
    const target = quietIds.find((id: string) => id === acc['Orchardly Foods']) ?? quietIds[0];
    if (!target) return; // nothing quiet in this data set
    await ada.post(`/api/accounts/${target}/activities`, { kind: 'email', body: 'Checked in.' });
    const after = (await ada.get(`/api/pages/${page.id}/data`)).json.data[card.id];
    expect(after.rows.map((r: any) => r.accountId)).not.toContain(target);
  });
});

describe('health score', () => {
  it('switching it on adds the field, scores every customer and records today', async () => {
    expect((await lena.put('/api/health/config', { config: { ...DEFAULT_HEALTH, enabled: true } })).status).toBe(403);
    const res = await mert.put('/api/health/config', { config: { ...DEFAULT_HEALTH, enabled: true } });
    expect(res.status).toBe(200);
    const me = (await lena.get('/api/me')).json;
    expect(me.org.accountFields.find((f: any) => f.key === 'health_score')).toMatchObject({ type: 'number', health: true });
    expect(me.org.health).toEqual({ enabled: true, bands: { watch: 40, good: 70 } });
    const list = (await lena.get('/api/accounts')).json.accounts;
    expect(list.every((a: any) => typeof a.fields.health_score === 'number')).toBe(true);
    const [h] = await env.db.system((q) => q.query(`select count(*)::int as n from health_history where org_id = $1`, [env.a.orgId]));
    expect(h.n).toBe(list.length);
    // Nobody can type a score in.
    expect((await ada.patch(`/api/accounts/${acc['Velto Mobility']}`, { fields: { health_score: 99 } })).status).toBe(400);
  });

  it('every point is explained', async () => {
    const r = (await lena.get(`/api/accounts/${acc['Cedarmoor Health']}/health`)).json;
    expect(r.health.score).toBeGreaterThanOrEqual(0);
    const keys = r.health.parts.map((p: any) => p.key);
    expect(keys).toEqual(['touch', 'tasks', 'support', 'champion', 'decision', 'blockers', 'judgement']);
    const champion = r.health.parts.find((p: any) => p.key === 'champion');
    expect(champion).toMatchObject({ points: 100, detail: { names: ['Nora Lind'] } });
    const touch = r.health.parts.find((p: any) => p.key === 'touch');
    expect(touch.detail.days).toBeLessThanOrEqual(1);
    const sum = r.health.parts.reduce((n: number, p: any) => n + p.earned, 0);
    expect(Math.abs(sum - r.health.score)).toBeLessThanOrEqual(3);
  });

  it('a change to a customer moves its score right after the request', async () => {
    const id = acc['Velto Mobility'];
    const before = (await ada.get(`/api/accounts/${id}`)).json.account.fields.health_score;
    const type = (await ada.get('/api/record-types')).json.types.find((t: any) => t.kind === 'contact');
    await ada.post('/api/records', { typeId: type.id, accountId: id, fields: { first_name: 'Iris', last_name: 'Vale', stance: 'champion', decision: 'decision_maker' } });
    await ada.post(`/api/accounts/${id}/activities`, { kind: 'meeting', body: 'Exec sponsor meeting.' });
    await env.settle();
    await flushHealth(env.deps);
    const after = (await ada.get(`/api/accounts/${id}`)).json.account.fields.health_score;
    expect(after).toBeGreaterThan(before);
  });

  it('a role that may not see the score gets neither the score nor its reasons', async () => {
    const fields = (await ada.get('/api/me')).json.org.accountFields;
    const next = fields.map((f: any) => (f.key === 'health_score' ? { ...f, access: { view: ['admin', 'manager'] } } : f));
    expect((await ada.put('/api/account-fields', { fields: next })).status).toBe(200);
    expect((await lena.get(`/api/accounts/${acc['Cedarmoor Health']}/health`)).status).toBe(404);
    expect((await lena.get(`/api/accounts/${acc['Cedarmoor Health']}`)).json.account.fields.health_score).toBeUndefined();
    expect((await mert.get(`/api/accounts/${acc['Cedarmoor Health']}/health`)).status).toBe(200);
    await ada.put('/api/account-fields', { fields });
  });

  it('settings can be previewed before saving, including a number field', async () => {
    const cfg = { ...DEFAULT_HEALTH, enabled: true, signals: [...DEFAULT_HEALTH.signals, { id: 'arr', key: 'number', weight: 20, field: 'arr', good: 100000, bad: 10000 }] };
    const p = (await mert.post('/api/health/preview', { config: cfg })).json;
    expect(p.counts.good + p.counts.watch + p.counts.risk + p.counts.none).toBe(6);
    expect(p.lowest.length).toBeGreaterThan(0);
    expect(p.lowest[0].score).toBeLessThanOrEqual(p.lowest[p.lowest.length - 1].score);
  });

  it('switching it off removes the field and the values', async () => {
    await mert.put('/api/health/config', { config: { ...DEFAULT_HEALTH, enabled: false } });
    const me = (await ada.get('/api/me')).json;
    expect(me.org.accountFields.some((f: any) => f.key === 'health_score')).toBe(false);
    const list = (await ada.get('/api/accounts')).json.accounts;
    expect(list.some((a: any) => 'health_score' in a.fields)).toBe(false);
    await mert.put('/api/health/config', { config: { ...DEFAULT_HEALTH, enabled: true } });
  });
});

describe('weekly summary', () => {
  it("covers renewals, falling scores (with the reason) and quiet customers, in the person's language", async () => {
    // Zeynep's customer fell 30 points since a week ago.
    const id = acc['Velto Mobility'];
    const lastWeek = new Date(Date.now() - 8 * 86400000).toISOString().slice(0, 10);
    const now = (await ada.get(`/api/accounts/${id}`)).json.account.fields.health_score;
    await env.db.system((q) => q.query('insert into health_history (org_id, account_id, day, score) values ($1, $2, $3, $4) on conflict do nothing', [env.a.orgId, id, lastWeek, Math.min(100, now + 30)]));
    const zid = env.a.ids.zeynep;
    const data = await env.db.system((q) => buildWeekly(q, env.a.orgId, zid, new Date(), 'en'));
    expect(data).not.toBeNull();
    expect(data!.accounts).toBe(2);
    expect(data!.drops.map((d) => d.name)).toContain('Velto Mobility');
    expect(data!.renewalCount).toBeGreaterThanOrEqual(0);
  });

  it('goes out on Monday at the chosen hour, once', async () => {
    // The coming Monday, 08:00 in Istanbul (05:00 UTC); Velto's score a week before it was 30 points higher.
    const monday = new Date();
    monday.setUTCDate(monday.getUTCDate() + 2 + ((8 - monday.getUTCDay() - 2 + 7) % 7));
    monday.setUTCHours(5, 0, 0, 0);
    const weekBefore = new Date(monday.getTime() - 8 * 86400000).toISOString().slice(0, 10);
    const id = acc['Velto Mobility'];
    const now = (await ada.get(`/api/accounts/${id}`)).json.account.fields.health_score;
    await env.db.system((q) => q.query(`update orgs set timezone = 'Europe/Istanbul' where id = $1`, [env.a.orgId]));
    await env.db.system((q) =>
      q.query('insert into health_history (org_id, account_id, day, score) values ($1, $2, $3, $4) on conflict (org_id, account_id, day) do update set score = excluded.score', [env.a.orgId, id, weekBefore, Math.min(100, now + 30)]),
    );
    const weeklyRows = () => env.db.system((q) => q.query(`select * from notifications where org_id = $1 and kind = 'weekly'`, [env.a.orgId]));
    expect(await sendWeekly(env.deps, monday)).toBeGreaterThan(0);
    const rows = await weeklyRows();
    expect(rows.length).toBeGreaterThan(0);
    await sendWeekly(env.deps, monday);
    expect((await weeklyRows()).length).toBe(rows.length); // once per person per week
    const z = rows.find((r: any) => r.user_id === env.a.ids.zeynep)!;
    const ctx = await env.db.system((q) => loadRenderCtx(q, env.deps, z, 'tr'));
    const msg = render(ctx);
    expect(msg.title).toContain('Haftan');
    expect(msg.body).toContain('Velto Mobility');
    // Not on a Tuesday.
    expect(await sendWeekly(env.deps, new Date(monday.getTime() + 86400000))).toBe(0);
  });
});

describe('assistant', () => {
  it('can log a note on a customer by name', async () => {
    const { token } = (await zeynep.post('/api/dev/keys', { name: 'AI', canWrite: true })).json;
    const res = await env.app.request('https://acme.curahold.test/mcp', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'add_note', arguments: { account: 'Quillfield Retail', kind: 'call', text: 'Renewal call: they want a multi-year option.' } } }),
    });
    const r = (await res.json()).result;
    expect(r.isError).toBe(false);
    const tl = (await zeynep.get(`/api/accounts/${acc['Quillfield Retail']}/timeline`)).json;
    expect(tl.items[0]).toMatchObject({ type: 'activity', activity: { kind: 'call', body: 'Renewal call: they want a multi-year option.' } });
    const fetched = await env.app.request('https://acme.curahold.test/mcp', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'fetch', arguments: { id: `account:${acc['Quillfield Retail']}` } } }),
    });
    const f = (await fetched.json()).result.structuredContent;
    expect(f.timeline.recent.length).toBeGreaterThan(0);
    expect(typeof f.health.score).toBe('number');
  });
});
