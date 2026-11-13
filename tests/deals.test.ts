// Money in several currencies, playbooks (and renewals that start by
// themselves), and a record's own thread: comments with files, tasks that
// belong to it, and what the Renewals view shows beside each customer.
import { beforeAll, describe, expect, it } from 'vitest';
import { startRenewalsIn, addDays } from '../api/src/lib/playbooks';
import { RECORD_PRESETS } from '../shared/src/records';
import { Client, login, setup, type Env } from './helpers';

let env: Env;
let ada: Client;
let lena: Client;
let zeynep: Client;
let deals: { id: string; key: string };

// The seeded org keeps its own timezone and the server buckets dates there, so
// compute "today" in that zone (read from the org in beforeAll) to stay correct
// at any wall-clock hour, including the UTC/local midnight gap.
let tz = 'UTC';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
/** A customer's tasks, straight from the database (top-level and subtasks). */
const tasksOf = (accountId: string) =>
  env.db.system((q) => q.query<{ id: string; title: string; due: string | null; record_id: string | null; parent_id: string | null }>(`select id, title, due_date::text as due, record_id, parent_id from tasks where account_id = $1 order by position`, [accountId]));

beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
  zeynep = await login(env, 'acme', 'zeynep@demo.example');
  tz = (await ada.get('/api/me')).json.org.timezone;
  deals = (await ada.post('/api/record-types', { kind: 'opportunity' })).json.type;
});

describe('currencies', () => {
  it('an administrator keeps the rates; customers can then be in those currencies', async () => {
    expect((await lena.put('/api/admin/fx', { rates: { EUR: 1.1 } })).status).not.toBe(200);
    // The company's own currency (USD here) never has a rate.
    const r = await ada.put('/api/admin/fx', { rates: { EUR: 1.1, USD: 5, GBP: 1.25 } });
    expect(r.status).toBe(200);
    expect(r.json.fx.rates).toEqual({ EUR: 1.1, GBP: 1.25 });
    expect((await lena.get('/api/me')).json.org.fx.rates).toEqual({ EUR: 1.1, GBP: 1.25 });

    const id = env.a.accounts['Fjordnet Telecom'];
    expect((await lena.patch(`/api/accounts/${id}`, { currency: 'JPY' })).status).toBe(400);
    expect((await lena.patch(`/api/accounts/${id}`, { currency: 'EUR' })).json.account.currency).toBe('EUR');
  });

  it('adds amounts up in the company’s currency, at those rates', async () => {
    const run = async () => (await ada.post('/api/reports/run', { def: { source: 'accounts', filters: [], groups: [], measure: { fn: 'sum', field: 'arr' }, chart: 'number' } })).json.result.total;
    const withEuros = await run();
    // Fjordnet is 98,000 EUR (seed), so 107,800 USD; the rest are in USD.
    await lena.patch(`/api/accounts/${env.a.accounts['Fjordnet Telecom']}`, { currency: null });
    const allDollars = await run();
    expect(Math.round(withEuros - allDollars)).toBe(Math.round(98000 * 0.1));
    await lena.patch(`/api/accounts/${env.a.accounts['Fjordnet Telecom']}`, { currency: 'EUR' });
  });
});

