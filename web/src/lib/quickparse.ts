// Quick add: one line of plain words becomes a task. People are picked with
// @, customers with #, priority with !, and the due date (and repetition) is
// read from everyday words in Turkish or English — "yarın", "cumaya kadar",
// "15 kas", "haftaya", "her pazartesi", "tomorrow", "next week", "in 3 days".
import type { Priority, Repeat } from '../../../shared/src/model';

export interface Pickable {
  id: string;
  name: string;
}

export type TokenKind = 'due' | 'person' | 'account' | 'priority' | 'repeat';

export interface Parsed {
  title: string;
  dueDate: string | null;
  assignees: Pickable[];
  account: Pickable | null;
  priority: Priority | null;
  repeat: Repeat | null;
  /** The pieces of the line that were read, to show them (and take them out) one by one. */
  tokens: { kind: TokenKind; text: string; value: string }[];
  /** "@name" or "#name" that matched nobody: kept in the title, shown so it can be fixed. */
  unknown: string[];
}

/** Lower case, Turkish-aware, accents and dotted/dotless i folded: "Çağrı İş" → "cagri is". */
export function fold(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d: Date, n: number) => {
  const last = new Date(d.getFullYear(), d.getMonth() + n + 1, 0).getDate();
  return new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), last));
};

// Turkish adds case endings to the day itself: "cumaya", "pazartesiye", "yarına", "salıdan önce" is not a due date
// but "cumaya kadar" is — the dative (-a/-e/-ya/-ye) and "-ki" are read, "kadar" after it is taken too.
const TR_END = '(?:ya|ye|a|e|ki|yi|yu|ye)?';
const WEEKDAYS: [RegExp, number][] = [
  [new RegExp(`^(pazartesi|pzt)${TR_END}$`), 1],
  [new RegExp(`^(sali)${TR_END}$`), 2],
  [new RegExp(`^(carsamba|crs)${TR_END}$`), 3],
  [new RegExp(`^(persembe|prs)${TR_END}$`), 4],
  [new RegExp(`^(cuma)${TR_END}$`), 5],
  [new RegExp(`^(cumartesi|cmt)${TR_END}$`), 6],
  [/^(monday|mon)$/, 1],
  [/^(tuesday|tue|tues)$/, 2],
  [/^(wednesday|wed)$/, 3],
  [/^(thursday|thu|thurs)$/, 4],
  [/^(friday|fri)$/, 5],
  [/^saturday$/, 6],
  [/^sunday$/, 0],
];
// "pazar" is also "market" ("pazar payı"): bare, it is Sunday only at the end of the line or before "günü"/"kadar".
const weekdayOf = (w: string | undefined, next?: string | undefined) => {
  if (!w) return null;
  if (/^pazar(a|ki)?$/.test(w)) return next === undefined || next === 'gunu' || next === 'kadar' ? 0 : null;
  return WEEKDAYS.find(([re]) => re.test(w))?.[1] ?? null;
};
const MONTHS: string[][] = [
  ['ocak', 'january', 'oca', 'jan'],
  ['subat', 'february', 'sub', 'feb'],
  ['mart', 'march', 'mar'],
  ['nisan', 'april', 'nis', 'apr'],
  ['mayis', 'may'],
  ['haziran', 'june', 'haz', 'jun'],
  ['temmuz', 'july', 'tem', 'jul'],
  ['agustos', 'august', 'agu', 'aug'],
  ['eylul', 'september', 'eyl', 'sep', 'sept'],
  ['ekim', 'october', 'eki', 'oct'],
  ['kasim', 'november', 'kas', 'nov'],
  ['aralik', 'december', 'ara', 'dec'],
];
/** A month by its name or short name, also with a Turkish ending ("kasıma", "ocakta"). */
const monthOf = (w: string | undefined) => {
  if (!w || !/^[a-z]{3,}$/.test(w)) return -1;
  return MONTHS.findIndex((names) => names.some((n) => w === n || (n.length > 3 && w.startsWith(n) && /^(a|e|ya|ye|da|de|ta|te|in|un|nda|nde)$/.test(w.slice(n.length)))));
};
const num = (s: string | undefined) => (s && /^\d{1,3}$/.test(s) ? Number(s) : null);
const isUnit = (s: string | undefined, unit: 'day' | 'week' | 'month') =>
  !!s && (unit === 'day' ? /^(gun|gunde|gunu|day|days)$/ : unit === 'week' ? /^(hafta|haftada|haftayi|week|weeks)$/ : /^(ay|ayda|month|months)$/).test(s);
