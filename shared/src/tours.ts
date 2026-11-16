// The guided tours of the demo hub (curahold.com/demo). Each tour runs on the
// real product — the whole app, with invented data, in the visitor's browser
// (see vite.demo.config.ts) — and walks a few steps, each pointing at a real
// element on a real screen. The hub page lists them (and filters them by role,
// goal and area); the demo app plays one when it is opened with ?tour=<id>.
//
// A step points at an element with a CSS selector. Where a screen has no
// stable hook, the element carries data-tour="…" in the app. Every step of
// every tour is checked in a browser (tests/e2e/tours.ts): when a screen
// changes and a step no longer finds its element, the check says which.
//
// The words are in the nine dictionaries: demo.tour.<id>.title / .blurb, and
// demo.tour.<id>.<n>.title / .body for step n (from 1); areas, goals and roles
// under demo.tour.area / goal / role. The functions at the end read them.
import { translate, type Locale, type MessageKey } from './i18n';

/** Kept for the old two-language hub copy (site/hub.ts); the tours themselves speak every language. */
export type TourLang = 'en' | 'tr';

/** The areas of the product; the hub groups tours by these, in this order. */
export const TOUR_AREAS = ['start', 'customers', 'revenue', 'work', 'insight', 'ai', 'portal', 'connect'] as const;
export type TourArea = (typeof TOUR_AREAS)[number];

/** What someone wants to get done; a tour serves one or more. */
export const TOUR_GOALS = ['keep', 'grow', 'week', 'answer', 'see', 'setup'] as const;
export type TourGoal = (typeof TOUR_GOALS)[number];

/** Who it is for. */
export const TOUR_ROLES = ['csm', 'sales', 'lead', 'exec', 'ops'] as const;
export type TourRole = (typeof TOUR_ROLES)[number];

/** Who the visitor is during the tour (the people of the demo company, or a customer in the portal). */
export type TourPerson = 'ada' | 'mert' | 'zeynep' | 'sofia' | 'customer';

export interface TourStep {
  /** The screen for this step (an address inside the app). Left out: wherever the last step left off. */
  path?: string;
  /** The element the step points at (a CSS selector). Left out: a card in the middle of the screen. */
  at?: string;
  /** The visitor does it: the tour goes on when they click the element. */
  click?: boolean;
  /** A key the tour presses for the visitor when the step starts (N opens quick add anywhere). */
  press?: string;
}

export interface Tour {
  id: string;
  area: TourArea;
  goals: TourGoal[];
  roles: TourRole[];
  /** Signed in as (default Ada, the administrator). */
  as?: TourPerson;
  /** About how long it takes, in minutes. */
  minutes: number;
  steps: TourStep[];
}

