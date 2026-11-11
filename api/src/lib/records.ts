// Shared plumbing for accounts, records and tasks that may live in a CRM
// too: queueing local changes for the sync, and keeping rolled-up account
// fields ("open pipeline", "next close date") in step with the records.
import { SUPPORT_PROVIDERS } from '../../../shared/src/sync';
import type { AccountField } from '../../../shared/src/model';
import type { TargetKind } from '../../../shared/src/sync';
import { defer, type Deps } from '../context';
import type { Q } from '../db';

/**
 * Queues changes made here for every CRM that holds the item, and — for new
 * items — for every connection set up to create them there. `fields` are
 * local keys ("name", "owner", "f:renewal_date"…); null sends everything.
 * Runs inside the caller's transaction, so nothing is queued for a change
 * that does not commit.
 */
/** Sources that receive changes (support tools only read). */
const WRITABLE = `c.provider not in (${SUPPORT_PROVIDERS.map((p) => `'${p}'`).join(', ')})`;

export async function queueSync(
  q: Q,
  orgId: string,
  entity: TargetKind,
  ids: string[],
  fields: string[] | null,
  scope?: { typeKey?: string | null; boardId?: string | null; created?: boolean },
): Promise<number> {
  if (!ids.length) return 0;
  const merge = `on conflict (connection_id, entity, entity_id) do update set
      fields = case when sync_changes.fields is null or excluded.fields is null then null
                    else array(select distinct unnest(sync_changes.fields || excluded.fields)) end,
      changed_at = now(), next_at = now(), attempts = 0, last_error = null`;
  const linked = await q.query(
    `insert into sync_changes (org_id, connection_id, entity, entity_id, fields)
     select $1, l.connection_id, $2, l.entity_id, $4::text[]
       from sync_links l join connections c on c.id = l.connection_id
      where l.org_id = $1 and l.entity = $2 and l.entity_id = any($3::uuid[]) and not l.ignored
        and c.status = 'active' and c.kind = 'source' and c.config->'sync'->>'startedAt' is not null and ${WRITABLE}
     ${merge} returning id`,
    [orgId, entity, ids, fields],
  );
  let created: unknown[] = [];
  if (scope?.created) {
    created = await q.query(
      `insert into sync_changes (org_id, connection_id, entity, entity_id, fields)
       select $1, c.id, $2, i.id, null
         from connections c cross join unnest($3::uuid[]) as i(id)
        where c.org_id = $1 and c.status = 'active' and c.kind = 'source' and c.config->'sync'->>'startedAt' is not null and ${WRITABLE}
          and exists (select 1 from jsonb_array_elements(coalesce(c.config->'sync'->'objects', '[]'::jsonb)) o
                       where o->>'target' = $2 and (o->>'enabled')::boolean and (o->>'create')::boolean
                         and ($2 <> 'record' or o->>'typeKey' = $4)
                         and ($2 <> 'task' or o->>'boardId' = $5))
          and not exists (select 1 from sync_links l where l.connection_id = c.id and l.entity = $2 and l.entity_id = i.id)
       ${merge} returning id`,
      [orgId, entity, ids, scope.typeKey ?? '', scope.boardId ?? ''],
    );
  }
  return linked.length + created.length;
}

/** Sends queued changes after the response; the hourly run retries what fails. */
export function kickSync(deps: Deps, orgId: string) {
  defer(
    deps,
    import('../sync/engine').then((m) => m.pushOrg(deps, orgId)),
  );
}

/** Which local keys differ between two versions of an account or record. */
export function changedKeys(
  before: { name?: string; owner_id?: string | null; account_id?: string | null; parent_id?: string | null; fields?: Record<string, unknown> },
  after: typeof before,
): string[] {
  const out: string[] = [];
  if (before.name !== after.name) out.push('name');
  if ((before.owner_id ?? null) !== (after.owner_id ?? null)) out.push('owner');
  if ('account_id' in after && (before.account_id ?? null) !== (after.account_id ?? null)) out.push('account');
  if ('parent_id' in after && (before.parent_id ?? null) !== (after.parent_id ?? null)) out.push('parent');
  const a = before.fields ?? {};
  const b = after.fields ?? {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (k.startsWith('_')) continue;
    if (JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)) out.push(`f:${k}`);
  }
  return out;
}

/** Task keys the sync cares about: title, description, due date, first assignee, done, account. */
export function taskKeys(before: Record<string, any>, after: Record<string, any>, columns: { key: string; done: boolean }[]): string[] {
  const done = (s: string) => !!columns.find((c) => c.key === s)?.done;
  const out: string[] = [];
  if (before.title !== after.title) out.push('title');
  if ((before.description ?? '') !== (after.description ?? '')) out.push('description');
  if (String(before.due_date ?? '') !== String(after.due_date ?? '')) out.push('due');
  if ((before.assignee_ids?.[0] ?? null) !== (after.assignee_ids?.[0] ?? null)) out.push('assignee');
  if (done(before.status) !== done(after.status)) out.push('done');
  if ((before.account_id ?? null) !== (after.account_id ?? null)) out.push('account');
  return out;
}

/**
 * Recomputes rolled-up account fields from records, for the given accounts
 * (or all of them). One statement; accounts whose values did not change are
 * not touched. `q` may be the request role or owner access — the account
 * filter is explicit either way.
 */
export async function recomputeRollups(q: Q, orgId: string, accountFields: AccountField[], accountIds: (string | null)[] | null): Promise<void> {
  const rolls = accountFields.filter((f) => f.rollup);
  if (!rolls.length) return;
  const ids = accountIds ? [...new Set(accountIds.filter((x): x is string => !!x))] : null;
  if (ids && !ids.length) return;
  const types = await q.query<{ id: string; key: string; fields: AccountField[] }>('select id, key, fields from record_types where org_id = $1', [orgId]);
  const params: unknown[] = [orgId, ids];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const parts: string[] = [];
  for (const f of rolls) {
    const r = f.rollup!;
    const type = types.find((t) => t.key === r.type);
    if (!type) {
      parts.push(`${p(f.key)}::text, null::text`);
      continue;
    }
    const source = r.field ? type.fields.find((x) => x.key === r.field) : undefined;
    const where = [`r.type_id = ${p(type.id)}::uuid`, 'r.account_id = a.id', 'r.archived_at is null'];
    if (r.where) where.push(`r.fields->>${p(r.where.field)} = ${p(r.where.option)}`);
    let expr: string;
    if (r.fn === 'count' || !r.field) expr = 'count(*)';
    else {
      const raw = `r.fields->>${p(r.field)}`;
      const numeric = source?.type === 'number' || source?.type === 'money';
      const val = numeric ? `(case when jsonb_typeof(r.fields->${p(r.field)}) = 'number' then (${raw})::numeric end)` : raw;
      expr = `${r.fn}(${val})`;
    }
    parts.push(`${p(f.key)}::text, (select ${expr} from records r where ${where.join(' and ')})`);
  }
  const built = `jsonb_build_object(${parts.join(', ')})`;
  await q.query(
    `update accounts a set fields = a.fields || ${built}
      where a.org_id = $1 and ($2::uuid[] is null or a.id = any($2::uuid[]))
        and a.fields is distinct from (a.fields || ${built})`,
    params,
  );
}