const unitOf = (s: string | undefined): Repeat['unit'] | null => (isUnit(s, 'day') ? 'day' : isUnit(s, 'week') ? 'week' : isUnit(s, 'month') ? 'month' : null);

/** The next such weekday after today (a week from today when today is that day). */
const nextWeekday = (today: Date, day: number) => addDays(today, (day - today.getDay() + 7) % 7 || 7);

/** A day and month without a year: this year, or next if it has passed. */
function future(day: number, month: number, year: number | null, today: Date) {
  if (year) return new Date(year, month, day);
  const d = new Date(today.getFullYear(), month, day);
  return d < today ? new Date(today.getFullYear() + 1, month, day) : d;
}

/** A day from the words at the start of `w` (already folded): how many words it took, and the day. */
function dateAt(w: string[], today: Date): { take: number; date: Date } | null {
  const kadar = (take: number) => (w[take] === 'kadar' ? take + 1 : take);
  if (/^(bugun|bugune|today|tonight)$/.test(w[0] ?? '')) return { take: kadar(1), date: today };
  if (/^(yarin|yarina|tomorrow|tmrw|tmr)$/.test(w[0] ?? '')) return { take: kadar(1), date: addDays(today, 1) };
  if ((w[0] === 'obur' || w[0] === 'ertesi') && /^gun/.test(w[1] ?? '')) return { take: kadar(2), date: addDays(today, 2) };
  if (w[0] === 'day' && w[1] === 'after' && w[2] === 'tomorrow') return { take: 3, date: addDays(today, 2) };
  if (/^(haftaya|haftaybasi)$/.test(w[0] ?? '') || (w[0] === 'next' && w[1] === 'week')) return { take: w[0] === 'next' ? 2 : kadar(1), date: nextWeekday(today, 1) };
  if (w[0] === 'gelecek' && w[1] === 'hafta') return { take: 2, date: nextWeekday(today, 1) };
  if (w[0] === 'next' && w[1] === 'month') return { take: 2, date: new Date(today.getFullYear(), today.getMonth() + 1, 1) };
  if ((w[0] === 'ay' && /^sonu/.test(w[1] ?? '')) || (w[0] === 'end' && w[1] === 'of' && w[2] === 'month')) {
    return { take: w[0] === 'ay' ? kadar(2) : 3, date: new Date(today.getFullYear(), today.getMonth() + 1, 0) };
  }
  if ((w[0] === 'hafta' && /^sonu/.test(w[1] ?? '')) || w[0] === 'weekend') return { take: w[0] === 'hafta' ? kadar(2) : 1, date: nextWeekday(today, 6) };
  if (w[0] === 'this' && w[1] === 'weekend') return { take: 2, date: nextWeekday(today, 6) };
  // "3 gün sonra", "2 hafta sonra", "1 ay içinde", "in 3 days", "in 2 weeks"
  const k = num(w[0]);
  if (k !== null && unitOf(w[1]) && (w[2] === 'sonra' || w[2] === 'icinde')) {
    const u = unitOf(w[1])!;
    return { take: 3, date: u === 'day' ? addDays(today, k) : u === 'week' ? addDays(today, 7 * k) : addMonths(today, k) };
  }
  if (w[0] === 'in' && num(w[1]) !== null && unitOf(w[2])) {
    const m = num(w[1])!;
    const u = unitOf(w[2])!;
    return { take: 3, date: u === 'day' ? addDays(today, m) : u === 'week' ? addDays(today, 7 * m) : addMonths(today, m) };
  }
  // "next friday", "gelecek cuma", "önümüzdeki salı"
  if ((w[0] === 'next' || w[0] === 'gelecek' || w[0] === 'onumuzdeki') && weekdayOf(w[1], w[2]) !== null) return { take: kadar(2), date: nextWeekday(today, weekdayOf(w[1], w[2])!) };
  const wd = weekdayOf(w[0], w[1]);
  if (wd !== null) return { take: kadar(w[1] === 'gunu' ? 2 : 1), date: nextWeekday(today, wd) };
  // 2026-11-15
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(w[0] ?? '');
  if (m) return { take: 1, date: new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) };
  // 15.11, 15/11, 15.11.2026
  // ("1.5" is more often a version or an amount than a day: one side needs two digits.)
  m = /^(\d{1,2})[./](\d{1,2})(?:[./](\d{2}|\d{4}))?$/.exec(w[0] ?? '');
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 31 && Number(m[2]) >= 1 && Number(m[2]) <= 12 && (m[1].length === 2 || m[2].length === 2 || m[3])) {
    return { take: kadar(1), date: future(Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : null, today) };
  }
  // 15 kas, 15 kasım, 15 kasıma kadar, 15 nov
  const d0 = num(w[0]);
  if (d0 !== null && d0 >= 1 && d0 <= 31 && monthOf(w[1]) >= 0) return { take: kadar(2), date: future(d0, monthOf(w[1]), null, today) };
  // nov 15
  if (monthOf(w[0]) >= 0 && num(w[1]) !== null && num(w[1])! >= 1 && num(w[1])! <= 31) return { take: 2, date: future(num(w[1])!, monthOf(w[0]), null, today) };
  return null;
}

