// The AI team's API (shared/src/office.ts), through two doors.
//
// /api/desk/office/* — the owner, in his own console session: every seat, the
//   approval queue and its decisions, the company log, the audit trail,
//   meetings (call one, join one, write in it), seat keys, handovers and the
//   pause switches. Approvals are decided here and nowhere else.
//
// /api/agent/* — an agent, with its seat's own key ("ag_<seat>_<secret>"):
//   its own card, queue and memory, its slice of the company log, proposals
//   for the owner, work for another seat, meeting lines and minutes, usage.
//   There is no way to decide anything from here: an agent's key is not a
//   console session, so the owner's door refuses it too. Every call is in the
//   audit trail; a paused seat can only read; three refusals in an hour pause it.
import { Hono, type MiddlewareHandler } from 'hono';
import { z } from 'zod';
import { LOG_KINDS, PRIORITIES3, RISKS, SEAT_FILLED_BY, SEAT_STATES, SEAT_TIERS, TASK_STATUSES } from '../../../shared/src/office';
import { nowOf, type AppEnv, type C } from '../context';
import { randomToken, safeEqual, sha256Hex } from '../lib/crypto';
import { fail } from '../lib/errors';
import {
  addMeetingLine,
  addUsage,
  auditLine,
  createMeeting,
  decide,
  handOver,
  isPaused,
  listApprovals,
  listMeetings,
  listPauses,
  listSeats,
  meetingDetail,
  OWNER_SEAT,
  pause,
  propose,
  readAudit,
  readLog,
  resume,
  upsertSeat,
  writeLog,
  writeMinutes,
} from '../lib/office';
import { body, uuid } from '../lib/validate';
import { ownerOnly } from './desk';

const seatId = z.string().regex(/^[a-z][a-z0-9-]{1,40}$/);
const text = (n: number) => z.string().trim().min(1).max(n);
const opt = (n: number) => z.string().trim().max(n).nullable().optional();
const idOf = (c: C, k = 'id') => {
  const v = c.req.param(k);
  if (!uuid.safeParse(v).success) fail('not_found');
  return v as string;
};

const proposal = z.object({
  title: text(200),
  summary: z.string().trim().max(4000).default(''),
  why: z.string().trim().max(4000).default(''),
  whatChanges: z.string().trim().max(4000).default(''),
  discussedWith: z.array(seatId).max(20).default([]),
  risk: z.enum(RISKS).default('low'),
  riskNote: opt(2000),
  costUsd: z.number().min(0).max(1e9).nullable().optional(),
  usageTokens: z.number().int().min(0).max(1e12).nullable().optional(),
  reversible: z.boolean(),
  undoNote: opt(2000),
  link: opt(1000),
  meeting: uuid.nullable().optional(),
  priority: z.enum(PRIORITIES3).default('normal'),
  action: z.object({ kind: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/) }).passthrough().default({ kind: 'none' }),
});
const minutes = z.object({
  agenda: z.array(text(300)).max(30).default([]),
  items: z.array(z.object({ topic: text(300), summary: z.string().trim().max(4000) })).max(30).default([]),
  decisions: z.array(text(1000)).max(20).default([]),
  actions: z.array(z.object({ seat: seatId, what: text(500), due: z.string().max(40).nullable().optional() })).max(40).default([]),
  openQuestions: z.array(text(1000)).max(20).default([]),
  transcriptUrl: opt(1000),
});
const meetingInput = z.object({
  title: text(200),
  goal: opt(2000),
  attendees: z.array(seatId).min(1).max(30),
  startsAt: z.string().datetime().nullable().optional(),
  timeBoxMin: z.number().int().min(1).max(600).nullable().optional(),
  tokenBudget: z.number().int().min(0).max(1e9).nullable().optional(),
});

// ================================================================ the owner's door

export const officeRoutes = new Hono<AppEnv>();
officeRoutes.use('*', async (c, next) => {
  await ownerOnly(c);
  c.header('cache-control', 'no-store');
  await next();
});
const owner = async (c: C) => (await ownerOnly(c)).email;

