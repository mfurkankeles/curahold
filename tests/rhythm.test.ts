// Rhythm: targets and pace, the business-review rhythm, and the nudges for
// work that has gone still or is well past its date.
import { beforeAll, describe, expect, it } from 'vitest';
import { sendNudges } from '../api/src/lib/nudges';
import { DEFAULT_RHYTHM, paceOf, periodOf, reviewDue, rhythmOf, targetReport, type DealLike } from '../shared/src/rhythm';
import { Client, login, setup, type Env } from './helpers';

let env: Env;
let ada: Client;
let mert: Client;
let lena: Client;

beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
  mert = await login(env, 'acme', 'mert@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
});

describe('periods and pace', () => {
  it('finds the month, quarter and year a day falls in', () => {
    expect(periodOf('2026-11-12', 'quarter')).toMatchObject({ key: '2026-Q4', start: '2026-10-01', end: '2026-12-31', daysLeft: 49 });
    expect(periodOf('2026-11-12', 'quarter').elapsed).toBeCloseTo(43 / 92, 5);
    expect(periodOf('2026-02-28', 'month')).toMatchObject({ key: '2026-02', start: '2026-02-01', end: '2026-02-28', daysLeft: 0, elapsed: 1 });
    expect(periodOf('2028-02-10', 'month').end).toBe('2028-02-29');
    expect(periodOf('2026-01-01', 'year')).toMatchObject({ key: '2026', start: '2026-01-01', end: '2026-12-31', daysLeft: 364 });
  });

  it('says ahead, on track or behind, and what a week has to bring', () => {
    const half = { elapsed: 0.5, daysLeft: 28 };
    expect(paceOf(100, 120, 0, half).state).toBe('reached');
    expect(paceOf(100, 60, 0, half).state).toBe('ahead');
    // Not ahead, but open deals cover the rest.
    expect(paceOf(100, 30, 80, half)).toMatchObject({ state: 'on', forecast: 110, gap: 70 });
    const behind = paceOf(100, 20, 30, half);
    expect(behind).toMatchObject({ state: 'behind', gap: 80, expected: 50 });
    expect(behind.perWeek).toBe(20);
  });

  it('adds up deals of the period by kind, with one row for everything', () => {
    const deal = (over: Partial<DealLike>): DealLike => ({ ownerId: 'u1', amount: 10, status: 'open', kind: 'expansion', closeDate: '2026-11-20', weight: 0.5, ...over });
    const rhythm = rhythmOf({ targets: { period: 'quarter', new: 100, expansion: 50, renewal: null } });
    const deals = [
      deal({ status: 'won', amount: 30, closeDate: '2026-10-05' }),
      deal({ status: 'won', amount: 99, closeDate: '2026-09-30' }), // last quarter
      deal({ status: 'lost', amount: 500 }),
      deal({ amount: 40 }), // open, half-way: counts 20
      deal({ amount: 40, closeDate: '2027-01-15' }), // closes after the period
      deal({ status: 'won', kind: 'new', amount: 70, ownerId: 'u2', closeDate: '2026-11-01' }),
      deal({ status: 'won', kind: 'renewal', amount: 5, ownerId: null, closeDate: '2026-11-02' }),
    ];
    const r = targetReport(rhythm, deals, '2026-11-12');
    expect(r.rows.map((x) => x.kind)).toEqual(['new', 'expansion', 'all']);
    expect(r.rows[1]).toMatchObject({ won: 30, weighted: 20, forecast: 50, target: 50, deals: 1, state: 'ahead' });
    expect(r.rows[0]).toMatchObject({ won: 70, target: 100, state: 'ahead' });
    // Everything won counts towards the whole, renewals too, against the sum of the targets.
    expect(r.rows[2]).toMatchObject({ won: 105, target: 150 });
    expect(r.owners).toEqual([{ ownerId: 'u2', won: 70, deals: 1 }, { ownerId: 'u1', won: 30, deals: 1 }]);
    // No kind on the deals (a CRM's own type): one row for everything.
    expect(targetReport(rhythm, deals, '2026-11-12', false).rows.map((x) => x.kind)).toEqual(['all']);
    expect(targetReport(DEFAULT_RHYTHM, deals, '2026-11-12').rows).toEqual([]);
  });

  it('cleans up whatever was stored', () => {
    expect(rhythmOf(null)).toEqual(DEFAULT_RHYTHM);
    expect(rhythmOf({ targets: { period: 'week', new: -5, expansion: '1200', renewal: 0 }, reviewDays: 9999, staleDays: 'x', escalateDays: 3 })).toEqual({
      targets: { period: 'quarter', new: null, expansion: 1200, renewal: null },
      reviewDays: 0,
      staleDays: 14,
      escalateDays: 3,
    });
  });
});

