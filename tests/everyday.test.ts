// The everyday layer: what the customer cards say, the product map, the
// number beside "My tasks" and the first steps on Home.
import { beforeAll, describe, expect, it } from 'vitest';
import { Client, login, setup, type Env } from './helpers';

let env: Env;
let ada: Client;
let lena: Client;
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
});

describe('customer signals', () => {
  it('counts overdue and untouched tasks, and the last touch, only when asked', async () => {
    const acc = env.a.accounts['Harborline Bank'];
    const plain = (await lena.get('/api/accounts?q=harborline')).json.accounts[0];
    expect(plain.overdueTasks).toBeUndefined();
    const before = (await lena.get('/api/accounts?q=harborline&signals=1')).json.accounts[0];
    await lena.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Late one', accountId: acc, dueDate: day(-3) });
    const stale = (await lena.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Forgotten one', accountId: acc })).json.task;
    await env.db.system((q) => q.query(`update tasks set updated_at = now() - interval '20 days' where id = $1`, [stale.id]));
    // A finished late task is not "overdue".
    const done = (await lena.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Done late', accountId: acc, dueDate: day(-5) })).json.task;
    await lena.patch(`/api/tasks/${done.id}`, { baseVersion: done.version, status: 'done' });
    await lena.post(`/api/accounts/${acc}/activities`, { kind: 'call', body: 'Checked in on the rollout.' });
    const after = (await lena.get('/api/accounts?q=harborline&signals=1')).json.accounts[0];
    expect(after.overdueTasks).toBe(before.overdueTasks + 1);
    expect(after.stuckTasks).toBe(before.stuckTasks + 1);
    expect(Date.now() - Date.parse(after.lastTouchAt)).toBeLessThan(60_000);
  });

  it('never counts another company’s tasks', async () => {
    const theirs = env.b.accounts['Harborline Bank'];
    const before = (await lena.get('/api/accounts?q=harborline&signals=1')).json.accounts[0].overdueTasks;
    await env.db.system((q) =>
      q.query(`insert into tasks (org_id, board_id, title, status, account_id, due_date, position) values ($1, $2, 'Theirs', 'todo', $3, current_date - 9, 1)`, [env.b.orgId, env.b.boards.csBoard, theirs]),
    );
    expect((await lena.get('/api/accounts?q=harborline&signals=1')).json.accounts[0].overdueTasks).toBe(before);
  });
});

describe('product map', () => {
  it('shows who has which product, by a choice field of a record type', async () => {
    const type = (
      await ada.post('/api/record-types', {
        kind: 'custom',
        key: 'subscription',
        name: { one: { en: 'Subscription' }, other: { en: 'Subscriptions' } },
        fields: [{ key: 'product', label: { en: 'Product' }, type: 'select', options: [{ key: 'core', label: { en: 'Core' } }, { key: 'insights', label: { en: 'Insights' } }] }],
      })
    ).json.type;
    const velto = env.a.accounts['Velto Mobility'];
    await ada.post('/api/records', { typeId: type.id, accountId: velto, name: 'Velto core', fields: { product: 'core' } });
    const r = await lena.get(`/api/accounts/whitespace?type=${type.id}&field=product`);
    expect(r.status).toBe(200);
    expect(r.json.options.map((o: any) => o.key)).toEqual(['core', 'insights']);
    const row = r.json.rows.find((x: any) => x.accountId === velto);
    expect(row.have).toEqual({ core: 1 });
    expect((await lena.get(`/api/accounts/whitespace?type=${type.id}&field=name`)).status).toBe(400);
    expect((await lena.get(`/api/accounts/whitespace?type=nope&field=product`)).status).toBe(400);
  });
});

describe('my tasks number and first steps', () => {
  it('counts my open late and due-today tasks', async () => {
    const before = (await lena.get('/api/tasks/counts')).json;
    await lena.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Due today', dueDate: new Date().toISOString().slice(0, 10), assigneeIds: [env.a.ids.lena] });
    await lena.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Was due', dueDate: day(-2), assigneeIds: [env.a.ids.lena] });
    await lena.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Not mine', dueDate: day(-2), assigneeIds: [env.a.ids.ada] });
    const after = (await lena.get('/api/tasks/counts')).json;
    expect(after.late).toBe(before.late + 1);
    expect(after.today).toBeGreaterThanOrEqual(before.today);
  });

  it('ticks the first steps off by what the person did, and can be put away', async () => {
    const fresh = await login(env, 'acme', 'sofia@demo.example');
    const start = (await fresh.get('/api/me/start')).json;
    expect(start.hidden).toBe(false);
    expect(Object.keys(start.steps).sort()).toEqual(['calendar', 'mention', 'notify', 'planned', 'task', 'touch']);
    const s = (await ada.get('/api/me/start')).json.steps;
    await ada.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Planned', dueDate: day(2), assigneeIds: [env.a.ids.lena] });
    const s2 = (await ada.get('/api/me/start')).json.steps;
    expect(s2.task && s2.planned).toBe(true);
    expect(s.touch).toBe(false);
    await ada.patch('/api/me', { prefs: { startHidden: true } });
    expect((await ada.get('/api/me/start')).json.hidden).toBe(true);
    // Another settings change keeps it put away.
    await ada.patch('/api/me', { prefs: { digestHour: 9 } });
    expect((await ada.get('/api/me/start')).json.hidden).toBe(true);
  });
});
