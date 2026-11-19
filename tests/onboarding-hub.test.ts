// Onboarding plans (B17): the arithmetic (weighted completion, whose turn,
// the four data rules, health signals, the report), the company's own hub
// moving on from product events, the setup tests' contract (a failed test is
// ONE shared issue), customers' plans from a won deal to Customer Success,
// tickets linked not copied, the shared report link, templates, reminders in
// the app only, the portal, and row security.
//
// Demo company acme: ada administrator, mert manager (leads Customer Success),
// zeynep member, sofia viewer; beta is another company.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkField, fieldState, healthSignals, progressOf, reportOf, turnOf, type Plan, type PlanStep } from '../shared/src/onboarding';
import { remindPlan } from '../api/src/lib/onboarding';
import { setSetupSource } from '../api/src/lib/onboardingSetup';
import { createPortalApp } from '../api/src/portal';
import { login, setup, type Client, type Env } from './helpers';

const PORTAL = 'curahold-portal.test';
let env: Env;
let ada: Client, mert: Client, zeynep: Client, sofia: Client, stranger: Client;
let portal: ReturnType<typeof createPortalApp>;
const sys = (sql: string, params: unknown[] = []): Promise<any[]> => env.db.system((q) => q.query(sql, params));

const step = (key: string, over: Partial<PlanStep> = {}) =>
  ({ id: key, key, phase: 'setup', position: 0, status: 'todo', dependsOn: [], dueOn: null, side: 'vendor', updatedAt: '2026-11-01', required: true, doneAt: null, ...over }) as PlanStep;

describe('the arithmetic', () => {
  it('weights required steps fully, optional ones half, and leaves skipped ones out', () => {
    const steps = [step('a', { status: 'done' }), step('b'), step('c', { required: false, status: 'done' }), step('d', { status: 'skipped' })];
    // done: 1 + 0.5 of 1 + 1 + 0.5 → 1.5 / 2.5
    expect(progressOf(steps, [], '2026-11-10').pct).toBe(60);
    expect(progressOf([step('a', { status: 'skipped' })], [], '2026-11-10').pct).toBe(100);
  });

  it('says why a step is locked, whose turn it is, and since when', () => {
    const steps = [step('a', { side: 'customer' }), step('b', { dependsOn: ['a'], side: 'vendor' })];
    const t = turnOf(steps[1], steps, '2026-11-01', '2026-11-05');
    expect(t).toMatchObject({ locked: true, waitingOn: ['a'], turn: 'customer', days: 4 });
    steps[0].status = 'done';
    steps[0].doneAt = '2026-11-03T10:00:00Z';
    expect(turnOf(steps[1], steps, '2026-11-01', '2026-11-05')).toMatchObject({ locked: false, turn: 'vendor', since: '2026-11-03', days: 2 });
    const p = progressOf(steps, [], '2026-11-05', 'active', '2026-11-01');
    expect(p.waiting).toMatchObject({ vendor: 1, vendorDays: 2, customer: 0 });
  });

  it('holds every mapped field to the four rules, on what was received', () => {
    expect(checkField({ type: 'email', required: true, received: null })).toEqual([]);
    expect(checkField({ type: 'email', required: true, received: '' })).toEqual([{ rule: 'required', expected: 'value', received: '' }]);
    expect(checkField({ type: 'email', required: false, received: 'n/a' })[0].rule).toBe('empty');
    expect(checkField({ type: 'email', required: true, received: 'ops.cedarmoor.example' })[0]).toMatchObject({ rule: 'format', expected: 'email' });
    expect(checkField({ type: 'number', required: false, received: 'twelve' })[0].rule).toBe('type');
    expect(checkField({ type: 'date', required: false, received: '2026-11-19' })).toEqual([]);
    expect(fieldState({ type: 'text', required: false, received: null, fixedAt: null, autoOk: null })).toBe('waiting');
    expect(fieldState({ type: 'email', required: false, received: 'a@b.example', fixedAt: '2026-11-19', autoOk: null })).toBe('fixed');
  });

  it('health signals name where each one comes from', () => {
    const progress = progressOf([step('a', { dueOn: '2026-11-02' })], [{ status: 'open', side: 'vendor', openedOn: '2026-11-01', dueOn: null }], '2026-11-10', 'active', '2026-11-01');
    const sig = healthSignals({ progress, accountId: 'acc', portalActive: false, tickets: 0, score: 82, setup: { available: true, failing: [], checkedAt: null, tests: [{ id: 'crm', status: 'fail', reason: null, at: null }], testsDone: false } });
    expect(Object.fromEntries(sig.map((s) => [s.key, s.source]))).toEqual({ progress: '#timeline', waiting: '#steps', issues: '#issues', tests: '/setup-test', portal: '/accounts/acc?tab=portal', tickets: '/records/ticket', score: '/accounts/acc?tab=health' });
    expect(sig.find((s) => s.key === 'issues')!.tone).toBe('bad');
    expect(sig.find((s) => s.key === 'tests')!.tone).toBe('bad');
  });
});

