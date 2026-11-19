// The flow between departments (D1–D5, D11, D12): customer requests linked to
// product work, the backlog's demand columns behind the value field's rule, the
// status window for people who cannot open Product's board, the loop back when
// the work ships (drafts only), the hand-over card of a won deal, the new
// automation triggers and actions, the drafting actions, and the digest.
//
// Demo company: ada administrator; mert manager (leads Customer Success); lena
// leads Product, zeynep is in Product; omar leads Sales (not in Product); sofia
// is a viewer. Everyone is a member of Customer Success.
import { beforeAll, describe, expect, it } from 'vitest';
import { mockProvider, respondWith } from '../api/src/assistant/provider';
import { sendDigests } from '../api/src/lib/scheduler';
import { login, setup, type Client, type Env } from './helpers';

let env: Env;
let ada: Client, mert: Client, zeynep: Client, lena: Client, omar: Client, sofia: Client, stranger: Client;
const dept: Record<string, string> = {};
let backlog: string, doneColumn: string, story: string, other: string, columns: any[];
let acc1: string, acc2: string;

const q = (sql: string, params: unknown[] = []) => env.db.system((x) => x.query(sql, params));

beforeAll(async () => {
  env = await setup();
  [ada, mert, zeynep, lena, omar, sofia] = await Promise.all(['ada', 'mert', 'zeynep', 'lena', 'omar', 'sofia'].map((n) => login(env, 'acme', `${n}@demo.example`)));
  stranger = await login(env, 'beta', env.b.adminEmail);
  for (const d of (await ada.get('/api/me')).json.departments) dept[d.key] = d.id;
  [acc1, acc2] = Object.values(env.a.accounts) as string[];
  const b = await lena.post('/api/boards', { name: 'Roadmap', visibility: 'org', departmentId: dept.product });
  expect(b.status).toBe(201);
  backlog = b.json.board.id;
  columns = b.json.board.columns;
  doneColumn = columns.find((c: any) => c.done).key;
  story = (await lena.post('/api/tasks', { boardId: backlog, title: 'Export invoices to spreadsheet' })).json.task.id;
  other = (await lena.post('/api/tasks', { boardId: backlog, title: 'Single sign-on for portal' })).json.task.id;
  // Both customers renew within 90 days and are worth something a year.
  await q(`update accounts set fields = fields || jsonb_build_object('arr', 12000, 'renewal_date', (current_date + 30)::text) where id = $1`, [acc1]);
  await q(`update accounts set fields = fields || jsonb_build_object('arr', 8000, 'renewal_date', (current_date + 200)::text) where id = $1`, [acc2]);
});

