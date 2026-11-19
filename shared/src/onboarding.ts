// Onboarding plans — one mutual plan, used two ways:
//
//   'self'   — a company getting started with Curahold itself. Its hub lives at
//              <company>.<domain>/onboarding (dev: /o/<company>), and its steps
//              complete themselves from what the company does in the product.
//   'client' — the company onboarding one of ITS customers: made from a
//              template (usually by the hand-over of a won deal), seen by the
//              customer in the company's portal, handed to Customer Success with
//              a health baseline when it is done.
//
// This file is what the server, the app and the portal share: the words of a
// plan (phases, roles, statuses), the product signals that complete steps, the
// built-in templates, and the arithmetic of progress (completion, what was
// expected by today, the next step, the issue counters, stall flags). Pure
// functions only: tests/onboarding-hub.test.ts runs them without a database.

export const PLAN_KINDS = ['self', 'client'] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];

export const PLAN_STATUSES = ['draft', 'active', 'paused', 'done', 'cancelled'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

/** The phases a plan moves through, in order. A template uses the ones it needs. */
export const PHASES = ['kickoff', 'setup', 'data', 'test', 'golive', 'adopt'] as const;
export type Phase = (typeof PHASES)[number];

export const SIDES = ['vendor', 'customer'] as const;
export type Side = (typeof SIDES)[number];
export type StepSide = Side | 'both';

export const ROLES = ['sponsor', 'lead', 'integration', 'tester', 'user', 'other'] as const;
export type PersonRole = (typeof ROLES)[number];

export const STEP_STATUSES = ['todo', 'doing', 'done', 'blocked', 'skipped'] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export const GOAL_PRIORITIES = ['must', 'should', 'nice'] as const;
export const GOAL_STATUSES = ['planned', 'doing', 'done', 'dropped'] as const;
export const ISSUE_TYPES = ['question', 'bug', 'data', 'access', 'request'] as const;
export const URGENCIES = ['low', 'normal', 'high', 'urgent'] as const;
export const ISSUE_STATUSES = ['open', 'waiting', 'resolved'] as const;
export const ISSUE_SOURCES = ['manual', 'portal', 'setup_test', 'setup_check'] as const;
export type IssueSource = (typeof ISSUE_SOURCES)[number];
export const FIELD_SOURCES = ['import', 'sync', 'form', 'custom'] as const;
export const FIELD_TYPES = ['text', 'number', 'money', 'date', 'choice', 'email', 'url', 'person', 'other'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
export const SITE_STATUSES = ['todo', 'doing', 'done', 'na'] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];

/** The hub's views: everything (project lead), the summary (sponsor), the technical list (integration owner). */
export const VIEWS = ['lead', 'sponsor', 'tech'] as const;
export type HubView = (typeof VIEWS)[number];
export type HubSection = 'next' | 'people' | 'goals' | 'steps' | 'timeline' | 'mapping' | 'sites' | 'issues' | 'metrics';
export const VIEW_SECTIONS: Record<HubView, HubSection[]> = {
  lead: ['next', 'goals', 'steps', 'timeline', 'issues', 'mapping', 'sites', 'people', 'metrics'],
  sponsor: ['goals', 'timeline', 'issues', 'metrics', 'people'],
  tech: ['next', 'steps', 'mapping', 'issues', 'sites'],
};
/** The view a person starts in, from their role on the plan. */
export const viewForRole = (role: PersonRole | null | undefined): HubView => (role === 'sponsor' ? 'sponsor' : role === 'integration' || role === 'tester' ? 'tech' : 'lead');

/** A step with no movement for this many days is stalled; its owner is reminded (in the app). */
export const STALL_DAYS = 7;
/** An open issue older than this, or past its due day, is stuck. */
export const STUCK_DAYS = 5;

// ------------------------------------------------------------------ signals

/**
 * A product event that completes a step by itself. `scope` says what it is read
 * about: the company (its own plan) or the customer of a client plan. `fix` is
 * the screen that does it (one click); `guide` the help page (with its anchor).
 * Steps without a signal are ticked by a person (a kick-off meeting, a go-live day).
 */
export interface SignalDef {
  scope: 'company' | 'customer' | 'plan';
  fix: string;
  guide: string;
}

export const SIGNALS = {
  // --- the company itself (its own plan)
  'team.invited': { scope: 'company', fix: '/settings/people', guide: 'onboarding-hub#team' },
  'departments.set': { scope: 'company', fix: '/settings/departments', guide: 'onboarding-hub#team' },
  'import.ok': { scope: 'company', fix: '/import', guide: 'moving-in' },
  'customers.first': { scope: 'company', fix: '/accounts', guide: 'customers' },
  'sync.authorised': { scope: 'company', fix: '/settings/sources', guide: 'connections' },
  'sync.ok': { scope: 'company', fix: '/settings/sources', guide: 'connections' },
  'ticket.first': { scope: 'company', fix: '/settings/developer', guide: 'support-tickets' },
  'portal.branded': { scope: 'company', fix: '/settings/portal', guide: 'customer-portal' },
  'automation.first': { scope: 'company', fix: '/settings/automations', guide: 'ref-automation' },
  // Read from the setup checks (the "setup health" and "test your setup" screens).
  'setup.health': { scope: 'company', fix: '/setup-health', guide: 'onboarding-hub#health' },
  'setup.test': { scope: 'company', fix: '/setup-test', guide: 'onboarding-hub#health' },
  // --- one customer (a client plan)
  'client.handover': { scope: 'customer', fix: '/accounts/{account}', guide: 'handover-and-requests' },
  'client.owner': { scope: 'customer', fix: '/accounts/{account}', guide: 'handover-and-requests' },
  'client.portalInvited': { scope: 'customer', fix: '/accounts/{account}?tab=portal', guide: 'customer-portal' },
  'client.portalActive': { scope: 'customer', fix: '/accounts/{account}?tab=portal', guide: 'customer-portal' },
  'client.firstRequest': { scope: 'customer', fix: '/accounts/{account}', guide: 'customer-portal' },
  'client.ticket': { scope: 'customer', fix: '/records/ticket', guide: 'support-tickets' },
  'client.meeting': { scope: 'customer', fix: '/accounts/{account}', guide: 'customers' },
  // --- the plan itself
  'plan.people': { scope: 'plan', fix: '#people', guide: 'onboarding-hub#people' },
  'plan.mapping': { scope: 'plan', fix: '#mapping', guide: 'onboarding-hub#mapping' },
  'plan.goals': { scope: 'plan', fix: '#goals', guide: 'onboarding-hub#people' },
} as const satisfies Record<string, SignalDef>;
export type SignalId = keyof typeof SIGNALS;
export const SIGNAL_IDS = Object.keys(SIGNALS) as SignalId[];
export const isSignal = (s: unknown): s is SignalId => typeof s === 'string' && s in SIGNALS;

/** The facts a plan's signals are read from (one cheap query each side, no model, no cost). */
export type SignalFacts = Partial<Record<SignalId, boolean>>;

// ------------------------------------------------------------------ blueprints (templates)

export interface BlueprintStep {
  key: string;
  phase: Phase;
  /** Built-in wording: ob.step.<titleKey>.title / .body. Or written words (a company's own template). */
  titleKey?: string;
  title?: string;
  body?: string;
  side: StepSide;
  signal?: SignalId;
  /** Calendar days it takes, and the hands-on hours inside them. */
  days?: number;
  hours?: number;
  /** Keys of steps that must be done first. */
  after?: string[];
  /** Customer fields the step asks for (a short form; the answers are written to the customer). */
  form?: string[];
  /** The step takes a file (a signed form, an export); it is kept with the step. */
  upload?: true;
  /** Nice to have: counts half towards the completion. */
  optional?: true;
  /** Overrides of the signal's own "do it" link and guide. */
  fix?: string;
  guide?: string;
}
export interface BlueprintGoal {
  titleKey?: string;
  title?: string;
  priority: (typeof GOAL_PRIORITIES)[number];
  /** Due so many days after the start. */
  days?: number;
}
export interface BlueprintMetric {
  titleKey?: string;
  title?: string;
  unit: string;
  better: 'up' | 'down';
}
export interface BlueprintField {
  /** Written words, or a built-in row's key (said as ob.fieldRow.<name>). */
  name: string;
  type: (typeof FIELD_TYPES)[number];
  required: boolean;
  example?: string;
}
export interface Blueprint {
  steps: BlueprintStep[];
  goals: BlueprintGoal[];
  metrics: BlueprintMetric[];
  fields: BlueprintField[];
  /** Site names to start with (a rollout over several places); `ob.site.*` keys are said in the plan's language. */
  sites?: string[];
  /** Target: so many days after the start. */
  days?: number;
}

export interface BuiltInTemplate {
  key: string;
  kind: PlanKind;
  blueprint: Blueprint;
}

const s = (key: string, phase: Phase, side: StepSide, days: number, hours: number, extra: Partial<BlueprintStep> = {}): BlueprintStep => ({
  key,
  phase,
  side,
  titleKey: key,
  days,
  hours,
  ...extra,
});

/** Getting a company started with Curahold: what the product can see, it ticks by itself. */
const SELF: Blueprint = {
  days: 30,
  steps: [
    s('kickoff', 'kickoff', 'both', 2, 1),
    s('team', 'setup', 'customer', 3, 1, { signal: 'team.invited', after: ['kickoff'] }),
    s('departments', 'setup', 'customer', 2, 1, { signal: 'departments.set', after: ['team'] }),
    s('import', 'data', 'customer', 5, 3, { signal: 'import.ok', after: ['departments'] }),
    s('sync', 'data', 'customer', 3, 1, { signal: 'sync.authorised', after: ['departments'], optional: true }),
    s('syncRun', 'data', 'vendor', 1, 0.5, { signal: 'sync.ok', after: ['sync'], optional: true }),
    s('portal', 'setup', 'customer', 2, 1, { signal: 'portal.branded', after: ['team'], optional: true }),
    s('ticket', 'test', 'customer', 2, 0.5, { signal: 'ticket.first', after: ['portal'] }),
    s('health', 'test', 'both', 2, 1, { signal: 'setup.health', after: ['import'] }),
    s('test', 'test', 'customer', 2, 2, { signal: 'setup.test', after: ['health'] }),
    s('golive', 'golive', 'both', 1, 1, { after: ['test'] }),
    s('review', 'adopt', 'both', 14, 1, { after: ['golive'] }),
  ],
  goals: [
    { titleKey: 'self.team', priority: 'must', days: 7 },
    { titleKey: 'self.data', priority: 'must', days: 14 },
    { titleKey: 'self.loop', priority: 'should', days: 30 },
  ],
  metrics: [
    { titleKey: 'manual', unit: 'h', better: 'down' },
    { titleKey: 'adoption', unit: '%', better: 'up' },
  ],
  fields: [],
};

/** A customer of the company: the usual path from a signed deal to a customer who works on their own. */
const CLIENT: Blueprint = {
  days: 45,
  steps: [
    s('handover', 'kickoff', 'vendor', 1, 0.5, { signal: 'client.handover' }),
    s('owner', 'kickoff', 'vendor', 1, 0.2, { signal: 'client.owner' }),
    s('stakeholders', 'kickoff', 'both', 3, 1, { signal: 'plan.people', after: ['owner'] }),
    s('kickoff', 'kickoff', 'both', 3, 1.5, { after: ['stakeholders'] }),
    s('goals', 'kickoff', 'both', 2, 1, { signal: 'plan.goals', after: ['kickoff'] }),
    s('portalInvite', 'setup', 'vendor', 2, 0.5, { signal: 'client.portalInvited', after: ['kickoff'] }),
    s('portalActive', 'setup', 'customer', 3, 0.2, { signal: 'client.portalActive', after: ['portalInvite'] }),
    s('details', 'data', 'customer', 3, 0.5, { after: ['portalActive'], form: ['website', 'renewal_date'], upload: true }),
    s('mapping', 'data', 'both', 5, 3, { signal: 'plan.mapping', after: ['kickoff'] }),
    s('firstRequest', 'test', 'customer', 3, 0.2, { signal: 'client.firstRequest', after: ['portalActive'], optional: true }),
    s('training', 'golive', 'both', 2, 2, { after: ['mapping'] }),
    s('golive', 'golive', 'both', 1, 1, { after: ['training', 'firstRequest'] }),
    s('checkin', 'adopt', 'vendor', 14, 1, { signal: 'client.meeting', after: ['golive'] }),
  ],
  goals: [
    { titleKey: 'client.live', priority: 'must', days: 30 },
    { titleKey: 'client.adopt', priority: 'must', days: 45 },
    { titleKey: 'client.value', priority: 'should', days: 60 },
  ],
  metrics: [
    { titleKey: 'response', unit: 'h', better: 'down' },
    { titleKey: 'manual', unit: 'h', better: 'down' },
    { titleKey: 'adoption', unit: '%', better: 'up' },
  ],
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'email', type: 'email', required: true },
    { name: 'value', type: 'money', required: false },
    { name: 'start', type: 'date', required: false },
  ],
};

