// Pages: a role's home and the shared report pages, built from cards.
// A page says what to show; each viewer sees it filled with what they are
// allowed to see (their customers, the fields open to their role).
import { phrase as P } from './i18n';
import type { Localized, OptionColor } from './model';
import type { ChartKind, ReportResult, ReportSource } from './reports';

export const CARD_TYPES = [
  'my_tasks',
  'renewals',
  'attention',
  'quiet',
  'stakeholders',
  'metric',
  'breakdown',
  'team_load',
  'sync_health',
  'note',
  'report',
] as const;
export type CardType = (typeof CARD_TYPES)[number];

export const CARD_SIZES = ['third', 'half', 'full'] as const;
export type CardSize = (typeof CARD_SIZES)[number];

/** Whose customers a card counts: the viewer's own, their teams', or all they can see. */
export const CARD_SCOPES = ['mine', 'team', 'all'] as const;
export type CardScope = (typeof CARD_SCOPES)[number];

export const METRICS = ['accounts', 'money', 'attention', 'renewals', 'open_tasks', 'overdue'] as const;
export type Metric = (typeof METRICS)[number];

export const BREAKDOWNS = ['field', 'owner', 'team'] as const;
export type Breakdown = (typeof BREAKDOWNS)[number];

/** Which settings each card type takes (the editor shows only these). */
export const CARD_SETTINGS: Record<CardType, { scope?: true; days?: true; metric?: true; by?: true; field?: 'date' | 'select' | 'money'; options?: true; text?: true; report?: true }> = {
  my_tasks: {},
  renewals: { scope: true, days: true, field: 'date' },
  attention: { scope: true, field: 'select', options: true },
  quiet: { scope: true, days: true },
  stakeholders: { scope: true },
  metric: { scope: true, metric: true, days: true },
  breakdown: { scope: true, by: true, field: 'select' },
  team_load: {},
  sync_health: {},
  note: { text: true },
  report: { report: true },
};

export interface Card {
  id: string;
  type: CardType;
  size: CardSize;
  /** The card's own heading; without one the type's name is used. */
  title?: string;
  scope?: CardScope;
  /** Renewals within / quiet for this many days. */
  days?: number;
  metric?: Metric;
  by?: Breakdown;
  /** Account field the card reads: a date for renewals, a choice for attention and breakdowns, money for sums. */
  field?: string;
  /** Choices of that field that mean "needs attention". */
  options?: string[];
  text?: string;
  /** A report card draws a kept report (`reportId`) or one from the library (`report`). */
  reportId?: string;
  report?: string;
  chart?: ChartKind;
  /** What a gauge counts up to. */
  goal?: number;
}

export interface Page {
  id: string;
  name: string;
  /** A home (tabs on Home) or a dashboard (Reports → Dashboards). */
  kind: 'home' | 'dashboard';
  /** A dashboard's filter bar. */
  filters?: { person?: boolean; team?: boolean };
  cards: Card[];
  /** Role keys whose home this page is. */
  homeFor: string[];
  /** Role keys that may open it; empty means everyone. */
  sharedWith: string[];
  position: number;
  updatedAt: string;
  /** The ready-made dashboard this page started as, if it did. */
  template?: string | null;
}

export interface CardRow {
  id: string;
  /** Where the row leads: an account, a task's account, a person. */
  accountId?: string | null;
  title: string;
  sub?: string | null;
  /** A date shown at the end of the row (ISO day). */
  date?: string | null;
  /** Days left (negative = overdue) or days quiet. */
  days?: number | null;
  amount?: number | null;
  chip?: { label: string; color?: OptionColor | null } | null;
  ownerId?: string | null;
  flag?: 'overdue' | 'soon' | null;
}

