// The analytics feed's engine: which datasets a person (or their analytics key)
// may read, what each one's columns are, and how one page of one dataset is read
// with the small part of OData v4 that BI tools actually send.
//
// Rows are read inside the person's own transaction (run(c, …)), so row-level
// security decides which rows exist for them, exactly as on every screen:
// company isolation, customer reach and department walls. Field-level rules come
// from lib/fieldAccess.ts (defsFor): a field closed to the person's role is not a
// column at all, not even in $metadata. Nothing here writes.
//
// OData subset, on purpose (docs/site/en/bi-tools.md): $select, $filter (eq ne gt
// ge lt le, and, or, not, parentheses, contains/startswith/endswith, null),
// $orderby, $top, $skip, $count, server paging with @odata.nextLink, and
// $deltatoken for "changed since". Left out because Tableau, Qlik and SAP read them
// badly: $expand, collection-valued and complex properties. A multi-value
// column (task assignees) is one delimited text column plus a bridge set.
import { labelOf } from '../../../shared/src/fields';
import type { Locale } from '../../../shared/src/i18n';
import type { AccountField } from '../../../shared/src/model';
import type { Q, Row } from '../db';
import { defsFor, type Viewer } from './fieldAccess';

export type Edm = 'Edm.String' | 'Edm.Guid' | 'Edm.Int32' | 'Edm.Double' | 'Edm.Decimal' | 'Edm.Boolean' | 'Edm.Date' | 'Edm.DateTimeOffset';
import { ANALYTICS_DEPARTMENTS as DEPARTMENTS, type AnalyticsDepartment as Department } from '../../../shared/src/analytics';
export { DEPARTMENTS, type Department };

/** Rows in one page: the default, and the most a client may ask for. */
export const PAGE_DEFAULT = 1000;
export const PAGE_MAX = 5000;
/** Rows one company may pull in 24 hours, unless its settings say otherwise (settings.analytics.dailyRows). */
export const DAILY_ROWS_DEFAULT = 5_000_000;
/** A delta link looks back this far before the read started, so a change committed late is not missed. */
const DELTA_OVERLAP_MS = 5 * 60_000;

export interface Prop {
  name: string;
  type: Edm;
  /** The SQL expression, unformatted (filters and sorting use it as it is). */
  sql: string;
  /** Can be used in $filter and $orderby (plain columns, so the database can use its indexes). */
  filter?: boolean;
  nullable?: boolean;
  /** For values read from a JSON field: turns the stored value into the column's type. */
  conv?: (v: unknown) => unknown;
}

export interface Dataset {
  /** The entity set's name, also the JSON/CSV file name: stable, never translated. */
  name: string;
  /** The entity type's name in $metadata. */
  entity: string;
  /** Which departments it belongs to; 'boards' = narrowed to the boards of the key's departments. */
  departments: readonly Department[] | 'boards';
  /** One sentence for people (the admin page, the Looker Studio connector), in the reader's language. */
  about: string;
  /** `from …` with any joins; the alias of the main table is used by `props`. */
  from: string;
  where?: string[];
  /** Paging order: the modified time first, then what makes a row unique. */
  keys: { sql: string; cast: string }[];
  props: Prop[];
}

// ---------------------------------------------------------------- the catalogue

export interface CatalogCtx {
  q: Q;
  viewer: Viewer;
  locale: Locale;
  accountFields: AccountField[];
  /** Label of a dataset, in the reader's language (dictionary key analytics.set.<name>). */
  about: (set: string, vars?: Record<string, string>) => string;
}

const pascal = (key: string) => key.replace(/(^|_)([a-z0-9])/g, (_m, _u, ch: string) => ch.toUpperCase());

/** A field's stored value as its column's type; a value that does not fit is empty, never an error. */
function fieldProp(f: AccountField, alias: string, taken: Set<string>, locale: Locale): Prop {
  let name = pascal(f.key);
  if (taken.has(name)) name = `${name}Field`;
  taken.add(name);
  const sql = `${alias}.fields->'${f.key.replace(/'/g, '')}'`;
  const num = (v: unknown) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  if (f.type === 'money') return { name, type: 'Edm.Decimal', sql, nullable: true, conv: num };
  if (f.type === 'number') return { name, type: 'Edm.Double', sql, nullable: true, conv: num };
  if (f.type === 'date') return { name, type: 'Edm.Date', sql, nullable: true, conv: (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null) };
  if (f.type === 'select') {
    const labels = new Map((f.options ?? []).map((o) => [o.key, labelOf(o.label, locale) || o.key]));
    return { name, type: 'Edm.String', sql, nullable: true, conv: (v) => (v === null || v === undefined || v === '' ? null : (labels.get(String(v)) ?? String(v))) };
  }
  return { name, type: 'Edm.String', sql, nullable: true, conv: (v) => (v === null || v === undefined || v === '' ? null : typeof v === 'object' ? JSON.stringify(v) : String(v)) };
}

const base = (alias: string, opts: { created?: string; modified?: string; deleted?: string } = {}): Prop[] => [
  { name: 'CreatedAt', type: 'Edm.DateTimeOffset', sql: opts.created ?? `${alias}.created_at`, filter: true },
  { name: 'ModifiedAt', type: 'Edm.DateTimeOffset', sql: opts.modified ?? `${alias}.updated_at`, filter: true },
  { name: 'IsDeleted', type: 'Edm.Boolean', sql: opts.deleted ?? `(${alias}.archived_at is not null)`, filter: true },
];