describe('playbooks', () => {
  let plan: { id: string; anchor: string; description: string };
  it('count back from the renewal date, never before today', async () => {
    const tasks = [
      { title: 'Kick-off for {account_name}', dueInDays: 180, assignee: 'account_owner' },
      { title: 'Send the proposal', dueInDays: 30, assignee: 'account_owner' },
      { title: 'Get it signed', dueInDays: 7, assignee: 'none' },
    ];
    plan = (await ada.post('/api/plans', { name: 'Renewal', description: 'Six months ahead', boardId: env.a.boards.renewals, anchor: 'renewal', tasks })).json.plan;
    expect(plan).toMatchObject({ anchor: 'renewal', description: 'Six months ahead' });
    expect((await lena.get('/api/plans')).json.plans.find((p: any) => p.id === plan.id)).toMatchObject({ anchor: 'renewal' });

    // Cedarmoor renews in 210 days: every step lands before it, counted back.
    const acc = env.a.accounts['Cedarmoor Health'];
    const renewal = (await lena.get(`/api/accounts/${acc}`)).json.account.fields.renewal_date as string;
    const made = (await lena.post(`/api/accounts/${acc}/plans`, { planId: plan.id })).json.tasks;
    expect(made.map((t: any) => t.dueDate)).toEqual([addDays(renewal, -180), addDays(renewal, -30), addDays(renewal, -7)]);
    expect(made[0].title).toBe('Kick-off for Cedarmoor Health');

    // A customer with no renewal date can't have one.
    const bare = (await lena.post('/api/accounts', { name: 'No Date Ltd' })).json.account;
    const refused = await lena.post(`/api/accounts/${bare.id}/plans`, { planId: plan.id });
    expect(refused.status).toBe(400);
    expect(refused.json.error).toBe('plan_no_date');
  });

  it('start renewals by themselves, once per renewal date, catching up on what is past', async () => {
    expect((await ada.put('/api/rhythm', { renewal: { days: 180, planId: plan.id, opportunity: true } })).status).toBe(200);
    const started = await startRenewalsIn(env.db, new Date());
    // Within six months in the seed: Quillfield (160), Harborline (45), Velto (75), Fjordnet (120).
    expect(started).toBeGreaterThanOrEqual(4);
    expect(await startRenewalsIn(env.db, new Date())).toBe(0);

    // Harborline renews in 45 days: the 180-day step is past, so it is the catch-up task's only part… and then it is a task due today.
    const acc = env.a.accounts['Harborline Bank'];
    const mine = (await tasksOf(acc)).filter((t) => t.record_id);
    expect(mine.map((t) => t.title).sort()).toEqual(['Get it signed', 'Kick-off for Harborline Bank', 'Send the proposal'].sort());
    expect(mine.find((t) => t.title.startsWith('Kick-off'))!.due).toBe(today());

    // A renewal opportunity was opened for it, and the tasks belong to it.
    const opps = (await lena.get(`/api/records?type=${deals.key}&account=${acc}`)).json.records as any[];
    const opp = opps.find((r) => r.fields.kind === 'renewal');
    expect(opp).toBeTruthy();
    expect(opp.fields.close_date).toBe((await lena.get(`/api/accounts/${acc}`)).json.account.fields.renewal_date);
    expect(new Set(mine.map((t) => t.record_id))).toEqual(new Set([opp.id]));
  });

  it('gather several past steps into one catch-up task', async () => {
    const steps = [180, 150, 120, 90, 60, 14].map((d) => ({ title: `Step ${d}`, dueInDays: d, assignee: 'account_owner' }));
    const longer = (await ada.post('/api/plans', { name: 'Long renewal', boardId: env.a.boards.renewals, anchor: 'renewal', tasks: steps })).json.plan;
    // A new customer renewing in 40 days, under the long playbook.
    const acc = (await ada.post('/api/accounts', { name: 'Late Starter', ownerId: env.a.ids.lena, fields: { renewal_date: addDays(today(), 40) } })).json.account;
    await ada.put('/api/rhythm', { renewal: { days: 180, planId: longer.id, opportunity: false } });
    await startRenewalsIn(env.db, new Date());
    const all = await tasksOf(acc.id);
    const top = all.filter((t) => !t.parent_id);
    // 180, 150, 120, 90 and 60 days before are past: one task for today; 14 days before is still ahead.
    expect(top).toHaveLength(2);
    const catchUp = top.find((t) => t.due === today())!;
    expect(catchUp.title).toContain('Late Starter');
    expect(all.filter((t) => t.parent_id === catchUp.id).map((t) => t.title)).toEqual(['Step 180', 'Step 150', 'Step 120', 'Step 90', 'Step 60']);
    expect(top.find((t) => t !== catchUp)!.due).toBe(addDays(today(), 26));
  });
});

