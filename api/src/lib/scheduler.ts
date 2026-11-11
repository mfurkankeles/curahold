// Runs every hour (Workers cron, or a timer on Node): the morning digest in
// each person's company time zone, scheduled automations, delivery retries
// and data clean-up (KVKK/GDPR: nothing is kept longer than it is useful).
import type { Deps } from '../context';
import { localDate, localHour, runScheduledAutomations } from './automations';
import { day } from './mappers';
import { deliverPending, enqueue, prefsOf } from './notify';

const DIGEST_ITEMS = 8;

export async function sendDigests(deps: Deps, now: Date) {
  const orgs = await deps.db.system((q) => q.query('select id, timezone from orgs'));
  let queued = 0;
  for (const org of orgs) {
    const hour = localHour(now, org.timezone);
    const today = localDate(now, org.timezone);
    const users = await deps.db.system((q) => q.query(`select id, prefs from users where org_id = $1 and status = 'active' and seat = 'full'`, [org.id]));
    for (const u of users) {
      const prefs = prefsOf(u.prefs);
      if (prefs.events.digest === false || prefs.digestHour !== hour) continue;
      const tasks = await deps.db.system((q) =>
        q.query(
          `select t.id, t.title, t.due_date from tasks t join boards b on b.id = t.board_id
            where t.org_id = $1 and $2 = any(t.assignee_ids) and t.archived_at is null and b.archived_at is null
              and t.due_date is not null and t.due_date <= $3::date
              and not exists (select 1 from jsonb_array_elements(b.columns) col where col->>'key' = t.status and (col->>'done')::boolean)
            order by t.due_date, t.position`,
          [org.id, u.id, today],
        ),
      );
      if (!tasks.length) continue;
      const item = (t: any) => ({ id: t.id, title: t.title, due: day(t.due_date) });
      const overdue = tasks.filter((t) => day(t.due_date)! < today);
      const dueToday = tasks.filter((t) => day(t.due_date) === today);
      await deps.db.system((q) =>
        enqueue(q, [
          {
            orgId: org.id,
            userId: u.id,
            kind: 'digest',
            dedupeKey: `digest:${u.id}:${today}`,
            data: {
              overdue: overdue.slice(0, DIGEST_ITEMS).map(item),
              overdueCount: overdue.length,
              today: dueToday.slice(0, DIGEST_ITEMS).map(item),
              todayCount: dueToday.length,
            },
          },
        ]),
      );
      queued++;
    }
  }
  return queued;
}

export async function cleanUp(deps: Deps) {
  await deps.db.system(async (q) => {
    await q.query(`delete from login_tokens where expires_at < now() - interval '1 day'`);
    await q.query(`delete from signups where org_id is null and expires_at < now() - interval '7 days'`);
    await q.query(`delete from notifications where created_at < now() - interval '90 days'`);
    await q.query(`delete from sessions where (revoked_at is not null or expires_at < now()) and coalesce(revoked_at, expires_at) < now() - interval '90 days'`);
    // An import can be undone for 30 days; after that the snapshot goes.
    await q.query(`update import_batches set previous = '[]'::jsonb where created_at < now() - interval '30 days' and previous <> '[]'::jsonb`);
  });
}

export async function runScheduled(deps: Deps, now = (deps.now ?? (() => new Date()))()) {
  const digests = await sendDigests(deps, now);
  const fired = await runScheduledAutomations(deps, now);
  let delivered = 0;
  for (let i = 0; i < 20; i++) {
    const n = await deliverPending(deps, 100);
    delivered += n;
    if (n < 100) break;
  }
  if (now.getUTCHours() === 3) await cleanUp(deps);
  return { digests, fired, delivered };
}
