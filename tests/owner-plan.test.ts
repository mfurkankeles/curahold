// The investor side of Plan & targets and what the console sends the owner:
// only the owner in his console session reaches any of it; the plan file loads
// whole or not at all, and loading it again changes nothing; budget, runway,
// fundraising windows and the investor pipeline (with Idempotency-Key and a
// 30-day undo); the two milestones counted on real data; the Monday CEO summary
// queued once per week in the owner's language, with no model call; and phone
// alerts by Web Push for urgent help requests, through a stubbed push service.
import { beforeAll, describe, expect, it } from 'vitest';
import { base32Decode, hotp, stepOf } from '../api/src/lib/totp';
import { composeCeoSummary, queueCeoSummary, summaryWeek } from '../api/src/lib/ceoSummary';
import { drainOwnerOutbox } from '../api/src/lib/ownerOutbox';
import { investorSide } from '../api/src/lib/ownerPlan';
import { runScheduled } from '../api/src/lib/scheduler';
import { b64u, newVapidKeys } from '../api/src/lib/webpush';
import { readPlanFile } from '../shared/src/ownerPlan';
import { BASE, login, setup, type Client, type Env } from './helpers';

const OWNER = 'owner@curahold.test';
const STAFF = 'helper@curahold.test';
const STAFF_KEY = 'staff-key-staff-key-staff-key-1234';
const DESK = `https://desk.${BASE}`;
let env: Env;
let owner: Desk;
let ada: Client;
let pushed: { url: string; headers: Record<string, string> }[] = [];
let pushStatus = 201;

