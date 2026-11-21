// Enterprise single sign-on, per company.
//
// TWO route groups are exported:
//   * ssoAuthRoutes — the login flow and public lookups. These run BEFORE the
//     company-from-host / person middleware (like the OAuth callback), because
//     the SAML ACS is a top-level POST from the IdP (no app CSRF header) and no
//     one is signed in yet. Each handler resolves the company itself (from the
//     URL slug, cross-checked against the signed state) and does all its work
//     inside db.tenant({orgId, userId: null}) so row-level security pins it to
//     that one company. A verified identity is found-or-provisioned there and a
//     session is minted through the EXISTING openSession() + setSessionCookie().
//   * ssoAdminRoutes — the admin config CRUD (org.manage), mounted in the
//     authed /api space.
//
// Mounting (api/src/app.ts, reported to the coordinator — this file edits no hub):
//   before companyFromHost:  app.route('/api/sso', ssoAuthRoutes)
//   in the authed block:     app.route('/api', ssoAdminRoutes)
import { privateHost } from '../connectors/messaging/webhook';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireFresh } from '../lib/identity';
import { normalizeLocale } from '../../../shared/src/i18n';
import { maxDevices, nowOf, orgUrl, requirePerm, run, secretsKey, type AppEnv, type C, type Config, type OrgRow } from '../context';
import { audit } from '../lib/audit';
import { randomToken, seal, sha256Hex, unseal } from '../lib/crypto';
import { fail, HttpError } from '../lib/errors';
import { openSession } from '../lib/sessions';
import { setSessionCookie } from './auth';
import { makeSaml, samlMetadata, samlRedirectUrl, verifySamlResponse } from '../lib/saml';
import {
  acsUrl,
  claimAssertion,
  exchangeOidcCode,
  fetchJwks,
  findOrProvisionUser,
  loadSsoAuthConfig,
  mapIdentity,
  oidcAuthUrl,
  oidcRedirectUri,
  pkce,
  readyBackupAdmins,
  scimBaseUrl,
  signState,
  spEntityId,
  verifyIdToken,
  verifyState,
  type SsoAuthConfig,
  type SsoProblem,
  type SsoState,
} from '../lib/sso';
import { body, deviceId as deviceIdField } from '../lib/validate';

const slugField = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/)
  .max(40);

// ------------------------------------------------------------- helpers

/** Resolve the company from a slug (pre-sign-in), and set it on the context. */
async function resolveOrg(c: C, slug: string): Promise<OrgRow | null> {
  if (!slugField.safeParse(slug).success) return null;
  const deps = c.get('deps');
  const [row] = await deps.db.tenant({ orgId: null, userId: null }, (q) => q.query<any>('select * from resolve_org($1)', [slug]));
  if (!row) return null;
  const org = {
    ...row,
    locale: normalizeLocale(row.locale),
    terms: row.terms ?? {},
    settings: row.settings ?? {},
    domains: [],
    account_fields: [],
    setup: {},
    billing: {},
    trial_ends_at: null,
    join_requests: false,
    auto_join: false,
    currency: 'USD',
    template: 'blank',
  } as OrgRow;
  c.set('org', org);
  c.set('locale', org.locale);
  return org;
}

const loginBack = (cfg: Config, slug: string, error?: string) => `${orgUrl(cfg, slug)}/login${error ? `?error=${error}` : ''}`;
/** Back to the SSO settings with the result of a test sign-in. */
const testBack = (cfg: Config, slug: string, result: string, email?: string) => `${orgUrl(cfg, slug)}/settings/sso?ssoTest=${encodeURIComponent(result)}${email ? `&as=${encodeURIComponent(email)}` : ''}`;
/**
 * The reason a failure is reported with: a test sign-in (an administrator in the settings) gets the exact problem; a real
 * sign-in gets the general one, so the public sign-in page tells nobody what is wrong with the company's provider.
 */
