// Totals over amounts in several currencies (shared/src/money.ts sumMoney), as the renewals list shows
// them: an amount with a rate is converted into the company's currency, an amount without one keeps a
// total in its own currency — never added one to one (dollars once came out with a lira sign).
import { describe, expect, it } from 'vitest';
import { moneyOf, sumMoney } from '../shared/src/money';

describe('sumMoney', () => {
  it('adds the company currency and converts what has a rate', () => {
    const m = moneyOf('TRY', { rates: { USD: 34 }, updatedAt: null });
    expect(sumMoney([{ amount: 1000 }, { amount: 10, currency: 'USD' }, { amount: 500, currency: 'TRY' }], m)).toEqual({ base: 1840, converted: true, other: {} });
  });

  it('keeps an amount without a rate in its own currency', () => {
    const m = moneyOf('TRY', null);
    expect(sumMoney([{ amount: 45_000, currency: 'USD' }, { amount: 5_000, currency: 'USD' }, { amount: 1_200, currency: 'TRY' }], m)).toEqual({ base: 1200, converted: false, other: { USD: 50_000 } });
  });

  it('skips amounts that are not numbers', () => {
    expect(sumMoney([{ amount: Number('x') }, { amount: 3 }], moneyOf('EUR', null))).toEqual({ base: 3, converted: false, other: {} });
  });
});