export const TOURS: Tour[] = [
  {
    id: 'overview',
    area: 'start',
    goals: ['see', 'keep', 'week'],
    roles: ['csm', 'sales', 'lead', 'exec', 'ops'],
    minutes: 2,
    steps: [
      { path: '/home' },
      { at: 'a.tab' },
      { at: '.pane:has(.loadrow)' },
      { path: '/accounts', at: '.acard' },
      { at: '.cura__fab' },
    ],
  },
  {
    id: 'health',
    area: 'customers',
    goals: ['keep'],
    roles: ['csm', 'lead'],
    minutes: 2,
    steps: [
      { path: '/accounts', at: '.acard' },
      { at: '.acard__name', click: true },
      { at: '.acc-tile__why', click: true },
      { at: '.acc-band__why' },
      { at: '#acc-tab-timeline', click: true },
    ],
  },
  {
    id: 'health-setup',
    area: 'customers',
    goals: ['setup', 'keep'],
    roles: ['ops', 'lead'],
    minutes: 1,
    steps: [
      { path: '/settings/health', at: '.sheet + .sheet' },
      { at: '.sheet + .sheet + .sheet' },
    ],
  },
  {
    id: 'renewals',
    area: 'revenue',
    goals: ['grow', 'keep'],
    roles: ['csm', 'sales'],
    minutes: 2,
    steps: [
      { path: '/accounts?view=renewals', at: '.renewals' },
      { at: '.rchip--deal' },
      { at: '.rchip:not(.rchip--deal)' },
      { path: '/calendar', at: '.cal-kind[data-kind="renewal"]' },
    ],
  },
  {
    id: 'pipeline',
    area: 'revenue',
    goals: ['grow', 'see'],
    roles: ['sales', 'exec'],
    minutes: 2,
    steps: [
      { path: '/records/opportunity', at: '.targetline' },
      { at: '.board .column' },
      { at: '.board .card' },
      { path: '/dashboards', at: '.dashpick' },
    ],
  },
  {
    id: 'quick-add',
    area: 'work',
    goals: ['week'],
    roles: ['csm', 'sales', 'lead'],
    minutes: 1,
    steps: [
      { path: '/my', at: '.group__head' },
      { at: '.qa__input', press: 'n' },
      { at: '.qa__tip' },
    ],
  },
  {
    id: 'board',
    area: 'work',
    goals: ['week'],
    roles: ['lead', 'csm'],
    minutes: 2,
    steps: [
      { path: '/home', at: '.navlink--board', click: true },
      { at: '.board .column' },
      { at: '.toolbar' },
      { at: '.board .card', click: true },
      { at: '.panel' },
    ],
  },
  {
    id: 'playbook',
    area: 'customers',
    goals: ['keep', 'setup'],
    roles: ['csm', 'ops'],
    minutes: 1,
    steps: [
      { path: '/accounts', at: '.acard__name', click: true },
      { at: '[data-tour="apply-playbook"]', click: true },
      { at: '.planpop' },
      { path: '/settings/playbooks', at: '.sheet' },
    ],
  },
  {
    id: 'reviews',
    area: 'customers',
    goals: ['keep', 'week'],
    roles: ['csm', 'lead'],
    minutes: 1,
    steps: [
      { path: '/accounts?view=reviews', at: '.renewals' },
      { path: '/calendar', at: '.cal-kind[data-kind="meeting"]' },
      { at: '.cal-who' },
    ],
  },
  {
    id: 'reports',
    area: 'insight',
    goals: ['see'],
    roles: ['lead', 'exec'],
    minutes: 2,
    steps: [
      { path: '/reports', at: '.sheet' },
      { path: '/reports/new', at: '.rb__rail' },
      { at: '.rb__chart' },
      { path: '/team', at: '.owner' },
    ],
  },
  {
    id: 'curaai',
    area: 'ai',
    goals: ['answer', 'see'],
    roles: ['csm', 'sales', 'lead', 'exec', 'ops'],
    minutes: 1,
    steps: [
      { at: '.cura__fab', click: true },
      { at: '.cura .ask__chip' },
      { at: '.cura input.input' },
      { at: '.cura__write' },
    ],
  },
  {
    id: 'portal',
    area: 'portal',
    goals: ['answer'],
    roles: ['csm', 'ops'],
    as: 'customer',
    minutes: 2,
    steps: [
      { path: '/', at: '.p-top' },
      { at: '.p-list' },
      { at: '.p-head a' },
    ],
  },
  {
    id: 'crm',
    area: 'connect',
    goals: ['setup'],
    roles: ['ops'],
    minutes: 2,
    steps: [
      { path: '/settings/sources', at: '.tiles' },
      { at: '[data-tour="crm-demo"]' },
      { at: '[data-tour="crm-demo"] button', click: true },
    ],
  },
  {
    id: 'roles',
    area: 'connect',
    goals: ['setup'],
    roles: ['ops', 'lead'],
    minutes: 1,
    steps: [
      { path: '/settings/roles', at: '.matrix' },
      { at: '.matrix__count' },
    ],
  },
];

export const tourById = (id: string | null | undefined): Tour | undefined => TOURS.find((t) => t.id === id);

/** A tour's words in a language. */
export function tourText(l: Locale) {
  const say = (key: string) => translate(l, key as MessageKey);
  return {
    title: (t: Tour) => say(`demo.tour.${t.id}.title`),
    blurb: (t: Tour) => say(`demo.tour.${t.id}.blurb`),
    stepTitle: (t: Tour, i: number) => say(`demo.tour.${t.id}.${i + 1}.title`),
    stepBody: (t: Tour, i: number) => say(`demo.tour.${t.id}.${i + 1}.body`),
    area: (a: TourArea) => say(`demo.tour.area.${a}`),
    areaBlurb: (a: TourArea) => say(`demo.tour.area.${a}.blurb`),
    goal: (g: TourGoal) => say(`demo.tour.goal.${g}`),
    role: (r: TourRole) => say(`demo.tour.role.${r}`),
  };
}

/** Where a visitor starts a workspace of their own. */
export const SIGNUP_URL = 'https://app.curahold.com/signup';