describe('request links and the status window', () => {
  it('someone outside Product links two customers to one story; the story stays closed to them', async () => {
    const find = await omar.get('/api/stories/linkable?q=invoices');
    expect(find.json.stories.map((s: any) => s.id)).toContain(story);
    expect((await omar.get(`/api/tasks/${story}`)).status).toBeGreaterThanOrEqual(403);
    const l1 = await omar.post('/api/request-links', { storyId: story, accountId: acc1, source: 'account', note: 'Needs it for month end' });
    expect(l1.status).toBe(201);
    expect((await mert.post('/api/request-links', { storyId: story, accountId: acc2, source: 'meeting' })).status).toBe(201);
    // The same request twice is one link.
    const again = await omar.post('/api/request-links', { storyId: story, accountId: acc1, source: 'account' });
    expect(again.json.id).toBe(l1.json.id);
    const flow = (await omar.get(`/api/accounts/${acc1}/flow`)).json;
    const w = flow.work.find((x: any) => x.storyId === story);
    expect(w.title).toBe('Export invoices to spreadsheet');
    expect(w.status).toBeTruthy();
    expect(w.departmentKey).toBe('product');
    expect(w.boardId).toBeNull(); // no board access through the window
    expect((await lena.get(`/api/accounts/${acc1}/flow`)).json.work[0].boardId).toBe(backlog);
  });

  it('viewers and other companies cannot link or read', async () => {
    expect((await sofia.post('/api/request-links', { storyId: other, accountId: acc1, source: 'account' })).status).toBe(403);
    expect((await stranger.post('/api/request-links', { storyId: other, accountId: acc1, source: 'account' })).status).toBe(404);
    expect((await stranger.get(`/api/accounts/${acc1}/flow`)).status).toBe(404);
    expect((await stranger.get(`/api/boards/${backlog}/demand`)).status).toBe(404);
    expect((await stranger.get(`/api/stories/linkable?q=invoices`)).json.stories).toEqual([]);
  });

  it('the backlog adds up waiting customers, value and the nearest renewal', async () => {
    const d = (await lena.get(`/api/boards/${backlog}/demand`)).json;
    const row = d.demand.find((x: any) => x.storyId === story);
    expect(row.waiting).toBe(2);
    expect(row.value).toBe(20000);
    expect(row.renewingSoon).toBe(1);
    expect(row.nearestRenewal).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(d.valueVisible).toBe(true);
    // Omar cannot open the board, so he gets nothing from it.
    expect((await omar.get(`/api/boards/${backlog}/demand`)).status).toBe(404);
    const customers = (await lena.get(`/api/tasks/${story}/customers`)).json.customers;
    expect(customers.map((x: any) => x.accountId).sort()).toEqual([acc1, acc2].sort());
  });

  it('amounts are hidden from people without the value field', async () => {
    const all = (await ada.get('/api/me')).json.org.accountFields;
    const fields = all.map((f: any) => (f.key === 'arr' ? { ...f, access: { view: ['admin', 'manager'] } } : f));
    expect((await ada.put('/api/account-fields', { fields })).status).toBe(200);
    const member = (await zeynep.get(`/api/boards/${backlog}/demand`)).json;
    expect(member.valueVisible).toBe(false);
    expect(member.demand.find((x: any) => x.storyId === story).value).toBeNull();
    expect(JSON.stringify(member)).not.toContain('20000');
    // Still counted and dated for them.
    expect(member.demand.find((x: any) => x.storyId === story).waiting).toBe(2);
    expect((await ada.get(`/api/boards/${backlog}/demand`)).json.demand.find((x: any) => x.storyId === story).value).toBe(20000);
    expect((await ada.put('/api/account-fields', { fields: all })).status).toBe(200);
  });

  it('a per-department owner can be set by a manager, not by a viewer', async () => {
    expect((await mert.put(`/api/accounts/${acc1}/team`, { departmentId: dept.success, userId: env.a.ids.mert })).status).toBe(200);
    expect((await sofia.put(`/api/accounts/${acc1}/team`, { departmentId: dept.success, userId: env.a.ids.sofia })).status).toBe(403);
    const team = (await zeynep.get(`/api/accounts/${acc1}/flow`)).json.team;
    expect(team).toEqual([{ departmentId: dept.success, departmentKey: 'success', userId: env.a.ids.mert }]);
  });
});

describe('shipped → loop back', () => {
  it('finishing the story gives each customer owner a task with a draft, and sends nothing', async () => {
    const before = env.email.sent.length;
    const t = (await lena.get(`/api/tasks/${story}`)).json.task;
    expect((await lena.patch(`/api/tasks/${story}`, { baseVersion: t.version, status: doneColumn })).status).toBe(200);
    await env.settle();
    const links = await q('select * from request_links where story_id = $1 order by created_at', [story]);
    expect(links.every((l: any) => l.shipped_at && l.draft.includes('Export invoices to spreadsheet'))).toBe(true);
    const [loop] = await q('select * from tasks where id = $1', [links[0].loop_task_id]);
    expect(loop.assignee_ids).toEqual([env.a.ids.mert]); // the Customer Success owner, set above
    expect(loop.account_id).toBe(acc1);
    expect(loop.description).toContain('Export invoices to spreadsheet');
    // Nothing went to the customer: only our own people may have been told.
    const sent = env.email.sent.slice(before);
    expect(sent.every((m) => m.to.endsWith('@demo.example'))).toBe(true);
    // Again: no second task.
    expect((await q('select count(*)::int as n from tasks where title like $1', ['%Export invoices to spreadsheet%']))[0].n).toBe(3);
    const tl = (await mert.get(`/api/accounts/${acc1}/timeline`)).json.items;
    expect(tl.some((i: any) => i.type === 'built' && i.storyId === story)).toBe(true);
    const w = (await mert.get(`/api/accounts/${acc1}/flow`)).json.work.find((x: any) => x.storyId === story);
    expect(w.done).toBe(true);
    expect(w.shippedAt).toBeTruthy();
    expect((await mert.post(`/api/request-links/${w.linkId}/told`)).status).toBe(200);
    expect((await mert.get(`/api/accounts/${acc1}/flow`)).json.work.find((x: any) => x.storyId === story).toldAt).toBeTruthy();
  });
});

