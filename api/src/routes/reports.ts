// Reports: how the work is going, worked out when someone looks (nothing is
// stored or pre-computed). Everything is counted inside what the person can
// see — the same boards and customers as everywhere else.
import { Hono } from 'hono';
import { z } from 'zod';
import { TARGET_PERIODS, rhythmOf } from '../../../shared/src/rhythm';
import { requirePlan, requireWriter, run, type AppEnv } from '../context';
import { audit } from '../lib/audit';
import { fail } from '../lib/errors';
import { body, uuid } from '../lib/validate';

export const reportRoutes = new Hono<AppEnv>();

// "Finished" is the task's own done_at (kept by the database and by a board whose columns
// change), so nothing here looks a column up per row.
const DONE = `t.done_at is not null`;
// Archived tasks stay in: finished work still counts after it has aged off the board.
// Anything about open work says "on the board" itself.
const BASE = `from tasks t join boards b on b.id = t.board_id where b.archived_at is null and t.parent_id is null and ($1::uuid is null or t.board_id = $1::uuid)`;
const OPEN = `t.archived_at is null and t.done_at is null`;
// What a report looks at: everything still open, and what was finished or came in during the last twelve weeks.
// (An archived task that never finished and came in long ago counts for nothing here, so it is not read.)
const RECENT = `((t.done_at is null and t.archived_at is null) or t.done_at > now() - interval '90 days' or t.created_at > now() - interval '90 days')`;

/**
 * The work report for one board or all: created, finished and open per week and per assignee, in one grouped pass.
 */
