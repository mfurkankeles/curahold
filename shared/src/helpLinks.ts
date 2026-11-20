// Which help page explains each place in the product, and which assistant
// evaluation cases ask about it (tests/assistant-eval/cases.ts).
//
// Every entry of the main menu (web/src/components/Shell.tsx), every screen
// (web/src/App.tsx), every settings section (web/src/lib/settingsIndex.ts) and
// every area of the public API (the first part of the address of a route the
// developer reference describes) needs one, or a line in NOT_FOR_HELP saying
// why it has none. tests/docs-coverage.test.ts fails otherwise, and checks
// that the page exists in every language the help centre is written in, that
// the anchor is on it, and that at least one of the cases cites that page.
//
// The settings area reads SETTINGS_HELP for its "How this works" link, so the
// page here is the page people land on.

export interface HelpLink {
  /** A page of docs/site/<lang>/ (without .md). */
  page: string;
  /** A fixed anchor on it, written `## Heading {#anchor}` so it is the same in every language. */
  anchor?: string;
  /** Ids of assistant evaluation cases that ask about it; at least one cites `page`. */
  evals: string[];
}

const h = (page: string, evals: string[], anchor?: string): HelpLink => ({ page, evals, ...(anchor ? { anchor } : {}) });

/** The main menu, by the address each entry opens (`:id` for one board, `:type` for a kind of record). */
export const NAV_HELP: Record<string, HelpLink> = {
  '/home': h('home-pages', ['howto-home-card']),
  '/my': h('tasks', ['howto-restore-task']),
  '/inbox': h('notifications', ['howto-quiet-hours', 'howto-digest']),
  '/calendar': h('tasks', ['howto-calendar']),
  '/onboarding': h('onboarding-hub', ['howto-onboarding-next'], 'start'),
  '/onboarding/plans': h('onboarding-hub', ['howto-onboarding-customer'], 'customers'),
  '/accounts': h('customers', ['howto-import-csv']),
  '/records/:type': h('customers', ['howto-import-csv']),
  '/accounts?view=renewals': h('customers', ['howto-add-renewal', 'howto-import-csv']),
  '/accounts?view=reviews': h('customers', ['howto-import-csv']),
  '/accounts?view=products': h('customers', ['howto-import-csv']),
  '/b/:id': h('tasks', ['howto-restore-task', 'howto-ask-department']),
  '/timeline': h('timeline-and-health', ['howto-health-score']),
  '/reports': h('pipeline-and-reports', ['howto-report']),
  '/dashboards': h('pipeline-and-reports', ['howto-report']),
  '/team': h('team-load', ['howto-team-weeks', 'howto-cost-to-serve']),
  '/setup-health': h('setup-health', ['howto-setup-health']),
  '/settings': h('getting-started', ['howto-first-setup', 'howto-departments']),
  '/setup': h('getting-started', ['howto-first-setup', 'howto-import-csv']),
};

/** Every screen of the app, by its address as App.tsx matches it. */
export const SCREEN_HELP: Record<string, HelpLink> = {
  // The menu's own screens (an entry with a ?view= is a view of a screen, not a screen).
  ...Object.fromEntries(Object.entries(NAV_HELP).filter(([k]) => !k.includes('?'))),
  '/': NAV_HELP['/home'],
  '/accounts/:id': h('customers', ['howto-import-csv', 'howto-link-request']),
  '/connect-ai': h('ai-assistants', ['howto-connect-ai']),
  '/dashboards/:id': h('pipeline-and-reports', ['howto-report']),
  '/dashboards/new': h('pipeline-and-reports', ['howto-report']),
  '/devices': h('security-and-privacy', ['howto-second-step']),
  '/import': h('moving-in', ['howto-move-in', 'howto-undo-import'], 'tasks'),
  '/o/:slug': h('onboarding-hub', ['howto-onboarding-next'], 'start'),
  '/onboarding/plans/:id': h('onboarding-hub', ['howto-onboarding-customer'], 'customers'),
  '/onboarding/report/:id': h('onboarding-hub', ['howto-onboarding-share'], 'report'),
  '/onboarding/templates': h('onboarding-hub', ['howto-onboarding-customer'], 'personal'),
  '/pages/:id': h('home-pages', ['howto-home-card']),
  '/pages/new': h('home-pages', ['howto-home-card']),
  '/profile': h('notifications', ['howto-quiet-hours', 'howto-digest']),
  '/reports/all': h('team-load', ['howto-cost-to-serve'], 'cost-to-serve'),
  '/reports/dashboards': h('pipeline-and-reports', ['howto-report']),
  '/reports/new': h('pipeline-and-reports', ['howto-report']),
  '/reports/r/:id': h('pipeline-and-reports', ['howto-report']),
  '/settings/:tab': NAV_HELP['/settings'],
  '/settings/:tab/:sub': NAV_HELP['/settings'],
  '/setup/:step': NAV_HELP['/setup'],
  '/setup-test': h('setup-health', ['howto-setup-health']),
  '/trash': h('trash', ['howto-trash']),
  '/welcome': h('getting-started', ['howto-first-setup']),
};

