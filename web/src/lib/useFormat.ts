// The formatters of lib/format.ts bound to the reader's language (and the company's
// currency): what a screen uses to write a number, an amount or a date as text.
import { useMemo } from 'react';
import { useI18n } from './i18n';
import { useStore } from './store';
import { formatBytes, formatClock, formatDate, formatDateTime, formatMoney, formatMonth, formatNumber, formatPercent, formatUnit } from './format';

/** Date, number and relative-time formatting in the reader's language. */
export function useFormat() {
  const { locale } = useI18n();
  const { me } = useStore();
  const base = me.org.currency;
  return useMemo(
    () => ({
      number: (n: number, o?: { digits?: number; compact?: boolean }) => formatNumber(n, locale, o),
      percent: (v: number, digits?: number) => formatPercent(v, locale, digits),
      unit: (n: number, u: Parameters<typeof formatUnit>[1], digits?: number) => formatUnit(n, u, locale, digits),
      bytes: (n: number) => formatBytes(n, locale),
      money: (amount: number, currency?: string | null, o?: { compact?: boolean }) => formatMoney(amount, currency || base, locale, o),
      date: (at: string | Date, o?: Intl.DateTimeFormatOptions) => formatDate(at, locale, o),
      dateTime: (at: string | Date, o?: Intl.DateTimeFormatOptions) => formatDateTime(at, locale, o),
      clock: (at: string | Date) => formatClock(at, locale),
      month: (key: string, o?: { short?: boolean; year?: boolean }) => formatMonth(key, locale, o),
    }),
    [locale, base],
  );
}
