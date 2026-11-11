// Richer tasks: a board's own fields (and must-fill before done), history,
// following, links, time, look-alikes, checklists, saved views, plans, forms.
import { beforeAll, describe, expect, it } from 'vitest';
import { Client, login, setup, type Env } from './helpers';

let env: Env;
let ada: Client;
let lena: Client;
let mert: Client;
let sofia: Client;
let board: string;
const mk = async (who: Client, body: Record<string, unknown>) => (await who.post('/api/tasks', { boardId: board, ...body })).json.task;

beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
  mert = await login(env, 'acme', 'mert@demo.example');
  sofia = await login(env, 'acme', 'sofia@demo.example');
  board = env.a.boards.csBoard;
});

describe('a board’s own fields', () => {
  it('are defined on the board, checked on the task, and can be required before done', async () => {
    const r = await ada.patch(`/api/boards/${board}`, {
      taskFields: [
        { key: 'kind', label: { en: 'Type' }, type: 'select', options: [{ key: 'qbr', label: { en: 'QBR' } }, { key: 'training', label: { en: 'Training' } }] },
        { key: 'outcome', label: { en: 'Outcome', tr: 'Sonuç' }, type: 'text', required: 'done' },
        { key: 'reviewer', label: { en: 'Reviewer' }, type: 'person' },
        { key: 'billable', label: { en: 'Billable' }, type: 'checkbox' },
      ],
    });
    expect(r.status).toBe(200);
    expect(r.json.board.taskFields).toHaveLength(4);
    const t = await mk(lena, { title: 'Quarterly review', fields: { kind: 'QBR', reviewer: env.a.ids.mert, billable: true }, startDate: '2026-12-01', dueDate: '2026-12-05' });
    expect(t.fields).toEqual({ kind: 'qbr', reviewer: env.a.ids.mert, billable: true });
    expect(t.startDate).toBe('2026-12-01');
    expect((await lena.post('/api/tasks', { boardId: board, title: 'x', fields: { kind: 'nope' } })).status).toBe(400);
    expect((await lena.post('/api/tasks', { boardId: board, title: 'x', fields: { unknown: 1 } })).status).toBe(400);
    expect((await lena.post('/api/tasks', { boardId: board, title: 'x', startDate: '2026-12-09', dueDate: '2026-12-05' })).status).toBe(400);
    // Cannot be finished while "Outcome" is empty; the answer says which field, in words.
    const blocked = await lena.patch(`/api/tasks/${t.id}`, { baseVersion: t.version, status: 'done' });
    expect(blocked.status).toBe(400);
    expect(blocked.json.error).toBe('required_fields');
    expect(blocked.json.message).toContain('Outcome');
    const ok = await lena.patch(`/api/tasks/${t.id}`, { baseVersion: t.version, status: 'done', fields: { outcome: 'Renewed for two years' } });
    expect(ok.status).toBe(200);
    expect(ok.json.task.fields.kind).toBe('qbr');
    // Bulk: the ones that cannot be finished are skipped, not forced.
    const a = await mk(lena, { title: 'Bulk one' });
    const bulk = await lena.post('/api/tasks/bulk', { ids: [a.id], status: 'done' });
    expect(bulk.json).toMatchObject({ updated: 0, skipped: 1 });
  });
});

