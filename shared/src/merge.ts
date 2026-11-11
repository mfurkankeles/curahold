// Three-way merge for a task edit that lost the race (HTTP 409).
//
//   base    — the task as the editor first loaded it
//   mine    — the fields this person changed
//   current — the task as someone else just saved it
//
// A field I changed that nobody else touched is re-applied on top of
// `current`. A field we both changed to different values is a real
// conflict: theirs is kept on screen and the field is reported, so the
// person can re-enter it — nothing is overwritten silently.
import type { Task } from './model';

export type EditableField = 'title' | 'description' | 'status' | 'assigneeIds' | 'accountId' | 'dueDate' | 'priority' | 'position' | 'repeat' | 'fields' | 'startDate';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function mergeTaskEdit(base: Task, mine: Partial<Pick<Task, EditableField>>, current: Task) {
  const reapply: Partial<Pick<Task, EditableField>> = {};
  const conflicts: EditableField[] = [];
  for (const [key, value] of Object.entries(mine) as [EditableField, unknown][]) {
    const theirsChanged = !same(base[key], current[key]);
    if (!theirsChanged) (reapply as Record<string, unknown>)[key] = value;
    else if (!same(current[key], value)) conflicts.push(key);
  }
  return { reapply, conflicts };
}