const secrets = new Map<string, string>();
class Desk {
  cookie = '';
  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = { 'x-curahold-desk': '1' }) {
    const r = await env.app.request(`${DESK}/api/desk${path}`, {
      method,
      headers: { ...headers, ...(this.cookie ? { cookie: this.cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const m = /desk_session=([^;]*)/.exec(r.headers.get('set-cookie') ?? '');
    if (m) this.cookie = m[1] ? `desk_session=${m[1]}` : '';
    return { status: r.status, json: (await r.json().catch(() => null)) as any };
  }
  async signIn(email: string) {
    const sent = await this.req('POST', '/sign-in', { email });
    const first = await this.req('POST', '/sign-in/verify', { email, code: sent.json.devCode });
    const s = first.json.second;
    if (s.enroll) secrets.set(email, s.secret);
    await env.db.system((q) => q.query('update desk_factors set last_step = 0 where email = $1', [email]));
    const done = await this.req('POST', '/sign-in/second', { ticket: s.ticket, code: await hotp(base32Decode(secrets.get(email)!), stepOf(Date.now())) });
    expect(done.status, JSON.stringify(done.json)).toBe(200);
    return this;
  }
}

/** An invented plan file in the shape of the business plan's targets.json (two scenarios, one month of budget). */
const planFile = () => ({
  version: 1,
  currency: 'USD',
  launchMonth: '2027-02',
  defaultScenario: 'baz',
  scenarios: {
    baz: {
      label: { tr: 'Baz', en: 'Base' },
      pairedCapitalScenario: 'onerilen',
      targets: [
        { metric: 'trial_requests', period: '2027-02', target: 30 },
        { metric: 'mrr', period: '2027-03', target: 386 },
      ],
    },
    temkinli: { pairedCapitalScenario: 'minimum', targets: [{ metric: 'trial_requests', period: '2027-02', target: 11 }] },
  },
  budget: {
    onerilen: {
      capitalNeedEmployed: 21465,
      monthly: [
        { period: '2027-02', revenueNet: 0, byCategory: { Infrastructure: 157, Accounting: 133 } },
        { period: '2027-03', revenueNet: 684, byCategory: { Infrastructure: 177 } },
      ],
    },
  },
  milestones: { targets: { baz: [{ metric: 'expanded_companies', period: '2027-07', target: 1 }] } },
  tasks: [{ title: 'Launch post in two languages', dueOn: '2027-02-02', source: 'plan' }],
  regions: { note: 'ignored by the console' },
});

const browserKeys = async () => {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  return { p256dh: b64u(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))), auth: b64u(crypto.getRandomValues(new Uint8Array(16))) };
};

beforeAll(async () => {
  const vapid = await newVapidKeys();
  env = await setup({ staffKey: STAFF_KEY, support: { email: 'desk@curahold.test', staff: [OWNER, STAFF] }, push: { ...vapid, subject: `mailto:${OWNER}` } });
  // The push services: answer what the test says, and remember what came.
  const before = env.fetchHolder.impl;
  env.fetchHolder.impl = async (url, init) => {
    if (!url.startsWith('https://push.example.net/')) return before(url, init);
    pushed.push({ url, headers: init?.headers as Record<string, string> });
    return new Response(null, { status: pushStatus });
  };
  owner = await new Desk().signIn(OWNER);
  ada = await login(env, 'acme', 'ada@demo.example');
});

describe('who may reach the investor side, the summary and the phones', () => {
  it('the owner in his session; not other staff, not the staff key, not a company user', async () => {
    const helper = await new Desk().signIn(STAFF);
    const reads = ['/owner/plan/side', '/owner/summary', '/owner/push'];
    const writes: [string, string, unknown][] = [
      ['POST', '/owner/plan/import', { file: planFile() }],
      ['PUT', '/owner/plan/budget', { lines: [{ period: '2027-02', category: 'X', actual: 1 }] }],
      ['PUT', '/owner/plan/cash', { cash: 1, cashOn: '2026-11-20' }],
      ['POST', '/owner/plan/windows', { name: 'W', opensOn: '2027-01-01', closesOn: '2027-02-01' }],
      ['POST', '/owner/plan/investors', { name: 'Acme Angels' }],
      ['PUT', '/owner/summary', { enabled: false }],
      ['POST', '/owner/summary/test', {}],
      ['POST', '/owner/push/test', {}],
    ];
    for (const p of reads) {
      expect((await helper.req('GET', p)).status, p).toBe(403);
      expect((await new Desk().req('GET', p, undefined, { 'x-curahold-staff-key': STAFF_KEY })).status, p).toBe(403);
      expect((await new Desk().req('GET', p)).status, p).toBe(403);
      expect((await owner.req('GET', p)).status, p).toBe(200);
    }
    for (const [m, p, b] of writes) {
      expect((await helper.req(m, p, b)).status, p).toBe(403);
      // Without the console's own header a change is refused even with the owner's cookie (another site's form).
      expect((await owner.req(m, p, b, {})).status, p).toBe(403);
    }
    // A company's own session (even its administrator) on its own host never reaches the owner's API.
    for (const p of reads) expect([403, 404]).toContain((await ada.get(`/api/desk${p}`)).status);
    // Nothing was written by the refused calls.
    const [n] = await env.db.system((q) => q.query(`select (select count(*)::int from investor_pipeline) + (select count(*)::int from fundraising_windows) + (select count(*)::int from plan_budget) as n`));
    expect(n.n).toBe(0);
  });

  it('the request role cannot read or write the new tables, whatever company it is set to', async () => {
    for (const t of ['plan_budget', 'fundraising_windows', 'investor_pipeline', 'owner_outbox', 'owner_push_devices'])
      await expect(env.db.tenant({ orgId: env.a.orgId, userId: null }, (q) => q.query(`select * from ${t} limit 1`))).rejects.toThrow();
  });
});

describe('loading the business plan', () => {
  it('reads every part, ignores what the console does not keep, and refuses a file out of shape', () => {
    const r = readPlanFile(planFile());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.scenario).toBe('baz');
    expect(r.plan.targets).toHaveLength(3);
    expect(r.plan.budget).toEqual([
      { period: '2027-02', category: 'Infrastructure', planned: 157 },
      { period: '2027-02', category: 'Accounting', planned: 133 },
      { period: '2027-03', category: 'Infrastructure', planned: 177 },
    ]);
    // No fundraising list in the file: the plan's two windows, from the launch month (months 4–7 and 10–14).
    expect(r.plan.windows.map((w) => [w.key, w.opensOn, w.closesOn])).toEqual([
      ['pre-seed', '2027-05-01', '2027-08-31'],
      ['seed', '2027-11-01', '2028-03-31'],
    ]);
    expect(readPlanFile(planFile(), null, 'en').ok && readPlanFile(planFile(), null, 'en')).toMatchObject({ plan: { windows: [{ name: 'Pre-seed / angel' }, { name: 'Seed' }] } });
    expect(readPlanFile(planFile(), 'temkinli')).toMatchObject({ ok: true, plan: { targets: [{ target: 11 }] } });
    const bad = planFile() as any;
    bad.scenarios.baz.targets.push({ metric: 'made_up', period: '2027-02', target: 1 });
    bad.tasks.push({ title: '', dueOn: 'soon' });
    const nope = readPlanFile(bad);
    expect(nope.ok).toBe(false);
    if (!nope.ok) expect(nope.errors.length).toBe(2);
    expect(readPlanFile({})).toMatchObject({ ok: false });
    expect(readPlanFile(planFile(), 'missing')).toMatchObject({ ok: false, scenarios: ['baz', 'temkinli'] });
  });

  it('a dry run stores nothing; loading stores it all; loading again changes nothing the owner did', async () => {
    const dry = (await owner.req('POST', '/owner/plan/import', { file: planFile(), dryRun: true })).json;
    expect(dry).toMatchObject({ ok: true, dryRun: true, counts: { targets: 3, budget: 3, windows: 2, tasks: 1 } });
    expect((await owner.req('GET', '/owner/plan/side')).json.windows).toEqual([]);

    expect((await owner.req('POST', '/owner/plan/import', { file: planFile() })).json).toMatchObject({ ok: true, scenario: 'baz', counts: { tasks: 1 } });
    const [t] = await env.db.system((q) => q.query(`select target from plan_targets where metric = 'expanded_companies' and period = '2027-07'`));
    expect(Number(t.target)).toBe(1);
    // The owner works with it: a spend, a window status.
    let side = (await owner.req('PUT', '/owner/plan/budget', { lines: [{ period: '2027-02', category: 'Infrastructure', actual: 150 }] })).json;
    const pre = side.windows.find((w: any) => w.key === 'pre-seed');
    side = (await owner.req('PATCH', `/owner/plan/windows/${pre.id}`, { status: 'preparing', note: 'Data room first' })).json;

    const again = (await owner.req('POST', '/owner/plan/import', { file: planFile() })).json;
    expect(again.counts.tasks).toBe(0);
    const [tasks] = await env.db.system((q) => q.query(`select count(*)::int as n from plan_tasks where title = 'Launch post in two languages'`));
    expect(tasks.n).toBe(1);
    side = (await owner.req('GET', '/owner/plan/side')).json;
    expect(side.windows.find((w: any) => w.key === 'pre-seed')).toMatchObject({ status: 'preparing', note: 'Data room first' });
    expect(side.budget).toMatchObject({ scenario: 'baz', capitalNeed: 21465 });

    // A broken file loads nothing and says why.
    const broken = planFile() as any;
    broken.scenarios.baz.targets[0].target = -5;
    const no = (await owner.req('POST', '/owner/plan/import', { file: broken })).json;
    expect(no.ok).toBe(false);
    expect(no.errors[0]).toContain('target #1');
    expect((await owner.req('POST', '/owner/plan/import', { nope: true, file: 'x' })).json.ok).toBe(false);
  });
});

describe('budget, windows and investors', () => {
  it('spend against plan by month, and the runway from the cash', async () => {
    // Read as of 10 February 2027 (the plan's months); the owner's session lives in today's clock.
    const at = new Date('2027-02-10T10:00:00Z');
    {
      await owner.req('PUT', '/owner/plan/cash', { cash: 1000, cashOn: '2027-02-01' });
      let side = await investorSide(env.deps, at);
      const feb = side.budget.months.find((m) => m.period === '2027-02');
      expect(feb).toMatchObject({ planned: 290, actual: 150, revenuePlan: 0 });
      // Next three months: 290 and 177 planned (and nothing after), revenue 0 and 684: net (290 + 0 − 684 + 177) / 2 < 0 → none.
      expect(side.period).toBe('2027-02');
      expect(side.budget.runwayMonths).toBeNull();
      await owner.req('PUT', '/owner/plan/budget', { lines: [{ period: '2027-03', category: 'People', planned: 2000, actual: null }] });
      side = await investorSide(env.deps, at);
      // (290 − 0) and (2177 − 684): average 891.5 a month → 1000 lasts 1.1 months.
      expect(side.budget.runwayMonths).toBe(1.1);
      // A line of his own with nothing in it goes; the plan's own lines stay.
      await owner.req('PUT', '/owner/plan/budget', { lines: [{ period: '2027-03', category: 'People', planned: 0, actual: null }, { period: '2027-02', category: 'Infrastructure', actual: null }] });
      side = await investorSide(env.deps, at);
      expect(side.budget.months.find((m) => m.period === '2027-03')!.lines.map((l) => l.category)).toEqual(['Infrastructure']);
      expect(side.budget.months.find((m) => m.period === '2027-02')!.actual).toBeNull();
      expect((await owner.req('PUT', '/owner/plan/budget', { lines: [{ period: '2027-13', category: 'X', actual: 1 }] })).status).toBe(400);
    }
  });

  it('a window: added once per Idempotency-Key, dates checked, set aside instead of deleted', async () => {
    const key = { 'x-curahold-desk': '1', 'idempotency-key': 'window-create-0001' };
    const w = { name: 'Bridge', opensOn: '2027-04-01', closesOn: '2027-05-31', targetMin: 50000, targetMax: 80000 };
    const one = await owner.req('POST', '/owner/plan/windows', w, key);
    const two = await owner.req('POST', '/owner/plan/windows', w, key);
    expect(one.status).toBe(201);
    expect(two.json.id).toBe(one.json.id);
    expect((await owner.req('POST', '/owner/plan/windows', { ...w, closesOn: '2027-03-01' })).status).toBe(400);
    expect((await owner.req('POST', '/owner/plan/windows', { ...w, targetMax: 10 })).status).toBe(400);
    expect((await owner.req('PATCH', `/owner/plan/windows/${one.json.id}`, { closesOn: '2027-01-01' })).status).toBe(400);
    await owner.req('PATCH', `/owner/plan/windows/${one.json.id}`, { note: 'Only if the seed slips' });
    const side = (await owner.req('PATCH', `/owner/plan/windows/${one.json.id}`, { status: 'skipped' })).json;
    // A change sends only what changes: the note and the amounts stay.
    expect(side.windows.find((x: any) => x.id === one.json.id)).toMatchObject({ status: 'skipped', note: 'Only if the seed slips', targetMin: 50000, targetMax: 80000 });
    expect((await owner.req('PATCH', `/owner/plan/windows/${crypto.randomUUID()}`, { status: 'open' })).status).toBe(404);
  });

  it('an investor: added once per key, moved through stages, removed to the trash and brought back', async () => {
    let side = (await owner.req('GET', '/owner/plan/side')).json;
    const seed = side.windows.find((w: any) => w.key === 'seed');
    const key = { 'x-curahold-desk': '1', 'idempotency-key': 'investor-create-0001' };
    const body = { name: 'Northwind Seed Fund', kind: 'fund', windowId: seed.id, nextStep: 'Send the deck', nextOn: '2026-11-25', amount: 150000 };
    const a = await owner.req('POST', '/owner/plan/investors', body, key);
    expect((await owner.req('POST', '/owner/plan/investors', body, key)).json.id).toBe(a.json.id);
    expect((await owner.req('POST', '/owner/plan/investors', { name: 'X', windowId: crypto.randomUUID() })).status).toBe(400);
    expect((await owner.req('POST', '/owner/plan/investors', { name: 'X', stage: 'won' })).status).toBe(400);
    side = (await owner.req('PATCH', `/owner/plan/investors/${a.json.id}`, { stage: 'committed' })).json;
    expect(side.investors).toHaveLength(1);
    expect(side.windows.find((w: any) => w.key === 'seed')).toMatchObject({ investors: 1, committed: 150000 });
    side = (await owner.req('DELETE', `/owner/plan/investors/${a.json.id}`)).json;
    expect(side.investors).toHaveLength(0);
    expect(side.removed[0]).toMatchObject({ id: a.json.id, name: 'Northwind Seed Fund' });
    expect((await owner.req('PATCH', `/owner/plan/investors/${a.json.id}`, { stage: 'meeting' })).status).toBe(404);
    side = (await owner.req('POST', `/owner/plan/investors/${a.json.id}/restore`)).json;
    expect(side.investors[0]).toMatchObject({ stage: 'committed', nextStep: 'Send the deck' });
    expect((await owner.req('POST', `/owner/plan/investors/${a.json.id}/restore`)).status).toBe(404);
    const act = (await owner.req('GET', '/owner/activity')).json.activity.map((x: any) => x.action);
    expect(act).toEqual(expect.arrayContaining(['plan.import', 'plan.investor', 'plan.investor.committed', 'plan.investor.removed', 'plan.investor.restored']));
  });

  it('milestones are counted on real data: expanded and switched companies', async () => {
    const before = (await owner.req('GET', '/owner/plan/side')).json.milestones;
    expect(before.map((m: any) => m.actual)).toEqual([0, 0]);
    const org = env.a.orgId;
    // Acme pays, for seven months now; work started in two departments this month.
    await env.db.system(async (q) => {
      await q.query(`update orgs set billing = '{"status":"active","plan":"team","seats":3}' where id = $1`, [org]);
      await q.query(`insert into subscriptions (org_id, provider, plan, status, created_at) values ($1, 'paddle', 'team', 'active', now() - interval '7 months')`, [org]);
      // Everything older than a month, then one new task on a board of each of two departments.
      await q.query(`update tasks set created_at = now() - interval '60 days' where org_id = $1`, [org]);
      const boards = await q.query(`select b.id, b.department_id from boards b where b.org_id = $1 and exists (select 1 from tasks t where t.board_id = b.id and t.org_id = $1) order by b.created_at limit 2`, [org]);
      expect(boards.length, 'the demo company has two boards with work').toBe(2);
      const [dept] = await q.query(`select id from departments where org_id = $1 and id <> $2 order by position limit 1`, [org, boards[0].department_id]);
      await q.query(`update boards set department_id = $3 where org_id = $1 and id = $2`, [org, boards[1].id, dept.id]);
      for (const b of boards) await q.query(`update tasks set created_at = now() where id = (select id from tasks where org_id = $1 and board_id = $2 limit 1)`, [org, b.id]);
    });
    let m = (await owner.req('GET', '/owner/plan/side')).json.milestones;
    expect(m.find((x: any) => x.metric === 'expanded_companies').actual).toBe(1);
    expect(m.find((x: any) => x.metric === 'switched_companies').actual).toBe(0);
    // It was linked to an outside CRM and the link is off now: it has switched.
    await env.db.system((q) => q.query(`insert into connections (org_id, kind, provider, label, status) values ($1, 'source', 'demo_crm', 'Old CRM', 'disabled')`, [org]));
    m = (await owner.req('GET', '/owner/plan/side')).json.milestones;
    expect(m.find((x: any) => x.metric === 'switched_companies').actual).toBe(1);
    // The other company is untouched by any of this.
    await env.db.system((q) => q.query(`update orgs set billing = '{}' where id = $1`, [org]));
  });
});

describe('the Monday CEO summary', () => {
  it('reads targets, requests, revenue, errors and waiting proposals, in Turkish or English, with no model call', async () => {
    await env.db.system(async (q) => {
      await q.query(`insert into approvals (title, proposed_by, priority) values ('Publish the launch post', 'cmo', 'urgent')`);
      await q.query(`insert into company_log (seat, kind, body, ref) values ('system', 'alert', 'Errors: test', 'ops:test:1')`);
    });
    const to = new Date();
    const from = new Date(to.getTime() - 7 * 86400_000);
    const tr = await composeCeoSummary(env.deps, from, to, 'tr');
    const en = await composeCeoSummary(env.deps, from, to, 'en');
    expect(tr.subject).toMatch(/^Curahold haftalık özet · /);
    expect(en.subject).toMatch(/^Curahold weekly summary · /);
    expect(tr.text).toContain('Yapay zekâ ekibi: 1 öneri onayınızı bekliyor (1 acil');
    expect(en.text).toContain('AI team: 1 proposals wait for your approval (1 urgent');
    expect(en.text).toContain('1 alerts');
    expect(en.text).toContain(`https://desk.${BASE}/plan`);
    expect(en.text).toContain('Northwind Seed Fund: Send the deck');
    expect(tr.text).not.toMatch(/\{\w+\}/);
    expect(en.text).not.toMatch(/\{\w+\}/);
  });

  it('goes once on Monday from 06:00 UTC, by the hourly job, and not when switched off', async () => {
    const monday = new Date('2026-11-23T05:00:00Z');
    expect(monday.getUTCDay()).toBe(1);
    expect(await queueCeoSummary(env.deps, monday)).toBe(false);
    const before = env.email.sent.length;
    const r = await runScheduled(env.deps, new Date('2026-11-23T06:00:00Z'));
    expect(r.ceoSummary).toBe(true);
    const mail = env.email.sent.slice(before).filter((m) => m.to === OWNER);
    expect(mail).toHaveLength(1);
    expect(mail[0].subject).toBe('Curahold haftalık özet · 16 Kas – 22 Kas 2026');
    // Later the same Monday, and again, nothing new.
    expect((await runScheduled(env.deps, new Date('2026-11-23T07:00:00Z'))).ceoSummary).toBe(false);
    expect(env.email.sent.slice(before).filter((m) => m.to === OWNER)).toHaveLength(1);
    expect(summaryWeek(new Date('2026-11-23T09:00:00Z')).monday).toBe('2026-11-23');
    // Tuesday never sends; the owner switches it off and English; the next Monday sends nothing.
    expect(await queueCeoSummary(env.deps, new Date('2026-11-24T06:00:00Z'))).toBe(false);
    const p = (await owner.req('PUT', '/owner/summary', { enabled: false, locale: 'en' })).json;
    expect(p.settings).toEqual({ enabled: false, locale: 'en' });
    expect(p.lastSentAt).not.toBeNull();
    expect(await queueCeoSummary(env.deps, new Date('2026-11-30T06:00:00Z'))).toBe(false);
    // Back on: the preview speaks English, and a try goes at once.
    const on = (await owner.req('PUT', '/owner/summary', { enabled: true })).json;
    expect(on.subject).toMatch(/^Curahold weekly summary/);
    const n = env.email.sent.length;
    expect((await owner.req('POST', '/owner/summary/test')).json).toMatchObject({ queued: true, to: OWNER });
    expect(env.email.sent.length).toBe(n + 1);
  });
});

describe('alerts on the owner’s phone (Web Push)', () => {
  it('a phone is added, tested, told of a blocking help request once, and forgotten when its browser gives up', async () => {
    expect((await owner.req('GET', '/owner/push')).json).toMatchObject({ configured: true, devices: [] });
    expect((await owner.req('POST', '/owner/push/devices', { endpoint: 'http://push.example.net/x', keys: await browserKeys() })).status).toBe(400);
    const s = (await owner.req('POST', '/owner/push/devices', { endpoint: 'https://push.example.net/send/phone-1', keys: await browserKeys(), label: 'iPhone · Safari' })).json;
    expect(s.devices).toHaveLength(1);

    pushed = [];
    const t = (await owner.req('POST', '/owner/push/test')).json;
    expect(pushed).toHaveLength(1);
    expect(pushed[0].headers['content-encoding']).toBe('aes128gcm');
    expect(t.devices[0].lastOkAt).not.toBeNull();

    // A customer's blocking request: the owner's phone hears of it (urgent), once.
    pushed = [];
    const form = new FormData();
    form.set('data', JSON.stringify({ category: 'bug', impact: 'blocking', subject: 'Board does not load', description: 'It spins forever since this morning, nothing opens.' }));
    expect((await ada.post('/api/help', form)).status).toBe(201);
    await env.settle();
    expect(pushed).toHaveLength(1);
    expect(pushed[0].headers.urgency).toBe('high');
    const [row] = await env.db.system((q) => q.query(`select payload, state from owner_outbox where dedupe_key like 'push:help:%'`));
    expect(row.state).toBe('sent');
    expect(row.payload.url).toMatch(/^\/support\?r=/);
    await drainOwnerOutbox(env.deps);
    expect(pushed).toHaveLength(1);

    // The browser unsubscribed (410): the phone is forgotten, nothing is retried.
    pushStatus = 410;
    await owner.req('POST', '/owner/push/test');
    expect((await owner.req('GET', '/owner/push')).json.devices).toEqual([]);
    pushStatus = 201;
  });

  it('without VAPID keys the console offers no phones and nothing is queued', async () => {
    const plain = await setup({ support: { email: 'desk@curahold.test', staff: [OWNER] } });
    const { pushToOwner } = await import('../api/src/lib/ownerOutbox');
    expect(await pushToOwner(plain.deps, 'push:x', () => ({ title: 't', body: 'b', url: '/', urgency: 'high' }))).toBe(false);
    const [n] = await plain.db.system((q) => q.query(`select count(*)::int as n from owner_outbox`));
    expect(n.n).toBe(0);
  });
});
