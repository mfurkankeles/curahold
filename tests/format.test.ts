// The one formatter module (web/src/lib/format.ts): dates typed and shown in each
// language's own order and digits, the calendar's week start and shape.
import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dayOrder, formatBytes, formatDate, formatDayNumeric, formatInt, formatMoney, formatMonth, formatNumber, formatPercent, formatTime, formatUnit, monthGrid, parseDay, parseTime, shiftMonth, weekdayNames, weekStart } from '../web/src/lib/format';

const today = '2026-11-15';

describe('typing a date in the reader’s own format', () => {
  it('reads day-first languages', () => {
    expect(parseDay('15.11.2026', 'tr', today)).toBe('2026-11-15');
    expect(parseDay('3.4.2027', 'tr', today)).toBe('2027-04-03');
    expect(parseDay('15/11/2026', 'en', today)).toBe('2026-11-15');
    expect(parseDay('15 11 26', 'en', today)).toBe('2026-11-15');
    expect(parseDay('15112026', 'tr', today)).toBe('2026-11-15');
    expect(parseDay('15.11', 'tr', today)).toBe('2026-11-15');
  });
  it('reads year-first languages, and ISO anywhere', () => {
    expect(parseDay('2026/11/15', 'ja', today)).toBe('2026-11-15');
    expect(parseDay('2026. 11. 15.', 'ko', today)).toBe('2026-11-15');
    expect(parseDay('2026-11-15', 'tr', today)).toBe('2026-11-15');
    expect(parseDay('2026/11/15', 'tr', today)).toBe('2026-11-15');
  });
  it('reads Persian and Arabic-Indic digits', () => {
    expect(parseDay('۲۰۲۶/۱۱/۱۵', 'fa', today)).toBe('2026-11-15');
    expect(parseDay('١٥/١١/٢٠٢٦', 'ar', today)).toBe('2026-11-15');
  });
  it('refuses what is not a real day', () => {
    expect(parseDay('31.02.2026', 'tr', today)).toBeNull();
    expect(parseDay('13/13/2026', 'en', today)).toBeNull();
    expect(parseDay('hello', 'en', today)).toBeNull();
    expect(parseDay('', 'en', today)).toBeNull();
  });
});

describe('showing a date', () => {
  it('uses the language’s order, separators and digits, Gregorian', () => {
    expect(formatDayNumeric('2026-11-15', 'tr')).toBe('15.11.2026');
    expect(formatDayNumeric('2026-11-15', 'en')).toBe('15/11/2026');
    expect(formatDayNumeric('2026-11-15', 'ja')).toBe('2026/11/15');
    expect(formatDayNumeric('2026-11-15', 'ar')).toMatch(/15.11.2026/);
    expect(formatDayNumeric('2026-11-15', 'fa')).toContain('۲۰۲۶');
    expect(formatInt(15, 'fa')).toBe('۱۵');
    expect(formatInt(15, 'ar')).toBe('15');
  });
  it('round-trips in every language', () => {
    for (const l of ['en', 'tr', 'ar', 'he', 'fa', 'zh-Hans', 'zh-Hant', 'ja', 'ko'] as const) {
      expect(parseDay(formatDayNumeric('2027-03-04', l), l, today), l).toBe('2027-03-04');
      expect(dayOrder(l)).toHaveLength(3);
    }
  });
});

describe('times', () => {
  it('reads and writes a 24-hour clock', () => {
    expect(parseTime('14:30')).toBe('14:30');
    expect(parseTime('1430')).toBe('14:30');
    expect(parseTime('9')).toBe('09:00');
    expect(parseTime('9.5')).toBe('09:05');
    expect(parseTime('2:30 pm')).toBe('14:30');
    expect(parseTime('12 am')).toBe('00:00');
    expect(parseTime('25:00')).toBeNull();
    expect(formatTime('14:30', 'tr')).toBe('14:30');
    expect(formatTime('09:05', 'fa')).toBe('۰۹:۰۵');
  });
});

describe('the calendar', () => {
  it('starts the week where the language does', () => {
    expect(weekStart('tr')).toBe(1);
    expect(weekdayNames('tr')[0].long).toBe('Pazartesi');
    expect(weekdayNames('en')[0].long).toBe('Monday');
  });
  it('is always six weeks that hold the whole month', () => {
    const g = monthGrid('2026-11-01', 'tr');
    expect(g).toHaveLength(6);
    expect(g.flat()).toContain('2026-11-01');
    expect(g.flat()).toContain('2026-11-30');
    expect(g[0][0]).toBe('2026-10-26'); // a Monday
  });
  it('moves by months without leaving the month', () => {
    expect(shiftMonth('2027-01-31', 1)).toBe('2027-02-28');
    expect(shiftMonth('2026-11-15', -12)).toBe('2025-11-15');
  });
});

describe('numbers, money and dates in text', () => {
  it('writes each language’s own way', () => {
    expect(formatMoney(12000, 'TRY', 'tr')).toBe('₺12.000');
    expect(formatMoney(1200, 'USD', 'en')).toBe('$1,200');
    expect(formatMoney(125000, 'TRY', 'tr', { compact: true })).toMatch(/125/);
    expect(formatNumber(12345.6, 'tr', { digits: 1 })).toBe('12.345,6');
    expect(formatPercent(42, 'tr')).toBe('%42');
    expect(formatDate('2026-11-15', 'tr')).toBe('15 Kas');
    expect(formatDate('2026-11-15', 'fa', { day: 'numeric', month: 'long', year: 'numeric' })).toContain('۲۰۲۶'); // Gregorian, Persian digits
    expect(formatMonth('2026-11', 'en')).toBe('November 2026');
    expect(formatBytes(2 * 1024 * 1024, 'en')).toMatch(/2 ?MB/);
  });
  it('writes a duration in each language’s short unit, never a letter that reads as another unit', () => {
    expect(formatUnit(45, 'minute', 'tr')).toBe('45 dk'); // the narrow unit wrote "45d", read as 45 days
    expect(formatUnit(2, 'hour', 'tr')).toBe('2 sa');
    expect(formatUnit(45, 'minute', 'en')).toMatch(/^45 mins?$/);
    expect(formatUnit(45, 'minute', 'ja')).toMatch(/^45 ?分$/);
    expect(formatUnit(45, 'minute', 'fa')).toContain('دقیقه');
    expect(formatUnit(3, 'day', 'tr')).toBe('3 gün');
  });
  it('is the only place that formats: no Intl or toLocale* by hand in the app or the portal', () => {
    const root = join(import.meta.dirname, '..');
    const files = execSync('git ls-files web/src web/portal', { cwd: root, encoding: 'utf8' }).split('\n').filter((f) => /\.tsx?$/.test(f) && !f.endsWith('lib/format.ts'));
    const by = files.filter((f) => /new Intl\.(NumberFormat|DateTimeFormat)\(|\.toLocale(Date|Time)?String\(/.test(readFileSync(join(root, f), 'utf8')));
    expect(by).toEqual([]);
  });
});