const testOnly = (state: SsoState, problem: SsoProblem) => (state.t ? problem : 'oauth_failed');
/** Once the state is known: a test goes back to the settings, a sign-in to the sign-in page. */
const failBack = (cfg: Config, slug: string, state: SsoState, error: string) => (state.t ? testBack(cfg, slug, error) : loginBack(cfg, slug, error));

/**
 * The connection details a test sign-in proved, as a keyed fingerprint (never the details
 * or secrets themselves). Requiring SSO needs a passed test with exactly these details.
 */
async function connectionPrint(cfg: Config, v: { protocol: string | null; issuer: string | null; ssoUrl: string | null; tokenUrl: string | null; jwksUrl: string | null; clientId: string | null; attrEmail: string | null; cert: string | null; clientSecret: string | null }) {
  return sha256Hex(`${cfg.authSecret}|sso-test|${JSON.stringify([v.protocol, v.issuer, v.ssoUrl, v.tokenUrl, v.jwksUrl, v.clientId, v.attrEmail, v.cert, v.clientSecret])}`);
}

/** A test sign-in that worked: kept in the activity log with what it proved, nobody signed in. */
async function passTest(c: C, org: OrgRow, config: SsoAuthConfig, email: string) {
  const cfg = c.get('deps').config;
  const fp = await connectionPrint(cfg, config);
  await c.get('deps').db.tenant({ orgId: org.id, userId: null }, (q) => audit(q, { orgId: org.id, actorId: null, action: 'sso.tested', entity: 'org', entityId: org.id, meta: { ok: true, email, fp } }));
  return testBack(cfg, org.slug, 'ok', email);
}

/**
 * Why a sign-in was refused, for the login page's `error` (and `cap`): a seat limit says so (M3), anything else stays
 * "no account" so the page reveals nothing more about the company.
 */
const refusedWhy = (e: unknown) =>
  e instanceof HttpError && ['seat_cap_reached', 'plan_limit_seats', 'terms_required'].includes(e.code)
    ? `${e.code}${e.vars?.cap != null ? `&cap=${encodeURIComponent(String(e.vars.cap))}` : ''}`
    : 'no_account';

const origin = (c: C) => ({ ip: c.req.header('cf-connecting-ip') ?? null, geo: c.req.header('cf-ipcountry') ?? null });

/** Mint the session for a verified identity and set the cookie. Shared by SAML and OIDC. */
async function completeLogin(c: C, org: OrgRow, state: SsoState, identity: { email: string; name: string }): Promise<string> {
  const deps = c.get('deps');
  const token = await deps.db.tenant({ orgId: org.id, userId: null }, async (q) => {
    // Find-or-provision; a disabled/deleted account fails 'no_account' and the tx rolls back.
    const found = await findOrProvisionUser(q, org.id, identity);
    const s = await openSession(q, {
      orgId: org.id,
      userId: found.userId,
      deviceId: state.d,
      deviceLabel: state.dl ?? 'Single sign-on',
      // Reuse the existing external-identity-provider method; SSO changes nothing
      // about how a session is stored or checked.
      method: 'oauth',
      // The identity provider does the company's second step; Curahold does not ask again.
      secondStep: 'sso',
      ...origin(c),
      maxDevices: maxDevices(c),
      days: deps.config.sessionDays,
    });
    return s.token;
  });
  setSessionCookie(c, token);
  return `${orgUrl(deps.config, org.slug)}/`;
}

// =============================================================== login flow

export const ssoAuthRoutes = new Hono<AppEnv>();

/** The login page asks whether SSO is on, enforced, and which protocol. */
ssoAuthRoutes.get('/:slug/info', async (c) => {
  const org = await resolveOrg(c, c.req.param('slug'));
  if (!org) fail('org_not_found');
  const [row] = await c.get('deps').db.tenant({ orgId: org!.id, userId: null }, (q) =>
    q.query<{ enabled: boolean; enforced: boolean; protocol: string | null }>(`select enabled, enforced, protocol from sso_configs`),
  );
  const on = !!row?.enabled && !!row?.protocol;
  return c.json({ enabled: on, enforced: on && !!row?.enforced, protocol: on ? row!.protocol : null });
});

