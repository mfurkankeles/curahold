// The yearly renewal notice. The terms (section 5) and the refund policy promise
// that administrators hear "at least N days" before a yearly plan renews by
// itself; this is that promise in code. Once an hour (lib/scheduler.ts) every
// active yearly subscription that renews within the window and is not already
// set to end gets one notice per administrator, queued in the notifications
// outbox inside the same transaction that read it and keyed by subscription,
// period end and person, so a second run, a second isolate or a retry never
// sends it twice. A new period (the next year) has a new key and a new notice.
//
// The window is an operator setting (RENEWAL_NOTICE_DAYS, docs/ENVIRONMENT.md):
// 30 days by default, bounded to 7–90 so a typo can neither drop the notice
// below what the texts promise in spirit nor send it a season early.
// LEGAL: the number in the terms and the refund policy is "[30]" until the
// lawyer confirms it; keep this default and those texts in step.
import type { Deps } from '../context';
import { enqueue } from '../lib/notify';

/** The notice window when RENEWAL_NOTICE_DAYS is unset or unreadable (the terms say "at least [30] days"). */
export const RENEWAL_NOTICE_DEFAULT_DAYS = 30;
const MIN_DAYS = 7;
const MAX_DAYS = 90;

/** RENEWAL_NOTICE_DAYS as a whole number of days within 7–90; anything else falls back to the default. */
export function renewalNoticeDaysOf(raw: string | number | undefined | null): number {
  const n = typeof raw === 'number' ? raw : raw == null || raw === '' ? NaN : Number(raw);
  if (!Number.isInteger(n)) return RENEWAL_NOTICE_DEFAULT_DAYS;
  return Math.min(MAX_DAYS, Math.max(MIN_DAYS, n));
}

interface Due {
  id: string;
  org_id: string;
  plan: string;
  seats: number | null;
  current_period_end: Date | string;
}

/**
 * Queues the renewal notice for every yearly plan renewing within the window (billing on only). Returns how many
 * notices were newly queued; delivery is the outbox's (lib/notify.ts), by e-mail whatever the person's preferences,
 * because it is a contractual notice.
 */
export async function queueRenewalNotices(deps: Deps, now: Date): Promise<number> {
  if (!deps.config.billing) return 0;
  const days = renewalNoticeDaysOf(deps.config.billing.renewalNoticeDays);
  // System access on purpose: the job acts for every company; each statement below names its org_id itself.
  const due = await deps.db.system((q) =>
    q.query<Due>(
      `select id, org_id, plan, seats, current_period_end from subscriptions
        where billing_interval = 'year' and status = 'active' and not cancel_at_period_end
          and current_period_end > $1::timestamptz
          and current_period_end <= $1::timestamptz + make_interval(days => $2)`,
      [now.toISOString(), days],
    ),
  );
  let queued = 0;
  for (const s of due) {
    const ends = new Date(s.current_period_end);
    const renewsOn = ends.toISOString().slice(0, 10);
    // Read the administrators and queue their notices in one transaction (the outbox rule).
    queued += await deps.db.system(async (q) => {
      const admins = await q.query<{ id: string }>(
        `select u.id from users u join roles r on r.id = u.role_id and r.org_id = u.org_id
          where u.org_id = $1 and u.status = 'active' and 'org.manage' = any(r.perms)`,
        [s.org_id],
      );
      const before = await q.query<{ n: number }>(`select count(*)::int as n from notifications where org_id = $1 and kind = 'renewal_notice'`, [s.org_id]);
      await enqueue(
        q,
        admins.map((a) => ({
          orgId: s.org_id,
          userId: a.id,
          kind: 'renewal_notice',
          data: { renewsOn, plan: s.plan, seats: s.seats ?? null },
          dedupeKey: `renewal:${s.id}:${renewsOn}:${a.id}`,
        })),
      );
      const after = await q.query<{ n: number }>(`select count(*)::int as n from notifications where org_id = $1 and kind = 'renewal_notice'`, [s.org_id]);
      return after[0].n - before[0].n;
    });
  }
  return queued;
}
