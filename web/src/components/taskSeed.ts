// What a list already knows about a task, handed to the task panel when the task is opened,
// so the panel draws its title and key fields at once while the rest is read.
import type { Task } from '../../../shared/src/model';

let last: Task | null = null;

/** Called by a card or a row as it opens its task. */
export function seedTask(task: Task) {
  last = task;
}

/** The task as the list knew it, if it is the one being opened (taken once). */
export function takeSeed(id: string): Task | null {
  const t = last && last.id === id ? last : null;
  last = null;
  return t;
}
