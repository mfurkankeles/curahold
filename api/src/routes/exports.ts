// Exports: one way out for every list and report as a file (Excel or CSV).
//
// The file is made here, not in the browser, so three things hold for every
// export: it needs the role permission 'data.export'; the rows are read by the
// same functions the screens read (accountPage, recordPage, the board's filter,
// the report engine), so a field closed to the person's role is never in it
// (tests/field-outs.test.ts); and it is written to the activity log once — who,
// what, how many rows, which filter — before the first byte leaves. The rows go
// out a page at a time (lib/sheet.ts), so a big list never sits in memory whole.
// Request limits: the 'export' budget (lib/ratelimit.ts).
import { Hono } from 'hono';
import { z } from 'zod';
import { labelOf } from '../../../shared/src/fields';
import { accountWords, translate, type Locale, type MessageKey } from '../../../shared/src/i18n';
import type { Column, TaskField } from '../../../shared/src/model';
import type { Bucket, ReportDef } from '../../../shared/src/reports';
import { requirePerm, run, todayOf, type AppEnv, type C } from '../context';
import type { Q, Row } from '../db';
import { audit } from '../lib/audit';
import { fail } from '../lib/errors';
import { defsFor } from '../lib/fieldAccess';
import { toTask } from '../lib/mappers';
import { loadCatalog, resolveDef, runReport } from '../lib/reportEngine';
import { CONTENT_TYPE, fileName, sheetStream, type Cell } from '../lib/sheet';
import { body, isoDate, uuid } from '../lib/validate';
import { accountPage } from './accounts';
import { loadBoard } from './boards';
import { engineCtx, reportDefSchema } from './builder';
import { recordPage } from './records';
import { taskFilterSql, windowFilters } from './tasks';

export const exportRoutes = new Hono<AppEnv>();

/** The most rows one file holds; a bigger list is narrowed with a filter first. */
export const MAX_EXPORT_ROWS = 50_000;
/** Rows read, written and let go at a time. */
const PAGE = 500;

const format = z.enum(['xlsx', 'csv']);
const owner = z.union([uuid, z.literal('me')]).nullable().optional();
const text = z.string().max(100).optional();
export const exportSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('accounts'), format, q: text, owner, archived: z.boolean().optional() }),
  z.object({
    source: z.literal('records'),
    format,
    type: z.string().regex(/^[a-z0-9_-]{1,60}$/),
    q: text,
    owner,
    archived: z.boolean().optional(),
    span: z.object({ field: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/), from: isoDate, to: isoDate }).nullable().optional(),
  }),
  z.object({ source: z.literal('board'), format, board: uuid, filters: windowFilters.optional() }),
  z.object({ source: z.literal('report'), format, name: z.string().trim().max(120).optional(), def: reportDefSchema }),
]);
export type ExportInput = z.infer<typeof exportSchema>;

/** What one export will write: its name and headings, how many rows, and how to read a page of them. */
interface Plan {
  name: string;
  headers: string[];
  rows: number;
  /** The filter, as the activity log keeps it. */
  filter: Record<string, unknown>;
  page: (q: Q, offset: number) => Promise<Cell[][]>;
}

const yesNo = (locale: Locale, v: unknown) => translate(locale, v ? 'common.yes' : 'common.no');

/** A field's value as a cell: numbers stay numbers, days stay days, choices become their label. */
function cellOf(f: Pick<TaskField, 'type' | 'options'>, v: unknown, locale: Locale, names: Map<string, string>): Cell {
  if (v === null || v === undefined || v === '') return null;
  if (f.type === 'money') return Number.isFinite(Number(v)) ? { money: Number(v) } : String(v);
  if (f.type === 'number') return Number.isFinite(Number(v)) ? Number(v) : String(v);
  if (f.type === 'date') return { day: String(v) };
  if (f.type === 'select') return labelOf(f.options?.find((o) => o.key === v)?.label, locale) || String(v);
  if (f.type === 'person') return names.get(String(v)) ?? '';
  if (f.type === 'checkbox') return yesNo(locale, v);
  return String(v);
}

async function peopleNames(q: Q) {
  const rows = await q.query<{ id: string; name: string }>('select id, name from users');
  return new Map(rows.map((r) => [r.id, r.name]));
}

const ownerOf = (c: C, o: string | null | undefined) => (o === 'me' ? c.get('auth').userId : (o ?? null));
const day = (v: unknown) => (v ? { day: (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10) } : null);

