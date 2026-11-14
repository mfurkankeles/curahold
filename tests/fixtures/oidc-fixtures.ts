// Test-only OIDC IdP: an RSA keypair, its JWKS, and an id_token signer, all via
// Web Crypto (the same primitives the verifier uses). Invented demo data only.
import { base64url } from '../../api/src/lib/crypto';

const enc = new TextEncoder();
const b64 = (o: unknown) => base64url(enc.encode(JSON.stringify(o)));

export interface DemoOidp {
  issuer: string;
  clientId: string;
  jwks: { keys: Record<string, unknown>[] };
  sign(claims: Record<string, unknown>, opts?: { alg?: string; kid?: string; key?: CryptoKey }): Promise<string>;
  /** A valid baseline claim set (overridable). */
  claims(over?: Record<string, unknown>): Record<string, unknown>;
}

export async function newDemoOidp(opts: { issuer?: string; clientId?: string } = {}): Promise<DemoOidp> {
  const issuer = opts.issuer ?? 'https://oidc.demo.example';
  const clientId = opts.clientId ?? 'curahold-demo-client';
  const kp = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const pub = (await crypto.subtle.exportKey('jwk', kp.publicKey)) as Record<string, unknown>;
  const jwks = { keys: [{ ...pub, kid: 'demo-key-1', use: 'sig', alg: 'RS256' }] };

  const claims = (over: Record<string, unknown> = {}) => {
    const nowSec = Math.floor(Date.now() / 1000);
    return { iss: issuer, aud: clientId, iat: nowSec, exp: nowSec + 300, email: 'user@demo.example', name: 'Demo User', email_verified: true, sub: 'demo-subject-1', ...over };
  };

  async function sign(c: Record<string, unknown>, o: { alg?: string; kid?: string; key?: CryptoKey } = {}): Promise<string> {
    const header = { alg: o.alg ?? 'RS256', kid: o.kid ?? 'demo-key-1', typ: 'JWT' };
    const input = `${b64(header)}.${b64(c)}`;
    if (o.alg === 'none') return `${input}.`;
    const sig = new Uint8Array(await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, o.key ?? kp.privateKey, enc.encode(input)));
    return `${input}.${base64url(sig)}`;
  }

  return { issuer, clientId, jwks, sign, claims };
}
