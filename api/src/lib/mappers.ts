import type { Board, Comment, FileMeta, Task } from '../../../shared/src/model';
import type { Row } from '../db';

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
const day = (v: unknown) => {
  if (v == null) return null;
  if (v instanceof Date) {
    // A DATE column read as midnight UTC: keep the calendar day.
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
  }
  return String(v).slice(0, 10);
};

export const toTask = (r: Row): Task => ({
  id: r.id,
  boardId: r.board_id,
  parentId: r.parent_id ?? null,
  title: r.title,
  description: r.description ?? '',
  status: r.status,
  assigneeIds: r.assignee_ids ?? [],
  partnerName: r.partner_name ?? null,
  dueDate: day(r.due_date),
  priority: r.priority,
  position: Number(r.position),
  version: Number(r.version),
  createdBy: r.created_by ?? null,
  createdAt: iso(r.created_at)!,
  updatedAt: iso(r.updated_at)!,
  ...(r.subtask_count != null ? { subtaskCount: Number(r.subtask_count), subtaskDone: Number(r.subtask_done ?? 0) } : {}),
  ...(r.comment_count != null ? { commentCount: Number(r.comment_count) } : {}),
});

export const toBoard = (r: Row, canManage: boolean): Board => ({
  id: r.id,
  name: r.name,
  visibility: r.visibility,
  teamId: r.team_id ?? null,
  columns: r.columns,
  memberIds: r.member_ids ?? [],
  createdBy: r.created_by ?? null,
  canManage,
});

export const toComment = (r: Row): Comment => ({
  id: r.id,
  taskId: r.task_id,
  authorId: r.author_id ?? null,
  body: r.body,
  mentions: r.mentions ?? [],
  createdAt: iso(r.created_at)!,
});

export const toFile = (r: Row): FileMeta => ({
  id: r.id,
  taskId: r.task_id,
  name: r.name,
  size: Number(r.size),
  mime: r.mime,
  uploadedBy: r.uploaded_by ?? null,
  createdAt: iso(r.created_at)!,
});

export { iso, day };
