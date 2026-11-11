// What happens around a task change: who is told, which channel hears
// about it. Called inside the same transaction as the change itself.
import type { BoardNotify, Column } from '../../../shared/src/model';
import type { Q, Row } from '../db';
import { enqueue, type NewNotification } from './notify';

const isDone = (columns: Column[], status: string) => columns.some((c) => c.key === status && c.done);

function boardPosts(orgId: string, board: Row, event: 'created' | 'done', taskId: string, actorId: string | null): NewNotification[] {
  return ((board.notify ?? []) as BoardNotify[])
    .filter((n) => n.events.includes(event))
    .map((n) => ({ orgId, connectionId: n.connectionId, channel: n.channel, kind: `board_${event}`, taskId, actorId }));
}

export async function onTaskCreated(q: Q, orgId: string, actorId: string | null, task: Row, board: Row, extra: Record<string, unknown> = {}) {
  const list: NewNotification[] = (task.assignee_ids ?? []).map((u: string) => ({
    orgId,
    userId: u,
    kind: 'assigned',
    taskId: task.id,
    actorId,
    data: extra,
  }));
  if (!task.parent_id) list.push(...boardPosts(orgId, board, 'created', task.id, actorId));
  await enqueue(q, list);
}

export async function onTaskUpdated(q: Q, orgId: string, actorId: string, before: Row, after: Row, board: Row) {
  const had = new Set<string>(before.assignee_ids ?? []);
  const list: NewNotification[] = (after.assignee_ids ?? [])
    .filter((u: string) => !had.has(u))
    .map((u: string) => ({ orgId, userId: u, kind: 'assigned', taskId: after.id, actorId }));
  const cols = board.columns as Column[];
  if (!after.parent_id && before.status !== after.status && isDone(cols, after.status) && !isDone(cols, before.status)) {
    list.push(...boardPosts(orgId, board, 'done', after.id, actorId));
  }
  await enqueue(q, list);
}

export async function onComment(q: Q, orgId: string, actorId: string, task: Row, body: string, mentions: string[]) {
  const excerpt = body.replace(/@\[([^\]]+)\]\([0-9a-f-]{36}\)/g, '@$1').slice(0, 280);
  const mentioned = new Set(mentions);
  const list: NewNotification[] = [...mentioned].map((u) => ({ orgId, userId: u, kind: 'mentioned', taskId: task.id, actorId, data: { excerpt } }));
  for (const u of (task.assignee_ids ?? []) as string[]) {
    if (!mentioned.has(u)) list.push({ orgId, userId: u, kind: 'comment', taskId: task.id, actorId, data: { excerpt } });
  }
  await enqueue(q, list);
}

export { isDone };
