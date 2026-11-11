// Pages: a role's home and the shared report pages, built from cards.
// A page says what to show; each viewer sees it filled with what they are
// allowed to see (their customers, the fields open to their role).
import type { Localized, OptionColor } from './model';

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
export const CARD_SETTINGS: Record<CardType, { scope?: true; days?: true; metric?: true; by?: true; field?: 'date' | 'select' | 'money'; options?: true; text?: true }> = {
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
}

export interface Page {
  id: string;
  name: string;
  cards: Card[];
  /** Role keys whose home this page is. */
  homeFor: string[];
  /** Role keys that may open it; empty means everyone. */
  sharedWith: string[];
  position: number;
  updatedAt: string;
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
  | { kind: 'missing'; need: 'date' | 'select' | 'money' | 'contacts' }
  | { kind: 'list'; rows: CardRow[]; total: number; extra?: number }
  | { kind: 'number'; value: number; unit: 'count' | 'money'; sub?: { value: number; unit: 'count' | 'money' } | null }
  | { kind: 'bars'; bars: { key: string; label: string; value: number; color?: OptionColor | null }[]; unit: 'count' | 'money' }
  | {
      kind: 'people';
      rows: { userId: string; name: string; accounts: number; open: number; overdue: number; attention: number; money: number | null }[];
      unit: 'money' | null;
    }
  | { kind: 'sync'; rows: { id: string; provider: string; name: string; status: string; lastRunAt: string | null; problems: number; ok: boolean }[] }
  | { kind: 'note'; text: string };

const L = (en: string, tr: string): Localized => ({ en, tr });

/** Card names and one line each for the card library. */
export const CARD_INFO: Record<CardType, { name: Localized; help: Localized }> = {
  my_tasks: { name: L('My open tasks', 'Açık görevlerim'), help: L('Overdue first, then what is due soon.', 'Önce gecikenler, sonra yaklaşanlar.') },
  renewals: { name: L('Coming renewals', 'Yaklaşan yenilemeler'), help: L('Customers whose renewal date falls within the days you choose.', 'Yenileme tarihi seçtiğin gün içinde olan müşteriler.') },
  attention: { name: L('Needs attention', 'İlgi bekleyenler'), help: L('Customers marked at risk (or any choices you pick).', 'Riskli işaretlenen (ya da seçtiğin durumdaki) müşteriler.') },
  quiet: { name: L('Gone quiet', 'Sessiz kalanlar'), help: L('Customers with no task activity for a while.', 'Bir süredir hiç görev hareketi olmayan müşteriler.') },
  stakeholders: { name: L('Stakeholder risks', 'Paydaş riskleri'), help: L('Blockers and skeptics, and customers with no champion.', 'Engelleyici ve şüpheci kişiler, güçlü destekçisi olmayan müşteriler.') },
  metric: { name: L('A number', 'Tek sayı'), help: L('One figure: customers, annual value, at risk, renewals, open or overdue tasks.', 'Tek bir rakam: müşteri, yıllık tutar, riskli, yenileme, açık ya da geciken görev.') },
  breakdown: { name: L('Breakdown', 'Dağılım'), help: L('Customers split by a choice field, by owner or by team.', 'Müşterileri bir seçim alanına, sahibine ya da ekibine göre böler.') },
  team_load: { name: L('Team load', 'Ekip yükü'), help: L('Per person: customers, open and overdue tasks, customers at risk.', 'Kişi başına: müşteri, açık ve geciken görev, riskli müşteri.') },
  sync_health: { name: L('Connections', 'Bağlantılar'), help: L('Whether connected tools are syncing. Only people who manage connections see it.', 'Bağlı araçlar eşitleniyor mu. Yalnızca bağlantıları yönetenler görür.') },
  note: { name: L('Note', 'Not'), help: L('Your own words: a welcome, a weekly focus, useful links.', 'Kendi sözlerin: karşılama, haftanın odağı, işe yarar bağlantılar.') },
};

/** The pages every new company starts with. */
export const DEFAULT_PAGES: { name: Localized; homeFor: string[]; cards: Card[] }[] = [
  {
    name: L('My day', 'Benim günüm'),
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
    name: L('Team view', 'Ekip görünümü'),
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
    name: L('Leadership summary', 'Yönetim özeti'),
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
