// Who sees and who changes each field. One set of rules, used by every
// place that returns or accepts field values (lists, one customer, records,
// imports, pages), so a hidden field never leaks through a side door.
import { calculated, type AccountField, type Perm } from '../../../shared/src/model';
import type { AuthCtx } from '../context';
import { fail } from './errors';

export type Viewer = Pick<AuthCtx, 'roleKey' | 'perms' | 'seat'>;

/** People who run the company settings see and change every field (they set the rules). */
export const seesEverything = (v: Viewer) => v.perms.includes('org.manage' as Perm);

export function canSeeField(f: AccountField, v: Viewer) {
  if (seesEverything(v)) return true;
  const view = f.access?.view;
  return !view?.length || view.includes(v.roleKey);
}

export function canEditField(f: AccountField, v: Viewer) {
  if (!canSeeField(f, v)) return false;
  if (calculated(f)) return false;
  if (seesEverything(v)) return true;
  const edit = f.access?.edit;
  return !edit?.length || edit.includes(v.roleKey);
}

/** The field list as this person should get it: hidden ones left out, read-only ones marked. */
export function defsFor(defs: AccountField[], v: Viewer): AccountField[] {
  const all = seesEverything(v);
  return (defs ?? [])
    .filter((f) => canSeeField(f, v))
    .map((f) => {
      const { access, locked: _l, ...rest } = f;
      const out: AccountField = all ? { ...rest, ...(access ? { access } : {}) } : rest;
      if (!canEditField(f, v) && !calculated(f)) out.locked = true;
      return out;
    });
}

export function hiddenKeys(defs: AccountField[], v: Viewer): Set<string> {
  return new Set((defs ?? []).filter((f) => !canSeeField(f, v)).map((f) => f.key));
}

/** Field values without the ones this person may not see. */
export function stripFields<T extends Record<string, unknown>>(fields: T, hidden: Set<string>): T {
  if (!hidden.size || !fields) return fields;
  return Object.fromEntries(Object.entries(fields).filter(([k]) => !hidden.has(k))) as T;
}

/** Keys whose value would actually change (empty and missing count as the same). */
export function changedFieldKeys(before: Record<string, unknown> | null | undefined, next: Record<string, unknown>) {
  const norm = (v: unknown) => (v === undefined || v === '' ? null : v);
  return Object.keys(next).filter((k) => norm(next[k]) !== norm(before?.[k]));
}

/** Refuses a change to a field this person may not change. */
export function checkEditable(defs: AccountField[], keys: string[], v: Viewer) {
  for (const k of keys) {
    const f = (defs ?? []).find((d) => d.key === k);
    if (f && !calculated(f) && !canEditField(f, v)) fail(canSeeField(f, v) ? 'field_locked' : 'validation', { field: k }, { fields: [`fields.${k}`] });
  }
}

/**
 * Saving a field list sent by someone who does not run the company
 * settings: keep the fields they cannot see, and keep every field's
 * access rules as they were (only administrators change those).
 */
export function mergeDefs(before: AccountField[], sent: AccountField[], v: Viewer): AccountField[] {
  const clean = (f: AccountField) => {
    const { locked: _l, ...rest } = f;
    return rest as AccountField;
  };
  if (seesEverything(v)) return sent.map(clean);
  const prev = new Map((before ?? []).map((f) => [f.key, f]));
  const hidden = (before ?? []).filter((f) => !canSeeField(f, v));
  const hiddenSet = new Set(hidden.map((f) => f.key));
  const kept = sent
    .filter((f) => !hiddenSet.has(f.key))
    .map((f) => {
      const { access: _a, ...rest } = clean(f);
      const old = prev.get(f.key);
      return old?.access ? { ...rest, access: old.access } : rest;
    });
  return [...kept, ...hidden];
}