let boardDepartments: boolean | null = null;
/** Whether boards belong to departments in this database (the departments model). */
async function hasBoardDepartments(q: Q): Promise<boolean> {
  if (boardDepartments === null) {
    const [r] = await q.query<{ ok: boolean }>(
      `select exists (select 1 from information_schema.columns where table_name = 'boards' and column_name = 'department_id') and to_regclass('departments') is not null as ok`,
    );
    boardDepartments = !!r?.ok;
  }
  return boardDepartments;
}

/** The customer field that plays a part (renewal date, value, health), if this person may see it. */
function roleField(defs: AccountField[], part: 'renewal' | 'money' | 'health'): AccountField | null {
  if (part === 'health') return defs.find((f) => f.health) ?? null;
  if (part === 'renewal') return defs.find((f) => f.type === 'date' && /renewal|yenileme/.test(f.key)) ?? null;
  return ['arr', 'mrr', 'deal_value'].map((k) => defs.find((f) => f.key === k && f.type === 'money')).find(Boolean) ?? defs.find((f) => f.type === 'money') ?? null;
}

/**
 * Every dataset this person may read, with the columns they may see. A key's
 * own limits (datasets, departments) are applied by `allowed` afterwards.
 */
export async function catalog(ctx: CatalogCtx): Promise<Dataset[]> {
  const { q, viewer, locale } = ctx;
  const out: Dataset[] = [];
  const accountDefs = defsFor(ctx.accountFields ?? [], viewer);
  const ownerName = (col: string) => `(select u.name from users u where u.id = ${col})`;

  // Customers, with every field the person may see as its own column.
  {
    const taken = new Set(['Id', 'Name', 'OwnerId', 'OwnerName', 'TeamId', 'Currency', 'Source', 'CreatedAt', 'ModifiedAt', 'IsDeleted']);
    out.push({
      name: 'Customers',
      entity: 'Customer',
      departments: DEPARTMENTS,
      about: ctx.about('Customers'),
      from: 'from accounts a',
      keys: [{ sql: 'a.updated_at', cast: 'timestamptz' }, { sql: 'a.id', cast: 'uuid' }],
      props: [
        { name: 'Id', type: 'Edm.Guid', sql: 'a.id', filter: true },
        { name: 'Name', type: 'Edm.String', sql: 'a.name', filter: true },
        { name: 'OwnerId', type: 'Edm.Guid', sql: 'a.owner_id', filter: true, nullable: true },
        { name: 'OwnerName', type: 'Edm.String', sql: ownerName('a.owner_id'), nullable: true },
        { name: 'TeamId', type: 'Edm.Guid', sql: 'a.team_id', filter: true, nullable: true },
        { name: 'Currency', type: 'Edm.String', sql: 'a.currency', filter: true, nullable: true },
        { name: 'Source', type: 'Edm.String', sql: 'a.source', filter: true },
        ...base('a'),
        ...accountDefs.map((f) => fieldProp(f, 'a', taken, locale)),
      ],
    });
  }

  // Renewals: customers with a renewal date the person may see.
  const renewal = roleField(accountDefs, 'renewal');
  if (renewal) {
    const money = roleField(accountDefs, 'money');
    const health = roleField(accountDefs, 'health');
    const taken = new Set<string>();
    const opp = await q.query<{ id: string; fields: AccountField[] }>(`select id, fields from record_types where kind = 'opportunity' and archived_at is null order by position, created_at limit 1`);
    const oppDefs = opp[0] ? defsFor(opp[0].fields ?? [], viewer) : [];
    const canKind = oppDefs.some((f) => f.key === 'kind');
    const canAmount = oppDefs.some((f) => f.key === 'amount');
    const canStatus = oppDefs.some((f) => f.key === 'status');
    const openRenewal = opp[0] && canKind ? `from records r where r.account_id = a.id and r.type_id = '${opp[0].id}' and r.archived_at is null and r.fields->>'kind' = 'renewal'${canStatus ? ` and coalesce(r.fields->>'status', 'open') = 'open'` : ''}` : null;
    out.push({
      name: 'Renewals',
      entity: 'Renewal',
      departments: ['sales', 'success'],
      about: ctx.about('Renewals'),
      from: 'from accounts a',
      where: [`jsonb_typeof(a.fields->'${renewal.key.replace(/[^a-z0-9_]/g, '')}') = 'string'`],
      keys: [{ sql: 'a.updated_at', cast: 'timestamptz' }, { sql: 'a.id', cast: 'uuid' }],
      props: [
        { name: 'Id', type: 'Edm.Guid', sql: 'a.id', filter: true },
        { name: 'CustomerName', type: 'Edm.String', sql: 'a.name', filter: true },
        { name: 'OwnerId', type: 'Edm.Guid', sql: 'a.owner_id', filter: true, nullable: true },
        { name: 'OwnerName', type: 'Edm.String', sql: ownerName('a.owner_id'), nullable: true },
        { ...fieldProp(renewal, 'a', taken, locale), name: 'RenewalDate' },
        ...(money ? [{ ...fieldProp(money, 'a', taken, locale), name: 'Value' }] : []),
        { name: 'Currency', type: 'Edm.String', sql: 'a.currency', filter: true, nullable: true },
        ...(health ? [{ ...fieldProp(health, 'a', taken, locale), name: 'Health' }] : []),
        ...(openRenewal ? [{ name: 'OpenRenewalDeals', type: 'Edm.Int32' as Edm, sql: `(select count(*)::int ${openRenewal})` }] : []),
        ...(openRenewal && canAmount
          ? [{ name: 'OpenRenewalAmount', type: 'Edm.Decimal' as Edm, sql: `(select sum(case when jsonb_typeof(r.fields->'amount') = 'number' then (r.fields->>'amount')::numeric end) ${openRenewal})`, nullable: true }]
          : []),
        ...base('a'),
      ],
    });
  }

  // Health over time: one score per customer per day (only where the person may see the score).
  if (roleField(accountDefs, 'health')) {
    out.push({
      name: 'HealthHistory',
      entity: 'HealthPoint',
      departments: ['onboarding', 'success', 'sales'],
      about: ctx.about('HealthHistory'),
      from: 'from health_history h',
      keys: [{ sql: 'h.day', cast: 'date' }, { sql: 'h.account_id', cast: 'uuid' }],
      props: [
        { name: 'Id', type: 'Edm.String', sql: `(h.account_id::text || ':' || h.day::text)` },
        { name: 'CustomerId', type: 'Edm.Guid', sql: 'h.account_id', filter: true },
        { name: 'Day', type: 'Edm.Date', sql: 'h.day', filter: true },
        { name: 'Score', type: 'Edm.Int32', sql: 'h.score::int', filter: true },
        { name: 'ModifiedAt', type: 'Edm.DateTimeOffset', sql: `(h.day::timestamp at time zone 'UTC')`, filter: true },
      ],
    });
  }

  // People: name and role only (to put names on owner and assignee ids).
  out.push({
    name: 'People',
    entity: 'Person',
    departments: DEPARTMENTS,
    about: ctx.about('People'),
    from: 'from users u join roles ro on ro.id = u.role_id',
    where: [`u.status <> 'invited'`],
    keys: [{ sql: 'u.created_at', cast: 'timestamptz' }, { sql: 'u.id', cast: 'uuid' }],
    props: [
      { name: 'Id', type: 'Edm.Guid', sql: 'u.id', filter: true },
      { name: 'Name', type: 'Edm.String', sql: 'u.name', filter: true },
      { name: 'Role', type: 'Edm.String', sql: 'ro.key', filter: true },
      { name: 'IsActive', type: 'Edm.Boolean', sql: `(u.status = 'active')`, filter: true },
      ...base('u', { modified: 'u.created_at', deleted: `(u.status = 'deleted')` }),
    ],
  });

  // Boards, tasks, the bridge of task assignees, sprints and their burn-down.
  const depCol = (await hasBoardDepartments(q)) ? [{ name: 'DepartmentId', type: 'Edm.Guid' as Edm, sql: 'b.department_id', filter: true, nullable: true }] : [];
  out.push({
    name: 'Boards',
    entity: 'Board',
    departments: 'boards',
    about: ctx.about('Boards'),
    from: 'from boards b',
    keys: [{ sql: 'coalesce(b.archived_at, b.created_at)', cast: 'timestamptz' }, { sql: 'b.id', cast: 'uuid' }],
    props: [
      { name: 'Id', type: 'Edm.Guid', sql: 'b.id', filter: true },
      { name: 'Name', type: 'Edm.String', sql: 'b.name', filter: true },
      { name: 'Visibility', type: 'Edm.String', sql: 'b.visibility', filter: true },
      { name: 'TeamId', type: 'Edm.Guid', sql: 'b.team_id', filter: true, nullable: true },
      ...depCol,
      { name: 'IsProduct', type: 'Edm.Boolean', sql: 'coalesce(b.pm_enabled, false)', filter: true },
      ...base('b', { modified: 'coalesce(b.archived_at, b.created_at)' }),
    ],
  });
  const column = (field: 'name' | 'done') =>
    `(select ${field === 'done' ? `coalesce((c->>'done')::boolean, false)` : `c->>'name'`} from jsonb_array_elements(b.columns) c where c->>'key' = t.status limit 1)`;
  out.push({
    name: 'Tasks',
    entity: 'Task',
    departments: 'boards',
    about: ctx.about('Tasks'),
    from: 'from tasks t join boards b on b.id = t.board_id',
    keys: [{ sql: 't.updated_at', cast: 'timestamptz' }, { sql: 't.id', cast: 'uuid' }],
    props: [
      { name: 'Id', type: 'Edm.Guid', sql: 't.id', filter: true },
      { name: 'BoardId', type: 'Edm.Guid', sql: 't.board_id', filter: true },
      { name: 'ParentId', type: 'Edm.Guid', sql: 't.parent_id', filter: true, nullable: true },
      { name: 'Title', type: 'Edm.String', sql: 't.title', filter: true },
      { name: 'Status', type: 'Edm.String', sql: 't.status', filter: true },
      { name: 'StatusName', type: 'Edm.String', sql: column('name'), nullable: true },
      { name: 'IsDone', type: 'Edm.Boolean', sql: column('done') },
      { name: 'Priority', type: 'Edm.String', sql: 't.priority', filter: true },
      { name: 'IssueType', type: 'Edm.String', sql: 't.issue_type', filter: true },
      { name: 'StoryPoints', type: 'Edm.Decimal', sql: 't.story_points', filter: true, nullable: true },
      { name: 'CustomerId', type: 'Edm.Guid', sql: 't.account_id', filter: true, nullable: true },
      { name: 'RecordId', type: 'Edm.Guid', sql: 't.record_id', filter: true, nullable: true },
      { name: 'SprintId', type: 'Edm.Guid', sql: 't.sprint_id', filter: true, nullable: true },
      { name: 'EpicId', type: 'Edm.Guid', sql: 't.epic_id', filter: true, nullable: true },
      { name: 'AssigneeIds', type: 'Edm.String', sql: `array_to_string(t.assignee_ids, ';')` },
      { name: 'AssigneeCount', type: 'Edm.Int32', sql: 'cardinality(t.assignee_ids)' },
      { name: 'StartDate', type: 'Edm.Date', sql: 't.start_date', filter: true, nullable: true },
      { name: 'DueDate', type: 'Edm.Date', sql: 't.due_date', filter: true, nullable: true },
      { name: 'DoneAt', type: 'Edm.DateTimeOffset', sql: 't.done_at', filter: true, nullable: true },
      { name: 'CreatedBy', type: 'Edm.Guid', sql: 't.created_by', filter: true, nullable: true },
      ...base('t'),
    ],
  });
  out.push({
    name: 'TaskAssignees',
    entity: 'TaskAssignee',
    departments: 'boards',
    about: ctx.about('TaskAssignees'),
    from: 'from tasks t join boards b on b.id = t.board_id cross join lateral unnest(t.assignee_ids) as ta(user_id)',
    keys: [{ sql: 't.updated_at', cast: 'timestamptz' }, { sql: 't.id', cast: 'uuid' }, { sql: 'ta.user_id', cast: 'uuid' }],
    props: [
      { name: 'Id', type: 'Edm.String', sql: `(t.id::text || ':' || ta.user_id::text)` },
      { name: 'TaskId', type: 'Edm.Guid', sql: 't.id', filter: true },
      { name: 'PersonId', type: 'Edm.Guid', sql: 'ta.user_id', filter: true },
      { name: 'ModifiedAt', type: 'Edm.DateTimeOffset', sql: 't.updated_at', filter: true },
      { name: 'IsDeleted', type: 'Edm.Boolean', sql: '(t.archived_at is not null)', filter: true },
    ],
  });
  out.push({
    name: 'Sprints',
    entity: 'Sprint',
    departments: 'boards',
    about: ctx.about('Sprints'),
    from: 'from sprints s join boards b on b.id = s.board_id',
    keys: [{ sql: 's.updated_at', cast: 'timestamptz' }, { sql: 's.id', cast: 'uuid' }],
    props: [
      { name: 'Id', type: 'Edm.Guid', sql: 's.id', filter: true },
      { name: 'BoardId', type: 'Edm.Guid', sql: 's.board_id', filter: true },
      { name: 'Name', type: 'Edm.String', sql: 's.name', filter: true },
      { name: 'Goal', type: 'Edm.String', sql: 's.goal' },
      { name: 'State', type: 'Edm.String', sql: 's.state', filter: true },
      { name: 'StartsOn', type: 'Edm.Date', sql: 's.starts_on', filter: true, nullable: true },
      { name: 'EndsOn', type: 'Edm.Date', sql: 's.ends_on', filter: true, nullable: true },
      ...base('s'),
    ],
  });
  out.push({
    name: 'SprintBurndown',
    entity: 'BurndownPoint',
    departments: 'boards',
    about: ctx.about('SprintBurndown'),
    from: 'from sprint_burndowns x join boards b on b.id = x.board_id',
    keys: [{ sql: 'x.day', cast: 'date' }, { sql: 'x.sprint_id', cast: 'uuid' }],
    props: [
      { name: 'Id', type: 'Edm.String', sql: `(x.sprint_id::text || ':' || x.day::text)` },
      { name: 'SprintId', type: 'Edm.Guid', sql: 'x.sprint_id', filter: true },
      { name: 'BoardId', type: 'Edm.Guid', sql: 'x.board_id', filter: true },
      { name: 'Day', type: 'Edm.Date', sql: 'x.day', filter: true },
      { name: 'TotalPoints', type: 'Edm.Decimal', sql: 'x.total_points' },
      { name: 'RemainingPoints', type: 'Edm.Decimal', sql: 'x.remaining_points' },
      { name: 'TotalCount', type: 'Edm.Int32', sql: 'x.total_count' },
      { name: 'RemainingCount', type: 'Edm.Int32', sql: 'x.remaining_count' },
      { name: 'ModifiedAt', type: 'Edm.DateTimeOffset', sql: `(x.day::timestamp at time zone 'UTC')`, filter: true },
    ],
  });

  // Records: opportunities (the pipeline), support tickets, contacts and every kind the company added.
  const types = await q.query<Row>(`select id, key, kind, name, fields from record_types where archived_at is null order by position, created_at`);
  const used = new Set(out.map((d) => d.name));
  for (const t of types) {
    const wanted = t.kind === 'opportunity' ? 'Opportunities' : t.kind === 'ticket' ? 'Tickets' : t.kind === 'contact' ? 'Contacts' : `Records${pascal(t.key)}`;
    const name = used.has(wanted) ? `Records${pascal(t.key)}` : wanted;
    if (used.has(name)) continue;
    used.add(name);
    const defs = defsFor((t.fields ?? []) as AccountField[], viewer);
    const taken = new Set(['Id', 'TypeKey', 'Name', 'CustomerId', 'CustomerName', 'OwnerId', 'OwnerName', 'ParentId', 'Currency', 'Source', 'CreatedAt', 'ModifiedAt', 'IsDeleted']);
    const typeName = labelOf(t.name?.other, locale) || t.key;
    out.push({
      name,
      entity: name === 'Opportunities' ? 'Opportunity' : name === 'Tickets' ? 'Ticket' : name === 'Contacts' ? 'Contact' : `Record${pascal(t.key)}`,
      departments: t.kind === 'opportunity' ? ['inside_sales', 'sales'] : t.kind === 'ticket' ? ['success'] : t.kind === 'contact' ? ['inside_sales', 'sales', 'onboarding', 'success'] : DEPARTMENTS,
      about: ctx.about(t.kind === 'opportunity' || t.kind === 'ticket' || t.kind === 'contact' ? name : 'Records', { type: typeName }),
      from: 'from records r',
      where: [`r.type_id = '${String(t.id).replace(/[^0-9a-f-]/gi, '')}'`],
      keys: [{ sql: 'r.updated_at', cast: 'timestamptz' }, { sql: 'r.id', cast: 'uuid' }],
      props: [
        { name: 'Id', type: 'Edm.Guid', sql: 'r.id', filter: true },
        { name: 'TypeKey', type: 'Edm.String', sql: `'${String(t.key).replace(/[^a-z0-9_]/g, '')}'::text` },
        { name: 'Name', type: 'Edm.String', sql: 'r.name', filter: true },
        { name: 'CustomerId', type: 'Edm.Guid', sql: 'r.account_id', filter: true, nullable: true },
        { name: 'CustomerName', type: 'Edm.String', sql: '(select x.name from accounts x where x.id = r.account_id)', nullable: true },
        { name: 'OwnerId', type: 'Edm.Guid', sql: 'r.owner_id', filter: true, nullable: true },
        { name: 'OwnerName', type: 'Edm.String', sql: ownerName('r.owner_id'), nullable: true },
        { name: 'ParentId', type: 'Edm.Guid', sql: 'r.parent_id', filter: true, nullable: true },
        { name: 'Currency', type: 'Edm.String', sql: 'r.currency', filter: true, nullable: true },
        { name: 'Source', type: 'Edm.String', sql: 'r.source', filter: true },
        ...base('r'),
        ...defs.map((f) => fieldProp(f, 'r', taken, locale)),
      ],
    });
  }
  return out;
}

