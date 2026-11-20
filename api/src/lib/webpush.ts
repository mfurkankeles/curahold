// Web Push to the owner's phones, with no library: the free push services every
// browser has (RFC 8030), messages encrypted for the one browser that asked for
// them (RFC 8291, "aes128gcm" from RFC 8188) and the server named by a signed
// VAPID token (RFC 8292). Everything is WebCrypto (ECDH and ECDSA on P-256,
// HKDF-SHA-256, AES-128-GCM), the same in Workers and Node, so no runtime
// dependency is added (CLAUDE.md). tests/webpush.test.ts checks the encryption
// against the RFC's own worked example and the token against its public key.
//
// Why encrypt by hand matters: the push service (the browser maker's) carries
// the message but cannot read it; only the owner's browser holds the key.

const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder();

/** base64url without padding (RFC 4648 §5), as Web Push and JWS use it. */
export function b64u(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
/** Reads base64url (padding optional). */
export function unb64u(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) (out.set(p, o), (o += p.length));
  return out;
};
const buf = (u: Uint8Array): ArrayBuffer => u.slice().buffer as ArrayBuffer;

/** A P-256 key as a JWK, from its raw uncompressed public point (65 bytes) and, for a private key, d (32 bytes). */
function jwkOf(publicRaw: Uint8Array, d?: Uint8Array): JsonWebKey {
  if (publicRaw.length !== 65 || publicRaw[0] !== 4) throw new Error('a P-256 public key is 65 bytes, starting with 4');
  return { kty: 'EC', crv: 'P-256', x: b64u(publicRaw.slice(1, 33)), y: b64u(publicRaw.slice(33, 65)), ...(d ? { d: b64u(d) } : {}), ext: true };
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await subtle().importKey('raw', buf(ikm), 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await subtle().deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: buf(salt), info: buf(info) }, key, bytes * 8));
}

/** A server key pair for one message (or a fixed one, for the RFC's example). */
export interface SenderKeys {
  publicRaw: Uint8Array;
  privateKey: CryptoKey;
}
/** A fresh ECDH key pair for one message: every message gets its own (RFC 8291 §2). */
export async function senderKeys(): Promise<SenderKeys> {
  const pair = (await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  return { publicRaw: new Uint8Array(await subtle().exportKey('raw', pair.publicKey)), privateKey: pair.privateKey };
}
/** A fixed sender key pair from raw bytes (tests reproduce the RFC's example with it). */
export async function senderKeysFrom(publicRaw: Uint8Array, d: Uint8Array): Promise<SenderKeys> {
  return { publicRaw, privateKey: await subtle().importKey('jwk', jwkOf(publicRaw, d), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']) };
}

/** Records are one record here: the push services take at most 4096 bytes of body, so a message is always one. */
const RECORD_SIZE = 4096;
/** The longest message accepted: one record holds 4096 − 86 header − 16 tag − 1 delimiter = 3993 bytes; kept well under. */
export const MAX_PUSH_BYTES = 3000;

/**
 * Encrypts one message for one browser (RFC 8291 §3.4, content coding aes128gcm): an ECDH secret between a fresh
 * sender key and the browser's key, mixed with the browser's auth secret, gives the content key and nonce. The
 * body is salt ‖ record size ‖ key id length ‖ sender public key ‖ ciphertext.
 */
export async function encryptPush(plaintext: Uint8Array, uaPublic: Uint8Array, authSecret: Uint8Array, opts: { salt?: Uint8Array; sender?: SenderKeys } = {}): Promise<Uint8Array> {
  if (plaintext.length > MAX_PUSH_BYTES) throw new Error('push message too long');
  if (authSecret.length !== 16) throw new Error('the auth secret is 16 bytes');
  const salt = opts.salt ?? globalThis.crypto.getRandomValues(new Uint8Array(16));
  const sender = opts.sender ?? (await senderKeys());
  const ua = await subtle().importKey('jwk', jwkOf(uaPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await subtle().deriveBits({ name: 'ECDH', public: ua }, sender.privateKey, 256));
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, sender.publicRaw);
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await subtle().importKey('raw', buf(cek), 'AES-GCM', false, ['encrypt']);
  // 0x02 marks the last (and only) record; no padding beyond it.
  const sealed = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: buf(nonce) }, key, buf(concat(plaintext, new Uint8Array([2])))));
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = sender.publicRaw.length;
  return concat(header, sender.publicRaw, sealed);
}