/** The same path, rolled out place by place: one row per site with its stage. */
const MULTISITE: Blueprint = {
  ...CLIENT,
  days: 75,
  sites: ['ob.site.first', 'ob.site.second', 'ob.site.third'],
  steps: [
    ...CLIENT.steps.filter((x) => x.key !== 'golive' && x.key !== 'checkin'),
    s('pilot', 'golive', 'both', 10, 4, { after: ['training'] }),
    s('rollout', 'golive', 'both', 20, 8, { after: ['pilot', 'firstRequest'] }),
    s('checkin', 'adopt', 'vendor', 14, 1, { signal: 'client.meeting', after: ['rollout'] }),
  ],
};

export const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
  { key: 'self', kind: 'self', blueprint: SELF },
  { key: 'standard', kind: 'client', blueprint: CLIENT },
  { key: 'multisite', kind: 'client', blueprint: MULTISITE },
];
export const builtInTemplate = (key: string) => BUILT_IN_TEMPLATES.find((t) => t.key === key) ?? null;

// ------------------------------------------------------------------ the plan, as the API returns it

export interface PlanPerson {
  id: string;
  side: Side;
  userId: string | null;
  portalUserId: string | null;
  name: string;
  role: PersonRole;
  duty: string;
  contact: string;
}
export interface PlanStep {
  id: string;
  key: string;
  titleKey: string | null;
  title: string | null;
  body: string;
  phase: Phase;
  position: number;
  side: StepSide;
  ownerId: string | null;
  ownerName: string | null;
  personId: string | null;
  signal: SignalId | null;
  status: StepStatus;
  effortDays: number | null;
  handsOnHours: number | null;
  startOn: string | null;
  dueOn: string | null;
  doneAt: string | null;
  doneBy: string | null;
  doneHow: 'auto' | 'manual' | 'portal' | null;
  dependsOn: string[];
  delayReason: string;
  fix: string | null;
  guide: string | null;
  form: string[];
  upload: boolean;
  /** Required steps count fully towards the completion, optional ones half; skipped ones not at all. */
  required: boolean;
  files: { id: string; name: string; size: number }[];
  taskId: string | null;
  /** The linked product work, as far as this person may know it (title and where it stands). */
  work: { title: string; status: string | null; done: boolean } | null;
  siteId: string | null;
  updatedAt: string;
}
export interface PlanGoal {
  id: string;
  titleKey: string | null;
  title: string | null;
  priority: (typeof GOAL_PRIORITIES)[number];
  status: (typeof GOAL_STATUSES)[number];
  targetOn: string | null;
  doneOn: string | null;
  proofUrl: string | null;
}
export interface PlanIssue {
  id: string;
  stepId: string | null;
  title: string;
  body: string;
  side: Side;
  type: (typeof ISSUE_TYPES)[number];
  urgency: (typeof URGENCIES)[number];
  status: (typeof ISSUE_STATUSES)[number];
  openedOn: string;
  dueOn: string | null;
  resolvedAt: string | null;
  recordId: string | null;
  /** The linked ticket's own status (the ticket wins). */
  ticketStatus: string | null;
  fromPortal: boolean;
  /** Where it came from: a person, the portal, a failed setup test or setup check (`sourceRef` is its id). */
  source: IssueSource;
  sourceRef: string | null;
}
export interface PlanField {
  id: string;
  source: (typeof FIELD_SOURCES)[number];
  name: string;
  target: string;
  example: string;
  type: (typeof FIELD_TYPES)[number];
  required: boolean;
  /** The value Curahold last received for it (from the import, the sync or the form), and when. */
  received: string | null;
  receivedAt: string | null;
  /** The first day the rules failed, and the day they passed again (a fixed row leaves the open list at once). */
  failingSince: string | null;
  fixedAt: string | null;
  proofUrl: string | null;
  autoOk: boolean | null;
  checkedAt: string | null;
  checkedBy: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
}
export interface PlanSite {
  id: string;
  name: string;
  region: string;
  stages: Partial<Record<Phase, SiteStatus>>;
}
export interface PlanMetric {
  id: string;
  titleKey: string | null;
  title: string | null;
  unit: string;
  baseline: number | null;
  current: number | null;
  target: number | null;
  better: 'up' | 'down';
}

