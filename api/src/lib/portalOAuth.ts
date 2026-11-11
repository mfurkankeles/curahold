// Google and Microsoft sign-in for the customer portal.
//
// Providers accept only registered return addresses, so the portal uses the
// app's one central callback (app.tendwell.com/api/oauth/callback); a signed
// state marked "portal" sends the browser on to the company's portal with a
// two-minute one-time token. Two guards:
//   * the browser that started the sign-in must finish it (a cookie set on
//     the portal at the start, its hash carried in the state and the token),
//     so nobody can sign someone else in to their own account;
//   * Microsoft does not vouch for email addresses, so the first Microsoft
//     sign-in of a person is confirmed once with a code sent to their email;
//     after that the Microsoft account itself (its `sub`) is what matches.
import type { Context } from 'hono';
import { normalizeLocale } from '../../../shared/src/i18n';
import { portalUrl, type Deps, type OrgRow } from '../context';
import { randomToken, sha256Hex, sign } from './crypto';
import { authorizeUrl, exchangeCode, isProvider, type ProviderId } from './oidc';
import { FLOW_COOKIE, createPortalToken, emailConfirmCode, signInOptions } from './portal';

export interface PortalOAuthState {
  k: 'portal';
  o: string; // company slug
  p: ProviderId;
  f: string; // hash of the starting browser's flow cookie
  n: string; // nonce
  x: number; // expiry (ms)
}

export function centralCallbackUrl(deps: Deps): string {
  const cfg = deps.config;
  const port = cfg.publicPort ? `:${cfg.publicPort}` : '';
  return `${cfg.scheme}://${cfg.centralHost}${port}/api/oauth/callback`;
}

/** The provider's sign-in page, for a portal; the flow cookie is the caller's to set. */
export async function portalOAuthStart(deps: Deps, org: OrgRow, provider: string, flow: string): Promise<string | null> {
  if (!isProvider(provider) || !signInOptions(org, deps)[provider]) return null;
  const now = (deps.now ?? (() => new Date()))();
  const state: PortalOAuthState = { k: 'portal', o: org.slug, p: provider, f: await sha256Hex(flow), n: randomToken(16), x: now.getTime() + 10 * 60_000 };
  return authorizeUrl(provider, deps.config.oauth[provider]!, centralCallbackUrl(deps), await sign(state, deps.config.authSecret), state.n);
}

export async function portalOAuthCallback(c: Context<any>, state: PortalOAuthState) {
  const deps: Deps = c.get('deps');
  const cfg = deps.config;
  const now = (deps.now ?? (() => new Date()))();
  const base = portalUrl(cfg, state.o);
  if (!base) return c.text('No portal', 404);
  const fail = (reason: string) => c.redirect(`${base}/?error=${reason}`);
  const providerCfg = cfg.oauth[state.p];
  const code = c.req.query('code');
  if (!providerCfg || !code) return fail('oauth_failed');
  const identity = await exchangeCode(state.p, providerCfg, code, centralCallbackUrl(deps), state.n, deps.fetch ?? fetch, now);
  if (!identity?.subject) return fail('oauth_failed');

  const [row] = await deps.db.tenant({ orgId: null, userId: null }, (q) => q.query<OrgRow>('select * from resolve_org($1)', [state.o]));
  if (!row) return c.text('Unknown workspace', 404);
  const org = { ...row, locale: normalizeLocale(row.locale), settings: row.settings ?? {}, terms: row.terms ?? {} } as OrgRow;
  if (!(org.settings as any)?.portal?.enabled || !signInOptions(org, deps)[state.p]) return fail('method_off');

  // First by the account already linked, then by the verified address.
  const person = await deps.db.system(async (q): Promise<{ id: string; email: string; name: string; locale: string | null; linked: boolean } | null> => {
    const [linked] = await q.query(
      `select pu.id, pu.email, pu.name, pu.locale from portal_identities i
         join portal_users pu on pu.id = i.portal_user_id and pu.org_id = i.org_id
         join accounts a on a.id = pu.account_id and a.archived_at is null
        where i.org_id = $1 and i.provider = $2 and i.subject = $3 and pu.status in ('invited', 'active')`,
      [org.id, state.p, identity.subject],
    );
    if (linked) return { id: linked.id, email: linked.email, name: linked.name, locale: linked.locale, linked: true };
    const [byEmail] = await q.query(
      `select pu.id, pu.email, pu.name, pu.locale from portal_users pu
         join accounts a on a.id = pu.account_id and a.archived_at is null
        where pu.org_id = $1 and pu.email = $2 and pu.status in ('invited', 'active')`,
      [org.id, identity.email],
    );
    return byEmail ? { id: byEmail.id, email: byEmail.email, name: byEmail.name, locale: byEmail.locale, linked: false } : null;
  });
  if (!person) return fail('no_access');

  // Google vouches for the address; Microsoft is confirmed once by email.
  const confirm = !person.linked && state.p === 'microsoft';
  const { token, code: emailed } = await createPortalToken(deps, org.id, person.id, confirm ? 'oauth_confirm' : 'oauth', {
    flowHash: state.f,
    provider: state.p,
    subject: identity.subject,
    withCode: confirm,
  });
  if (confirm) await emailConfirmCode(deps, org, person, emailed!);
  return c.redirect(`${base}/auth#${confirm ? 'confirm' : 'token'}=${token}`);
}

export { FLOW_COOKIE };