officeRoutes.get('/seats', async (c) => c.json({ seats: await listSeats(c.get('deps'), nowOf(c.get('deps'))), pauses: await listPauses(c.get('deps')) }));
officeRoutes.put('/seats/:seat', async (c) => {
  const seat = seatId.parse(c.req.param('seat'));
  const input = await body(
    c,
    z.object({
      title: text(120),
      titleTr: z.string().trim().max(200).optional(),
      team: seatId,
      reportsTo: seatId.nullable().optional(),
      tier: z.enum(SEAT_TIERS),
      state: z.enum(SEAT_STATES).optional(),
      filledBy: z.enum(SEAT_FILLED_BY).optional(),
      humanEmail: z.string().trim().toLowerCase().email().max(320).nullable().optional(),
      cadence: opt(120),
      weeklyBudget: z.number().int().min(0).max(1e10).optional(),
      wakeTrigger: opt(500),
      card: z.record(z.string(), z.unknown()).optional(),
      agent: z.object({ name: text(60), avatar: opt(300), model: opt(60), effort: opt(20) }).nullable().optional(),
    }),
  );
  if (input.reportsTo === seat) fail('validation');
  const who = await owner(c);
  await c.get('deps').db.system((q) => upsertSeat(q, { seat, ...input } as Parameters<typeof upsertSeat>[1], who));
  return c.json({ seat: (await listSeats(c.get('deps'), nowOf(c.get('deps')), seat))[0] });
});
/** A new key for the seat's agent, shown once. The old one stops working. */
officeRoutes.post('/seats/:seat/key', async (c) => {
  const seat = seatId.parse(c.req.param('seat'));
  const key = `ag_${seat}_${randomToken(24)}`;
  const who = await owner(c);
  const ok = await c.get('deps').db.system(async (q) => {
    const [r] = await q.query('update seats set key_hash = $2, updated_at = now() where seat = $1 returning seat', [seat, await sha256Hex(key)]);
    if (r) await auditLine(q, { seat, actor: 'owner', what: 'seat.key', target: seat, detail: { by: who } });
    return !!r;
  });
  if (!ok) fail('not_found');
  return c.json({ key });
});
officeRoutes.post('/seats/:seat/handover', async (c) => {
  const seat = seatId.parse(c.req.param('seat'));
  const input = await body(c, z.object({ filledBy: z.enum(SEAT_FILLED_BY), humanEmail: z.string().trim().toLowerCase().email().max(320).nullable().default(null) }));
  if (input.filledBy !== 'agent' && !input.humanEmail) fail('validation', { fields: 'humanEmail' }, { fields: ['humanEmail'] });
  const who = await owner(c);
  return c.json(await c.get('deps').db.system((q) => handOver(q, seat, input, who)));
});

officeRoutes.get('/approvals', async (c) => {
  const s = z.enum(['pending', 'approved', 'rejected', 'meeting', 'done', 'failed', 'open', 'all']).safeParse(c.req.query('status') ?? 'open');
  if (!s.success) fail('validation');
  return c.json({ approvals: await listApprovals(c.get('deps'), s.data!) });
});
/** The owner decides: approve (optionally with edits), reject, or call a meeting on it. */
officeRoutes.post('/approvals/:id/decide', async (c) => {
  const input = await body(
    c,
    z.discriminatedUnion('decision', [
      z.object({ decision: z.literal('approve'), note: opt(4000), edits: z.object({ title: text(200).optional(), summary: z.string().trim().max(4000).optional(), whatChanges: z.string().trim().max(4000).optional() }).optional() }),
      z.object({ decision: z.literal('reject'), note: opt(4000) }),
      z.object({ decision: z.literal('meeting'), note: opt(4000) }),
    ]),
  );
  const who = await owner(c);
  const a = await decide(c.get('deps'), idOf(c), who, input as Parameters<typeof decide>[3]);
  await c.get('deps').db.system((q) => q.query(`insert into desk_log (staff_email, action, ref, org_id) values ($1, $2, $3, null)`, [who, `approval.${input.decision}`, a.ref]));
  await c.get('deps').live?.platform?.().catch(() => undefined);
  return c.json({ approval: a });
});

