// The customer portal, the company's side: is it on, sign-in links for
// customers' people, and telling them when a reply is written for them.
import { translate, type Locale } from '../../../shared/src/i18n';
import { portalAuthOf, type PortalAuth, type PortalSignInOptions } from '../../../shared/src/portal';
import { logoPath, orgUrl, portalUrl, type Deps, type OrgRow } from '../context';
import { randomDigits, randomToken, sha256Hex } from './crypto';
import { emailHtml } from './emailHtml';

/** The customer portal's request context (api/src/portal.ts). */
export type PortalEnv = {
  Variables: {
    org: OrgRow;
    locale: Locale;
    person: { id: string; name: string; accountId: string; sessionId: string };
  };
};

export const PORTAL_COOKIE = 'app_portal';
/** Set by the portal when a Google/Microsoft sign-in starts; only that browser can finish it. */
export const FLOW_COOKIE = 'app_portal_flow';
/** Invitation: a week. Sign-in email (link and code) and password reset: half an hour. */
export const LINK_MINUTES = { invite: 7 * 24 * 60, link: 30, reset: 30, oauth: 2, oauth_confirm: 15 } as const;

type Kind = keyof typeof LINK_MINUTES;
type Person = { id: string; email: string; name: string; locale?: string | null; accountName?: string | null };

/** The company's own switch, and an address to serve it on. */
export function portalOn(org: Pick<OrgRow, 'settings'>, deps?: Deps): boolean {
  const on = !!(org.settings as any)?.portal?.enabled;
  return deps ? on && !!deps.config.portalDomain : on;
}

export function portalAuth(org: Pick<OrgRow, 'settings'>): PortalAuth {
  return portalAuthOf((org.settings as any)?.portal?.auth);
}

/** What the sign-in page offers: the company's choice, where this installation can do it. */
export function signInOptions(org: Pick<OrgRow, 'settings'>, deps: Deps): PortalSignInOptions {
  const a = portalAuth(org);
  return {
    email: a.email,
    google: a.google && !!deps.config.oauth.google,
    microsoft: a.microsoft && !!deps.config.oauth.microsoft,
    passkey: a.passkey,
    password: a.password,
  };
}

/** Is a session opened this way still allowed? (Closing a way of signing in ends its sessions.) */
export function methodAllowed(options: PortalSignInOptions, method: string): boolean {
  if (method === 'invite') return true;
  if (method === 'link' || method === 'code') return options.email;
  return !!options[method as keyof PortalSignInOptions];
}

const localeOf = (org: OrgRow, l: string | null | undefined): Locale => (l === 'tr' || l === 'en' ? l : org.locale);

/** A one-time token for someone at a customer; returns the token (and the code, for sign-in emails). */
export async function createPortalToken(
  deps: Deps,
  orgId: string,
  personId: string,
  kind: Kind,
  extra: { flowHash?: string | null; provider?: string | null; subject?: string | null; withCode?: boolean } = {},
) {
  const token = randomToken(32);
  const hash = await sha256Hex(token);
  const code = extra.withCode ? randomDigits(6) : null;
  const codeHash = code ? await sha256Hex(`${hash}.${code}`) : null;
  await deps.db.system((q) =>
    q.query(
      `insert into portal_tokens (token_hash, org_id, portal_user_id, kind, expires_at, code_hash, flow_hash, provider, subject)
       values ($1, $2, $3, $4, now() + make_interval(mins => $5), $6, $7, $8, $9)`,
      [hash, orgId, personId, kind, LINK_MINUTES[kind], codeHash, extra.flowHash ?? null, extra.provider ?? null, extra.subject ?? null],
    ),
  );
  return { token, hash, code };
}

/** An invitation, a sign-in email (link and code), or a password reset, by email. */
export async function emailPortalLink(deps: Deps, org: OrgRow, person: Person, kind: 'invite' | 'signin' | 'reset', invitedBy?: string) {
  await (await preparePortalEmail(deps, org, person, kind, invitedBy))();
}

/**
 * The same, in two steps: the link is made now (so limits count it at once),
 * and the returned function sends it (after the answer has gone out).
 */
export async function preparePortalEmail(deps: Deps, org: OrgRow, person: Person, kind: 'invite' | 'signin' | 'reset', invitedBy?: string): Promise<() => Promise<void>> {
  const base = portalUrl(deps.config, org.slug);
  if (!base) return async () => undefined;
  const { token, code } = await createPortalToken(deps, org.id, person.id, kind === 'signin' ? 'link' : kind, { withCode: kind === 'signin' });
  return () => sendPortalLink(deps, org, person, kind, base, token, code, invitedBy);
}