describe('business reviews', () => {
  it('works out when the next one is due', () => {
    const a = { createdAt: '2026-01-10T09:00:00Z', lastReviewAt: '2026-08-20T10:00:00Z' };
    expect(reviewDue(a, 90, '2026-11-12')).toMatchObject({ every: 90, own: false, last: '2026-08-20', due: '2026-11-18', days: 6, state: 'soon' });
    expect(reviewDue({ ...a, reviewDays: 60 }, 90, '2026-11-12')).toMatchObject({ every: 60, own: true, due: '2026-10-19', days: -24, state: 'overdue' });
    expect(reviewDue({ ...a, reviewDays: 0 }, 90, '2026-11-12').state).toBe('none');
    expect(reviewDue(a, 0, '2026-11-12').state).toBe('none');
    // Never reviewed: counted from the day the customer was added.
    expect(reviewDue({ createdAt: '2026-10-01T00:00:00Z' }, 90, '2026-11-12')).toMatchObject({ last: null, due: '2026-12-30', state: 'ok' });
  });

  it('a customer keeps its own rhythm, and a logged review moves the next one', async () => {
    const id = env.a.accounts['Quillfield Retail'];
    const first = (await lena.get(`/api/accounts/${id}`)).json.account;
    expect(first).toMatchObject({ reviewDays: null, lastReviewAt: null });
    expect((await lena.patch(`/api/accounts/${id}`, { reviewDays: 45 })).json.account.reviewDays).toBe(45);
    expect((await lena.patch(`/api/accounts/${id}`, { reviewDays: 9999 })).status).toBe(400);
    const made = await lena.post(`/api/accounts/${id}/activities`, { kind: 'review', body: 'Quarterly review: usage is up, two asks on reporting.' });
    expect(made.status).toBe(201);
    const after = (await lena.get(`/api/accounts/${id}`)).json.account;
    expect(after.reviewDays).toBe(45);
    expect(after.lastReviewAt).toBeTruthy();
    const listed = (await lena.get('/api/accounts?signals=1')).json.accounts.find((a: any) => a.id === id);
    expect(listed).toMatchObject({ reviewDays: 45, lastReviewAt: after.lastReviewAt });
    // Changing something else leaves the rhythm alone; null hands it back to the company's.
    expect((await lena.patch(`/api/accounts/${id}`, { name: 'Quillfield Retail' })).json.account.reviewDays).toBe(45);
    expect((await lena.patch(`/api/accounts/${id}`, { reviewDays: null })).json.account).toMatchObject({ reviewDays: null, lastReviewAt: after.lastReviewAt });
  });
});