/** Every settings section (SettingsTab in web/src/lib/settingsIndex.ts). */
export const SETTINGS_HELP: Record<string, HelpLink> = {
  company: h('getting-started', ['howto-first-setup']),
  billing: h('billing', ['howto-trial']),
  currencies: h('pipeline-and-reports', ['howto-currencies'], 'currencies'),
  fields: h('roles-and-access', ['howto-field-access']),
  records: h('customers', ['howto-import-csv']),
  health: h('timeline-and-health', ['howto-health-score']),
  rhythm: h('pipeline-and-reports', ['howto-report']),
  playbooks: h('customers', ['howto-import-csv']),
  people: h('roles-and-access', ['howto-field-access']),
  joining: h('getting-started', ['howto-first-setup']),
  departments: h('departments', ['howto-departments', 'howto-ask-department'], 'set-up'),
  teams: h('roles-and-access', ['howto-field-access']),
  roles: h('roles-and-access', ['howto-field-access']),
  connections: h('connections', ['howto-slack']),
  sources: h('connections', ['howto-slack', 'howto-accounting', 'howto-incoming-webhook']),
  automations: h('automations', ['howto-automation', 'howto-handover'], 'new-rule'),
  developer: h('api-keys', ['howto-api-key', 'howto-webhook']),
  analytics: h('bi-tools', ['howto-bi'], 'key'),
  portal: h('customer-portal', ['howto-portal']),
  signin: h('security-and-privacy', ['howto-second-step']),
  sso: h('security-and-privacy', ['howto-second-step'], 'sso'),
  support: h('getting-help', ['howto-support-access', 'howto-ai-answers']),
  audit: h('security-and-privacy', ['howto-second-step']),
  errors: h('getting-help', ['howto-support-access'], 'errors'),
};

/**
 * The public API, by the first part of an address (`/accounts/:id` → `accounts`). The API reference
 * (docs-reference.test.ts) describes each address; this is the page a person reads about the same thing.
 */
