// The owner console's own sections and the AI team's shared model: only the
// platform owner, in his own console session, sees them and decides; trial
// requests become companies with a seat cap and an end date; the checklist's
// triggers fire on real data; agents propose but can never approve; every
// agent call is audited; the pause switches stop writes.
import { base32Decode, hotp, stepOf } from '../api/src/lib/totp';
import { beforeAll, describe, expect, it } from 'vitest';
import { insertTrialRequest } from '../api/src/lib/trialRequests';
import type { TrialRequestInput } from '../shared/src/trialRequest';
import { BASE, setup, type Env } from './helpers';

const OWNER = 'owner@curahold.test';
const STAFF = 'helper@curahold.test';
const STAFF_KEY = 'staff-key-staff-key-staff-key-1234';
const DESK = `https://desk.${BASE}`;
let env: Env;

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
const agent = (key: string) => async (method: string, path: string, body?: unknown) => {
  const r = await env.app.request(`${DESK}/api/agent${path}`, {
    method,
    headers: { authorization: `Bearer ${key}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
};

const request = (over: Partial<TrialRequestInput> = {}): TrialRequestInput => ({
  name: 'Mina Karaca',
  email: 'mina@northwind.example',
  emailVerifiedAt: new Date().toISOString(),
  freeMailNote: null,
  phone: null,
  title: 'Head of Sales',
  linkedinUrl: null,
  company: 'Northwind Trading',
  website: 'https://northwind.example',
  country: 'TR',
  city: 'Izmir',
  industry: 'Wholesale',
  companySize: '51-200',
  teamSize: 18,
  seats: 18,
  seatsByDepartment: { sales: 12, success: 6 },
  departments: ['sales', 'success'],
  problems: ['renewals'],
  problemText: 'Renewals slip through.',
  tools: { crm: ['Spreadsheet'] },
  customersManaged: '200-500',
  timeline: 'this-month',
  heardFrom: 'search',
  language: 'tr',
  contactTime: null,
  source: 'site',
  utm: {},
  consents: [{ key: 'notice', version: '2026-11', hash: 'a'.repeat(64), granted: true }],
  marketing: false,
  ipCountry: 'TR',
  ...over,
});

let owner: Desk;
beforeAll(async () => {
  env = await setup({ staffKey: STAFF_KEY, support: { email: 'desk@curahold.test', staff: [OWNER, STAFF] } });
  owner = await new Desk().signIn(OWNER);
});

describe('who may open the owner sections', () => {
  it('the owner in his session; not other staff, not the staff key, not nobody', async () => {
    expect((await owner.req('GET', '/me')).json.owner).toBe(true);
    expect((await owner.req('GET', '/owner/overview')).status).toBe(200);
    const helper = await new Desk().signIn(STAFF);
    expect((await helper.req('GET', '/me')).json.owner).toBe(false);
    for (const p of ['/owner/overview', '/owner/bar', '/owner/requests', '/owner/plan', '/owner/checklist', '/office/approvals', '/office/seats']) {
      expect((await helper.req('GET', p)).status, p).toBe(403);
      expect((await new Desk().req('GET', p, undefined, { 'x-curahold-staff-key': STAFF_KEY })).status, p).toBe(403);
      expect((await new Desk().req('GET', p)).status, p).toBe(403);
    }
  });

  it('the overview carries every tile', async () => {
    const o = (await owner.req('GET', '/owner/overview')).json;
    expect(Object.keys(o).sort()).toEqual(['approvalsPending', 'checklist', 'errors', 'growth', 'invoices', 'prev', 'requests', 'site', 'states', 'strip', 'today', 'usage'].sort());
    // Each tile's change: the period before counts apart from the current one.
    expect(Object.keys(o.prev).sort()).toEqual(['paid30', 'requests30', 'server24h', 'signups30', 'syncFailed24h']);
    const before = o.growth.signups30;
    await env.db.system((q) => q.query(`update orgs set created_at = now() - interval '45 days' where id = (select id from orgs order by created_at desc limit 1)`));
    const o2 = (await owner.req('GET', '/owner/overview')).json;
    expect(o2.growth.signups30).toBe(before - 1);
    expect(o2.prev.signups30).toBe(o.prev.signups30 + 1);
    expect(o.states.paying + o.states.trial + o.states.free + o.states.churned).toBeGreaterThan(0);
    expect(o.site.connected).toBe(false);
    expect((await owner.req('GET', '/owner/bar')).json).toMatchObject({ approvalsPending: 0, requestsNew: 0, usage: { tokens: 0 } });
  });
});

describe('trial requests', () => {
  it('arrive with the owner told, duplicates flagged, and become a company on approval', async () => {
    const first = await insertTrialRequest(env.deps as never, request());
    expect(first.ref).toMatch(/^TQ-\d{6}$/);
    expect(env.email.sent.some((m) => m.to === OWNER && m.subject.includes(first.ref))).toBe(true);
    const again = await insertTrialRequest(env.deps as never, request({ email: 'ops@northwind.example', name: 'Deniz Ok' }));
    const list = (await owner.req('GET', '/owner/requests')).json;
    expect(list.settings).toEqual({ 'trial.seatCap': 25, 'trial.months': 3 });
    expect(list.requests.find((r: any) => r.ref === again.ref).duplicateOf).toBe(first.ref);

    expect((await owner.req('POST', `/owner/requests/${first.id}/contacted`, { note: 'Called' })).status).toBe(200);
    const ends = new Date(Date.now() + 40 * 86400_000).toISOString().slice(0, 10);
    const ok = await owner.req('POST', `/owner/requests/${first.id}/approve`, { departments: ['sales', 'success'], seatCap: 20, endsOn: ends });
    expect(ok.status, JSON.stringify(ok.json)).toBe(200);
    const [org] = await env.db.system((q) => q.query(`select o.slug, o.trial_seat_cap, o.settings->'departments' as d, o.trial_ends_at from orgs o where o.id = $1`, [ok.json.orgId]));
    expect(org).toMatchObject({ slug: 'northwind-trading', trial_seat_cap: 20, d: ['sales', 'success'] });
    expect(new Date(org.trial_ends_at).toISOString().slice(0, 10)).toBe(ends);
    const mail = env.email.sent.find((m) => m.to === 'mina@northwind.example');
    expect(mail?.subject).toContain('Northwind Trading');
    expect(mail?.text).toContain('/auth/verify#token=');
    expect(mail?.text).toContain('Merhaba Mina Karaca');
    expect((await owner.req('POST', `/owner/requests/${first.id}/approve`, { departments: ['sales'], seatCap: 5 })).status).toBe(409);
    const d = (await owner.req('GET', `/owner/requests/${first.id}`)).json;
    expect(d).toMatchObject({ status: 'approved', seatCap: 20, orgSlug: 'northwind-trading', decidedBy: OWNER });
    const [log] = await env.db.system((q) => q.query(`select staff_email from desk_log where action = 'trial.approved' and ref = $1`, [first.ref]));
    expect(log.staff_email).toBe(OWNER);
  });

  it('rejecting prepares a polite answer in their language and sends nothing', async () => {
    const r = await insertTrialRequest(env.deps as never, request({ email: 'lee@far.example', company: 'Far Away', language: 'ja', country: 'JP' }));
    const before = env.email.sent.length;
    const out = await owner.req('POST', `/owner/requests/${r.id}/reject`, { reason: 'Out of scope' });
    expect(out.status).toBe(200);
    expect(out.json.draft).toContain('Far Away');
    expect(out.json.subject).toContain('トライアル');
    expect(env.email.sent.length).toBe(before);
  });

  it('settings change the defaults', async () => {
    const s = await owner.req('PUT', '/owner/settings', { 'trial.seatCap': 30, 'trial.months': 2 });
    expect(s.json.settings).toEqual({ 'trial.seatCap': 30, 'trial.months': 2 });
    expect((await owner.req('PUT', '/owner/settings', { 'trial.months': 40 })).status).toBe(400);
  });
});

describe('plan & targets, checklist', () => {
  it('targets are editable and read against actuals', async () => {
    const period = new Date().toISOString().slice(0, 7);
    const p = await owner.req('PUT', '/owner/plan/targets', { targets: [{ metric: 'trial_requests', period, target: 1 }, { metric: 'mrr', period, target: 1e9 }] });
    expect(p.status).toBe(200);
    const rows = Object.fromEntries(p.json.rows.map((r: any) => [r.metric, r]));
    expect(rows.trial_requests.actual).toBeGreaterThanOrEqual(3);
    expect(rows.trial_requests.pace).toBe('on-track');
    expect(rows.mrr.pace).toBe('behind');
    expect(rows.site_visitors).toMatchObject({ actual: null, pace: 'no-target' });
    const t = await owner.req('POST', '/owner/plan/tasks', { title: 'Call the lawyer', dueOn: new Date().toISOString().slice(0, 10) });
    expect(t.status).toBe(201);
    expect((await owner.req('GET', '/owner/plan')).json.tasks.today.map((x: any) => x.title)).toContain('Call the lawyer');
  });

  it('gives one task at a time, and a trigger on real data makes a later item the next task', async () => {
    let c = (await owner.req('GET', '/owner/checklist')).json;
    // The approved Turkish company above is a customer in TR: the KVKK transfer item has fired.
    expect(c.entries.find((e: any) => e.id === 'kvkk-transfer').triggered.why).toContain('TR');
    expect(c.next.id).toBe('kvkk-transfer');
    expect(c.entries.find((e: any) => e.id === 'zatca').triggered).toBeNull();
    // A paying company in Saudi Arabia: e-invoicing becomes due.
    await env.db.system((q) => q.query(`update orgs set settings = settings || '{"country":"SA"}', billing = '{"status":"active","plan":"team","seats":3}' where slug = 'beta'`));
    c = (await owner.req('GET', '/owner/checklist')).json;
    expect(c.entries.find((e: any) => e.id === 'zatca').triggered).toBeTruthy();
    c = (await owner.req('PUT', `/owner/checklist/${c.next.id}`, { status: 'done', note: 'done with the lawyer' })).json;
    expect(c.entries.find((e: any) => e.id === 'kvkk-transfer').status).toBe('done');
    expect(c.next.id).not.toBe('kvkk-transfer');
    expect((await owner.req('PUT', '/owner/checklist/not-an-item', { status: 'done' })).status).toBe(404);
  });
});

describe('the AI team: proposals, the owner decides, audit, pauses', () => {
  let call: ReturnType<typeof agent>;
  let note: ReturnType<typeof agent>;
  it('agents propose; only the owner session approves; the action runs only then', async () => {
    const seat = { title: 'Chief Operating Officer', titleTr: 'Plan, kuyruk ve onay özeti', team: 'exec', tier: 'ceo-office', state: 'standing', weeklyBudget: 1000, agent: { name: 'Oren' } };
    expect((await owner.req('PUT', '/office/seats/coo', seat)).status).toBe(200);
    expect((await owner.req('PUT', '/office/seats/cfo', { title: 'Chief Financial Officer', team: 'exec', tier: 'executive', reportsTo: 'coo' })).status).toBe(200);
    expect((await owner.req('PUT', '/office/seats/minutes', { title: 'Meeting Secretary', team: 'exec', tier: 'note-taker' })).status).toBe(200);
    call = agent((await owner.req('POST', '/office/seats/coo/key')).json.key);
    note = agent((await owner.req('POST', '/office/seats/minutes/key')).json.key);
    expect((await agent('ag_coo_wrongwrongwrongwrongwrong')('GET', '/me')).status).toBe(401);
    expect((await call('GET', '/me')).json.seat).toMatchObject({ seat: 'coo', agent: { name: 'Oren' } });

    const p = await call('POST', '/approvals', {
      title: 'Ask the CFO for a runway check',
      summary: 'COO and CFO talked',
      whatChanges: 'A task in the CFO queue',
      discussedWith: ['cfo'],
      risk: 'low',
      reversible: true,
      action: { kind: 'queue-task', seat: 'cfo', title: 'Runway check' },
    });
    expect(p.status, JSON.stringify(p.json)).toBe(201);
    // A secret never reaches the queue.
    expect((await call('POST', '/approvals', { title: 'x', summary: 'key sk_live_abcdefghijklmnop', reversible: true })).status).toBe(400);
    const [a] = (await owner.req('GET', '/office/approvals')).json.approvals;
    expect(a).toMatchObject({ ref: p.json.ref, proposedBy: 'coo', discussedWith: ['cfo'], status: 'pending', reversible: true, risk: 'low' });

    // The agent's key opens no decision: not on its door (no such route), not on the owner's.
    const viaOwnerDoor = await env.app.request(`${DESK}/api/desk/office/approvals/${a.id}/decide`, {
      method: 'POST',
      headers: { authorization: `Bearer ${'x'}`, 'content-type': 'application/json', 'x-curahold-desk': '1' },
      body: JSON.stringify({ decision: 'approve' }),
    });
    expect(viaOwnerDoor.status).toBe(403);
    expect((await call('POST', `/approvals/${a.id}/decide`, { decision: 'approve' })).status).toBe(404);
    const helper = await new Desk().signIn(STAFF);
    expect((await helper.req('POST', `/office/approvals/${a.id}/decide`, { decision: 'approve' })).status).toBe(403);
    const [still] = await env.db.system((q) => q.query('select status from approvals where id = $1', [a.id]));
    expect(still.status).toBe('pending');

    const yes = await owner.req('POST', `/office/approvals/${a.id}/decide`, { decision: 'approve', edits: { title: 'Runway check by Friday' } });
    expect(yes.json.approval).toMatchObject({ status: 'done', decidedBy: OWNER, title: 'Runway check by Friday' });
    const [task] = await env.db.system((q) => q.query(`select seat, title from agent_tasks where seat = 'cfo'`));
    expect(task.title).toBe('Runway check');
    expect((await owner.req('POST', `/office/approvals/${a.id}/decide`, { decision: 'reject' })).status).toBe(409);
  });

  it('every agent call is in an audit trail that cannot be changed', async () => {
    const audit = (await owner.req('GET', '/office/audit?seat=coo')).json.audit;
    expect(audit.some((l: any) => l.actor === 'agent' && l.action.startsWith('POST'))).toBe(true);
    expect(audit.some((l: any) => l.actor === 'owner' && l.action === 'approval.approve')).toBe(true);
    await expect(env.db.system((q) => q.query(`update agent_audit set action = 'x'`))).rejects.toThrow(/append-only/);
    await expect(env.db.system((q) => q.query(`delete from agent_audit`))).rejects.toThrow(/append-only/);
  });

  it('meeting minutes turn decisions into approval cards', async () => {
    const m = await call('POST', '/meetings', { title: 'Pricing check', attendees: ['coo', 'cfo'] });
    expect(m.status).toBe(201);
    expect((await call('POST', `/meetings/${m.json.meeting.id}/lines`, { body: 'Agenda: pricing' })).status).toBe(201);
    expect((await owner.req('POST', `/office/meetings/${m.json.meeting.id}/lines`, { body: 'I am listening' })).status).toBe(201);
    expect((await call('PUT', `/meetings/${m.json.meeting.id}/minutes`, { decisions: ['x'] })).status).toBe(403);
    const done = await note('PUT', `/meetings/${m.json.meeting.id}/minutes`, { agenda: ['pricing'], items: [{ topic: 'pricing', summary: 'keep' }], decisions: ['Keep the price for Q1'], actions: [{ seat: 'cfo', what: 'model' }] });
    expect(done.status, JSON.stringify(done.json)).toBe(200);
    expect(done.json.approvals).toHaveLength(1);
    const d = (await owner.req('GET', `/office/meetings/${m.json.meeting.id}`)).json;
    expect(d.meeting.status).toBe('ended');
    expect(d.lines.map((l: any) => l.speaker)).toEqual(['coo', 'owner']);
  });

  it('pausing everyone stops writes; resuming lets them through; the weekly budget pauses a seat', async () => {
    const p = await owner.req('POST', '/office/pauses', { scope: 'all', reason: 'check' });
    expect(p.status).toBe(201);
    expect((await call('POST', '/log', { kind: 'note', body: 'hello' })).status).toBe(403);
    expect((await call('GET', '/me')).json.seat.paused).toBe(true);
    await owner.req('DELETE', `/office/pauses/${p.json.id}`);
    expect((await call('POST', '/log', { kind: 'note', body: 'hello' })).status).toBe(201);
    const u = await call('POST', '/usage', { tokens: 1200, costUsd: 0.5 });
    expect(u.json).toMatchObject({ paused: true, budget: 1000 });
    expect((await call('POST', '/log', { kind: 'note', body: 'again' })).status).toBe(403);
    expect((await owner.req('GET', '/office/seats')).json.seats.find((s: any) => s.seat === 'coo').paused).toBe(true);
  });

  it('repeated refused actions pause the seat; a handover moves the key away', async () => {
    const cfo = agent((await owner.req('POST', '/office/seats/cfo/key')).json.key);
    const [t] = await env.db.system((q) => q.query(`insert into agent_tasks (seat, title) values ('coo', 'not yours') returning id`));
    for (let i = 0; i < 3; i++) expect((await cfo('PATCH', `/tasks/${t.id}`, { status: 'done' })).status).toBe(403);
    expect((await owner.req('GET', '/office/seats')).json.seats.find((s: any) => s.seat === 'cfo').paused).toBe(true);
    const h = await owner.req('POST', '/office/seats/cfo/handover', { filledBy: 'human', humanEmail: 'cfo@curahold.test' });
    expect(h.json.openWork.map((x: any) => x.title)).toContain('Runway check');
    expect((await cfo('GET', '/me')).status).toBe(401);
  });
});
