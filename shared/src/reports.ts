// Reports people build themselves: pick what to look at (tasks, customers,
// opportunities, contact, time), narrow it down, group it, sum it up, and
// choose how to draw it. A report is a small description (ReportDef); the
// server turns it into one query inside what the person asking may see.
import { phrase as P } from './i18n';
import type { Localized, OptionColor } from './model';


/** 'deals' means the company's opportunities; any other record type is `record:<key>`. */
export type ReportSource = 'tasks' | 'accounts' | 'deals' | 'activities' | 'time' | `record:${string}`;
export const BASE_SOURCES = ['tasks', 'accounts', 'activities', 'time'] as const;

export const REPORT_FIELD_TYPES = ['text', 'number', 'money', 'days', 'minutes', 'date', 'choice', 'person', 'ref', 'bool'] as const;
export type ReportFieldType = (typeof REPORT_FIELD_TYPES)[number];

export interface ReportField {
  key: string;
  label: Localized;
  type: ReportFieldType;
  /** Choices (for a choice), with their colours. */
  options?: { key: string; label: Localized; color?: OptionColor | null }[];
  /** Can be grouped by / summed / shown as a column. */
  group?: boolean;
  measure?: boolean;
}

export interface ReportSourceInfo {
  key: ReportSource;
  name: Localized;
  fields: ReportField[];
}

export const CHARTS = ['bar', 'column', 'stacked', 'line', 'donut', 'number', 'gauge', 'table'] as const;
export type ChartKind = (typeof CHARTS)[number];

export const BUCKETS = ['day', 'week', 'month', 'quarter', 'year'] as const;
export type Bucket = (typeof BUCKETS)[number];

export const MEASURE_FNS = ['count', 'sum', 'avg', 'min', 'max'] as const;
export type MeasureFn = (typeof MEASURE_FNS)[number];

/** What a filter can ask, by the kind of field. */
export const FILTER_OPS = {
  text: ['contains', 'empty', 'not_empty'],
  number: ['gte', 'lte', 'eq', 'empty', 'not_empty'],
  date: ['last_days', 'next_days', 'this', 'last', 'before', 'after', 'empty', 'not_empty'],
  choice: ['in', 'not_in', 'empty', 'not_empty'],
  bool: ['yes', 'no'],
} as const;
export type FilterOp = (typeof FILTER_OPS)[keyof typeof FILTER_OPS][number];
export const PERIODS = ['week', 'month', 'quarter', 'year'] as const;
export type Period = (typeof PERIODS)[number];

export const opsFor = (type: ReportFieldType): readonly FilterOp[] =>
  type === 'text' ? FILTER_OPS.text : type === 'date' ? FILTER_OPS.date : type === 'bool' ? FILTER_OPS.bool : type === 'choice' || type === 'person' || type === 'ref' ? FILTER_OPS.choice : FILTER_OPS.number;

export interface ReportFilter {
  field: string;
  op: FilterOp;
  /** Chosen options, people ('me' is whoever is looking) or things. */
  values?: string[];
  /** A number, a count of days, or text. */
  value?: number | string;
  period?: Period;
  /** A day (YYYY-MM-DD) for before / after. */
  date?: string;
}

export interface ReportGroup {
  field: string;
  bucket?: Bucket;
}

/** How a report lays its rows out: a list, groups with their rows and subtotals, or a grid of two groupings. */
export const FORMATS = ['tabular', 'summary', 'matrix'] as const;
export type ReportFormat = (typeof FORMATS)[number];

export interface ReportDef {
  source: ReportSource;
  /** Without one: tabular when nothing is grouped, otherwise summary. */
  format?: ReportFormat;
  /** Draw a chart above the table (always, on a dashboard). */
  showChart?: boolean;
  filters: ReportFilter[];
  /** None: a list of rows (or one figure). One: bars. Two: the second splits each bar. */
  groups: ReportGroup[];
  measure: { fn: MeasureFn; field?: string };
  chart: ChartKind;
  /** Columns of the list of rows. */
  columns?: string[];
  /** How many groups to draw; the rest become "Other". */
  top?: number;
  sort?: 'value' | 'label';
  /** What a gauge fills up to (a figure with no grouping). */
  goal?: number;
}

export interface SavedReport {
  id: string;
  name: string;
  description: string;
  def: ReportDef;
  /** Everyone in the company can open it (each sees their own data in it). */
  shared: boolean;
  createdBy: string | null;
  mine: boolean;
  updatedAt: string;
}

