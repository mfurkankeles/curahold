// Bringing tasks in from a file (a CSV or Excel export of whatever the team
// used before): which column is what, and how the values other tools write
// become Curahold's — a date, a column on the board, people, a priority.
import { parseDate } from './fields';
import type { Locale } from './i18n';
import { ticketPriorityOf } from './records';

export const TASK_IMPORT_FIELDS = ['title', 'description', 'status', 'assignee', 'dueDate', 'startDate', 'priority', 'account', 'doneAt'] as const;
export type TaskImportField = (typeof TASK_IMPORT_FIELDS)[number];
export type TaskImportMapping = Partial<Record<TaskImportField, string>>;

export const fold = (s: string) =>
  s
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/\s+/g, ' ')
    .trim();

// What other tools (and people's own sheets) call these columns, in English and Turkish.
const HEADERS: Record<TaskImportField, string[]> = {
  title: ['title', 'name', 'task', 'task name', 'summary', 'subject', 'card name', 'item', 'item name', 'başlık', 'görev', 'görev adı', 'konu', 'iş', 'ad', 'adı'],
  description: ['description', 'notes', 'note', 'details', 'body', 'card description', 'açıklama', 'not', 'notlar', 'detay', 'ayrıntı'],
  status: ['status', 'state', 'section', 'column', 'list', 'list name', 'stage', 'section/column', 'group', 'durum', 'sütun', 'liste', 'aşama', 'bölüm'],
  assignee: ['assignee', 'assignees', 'assigned to', 'assignee email', 'owner', 'responsible', 'person', 'people', 'members', 'atanan', 'atananlar', 'sorumlu', 'kişi', 'sahibi', 'üye', 'üyeler'],
  dueDate: ['due', 'due date', 'deadline', 'end date', 'due on', 'bitiş', 'bitiş tarihi', 'son tarih', 'termin', 'teslim tarihi'],
  startDate: ['start', 'start date', 'start on', 'begin', 'başlangıç', 'başlangıç tarihi'],
  priority: ['priority', 'öncelik', 'önem'],
  account: ['account', 'account name', 'customer', 'customer name', 'client', 'company', 'partner', 'müşteri', 'müşteri adı', 'firma', 'şirket', 'hesap', 'marka'],
  doneAt: ['completed', 'completed at', 'completed on', 'completion date', 'date completed', 'done at', 'closed', 'closed at', 'resolved', 'tamamlanma', 'tamamlanma tarihi', 'bitirilme tarihi', 'kapanış tarihi'],
};
const BY_HEADER = new Map<string, TaskImportField>();
for (const f of TASK_IMPORT_FIELDS) for (const h of HEADERS[f]) if (!BY_HEADER.has(fold(h))) BY_HEADER.set(fold(h), f);

/** A first guess at which column is what; each field is given to one column at most. */
export function guessTaskMapping(headers: string[]): TaskImportMapping {
  const out: TaskImportMapping = {};
  for (const h of headers) {
    const f = BY_HEADER.get(fold(h));
    if (f && !out[f]) out[f] = h;
  }
  return out;
}

const MONTHS: Record<string, number> = {};
[
  ['jan', 'january', 'oca', 'ocak'],
  ['feb', 'february', 'sub', 'subat'],
  ['mar', 'march', 'mart'],
  ['apr', 'april', 'nis', 'nisan'],
  ['may', 'mayis'],
  ['jun', 'june', 'haz', 'haziran'],
  ['jul', 'july', 'tem', 'temmuz'],
  ['aug', 'august', 'agu', 'agustos'],
  ['sep', 'sept', 'september', 'eyl', 'eylul'],
  ['oct', 'october', 'eki', 'ekim'],
  ['nov', 'november', 'kas', 'kasim'],
  ['dec', 'december', 'ara', 'aralik'],
].forEach((names, i) => names.forEach((n) => (MONTHS[n] = i + 1)));

const ymd = (y: number, m: number, d: number) => {
  if (y < 100) y += 2000;
  const t = new Date(Date.UTC(y, m - 1, d));
  return y >= 1990 && y <= 2100 && t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? t.toISOString().slice(0, 10) : null;
};

/**
 * A day, however the file wrote it: 2027-01-15 (with or without a time),
 * 15.01.2027, 15/01/2027 or 01/15/2027 (the locale decides when it could be
 * either), 15 Jan 2027, Jan 15, 2027, 15/Jan/27, 15 Ocak 2027, or a Unix time.
 */