beforeAll(async () => {
  env = await setup({ portalDomain: PORTAL });
  portal = createPortalApp(env.deps);
  [ada, mert, zeynep, sofia] = await Promise.all(['ada', 'mert', 'zeynep', 'sofia'].map((n) => login(env, 'acme', `${n}@demo.example`)));
  stranger = await login(env, 'beta', env.b.adminEmail);
});
afterAll(() => setSetupSource(null));

describe('the company’s own plan', () => {
  let planId = '';
  it('opens for an administrator and ticks itself from what the product sees', async () => {
    // A viewer cannot open it before an administrator has.
    expect((await sofia.get('/api/onboarding/self')).json.plan).toBeNull();
    const r = await ada.get('/api/onboarding/self');
    expect(r.status).toBe(200);
    const plan: Plan = r.json.plan;
    planId = plan.id;
    expect(plan.kind).toBe('self');
    const byKey = Object.fromEntries(plan.steps.map((s) => [s.key, s]));
    // The demo company has a team and departments with leads: done by themselves.
    expect(byKey.team).toMatchObject({ status: 'done', doneHow: 'auto' });
    expect(byKey.departments).toMatchObject({ status: 'done', doneHow: 'auto' });
    expect(byKey.kickoff.status).toBe('todo');
    expect(plan.progress.auto).toBeGreaterThanOrEqual(2);
    expect(plan.people.map((p) => p.side).sort()).toEqual(['customer', 'vendor']);
    // Everyone in the company may read it; the side bar's summary agrees.
    expect((await sofia.get('/api/onboarding/self')).json.plan.id).toBe(planId);
    expect((await zeynep.get('/api/onboarding/self/summary')).json.summary.pct).toBe(plan.progress.pct);
  });

  it('manual ticks only for what the product cannot see, and never on a locked step', async () => {
    const plan: Plan = (await ada.get('/api/onboarding/self')).json.plan;
    const s = (k: string) => plan.steps.find((x) => x.key === k)!;
    expect((await ada.patch(`/api/onboarding-steps/${s('import').id}`, { status: 'done' })).status).toBe(400);
    expect((await ada.patch(`/api/onboarding-steps/${s('golive').id}`, { status: 'done' })).status).toBe(409);
    const k = await zeynep.patch(`/api/onboarding-steps/${s('kickoff').id}`, { status: 'done' });
    expect(k.status).toBe(200);
    expect(k.json.plan.steps.find((x: PlanStep) => x.key === 'kickoff')).toMatchObject({ status: 'done', doneHow: 'manual' });
    // A viewer reads, never writes.
    expect((await sofia.patch(`/api/onboarding-steps/${s('kickoff').id}`, { status: 'todo' })).status).toBe(403);
    // Another company cannot see it at all.
    expect((await stranger.get(`/api/onboarding-plans/${planId}`)).status).toBe(404);
  });

  it('a failed setup test is one shared issue, resolved when the test passes', async () => {
    const tests = [{ id: 'crm', status: 'fail' as const, reason: 'auth_expired', at: new Date().toISOString() }];
    setSetupSource({ read: async () => ({ available: true, failing: [], checkedAt: new Date().toISOString(), tests, testsDone: false }) });
    let plan: Plan = (await ada.get('/api/onboarding/self')).json.plan;
    await ada.get('/api/onboarding/self');
    const rows = () => plan.issues.filter((i) => i.source === 'setup_test');
    plan = (await ada.get('/api/onboarding/self')).json.plan;
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ sourceRef: 'crm', status: 'open', side: 'customer', urgency: 'high' });
    // Checks green: the health step ticks itself; the tests step waits.
    expect(plan.steps.find((s) => s.key === 'health')!.status).toBe('done');
    expect(plan.steps.find((s) => s.key === 'test')!.status).toBe('todo');
    // The row cannot be deleted by hand.
    expect((await ada.del(`/api/onboarding-issues/${rows()[0].id}`)).status).toBe(409);
    tests[0].status = 'pass' as any;
    plan = (await ada.get('/api/onboarding/self')).json.plan;
    expect(rows()[0].status).toBe('resolved');
    expect(plan.setup.available).toBe(true);
    setSetupSource(null);
  });

  it('reminds whoever owns a step, in the app only (e-mail is an opt-in setting)', async () => {
    const [p] = await sys(`select p.id, p.org_id, p.owner_id, p.created_by, p.name, p.account_id, o.timezone, o.settings from onboarding_plans p join orgs o on o.id = p.org_id where p.id = $1`, [planId]);
    const n = await env.db.system((q) => remindPlan(q, p, new Date()));
    expect(n).toBeGreaterThan(0);
    const kinds = await sys(`select distinct kind from notifications where org_id = $1 and kind like 'onboarding%'`, [env.a.orgId]);
    expect(kinds.map((k: any) => k.kind)).toEqual(['onboarding']);
    // Once per turn: nothing more right away.
    expect(await env.db.system((q) => remindPlan(q, p, new Date()))).toBe(0);
    expect((await ada.get('/api/onboarding/settings')).json.settings.emailNudges).toBe(false);
    expect((await zeynep.put('/api/onboarding/settings', { emailNudges: true })).status).toBe(403);
  });
});

