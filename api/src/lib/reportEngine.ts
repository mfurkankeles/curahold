// Runs a report someone built (see shared/src/reports.ts).
//
// Nothing a person types becomes SQL: a report names fields, and every field
// is looked up in a catalogue made here, per company and per person (their
// record types, the customer fields their role may see). Values go in as
// parameters. The query runs as the person asking, so row-level security
// decides which tasks and customers are counted — the same as everywhere else.
import type { Locale } from '../../../shared/src/i18n';
import type { AccountField, Localized, OptionColor } from '../../../shared/src/model';
import {
  type Bucket,
  type ReportDef,
  type ReportField,
  type ReportFilter,
  type ReportGroupRow,
  type ReportResult,
  type ReportSource,
  type ReportSourceInfo,
  type ReportUnit,
} from '../../../shared/src/reports';
import type { Q } from '../db';
import { defsFor, type Viewer } from './fieldAccess';
import { fxRate } from './fx';

const L = (en: string, tr: string): Localized => ({ en, tr });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

class Params {
  list: unknown[] = [];
  private keys = new Map<string, number>();
  add(v: unknown) {
    this.list.push(v);
    return `$${this.list.length}`;
  }
  /** One parameter per distinct value (field keys, the time zone), however often it is used. */
  once(v: string) {
    let n = this.keys.get(v);
    if (!n) {
      this.add(v);
      n = this.list.length;
      this.keys.set(v, n);
    }
    return `$${n}::text`;
  }
  /** Postgres refuses a parameter no part of the query uses: a piece that came to nothing takes its parameters back. */
  mark() {
    return this.list.length;
  }
  back(to: number) {
    this.list.length = to;
    for (const [k, n] of this.keys) if (n > to) this.keys.delete(k);
  }
}

type Lookup = 'users' | 'accounts' | 'boards' | 'teams';
interface Env {
  tz: string;
  today: string;
}
interface F {
  def: ReportField;
  expr: (p: Params, env: Env) => string;
  /** A join the expression needs (see `from`). */
  need?: string;
  /** Names for the ids this field holds. */
  lookup?: Lookup;
  /** A list of people on the row itself: filters test the list, grouping spreads it out. */
  array?: string;
}
interface Src {
  info: ReportSourceInfo;
  fields: Map<string, F>;
  from: (p: Params, need: Set<string>) => string;
  where: (p: Params, env: Env) => string;
  order: string;
  columns: string[];
}

export interface EngineCtx {
  q: Q;
  viewer: Viewer & { userId: string };
  locale: Locale;
  today: string;
  tz: string;
  /** Every customer field of the company (the engine keeps to the ones this person may see). */
  accountDefs: AccountField[];
}

export interface Catalog {
  sources: Map<string, Src>;
  /** The opportunities record type, if the company has one. */
  deals: string | null;
  accountSeen: AccountField[];
}

const localDay = (expr: string) => (p: Params, env: Env) => `(${expr} at time zone ${p.once(env.tz)})::date`;
const plain = (expr: string) => () => expr;

/** A value kept in a jsonb `fields` column, read as its type (and as nothing when it is not that type). */
function jsonField(alias: string, f: AccountField): F | null {
  const at = (p: Params) => `${alias}.fields->>${p.once(f.key)}`;
  const raw = (p: Params) => `${alias}.fields->${p.once(f.key)}`;
  const base = { key: f.key, label: f.label };
  switch (f.type) {
    case 'number':
      return {
        def: { ...base, type: f.type, measure: true },
        expr: (p) => `(case when jsonb_typeof(${raw(p)}) = 'number' then (${at(p)})::numeric end)`,
      };
    case 'money':
      // In the company's currency, so amounts kept in different ones add up.
      return {
        def: { ...base, type: f.type, measure: true },
        expr: (p) => `(case when jsonb_typeof(${raw(p)}) = 'number' then round((${at(p)})::numeric * ${fxRate(alias)}, 2) end)`,
      };
    case 'date':
      return {
        def: { ...base, type: 'date', group: true },
        expr: (p) => `(case when ${at(p)} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then left(${at(p)}, 10)::date end)`,
      };
    case 'select':
      return {
        def: { ...base, type: 'choice', group: true, options: (f.options ?? []).map((o) => ({ key: o.key, label: o.label, color: o.color ?? MEANING[o.key] ?? null })) },
        expr: (p) => `nullif(${at(p)}, '')`,
      };
    case 'text':
    case 'url':
    case 'email':
      return { def: { ...base, type: 'text' }, expr: (p) => `nullif(${at(p)}, '')` };
    default:
      return null;
  }
}