export interface PlanSummary {
  id: string;
  kind: PlanKind;
  name: string;
  status: PlanStatus;
  accountId: string | null;
  accountName: string | null;
  department: 'onboarding' | 'success' | null;
  ownerId: string | null;
  ownerName: string | null;
  startedOn: string;
  targetOn: string | null;
  doneAt: string | null;
  progress: Progress;
}

export interface Plan extends PlanSummary {
  templateId: string | null;
  handoverId: string | null;
  welcome: string;
  note: string;
  baseline: { health?: number | null; at?: string; metrics?: Record<string, number | null> };
  shared: boolean;
  portalVisible: boolean;
  people: PlanPerson[];
  steps: PlanStep[];
  goals: PlanGoal[];
  issues: PlanIssue[];
  fields: PlanField[];
  sites: PlanSite[];
  metrics: PlanMetric[];
  /** Customer field values the steps' forms ask for. */
  fieldValues: Record<string, unknown>;
  /** The customer fields the forms name, with their labels and types (the form draws from them). */
  formFields: { key: string; label: string; type: string }[];
  /** Proposal: reminders also by e-mail (off by default; in the app always). */
  emailNudges: boolean;
  /** The setup checks' and tests' state (the company's own plan only). */
  setup: SetupState;
  health: HealthSignal[];
  /** The customer's portal address for this plan (a client plan with the portal on). */
  portalUrl: string | null;
  canEdit: boolean;
}

