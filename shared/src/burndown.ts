// The sprint burndown as days on a chart: where the ideal line is, what was left,
// what the scope was and when it changed. Pure calendar arithmetic on the company's
// own days (YYYY-MM-DD), so a time zone or a daylight-saving change cannot shift a
// day, and the ideal line rests on the company's weekend.
import { addDays } from './days';
import type { SprintBurndown } from './model';

/** Saturday and Sunday (ISO weekdays), when the runtime cannot say otherwise. */
export const DEFAULT_WEEKEND = [6, 7];

type WeekLocale = Intl.Locale & { getWeekInfo?: () => { weekend?: number[] }; weekInfo?: { weekend?: number[] } };

/** The weekend of a language or region (the Unicode week data): Friday–Saturday in Arabic, Saturday–Sunday in Turkish. */
export function weekendOf(locale: string | null | undefined): number[] {
  try {
    const l = new Intl.Locale(locale || 'en') as WeekLocale;
    const w = (l.getWeekInfo?.() ?? l.weekInfo)?.weekend;
    if (Array.isArray(w) && w.length > 0 && w.length < 7 && w.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)) return [...w];
  } catch {
    /* an unknown tag: the default below */
  }
  return [...DEFAULT_WEEKEND];
}

/** ISO weekday of a day: 1 Monday … 7 Sunday. */
export function isoWeekday(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 0 ? 7 : w;
}

export interface BurndownDay {
  day: string;
  weekend: boolean;
  today: boolean;
  /** A reading was taken that day (otherwise the last one is carried forward). */
  read: boolean;
  /** Where the ideal line is at the end of the day. */
  ideal: number;
  /** Points left at the end of the day; null for days still to come or before anything was read. */
  remaining: number | null;
  /** The sprint's scope that day; null for days still to come. */
  scope: number | null;
  /** Scope added (+) or taken out (−) that day, against the day before (against the start on the first day). */
  change: number;
}

export interface BurndownSeries {
  days: BurndownDay[];
  /** The committed scope the ideal line starts from. */
  start: number;
  /** The highest value on the chart (≥ 1): the top of the y axis. */
  top: number;
  /** Scope added and taken out since the start, in points (both ≥ 0). */
  added: number;
  removed: number;
  /** Points left at the latest reading (null when nothing was read). */
  remaining: number | null;
  /** Today's place in `days`, or −1 when today is outside the sprint. */
  todayIndex: number;
  /** The planned first and last day's places in `days`. */
  startIndex: number;
  endIndex: number;
}

const MAX_DAYS = 180;
const later = (a: string, b: string) => (a > b ? a : b);
const earlier = (a: string, b: string) => (a < b ? a : b);

/** The burndown as one entry per calendar day from the sprint's first day to its last. */
export function burndownSeries(b: SprintBurndown, todayIn?: string): BurndownSeries {
  const pts = [...b.points].sort((x, y) => (x.day < y.day ? -1 : x.day > y.day ? 1 : 0));
  const today = todayIn ?? b.today ?? pts.at(-1)?.day ?? b.startsOn ?? '1970-01-01';
  const weekend = new Set(b.weekend?.length ? b.weekend : DEFAULT_WEEKEND);
  const first = b.startsOn ?? b.startedOn ?? pts[0]?.day ?? today;
  const end = b.endsOn ?? later(later(pts.at(-1)?.day ?? first, today), addDays(first, 1));
  // A reading before the planned start (started early) or after the planned end (closed late) still shows.
  const from = pts.length ? earlier(first, pts[0].day) : first;
  let to = pts.length ? later(end, pts.at(-1)!.day) : end;
  if (to < from) to = from;

  const days: string[] = [];
  for (let d = from; d <= to && days.length < MAX_DAYS; d = addDays(d, 1)) days.push(d);
  const startIndex = Math.max(0, days.indexOf(first));
  const endIdx = days.indexOf(end);
  const endIndex = endIdx < 0 ? days.length - 1 : endIdx;

  const start = Math.max(0, b.startPoints);
  // Working days after the start, up to the planned end: each burns an equal share.
  const isWork = (d: string) => !weekend.has(isoWeekday(d));
  let work = 0;
  for (let i = startIndex + 1; i <= endIndex; i++) if (isWork(days[i])) work++;

  const byDay = new Map(pts.map((p) => [p.day, p]));
  const lastRead = pts.length ? pts.at(-1)!.day : null;
  let burnt = 0;
  let remaining: number | null = null;
  let scope: number | null = null;
  let previousScope = start;
  let added = 0;
  let removed = 0;
  const out: BurndownDay[] = days.map((day, i) => {
    if (i > startIndex && i <= endIndex && isWork(day)) burnt++;
    const ideal = i <= startIndex ? start : i > endIndex ? 0 : work === 0 ? 0 : Math.max(0, start * (1 - burnt / work));
    const read = byDay.get(day);
    const known = lastRead !== null && day <= lastRead;
    if (read) {
      remaining = read.remainingPoints;
      scope = read.totalPoints;
    }
    const s = known ? scope : null;
    let change = 0;
    if (s !== null) {
      change = s - previousScope;
      previousScope = s;
      if (change > 0) added += change;
      else removed -= change;
    }
    return { day, weekend: !isWork(day), today: day === today, read: !!read, ideal: round(ideal), remaining: known ? remaining : null, scope: s, change: round(change) };
  });
  const top = Math.max(1, start, ...out.map((d) => Math.max(d.scope ?? 0, d.remaining ?? 0)));
  return {
    days: out,
    start,
    top,
    added: round(added),
    removed: round(removed),
    remaining: pts.length ? pts.at(-1)!.remainingPoints : null,
    todayIndex: days.indexOf(today),
    startIndex,
    endIndex,
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** The team's velocity: the points finished in each of the last `n` closed sprints, and their average (null with none). */
export function velocityOf(done: number[], n = 3): { last: number[]; average: number | null } {
  const last = done.slice(-n);
  return { last, average: last.length ? round(last.reduce((a, x) => a + x, 0) / last.length) : null };
}