officeRoutes.get('/log', async (c) => {
  const seat = c.req.query('seat');
  const thread = c.req.query('thread');
  const before = Number(c.req.query('before')) || undefined;
  if (seat && !seatId.safeParse(seat).success && seat !== 'system') fail('validation');
  if (thread && !uuid.safeParse(thread).success) fail('validation');
  return c.json({ log: await readLog(c.get('deps'), { seat, thread, before }) });
});
officeRoutes.post('/log', async (c) => {
  const input = await body(c, z.object({ body: text(8000), thread: uuid.nullable().optional(), ref: opt(200) }));
  return c.json({ entry: await c.get('deps').db.system((q) => writeLog(q, OWNER_SEAT, { kind: 'note', ...input })) }, 201);
});
officeRoutes.get('/audit', async (c) => {
  const seat = c.req.query('seat');
  return c.json({ audit: await readAudit(c.get('deps'), { seat: seat || undefined, before: Number(c.req.query('before')) || undefined }) });
});
officeRoutes.get('/tasks', async (c) => {
  const seat = c.req.query('seat');
  const rows = await c.get('deps').db.system((q) =>
    q.query(`select * from agent_tasks where ($1::text is null or seat = $1) and status <> 'cancelled' order by (status = 'done'), created_at desc limit 300`, [seat || null]),
  );
  return c.json({ tasks: rows.map((r) => ({ id: r.id, seat: r.seat, title: r.title, detail: r.detail, status: r.status, priority: r.priority, fromSeat: r.from_seat, dueAt: r.due_at, result: r.result, createdAt: r.created_at, doneAt: r.done_at })) });
});

officeRoutes.get('/meetings', async (c) => {
  const w = c.req.query('with');
  return c.json({ meetings: await listMeetings(c.get('deps'), { withOwner: w === 'me' ? true : w === 'without' ? false : undefined, seat: c.req.query('seat') || undefined }) });
});
officeRoutes.get('/meetings/:id', async (c) => {
  const d = await meetingDetail(c.get('deps'), idOf(c));
  if (!d) fail('not_found');
  return c.json(d);
});
officeRoutes.post('/meetings', async (c) => {
  const input = await body(c, meetingInput);
  const who = await owner(c);
  const m = await c.get('deps').db.system(async (q) => {
    const made = await createMeeting(q, OWNER_SEAT, { ...input, withOwner: true });
    await auditLine(q, { seat: OWNER_SEAT, actor: 'owner', what: 'meeting.call', target: made.id, detail: { by: who } });
    return made;
  });
  return c.json({ meeting: m }, 201);
});
/** The owner joins a meeting by writing in it; his words are marked as his. */
officeRoutes.post('/meetings/:id/lines', async (c) => {
  const input = await body(c, z.object({ body: text(8000) }));
  return c.json({ line: await c.get('deps').db.system((q) => addMeetingLine(q, idOf(c), OWNER_SEAT, input.body)) }, 201);
});

officeRoutes.get('/pauses', async (c) => c.json({ pauses: await listPauses(c.get('deps')) }));
officeRoutes.post('/pauses', async (c) => {
  const input = await body(c, z.object({ scope: z.enum(['all', 'team', 'seat']), target: seatId.nullable().default(null), reason: opt(500) }));
  if ((input.scope === 'all') !== (input.target === null)) fail('validation');
  const who = await owner(c);
  const id = await c.get('deps').db.system((q) => pause(q, input.scope, input.target, who, input.reason ?? null));
  return c.json({ id, pauses: await listPauses(c.get('deps')) }, 201);
});
officeRoutes.delete('/pauses/:id', async (c) => {
  const who = await owner(c);
  await c.get('deps').db.system((q) => resume(q, idOf(c), who));
  return c.json({ pauses: await listPauses(c.get('deps')) });
});

// ================================================================ the agents' door

export const agentRoutes = new Hono<AppEnv>();
/** The seat a request's key belongs to, for the length of the request. */
const SEAT_OF = new WeakMap<Request, { seat: string; tier: string; team: string }>();
const KEY = /^ag_([a-z][a-z0-9-]{1,40})_[A-Za-z0-9_-]{20,64}$/;
const DENIALS_TO_PAUSE = 3;

const agentAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const raw = (c.req.header('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const m = KEY.exec(raw);
  if (!m) fail('unauthenticated');
  const deps = c.get('deps');
  const hash = await sha256Hex(raw);
  const [s] = await deps.db.system((q) => q.query<{ seat: string; tier: string; team: string; key_hash: string | null; filled_by: string }>('select seat, tier, team, key_hash, filled_by from seats where seat = $1', [m![1]]));
  if (!s || !s.key_hash || !safeEqual(s.key_hash, hash) || s.filled_by === 'human') fail('unauthenticated');
  SEAT_OF.set(c.req.raw, { seat: s.seat, tier: s.tier, team: s.team });
  const write = c.req.method !== 'GET';
  const paused = await deps.db.system((q) => isPaused(q, s.seat));
  let status = 200;
  try {
    if (paused && write) fail('forbidden', { reason: 'paused' }, { reason: 'paused' });
    await next();
    status = c.res.status;
  } catch (e) {
    status = (e as { status?: number }).status ?? 500;
    throw e;
  } finally {
    await deps.db.system(async (q) => {
      await auditLine(q, { seat: s.seat, actor: 'agent', what: `${c.req.method} ${c.req.routePath ?? c.req.path}`.slice(0, 80), target: c.req.path.slice(0, 300), detail: { status } });
      // Trying again and again at what is refused (another seat's work, while paused): the seat stops until the owner looks.
      if (status === 403 && !paused) {
        const [n] = await q.query<{ n: number }>(`select count(*)::int as n from agent_audit where seat = $1 and at > now() - interval '1 hour' and (detail->>'status') = '403'`, [s.seat]);
        if (n.n >= DENIALS_TO_PAUSE) await pause(q, 'seat', s.seat, 'system', 'repeated refused actions');
      }
    });
  }
};
agentRoutes.use('*', agentAuth);
const me = (c: C) => SEAT_OF.get(c.req.raw)!;

agentRoutes.get('/me', async (c) => {
  const deps = c.get('deps');
  const s = me(c);
  const [seat] = await listSeats(deps, nowOf(deps), s.seat);
  const [tasks, memory] = await deps.db.system(async (q) => [
    await q.query(`select id, title, detail, status, priority, from_seat, due_at, created_at from agent_tasks where seat = $1 and status in ('queued', 'running', 'blocked') order by created_at limit 100`, [s.seat]),
    await q.query('select key, value, updated_at from agent_memory where seat = $1 order by key', [s.seat]),
  ]);
  return c.json({ seat, tasks, memory });
});
agentRoutes.get('/log', async (c) => {
  const before = Number(c.req.query('before')) || undefined;
  return c.json({ log: await readLog(c.get('deps'), { slice: me(c).seat, before, limit: 100 }) });
});
agentRoutes.post('/log', async (c) => {
  const input = await body(c, z.object({ kind: z.enum(LOG_KINDS).exclude(['decision']), body: text(8000), thread: uuid.nullable().optional(), ref: opt(200) }));
  return c.json({ entry: await c.get('deps').db.system((q) => writeLog(q, me(c).seat, input)) }, 201);
});
agentRoutes.put('/memory/:key', async (c) => {
  const key = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,80}$/).parse(c.req.param('key'));
  const input = await body(c, z.object({ value: z.string().max(16000) }));
  await c.get('deps').db.system((q) =>
    q.query(`insert into agent_memory (seat, key, value) values ($1, $2, $3) on conflict (seat, key) do update set value = excluded.value, updated_at = now()`, [me(c).seat, key, input.value]),
  );
  return c.json({ ok: true });
});
agentRoutes.delete('/memory/:key', async (c) => {
  await c.get('deps').db.system((q) => q.query('delete from agent_memory where seat = $1 and key = $2', [me(c).seat, c.req.param('key')]));
  return c.json({ ok: true });
});

