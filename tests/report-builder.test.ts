// Reports people build: grouping, filters, figures, who sees what, the kept
// reports, and the ready-made dashboards.
import { beforeAll, describe, expect, it } from 'vitest';
import { periodBounds } from '../api/src/lib/reportEngine';
import { DASHBOARD_TEMPLATES, REPORT_LIBRARY, blankDef, fitChart, foldTop, libraryReport, type ReportDef, type ReportResult } from '../shared/src/reports';
import { Client, login, setup, type Env } from './helpers';

let env: Env;
let ada: Client;
let zeynep: Client;
let sofia: Client;

const run = async (c: Client, def: ReportDef) => {
  const r = await c.post('/api/reports/run', { def });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  return r.json.result as Extract<ReportResult, { kind: 'ok' }>;
};

beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
  zeynep = await login(env, 'acme', 'zeynep@demo.example');
  sofia = await login(env, 'acme', 'sofia@demo.example');
});

describe('what can be reported on', () => {
  it('lists tasks, customers, contact, time and the company’s record types, with its own fields', async () => {
    const r = await ada.get('/api/reports/catalog');
    expect(r.status).toBe(200);
    const keys = r.json.sources.map((s: any) => s.key);
    expect(keys).toEqual(expect.arrayContaining(['tasks', 'accounts', 'activities', 'time']));
    const accounts = r.json.sources.find((s: any) => s.key === 'accounts');
    expect(accounts.fields.find((f: any) => f.key === 'health')).toMatchObject({ type: 'choice', group: true });
    expect(accounts.fields.find((f: any) => f.key === 'arr')).toMatchObject({ type: 'money', measure: true });
    expect(accounts.fields.find((f: any) => f.key === 'renewal_date')).toMatchObject({ type: 'date', group: true });
  });

  it('works out the bounds of this and last week, month, quarter and year', () => {
    expect(periodBounds('2026-11-12', 'week')).toEqual(['2026-11-09', '2026-11-16']);
    expect(periodBounds('2026-11-12', 'month')).toEqual(['2026-11-01', '2026-12-01']);
    expect(periodBounds('2026-11-12', 'quarter')).toEqual(['2026-10-01', '2027-01-01']);
    expect(periodBounds('2026-11-12', 'quarter', -1)).toEqual(['2026-07-01', '2026-10-01']);
    expect(periodBounds('2026-01-05', 'month', -1)).toEqual(['2025-12-01', '2026-01-01']);
    expect(periodBounds('2026-11-12', 'year')).toEqual(['2026-01-01', '2027-01-01']);
  });
});