describe('hand-over packet', () => {
  let deal: string;
  it('a won deal gets one card with stakeholders, promises and open requests', async () => {
    const type = (await ada.post('/api/record-types', { kind: 'opportunity' })).json.type;
    const contacts = (await ada.post('/api/record-types', { kind: 'contact' })).json.type;
    await ada.post('/api/records', { typeId: contacts.id, accountId: acc2, name: 'Mina Hart', fields: { first_name: 'Mina', last_name: 'Hart', title: 'Head of Ops', stance: 'champion' } });
    deal = (await omar.post('/api/records', { typeId: type.id, accountId: acc2, name: 'Platform deal', fields: { status: 'open' } })).json.record.id;
    await omar.post(`/api/records/${deal}/comments`, { body: 'They need the export before the audit.' });
    expect((await omar.post(`/api/accounts/${acc2}/promises`, { body: 'Kickoff within a week' })).status).toBe(201);
    await omar.post('/api/request-links', { storyId: other, accountId: acc2, source: 'account' });
    expect((await omar.patch(`/api/records/${deal}`, { fields: { status: 'won' } })).status).toBe(200);
    await env.settle();
    const open = (await mert.get('/api/handovers')).json.handovers.filter((h: any) => h.sourceId === deal);
    expect(open).toHaveLength(1);
    const p = (await mert.get(`/api/handovers/${open[0].id}`)).json.handover;
    expect(p.toDepartment).toBe('success');
    expect(p.stakeholders.map((s: any) => s.name)).toContain('Mina Hart');
    expect(p.promises.map((x: any) => x.body)).toContain('Kickoff within a week');
    expect(p.requests.map((r: any) => r.storyId)).toContain(other);
    expect(p.summary).toContain('before the audit');
    expect(p.candidates[0]).toBe(env.a.ids.mert); // the department's lead first
    // The lead heard about it.
    expect((await q(`select count(*)::int as n from notifications where kind = 'handover' and user_id = $1`, [env.a.ids.mert]))[0].n).toBeGreaterThan(0);
    // Won again: still one card.
    await omar.patch(`/api/records/${deal}`, { fields: { status: 'open' } });
    await omar.patch(`/api/records/${deal}`, { fields: { status: 'won' } });
    expect((await q('select count(*)::int as n from handovers where source_id = $1', [deal]))[0].n).toBe(1);
  });

  it('confirming sets the owner on the customer and writes the timeline', async () => {
    const [h] = (await mert.get('/api/handovers')).json.handovers.filter((x: any) => x.sourceId === deal);
    expect((await sofia.post(`/api/handovers/${h.id}/confirm`, { ownerId: env.a.ids.zeynep })).status).toBe(403);
    const ok = await mert.post(`/api/handovers/${h.id}/confirm`, { ownerId: env.a.ids.zeynep, planId: null });
    expect(ok.status).toBe(200);
    expect(ok.json.handover.status).toBe('confirmed');
    expect((await mert.post(`/api/handovers/${h.id}/confirm`, { ownerId: env.a.ids.zeynep })).json.error).toBe('handover_confirmed');
    const team = (await mert.get(`/api/accounts/${acc2}/flow`)).json.team;
    expect(team.find((m: any) => m.departmentKey === 'success').userId).toBe(env.a.ids.zeynep);
    const tl = (await mert.get(`/api/accounts/${acc2}/timeline`)).json.items.map((i: any) => i.type);
    expect(tl).toEqual(expect.arrayContaining(['handover', 'handover_confirmed']));
  });
});

