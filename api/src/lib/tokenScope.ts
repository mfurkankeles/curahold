// What an API key or an app's token may reach (security audit H1, ADR 0024).
//
// A token acts as the person it belongs to, but never with that person's whole
// power: administration, sign-in and identity settings, billing, credentials and
// anything that removes people or the company are for a signed-in person only,
// who can be asked to confirm it is them (requireFresh). A stolen key or an app
// that was allowed to write must not be able to point the company at another
// identity provider and sign in as everyone.
//
// Two rules close administration (review S1). One: the administrator-level
// permissions (shared/src/model.ts ADMIN_PERMS) are withheld from every token —
// in the route (requirePerm answers session_required) and in SQL (app_has_perm
// reads app.withheld, migration 0259) — so any route that needs one is for a
// signed-in person, whatever its path. Two: the addresses below, which need no
// such permission but change identity, credentials, money or legal acts.
//
// On top of that a token may be limited to areas, each read or write
// (`work:write`, `customers:read`): an app that files tasks need not read the
// customer list. No areas (null) means every area below, as before.

/** The areas a key or an app can be limited to. Words for each are the API reference's (docs/site/<lang>/api.md). */
import { ADMIN_PERMS, type Perm } from '../../../shared/src/model';

export const TOKEN_AREAS = ['work', 'customers', 'reports', 'people', 'webhooks'] as const;
export type TokenArea = (typeof TOKEN_AREAS)[number];
/** One grant: an area and whether it may change things there. */
export type AreaGrant = `${TokenArea}:${'read' | 'write'}`;

/**
 * Addresses no token reaches, whatever it was granted: they change who can sign in or what a person may do, hold
 * credentials, money or legal acts, or remove people and data. Matched on the path after /api.
 */
const SESSION_ONLY: RegExp[] = [
  /^\/admin(\/|$)/, // roles, people, erasure and export, company deletion, domains, audit trail, security settings
  /^\/sso(\/|$)/, // the identity provider and the SCIM token
  /^\/billing(\/|$)/,
  // API keys and analytics keys. Outgoing webhooks stay open: automation platforms subscribe and unsubscribe them
  // with a key (REST hooks); they still need connections.manage and send only what their creator may see.
  /^\/dev(?!\/webhooks(\/|$))(\/|$)/,
  /^\/dev-hooks(\/|$)/, // code-host hooks and their secrets
  /^\/inbound-hooks(\/|$)/, // incoming hooks and their secrets
  /^\/connections(\/|$)/, // chat apps and CRMs: stored credentials
  /^\/connect(\/|$)/,
  /^\/me\/(security|sessions|confirm|export)(\/|$)/, // second step, passkeys, sessions, a person's own data export
  /^\/support(\/|$)/, // letting Curahold support in
  /^\/agreements(\/|$)/, // accepting the terms is a person's act
  /^\/consent(\/|$)/, // so is accepting the AI notice
  /^\/setup(\/|$)/,
  /^\/platform(\/|$)/,
  /^\/replay(\/|$)/, // session recordings
  /^\/desk(\/|$)/,
  /^\/agent(\/|$)/,
  /^\/portal\/(settings|users)(\/|$)/, // who may sign in to the customer portal, and how
];

/**
 * The permissions a token never carries (the first rule above). The one exception: subscribing outgoing webhooks
 * needs connections.manage, and automation platforms do it with a key (REST hooks); every delivery still carries only
 * what the hook's creator may see (lib/webhooks.ts).
 */
export function withheldPerms(path: string): Perm[] {
  return /^\/dev\/webhooks(\/|$)/.test(path) ? ADMIN_PERMS.filter((p) => p !== 'connections.manage') : [...ADMIN_PERMS];
}

/** First segment after /api → its area. Anything not here is closed to a token limited to areas. */
const AREA_OF: Record<string, TokenArea> = {
  boards: 'work', tasks: 'work', comments: 'work', files: 'work', time: 'work', undo: 'work', sprints: 'work', views: 'work',
  checklists: 'work', plans: 'work', pages: 'work', departments: 'work', 'task-imports': 'work', calendar: 'work',
  calendars: 'work', notifications: 'work', 'dev-links': 'work', stories: 'work', 'request-links': 'work', promises: 'work',
  handovers: 'work', flow: 'work', automations: 'work', trash: 'work',
  accounts: 'customers', 'account-fields': 'customers', activities: 'customers', records: 'customers',
  'record-comments': 'customers', 'record-types': 'customers', renewals: 'customers', imports: 'customers',
  health: 'customers', portal: 'customers', tickets: 'customers', planned: 'customers', 'meeting-types': 'customers',
  onboarding: 'customers', 'onboarding-fields': 'customers', 'onboarding-goals': 'customers', 'onboarding-issues': 'customers',
  'onboarding-metrics': 'customers', 'onboarding-people': 'customers', 'onboarding-plans': 'customers',
  'onboarding-sites': 'customers', 'onboarding-steps': 'customers', 'onboarding-templates': 'customers',
  reports: 'reports', rhythm: 'reports', search: 'reports', exports: 'reports', analytics: 'reports', metrics: 'reports',
  rollups: 'reports', pulse: 'reports', 'setup-health': 'reports', 'setup-test': 'reports',
  people: 'people', me: 'people',
};

/** Who the token is, for every token: an app must be able to ask that, whatever its areas. */
const ALWAYS = /^\/me$/;

/** The area of an address after /api, or null when it has none (closed to a token limited to areas). */
export function areaOf(path: string): TokenArea | null {
  if (/^\/dev\/webhooks(\/|$)/.test(path)) return 'webhooks';
  return AREA_OF[path.split('/')[1] ?? ''] ?? null;
}

/** True for an address no token may use (see SESSION_ONLY). */
export const sessionOnly = (path: string): boolean => SESSION_ONLY.some((r) => r.test(path));

/** The grants a key or app asked for, checked against the list; null when it asked for none (every area). */
export function parseAreas(list: readonly string[] | null | undefined): AreaGrant[] | null {
  if (!list || !list.length) return null;
  const ok = new Set<string>(TOKEN_AREAS.flatMap((a) => [`${a}:read`, `${a}:write`]));
  const out = [...new Set(list.map((s) => s.trim().toLowerCase()))].filter((s) => ok.has(s)) as AreaGrant[];
  return out.length ? out : null;
}

/**
 * Whether a token may make this call. `session_required` for the session-only addresses; `token_scope` when the
 * token is limited to areas and this address is outside them, or it changes something where the token only reads.
 * The read-only / write split of the token itself is checked by the caller (read_only_token).
 */
export function tokenReach(path: string, method: string, areas: readonly string[] | null): 'ok' | 'session_required' | 'token_scope' {
  if (sessionOnly(path)) return 'session_required';
  if (!areas) return 'ok';
  if (ALWAYS.test(path) && (method === 'GET' || method === 'HEAD')) return 'ok';
  const area = areaOf(path);
  if (!area) return 'token_scope';
  const writes = method !== 'GET' && method !== 'HEAD';
  if (areas.includes(`${area}:write`)) return 'ok';
  if (!writes && areas.includes(`${area}:read`)) return 'ok';
  return 'token_scope';
}
