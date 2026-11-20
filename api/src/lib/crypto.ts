// Web Crypto only, so the same code runs on Cloudflare Workers and Node 20+.
const enc = new TextEncoder();

/** A URL-safe random token from the platform's secure random source (sign-in links, keys, invitations). */
export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64url(buf);
}

/**
 * A numeric code of `n` digits from the secure random source (one-time sign-in codes).
 * The modulo bias of `x % 10` over 2^32 is negligible for codes this short and this short-lived.
 */
export function randomDigits(n = 6): string {
  const buf = new Uint32Array(n);
  crypto.getRandomValues(buf);
  return Array.from(buf, (x) => String(x % 10)).join('');
}

/** Bytes to unpadded base64url text, safe in URLs and cookies. */
export function base64url(buf: Uint8Array): string {
  let s = '';
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Unpadded base64url text back to bytes; throws on text that is not base64. */
export function fromBase64url(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/**
 * SHA-256 of a text as lowercase hex. Tokens are stored only as this hash, so a database copy holds no usable token.
 */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/**
 * Signs a JSON payload with HMAC-SHA256: `<body>.<signature>`, both base64url. Not encrypted: never put a secret in it.
 */
export async function sign(payload: object, secret: string): Promise<string> {
  const body = base64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body)));
  return `${body}.${base64url(sig)}`;
}

/**
 * Checks a token made by sign() and returns its payload, or null for a bad shape or a wrong signature.
 * Does not look at expiry: callers check their own `exp`. crypto.subtle.verify compares in constant time.
 */
export async function verify<T>(token: string, secret: string): Promise<T | null> {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  let sigBytes: Uint8Array<ArrayBuffer>;
  try {
    sigBytes = fromBase64url(sig);
  } catch {
    return null;
  }
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), sigBytes, enc.encode(body));
  if (!ok) return null;
  try {
    return JSON.parse(new TextDecoder().decode(fromBase64url(body))) as T;
  } catch {
    return null;
  }
}

/** HMAC-SHA256 of a message as hex: for checking signed webhooks from outside services. */
export async function hmacHex(secret: string, message: string): Promise<string> {
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(message)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison for signatures and codes. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Connector credentials at rest: AES-256-GCM with a key derived from the
// server's secrets key. Output: "v1.<iv>.<ciphertext>" (base64url).
const sealKeys = new Map<string, Promise<CryptoKey>>();
function sealKey(secret: string) {
  let k = sealKeys.get(secret);
  if (!k) {
    k = (async () => {
      const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'HKDF', false, ['deriveKey']);
      return crypto.subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('curahold'), info: enc.encode('connection-secrets') },
        base,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
      );
    })();
    sealKeys.set(secret, k);
  }
  return k;
}

/**
 * Encrypts a value with AES-GCM under a key derived from `secret` (stored connector credentials, ADR 0004).
 * Output `v1.<iv>.<data>`; the version prefix lets a future key or algorithm change read old values.
 */
export async function seal(value: unknown, secret: string): Promise<string> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const data = enc.encode(JSON.stringify(value));
  const out = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await sealKey(secret), data));
  return `v1.${base64url(iv)}.${base64url(out)}`;
}

/**
 * Decrypts a value made by seal(); null for an empty, unknown-version or tampered blob (never throws to the caller).
 */
export async function unseal<T = Record<string, unknown>>(blob: string | null, secret: string): Promise<T | null> {
  if (!blob) return null;
  const [v, iv, data] = blob.split('.');
  if (v !== 'v1' || !iv || !data) return null;
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64url(iv) }, await sealKey(secret), fromBase64url(data));
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch {
    return null;
  }
}