export interface Template {
  id: string;
  kind: PlanKind;
  name: string;
  summary: string;
  builtIn: string | null;
  blueprint: Blueprint;
  updatedAt: string;
  /** How many plans were made from it, and how many finished. */
  used: number;
  finished: number;
}

// ------------------------------------------------------------------ progress

export interface Progress {
  /** Weighted completion (0–100): required steps count fully, optional ones half, skipped ones not at all. */
  pct: number;
  /** What should be done by today from the steps' due days, weighted the same way (0–100). */
  expected: number;
  done: number;
  total: number;
  /** done-by-itself, of the done steps. */
  auto: number;
  state: 'done' | 'on_track' | 'behind' | 'stalled';
  next: { id: string; key: string } | null;
  issues: { open: number; vendor: number; customer: number; stuck: number };
  /** Open, unlocked steps waiting on each side, and the longest wait (days). */
  waiting: { vendor: number; customer: number; vendorDays: number; customerDays: number };
  stalledSteps: number;
}

type StepLike = Pick<PlanStep, 'id' | 'key' | 'phase' | 'position' | 'status' | 'dependsOn' | 'dueOn' | 'side' | 'updatedAt'> & {
  doneHow?: PlanStep['doneHow'];
  doneAt?: string | null;
  required?: boolean;
};
type IssueLike = Pick<PlanIssue, 'status' | 'side' | 'openedOn' | 'dueOn'>;

