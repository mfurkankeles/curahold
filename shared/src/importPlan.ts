// Moving house, the second time round: a file from whatever the team used
// before — a spreadsheet of tasks, a list tool's CSV export with sub-tasks
// and comments, a grouped Excel export, a kanban board's JSON export — read
// into rows, matched to Curahold, and planned before anything is written.
//
// The plan is the same for the dry run ("what will come in, what won't") and
// for the import itself; the server makes it with what it knows (the boards,
// the people, the customers) and either reports it or writes it. Nothing here
// talks to any other tool: every source is a file the person exported.
import { normalizeValue } from './fields';
import { translate, type Locale, type MessageKey } from './i18n';
import type { AccountField, Column, TaskField, TaskFieldValue } from './model';
import { OPTION_COLORS } from './model';
import { DOING_WORDS, TASK_IMPORT_FIELDS, TODO_WORDS, columnFor, fold, guessTaskMapping, matchPerson, parseDay, priorityFor, splitPeople, type TaskImportField } from './taskImport';

/** Every place a column can go. `custom` and `comments` may take several columns; the rest one each. */
export const IMPORT_FIELDS = [...TASK_IMPORT_FIELDS, 'list', 'ref', 'parent', 'comments', 'dependsOn', 'points', 'custom'] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export const MULTI_FIELDS: readonly ImportField[] = ['custom', 'comments'];

/** The group a row sat under in a grouped export: offered as a column of its own. */
export const SECTION_COLUMN = '__section';

/** One row of the file: its cells by heading, its own row number, and (in nested exports) its parent row. */
export interface ImportRow {
  /** The row number in the file (the heading is usually 1). */
  n: number;
  c: Record<string, string>;
  /** Index (in the rows) of the row this one sits under: a sub-item. */
  p?: number;
}

export type Layout = 'table' | 'sections' | 'nested' | 'board';

export interface ShapedSheet {
  headers: string[];
  rows: ImportRow[];
  layout: Layout;
  /** A title the file carried above its headings (a board's name), if any. */
  title?: string;
  /** How many groups and sub-items the shape held. */
  sections: number;
  nested: number;
}

const MAX_ROWS = 5000;
const nonEmpty = (r: string[]) => r.filter((x) => (x ?? '').trim() !== '').length;
const SUB_WORDS = new Set(['subitems', 'subitem', 'sub items', 'sub-items', 'subtasks', 'subtask', 'sub-tasks', 'alt ogeler', 'alt oge', 'alt gorevler', 'alt gorev']);

/**
 * Rows of cells → headings and rows. Handles what exports do around a plain
 * table: a title line above the headings, group lines with the headings
 * repeated under each, and blocks of sub-items indented one column under
 * the item they belong to (with their own heading line).
 */
export function shapeMatrix(matrix: string[][]): ShapedSheet {
  const lines = matrix.map((r, i) => ({ cells: r.map((x) => (x ?? '').trim()), n: i + 1 })).filter((l) => nonEmpty(l.cells) > 0);
  const empty: ShapedSheet = { headers: [], rows: [], layout: 'table', sections: 0, nested: 0 };
  if (!lines.length) return empty;
  const widest = Math.max(...lines.slice(0, 30).map((l) => nonEmpty(l.cells)));
  const hi = lines.findIndex((l, i) => i < 15 && nonEmpty(l.cells) >= Math.max(Math.min(2, widest), Math.ceil(widest * 0.6)));
  const at = hi < 0 ? 0 : hi;
  const seen = new Map<string, number>();
  const raw = lines[at].cells;
  const headers = raw.map((h, i) => {
    let name = h || `#${i + 1}`;
    const k = seen.get(name) ?? 0;
    seen.set(name, k + 1);
    if (k) name = `${name} (${k + 1})`;
    return name;
  });
  const above = lines.slice(0, at).filter((l) => nonEmpty(l.cells) === 1).map((l) => l.cells.find(Boolean)!);
  const headFold = raw.map((h) => fold(h));
  const isHeading = (cells: string[]) => {
    const filled = cells.map((c, i) => [fold(c), headFold[i]] as const).filter(([c]) => c);
    return filled.length >= 2 && filled.filter(([c, h]) => c === h).length / filled.length >= 0.8;
  };
  const isSubHeading = (cells: string[]) => !cells[0] && nonEmpty(cells) >= 2 && cells.some((c) => SUB_WORDS.has(fold(c)));

  const rows: ImportRow[] = [];
  let section = above.length && at > 0 && above.length >= 2 ? above[above.length - 1] : '';
  const title = above.length ? above[0] : undefined;
  let sections = section ? 1 : 0;
  let nested = 0;
  let sub: string[] | null = null; // the sub-items' own headings, by column
  let lastTop = -1;
  const extra = new Set<string>();
  for (let i = at + 1; i < lines.length && rows.length < MAX_ROWS; i++) {
    const cells = lines[i].cells;
    if (isHeading(cells)) {
      sub = null;
      continue;
    }
    if (isSubHeading(cells)) {
      sub = cells.map((c) => {
        if (!c) return '';
        // A sub-item column with the same name as an item column fills that column.
        const same = headers.find((h) => fold(h) === fold(c));
        if (same) return same;
        if (SUB_WORDS.has(fold(c))) return headers[0];
        extra.add(c);
        return c;
      });
      continue;
    }
    const next = lines[i + 1]?.cells;
    if (nonEmpty(cells) === 1 && cells[0] && headers.length >= 3 && next && isHeading(next)) {
      section = cells[0];
      sections++;
      sub = null;
      continue;
    }
    if (sub && !cells[0] && lastTop >= 0) {
      const c: Record<string, string> = {};
      sub.forEach((h, j) => {
        if (h && cells[j]) c[h] = cells[j];
      });
      if (section) c[SECTION_COLUMN] = section;
      rows.push({ n: lines[i].n, c, p: lastTop });
      nested++;
      continue;
    }
    sub = null;
    const c: Record<string, string> = {};
    headers.forEach((h, j) => {
      if (cells[j]) c[h] = cells[j];
    });
    if (section) c[SECTION_COLUMN] = section;
    lastTop = rows.length;
    rows.push({ n: lines[i].n, c });
  }
  const all = [...headers, ...[...extra].filter((h) => !headers.includes(h))];
  if (sections) all.push(SECTION_COLUMN);
  return { headers: all, rows, layout: nested ? 'nested' : sections ? 'sections' : 'table', title, sections, nested };
}

