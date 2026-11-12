// Currencies in SQL: an amount in a customer's or a record's own currency,
// turned into the company's. The rates are read once per statement (an
// InitPlan), not once per row.
import type { FxRates } from '../../../shared/src/model';

/** The rate for `alias`'s currency: what one of it is worth in the company's currency (1 for the company's own, or one without a rate). */
export const fxRate = (alias: string, org = 'app_org()') => `coalesce(((select o.settings->'fx'->'rates' from orgs o where o.id = ${org}) ->> ${alias}.currency)::numeric, 1)`;

export function fxOf(settings: unknown): FxRates {
  const fx = ((settings ?? {}) as { fx?: { rates?: Record<string, unknown>; updatedAt?: unknown } }).fx ?? {};
  const rates: Record<string, number> = {};
  for (const [k, v] of Object.entries(fx.rates ?? {})) if (/^[A-Z]{3}$/.test(k) && Number(v) > 0) rates[k] = Number(v);
  return { rates, updatedAt: typeof fx.updatedAt === 'string' ? fx.updatedAt : null };
}

/** The currencies an amount may be in here: the company's own and those with a rate. */
export const allowedCurrency = (org: { currency: string; settings?: unknown }, cur: string | null | undefined) => !cur || cur === org.currency || cur in fxOf(org.settings).rates;