describe('a customer’s plan', () => {
  let planId = '';
  let account = '';
  it('opens as a draft with the hand-over card, drafted note included, and starts when the card is confirmed', async () => {
    account = env.a.accounts['Cedarmoor Health'];
    await sys(`insert into promises (org_id, account_id, body) values ($1, $2, 'Weekly status call during setup')`, [env.a.orgId, account]);
    const board = env.a.boards.csBoard;
    const task = (await ada.post('/api/tasks', { boardId: board, title: 'Cedarmoor renewal', accountId: account })).json.task;
    const h = await ada.post('/api/handovers', { sourceKind: 'task', sourceId: task.id });
    expect(h.status).toBe(201);
    const list = (await mert.get(`/api/onboarding-plans?account=${account}`)).json.plans;
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe('draft');
    planId = list[0].id;
    const draft: Plan = (await mert.get(`/api/onboarding-plans/${planId}`)).json.plan;
    expect(draft.note).toContain('Weekly status call during setup');
    expect(draft.handoverId).toBe(h.json.handover.id);
    const c = await mert.post(`/api/handovers/${h.json.handover.id}/confirm`, { ownerId: env.a.ids.mert, planId: null });
    expect(c.status).toBe(200);
    const plan: Plan = (await mert.get(`/api/onboarding-plans/${planId}`)).json.plan;
    expect(plan).toMatchObject({ status: 'active', ownerId: env.a.ids.mert });
    expect(plan.steps.find((s) => s.key === 'handover')!.status).toBe('done');
    // A second plan for the same customer while one runs: no.
    expect((await mert.post('/api/onboarding-plans', { accountId: account })).status).toBe(409);
  });

  it('a step’s form writes to the customer’s record; the data table judges what arrived', async () => {
    await sys(`update orgs set account_fields = account_fields || '[{"key":"website","label":{"en":"Website"},"type":"url"}]'::jsonb where id = $1 and not account_fields @> '[{"key":"website"}]'`, [env.a.orgId]);
    let plan: Plan = (await mert.get(`/api/onboarding-plans/${planId}`)).json.plan;
    const details = plan.steps.find((s) => s.key === 'details')!;
    await sys(`update onboarding_steps set depends_on = '{}' where id = $1`, [details.id]);
    const a = await mert.post(`/api/onboarding-steps/${details.id}/answer`, { values: { website: 'https://cedarmoor.example', secret: 'x' } });
    expect(a.status).toBe(200);
    const [acc] = await sys('select fields from accounts where id = $1', [account]);
    expect(acc.fields.website).toBe('https://cedarmoor.example');
    expect(acc.fields.secret).toBeUndefined();
    plan = a.json.plan;
    expect(plan.steps.find((s) => s.key === 'details')!.status).toBe('done');
    const email = plan.fields.find((f) => f.name === 'email')!;
    plan = (await mert.patch(`/api/onboarding-fields/${email.id}`, { received: 'ops.cedarmoor.example' })).json.plan;
    expect(fieldState(plan.fields.find((f) => f.id === email.id)!)).toBe('failing');
    plan = (await mert.patch(`/api/onboarding-fields/${email.id}`, { received: 'ops@cedarmoor.example', verified: true })).json.plan;
    const fixed = plan.fields.find((f) => f.id === email.id)!;
    expect(fieldState(fixed)).toBe('fixed');
    expect(fixed.verifiedBy).toBeTruthy();
  });

  it('an issue links to the customer’s ticket instead of copying it; the ticket decides', async () => {
    const type = (await ada.post('/api/record-types', { kind: 'ticket' })).json.type ?? (await ada.get('/api/record-types')).json.types.find((t: any) => t.kind === 'ticket');
    const ticket = (await mert.post('/api/records', { typeId: type.id, accountId: account, name: 'Import stops at row 40', fields: { status: 'open' } })).json.record;
    let plan: Plan = (await mert.post(`/api/onboarding-plans/${planId}/issues`, { title: 'Import stops at row 40', side: 'vendor', type: 'data', urgency: 'high' })).json.plan;
    const issue = plan.issues.find((i) => i.title === 'Import stops at row 40')!;
    plan = (await mert.post(`/api/onboarding-issues/${issue.id}/ticket`, { recordId: ticket.id })).json.plan;
    expect(plan.issues.find((i) => i.id === issue.id)).toMatchObject({ recordId: ticket.id, ticketStatus: 'open' });
    const other = (await mert.post(`/api/onboarding-plans/${planId}/issues`, { title: 'Same thing again' })).json.plan.issues.find((i: any) => i.title === 'Same thing again');
    expect((await mert.post(`/api/onboarding-issues/${other.id}/ticket`, { recordId: ticket.id })).status).toBe(409);
    await sys(`update records set fields = fields || '{"status":"solved"}' where id = $1`, [ticket.id]);
    plan = (await mert.get(`/api/onboarding-plans/${planId}`)).json.plan;
    expect(plan.issues.find((i) => i.id === issue.id)!.status).toBe('resolved');
  });

  it('the shared report shows the report and nothing else; sharing again closes the old link', async () => {
    const one = (await mert.post(`/api/onboarding-plans/${planId}/share`)).json.url as string;
    const secret = one.split('/r/onboarding/')[1];
    const anon = await env.app.request(`https://acme.curahold.test/api/share/onboarding/${secret}`);
    expect(anon.status).toBe(200);
    const body = await anon.json();
    expect(body.report.progress.pct).toBeGreaterThan(0);
    const text = JSON.stringify(body);
    expect(text).not.toContain('Weekly status call');
    expect(text).not.toContain('@demo.example');
    expect(body.report.next.length).toBeLessThanOrEqual(3);
    await mert.post(`/api/onboarding-plans/${planId}/share`);
    expect((await env.app.request(`https://acme.curahold.test/api/share/onboarding/${secret}`)).status).toBe(404);
    // The same plan read in the app gives the same report.
    const plan: Plan = (await mert.get(`/api/onboarding-plans/${planId}`)).json.plan;
    expect((await mert.get(`/api/onboarding-plans/${planId}/report`)).json.report.progress.pct).toBe(reportOf(plan, 'x', new Date()).progress.pct);
  });

  it('the customer works their side in the portal, in the company’s colours', async () => {
    await ada.put('/api/portal/settings', { enabled: true });
    expect((await ada.post('/api/portal/users', { accountId: account, email: 'pia@cedarmoor.example', name: 'Pia Lund' })).status).toBe(201);
    const p = new PortalClient();
    await p.post('/papi/auth/start', { email: 'pia@cedarmoor.example' });
    await env.settle();
    const token = /#token=([A-Za-z0-9_-]+)/.exec(env.email.last('pia@cedarmoor.example').text)?.[1] ?? '';
    expect((await p.post('/papi/auth/verify', { token })).status).toBe(200);
    const r = await p.get('/papi/onboarding');
    expect(r.status).toBe(200);
    const plan = r.json.plans[0];
    expect(plan.id).toBe(planId);
    expect(JSON.stringify(plan)).not.toContain('Weekly status call'); // the internal note stays inside
    const customerStep = plan.steps.find((s: any) => s.key === 'training');
    const vendorStep = plan.steps.find((s: any) => s.key === 'owner');
    await sys(`update onboarding_steps set depends_on = '{}', side = 'customer' where id = $1`, [customerStep.id]);
    expect((await p.post(`/papi/onboarding/${customerStep.id}/tick`)).status).toBe(200);
    expect((await p.post(`/papi/onboarding/${vendorStep.id}/tick`)).status).toBe(404);
    const issue = await p.post(`/papi/onboarding/${planId}/issue`, { title: 'Who signs the data agreement?' });
    expect(issue.json.plans[0].issues.some((i: any) => i.title === 'Who signs the data agreement?' && i.side === 'vendor')).toBe(true);
    const inApp: Plan = (await mert.get(`/api/onboarding-plans/${planId}`)).json.plan;
    expect(inApp.steps.find((s) => s.key === 'training')!.doneHow).toBe('portal');
    expect(inApp.issues.find((i) => i.title === 'Who signs the data agreement?')!.fromPortal).toBe(true);
  });

  it('finishing keeps the baseline and hands the customer to Customer Success', async () => {
    await sys(`update onboarding_plans set department = 'onboarding' where id = $1`, [planId]);
    const f = await mert.post(`/api/onboarding-plans/${planId}/finish`);
    expect(f.status).toBe(200);
    expect(f.json.plan.status).toBe('done');
    expect(f.json.plan.baseline.at).toBeTruthy();
    const [card] = await sys(`select to_department, summary from handovers where id = $1`, [f.json.handoverId]);
    expect(card.to_department).toBe('success');
    expect(card.summary).toContain('Onboarding finished');
  });
});