/**
 * A kanban board's own export file (JSON): its lists become the columns,
 * cards the tasks, checklist items sub-tasks, comments comments, labels a
 * field. Null when the file is not shaped like one.
 */
export function shapeBoardJson(data: unknown): ShapedSheet | null {
  const d = data as any;
  if (!d || typeof d !== 'object' || !Array.isArray(d.cards) || !Array.isArray(d.lists)) return null;
  const lists = new Map<string, string>(d.lists.map((l: any) => [String(l.id), String(l.name ?? '')]));
  const closedLists = new Set<string>(d.lists.filter((l: any) => l.closed).map((l: any) => String(l.id)));
  const members = new Map<string, string>((Array.isArray(d.members) ? d.members : []).map((m: any) => [String(m.id), String(m.fullName ?? m.username ?? '')]));
  const comments = new Map<string, string[]>();
  for (const a of Array.isArray(d.actions) ? d.actions : []) {
    if (a?.type !== 'commentCard' || !a.data?.card?.id || !a.data?.text) continue;
    const who = members.get(String(a.idMemberCreator)) ?? a.memberCreator?.fullName ?? '';
    const list = comments.get(a.data.card.id) ?? [];
    list.unshift(who ? `${who}: ${a.data.text}` : String(a.data.text));
    comments.set(a.data.card.id, list);
  }
  const H = { title: 'Name', desc: 'Description', list: 'Board', status: 'List', due: 'Due', start: 'Start', who: 'Members', labels: 'Labels', comments: 'Comments', id: 'Card ID', done: 'Completed' };
  const rows: ImportRow[] = [];
  const board = String(d.name ?? '');
  const byCard = new Map<string, number>();
  for (const card of d.cards) {
    if (rows.length >= MAX_ROWS) break;
    if (card.closed || closedLists.has(String(card.idList))) continue;
    const c: Record<string, string> = {
      [H.title]: String(card.name ?? ''),
      [H.desc]: String(card.desc ?? ''),
      [H.list]: board,
      [H.status]: lists.get(String(card.idList)) ?? '',
      [H.due]: card.due ? String(card.due).slice(0, 10) : '',
      [H.start]: card.start ? String(card.start).slice(0, 10) : '',
      [H.who]: (card.idMembers ?? []).map((m: string) => members.get(m) ?? '').filter(Boolean).join(', '),
      [H.labels]: (card.labels ?? []).map((l: any) => l.name || l.color || '').filter(Boolean).join(', '),
      [H.comments]: (comments.get(card.id) ?? []).join('\n\n'),
      [H.id]: String(card.id ?? ''),
      [H.done]: card.dueComplete ? 'yes' : '',
    };
    for (const k of Object.keys(c)) if (!c[k]) delete c[k];
    byCard.set(String(card.id), rows.length);
    rows.push({ n: rows.length + 1, c });
  }
  let nested = 0;
  for (const cl of Array.isArray(d.checklists) ? d.checklists : []) {
    const p = byCard.get(String(cl.idCard));
    if (p === undefined) continue;
    for (const item of cl.checkItems ?? []) {
      if (rows.length >= MAX_ROWS) break;
      const c: Record<string, string> = { [H.title]: String(item.name ?? ''), [H.list]: board };
      if (item.state === 'complete') c[H.done] = 'yes';
      if (item.due) c[H.due] = String(item.due).slice(0, 10);
      rows.push({ n: rows.length + 1, c, p });
      nested++;
    }
  }
  return { headers: Object.values(H), rows, layout: 'board', title: board || undefined, sections: lists.size, nested };
}

// ------------------------------------------------------------------ mapping

