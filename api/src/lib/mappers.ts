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
  accountId: r.account_id ?? null,
  accountName: r.account_name ?? null,
  dueDate: day(r.due_date),
  priority: r.priority,
  position: Number(r.position),
  version: Number(r.version),
  createdBy: r.created_by ?? null,
  createdAt: iso(r.created_at)!,
  updatedAt: iso(r.updated_at)!,
  ...(r.subtask_count != null ? { subtaskCount: Number(r.subtask_count), subtaskDone: Number(r.subtask_done ?? 0) } : {}),
  ...(r.comment_count != null ? { commentCount: Number(r.comment_count) } : {}),
  repeat: r.repeat ?? null,
  portalShared: !!r.portal_shared,
  portalAuthorId: r.portal_author_id ?? null,
  ...(r.portal_author_name !== undefined ? { portalAuthorName: r.portal_author_name ?? null } : {}),
  fields: r.fields ?? {},
  startDate: day(r.start_date),
  ...(r.blocked_by != null ? { blockedBy: Number(r.blocked_by) } : {}),
  recordId: r.record_id ?? null,
  ...(r.record_name !== undefined ? { recordName: r.record_name ?? null, recordType: r.record_type ?? null } : {}),
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
  notify: r.notify ?? [],
  portal: r.portal ?? null,
  taskFields: r.task_fields ?? [],
  form: r.form ?? null,
  archiveDays: r.archive_days ?? null,
});

export const toComment = (r: Row): Comment => ({
  id: r.id,
  taskId: r.task_id,
  authorId: r.author_id ?? null,
  body: r.body,
  mentions: r.mentions ?? [],
  createdAt: iso(r.created_at)!,
  visibility: r.visibility ?? 'internal',
  ...(r.portal_author_id ? { portalAuthorName: r.portal_author_name ?? null } : {}),
});

export const toFile = (r: Row): FileMeta => ({
  id: r.id,
  taskId: r.task_id ?? null,
  recordId: r.record_id ?? null,
  commentId: r.comment_id ?? r.record_comment_id ?? null,
  name: r.name,
  size: Number(r.size),
  mime: r.mime,
  uploadedBy: r.uploaded_by ?? null,
  createdAt: iso(r.created_at)!,
});

export { iso, day };