describe('automations: new triggers and actions', () => {
  it('a new task on a board is assigned, moved and commented by a rule', async () => {
    const second = columns[1].key;
    const r1 = await ada.post('/api/automations', { name: 'Triage', enabled: true, trigger: { type: 'task_created', boardId: backlog }, conditions: [], action: { type: 'assign', to: `user:${env.a.ids.zeynep}` } });
    expect(r1.status).toBe(201);
    await ada.post('/api/automations', { name: 'Start', enabled: true, trigger: { type: 'task_created', boardId: backlog }, conditions: [], action: { type: 'move', column: second } });
    await ada.post('/api/automations', { name: 'Note', enabled: true, trigger: { type: 'task_created', boardId: backlog }, conditions: [], action: { type: 'comment', body: 'Picked up' } });
    await ada.post('/api/automations', { name: 'Hook', enabled: true, trigger: { type: 'task_created', boardId: backlog }, conditions: [], action: { type: 'webhook' } });
    const t = (await lena.post('/api/tasks', { boardId: backlog, title: 'Bulk edit' })).json.task;
    await env.settle();
    const [row] = await q('select assignee_ids, status from tasks where id = $1', [t.id]);
    expect(row.assignee_ids).toEqual([env.a.ids.zeynep]);
    expect(row.status).toBe(second);
    expect((await q('select body from comments where task_id = $1', [t.id]))[0].body).toContain('Picked up');
    expect((await q(`select count(*)::int as n from webhook_events where entity_id = $1 and event = 'task.automation'`, [t.id]))[0].n).toBe(1);
  });

  it('a deal stage sets a customer field; a ticket opened notifies', async () => {
    const type = (await ada.get('/api/record-types')).json.types.find((x: any) => x.kind === 'opportunity');
    expect(
      (await ada.post('/api/automations', { name: 'Won → tier', enabled: true, trigger: { type: 'record_stage', typeKey: type.key, field: 'status', value: 'won' }, conditions: [], action: { type: 'set_field', target: 'account', field: 'tier', value: 'enterprise' } })).status,
    ).toBe(201);
    const deal = (await omar.post('/api/records', { typeId: type.id, accountId: acc1, name: 'Upsell', fields: { status: 'open' } })).json.record.id;
    await omar.patch(`/api/records/${deal}`, { fields: { status: 'won' } });
    await env.settle();
    expect((await q('select fields->>$2 as v from accounts where id = $1', [acc1, 'tier']))[0].v).toBe('enterprise');
    const tickets = (await ada.post('/api/record-types', { kind: 'ticket' })).json.type;
    await ada.post('/api/automations', { name: 'Ticket', enabled: true, trigger: { type: 'ticket_opened' }, conditions: [], action: { type: 'notify', to: ['admins'], message: 'New ticket' } });
    await omar.post('/api/records', { typeId: tickets.id, accountId: acc1, name: 'Cannot log in', fields: { status: 'open' } });
    await env.settle();
    expect((await q(`select count(*)::int as n from notifications where kind = 'automation' and data->>'message' = 'New ticket'`))[0].n).toBeGreaterThan(0);
  });

  it('refuses an action the trigger has nothing for', async () => {
    const r = await ada.post('/api/automations', { name: 'Bad', enabled: true, trigger: { type: 'ticket_opened' }, conditions: [], action: { type: 'move', column: 'done' } });
    expect(r.status).toBe(400);
    expect((await zeynep.post('/api/automations', { name: 'No', enabled: true, trigger: { type: 'task_created', boardId: null }, conditions: [], action: { type: 'webhook' } })).status).toBe(403);
  });
});