describe('a record’s own thread', () => {
  it('takes comments with mentions, links and files', async () => {
    const acc = env.a.accounts['Velto Mobility'];
    const opp = (await zeynep.post('/api/records', { typeId: deals.id, accountId: acc, name: 'Velto expansion', fields: { amount: 12000, status: 'open' } })).json.record;
    const form = new FormData();
    form.append('file', new File([new TextEncoder().encode('quote v2')], 'quote.txt', { type: 'text/plain' }));
    const file = (await zeynep.req('POST', `/api/records/${opp.id}/files`, form)).json.file;
    expect(file).toMatchObject({ name: 'quote.txt', recordId: opp.id });
    const body = `@[Lena Fischer](${env.a.ids.lena}) the quote is attached, and the deck: https://docs.example/deck`;
    const c = await zeynep.post(`/api/records/${opp.id}/comments`, { body, fileIds: [file.id] });
    expect(c.status).toBe(201);
    const full = (await lena.get(`/api/records/${opp.id}?full=1`)).json.record;
    expect(full.comments).toHaveLength(1);
    expect(full.comments[0].files.map((f: any) => f.name)).toEqual(['quote.txt']);
    // Lena was told.
    await env.settle();
    const told = await env.db.system((q) => q.query(`select data from notifications where user_id = $1 and kind = 'mentioned' order by created_at desc limit 1`, [env.a.ids.lena]));
    expect(told[0].data).toMatchObject({ recordId: opp.id, recordName: 'Velto expansion' });
    // Only its writer (or an admin) removes it.
    expect((await lena.del(`/api/record-comments/${full.comments[0].id}`)).status).not.toBe(200);
    expect((await zeynep.del(`/api/record-comments/${full.comments[0].id}`)).status).toBe(200);
  });

  it('shows each renewal’s deal and agreement, keeping hidden fields hidden', async () => {
    const preset = RECORD_PRESETS.find((p) => p.key === 'agreement')!;
    const type = (await ada.post('/api/record-types', { kind: 'custom', key: preset.key, name: preset.name, fields: preset.fields })).json.type;
    const acc = env.a.accounts['Harborline Bank'];
    await lena.post('/api/records', { typeId: type.id, accountId: acc, name: 'Harborline — master agreement', fields: { link: 'https://docs.example/harborline.pdf', status: 'signed' } });
    const links = (await lena.get(`/api/renewals/links?accounts=${acc},${env.a.accounts['Orchardly Foods']}`)).json.links;
    expect(links[acc].deal).toMatchObject({ typeKey: deals.key });
    expect(links[acc].agreements).toEqual([expect.objectContaining({ name: 'Harborline — master agreement', url: 'https://docs.example/harborline.pdf', typeKey: 'agreement' })]);
    expect(links[env.a.accounts['Orchardly Foods']]).toEqual({ deal: null, agreements: [] });

    // An amount only managers may see stays out for everyone else.
    const t = (await ada.get('/api/record-types')).json.types.find((x: any) => x.id === deals.id);
    await ada.patch(`/api/record-types/${deals.id}`, { fields: t.fields.map((f: any) => (f.key === 'amount' ? { ...f, access: { view: ['admin', 'manager'] } } : f)) });
    expect((await lena.get(`/api/renewals/links?accounts=${acc}`)).json.links[acc].deal.amount).toBeNull();
    expect(typeof (await ada.get(`/api/renewals/links?accounts=${acc}`)).json.links[acc].deal.amount).toBe('number');
    expect((await lena.get('/api/renewals/links?accounts=not-a-uuid')).status).toBe(400);
  });
});

describe('changing the company’s currency', () => {
  it('starts the rates over', async () => {
    expect((await ada.patch('/api/admin/org', { currency: 'EUR' })).status).toBe(200);
    expect((await ada.get('/api/me')).json.org.fx.rates).toEqual({});
  });
});

describe('favorites', () => {
  it('are each person’s own, and only ever lead inside the app', async () => {
    const acc = env.a.accounts['Harborline Bank'];
    const star = { kind: 'account', id: acc, name: 'Harborline Bank', to: `/accounts/${acc}` };
    expect((await lena.patch('/api/me', { prefs: { favorites: [star] } })).status).toBe(200);
    expect((await lena.get('/api/me')).json.user.prefs.favorites).toEqual([star]);
    expect((await zeynep.get('/api/me')).json.user.prefs.favorites).toBeUndefined();
    // A link elsewhere is not a favorite.
    expect((await lena.patch('/api/me', { prefs: { favorites: [{ ...star, to: 'https://elsewhere.example/' }] } })).status).toBe(400);
    expect((await lena.patch('/api/me', { prefs: { favorites: [] } })).status).toBe(200);
    expect((await lena.get('/api/me')).json.user.prefs.favorites).toBeUndefined();
  });
});
