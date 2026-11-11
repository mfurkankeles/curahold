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

/** People who follow a task (read inside the company, whatever the reader's own rows). */
async function watchersOf(q: Q, taskId: string): Promise<string[]> {
  const [{ ids }] = await q.query<{ ids: string[] }>('select app_task_watchers($1) as ids', [taskId]);
  return ids ?? [];
}

export async function onTaskUpdated(q: Q, orgId: string, actorId: string, before: Row, after: Row, board: Row) {
  const had = new Set<string>(before.assignee_ids ?? []);
  const list: NewNotification[] = (after.assignee_ids ?? [])
    .filter((u: string) => !had.has(u))
    .map((u: string) => ({ orgId, userId: u, kind: 'assigned', taskId: after.id, actorId }));
  const cols = board.columns as Column[];
  const finished = before.status !== after.status && isDone(cols, after.status) && !isDone(cols, before.status);
  if (!after.parent_id && finished) list.push(...boardPosts(orgId, board, 'done', after.id, actorId));
  if (before.status !== after.status) {
    // Followers hear where it went (assignees moved it themselves, or were given it above).
    const column = cols.find((c) => c.key === after.status)?.name ?? after.status;
    const told = new Set<string>([actorId, ...list.map((n) => n.userId).filter(Boolean)] as string[]);
    for (const u of await watchersOf(q, after.id)) {
      if (!told.has(u)) list.push({ orgId, userId: u, kind: 'followed', taskId: after.id, actorId, data: { what: 'status', column } });
    }
  }
  if (finished) {
    // What was waiting for this task can start now: its people are told.
    const waiting = await q.query(
      `select t.id, t.assignee_ids from task_links l join tasks t on t.id = l.to_id join boards b on b.id = t.board_id
        where l.from_id = $1 and l.kind = 'blocks' and t.archived_at is null
          and not exists (select 1 from jsonb_array_elements(b.columns) col where col->>'key' = t.status and (col->>'done')::boolean)`,
      [after.id],
    );
    for (const w of waiting) {
      for (const u of (w.assignee_ids ?? []) as string[]) {
        if (u !== actorId) list.push({ orgId, userId: u, kind: 'unblocked', taskId: w.id, actorId, data: { blocker: after.title } });
      }
    }
  }
  await enqueue(q, list);
}

export async function onComment(q: Q, orgId: string, actorId: string, task: Row, body: string, mentions: string[]) {
  const excerpt = body.replace(/@\[([^\]]+)\]\([0-9a-f-]{36}\)/g, '@$1').slice(0, 280);
  const mentioned = new Set(mentions);
  const list: NewNotification[] = [...mentioned].map((u) => ({ orgId, userId: u, kind: 'mentioned', taskId: task.id, actorId, data: { excerpt } }));
  const [{ muted }] = await q.query<{ muted: string[] }>('select app_task_muted($1) as muted', [task.id]);
  const assignees = new Set<string>((task.assignee_ids ?? []) as string[]);
  for (const u of assignees) {
    if (!mentioned.has(u) && !(muted ?? []).includes(u)) list.push({ orgId, userId: u, kind: 'comment', taskId: task.id, actorId, data: { excerpt } });
  }
  for (const u of await watchersOf(q, task.id)) {
    if (u !== actorId && !mentioned.has(u) && !assignees.has(u) && !(muted ?? []).includes(u)) list.push({ orgId, userId: u, kind: 'followed', taskId: task.id, actorId, data: { what: 'comment', excerpt } });
  }
  await enqueue(q, list);
}

export { isDone };