/** SP metadata XML the company gives its IdP. */
ssoAuthRoutes.get('/:slug/saml/metadata', async (c) => {
  const org = await resolveOrg(c, c.req.param('slug'));
  if (!org) fail('org_not_found');
  return c.body(samlMetadata(c.get('deps').config, org!.slug), 200, { 'content-type': 'application/samlmetadata+xml; charset=utf-8' });
});

/** Begin SSO: redirect the browser to the company's IdP. */
ssoAuthRoutes.get('/:slug/start', async (c) => {
  const slug = c.req.param('slug');
  const org = await resolveOrg(c, slug);
  const cfg = c.get('deps').config;
  if (!org) return c.redirect(loginBack(cfg, slug, 'org_not_found'));
  const device = c.req.query('device') ?? '';
  if (!deviceIdField.safeParse(device).success) return c.redirect(loginBack(cfg, slug, 'oauth_failed'));
  const label = (c.req.query('dl') ?? '').slice(0, 120) || undefined;
  // A test from the settings may run before SSO is switched on; it signs nobody in.
  const test = c.req.query('test') === '1';
  const config = await c.get('deps').db.tenant({ orgId: org.id, userId: null }, (q) => loadSsoAuthConfig(q, cfg));
  if (!config || (!config.enabled && !test) || !config.protocol) return c.redirect(test ? testBack(cfg, slug, 'not_configured') : loginBack(cfg, slug, 'not_configured'));
  const now = nowOf(c.get('deps'));
  const base: SsoState = { o: slug, p: config.protocol, d: device, dl: label, n: randomToken(16), x: now.getTime() + 10 * 60_000, ...(test ? { t: 1 as const } : {}) };

  if (config.protocol === 'saml') {
    if (!config.ssoUrl || !config.cert) return c.redirect(failBack(cfg, slug, base, 'not_configured'));
    const saml = makeSaml(cfg, slug, config);
    const relay = await signState(base, cfg);
    return c.redirect(await samlRedirectUrl(saml, relay));
  }
  // OIDC
  if (!config.ssoUrl || !config.clientId) return c.redirect(failBack(cfg, slug, base, 'not_configured'));
  const { verifier, challenge } = await pkce();
  const state: SsoState = { ...base, cv: await seal(verifier, secretsKey(cfg)) };
  const signed = await signState(state, cfg);
  return c.redirect(oidcAuthUrl(config, { redirectUri: oidcRedirectUri(cfg, slug), state: signed, nonce: base.n, challenge }));
});

/** SAML assertion consumer service: the IdP POSTs the signed assertion here. */
ssoAuthRoutes.post('/:slug/saml/acs', async (c) => {
  const slug = c.req.param('slug');
  const cfg = c.get('deps').config;
  const form = await c.req.parseBody();
  const samlResponse = typeof form.SAMLResponse === 'string' ? form.SAMLResponse : '';
  const relay = typeof form.RelayState === 'string' ? form.RelayState : '';
  const state = await verifyState(relay, cfg);
  const now = nowOf(c.get('deps'));
  if (!samlResponse || !state || state.p !== 'saml' || state.o !== slug || state.x < now.getTime()) return c.redirect(loginBack(cfg, slug, 'oauth_failed'));
  const org = await resolveOrg(c, slug);
  if (!org) return c.redirect(failBack(cfg, slug, state, 'org_not_found'));

  const config = await c.get('deps').db.tenant({ orgId: org.id, userId: null }, (q) => loadSsoAuthConfig(q, cfg));
  if (!config || (!config.enabled && !state.t) || config.protocol !== 'saml' || !config.cert) return c.redirect(failBack(cfg, slug, state, 'not_configured'));

  const saml = makeSaml(cfg, slug, config);
  let problem: SsoProblem = 'oauth_failed';
  const verified = await verifySamlResponse(saml, samlResponse, (why) => (problem = why));
  if (!verified) return c.redirect(failBack(cfg, slug, state, testOnly(state, problem)));

  // One-time use of the assertion (per company), then map to an identity.
  const fresh = await c.get('deps').db.tenant({ orgId: org.id, userId: null }, (q) => claimAssertion(q, org.id, verified.assertionXml));
  if (!fresh) return c.redirect(failBack(cfg, slug, state, 'oauth_failed'));
  const identity = mapIdentity(verified.attributes, config, verified.nameId);
  if (!identity) return c.redirect(failBack(cfg, slug, state, 'no_account'));
  if (state.t) return c.redirect(await passTest(c, org, config, identity.email));

  try {
    const to = await completeLogin(c, org, state, identity);
    return c.redirect(to);
  } catch (e) {
    return c.redirect(loginBack(cfg, slug, refusedWhy(e)));
  }
});

