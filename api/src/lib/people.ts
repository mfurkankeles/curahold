// Shared steps for bringing people in: invitations (admin, setup wizard,
// approved join requests) all send the same 7-day sign-in link.
import { translate, normalizeLocale, type Locale, type MessageKey } from '../../../shared/src/i18n';
import { logoPath, orgUrl, type Deps, type OrgRow } from '../context';
import { emailHtml } from './emailHtml';
import type { Q } from '../db';
import { randomToken, sha256Hex } from './crypto';

export const INVITE_DAYS = 7;

export async function createInviteToken(q: Q, orgId: string, email: string) {
  const token = randomToken(32);
  await q.query(
    `insert into login_tokens (org_id, email, token_hash, kind, expires_at)
     values ($1, $2, $3, 'magic', now() + make_interval(days => $4::int))`,
    [orgId, email, await sha256Hex(token), INVITE_DAYS],
  );
  return token;
}

export async function sendInvite(
  deps: Deps,
  org: Pick<OrgRow, 'slug' | 'name' | 'locale' | 'terms' | 'settings'>,
  to: { email: string; name: string; locale?: string | null },
  token: string,
  inviter: string,
  kind: 'invite' | 'approved' = 'invite',
) {
  const locale: Locale = normalizeLocale(to.locale ?? org.locale);
  const link = `${orgUrl(deps.config, org.slug)}/auth/verify#token=${token}`;
  const k = (s: string) => `email.${kind}.${s}` as MessageKey;
  const text = translate(locale, k('body'), { inviter, org: org.name, name: to.name, link }, org.terms);
  await deps.email.send({
    to: to.email,
    subject: translate(locale, k('subject'), { inviter, org: org.name }, org.terms),
    text,
    html: emailHtml({ org: org.name, logo: logoUrl(deps, org), text, link, cta: translate(locale, 'email.cta.signIn') }),
  });
}

/** People who can approve someone (they manage users). */
export async function userManagers(q: Q, orgId: string): Promise<string[]> {
  const rows = await q.query<{ id: string }>(
    `select u.id from users u join roles r on r.id = u.role_id
      where u.org_id = $1 and u.status = 'active' and 'users.manage' = any(r.perms)`,
    [orgId],
  );
  return rows.map((r) => r.id);
}

export function logoUrl(deps: Deps, org: Pick<OrgRow, 'slug' | 'settings'>): string | null {
  const path = logoPath(org);
  return path ? `${orgUrl(deps.config, org.slug)}${path}` : null;
}
