// Reports people build themselves: pick what to look at (tasks, customers,
// opportunities, contact, time), narrow it down, group it, sum it up, and
// choose how to draw it. A report is a small description (ReportDef); the
// server turns it into one query inside what the person asking may see.
import type { Localized, OptionColor } from './model';

const L = (en: string, tr: string): Localized => ({ en, tr });

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
  r('open_by_person', L('Open work by person', 'Kişi bazında açık işler'), L('Who is carrying how much right now.', 'Şu an kim ne kadar taşıyor.'), {
    source: 'tasks', filters: [openTasks], groups: [{ field: 'assignee' }], measure: { fn: 'count' }, chart: 'bar', top: 12,
  }),
  r('overdue_by_person', L('Overdue by person', 'Kişi bazında gecikenler'), L('Open tasks past their date.', 'Tarihi geçmiş açık görevler.'), {
    source: 'tasks', filters: [{ field: 'overdue', op: 'yes' }], groups: [{ field: 'assignee' }], measure: { fn: 'count' }, chart: 'bar', top: 12,
  }),
  r('done_per_week', L('Finished per week', 'Haftalık biten işler'), L('The last twelve weeks.', 'Son on iki hafta.'), {
    source: 'tasks', filters: [{ field: 'done', op: 'last_days', value: 84 }], groups: [{ field: 'done', bucket: 'week' }], measure: { fn: 'count' }, chart: 'line',
  }),
  r('created_per_week', L('New work per week', 'Haftalık gelen işler'), L('What came in, by priority.', 'Gelen işler, önceliğe göre.'), {
    source: 'tasks', filters: [{ field: 'created', op: 'last_days', value: 84 }], groups: [{ field: 'created', bucket: 'week' }, { field: 'priority' }], measure: { fn: 'count' }, chart: 'stacked',
  }),
  r('open_by_status', L('Open work by status', 'Duruma göre açık işler'), L('Where the work is standing.', 'İşler nerede bekliyor.'), {
    source: 'tasks', filters: [openTasks], groups: [{ field: 'status' }], measure: { fn: 'count' }, chart: 'column',
  }),
  r('open_by_priority', L('Open work by priority', 'Önceliğe göre açık işler'), L('How much of it is urgent.', 'Ne kadarı acil.'), {
    source: 'tasks', filters: [openTasks], groups: [{ field: 'priority' }], measure: { fn: 'count' }, chart: 'donut',
  }),
  r('open_by_board', L('Open work by board', 'Panoya göre açık işler'), L('Which board holds the most.', 'En çok iş hangi panoda.'), {
    source: 'tasks', filters: [openTasks], groups: [{ field: 'board' }], measure: { fn: 'count' }, chart: 'bar',
  }),
  r('days_to_done', L('Days from opening to done', 'Açılıştan bitişe gün'), L('The average, month by month.', 'Ay ay ortalama.'), {
    source: 'tasks', filters: [{ field: 'done', op: 'last_days', value: 180 }], groups: [{ field: 'done', bucket: 'month' }], measure: { fn: 'avg', field: 'days_to_done' }, chart: 'column',
  }),
  r('tasks_by_customer', L('Open work by customer', 'Müşteri bazında açık işler'), L('The ten customers with the most open work.', 'En çok açık işi olan on müşteri.'), {
    source: 'tasks', filters: [openTasks, { field: 'account', op: 'not_empty' }], groups: [{ field: 'account' }], measure: { fn: 'count' }, chart: 'bar', top: 10,
  }),
  r('customers_by_health', L('Customers by health', 'Sağlığa göre müşteriler'), L('How many are well, watched, at risk.', 'Kaçı iyi, kaçı izlemede, kaçı riskli.'), {
    source: 'accounts', filters: [], groups: [{ field: '$health' }], measure: { fn: 'count' }, chart: 'donut',
  }),
  r('value_by_health', L('Value by health', 'Sağlığa göre tutar'), L('How much money sits where.', 'Paranın ne kadarı nerede duruyor.'), {
    source: 'accounts', filters: [], groups: [{ field: '$health' }], measure: { fn: 'sum', field: '$money' }, chart: 'donut',
  }),
  r('value_by_owner', L('Value by owner', 'Sorumluya göre tutar'), L('Who looks after how much.', 'Kim ne kadarına bakıyor.'), {
    source: 'accounts', filters: [], groups: [{ field: 'owner' }], measure: { fn: 'sum', field: '$money' }, chart: 'bar', top: 12,
  }),
  r('customers_by_tier', L('Customers by segment', 'Segmente göre müşteriler'), L('And their health inside each segment.', 'Ve her segmentin içindeki sağlık.'), {
    source: 'accounts', filters: [], groups: [{ field: '$tier' }, { field: '$health' }], measure: { fn: 'count' }, chart: 'stacked',
  }),
  r('renewals_by_month', L('Renewals by month', 'Aylara göre yenilemeler'), L('The value coming up for renewal in the next year.', 'Önümüzdeki bir yılda yenilenecek tutar.'), {
    source: 'accounts', filters: [{ field: '$renewal', op: 'next_days', value: 365 }], groups: [{ field: '$renewal', bucket: 'month' }], measure: { fn: 'sum', field: '$money' }, chart: 'column',
  }),
  r('health_by_owner', L('Average health score by owner', 'Sorumluya göre ortalama sağlık skoru'), L('Whose customers need a hand.', 'Kimin müşterileri destek istiyor.'), {
    source: 'accounts', filters: [], groups: [{ field: 'owner' }], measure: { fn: 'avg', field: 'health_score' }, chart: 'bar', top: 12,
  }),
  r('pipeline_by_stage', L('Open pipeline by stage', 'Aşamaya göre açık fırsatlar'), L('The value at each stage.', 'Her aşamadaki tutar.'), {
    source: 'deals', filters: [openDeals], groups: [{ field: 'stage' }], measure: { fn: 'sum', field: 'amount' }, chart: 'column',
  }),
  r('won_by_month', L('Won by month', 'Aylara göre kazanılan'), L('What closed, by type.', 'Kapanan fırsatlar, türüne göre.'), {
    source: 'deals', filters: [wonDeals, { field: 'close_date', op: 'last_days', value: 365 }], groups: [{ field: 'close_date', bucket: 'month' }, { field: 'kind' }], measure: { fn: 'sum', field: 'amount' }, chart: 'stacked',
  }),
  r('won_by_owner', L('Won by owner', 'Sorumluya göre kazanılan'), L('This year, by who closed it.', 'Bu yıl, kapatana göre.'), {
    source: 'deals', filters: [wonDeals, { field: 'close_date', op: 'this', period: 'year' }], groups: [{ field: 'owner' }], measure: { fn: 'sum', field: 'amount' }, chart: 'bar', top: 12,
  }),
  r('pipeline_by_kind', L('Open pipeline by type', 'Türe göre açık fırsatlar'), L('New business, expansion, renewal.', 'Yeni iş, genişleme, yenileme.'), {
    source: 'deals', filters: [openDeals], groups: [{ field: 'kind' }], measure: { fn: 'sum', field: 'amount' }, chart: 'donut',
  }),
  r('deals_by_status', L('Won and lost', 'Kazanılan ve kaybedilen'), L('How the closed ones ended, this year.', 'Bu yıl kapananlar nasıl bitti.'), {
    source: 'deals', filters: [{ field: 'status', op: 'in', values: ['won', 'lost'] }, { field: 'close_date', op: 'this', period: 'year' }], groups: [{ field: 'status' }], measure: { fn: 'count' }, chart: 'donut',
  }),
  r('open_pipeline', L('Open pipeline', 'Açık fırsat tutarı'), L('One figure.', 'Tek rakam.'), {
    source: 'deals', filters: [openDeals], groups: [], measure: { fn: 'sum', field: 'amount' }, chart: 'number',
  }),
  r('won_this_quarter', L('Won this quarter', 'Bu çeyrek kazanılan'), L('One figure.', 'Tek rakam.'), {
    source: 'deals', filters: [wonDeals, { field: 'close_date', op: 'this', period: 'quarter' }], groups: [], measure: { fn: 'sum', field: 'amount' }, chart: 'number',
  }),
  r('contact_per_week', L('Customer contact per week', 'Haftalık müşteri teması'), L('Calls, meetings, emails and notes.', 'Aramalar, toplantılar, e-postalar ve notlar.'), {
    source: 'activities', filters: [{ field: 'happened', op: 'last_days', value: 84 }], groups: [{ field: 'happened', bucket: 'week' }, { field: 'kind' }], measure: { fn: 'count' }, chart: 'stacked',
  }),
  r('contact_by_person', L('Customer contact by person', 'Kişi bazında müşteri teması'), L('The last thirty days.', 'Son otuz gün.'), {
    source: 'activities', filters: [{ field: 'happened', op: 'last_days', value: 30 }], groups: [{ field: 'author' }], measure: { fn: 'count' }, chart: 'bar', top: 12,
  }),
  r('hours_by_person', L('Hours by person', 'Kişi bazında saat'), L('Time logged in the last thirty days.', 'Son otuz günde girilen süre.'), {
    source: 'time', filters: [{ field: 'day', op: 'last_days', value: 30 }], groups: [{ field: 'user' }], measure: { fn: 'sum', field: 'minutes' }, chart: 'bar', top: 12,
  }),
  r('hours_by_customer', L('Hours by customer', 'Müşteri bazında saat'), L('Where the time went, last ninety days.', 'Süre nereye gitti, son doksan gün.'), {
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
    name: L('Sales pipeline', 'Satış hunisi'),
    help: L('Open pipeline by stage and type, what was won and by whom.', 'Aşama ve türe göre açık fırsatlar, ne kazanıldı, kim kazandı.'),
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
    name: L('Renewals and risk', 'Yenileme ve risk'),
    help: L('What renews when, how much of it is at risk, and who has gone quiet.', 'Ne zaman ne yenileniyor, ne kadarı riskte, kim sessiz kaldı.'),
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
    name: L('Customer health', 'Müşteri sağlığı'),
    help: L('How the portfolio is doing, segment by segment and owner by owner.', 'Portföy ne durumda: segment segment, sorumlu sorumlu.'),
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
    name: L('Team performance', 'Ekip performansı'),
    help: L('Who carries what, what is late, how fast work gets done and where the hours go.', 'Kim ne taşıyor, ne gecikti, işler ne hızla bitiyor, saatler nereye gidiyor.'),
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
    name: L('Customer contact', 'Müşteri teması'),
    help: L('How often you talk to customers, who does the talking, and who has heard nothing.', 'Müşterilerle ne sıklıkla konuşuluyor, kim konuşuyor, kim hiç ses duymadı.'),
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
    name: L('Work flow', 'İş akışı'),
    help: L('What comes in, what gets done, and where it waits.', 'Ne geliyor, ne bitiyor, nerede bekliyor.'),
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
    name: L('Executive summary', 'Yönetici özeti'),
    help: L('One page for the people who ask "how are we doing?".', '“Nasıl gidiyoruz?” diye soranlar için tek sayfa.'),
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