/** OIDC authorization-code callback. */
ssoAuthRoutes.get('/:slug/oidc/callback', async (c) => {
  const slug = c.req.param('slug');
  const cfg = c.get('deps').config;
  const deps = c.get('deps');
  const state = await verifyState(c.req.query('state') ?? '', cfg);
  const now = nowOf(deps);
  if (!state || state.p !== 'oidc' || state.o !== slug || state.x < now.getTime()) return c.redirect(loginBack(cfg, slug, 'oauth_failed'));
  const code = c.req.query('code');
  if (!code || c.req.query('error')) return c.redirect(failBack(cfg, slug, state, 'oauth_failed'));
  const org = await resolveOrg(c, slug);
  if (!org) return c.redirect(failBack(cfg, slug, state, 'org_not_found'));

  const config = await deps.db.tenant({ orgId: org.id, userId: null }, (q) => loadSsoAuthConfig(q, cfg));
  if (!config || (!config.enabled && !state.t) || config.protocol !== 'oidc' || !config.issuer || !config.jwksUrl || !config.tokenUrl || !config.clientId) {
    return c.redirect(failBack(cfg, slug, state, 'not_configured'));
  }
  const verifier = state.cv ? await unseal<string>(state.cv, secretsKey(cfg)) : null;
  if (!verifier) return c.redirect(failBack(cfg, slug, state, 'oauth_failed'));

  const fetchFn = deps.fetch ?? fetch;
  // An unreachable provider is answered with a way back, never an error page (both calls below never throw).
  const tokens = await exchangeOidcCode(config, { code, redirectUri: oidcRedirectUri(cfg, slug), verifier }, fetchFn);
  if (!tokens.id_token) return c.redirect(failBack(cfg, slug, state, testOnly(state, tokens.failure ?? 'oauth_failed')));
  const keys = await fetchJwks(config.jwksUrl, fetchFn);
  if (!keys.length) return c.redirect(failBack(cfg, slug, state, testOnly(state, 'idp_unreachable')));
  let problem: SsoProblem = 'oauth_failed';
  const claims = await verifyIdToken(tokens.id_token, keys, { issuer: config.issuer, audience: config.clientId, nonce: state.n, now }, (why) => (problem = why));
  if (!claims) return c.redirect(failBack(cfg, slug, state, testOnly(state, problem)));
  if (claims.email_verified === false) return c.redirect(failBack(cfg, slug, state, 'no_account'));
  const identity = mapIdentity(claims, config, null);
  if (!identity) return c.redirect(failBack(cfg, slug, state, 'no_account'));
  if (state.t) return c.redirect(await passTest(c, org, config, identity.email));

  try {
    const to = await completeLogin(c, org, state, identity);
    return c.redirect(to);
  } catch (e) {
    // The seat reason, as on the SAML path (review S4).
    return c.redirect(failBack(cfg, slug, state, refusedWhy(e)));
  }
});

// =============================================================== admin CRUD