/** A proposal for the owner. It waits in his queue; nothing in it runs before his yes. */
agentRoutes.post('/approvals', async (c) => {
  const input = await body(c, proposal);
  const r = await c.get('deps').db.system((q) => propose(q, me(c).seat, input as Parameters<typeof propose>[2]));
  await c.get('deps').live?.platform?.().catch(() => undefined);
  return c.json(r, 201);
});
agentRoutes.get('/approvals', async (c) => c.json({ approvals: await listApprovals(c.get('deps'), 'all', me(c).seat) }));

/** Work for another seat (or itself): short and structured — what, context, when. */
agentRoutes.post('/tasks', async (c) => {
  const input = await body(c, z.object({ seat: seatId, title: text(300), detail: opt(8000), priority: z.enum(PRIORITIES3).default('normal'), dueAt: z.string().datetime().nullable().optional() }));
  const [r] = await c.get('deps').db.system(async (q) => {
    const [s] = await q.query('select 1 from seats where seat = $1', [input.seat]);
    if (!s) fail('not_found');
    return q.query<{ id: string }>('insert into agent_tasks (seat, title, detail, priority, from_seat, due_at) values ($1, $2, $3, $4, $5, $6) returning id', [input.seat, input.title, input.detail ?? null, input.priority, me(c).seat, input.dueAt ?? null]);
  });
  return c.json({ id: r.id }, 201);
});
/** Its own work only: another seat's task is refused (and counts towards a pause). */
agentRoutes.patch('/tasks/:id', async (c) => {
  const input = await body(c, z.object({ status: z.enum(TASK_STATUSES), result: opt(8000) }));
  const [r] = await c.get('deps').db.system((q) =>
    q.query(
      `update agent_tasks set status = $3, result = coalesce($4, result), done_at = case when $3 in ('done', 'cancelled') then now() else null end
        where id = $1 and seat = $2 returning id`,
      [idOf(c), me(c).seat, input.status, input.result ?? null],
    ),
  );
  if (!r) fail('forbidden');
  return c.json({ ok: true });
});

/** Executives and the chief of staff may set meetings without the owner; the note taker writes the minutes. */
agentRoutes.post('/meetings', async (c) => {
  if (!['ceo-office', 'executive'].includes(me(c).tier)) fail('forbidden');
  const input = await body(c, meetingInput.extend({ withOwner: z.boolean().default(false) }));
  return c.json({ meeting: await c.get('deps').db.system((q) => createMeeting(q, me(c).seat, input)) }, 201);
});
agentRoutes.post('/meetings/:id/lines', async (c) => {
  const input = await body(c, z.object({ body: text(8000) }));
  const id = idOf(c);
  const line = await c.get('deps').db.system(async (q) => {
    const [m] = await q.query('select attendees, called_by from meetings where id = $1', [id]);
    if (!m) fail('not_found');
    if (me(c).tier !== 'note-taker' && m.called_by !== me(c).seat && !(m.attendees as string[]).includes(me(c).seat)) fail('forbidden');
    return addMeetingLine(q, id, me(c).seat, input.body);
  });
  return c.json({ line }, 201);
});
agentRoutes.get('/meetings/:id', async (c) => {
  const d = await meetingDetail(c.get('deps'), idOf(c));
  if (!d) fail('not_found');
  if (me(c).tier !== 'note-taker' && d!.meeting.calledBy !== me(c).seat && !d!.meeting.attendees.includes(me(c).seat)) fail('forbidden');
  return c.json(d);
});
agentRoutes.put('/meetings/:id/minutes', async (c) => {
  if (me(c).tier !== 'note-taker') fail('forbidden');
  const input = await body(c, minutes);
  return c.json(await c.get('deps').db.system((q) => writeMinutes(q, idOf(c), me(c).seat, input as Parameters<typeof writeMinutes>[3])));
});

agentRoutes.post('/usage', async (c) => {
  const input = await body(c, z.object({ tokens: z.number().int().min(0).max(1e10), costUsd: z.number().min(0).max(1e6).default(0), summary: opt(2000) }));
  const deps = c.get('deps');
  const r = await deps.db.system(async (q) => {
    if (input.summary) await q.query('update agents set last_summary = $2 where seat = $1', [me(c).seat, input.summary]);
    return addUsage(q, me(c).seat, nowOf(deps), input);
  });
  return c.json(r);
});
