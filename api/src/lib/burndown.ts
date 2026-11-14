// Burndown history. Once a day the engine records, for every running sprint, how
// much of its scope is left — the actual line the sprint view draws against the
// ideal one. The read side (GET /sprints/:id/burndown in routes/pm.ts) adds a
// live point for today, so the chart is never empty before the first snapshot.
//
// This runs from the hourly engine (lib/scheduler.ts), which has no signed-in
// person, so it writes through db.system like the digests and the nightly
// clean-up. Every row it writes carries the sprint's own org_id, and the query
// is scoped to one company at a time (p_org), so nothing crosses a company line.
import type { Deps } from '../context';
import type { Q } from '../db';
import { localDate } from '../../../shared/src/days';

// For each active sprint of one company, upsert today's point: scope and what is
// left, in points and in item count. "Done" is a task whose status is one of its
// board's columns marked done (the same rule the sprint summary uses). A board
// whose PM switch is off (pm_enabled = false) is skipped.
const SNAPSHOT_SQL = `
  insert into sprint_burndowns (org_id, board_id, sprint_id, day, total_points, remaining_points, total_count, remaining_count)
  select s.org_id, s.board_id, s.id, $1::date,
         coalesce(sum(t.story_points), 0),
         coalesce(sum(t.story_points), 0) - coalesce(sum(t.story_points) filter (where t.status = any(dk.keys)), 0),
         count(t.id),
         count(t.id) - count(t.id) filter (where t.status = any(dk.keys))
    from sprints s
    join boards b on b.org_id = s.org_id and b.id = s.board_id
    cross join lateral (
      select coalesce(array_agg(c->>'key') filter (where (c->>'done')::boolean), '{}') as keys
        from jsonb_array_elements(b.columns) c
    ) dk
    left join tasks t on t.org_id = s.org_id and t.sprint_id = s.id and t.archived_at is null
   where s.org_id = $2 and s.state = 'active' and s.archived_at is null
     and b.archived_at is null and b.pm_enabled is distinct from false
   group by s.org_id, s.board_id, s.id
  on conflict (org_id, sprint_id, day) do update set
    total_points = excluded.total_points, remaining_points = excluded.remaining_points,
    total_count = excluded.total_count, remaining_count = excluded.remaining_count, created_at = now()
  returning sprint_id`;

/**
 * Record today's point for every active sprint of one company. `day` is that
 * company's own calendar day. Returns how many sprints were written. Safe to run
 * again the same day — it replaces the day's point rather than adding another.
 */
export async function snapshotOrgSprints(q: Q, orgId: string, day: string): Promise<number> {
  const rows = await q.query(SNAPSHOT_SQL, [day, orgId]);
  return rows.length;
}

/**
 * The daily entry point for the engine: a burndown point on every running
 * sprint, in each company's own day. Returns the total number of sprints
 * recorded across all companies.
 */
export async function snapshotActiveSprints(deps: Deps, now = (deps.now ?? (() => new Date()))()): Promise<number> {
  const orgs = await deps.db.system((q) => q.query<{ id: string; timezone: string }>('select id, timezone from orgs'));
  let n = 0;
  for (const org of orgs) {
    const day = localDate(now, org.timezone);
    n += await deps.db.system((q) => snapshotOrgSprints(q, org.id, day));
  }
  return n;
}