export const ssoAdminRoutes = new Hono<AppEnv>();

const settingsInput = z.object({
  protocol: z.enum(['saml', 'oidc']).nullable().optional(),
  enabled: z.boolean().optional(),
  enforced: z.boolean().optional(),
  issuer: z.string().trim().max(500).optional(),
  ssoUrl: z.string().trim().url().max(1000).optional().or(z.literal('')),
  tokenUrl: z.string().trim().url().max(1000).optional().or(z.literal('')),
  jwksUrl: z.string().trim().url().max(1000).optional().or(z.literal('')),
  clientId: z.string().trim().max(400).optional(),
  attrEmail: z.string().trim().min(1).max(200).optional(),
  attrName: z.string().trim().max(200).optional(),
  // New signing material; omitted leaves the stored value in place.
  cert: z.string().trim().max(20000).optional(),
  clientSecret: z.string().trim().max(2000).optional(),
  scimEnabled: z.boolean().optional(),
  // Up to two administrators who keep the emailed link (plus their second step) when SSO is required.
  backupAdminIds: z.array(z.string().uuid()).max(2).optional(),
});

function spDetails(cfg: Config, slug: string) {
  return {
    entityId: spEntityId(cfg, slug),
    acsUrl: acsUrl(cfg, slug),
    metadataUrl: `${orgUrl(cfg, slug)}/api/sso/${slug}/saml/metadata`,
    redirectUri: oidcRedirectUri(cfg, slug),
    scimBaseUrl: scimBaseUrl(cfg, slug),
  };
}

/**
 * The company's SSO settings and the last test sign-in. Needs org.manage. Never returns secrets, only whether signing
 * material is on file.
 */
ssoAdminRoutes.get('/sso/settings', async (c) => {
  requirePerm(c, 'org.manage');
  const cfg = c.get('deps').config;
  const org = c.get('org');
  const config = await run(c, (q) => loadSsoAuthConfig(q, cfg));
  // The last test sign-in, and whether it proved the details stored now.
  const [last] = await run(c, (q) => q.query<{ at: Date; email: string | null; fp: string | null }>(`select at, meta->>'email' as email, meta->>'fp' as fp from audit_log where action = 'sso.tested' order by at desc limit 1`));
  const current = config ? await connectionPrint(cfg, config) : null;
  const backup = await backupState(c);
  return c.json({
    backup,
    test: last ? { at: last.at instanceof Date ? last.at.toISOString() : String(last.at), email: last.email, current: !!current && last.fp === current } : null,
    config: config
      ? {
          protocol: config.protocol,
          enabled: config.enabled,
          enforced: config.enforced,
          issuer: config.issuer,
          ssoUrl: config.ssoUrl,
          tokenUrl: config.tokenUrl,
          jwksUrl: config.jwksUrl,
          clientId: config.clientId,
          attrEmail: config.attrEmail,
          attrName: config.attrName,
          scimEnabled: config.scimEnabled,
          // Never the values — only whether signing material is on file.
          certSet: !!config.cert,
          clientSecretSet: !!config.clientSecret,
        }
      : null,
    sp: spDetails(cfg, org.slug),
  });
});

/**
 * Saves the company's SSO settings. Needs org.manage and a recent sign-in. On the shared service the token and key
 * addresses must be public https (no private networks), because the server fetches them.
 */
