// When the same task changed here and in the other tool since the last sync, the
// connection's rule picks one side (sync.conflict: the latest, the other tool's, or
// Curahold's). The other side's value is not thrown away: it is written into the
// task's history as a note, so anyone can see what was replaced and put it back.
// The same goes for an item deleted on one side while it was changed on the other.
import type { Q, Row } from '../db';
import { addEvent } from '../lib/history';
import { day } from '../lib/mappers';

export type ConflictCase = 'both' | 'deleted_there' | 'archived_here';

/** A task's own value for a synced field, in the vocabulary of the sync's patches. */
export function localValue(task: Row, field: string, columns: { key: string; done: boolean }[] | undefined): unknown {
  if (field.startsWith('f:')) return task.fields?.[field.slice(2)] ?? null;
  switch (field) {
    case 'title':
      return task.title ?? null;
    case 'description':
      return task.description ?? '';
    case 'due':
      return day(task.due_date);
    case 'assignee':
      return task.assignee_ids?.[0] ?? null;
    case 'stage':
      return task.status ?? null;
    case 'done':
      return !!columns?.find((c) => c.key === task.status)?.done;
    case 'issue_type':
      return task.issue_type ?? 'task';
    case 'story_points':
      return task.story_points == null ? null : Number(task.story_points);
    case 'epic':
      return task.epic_id ?? null;
    case 'sprint':
      return task.sprint_id ?? null;
    case 'account':
      return task.account_id ?? null;
    default:
      return null;
  }
}

/** A value as a person reads it in the history: a name instead of an id, a long text cut short. */
async function shown(q: Q, orgId: string, field: string, v: unknown, columns: { key: string; name: string }[] | undefined): Promise<unknown> {
  if (v == null || v === '') return null;
  const one = async (sql: string) => ((await q.query(sql, [v, orgId]))[0]?.n as string | undefined) ?? null;
  switch (field) {
    case 'assignee':
      return one('select name as n from users where id = $1 and org_id = $2');
    case 'epic':
      return one('select title as n from tasks where id = $1 and org_id = $2');
    case 'sprint':
      return one('select name as n from sprints where id = $1 and org_id = $2');
    case 'account':
      return one('select name as n from accounts where id = $1 and org_id = $2');
    case 'stage':
      return columns?.find((c) => c.key === v)?.name ?? String(v);
    case 'description':
      return String(v).slice(0, 1000);
    default:
      return typeof v === 'object' ? JSON.stringify(v).slice(0, 300) : v;
  }
}

/**
 * Writes the note. `kept` says which side the rule kept; each field carries the value that was kept and
 * the one that lost, both as a person reads them. Nothing is written when no field lost anything.
 */
export async function noteConflict(
  q: Q,
  input: { orgId: string; task: Row; app: string; case: ConflictCase; kept?: 'here' | 'there'; fields?: { field: string; kept: unknown; lost: unknown }[]; board?: Row | null },
): Promise<void> {
  const columns = input.board?.columns as { key: string; name: string }[] | undefined;
  const fields = [];
  for (const f of input.fields ?? []) {
    fields.push({ field: f.field, kept: await shown(q, input.orgId, f.field, f.kept, columns), lost: await shown(q, input.orgId, f.field, f.lost, columns) });
  }
  if (input.case === 'both' && !fields.length) return;
  await addEvent(q, input.orgId, input.task.id, null, 'sync_conflict', { case: input.case, app: input.app, ...(input.kept ? { kept: input.kept } : {}), ...(fields.length ? { fields } : {}) });
}
