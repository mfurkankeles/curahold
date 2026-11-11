// A task's history: one line per change, written in the same transaction
// as the change, so "who moved this, and when?" always has an answer.
import type { Q, Row } from '../db';
import { day } from './mappers';

export async function addEvent(q: Q, orgId: string, taskId: string, actorId: string | null, kind: string, data: Record<string, unknown> = {}) {
  await q.query('insert into task_events (org_id, task_id, actor_id, kind, data) values ($1, $2, $3, $4, $5)', [orgId, taskId, actorId, kind, JSON.stringify(data)]);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Writes what changed between two versions of a task row. */
export async function recordChanges(q: Q, orgId: string, actorId: string | null, before: Row, after: Row) {
  const id = after.id;
  if (before.title !== after.title) await addEvent(q, orgId, id, actorId, 'title', { from: before.title, to: after.title });
  if (before.status !== after.status) await addEvent(q, orgId, id, actorId, 'status', { from: before.status, to: after.status });
  const had = new Set<string>(before.assignee_ids ?? []);
  const has = new Set<string>(after.assignee_ids ?? []);
  const added = [...has].filter((u) => !had.has(u));
  const removed = [...had].filter((u) => !has.has(u));
  if (added.length || removed.length) await addEvent(q, orgId, id, actorId, 'assignees', { added, removed });
  if (day(before.due_date) !== day(after.due_date)) await addEvent(q, orgId, id, actorId, 'due', { from: day(before.due_date), to: day(after.due_date) });
  if (day(before.start_date) !== day(after.start_date)) await addEvent(q, orgId, id, actorId, 'start', { from: day(before.start_date), to: day(after.start_date) });
  if (before.priority !== after.priority) await addEvent(q, orgId, id, actorId, 'priority', { from: before.priority, to: after.priority });
  if ((before.account_id ?? null) !== (after.account_id ?? null)) {
    const name = async (accountId: string | null, known: unknown) =>
      known !== undefined ? (known as string | null) : accountId ? ((await q.query('select name from accounts where id = $1', [accountId]))[0]?.name ?? null) : null;
    await addEvent(q, orgId, id, actorId, 'account', { from: await name(before.account_id ?? null, before.account_name), to: await name(after.account_id ?? null, after.account_name) });
  }
  if ((before.description ?? '') !== (after.description ?? '')) await addEvent(q, orgId, id, actorId, 'description');
  const fb = (before.fields ?? {}) as Record<string, unknown>;
  const fa = (after.fields ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(fb), ...Object.keys(fa)])].filter((k) => !same(fb[k], fa[k]));
  if (keys.length) await addEvent(q, orgId, id, actorId, 'fields', { keys, to: Object.fromEntries(keys.map((k) => [k, fa[k] ?? null])) });
  if (!same(before.repeat, after.repeat)) await addEvent(q, orgId, id, actorId, 'repeat', { to: after.repeat ?? null });
}