async function accountsPlan(c: C, q: Q, input: Extract<ExportInput, { source: 'accounts' }>, locale: Locale): Promise<Plan> {
  const org = c.get('org');
  const f = { q: input.q, ownerId: ownerOf(c, input.owner), archived: input.archived };
  const defs = defsFor(org.account_fields ?? [], c.get('auth'));
  const { total } = await accountPage(c, q, f, 1, 0);
  const names = await peopleNames(q);
  return {
    name: accountWords(locale, org.terms).other,
    headers: [translate(locale, 'accounts.name'), translate(locale, 'accounts.owner'), ...defs.map((d) => labelOf(d.label, locale)), translate(locale, 'accounts.openTasks'), translate(locale, 'accounts.lastActivity')],
    rows: total ?? 0,
    filter: { q: input.q || undefined, owner: input.owner ?? undefined, archived: input.archived || undefined },
    page: async (q2, offset) => {
      const { accounts } = await accountPage(c, q2, f, PAGE, offset, { count: false });
      return accounts.map((a) => [
        a.name,
        a.ownerId ? (names.get(a.ownerId) ?? '') : '',
        ...defs.map((d) => cellOf(d, a.fields[d.key], locale, names)),
        a.openTasks ?? 0,
        day(a.lastActivityAt),
      ]);
    },
  };
}

async function recordsPlan(c: C, q: Q, input: Extract<ExportInput, { source: 'records' }>, locale: Locale): Promise<Plan> {
  const f = { type: input.type, q: input.q, ownerId: ownerOf(c, input.owner), archived: input.archived, span: input.span ?? null };
  const first = await recordPage(c, q, f, 1, 0, { links: false });
  const type = first.type!;
  const defs = defsFor(type.fields ?? [], c.get('auth'));
  const names = await peopleNames(q);
  return {
    name: labelOf(type.name?.other, locale) || type.key,
    headers: [translate(locale, 'records.name'), translate(locale, 'records.account'), translate(locale, 'records.owner'), ...defs.map((d) => labelOf(d.label, locale))],
    rows: first.total ?? 0,
    filter: { type: type.key, q: input.q || undefined, owner: input.owner ?? undefined, archived: input.archived || undefined, span: input.span ?? undefined },
    page: async (q2, offset) => {
      const { records } = await recordPage(c, q2, f, PAGE, offset, { links: false, count: false });
      return records.map((r) => [r.name, r.accountName ?? '', r.ownerId ? (names.get(r.ownerId) ?? '') : '', ...defs.map((d) => cellOf(d, r.fields[d.key], locale, names))]);
    },
  };
}

async function boardPlan(c: C, q: Q, input: Extract<ExportInput, { source: 'board' }>, locale: Locale): Promise<Plan> {
  const board = await loadBoard(q, input.board);
  const columns = (board.columns ?? []) as Column[];
  const fields = (board.task_fields ?? []) as TaskField[];
  const done = columns.filter((x) => x.done).map((x) => x.key);
  const f = input.filters ?? {};
  // The filter's conditions once, with their values; each page adds only its offset.
  const params: unknown[] = [board.id];
  const where = taskFilterSql(f, c.get('auth').userId, todayOf(c), done, (v) => `$${params.push(v)}`);
  const base = `t.board_id = $1 and t.parent_id is null and t.archived_at is null${where.length ? ` and ${where.join(' and ')}` : ''}`;
  const [{ n }] = await q.query<{ n: number }>(`select count(*)::int as n from tasks t where ${base}`, params);
  const names = await peopleNames(q);
  const t = (k: string, v?: Record<string, string | number>) => translate(locale, k as MessageKey, v, c.get('org').terms);
  return {
    name: board.name,
    headers: [t('task.title'), t('task.status'), accountWords(locale, c.get('org').terms).one, t('task.due'), t('task.assignees'), t('task.priority'), t('task.repeat'), ...fields.map((x) => labelOf(x.label, locale))],
    rows: n,
    filter: { board: board.id, ...f },
    page: async (q2, offset) => {
      const rows = await q2.query<Row>(
        `select t.*, a.name as account_name from tasks t left join accounts a on a.id = t.account_id
          where ${base} order by t.position, t.created_at, t.id limit ${PAGE} offset ${Number(offset)}`,
        params,
      );
      return rows.map(toTask).map((x) => [
        x.title,
        columns.find((col) => col.key === x.status)?.name ?? x.status,
        x.accountName ?? '',
        day(x.dueDate),
        x.assigneeIds.map((id) => names.get(id) ?? '').filter(Boolean).join(', '),
        t(`task.priority.${x.priority}`),
        x.repeat ? t(`repeat.${x.repeat.unit}${x.repeat.every === 1 ? '1' : 'N'}`, { n: x.repeat.every }) + (x.repeat.from === 'done' ? ` ${t('repeat.afterDone')}` : '') : '',
        ...fields.map((fd) => cellOf(fd, x.fields?.[fd.key], locale, names)),
      ]);
    },
  };
}