export type ReportUnit = 'count' | 'money' | 'number' | 'hours' | 'days';

export interface ReportGroupRow {
  key: string;
  label: string;
  color?: OptionColor | null;
  value: number;
  /** How many rows are in it. */
  count?: number;
  /** One per series, when the report has a second grouping. */
  cells?: number[];
  counts?: number[];
}

export type ReportResult =
  /** The report reads a field the company does not have, or this person may not see. */
  | { kind: 'missing'; what: string }
  | {
      kind: 'ok';
      unit: ReportUnit;
      /** Money: the field it came from (for the currency and format). */
      moneyField?: string | null;
      total: number;
      /** How many rows the figures were worked out from. */
      matched: number;
      groups: ReportGroupRow[];
      series: { key: string; label: string; color?: OptionColor | null }[];
      /** The first grouping is time: the keys are the first day of each bucket. */
      bucket: Bucket | null;
      format?: ReportFormat;
      /** The rows; in a summary, `keys` says which group (and inner group) each row is in. */
      table: { columns: { key: string; label: string; type: ReportFieldType }[]; rows: (string | number | null)[][]; keys?: string[][]; more: boolean } | null;
    };

/**
 * A chart has room for a dozen bars, not two hundred: past `top`, the rest
 * are added up into one "Other" — only for figures that add up (counts and
 * sums), and never for time, where every bucket keeps its place.
 */
export function foldTop(r: Extract<ReportResult, { kind: 'ok' }>, top: number, other: string): Extract<ReportResult, { kind: 'ok' }> {
  if (r.bucket || r.groups.length <= top || (r.unit !== 'count' && r.unit !== 'money' && r.unit !== 'hours' && r.unit !== 'number')) return r;
  const rest = r.groups.slice(top);
  const sum = (pick: (g: ReportGroupRow) => number) => rest.reduce((n, g) => n + pick(g), 0);
  const folded: ReportGroupRow = {
    key: '~other',
    label: other,
    color: 'stone',
    value: sum((g) => g.value),
    count: sum((g) => g.count ?? 0),
    ...(r.series.length ? { cells: r.series.map((_, i) => sum((g) => g.cells?.[i] ?? 0)) } : {}),
  };
  return { ...r, groups: [...r.groups.slice(0, top), folded] };
}

/** Tells a half-made report from one that can be run. */
export function defProblem(def: ReportDef, source: ReportSourceInfo | undefined): string | null {
  if (!source) return 'source';
  const f = (k: string) => source.fields.find((x) => x.key === k);
  for (const g of def.groups) if (!f(g.field)?.group) return `group:${g.field}`;
  if (def.measure.fn !== 'count' && !f(def.measure.field ?? '')?.measure) return 'measure';
  for (const x of def.filters) if (!f(x.field)) return `filter:${x.field}`;
  return null;
}

export const blankDef = (source: ReportSource = 'tasks'): ReportDef => ({ source, filters: [], groups: [], measure: { fn: 'count' }, chart: 'table' });

/** The chart that suits a shape, when the person has not chosen one that does. */
export function fitChart(def: ReportDef): ChartKind {
  const n = def.groups.length;
  if (n === 0) return def.chart === 'number' || def.chart === 'gauge' ? def.chart : 'table';
  if (def.chart === 'table') return 'table';
  if (n === 2) return def.chart === 'column' || def.chart === 'line' || def.chart === 'stacked' ? def.chart : 'stacked';
  return def.chart === 'number' || def.chart === 'stacked' ? 'bar' : def.chart;
}

// ------------------------------------------------------------ ready-made
// Fields are named by what they are for ($money, $renewal, $health, $tier):
// each company calls and keys them differently, and the server picks the one
// that fits (or says the report needs a field the company does not have).

export interface LibraryReport {
  key: string;
  name: Localized;
  help: Localized;
  def: ReportDef;
}

const r = (key: string, name: Localized, help: Localized, def: ReportDef): LibraryReport => ({ key, name, help, def });
const openTasks: ReportFilter = { field: 'state', op: 'in', values: ['open'] };
const openDeals: ReportFilter = { field: 'status', op: 'in', values: ['open'] };
const wonDeals: ReportFilter = { field: 'status', op: 'in', values: ['won'] };