describe('running a report', () => {
  it('counts tasks by status, in the board’s own order, and the parts add up to the whole', async () => {
    const res = await run(ada, { ...blankDef('tasks'), groups: [{ field: 'status' }], chart: 'column' });
    expect(res.kind).toBe('ok');
    expect(res.groups.length).toBeGreaterThan(1);
    expect(res.groups.reduce((n, g) => n + g.value, 0)).toBe(res.total);
    expect(res.matched).toBe(res.total);
    expect(res.groups.every((g) => g.label && g.label !== g.key)).toBe(true);
  });

  it('spreads a task over its people when grouped by person, without doubling the total', async () => {
    const all = await run(ada, { ...blankDef('tasks'), filters: [{ field: 'state', op: 'in', values: ['open'] }], groups: [{ field: 'assignee' }], chart: 'bar' });
    expect(all.groups.some((g) => g.label === 'Zeynep Tunç')).toBe(true);
    // Somebody's two-person task counts once for each of them, and once in the whole.
    expect(all.groups.reduce((n, g) => n + g.value, 0)).toBeGreaterThanOrEqual(all.total);
    const mine = await run(zeynep, { ...blankDef('tasks'), filters: [{ field: 'assignee', op: 'in', values: ['me'] }], groups: [{ field: 'state' }], chart: 'donut' });
    const direct = await zeynep.get('/api/tasks');
    expect(mine.total).toBeGreaterThan(0);
    expect(direct.status).toBe(200);
  });

  it('sums money by a choice and gives names and colours to the groups', async () => {
    const res = await run(ada, { ...blankDef('accounts'), groups: [{ field: 'health' }], measure: { fn: 'sum', field: 'arr' }, chart: 'donut' });
    expect(res.unit).toBe('money');
    expect(res.moneyField).toBe('arr');
    expect(res.total).toBeGreaterThan(0);
    expect(Math.round(res.groups.reduce((n, g) => n + g.value, 0))).toBe(Math.round(res.total));
    const count = await run(ada, { ...blankDef('accounts'), groups: [{ field: 'health' }], chart: 'donut' });
    expect(count.unit).toBe('count');
    expect(count.total).toBe(count.matched);
  });

  it('splits bars by a second grouping', async () => {
    const res = await run(ada, { ...blankDef('tasks'), groups: [{ field: 'board' }, { field: 'priority' }], chart: 'stacked' });
    expect(res.series.length).toBeGreaterThan(0);
    for (const g of res.groups) expect(g.cells!.reduce((n, v) => n + v, 0)).toBe(g.value);
  });

  it('runs time left to right with no holes', async () => {
    const res = await run(ada, { ...blankDef('tasks'), groups: [{ field: 'created', bucket: 'week' }], chart: 'line' });
    expect(res.bucket).toBe('week');
    const days = res.groups.map((g) => Date.parse(g.key));
    for (let i = 1; i < days.length; i++) expect(days[i] - days[i - 1]).toBe(7 * 86_400_000);
  });

  it('narrows by date, number, text, choice and yes/no', async () => {
    const all = await run(ada, blankDef('accounts'));
    const rich = await run(ada, { ...blankDef('accounts'), filters: [{ field: 'arr', op: 'gte', value: 50000 }] });
    expect(rich.matched).toBeLessThan(all.matched);
    const named = await run(ada, { ...blankDef('accounts'), filters: [{ field: 'name', op: 'contains', value: 'a%' }] });
    expect(named.matched).toBe(0);
    const soon = await run(ada, { ...blankDef('accounts'), filters: [{ field: 'renewal_date', op: 'next_days', value: 365 }] });
    expect(soon.matched).toBeLessThanOrEqual(all.matched);
    const notRisk = await run(ada, { ...blankDef('accounts'), filters: [{ field: 'health', op: 'not_in', values: ['risk', 'at_risk', 'red'] }] });
    expect(notRisk.matched).toBeLessThanOrEqual(all.matched);
    const late = await run(ada, { ...blankDef('tasks'), filters: [{ field: 'overdue', op: 'yes' }] });
    const onTime = await run(ada, { ...blankDef('tasks'), filters: [{ field: 'overdue', op: 'no' }] });
    const tasks = await run(ada, blankDef('tasks'));
    expect(late.matched + onTime.matched).toBe(tasks.matched);
  });

  it('takes a condition that is not finished yet, and periods, without falling over', async () => {
    const all = await run(ada, blankDef('accounts'));
    // Just added in the builder: a field and a condition, nothing chosen yet.
    for (const f of [
      { field: 'health', op: 'in' as const, values: [] },
      { field: 'arr', op: 'gte' as const },
      { field: 'name', op: 'contains' as const, value: '' },
      { field: 'renewal_date', op: 'before' as const },
    ]) {
      expect((await run(ada, { ...blankDef('accounts'), filters: [f], groups: [{ field: 'owner' }], chart: 'bar' })).matched).toBe(all.matched);
    }
    for (const period of ['week', 'month', 'quarter', 'year'] as const) {
      const now = await run(ada, { ...blankDef('accounts'), filters: [{ field: 'renewal_date', op: 'this', period }] });
      const before = await run(ada, { ...blankDef('accounts'), filters: [{ field: 'renewal_date', op: 'last', period }], groups: [{ field: 'renewal_date', bucket: 'month' }], chart: 'column' });
      expect(now.matched + before.matched).toBeLessThanOrEqual(all.matched);
    }
    // A report's own table shows every group; a chart folds all but the top few into "Other".
    const byName = await run(ada, { ...blankDef('accounts'), groups: [{ field: 'name' }], measure: { fn: 'sum', field: 'arr' }, chart: 'bar', top: 5 });
    expect(byName.groups.length).toBe(all.matched);
    expect(byName.groups.some((g) => g.key === '~other')).toBe(false);
    const drawn = foldTop(byName, 5, 'Other');
    expect(drawn.groups.length).toBe(6);
    expect(drawn.groups.at(-1)!.key).toBe('~other');
    expect(drawn.groups.reduce((n, g) => n + g.value, 0)).toBe(byName.total);
  });

  it('lists rows with readable cells when nothing is grouped', async () => {
    const res = await run(ada, { ...blankDef('tasks'), columns: ['title', 'status', 'assignee', 'due'] });
    expect(res.table!.columns.map((c) => c.key)).toEqual(['title', 'status', 'assignee', 'due']);
    expect(res.table!.rows.length).toBeGreaterThan(0);
    expect(res.table!.rows.length).toBe(Math.min(200, res.matched));
    const one = await run(ada, { ...blankDef('tasks'), chart: 'number' });
    expect(one.table).toBeNull();
    expect(one.total).toBe(res.matched);
  });

  it('refuses what it does not know instead of guessing', async () => {
    const bad = await ada.post('/api/reports/run', { def: { ...blankDef('tasks'), groups: [{ field: 'title; drop table tasks' }] } });
    expect(bad.status).toBe(400);
    const unknown = await ada.post('/api/reports/run', { def: { ...blankDef('tasks'), groups: [{ field: 'nope' }] } });
    expect(unknown.json.result).toMatchObject({ kind: 'missing' });
    const text = await ada.post('/api/reports/run', { def: { ...blankDef('tasks'), groups: [{ field: 'title' }] } });
    expect(text.json.result).toMatchObject({ kind: 'missing' });
  });
});

