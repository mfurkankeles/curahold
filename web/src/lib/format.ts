// Dates, times, numbers and money as text: the one place that formats or reads them.
// Every function takes the reader's language and asks Intl, so each language gets
// its own order, separators, digits, month and weekday names — never a branch per
// language. Dates are Gregorian everywhere (the data is), written with the
// language's own digits (Persian digits in Persian, the Western digits Arabic's
// dictionary uses in Arabic — see intlTag).
import { intlTag, type Locale } from '../../../shared/src/i18n/core';

// ---------------------------------------------------------------- calendar days
// A day is 'YYYY-MM-DD' (what the API stores); a moment typed by a person is
// 'YYYY-MM-DDTHH:mm' in their own clock (what <input type="datetime-local"> gave).

const pad = (n: number) => String(n).padStart(2, '0');
/** A YYYY-MM-DD text from year, month and day. */
export const isoDay = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
/** A day's parts; null when the text is not a real day. */
export function dayParts(iso: string | null | undefined): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return realDay(y, mo, d) ? { y, m: mo, d } : null;
}
function realDay(y: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1 || y < 1000 || y > 9999) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}
/** Noon UTC on that day: formatting it in any time zone keeps the same calendar day. */
export const dayDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);
/** An ISO day moved by `days` (calendar arithmetic, no time zone). */
export function shiftDay(iso: string, days: number): string {
  const d = dayDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** The same day `months` later, held to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function shiftMonth(iso: string, months: number): string {
  const p = dayParts(iso)!;
  const first = new Date(Date.UTC(p.y, p.m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return isoDay(first.getUTCFullYear(), first.getUTCMonth() + 1, Math.min(p.d, last));
}
/** 0 = Sunday … 6 = Saturday. */
export const weekdayOf = (iso: string) => dayDate(iso).getUTCDay();

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function dtf(locale: Locale, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(opts)}`;
  let f = fmtCache.get(key);
  if (!f) fmtCache.set(key, (f = new Intl.DateTimeFormat(intlTag(locale), { calendar: 'gregory', timeZone: 'UTC', ...opts })));
  return f;
}
// Bidirectional marks Intl puts around Arabic and Hebrew dates: invisible, but they
// break a typed field's caret and comparisons.
const MARKS = /[‎‏؜]/g;

/** A day as a person types it here: "15.11.2026" (tr), "15/11/2026" (en), "2026/11/15" (ja), "۱۴۰۵/…" never — Gregorian. */
export function formatDayNumeric(iso: string, locale: Locale): string {
  return dayParts(iso) ? dtf(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(dayDate(iso)).replace(MARKS, '') : '';
}
/** A day in words, for screen readers and titles: "Pazar, 15 Kasım 2026". */
export function formatDayLong(iso: string, locale: Locale): string {
  return dayParts(iso) ? dtf(locale, { dateStyle: 'full' }).format(dayDate(iso)) : '';
}
/** A day short, in running text: "15 Kas" — with the year when it is not this one. */
export function formatDayShort(iso: string, locale: Locale, thisYear = new Date().getFullYear()): string {
  const p = dayParts(iso);
  if (!p) return '';
  return dtf(locale, p.y === thisYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' }).format(dayDate(iso));
}
/** The month and year a calendar shows: "Kasım 2026". */
export const formatMonthYear = (iso: string, locale: Locale) => dtf(locale, { month: 'long', year: 'numeric' }).format(dayDate(iso));

/** A whole number in the language's own digits ("۱۵" in Persian). */
export function formatInt(n: number, locale: Locale): string {
  return new Intl.NumberFormat(intlTag(locale), { useGrouping: false, maximumFractionDigits: 0 }).format(n);
}

/** The order of day, month and year when this language writes a date in numbers. */
export function dayOrder(locale: Locale): ('day' | 'month' | 'year')[] {
  return dtf(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
    .formatToParts(new Date(Date.UTC(2027, 11, 31, 12)))
    .map((p) => p.type)
    .filter((t): t is 'day' | 'month' | 'year' => t === 'day' || t === 'month' || t === 'year');
}

/** Arabic-Indic and Persian digits read as 0–9, so a date typed on any keyboard is understood. */
export function westernDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0));
}

/**
 * Reads a day typed in the person's own format: "15.11.2026", "15/11", "15 11 26",
 * "15112026" (tr, en) or "2026/11/15" (ja) — and ISO "2026-11-15" in any language.
 * Without a year, the year of `today`. Null when it is not a real day.
 */
export function parseDay(text: string, locale: Locale, today: string): string | null {
  const s = westernDigits(text).replace(MARKS, '').trim();
  if (!s) return null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) return check(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const order = dayOrder(locale);
  let parts = s.split(/\D+/).filter(Boolean);
  // Digits only: split by the language's order ("15112026" → 15 11 2026; "20261115" → 2026 11 15).
  if (parts.length === 1 && (parts[0].length === 8 || parts[0].length === 6 || parts[0].length === 4)) {
    const all = parts[0];
    const yLen = all.length === 8 ? 4 : all.length === 6 ? 2 : 0;
    const want = order.filter((t) => yLen || t !== 'year');
    parts = [];
    let at = 0;
    for (const t of want) {
      const n = t === 'year' ? yLen : 2;
      parts.push(all.slice(at, at + n));
      at += n;
    }
  }
  const nums = parts.map(Number);
  const thisYear = Number(today.slice(0, 4));
  let y: number, m: number, d: number;
  if (nums.length === 3) {
    const by = Object.fromEntries(order.map((t, i) => [t, nums[i]])) as Record<'day' | 'month' | 'year', number>;
    // A four-digit first number is a year whatever the language ("2026/11/15").
    if (String(parts[0]).length === 4 && order[0] !== 'year') [y, m, d] = nums;
    else [y, m, d] = [by.year, by.month, by.day];
    if (y < 100) y += 2000;
  } else if (nums.length === 2) {
    const dm = order.filter((t) => t !== 'year');
    const by = Object.fromEntries(dm.map((t, i) => [t, nums[i]])) as Record<'day' | 'month', number>;
    [y, m, d] = [thisYear, by.month, by.day];
  } else return null;
  return check(y, m, d);
  function check(y: number, m: number, d: number) {
    return realDay(y, m, d) ? isoDay(y, m, d) : null;
  }
}

/** "14:30" in this language's digits; always a 24-hour clock, so a typed time is never ambiguous. */
export function formatTime(hhmm: string, locale: Locale): string {
  const m = /^(\d{2}):(\d{2})/.exec(hhmm);
  if (!m) return '';
  return dtf(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(Date.UTC(2027, 0, 1, Number(m[1]), Number(m[2])))).replace(MARKS, '');
}
/** Reads "14:30", "14.30", "1430", "9", "9:5", "2:30 pm"; null when it is not a time of day. */
export function parseTime(text: string): string | null {
  const s = westernDigits(text).trim().toLowerCase().replace(/\s+/g, '');
  const m = /^(\d{1,2})(?:[:.,h](\d{1,2})|(\d{2}))?(am|pm|a|p|öö|ös)?$/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? m[3] ?? 0);
  const half = m[4];
  if (half) {
    if (h < 1 || h > 12) return null;
    if (/^(p|pm|ös)$/.test(half) && h < 12) h += 12;
    if (/^(a|am|öö)$/.test(half) && h === 12) h = 0;
  }
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

/** The first day of the week here (0 = Sunday … 6 = Saturday), from the language. */
export function weekStart(locale: Locale): number {
  try {
    const l = new Intl.Locale(intlTag(locale)) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };
    const info = l.getWeekInfo?.() ?? l.weekInfo;
    if (info?.firstDay) return info.firstDay % 7;
  } catch {
    /* older engines: the table below */
  }
  return ({ en: 1, tr: 1, ar: 6, he: 0, fa: 6, 'zh-Hans': 1, 'zh-Hant': 0, ja: 0, ko: 0, hi: 0, ms: 1 } as Record<Locale, number>)[locale] ?? 1;
}
/** The weekday names in calendar order, starting at the week's first day: short and full. */
export function weekdayNames(locale: Locale): { short: string; long: string }[] {
  const first = weekStart(locale);
  // 2027-01-03 is a Sunday.
  const days = Array.from({ length: 7 }, (_, i) => dayDate(isoDay(2027, 1, 3 + ((first + i) % 7))));
  // Where the short names are whole words (Arabic, Persian), the narrow ones fit a calendar column.
  const short = days.map((d) => dtf(locale, { weekday: 'short' }).format(d));
  const narrow = short.some((n) => n.length > 4);
  return days.map((d, i) => ({ short: narrow ? dtf(locale, { weekday: 'narrow' }).format(d) : short[i], long: dtf(locale, { weekday: 'long' }).format(d) }));
}
/** Six weeks of days around a month, starting on the week's first day: a calendar that never changes height. */
export function monthGrid(monthIso: string, locale: Locale): string[][] {
  const p = dayParts(monthIso)!;
  const first = isoDay(p.y, p.m, 1);
  const back = (weekdayOf(first) - weekStart(locale) + 7) % 7;
  const start = shiftDay(first, -back);
  return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => shiftDay(start, w * 7 + d)));
}

// ---------------------------------------------------------------- numbers, money, dates in text
// Everything a screen writes as text goes through these (or `useFormat()` in lib/useFormat.ts,
// which binds the reader's language). Nothing formats with Intl or toLocale* by hand.

const nfCache = new Map<string, Intl.NumberFormat>();
function nf(locale: Locale, opts: Intl.NumberFormatOptions = {}): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(opts)}`;
  let f = nfCache.get(key);
  if (!f) nfCache.set(key, (f = new Intl.NumberFormat(intlTag(locale), opts)));
  return f;
}
/** 12.345 / 12,345 / ۱۲٬۳۴۵ — `digits` decimals at most; `compact` writes 12K above 10 000. */
export function formatNumber(n: number, locale: Locale, { digits = 0, compact = false }: { digits?: number; compact?: boolean } = {}): string {
  const big = compact && Math.abs(n) >= 10000;
  return nf(locale, { maximumFractionDigits: big ? 1 : digits, notation: big ? 'compact' : 'standard' }).format(n);
}
/** "%42" in Turkish, "42%" in English: `value` is 0–100. */
export const formatPercent = (value: number, locale: Locale, digits = 0) => nf(locale, { style: 'percent', maximumFractionDigits: digits }).format(value / 100);
/** Languages whose interfaces write a short unit without the abbreviation's full stop ("45 dk", not "45 dk."). */
const UNIT_WITHOUT_STOP = new Set<Locale>(['tr']);
/**
 * "3 sa", "45 dk", "45 min", "45 分" — a duration or size in the language's short unit. Not the narrow one:
 * that writes 45 minutes as "45d" in Turkish (read as days) and as "45m" in Persian and Japanese.
 */
export const formatUnit = (n: number, unit: 'hour' | 'minute' | 'day' | 'kilobyte' | 'megabyte', locale: Locale, digits = 0) => {
  const text = nf(locale, { style: 'unit', unit, unitDisplay: 'short', maximumFractionDigits: digits }).format(n);
  return UNIT_WITHOUT_STOP.has(locale) ? text.replace(/\.$/, '') : text;
};
/** A file size: "820 KB", "1,4 MB". */
export const formatBytes = (n: number, locale: Locale) => (n > 1024 * 1024 ? formatUnit(n / 1024 / 1024, 'megabyte', locale, 1) : formatUnit(Math.max(1, Math.round(n / 1024)), 'kilobyte', locale));
/** "₺12.000", "$1,200", "12 B ₺" with `compact` — in the amount's own currency. */
export function formatMoney(amount: number, currency: string, locale: Locale, { compact = false }: { compact?: boolean } = {}): string {
  const big = compact && Math.abs(amount) >= 10000;
  try {
    return nf(locale, { style: 'currency', currencyDisplay: 'narrowSymbol', currency, maximumFractionDigits: big ? 1 : 0, notation: big ? 'compact' : 'standard' }).format(amount);
  } catch {
    return `${formatNumber(amount, locale)} ${currency}`;
  }
}
/** The currency's own sign here ("₺", "$"). */
export function currencySign(currency: string, locale: Locale): string {
  try {
    return nf(locale, { style: 'currency', currencyDisplay: 'narrowSymbol', currency }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? currency;
  } catch {
    return currency;
  }
}

/**
 * A date in running text. 'YYYY-MM-DD' is a calendar day (the same everywhere); a full
 * timestamp is shown in the reader's own clock. Default: "15 Kas".
 */
export function formatDate(at: string | Date, locale: Locale, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  const day = typeof at === 'string' && at.length === 10;
  const d = typeof at === 'string' ? (day ? dayDate(at) : new Date(at)) : at;
  return dtfLocal(locale, day ? { ...opts, timeZone: 'UTC' } : opts).format(d);
}
/** A moment with its time: "15 Kas 14:30". */
export const formatDateTime = (at: string | Date, locale: Locale, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) => formatDate(at, locale, opts);
/** The time of a moment: "14:30". */
export const formatClock = (at: string | Date, locale: Locale) => formatDate(at, locale, { hour: '2-digit', minute: '2-digit' });
/** A month key 'YYYY-MM' (or any day in it) as "Kasım 2026", or "Kas" with `short`. */
export const formatMonth = (key: string, locale: Locale, { short = false, year = !short }: { short?: boolean; year?: boolean } = {}) =>
  formatDate(`${key.slice(0, 7)}-01`, locale, { month: short ? 'short' : 'long', ...(year ? { year: 'numeric' } : {}) });

function dtfLocal(locale: Locale, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `L|${locale}|${JSON.stringify(opts)}`;
  let f = fmtCache.get(key);
  if (!f) fmtCache.set(key, (f = new Intl.DateTimeFormat(intlTag(locale), { calendar: 'gregory', ...opts })));
  return f;
}
