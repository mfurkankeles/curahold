// Shared machinery for enterprise single sign-on and SCIM provisioning.
//
// What lives here, and what does NOT:
//  * Loading a company's sealed SSO config (sso_auth_config()), unsealing its
//    signing material, and mapping an assertion/claim set to an address + name.
//  * Signing and checking the RelayState / OIDC `state` that carries the
//    company, device and a nonce across the redirect to the IdP and back.
//  * Finding or provisioning the user in ONE company, and returning enough for
//    the route to mint a session through the existing openSession() path.
//  * OIDC: PKCE, the authorization URL, the code exchange and — the part that
//    matters — verifying the id_token's signature against the IdP's JWKS with
//    Web Crypto (so it runs on Workers and Node alike), plus issuer, audience,
//    nonce and expiry.
// SAML assertion verification is in lib/saml.ts (a vetted XML-DSig library).
//
// Session handling is deliberately NOT here: the routes call openSession() and
// setSessionCookie() exactly as the email-link and OAuth flows do.
import type { Q } from '../db';
import type { Config } from '../context';
import { orgUrl, secretsKey } from '../context';
import { audit } from './audit';
import { fail } from './errors';
import { base64url, fromBase64url, randomToken, sha256Hex, sign, unseal, verify } from './crypto';

const enc = new TextEncoder();
const dec = new TextDecoder();

export type SsoProtocol = 'saml' | 'oidc';

/** A company's SSO config as the login routes need it, with the secret opened. */
export interface SsoAuthConfig {
  protocol: SsoProtocol | null;
  enabled: boolean;
  enforced: boolean;
  issuer: string | null;
  ssoUrl: string | null;
  tokenUrl: string | null;
  jwksUrl: string | null;
  clientId: string | null;
  attrEmail: string;
  attrName: string | null;
  scimEnabled: boolean;
  /** SAML: the IdP signing certificate (base64 DER). OIDC: null. */
  cert: string | null;
  /** OIDC: the client secret. SAML: null. */
  clientSecret: string | null;
}

interface RawConfig {
  protocol: SsoProtocol | null;
  enabled: boolean;
  enforced: boolean;
  issuer: string | null;
  sso_url: string | null;
  token_url: string | null;
  jwks_url: string | null;
  client_id: string | null;
  attr_email: string;
  attr_name: string | null;
  secret: string | null;
  scim_enabled: boolean;
}

/**
 * The company's SSO config, secret opened. Reads sso_auth_config(), which is
 * anchored to app_org() — so `q` MUST be a tenant transaction for the company
 * the login is for. Returns null when the company has no SSO config row.
 */
/** Whether this company requires SSO — then email-link and app-OAuth sign-in are refused, only the company's IdP is allowed. Reads no secret, so it runs under the request role. */
export async function ssoEnforced(q: Q): Promise<boolean> {
  const [row] = await q.query<{ enabled: boolean; enforced: boolean; protocol: string | null }>('select enabled, enforced, protocol from sso_configs');
  // A protocol must be set, so an "enforced" flag on a half-configured login never locks everyone out.
  return !!row && row.enabled && row.enforced && !!row.protocol;
}

export async function loadSsoAuthConfig(q: Q, cfg: Config): Promise<SsoAuthConfig | null> {
  const [row] = await q.query<RawConfig>('select * from sso_auth_config()');
  if (!row) return null;
  const opened = row.secret ? await unseal<{ cert?: string; clientSecret?: string }>(row.secret, secretsKey(cfg)) : null;
  return {
    protocol: row.protocol,
    enabled: row.enabled,
    enforced: row.enforced,
    issuer: row.issuer,
    ssoUrl: row.sso_url,
    tokenUrl: row.token_url,
    jwksUrl: row.jwks_url,
    clientId: row.client_id,
    attrEmail: row.attr_email,
    attrName: row.attr_name,
    scimEnabled: row.scim_enabled,
    cert: opened?.cert ?? null,
    clientSecret: opened?.clientSecret ?? null,
  };
}

// ---------------------------------------------------------------- SP URLs

