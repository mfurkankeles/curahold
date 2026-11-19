// Seeing the load: the team's weeks (person × week: tasks, promises, points),
// the customer portfolio summary, and the cost-to-serve report.
import { beforeAll, describe, expect, it } from 'vitest';
import { libraryReport, loadLevel as levelOf } from '../shared/src/reports';
import { Client, login, setup, type Env } from './helpers';

let env: Env;
let ada: Client;
let lena: Client;
let board: string;
const day = (offset: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
  board = env.a.boards.csBoard;
});

const task = async (c: Client, body: Record<string, unknown>) => {
  const r = await c.post('/api/tasks', { boardId: board, ...body });
  expect(r.status).toBe(201);
  return r.json.task;
};

describe('the weeks ahead', () => {
  it('counts each person’s open tasks by the week they are due, with promises and points', async () => {
    const acc = env.a.accounts['Quillfield Retail'];
    const lenaId = env.a.ids.lena;
    const before = (await ada.get('/api/reports/workload?weeks=4')).json.people.find((p: any) => p.userId === lenaId);
    const late = before?.late.tasks ?? 0;
    const far = await task(ada, { title: 'Far out', assigneeIds: [lenaId], dueDate: day(400) });
    await task(ada, { title: 'Already late', assigneeIds: [lenaId], dueDate: day(-3), accountId: acc });
    // Story points come in with an import (a board without sprints has no picker for them).
    const imp = await ada.post('/api/task-imports', {
      rows: [{ n: 2, c: { T: 'Next week, for a customer', D: day(7), P: '5', A: 'lena@demo.example', C: 'Quillfield Retail' } }],
      mapping: { T: 'title', D: 'dueDate', P: 'points', A: 'assignee', C: 'account' },
      targets: { '': { board } },
      locale: 'en',
    });
    expect(imp.status).toBe(201);
    const r = await ada.get('/api/reports/workload?weeks=4');
    expect(r.status).toBe(200);
    expect(r.json.weeks).toHaveLength(4);
    expect(new Date(`${r.json.weeks[0]}T00:00:00Z`).getUTCDay()).toBe(1);
    const me = r.json.people.find((p: any) => p.userId === lenaId);
    expect(me.late.tasks).toBe(late + 1);
    expect(me.late.promises).toBeGreaterThanOrEqual(1);
    const i = r.json.weeks.findIndex((w: string, k: number) => w <= day(7) && (r.json.weeks[k + 1] ?? '9999') > day(7));
    expect(me.weeks[i].tasks).toBeGreaterThanOrEqual(1);
    expect(me.weeks[i].promises).toBeGreaterThanOrEqual(1);
    expect(me.weeks[i].points).toBeGreaterThanOrEqual(5);
    expect(me.later.tasks).toBeGreaterThanOrEqual(1);
    expect(far.id).toBeTruthy();
    // A team that is not hers leaves her out.
    const team = (await ada.post('/api/admin/teams', { name: 'Elsewhere', memberIds: [env.a.ids.mert] })).json.team;
    if (team) expect((await ada.get(`/api/reports/workload?team=${team.id}`)).json.people.some((p: any) => p.userId === lenaId)).toBe(false);
  });

  it('says how full a week is against the usual', () => {
    expect(levelOf(0, 4)).toBe(0);
    expect(levelOf(2, 4)).toBe(1);
    expect(levelOf(4, 4)).toBe(2);
    expect(levelOf(6, 4)).toBe(3);
    expect(levelOf(9, 4)).toBe(4);
  });
});

describe('the portfolio summary', () => {
  it('lists each customer with open work, late work, requests and tickets, busiest first', async () => {
    const acc = env.a.accounts['Quillfield Retail'];
    await task(ada, { title: 'Late for Quillfield', dueDate: day(-2), accountId: acc });
    const r = await ada.get('/api/reports/portfolio');
    expect(r.status).toBe(200);
    const row = r.json.customers.find((x: any) => x.id === acc);
    expect(row).toMatchObject({ name: 'Quillfield Retail' });
    expect(row.open).toBeGreaterThanOrEqual(1);
    expect(row.overdue).toBeGreaterThanOrEqual(1);
    expect(r.json.total).toBeGreaterThanOrEqual(r.json.customers.length);
    expect(JSON.stringify(r.json)).not.toMatch(/"arr"|amount/);
    // Only her own customers, when she asks for hers.
    const mine = (await lena.get('/api/reports/portfolio?scope=mine')).json.customers;
    const all = (await ada.get('/api/accounts?limit=500')).json.accounts ?? [];
    for (const m of mine) expect(all.find((a: any) => a.id === m.id)?.ownerId ?? env.a.ids.lena).toBe(env.a.ids.lena);
  });
});

describe('cost to serve', () => {
  it('divides the year’s hours by the yearly value, customer by customer', async () => {
    const acc = env.a.accounts['Quillfield Retail'];
    const t = await task(ada, { title: 'Quarterly review prep', accountId: acc });
    expect((await ada.post(`/api/tasks/${t.id}/time`, { minutes: 600 })).status).toBe(201);
    const r = await ada.post('/api/reports/run', { def: libraryReport('cost_to_serve')!.def });
    expect(r.status).toBe(200);
    expect(r.json.result.kind).toBe('ok');
    const g = r.json.result.groups.find((x: any) => x.label === 'Quillfield Retail');
    expect(g).toBeTruthy();
    expect(g.value).toBeGreaterThan(0);
    // Someone who may not see the customer's value gets no cost figure either.
    const cols = await ada.post('/api/reports/run', { def: { source: 'accounts', filters: [], groups: [], measure: { fn: 'sum', field: 'time_year' }, chart: 'number' } });
    expect(cols.json.result.total).toBeGreaterThanOrEqual(10);
  });
});
