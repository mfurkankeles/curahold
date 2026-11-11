// The customer portal, the company's side: is it on, sign-in links for
// customers' people, and telling them when a reply is written for them.
import { translate, type Locale } from '../../../shared/src/i18n';
import { logoPath, orgUrl, portalUrl, type Deps, type OrgRow } from '../context';
import { randomToken, sha256Hex } from './crypto';
import { emailHtml } from './emailHtml';

export const PORTAL_COOKIE = 'tw_portal';
export const PORTAL_SESSION_DAYS = 30;
/** A sign-in link: half an hour; an invitation: a week. */
export const LINK_MINUTES = { signin: 30, invite: 7 * 24 * 60 } as const;

/** The company's own switch, and an address to serve it on. */
export function portalOn(org: Pick<OrgRow, 'settings'>, deps?: Deps): boolean {
  const on = !!(org.settings as any)?.portal?.enabled;
  return deps ? on && !!deps.config.portalDomain : on;
}

const localeOf = (org: OrgRow, l: string | null | undefined): Locale => (l === 'tr' || l === 'en' ? l : org.locale);

/** A one-time sign-in link (or an invitation) for someone at a customer, by email. */
export async function emailPortalLink(
  deps: Deps,
  org: OrgRow,
  person: { id: string; email: string; name: string; locale?: string | null; accountName?: string | null },
  kind: 'signin' | 'invite',
  invitedBy?: string,
) {
  const base = portalUrl(deps.config, org.slug);
  if (!base) return;
  const token = randomToken(32);
  const hash = await sha256Hex(token);
  await deps.db.system((q) =>
    q.query(`insert into portal_tokens (token_hash, org_id, portal_user_id, expires_at) values ($1, $2, $3, now() + make_interval(mins => $4))`, [
      hash,
      org.id,
      person.id,
      LINK_MINUTES[kind],
    ]),
  );
  const link = `${base}/auth#token=${token}`;
  const locale = localeOf(org, person.locale);
  const t = (k: Parameters<typeof translate>[1], v: Record<string, string | number> = {}) => translate(locale, k, v, org.terms);
  const text =
    kind === 'invite'
      ? t('portal.email.inviteBody', { name: person.name, by: invitedBy ?? org.name, company: org.name, account: person.accountName ?? '' })
      : t('portal.email.signinBody', { company: org.name });
  const logo = logoPath(org);
  await deps.email.send({
    to: person.email,
    subject: kind === 'invite' ? t('portal.email.inviteSubject', { company: org.name }) : t('portal.email.signinSubject', { company: org.name }),
    text: `${text}\n\n${link}`,
    html: emailHtml({ org: org.name, logo: logo ? `${orgUrl(deps.config, org.slug)}${logo}` : null, text, link, cta: t(kind === 'invite' ? 'portal.email.accept' : 'portal.email.signin') }),
  });
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
