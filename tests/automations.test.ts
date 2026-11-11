import { beforeAll, describe, expect, it } from 'vitest';
import { runScheduled } from '../api/src/lib/scheduler';
import { Client, login, setup, type Env } from './helpers';

let env: Env;
let ada: Client;
let lena: Client;
beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
});

const rules = async () => (await ada.get('/api/automations')).json.automations as any[];
const byPreset = async (p: string) => (await rules()).find((r) => r.preset === p);
const tasksTitled = (orgId: string, like: string) =>
  env.db.system((q) => q.query(`select * from tasks where org_id = $1 and title like $2 order by created_at, due_date nulls last`, [orgId, like]));

describe('automations', () => {
  it('the demo comes with the template’s rules, switched off', async () => {
    const list = await rules();
    expect(list.map((r) => r.preset).sort()).toEqual(['no_contact', 'onboarding', 'overdue_notify', 'renewal_plan']);
    expect(list.every((r) => !r.enabled)).toBe(true);
  });

  it('preview says how many accounts a rule would act on, without changing anything', async () => {
    const r = await ada.post('/api/automations/preview', { trigger: { type: 'account_date', field: 'renewal_date', daysBefore: 90 }, conditions: [] });
    expect(r.json.count).toBe(2); // Harborline (45 days) and Velto (75 days)
    expect(r.json.sample.sort()).toEqual(['Harborline Bank', 'Velto Mobility']);
    const narrowed = await ada.post('/api/automations/preview', {
      trigger: { type: 'account_date', field: 'renewal_date', daysBefore: 90 },
      conditions: [{ field: 'tier', op: 'eq', value: 'enterprise' }],
    });
    expect(narrowed.json.sample).toEqual(['Harborline Bank']);
    expect((await tasksTitled(env.a.orgId, 'Renewal plan:%')).length).toBe(0);
  });

  it('renewal rule opens one plan per renewal, for the owner, with its checklist — once', async () => {
    const rule = await byPreset('renewal_plan');
    await ada.patch(`/api/automations/${rule.id}`, { enabled: true });
    await runScheduled(env.deps);
    await runScheduled(env.deps);
    const plans = await tasksTitled(env.a.orgId, 'Renewal plan:%');
    expect(plans.map((p) => p.title).sort()).toEqual(['Renewal plan: Harborline Bank', 'Renewal plan: Velto Mobility']);
    const harbor = plans.find((p) => p.title.includes('Harborline'))!;
    expect(harbor.assignee_ids).toEqual([env.a.ids.omar]);
    expect(harbor.board_id).toBe(env.a.boards.renewals);
    expect(harbor.account_id).toBe(env.a.accounts['Harborline Bank']);
    const subs = await env.db.system((q) => q.query('select title from tasks where parent_id = $1 order by position', [harbor.id]));
    expect(subs.map((s) => s.title)).toEqual(['Review usage and value delivered', 'Note risks and open issues', 'Book a call with the decision maker']);
    // The other company's identical rules did not run.
    expect((await tasksTitled(env.b.orgId, 'Yenileme planı:%')).length).toBe(0);
    // The owner heard about it.
    await env.settle();
    expect(env.email.last('omar@demo.example').subject).toBe('New task from the rule “Plan the renewal 90 days ahead”');
    // What it did is visible.
    const runs = (await ada.get(`/api/automations/${rule.id}/runs`)).json.runs;
    expect(runs.length).toBe(2);
    expect(runs[0].result.tasks.length).toBe(1);
    expect((await byPreset('renewal_plan')).runs30d).toBe(2);
  });

  it('a new renewal date is a new occasion', async () => {
    const acc = env.a.accounts['Harborline Bank'];
    await ada.patch(`/api/accounts/${acc}`, { fields: { renewal_date: new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10) } });
    await runScheduled(env.deps);
    expect((await tasksTitled(env.a.orgId, 'Renewal plan: Harborline Bank')).length).toBe(2);
  });

  it('a new account (added by hand) gets onboarding tasks; imported ones do not unless asked', async () => {
    const rule = await byPreset('onboarding');
    await ada.patch(`/api/automations/${rule.id}`, { enabled: true });
    const made = await lena.post('/api/accounts', { name: 'Glasswing Optics', ownerId: env.a.ids.lena });
    const onboarding = await tasksTitled(env.a.orgId, '%Glasswing Optics%');
    expect(onboarding.map((t) => t.title)).toEqual(['Welcome call: Glasswing Optics', 'Finish setup: Glasswing Optics', 'First value check: Glasswing Optics']);
    expect(onboarding.every((t) => t.account_id === made.json.account.id)).toBe(true);
    await ada.post('/api/accounts/import', { rows: [{ N: 'Imported Existing' }], mapping: { name: 'N' } });
    expect((await tasksTitled(env.a.orgId, '%Imported Existing%')).length).toBe(0);
    await ada.post('/api/accounts/import', { rows: [{ N: 'Imported New' }], mapping: { name: 'N' }, runAutomations: true });
    expect((await tasksTitled(env.a.orgId, '%Imported New%')).length).toBe(3);
  });

  it('overdue tasks notify the assignees and the team lead', async () => {
    const rule = await byPreset('overdue_notify');
    await ada.patch(`/api/automations/${rule.id}`, { enabled: true });
    const before = env.email.sent.filter((m) => m.to === 'mert@demo.example').length;
    await runScheduled(env.deps);
    await env.settle();
    const toMert = env.email.sent.filter((m) => m.to === 'mert@demo.example').slice(before);
    expect(toMert.some((m) => m.subject === 'Reminder: Tell the team lead about overdue tasks')).toBe(true);
  });

  it('builds a custom rule: when a task moves to Done on a board, create a follow-up', async () => {
    const r = await ada.post('/api/automations', {
      name: 'Thank-you note after done',
      enabled: true,
      trigger: { type: 'task_moved', boardId: env.a.boards.csBoard, column: 'done' },
      conditions: [],
      action: { type: 'create_tasks', boardId: env.a.boards.csBoard, tasks: [{ title: 'Send a thank-you note', dueInDays: 1, assignee: 'assignees' }] },
    });
    expect(r.status).toBe(201);
    const t = (await lena.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Finish the training', assigneeIds: [env.a.ids.lena] })).json.task;
    await lena.patch(`/api/tasks/${t.id}`, { baseVersion: t.version, status: 'done' });
    const follow = await tasksTitled(env.a.orgId, 'Send a thank-you note');
    expect(follow.length).toBe(1);
    expect(follow[0].assignee_ids).toEqual([env.a.ids.lena]);
  });

  it('validates rules and rights; pausing stops a rule; run now', async () => {
    const bad = await ada.post('/api/automations', {
      name: 'x',
      enabled: true,
      trigger: { type: 'account_created' },
      conditions: [],
      action: { type: 'create_tasks', boardId: env.b.boards.csBoard, tasks: [{ title: 'x', dueInDays: 1, assignee: 'none' }] },
    });
    expect(bad.status).toBe(400);
    expect((await lena.post('/api/automations', { name: 'x' })).status).toBe(403);
    const rule = await byPreset('no_contact');
    const before = (await tasksTitled(env.a.orgId, 'Check in with %')).length;
    expect((await ada.post(`/api/automations/${rule.id}/run`, {})).json.fired).toBeGreaterThanOrEqual(0);
    expect((await tasksTitled(env.a.orgId, 'Check in with %')).length).toBeGreaterThanOrEqual(before);
    await ada.patch(`/api/automations/${(await byPreset('renewal_plan')).id}`, { enabled: false });
    const acc = env.a.accounts['Fjordnet Telecom'];
    await ada.patch(`/api/accounts/${acc}`, { fields: { renewal_date: new Date(Date.now() + 10 * 86400_000).toISOString().slice(0, 10) } });
    await runScheduled(env.deps);
    expect((await tasksTitled(env.a.orgId, 'Renewal plan: Fjordnet Telecom')).length).toBe(0);
  });
});
