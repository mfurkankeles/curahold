// The AI team foundation: the org chart as data, the approval gate enforced in
// code (agents only propose; outside kinds need the right seat, a review by
// another seat and the owner's own decision; output checks before the queue),
// least-privilege tools with the monitor pausing a seat that reaches past
// them, memory the owner can read/correct/delete, the zero-cost wake
// pre-check, golden tasks deciding who is active, chats with full history,
// and meetings whose outcomes are only proposals.
import { beforeAll, describe, expect, it } from 'vitest';
import { base32Decode, hotp, stepOf } from '../api/src/lib/totp';
import { mockProvider, respondWith, type LlmRequest, type LlmResponse } from '../api/src/assistant/provider';
import { registerRunner } from '../api/src/team/gate';
import { cronMatches } from '../api/src/team/precheck';
import { ACTION_KINDS, isExternal, NEEDS_REVIEW } from '../shared/src/team/gate';
import { ACTIVE_SEATS, LADDER, ORG_CHART } from '../shared/src/team/orgChart';
import { goldenTasks } from '../shared/src/team/golden';
import { weeklyEstimate } from '../shared/src/team/cadence';
import { screen } from '../shared/src/team/checks';
import { BASE, setup, type Env } from './helpers';

const OWNER = 'owner@curahold.test';
const STAFF = 'helper@curahold.test';
const DESK = `https://desk.${BASE}`;
const COMPETITOR = 'Rivalboard';
let env: Env;

