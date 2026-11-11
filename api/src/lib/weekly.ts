// The weekly summary: on Monday, at the hour a person chose for their
// morning summary, what changed in their portfolio — renewals coming up,
// customers whose health score fell (and the main reason), customers gone
// quiet, and the week's work. It goes to the chat app the company already
// uses, email only as the fallback, and is skipped when there is nothing to say.
import { HEALTH_FIELD } from '../../../shared/src/health';
import type { AccountField } from '../../../shared/src/model';
import type { Deps } from '../context';
import type { Q } from '../db';
import { localDate, localHour } from './automations';
import { scoreAccounts } from './health';
import { enqueue, prefsOf } from './notify';

const ITEMS = 5;
const DROP = 10;

const OPEN = `t.archived_at is null and b.archived_at is null
  and not exists (select 1 from jsonb_array_elements(b.columns) col where col->>'key' = t.status and (col->>'done')::boolean)`;

function money(n: number | null, currency: string, locale: string) {
  if (n === null) return null;
  try {
    return new Intl.NumberFormat(locale === 'tr' ? 'tr-TR' : 'en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return String(n);
  }
}

/** Which customers a person's summary covers: their own; for a team lead with none of their own, their teams'. */
async function portfolioOf(q: Q, orgId: string, userId: string): Promise<string[]> {
  const own = await q.query<{ id: string }>(`select id from accounts where org_id = $1 and owner_id = $2 and archived_at is null`, [orgId, userId]);
  if (own.length) return own.map((r) => r.id);
  const team = await q.query<{ id: string }>(
    `select a.id from accounts a
      where a.org_id = $1 and a.archived_at is null and (
        a.team_id in (select id from teams where org_id = $1 and lead_id = $2)
        or a.owner_id in (select tm.user_id from team_members tm join teams t on t.id = tm.team_id where t.org_id = $1 and t.lead_id = $2))`,
    [orgId, userId],
  );
  return team.map((r) => r.id);
}

export async function buildWeekly(q: Q, orgId: string, userId: string, now: Date, locale: string) {
  const [org] = await q.query('select account_fields, currency, timezone from orgs where id = $1', [orgId]);
  const defs = (org.account_fields ?? []) as AccountField[];
  const ids = await portfolioOf(q, orgId, userId);
  if (!ids.length) return null;
  const today = localDate(now, org.timezone || 'UTC');
  const renewal = defs.find((f) => f.key === 'renewal_date') ?? defs.find((f) => f.type === 'date' && /renew|yenile/i.test(`${f.key} ${f.label.en ?? ''} ${f.label.tr ?? ''}`));
  const value = defs.find((f) => f.type === 'money' && !f.rollup);

  const renewals = renewal
    ? await q.query(
        `select id, name, fields->>$3 as due,
                (case when $4::text is not null and jsonb_typeof(fields->$4) = 'number' then (fields->>$4)::numeric end) as amount
           from accounts where org_id = $1 and id = any ($2::uuid[]) and fields->>$3 ~ '^\\d{4}-\\d{2}-\\d{2}$'
            and (fields->>$3)::date between $5::date and $5::date + 30
          order by (fields->>$3)::date`,
        [orgId, ids, renewal.key, value?.key ?? null, today],
      )
    : [];

  // Health: now against a week ago, with the signal that cost the most points.
  const drops: { id: string; name: string; from: number; to: number; reason: Record<string, unknown> | null }[] = [];
  if (defs.some((f) => f.health)) {
    const rows = await q.query(
      `select a.id, a.name, (a.fields->>'${HEALTH_FIELD}')::int as now_score,
              (select h.score from health_history h where h.org_id = a.org_id and h.account_id = a.id and h.day <= $3::date - 7 order by h.day desc limit 1) as before
         from accounts a where a.org_id = $1 and a.id = any ($2::uuid[]) and jsonb_typeof(a.fields->'${HEALTH_FIELD}') = 'number'`,
      [orgId, ids, today],
    );
    const fell = rows.filter((r) => r.before !== null && r.before - r.now_score >= DROP).sort((x, y) => y.before - y.now_score - (x.before - x.now_score));
    const why = fell.length ? await scoreAccounts(q, orgId, fell.map((r) => r.id), now) : new Map();
    for (const r of fell) {
      const parts = (why.get(r.id)?.parts ?? []).filter((p: any) => p.points !== null && p.share > 0);
      const worst = parts.sort((x: any, y: any) => y.share - y.earned - (x.share - x.earned))[0];
      drops.push({ id: r.id, name: r.name, from: r.before, to: r.now_score, reason: worst && worst.share > worst.earned ? { key: worst.key, ...worst.detail } : null });
    }
  }

  const quiet = await q.query(
    `select a.id, a.name from accounts a
      where a.org_id = $1 and a.id = any ($2::uuid[])
        and coalesce((select max(x) from (select max(greatest(t.updated_at, t.created_at)) as x from tasks t where t.account_id = a.id
                      union all select max(v.happened_at) from activities v where v.account_id = a.id) l), a.created_at) < now() - interval '30 days'
      order by lower(a.name)`,
    [orgId, ids],
  );
  const [work] = await q.query(
    `select (select count(*)::int from tasks t where t.org_id = $1 and t.account_id = any ($2::uuid[]) and t.done_at > now() - interval '7 days') as done,
            (select count(*)::int from tasks t join boards b on b.id = t.board_id
              where t.org_id = $1 and $3 = any (t.assignee_ids) and t.due_date < $4::date and ${OPEN}) as overdue`,
    [orgId, ids, userId, today],
  );
  const [support] = await q.query(
    `select count(*)::int as open, count(*) filter (where r.fields->>'priority' = 'urgent')::int as urgent
       from records r join record_types rt on rt.id = r.type_id
      where r.org_id = $1 and rt.kind = 'ticket' and r.archived_at is null and r.account_id = any ($2::uuid[]) and r.fields->>'status' in ('open', 'pending')`,
    [orgId, ids],
  );
  if (!renewals.length && !drops.length && !quiet.length && !work.done && !work.overdue && !support.open) return null;
  const total = renewals.reduce((n, r) => n + (r.amount === null ? 0 : Number(r.amount)), 0);
  return {
    accounts: ids.length,
    renewals: renewals.slice(0, ITEMS).map((r) => ({ id: r.id, name: r.name, due: r.due, amount: money(r.amount === null ? null : Number(r.amount), org.currency, locale) })),
    renewalCount: renewals.length,
    renewalTotal: value ? money(total, org.currency, locale) : null,
    drops: drops.slice(0, ITEMS),
    dropCount: drops.length,
    quiet: quiet.slice(0, ITEMS).map((r) => ({ id: r.id, name: r.name })),
    quietCount: quiet.length,
    done: work.done,
    overdue: work.overdue,
    tickets: support.open,
    urgentTickets: support.urgent,
  };
}

/** Hourly: whoever's Monday morning hour it is gets their summary (once per week). */
export async function sendWeekly(deps: Deps, now: Date): Promise<number> {
  const orgs = await deps.db.system((q) => q.query('select id, timezone, locale from orgs'));
  let queued = 0;
  for (const org of orgs) {
    const tz = org.timezone || 'UTC';
    const today = localDate(now, tz);
    if (new Date(`${today}T12:00:00Z`).getUTCDay() !== 1) continue;
    const hour = localHour(now, tz);
    const users = await deps.db.system((q) => q.query(`select id, prefs, locale from users where org_id = $1 and status = 'active'`, [org.id]));
    for (const u of users) {
      const prefs = prefsOf(u.prefs);
      if (prefs.events.weekly === false || prefs.digestHour !== hour || prefs.channel === 'none') continue;
      const data = await deps.db.system((q) => buildWeekly(q, org.id, u.id, now, u.locale ?? org.locale ?? 'en'));
      if (!data) continue;
      await deps.db.system((q) => enqueue(q, [{ orgId: org.id, userId: u.id, kind: 'weekly', dedupeKey: `weekly:${u.id}:${today}`, data }]));
      queued++;
    }
  }
  return queued;
}