const closed = (st: StepStatus) => st === 'done' || st === 'skipped';
export const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86400_000);
const weight = (x: Pick<StepLike, 'required'>) => (x.required === false ? 0.5 : 1);

/** Steps in the order they are worked: phase, then position. */
export function ordered<T extends Pick<PlanStep, 'phase' | 'position'>>(steps: T[]): T[] {
  return [...steps].sort((a, b) => PHASES.indexOf(a.phase) - PHASES.indexOf(b.phase) || a.position - b.position);
}

/** A step is unlocked when every step it waits for is done or left out. */
export function unlocked(step: Pick<PlanStep, 'dependsOn'>, steps: StepLike[]): boolean {
  return step.dependsOn.every((k) => {
    const dep = steps.find((x) => x.key === k);
    return !dep || closed(dep.status);
  });
}

/**
 * Whose turn a step is, and since when. A locked step names the steps it waits
 * for and whose they are; an open step is its own side's turn since the last
 * step it waited for was done (or the plan began).
 */
export interface StepTurn {
  locked: boolean;
  /** Open steps this one waits for (keys). */
  waitingOn: string[];
  /** Whose move it is: the step's own side, or the side(s) of what it waits for. */
  turn: StepSide;
  since: string;
  days: number;
}
export function turnOf(step: StepLike, steps: StepLike[], startedOn: string, today: string): StepTurn {
  const open = step.dependsOn.map((k) => steps.find((x) => x.key === k)).filter((d): d is StepLike => !!d && !closed(d.status));
  if (open.length) {
    const sides = new Set(open.flatMap((d) => (d.side === 'both' ? ['vendor', 'customer'] : [d.side])));
    const turn: StepSide = sides.size > 1 ? 'both' : ([...sides][0] as Side);
    const inner = open.map((d) => turnOf(d, steps, startedOn, today));
    const since = inner.map((x) => x.since).sort()[0] ?? startedOn;
    return { locked: true, waitingOn: open.map((d) => d.key), turn, since, days: Math.max(0, dayDiff(since, today)) };
  }
  const deps = step.dependsOn.map((k) => steps.find((x) => x.key === k)?.doneAt).filter((d): d is string => !!d).sort();
  const since = (deps[deps.length - 1] ?? startedOn).slice(0, 10);
  return { locked: false, waitingOn: [], turn: step.side, since, days: Math.max(0, dayDiff(since, today)) };
}

/** Stalled: open and STALL_DAYS past its due day, or in progress with no movement for STALL_DAYS (a day or two late is "behind", not stuck). */
export function stalled(step: StepLike, steps: StepLike[], today: string): boolean {
  if (closed(step.status) || !unlocked(step, steps)) return false;
  if (step.dueOn && dayDiff(step.dueOn, today) >= STALL_DAYS) return true;
  return step.status !== 'todo' && dayDiff(step.updatedAt, today) >= STALL_DAYS;
}

/** Stuck: an open issue past its due day, or open for STUCK_DAYS without one. */
export function stuck(issue: IssueLike, today: string): boolean {
  if (issue.status === 'resolved') return false;
  if (issue.dueOn) return issue.dueOn < today;
  return dayDiff(issue.openedOn, today) >= STUCK_DAYS;
}

/** The one thing to do next: an unlocked open step; the one already in progress first, then the plan's order. */
export function nextStep<T extends StepLike>(steps: T[]): T | null {
  const open = ordered(steps).filter((x) => !closed(x.status) && x.status !== 'blocked' && unlocked(x, steps));
  return open.find((x) => x.status === 'doing') ?? open[0] ?? null;
}

