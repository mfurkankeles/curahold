// A board's own task fields, checking what people put in them, and the
// fields that must be filled before a task can be finished.
import { z } from 'zod';
import { normalizeValue } from '../../../shared/src/fields';
import { OPTION_COLORS, TASK_FIELD_TYPES, type AccountField, type TaskField, type TaskFieldValue } from '../../../shared/src/model';
import type { Q } from '../db';
import { fail } from './errors';

const label = z.object({ en: z.string().trim().max(80).optional(), tr: z.string().trim().max(80).optional() }).refine((l) => !!(l.en || l.tr));

export const taskFieldsSchema = z
  .array(
    z.object({
      key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
      label,
      type: z.enum(TASK_FIELD_TYPES),
      options: z
        .array(z.object({ key: z.string().regex(/^[a-z0-9_]{1,40}$/), label, color: z.enum(OPTION_COLORS).optional() }))
        .max(100)
        .optional(),
      required: z.enum(['done']).nullable().optional(),
    }),
  )
  .max(20)
  .refine((list) => new Set(list.map((f) => f.key)).size === list.length, 'duplicate field keys')
  .refine((list) => list.every((f) => f.type !== 'select' || (f.options?.length ?? 0) > 0), 'a choice field needs options');

export const empty = (v: unknown) => v === null || v === undefined || v === '' || v === false;

/** Checks values against the board's fields; returns the cleaned values. People must be members of the company. */
export async function cleanTaskFields(q: Q, defs: TaskField[], input: Record<string, unknown>, locale: 'en' | 'tr') {
  const out: Record<string, TaskFieldValue> = {};
  const bad: string[] = [];
  for (const [k, v] of Object.entries(input)) {
    const def = defs.find((d) => d.key === k);
    if (!def) {
      bad.push(k);
      continue;
    }
    if (v === null || v === undefined || v === '') {
      out[k] = null;
      continue;
    }
    if (def.type === 'checkbox') {
      if (typeof v !== 'boolean') bad.push(k);
      else out[k] = v;
      continue;
    }
    if (def.type === 'person') {
      const id = String(v);
      const ok = /^[0-9a-f-]{36}$/i.test(id) && (await q.query(`select 1 from users where id = $1 and status <> 'deleted'`, [id])).length > 0;
      if (!ok) bad.push(k);
      else out[k] = id;
      continue;
    }
    const r = normalizeValue(def as unknown as AccountField, v, locale);
    if ('error' in r) bad.push(k);
    else out[k] = r.value as TaskFieldValue;
  }
  if (bad.length) fail('validation', { fields: bad.join(', ') }, { fields: bad.map((b) => `fields.${b}`) });
  return out;
}

/** The fields that must be filled before the task is finished, and are not. */
export function missingForDone(defs: TaskField[], values: Record<string, unknown> | null | undefined) {
  return defs.filter((d) => d.required === 'done' && empty(values?.[d.key])).map((d) => d.key);
}