export const REPORT_LIBRARY: LibraryReport[] = [
  r('open_by_person', P('rlib.open_work_by_person'), P('rlib.who_is_carrying_how_much_right'), {
    source: 'tasks', filters: [openTasks], groups: [{ field: 'assignee' }], measure: { fn: 'count' }, chart: 'bar', top: 12,
  }),
  r('overdue_by_person', P('rlib.overdue_by_person'), P('rlib.open_tasks_past_their_date'), {
    source: 'tasks', filters: [{ field: 'overdue', op: 'yes' }], groups: [{ field: 'assignee' }], measure: { fn: 'count' }, chart: 'bar', top: 12,
  }),
  r('done_per_week', P('rlib.finished_per_week'), P('rlib.the_last_twelve_weeks'), {
    source: 'tasks', filters: [{ field: 'done', op: 'last_days', value: 84 }], groups: [{ field: 'done', bucket: 'week' }], measure: { fn: 'count' }, chart: 'line',
  }),
  r('created_per_week', P('rlib.new_work_per_week'), P('rlib.what_came_in_by_priority'), {
    source: 'tasks', filters: [{ field: 'created', op: 'last_days', value: 84 }], groups: [{ field: 'created', bucket: 'week' }, { field: 'priority' }], measure: { fn: 'count' }, chart: 'stacked',
  }),
  r('open_by_status', P('rlib.open_work_by_status'), P('rlib.where_the_work_is_standing'), {
    source: 'tasks', filters: [openTasks], groups: [{ field: 'status' }], measure: { fn: 'count' }, chart: 'column',
  }),
  r('open_by_priority', P('rlib.open_work_by_priority'), P('rlib.how_much_of_it_is_urgent'), {
    source: 'tasks', filters: [openTasks], groups: [{ field: 'priority' }], measure: { fn: 'count' }, chart: 'donut',
  }),
  r('open_by_board', P('rlib.open_work_by_board'), P('rlib.which_board_holds_the_most'), {
    source: 'tasks', filters: [openTasks], groups: [{ field: 'board' }], measure: { fn: 'count' }, chart: 'bar',
  }),
  r('days_to_done', P('rlib.days_from_opening_to_done'), P('rlib.the_average_month_by_month'), {
    source: 'tasks', filters: [{ field: 'done', op: 'last_days', value: 180 }], groups: [{ field: 'done', bucket: 'month' }], measure: { fn: 'avg', field: 'days_to_done' }, chart: 'column',
  }),
  r('tasks_by_customer', P('rlib.open_work_by_customer'), P('rlib.the_ten_customers_with_the_most'), {
    source: 'tasks', filters: [openTasks, { field: 'account', op: 'not_empty' }], groups: [{ field: 'account' }], measure: { fn: 'count' }, chart: 'bar', top: 10,
  }),
  r('customers_by_health', P('rlib.customers_by_health'), P('rlib.how_many_are_well_watched_at'), {
    source: 'accounts', filters: [], groups: [{ field: '$health' }], measure: { fn: 'count' }, chart: 'donut',
  }),
  r('value_by_health', P('rlib.value_by_health'), P('rlib.how_much_money_sits_where'), {
    source: 'accounts', filters: [], groups: [{ field: '$health' }], measure: { fn: 'sum', field: '$money' }, chart: 'donut',
  }),
  r('value_by_owner', P('rlib.value_by_owner'), P('rlib.who_looks_after_how_much'), {
    source: 'accounts', filters: [], groups: [{ field: 'owner' }], measure: { fn: 'sum', field: '$money' }, chart: 'bar', top: 12,
  }),
  r('customers_by_tier', P('rlib.customers_by_segment'), P('rlib.and_their_health_inside_each_segment'), {
    source: 'accounts', filters: [], groups: [{ field: '$tier' }, { field: '$health' }], measure: { fn: 'count' }, chart: 'stacked',
  }),
  r('renewals_by_month', P('rlib.renewals_by_month'), P('rlib.the_value_coming_up_for_renewal'), {
    source: 'accounts', filters: [{ field: '$renewal', op: 'next_days', value: 365 }], groups: [{ field: '$renewal', bucket: 'month' }], measure: { fn: 'sum', field: '$money' }, chart: 'column',
  }),
  r('health_by_owner', P('rlib.average_health_score_by_owner'), P('rlib.whose_customers_need_a_hand'), {
    source: 'accounts', filters: [], groups: [{ field: 'owner' }], measure: { fn: 'avg', field: 'health_score' }, chart: 'bar', top: 12,
  }),
  r('pipeline_by_stage', P('rlib.open_pipeline_by_stage'), P('rlib.the_value_at_each_stage'), {
    source: 'deals', filters: [openDeals], groups: [{ field: 'stage' }], measure: { fn: 'sum', field: 'amount' }, chart: 'column',
  }),
  r('won_by_month', P('rlib.won_by_month'), P('rlib.what_closed_by_type'), {
    source: 'deals', filters: [wonDeals, { field: 'close_date', op: 'last_days', value: 365 }], groups: [{ field: 'close_date', bucket: 'month' }, { field: 'kind' }], measure: { fn: 'sum', field: 'amount' }, chart: 'stacked',
  }),
  r('won_by_owner', P('rlib.won_by_owner'), P('rlib.this_year_by_who_closed_it'), {
    source: 'deals', filters: [wonDeals, { field: 'close_date', op: 'this', period: 'year' }], groups: [{ field: 'owner' }], measure: { fn: 'sum', field: 'amount' }, chart: 'bar', top: 12,
  }),
  r('pipeline_by_kind', P('rlib.open_pipeline_by_type'), P('rlib.new_business_expansion_renewal'), {
    source: 'deals', filters: [openDeals], groups: [{ field: 'kind' }], measure: { fn: 'sum', field: 'amount' }, chart: 'donut',
  }),
  r('deals_by_status', P('rlib.won_and_lost'), P('rlib.how_the_closed_ones_ended_this'), {
    source: 'deals', filters: [{ field: 'status', op: 'in', values: ['won', 'lost'] }, { field: 'close_date', op: 'this', period: 'year' }], groups: [{ field: 'status' }], measure: { fn: 'count' }, chart: 'donut',
  }),
  r('open_pipeline', P('rlib.open_pipeline'), P('rlib.one_figure'), {
    source: 'deals', filters: [openDeals], groups: [], measure: { fn: 'sum', field: 'amount' }, chart: 'number',
  }),
  r('won_this_quarter', P('rlib.won_this_quarter'), P('rlib.one_figure'), {
    source: 'deals', filters: [wonDeals, { field: 'close_date', op: 'this', period: 'quarter' }], groups: [], measure: { fn: 'sum', field: 'amount' }, chart: 'number',
  }),
  r('contact_per_week', P('rlib.customer_contact_per_week'), P('rlib.calls_meetings_emails_and_notes'), {
    source: 'activities', filters: [{ field: 'happened', op: 'last_days', value: 84 }], groups: [{ field: 'happened', bucket: 'week' }, { field: 'kind' }], measure: { fn: 'count' }, chart: 'stacked',
  }),
  r('contact_by_person', P('rlib.customer_contact_by_person'), P('rlib.the_last_thirty_days'), {
    source: 'activities', filters: [{ field: 'happened', op: 'last_days', value: 30 }], groups: [{ field: 'author' }], measure: { fn: 'count' }, chart: 'bar', top: 12,
  }),
  r('hours_by_person', P('rlib.hours_by_person'), P('rlib.time_logged_in_the_last_thirty'), {
    source: 'time', filters: [{ field: 'day', op: 'last_days', value: 30 }], groups: [{ field: 'user' }], measure: { fn: 'sum', field: 'minutes' }, chart: 'bar', top: 12,
  }),
  r('hours_by_customer', P('rlib.hours_by_customer'), P('rlib.where_the_time_went_last_ninety'), {
    source: 'time', filters: [{ field: 'day', op: 'last_days', value: 90 }, { field: 'account', op: 'not_empty' }], groups: [{ field: 'account' }], measure: { fn: 'sum', field: 'minutes' }, chart: 'bar', top: 10,
  }),
];