const MORE: Partial<Record<ImportField, string[]>> = {
  ref: ['id', 'task id', 'item id', 'card id', 'issue id', 'issue key', 'key', 'gid', 'task gid', 'unique id', 'görev no', 'görev id', 'kimlik', 'no', '#'],
  parent: ['parent', 'parent id', 'parent task', 'parent task id', 'parent item', 'parent issue', 'parent key', 'parent summary', 'parent name', 'subtask of', 'üst görev', 'ana görev', 'üst öğe', 'bağlı olduğu görev'],
  comments: ['comments', 'comment', 'updates', 'update', 'latest update', 'activity', 'yorumlar', 'yorum', 'güncellemeler'],
  dependsOn: ['depends on', 'dependencies', 'dependency', 'blocked by', 'waiting on', 'waits for', 'predecessors', 'dependent on', 'is blocked by', 'bağımlılık', 'bağımlılıklar', 'şuna bağlı', 'engelleyen', 'önce bitmesi gereken'],
  points: ['story points', 'story point', 'points', 'story point estimate', 'sprint points', 'puan', 'hikaye puanı', 'efor puanı'],
  // Turkish exports say "Liste" ("Liste adı") for the list a task lives in; without it the Boards step was skipped.
  list: ['project', 'projects', 'board', 'board name', 'folder', 'folder name', 'list', 'list name', 'proje', 'projeler', 'pano', 'pano adı', 'klasör', 'liste', 'liste adı', 'listeler'],
};
const MORE_BY = new Map<string, ImportField>();
for (const [f, names] of Object.entries(MORE)) for (const h of names!) MORE_BY.set(fold(h), f as ImportField);

/** Which field each heading goes to, at a first guess. */
export function guessImportMapping(headers: string[]): Record<string, ImportField | 'skip'> {
  const base = guessTaskMapping(headers);
  const out: Record<string, ImportField | 'skip'> = {};
  for (const h of headers) out[h] = 'skip';
  for (const f of TASK_IMPORT_FIELDS) if (base[f]) out[base[f]!] = f;
  // A list tool's export has a status AND a list: then the status is the column, and the list is where the task lives.
  const realStatus = headers.find((h) => ['status', 'state', 'durum', 'section/column'].includes(fold(h)));
  if (realStatus) {
    for (const h of headers) if (out[h] === 'status') out[h] = 'skip';
    out[realStatus] = 'status';
  }
  const taken = new Set(Object.values(out));
  for (const h of headers) {
    if (out[h] !== 'skip' && !(out[h] === 'status' && !realStatus)) continue;
    const f = MORE_BY.get(fold(h));
    if (!f) continue;
    if (out[h] === 'status' && f === 'list') continue;
    if (!MULTI_FIELDS.includes(f) && taken.has(f)) continue;
    out[h] = f;
    taken.add(f);
  }
  // The groups of a grouped export: their column when there is no status column, else where the task lives.
  if (headers.includes(SECTION_COLUMN)) out[SECTION_COLUMN] = !taken.has('status') ? 'status' : !taken.has('list') ? 'list' : 'skip';
  return out;
}

// ------------------------------------------------------------- departments

/** The owner's departments, in the order work flows through them. Onboarding is optional. */
export const DEPARTMENTS = ['inside', 'sales', 'onboarding', 'success', 'product', 'finance'] as const;
export type Department = (typeof DEPARTMENTS)[number];

const DEPT_WORDS: Record<Department, string[]> = {
  inside: ['inside sales', 'sdr', 'bdr', 'lead', 'leads', 'prospect', 'prospects', 'prospecting', 'outbound', 'inbound', 'cold', 'iç satış', 'aday', 'adaylar', 'potansiyel', 'ön satış'],
  sales: ['sales', 'deal', 'deals', 'pipeline', 'proposal', 'proposals', 'offer', 'quote', 'quotes', 'demo', 'demos', 'satış', 'teklif', 'teklifler', 'fırsat', 'fırsatlar'],
  onboarding: ['onboarding', 'kickoff', 'kick-off', 'implementation', 'setup', 'go live', 'go-live', 'rollout', 'kurulum', 'devreye alma', 'başlangıç', 'canlıya geçiş'],
  success: ['customer success', 'success', 'cs', 'renewal', 'renewals', 'account', 'accounts', 'account management', 'qbr', 'review', 'reviews', 'support', 'tickets', 'ticket', 'helpdesk', 'escalation', 'escalations', 'churn', 'health', 'müşteri başarısı', 'yenileme', 'yenilemeler', 'destek', 'talep', 'talepler', 'şikayet', 'hesap yönetimi'],
  product: ['product', 'roadmap', 'backlog', 'sprint', 'sprints', 'bug', 'bugs', 'feature', 'features', 'feature requests', 'engineering', 'dev', 'development', 'release', 'releases', 'design', 'ux', 'ürün', 'yol haritası', 'hata', 'hatalar', 'geliştirme', 'özellik', 'sürüm'],
  finance: ['finance', 'invoice', 'invoices', 'billing', 'payment', 'payments', 'collections', 'accounting', 'budget', 'expenses', 'finans', 'fatura', 'faturalar', 'ödeme', 'ödemeler', 'tahsilat', 'muhasebe', 'bütçe'],
};
const DEPT_FOLDED = DEPARTMENTS.map((d) => [d, DEPT_WORDS[d].map(fold)] as const);

