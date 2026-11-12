// The trash: a copy of what is deleted is kept for 30 days and can be put
// back. The copying and the putting back are done by the database itself
// (db/migrations/0025_trash.sql); this is the thin layer the routes use.
import type { TrashItem, TrashKind, TrashRestored } from '../../../shared/src/model';
import type { Deps } from '../context';
import type { Q, Row } from '../db';
import { fail } from './errors';
import { iso } from './mappers';

/**
 * Keeps a copy of what is about to be deleted. Call it just before the delete,
 * in the same transaction; when the delete then removes nothing, fail() and
 * the copy is undone with everything else. Returns the id of the copy.
 */
export async function toTrash(q: Q, kind: TrashKind, ids: string[], label: string, where: TrashItem['where'] = {}): Promise<string | null> {
  if (!ids.length) return null;
  const [r] = await q.query<{ id: string | null }>('select app_trash_put($1, $2::uuid[], $3, $4::jsonb) as id', [kind, ids, label, JSON.stringify({ where })]);
  return r?.id ?? null;
}

const n = (x: unknown): number | undefined => (Number(x) > 0 ? Number(x) : undefined);

export function toTrashItem(r: Row): TrashItem {
  const parts = (r.detail?.parts ?? {}) as Record<string, number>;
  const links = (r.detail?.links ?? {}) as Record<string, number>;
  const count = (r.root_ids as string[]).length;
  const contents: TrashItem['contents'] = {
    subtasks: r.kind === 'task' ? n((parts.tasks ?? 0) - count) : undefined,
    comments: n((parts.comments ?? 0) + (parts.record_comments ?? 0)),
    files: n(parts.files),
    records: n((parts.records ?? 0) - (r.kind === 'record' ? count : 0)),
    entries: r.kind === 'activity' ? undefined : n(parts.activities),
    portalPeople: n(parts.portal_users),
    timeEntries: n(parts.time_entries),
    tasksLinked: n(links['tasks.account_id']),
  };
  for (const k of Object.keys(contents) as (keyof TrashItem['contents'])[]) if (contents[k] === undefined) delete contents[k];
  return {
    id: r.id,
    kind: r.kind,
    label: r.label,
    count,
    ids: (r.root_ids as string[]).slice(0, 100),
    where: r.detail?.where ?? {},
    contents,
    deletedBy: r.deleted_by ?? null,
    deletedAt: iso(r.deleted_at)!,
    purgeAt: iso(r.purge_at)!,
  };
}

/** Puts a copy back. The database's reasons for refusing become the API's own errors. */
export async function fromTrash(q: Q, id: string): Promise<TrashRestored & { accounts: string[] }> {
  let out: Row;
  try {
    [{ out }] = await q.query<{ out: Row }>('select app_trash_restore($1) as out', [id]);
  } catch (e) {
    return trashRefused(e);
  }
  return {
    kind: out.kind,
    ids: out.ids,
    label: out.label,
    where: out.detail?.where ?? {},
    already: !!out.already,
    dropped: out.dropped ?? {},
    unlinked: out.unlinked ?? [],
    accounts: out.accounts ?? [],
  };
}

/** The tables a copy can be waiting on, as the kinds people know them by. */
const KIND_OF: Record<string, TrashKind | 'record_type' | 'board'> = {
  accounts: 'account',
  records: 'record',
  tasks: 'task',
  activities: 'activity',
  record_types: 'record_type',
  boards: 'board',
};

export function trashRefused(e: unknown): never {
  const err = e as { code?: string; detail?: string } | null;
  let detail: Record<string, unknown> = {};
  try {
    detail = err?.detail ? JSON.parse(err.detail) : {};
  } catch {
    detail = {};
  }
  switch (err?.code) {
    case 'TR404':
      return fail('not_found');
    case 'TR403':
      return fail('forbidden');
    case 'TR424': {
      // What it belonged to is missing: in the trash itself (put that back first), or gone for good.
      const parent = KIND_OF[String(detail.table)] ?? 'other';
      const label = typeof detail.label === 'string' ? detail.label : null;
      return fail(label ? 'trash_parent_first' : 'trash_parent_gone', { name: label ?? '' }, { parent, parentLabel: label });
    }
    case 'TR409':
      return fail('trash_conflict', {}, { table: detail.table ?? null });
    default:
      throw e;
  }
}

/**
 * Removes for good what has been in the trash for its 30 days (or was sent on
 * its way by hand). Files leave storage first and the copies after, so a
 * failure in between leaves the copy for the next run rather than files with
 * nothing pointing at them. A file that is alive again (its row was put back
 * some other way) is never touched.
 */
export async function emptyTrash(deps: Deps, only?: string[]): Promise<number> {
  let done = 0;
  for (let round = 0; round < 50; round++) {
    const due = await deps.db.system((q) =>
      q.query<{ id: string; keys: string[] | null }>(
        `select t.id,
                (select array_agg(r.data->>'storage_key') from trash_rows r
                  where r.trash_id = t.id and r.data ? 'storage_key'
                    and not exists (select 1 from files f where f.id = (r.data->>'id')::uuid)) as keys
           from trash t
          where t.purge_at <= now() and ($1::uuid[] is null or t.id = any($1::uuid[]))
          order by t.purge_at limit 100`,
        [only ?? null],
      ),
    );
    if (!due.length) break;
    for (const e of due) for (const k of e.keys ?? []) await deps.storage.delete(k);
    await deps.db.system((q) => q.query('delete from trash where id = any($1::uuid[]) and purge_at <= now()', [due.map((e) => e.id)]));
    done += due.length;
    if (due.length < 100) break;
  }
  return done;
}