describe('history, following, links', () => {
  it('keeps a line for every change', async () => {
    const t = await mk(lena, { title: 'History' });
    await lena.patch(`/api/tasks/${t.id}`, { baseVersion: t.version, status: 'doing', dueDate: '2026-12-24', assigneeIds: [env.a.ids.mert], priority: 'high' });
    const d = (await lena.get(`/api/tasks/${t.id}`)).json.task;
    const kinds = d.events.map((e: any) => e.kind).sort();
    expect(kinds).toEqual(['assignees', 'created', 'due', 'priority', 'status']);
    expect(d.events.find((e: any) => e.kind === 'status').data).toEqual({ from: 'todo', to: 'doing' });
  });

  it('followers hear about comments and moves; nobody about their own', async () => {
    const t = await mk(lena, { title: 'Follow me' });
    // Someone who cannot open the board cannot follow its tasks.
    expect((await sofia.put(`/api/tasks/${t.id}/watch`, {})).status).toBe(404);
    expect((await ada.put(`/api/tasks/${t.id}/watch`, {})).json.watching).toBe(true);
    await mert.put(`/api/tasks/${t.id}/watch`, {});
    await lena.post(`/api/tasks/${t.id}/comments`, { body: 'Any news?' });
    await lena.patch(`/api/tasks/${t.id}`, { baseVersion: t.version, status: 'doing' });
    const got = await env.db.system((q) => q.query(`select user_id, data->>'what' as what from notifications where task_id = $1 and kind = 'followed' order by created_at`, [t.id]));
    expect(got.filter((n) => n.user_id === env.a.ids.mert).map((n) => n.what)).toEqual(['comment', 'status']);
    expect(got.some((n) => n.user_id === env.a.ids.lena)).toBe(false);
    expect((await lena.get(`/api/tasks/${t.id}`)).json.task.watchers.sort()).toEqual([env.a.ids.mert, env.a.ids.ada].sort());
    await mert.del(`/api/tasks/${t.id}/watch`);
    expect((await lena.get(`/api/tasks/${t.id}`)).json.task.watchers).toEqual([env.a.ids.ada]);
  });

  it('a task waits for another; circles are refused; finishing the blocker tells the waiting', async () => {
    const first = await mk(lena, { title: 'Sign contract' });
    const then = await mk(lena, { title: 'Kickoff', assigneeIds: [env.a.ids.mert] });
    expect((await lena.post(`/api/tasks/${then.id}/links`, { otherId: first.id, kind: 'blocked_by' })).status).toBe(201);
    expect((await lena.post(`/api/tasks/${first.id}/links`, { otherId: then.id, kind: 'blocked_by' })).json.error).toBe('link_loop');
    const d = (await lena.get(`/api/tasks/${then.id}`)).json.task;
    expect(d.links).toMatchObject([{ taskId: first.id, kind: 'blocked_by', done: false }]);
    expect((await lena.get(`/api/tasks/${first.id}`)).json.task.links[0].kind).toBe('blocks');
    const list = (await lena.get(`/api/boards/${board}/tasks`)).json.tasks;
    expect(list.find((x: any) => x.id === then.id).blockedBy).toBe(1);
    await lena.patch(`/api/tasks/${first.id}`, { baseVersion: first.version, status: 'done', fields: { outcome: 'Signed' } });
    const told = await env.db.system((q) => q.query(`select user_id from notifications where task_id = $1 and kind = 'unblocked'`, [then.id]));
    expect(told.map((n) => n.user_id)).toEqual([env.a.ids.mert]);
    expect((await lena.get(`/api/boards/${board}/tasks`)).json.tasks.find((x: any) => x.id === then.id).blockedBy).toBe(0);
    expect((await lena.del(`/api/tasks/${then.id}/links/${first.id}?kind=blocked_by`)).status).toBe(200);
    expect((await lena.get(`/api/tasks/${then.id}`)).json.task.links).toEqual([]);
    // A task of another company cannot be linked.
    const [other] = await env.db.system((q) => q.query('select id from tasks where org_id = $1 limit 1', [env.b.orgId]));
    expect((await lena.post(`/api/tasks/${then.id}/links`, { otherId: other.id, kind: 'relates' })).status).toBe(404);
  });
});

