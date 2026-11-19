// The AI team's owner API — /api/desk/team/* — on top of the shared model's
// own owner door (/api/desk/office/*: approvals, log, audit, pauses,
// meetings, handover). Only the platform owner, in his own console session.
// The Ekip / Sohbet / Toplantılar screens and the 3D Office use this.
//
//   GET    /org                        org chart: every seat + status, usage, golden, activity; pauses; alerts
//   POST   /seed {reset?}              put the default org chart in (reset: restore the defaults, keep people)
//   GET    /seats/:seat                card, golden tasks + latest results, cadences, memory, last wake
//   GET    /seats/:seat/job?lang=      job description + interview kit (markdown)
//   GET    /seats/:seat/handover?lang= handover pack preview ("Koltuğu devret"; the handover is POST /office/seats/:seat/handover)
//   GET    /seats/:seat/threads        the owner's chats with the seat (newest first)
//   POST   /seats/:seat/threads        a new chat
//   GET    /threads/:id/messages       history: ?before=<id> (scroll back), ?q= (search), ?from=YYYY-MM-DD (jump to a date)
//   POST   /threads/:id/messages       {text} → the seat answers (a model call)
//   DELETE /threads/:id                delete a chat (his data)
//   GET    /seats/:seat/export         every chat with the seat + its memory (JSON)
//   GET    /seats/:seat/memory         rolling summary + facts
//   PUT    /seats/:seat/memory/:key    {value} correct an entry ("summary" or "fact.…"; a new fact: key "fact.new")
//   DELETE /seats/:seat/memory/:key
//   GET    /seats/:seat/precheck       the wake pre-check, dry (no model, nothing moved)
//   POST   /seats/:seat/wake {force?}  wake now ("Şimdi başlat"): pre-check, then a run only with news (force: run anyway)
//   POST   /seats/:seat/golden {outputs?} run the golden tasks (or judge submitted outputs) → active or not
//   PATCH  /seats/:seat {state?, weeklyBudget?} wake a dormant seat / change its budget
//   GET    /cadences                   cadences as data + weekly estimates (for the conductor's scheduled tasks)
//   POST   /tick {windowMin?}          what a scheduled task calls: due cadences wake (pre-check first)
//   POST   /meetings/:id/round         every attendee speaks once (time-box + token budget enforced)
//   POST   /meetings/:id/say {text}    the owner writes in a live meeting; the chair answers
//   POST   /meetings/:id/close         the note taker's minutes; decisions + action items → approval cards
//   POST   /approvals/:id/execute      run an approved action whose runner exists (the approved path)
import { Hono } from 'hono';
import { z } from 'zod';
import { nowOf, type AppEnv, type C } from '../context';
import { fail } from '../lib/errors';
import { listPauses, listSeats, meetingDetail } from '../lib/office';
import { body, uuid } from '../lib/validate';
import { weekOf } from '../../../shared/src/office';
import { CADENCES, weeklyEstimate } from '../../../shared/src/team/cadence';
import { goldenTasks } from '../../../shared/src/team/golden';
import { ORG_CHART, seatDef } from '../../../shared/src/team/orgChart';
import type { MessageRow, TeamOrg, TeamSeat, ThreadRow } from '../../../shared/src/team/api';
import { teamConfig, teamProvider } from '../team/config';
import { executeApproved } from '../team/gate';
import { handoverPreview, jobDescription } from '../team/jobs';
import { latestEvals, runGolden } from '../team/judge';
import { closeMeeting, meetingRound, ownerSays } from '../team/meetings';
import { addFact, deleteMemory, readMemory, writeMemory, SUMMARY_KEY } from '../team/memory';
import { precheck, tick, wake } from '../team/precheck';
import { chat, teamSpendThisMonth } from '../team/runtime';
import { seedOrgChart } from '../team/seed';
import { ownerOnly } from './desk';

const seatId = z.string().regex(/^[a-z][a-z0-9-]{1,40}$/);
const memKey = z.string().regex(/^(summary|fact\.[a-z0-9._-]{1,70})$/);
const lang = (c: C): 'tr' | 'en' => (c.req.query('lang') === 'en' ? 'en' : 'tr');
const idOf = (c: C) => {
  const v = c.req.param('id');
  if (!uuid.safeParse(v).success) fail('not_found');
  return v as string;
};
const seatOf = (c: C) => {
  const s = seatId.safeParse(c.req.param('seat'));
  if (!s.success) fail('not_found');
  return s.data as string;
};
const iso = (v: unknown) => (v == null ? null : new Date(v as string).toISOString());