describe('the rhythm settings', () => {
  it('are changed by whoever manages customers, a part at a time', async () => {
    expect((await ada.get('/api/me')).json.org.rhythm).toEqual(DEFAULT_RHYTHM);
    expect((await lena.put('/api/rhythm', { reviewDays: 90 })).status).toBe(403);
    const r = await ada.put('/api/rhythm', { targets: { expansion: 120000 }, reviewDays: 90 });
    expect(r.status).toBe(200);
    expect(r.json.rhythm).toEqual({ targets: { period: 'quarter', new: null, expansion: 120000, renewal: null }, reviewDays: 90, staleDays: 14, escalateDays: 0 });
    await ada.put('/api/rhythm', { targets: { period: 'year', new: 50000 }, escalateDays: 3 });
    const seen = (await lena.get('/api/me')).json.org.rhythm;
    expect(seen).toEqual({ targets: { period: 'year', new: 50000, expansion: 120000, renewal: null }, reviewDays: 90, staleDays: 14, escalateDays: 3 });
    expect((await ada.put('/api/rhythm', { staleDays: -1 })).status).toBe(400);
    // The other company is untouched.
    const other = await login(env, 'beta', 'ada@demo.example');
    expect((await other.get('/api/me')).json.org.rhythm).toEqual(DEFAULT_RHYTHM);
  });
});

