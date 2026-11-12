// Google and Microsoft sign-in (OpenID Connect, authorization-code flow).
//
// Identity providers do not accept wildcard redirect addresses, so every
// company's sign-in comes back to one central address
// (https://app.curahold.com/api/oauth/callback). The signed `state` carries
// the company's subdomain; the callback turns the verified email into a
// two-minute one-time token and sends the browser back to
// https://<company>.curahold.com, where the normal token check (and the
// new-device code) takes over.
//
// The ID token is taken straight from the provider's token endpoint over
// TLS, which OpenID Connect Core §3.1.3.7 allows in place of a signature
// check; issuer, audience and expiry are still checked.

export type ProviderId = 'google' | 'microsoft';

export interface ProviderConfig {
  clientId: string;
  clientSecret: string;
}

interface ProviderMeta {
  authorize: string;
  token: string;
  issuer: (iss: string) => boolean;
  label: string;
}

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  google: {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    issuer: (iss) => iss === 'https://accounts.google.com' || iss === 'accounts.google.com',
    label: 'Google',
  },
  microsoft: {
    authorize: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    issuer: (iss) => /^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]{36}\/v2\.0$/.test(iss),
    label: 'Microsoft',
  },
};

export function isProvider(p: string): p is ProviderId {
  return p === 'google' || p === 'microsoft';
}

export function authorizeUrl(provider: ProviderId, cfg: ProviderConfig, redirectUri: string, state: string, nonce: string) {
  const u = new URL(PROVIDERS[provider].authorize);
  u.searchParams.set('client_id', cfg.clientId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', 'openid email profile');
  u.searchParams.set('state', state);
  u.searchParams.set('nonce', nonce);
  u.searchParams.set('prompt', 'select_account');
  return u.toString();
}

export interface VerifiedIdentity {
  email: string;
  name: string | null;
  /** The provider's own, stable id for this account (`sub`). */
  subject: string | null;
}

export async function exchangeCode(
  provider: ProviderId,
  cfg: ProviderConfig,
  code: string,
  redirectUri: string,
  nonce: string,
  fetchFn: typeof fetch,
  now: Date,
): Promise<VerifiedIdentity | null> {
  const res = await fetchFn(PROVIDERS[provider].token, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    }).toString(),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { id_token?: string };
  if (!body.id_token) return null;
  const claims = decodeJwtPayload(body.id_token);
  if (!claims) return null;
  if (!PROVIDERS[provider].issuer(String(claims.iss ?? ''))) return null;
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(cfg.clientId)) return null;
  if (typeof claims.exp !== 'number' || claims.exp * 1000 < now.getTime()) return null;
  if (claims.nonce !== nonce) return null;
  const email = String(claims.email ?? '').toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
  // Google tells us whether it verified the address; a false is refused.
  // Microsoft has no such claim — every new device still has to prove the
  // address with an emailed code, so a wrong claim cannot open an account.
  if (provider === 'google' && claims.email_verified !== true) return null;
  const subject = typeof claims.sub === 'string' && claims.sub ? claims.sub.slice(0, 255) : null;
  return { email, name: typeof claims.name === 'string' ? claims.name : null, subject };
}

function decodeJwtPayload(jwt: string): Record<string, any> | null {
  const part = jwt.split('.')[1];
  if (!part) return null;
  try {
    const pad = part.length % 4 === 0 ? '' : '='.repeat(4 - (part.length % 4));
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/') + pad);
    return JSON.parse(decodeURIComponent(escape(json)));
  } catch {
    return null;
  }
}
