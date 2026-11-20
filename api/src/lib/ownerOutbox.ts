// What the console sends to the owner himself: the weekly CEO summary by
// e-mail and alerts to his phones (Web Push). The owner is not a user of any
// company, so the companies' notification outbox (lib/notify.ts) cannot carry
// it; this is the same idea on his own table (owner_outbox, migration 0252):
// a row written in the transaction that caused it, with a unique key so a
// repeat is a no-op, sent after it commits and retried a few times.
// Also the owner's own console settings for these (language, summary on/off).
import type { OwnerOutboxRow, OwnerPushDevicesRow } from '../db/rows.gen';
import { isOwnerLocale, type CeoSummarySettings } from '../../../shared/src/ownerPlan';
import { defer, type Deps } from '../context';
import type { Q } from '../db';
import { sendPush } from './webpush';

const MAX_ATTEMPTS = 5;

// ------------------------------------------------------------ the owner's settings

export const OWNER_SETTING_DEFAULTS: CeoSummarySettings = { enabled: true, locale: 'tr' };

/** The owner's own settings for what the console sends him (console_settings `ceoSummary.enabled`, `owner.locale`). */
export async function ownerMailSettings(q: Q): Promise<CeoSummarySettings> {
  const rows = await q.query<{ key: string; value: unknown }>(`select key, value from console_settings where key in ('ceoSummary.enabled', 'owner.locale')`);
  const out = { ...OWNER_SETTING_DEFAULTS };
  for (const r of rows) {
    if (r.key === 'ceoSummary.enabled' && typeof r.value === 'boolean') out.enabled = r.value;
    if (r.key === 'owner.locale' && isOwnerLocale(r.value)) out.locale = r.value;
  }
  return out;
}

