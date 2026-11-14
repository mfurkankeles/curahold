// Runs every hour (Workers cron, or a timer on Node): the morning digest in
// each person's company time zone, scheduled automations, delivery retries
// and data clean-up (KVKK/GDPR: nothing is kept longer than it is useful).
import type { Deps } from '../context';
import { localDate, localHour, runScheduledAutomations } from './automations';
import { day } from './mappers';
import { deliverPending, enqueue, prefsOf } from './notify';
import { runScheduledSyncs } from '../sync/engine';
import { deliverWebhooks } from './webhooks';
import { dailyHealth, flushHealth } from './health';
import { sendWeekly } from './weekly';
import { sendNudges } from './nudges';
import { startRenewals } from './playbooks';
import { syncSeats } from './billing';
import { emptyTrash } from './trash';
import { snapshotActiveSprints } from './burndown';
import { REPLAY_RETENTION_DAYS } from '../../../shared/src/replay';

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
              and t.done_at is null
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
  // What has been in the trash for its 30 days goes for good, files included.
  await emptyTrash(deps).catch((e) => console.error('[curahold] emptying the trash failed', e));
  await deps.db.system(async (q) => {
    await q.query(`delete from login_tokens where expires_at < now() - interval '1 day'`);
    await q.query(`delete from signups where org_id is null and expires_at < now() - interval '7 days'`);
    await q.query(`delete from notifications where created_at < now() - interval '90 days'`);
    await q.query(`delete from sessions where (revoked_at is not null or expires_at < now()) and coalesce(revoked_at, expires_at) < now() - interval '90 days'`);
    // An import can be undone for 30 days; after that the snapshot goes.
    await q.query(`update import_batches set previous = '[]'::jsonb where created_at < now() - interval '30 days' and previous <> '[]'::jsonb`);
    await q.query(`delete from sync_runs where started_at < now() - interval '90 days'`);
    await q.query(`delete from oauth_codes where expires_at < now()`);
    // Keys of changes that must happen once: a retry comes within minutes, not days.
    await q.query(`delete from idempotency_keys where created_at < now() - interval '2 days'`);
    await q.query(`delete from webhook_events where created_at < now() - interval '7 days'`);
    // Errors are kept long enough to find and fix a fault, then let go.
    await q.query(`delete from error_log where at < now() - interval '30 days'`);
    await q.query(`delete from support_sessions where expires_at < now() - interval '30 days'`);
    // Session recordings are kept only as long as useful for support (chunks cascade).
    await q.query(`delete from replay_sessions where last_at < now() - make_interval(days => $1)`, [REPLAY_RETENTION_DAYS]);
    await q.query(`delete from api_tokens where (revoked_at is not null or coalesce(refresh_expires_at, expires_at) < now()) and coalesce(revoked_at, refresh_expires_at, expires_at) < now() - interval '30 days'`);
  });
}

/**
 * Finished work steps aside: tasks done longer ago than their board keeps
 * them (90 days unless the board says otherwise) move to its archive. One
 * statement a night. A task someone brought back, or touched since, stays
 * for the same number of days again.
 */
export async function archiveFinished(deps: Deps, now: Date): Promise<number> {
  const rows = await deps.db.system((q) =>
    q.query(
      `with gone as (
         update tasks t set archived_at = $1::timestamptz
           from boards b
          where b.id = t.board_id and b.archive_days is not null and b.archived_at is null
            and t.archived_at is null and t.parent_id is null and t.done_at is not null
            and t.done_at < $1::timestamptz - make_interval(days => b.archive_days)
            and t.updated_at < $1::timestamptz - make_interval(days => b.archive_days)
         returning t.org_id, t.id)
       insert into task_events (org_id, task_id, actor_id, kind, data)
       select org_id, id, null, 'archived', '{"auto": true}'::jsonb from gone returning task_id`,
      [now.toISOString()],
    ),
  );
  return rows.length;
}

export async function runScheduled(deps: Deps, now = (deps.now ?? (() => new Date()))()) {
  const digests = await sendDigests(deps, now);
  const fired = await runScheduledAutomations(deps, now);
  const weekly = await sendWeekly(deps, now).catch((e) => {
    console.error('[curahold] weekly summary failed', e);
    return 0;
  });
  const nudges = await sendNudges(deps, now).catch((e) => {
    console.error('[curahold] nudges failed', e);
    return { stale: 0, escalated: 0 };
  });
  let delivered = 0;
  for (let i = 0; i < 20; i++) {
    const n = await deliverPending(deps, 100);
    delivered += n;
    if (n < 100) break;
  }
  // Health scores: anything marked and not yet picked up; once a day, everyone (time passes) and the trend point.
  await flushHealth(deps, 5000).catch((e) => console.error('[curahold] health failed', e));
  if (now.getUTCHours() === 3) await dailyHealth(deps, now).catch((e) => console.error('[curahold] daily health failed', e));
  // Webhook retries (new events go out right after the change that made them).
  const hooks = await deliverWebhooks(deps, 200).catch((e) => {
    console.error('[curahold] webhook delivery failed', e);
    return 0;
  });
  const synced = await runScheduledSyncs(deps, now).catch((e) => {
    console.error('[curahold] scheduled sync failed', e);
    return 0;
  });
  if (now.getUTCHours() === 3) {
    await cleanUp(deps);
    await archiveFinished(deps, now).catch((e) => console.error('[curahold] archiving finished work failed', e));
    await snapshotActiveSprints(deps, now).catch((e) => console.error('[curahold] sprint burndown snapshot failed', e));
  }
  // Renewals coming close enough start by themselves, early in the working day.
  if (now.getUTCHours() === 5) await startRenewals(deps, now).catch((e) => console.error('[curahold] starting renewals failed', e));
  // Subscriptions follow the full seats in use (billing on only).
  const seats = await syncSeats(deps).catch((e) => {
    console.error('[curahold] seat sync failed', e);
    return 0;
  });
  return { digests, weekly, nudges, fired, delivered, synced, hooks, seats };
}
