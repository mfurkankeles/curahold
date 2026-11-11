// RS256 tokens: checking ones that Microsoft (Bot Framework) and Google
// (Chat) send to us, and signing the one a Google service account uses to
// get an access token. Web Crypto only, so it runs on Workers and Node.
import { base64url, fromBase64url } from './crypto';

const enc = new TextEncoder();
const dec = new TextDecoder();

export interface JwtClaims {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  [k: string]: unknown;
}

export function decodeJwt(token: string): { header: Record<string, any>; claims: JwtClaims } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return { header: JSON.parse(dec.decode(fromBase64url(parts[0]))), claims: JSON.parse(dec.decode(fromBase64url(parts[1]))) };
  } catch {
    return null;
  }
}

interface Jwk {
  kid?: string;
  kty: string;
  n?: string;
  e?: string;
  [k: string]: unknown;
}

const jwksCache = new Map<string, { at: number; keys: Jwk[] }>();
const JWKS_TTL_MS = 6 * 3600_000;

async function loadJwks(url: string, fetchFn: typeof fetch, now: number, force = false): Promise<Jwk[]> {
  const hit = jwksCache.get(url);
  if (hit && !force && now - hit.at < JWKS_TTL_MS) return hit.keys;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`jwks ${res.status}`);
  const body = (await res.json()) as { keys?: Jwk[] };
  const keys = (body.keys ?? []).filter((k) => k.kty === 'RSA');
  jwksCache.set(url, { at: now, keys });
  return keys;
}

export interface VerifyOptions {
  jwksUrl: string;
  issuers: string[];
  audience: string;
  fetch: typeof fetch;
  now: Date;
  clockSkewSec?: number;
}

/** Returns the claims when the signature, issuer, audience and time window all check out. */
export async function verifyRs256(token: string, o: VerifyOptions): Promise<JwtClaims | null> {
  const decoded = decodeJwt(token);
  if (!decoded || decoded.header.alg !== 'RS256') return null;
  const nowMs = o.now.getTime();
  let keys = await loadJwks(o.jwksUrl, o.fetch, nowMs);
  let jwk = keys.find((k) => k.kid === decoded.header.kid);
  if (!jwk) {
    // Keys rotate: refetch once before giving up.
    keys = await loadJwks(o.jwksUrl, o.fetch, nowMs, true);
    jwk = keys.find((k) => k.kid === decoded.header.kid);
  }
  if (!jwk) return null;
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const [h, p, s] = token.split('.');
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromBase64url(s), enc.encode(`${h}.${p}`));
  if (!ok) return null;
  const c = decoded.claims;
  const skew = o.clockSkewSec ?? 300;
  const nowSec = nowMs / 1000;
  if (typeof c.exp !== 'number' || c.exp + skew < nowSec) return null;
  if (typeof c.nbf === 'number' && c.nbf - skew > nowSec) return null;
  if (!c.iss || !o.issuers.includes(c.iss)) return null;
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes(o.audience)) return null;
  return c;
}

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

/** Signs claims with a PKCS#8 private key (PEM), e.g. a Google service account key. */
export async function signRs256(claims: JwtClaims, privateKeyPem: string, kid?: string): Promise<string> {
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(privateKeyPem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const header = base64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT', ...(kid ? { kid } : {}) })));
  const payload = base64url(enc.encode(JSON.stringify(claims)));
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(`${header}.${payload}`)));
  return `${header}.${payload}.${base64url(sig)}`;
}

export const _testing = { clearJwks: () => jwksCache.clear() };