export const teamRoutes = new Hono<AppEnv>();
teamRoutes.use('*', async (c, next) => {
  await ownerOnly(c);
  c.header('cache-control', 'no-store');
  await next();
});
const owner = async (c: C) => (await ownerOnly(c)).email;

async function ensureSeeded(c: C) {
  const deps = c.get('deps');
  const [r] = await deps.db.system((q) => q.query<{ n: number }>('select count(*)::int as n from seats'));
  if (!r.n) await deps.db.system((q) => seedOrgChart(q, { by: 'system' }));
}

teamRoutes.get('/org', async (c) => {
  await ensureSeeded(c);
  const deps = c.get('deps');
  const now = nowOf(deps);
  const seats = await listSeats(deps, now);
  const extra = await deps.db.system(async (q) => ({
    rows: await q.query(`select s.seat, s.activated_at, s.card->>'level' as level, a.name from seats s left join agents a on a.seat = s.seat`),
    evals: await q.query(`select seat, count(*) filter (where passed)::int as passed, count(*)::int as total, max(judge) as judge from (select distinct on (seat, task) seat, task, passed, judge from seat_evals order by seat, task, at desc) x group by seat`),
    wakes: await q.query('select * from agent_wakes'),
    meetings: await q.query(`select attendees from meetings where status = 'live'`),
    pending: await q.query(`select proposed_by, count(*)::int as n from approvals where status = 'pending' group by proposed_by`),
    alerts: await q.query(`select id, at, body from company_log where kind = 'alert' order by id desc limit 8`),
    month: await teamSpendThisMonth(q, now),
  }));
  const by = <T extends Record<string, unknown>>(rows: T[], k = 'seat') => new Map(rows.map((r) => [String(r[k]), r]));
  const rows = by(extra.rows);
  const evals = by(extra.evals);
  const wakes = by(extra.wakes);
  const pending = by(extra.pending, 'proposed_by');
  const inMeeting = new Set(extra.meetings.flatMap((m) => m.attendees as string[]));
  const out: TeamSeat[] = seats.map((s) => {
    const r = rows.get(s.seat) as Record<string, unknown> | undefined;
    const e = evals.get(s.seat) as Record<string, unknown> | undefined;
    const w = wakes.get(s.seat) as Record<string, unknown> | undefined;
    const activatedAt = iso(r?.activated_at);
    const total = goldenTasks(s.seat).length;
    const activity: TeamSeat['activity'] = s.paused
      ? 'paused'
      : s.state === 'dormant'
        ? 'dormant'
        : inMeeting.has(s.seat)
          ? 'meeting'
          : s.queue.running
            ? 'working'
            : pending.has(s.seat)
              ? 'waiting-approval'
              : s.queue.queued
                ? 'queued'
                : 'idle';
    return {
      ...s,
      name: String(r?.name ?? s.agent?.name ?? seatDef(s.seat)?.name ?? s.seat),
      level: (r?.level as TeamSeat['level']) ?? seatDef(s.seat)?.level ?? null,
      active: s.state !== 'dormant' && !!activatedAt,
      activatedAt,
      golden: { passed: Number(e?.passed ?? 0), total, judge: (e?.judge as 'model' | 'checks') ?? null },
      estimate: weeklyEstimate(s.seat),
      lastWake: w ? { at: iso(w.checked_at)!, result: String(w.last_result), skipped: Number(w.skipped), ran: Number(w.ran) } : null,
      activity,
    };
  });
  const body: TeamOrg = {
    seats: out,
    pauses: await listPauses(deps),
    week: {
      tokens: out.reduce((a, s) => a + s.usage.tokens, 0),
      costUsd: Math.round(out.reduce((a, s) => a + s.usage.costUsd, 0) * 100) / 100,
      budget: out.filter((s) => s.state !== 'dormant').reduce((a, s) => a + s.weeklyBudget, 0),
    },
    month: { costUsd: Math.round(extra.month * 100) / 100, capUsd: teamConfig(deps).monthlyUsd },
    model: { available: !!teamProvider(deps, teamConfig(deps).models.standard) },
    alerts: extra.alerts.map((a) => ({ id: Number(a.id), at: iso(a.at)!, body: String(a.body) })),
  };
  return c.json(body);
});