/** Writes one console setting (any JSON value) with who changed it. */
export async function writeConsoleSetting(q: Q, key: string, value: unknown, by: string) {
  await q.query(
    `insert into console_settings (key, value, updated_by) values ($1, $2::jsonb, $3)
     on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
    [key, JSON.stringify(value), by],
  );
}

// ------------------------------------------------------------ queueing

export interface OwnerMail {
  to: string;
  subject: string;
  text: string;
}
export interface OwnerPush {
  title: string;
  body: string;
  /** Where a tap opens, inside the console (a path such as "/?s=approvals"). */
  url: string;
  urgency: 'normal' | 'high';
}

/** Queues one message in the caller's transaction; false when its key was queued before (nothing new). */
export async function queueOwner(q: Q, kind: 'mail' | 'push', key: string, payload: OwnerMail | OwnerPush): Promise<boolean> {
  const rows = await q.query<Pick<OwnerOutboxRow, 'id'>>(`insert into owner_outbox (kind, dedupe_key, payload) values ($1, $2, $3) on conflict (dedupe_key) do nothing returning id`, [
    kind,
    key.slice(0, 200),
    JSON.stringify(payload),
  ]);
  return rows.length > 0;
}

/**
 * Tells the owner's phones, once per key and in his language, when push is set up and he has added a phone; sends
 * right after. Never
 * throws: an alert about something else must not fail because a phone could not be told. The text stays short
 * and carries no customer content beyond a company name (it is encrypted end to end, but kept lean anyway).
 */
export async function pushToOwner(deps: Deps, key: string, make: (locale: 'tr' | 'en') => OwnerPush): Promise<boolean> {
  if (!deps.config.push) return false;
  try {
    const queued = await deps.db.system(async (q) => {
      const [d] = await q.query<{ n: number }>(`select count(*)::int as n from owner_push_devices`);
      if (!(Number(d?.n) > 0)) return false;
      return queueOwner(q, 'push', key, make((await ownerMailSettings(q)).locale));
    });
    if (queued) defer(deps, drainOwnerOutbox(deps));
    return queued;
  } catch (e) {
    console.error('[curahold] owner push not queued', e instanceof Error ? e.message : String(e));
    return false;
  }
}

// ------------------------------------------------------------ sending

/**
 * Sends one push to every phone; forgets phones their browser gave up, counts failures on the others. `tag` is the
 * alert's own key: the phone replaces a notification only by one with the same tag, so two different alerts that
 * open the same screen (two system alerts both on /system) both stay on the lock screen.
 */
async function sendToPhones(deps: Deps, push: OwnerPush, tag: string): Promise<{ state: 'sent' | 'pending' | 'failed' | 'skipped'; error: string | null }> {
  const vapid = deps.config.push;
  if (!vapid) return { state: 'skipped', error: 'push not configured' };
  const devices = await deps.db.system((q) => q.query<Pick<OwnerPushDevicesRow, 'id' | 'endpoint' | 'p256dh' | 'auth'>>(`select id, endpoint, p256dh, auth from owner_push_devices order by created_at limit 20`));
  if (!devices.length) return { state: 'skipped', error: 'no phone' };
  const fetcher = deps.fetch ?? fetch;
  let sent = 0;
  let retry = false;
  let error: string | null = null;
  for (const d of devices) {
    const out = await sendPush(fetcher, vapid, d, { title: push.title, body: push.body, url: push.url, tag: tag.slice(0, 64) }, { urgency: push.urgency, ttl: push.urgency === 'high' ? 6 * 3600 : 24 * 3600 }).catch(
      (e) => ({ state: 'retry' as const, status: 0, error: e instanceof Error ? e.message : String(e) }),
    );
    if (out.state === 'sent') {
      sent++;
      await deps.db.system((q) => q.query(`update owner_push_devices set last_ok_at = now(), failures = 0 where id = $1`, [d.id]));
    } else if (out.state === 'gone') {
      await deps.db.system((q) => q.query(`delete from owner_push_devices where id = $1`, [d.id]));
    } else {
      retry ||= out.state === 'retry';
      error = out.error;
      await deps.db.system((q) => q.query(`update owner_push_devices set failures = failures + 1 where id = $1`, [d.id]));
    }
  }
  return sent ? { state: 'sent', error: null } : { state: retry ? 'pending' : devices.length ? 'failed' : 'skipped', error };
}

/** How long a claimed row stays out of other drains' reach while it is being sent (see drainOwnerOutbox). */
const LEASE_MINUTES = 10;

/**
 * Sends what waits in the owner's outbox (the hourly job, and right after an alert is queued). The claim takes a
 * lease: it pushes `not_before` ten minutes ahead in the same statement. SKIP LOCKED alone is not enough, because
 * the claim commits before anything is sent, so its row lock is gone while the mail or push is on its way; without
 * the lease a second drain started in that window (two alerts a moment apart, the hourly job overlapping a test
 * send) would claim the same pending row and send it again. The update after sending replaces the lease: null when
 * sent or given up, the back-off when it should be tried again. A drain that dies mid-send leaves the row to be
 * retried when the lease runs out.
 */
export async function drainOwnerOutbox(deps: Deps, limit = 20): Promise<number> {
  const claimed = await deps.db.system((q) =>
    q.query<OwnerOutboxRow>(
      `update owner_outbox set attempts = attempts + 1, not_before = now() + make_interval(mins => ${LEASE_MINUTES})
        where id in (select id from owner_outbox where state = 'pending' and attempts < $2 and (not_before is null or not_before <= now())
                      order by created_at limit $1 for update skip locked)
        returning *`,
      [limit, MAX_ATTEMPTS],
    ),
  );
  for (const row of claimed) {
    let state: 'sent' | 'pending' | 'failed' | 'skipped' = 'sent';
    let error: string | null = null;
    try {
      if (row.kind === 'mail') {
        const m = row.payload as unknown as OwnerMail;
        await deps.email.send({ to: m.to, subject: m.subject, text: m.text });
      } else ({ state, error } = await sendToPhones(deps, row.payload as unknown as OwnerPush, row.dedupe_key));
    } catch (e) {
      state = 'pending';
      error = e instanceof Error ? e.message : String(e);
    }
    if (state === 'pending' && row.attempts >= MAX_ATTEMPTS) state = 'failed';
    await deps.db.system((q) =>
      q.query(
        `update owner_outbox set state = $2, error = $3, sent_at = case when $2 = 'sent' then now() else sent_at end,
                not_before = case when $2 = 'pending' then now() + make_interval(mins => 5 * attempts) else null end where id = $1`,
        [row.id, state, error?.slice(0, 500) ?? null],
      ),
    );
  }
  return claimed.length;
}

/**
 * The owner's address for what the console sends him: PLATFORM_OWNER, or the first support-staff address — the same
 * rule as the console's own owner check (team/gate.ts consoleOwner), repeated here so lib/ does not import team/.
 */
export const ownerAddress = (deps: Pick<Deps, 'config'>): string | null => (deps.config.owner ?? deps.config.support?.staff?.[0] ?? '').toLowerCase() || null;