/** The department a list's name points to, if any (whole words only: "Sales Q1" yes, "Wholesale" no). */
export function departmentOf(name: string): Department | null {
  // Whole words, and their plain plurals ("QBRs", "Invoices").
  const tokens = fold(name).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ');
  const words = ` ${[...tokens, ...tokens.map((w) => w.replace(/s$/, ''))].join(' ')} ${tokens.map((w) => w.replace(/s$/, '')).join(' ')} `;
  let best: { d: Department; len: number } | null = null;
  for (const [d, list] of DEPT_FOLDED) for (const w of list) if (words.includes(` ${w} `) && (!best || w.length > best.len)) best = { d, len: w.length };
  return best?.d ?? null;
}

/** A department's name in the reader's language, for the import plan. */
export const departmentName = (d: Department, locale: Locale) => translate(locale, `imp.dept.${d}` as MessageKey);

// ---------------------------------------------------------------- targets

/** Where a list's tasks go: an existing board, or a new one (made just before the import). */
export type Target = { board: string } | { create: string };

export interface ListInfo {
  name: string;
  rows: number;
}

/** The lists in the file (the "list" column), with their sizes, in the order they first appear. */
export function listsOf(rows: ImportRow[], listColumn: string | undefined): ListInfo[] {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (r.p !== undefined) continue;
    const name = listColumn ? (r.c[listColumn] ?? '').trim().slice(0, 80) : '';
    out.set(name, (out.get(name) ?? 0) + 1);
  }
  return [...out].map(([name, n]) => ({ name, rows: n }));
}

/**
 * Where each list should go, at a first suggestion: a board with the same
 * name; else the department board its name points to (one board per
 * department, whatever number of lists feed it); else the board the import
 * was started from, or one board named after the file. Forty lists come in
 * as a handful of department boards, not forty new ones.
 */
export function suggestTargets(lists: ListInfo[], boards: { id: string; name: string }[], opts: { from?: string | null; fileTitle: string; locale: Locale; keepEach?: boolean }): Record<string, Target> {
  const out: Record<string, Target> = {};
  const byName = new Map(boards.map((b) => [fold(b.name), b.id]));
  const fallback: Target = opts.from ? { board: opts.from } : { create: opts.fileTitle.slice(0, 80) || translate(opts.locale, 'imp.newBoardName') };
  for (const l of lists) {
    const same = l.name ? byName.get(fold(l.name)) : undefined;
    if (same) {
      out[l.name] = { board: same };
      continue;
    }
    if (opts.keepEach && l.name) {
      out[l.name] = { create: l.name };
      continue;
    }
    const d = l.name ? departmentOf(l.name) : null;
    if (d) {
      const name = departmentName(d, opts.locale);
      const there = byName.get(fold(name)) ?? boards.find((b) => departmentOf(b.name) === d)?.id;
      out[l.name] = there ? { board: there } : { create: name };
      continue;
    }
    out[l.name] = lists.length === 1 && l.name && !opts.from ? { create: l.name } : fallback;
  }
  return out;
}

/** A stable key for an import target: an existing board, or a new one by its folded name. */
export const targetKey = (t: Target) => ('board' in t ? `b:${t.board}` : `n:${fold(t.create)}`);

// ------------------------------------------------------------------- fields

const slug = (s: string) => {
  const k = fold(s).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 36);
  return /^[a-z]/.test(k) ? k : `f_${k || 'field'}`.slice(0, 40);
};