teamRoutes.post('/seed', async (c) => {
  const input = await body(c, z.object({ reset: z.boolean().default(false) }));
  const who = await owner(c);
  return c.json(await c.get('deps').db.system((q) => seedOrgChart(q, { reset: input.reset, by: who })));
});

teamRoutes.get('/seats/:seat', async (c) => {
  await ensureSeeded(c);
  const deps = c.get('deps');
  const seat = seatOf(c);
  const [s] = await listSeats(deps, nowOf(deps), seat);
  if (!s) fail('not_found');
  const [memory, wakeRow] = await deps.db.system(async (q) => [await readMemory(q, seat), (await q.query('select * from agent_wakes where seat = $1', [seat]))[0] ?? null]);
  return c.json({
    seat: s,
    def: seatDef(seat) ?? null,
    golden: { tasks: goldenTasks(seat).map((t) => ({ id: t.id, prompt: t.prompt, rubric: t.rubric })), latest: await latestEvals(deps, seat) },
    cadences: CADENCES.filter((x) => x.seat === seat),
    estimate: weeklyEstimate(seat),
    memory,
    lastWake: wakeRow,
  });
});
teamRoutes.patch('/seats/:seat', async (c) => {
  const seat = seatOf(c);
  const input = await body(c, z.object({ state: z.enum(['standing', 'on-call', 'dormant']).optional(), weeklyBudget: z.number().int().min(0).max(5_000_000).optional() }));
  const who = await owner(c);
  const ok = await c.get('deps').db.system(async (q) => {
    // Waking a seat does not switch it on: it must pass its golden tasks first.
    const [r] = await q.query(
      `update seats set state = coalesce($2, state), weekly_budget = coalesce($3, weekly_budget), activated_at = case when $2::text is not null and $2::text <> state then null else activated_at end, updated_at = now() where seat = $1 returning seat`,
      [seat, input.state ?? null, input.weeklyBudget ?? null],
    );
    if (r) await q.query(`insert into agent_audit (seat, actor, action, target, detail) values ($1, 'owner', 'seat.patch', $1, $2)`, [seat, JSON.stringify({ ...input, by: who })]);
    return !!r;
  });
  if (!ok) fail('not_found');
  return c.json({ ok: true });
});
teamRoutes.get('/seats/:seat/job', async (c) => {
  const md = await jobDescription(c.get('deps'), seatOf(c), lang(c));
  if (!md) fail('not_found');
  return c.json({ markdown: md });
});
teamRoutes.get('/seats/:seat/handover', async (c) => {
  const p = await handoverPreview(c.get('deps'), seatOf(c), lang(c));
  if (!p) fail('not_found');
  return c.json(p);
});

// ------------------------------------------------------------ chats + history

const threadOf = (r: Record<string, unknown>): ThreadRow => ({ id: String(r.id), seat: String(r.seat), title: String(r.title ?? ''), createdAt: iso(r.created_at)!, lastAt: iso(r.last_at)!, messages: Number(r.messages ?? 0) });
const messageOf = (r: Record<string, unknown>): MessageRow => ({ id: Number(r.id), role: r.role as MessageRow['role'], body: String(r.body), at: iso(r.at)!, meta: (r.meta as MessageRow['meta']) ?? {} });

