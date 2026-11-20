// Amounts in the company's currency and in others: format any amount in its
// own currency, and turn it into the company's before adding it to others.
import { useMemo } from 'react';
import { COMMON_CURRENCIES, moneyOf, toBase, usableCurrencies, type Money } from '../../../shared/src/money';
import { useI18n } from './i18n';
import { useStore } from './store';
import { intlTag } from '../../../shared/src/i18n';
import { currencySign, formatMoney } from './format';

export interface MoneyTools extends Money {
  /** In the company's currency. */
  toBase: (amount: number, currency?: string | null) => number;
  /** "₺12.000", "$1,200" — in the amount's own currency (the company's when none). */
  format: (amount: number, currency?: string | null, compact?: boolean) => string;
  /** The currencies an amount can be in here. */
  usable: string[];
  /** More than one currency is in use. */
  multi: boolean;
  /** "US dollar". */
  nameOf: (code: string) => string;
  symbolOf: (code?: string | null) => string;
}

/** Money helpers in the reader's language and the company's currency and rates (format, convert). */
export function useMoney(): MoneyTools {
  const { locale } = useI18n();
  const { me } = useStore();
  const tag = intlTag(locale);
  return useMemo(() => {
    const m = moneyOf(me.org.currency, me.org.fx);
    const usable = usableCurrencies(m);
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([tag], { type: 'currency' });
    } catch {
      names = null;
    }
    const format = (amount: number, currency?: string | null, compact = false) => formatMoney(amount, currency || m.base, locale, { compact });
    const symbolOf = (code?: string | null) => currencySign(code || m.base, locale);
    return { ...m, usable, multi: usable.length > 1, toBase: (a, c) => toBase(a, c, m), format, nameOf: (code) => names?.of(code) ?? code, symbolOf };
  }, [me.org.currency, me.org.fx, tag]);
}

/** Every ISO currency code this browser knows (all of them, in a current one), A to Z. */
export function allCurrencies(): string[] {
  try {
    const list = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('currency');
    if (list?.length) return list;
  } catch {
    /* an older browser: the usual ones will do */
  }
  return [...COMMON_CURRENCIES].sort();
}