/** What an analytics key adds on top of its owner's own rights. Null = no limit. */
export interface KeyScope {
  datasets: string[] | null;
  departments: Department[] | null;
}

/**
 * The datasets a key may read, and the extra condition its departments put on
 * board-based ones. A board-based set for a key limited to departments is left
 * out when boards have no departments yet (closed, not open, when unsure).
 */
export async function allowed(q: Q, all: Dataset[], scope: KeyScope | null): Promise<{ sets: Dataset[]; boardWhere: string | null }> {
  if (!scope) return { sets: all, boardWhere: null };
  const deps = scope.departments?.length ? scope.departments : null;
  const walls = deps ? await hasBoardDepartments(q) : false;
  const boardWhere = deps && walls ? `b.department_id in (select d.id from departments d where d.key in (${deps.map((d) => `'${d}'`).join(', ')}))` : null;
  const sets = all.filter((d) => {
    if (scope.datasets && !scope.datasets.includes(d.name)) return false;
    if (!deps) return true;
    if (d.departments === 'boards') return walls;
    return d.departments.some((x) => deps.includes(x));
  });
  return { sets, boardWhere };
}

// ---------------------------------------------------------------- OData $filter

export class QueryError extends Error {}

type Tok = { k: 'id' | 'str' | 'num' | 'op' | 'lp' | 'rp' | 'comma' | 'lit'; v: string };

