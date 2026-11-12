// Keeping the health score: gathering its inputs, writing it into the
// customer's "health_score" field when it changes, the daily run (for the
// passing of time, and the snapshot behind trends), and picking up the
// customers marked by triggers right after a request.
import { computeHealth, DEFAULT_HEALTH, HEALTH_FIELD, healthConfig, type HealthConfig, type HealthInput, type HealthResult, type TouchKind } from '../../../shared/src/health';
import type { AccountField } from '../../../shared/src/model';
import type { Deps } from '../context';
import type { Q } from '../db';
import { localDate } from './automations';
import { queueSync } from './records';

const OPEN = `t.archived_at is null and b.archived_at is null
  and t.done_at is null`;

/** Inputs for the given customers (all of the company's when `ids` is null). Works under RLS or with owner access. */
export async function healthInputs(q: Q, orgId: string, ids: string[] | null, today: string): Promise<Map<string, HealthInput>> {
  const rows = await q.query(
    `select a.id, a.created_at, a.fields,
            act.at as act_at, act.kind as act_kind,
            (select max(t.done_at) from tasks t where t.org_id = a.org_id and t.account_id = a.id and t.archived_at is null) as task_at,
            (select count(*)::int from tasks t join boards b on b.id = t.board_id
              where t.org_id = a.org_id and t.account_id = a.id and t.due_date < $3::date and ${OPEN}) as overdue
       from accounts a
       left join lateral (select x.happened_at as at, x.kind from activities x where x.org_id = a.org_id and x.account_id = a.id
                           order by x.happened_at desc limit 1) act on true
      where a.org_id = $1 and a.archived_at is null and ($2::uuid[] is null or a.id = any ($2::uuid[]))`,
    [orgId, ids, today],
  );
  const [types] = await q.query(`select count(*)::int as n from record_types where org_id = $1 and kind = 'contact' and archived_at is null`, [orgId]);
  const contacts = new Map<string, HealthInput['contacts']>();
  if (types.n) {
    const list = await q.query(
      `select r.id, r.account_id, r.name, r.fields->>'stance' as stance, r.fields->>'decision' as decision
         from records r join record_types rt on rt.id = r.type_id
        where r.org_id = $1 and rt.kind = 'contact' and r.archived_at is null and r.account_id is not null
          and ($2::uuid[] is null or r.account_id = any ($2::uuid[]))
        order by lower(r.name)`,
      [orgId, ids],
    );
    for (const c of list) {
      const arr = contacts.get(c.account_id) ?? [];
      arr.push({ id: c.id, name: c.name, stance: c.stance, decision: c.decision });
      contacts.set(c.account_id, arr);
    }
  }
  const [ticketType] = await q.query(`select id from record_types where org_id = $1 and kind = 'ticket' and archived_at is null limit 1`, [orgId]);
  const tickets = new Map<string, { open: number; urgent: number }>();
  if (ticketType) {
    const list = await q.query(
      `select r.account_id, count(*)::int as open, count(*) filter (where r.fields->>'priority' = 'urgent')::int as urgent
         from records r where r.org_id = $1 and r.type_id = $2 and r.archived_at is null and r.account_id is not null
          and r.fields->>'status' in ('open', 'pending') and ($3::uuid[] is null or r.account_id = any ($3::uuid[]))
        group by r.account_id`,
      [orgId, ticketType.id, ids],
    );
    for (const t of list) tickets.set(t.account_id, { open: t.open, urgent: t.urgent });
  }
  const out = new Map<string, HealthInput>();
  for (const r of rows) {
    // A touch is contact with the customer: a logged call, meeting, email or
    // note. Where none was ever logged, the last finished task stands in.
    // Opening or editing a task is internal work and does not count.
    const act = r.act_at ? new Date(r.act_at) : null;
    const task = r.task_at ? new Date(r.task_at) : null;
    const useAct = !!act;
    const last = act ?? task;
    out.set(r.id, {
      createdAt: new Date(r.created_at).toISOString(),
      lastTouchAt: last ? last.toISOString() : null,
      lastTouchKind: last ? ((useAct ? r.act_kind : 'task') as TouchKind) : null,
      overdue: r.overdue,
      tickets: ticketType ? (tickets.get(r.id) ?? { open: 0, urgent: 0 }) : null,
      contacts: types.n ? (contacts.get(r.id) ?? []) : null,
      fields: r.fields ?? {},
    });
  }
  return out;
}