ssoAdminRoutes.put('/sso/settings', async (c) => {
  requirePerm(c, 'org.manage');
  await requireFresh(c);
  const input = await body(c, settingsInput);
  const cfg = c.get('deps').config;
  const org = c.get('org');
  const auth = c.get('auth');
  const clean = (v?: string) => (v && v.trim() ? v.trim() : null);
  // The server fetches the token and key addresses: on the shared service they must be public https
  // addresses, never this machine or a private network (a self-hosted install may use its own network).
  if (!cfg.singleTenantSlug) {
    const bad = (['ssoUrl', 'tokenUrl', 'jwksUrl'] as const).filter((k) => {
      const v = clean(input[k]);
      if (!v) return false;
      const u = new URL(v);
      return u.protocol !== 'https:' || privateHost(u.hostname);
    });
    if (bad.length) fail('validation', { fields: bad.join(', ') }, { fields: bad });
  }

  // Backup administrators: only administrators can be one, and requiring SSO needs one who
  // can actually get in (an active administrator with a passkey or an authenticator app).
  const [stored] = await c.get('deps').db.system((q) => q.query<{ on: boolean; ids: string[] }>(`select (enabled and enforced) as on, backup_admin_ids as ids from sso_configs where org_id = $1`, [org.id]));
  const backupIds = input.backupAdminIds ? [...new Set(input.backupAdminIds)] : (stored?.ids ?? []);
  if (input.backupAdminIds?.length) {
    const admins = await c.get('deps').db.system((q) =>
      q.query<{ id: string }>(`select u.id from users u join roles r on r.id = u.role_id where u.org_id = $1 and u.id = any($2::uuid[]) and u.status = 'active' and 'org.manage' = any(r.perms)`, [org.id, backupIds]),
    );
    if (admins.length !== backupIds.length) fail('backup_not_admin');
  }
  const requiring = !!input.enabled && !!input.enforced;
  const backupMatters = requiring && (!stored?.on || input.backupAdminIds !== undefined);
  const ready = backupMatters ? await c.get('deps').db.system((q) => readyBackupAdmins(q, org.id, backupIds)) : [];
  const backupChanged = JSON.stringify([...backupIds].sort()) !== JSON.stringify([...(stored?.ids ?? [])].sort());

  await run(c, async (q) => {
    const existing = await loadSsoAuthConfig(q, cfg);
    const cert = input.cert !== undefined ? clean(input.cert) : (existing?.cert ?? null);
    const clientSecret = input.clientSecret !== undefined ? clean(input.clientSecret) : (existing?.clientSecret ?? null);
    const sealed = cert || clientSecret ? await seal({ cert: cert || undefined, clientSecret: clientSecret || undefined }, secretsKey(cfg)) : null;
    const vals = [
      input.protocol ?? null,
      input.enabled ?? false,
      input.enforced ?? false,
      clean(input.issuer),
      clean(input.ssoUrl),
      clean(input.tokenUrl),
      clean(input.jwksUrl),
      clean(input.clientId),
      input.attrEmail ?? 'email',
      clean(input.attrName),
      sealed,
      input.scimEnabled ?? existing?.scimEnabled ?? false,
      auth.userId,
    ];
    // Requiring SSO locks every other way of signing in: only after a test sign-in has worked
    // with exactly these connection details (a mistyped address or certificate would lock everyone out).
    if (input.enabled && input.enforced && !(existing?.enabled && existing?.enforced)) {
      const fp = await connectionPrint(cfg, { protocol: input.protocol ?? null, issuer: clean(input.issuer), ssoUrl: clean(input.ssoUrl), tokenUrl: clean(input.tokenUrl), jwksUrl: clean(input.jwksUrl), clientId: clean(input.clientId), attrEmail: input.attrEmail ?? 'email', cert, clientSecret });
      const [ok] = await q.query<{ x: number }>(`select 1 as x from audit_log where action = 'sso.tested' and meta->>'fp' = $1 and at > now() - interval '30 days' limit 1`, [fp]);
      if (!ok) fail('sso_untested');
    }
    // Requiring SSO with nobody who could get in if the provider fails would lock the company out.
    if (backupMatters && !ready.length) fail('sso_no_backup');
    // Deliberately not ON CONFLICT: the request role has no SELECT on `secret`
    // (it is sealed and out of reach), and ON CONFLICT DO UPDATE of that column
    // would trip a privilege check. A plain insert or update is fine.
    const [row] = await q.query<{ x: number }>('select 1 as x from sso_configs where org_id = $1', [org.id]);
    if (row) {
      await q.query(
        `update sso_configs set protocol=$2, enabled=$3, enforced=$4, issuer=$5, sso_url=$6, token_url=$7, jwks_url=$8,
                client_id=$9, attr_email=$10, attr_name=$11, secret=$12, scim_enabled=$13, updated_by=$14, backup_admin_ids=$15, updated_at=now()
          where org_id=$1`,
        [org.id, ...vals, backupIds],
      );
    } else {
      await q.query(
        `insert into sso_configs (org_id, protocol, enabled, enforced, issuer, sso_url, token_url, jwks_url, client_id, attr_email, attr_name, secret, scim_enabled, updated_by, backup_admin_ids)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [org.id, ...vals, backupIds],
      );
    }
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'sso.configured', entity: 'org', entityId: org.id, meta: { protocol: input.protocol ?? null, enabled: input.enabled ?? false } });
    if (backupChanged) await audit(q, { orgId: org.id, actorId: auth.userId, action: 'sso.backup_changed', entity: 'org', entityId: org.id, meta: { backupAdminIds: backupIds } });
  });
  return c.json({ ok: true, sp: spDetails(cfg, org.slug), backup: await backupState(c) });
});

/** Generate (or rotate) the SCIM bearer token. Returned once; only its hash is stored. */
ssoAdminRoutes.post('/sso/settings/scim-token', async (c) => {
  requirePerm(c, 'org.manage');
  await requireFresh(c);
  const cfg = c.get('deps').config;
  const org = c.get('org');
  const auth = c.get('auth');
  const token = randomToken(32);
  const hash = await sha256Hex(token);
  const hint = token.slice(-6);
  await run(c, async (q) => {
    const [row] = await q.query<{ x: number }>('select 1 as x from sso_configs where org_id = $1', [org.id]);
    if (row) {
      await q.query('update sso_configs set scim_enabled=true, scim_token_hash=$2, scim_token_hint=$3, updated_by=$4, updated_at=now() where org_id=$1', [org.id, hash, hint, auth.userId]);
    } else {
      await q.query('insert into sso_configs (org_id, scim_enabled, scim_token_hash, scim_token_hint, updated_by) values ($1, true, $2, $3, $4)', [org.id, hash, hint, auth.userId]);
    }
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'sso.configured', entity: 'org', entityId: org.id, meta: { scimToken: 'rotated' } });
  });
  return c.json({ token, baseUrl: scimBaseUrl(cfg, org.slug), hint });
});

/**
 * The backup administrators chosen, and every administrator who could be one, each with
 * whether they have a second step (without one, the backup sign-in does not let them in).
 */
async function backupState(c: C) {
  const org = c.get('org');
  const rows = await c.get('deps').db.system((q) =>
    q.query<{ id: string; name: string; email: string; admin: boolean; second_step: boolean; chosen: boolean }>(
      `select u.id, u.name, u.email, ('org.manage' = any(r.perms)) as admin, u.id = any(coalesce(s.backup_admin_ids, '{}')) as chosen,
              (exists (select 1 from user_totp t where t.org_id = u.org_id and t.user_id = u.id and t.confirmed_at is not null)
               or exists (select 1 from user_passkeys p where p.org_id = u.org_id and p.user_id = u.id)) as second_step
         from users u join roles r on r.id = u.role_id left join sso_configs s on s.org_id = u.org_id
        where u.org_id = $1 and u.status = 'active' and ('org.manage' = any(r.perms) or u.id = any(coalesce(s.backup_admin_ids, '{}')))
        order by u.name`,
      [org.id],
    ),
  );
  const [s] = await c.get('deps').db.system((q) => q.query<{ ids: string[] }>('select backup_admin_ids as ids from sso_configs where org_id = $1', [org.id]));
  return {
    ids: s?.ids ?? [],
    people: rows.map((r) => ({ id: r.id, name: r.name, email: r.email, admin: r.admin, secondStep: r.second_step })),
  };
}

export const _test = { completeLogin };