teamRoutes.get('/seats/:seat/threads', async (c) => {
  const rows = await c.get('deps').db.system((q) =>
    q.query(`select t.*, (select count(*)::int from agent_messages m where m.thread = t.id) as messages from agent_threads t where t.seat = $1 order by t.last_at desc limit 200`, [seatOf(c)]),
  );
  return c.json({ threads: rows.map(threadOf) });
});
teamRoutes.post('/seats/:seat/threads', async (c) => {
  const seat = seatOf(c);
  const [r] = await c.get('deps').db.system(async (q) => {
    const [s] = await q.query('select 1 from seats where seat = $1', [seat]);
    if (!s) fail('not_found');
    return q.query(`insert into agent_threads (seat) values ($1) returning *, 0 as messages`, [seat]);
  });
  return c.json({ thread: threadOf(r) }, 201);
});
teamRoutes.get('/threads/:id/messages', async (c) => {
  const id = idOf(c);
  const before = Number(c.req.query('before')) || null;
  const search = (c.req.query('q') ?? '').trim().slice(0, 200);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(c.req.query('from') ?? '') ? c.req.query('from')! : null;
  const rows = await c.get('deps').db.system(async (q) => {
    const [t] = await q.query('select 1 from agent_threads where id = $1', [id]);
    if (!t) fail('not_found');
    if (search) return q.query(`select * from agent_messages where thread = $1 and body ilike '%' || $2 || '%' order by id desc limit 100`, [id, search.replace(/[%_\\]/g, (m) => `\\${m}`)]);
    if (from) return q.query(`select * from agent_messages where thread = $1 and at >= $2::date order by id limit 60`, [id, from]);
    return q.query(`select * from (select * from agent_messages where thread = $1 and ($2::bigint is null or id < $2) order by id desc limit 60) x order by id`, [id, before]);
  });
  return c.json({ messages: rows.map(messageOf), more: rows.length === 60 });
});
teamRoutes.post('/threads/:id/messages', async (c) => {
  const input = await body(c, z.object({ text: z.string().trim().min(1).max(8000) }));
  const r = await chat(c.get('deps'), idOf(c), input.text);
  const rows = await c.get('deps').db.system((q) => q.query('select * from agent_messages where id = any($1::bigint[]) order by id', [[r.ownerMessage, r.agentMessage]]));
  return c.json({ messages: rows.map(messageOf), status: r.reply.status }, 201);
});
teamRoutes.delete('/threads/:id', async (c) => {
  const id = idOf(c);
  const who = await owner(c);
  const ok = await c.get('deps').db.system(async (q) => {
    const [r] = await q.query('delete from agent_threads where id = $1 returning seat', [id]);
    if (r) await q.query(`insert into agent_audit (seat, actor, action, target, detail) values ($1, 'owner', 'thread.delete', $2, $3)`, [r.seat, id, JSON.stringify({ by: who })]);
    return !!r;
  });
  if (!ok) fail('not_found');
  return c.json({ ok: true });
});
teamRoutes.get('/seats/:seat/export', async (c) => {
  const seat = seatOf(c);
  const data = await c.get('deps').db.system(async (q) => ({
    seat,
    exportedAt: nowOf(c.get('deps')).toISOString(),
    memory: await readMemory(q, seat),
    threads: await Promise.all(
      (await q.query('select * from agent_threads where seat = $1 order by created_at', [seat])).map(async (t) => ({
        ...threadOf(t),
        summary: t.summary ?? null,
        messages: (await q.query('select * from agent_messages where thread = $1 order by id', [t.id])).map(messageOf),
      })),
    ),
  }));
  c.header('content-disposition', `attachment; filename="curahold-${seat}-chats.json"`);
  return c.json(data);
});

// ------------------------------------------------------------ memory (view, correct, delete)

teamRoutes.get('/seats/:seat/memory', async (c) => c.json(await c.get('deps').db.system((q) => readMemory(q, seatOf(c)))));
teamRoutes.put('/seats/:seat/memory/:key', async (c) => {
  const seat = seatOf(c);
  const raw = c.req.param('key');
  const input = await body(c, z.object({ value: z.string().trim().min(1).max(raw === SUMMARY_KEY ? 4000 : 1000) }));
  const who = await owner(c);
  const key = await c.get('deps').db.system(async (q) => {
    const [s] = await q.query('select 1 from seats where seat = $1', [seat]);
    if (!s) fail('not_found');
    let k: string;
    if (raw === 'fact.new') k = (await addFact(q, seat, input.value, nowOf(c.get('deps'))))!;
    else {
      if (!memKey.safeParse(raw).success) fail('validation');
      k = raw;
      await writeMemory(q, seat, k, input.value);
    }
    await q.query(`insert into agent_audit (seat, actor, action, target, detail) values ($1, 'owner', 'memory.edit', $2, $3)`, [seat, k, JSON.stringify({ by: who })]);
    return k;
  });
  return c.json({ key, memory: await c.get('deps').db.system((q) => readMemory(q, seat)) });
});
teamRoutes.delete('/seats/:seat/memory/:key', async (c) => {
  const seat = seatOf(c);
  const key = memKey.safeParse(c.req.param('key'));
  if (!key.success) fail('not_found');
  const who = await owner(c);
  const ok = await c.get('deps').db.system(async (q) => {
    const gone = await deleteMemory(q, seat, key.data!);
    if (gone) await q.query(`insert into agent_audit (seat, actor, action, target, detail) values ($1, 'owner', 'memory.delete', $2, $3)`, [seat, key.data, JSON.stringify({ by: who })]);
    return gone;
  });
  if (!ok) fail('not_found');
  return c.json({ memory: await c.get('deps').db.system((q) => readMemory(q, seat)) });
});