const field = (key: string, label: Localized, type: ReportField['type'], expr: F['expr'], more: Partial<F> & { options?: ReportField['options']; measure?: boolean; group?: boolean } = {}): F => {
  const { options, measure, group, ...rest } = more;
  return { def: { key, label, type, ...(options ? { options } : {}), ...(measure ? { measure } : {}), ...(group ?? (type !== 'text' && !measure) ? { group: true } : {}) }, expr, ...rest };
};

/** Choices that have no colour of their own but mean something everywhere. */
const MEANING: Record<string, OptionColor> = { won: 'leaf', lost: 'coral', open: 'sky', solved: 'leaf', closed: 'stone', pending: 'honey' };

const PRIORITIES: ReportField['options'] = [
  { key: 'urgent', label: L('Urgent', 'Acil'), color: 'coral' },
  { key: 'high', label: L('High', 'Yüksek'), color: 'honey' },
  { key: 'normal', label: L('Normal', 'Normal'), color: 'sky' },
  { key: 'low', label: L('Low', 'Düşük'), color: 'stone' },
];
const STATES: ReportField['options'] = [
  { key: 'open', label: L('Open', 'Açık'), color: 'sky' },
  { key: 'done', label: L('Done', 'Bitti'), color: 'leaf' },
];
const ACTIVITY_KINDS: ReportField['options'] = [
  { key: 'call', label: L('Call', 'Arama'), color: 'sea' },
  { key: 'meeting', label: L('Meeting', 'Toplantı'), color: 'plum' },
  { key: 'email', label: L('Email', 'E-posta'), color: 'sky' },
  { key: 'note', label: L('Note', 'Not'), color: 'stone' },
  { key: 'review', label: L('Business review', 'İş değerlendirmesi'), color: 'honey' },
];