export function progressOf(steps: StepLike[], issues: IssueLike[], today: string, status: PlanStatus = 'active', startedOn = today): Progress {
  const counted = steps.filter((x) => x.status !== 'skipped');
  const all = counted.reduce((n, x) => n + weight(x), 0);
  const doneW = counted.filter((x) => x.status === 'done').reduce((n, x) => n + weight(x), 0);
  const dueW = counted.filter((x) => x.dueOn && x.dueOn <= today).reduce((n, x) => n + weight(x), 0);
  const total = steps.length;
  const done = steps.filter((x) => closed(x.status)).length;
  const pct = all ? Math.round((doneW / all) * 100) : total ? 100 : 0;
  const expected = all ? Math.round((dueW / all) * 100) : 0;
  const open = issues.filter((i) => i.status !== 'resolved');
  const stuckN = open.filter((i) => stuck(i, today)).length;
  const stalledSteps = steps.filter((x) => stalled(x, steps, today)).length;
  const waitingSteps = steps.filter((x) => !closed(x.status) && unlocked(x, steps));
  const daysOf = (side: Side) =>
    Math.max(0, ...waitingSteps.filter((x) => x.side === side || x.side === 'both').map((x) => turnOf(x, steps, startedOn, today).days));
  const next = nextStep(steps);
  const state: Progress['state'] =
    status === 'done' || (total > 0 && done === total) ? 'done' : stuckN > 0 || stalledSteps > 0 ? 'stalled' : pct + 10 < expected ? 'behind' : 'on_track';
  return {
    pct,
    expected,
    done,
    total,
    auto: steps.filter((x) => x.status === 'done' && x.doneHow === 'auto').length,
    state,
    next: next ? { id: next.id, key: next.key } : null,
    issues: { open: open.length, vendor: open.filter((i) => i.side === 'vendor').length, customer: open.filter((i) => i.side === 'customer').length, stuck: stuckN },
    waiting: {
      vendor: waitingSteps.filter((x) => x.side !== 'customer').length,
      customer: waitingSteps.filter((x) => x.side !== 'vendor').length,
      vendorDays: daysOf('vendor'),
      customerDays: daysOf('customer'),
    },
    stalledSteps,
  };
}

/** The compact timeline: each phase the plan uses, with its first start, last due day and completion. */
export function milestones(steps: Pick<PlanStep, 'phase' | 'status' | 'startOn' | 'dueOn'>[]) {
  return PHASES.flatMap((phase) => {
    const list = steps.filter((x) => x.phase === phase);
    if (!list.length) return [];
    const starts = list.map((x) => x.startOn).filter((d): d is string => !!d).sort();
    const dues = list.map((x) => x.dueOn).filter((d): d is string => !!d).sort();
    const done = list.filter((x) => closed(x.status)).length;
    return [{ phase, start: starts[0] ?? null, end: dues[dues.length - 1] ?? null, done, total: list.length, pct: Math.round((done / list.length) * 100) }];
  });
}

/** Dates for a new plan's steps: each starts when the steps it waits for are due, and takes its days. */
export function scheduleSteps(steps: BlueprintStep[], startOn: string): Map<string, { start: string; due: string }> {
  const add = (iso: string, n: number) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const out = new Map<string, { start: string; due: string }>();
  const visit = (key: string, seen: Set<string>): { start: string; due: string } => {
    const have = out.get(key);
    if (have) return have;
    const step = steps.find((x) => x.key === key)!;
    if (seen.has(key)) return { start: startOn, due: add(startOn, step.days ?? 1) }; // a loop: start now rather than never
    seen.add(key);
    const after = (step.after ?? []).filter((k) => steps.some((x) => x.key === k)).map((k) => visit(k, seen).due);
    const start = after.sort().pop() ?? startOn;
    const v = { start, due: add(start, Math.max(1, step.days ?? 1)) };
    out.set(key, v);
    return v;
  };
  for (const st of steps) visit(st.key, new Set());
  return out;
}

/** The change of a before/after metric, signed so that positive is always better. */
export function metricGain(m: Pick<PlanMetric, 'baseline' | 'current' | 'better'>): number | null {
  if (m.baseline == null || m.current == null) return null;
  if (m.baseline === 0) return null;
  const change = ((m.current - m.baseline) / Math.abs(m.baseline)) * 100;
  return Math.round(m.better === 'up' ? change : -change);
}

/** The do-it link of a step: its own, else its signal's; `{account}` filled for a customer's plan. */
export function fixOf(step: Pick<PlanStep, 'fix' | 'signal'>, accountId: string | null): string | null {
  const raw = step.fix ?? (step.signal ? SIGNALS[step.signal].fix : null);
  if (!raw) return null;
  if (raw.includes('{account}')) return accountId ? raw.replace('{account}', accountId) : null;
  return raw;
}
export const guideOf = (step: Pick<PlanStep, 'guide' | 'signal'>): string => step.guide ?? (step.signal ? SIGNALS[step.signal].guide : 'onboarding-hub');

// ------------------------------------------------------------------ data mapping rules

/**
 * The four rules every mapped field is held to, on the value Curahold last
 * received for it: the type it should have, its format, whether it may be
 * left out, and whether it came in empty. Each failure says what was expected
 * and what arrived. A required field that fails is high; any other, normal.
 */
export const FIELD_RULES = ['type', 'format', 'required', 'empty'] as const;
export type FieldRule = (typeof FIELD_RULES)[number];
export interface RuleFailure {
  rule: FieldRule;
  /** What the rule wanted, as a key under ob.rule.expect.* (filled with `example`). */
  expected: FieldType | 'value';
  received: string;
}