export async function orgHealth(q: Q, orgId: string): Promise<{ cfg: HealthConfig; defs: AccountField[]; timezone: string }> {
  const [o] = await q.query('select settings, account_fields, timezone from orgs where id = $1', [orgId]);
  return { cfg: healthConfig(o?.settings?.health ?? DEFAULT_HEALTH), defs: o?.account_fields ?? [], timezone: o?.timezone || 'UTC' };
}

export async function scoreAccounts(q: Q, orgId: string, ids: string[] | null, now: Date, override?: HealthConfig): Promise<Map<string, HealthResult>> {
  const { cfg, defs, timezone } = await orgHealth(q, orgId);
  const use = override ?? cfg;
  const inputs = await healthInputs(q, orgId, ids, localDate(now, timezone));
  const out = new Map<string, HealthResult>();
  for (const [id, input] of inputs) out.set(id, computeHealth(use, defs, input, now));
  return out;
}

/** Works the score out again and writes it where it changed. Returns how many changed. Owner access. */
export async function recomputeHealth(q: Q, orgId: string, ids: string[] | null, now: Date): Promise<number> {
  const { cfg, defs } = await orgHealth(q, orgId);
  if (!cfg.enabled || !defs.some((d) => d.health)) return 0;
  const scores = await scoreAccounts(q, orgId, ids, now);
  if (!scores.size) return 0;
  const idList = [...scores.keys()];
  const values = idList.map((id) => scores.get(id)!.score);
  const changed = await q.query<{ id: string }>(
    `update accounts a
        set fields = case when v.score is null then a.fields - '${HEALTH_FIELD}' else a.fields || jsonb_build_object('${HEALTH_FIELD}', v.score) end
       from unnest($2::uuid[], $3::int[]) as v(id, score)
      where a.org_id = $1 and a.id = v.id and (a.fields->'${HEALTH_FIELD}') is distinct from to_jsonb(v.score)
      returning a.id`,
    [orgId, idList, values],
  );
  // A score mapped to a CRM field goes there too.
  if (changed.length) await queueSync(q, orgId, 'account', changed.map((r) => r.id), [HEALTH_FIELD]);
  return changed.length;
}

/** Customers marked by triggers since the last pass. Called right after a request that changed something, and hourly. */
export async function flushHealth(deps: Deps, limit = 500): Promise<number> {
  const now = (deps.now ?? (() => new Date()))();
  const marked = await deps.db.system((q) =>
    q.query<{ org_id: string; account_id: string }>(
      `delete from health_dirty where (org_id, account_id) in (select org_id, account_id from health_dirty order by marked_at limit $1)
       returning org_id, account_id`,
      [limit],
    ),
  );
  if (!marked.length) return 0;
  const byOrg = new Map<string, string[]>();
  for (const m of marked) byOrg.set(m.org_id, [...(byOrg.get(m.org_id) ?? []), m.account_id]);
  let n = 0;
  for (const [orgId, ids] of byOrg) n += await deps.db.system((q) => recomputeHealth(q, orgId, ids, now));
  return n;
}

/** Once a day: time has passed for everyone, and today's score is kept for the trend. */
export async function dailyHealth(deps: Deps, now: Date): Promise<number> {
  const orgs = await deps.db.system((q) => q.query<{ id: string }>(`select id from orgs where coalesce((settings->'health'->>'enabled')::boolean, false)`));
  let n = 0;
  for (const o of orgs) {
    n += await deps.db.system(async (q) => {
      await recomputeHealth(q, o.id, null, now);
      const rows = await q.query(
        `insert into health_history (org_id, account_id, day, score)
         select a.org_id, a.id, $2::date, (a.fields->>'${HEALTH_FIELD}')::int from accounts a
          where a.org_id = $1 and a.archived_at is null and jsonb_typeof(a.fields->'${HEALTH_FIELD}') = 'number'
         on conflict (org_id, account_id, day) do update set score = excluded.score
         returning account_id`,
        [o.id, now.toISOString().slice(0, 10)],
      );
      await q.query(`delete from health_history where org_id = $1 and day < $2::date - 400`, [o.id, now.toISOString().slice(0, 10)]);
      return rows.length;
    });
  }
  return n;
}
