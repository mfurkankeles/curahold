// Seeing the load: the team's coming weeks, person by person (open tasks by
// the week they are due, how many of them are promises to a customer, and
// their story points), and every customer's open work, requests and tickets
// on one page. Both read only what the person asking may see (row security).
import { Hono } from 'hono';
import { run, type AppEnv } from '../context';
import { uuid } from '../lib/validate';

export const loadRoutes = new Hono<AppEnv>();

const MAX_WEEKS = 12;

interface Cell {
  tasks: number;
  promises: number;
  points: number;
}

/**
 * Person × week. A week is Monday to Sunday in the company's calendar; the
 * first column is what is already late, the last what has no date. A promise
 * is an open task that belongs to a customer.
 */
loadRoutes.get('/reports/workload', async (c) => {
  const weeks = Math.min(MAX_WEEKS, Math.max(2, Number(c.req.query('weeks')) || 6));
  const t = c.req.query('team');
  const team = t && uuid.safeParse(t).success ? t : null;
  const out = await run(c, async (q) => {
    const rows = await q.query<{ uid: string; bucket: string; tasks: number; promises: number; points: number }>(
      `with d as (select (select app_today()) as today, date_trunc('week', (select app_today()))::date as w0)
       select a.uid,
              case when t.due_date is null then 'none'
                   when t.due_date < d.today then 'late'
                   when t.due_date >= d.w0 + ($1::int * 7) then 'later'
                   else to_char(date_trunc('week', t.due_date)::date, 'YYYY-MM-DD') end as bucket,
              count(*)::int as tasks,
              count(*) filter (where t.account_id is not null)::int as promises,
              coalesce(sum(t.story_points), 0)::float8 as points
         from d, tasks t join boards b on b.id = t.board_id
         cross join lateral unnest(t.assignee_ids) as a(uid)
        where b.archived_at is null and t.archived_at is null and t.done_at is null and t.parent_id is null
          and ($2::uuid is null or a.uid in (select user_id from team_members where team_id = $2::uuid))
        group by 1, 2`,
      [weeks, team],
    );
    const [{ w0 }] = await q.query<{ w0: string }>(`select to_char(date_trunc('week', (select app_today()))::date, 'YYYY-MM-DD') as w0`);
    return { rows, w0 };
  });
  const starts = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(`${out.w0}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i * 7);
    return d.toISOString().slice(0, 10);
  });
  const blank = (): Cell => ({ tasks: 0, promises: 0, points: 0 });
  const people = new Map<string, { userId: string; late: Cell; none: Cell; later: Cell; weeks: Cell[] }>();
  for (const r of out.rows) {
    let p = people.get(r.uid);
    if (!p) people.set(r.uid, (p = { userId: r.uid, late: blank(), none: blank(), later: blank(), weeks: starts.map(blank) }));
    const cell: Cell = { tasks: r.tasks, promises: r.promises, points: Math.round(r.points * 10) / 10 };
    if (r.bucket === 'late' || r.bucket === 'none' || r.bucket === 'later') p[r.bucket] = cell;
    else {
      const i = starts.indexOf(r.bucket);
      if (i >= 0) p.weeks[i] = cell;
    }
  }
  return c.json({ weeks: starts, people: [...people.values()] });
});

/**
 * Every customer with something open: open work (and how much of it is late),
 * requests their people sent through the portal, and support tickets not yet
 * solved — busiest first. Money is left out on purpose: who may see amounts
 * is decided field by field elsewhere.
 */
loadRoutes.get('/reports/portfolio', async (c) => {
  const scope = c.req.query('scope') === 'mine' ? 'mine' : 'all';
  const t = c.req.query('team');
  const team = t && uuid.safeParse(t).success ? t : null;
  const out = await run(c, async (q) => {
    const rows = await q.query(
      `with work as (
         select t.account_id,
                count(*)::int as open,
                count(*) filter (where t.due_date < (select app_today()))::int as overdue,
                count(*) filter (where t.portal_author_id is not null)::int as requests,
                min(t.due_date) as next_due
           from tasks t join boards b on b.id = t.board_id
          where t.account_id is not null and t.archived_at is null and t.done_at is null and b.archived_at is null
          group by t.account_id),
       tix as (
         select r.account_id, count(*)::int as tickets
           from records r join record_types rt on rt.id = r.type_id
          where rt.kind = 'ticket' and r.archived_at is null and r.account_id is not null
            and coalesce(r.fields->>'status', 'open') in ('open', 'pending')
          group by r.account_id)
       select a.id, a.name, a.owner_id, coalesce(w.open, 0) as open, coalesce(w.overdue, 0) as overdue,
              coalesce(w.requests, 0) as requests, coalesce(x.tickets, 0) as tickets, to_char(w.next_due, 'YYYY-MM-DD') as next_due
         from accounts a
         left join work w on w.account_id = a.id
         left join tix x on x.account_id = a.id
        where a.archived_at is null and (w.account_id is not null or x.account_id is not null)
          and ($1 = 'all' or a.owner_id = app_user())
          and ($2::uuid is null or a.team_id = $2::uuid)
        order by coalesce(w.overdue, 0) * 3 + coalesce(w.requests, 0) * 2 + coalesce(x.tickets, 0) * 2 + coalesce(w.open, 0) desc, a.name
        limit 300`,
      [scope, team],
    );
    const [{ n }] = await q.query<{ n: number }>(
      `select count(*)::int as n from accounts a where a.archived_at is null and ($1 = 'all' or a.owner_id = app_user()) and ($2::uuid is null or a.team_id = $2::uuid)`,
      [scope, team],
    );
    return { rows, n };
  });
  return c.json({
    customers: out.rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      ownerId: (r.owner_id as string | null) ?? null,
      open: Number(r.open),
      overdue: Number(r.overdue),
      requests: Number(r.requests),
      tickets: Number(r.tickets),
      nextDue: (r.next_due as string | null) ?? null,
    })),
    /** How many customers are in the scope, busy or not. */
    total: out.n,
  });
});