/** A time bucket's first day as a cell: a year, a quarter, a month in words, or the day itself. */
function bucketCell(key: string, b: Bucket | null, locale: Locale): Cell {
  if (!b || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return key;
  const y = Number(key.slice(0, 4));
  if (b === 'year') return y;
  if (b === 'quarter') return `${translate(locale, 'rb.quarterShort', { n: Math.floor((Number(key.slice(5, 7)) - 1) / 3) + 1 })} ${y}`;
  if (b === 'month') return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}T12:00:00Z`));
  return { day: key };
}

async function reportPlan(c: C, q: Q, input: Extract<ExportInput, { source: 'report' }>, locale: Locale): Promise<Plan> {
  const ctx = engineCtx(c, q);
  const cat = await loadCatalog(ctx);
  const result = await runReport(ctx, cat, input.def as ReportDef);
  if (result.kind !== 'ok') fail('validation', { fields: 'def' }, { fields: ['def'] });
  const r = result as Extract<typeof result, { kind: 'ok' }>;
  const made = resolveDef(cat, input.def as ReportDef);
  const def = 'def' in made ? made.def : (input.def as ReportDef);
  const fieldLabel = (k: string) => labelOf(('src' in made ? made.src.info.fields.find((x) => x.key === k)?.label : undefined) ?? { en: k }, locale);
  const value = (v: number | null) => (v === null ? null : r.unit === 'money' ? { money: v } : v);
  let headers: string[];
  let rows: Cell[][];
  if (r.table) {
    const table = r.table;
    const groupNames = table.keys ? def.groups.map((g) => fieldLabel(g.field)) : [];
    const groupLabel = (k: string) => r.groups.find((g) => g.key === k)?.label ?? k;
    const seriesLabel = (k: string) => r.series.find((x) => x.key === k)?.label ?? k;
    headers = [...groupNames, ...table.columns.map((col) => col.label)];
    rows = table.rows.map((row, i) => {
      const keys = table.keys?.[i] ?? [];
      return [
        ...keys.map((k, at) => (at === 0 ? (r.bucket ? bucketCell(k, r.bucket, locale) : groupLabel(k)) : seriesLabel(k))),
        ...row.map((v, ci) => {
          const type = table.columns[ci]?.type;
          if (v === null || v === undefined) return null;
          if (type === 'money' && typeof v === 'number') return { money: v };
          if (type === 'date' && typeof v === 'string') return { day: v };
          return v;
        }),
      ];
    });
  } else {
    headers = ['', ...r.series.map((x) => x.label), r.series.length ? translate(locale, 'rb.total') : translate(locale, `rb.fn.${def.measure.fn}` as MessageKey)];
    rows = r.groups.map((g) => [r.bucket ? bucketCell(g.key, r.bucket, locale) : g.label, ...(g.cells ?? []).map(value), value(g.value)]);
  }
  return {
    name: input.name || translate(locale, 'rb.untitled'),
    headers,
    rows: rows.length,
    filter: { report: def.source, filters: def.filters.length || undefined },
    page: async (_q, offset) => rows.slice(offset, offset + PAGE),
  };
}

/**
 * Exports customers, records, a board or a report as xlsx or csv, up to MAX_EXPORT_ROWS. Needs data.export. The export and its audit line are one
 * transaction: if the line cannot be written, nothing is sent (privacy: every export is accountable).
 */
exportRoutes.post('/exports', async (c) => {
  requirePerm(c, 'data.export');
  const input = await body(c, exportSchema);
  const org = c.get('org');
  const auth = c.get('auth');
  const locale = c.get('locale') as Locale;
  // The plan and its log line in one transaction: if the line cannot be written, nothing is sent.
  const plan = await run(c, async (q) => {
    const p =
      input.source === 'accounts'
        ? await accountsPlan(c, q, input, locale)
        : input.source === 'records'
          ? await recordsPlan(c, q, input, locale)
          : input.source === 'board'
            ? await boardPlan(c, q, input, locale)
            : await reportPlan(c, q, input, locale);
    if (p.rows > MAX_EXPORT_ROWS) fail('export_too_large', { max: MAX_EXPORT_ROWS.toLocaleString(locale) });
    await audit(q, {
      orgId: org.id,
      actorId: auth.userId,
      action: 'data.exported',
      entity: 'org',
      entityId: org.id,
      meta: { source: input.source, name: p.name.slice(0, 120), rows: p.rows, format: input.format, filter: p.filter },
    });
    return p;
  });
  async function* pages() {
    for (let offset = 0; offset < plan.rows; offset += PAGE) {
      const rows = await run(c, (q) => plan.page(q, offset));
      if (!rows.length) return;
      yield rows;
    }
  }
  const name = fileName(plan.name, input.format, todayOf(c));
  return new Response(sheetStream(input.format, { name: plan.name, headers: plan.headers, locale }, pages()), {
    headers: {
      'content-type': CONTENT_TYPE[input.format],
      'content-disposition': `attachment; filename="export.${input.format}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'cache-control': 'no-store',
      'x-curahold-rows': String(plan.rows),
    },
  });
});