/** "her hafta", "her 2 haftada bir", "her pazartesi", "every week", "every 2 weeks", "weekly". */
function repeatAt(w: string[], today: Date): { take: number; repeat: Repeat; due?: Date } | null {
  const R = (every: number, unit: Repeat['unit']): Repeat => ({ every, unit, from: 'due' });
  if (w[0] === 'her' || w[0] === 'every') {
    const wd = weekdayOf(w[1], w[2]) ?? (w[1] === 'pazar' || w[1] === 'pazari' ? 0 : null);
    if (wd !== null) return { take: 2, repeat: R(1, 'week'), due: nextWeekday(today, wd) };
    if (unitOf(w[1])) return { take: w[2] === 'bir' ? 3 : 2, repeat: R(1, unitOf(w[1])!) };
    const n = num(w[1]);
    if (n !== null && n >= 1 && n <= 365 && unitOf(w[2])) return { take: w[3] === 'bir' ? 4 : 3, repeat: R(n, unitOf(w[2])!) };
  }
  if (w[0] === 'hergun' || w[0] === 'daily') return { take: 1, repeat: R(1, 'day') };
  if (w[0] === 'haftalik' || w[0] === 'weekly') return { take: 1, repeat: R(1, 'week') };
  if (w[0] === 'aylik' || w[0] === 'monthly') return { take: 1, repeat: R(1, 'month') };
  return null;
}

const PRIORITIES: [RegExp, Priority][] = [
  [/^(acil|urgent|1|p1)$/, 'urgent'],
  [/^(yuksek|onemli|high|important|2|p2)$/, 'high'],
  [/^(normal|3|p3)$/, 'normal'],
  [/^(dusuk|low|4|p4)$/, 'low'],
];