function tokens(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '(') (out.push({ k: 'lp', v: ch }), i++);
    else if (ch === ')') (out.push({ k: 'rp', v: ch }), i++);
    else if (ch === ',') (out.push({ k: 'comma', v: ch }), i++);
    else if (ch === "'") {
      let s = '';
      i++;
      for (;;) {
        if (i >= src.length) throw new QueryError('a text value is not closed');
        if (src[i] === "'") {
          if (src[i + 1] === "'") {
            s += "'";
            i += 2;
            continue;
          }
          i++;
          break;
        }
        s += src[i++];
      }
      out.push({ k: 'str', v: s });
    } else {
      // A date, time, guid, number or name: everything up to the next space, comma or bracket.
      const m = /^[^\s(),']+/.exec(src.slice(i));
      if (!m) throw new QueryError(`cannot read "${src.slice(i, i + 20)}"`);
      let word = m[0];
      i += word.length;
      // OData v3 style typed literals (datetimeoffset'…', datetime'…', guid'…'): the quoted part is the value.
      if (/^(datetimeoffset|datetime|guid|date)$/i.test(word) && src[i] === "'") {
        const end = src.indexOf("'", i + 1);
        if (end < 0) throw new QueryError('a value is not closed');
        word = src.slice(i + 1, end);
        i = end + 1;
        out.push({ k: 'lit', v: word });
        continue;
      }
      if (/^(eq|ne|gt|ge|lt|le|and|or|not)$/i.test(word)) out.push({ k: 'op', v: word.toLowerCase() });
      else if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(word)) out.push({ k: 'num', v: word });
      else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(word)) out.push({ k: 'id', v: word });
      else out.push({ k: 'lit', v: word });
    }
  }
  return out;
}

