// Field definitions (account fields and record-type fields) and checking
// the values people send for them.
import { z } from 'zod';
import { normalizeValue } from '../../../shared/src/fields';
import { FIELD_TYPES, type AccountField } from '../../../shared/src/model';
import { fail } from './errors';

/** Checks and cleans field values; rolled-up fields are worked out by Tendwell and cannot be typed in. */
export function cleanFields(defs: AccountField[], input: Record<string, unknown>, locale: 'en' | 'tr') {
  const out: Record<string, unknown> = {};
  const bad: string[] = [];
  for (const [k, v] of Object.entries(input)) {
    const def = defs.find((d) => d.key === k);
    if (!def || def.rollup) {
      bad.push(k);
      continue;
    }
    const r = normalizeValue(def, v, locale);
    if ('error' in r) bad.push(k);
    else out[k] = r.value;
  }
  if (bad.length) fail('validation', { fields: bad.join(', ') }, { fields: bad.map((b) => `fields.${b}`) });
  return out;
}


const label60 = z.object({ en: z.string().trim().max(80).optional(), tr: z.string().trim().max(80).optional() });
export const fieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  label: label60.refine((l) => !!(l.en || l.tr)),
  type: z.enum(FIELD_TYPES),
  options: z
    .array(z.object({ key: z.string().regex(/^[a-z0-9_]{1,40}$/), label: label60, value: z.string().max(200).optional() }))
    .max(300)
    .optional(),
  rollup: z
    .object({
      type: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
      fn: z.enum(['count', 'sum', 'min', 'max']),
      field: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/).optional(),
      where: z.object({ field: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/), option: z.string().regex(/^[a-z0-9_]{1,40}$/) }).optional(),
    })
    .optional(),
});