async function sendPortalLink(deps: Deps, org: OrgRow, person: Person, kind: 'invite' | 'signin' | 'reset', base: string, token: string, code: string | null, invitedBy?: string) {
  const link = kind === 'reset' ? `${base}/auth#reset=${token}` : `${base}/auth#token=${token}`;
  const locale = localeOf(org, person.locale);
  const t = (k: Parameters<typeof translate>[1], v: Record<string, string | number> = {}) => translate(locale, k, v, org.terms);
  const text =
    kind === 'invite'
      ? t('portal.email.inviteBody', { name: person.name, by: invitedBy ?? org.name, company: org.name, account: person.accountName ?? '' })
      : kind === 'reset'
        ? t('portal.email.resetBody', { company: org.name })
        : t('portal.email.signinBody', { company: org.name, code: code! });
  const subject =
    kind === 'invite' ? t('portal.email.inviteSubject', { company: org.name }) : kind === 'reset' ? t('portal.email.resetSubject', { company: org.name }) : t('portal.email.signinSubject', { company: org.name, code: code! });
  const cta = kind === 'invite' ? 'portal.email.accept' : kind === 'reset' ? 'portal.email.reset' : 'portal.email.signin';
  await sendMail(deps, org, person.email, subject, text, link, t(cta));
}

/** The six-digit code that confirms a first Microsoft sign-in, by email. */
export async function emailConfirmCode(deps: Deps, org: OrgRow, person: Person, code: string) {
  const locale = localeOf(org, person.locale);
  const t = (k: Parameters<typeof translate>[1], v: Record<string, string | number> = {}) => translate(locale, k, v, org.terms);
  await sendMail(deps, org, person.email, t('portal.email.confirmSubject', { code }), t('portal.email.confirmBody', { company: org.name, code }), null, null);
}

/** "Someone signed in": after a sign-in that did not go through this person's inbox. */
export async function emailNewSignIn(deps: Deps, org: OrgRow, person: Person, method: string, client: string | null) {
  const locale = localeOf(org, person.locale);
  const t = (k: Parameters<typeof translate>[1], v: Record<string, string | number> = {}) => translate(locale, k, v, org.terms);
  const when = new Date().toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-GB', { timeZone: org.timezone || 'UTC', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const text = t('portal.email.noticeBody', { company: org.name, how: t(`portal.method.${method}` as Parameters<typeof translate>[1]), client: client ?? '—', when });
  await sendMail(deps, org, person.email, t('portal.email.noticeSubject', { company: org.name }), text, portalUrl(deps.config, org.slug), t('portal.email.open'));
}

async function sendMail(deps: Deps, org: OrgRow, to: string, subject: string, text: string, link: string | null, cta: string | null) {
  const logo = logoPath(org);
  const logoUrl = logo ? `${orgUrl(deps.config, org.slug)}${logo}` : null;
  await deps.email.send({
    to,
    subject,
    text: link ? `${text}\n\n${link}` : text,
    ...(link && cta ? { html: emailHtml({ org: org.name, logo: logoUrl, text, link, cta }) } : {}),
  });
}

/** "Chrome · macOS", for the sessions list and the sign-in notice. */
export function clientOf(ua: string | undefined): string | null {
  if (!ua) return null;
  const b = /Edg\/(\d+)/.exec(ua) ? 'Edge' : /Firefox\/(\d+)/.exec(ua) ? 'Firefox' : /Chrome\/(\d+)/.exec(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${b} · ${os}` : b;
}

/** People at the customer who follow a task: who opened it and who wrote in it. */
export async function tellCustomer(deps: Deps, org: OrgRow, taskId: string, byName: string, body: string) {
  const base = portalUrl(deps.config, org.slug);
  if (!base) return;
  const people = await deps.db.system((q) =>
    q.query<{ email: string; name: string; locale: string | null; title: string }>(
      `select distinct pu.email, pu.name, pu.locale, t.title
         from tasks t
         join portal_users pu on pu.org_id = t.org_id and pu.account_id = t.account_id and pu.status = 'active'
        where t.id = $1 and t.org_id = $2 and t.portal_shared
          and (pu.id = t.portal_author_id or exists (select 1 from comments c where c.task_id = t.id and c.portal_author_id = pu.id))`,
      [taskId, org.id],
    ),
  );
  const link = `${base}/t/${taskId}`;
  const logo = logoPath(org);
  for (const p of people) {
    const locale = localeOf(org, p.locale);
    const excerpt = body.replace(/@\[([^\]]+)\]\([0-9a-f-]{36}\)/g, '@$1').slice(0, 600);
    const text = translate(locale, 'portal.email.replyBody', { name: byName, company: org.name, title: p.title, excerpt }, org.terms);
    await deps.email.send({
      to: p.email,
      subject: translate(locale, 'portal.email.replySubject', { title: p.title }, org.terms),
      text: `${text}\n\n${link}`,
      html: emailHtml({ org: org.name, logo: logo ? `${orgUrl(deps.config, org.slug)}${logo}` : null, text, link, cta: translate(locale, 'portal.email.open', {}, org.terms) }),
    });
  }
}