const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,7})?)?(Z|[+-]\d{2}:\d{2})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SQL_OP: Record<string, string> = { eq: '=', ne: '<>', gt: '>', ge: '>=', lt: '<', le: '<=' };

/** A literal as a typed SQL parameter for this column, or a QueryError a person can read. */
function literalFor(p: Prop, t: Tok, add: (v: unknown) => string): string {
  const v = t.v;
  const bad = () => new QueryError(`${p.name} cannot be compared with ${t.k === 'str' ? `'${v}'` : v}`);
  switch (p.type) {
    case 'Edm.DateTimeOffset': {
      const s = v.length > 7 && v.length < 40 && (DATETIME.test(v) || DATE.test(v)) ? v : null;
      if (!s || Number.isNaN(Date.parse(DATE.test(s) ? `${s}T00:00:00Z` : /Z|[+-]\d{2}:\d{2}$/.test(s) ? s : `${s}Z`))) throw bad();
      return `${add(DATE.test(s) ? `${s}T00:00:00Z` : /Z|[+-]\d{2}:\d{2}$/.test(s) ? s : `${s}Z`)}::timestamptz`;
    }
    case 'Edm.Date':
      if (!DATE.test(v.slice(0, 10)) || Number.isNaN(Date.parse(`${v.slice(0, 10)}T00:00:00Z`))) throw bad();
      return `${add(v.slice(0, 10))}::date`;
    case 'Edm.Guid':
      if (!GUID.test(v)) throw bad();
      return `${add(v.toLowerCase())}::uuid`;
    case 'Edm.Int32':
    case 'Edm.Double':
    case 'Edm.Decimal':
      if (t.k !== 'num') throw bad();
      return `${add(v)}::numeric`;
    case 'Edm.Boolean':
      if (t.k !== 'id' || !/^(true|false)$/.test(v)) throw bad();
      return v === 'true' ? 'true' : 'false';
    default:
      if (t.k !== 'str') throw bad();
      return `${add(v)}::text`;
  }
}