// ------------------------------------------------------------ wakes, cadences, golden tasks

teamRoutes.get('/seats/:seat/precheck', async (c) => c.json(await c.get('deps').db.system((q) => precheck(q, seatOf(c), nowOf(c.get('deps'))))));
teamRoutes.post('/seats/:seat/wake', async (c) => {
  const input = await body(c, z.object({ force: z.boolean().default(false) }));
  const r = await wake(c.get('deps'), seatOf(c), { force: input.force });
  return c.json({ check: r.check, run: r.run ? { status: r.run.status, reply: r.run.reply, tokens: r.run.tokens, costUsd: r.run.costUsd } : null });
});
teamRoutes.get('/cadences', (c) =>
  c.json({
    timezone: 'Europe/Istanbul',
    cadences: CADENCES,
    estimates: [...new Set(ORG_CHART.map((s) => s.seat))].map((seat) => ({ seat, ...weeklyEstimate(seat) })).filter((e) => e.wakes > 0),
    tick: { method: 'POST', path: '/api/desk/team/tick', body: { windowMin: 'minutes since the previous call (1–60)' } },
  }),
);
teamRoutes.post('/tick', async (c) => {
  const input = await body(c, z.object({ windowMin: z.number().int().min(1).max(60).default(5) }));
  return c.json({ woke: await tick(c.get('deps'), input.windowMin) });
});
teamRoutes.post('/seats/:seat/golden', async (c) => {
  const seat = seatOf(c);
  const input = await body(c, z.object({ outputs: z.record(z.string().max(80), z.string().max(16000)).optional() }));
  const [s] = await c.get('deps').db.system((q) => q.query('select state from seats where seat = $1', [seat]));
  if (!s) fail('not_found');
  return c.json(await runGolden(c.get('deps'), seat, input.outputs));
});

// ------------------------------------------------------------ meetings (the rest is /office/meetings)

const meetingExtra = async (c: C, id: string) => {
  const d = await meetingDetail(c.get('deps'), id);
  const [x] = await c.get('deps').db.system((q) => q.query('select speaking, spent_tokens from meetings where id = $1', [id]));
  return { ...d, speaking: x?.speaking ?? null, spentTokens: Number(x?.spent_tokens ?? 0) };
};
teamRoutes.get('/meetings/:id', async (c) => {
  const id = idOf(c);
  const d = await meetingExtra(c, id);
  if (!d.meeting) fail('not_found');
  return c.json(d);
});
teamRoutes.post('/meetings/:id/round', async (c) => {
  const id = idOf(c);
  const r = await meetingRound(c.get('deps'), id);
  return c.json({ round: r, ...(await meetingExtra(c, id)) });
});
teamRoutes.post('/meetings/:id/say', async (c) => {
  const id = idOf(c);
  const input = await body(c, z.object({ text: z.string().trim().min(1).max(8000) }));
  const r = await ownerSays(c.get('deps'), id, input.text);
  return c.json({ round: r.round, ...(await meetingExtra(c, id)) }, 201);
});
teamRoutes.post('/meetings/:id/close', async (c) => {
  const id = idOf(c);
  const r = await closeMeeting(c.get('deps'), id);
  return c.json({ approvals: r.approvals, ...(await meetingExtra(c, id)) });
});

// ------------------------------------------------------------ the approved path

teamRoutes.post('/approvals/:id/execute', async (c) => {
  const who = await owner(c);
  return c.json(await executeApproved(c.get('deps'), idOf(c), who));
});

/** Week key used by the usage numbers (for clients that show "this week"). */
teamRoutes.get('/week', (c) => c.json({ week: weekOf(nowOf(c.get('deps'))) }));