/** What this person can build reports from. */
export async function loadCatalog(ctx: EngineCtx): Promise<Catalog> {
  const { q } = ctx;
  const boards = await q.query<{ id: string; columns: { key: string; name: string; done?: boolean }[] }>(`select id, columns from boards where archived_at is null order by created_at`);
  const types = await q.query<{ id: string; key: string; name: { one: Localized; other: Localized }; kind: string; fields: AccountField[] }>(
    `select id, key, name, kind, fields from record_types where archived_at is null order by position, created_at`,
  );
  const accountSeen = defsFor(ctx.accountDefs ?? [], ctx.viewer);
  const sources = new Map<string, Src>();
  const add = (key: ReportSource, name: Localized, fields: (F | null)[], rest: Omit<Src, 'info' | 'fields'>) => {
    const list = fields.filter((f): f is F => !!f);
    sources.set(key, { info: { key, name, fields: list.map((f) => f.def) }, fields: new Map(list.map((f) => [f.def.key, f])), ...rest });
  };

  // One name per status key across the boards (the first board that has it names it).
  const statuses = new Map<string, { key: string; label: Localized; color: OptionColor | null }>();
  for (const b of boards) for (const c of b.columns ?? []) if (!statuses.has(c.key)) statuses.set(c.key, { key: c.key, label: L(c.name, c.name), color: c.done ? 'leaf' : null });

  add(
    'tasks',
    L('Tasks', 'Görevler'),
    [
      field('title', L('Title', 'Başlık'), 'text', plain('t.title')),
      field('board', L('Board', 'Pano'), 'ref', plain('t.board_id'), { lookup: 'boards' }),
      field('status', L('Status', 'Durum'), 'choice', plain('t.status'), { options: [...statuses.values()] }),
      field('state', L('Open or done', 'Açık mı bitti mi'), 'choice', plain(`(case when t.done_at is null then 'open' else 'done' end)`), { options: STATES }),
      field('priority', L('Priority', 'Öncelik'), 'choice', plain('t.priority'), { options: PRIORITIES }),
      field('assignee', L('Assignee', 'Sorumlu'), 'person', plain('asg.uid'), { need: 'asg', lookup: 'users', array: 't.assignee_ids' }),
      field('account', L('Customer', 'Müşteri'), 'ref', plain('t.account_id'), { lookup: 'accounts' }),
      field('created', L('Created', 'Açıldığı tarih'), 'date', localDay('t.created_at')),
      field('due', L('Due date', 'Bitiş tarihi'), 'date', plain('t.due_date')),
      field('done', L('Finished', 'Bittiği tarih'), 'date', localDay('t.done_at')),
      field('overdue', L('Overdue', 'Gecikmiş'), 'bool', (p, env) => `(t.done_at is null and t.archived_at is null and t.due_date < ${p.once(env.today)}::date)`),
      field('created_by', L('Created by', 'Açan'), 'person', plain('t.created_by'), { lookup: 'users' }),
      field('days_to_done', L('Days from opening to done', 'Açılıştan bitişe gün'), 'days', plain('(extract(epoch from (t.done_at - t.created_at)) / 86400.0)'), { measure: true }),
    ],
    {
      from: (_p, need) => `from tasks t join boards b on b.id = t.board_id${need.has('asg') ? ` cross join lateral unnest(case when cardinality(t.assignee_ids) = 0 then array[null::uuid] else t.assignee_ids end) as asg(uid)` : ''}`,
      // Finished work still counts after it has aged off the board; open work that was put away does not.
      where: () => `b.archived_at is null and t.parent_id is null and (t.archived_at is null or t.done_at is not null)`,
      order: 't.created_at desc',
      columns: ['title', 'board', 'status', 'assignee', 'due', 'account'],
    },
  );

  add(
    'accounts',
    L('Customers', 'Müşteriler'),
    [
      field('name', L('Name', 'Ad'), 'text', plain('a.name'), { group: true }),
      field('owner', L('Owner', 'Sorumlu'), 'person', plain('a.owner_id'), { lookup: 'users' }),
      field('team', L('Team', 'Ekip'), 'ref', plain('a.team_id'), { lookup: 'teams' }),
      field('created', L('Added', 'Eklendiği tarih'), 'date', localDay('a.created_at')),
      ...accountSeen.map((f) => jsonField('a', f)),
    ],
    { from: () => `from accounts a`, where: () => `a.archived_at is null`, order: 'a.name', columns: ['name', 'owner', ...accountSeen.slice(0, 4).map((f) => f.key)] },
  );

  let deals: string | null = null;
  for (const t of types) {
    const key: ReportSource = `record:${t.key}`;
    if (t.kind === 'opportunity' && !deals) deals = key;
    const seen = defsFor(t.fields ?? [], ctx.viewer);
    add(
      key,
      t.name.other,
      [
        field('name', L('Name', 'Ad'), 'text', plain('r.name'), { group: true }),
        field('account', L('Customer', 'Müşteri'), 'ref', plain('r.account_id'), { lookup: 'accounts' }),
        field('owner', L('Owner', 'Sorumlu'), 'person', plain('r.owner_id'), { lookup: 'users' }),
        field('created', L('Added', 'Eklendiği tarih'), 'date', localDay('r.created_at')),
        ...seen.map((f) => jsonField('r', f)),
      ],
      {
        from: () => `from records r`,
        where: (p) => `r.type_id = ${p.add(t.id)}::uuid and r.archived_at is null`,
        order: 'r.created_at desc',
        columns: ['name', 'account', 'owner', ...seen.slice(0, 4).map((f) => f.key)],
      },
    );
  }

  add(
    'activities',
    L('Customer contact', 'Müşteri teması'),
    [
      field('kind', L('Kind', 'Tür'), 'choice', plain('x.kind'), { options: ACTIVITY_KINDS }),
      field('account', L('Customer', 'Müşteri'), 'ref', plain('x.account_id'), { lookup: 'accounts' }),
      field('author', L('Logged by', 'Kaydeden'), 'person', plain('x.author_id'), { lookup: 'users' }),
      field('happened', L('Date', 'Tarih'), 'date', localDay('x.happened_at')),
    ],
    { from: () => `from activities x`, where: () => `true`, order: 'x.happened_at desc', columns: ['happened', 'kind', 'account', 'author'] },
  );

  add(
    'time',
    L('Time logged', 'Girilen süre'),
    [
      field('user', L('Person', 'Kişi'), 'person', plain('e.user_id'), { lookup: 'users' }),
      field('day', L('Day', 'Gün'), 'date', plain('e.day')),
      field('board', L('Board', 'Pano'), 'ref', plain('t.board_id'), { lookup: 'boards' }),
      field('account', L('Customer', 'Müşteri'), 'ref', plain('t.account_id'), { lookup: 'accounts' }),
      field('minutes', L('Time', 'Süre'), 'minutes', plain('e.minutes'), { measure: true }),
    ],
    { from: () => `from time_entries e join tasks t on t.id = e.task_id`, where: () => `true`, order: 'e.day desc', columns: ['day', 'user', 'account', 'minutes'] },
  );

  return { sources, deals, accountSeen };
}

