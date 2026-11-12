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
const RECENT = `(t.done_at is null or t.done_at > now() - interval '90 days' or t.created_at > now() - interval '90 days')`;

reportRoutes.get('/reports/work', async (c) => {
  const b = c.req.query('board');
  const board = b && uuid.safeParse(b).success ? b : null;
  const out = await run(c, async (q) => {
    const [totals] = await q.query(
      `select count(*) filter (where ${OPEN})::int as open,
              count(*) filter (where ${OPEN} and t.due_date < app_today())::int as overdue,
              count(*) filter (where ${OPEN} and t.due_date between app_today() and app_today() + 7)::int as due_week,
              count(*) filter (where ${OPEN} and cardinality(t.assignee_ids) = 0)::int as unassigned,
              count(*) filter (where t.done_at > now() - interval '30 days')::int as done_30,
              count(*) filter (where t.created_at > now() - interval '30 days')::int as created_30,
              round(avg(extract(epoch from (t.done_at - t.created_at)) / 86400) filter (where t.done_at > now() - interval '90 days'))::int as cycle_days,
              round(100.0 * count(*) filter (where t.done_at > now() - interval '90 days' and t.due_date is not null and t.done_at::date <= t.due_date)
                    / nullif(count(*) filter (where t.done_at > now() - interval '90 days' and t.due_date is not null), 0))::int as on_time
         ${BASE} and ${RECENT}`,
      [board],
    );
    // Twelve weeks of created and finished, oldest first: two grouped passes, not one per week.
    const made = await q.query(
      `select to_char(date_trunc('week', t.created_at), 'YYYY-MM-DD') as week, count(*)::int as n
         ${BASE} and t.created_at >= date_trunc('week', now()) - interval '11 weeks' group by 1`,
      [board],
    );
    const finished = await q.query(
      `select to_char(date_trunc('week', t.done_at), 'YYYY-MM-DD') as week, count(*)::int as n
         ${BASE} and t.done_at >= date_trunc('week', now()) - interval '11 weeks' group by 1`,
      [board],
    );
    const starts = await q.query<{ week: string }>(
      `select to_char(w, 'YYYY-MM-DD') as week from generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') w order by w`,
    );
    const weeks = starts.map((w) => ({
      week: w.week,
      created: made.find((x) => x.week === w.week)?.n ?? 0,
      done: finished.find((x) => x.week === w.week)?.n ?? 0,
    }));
    const people = await q.query(
      `select a.uid as user_id,
              count(*) filter (where ${OPEN})::int as open,
              count(*) filter (where ${OPEN} and t.due_date < app_today())::int as overdue,
              count(*) filter (where ${OPEN} and t.due_date between app_today() and app_today() + 7)::int as due_week,
              count(*) filter (where t.done_at > now() - interval '30 days')::int as done_30
         from tasks t join boards b on b.id = t.board_id cross join lateral unnest(t.assignee_ids) as a(uid)
        where b.archived_at is null and t.parent_id is null and ($1::uuid is null or t.board_id = $1::uuid)
          and ((${OPEN}) or t.done_at > now() - interval '30 days')
          and exists (select 1 from users u where u.id = a.uid and u.status <> 'deleted')
        group by a.uid order by 2 desc limit 100`,
      [board],
    );
    const boards = await q.query(
      `select b.id as board_id, count(*)::int as open, count(*) filter (where t.due_date < app_today())::int as overdue
         ${BASE} and ${OPEN} group by b.id order by 2 desc`,
      [board],
    );
    const statuses = board
      ? await q.query(`select t.status, count(*)::int as n ${BASE} and t.archived_at is null group by t.status`, [board])
      : [];
    // Time entries are already limited to tasks the person can see; tasks are only read to narrow to one board.
    const hours = board
      ? await q.query(
          `select e.user_id, sum(e.minutes)::int as minutes from time_entries e
            where e.day > app_today() - 30 and e.task_id in (select t.id from tasks t where t.board_id = $1::uuid)
            group by e.user_id order by 2 desc limit 100`,
          [board],
        )
      : await q.query(`select e.user_id, sum(e.minutes)::int as minutes from time_entries e where e.day > app_today() - 30 group by e.user_id order by 2 desc limit 100`);
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
    const [hours] = await q.query(`select coalesce(sum(minutes), 0)::int as m from time_entries where user_id = $1 and day > app_today() - 30`, [id]);
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