describe('who sees what', () => {
  it('counts only what the person asking can see', async () => {
    const def: ReportDef = { ...blankDef('tasks'), groups: [{ field: 'board' }], chart: 'bar' };
    const admin = await run(ada, def);
    const member = await run(zeynep, def);
    // Ada has a private board that Zeynep is not on.
    expect(admin.groups.length).toBeGreaterThan(member.groups.length);
    expect(member.total).toBeLessThan(admin.total);
  });

  it('does not report on a field the role may not see', async () => {
    const before = await run(sofia, { ...blankDef('accounts'), groups: [{ field: 'health' }], measure: { fn: 'sum', field: 'arr' }, chart: 'bar' });
    expect(before.kind).toBe('ok');
    const all = (await ada.get('/api/me')).json.org.accountFields as any[];
    const fields = all.map((f) => (f.key === 'arr' ? { ...f, access: { view: ['admin', 'manager'] } } : f));
    expect((await ada.put('/api/account-fields', { fields })).status).toBe(200);
    const after = await sofia.post('/api/reports/run', { def: { ...blankDef('accounts'), groups: [{ field: 'health' }], measure: { fn: 'sum', field: 'arr' }, chart: 'bar' } });
    expect(after.json.result).toMatchObject({ kind: 'missing', what: 'arr' });
    const catalog = await sofia.get('/api/reports/catalog');
    expect(catalog.json.sources.find((s: any) => s.key === 'accounts').fields.some((f: any) => f.key === 'arr')).toBe(false);
    expect((await ada.put('/api/account-fields', { fields: all })).status).toBe(200);
  });
});

describe('reports people keep', () => {
  it('is private until shared, and each viewer sees their own data in a shared one', async () => {
    const def: ReportDef = { ...blankDef('tasks'), groups: [{ field: 'board' }], chart: 'bar' };
    const made = await zeynep.post('/api/reports/saved', { name: 'Panolarım', def });
    expect(made.status).toBe(201);
    const id = made.json.report.id;
    expect((await ada.get('/api/reports/saved')).json.reports.some((r: any) => r.id === id)).toBe(false);
    expect((await ada.get(`/api/reports/saved/${id}`)).status).toBe(404);
    expect((await zeynep.patch(`/api/reports/saved/${id}`, { shared: true, name: 'Panolar' })).status).toBe(200);
    const seen = (await ada.get('/api/reports/saved')).json.reports.find((r: any) => r.id === id);
    expect(seen).toMatchObject({ name: 'Panolar', shared: true, mine: false });
    // A reader of the company cannot keep reports; an administrator can tidy a shared one.
    expect((await sofia.post('/api/reports/saved', { name: 'x', def })).status).toBe(403);
    expect((await ada.patch(`/api/reports/saved/${id}`, { name: 'Panolar (ekip)' })).status).toBe(200);
    expect((await ada.del(`/api/reports/saved/${id}`)).status).toBe(204);
    expect((await zeynep.get(`/api/reports/saved/${id}`)).status).toBe(404);
  });

  it('leaves someone else’s private report alone', async () => {
    const made = await zeynep.post('/api/reports/saved', { name: 'Bana özel', def: blankDef('tasks') });
    const id = made.json.report.id;
    expect((await ada.patch(`/api/reports/saved/${id}`, { name: 'x' })).status).toBe(404);
    expect((await ada.del(`/api/reports/saved/${id}`)).status).toBe(404);
  });
});

