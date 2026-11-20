// Starting points a company picks at sign-up. Everything a template creates
// (vocabulary, account fields, boards, automations) is ordinary settings
// afterwards — nothing here is special-cased anywhere else.
import type { AutomationPreset } from './automation';
import { LOCALES, phrase as P, phraseIn, translate, type Locale, type MessageKey, type Terms } from './i18n';
import type { AccountField, Column, Localized } from './model';

export const TEMPLATE_KEYS = ['customer_success', 'account_management', 'sales', 'support', 'marketing', 'hr', 'it', 'finance', 'legal', 'product', 'blank'] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export interface TemplateBoard {
  key: string;
  name: Localized;
  columns: { key: string; name: Localized; done: boolean }[];
}

export interface Template {
  key: TemplateKey;
  name: Localized;
  description: Localized;
  terms: Terms;
  accountFields: AccountField[];
  teams: Localized[];
  boards: TemplateBoard[];
  automations: AutomationPreset[];
}

/** A built-in text in the reader's language (a plain string is used as is). */
export const pick = (l: Localized | string | undefined, locale: Locale): string => (typeof l === 'string' ? l : phraseIn(l, locale));

/** The template's word for the people it serves, in every language (read when the company is created). */
function termsOf(word: 'customer' | 'account' | 'company' | 'audience' | 'candidate' | 'requester'): Terms {
  const one = P(`tpl.term.${word}.one` as MessageKey);
  const other = P(`tpl.term.${word}.other` as MessageKey);
  const account: NonNullable<Terms['account']> = {};
  for (const l of LOCALES) Object.defineProperty(account, l, { enumerable: true, get: () => (one[l] && other[l] ? { one: one[l], other: other[l] } : undefined) });
  return { account };
}

const COLS = {
  todo: { key: 'todo', name: P('tpl.to_do'), done: false },
  doing: { key: 'doing', name: P('pm.stage.in_progress'), done: false },
  waiting: { key: 'waiting', name: P('tpl.waiting_on_customer'), done: false },
  done: { key: 'done', name: P('pm.stage.done'), done: true },
};

const renewal: AccountField = { key: 'renewal_date', label: P('tpl.renewal_date'), type: 'date' };
const arr: AccountField = { key: 'arr', label: P('tpl.annual_value'), type: 'money' };
const health: AccountField = {
  key: 'health',
  label: P('tpl.health'),
  type: 'select',
  options: [
    { key: 'good', label: P('tpl.healthy'), color: 'leaf' },
    { key: 'watch', label: P('tpl.watch'), color: 'honey' },
    { key: 'risk', label: P('tpl.at_risk'), color: 'coral' },
  ],
};
const tier: AccountField = {
  key: 'tier',
  label: P('tpl.tier'),
  type: 'select',
  options: [
    { key: 'enterprise', label: P('tpl.enterprise') },
    { key: 'mid', label: P('tpl.mid_market') },
    { key: 'smb', label: P('tpl.small_business') },
  ],
};
const website: AccountField = { key: 'website', label: P('tpl.website'), type: 'url' };

const overdueNotify: AutomationPreset = {
  key: 'overdue_notify',
  name: P('tpl.tell_the_team_lead_about_overdue'),
  trigger: { type: 'task_overdue', days: 2 },
  action: {
    type: 'notify',
    to: ['assignees', 'team_lead'],
    message: P('tpl.this_task_is_2_days_overdue'),
  },
};

// ---------------------------------------------------------------- product / project management
//
// The stages of a product team's board. They are ordinary board columns — a
// company can rename, add or remove them — and the Product template below seeds
// a delivery board with them. Defined here (above TEMPLATES) so the template can
// reuse the one stage list rather than repeat it.

/** The stages of a product team's board, in order. Only "done" counts as finished. */
export const PM_STAGE_KEYS = ['backlog', 'ready', 'in_progress', 'code_review', 'qa', 'uat', 'done', 'blocked', 'rejected'] as const;
export type PmStageKey = (typeof PM_STAGE_KEYS)[number];

/** The stage names, straight from the pm.stage.* dictionary, so a static template board can carry them. */
const PM_STAGE_L: Record<PmStageKey, Localized> = {
  backlog: P('pm.stage.backlog'),
  ready: P('pm.stage.ready'),
  in_progress: P('pm.stage.in_progress'),
  code_review: P('pm.stage.code_review'),
  qa: P('pm.stage.qa'),
  uat: P('pm.stage.uat'),
  done: P('pm.stage.done'),
  blocked: P('pm.stage.blocked'),
  rejected: P('pm.stage.rejected'),
};

/** The PM workflow as template-board columns (localized, for TEMPLATES). */
const pmTemplateColumns = (): TemplateBoard['columns'] => PM_STAGE_KEYS.map((key) => ({ key, name: PM_STAGE_L[key], done: key === 'done' }));