/** The service-provider entityID we present to a company's IdP (its own, per slug). */
export const spEntityId = (cfg: Config, slug: string) => `${orgUrl(cfg, slug)}/api/sso/${slug}/saml/metadata`;
/** Where the IdP posts the SAML assertion (the ACS, per company). */
export const acsUrl = (cfg: Config, slug: string) => `${orgUrl(cfg, slug)}/api/sso/${slug}/saml/acs`;
/** Where the OIDC provider returns the authorization code (per company). */
export const oidcRedirectUri = (cfg: Config, slug: string) => `${orgUrl(cfg, slug)}/api/sso/${slug}/oidc/callback`;
/** The SCIM 2.0 base URL a company gives its IdP. */
export const scimBaseUrl = (cfg: Config, slug: string) => `${orgUrl(cfg, slug)}/api/scim/v2`;

// ------------------------------------------------------------ signed state

/**
 * Carried across the redirect to the IdP and back. HMAC-signed with authSecret,
 * so the browser and the IdP cannot forge or alter it; short-lived. The OIDC
 * PKCE verifier is sealed (AES-GCM) inside it so it stays confidential even
 * though the signed body is readable.
 */
export interface SsoState {
  o: string; // company slug
  p: SsoProtocol;
  d: string; // device id
  dl?: string; // device label
  n: string; // nonce
  x: number; // expiry (ms since epoch)
  cv?: string; // OIDC only: the PKCE code_verifier, sealed
  rt?: string; // optional return path inside the app
}

export const signState = (state: SsoState, cfg: Config) => sign(state, cfg.authSecret);
export const verifyState = (token: string, cfg: Config) => verify<SsoState>(token, cfg.authSecret);

// ------------------------------------------------------ identity mapping

/** Pull the address and display name out of an attribute / claim map. */
export function mapIdentity(
  attrs: Record<string, unknown>,
  config: Pick<SsoAuthConfig, 'attrEmail' | 'attrName'>,
  fallbackSubject?: string | null,
): { email: string; name: string } | null {
  const pick = (name: string | null | undefined): string | null => {
    if (!name) return null;
    const v = attrs[name];
    if (Array.isArray(v)) return v.length ? String(v[0]) : null;
    return v == null ? null : String(v);
  };
  const emailRaw = pick(config.attrEmail) ?? pick('email') ?? pick('mail') ?? fallbackSubject ?? null;
  const email = (emailRaw ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) return null;
  const name = (pick(config.attrName) ?? pick('name') ?? pick('displayName') ?? '').trim() || email.split('@')[0];
  return { email, name: name.slice(0, 120) };
}

// ------------------------------------------------- find or provision user

export interface ProvisionResult {
  userId: string;
  provisioned: boolean;
}

/**
 * Find the user by address in THIS company, or provision one (member role, full
 * seat). Runs inside a tenant transaction for the company — RLS pins every row
 * to it, so an IdP for company A can never create or touch a user in company B.
 * A disabled or deleted account is refused (fails 'no_account'): SSO does not
 * resurrect it.
 */
export async function findOrProvisionUser(q: Q, orgId: string, id: { email: string; name: string }): Promise<ProvisionResult> {
  const email = id.email.toLowerCase();
  const [existing] = await q.query<{ id: string; status: string }>('select id, status from users where email = $1', [email]);
  if (existing) {
    if (existing.status === 'disabled' || existing.status === 'deleted') fail('no_account');
    if (existing.status === 'invited') await q.query(`update users set status = 'active' where id = $1`, [existing.id]);
    return { userId: existing.id, provisioned: false };
  }
  const [role] = await q.query<{ id: string }>(`select id from roles where key = 'member' and system`);
  const [u] = await q.query<{ id: string }>(
    `insert into users (org_id, email, name, role_id, seat, status) values ($1, $2, $3, $4, 'full', 'active') returning id`,
    [orgId, email, id.name || email, role.id],
  );
  await audit(q, { orgId, actorId: u.id, action: 'sso.provisioned', entity: 'user', entityId: u.id, meta: { via: 'sso' } });
  return { userId: u.id, provisioned: true };
}

// ---------------------------------------------------------- SAML replay

/**
 * One-time use of a SAML assertion, per company. Returns true when this is the
 * first time the assertion is seen (and records it), false on a replay. Uses
 * ON CONFLICT so a replay never aborts the transaction.
 */
export async function claimAssertion(q: Q, orgId: string, assertionXml: string, ttlMs = 60 * 60_000): Promise<boolean> {
  const key = await sha256Hex(assertionXml);
  await q.query(`delete from sso_seen_assertions where org_id = $1 and expires_at < now()`, [orgId]);
  const rows = await q.query(
    `insert into sso_seen_assertions (org_id, assertion_key, expires_at)
     values ($1, $2, now() + make_interval(secs => $3)) on conflict do nothing returning assertion_key`,
    [orgId, key, Math.round(ttlMs / 1000)],
  );
  return rows.length > 0;
}