/** `$filter` as SQL over the dataset's own columns, with its values as parameters. */
export function filterSql(src: string, props: Prop[], add: (v: unknown) => string): string {
  if (src.length > 2000) throw new QueryError('$filter is too long');
  const toks = tokens(src);
  let at = 0;
  const peek = () => toks[at];
  const next = () => toks[at++];
  const want = (k: Tok['k']) => {
    const t = next();
    if (!t || t.k !== k) throw new QueryError(`expected ${k === 'rp' ? ')' : k === 'lp' ? '(' : k === 'comma' ? ',' : 'a name'} in $filter`);
    return t;
  };
  const prop = (name: string) => {
    const p = props.find((x) => x.name === name);
    if (!p) throw new QueryError(`${name} is not a column of this dataset`);
    if (!p.filter) throw new QueryError(`${name} cannot be used in $filter or $orderby`);
    return p;
  };
  let depth = 0;
  const primary = (): string => {
    const t = next();
    if (!t) throw new QueryError('$filter ends too early');
    if (t.k === 'lp') {
      if (++depth > 20) throw new QueryError('$filter is nested too deep');
      const inner = or();
      want('rp');
      depth--;
      return `(${inner})`;
    }
    if (t.k === 'op' && t.v === 'not') return `not (${primary()})`;
    if (t.k !== 'id') throw new QueryError(`unexpected "${t.v}" in $filter`);
    const fn = t.v.toLowerCase();
    if (peek()?.k === 'lp' && ['contains', 'startswith', 'endswith'].includes(fn)) {
      next();
      const p = prop(want('id').v);
      want('comma');
      const s = next();
      if (!s || s.k !== 'str' || p.type !== 'Edm.String') throw new QueryError(`${fn}() takes a text column and a text value`);
      want('rp');
      const v = add(s.v.toLowerCase());
      if (fn === 'contains') return `strpos(lower(${p.sql}), ${v}::text) > 0`;
      if (fn === 'startswith') return `left(lower(${p.sql}), length(${v}::text)) = ${v}::text`;
      return `right(lower(${p.sql}), length(${v}::text)) = ${v}::text`;
    }
    const p = prop(t.v);
    const op = next();
    if (!op || op.k !== 'op' || !SQL_OP[op.v]) throw new QueryError(`expected eq, ne, gt, ge, lt or le after ${p.name}`);
    const val = next();
    if (!val) throw new QueryError('$filter ends too early');
    if (val.k === 'id' && val.v === 'null') {
      if (op.v === 'eq') return `${p.sql} is null`;
      if (op.v === 'ne') return `${p.sql} is not null`;
      throw new QueryError('null can only be compared with eq or ne');
    }
    return `${p.sql} ${SQL_OP[op.v]} ${literalFor(p, val, add)}`;
  };
  const and = (): string => {
    const parts = [primary()];
    while (peek()?.k === 'op' && peek().v === 'and') (next(), parts.push(primary()));
    return parts.join(' and ');
  };
  const or = (): string => {
    const parts = [and()];
    while (peek()?.k === 'op' && peek().v === 'or') (next(), parts.push(and()));
    return parts.length > 1 ? `(${parts.join(' or ')})` : parts[0];
  };
  const out = or();
  if (at < toks.length) throw new QueryError(`unexpected "${toks[at].v}" in $filter`);
  return out;
}