/** The PM workflow as board columns, named in the given language (for creating/adding a board at runtime). Only "done" counts as finished. */
export function pmColumns(locale: Locale): Column[] {
  return PM_STAGE_KEYS.map((key) => ({ key, name: translate(locale, `pm.stage.${key}`), done: key === 'done' }));
}

export const TEMPLATES: Record<TemplateKey, Template> = {
  customer_success: {
    key: 'customer_success',
    name: P('tpl.customer_success'),
    description: P('tpl.onboarding_health_checks_and_renewals_for'),
    terms: termsOf('customer'),
    accountFields: [renewal, arr, health, tier, website],
    teams: [P('tpl.customer_success_2')],
    boards: [
      { key: 'main', name: P('tpl.customer_work'), columns: [COLS.todo, COLS.doing, COLS.waiting, COLS.done] },
      { key: 'onboarding', name: P('tpl.onboarding'), columns: [COLS.todo, COLS.doing, COLS.done] },
      { key: 'renewals', name: P('tpl.renewals'), columns: [COLS.todo, COLS.doing, COLS.done] },
    ],
    automations: [
      {
        key: 'renewal_plan',
        name: P('tpl.plan_the_renewal_90_days_ahead'),
        trigger: { type: 'account_date', field: 'renewal_date', daysBefore: 90 },
        action: {
          type: 'create_tasks',
          board: 'renewals',
          tasks: [
            {
              title: P('tpl.renewal_plan_account_name'),
              dueInDays: 7,
              assignee: 'account_owner',
              subtasks: [
                P('tpl.review_usage_and_value_delivered'),
                P('tpl.note_risks_and_open_issues'),
                P('tpl.book_a_call_with_the_decision'),
              ],
            },
          ],
        },
      },
      {
        key: 'onboarding',
        name: P('tpl.start_onboarding_for_a_new_customer'),
        trigger: { type: 'account_created' },
        action: {
          type: 'create_tasks',
          board: 'onboarding',
          tasks: [
            { title: P('tpl.welcome_call_account_name'), dueInDays: 3, assignee: 'account_owner' },
            { title: P('tpl.finish_setup_account_name'), dueInDays: 14, assignee: 'account_owner' },
            { title: P('tpl.first_value_check_account_name'), dueInDays: 30, assignee: 'account_owner' },
          ],
        },
      },
      {
        key: 'no_contact',
        name: P('tpl.reach_out_after_30_quiet_days'),
        trigger: { type: 'account_inactive', days: 30 },
        action: {
          type: 'create_tasks',
          board: 'main',
          tasks: [{ title: P('tpl.check_in_with_account_name'), dueInDays: 2, assignee: 'account_owner' }],
        },
      },
      overdueNotify,
    ],
  },
  account_management: {
    key: 'account_management',
    name: P('tpl.account_management'),
    description: P('tpl.business_reviews_growth_opportunities_and_re'),
    terms: termsOf('account'),
    accountFields: [renewal, arr, tier, health, website],
    teams: [P('tpl.account_management_2')],
    boards: [
      { key: 'main', name: P('tpl.account_work'), columns: [COLS.todo, COLS.doing, COLS.waiting, COLS.done] },
      {
        key: 'growth',
        name: P('tpl.growth'),
        columns: [
          { key: 'idea', name: P('tpl.idea'), done: false },
          { key: 'proposal', name: P('tpl.proposal'), done: false },
          { key: 'won', name: P('tpl.won'), done: true },
          { key: 'lost', name: P('tpl.lost'), done: true },
        ],
      },
      { key: 'renewals', name: P('tpl.renewals'), columns: [COLS.todo, COLS.doing, COLS.done] },
    ],
    automations: [
      {
        key: 'renewal_plan',
        name: P('tpl.plan_the_renewal_120_days_ahead'),
        trigger: { type: 'account_date', field: 'renewal_date', daysBefore: 120 },
        action: {
          type: 'create_tasks',
          board: 'renewals',
          tasks: [{ title: P('tpl.renewal_plan_account_name'), dueInDays: 7, assignee: 'account_owner' }],
        },
      },
      {
        key: 'qbr',
        name: P('tpl.business_review_every_quarter'),
        trigger: { type: 'account_every', days: 90 },
        conditions: [{ field: 'tier', op: 'eq', value: 'enterprise' }],
        action: {
          type: 'create_tasks',
          board: 'main',
          tasks: [
            {
              title: P('tpl.quarterly_review_account_name'),
              dueInDays: 14,
              assignee: 'account_owner',
              subtasks: [P('tpl.write_the_agenda'), P('tpl.pull_usage_numbers'), P('tpl.send_the_deck')],
            },
          ],
        },
      },
      overdueNotify,
    ],
  },
  sales: {
    key: 'sales',
    name: P('tpl.sales'),
    description: P('tpl.deals_from_first_call_to_signature'),
    terms: termsOf('company'),
    accountFields: [
      { key: 'industry', label: P('tpl.industry'), type: 'text' },
      { key: 'deal_value', label: P('tpl.deal_value'), type: 'money' },
      { key: 'close_date', label: P('tpl.expected_close'), type: 'date' },
      website,
    ],
    teams: [P('tpl.sales')],
    boards: [
      {
        key: 'pipeline',
        name: P('tpl.pipeline'),
        columns: [
          { key: 'new', name: P('tpl.new'), done: false },
          { key: 'meeting', name: P('tpl.meeting'), done: false },
          { key: 'proposal', name: P('tpl.proposal'), done: false },
          { key: 'won', name: P('tpl.won'), done: true },
          { key: 'lost', name: P('tpl.lost'), done: true },
        ],
      },
      { key: 'main', name: P('tpl.follow_ups'), columns: [COLS.todo, COLS.doing, COLS.done] },
    ],
    automations: [
      {
        key: 'won_handover',
        name: P('tpl.hand_over_won_deals'),
        trigger: { type: 'task_moved', boardId: 'pipeline', column: 'won' },
        action: {
          type: 'create_tasks',
          board: 'main',
          tasks: [{ title: P('tpl.hand_over_meeting_account_name'), dueInDays: 5, assignee: 'assignees' }],
        },
      },
      {
        key: 'close_date',
        name: P('tpl.check_deals_a_week_before_expected'),
        trigger: { type: 'account_date', field: 'close_date', daysBefore: 7 },
        action: {
          type: 'notify',
          to: ['account_owner'],
          message: P('tpl.expected_close_is_in_a_week'),
        },
      },
      overdueNotify,
    ],
  },
  support: {
    key: 'support',
    name: P('tpl.support_escalations'),
    description: P('tpl.escalated_customer_issues_with_clear_owners'),
    terms: termsOf('customer'),
    accountFields: [
      tier,
      {
        key: 'plan',
        label: P('tpl.support_plan'),
        type: 'select',
        options: [
          { key: 'standard', label: P('tpl.standard') },
          { key: 'premium', label: P('tpl.premium') },
        ],
      },
    ],
    teams: [P('tpl.support')],
    boards: [
      {
        key: 'main',
        name: P('tpl.escalations'),
        columns: [
          { key: 'new', name: P('tpl.new'), done: false },
          { key: 'doing', name: P('tpl.investigating'), done: false },
          COLS.waiting,
          { key: 'solved', name: P('tpl.solved'), done: true },
        ],
      },
    ],
    automations: [
      {
        key: 'overdue_notify',
        name: P('tpl.tell_the_team_lead_about_overdue_2'),
        trigger: { type: 'task_overdue', days: 1 },
        action: { type: 'notify', to: ['assignees', 'team_lead'], message: P('tpl.this_escalation_is_overdue') },
      },
    ],
  },
  marketing: {
    key: 'marketing',
    name: P('tpl.marketing_campaigns'),
    description: P('tpl.plan_produce_and_ship_campaigns_and'),
    terms: termsOf('audience'),
    accountFields: [website],
    teams: [P('tpl.marketing')],
    boards: [
      {
        key: 'campaigns',
        name: P('tpl.campaigns'),
        columns: [
          { key: 'idea', name: P('tpl.idea'), done: false },
          { key: 'planned', name: P('tpl.planned'), done: false },
          { key: 'production', name: P('tpl.in_production'), done: false },
          { key: 'live', name: P('tpl.live'), done: false },
          { key: 'wrapped', name: P('tpl.wrapped_up'), done: true },
        ],
      },
      {
        key: 'content',
        name: P('tpl.content_calendar'),
        columns: [
          { key: 'todo', name: P('tpl.to_write'), done: false },
          { key: 'writing', name: P('tpl.writing'), done: false },
          { key: 'review', name: P('tpl.in_review'), done: false },
          { key: 'published', name: P('tpl.published'), done: true },
        ],
      },
    ],
    automations: [overdueNotify],
  },
  hr: {
    key: 'hr',
    name: P('tpl.hr_recruiting'),
    description: P('tpl.run_hiring_pipelines_and_people_operations'),
    terms: termsOf('candidate'),
    accountFields: [],
    teams: [P('tpl.people')],
    boards: [
      {
        key: 'hiring',
        name: P('tpl.hiring_pipeline'),
        columns: [
          { key: 'applied', name: P('tpl.applied'), done: false },
          { key: 'screening', name: P('tpl.screening'), done: false },
          { key: 'interview', name: P('tpl.interviewing'), done: false },
          { key: 'offer', name: P('tpl.offer'), done: false },
          { key: 'hired', name: P('tpl.hired'), done: true },
          { key: 'declined', name: P('tpl.not_moving_forward'), done: true },
        ],
      },
      { key: 'people_ops', name: P('tpl.people_operations'), columns: [COLS.todo, COLS.doing, COLS.done] },
    ],
    automations: [overdueNotify],
  },
  it: {
    key: 'it',
    name: P('tpl.it_helpdesk'),
    description: P('tpl.take_in_support_requests_and_changes'),
    terms: termsOf('requester'),
    accountFields: [],
    teams: [P('tpl.it')],
    boards: [
      {
        key: 'helpdesk',
        name: P('tpl.helpdesk'),
        columns: [
          { key: 'new', name: P('tpl.new'), done: false },
          { key: 'triage', name: P('tpl.triage'), done: false },
          { key: 'doing', name: P('pm.stage.in_progress'), done: false },
          COLS.waiting,
          { key: 'resolved', name: P('tpl.resolved'), done: true },
        ],
      },
      {
        key: 'changes',
        name: P('tpl.change_requests'),
        columns: [
          { key: 'requested', name: P('tpl.requested'), done: false },
          { key: 'approved', name: P('tpl.approved'), done: false },
          { key: 'scheduled', name: P('tpl.scheduled'), done: false },
          { key: 'done', name: P('pm.stage.done'), done: true },
        ],
      },
    ],
    automations: [overdueNotify],
  },
  finance: {
    key: 'finance',
    name: P('tpl.finance_approvals'),
    description: P('tpl.route_approvals_and_run_the_recurring'),
    terms: {},
    accountFields: [],
    teams: [P('tpl.finance')],
    boards: [
      {
        key: 'approvals',
        name: P('tpl.approvals'),
        columns: [
          { key: 'requested', name: P('tpl.requested'), done: false },
          { key: 'review', name: P('tpl.under_review'), done: false },
          { key: 'approved', name: P('tpl.approved'), done: false },
          { key: 'paid', name: P('tpl.paid'), done: true },
          { key: 'rejected', name: P('pm.stage.rejected'), done: true },
        ],
      },
      {
        key: 'close',
        name: P('tpl.month_end_close'),
        columns: [COLS.todo, COLS.doing, { key: 'review', name: P('tpl.in_review'), done: false }, COLS.done],
      },
    ],
    automations: [overdueNotify],
  },
  legal: {
    key: 'legal',
    name: P('tpl.legal_contracts'),
    description: P('tpl.intake_draft_review_and_sign_contracts'),
    terms: {},
    accountFields: [],
    teams: [P('tpl.legal')],
    boards: [
      {
        key: 'contracts',
        name: P('tpl.contracts'),
        columns: [
          { key: 'intake', name: P('tpl.intake'), done: false },
          { key: 'drafting', name: P('tpl.drafting'), done: false },
          { key: 'review', name: P('tpl.in_review'), done: false },
          { key: 'negotiation', name: P('tpl.negotiation'), done: false },
          { key: 'signed', name: P('tpl.signed'), done: true },
        ],
      },
      { key: 'requests', name: P('tpl.legal_requests'), columns: [COLS.todo, COLS.doing, COLS.done] },
    ],
    automations: [overdueNotify],
  },
  product: {
    key: 'product',
    name: P('tpl.product_engineering'),
    description: P('tpl.ship_product_with_the_full_delivery'),
    terms: {},
    accountFields: [],
    teams: [P('tpl.product'), P('tpl.engineering')],
    boards: [
      { key: 'delivery', name: P('tpl.delivery'), columns: pmTemplateColumns() },
      {
        key: 'discovery',
        name: P('tpl.discovery'),
        columns: [
          { key: 'idea', name: P('tpl.idea'), done: false },
          { key: 'research', name: P('tpl.research'), done: false },
          { key: 'shaping', name: P('tpl.shaping'), done: false },
          { key: 'ready', name: P('tpl.ready_to_build'), done: true },
        ],
      },
    ],
    automations: [overdueNotify],
  },
  blank: {
    key: 'blank',
    name: P('tpl.start_empty'),
    description: P('tpl.one_board_and_no_rules_set'),
    terms: {},
    accountFields: [],
    teams: [],
    boards: [{ key: 'main', name: P('tpl.tasks'), columns: [COLS.todo, COLS.doing, COLS.done] }],
    automations: [],
  },
};

/** Whether a value names a company template (industry starting point). */
export const isTemplateKey = (k: unknown): k is TemplateKey => typeof k === 'string' && (TEMPLATE_KEYS as readonly string[]).includes(k);
