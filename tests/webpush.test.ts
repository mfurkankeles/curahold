// Web Push by hand (api/src/lib/webpush.ts): the encryption reproduces the
// worked example of RFC 8291 (Appendix A) byte for byte, a browser-side
// decryption reads what we send, the VAPID token verifies with the public
// key and carries the right claims, and push service answers map to
// sent / gone / retry.
import { describe, expect, it } from 'vitest';
import { b64u, encryptPush, MAX_PUSH_BYTES, newVapidKeys, sendPush, senderKeysFrom, unb64u, vapidToken, vapidValid } from '../api/src/lib/webpush';

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const buf = (u: Uint8Array) => u.slice().buffer as ArrayBuffer;

// RFC 8291 Appendix A.
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

const jwk = (pub: Uint8Array, d?: string): JsonWebKey => ({ kty: 'EC', crv: 'P-256', x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33)), ...(d ? { d } : {}) });
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: string | Uint8Array, n: number) {
  const k = await subtle.importKey('raw', buf(ikm), 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: buf(salt), info: buf(typeof info === 'string' ? enc.encode(info) : info) }, k, n * 8));
}

/** What the browser does with a push body: the receiving side of RFC 8291, written apart from the sender. */
async function decrypt(body: Uint8Array, uaPublic: Uint8Array, uaPrivate: string, auth: Uint8Array): Promise<string> {
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const priv = await subtle.importKey('jwk', jwk(uaPublic, uaPrivate), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const pub = await subtle.importKey('jwk', jwk(asPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256));
  const info = new Uint8Array([...enc.encode('WebPush: info\0'), ...uaPublic, ...asPublic]);
  const ikm = await hkdf(auth, shared, info, 32);
  const cek = await subtle.importKey('raw', buf(await hkdf(salt, ikm, 'Content-Encoding: aes128gcm\0', 16)), 'AES-GCM', false, ['decrypt']);
  const nonce = await hkdf(salt, ikm, 'Content-Encoding: nonce\0', 12);
  const plain = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: buf(nonce) }, cek, buf(body.slice(21 + idlen))));
  expect(plain[plain.length - 1]).toBe(2);
  return new TextDecoder().decode(plain.slice(0, -1));
}