export function catalogInfo(cat: Catalog): ReportSourceInfo[] {
  return [...cat.sources.values()].map((s) => s.info);
}

/** `$money`, `$renewal`, `$health`, `$tier`: the customer field that plays that part in this company. */
function role(cat: Catalog, name: string): string | null {
  const seen = cat.accountSeen;
  const first = (type: AccountField['type'], preferred: string[], not?: string | null) =>
    (preferred.map((k) => seen.find((f) => f.key === k && f.type === type)).find(Boolean) ?? seen.find((f) => f.type === type && f.key !== not && !f.health))?.key ?? null;
  if (name === '$money') return first('money', ['arr', 'mrr', 'deal_value']);
  if (name === '$renewal') return first('date', ['renewal_date', 'renewal']);
  if (name === '$health') return first('select', ['health']);
  if (name === '$tier') return first('select', ['tier', 'segment', 'plan'], role(cat, '$health'));
  return name;
}

/** The report with its stand-ins replaced by this company's own source and fields, or what is missing. */
export function resolveDef(cat: Catalog, def: ReportDef): { def: ReportDef; src: Src } | { missing: string } {
  const source = def.source === 'deals' ? cat.deals : def.source;
  const src = source ? cat.sources.get(source) : undefined;
  if (!source || !src) return { missing: def.source };
  let missing: string | null = null;
  const fix = (k: string | undefined) => {
    if (k === undefined) return k;
    const out = k.startsWith('$') ? role(cat, k) : k;
    if (!out || !src.fields.has(out)) missing ??= k;
    return out ?? k;
  };
  const out: ReportDef = {
    ...def,
    source: source as ReportSource,
    filters: def.filters.map((f) => ({ ...f, field: fix(f.field)! })),
    groups: def.groups.map((g) => ({ ...g, field: fix(g.field)! })),
    measure: def.measure.fn === 'count' ? { fn: 'count' } : { fn: def.measure.fn, field: fix(def.measure.field ?? '') },
    columns: def.columns?.filter((k) => src.fields.has(k)),
  };
  return missing ? { missing } : { def: out, src };
}

// ------------------------------------------------------------- filters

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The first day of the period `day` is in, and of the one after (`shift` -1 is the period before). */
export function periodBounds(day: string, period: 'week' | 'month' | 'quarter' | 'year', shift = 0): [string, string] {
  const d = new Date(`${day}T00:00:00Z`);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const ymd = (yy: number, mm: number, dd = 1) => new Date(Date.UTC(yy, mm, dd)).toISOString().slice(0, 10);
  if (period === 'week') {
    const start = addDays(day, -((d.getUTCDay() + 6) % 7) + shift * 7);
    return [start, addDays(start, 7)];
  }
  if (period === 'month') return [ymd(y, m + shift), ymd(y, m + shift + 1)];
  if (period === 'quarter') {
    const q0 = Math.floor(m / 3) * 3 + shift * 3;
    return [ymd(y, q0), ymd(y, q0 + 3)];
  }
  return [ymd(y + shift, 0), ymd(y + shift + 1, 0)];
}