// ---------------------------------------------------------------- one page

export interface PageQuery {
  select?: string[];
  filter?: string;
  orderby?: string;
  top?: number;
  skip?: number;
  count?: boolean;
  /** Rows per page wanted (capped at PAGE_MAX). */
  pageSize?: number;
  /** From $skiptoken / cursor. */
  token?: Cursor | null;
  /** From $deltatoken / since: rows changed at or after this moment. */
  since?: string | null;
}

/** Where the next page starts: after a key (the default order), or at an offset (a chosen order or $skip). */
export type Cursor = ({ k: string[] } | { o: number }) & { s?: string };

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0)));

/** A page cursor for the analytics feeds, as opaque base64 text. */
export const encodeCursor = (c: Cursor) => b64(JSON.stringify(c));
/** Reads a page cursor; throws QueryError (start again from page one) for one not made by encodeCursor. */
export function decodeCursor(s: string): Cursor {
  try {
    const v = JSON.parse(unb64(s));
    const started = typeof v?.s === 'string' && DATETIME.test(v.s) ? { s: v.s as string } : {};
    if (Array.isArray(v?.k) && v.k.length <= 4 && v.k.every((x: unknown) => typeof x === 'string' && x.length <= 80)) return { k: v.k, ...started };
    if (Number.isInteger(v?.o) && v.o >= 0 && v.o <= 10_000_000) return { o: v.o, ...started };
  } catch {
    /* falls through */
  }
  throw new QueryError('the page token is not valid; start again from the first page');
}
/**
 * A delta token for "what changed since this read". It starts DELTA_OVERLAP_MS earlier than the read, so a row
 * written during the read is sent again rather than missed (BI tools de-duplicate by id).
 */
export const encodeDelta = (at: Date) => b64(JSON.stringify({ t: new Date(at.getTime() - DELTA_OVERLAP_MS).toISOString() }));
/** Reads a delta token back to its ISO time; throws QueryError (read the dataset in full) for a bad token. */
export function decodeDelta(s: string): string {
  try {
    const v = JSON.parse(unb64(s));
    if (typeof v?.t === 'string' && DATETIME.test(v.t)) return v.t;
  } catch {
    /* falls through */
  }
  throw new QueryError('the delta token is not valid; read the dataset again in full');
}