export function parseDay(raw: unknown, locale: Locale): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d{13}$/.test(s)) return new Date(Number(s)).toISOString().slice(0, 10);
  if (/^\d{10}$/.test(s)) return new Date(Number(s) * 1000).toISOString().slice(0, 10);
  const direct = parseDate(s, locale) ?? parseDate(s.split(/[ T,]/)[0], locale);
  if (direct) return direct;
  const words = fold(s.replace(/(\d+)(st|nd|rd|th)\b/gi, '$1'))
    .replace(/[,.]/g, ' ')
    .split(/[\s/-]+/)
    .filter(Boolean);
  const at = words.findIndex((w) => MONTHS[w] !== undefined);
  if (at < 0) return null;
  const month = MONTHS[words[at]];
  const nums = words.filter((w, i) => i !== at && /^\d{1,4}$/.test(w)).map(Number);
  // "15 Jan 2027", "Jan 15 2027", "15/Jan/27": the day is the number next to the month that can be one.
  const year = nums.find((n) => n > 31) ?? (nums.length >= 2 ? nums[nums.length - 1] : undefined);
  const day = nums.find((n) => n >= 1 && n <= 31 && n !== year) ?? (nums.length >= 2 ? nums[0] : undefined);
  if (year === undefined || day === undefined) return null;
  return ymd(year, month, day);
}

const DONE_WORDS = /^(done|complete|completed|closed|resolved|finished|shipped|tamam|tamamlandi|bitti|kapandi|kapali|cozuldu|yapildi)$/;
const YES = /^(true|yes|y|1|x|✓|evet|e)$/;
// What other tools call "not started" and "being worked on".
const TODO_WORDS = /^(to do|todo|open|new|not started|backlog|planned|yapilacak|acik|yeni|baslamadi|bekliyor|planlandi)$/;
const DOING_WORDS = /^(in progress|doing|started|working on it|wip|in review|review|ongoing|active|devam ediyor|yapiliyor|suruyor|baslandi|incelemede|uzerinde calisiliyor)$/;

/**
 * The board column a file's status belongs to: one with the same name; else,
 * for the words every tool uses, the first column ("to do"), the first one
 * after it that is not finished ("in progress"), or the first finished one
 * ("done"). Null when nothing fits (the task then goes to the first column).
 */
export function columnFor(raw: unknown, columns: { key: string; name: string; done?: boolean }[]): string | null {
  const s = fold(String(raw ?? ''));
  if (!s) return null;
  const same = columns.find((c) => fold(c.name) === s || c.key === s);
  if (same) return same.key;
  if (DONE_WORDS.test(s) || YES.test(s)) return columns.find((c) => c.done)?.key ?? null;
  if (TODO_WORDS.test(s)) return columns[0]?.key ?? null;
  // "In progress" in a tool with other column names: the first column after the first that is not a finished one.
  if (DOING_WORDS.test(s)) return columns.find((c, i) => i > 0 && !c.done)?.key ?? null;
  return null;
}

/** "Ada Demir; lena@demo.example & Mert" → the separate names. */
export function splitPeople(raw: unknown): string[] {
  return String(raw ?? '')
    .split(/[,;/&\n]|\s+(?:and|ve)\s+/i)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 10);
}

/** Who a name or an email in the file is: by email, by full name, or by a first name only one person has. */
export function matchPerson(raw: string, people: { id: string; name: string; email: string }[]): string | null {
  const s = fold(raw);
  if (!s) return null;
  const byEmail = people.find((p) => fold(p.email) === s);
  if (byEmail) return byEmail.id;
  const byName = people.filter((p) => fold(p.name) === s);
  if (byName.length === 1) return byName[0].id;
  const byFirst = people.filter((p) => fold(p.name).split(' ')[0] === s);
  return byFirst.length === 1 ? byFirst[0].id : null;
}

export const priorityFor = (raw: unknown): 'low' | 'normal' | 'high' | 'urgent' => ticketPriorityOf(raw);

export interface TaskImportResult {
  batch: string;
  created: number;
  skipped: number;
  /** Finished tasks left out because they were not asked for. */
  finished: number;
  errors: { row: number; reason: 'title' | 'date' | 'dates' }[];
  unmatched: { people: { name: string; count: number }[]; accounts: { name: string; count: number }[]; statuses: { name: string; count: number }[] };
}