reportRoutes.get('/reports/work', async (c) => {
  const b = c.req.query('board');
  const board = b && uuid.safeParse(b).success ? b : null;
  const out = await run(c, async (q) => {
    // One pass over the tasks a report looks at, grouped four ways at once (per board, per week created,
    // per week finished, per set of assignees); everything else is summed from those few hundred groups.
    // app_today() is read once (as a sub-select) rather than once per row, and the grouping gets the
    // memory to hash instead of spilling a sort to disk.
    await q.query(`set local work_mem = '16MB'`);
    const [row] = await q.query(
      `with d as materialized (
         select (select app_today()) as today, date_trunc('week', now()) - interval '11 weeks' as w0,
                now() - interval '30 days' as d30, now() - interval '90 days' as d90),
       s as (
         select board_id, cw, dw, who, grouping(board_id) as gb,
                count(*) filter (where open)::int as open,
                count(*) filter (where open and due_date < today)::int as overdue,
                count(*) filter (where open and due_date between today and today + 7)::int as due_week,
                count(*) filter (where open and cardinality(assignee_ids) = 0)::int as unassigned,
                count(*) filter (where done_at > d30)::int as done_30,
                count(*) filter (where created_at > d30)::int as created_30,
                sum(extract(epoch from (done_at - created_at)) / 86400) filter (where done_at > d90) as cycle_sum,
                count(*) filter (where done_at > d90) as cycle_n,
                count(*) filter (where done_at > d90 and due_date is not null and done_at::date <= due_date) as ontime_n,
                count(*) filter (where done_at > d90 and due_date is not null) as ontime_d,
                count(*)::int as n
           from (
             select t.board_id, t.created_at, t.done_at, t.due_date, t.assignee_ids, d.today, d.d30, d.d90,
                    (${OPEN}) as open,
                    case when t.created_at >= d.w0 then date_trunc('week', t.created_at) end as cw,
                    case when t.done_at >= d.w0 then date_trunc('week', t.done_at) end as dw,
                    case when (${OPEN}) or t.done_at > d.d30 then t.assignee_ids end as who
               from d, tasks t join boards b on b.id = t.board_id
              where b.archived_at is null and t.parent_id is null and ($1::uuid is null or t.board_id = $1::uuid) and ${RECENT}) r
          group by grouping sets ((board_id), (cw), (dw), (who)))
       select
         (select json_build_object('open', coalesce(sum(open), 0), 'overdue', coalesce(sum(overdue), 0), 'due_week', coalesce(sum(due_week), 0),
                   'unassigned', coalesce(sum(unassigned), 0), 'done_30', coalesce(sum(done_30), 0), 'created_30', coalesce(sum(created_30), 0),
                   'cycle_days', round(sum(cycle_sum) / nullif(sum(cycle_n), 0))::int,
                   'on_time', round(100.0 * sum(ontime_n) / nullif(sum(ontime_d), 0))::int)
            from s where gb = 0) as totals,
         (select coalesce(json_agg(json_build_object('week', to_char(cw, 'YYYY-MM-DD'), 'n', n)), '[]') from s where cw is not null) as made,
         (select coalesce(json_agg(json_build_object('week', to_char(dw, 'YYYY-MM-DD'), 'n', n)), '[]') from s where dw is not null) as finished,
         (select coalesce(json_agg(json_build_object('board_id', board_id, 'open', open, 'overdue', overdue) order by open desc, board_id), '[]')
            from s where gb = 0 and open > 0) as boards,
         (select coalesce(json_agg(x order by x.open desc, x.user_id), '[]') from (
            select a.uid as user_id, sum(s.open)::int as open, sum(s.overdue)::int as overdue, sum(s.due_week)::int as due_week, sum(s.done_30)::int as done_30
              from s cross join lateral unnest(s.who) as a(uid)
             where exists (select 1 from users u where u.id = a.uid and u.status <> 'deleted')
             group by a.uid order by 2 desc, 1 limit 100) x) as people`,
      [board],
    );
    const totals = row.totals;
    const made = row.made as { week: string; n: number }[];
    const finished = row.finished as { week: string; n: number }[];
    const people = row.people as any[];
    const boards = row.boards as any[];
    const starts = await q.query<{ week: string }>(
      `select to_char(w, 'YYYY-MM-DD') as week from generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') w order by w`,
    );
    const weeks = starts.map((w) => ({
      week: w.week,
      created: made.find((x) => x.week === w.week)?.n ?? 0,
      done: finished.find((x) => x.week === w.week)?.n ?? 0,
    }));
    const statuses = board
      ? await q.query(`select t.status, count(*)::int as n ${BASE} and t.archived_at is null group by t.status`, [board])
      : [];
    // Time entries are already limited to tasks the person can see; tasks are only read to narrow to one board.
    const hours = board
      ? await q.query(
          `select e.user_id, sum(e.minutes)::int as minutes from time_entries e
            where e.day > (select app_today()) - 30 and e.task_id in (select t.id from tasks t where t.board_id = $1::uuid)
            group by e.user_id order by 2 desc limit 100`,
          [board],
        )
      : await q.query(`select e.user_id, sum(e.minutes)::int as minutes from time_entries e where e.day > (select app_today()) - 30 group by e.user_id order by 2 desc limit 100`);
    return { totals, weeks, people, boards, statuses, hours };
  });
  const n = (v: unknown) => (v == null ? null : Number(v));
  return c.json({
    totals: {
      open: n(out.totals.open) ?? 0,
      overdue: n(out.totals.overdue) ?? 0,
      dueWeek: n(out.totals.due_week) ?? 0,
      unassigned: n(out.totals.unassigned) ?? 0,
      done30: n(out.totals.done_30) ?? 0,
      created30: n(out.totals.created_30) ?? 0,
      cycleDays: n(out.totals.cycle_days),
      onTime: n(out.totals.on_time),
    },
    weeks: out.weeks.map((w) => ({ week: w.week, created: Number(w.created), done: Number(w.done) })),
    people: out.people.map((p) => ({ userId: p.user_id, open: Number(p.open), overdue: Number(p.overdue), dueWeek: Number(p.due_week), done30: Number(p.done_30) })),
    boards: out.boards.map((x) => ({ boardId: x.board_id, open: Number(x.open), overdue: Number(x.overdue) })),
    statuses: out.statuses.map((x) => ({ status: x.status, n: Number(x.n) })),
    hours: out.hours.map((h) => ({ userId: h.user_id, minutes: Number(h.minutes) })),
  });
});