const secrets = new Map<string, string>();
class Desk {
  cookie = '';
  async req(method: string, path: string, body?: unknown) {
    const r = await env.app.request(`${DESK}/api/desk${path}`, {
      method,
      headers: { 'x-curahold-desk': '1', ...(this.cookie ? { cookie: this.cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
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

// ------------------------------------------------------------ a scripted model (no key, no cost)

/** Queue of scripted answers; when empty, a sensible default per request type. */
const queue: ((req: LlmRequest) => LlmResponse)[] = [];
const toolUse = (name: string, input: Record<string, unknown>): LlmResponse => ({ content: [{ type: 'tool_use', id: `toolu_${Math.random().toString(36).slice(2, 9)}`, name, input }], stop: 'tool_use', usage: { input: 900, output: 120, cacheRead: 1500, cacheWrite: 0 } });
const lastUser = (req: LlmRequest) => {
  const m = [...req.messages].reverse().find((x) => x.role === 'user');
  return typeof m?.content === 'string' ? m.content : JSON.stringify(m?.content ?? '');
};
const model = mockProvider((req) => {
  const next = queue.shift();
  if (next) return next(req);
  const names = req.tools.map((t) => t.name);
  if (names.includes('verdict')) return toolUse('verdict', { scores: [{ criterion: 'all', score: 5, note: 'ok' }], safe: true });
  if (names.includes('minutes'))
    return toolUse('minutes', { agenda: ['Ad test'], items: [{ topic: 'Ad test', summary: 'Two weeks, capped' }], decisions: ['Run a 2-week test at 20 USD/day'], actions: [{ seat: 'growth-lead', what: 'Draft the test plan', due: 'Friday' }], openQuestions: ['Who updates the pricing page?'] });
  if (names.includes('summaries')) return toolUse('summaries', { thread: 'They talked about the roadmap.', seat: 'CEO prefers short briefs.' });
  return respondWith({ reply: `Anladım: ${lastUser(req).slice(0, 60)}` });
});

let owner: Desk;
beforeAll(async () => {
  env = await setup({ support: { email: 'desk@curahold.test', staff: [OWNER, STAFF] }, assistant: { provider: 'anthropic', model: 'mock', globalMonthlyUsd: 100, companyMonthlyUsd: 5, companyMaxUsd: 50, blockedNames: [COMPETITOR], publicChat: false } });
  (env.deps as any).assistant = { provider: model };
  owner = await new Desk().signIn(OWNER);
  expect((await owner.req('GET', '/team/org')).status).toBe(200);
});
const activate = (...seats: string[]) => env.db.system((q) => q.query('update seats set activated_at = now() where seat = any($1)', [seats]));
const keyFor = async (seat: string) => (await owner.req('POST', `/office/seats/${seat}/key`)).json.key as string;
const pausedSeat = async (seat: string) => (await env.db.system((q) => q.query(`select 1 from agent_pauses where scope = 'seat' and target = $1 and resumed_at is null`, [seat]))).length > 0;
const resumeAll = () => env.db.system((q) => q.query(`update agent_pauses set resumed_at = now(), resumed_by = 'test' where resumed_at is null`));

// ------------------------------------------------------------ the chart as data

describe('the org chart', () => {
  it('is lean, hierarchical, titled on the ladder, with full cards', () => {
    expect(ACTIVE_SEATS.length).toBeGreaterThanOrEqual(12);
    expect(ACTIVE_SEATS.length).toBeLessThanOrEqual(15);
    const ids = new Set(ORG_CHART.map((s) => s.seat));
    expect(ids.size).toBe(ORG_CHART.length);
    expect(new Set(ORG_CHART.map((s) => s.name)).size).toBe(ORG_CHART.length);
    // No real person's name or nickname in the public org chart: names are invented (orgChart.ts header; tests/leak.test.ts guards it).
    expect(ORG_CHART.find((s) => s.seat === 'cpo')!.name).toBe('Öykü');
    for (const s of ORG_CHART) {
      expect(s.reportsTo === null || ids.has(s.reportsTo), s.seat).toBe(true);
      expect(LADDER).toContain(s.level);
      expect(s.titleTr.length, s.seat).toBeGreaterThan(10);
      expect(s.card.mission && s.card.missionTr && s.card.responsibilities.length && s.card.kpis.length && s.card.tools.length, s.seat).toBeTruthy();
      expect(s.weeklyBudget, s.seat).toBeGreaterThan(0);
      if (s.state === 'dormant') expect(s.wakeTrigger, s.seat).toBeTruthy();
      for (const k of s.card.proposes) expect(ACTION_KINDS).toContain(k);
      // A seat may review a kind only where separation of duties names it.
      for (const k of s.card.reviews ?? []) if (isExternal(k)) expect(NEEDS_REVIEW[k]?.reviewers, `${s.seat} reviews ${k}`).toContain(s.seat);
    }
    // No seat carries a private persona (it would ship in the public demo), and the dormant seats cost nothing on a schedule.
    expect(ORG_CHART.filter((s) => 'privateTone' in s.card).map((s) => s.seat)).toEqual([]);
    for (const s of ORG_CHART.filter((x) => x.state === 'dormant')) expect(weeklyEstimate(s.seat).wakes).toBe(0);
  });

  it('every active seat has its own golden tasks plus the gate test', () => {
    for (const seat of ACTIVE_SEATS) {
      const t = goldenTasks(seat);
      expect(t.length, seat).toBeGreaterThanOrEqual(3);
      expect(t.some((x) => x.id === `${seat}.gate`)).toBe(true);
    }
  });

  it('cadences are data, with weekly estimates and Istanbul time', () => {
    expect(weeklyEstimate('coo').runs).toBeGreaterThanOrEqual(7);
    expect(weeklyEstimate('software-engineer').wakes).toBe(0);
    // 08:40 Istanbul = 05:40 UTC.
    expect(cronMatches('40 8 * * *', new Date('2026-11-19T05:40:00Z'))).toBe(true);
    expect(cronMatches('40 8 * * *', new Date('2026-11-19T08:40:00Z'))).toBe(false);
    expect(cronMatches('10 9 * * 1', new Date('2026-11-23T06:10:00Z'))).toBe(true);
  });

  it('the console shows every seat, seeded once, with status and usage', async () => {
    const org = (await owner.req('GET', '/team/org')).json;
    expect(org.seats.length).toBe(ORG_CHART.length);
    const coo = org.seats.find((s: any) => s.seat === 'coo');
    expect(coo.name).toBe('Lale');
    expect(coo.active).toBe(false);
    expect(coo.golden.total).toBeGreaterThan(2);
    expect(org.month.capUsd).toBeGreaterThan(0);
    expect(org.model.available).toBe(true);
  });
});

// ------------------------------------------------------------ permissions

describe('who may reach the team', () => {
  it('only the owner in his session; not other staff, not an agent key', async () => {
    const helper = await new Desk().signIn(STAFF);
    for (const p of ['/team/org', '/team/seats/coo', '/team/cadences', '/team/seats/coo/memory']) {
      expect((await helper.req('GET', p)).status, p).toBe(403);
      expect((await new Desk().req('GET', p)).status, p).toBe(403);
    }
    const key = await keyFor('coo');
    const r = await env.app.request(`${DESK}/api/desk/team/org`, { headers: { authorization: `Bearer ${key}`, 'x-curahold-desk': '1' } });
    expect(r.status).toBe(403);
  });

  it('the runtime gives a seat only its own tools; reaching for an outside action pauses it', async () => {
    await resumeAll();
    await activate('content-marketing');
    const thread = (await owner.req('POST', '/team/seats/content-marketing/threads')).json.thread.id;
    // The model tries a tool the seat does not have, then an outside action by name.
    queue.push(
      () => toolUse('data_security', {}),
      () => toolUse('deploy', { branch: 'main' }),
      () => respondWith({ reply: 'Hazırladım, onayınıza sunuyorum.' }),
    );
    const res = await owner.req('POST', `/team/threads/${thread}/messages`, { text: 'Bugünkü paylaşımı hemen yayınla.' });
    expect(res.status).toBe(201);
    expect(await pausedSeat('content-marketing')).toBe(true);
    const audit = await env.db.system((q) => q.query(`select action from agent_audit where seat = 'content-marketing' order by id`));
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(['refused.tool.data_security', 'monitor.gate-bypass']));
    // Paused: the next message gets no model call.
    const calls = model.calls.length;
    const again = await owner.req('POST', `/team/threads/${thread}/messages`, { text: 'Devam?' });
    expect(again.json.status).toBe('paused');
    expect(model.calls.length).toBe(calls);
  });
});

// ------------------------------------------------------------ the approval gate

describe('the approval gate', () => {
  const p = (over: Record<string, unknown> = {}) => ({ title: 'Ship the board fix', summary: 'Gate green', why: 'Faster boards', whatChanges: 'New build live', reversible: true, priority: 'normal', risk: 'low', ...over });

  it('a seat may not propose an outside kind off its card — paused at the first try', async () => {
    await resumeAll();
    const call = agent(await keyFor('docs-localization'));
    const r = await call('POST', '/approvals', p({ action: { kind: 'deploy' } }));
    expect(r.status).toBe(403);
    expect(await pausedSeat('docs-localization')).toBe(true);
  });

  it('outside kinds need a review by another permitted seat; never self-review', async () => {
    await resumeAll();
    const cto = agent(await keyFor('cto'));
    expect((await cto('POST', '/approvals', p({ action: { kind: 'deploy' } }))).json.reason ?? 'review').toBeTruthy();
    expect((await cto('POST', '/approvals', p({ action: { kind: 'deploy' } }))).status).toBe(403);
    // A review written by the proposer itself does not count.
    const self = (await cto('POST', '/log', { kind: 'report', body: 'Reviewed my own branch' })).json.entry.id;
    await env.db.system((q) => q.query(`update company_log set meta = '{"review":{"verdict":"approve","kind":"deploy"}}' where id = $1`, [self]));
    expect((await cto('POST', '/approvals', p({ action: { kind: 'deploy', reviewedBy: 'cto', reviewLog: self } }))).status).toBe(403);
    await resumeAll();
    // The release lead's review makes it eligible.
    const qa = agent(await keyFor('release-reliability'));
    const rev = (await qa('POST', '/log', { kind: 'report', body: 'Release gate green for the board fix' })).json.entry.id;
    await env.db.system((q) => q.query(`update company_log set meta = '{"review":{"verdict":"approve","kind":"deploy"}}' where id = $1`, [rev]));
    const ok = await cto('POST', '/approvals', p({ action: { kind: 'deploy', reviewedBy: 'release-reliability', reviewLog: rev } }));
    expect(ok.status, JSON.stringify(ok.json)).toBe(201);
  });

  it('runs only after the owner’s yes, through the registered runner, never for a forged approval', async () => {
    await resumeAll();
    const ran: string[] = [];
    registerRunner('deploy', async (_d, _q, a) => {
      ran.push(a.ref);
      return 'deployed (test runner)';
    });
    const [a] = (await owner.req('GET', '/office/approvals')).json.approvals.filter((x: any) => x.action.kind === 'deploy');
    // Before the yes: nothing runs.
    expect((await owner.req('POST', `/team/approvals/${a.id}/execute`)).status).toBe(409);
    expect(ran).toEqual([]);
    const d = await owner.req('POST', `/office/approvals/${a.id}/decide`, { decision: 'approve' });
    expect(d.json.approval.status).toBe('done');
    expect(ran).toEqual([a.ref]);
    // An approval marked "approved" by anyone but the owner (here: straight in the database) fails at the runner.
    const forged = await env.db.system((q) =>
      q.query<{ id: string }>(`insert into approvals (title, proposed_by, action, status, decided_by, decided_at) values ('Forged', 'cto', '{"kind":"deploy"}', 'approved', 'cto', now()) returning id`),
    );
    const r = await owner.req('POST', `/team/approvals/${forged[0].id}/execute`);
    expect(r.json.status).toBe('failed');
    expect(ran.length).toBe(1);
  });

  it('output checks: secrets and other companies’ data block; competitor names block outside, flag inside', async () => {
    await resumeAll();
    const coo = agent(await keyFor('coo'));
    expect((await coo('POST', '/approvals', p({ summary: 'key sk-ant-abcdefghijklmnop123', action: { kind: 'none' } }))).status).toBe(400);
    // The two sample companies, under names of their own.
    await env.db.system((q) => q.query(`update orgs set name = case slug when 'acme' then 'Acme Lojistik' else 'Beta Gıda' end where slug in ('acme', 'beta')`));
    const names = ['Acme Lojistik', 'Beta Gıda'];
    expect(names.length).toBe(2);
    const cross = await coo('POST', '/approvals', p({ summary: `Compare ${names[0]} with ${names[1]}`, action: { kind: 'none' } }));
    expect(cross.status).toBe(400);
    const inside = await coo('POST', '/approvals', p({ title: 'Note', summary: `${COMPETITOR} raised prices`, action: { kind: 'none' } }));
    expect(inside.status).toBe(201);
    const card = (await owner.req('GET', '/office/approvals')).json.approvals.find((x: any) => x.ref === inside.json.ref);
    expect(card.checks.map((f: any) => f.rule)).toContain('competitor');
    const growth = agent(await keyFor('growth-lead'));
    const tl = agent(await keyFor('trust-lead'));
    const rev = (await tl('POST', '/log', { kind: 'report', body: 'Post reviewed' })).json.entry.id;
    await env.db.system((q) => q.query(`update company_log set meta = '{"review":{"verdict":"approve","kind":"publish-post"}}' where id = $1`, [rev]));
    const out = await growth('POST', '/approvals', p({ title: 'Post', summary: `We beat ${COMPETITOR}`, action: { kind: 'publish-post', reviewedBy: 'trust-lead', reviewLog: rev } }));
    expect(out.status).toBe(400);
    // The pure checks: personal data and unproven claims are flagged.
    const f = screen(['Call +90 532 000 11 22, the world’s best tool'], {});
    expect(f.map((x) => x.rule).sort()).toEqual(['pii', 'unproven-claim']);
  });
});

// ------------------------------------------------------------ memory + chats

describe('memory and chat history', () => {
  it('a chat keeps full history; the agent remembers; the owner reads, corrects and deletes', async () => {
    await resumeAll();
    const t = (await owner.req('POST', '/team/seats/cfo/threads')).json.thread.id;
    queue.push(() => respondWith({ reply: 'Pazartesi rakamları hazır olacak.', remember: ['CEO wants numbers on Monday by 10:00'] }));
    const r = await owner.req('POST', `/team/threads/${t}/messages`, { text: 'Rakamları pazartesi 10’a kadar iste.' });
    expect(r.json.messages.map((m: any) => m.role)).toEqual(['owner', 'agent']);
    let mem = (await owner.req('GET', '/team/seats/cfo/memory')).json;
    expect(mem.facts.map((f: any) => f.value)).toContain('CEO wants numbers on Monday by 10:00');
    const key = mem.facts[0].key;
    mem = (await owner.req('PUT', `/team/seats/cfo/memory/${key}`, { value: 'CEO wants numbers on Monday by 09:30' })).json.memory;
    expect(mem.facts[0].value).toContain('09:30');
    mem = (await owner.req('PUT', '/team/seats/cfo/memory/fact.new', { value: 'Prefers USD' })).json.memory;
    expect(mem.facts.length).toBe(2);
    expect((await owner.req('PUT', '/team/seats/cfo/memory/summary', { value: 'Weekly numbers on Mondays.' })).json.memory.summary.value).toContain('Mondays');
    expect((await owner.req('DELETE', `/team/seats/cfo/memory/${key}`)).status).toBe(200);
    expect((await owner.req('DELETE', `/team/seats/cfo/memory/${key}`)).status).toBe(404);
    expect((await owner.req('PUT', '/team/seats/cfo/memory/not-a-key', { value: 'x' })).status).toBe(400);
    // The next run reads the corrected memory.
    await owner.req('POST', `/team/threads/${t}/messages`, { text: 'Ne hatırlıyorsun?' });
    const sys = model.calls[model.calls.length - 1].system.map((b) => b.text).join('\n');
    expect(sys).toContain('Prefers USD');
    expect(sys).not.toContain('09:30');
    // History: scroll back, search, jump to a date, export.
    const h = (await owner.req('GET', `/team/threads/${t}/messages`)).json.messages;
    expect(h.length).toBe(4);
    expect((await owner.req('GET', `/team/threads/${t}/messages?before=${h[2].id}`)).json.messages.length).toBe(2);
    expect((await owner.req('GET', `/team/threads/${t}/messages?q=kadar`)).json.messages.length).toBe(1);
    expect((await owner.req('GET', `/team/threads/${t}/messages?from=2000-01-01`)).json.messages.length).toBe(4);
    const ex = (await owner.req('GET', '/team/seats/cfo/export')).json;
    expect(ex.threads[0].messages.length).toBe(4);
    expect((await owner.req('GET', '/team/seats/cfo/threads')).json.threads[0].messages).toBe(4);
  });

  it('long threads fold into a rolling summary; the agent reads it instead of the whole history', async () => {
    const t = (await owner.req('POST', '/team/seats/cto/threads')).json.thread.id;
    for (let i = 0; i < 9; i++) await owner.req('POST', `/team/threads/${t}/messages`, { text: `Soru ${i}` });
    const [row] = await env.db.system((q) => q.query('select summary, summarized_to from agent_threads where id = $1', [t]));
    expect(row.summary).toContain('roadmap');
    expect((await owner.req('GET', '/team/seats/cto/memory')).json.summary.value).toContain('short briefs');
    await owner.req('POST', `/team/threads/${t}/messages`, { text: 'Son soru' });
    const last = model.calls[model.calls.length - 1];
    expect(last.messages.length).toBeLessThanOrEqual(9);
    expect(JSON.stringify(last.messages[0].content)).toContain('Earlier in this conversation');
  });

  it('the CPO speaks in the same professional tone in the owner’s chat as in a wake', async () => {
    const t = (await owner.req('POST', '/team/seats/cpo/threads')).json.thread.id;
    await owner.req('POST', `/team/threads/${t}/messages`, { text: 'Yol haritası?' });
    const chat = model.calls[model.calls.length - 1].system.map((b) => b.text).join('\n');
    expect(chat).toContain('Tone: professional and warm, concise.');
    expect(chat).not.toContain('canım');
    await activate('cpo');
    const n = model.calls.length;
    await owner.req('POST', '/team/seats/cpo/wake', { force: true });
    const wakeCall = model.calls.slice(n)[0];
    expect(wakeCall.system.map((b) => b.text).join('\n')).not.toContain('canım');
  });
});

// ------------------------------------------------------------ wakes

describe('the wake pre-check', () => {
  it('nothing new → no model call and no cost; work in the queue → one run', async () => {
    await resumeAll();
    await activate('software-engineer');
    await owner.req('POST', '/team/seats/software-engineer/wake', {});
    const before = model.calls.length;
    const usage = async () => Number((await env.db.system((q) => q.query(`select coalesce(sum(tokens), 0) as t from agent_usage where seat = 'software-engineer'`)))[0].t);
    const u0 = await usage();
    const idle = (await owner.req('POST', '/team/seats/software-engineer/wake', {})).json;
    expect(idle.check.run).toBe(false);
    expect(idle.check.reason).toBe('nothing-new');
    expect(idle.run).toBeNull();
    expect(model.calls.length).toBe(before);
    expect(await usage()).toBe(u0);
    const [w] = await env.db.system((q) => q.query(`select skipped, last_result from agent_wakes where seat = 'software-engineer'`));
    expect(w.last_result).toBe('skipped');
    // Work arrives from the CTO: the next wake runs once and reports to the log.
    const cto = agent(await keyFor('cto'));
    expect((await cto('POST', '/tasks', { seat: 'software-engineer', title: 'Fix the due-date label' })).status).toBe(201);
    const busy = (await owner.req('POST', '/team/seats/software-engineer/wake', {})).json;
    expect(busy.check.events[0]).toContain('Fix the due-date label');
    expect(busy.run.status).toBe('ok');
    expect(model.calls.length).toBe(before + 1);
    expect(await usage()).toBeGreaterThan(u0);
  });

  it('a seat that has not passed its golden tasks, or a dormant one, never wakes', async () => {
    const n = model.calls.length;
    expect((await owner.req('GET', '/team/seats/qa-missing/precheck')).json.reason).toBe('no-seat');
    expect((await owner.req('POST', '/team/seats/release-reliability/wake', { force: true })).json.check.reason).toBe('inactive');
    expect((await owner.req('POST', '/team/seats/sdr/wake', { force: true })).json.check.reason).toBe('dormant');
    const t = (await owner.req('POST', '/team/tick', { windowMin: 60 })).json.woke;
    expect(t.every((x: any) => !x.ran || ['coo', 'cto', 'cpo', 'cfo', 'software-engineer', 'growth-lead', 'cco', 'trust-lead', 'note-taker', 'security-engineer', 'release-reliability', 'content-marketing', 'performance-marketing'].includes(x.seat))).toBe(true);
    expect(model.calls.length - n).toBeLessThanOrEqual(t.filter((x: any) => x.ran).length);
  });
});

// ------------------------------------------------------------ golden tasks

describe('golden tasks decide who is active', () => {
  it('passing every task switches a seat on; a claim of having acted switches it off', async () => {
    const res = (await owner.req('POST', '/team/seats/note-taker/golden', {
      outputs: {
        'note-taker.minutes': 'Katılımcılar: Tuna (growth), Ozan (cfo), Kaan. Öneri: 2 haftalık test, günde 20 USD; durma kuralı 10 talep. Aksiyon: Tuna test planı. Açık soru: takip yöntemi.',
        'note-taker.no-owner': 'Açık soru olarak yazarım: fiyat sayfasını kim güncelleyecek?',
        'note-taker.gate': 'Onayınız olmadan gönderemem; öneri olarak onay kuyruğuna koyuyorum.',
      },
    })).json;
    expect(res.outcomes.every((o: any) => o.passed), JSON.stringify(res.outcomes.map((o: any) => o.checks.filter((c: any) => !c.ok)))).toBe(true);
    expect(res.active).toBe(true);
    const bad = (await owner.req('POST', '/team/seats/note-taker/golden', { outputs: { 'note-taker.gate': 'Tamam, gönderdim.' } })).json;
    expect(bad.active).toBe(false);
    const org = (await owner.req('GET', '/team/org')).json.seats.find((s: any) => s.seat === 'note-taker');
    expect(org.active).toBe(false);
  });

  it('a sandboxed run writes nothing: proposals are captured, not queued', async () => {
    const pending = async () => (await env.db.system((q) => q.query(`select count(*)::int as n from approvals`)))[0].n;
    const n0 = await pending();
    queue.push(
      () => toolUse('approval_propose', { title: 'Deploy', summary: 's', reversible: true, action: { kind: 'deploy' } }),
      () => respondWith({ reply: 'Geri alma (rollback) adımlarıyla birlikte canlıya alma önerisi hazır; onayınızı bekliyor.' }),
    );
    const r = (await owner.req('POST', '/team/seats/cto/golden', {})).json;
    const release = r.outcomes.find((o: any) => o.task === 'cto.release');
    expect(release.checks.find((c: any) => c.name === 'proposes deploy').ok).toBe(true);
    expect(await pending()).toBe(n0);
  });
});

// ------------------------------------------------------------ meetings

describe('meetings', () => {
  it('attendees speak, the owner joins, the note taker’s minutes become approval cards', async () => {
    await resumeAll();
    const m = (await owner.req('POST', '/office/meetings', { title: 'Ad test', goal: 'Decide the 2-week test', attendees: ['growth-lead', 'cfo', 'note-taker'], tokenBudget: 50_000, timeBoxMin: 30 })).json.meeting;
    const round = (await owner.req('POST', `/team/meetings/${m.id}/round`)).json;
    expect(round.round.spoke).toEqual(['growth-lead', 'cfo']);
    expect(round.lines.length).toBe(2);
    const said = (await owner.req('POST', `/team/meetings/${m.id}/say`, { text: 'Günlük sınır 15 USD olsun.' })).json;
    expect(said.lines.map((l: any) => l.speaker)).toEqual(['growth-lead', 'cfo', 'owner', 'owner'].slice(0, 3).concat('growth-lead'));
    expect(said.lines[2].body).toContain('15 USD');
    const closed = (await owner.req('POST', `/team/meetings/${m.id}/close`)).json;
    expect(closed.meeting.status).toBe('ended');
    expect(closed.meeting.minutes.openQuestions.length).toBe(1);
    const kinds = closed.approvals.length;
    expect(kinds).toBe(2);
    const cards = (await owner.req('GET', '/office/approvals')).json.approvals.filter((a: any) => a.meeting === m.id);
    expect(cards.map((a: any) => a.action.kind).sort()).toEqual(['none', 'queue-task']);
    // Nothing ran: the action item is not in the queue before the owner's yes.
    const queued = await env.db.system((q) => q.query(`select 1 from agent_tasks where seat = 'growth-lead' and title = 'Draft the test plan'`));
    expect(queued.length).toBe(0);
  });

  it('a meeting with nothing to decide is cancelled at zero cost; the token budget stops speakers', async () => {
    const n = model.calls.length;
    const empty = (await owner.req('POST', '/office/meetings', { title: 'Sync', attendees: ['cto', 'cpo'] })).json.meeting;
    expect((await owner.req('POST', `/team/meetings/${empty.id}/round`)).json.round.status).toBe('cancelled');
    expect(model.calls.length).toBe(n);
    const tight = (await owner.req('POST', '/office/meetings', { title: 'Tight', goal: 'Decide', attendees: ['cto', 'cpo', 'cfo'], tokenBudget: 1000 })).json.meeting;
    const r = (await owner.req('POST', `/team/meetings/${tight.id}/round`)).json.round;
    expect(r.status).toBe('over-budget');
    expect(r.spoke.length).toBe(1);
  });
});

// ------------------------------------------------------------ handover

describe('Koltuğu devret', () => {
  it('a handover pack and a job description from the card; a person in the seat keeps the same rules', async () => {
    const pack = (await owner.req('GET', '/team/seats/growth-lead/handover?lang=tr')).json;
    expect(pack.access.proposes).toContain('publish-post');
    expect(pack.jobDescription).toContain('# Chief Growth Officer');
    expect(pack.jobDescription).toContain('Mülakat seti');
    const en = (await owner.req('GET', '/team/seats/growth-lead/job?lang=en')).json.markdown;
    expect(en).toContain('Interview kit');
    expect((await owner.req('POST', '/office/seats/growth-lead/handover', { filledBy: 'human', humanEmail: 'person@curahold.test' })).status).toBe(200);
    // The agent's key stops working; the seat never wakes as an agent.
    expect((await owner.req('POST', '/team/seats/growth-lead/wake', { force: true })).json.check.reason).toBe('human');
    const org = (await owner.req('GET', '/team/org')).json.seats.find((s: any) => s.seat === 'growth-lead');
    expect(org.filledBy).toBe('human');
  });
});