// ============================================================ OIDC (OpenID)

/** PKCE: a high-entropy verifier and its S256 challenge. */
export async function pkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomToken(48);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(verifier)));
  return { verifier, challenge: base64url(digest) };
}

export function oidcAuthUrl(
  config: Pick<SsoAuthConfig, 'ssoUrl' | 'clientId'>,
  p: { redirectUri: string; state: string; nonce: string; challenge: string },
): string {
  const u = new URL(config.ssoUrl!);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', config.clientId!);
  u.searchParams.set('redirect_uri', p.redirectUri);
  u.searchParams.set('scope', 'openid email profile');
  u.searchParams.set('state', p.state);
  u.searchParams.set('nonce', p.nonce);
  u.searchParams.set('code_challenge', p.challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  return u.toString();
}

/** Exchange the authorization code for tokens at the IdP's token endpoint. */
export async function exchangeOidcCode(
  config: Pick<SsoAuthConfig, 'tokenUrl' | 'clientId' | 'clientSecret'>,
  p: { code: string; redirectUri: string; verifier: string },
  fetchFn: typeof fetch,
): Promise<{ id_token?: string } | null> {
  const res = await fetchFn(config.tokenUrl!, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: p.code,
      redirect_uri: p.redirectUri,
      client_id: config.clientId ?? '',
      client_secret: config.clientSecret ?? '',
      code_verifier: p.verifier,
    }).toString(),
  });
  if (!res.ok) return null;
  return (await res.json()) as { id_token?: string };
}

interface Jwk {
  kty?: string;
  kid?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
}

export async function fetchJwks(url: string, fetchFn: typeof fetch): Promise<Jwk[]> {
  const res = await fetchFn(url, { headers: { accept: 'application/json' } });
  if (!res.ok) return [];
  const body = (await res.json()) as { keys?: Jwk[] };
  return Array.isArray(body.keys) ? body.keys : [];
}

/**
 * Verify an id_token and return its claims, or null if anything fails.
 * Strictly: alg must be RS256 (no `none`, no HMAC — that blocks algorithm
 * confusion), the signature must verify against a JWKS key, and issuer,
 * audience, nonce and expiry must all check out.
 */
export async function verifyIdToken(
  idToken: string,
  keys: Jwk[],
  p: { issuer: string; audience: string; nonce: string; now: Date; clockSkewMs?: number },
): Promise<Record<string, unknown> | null> {
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  const [h, pl, sig] = parts;
  let header: { alg?: string; kid?: string };
  let claims: Record<string, unknown>;
  try {
    header = JSON.parse(dec.decode(fromBase64url(h)));
    claims = JSON.parse(dec.decode(fromBase64url(pl)));
  } catch {
    return null;
  }
  if (header.alg !== 'RS256') return null;
  const candidates = keys.filter((k) => (k.kty === 'RSA' || k.kty == null) && (!header.kid || !k.kid || k.kid === header.kid) && (!k.use || k.use === 'sig') && (!k.alg || k.alg === 'RS256'));
  let signed = false;
  const data = enc.encode(`${h}.${pl}`);
  let sigBytes: Uint8Array;
  try {
    sigBytes = fromBase64url(sig);
  } catch {
    return null;
  }
  for (const jwk of candidates) {
    if (!jwk.n || !jwk.e) continue;
    try {
      const key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
      if (await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, sigBytes as unknown as ArrayBuffer, data as unknown as ArrayBuffer)) {
        signed = true;
        break;
      }
    } catch {
      /* try the next key */
    }
  }
  if (!signed) return null;
  const skew = p.clockSkewMs ?? 60_000;
  if (String(claims.iss ?? '') !== p.issuer) return null;
  const aud = Array.isArray(claims.aud) ? claims.aud.map(String) : [String(claims.aud ?? '')];
  if (!aud.includes(p.audience)) return null;
  if (typeof claims.exp !== 'number' || claims.exp * 1000 + skew < p.now.getTime()) return null;
  if (typeof claims.nbf === 'number' && claims.nbf * 1000 - skew > p.now.getTime()) return null;
  if (String(claims.nonce ?? '') !== p.nonce) return null;
  return claims;
}
