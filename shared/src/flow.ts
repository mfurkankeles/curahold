// How work flows through a product board: how long an item takes from the moment
// work on it starts until it is done (cycle time), and how many items are finished
// each week (throughput). Worked out from the board's status-change history, on the
// company's own clock: a week starts on the company's first day of the week in its
// own time zone, and the company's weekend is left out of a cycle time, so an item
// started on Friday evening and finished on Monday morning took less than a day.
import { addDays, localDate } from './days';
import { isoWeekday } from './burndown';
import { ISSUE_TYPES, type IssueType } from './model';

type WeekLocale = Intl.Locale & { getWeekInfo?: () => { firstDay?: number }; weekInfo?: { firstDay?: number } };

/** The first day of the week (ISO: 1 Monday … 7 Sunday) of a language or region; Monday when the runtime cannot say. */
export function firstDayOf(locale: string | null | undefined): number {
  try {
    const l = new Intl.Locale(locale || 'en') as WeekLocale;
    const f = (l.getWeekInfo?.() ?? l.weekInfo)?.firstDay;
    if (Number.isInteger(f) && f! >= 1 && f! <= 7) return f!;
  } catch {
    /* an unknown tag: Monday */
  }
  return 1;
}

/** The first day of the week a day is in. */
export function weekOf(day: string, firstDay: number): string {
  return addDays(day, -((isoWeekday(day) - firstDay + 7) % 7));
}

const formats = new Map<string, Intl.DateTimeFormat>();
function zoneFormat(timeZone: string): Intl.DateTimeFormat {
  let f = formats.get(timeZone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      f = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    formats.set(timeZone, f);
  }
  return f;
}

/** How far a time zone's clock is ahead of UTC at a moment, in milliseconds. */
function offsetAt(at: number, timeZone: string): number {
  const p = Object.fromEntries(zoneFormat(timeZone).formatToParts(new Date(at)).map((x) => [x.type, x.value]));
  const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
  return wall - (at - (((at % 1000) + 1000) % 1000));
}

/**
 * Elapsed time between two moments on working days only: the parts that fall on the company's weekend,
 * in its time zone, are left out. Midnights are found in the zone itself, so a day with a daylight-saving
 * change is as long as it really was (23 or 25 hours).
 */
export function workingMs(start: number, end: number, timeZone: string, weekend: number[], midnights = new Map<string, number>()): number {
  if (!(end > start)) return 0;
  const zone = timeZone || 'UTC';
  const midnight = (day: string) => {
    let m = midnights.get(day);
    if (m === undefined) {
      const [y, mo, d] = day.split('-').map(Number);
      const wall = Date.UTC(y, mo - 1, d);
      const guess = wall - offsetAt(wall, zone);
      m = wall - offsetAt(guess, zone);
      midnights.set(day, m);
    }
    return m;
  };
  const off = new Set(weekend);
  const last = localDate(new Date(end), zone);
  let total = 0;
  for (let day = localDate(new Date(start), zone); day <= last; day = addDays(day, 1)) {
    if (off.has(isoWeekday(day))) continue;
    const a = Math.max(start, midnight(day));
    const b = Math.min(end, midnight(addDays(day, 1)));
    if (b > a) total += b - a;
  }
  return total;
}

/** The median of some numbers (the mean of the middle two when there is an even count). */
export function median(sorted: number[]): number {
  const n = sorted.length;
  if (!n) return 0;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

/** A percentile by the nearest rank: the smallest value that at least `p` of them do not exceed. */
export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}

export interface FlowTask {
  id: string;
  issueType: IssueType;
  storyPoints: number | null;
  /** When it was made, and the stage it was made in (the first status change's "from", else where it is now). */
  createdAt: string;
  createdIn: string;
  /** When it was last finished (null: not finished). */
  doneAt: string | null;
}

export interface FlowMove {
  taskId: string;
  to: string;
  at: string;
}

export interface FlowStat {
  /** Items finished in the window that have a start (so a cycle time). */
  count: number;
  /** Working days. */
  median: number;
  p85: number;
}

export interface BoardFlow {
  boardId: string;
  /** The first day of the first week shown, and today, on the company's clock. */
  from: string;
  today: string;
  weeks: number;
  weekend: number[];
  firstDay: number;
  /** One entry per week, oldest first; the last is the current (unfinished) week. */
  throughput: { week: string; count: number; points: number }[];
  /** Per work type that finished anything with a start, in the product's type order. */
  cycle: ({ type: IssueType } & FlowStat)[];
  all: FlowStat | null;
  /** Finished in the window, and those of them that went to done without ever being worked on (no cycle time). */
  finished: number;
  unstarted: number;
}

const DAY = 86_400_000;
const round1 = (v: number) => Math.round(v * 10) / 10;

function stat(days: number[]): FlowStat {
  const s = [...days].sort((a, b) => a - b);
  return { count: s.length, median: round1(median(s)), p85: round1(percentile(s, 0.85)) };
}

/**
 * Cycle time and throughput of the items finished in the last `weeks` weeks (the current one included).
 * `started` is the set of stages where work is under way (neither waiting to start nor done). An item's
 * cycle starts the first time it entered such a stage (or when it was made in one) and ends when it was
 * last finished.
 */
export function boardFlow(input: {
  boardId: string;
  tasks: FlowTask[];
  moves: FlowMove[];
  started: Set<string>;
  today: string;
  timeZone: string;
  weekend: number[];
  firstDay: number;
  weeks: number;
}): BoardFlow {
  const { tasks, moves, started, today, timeZone, weekend, firstDay, weeks } = input;
  const zone = timeZone || 'UTC';
  const thisWeek = weekOf(today, firstDay);
  const from = addDays(thisWeek, -7 * (weeks - 1));
  const throughput = Array.from({ length: weeks }, (_, i) => ({ week: addDays(from, i * 7), count: 0, points: 0 }));
  const byWeek = new Map(throughput.map((w) => [w.week, w]));
  const firstStart = new Map<string, number>();
  for (const m of moves) {
    if (!started.has(m.to)) continue;
    const at = Date.parse(m.at);
    const was = firstStart.get(m.taskId);
    if (was === undefined || at < was) firstStart.set(m.taskId, at);
  }
  const midnights = new Map<string, number>();
  const perType = new Map<IssueType, number[]>();
  const all: number[] = [];
  let finished = 0;
  let unstarted = 0;
  for (const t of tasks) {
    if (!t.doneAt) continue;
    const end = Date.parse(t.doneAt);
    const week = byWeek.get(weekOf(localDate(new Date(end), zone), firstDay));
    if (!week) continue;
    finished++;
    week.count++;
    week.points += t.storyPoints ?? 0;
    let start = firstStart.get(t.id);
    if (started.has(t.createdIn)) start = Math.min(start ?? Infinity, Date.parse(t.createdAt));
    if (start === undefined || !(start < end)) {
      unstarted++;
      continue;
    }
    const days = workingMs(start, end, zone, weekend, midnights) / DAY;
    all.push(days);
    const list = perType.get(t.issueType) ?? [];
    list.push(days);
    perType.set(t.issueType, list);
  }
  return {
    boardId: input.boardId,
    from,
    today,
    weeks,
    weekend: [...weekend],
    firstDay,
    throughput,
    cycle: ISSUE_TYPES.filter((k) => perType.has(k)).map((type) => ({ type, ...stat(perType.get(type)!) })),
    all: all.length ? stat(all) : null,
    finished,
    unstarted,
  };
}