/** One person at a glance, for a 1:1: what they finished, what is late, what is coming, who they look after. */
reportRoutes.get('/reports/person/:id', async (c) => {
  const id = c.req.param('id');
  if (!uuid.safeParse(id).success) return c.json({ error: 'not_found' }, 404);
  const out = await run(c, async (q) => {
    // Someone who is not in this company is "not found", not "has no work".
    const [who] = await q.query('select 1 from users where id = $1', [id]);
    if (!who) fail('not_found');
    const tasks = await q.query(
      `select t.id, t.title, t.board_id, t.status, t.due_date, t.priority, t.done_at, t.updated_at, t.account_id,
              (select name from accounts a where a.id = t.account_id) as account_name, ${DONE} as done
         from tasks t join boards b on b.id = t.board_id
        where b.archived_at is null and t.parent_id is null and $1::uuid = any(t.assignee_ids)
          and ((t.archived_at is null and not ${DONE}) or t.done_at > now() - interval '14 days')
        order by t.due_date nulls last limit 300`,
      [id],
    );
    const [touch] = await q.query(`select count(*)::int as n, max(happened_at) as last from activities where author_id = $1 and happened_at > now() - interval '30 days'`, [id]);
    const [owned] = await q.query(`select count(*)::int as n from accounts where owner_id = $1 and archived_at is null`, [id]);
    const [hours] = await q.query(`select coalesce(sum(minutes), 0)::int as m from time_entries where user_id = $1 and day > (select app_today()) - 30`, [id]);
    return { tasks, touch, owned, hours };
  });
  const day = (v: unknown) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
  return c.json({
    tasks: out.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      boardId: t.board_id,
      status: t.status,
      dueDate: day(t.due_date),
      priority: t.priority,
      done: !!t.done,
      doneAt: t.done_at ? new Date(t.done_at).toISOString() : null,
      updatedAt: new Date(t.updated_at).toISOString(),
      accountId: t.account_id ?? null,
      accountName: t.account_name ?? null,
    })),
    touches30: Number(out.touch?.n ?? 0),
    lastTouchAt: out.touch?.last ? new Date(out.touch.last).toISOString() : null,
    accounts: Number(out.owned?.n ?? 0),
    minutes30: Number(out.hours?.m ?? 0),
  });
});

// ------------------------------------------------------------------ rhythm

const money = z.number().min(0).max(1e13).nullable();
const rhythmInput = z.object({
  targets: z
    .object({
      period: z.enum(TARGET_PERIODS),
      // Every type that has a target; a type left out has none.
      amounts: z.record(z.string().regex(/^[a-z0-9_]{1,40}$/), money),
      total: money,
      // The first shape, one amount per built-in type.
      new: money,
      expansion: money,
      renewal: money,
    })
    .partial()
    .optional(),
  reviewDays: z.number().int().min(0).max(730).optional(),
  staleDays: z.number().int().min(0).max(365).optional(),
  escalateDays: z.number().int().min(0).max(90).optional(),
  renewal: z.object({ days: z.number().int().min(0).max(730), planId: uuid.nullable(), opportunity: z.boolean() }).partial().optional(),
});

/**
 * Targets, the review rhythm and the nudge thresholds: one small company
 * setting, changed by whoever manages customers. Only what is sent changes.
 */
reportRoutes.put('/rhythm', async (c) => {
  requireWriter(c);
  const auth = c.get('auth');
  if (!auth.perms.includes('accounts.manage') && !auth.perms.includes('org.manage')) fail('forbidden');
  const input = await body(c, rhythmInput);
  const org = c.get('org');
  const now = rhythmOf((org.settings as any)?.rhythm);
  const t = input.targets ?? {};
  // Amounts sent whole replace the old ones; the first shape's keys change only themselves.
  const amounts: Record<string, unknown> = t.amounts ? { ...t.amounts } : { ...now.targets.amounts };
  for (const k of ['new', 'expansion', 'renewal'] as const) if (t[k] !== undefined) amounts[k] = t[k];
  const next = rhythmOf({
    ...now,
    ...input,
    targets: { period: t.period ?? now.targets.period, amounts, total: t.total !== undefined ? t.total : now.targets.total },
    renewal: { ...now.renewal, ...(input.renewal ?? {}) },
  });
  if (input.renewal?.planId) {
    // A playbook on every renewal is part of the Business plan.
    requirePlan(c, 'playbooks');
    const [plan] = await run(c, (q) => q.query('select 1 from plan_templates where id = $1', [input.renewal!.planId]));
    if (!plan) fail('validation', { fields: 'renewal.planId' }, { fields: ['renewal.planId'] });
  }
  await run(c, async (q) => {
    await q.query('select app_set_rhythm($1::jsonb)', [JSON.stringify(next)]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'rhythm.updated', entity: 'org', entityId: org.id, meta: { changed: Object.keys(input) } });
  });
  return c.json({ rhythm: next });
});
