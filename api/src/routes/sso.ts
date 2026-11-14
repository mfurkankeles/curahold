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
import { Hono } from 'hono';
import { z } from 'zod';
import { normalizeLocale } from '../../../shared/src/i18n';
import { maxDevices, nowOf, orgUrl, requirePerm, run, secretsKey, type AppEnv, type C, type Config, type OrgRow } from '../context';
import { audit } from '../lib/audit';
import { randomToken, seal, sha256Hex, unseal } from '../lib/crypto';
import { fail } from '../lib/errors';
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
  scimBaseUrl,
  signState,
  spEntityId,
  verifyIdToken,
  verifyState,
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
  const config = await c.get('deps').db.tenant({ orgId: org.id, userId: null }, (q) => loadSsoAuthConfig(q, cfg));
  if (!config || !config.enabled || !config.protocol) return c.redirect(loginBack(cfg, slug, 'not_configured'));
  const now = nowOf(c.get('deps'));
  const base: SsoState = { o: slug, p: config.protocol, d: device, dl: label, n: randomToken(16), x: now.getTime() + 10 * 60_000 };

  if (config.protocol === 'saml') {
    if (!config.ssoUrl || !config.cert) return c.redirect(loginBack(cfg, slug, 'not_configured'));
    const saml = makeSaml(cfg, slug, config);
    const relay = await signState(base, cfg);
    return c.redirect(await samlRedirectUrl(saml, relay));
  }
  // OIDC
  if (!config.ssoUrl || !config.clientId) return c.redirect(loginBack(cfg, slug, 'not_configured'));
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
  if (!org) return c.redirect(loginBack(cfg, slug, 'org_not_found'));

  const config = await c.get('deps').db.tenant({ orgId: org.id, userId: null }, (q) => loadSsoAuthConfig(q, cfg));
  if (!config || !config.enabled || config.protocol !== 'saml' || !config.cert) return c.redirect(loginBack(cfg, slug, 'not_configured'));

  const saml = makeSaml(cfg, slug, config);
  const verified = await verifySamlResponse(saml, samlResponse);
  if (!verified) return c.redirect(loginBack(cfg, slug, 'oauth_failed'));

  // One-time use of the assertion (per company), then map to an identity.
  const fresh = await c.get('deps').db.tenant({ orgId: org.id, userId: null }, (q) => claimAssertion(q, org.id, verified.assertionXml));
  if (!fresh) return c.redirect(loginBack(cfg, slug, 'oauth_failed'));
  const identity = mapIdentity(verified.attributes, config, verified.nameId);
  if (!identity) return c.redirect(loginBack(cfg, slug, 'no_account'));

  try {
    const to = await completeLogin(c, org, state, identity);
    return c.redirect(to);
  } catch {
    return c.redirect(loginBack(cfg, slug, 'no_account'));
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
  if (!code || c.req.query('error')) return c.redirect(loginBack(cfg, slug, 'oauth_failed'));
  const org = await resolveOrg(c, slug);
  if (!org) return c.redirect(loginBack(cfg, slug, 'org_not_found'));

  const config = await deps.db.tenant({ orgId: org.id, userId: null }, (q) => loadSsoAuthConfig(q, cfg));
  if (!config || !config.enabled || config.protocol !== 'oidc' || !config.issuer || !config.jwksUrl || !config.tokenUrl || !config.clientId) {
    return c.redirect(loginBack(cfg, slug, 'not_configured'));
  }
  const verifier = state.cv ? await unseal<string>(state.cv, secretsKey(cfg)) : null;
  if (!verifier) return c.redirect(loginBack(cfg, slug, 'oauth_failed'));

  const fetchFn = deps.fetch ?? fetch;
  const tokens = await exchangeOidcCode(config, { code, redirectUri: oidcRedirectUri(cfg, slug), verifier }, fetchFn);
  if (!tokens?.id_token) return c.redirect(loginBack(cfg, slug, 'oauth_failed'));
  const keys = await fetchJwks(config.jwksUrl, fetchFn);
  const claims = await verifyIdToken(tokens.id_token, keys, { issuer: config.issuer, audience: config.clientId, nonce: state.n, now });
  if (!claims) return c.redirect(loginBack(cfg, slug, 'oauth_failed'));
  if (claims.email_verified === false) return c.redirect(loginBack(cfg, slug, 'no_account'));
  const identity = mapIdentity(claims, config, null);
  if (!identity) return c.redirect(loginBack(cfg, slug, 'no_account'));

  try {
    const to = await completeLogin(c, org, state, identity);
    return c.redirect(to);
  } catch {
    return c.redirect(loginBack(cfg, slug, 'no_account'));
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

ssoAdminRoutes.get('/sso/settings', async (c) => {
  requirePerm(c, 'org.manage');
  const cfg = c.get('deps').config;
  const org = c.get('org');
  const config = await run(c, (q) => loadSsoAuthConfig(q, cfg));
  return c.json({
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

ssoAdminRoutes.put('/sso/settings', async (c) => {
  requirePerm(c, 'org.manage');
  const input = await body(c, settingsInput);
  const cfg = c.get('deps').config;
  const org = c.get('org');
  const auth = c.get('auth');
  const clean = (v?: string) => (v && v.trim() ? v.trim() : null);

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
    // Deliberately not ON CONFLICT: the request role has no SELECT on `secret`
    // (it is sealed and out of reach), and ON CONFLICT DO UPDATE of that column
    // would trip a privilege check. A plain insert or update is fine.
    const [row] = await q.query<{ x: number }>('select 1 as x from sso_configs where org_id = $1', [org.id]);
    if (row) {
      await q.query(
        `update sso_configs set protocol=$2, enabled=$3, enforced=$4, issuer=$5, sso_url=$6, token_url=$7, jwks_url=$8,
                client_id=$9, attr_email=$10, attr_name=$11, secret=$12, scim_enabled=$13, updated_by=$14, updated_at=now()
          where org_id=$1`,
        [org.id, ...vals],
      );
    } else {
      await q.query(
        `insert into sso_configs (org_id, protocol, enabled, enforced, issuer, sso_url, token_url, jwks_url, client_id, attr_email, attr_name, secret, scim_enabled, updated_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [org.id, ...vals],
      );
    }
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'sso.configured', entity: 'org', entityId: org.id, meta: { protocol: input.protocol ?? null, enabled: input.enabled ?? false } });
  });
  return c.json({ ok: true, sp: spDetails(cfg, org.slug) });
});

/** Generate (or rotate) the SCIM bearer token. Returned once; only its hash is stored. */
ssoAdminRoutes.post('/sso/settings/scim-token', async (c) => {
  requirePerm(c, 'org.manage');
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

export const _test = { completeLogin };