/** A browser of our own: a key pair and an auth secret, as PushManager.subscribe() gives. */
async function browser() {
  const pair = (await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const pub = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
  const d = (await subtle.exportKey('jwk', pair.privateKey)).d!;
  return { pub, d, auth: globalThis.crypto.getRandomValues(new Uint8Array(16)) };
}

describe('Web Push encryption (RFC 8291)', () => {
  it('reproduces the RFC example byte for byte', async () => {
    const sender = await senderKeysFrom(unb64u(RFC.asPublic), unb64u(RFC.asPrivate));
    const body = await encryptPush(enc.encode(RFC.plaintext), unb64u(RFC.uaPublic), unb64u(RFC.auth), { salt: unb64u(RFC.salt), sender });
    expect(b64u(body)).toBe(RFC.body);
    expect(await decrypt(body, unb64u(RFC.uaPublic), RFC.uaPrivate, unb64u(RFC.auth))).toBe(RFC.plaintext);
  });

  it('a browser reads what we send; every message has its own salt and key', async () => {
    const b = await browser();
    const msg = JSON.stringify({ title: 'Blocking help request', body: 'HR-000042 · Acme' });
    const one = await encryptPush(enc.encode(msg), b.pub, b.auth);
    const two = await encryptPush(enc.encode(msg), b.pub, b.auth);
    expect(await decrypt(one, b.pub, b.d, b.auth)).toBe(msg);
    expect(b64u(one.slice(0, 16))).not.toBe(b64u(two.slice(0, 16)));
    expect(b64u(one.slice(21, 86))).not.toBe(b64u(two.slice(21, 86)));
    expect(one.length).toBeLessThanOrEqual(4096);
  });

  it('refuses what cannot be one record, a short auth secret or a malformed key', async () => {
    const b = await browser();
    await expect(encryptPush(new Uint8Array(MAX_PUSH_BYTES + 1), b.pub, b.auth)).rejects.toThrow();
    await expect(encryptPush(enc.encode('x'), b.pub, b.auth.slice(0, 8))).rejects.toThrow();
    await expect(encryptPush(enc.encode('x'), b.pub.slice(1), b.auth)).rejects.toThrow();
    const full = await encryptPush(new Uint8Array(MAX_PUSH_BYTES), b.pub, b.auth);
    expect(full.length).toBeLessThanOrEqual(4096);
  });
});

describe('VAPID (RFC 8292)', () => {
  it('signs a token the public key verifies, for the push service origin, twelve hours', async () => {
    const keys = await newVapidKeys();
    expect(await vapidValid(keys)).toBe(true);
    const now = Date.UTC(2026, 10, 23, 6, 0, 0);
    const t = await vapidToken('https://push.example.net/send/abc?x=1', { ...keys, subject: 'mailto:ada@demo.example' }, now);
    const [h, c, s] = t.split('.');
    expect(JSON.parse(new TextDecoder().decode(unb64u(h)))).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(JSON.parse(new TextDecoder().decode(unb64u(c)))).toEqual({ aud: 'https://push.example.net', exp: now / 1000 + 43200, sub: 'mailto:ada@demo.example' });
    const ver = await subtle.importKey('raw', buf(unb64u(keys.publicKey)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    expect(unb64u(s).length).toBe(64);
    expect(await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, ver, buf(unb64u(s)), buf(enc.encode(`${h}.${c}`)))).toBe(true);
  });

  it('a mismatched or malformed key pair is not valid', async () => {
    const a = await newVapidKeys();
    const b = await newVapidKeys();
    expect(await vapidValid({ publicKey: a.publicKey, privateKey: b.privateKey })).toBe(false);
    expect(await vapidValid({ publicKey: 'nope', privateKey: a.privateKey })).toBe(false);
  });
});

describe('sending', () => {
  it('posts the encrypted body with the right headers, and reads the answer', async () => {
    const keys = { ...(await newVapidKeys()), subject: 'mailto:ada@demo.example' };
    const b = await browser();
    const to = { endpoint: 'https://push.example.net/send/abc', p256dh: b64u(b.pub), auth: b64u(b.auth) };
    let seen: { url: string; init: RequestInit } | null = null;
    const answer = (status: number) => (async (url: any, init: any) => ((seen = { url: String(url), init }), new Response(status === 201 ? null : 'gone', { status }))) as typeof fetch;
    expect(await sendPush(answer(201), keys, to, { title: 'T', body: 'B' }, { urgency: 'high', ttl: 600 })).toEqual({ state: 'sent' });
    const h = seen!.init.headers as Record<string, string>;
    expect(h['content-encoding']).toBe('aes128gcm');
    expect(h.ttl).toBe('600');
    expect(h.urgency).toBe('high');
    expect(h.authorization).toMatch(new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${keys.publicKey}$`));
    expect(JSON.parse(await decrypt(new Uint8Array(seen!.init.body as ArrayBuffer), b.pub, b.d, b.auth))).toEqual({ title: 'T', body: 'B' });
    expect((await sendPush(answer(410), keys, to, {})).state).toBe('gone');
    expect((await sendPush(answer(404), keys, to, {})).state).toBe('gone');
    expect((await sendPush(answer(429), keys, to, {})).state).toBe('retry');
    expect((await sendPush(answer(503), keys, to, {})).state).toBe('retry');
    expect((await sendPush(answer(400), keys, to, {})).state).toBe('failed');
    expect((await sendPush(answer(201), keys, { ...to, endpoint: 'http://push.example.net/x' }, {})).state).toBe('failed');
  });
});