export const libraryReport = (key: string) => REPORT_LIBRARY.find((x) => x.key === key);

// ------------------------------------------------------- ready dashboards

/** A card on a ready-made dashboard: one of the home cards, or a library report. */
export type TemplateCard =
  | { report: string; size: 'third' | 'half' | 'full'; chart?: ChartKind }
  | { type: 'metric' | 'renewals' | 'attention' | 'quiet' | 'stakeholders' | 'team_load' | 'my_tasks'; size: 'third' | 'half' | 'full'; metric?: string; days?: number; scope?: 'mine' | 'team' | 'all' };

export interface DashboardTemplate {
  key: string;
  name: Localized;
  help: Localized;
  /** What it mostly shows, for the small picture in the gallery. */
  look: ChartKind[];
  cards: TemplateCard[];
}

export const DASHBOARD_TEMPLATES: DashboardTemplate[] = [
  {
    key: 'sales',
    name: P('rlib.sales_pipeline'),
    help: P('rlib.open_pipeline_by_stage_and_type'),
    look: ['number', 'column', 'stacked', 'donut'],
    cards: [
      { report: 'open_pipeline', size: 'third' },
      { report: 'won_this_quarter', size: 'third' },
      { report: 'deals_by_status', size: 'third' },
      { report: 'pipeline_by_stage', size: 'half' },
      { report: 'pipeline_by_kind', size: 'half' },
      { report: 'won_by_month', size: 'full' },
      { report: 'won_by_owner', size: 'half' },
      { report: 'value_by_owner', size: 'half' },
    ],
  },
  {
    key: 'renewals',
    name: P('rlib.renewals_and_risk'),
    help: P('rlib.what_renews_when_how_much_of'),
    look: ['number', 'column', 'donut', 'table'],
    cards: [
      { type: 'metric', metric: 'renewals', days: 90, size: 'third' },
      { type: 'metric', metric: 'attention', size: 'third' },
      { type: 'metric', metric: 'money', size: 'third' },
      { report: 'renewals_by_month', size: 'full' },
      { type: 'renewals', days: 90, scope: 'all', size: 'half' },
      { report: 'value_by_health', size: 'half' },
      { type: 'attention', scope: 'all', size: 'half' },
      { type: 'quiet', days: 30, scope: 'all', size: 'half' },
    ],
  },
  {
    key: 'health',
    name: P('rlib.customer_health'),
    help: P('rlib.how_the_portfolio_is_doing_segment'),
    look: ['donut', 'stacked', 'bar', 'table'],
    cards: [
      { report: 'customers_by_health', size: 'third' },
      { report: 'value_by_health', size: 'third' },
      { type: 'metric', metric: 'attention', size: 'third' },
      { report: 'customers_by_tier', size: 'half' },
      { report: 'health_by_owner', size: 'half' },
      { type: 'stakeholders', scope: 'all', size: 'full' },
    ],
  },
  {
    key: 'team',
    name: P('rlib.team_performance'),
    help: P('rlib.who_carries_what_what_is_late'),
    look: ['bar', 'line', 'column', 'bar'],
    cards: [
      { report: 'open_by_person', size: 'half' },
      { report: 'overdue_by_person', size: 'half' },
      { report: 'done_per_week', size: 'full' },
      { report: 'days_to_done', size: 'half' },
      { report: 'hours_by_person', size: 'half' },
      { type: 'team_load', size: 'full' },
    ],
  },
  {
    key: 'engagement',
    name: P('rlib.customer_contact'),
    help: P('rlib.how_often_you_talk_to_customers'),
    look: ['stacked', 'bar', 'table', 'bar'],
    cards: [
      { report: 'contact_per_week', size: 'full' },
      { report: 'contact_by_person', size: 'half' },
      { type: 'quiet', days: 30, scope: 'all', size: 'half' },
      { report: 'hours_by_customer', size: 'half' },
      { report: 'tasks_by_customer', size: 'half' },
    ],
  },
  {
    key: 'flow',
    name: P('rlib.work_flow'),
    help: P('rlib.what_comes_in_what_gets_done'),
    look: ['stacked', 'line', 'column', 'donut'],
    cards: [
      { report: 'created_per_week', size: 'half' },
      { report: 'done_per_week', size: 'half' },
      { report: 'open_by_status', size: 'half' },
      { report: 'open_by_priority', size: 'half' },
      { report: 'open_by_board', size: 'half' },
      { report: 'tasks_by_customer', size: 'half' },
    ],
  },
  {
    key: 'exec',
    name: P('rlib.executive_summary'),
    help: P('rlib.one_page_for_the_people_who'),
    look: ['number', 'number', 'column', 'line'],
    cards: [
      { type: 'metric', metric: 'accounts', size: 'third' },
      { type: 'metric', metric: 'money', size: 'third' },
      { report: 'won_this_quarter', size: 'third' },
      { report: 'pipeline_by_stage', size: 'half' },
      { report: 'customers_by_health', size: 'half' },
      { report: 'renewals_by_month', size: 'half' },
      { report: 'done_per_week', size: 'half' },
    ],
  },
];
