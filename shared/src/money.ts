// Amounts in more than one currency. Each customer and record keeps its own
// currency (none is the company's); totals are in the company's currency, at the
// rates an administrator sets: {"USD": 34.2} means one US dollar is 34.2 of it.
import type { FxRates } from './model';

export const CURRENCY_RE = /^[A-Z]{3}$/;

/** The currencies offered first; any other ISO code can be added too. */
export const COMMON_CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CNY', 'AED', 'SAR', 'QAR', 'KWD', 'RUB', 'PLN', 'SEK', 'NOK', 'DKK', 'CZK', 'HUF', 'RON', 'BGN', 'CAD', 'AUD', 'NZD', 'INR', 'SGD', 'HKD', 'KRW', 'BRL', 'MXN', 'ZAR', 'EGP', 'ILS', 'AZN', 'GEL', 'KZT', 'UAH'];

export interface Money {
  base: string;
  rates: Record<string, number>;
}

export const moneyOf = (base: string, fx?: FxRates | null): Money => ({ base, rates: fx?.rates ?? {} });

/** The currencies a company can pick for an amount: its own and those with a rate. */
export const usableCurrencies = (m: Money): string[] => [m.base, ...Object.keys(m.rates).filter((c) => c !== m.base).sort()];

/** An amount in `currency`, in the company's currency. An unknown currency counts one to one. */
export function toBase(amount: number, currency: string | null | undefined, m: Money): number {
  if (!currency || currency === m.base) return amount;
  const r = m.rates[currency];
  return typeof r === 'number' && r > 0 ? amount * r : amount;
}

/** From the company's currency into `currency`. */
export function fromBase(amount: number, currency: string | null | undefined, m: Money): number {
  if (!currency || currency === m.base) return amount;
  const r = m.rates[currency];
  return typeof r === 'number' && r > 0 ? amount / r : amount;
}

/** Rates as an administrator sends them: known codes, positive numbers, never the company's own. */
export function cleanRates(base: string, rates: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(rates ?? {})) {
    const n = Number(v);
    if (CURRENCY_RE.test(k) && k !== base && Number.isFinite(n) && n > 0 && n < 1e9) out[k] = Math.round(n * 1e6) / 1e6;
  }
  return out;
}
