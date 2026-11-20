// What a list already knows about a task, handed to the task panel when the task is opened,
// so the panel draws its title and key fields at once while the rest is read. A record's name is
// handed over the same way, so the record panel's heading is there at once — the card grows into
// it (lib/pageMotion.ts) without waiting for the record to load.
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

let lastRecord: { id: string; name: string } | null = null;

/** Called by a record card or line as it opens its record. */
export function seedRecord(id: string, name: string) {
  lastRecord = { id, name };
}

/** The record's name as the list knew it, if it is the one being opened (read, not taken: a development double render reads it twice). */
export function takeRecordSeed(id: string): string | null {
  return lastRecord && lastRecord.id === id ? lastRecord.name : null;
}