const clean = (s: string) => fold(s).replace(/[.,;:!?'’")]+$/, '');

/**
 * The best match for the words after @ or #: an exact name first (longest
 * first), then a name that starts with the words, if only one does.
 */
function pick(words: string[], list: Pickable[], most: number): { take: number; item: Pickable } | null {
  const max = Math.min(most, words.length);
  for (let take = max; take >= 1; take--) {
    const want = clean(words.slice(0, take).join(' '));
    const exact = want ? list.filter((p) => fold(p.name) === want) : [];
    if (exact.length === 1) return { take, item: exact[0] };
  }
  for (let take = max; take >= 1; take--) {
    const want = clean(words.slice(0, take).join(' '));
    if (want.length < 2) continue;
    const starts = list.filter((p) => {
      const name = fold(p.name);
      return name.startsWith(want) || (take === 1 && name.split(/[\s.-]+/).some((part) => part.startsWith(want)));
    });
    if (starts.length === 1) return { take, item: starts[0] };
  }
  return null;
}

export function parseQuick(line: string, people: Pickable[], accounts: Pickable[], me: Pickable, today = new Date()): Parsed {
  const day0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const words = line.trim().split(/\s+/).filter(Boolean);
  const folded = words.map(clean);
  const keep: string[] = [];
  const out: Parsed = { title: '', dueDate: null, assignees: [], account: null, priority: null, repeat: null, tokens: [], unknown: [] };
  const span = (i: number, take: number) => words.slice(i, i + take).join(' ');
  for (let i = 0; i < words.length; ) {
    const w = words[i];
    if (w.startsWith('"')) {
      let j = i;
      while (j < words.length - 1 && !(j === i ? w.length > 1 && w.endsWith('"') : words[j].endsWith('"'))) j++;
      const lit = words.slice(i, j + 1).join(' ');
      keep.push(lit.replace(/^"/, '').replace(/"$/, ''));
      i = j + 1;
      continue;
    }
    if (w.length > 1 && w.startsWith('@')) {
      const rest = [w.slice(1), ...words.slice(i + 1)];
      const self = /^(ben|me|bana|beni)$/.test(clean(rest[0]));
      const hit = self ? { take: 1, item: me } : pick(rest, people, 3);
      if (hit) {
        if (!out.assignees.some((a) => a.id === hit.item.id)) out.assignees.push(hit.item);
        out.tokens.push({ kind: 'person', text: span(i, hit.take), value: hit.item.id });
        i += hit.take;
        continue;
      }
    }
    if (w.length > 1 && w.startsWith('#') && !out.account) {
      const hit = pick([w.slice(1), ...words.slice(i + 1)], accounts, 4);
      if (hit) {
        out.account = hit.item;
        out.tokens.push({ kind: 'account', text: span(i, hit.take), value: hit.item.id });
        i += hit.take;
        continue;
      }
    }
    if (w.length > 1 && w.startsWith('!') && !out.priority) {
      const p = PRIORITIES.find(([re]) => re.test(clean(w.slice(1))));
      if (p) {
        out.priority = p[1];
        out.tokens.push({ kind: 'priority', text: w, value: p[1] });
        i += 1;
        continue;
      }
    }
    if (!out.repeat) {
      const r = repeatAt(folded.slice(i), day0);
      if (r) {
        out.repeat = r.repeat;
        out.tokens.push({ kind: 'repeat', text: span(i, r.take), value: `${r.repeat.every}:${r.repeat.unit}` });
        if (r.due && !out.dueDate) out.dueDate = iso(r.due);
        i += r.take;
        continue;
      }
    }
    if (!out.tokens.some((t) => t.kind === 'due')) {
      // "by friday", "due tomorrow", "on 15 nov": the little word before the date goes with it.
      const lead = /^(by|on|due|until|till)$/.test(folded[i] ?? '') ? 1 : 0;
      const d = dateAt(folded.slice(i + lead), day0);
      if (d) {
        out.dueDate = iso(d.date);
        out.tokens.push({ kind: 'due', text: span(i, d.take + lead), value: iso(d.date) });
        i += d.take + lead;
        continue;
      }
    }
    if (w.length > 1 && (w.startsWith('@') || w.startsWith('#')) && /[\p{L}\d]/u.test(w.slice(1))) out.unknown.push(w);
    keep.push(w);
    i += 1;
  }
  out.title = keep
    .join(' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/^[\s,.;:–—-]+|[\s,;:–—-]+$/g, '')
    .trim();
  return out;
}

/**
 * The × on a chip. A person, customer or priority is taken out of the line;
 * words read as a date or a rhythm stay, in quotes, as part of the title.
 */
export function removeToken(line: string, token: { kind: TokenKind; text: string }): string {
  const i = line.indexOf(token.text);
  if (i < 0) return line;
  const keepWords = token.kind === 'due' || token.kind === 'repeat';
  const mid = keepWords ? `"${token.text}"` : '';
  return `${line.slice(0, i)}${mid}${line.slice(i + token.text.length)}`.replace(/[ \t]{2,}/g, ' ').trim();
}

/** The word being typed at the caret, when it is an @ or # pick. */
export function pickAt(text: string, caret: number): { kind: '@' | '#'; query: string; start: number; end: number } | null {
  let start = caret;
  while (start > 0 && !/\s/.test(text[start - 1])) start--;
  const word = text.slice(start, caret);
  if (word.length < 1 || (word[0] !== '@' && word[0] !== '#')) return null;
  if (start > 0 && !/\s/.test(text[start - 1])) return null;
  let end = caret;
  while (end < text.length && !/\s/.test(text[end])) end++;
  return { kind: word[0] as '@' | '#', query: word.slice(1), start, end };
}