describe('time, look-alikes, checklists', () => {
  it('logs time on a task and adds it up per customer', async () => {
    const acc = env.a.accounts['Velto Mobility'];
    const t = await mk(lena, { title: 'Workshop', accountId: acc });
    expect((await lena.post(`/api/tasks/${t.id}/time`, { minutes: 90, note: 'Prep' })).status).toBe(201);
    await mert.post(`/api/tasks/${t.id}/time`, { minutes: 30 });
    expect((await sofia.post(`/api/tasks/${t.id}/time`, { minutes: 30 })).status).toBe(403);
    const d = (await lena.get(`/api/tasks/${t.id}`)).json.task;
    expect(d.time.total).toBe(120);
    const sum = (await lena.get(`/api/accounts/${acc}/time`)).json;
    expect(sum.total).toBe(120);
    expect(sum.people[0]).toEqual({ userId: env.a.ids.lena, minutes: 90 });
    // Only one's own entry can be removed (an admin may remove any).
    const mine = d.time.entries.find((e: any) => e.userId === env.a.ids.lena);
    const his = d.time.entries.find((e: any) => e.userId === env.a.ids.mert);
    expect((await lena.del(`/api/time/${his.id}`)).status).toBe(404);
    expect((await lena.del(`/api/time/${mine.id}`)).status).toBe(200);
  });

  it('finds open tasks that look like the one being added', async () => {
    await mk(lena, { title: 'Prepare renewal proposal for Harborline' });
    const r = (await lena.get(`/api/tasks/similar?boardId=${board}&title=${encodeURIComponent('Renewal proposal Harborline')}`)).json.tasks;
    expect(r.map((x: any) => x.title)).toEqual(['Prepare renewal proposal for Harborline']);
    expect((await lena.get(`/api/tasks/similar?boardId=${board}&title=${encodeURIComponent('Something else entirely')}`)).json.tasks).toEqual([]);
  });

  it('a saved checklist becomes subtasks in one go', async () => {
    const c = (await lena.post('/api/checklists', { name: 'QBR prep', items: ['Pull usage', 'Draft deck', 'Dry run'] })).json.checklist;
    const t = await mk(lena, { title: 'QBR' });
    expect((await lena.post(`/api/tasks/${t.id}/checklist`, { templateId: c.id })).json.added).toBe(3);
    expect((await lena.get(`/api/tasks/${t.id}`)).json.task.subtasks.map((s: any) => s.title)).toEqual(['Pull usage', 'Draft deck', 'Dry run']);
    expect((await sofia.post('/api/checklists', { name: 'No', items: ['x'] })).status).toBe(403);
    expect((await mert.del(`/api/checklists/${c.id}`)).status).toBe(404);
    expect((await ada.del(`/api/checklists/${c.id}`)).status).toBe(200);
  });
});