/** A value as the feed writes it: times in UTC with milliseconds, days as YYYY-MM-DD, numbers as numbers. */
function selectSql(p: Prop): string {
  if (p.conv) return p.sql;
  if (p.type === 'Edm.DateTimeOffset') return `to_char(${p.sql} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
  if (p.type === 'Edm.Date') return `to_char(${p.sql}, 'YYYY-MM-DD')`;
  if (p.type === 'Edm.Guid') return `(${p.sql})::text`;
  return p.sql;
}

function outValue(p: Prop, v: unknown): unknown {
  if (p.conv) return p.conv(v);
  if (v === null || v === undefined) return null;
  if (p.type === 'Edm.Decimal' || p.type === 'Edm.Double' || p.type === 'Edm.Int32') return Number(v);
  if (p.type === 'Edm.Boolean') return v === true || v === 't' || v === 'true';
  return v;
}

export interface Page {
  props: Prop[];
  rows: Record<string, unknown>[];
  next: Cursor | null;
  /** How many of $top are left for the next page (undefined: no $top). */
  topLeft?: number;
  count?: number;
}

/** Reads one page of one dataset. `boardWhere` narrows board-based sets to the key's departments. */
export async function readPage(q: Q, d: Dataset, pq: PageQuery, boardWhere: string | null): Promise<Page> {
  const params: unknown[] = [];
  const add = (v: unknown) => `$${params.push(v)}`;
  const where: string[] = ['true', ...(d.where ?? [])];
  if (boardWhere && d.departments === 'boards') where.push(boardWhere);
  if (pq.filter) where.push(filterSql(pq.filter, d.props, add));
  if (pq.since) {
    const mod = d.props.find((p) => p.name === 'ModifiedAt');
    if (mod) where.push(`${mod.sql} >= ${add(pq.since)}::timestamptz`);
  }
  // Columns: all, or the ones asked for (in the dataset's order).
  let props = d.props;
  const wanted = pq.select ?? [];
  if (wanted.length) {
    for (const s of wanted) if (!d.props.some((p) => p.name === s)) throw new QueryError(`${s} is not a column of this dataset`);
    props = d.props.filter((p) => wanted.includes(p.name));
  }
  const count = pq.count ? (await q.query<{ n: number }>(`select count(*)::int as n ${d.from} where ${where.join(' and ')}`, params))[0].n : undefined;

  const size = Math.min(PAGE_MAX, Math.max(1, pq.pageSize ?? PAGE_DEFAULT));
  const take = pq.top !== undefined ? Math.min(size, pq.top) : size;
  if (take <= 0) return { props, rows: [], next: null, topLeft: 0, count };

  // A chosen order (or $skip) pages by offset; the default order pages after the last key, which stays fast however deep.
  const order: string[] = [];
  if (pq.orderby) {
    for (const part of pq.orderby.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 5)) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)(\s+(asc|desc))?$/i.exec(part);
      if (!m) throw new QueryError(`cannot read $orderby "${part}"`);
      const p = d.props.find((x) => x.name === m[1]);
      if (!p) throw new QueryError(`${m[1]} is not a column of this dataset`);
      if (!p.filter) throw new QueryError(`${m[1]} cannot be used in $filter or $orderby`);
      order.push(`${p.sql} ${m[3]?.toLowerCase() === 'desc' ? 'desc' : 'asc'} nulls last`);
    }
  }
  const byOffset = order.length > 0 || (pq.skip ?? 0) > 0 || (!!pq.token && 'o' in pq.token);
  let offset = 0;
  if (byOffset) offset = (pq.token && 'o' in pq.token ? pq.token.o : 0) + (pq.token ? 0 : (pq.skip ?? 0));
  else if (pq.token && 'k' in pq.token) {
    if (pq.token.k.length !== d.keys.length) throw new QueryError('the page token is not valid; start again from the first page');
    const tuple = d.keys.map((k) => k.sql).join(', ');
    const vals = pq.token.k.map((v, i) => `${add(v)}::${d.keys[i].cast}`).join(', ');
    where.push(`(${tuple}) > (${vals})`);
  }
  const keyOrder = d.keys.map((k) => `${k.sql} asc`);
  const sql = `select ${props.map((p, i) => `${selectSql(p)} as c${i}`).join(', ')}, ${d.keys.map((k, i) => `(${k.sql})::text as k${i}`).join(', ')}
      ${d.from} where ${where.join(' and ')} order by ${[...order, ...keyOrder].join(', ')} limit ${take + 1}${byOffset ? ` offset ${offset}` : ''}`;
  const got = await q.query<Row>(sql, params);
  const more = got.length > take;
  const page = more ? got.slice(0, take) : got;
  const rows = page.map((r) => Object.fromEntries(props.map((p, i) => [p.name, outValue(p, r[`c${i}`])])));
  const topLeft = pq.top !== undefined ? pq.top - rows.length : undefined;
  let next: Cursor | null = null;
  if (more && (topLeft === undefined || topLeft > 0)) {
    const last = page[page.length - 1];
    next = byOffset ? { o: offset + rows.length } : { k: d.keys.map((_k, i) => String(last[`k${i}`])) };
    if (pq.token?.s) next.s = pq.token.s;
  }
  return { props, rows, next, topLeft, count };
}

// ---------------------------------------------------------------- $metadata

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The service's $metadata (CSDL XML, OData 4.0), for exactly these datasets and columns. */
export function metadataXml(sets: Dataset[]): string {
  const types = sets
    .map(
      (d) =>
        `<EntityType Name="${xml(d.entity)}"><Key><PropertyRef Name="Id"/></Key>${d.props
          .map((p) => `<Property Name="${xml(p.name)}" Type="${p.type}"${p.name === 'Id' || !p.nullable ? ' Nullable="false"' : ''}${p.type === 'Edm.DateTimeOffset' ? ' Precision="3"' : ''}/>`)
          .join('')}</EntityType>`,
    )
    .join('');
  const container = sets.map((d) => `<EntitySet Name="${xml(d.name)}" EntityType="Curahold.${xml(d.entity)}"/>`).join('');
  return `<?xml version="1.0" encoding="utf-8"?><edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"><edmx:DataServices><Schema Namespace="Curahold" xmlns="http://docs.oasis-open.org/odata/ns/edm">${types}<EntityContainer Name="Analytics">${container}</EntityContainer></Schema></edmx:DataServices></edmx:Edmx>`;
}

/** The BI tool behind a request, from its User-Agent (for the admin page and the owner's console). */
export function toolOf(ua: string | undefined): string {
  const s = ua ?? '';
  if (/Microsoft\.Data\.Mashup|PowerBI|Power ?Query/i.test(s)) return 'powerquery';
  if (/Tableau/i.test(s)) return 'tableau';
  if (/Qlik/i.test(s)) return 'qlik';
  if (/Zoho/i.test(s)) return 'zoho';
  if (/Google-Apps-Script|GoogleDocs/i.test(s)) return 'lookerstudio';
  if (/Domo/i.test(s)) return 'domo';
  if (/SAP/i.test(s)) return 'sap';
  if (/python|curl|node|axios|Go-http|okhttp|java/i.test(s)) return 'script';
  return s ? 'other' : 'unknown';
}

/** CSV text: one header row, then values; times and days as written in JSON. */
export function csvOf(props: Prop[], rows: Record<string, unknown>[], header = true): string {
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v);
    // A value a spreadsheet would run as a formula starts with a quote mark.
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
    return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = rows.map((r) => props.map((p) => cell(r[p.name])).join(','));
  return `${header ? `${props.map((p) => p.name).join(',')}\r\n` : ''}${lines.join('\r\n')}${lines.length ? '\r\n' : ''}`;
}

