// Nudges: work that has gone still, said once a week to whoever holds it;
// work well past its date, passed once to the team lead. Both come out of the
// hourly run that already sends the morning summary — no new moving parts —
// and both are switched and tuned in the company's rhythm settings.
import { rhythmOf } from '../../../shared/src/rhythm';
import type { Deps } from '../context';
import { addDays, localDate, localHour } from './automations';
import { day } from './mappers';
import { enqueue, prefsOf } from './notify';

const ITEMS = 6;
/** The weekday (0 = Sunday) the stale list goes out: mid-week, clear of Monday's summary. */
export const STALE_WEEKDAY = 4;
/** Company-local hour at which leads hear about late work. */
export const ESCALATE_HOUR = 9;

const OPEN = `t.archived_at is null and b.archived_at is null
  and not exists (select 1 from jsonb_array_elements(b.columns) col where col->>'key' = t.status and (col->>'done')::boolean)`;

const weekdayOf = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export async function sendNudges(deps: Deps, now: Date): Promise<{ stale: number; escalated: number }> {
  const orgs = await deps.db.system((q) => q.query('select id, timezone, settings from orgs'));
  let stale = 0;
  let escalated = 0;
  for (const org of orgs) {
    const rhythm = rhythmOf((org.settings as any)?.rhythm);
    const tz = org.timezone || 'UTC';
    const today = localDate(now, tz);
    const hour = localHour(now, tz);
    const weekday = weekdayOf(today);

    // Still for too long: each person's own list, at the hour of their morning summary.
    if (rhythm.staleDays > 0 && weekday === STALE_WEEKDAY) {
      const users = await deps.db.system((q) => q.query(`select id, prefs from users where org_id = $1 and status = 'active' and seat = 'full'`, [org.id]));
      for (const u of users) {
        const prefs = prefsOf(u.prefs);
        if (prefs.events.nudges === false || prefs.digestHour !== hour) continue;
        // Not what is planned for later (a start date ahead, or due more than a week away), and not what the person muted.
        const tasks = await deps.db.system((q) =>
          q.query(
            `select t.id, t.title, t.updated_at from tasks t join boards b on b.id = t.board_id
              where t.org_id = $1 and $2 = any(t.assignee_ids) and ${OPEN}
                and t.updated_at < $3::timestamptz - make_interval(days => $4::int)
                and (t.start_date is null or t.start_date <= $5::date)
                and (t.due_date is null or t.due_date <= $5::date + 7)
                and not exists (select 1 from task_mutes m where m.task_id = t.id and m.user_id = $2)
              order by t.updated_at limit 200`,
            [org.id, u.id, now.toISOString(), rhythm.staleDays, today],
          ),
        );
        if (!tasks.length) continue;
        await deps.db.system((q) =>
          enqueue(q, [
            {
              orgId: org.id,
              userId: u.id,
              kind: 'stale',
              dedupeKey: `stale:${u.id}:${today}`,
              data: {
                days: rhythm.staleDays,
                count: tasks.length,
                items: tasks.slice(0, ITEMS).map((t) => ({ id: t.id, title: t.title, days: Math.floor((now.getTime() - new Date(t.updated_at).getTime()) / 86_400_000) })),
              },
            },
          ]),
        );
        stale++;
      }
    }

    // Well past its date: said to the lead once, on the working day it crosses the line
    // (Monday also picks up what crossed over the weekend). Switching this on never
    // unloads an old backlog on anyone; the Team page has the whole picture.
    if (rhythm.escalateDays > 0 && hour === ESCALATE_HOUR && weekday >= 1 && weekday <= 5) {
      const newest = addDays(today, -rhythm.escalateDays);
      const oldest = weekday === 1 ? addDays(newest, -2) : newest;
      const tasks = await deps.db.system((q) =>
        q.query(
          `select t.id, t.title, t.due_date, t.assignee_ids, b.created_by,
                  (select array_agg(distinct tm.lead_id) from team_members m join teams tm on tm.id = m.team_id
                    where m.user_id = any(t.assignee_ids) and tm.lead_id is not null) as leads,
                  (select string_agg(u.name, ', ' order by u.name) from users u where u.id = any(t.assignee_ids)) as who
             from tasks t join boards b on b.id = t.board_id
            where t.org_id = $1 and t.parent_id is null and ${OPEN} and t.due_date between $2::date and $3::date
            order by t.due_date limit 500`,
          [org.id, oldest, newest],
        ),
      );
      const byLead = new Map<string, { id: string; title: string; days: number; who: string | null }[]>();
      for (const t of tasks) {
        const holders = new Set<string>(t.assignee_ids ?? []);
        // The leads of whoever holds it; for work nobody holds (or a team without a lead), whoever made the board.
        let to = ((t.leads ?? []) as string[]).filter((id) => !holders.has(id));
        if (!to.length && t.created_by && !holders.has(t.created_by)) to = [t.created_by];
        for (const id of to) {
          byLead.set(id, [...(byLead.get(id) ?? []), { id: t.id, title: t.title, days: daysBetween(day(t.due_date)!, today), who: t.who ?? null }]);
        }
      }
      for (const [leadId, items] of byLead) {
        const [lead] = await deps.db.system((q) => q.query(`select prefs from users where id = $1 and org_id = $2 and status = 'active'`, [leadId, org.id]));
        if (!lead || prefsOf(lead.prefs).events.nudges === false) continue;
        await deps.db.system((q) =>
          enqueue(q, [
            {
              orgId: org.id,
              userId: leadId,
              kind: 'escalated',
              taskId: items.length === 1 ? items[0].id : null,
              dedupeKey: `escalated:${leadId}:${today}`,
              data: { days: rhythm.escalateDays, count: items.length, items: items.slice(0, ITEMS) },
            },
          ]),
        );
        escalated++;
      }
    }
  }
  return { stale, escalated };
}