export type CardData =
  | { kind: 'hidden' }
  /** The card needs a field the company does not have (or the viewer cannot see). */
  | { kind: 'missing'; need: 'date' | 'select' | 'money' | 'contacts' | 'report' | 'field' }
  | { kind: 'list'; rows: CardRow[]; total: number; extra?: number }
  | { kind: 'number'; value: number; unit: 'count' | 'money'; sub?: { value: number; unit: 'count' | 'money' } | null }
  | { kind: 'bars'; bars: { key: string; label: string; value: number; color?: OptionColor | null }[]; unit: 'count' | 'money' }
  | {
      kind: 'people';
      rows: { userId: string; name: string; accounts: number; open: number; overdue: number; attention: number; money: number | null }[];
      unit: 'money' | null;
    }
  | { kind: 'sync'; rows: { id: string; provider: string; name: string; status: string; lastRunAt: string | null; problems: number; ok: boolean }[] }
  | { kind: 'note'; text: string }
  | { kind: 'report'; name: string; chart: ChartKind; source: ReportSource; reportId: string | null; library: string | null; result: ReportResult; goal?: number };


/** Card names and one line each for the card library. */
export const CARD_INFO: Record<CardType, { name: Localized; help: Localized }> = {
  my_tasks: { name: P('plib.my_open_tasks'), help: P('plib.overdue_first_then_what_is_due') },
  renewals: { name: P('plib.coming_renewals'), help: P('plib.customers_whose_renewal_date_falls_within') },
  attention: { name: P('plib.needs_attention'), help: P('plib.customers_marked_at_risk_or_any') },
  quiet: { name: P('plib.gone_quiet'), help: P('plib.customers_with_no_task_activity_for') },
  stakeholders: { name: P('plib.stakeholder_risks'), help: P('plib.blockers_and_skeptics_and_customers_with') },
  metric: { name: P('plib.a_number'), help: P('plib.one_figure_customers_annual_value_at') },
  breakdown: { name: P('plib.breakdown'), help: P('plib.customers_split_by_a_choice_field') },
  team_load: { name: P('plib.team_load'), help: P('plib.per_person_customers_open_and_overdue') },
  sync_health: { name: P('plib.connections'), help: P('plib.whether_connected_tools_are_syncing_only') },
  note: { name: P('plib.note'), help: P('plib.your_own_words_a_welcome_a') },
  report: { name: P('plib.report'), help: P('plib.a_chart_from_a_report_you') },
};

/** The pages every new company starts with. */
export const DEFAULT_PAGES: { name: Localized; homeFor: string[]; cards: Card[] }[] = [
  {
    name: P('plib.my_day'),
    homeFor: ['member'],
    cards: [
      { id: 'c1', type: 'my_tasks', size: 'half' },
      { id: 'c2', type: 'renewals', size: 'half', scope: 'mine', days: 90 },
      { id: 'c3', type: 'attention', size: 'half', scope: 'mine' },
      { id: 'c4', type: 'quiet', size: 'half', scope: 'mine', days: 30 },
      { id: 'c5', type: 'stakeholders', size: 'full', scope: 'mine' },
    ],
  },
  {
    name: P('plib.team_view'),
    homeFor: ['admin', 'manager'],
    cards: [
      { id: 'c1', type: 'metric', size: 'third', metric: 'accounts' },
      { id: 'c2', type: 'metric', size: 'third', metric: 'money' },
      { id: 'c3', type: 'metric', size: 'third', metric: 'attention' },
      { id: 'c4', type: 'team_load', size: 'full' },
      { id: 'c5', type: 'renewals', size: 'half', scope: 'all', days: 90 },
      { id: 'c6', type: 'attention', size: 'half', scope: 'all' },
      { id: 'c7', type: 'breakdown', size: 'half', by: 'field' },
      { id: 'c8', type: 'breakdown', size: 'half', by: 'owner' },
      { id: 'c9', type: 'sync_health', size: 'full' },
    ],
  },
  {
    name: P('plib.leadership_summary'),
    homeFor: ['viewer'],
    cards: [
      { id: 'c1', type: 'metric', size: 'third', metric: 'accounts' },
      { id: 'c2', type: 'metric', size: 'third', metric: 'money' },
      { id: 'c3', type: 'metric', size: 'third', metric: 'renewals', days: 90 },
      { id: 'c4', type: 'breakdown', size: 'half', by: 'field' },
      { id: 'c5', type: 'renewals', size: 'half', scope: 'all', days: 90 },
    ],
  },
];