export const API_HELP: Record<string, HelpLink> = {
  'account-fields': h('customers', ['howto-import-csv']),
  accounts: h('customers', ['howto-import-csv', 'howto-accounting']),
  activities: h('timeline-and-health', ['howto-health-score']),
  analytics: h('bi-tools', ['howto-bi'], 'key'),
  assist: h('handover-and-requests', ['howto-handover']),
  automations: h('automations', ['howto-automation'], 'new-rule'),
  boards: h('tasks', ['howto-restore-task']),
  calendar: h('tasks', ['howto-calendar']),
  calendars: h('tasks', ['howto-calendar']),
  checklists: h('tasks', ['howto-restore-task']),
  comments: h('tasks', ['howto-restore-task']),
  departments: h('departments', ['howto-departments', 'howto-ask-department']),
  dev: h('api-keys', ['howto-api-key']),
  'dev-hooks': h('webhooks', ['howto-webhook']),
  'dev-links': h('webhooks', ['howto-webhook']),
  exports: h('customers', ['abuse-export']),
  files: h('tasks', ['howto-restore-task']),
  flow: h('handover-and-requests', ['howto-handover'], 'settings'),
  handovers: h('handover-and-requests', ['howto-handover'], 'handover'),
  health: h('timeline-and-health', ['howto-health-score']),
  imports: h('customers', ['howto-import-csv']),
  inbound: h('webhooks', ['howto-webhook', 'howto-incoming-webhook']),
  'inbound-hooks': h('incoming-webhooks', ['howto-incoming-webhook']),
  me: h('notifications', ['howto-quiet-hours']),
  'meeting-types': h('timeline-and-health', ['howto-health-score']),
  notifications: h('notifications', ['howto-quiet-hours']),
  onboarding: h('onboarding-hub', ['howto-onboarding-next']),
  'onboarding-fields': h('onboarding-hub', ['howto-onboarding-next']),
  'onboarding-goals': h('onboarding-hub', ['howto-onboarding-next']),
  'onboarding-issues': h('onboarding-hub', ['howto-onboarding-failed-test']),
  'onboarding-metrics': h('onboarding-hub', ['howto-onboarding-next']),
  'onboarding-people': h('onboarding-hub', ['howto-onboarding-next']),
  'onboarding-plans': h('onboarding-hub', ['howto-onboarding-customer']),
  'onboarding-sites': h('onboarding-hub', ['howto-onboarding-next']),
  'onboarding-steps': h('onboarding-hub', ['howto-onboarding-next']),
  'onboarding-templates': h('onboarding-hub', ['howto-onboarding-customer']),
  pages: h('home-pages', ['howto-home-card']),
  people: h('roles-and-access', ['howto-field-access']),
  planned: h('timeline-and-health', ['howto-health-score']),
  plans: h('customers', ['howto-import-csv']),
  promises: h('handover-and-requests', ['howto-handover']),
  pulse: h('tasks', ['howto-restore-task']),
  'record-comments': h('customers', ['howto-import-csv']),
  'record-types': h('customers', ['howto-import-csv']),
  records: h('customers', ['howto-import-csv']),
  renewals: h('customers', ['howto-add-renewal', 'howto-import-csv']),
  reports: h('pipeline-and-reports', ['howto-report', 'howto-team-weeks']),
  'request-links': h('handover-and-requests', ['howto-link-request'], 'requests'),
  rhythm: h('pipeline-and-reports', ['howto-report']),
  rollups: h('customers', ['howto-import-csv']),
  search: h('tasks', ['howto-restore-task']),
  'setup-health': h('setup-health', ['howto-setup-health']),
  'setup-test': h('setup-health', ['howto-setup-health']),
  share: h('onboarding-hub', ['howto-onboarding-share']),
  sprints: h('tasks', ['howto-restore-task']),
  stories: h('handover-and-requests', ['howto-link-request'], 'requests'),
  'task-imports': h('moving-in', ['howto-move-in', 'howto-undo-import'], 'tasks'),
  tasks: h('tasks', ['howto-restore-task']),
  tickets: h('customers', ['howto-import-csv']),
  time: h('team-load', ['howto-cost-to-serve']),
  trash: h('trash', ['howto-trash']),
  undo: h('tasks', ['howto-restore-task']),
  views: h('tasks', ['howto-restore-task']),
};

/**
 * The legal pages the product (sign-up, the AI notice), the portal, the docs footer and the sales site link to by
 * name, with the reader's language in the address. Unlike the developer pages they exist in every help language
 * (drafts translated from the English master, which prevails), so such a link never lands on an English page.
 * tests/docs-coverage.test.ts checks each one in every language; the contract texts themselves are guarded in
 * tests/compliance.test.ts.
 */
export const LEGAL_PAGES = [
  'legal-terms',
  'legal-privacy',
  'legal-kvkk',
  'legal-dpa',
  'legal-sla',
  'legal-aup',
  'legal-order-form',
  'legal-cookies',
  'legal-subprocessors',
  'legal-accessibility',
] as const;

/**
 * Places with no help page on purpose, each with its reason. Menu entries are `nav:<address>`, screens
 * `screen:<address>`. Internal API areas are listed with their reasons in scripts/docs/catalogue.ts (INTERNAL).
 */
export const NOT_FOR_HELP: Record<string, string> = {
  'nav:/metrics': 'Operator only: the platform owner’s metrics, never shown to a company.',
  'nav:/platform': 'Operator only: the platform owner’s console.',
  'nav:/platform/pages': 'Operator only: the platform owner’s list of pages.',
  'screen:/metrics': 'Operator only (see nav:/metrics).',
  'screen:/platform': 'Operator only (see nav:/platform).',
  'screen:/platform/pages': 'Operator only (see nav:/platform/pages).',
  'screen:/login': 'Signing in: the sign-in page explains itself; getting-started covers it for people who ask.',
  'screen:/auth/verify': 'The link in the sign-in e-mail lands here and moves on at once.',
  'screen:/join': 'An invitation link lands here and moves on at once.',
};

/** The help link of a settings section, for a reader in a language the help centre has. */
export const settingsHelpPath = (lang: string, tab: string): string | null => {
  const l = SETTINGS_HELP[tab];
  return l ? `${lang}/${l.page}${l.anchor ? `/#${l.anchor}` : ''}` : null;
};
