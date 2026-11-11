// Repeating tasks: when one is done, its next copy is made right away (no
// scheduled job). The copy keeps the rhythm; the finished one lets it go,
// so moving it back and forth never makes two copies.
import type { Column } from '../../../shared/src/model';
import { nextDue } from '../../../shared/src/repeat';
import type { Q, Row } from '../db';
import { day } from './mappers';
import { onTaskCreated } from './taskEvents';

export async function spawnNext(q: Q, orgId: string, actorId: string | null, task: Row, board: Row, today: string): Promise<Row | null> {
  if (!task.repeat || task.parent_id) return null;
  const columns = board.columns as Column[];
  const first = columns.find((c) => !c.done) ?? columns[0];
  const due = nextDue(task.repeat, day(task.due_date), today);
  const [m] = await q.query('select coalesce(max(position), 0) + 1024 as p from tasks where board_id = $1 and status = $2', [task.board_id, first.key]);
  const [next] = await q.query(
    `insert into tasks (org_id, board_id, title, description, status, assignee_ids, account_id, due_date, priority, position, repeat, created_by, updated_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12) returning *`,
    [orgId, task.board_id, task.title, task.description ?? '', first.key, task.assignee_ids ?? [], task.account_id, due, task.priority, Number(m.p), JSON.stringify(task.repeat), actorId],
  );
  // The checklist comes back unticked.
  const subs = await q.query('select title, assignee_ids, priority, position from tasks where parent_id = $1 and archived_at is null order by position', [task.id]);
  for (const s of subs) {
    await q.query(
      `insert into tasks (org_id, board_id, parent_id, title, status, assignee_ids, priority, position, created_by, updated_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
      [orgId, task.board_id, next.id, s.title, first.key, s.assignee_ids ?? [], s.priority, s.position, actorId],
    );
  }
  await q.query('update tasks set repeat = null where id = $1', [task.id]);
  await onTaskCreated(q, orgId, actorId, next, board, { repeated: true });
  return next;
}