describe('drafts (assistant actions)', () => {
  it('without a model: the template drafts, nothing is saved', async () => {
    (env.deps as any).assistant = { provider: null };
    const [h] = (await mert.get('/api/handovers?status=all')).json.handovers;
    const d = (await mert.post('/api/assist/draft', { kind: 'handover_note', handoverId: h.id })).json.draft;
    expect(d.ai).toBe(false);
    expect(d.why).toBe('off');
    expect(d.text).toContain(h.accountName);
    const [act] = await q(`insert into activities (org_id, account_id, kind, body, title) values ($1, $2, 'meeting', $3, 'Kickoff') returning id`, [
      env.a.orgId,
      acc1,
      'We will send the security pack by Friday.\n- Next step: book the training',
    ]);
    const m = (await mert.post('/api/assist/draft', { kind: 'meeting_promises', activityId: act.id })).json.draft;
    expect(m.promises).toEqual(['We will send the security pack by Friday.']);
    expect(m.nextSteps).toEqual(['book the training']);
    expect((await sofia.post('/api/assist/draft', { kind: 'meeting_promises', activityId: act.id })).status).toBe(403);
  });

  it('with a model: its draft, inside the caps', async () => {
    const provider = mockProvider(() => ({ ...respondWith({}), content: [{ type: 'tool_use', id: 't1', name: 'draft', input: { text: 'Dear team, it is live.' } }] }));
    (env.deps as any).assistant = { provider };
    const [link] = await q('select id from request_links where story_id = $1 limit 1', [story]);
    const d = (await mert.post('/api/assist/draft', { kind: 'shipped_message', linkId: link.id })).json.draft;
    expect(d).toMatchObject({ ai: true, text: 'Dear team, it is live.' });
    expect(provider.calls).toHaveLength(1);
    // Over the company's cap: the template again, and the model is not called.
    await q(`update orgs set settings = settings || '{"assistant": {"monthlyCapUsd": 0}}'::jsonb where id = $1`, [env.a.orgId]);
    const capped = (await mert.post('/api/assist/draft', { kind: 'shipped_message', linkId: link.id })).json.draft;
    expect(capped).toMatchObject({ ai: false, why: 'cap' });
    expect(provider.calls).toHaveLength(1);
    (env.deps as any).assistant = { provider: null };
  });
});

describe('notification digest', () => {
  it('right away: assignments and mentions; comments wait for the morning summary', async () => {
    const t = (await lena.post('/api/tasks', { boardId: backlog, title: 'Digest me', assigneeIds: [env.a.ids.zeynep] })).json.task;
    await lena.post(`/api/tasks/${t.id}/comments`, { body: 'A plain comment' });
    await env.settle();
    const rows = await q(`select kind, via from notifications where user_id = $1 and task_id = $2 order by created_at`, [env.a.ids.zeynep, t.id]);
    expect(rows.find((r: any) => r.kind === 'assigned')!.via).not.toBe('digest');
    expect(rows.find((r: any) => r.kind === 'comment')!.via).toBe('digest');
    // The morning summary lists it (8:00 in the company's time zone).
    const [org] = await q('select timezone from orgs where id = $1', [env.a.orgId]);
    let at = new Date();
    for (let h = 0; h < 24; h++) {
      const d = new Date(Date.now() + h * 3600_000);
      if (Number(new Intl.DateTimeFormat('en-GB', { timeZone: org.timezone, hour: '2-digit', hourCycle: 'h23' }).format(d)) === 8) at = d;
    }
    await sendDigests(env.deps as any, at);
    const [digest] = await q(`select data from notifications where user_id = $1 and kind = 'digest' order by created_at desc limit 1`, [env.a.ids.zeynep]);
    expect(digest!.data.updatesCount).toBeGreaterThan(0);
    expect(digest!.data.updates.some((u: any) => u.title === 'Digest me')).toBe(true);
  });
});