describe('saved views, plans, forms', () => {
  it('views are one’s own unless shared', async () => {
    const own = (await lena.post('/api/views', { boardId: board, name: 'Mine, late', filters: { assignees: ['me'], due: ['late'] } })).json.view;
    const shared = (await lena.post('/api/views', { boardId: board, name: 'QBRs', filters: { fields: { kind: ['qbr'] } }, shared: true })).json.view;
    expect((await mert.get(`/api/views?board=${board}`)).json.views.map((v: any) => v.name)).toEqual(['QBRs']);
    expect((await lena.get(`/api/views?board=${board}`)).json.views.map((v: any) => v.name)).toEqual(['QBRs', 'Mine, late']);
    expect((await mert.patch(`/api/views/${shared.id}`, { name: 'Hijack' })).status).toBe(404);
    expect((await lena.patch(`/api/views/${own.id}`, { name: 'Late and mine' })).json.view.name).toBe('Late and mine');
    expect((await lena.post('/api/views', { boardId: board, name: 'Bad', filters: { nope: 1 } })).status).toBe(400);
    expect((await lena.del(`/api/views/${own.id}`)).status).toBe(200);
  });

  it('a plan puts dated tasks on a customer', async () => {
    const tasks = [
      { title: 'Kickoff: {account_name}', dueInDays: 0, assignee: 'account_owner', subtasks: ['Agenda', 'Invite'] },
      { title: 'First check-in', dueInDays: 30, assignee: 'none' },
    ];
    expect((await lena.post('/api/plans', { name: 'Onboarding', boardId: board, tasks })).status).toBe(403);
    const plan = (await ada.post('/api/plans', { name: 'Onboarding', boardId: board, tasks })).json.plan;
    const acc = env.a.accounts['Harborline Bank'];
    const r = await lena.post(`/api/accounts/${acc}/plans`, { planId: plan.id, start: '2027-01-04' });
    expect(r.status).toBe(201);
    expect(r.json.tasks.map((t: any) => [t.title, t.dueDate])).toEqual([['Kickoff: Harborline Bank', '2027-01-04'], ['First check-in', '2027-02-03']]);
    expect(r.json.tasks[0].accountId).toBe(acc);
    expect((await lena.get(`/api/tasks/${r.json.tasks[0].id}`)).json.task.subtasks).toHaveLength(2);
    expect((await lena.get('/api/plans')).json.plans).toHaveLength(1);
  });

  it('a board’s form takes requests only when it is on, and only what it asks', async () => {
    expect((await lena.post(`/api/boards/${board}/requests`, { title: 'Need a deck' })).json.error).toBe('form_off');
    await ada.patch(`/api/boards/${board}`, { form: { on: true, title: 'Ask CS', fields: ['description', 'f:kind'], column: 'todo' } });
    const r = await mert.post(`/api/boards/${board}/requests`, { title: 'Need a deck', description: 'For Friday', dueDate: '2026-12-01', fields: { kind: 'training', billable: true } });
    expect(r.status).toBe(201);
    expect(r.json.task).toMatchObject({ title: 'Need a deck', description: 'For Friday', dueDate: null, fields: { kind: 'training' }, status: 'todo' });
    expect((await mert.get(`/api/tasks/${r.json.task.id}`)).json.task.watchers).toEqual([env.a.ids.mert]);
  });
});

describe('reports and the timeline window', () => {
  it('adds the work up inside what the person can see', async () => {
    const r = (await lena.get('/api/reports/work')).json;
    expect(r.totals.open).toBeGreaterThan(0);
    expect(r.weeks).toHaveLength(12);
    expect(r.weeks.reduce((n: number, w: any) => n + w.created, 0)).toBeGreaterThan(0);
    expect(r.people.some((p: any) => p.userId === env.a.ids.lena)).toBe(true);
    const one = (await lena.get(`/api/reports/work?board=${board}`)).json;
    expect(one.statuses.length).toBeGreaterThan(0);
    expect(one.boards.map((b: any) => b.boardId)).toEqual([board]);
    // A board the person cannot open adds nothing.
    const hidden = (await sofia.get(`/api/reports/work?board=${board}`)).json;
    expect(hidden.totals.open).toBe(0);
    const p = (await mert.get(`/api/reports/person/${env.a.ids.lena}`)).json;
    expect(Array.isArray(p.tasks)).toBe(true);
    expect(p.accounts).toBeGreaterThanOrEqual(0);
  });

  it('span=1 returns tasks whose bar touches the window; assignee can be anyone', async () => {
    const t = await mk(lena, { title: 'Long one', startDate: '2027-03-01', dueDate: '2027-03-20', assigneeIds: [env.a.ids.mert] });
    const inWindow = (await lena.get('/api/tasks?span=1&from=2027-03-10&to=2027-03-12')).json.tasks.map((x: any) => x.id);
    expect(inWindow).toContain(t.id);
    expect((await lena.get('/api/tasks?from=2027-03-10&to=2027-03-12')).json.tasks.map((x: any) => x.id)).not.toContain(t.id);
    expect((await lena.get(`/api/tasks?assignee=${env.a.ids.mert}`)).json.tasks.map((x: any) => x.id)).toContain(t.id);
  });
});
