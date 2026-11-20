// Request validation helpers shared by every route: body() parses and checks a JSON body with a zod schema, param()
// checks an id in the path, plus the common field schemas (uuid, email, locale, ISO date). A bad body is 400
// 'validation' naming the fields; a bad id is 404, so ids cannot be probed.
import { z } from 'zod';
import type { C } from '../context';
import { fail } from './errors';
import { LOCALES, type Locale } from '../../../shared/src/i18n';

export const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
/** One of the languages Curahold speaks. */
export const localeField = z.enum(LOCALES as [Locale, ...Locale[]]);
export const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
export const deviceId = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);
export const deviceLabel = z.string().trim().max(120).optional();
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Parses the JSON body and checks it against `schema`; fails 'validation' with the failing field names. */
export async function body<T extends z.ZodTypeAny>(c: C, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    raw = {};
  }
  const r = schema.safeParse(raw);
  if (!r.success) {
    const fields = [...new Set(r.error.issues.map((i) => i.path.join('.') || '(body)'))];
    fail('validation', { fields: fields.join(', ') }, { fields });
  }
  return r.data as z.infer<T>;
}

/** A path parameter that must be a uuid; anything else is 'not_found' (never a 500, never a hint). */
export function param(c: C, name: string): string {
  const v = c.req.param(name);
  if (!v || !uuid.safeParse(v).success) fail('not_found');
  return v as string;
}