/** What a column of values looks like as a field: a number, a date, a short list of choices, a link, or text. */
export function inferField(header: string, values: string[], locale: Locale, taken: Set<string>): TaskField {
  let key = slug(header);
  for (let i = 2; taken.has(key); i++) key = `${slug(header).slice(0, 36)}_${i}`;
  taken.add(key);
  const vals = values.map((v) => v.trim()).filter(Boolean);
  const label = { [locale]: header.slice(0, 80) };
  const all = (ok: (v: string) => boolean) => vals.length > 0 && vals.every(ok);
  const as = (type: AccountField['type']) => (v: string) => !('error' in normalizeValue({ key, label, type } as AccountField, v, locale));
  if (all(as('number'))) return { key, label, type: 'number' };
  if (all((v) => parseDay(v, locale) !== null) && all((v) => /\d/.test(v) && !/^\d+([.,]\d+)?$/.test(v))) return { key, label, type: 'date' };
  if (all((v) => /^https?:\/\//i.test(v))) return { key, label, type: 'url' };
  if (all(as('email'))) return { key, label, type: 'email' };
  const distinct = [...new Map(vals.map((v) => [fold(v), v.slice(0, 80)])).values()];
  if (distinct.length >= 1 && distinct.length <= 12 && vals.length >= distinct.length * 2) {
    const used = new Set<string>();
    return {
      key,
      label,
      type: 'select',
      options: distinct.map((v, i) => {
        let k = slug(v).slice(0, 36);
        for (let j = 2; used.has(k); j++) k = `${slug(v).slice(0, 34)}_${j}`;
        used.add(k);
        return { key: k, label: { [locale]: v }, color: OPTION_COLORS[i % OPTION_COLORS.length] };
      }),
    };
  }
  return { key, label, type: 'text' };
}

function fieldValue(def: TaskField, raw: string, locale: Locale): TaskFieldValue | undefined {
  if (!raw.trim()) return undefined;
  if (def.type === 'checkbox') return /^(true|yes|y|1|x|✓|evet|e)$/i.test(raw.trim());
  if (def.type === 'person') return undefined;
  if (def.type === 'date') return parseDay(raw, locale) ?? undefined;
  const r = normalizeValue(def as unknown as AccountField, raw, locale);
  return 'error' in r ? undefined : (r.value as TaskFieldValue);
}

// ---------------------------------------------------------------- columns

const DONE_LIKE = /^(done|complete|completed|closed|resolved|finished|shipped|tamam|tamamlandi|bitti|kapandi|kapali|cozuldu|yapildi)$/;

/** A new board's columns: the file's own statuses in the order they appear (finished ones last), or the usual three. */
export function columnsFromStatuses(statuses: string[], fallback: Column[]): Column[] {
  const seen = new Map<string, string>();
  for (const s of statuses) {
    const f = fold(s);
    if (f && !seen.has(f) && seen.size < 12) seen.set(f, s.slice(0, 40));
  }
  if (seen.size < 2) return fallback;
  const cols = [...seen].map(([f, name], i) => ({ key: (slug(name).slice(0, 30) || `c${i}`).replace(/^f_/, 'c_'), name, done: DONE_LIKE.test(f) }));
  const keys = new Set<string>();
  for (const c of cols) {
    let k = c.key;
    for (let j = 2; keys.has(k); j++) k = `${c.key}_${j}`;
    keys.add(k);
    c.key = k;
  }
  if (!cols.some((c) => c.done)) cols.push({ ...fallback[fallback.length - 1], done: true });
  // Not started first, then being worked on, then the rest in the file's order; finished last.
  const rank = (c: Column) => (c.done ? 3 : TODO_WORDS.test(fold(c.name)) ? 0 : DOING_WORDS.test(fold(c.name)) ? 1 : 2);
  return cols.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i).map((x) => x.c);
}

// -------------------------------------------------------------------- plan

export interface PlanBoard {
  key: string;
  /** An existing board, or null for one made for the import. */
  id: string | null;
  name: string;
  columns: Column[];
  taskFields: TaskField[];
  /** The person may add fields to it (new boards: always). */
  canAddFields: boolean;
}

export interface PlanInput {
  rows: ImportRow[];
  /** Heading → field (`custom` and `comments` may repeat). */
  mapping: Record<string, ImportField | 'skip'>;
  /** List name ('' for rows with none) → where it goes. */
  targets: Record<string, Target>;
  locale: Locale;
  includeDone: boolean;
}

export interface PlanCtx {
  boards: PlanBoard[];
  people: { id: string; name: string; email: string }[];
  accounts: { id: string; name: string }[];
  today: string;
  /** Makes the new tasks' ids (the server passes crypto.randomUUID). */
  newId: () => string;
  fallbackColumns: Column[];
}

export interface PlannedTask {
  id: string;
  board: string;
  n: number;
  title: string;
  description: string;
  status: string;
  assignees: string[];
  accountId: string | null;
  due: string | null;
  start: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  doneAt: string | null;
  parentId: string | null;
  points: number | null;
  fields: Record<string, TaskFieldValue>;
}

export type Reason = 'title' | 'finished' | 'date' | 'dates' | 'parent' | 'depends' | 'loop' | 'field' | 'fieldsFull' | 'points' | 'deep';

export interface PlanBoardReport {
  key: string;
  id: string | null;
  name: string;
  isNew: boolean;
  lists: string[];
  tasks: number;
  subtasks: number;
  comments: number;
  links: number;
  /** Fields made for the import (their labels), and columns of a new board. */
  newFields: string[];
  columns: string[];
}

export interface ImportReport {
  boards: PlanBoardReport[];
  totals: { tasks: number; subtasks: number; comments: number; links: number; fields: number };
  /** What will not come in, by reason, with the rows it concerns. */
  left: { reason: Reason; n: number; rows: number[] }[];
  /** Things that came in but not quite as written, by reason. */
  notes: { reason: Reason; n: number; rows: number[] }[];
  unmatched: { people: { name: string; count: number }[]; accounts: { name: string; count: number }[]; statuses: { name: string; count: number }[] };
}

export interface ImportPlan {
  tasks: PlannedTask[];
  comments: { taskId: string; body: string }[];
  /** `from` must be finished before `to` can start. */
  links: { from: string; to: string }[];
  /** Fields to add, per board key. */
  fields: Record<string, TaskField[]>;
  boards: PlanBoard[];
  report: ImportReport;
}

/** Splits a comments cell into its comments: blank lines separate them. */
export const splitComments = (raw: string) =>
  raw
    .split(/\r?\n\s*\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 50);

const splitRefs = (raw: string) =>
  raw
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 20);

/**
 * Plans a task import from spreadsheet rows and a mapping: boards (existing or new), columns, people, fields and the
 * row problems, before anything is written. Pure, so the dry run and the import agree. Split plan: docs/HANDOVER.md.
 */
