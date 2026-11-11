// Saving a task edit without ever overwriting someone else's change.
import { mergeTaskEdit, type EditableField } from '../../../shared/src/merge';
import type { Task } from '../../../shared/src/model';
import { ApiFailure, patch } from './api';

export type TaskChanges = Partial<Pick<Task, EditableField>>;

export interface SaveResult {
  task: Task;
  /** Someone else changed the task first; our edit was merged on top. */
  merged: boolean;
  /** Fields both of us changed — theirs is kept, ours must be re-entered. */
  conflicts: EditableField[];
}

export async function saveTask(base: Task, changes: TaskChanges): Promise<SaveResult> {
  try {
    const r = await patch<{ task: Task }>(`/tasks/${base.id}`, { baseVersion: base.version, ...changes });
    return { task: r.task, merged: false, conflicts: [] };
  } catch (e) {
    if (!(e instanceof ApiFailure) || e.code !== 'conflict') throw e;
    const current = e.body.current as Task;
    const { reapply, conflicts } = mergeTaskEdit(base, changes, current);
    if (!Object.keys(reapply).length) return { task: current, merged: true, conflicts };
    const r = await patch<{ task: Task }>(`/tasks/${base.id}`, { baseVersion: current.version, ...reapply });
    return { task: r.task, merged: true, conflicts };
  }
}

/** A position between two neighbours (or at an end) for ordering cards. */
export function positionBetween(before?: number, after?: number): number {
  if (before === undefined && after === undefined) return 1024;
  if (before === undefined) return after! - 1024;
  if (after === undefined) return before + 1024;
  return (before + after) / 2;
}
