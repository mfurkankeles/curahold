// Version checks for customers (accounts) and records (migration 0051).
//
// Each row carries `version` and `field_versions` (per column, and per field as
// "f:<key>", the version that last changed it), kept by a trigger so every
// writer counts. A save that sends `baseVersion` (the version its editor
// started from) is refused only when something it changes was changed by
// someone else since and now holds another value than the one it sends; then
// the person sees the current value and decides. Edits to different fields
// merge. A save without `baseVersion` (the public API, the AI connector,
// automations, imports, CRM sync) keeps today's rule: what it sends is written.
import { fail } from './errors';

/** One thing a save changes: the version key it is tracked under, its name in the API, and the value it would get. */
export interface Write {
  key: string;
  name: string;
  next: unknown;
  current: unknown;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The API names of what this save would change that someone else changed since `base`. */
export function clashes(row: { [k: string]: any }, base: number, writes: Write[]): string[] {
  if (Number(row.version) === base) return [];
  const fv: Record<string, number> = row.field_versions ?? {};
  // A row older than versions (field_versions empty) knows nothing finer: every change since counts.
  const known = Object.keys(fv).length > 0;
  return writes.filter((w) => (known ? (fv[w.key] ?? 0) > base : true) && !same(w.next, w.current)).map((w) => w.name);
}

/** Refuses the save with 409, the current row (already shaped for this person) and what clashed. */
export function refuseClash(names: string[], current: unknown): void {
  if (names.length) fail('conflict', {}, { current, fields: names });
}

/** The writes of a `fields` patch: one per field key that is sent. */
export function fieldWrites(sent: Record<string, unknown> | undefined, now: Record<string, unknown> | null | undefined): Write[] {
  if (!sent) return [];
  return Object.keys(sent).map((k) => ({ key: `f:${k}`, name: `fields.${k}`, next: sent[k], current: now?.[k] }));
}