describe('nudges', () => {
  const notices = (userId: string, kind: string) =>
    env.db.system((q) => q.query(`select data, task_id from notifications where org_id = $1 and user_id = $2 and kind = $3 order by created_at`, [env.a.orgId, userId, kind]));
  const backdate = (id: string, days: number) => env.db.system((q) => q.query(`update tasks set updated_at = $2::timestamptz - make_interval(days => $3::int) where id = $1`, [id, THURSDAY.toISOString(), days]));
  // Thursday 7 March 2030, 08:00 in Istanbul (the hour of the morning summary).
  const THURSDAY = new Date('2030-03-07T05:00:00Z');

  it('once a week, tells a person which of their tasks have gone still', async () => {
    const board = env.a.boards.csBoard;
    const mk = async (body: Record<string, unknown>) => (await mert.post('/api/tasks', { boardId: board, assigneeIds: [env.a.ids.zeynep], ...body })).json.task;
    const still = await mk({ title: 'Waiting on the customer’s data' });
    const planned = await mk({ title: 'Kick-off next month', dueDate: '2030-04-20' });
    const fresh = await mk({ title: 'Touched yesterday' });
    const done = await mk({ title: 'Finished long ago', status: 'done' });
    await backdate(still.id, 20);
    await backdate(planned.id, 30);
    await backdate(done.id, 40);
    await backdate(fresh.id, 1);
    const before = (await notices(env.a.ids.zeynep, 'stale')).length;
    // Wednesday: not the day. Thursday at 07:00: not the hour.
    await sendNudges(env.deps, new Date('2030-03-06T05:00:00Z'));
    await sendNudges(env.deps, new Date('2030-03-07T04:00:00Z'));
    expect((await notices(env.a.ids.zeynep, 'stale')).length).toBe(before);
    const sent = await sendNudges(env.deps, THURSDAY);
    expect(sent.stale).toBeGreaterThan(0);
    await sendNudges(env.deps, THURSDAY);
    const got = (await notices(env.a.ids.zeynep, 'stale')).slice(before);
    expect(got.length).toBe(1);
    const titles = (got[0].data.items as any[]).map((i) => i.title);
    expect(titles).toContain('Waiting on the customer’s data');
    expect(titles).not.toContain('Kick-off next month');
    expect(titles).not.toContain('Touched yesterday');
    expect(titles).not.toContain('Finished long ago');
    expect((got[0].data.items as any[]).find((i) => i.title.startsWith('Waiting')).days).toBe(20);
    // It reads like a sentence in the inbox.
    const zeynep = await login(env, 'acme', 'zeynep@demo.example');
    const inbox = (await zeynep.get('/api/notifications?filter=system')).json.notifications;
    expect(inbox.find((n: any) => n.kind === 'stale').title).toMatch(/have not moved for 14 days|has not moved for 14 days/);
  });

  it('is silent for someone who switched nudges off, and when the company did', async () => {
    const t = (await mert.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Lena’s still one', assigneeIds: [env.a.ids.lena] })).json.task;
    const next = new Date('2030-03-14T05:00:00Z');
    await env.db.system((q) => q.query(`update tasks set updated_at = $2::timestamptz - interval '30 days' where id = $1`, [t.id, next.toISOString()]));
    const before = (await notices(env.a.ids.lena, 'stale')).length;
    await lena.patch('/api/me', { prefs: { events: { nudges: false } } });
    await sendNudges(env.deps, next);
    expect((await notices(env.a.ids.lena, 'stale')).length).toBe(before);
    await lena.patch('/api/me', { prefs: { events: { nudges: true } } });
    await ada.put('/api/rhythm', { staleDays: 0 });
    await sendNudges(env.deps, next);
    expect((await notices(env.a.ids.lena, 'stale')).length).toBe(before);
    await ada.put('/api/rhythm', { staleDays: 14 });
    await sendNudges(env.deps, next);
    const got = (await notices(env.a.ids.lena, 'stale')).slice(before);
    expect(got.length).toBe(1);
    expect((got[0].data.items as any[]).map((i) => i.title)).toContain('Lena’s still one');
  });

  it('passes work well past its date to the team lead, once', async () => {
    await ada.put('/api/rhythm', { escalateDays: 3 });
    // Tuesday 12 March 2030, 09:00 in Istanbul.
    const tuesday = new Date('2030-03-12T06:00:00Z');
    const board = env.a.boards.csBoard;
    const mk = async (who: Client, body: Record<string, unknown>) => (await who.post('/api/tasks', { boardId: board, ...body })).json.task;
    const late = await mk(ada, { title: 'Send the renewal offer', assigneeIds: [env.a.ids.lena], dueDate: '2030-03-09' }); // 3 days late today
    await mk(ada, { title: 'Only two days late', assigneeIds: [env.a.ids.lena], dueDate: '2030-03-10' });
    await mk(ada, { title: 'Late for ages', assigneeIds: [env.a.ids.lena], dueDate: '2030-01-05' });
    await mk(ada, { title: 'The lead’s own', assigneeIds: [env.a.ids.mert], dueDate: '2030-03-09' });
    const orphan = await mk(ada, { title: 'Nobody holds this', dueDate: '2030-03-09' });
    const before = (await notices(env.a.ids.mert, 'escalated')).length;
    await sendNudges(env.deps, new Date('2030-03-12T05:00:00Z')); // 08:00: not yet
    expect((await notices(env.a.ids.mert, 'escalated')).length).toBe(before);
    const sent = await sendNudges(env.deps, tuesday);
    expect(sent.escalated).toBeGreaterThan(0);
    await sendNudges(env.deps, tuesday);
    const got = (await notices(env.a.ids.mert, 'escalated')).slice(before);
    expect(got.length).toBe(1);
    const items = got[0].data.items as any[];
    // Lena is on Mert's team; the board is Mert's, so work nobody holds comes to him too.
    expect(items.map((i) => i.title).sort()).toEqual(['Nobody holds this', 'Send the renewal offer']);
    expect(items.find((i) => i.id === late.id)).toMatchObject({ days: 3, who: 'Lena Fischer' });
    expect(items.find((i) => i.id === orphan.id).who).toBeNull();
    // The person holding it is not told about themselves.
    expect((await notices(env.a.ids.lena, 'escalated')).length).toBe(0);
    const inbox = (await mert.get('/api/notifications?filter=system')).json.notifications;
    expect(inbox.find((n: any) => n.kind === 'escalated').title).toBe('2 tasks in your team are 3 or more days late');
    // The weekend is never a day for this.
    const saturday = new Date('2030-03-16T06:00:00Z');
    await mk(ada, { title: 'Crossed on Saturday', assigneeIds: [env.a.ids.lena], dueDate: '2030-03-13' });
    expect((await sendNudges(env.deps, saturday)).escalated).toBe(0);
    // Monday picks up what crossed the line over the weekend.
    const monday = new Date('2030-03-18T06:00:00Z');
    await sendNudges(env.deps, monday);
    const last = (await notices(env.a.ids.mert, 'escalated')).at(-1)!;
    expect((last.data.items as any[]).map((i) => i.title)).toContain('Crossed on Saturday');
    expect(last.task_id).toBeTruthy();
  });
});