/** The server's VAPID key pair, as configured (base64url raw public point, base64url 32-byte private scalar). */
export interface Vapid {
  publicKey: string;
  privateKey: string;
  /** Who runs the server, for the push service to write to: "mailto:…" or an https address. */
  subject: string;
}

/**
 * The signed token that names this server to a push service (RFC 8292): ES256 over the push service's origin,
 * twelve hours' validity and the contact subject. WebCrypto's ECDSA signature is already r ‖ s, as JWS wants it.
 */
export async function vapidToken(endpoint: string, v: Vapid, now = Date.now()): Promise<string> {
  const key = await subtle().importKey('jwk', jwkOf(unb64u(v.publicKey), unb64u(v.privateKey)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: v.subject })));
  const sig = new Uint8Array(await subtle().sign({ name: 'ECDSA', hash: 'SHA-256' }, key, buf(enc.encode(`${head}.${claims}`))));
  return `${head}.${claims}.${b64u(sig)}`;
}

/** A new VAPID key pair (scripts/plan/vapid-keys.ts prints one for the environment). */
export async function newVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = (await subtle().generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const jwk = await subtle().exportKey('jwk', pair.privateKey);
  return { publicKey: b64u(new Uint8Array(await subtle().exportKey('raw', pair.publicKey))), privateKey: jwk.d! };
}

/** Checks a configured key pair belongs together (signs and verifies once); false for anything malformed. */
export async function vapidValid(v: Pick<Vapid, 'publicKey' | 'privateKey'>): Promise<boolean> {
  try {
    const pub = unb64u(v.publicKey);
    const priv = await subtle().importKey('jwk', jwkOf(pub, unb64u(v.privateKey)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const ver = await subtle().importKey('raw', buf(pub), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const data = buf(enc.encode('check'));
    const sig = await subtle().sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, data);
    return await subtle().verify({ name: 'ECDSA', hash: 'SHA-256' }, ver, sig, data);
  } catch {
    return false;
  }
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}
/** What a push service said: sent, gone for good (the browser unsubscribed: forget the device), or try later. */
export type PushOutcome = { state: 'sent' } | { state: 'gone'; status: number } | { state: 'retry' | 'failed'; status: number; error: string };

/**
 * Sends one encrypted message to one browser through its push service. `ttl` is how long the service may hold it
 * for a phone that is off; `urgency` lets a phone on battery saver wake for what matters (RFC 8030 §5.3).
 */
export async function sendPush(
  fetcher: typeof fetch,
  v: Vapid,
  to: PushTarget,
  message: Record<string, unknown>,
  opts: { ttl?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high'; now?: number } = {},
): Promise<PushOutcome> {
  if (!/^https:\/\//.test(to.endpoint)) return { state: 'failed', status: 0, error: 'endpoint is not https' };
  const body = await encryptPush(enc.encode(JSON.stringify(message)), unb64u(to.p256dh), unb64u(to.auth));
  const res = await fetcher(to.endpoint, {
    method: 'POST',
    headers: {
      authorization: `vapid t=${await vapidToken(to.endpoint, v, opts.now)}, k=${v.publicKey}`,
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: String(opts.ttl ?? 24 * 3600),
      urgency: opts.urgency ?? 'normal',
    },
    body: buf(body),
  });
  if (res.status >= 200 && res.status < 300) return { state: 'sent' };
  if (res.status === 404 || res.status === 410) return { state: 'gone', status: res.status };
  const error = (await res.text().catch(() => '')).slice(0, 200) || `status ${res.status}`;
  return { state: res.status === 429 || res.status >= 500 ? 'retry' : 'failed', status: res.status, error };
}