describe('templates', () => {
  it('a built-in template is copied, edited and used for a new plan', async () => {
    const t = await mert.post('/api/onboarding-templates', { name: 'Clinics rollout', from: 'multisite' });
    expect(t.status).toBe(201);
    const steps = t.json.template.blueprint.steps.filter((s: any) => s.key !== 'training').map((s: any) => ({ ...s, after: (s.after ?? []).filter((k: string) => k !== 'training') }));
    const e = await mert.patch(`/api/onboarding-templates/${t.json.template.id}`, { blueprint: { ...t.json.template.blueprint, steps } });
    expect(e.status).toBe(200);
    const plan: Plan = (await mert.post('/api/onboarding-plans', { accountId: env.a.accounts['Velto Mobility'], templateId: t.json.template.id })).json.plan;
    expect(plan.steps.some((s) => s.key === 'training')).toBe(false);
    expect(plan.sites.length).toBe(3);
    const list = (await mert.get('/api/onboarding-templates')).json;
    expect(list.builtIn.map((b: any) => b.key)).toEqual(['self', 'standard', 'multisite']);
    expect(list.templates.find((x: any) => x.id === t.json.template.id).used).toBe(1);
    expect((await sofia.post('/api/onboarding-templates', { name: 'Nope', from: 'standard' })).status).toBe(403);
  });
});

/** A browser on the portal's domain. */
class PortalClient {
  cookie = '';
  async req(method: string, path: string, body?: unknown) {
    const h: Record<string, string> = { 'x-curahold-portal': '1' };
    if (this.cookie) h.cookie = this.cookie;
    if (body !== undefined) h['content-type'] = 'application/json';
    const res = await portal.request(`https://acme.${PORTAL}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const m = /app_portal=([^;]*)/.exec(res.headers.get('set-cookie') ?? '');
    if (m) this.cookie = m[1] ? `app_portal=${m[1]}` : '';
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: res.status, json };
  }
  get = (p: string) => this.req('GET', p);
  post = (p: string, b: unknown = {}) => this.req('POST', p, b);
}