const FORMAT: Partial<Record<FieldType, RegExp>> = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  url: /^https?:\/\/[^\s.]+\.[^\s]{2,}$/i,
  date: /^\d{4}-\d{2}-\d{2}([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/,
};
const NUMERIC = /^-?\d+([.,]\d+)?$/;
const MONEY = /^-?[\d.,\s]+(\s?[A-Z]{3})?$|^[A-Z]{3}\s?-?[\d.,\s]+$/;

const PLACEHOLDER = /^(-+|n\/?a|null|none|undefined|\?+|0000-00-00|tbd|yok|boş)$/i;

/** The rules a field fails on what was received; nothing received yet: nothing to judge. */
export function checkField(f: Pick<PlanField, 'type' | 'required' | 'received'>): RuleFailure[] {
  if (f.received == null) return [];
  const v = f.received.trim();
  if (!v) return f.required ? [{ rule: 'required', expected: 'value', received: '' }] : [];
  if (PLACEHOLDER.test(v)) return [{ rule: 'empty', expected: 'value', received: v.slice(0, 80) }];
  const out: RuleFailure[] = [];
  if ((f.type === 'number' && !NUMERIC.test(v)) || (f.type === 'money' && !MONEY.test(v))) out.push({ rule: 'type', expected: f.type, received: v.slice(0, 80) });
  const fmt = FORMAT[f.type];
  if (fmt && !fmt.test(v)) out.push({ rule: 'format', expected: f.type, received: v.slice(0, 80) });
  return out;
}

/** A row's state in the table: waiting for data, fine, failing (with the rules), or fixed since. */
export type FieldState = 'waiting' | 'ok' | 'failing' | 'fixed';
export function fieldState(f: Pick<PlanField, 'type' | 'required' | 'received' | 'fixedAt' | 'autoOk'>): FieldState {
  if (f.received == null && f.autoOk == null) return 'waiting';
  if (checkField(f).length || f.autoOk === false) return 'failing';
  return f.fixedAt ? 'fixed' : 'ok';
}

// ------------------------------------------------------------------ the setup checks (contract)

/**
 * What the hub needs from the setup health checks and the "test your setup"
 * list, and nothing more: their ids and states. The server reads them through
 * one adapter (api/src/lib/onboardingSetup.ts); the screens that run them are
 * their own (/setup-health, /setup-test). A failed test becomes ONE issue row
 * on the plan (source 'setup_test', sourceRef = the test's id) and is resolved
 * when the test passes again.
 */
export interface SetupTestState {
  id: string;
  status: 'todo' | 'pass' | 'fail' | 'skipped';
  /** Why it failed (a key of the setup feature), and when it last ran. */
  reason: string | null;
  at: string | null;
}
export interface SetupState {
  /** The setup feature is installed here (otherwise these steps wait for a person). */
  available: boolean;
  /** Checks failing at the last check, by id. */
  failing: string[];
  /** When the checks last ran. */
  checkedAt: string | null;
  tests: SetupTestState[];
  /** Every test passed (or was left out on purpose). */
  testsDone: boolean;
}
export const NO_SETUP: SetupState = { available: false, failing: [], checkedAt: null, tests: [], testsDone: false };
/** Where those screens and their actions are (the hub links to them; "Test it" calls the run action). */
export const SETUP_LINKS = { health: '/setup-health', tests: '/setup-test', run: (id: string) => `/setup-test/${encodeURIComponent(id)}/run` } as const;

// ------------------------------------------------------------------ health signals with their sources

/** One signal behind a plan's health, with where it comes from (a screen, a section of the plan). */
export interface HealthSignal {
  key: 'progress' | 'waiting' | 'issues' | 'tests' | 'portal' | 'tickets' | 'score';
  tone: 'good' | 'watch' | 'bad';
  /** Numbers for the sentence (ob.health.<key>.<tone>). */
  vars: Record<string, string | number>;
  /** Where to see it: an address in the app, or #section of the plan. */
  source: string;
}
export function healthSignals(p: { progress: Progress; setup?: SetupState | null; portalActive?: boolean | null; tickets?: number | null; score?: number | null; accountId?: string | null }): HealthSignal[] {
  const pr = p.progress;
  const out: HealthSignal[] = [];
  const gap = pr.expected - pr.pct;
  out.push({ key: 'progress', tone: gap <= 0 ? 'good' : gap <= 15 ? 'watch' : 'bad', vars: { pct: pr.pct, expected: pr.expected }, source: '#timeline' });
  const wait = Math.max(pr.waiting.customerDays, pr.waiting.vendorDays);
  out.push({ key: 'waiting', tone: wait < 3 ? 'good' : wait < STALL_DAYS ? 'watch' : 'bad', vars: { days: wait, side: pr.waiting.customerDays >= pr.waiting.vendorDays ? 'customer' : 'vendor' }, source: '#steps' });
  out.push({ key: 'issues', tone: pr.issues.stuck ? 'bad' : pr.issues.open ? 'watch' : 'good', vars: { open: pr.issues.open, stuck: pr.issues.stuck }, source: '#issues' });
  if (p.setup?.available) {
    const failed = p.setup.tests.filter((t) => t.status === 'fail').length;
    out.push({ key: 'tests', tone: failed ? 'bad' : p.setup.testsDone ? 'good' : 'watch', vars: { failed, passed: p.setup.tests.filter((t) => t.status === 'pass').length }, source: SETUP_LINKS.tests });
  }
  if (p.portalActive != null && p.accountId) out.push({ key: 'portal', tone: p.portalActive ? 'good' : 'watch', vars: {}, source: `/accounts/${p.accountId}?tab=portal` });
  if (p.tickets != null) out.push({ key: 'tickets', tone: p.tickets === 0 ? 'good' : p.tickets < 3 ? 'watch' : 'bad', vars: { n: p.tickets }, source: '/records/ticket' });
  if (p.score != null && p.accountId) out.push({ key: 'score', tone: p.score >= 70 ? 'good' : p.score >= 40 ? 'watch' : 'bad', vars: { score: p.score }, source: `/accounts/${p.accountId}?tab=health` });
  return out;
}

// ------------------------------------------------------------------ the progress report

/** Built from the plan alone; every figure names the section it comes from. */
export interface PlanReport {
  name: string;
  company: string;
  accountName: string | null;
  generatedAt: string;
  startedOn: string;
  targetOn: string | null;
  /** The last due day of the open steps: when it will likely be live. */
  forecastOn: string | null;
  progress: Progress;
  phases: ReturnType<typeof milestones>;
  next: { key: string; titleKey: string | null; title: string | null; side: StepSide; dueOn: string | null }[];
  goals: Pick<PlanGoal, 'titleKey' | 'title' | 'priority' | 'status' | 'targetOn'>[];
  issues: Pick<PlanIssue, 'title' | 'side' | 'urgency' | 'status' | 'openedOn' | 'dueOn'>[];
  fields: { failing: number; ok: number; waiting: number };
  tests: { passed: number; failed: number; total: number } | null;
  metrics: Pick<PlanMetric, 'titleKey' | 'title' | 'unit' | 'baseline' | 'current' | 'target' | 'better'>[];
}

/** The report of a plan: what the sponsor reads, from the plan alone (no model, no cost). */
export function reportOf(plan: Plan, company: string, now: Date): PlanReport {
  const today = now.toISOString().slice(0, 10);
  const open = ordered(plan.steps).filter((x) => x.status !== 'done' && x.status !== 'skipped');
  const ready = open.filter((x) => x.status !== 'blocked' && unlocked(x, plan.steps));
  const dues = open.map((x) => x.dueOn).filter((d): d is string => !!d).sort();
  const states = plan.fields.map((f) => fieldState(f));
  const tests = plan.setup.available && plan.setup.tests.length
    ? { passed: plan.setup.tests.filter((t) => t.status === 'pass').length, failed: plan.setup.tests.filter((t) => t.status === 'fail').length, total: plan.setup.tests.length }
    : null;
  const urgency = (u: string) => URGENCIES.indexOf(u as (typeof URGENCIES)[number]);
  return {
    name: plan.name,
    company,
    accountName: plan.accountName,
    generatedAt: now.toISOString(),
    startedOn: plan.startedOn,
    targetOn: plan.targetOn,
    forecastOn: plan.status === 'done' ? (plan.doneAt?.slice(0, 10) ?? today) : (dues[dues.length - 1] ?? plan.targetOn),
    progress: plan.progress,
    phases: milestones(plan.steps),
    next: ready.slice(0, 3).map((x) => ({ key: x.key, titleKey: x.titleKey, title: x.title, side: x.side, dueOn: x.dueOn })),
    goals: plan.goals.map((g) => ({ titleKey: g.titleKey, title: g.title, priority: g.priority, status: g.status, targetOn: g.targetOn })),
    issues: plan.issues
      .filter((i) => i.status !== 'resolved')
      .sort((a, b) => urgency(b.urgency) - urgency(a.urgency) || a.openedOn.localeCompare(b.openedOn))
      .map((i) => ({ title: i.title, side: i.side, urgency: i.urgency, status: i.status, openedOn: i.openedOn, dueOn: i.dueOn })),
    fields: { failing: states.filter((x) => x === 'failing').length, ok: states.filter((x) => x === 'ok' || x === 'fixed').length, waiting: states.filter((x) => x === 'waiting').length },
    tests,
    metrics: plan.metrics.map((m) => ({ titleKey: m.titleKey, title: m.title, unit: m.unit, baseline: m.baseline, current: m.current, target: m.target, better: m.better })),
  };
}

/** Turns a plan's or the report's link secret into what is stored (lowercase hex SHA-256 is done server side). */
export const SHARE_PATH = '/api/share/onboarding/';