function filterSql(f: F, x: ReportFilter, p: Params, env: Env, me: string): string | null {
  const e = f.expr(p, env);
  const t = f.def.type;
  if (x.op === 'empty') return f.array ? `cardinality(${f.array}) = 0` : `${e} is null`;
  if (x.op === 'not_empty') return f.array ? `cardinality(${f.array}) > 0` : `${e} is not null`;
  if (t === 'bool') return x.op === 'yes' ? e : x.op === 'no' ? `not ${e}` : null;
  if (t === 'choice' || t === 'person' || t === 'ref') {
    if (x.op !== 'in' && x.op !== 'not_in') return null;
    const ids = t === 'choice';
    const values = [...new Set((x.values ?? []).map((v) => (v === 'me' && t === 'person' ? me : v)))].filter((v) => (ids ? /^[A-Za-z0-9_-]{1,60}$/.test(v) : UUID.test(v)));
    if (!values.length) return null;
    const list = `${p.add(values)}::${ids ? 'text' : 'uuid'}[]`;
    if (f.array) return x.op === 'in' ? `${f.array} && ${list}` : `not (${f.array} && ${list})`;
    return x.op === 'in' ? `${e} = any (${list})` : `(${e} is null or ${e} <> all (${list}))`;
  }
  if (t === 'text') {
    const s = String(x.value ?? '').trim().slice(0, 100);
    return x.op === 'contains' && s ? `${e} ilike ${p.add(`%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)}` : null;
  }
  if (t === 'date') {
    const today = () => `${p.once(env.today)}::date`;
    const n = Math.min(3650, Math.max(0, Math.round(Number(x.value) || 0)));
    if (x.op === 'last_days') return `${e} > ${today()} - ${p.add(n)}::int and ${e} <= ${today()}`;
    if (x.op === 'next_days') return `${e} >= ${today()} and ${e} <= ${today()} + ${p.add(n)}::int`;
    if (x.op === 'this' || x.op === 'last') {
      const [a, b] = periodBounds(env.today, x.period ?? 'month', x.op === 'last' ? -1 : 0);
      return `${e} >= ${p.add(a)}::date and ${e} < ${p.add(b)}::date`;
    }
    if ((x.op === 'before' || x.op === 'after') && x.date && DAY.test(x.date)) return `${e} ${x.op === 'before' ? '<' : '>'} ${p.add(x.date)}::date`;
    return null;
  }
  // number, money, days, minutes
  const v = Number(x.value);
  if (!Number.isFinite(v)) return null;
  const scaled = t === 'minutes' ? v * 60 : v;
  if (x.op === 'gte') return `${e} >= ${p.add(scaled)}::numeric`;
  if (x.op === 'lte') return `${e} <= ${p.add(scaled)}::numeric`;
  if (x.op === 'eq') return `${e} = ${p.add(scaled)}::numeric`;
  return null;
}

// ---------------------------------------------------------------- running

const WORDS = { none: L('(none)', '(yok)'), other: L('Other', 'Diğer'), yes: L('Yes', 'Evet'), no: L('No', 'Hayır') };
const MAX_BUCKETS = 60;

function nextBucket(day: string, b: Bucket): string {
  if (b === 'day') return addDays(day, 1);
  if (b === 'week') return addDays(day, 7);
  const d = new Date(`${day}T00:00:00Z`);
  const step = b === 'month' ? 1 : b === 'quarter' ? 3 : 12;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + step, 1)).toISOString().slice(0, 10);
}

async function names(q: Q, what: Lookup, ids: string[]): Promise<Map<string, string>> {
  const list = [...new Set(ids.filter((x) => UUID.test(x)))];
  if (!list.length) return new Map();
  const rows = await q.query<{ id: string; name: string }>(`select id, name from ${what} where id = any ($1::uuid[])`, [list]);
  return new Map(rows.map((r) => [r.id, r.name]));
}

const unitOf = (def: ReportDef, f: F | undefined): ReportUnit =>
  def.measure.fn === 'count' || !f ? 'count' : f.def.type === 'money' ? 'money' : f.def.type === 'minutes' ? 'hours' : f.def.type === 'days' ? 'days' : 'number';

/** The field that says whose a row is, for each source (a dashboard's person filter). */
const PERSON_FIELD: Record<string, string> = { tasks: 'assignee', accounts: 'owner', activities: 'author', time: 'user' };
export const personFieldOf = (source: string) => PERSON_FIELD[source] ?? (source.startsWith('record:') ? 'owner' : null);

export interface RunOptions {
  /** Drawn as a chart on a page: groups beyond the report's top few are folded into "Other", no rows. */
  chart?: boolean;
  /** Only rows that belong to these people (a dashboard's filter). */
  people?: string[] | null;
}

const MAX_GROUPS = 200;
const MAX_ROWS = 2000;

export async function runReport(ctx: EngineCtx, cat: Catalog, input: ReportDef, opts: RunOptions = {}): Promise<ReportResult> {
  const res = resolveDef(cat, input);
  if ('missing' in res) return { kind: 'missing', what: res.missing };
  const { src } = res;
  let def = res.def;
  // A dashboard's person filter: whatever field says whose a row is.
  if (opts.people?.length) {
    const pf = personFieldOf(String(def.source));
    if (pf && src.fields.has(pf)) def = { ...def, filters: [...def.filters, { field: pf, op: 'in', values: opts.people }] };
  }
  const { q, locale } = ctx;
  const env: Env = { tz: ctx.tz || 'UTC', today: ctx.today };
  const word = (l: Localized): string => l[locale] ?? l.en ?? l.tr ?? '';
  const mf = def.measure.fn === 'count' ? undefined : src.fields.get(def.measure.field ?? '');
  if (def.measure.fn !== 'count' && !mf?.def.measure) return { kind: 'missing', what: def.measure.field ?? 'measure' };
  const unit = unitOf(def, mf);
  const scale = (v: unknown) => {
    const n = Number(v ?? 0);
    const s = unit === 'hours' ? n / 60 : n;
    return def.measure.fn === 'count' ? Math.round(s) : Math.round(s * 10) / 10;
  };
  const agg = (p: Params) => (def.measure.fn === 'count' ? 'count(*)' : `${def.measure.fn}(${mf!.expr(p, env)})`);
  const format = def.format ?? (def.groups.length >= 2 && def.chart === 'table' ? 'matrix' : def.groups.length ? 'summary' : 'tabular');

  const build = (p: Params, need: Set<string>) => {
    const conds = [src.where(p, env)];
    for (const x of def.filters) {
      const f = src.fields.get(x.field);
      if (!f) continue;
      // A filter on people never spreads the rows out: it tests the row's own list.
      if (f.need && !f.array) need.add(f.need);
      const at = p.mark();
      const sql = filterSql(f, x, p, env, ctx.viewer.userId);
      if (sql) conds.push(`(${sql})`);
      else p.back(at);
    }
    return () => `${src.from(p, need)} where ${conds.join(' and ')}`;
  };

  await q.query(`select set_config('statement_timeout', '8000', true)`);

  // The whole: how many rows, and the figure over all of them (never doubled by a spread-out list of people).
  const tp = new Params();
  const tFrom = build(tp, new Set());
  const tAgg = agg(tp);
  const [tot] = await q.query<{ matched: string; total: string | null }>(`select count(*) as matched, ${tAgg} as total ${tFrom()}`, tp.list);
  const matched = Number(tot?.matched ?? 0);
  const total = scale(tot?.total);
  const base = { kind: 'ok' as const, unit, moneyField: unit === 'money' ? (mf?.def.key ?? null) : null, total, matched, format };

  // ---- rows: the columns, readable, with the groups each row falls in
  const listRows = async (cols: F[], keyExprs: ((p: Params) => string)[], need: Set<string>, limit: number) => {
    const p = new Params();
    const from = build(p, need);
    const keySql = keyExprs.map((k, i) => `${k(p)} as k${i}`);
    // In a plain list a task is one row: its people are shown together, not one row each.
    const exprs = cols.map((f, i) => `${f.array && !need.has(f.need ?? '') ? `${f.array}` : f.def.type === 'date' ? `to_char(${f.expr(p, env)}, 'YYYY-MM-DD')` : f.expr(p, env)} as c${i}`);
    const order = [...keyExprs.map((_, i) => `k${i}`), src.order].join(', ');
    const rows = await q.query<Record<string, unknown>>(`select ${[...keySql, ...exprs].join(', ')} ${from()} order by ${order} limit ${limit + 1}`, p.list);
    const maps = new Map<Lookup, Map<string, string>>();
    for (const what of new Set(cols.map((f) => f.lookup).filter((x): x is Lookup => !!x))) {
      const ids = rows.flatMap((r) => cols.flatMap((f, i) => (f.lookup === what ? (Array.isArray(r[`c${i}`]) ? (r[`c${i}`] as string[]) : [String(r[`c${i}`] ?? '')]) : [])));
      maps.set(what, await names(q, what, ids));
    }
    const cell = (f: F, v: unknown): string | number | null => {
      if (v == null) return null;
      if (f.lookup) return (Array.isArray(v) ? v : [v]).map((id) => maps.get(f.lookup!)?.get(String(id)) ?? '').filter(Boolean).join(', ') || null;
      if (f.def.type === 'choice') return word(f.def.options?.find((o) => o.key === v)?.label ?? L(String(v), String(v)));
      if (f.def.type === 'bool') return word(v ? WORDS.yes : WORDS.no);
      if (f.def.type === 'minutes') return Math.round((Number(v) / 60) * 10) / 10;
      if (f.def.type === 'number' || f.def.type === 'money' || f.def.type === 'days') return Math.round(Number(v) * 10) / 10;
      return String(v);
    };
    return {
      columns: cols.map((f) => ({ key: f.def.key, label: word(f.def.label), type: f.def.type })),
      rows: rows.slice(0, limit).map((r) => cols.map((f, i) => cell(f, r[`c${i}`]))),
      keys: keyExprs.length ? rows.slice(0, limit).map((r) => keyExprs.map((_, i) => (r[`k${i}`] == null ? '' : String(r[`k${i}`])))) : undefined,
      more: rows.length > limit,
    };
  };
  const columnsOf = (skip: string[] = []) =>
    (def.columns?.length ? def.columns : src.columns)
      .filter((k) => !skip.includes(k))
      .map((k) => src.fields.get(k))
      .filter((f): f is F => !!f)
      .slice(0, 10);

  if (!def.groups.length) {
    // One figure (or a gauge of it): no rows to list.
    if (def.chart === 'number' || def.chart === 'gauge') return { ...base, groups: [], series: [], bucket: null, table: null };
    const table = await listRows(columnsOf(), [], new Set(), opts.chart ? 50 : MAX_ROWS);
    return { ...base, groups: [], series: [], bucket: null, table };
  }

  // ---- grouped
  const gs = def.groups.slice(0, 2).map((g) => ({ g, f: src.fields.get(g.field)! }));
  if (gs.some((x) => !x.f?.def.group)) return { kind: 'missing', what: def.groups.find((g) => !src.fields.get(g.field)?.def.group)?.field ?? 'group' };
  const need = new Set<string>(gs.map((x) => x.f.need).filter((x): x is string => !!x));
  const keyOf =
    ({ g, f }: (typeof gs)[number]) =>
    (p: Params) => {
      const e = f.expr(p, env);
      if (f.def.type === 'date') return `to_char(date_trunc('${g.bucket ?? 'month'}', (${e})::timestamp), 'YYYY-MM-DD')`;
      return f.def.type === 'bool' ? `(case when ${e} then 'yes' else 'no' end)` : `(${e})::text`;
    };
  const keyFns = gs.map(keyOf);
  const grouped = async (levels: number) => {
    const p = new Params();
    const from = build(p, new Set(need));
    const ks = keyFns.slice(0, levels).map((k) => k(p));
    const aggSql = agg(p);
    return q.query<{ k0: string | null; k1?: string | null; v: string | null; n: string }>(
      `select ${ks.map((k, i) => `${k} as k${i}`).join(', ')}, ${aggSql} as v, count(*) as n ${from()} group by ${ks.map((_, i) => i + 1).join(', ')} limit 5000`,
      p.list,
    );
  };
  // Each level on its own, so an average or a largest is right for the whole group, not pieced together.
  const level1 = await grouped(1);
  const level2 = gs.length === 2 ? await grouped(2) : [];

  const lookups = await Promise.all(
    gs.map(({ f }, i) => (f.lookup ? names(q, f.lookup, (i ? level2.map((r) => String(r.k1 ?? '')) : level1.map((r) => String(r.k0 ?? '')))) : Promise.resolve(null))),
  );
  const describe = (i: number, key: string | null): { key: string; label: string; color?: OptionColor | null; rank: number } => {
    const { f } = gs[i];
    if (key == null || key === '') return { key: '', label: word(WORDS.none), color: 'stone', rank: 1e9 };
    if (f.def.type === 'choice') {
      const at = f.def.options?.findIndex((o) => o.key === key) ?? -1;
      const o = at >= 0 ? f.def.options![at] : null;
      return { key, label: o ? word(o.label) : key, color: o?.color ?? null, rank: at >= 0 ? at : 1e8 };
    }
    if (f.def.type === 'bool') return { key, label: word(key === 'yes' ? WORDS.yes : WORDS.no), rank: key === 'yes' ? 0 : 1 };
    if (f.lookup) return { key, label: lookups[i]?.get(key) ?? word(WORDS.none), rank: 0 };
    return { key, label: key, rank: 0 };
  };
  const additive = def.measure.fn === 'count' || def.measure.fn === 'sum';
  const two = gs.length === 2;

  // The second grouping: the parts of each bar on a chart, the columns of a matrix, the inner groups of a summary.
  let series: { key: string; label: string; color?: OptionColor | null }[] = [];
  let seriesIndex = new Map<string, number>();
  if (two) {
    const sums = new Map<string, number>();
    for (const r of level2) sums.set(r.k1 ?? '', (sums.get(r.k1 ?? '') ?? 0) + Number(r.v ?? 0));
    const all = [...sums.keys()].map((k) => ({ ...describe(1, k || null), sum: sums.get(k) ?? 0 }));
    all.sort((a, b) => a.rank - b.rank || b.sum - a.sum || a.label.localeCompare(b.label, locale));
    const cap = opts.chart ? 8 : format === 'matrix' ? 24 : 60;
    const kept = all.slice(0, cap);
    series = kept.map(({ key, label, color }) => ({ key, label, color }));
    if (all.length > kept.length && additive) series.push({ key: '~other', label: word(WORDS.other), color: 'stone' });
    seriesIndex = new Map(kept.map((s, i) => [s.key, i]));
  }

  const cellsOf = new Map<string, { cells: number[]; counts: number[] }>();
  for (const r of level2) {
    const k = r.k0 ?? '';
    const c = cellsOf.get(k) ?? { cells: series.map(() => 0), counts: series.map(() => 0) };
    const si = seriesIndex.get(r.k1 ?? '') ?? (additive ? series.length - 1 : -1);
    if (si >= 0) {
      c.cells[si] += Number(r.v ?? 0);
      c.counts[si] += Number(r.n ?? 0);
    }
    cellsOf.set(k, c);
  }

  const bucket = gs[0].f.def.type === 'date' ? (gs[0].g.bucket ?? 'month') : null;
  let groups: (ReportGroupRow & { rank: number })[] = level1.map((r) => ({
    ...describe(0, r.k0 ?? null),
    value: Number(r.v ?? 0),
    count: Number(r.n ?? 0),
    ...(two ? { cells: cellsOf.get(r.k0 ?? '')?.cells ?? series.map(() => 0), counts: cellsOf.get(r.k0 ?? '')?.counts ?? series.map(() => 0) } : {}),
  }));

  if (bucket) {
    // Time runs left to right with no holes: a week with nothing in it is still a week.
    const dated = groups.filter((g) => g.key).sort((a, b) => a.key.localeCompare(b.key));
    const filled: typeof groups = [];
    if (dated.length) {
      const have = new Map(dated.map((g) => [g.key, g]));
      let day = dated[0].key;
      const end = dated[dated.length - 1].key;
      for (let i = 0; i < 400 && day <= end; i++, day = nextBucket(day, bucket))
        filled.push(have.get(day) ?? { key: day, label: day, value: 0, count: 0, rank: 0, ...(two ? { cells: series.map(() => 0), counts: series.map(() => 0) } : {}) });
    }
    const none = groups.find((g) => !g.key);
    groups = [...filled.slice(-(opts.chart ? MAX_BUCKETS : MAX_GROUPS)).map((g) => ({ ...g, label: g.key })), ...(none && !opts.chart ? [none] : [])];
  } else {
    const byLabel = def.sort === 'label';
    const ordered = gs[0].f.def.type === 'choice' || gs[0].f.def.type === 'bool';
    groups.sort((a, b) => (ordered ? a.rank - b.rank : 0) || (byLabel ? a.label.localeCompare(b.label, locale) : b.value - a.value) || a.label.localeCompare(b.label, locale));
    // On a chart only the top few get a bar of their own; a report's table shows every group.
    const top = opts.chart ? Math.min(50, Math.max(1, def.top ?? (ordered ? 50 : 12))) : MAX_GROUPS;
    if (groups.length > top) {
      const rest = groups.slice(top);
      groups = groups.slice(0, top);
      if (additive)
        groups.push({
          key: '~other',
          label: word(WORDS.other),
          color: 'stone',
          rank: 1e9,
          value: rest.reduce((n, g) => n + g.value, 0),
          count: rest.reduce((n, g) => n + (g.count ?? 0), 0),
          ...(two ? { cells: series.map((_, i) => rest.reduce((n, g) => n + (g.cells?.[i] ?? 0), 0)), counts: series.map((_, i) => rest.reduce((n, g) => n + (g.counts?.[i] ?? 0), 0)) } : {}),
        });
    }
  }

  // A summary report lists the rows under their groups.
  const table = !opts.chart && format === 'summary' ? await listRows(columnsOf(def.groups.map((g) => g.field)), keyFns, new Set(need), MAX_ROWS) : null;

  return {
    ...base,
    groups: groups.map(({ rank: _rank, ...g }) => ({ ...g, value: scale(g.value), ...(g.cells ? { cells: g.cells.map(scale) } : {}) })),
    series,
    bucket,
    table,
  };
}
