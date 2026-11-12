// Reports: how the work is going, worked out when someone looks (nothing is
// stored or pre-computed). Everything is counted inside what the person can
// see — the same boards and customers as everywhere else.
import { Hono } from 'hono';
import { z } from 'zod';
import { TARGET_PERIODS, rhythmOf } from '../../../shared/src/rhythm';
import { requireWriter, run, type AppEnv } from '../context';
import { audit } from '../lib/audit';
import { fail } from '../lib/errors';
import { body, uuid } from '../lib/validate';

export const reportRoutes = new Hono<AppEnv>();

const DONE = `exists (select 1 from jsonb_array_elements(b.columns) col where col->>'key' = t.status and (col->>'done')::boolean)`;
const BASE = `from tasks t join boards b on b.id = t.board_id where t.archived_at is null and b.archived_at is null and t.parent_id is null and ($1::uuid is null or t.board_id = $1::uuid)`;

reportRoutes.get('/reports/work', async (c) => {
  const b = c.req.query('board');
  const board = b && uuid.safeParse(b).success ? b : null;
  const out = await run(c, async (q) => {
    const [totals] = await q.query(
      `select count(*) filter (where not ${DONE})::int as open,
              count(*) filter (where not ${DONE} and t.due_date < current_date)::int as overdue,
              count(*) filter (where not ${DONE} and t.due_date between current_date and current_date + 7)::int as due_week,
              count(*) filter (where not ${DONE} and cardinality(t.assignee_ids) = 0)::int as unassigned,
              count(*) filter (where t.done_at > now() - interval '30 days')::int as done_30,
              count(*) filter (where t.created_at > now() - interval '30 days')::int as created_30,
              round(avg(extract(epoch from (t.done_at - t.created_at)) / 86400) filter (where t.done_at > now() - interval '90 days'))::int as cycle_days,
              round(100.0 * count(*) filter (where t.done_at > now() - interval '90 days' and t.due_date is not null and t.done_at::date <= t.due_date)
                    / nullif(count(*) filter (where t.done_at > now() - interval '90 days' and t.due_date is not null), 0))::int as on_time
         ${BASE}`,
      [board],
    );
    // Twelve weeks of created and finished, oldest first.
    const weeks = await q.query(
      `with w as (select generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') as wk)
       select to_char(w.wk, 'YYYY-MM-DD') as week,
              (select count(*)::int ${BASE} and t.created_at >= w.wk and t.created_at < w.wk + interval '1 week') as created,
              (select count(*)::int ${BASE} and t.done_at >= w.wk and t.done_at < w.wk + interval '1 week') as done
         from w order by w.wk`,
      [board],
    );
    const people = await q.query(
      `select u.id as user_id,
              count(*) filter (where not ${DONE})::int as open,
              count(*) filter (where not ${DONE} and t.due_date < current_date)::int as overdue,
              count(*) filter (where not ${DONE} and t.due_date between current_date and current_date + 7)::int as due_week,
              count(*) filter (where t.done_at > now() - interval '30 days')::int as done_30
         from tasks t join boards b on b.id = t.board_id cross join lateral unnest(t.assignee_ids) as a(uid) join users u on u.id = a.uid
        where t.archived_at is null and b.archived_at is null and t.parent_id is null and ($1::uuid is null or t.board_id = $1::uuid) and u.status <> 'deleted'
        group by u.id order by 2 desc limit 100`,
      [board],
    );
    const boards = await q.query(
      `select b.id as board_id, count(*) filter (where not ${DONE})::int as open, count(*) filter (where not ${DONE} and t.due_date < current_date)::int as overdue
         ${BASE} group by b.id order by 2 desc`,
      [board],
    );
    const statuses = board
      ? await q.query(`select t.status, count(*)::int as n ${BASE} group by t.status`, [board])
      : [];
    const hours = await q.query(
      `select e.user_id, sum(e.minutes)::int as minutes from time_entries e join tasks t on t.id = e.task_id
        where e.day > current_date - 30 and ($1::uuid is null or t.board_id = $1::uuid) group by e.user_id order by 2 desc limit 100`,
      [board],
    );
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
        where t.archived_at is null and b.archived_at is null and t.parent_id is null and $1::uuid = any(t.assignee_ids)
          and (not ${DONE} or t.done_at > now() - interval '14 days')
        order by t.due_date nulls last limit 300`,
      [id],
    );
    const [touch] = await q.query(`select count(*)::int as n, max(happened_at) as last from activities where author_id = $1 and happened_at > now() - interval '30 days'`, [id]);
    const [owned] = await q.query(`select count(*)::int as n from accounts where owner_id = $1 and archived_at is null`, [id]);
    const [hours] = await q.query(`select coalesce(sum(minutes), 0)::int as m from time_entries where user_id = $1 and day > current_date - 30`, [id]);
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
  targets: z.object({ period: z.enum(TARGET_PERIODS), new: money, expansion: money, renewal: money }).partial().optional(),
  reviewDays: z.number().int().min(0).max(730).optional(),
  staleDays: z.number().int().min(0).max(365).optional(),
  escalateDays: z.number().int().min(0).max(90).optional(),
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
  const next = rhythmOf({ ...now, ...input, targets: { ...now.targets, ...(input.targets ?? {}) } });
  await run(c, async (q) => {
    await q.query('select app_set_rhythm($1::jsonb)', [JSON.stringify(next)]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'rhythm.updated', entity: 'org', entityId: org.id, meta: { changed: Object.keys(input) } });
  });
  return c.json({ rhythm: next });
});
