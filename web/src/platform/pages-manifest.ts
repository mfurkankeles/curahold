// The founder's "see all pages" directory, as plain data: every app screen the
// product has, grouped by area, each with the i18n key for its label and the
// path it lives at. FounderPages.tsx renders this into live links so the founder
// can jump to any screen. It is deliberately a flat data file — add a screen by
// adding a row here (and its label key to the dictionaries); no code to touch.
//
// `labelKey` is a dictionary key (string here to keep the data plain; the page
// casts it to MessageKey when it calls t()). Reused nav.* / menu.* / trash.* keys
// already exist; the founder.* keys are new (reported for the dictionaries).
// `owner: true` marks a screen only the platform owner has (hidden for non-owners).

export interface PageEntry {
  /** In-app path. Query strings are allowed (e.g. a saved view). */
  path: string;
  /** Dictionary key for the human label. */
  labelKey: string;
  /** Owner-only screens (shown only when the viewer is the platform owner/staff). */
  owner?: boolean;
}

export interface PageArea {
  /** Dictionary key for the area heading. */
  labelKey: string;
  pages: PageEntry[];
}

export const PAGE_AREAS: PageArea[] = [
  {
    labelKey: 'founder.area.crm',
    pages: [
      { path: '/accounts', labelKey: 'founder.page.accounts' },
      { path: '/accounts?view=renewals', labelKey: 'nav.renewals' },
      { path: '/accounts?view=reviews', labelKey: 'nav.reviews' },
      { path: '/accounts?view=products', labelKey: 'nav.products' },
      { path: '/timeline', labelKey: 'nav.timeline' },
    ],
  },
  {
    labelKey: 'founder.area.tasks',
    pages: [
      { path: '/home', labelKey: 'nav.home' },
      { path: '/my', labelKey: 'nav.myTasks' },
      { path: '/inbox', labelKey: 'nav.inbox' },
      { path: '/calendar', labelKey: 'nav.calendar' },
    ],
  },
  {
    labelKey: 'founder.area.product',
    pages: [
      { path: '/reports', labelKey: 'nav.reports' },
      { path: '/dashboards', labelKey: 'nav.dashboards' },
      { path: '/team', labelKey: 'nav.team' },
      { path: '/metrics', labelKey: 'nav.metrics', owner: true },
    ],
  },
  {
    labelKey: 'founder.area.settings',
    pages: [
      { path: '/settings', labelKey: 'nav.settings' },
      { path: '/devices', labelKey: 'nav.devices' },
      { path: '/trash', labelKey: 'trash.title' },
      { path: '/profile', labelKey: 'menu.profile' },
      { path: '/connect-ai', labelKey: 'founder.page.connectAi' },
    ],
  },
  {
    labelKey: 'founder.area.platform',
    pages: [
      { path: '/platform', labelKey: 'founder.page.console', owner: true },
      { path: '/platform/pages', labelKey: 'founder.page.pages', owner: true },
    ],
  },
];
