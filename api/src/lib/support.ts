// Curahold's own support team, inside a company only with a person's consent.
//
// A person grants access (lib: grants), support asks for a one-time entry link
// with its staff key, and the link opens a support session in the browser.
// That session acts as the person who granted it: the same role, the same
// customers, the same database checks. A "view" grant cannot change anything;
// an "edit" grant (only an administrator can give one) can, and every change
// is written to the activity log with the staff member's name.
//
// Some things stay out of reach whatever the grant: a person's devices and
// sign-in, API keys, apps and webhooks, exporting or erasing people, roles and
// sign-in settings, and support access itself (support can never extend its
// own stay).
import { getCookie } from 'hono/cookie';
import type { Perm } from '../../../shared/src/model';
import { SUPPORT_POLICIES, type SupportPolicy } from '../../../shared/src/help';
import type { AuthCtx, C, Deps, OrgRow } from '../context';
import { normalizeLocale } from '../../../shared/src/i18n';
import { audit } from './audit';
import { safeEqual, sha256Hex } from './crypto';
import { fail } from './errors';

export const SUPPORT_COOKIE = 'app_support';
/** A support session lasts at most this long, and never past the grant. */
export const SUPPORT_SESSION_HOURS = 8;
export const ENTRY_LINK_MINUTES = 10;

export function supportPolicy(org: Pick<OrgRow, 'settings'>): SupportPolicy {
  const p = (org.settings as any)?.supportAccess;
  return (SUPPORT_POLICIES as readonly string[]).includes(p) ? p : 'anyone';
}

/** May this person let support in, under the company's policy? */
export function mayGrant(org: Pick<OrgRow, 'settings'>, perms: readonly string[]): boolean {
  const p = supportPolicy(org);
  return p === 'anyone' || (p === 'admins' && perms.includes('org.manage'));
}

export function staffKeyOk(c: C): boolean {
  const key = c.get('deps').config.staffKey;
  const given = c.req.header('x-curahold-staff-key') ?? '';
  return !!key && key.length >= 24 && safeEqual(given, key);
}

// Paths support never reaches, even with an edit grant. Reading is also closed
// where reading alone hands out something lasting (keys, exports).
const NEVER: RegExp[] = [
  /^\/api\/me\/(sessions|export|calendar)/,
  /^\/api\/auth\//,
  /^\/api\/dev\//,
  /^\/api\/oauth\//,
  /^\/api\/support\/(grants|policy)/,
  /^\/api\/admin\/users\/[^/]+\/(export|erase)/,
  /^\/api\/admin\/sessions/,
];
const NO_CHANGES: RegExp[] = [
  /^\/api\/help/,
  /^\/api\/me$/,
  /^\/api\/admin\/(users|roles|domains|join-requests|org)/,
  /^\/api\/setup\/people/,
  // Connecting a service (its keys) or removing one; fixing a sync's mapping is fine.
  /^\/api\/connections\/(key|webhook|demo)$/,
];

export function supportBlocked(method: string, path: string): boolean {
  if (NEVER.some((r) => r.test(path))) return true;
  if (method === 'GET' || method === 'HEAD') return false;
  if (method === 'DELETE' && /^\/api\/connections\/[^/]+$/.test(path)) return true;
  return NO_CHANGES.some((r) => r.test(path));
}

interface SupportRow {
  session_id: string;
  grant_id: string;
  staff: string;
  level: 'view' | 'edit';
  until: string;
  stale: boolean;
  user_id: string;
  name: string;
  email: string;
  seat: AuthCtx['seat'];
  status: string;
  locale: string | null;
  role_id: string;
  role_key: string;
  perms: Perm[];
}

/**
 * Signs support in from its cookie, as the person who granted access.
 * Returns false when there is no support cookie (the caller then answers
 * "unauthenticated" as usual).
 */
export async function signInSupport(c: C): Promise<boolean> {
  const token = getCookie(c, SUPPORT_COOKIE);
  if (!token) return false;
  const deps = c.get('deps');
  const org = c.get('org');
  const hash = await sha256Hex(token);
  const [s] = await deps.db.system((q) =>
    q.query<SupportRow>(
      `select ss.id as session_id, g.id as grant_id, ss.staff, g.level,
              least(ss.expires_at, g.expires_at) as until,
              coalesce(ss.last_seen_at, ss.entered_at) < now() - interval '5 minutes' as stale,
              u.id as user_id, u.name, u.email, u.seat, u.status, u.locale,
              r.id as role_id, r.key as role_key, r.perms
         from support_sessions ss
         join support_grants g on g.id = ss.grant_id and g.org_id = ss.org_id
         join users u on u.id = g.user_id and u.org_id = g.org_id
         join roles r on r.id = u.role_id
        where ss.token_hash = $1 and ss.org_id = $2
          and ss.revoked_at is null and g.revoked_at is null
          and ss.expires_at > now() and g.expires_at > now()`,
      [hash, org.id],
    ),
  );
  if (!s || s.status !== 'active') fail('support_ended');
  // The company may have closed support access since the grant was given.
  if (!mayGrant(org, s.perms ?? [])) fail('support_ended');
  const method = c.req.method;
  if (supportBlocked(method, c.req.path)) fail('support_blocked');
  const writes = method !== 'GET' && method !== 'HEAD';
  if (writes && s.level !== 'edit') fail('support_read_only');

  c.set('auth', {
    userId: s.user_id,
    sessionId: s.session_id,
    name: s.name,
    email: s.email,
    roleId: s.role_id,
    roleKey: s.role_key,
    perms: (s.perms ?? []) as Perm[],
    seat: s.level === 'edit' ? s.seat : 'viewer',
    locale: s.locale ? normalizeLocale(s.locale) : null,
  });
  c.set('supportBy', { staff: s.staff, level: s.level, until: new Date(s.until).toISOString(), grantId: s.grant_id });

  if (s.stale || writes) {
    await deps.db.tenant({ orgId: org.id, userId: s.user_id }, async (q) => {
      if (writes) {
        await audit(q, {
          orgId: org.id,
          actorId: s.user_id,
          action: 'support.changed',
          entity: 'support_grant',
          entityId: s.grant_id,
          meta: { staff: s.staff, method, path: c.req.path },
        });
      }
    });
    if (s.stale) {
      await deps.db.system(async (q) => {
        await q.query('update support_sessions set last_seen_at = now() where id = $1', [s.session_id]);
        await q.query('update support_grants set last_used_at = now() where id = $1', [s.grant_id]);
      });
    }
  }
  return true;
}

/** Ends every support session opened on a grant (when it is revoked). */
export async function endSupportSessions(deps: Deps, orgId: string, grantId: string) {
  await deps.db.system((q) =>
    q.query('update support_sessions set revoked_at = now() where org_id = $1 and grant_id = $2 and revoked_at is null', [orgId, grantId]),
  );
}