export function planImport(input: PlanInput, ctx: PlanCtx): ImportPlan {
  const { rows, mapping, locale } = input;
  const col = (f: ImportField) => Object.keys(mapping).find((h) => mapping[h] === f);
  const cols = (f: ImportField) => Object.keys(mapping).filter((h) => mapping[h] === f);
  const cell = (r: ImportRow, h: string | undefined) => (h ? (r.c[h] ?? '').trim() : '');
  const m = Object.fromEntries(IMPORT_FIELDS.map((f) => [f, col(f)])) as Record<ImportField, string | undefined>;
  const customCols = cols('custom');
  const commentCols = cols('comments');

  const left = new Map<Reason, number[]>();
  const notes = new Map<Reason, number[]>();
  const add = (map: Map<Reason, number[]>, r: Reason, n: number) => map.set(r, [...(map.get(r) ?? []), n]);
  const miss = { people: new Map<string, number>(), accounts: new Map<string, number>(), statuses: new Map<string, number>() };
  const note = (map: Map<string, number>, name: string) => map.set(name, (map.get(name) ?? 0) + 1);

  // Boards: every target, existing or new; new ones take their columns from the file's statuses.
  const boards = new Map<string, PlanBoard & { lists: string[] }>();
  const known = new Map(ctx.boards.map((b) => [`b:${b.id}`, b]));
  const listOf = (r: ImportRow) => cell(r, m.list).slice(0, 80);
  // A sub-item belongs to its parent's list.
  const rowList = (r: ImportRow) => listOf(r.p !== undefined && rows[r.p] ? rows[r.p] : r);
  const fallbackTarget = input.targets[''] ?? Object.values(input.targets)[0];
  if (!fallbackTarget) throw new Error('no target');
  const targetOf = (list: string): Target => input.targets[list] ?? fallbackTarget;
  for (const [list, t] of Object.entries(input.targets)) {
    const key = targetKey(t);
    let b = boards.get(key);
    if (!b) {
      const there = known.get(key);
      if (there) b = { ...there, taskFields: [...there.taskFields], lists: [] };
      else if ('create' in t) {
        const statuses = m.status ? rows.filter((r) => targetKey(targetOf(rowList(r))) === key).map((r) => cell(r, m.status)) : [];
        b = { key, id: null, name: t.create.slice(0, 80), columns: columnsFromStatuses(statuses, ctx.fallbackColumns), taskFields: [], canAddFields: true, lists: [] };
      } else continue;
      boards.set(key, b);
    }
    b.lists.push(list);
  }
  // Several lists into one board: the list each task came from is kept in a choice field.
  const fromList = new Map<string, TaskField>();
  const fields: Record<string, TaskField[]> = {};
  for (const b of boards.values()) {
    const named = b.lists.filter(Boolean);
    if (named.length < 2) continue;
    const label = translate(locale, 'imp.fromList');
    const existing = b.taskFields.find((f) => fold(Object.values(f.label)[0] ?? '') === fold(label) && f.type === 'select');
    if (existing) {
      fromList.set(b.key, existing);
      continue;
    }
    if (!b.canAddFields || b.taskFields.length >= 20) continue;
    const taken = new Set(b.taskFields.map((f) => f.key));
    const f: TaskField = { key: taken.has('from_list') ? 'from_list_2' : 'from_list', label: { [locale]: label }, type: 'select', options: [] };
    const used = new Set<string>();
    f.options = named.slice(0, 100).map((name, i) => {
      let k = slug(name).slice(0, 36);
      for (let j = 2; used.has(k); j++) k = `${slug(name).slice(0, 34)}_${j}`;
      used.add(k);
      return { key: k, label: { [locale]: name }, color: OPTION_COLORS[i % OPTION_COLORS.length] };
    });
    b.taskFields.push(f);
    (fields[b.key] ??= []).push(f);
    fromList.set(b.key, f);
  }
  // Custom columns: a field on each board that gets values, the same one if the board has it by name.
  const customFor = new Map<string, Map<string, TaskField | null>>(); // board key → heading → field (null: no room)
  for (const b of boards.values()) {
    const map = new Map<string, TaskField | null>();
    const taken = new Set(b.taskFields.map((f) => f.key));
    for (const h of customCols) {
      const same = b.taskFields.find((f) => Object.values(f.label).some((l) => l && fold(l) === fold(h)));
      if (same) {
        map.set(h, same);
        continue;
      }
      if (!b.canAddFields || b.taskFields.length >= 20) {
        map.set(h, null);
        continue;
      }
      const values = rows.filter((r) => targetKey(targetOf(rowList(r))) === b.key).map((r) => cell(r, h));
      if (!values.some(Boolean)) continue;
      const f = inferField(h, values, locale, taken);
      b.taskFields.push(f);
      (fields[b.key] ??= []).push(f);
      map.set(h, f);
    }
    customFor.set(b.key, map);
  }

  // The rows' own ids and titles, for parents and dependencies that name them.
  const refOf = new Map<string, number>();
  const titleOf = new Map<string, number[]>();
  rows.forEach((r, i) => {
    const ref = cell(r, m.ref);
    if (ref && !refOf.has(fold(ref))) refOf.set(fold(ref), i);
    const t = fold(cell(r, m.title));
    if (t) titleOf.set(t, [...(titleOf.get(t) ?? []), i]);
  });
  const find = (raw: string): number | undefined => {
    const k = fold(raw);
    if (!k) return undefined;
    const byRef = refOf.get(k);
    if (byRef !== undefined) return byRef;
    const byTitle = titleOf.get(k);
    return byTitle && byTitle.length === 1 ? byTitle[0] : undefined;
  };
  // The row each row sits under: the shape of the file first, then a parent column.
  const parentIdx = rows.map((r, i) => {
    if (r.p !== undefined) return r.p;
    const raw = cell(r, m.parent);
    if (!raw) return undefined;
    const p = find(raw);
    if (p === undefined || p === i) {
      add(notes, 'parent', r.n);
      return undefined;
    }
    return p;
  });
  // One level of sub-tasks: deeper ones hang under the top task; a loop is cut.
  const topOf = (i: number): number | undefined => {
    let at = parentIdx[i];
    const seen = new Set([i]);
    let depth = 0;
    while (at !== undefined && parentIdx[at] !== undefined) {
      if (seen.has(at)) return undefined;
      seen.add(at);
      at = parentIdx[at];
      depth++;
    }
    if (depth > 0) add(notes, 'deep', rows[i].n);
    return at;
  };

  const ids = rows.map(() => ctx.newId());
  const kept = new Array<boolean>(rows.length).fill(false);
  const tasks: PlannedTask[] = [];
  const comments: { taskId: string; body: string }[] = [];
  const per = new Map<string, { tasks: number; subtasks: number; comments: number; links: number }>();
  const bump = (k: string, f: 'tasks' | 'subtasks' | 'comments' | 'links') => {
    const x = per.get(k) ?? { tasks: 0, subtasks: 0, comments: 0, links: 0 };
    x[f]++;
    per.set(k, x);
  };
  const order = rows.map((_, i) => i).sort((a, b) => Number(topOf(a) !== undefined) - Number(topOf(b) !== undefined) || a - b);
  const boardOfRow = new Map<number, PlanBoard & { lists: string[] }>();
  for (const i of order) {
    const r = rows[i];
    const top = topOf(i);
    const title = cell(r, m.title).slice(0, 300);
    if (!title) {
      if (Object.values(r.c).some((v) => v.trim())) add(left, 'title', r.n);
      continue;
    }
    // A sub-task lives on its parent's board; a parent left out leaves it a task of its own.
    const parentKept = top !== undefined && kept[top];
    if (top !== undefined && !parentKept) add(notes, 'parent', r.n);
    const b = parentKept ? boardOfRow.get(top!)! : boards.get(targetKey(targetOf(listOf(r))));
    if (!b) continue;
    const columns = b.columns;
    const doneKeys = columns.filter((x) => x.done).map((x) => x.key);
    const rawStatus = cell(r, m.status);
    let status = columns[0].key;
    if (rawStatus) {
      const hit = columnFor(rawStatus, columns);
      if (hit) status = hit;
      else note(miss.statuses, rawStatus.slice(0, 60));
    }
    const doneOn = m.doneAt ? parseDay(cell(r, m.doneAt), locale) ?? (/^(yes|true|x|✓|evet)$/i.test(cell(r, m.doneAt)) ? ctx.today : null) : null;
    if (doneOn && !doneKeys.includes(status) && doneKeys.length) status = doneKeys[0];
    const finished = doneKeys.includes(status);
    if (finished && !input.includeDone) {
      add(left, 'finished', r.n);
      continue;
    }
    const dueRaw = cell(r, m.dueDate);
    const startRaw = cell(r, m.startDate);
    const due = dueRaw ? parseDay(dueRaw, locale) : null;
    let start = startRaw ? parseDay(startRaw, locale) : null;
    if ((dueRaw && !due) || (startRaw && !start)) add(notes, 'date', r.n);
    if (start && due && start > due) {
      start = null;
      add(notes, 'dates', r.n);
    }
    const assignees: string[] = [];
    for (const name of splitPeople(cell(r, m.assignee))) {
      const id = matchPerson(name, ctx.people);
      if (id) assignees.push(id);
      else note(miss.people, name.slice(0, 80));
    }
    const accountName = cell(r, m.account);
    const accountId = accountName ? ctx.accounts.find((a) => fold(a.name) === fold(accountName))?.id ?? null : null;
    if (accountName && !accountId) note(miss.accounts, accountName.slice(0, 80));
    const pointsRaw = cell(r, m.points);
    let points: number | null = null;
    if (pointsRaw) {
      const n = Number(pointsRaw.replace(',', '.'));
      if (Number.isFinite(n) && n >= 0 && n <= 1000) points = n;
      else add(notes, 'points', r.n);
    }
    // The board's own fields; what has no field (no room, or a value it cannot hold) goes into the description.
    const values: Record<string, TaskFieldValue> = {};
    const extra: string[] = [];
    const list = listOf(parentKept ? rows[top!] : r);
    const fl = fromList.get(b.key);
    if (fl && list) {
      const opt = fl.options?.find((o) => Object.values(o.label).some((l) => l && fold(l) === fold(list)));
      if (opt) values[fl.key] = opt.key;
    }
    let roomless = false;
    for (const h of customCols) {
      const raw = cell(r, h);
      if (!raw) continue;
      const def = customFor.get(b.key)?.get(h);
      const v = def ? fieldValue(def, raw, locale) : undefined;
      if (def && v !== undefined) values[def.key] = v;
      else {
        extra.push(`${h}: ${raw.slice(0, 500)}`);
        if (def) add(notes, 'field', r.n);
        else roomless = true;
      }
    }
    if (roomless) add(notes, 'fieldsFull', r.n);
    let description = cell(r, m.description);
    if (extra.length) description = [description, extra.join('\n')].filter(Boolean).join('\n\n');
    const id = ids[i];
    kept[i] = true;
    boardOfRow.set(i, b);
    tasks.push({
      id,
      board: b.key,
      n: r.n,
      title,
      description: description.slice(0, 20000),
      status,
      assignees: [...new Set(assignees)].slice(0, 10),
      accountId,
      due,
      start,
      priority: m.priority ? priorityFor(cell(r, m.priority)) : 'normal',
      doneAt: finished ? `${doneOn ?? (due && due < ctx.today ? due : ctx.today)}T12:00:00Z` : null,
      parentId: parentKept ? ids[top!] : null,
      points,
      fields: values,
    });
    bump(b.key, parentKept ? 'subtasks' : 'tasks');
    for (const h of commentCols)
      for (const body of splitComments(cell(r, h))) {
        comments.push({ taskId: id, body: body.slice(0, 10000) });
        bump(b.key, 'comments');
      }
  }

  // Dependencies between tasks that both came in; a circle of waiting is cut where it closes.
  const links: { from: string; to: string }[] = [];
  const after = new Map<string, Set<string>>();
  const reaches = (a: string, b: string) => {
    const stack = [a];
    const seen = new Set<string>();
    while (stack.length) {
      const x = stack.pop()!;
      if (x === b) return true;
      if (seen.has(x)) continue;
      seen.add(x);
      stack.push(...(after.get(x) ?? []));
    }
    return false;
  };
  if (m.dependsOn)
    rows.forEach((r, i) => {
      if (!kept[i]) return;
      for (const ref of splitRefs(cell(r, m.dependsOn))) {
        const j = find(ref);
        if (j === undefined || !kept[j] || j === i) {
          add(left, 'depends', r.n);
          continue;
        }
        const from = ids[j];
        const to = ids[i];
        if (reaches(to, from)) {
          add(left, 'loop', r.n);
          continue;
        }
        if (after.get(from)?.has(to)) continue;
        after.set(from, new Set([...(after.get(from) ?? []), to]));
        links.push({ from, to });
        bump(boardOfRow.get(i)!.key, 'links');
      }
    });

  const list = (map: Map<Reason, number[]>) => [...map].map(([reason, ns]) => ({ reason, n: ns.length, rows: [...new Set(ns)].slice(0, 200) }));
  const top20 = (map: Map<string, number>) => [...map].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([name, count]) => ({ name, count }));
  const reportBoards: PlanBoardReport[] = [...boards.values()]
    .filter((b) => per.has(b.key))
    .map((b) => {
      const x = per.get(b.key)!;
      return {
        key: b.key,
        id: b.id,
        name: b.name,
        isNew: b.id === null,
        lists: b.lists,
        ...x,
        newFields: (fields[b.key] ?? []).map((f) => Object.values(f.label)[0] ?? f.key),
        columns: b.id === null ? b.columns.map((c) => c.name) : [],
      };
    });
  const sum = (f: 'tasks' | 'subtasks' | 'comments' | 'links') => reportBoards.reduce((n, b) => n + b[f], 0);
  const used = new Set(reportBoards.map((b) => b.key));
  for (const k of Object.keys(fields)) if (!used.has(k)) delete fields[k];
  return {
    tasks,
    comments,
    links,
    fields,
    boards: [...boards.values()].filter((b) => used.has(b.key)).map(({ lists: _lists, ...b }) => b),
    report: {
      boards: reportBoards,
      totals: { tasks: sum('tasks'), subtasks: sum('subtasks'), comments: sum('comments'), links: sum('links'), fields: Object.values(fields).reduce((n, f) => n + f.length, 0) },
      left: list(left),
      notes: list(notes),
      unmatched: { people: top20(miss.people), accounts: top20(miss.accounts), statuses: top20(miss.statuses) },
    },
  };
}

/** The problems of a report as a CSV for the person to keep (row, what, in their language). */
export function problemsCsv(report: ImportReport, label: (r: Reason, kind: 'left' | 'note') => string, head: [string, string]): string {
  const lines = [head.join(',')];
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  for (const x of report.left) for (const n of x.rows) lines.push(`${n},${q(label(x.reason, 'left'))}`);
  for (const x of report.notes) for (const n of x.rows) lines.push(`${n},${q(label(x.reason, 'note'))}`);
  return `﻿${lines.join('\n')}\n`;
}

export type { TaskImportField };