describe('ready-made reports and dashboards', () => {
  it('every library report runs for this company or says what it needs', async () => {
    // Without opportunities the sales reports say so; with them, they count.
    expect((await ada.post('/api/reports/run', { def: libraryReport('won_this_quarter')!.def })).json.result).toMatchObject({ kind: 'missing', what: 'deals' });
    const made = await ada.post('/api/record-types', { kind: 'opportunity' });
    expect(made.status).toBe(201);
    const account = Object.values(env.a.accounts)[0];
    const today = new Date().toISOString().slice(0, 10);
    for (const [name, amount, status] of [['Genişleme', 12000, 'won'], ['Yeni modül', 30000, 'open'], ['Ek lisans', 5000, 'lost']] as const) {
      const r = await ada.post('/api/records', { typeId: made.json.type.id, accountId: account, name, fields: { amount, close_date: today, stage: 'proposal', kind: 'expansion', status } });
      expect(r.status).toBe(201);
    }
    expect((await run(ada, libraryReport('won_this_quarter')!.def)).total).toBe(12000);
    expect((await run(ada, libraryReport('open_pipeline')!.def)).total).toBe(30000);
    expect((await run(ada, libraryReport('deals_by_status')!.def)).groups.map((g) => g.value)).toEqual([1, 1]);
    for (const lib of REPORT_LIBRARY) {
      const r = await ada.post('/api/reports/run', { def: lib.def });
      expect(r.status, lib.key).toBe(200);
      // The health score is a setting a company switches on; without it that one report says what it needs.
      expect(lib.key === 'health_by_owner' ? ['ok', 'missing'] : ['ok'], lib.key).toContain(r.json.result.kind);
    }
    const health = await run(ada, libraryReport('value_by_health')!.def);
    expect(health.groups.length).toBeGreaterThan(0);
  });

  it('every dashboard is made of reports that exist', () => {
    for (const t of DASHBOARD_TEMPLATES) for (const c of t.cards) if ('report' in c) expect(libraryReport(c.report), `${t.key}: ${c.report}`).toBeTruthy();
    expect(new Set(REPORT_LIBRARY.map((r) => r.key)).size).toBe(REPORT_LIBRARY.length);
  });

  it('adds a dashboard as a page whose cards draw reports', async () => {
    expect((await zeynep.post('/api/pages/from-template', { template: 'team' })).status).toBe(403);
    const made = await ada.post('/api/pages/from-template', { template: 'team' });
    expect(made.status).toBe(201);
    const page = made.json.page;
    expect(page.cards.length).toBe(DASHBOARD_TEMPLATES.find((t) => t.key === 'team')!.cards.length);
    const data = (await ada.get(`/api/pages/${page.id}/data`)).json.data;
    const first = data[page.cards[0].id];
    expect(first).toMatchObject({ kind: 'report', library: 'open_by_person', chart: 'bar' });
    expect(first.result.kind).toBe('ok');
    expect(first.result.groups.length).toBeGreaterThan(0);
    // The same page for a member: their own numbers, not the administrator's.
    const theirs = (await zeynep.get(`/api/pages/${page.id}/data`)).json.data[page.cards[0].id];
    expect(theirs.result.total).toBeLessThanOrEqual(first.result.total);
  });

  it('a card can draw a kept report, and says so when it is gone', async () => {
    const kept = await ada.post('/api/reports/saved', { name: 'Önceliğe göre', def: { ...blankDef('tasks'), groups: [{ field: 'priority' }], chart: 'donut' }, shared: true });
    const page = (await ada.post('/api/pages', { name: 'Deneme', cards: [{ id: 'c1', type: 'report', size: 'half', reportId: kept.json.report.id }] })).json.page;
    const data = (await ada.get(`/api/pages/${page.id}/data`)).json.data;
    expect(data.c1).toMatchObject({ kind: 'report', name: 'Önceliğe göre', chart: 'donut' });
    await ada.del(`/api/reports/saved/${kept.json.report.id}`);
    expect((await ada.get(`/api/pages/${page.id}/data`)).json.data.c1).toMatchObject({ kind: 'missing', need: 'report' });
  });

  it('picks a chart that fits the shape', () => {
    expect(fitChart({ ...blankDef(), chart: 'bar' })).toBe('table');
    expect(fitChart({ ...blankDef(), groups: [{ field: 'a' }], chart: 'stacked' })).toBe('bar');
    expect(fitChart({ ...blankDef(), groups: [{ field: 'a' }, { field: 'b' }], chart: 'donut' })).toBe('stacked');
    expect(fitChart({ ...blankDef(), groups: [{ field: 'a' }], chart: 'donut' })).toBe('donut');
  });
});
