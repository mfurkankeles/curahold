// Ways into the customer portal, chosen by the company: the email link and
// code, Google, Microsoft (confirmed once by email), passkeys (with a
// software authenticator here) and passwords — and what switching any of
// them off, or shortening the session, does to people already inside.
import { beforeAll, describe, expect, it } from 'vitest';
import { createPortalApp } from '../api/src/portal';
import { BASE, login, setup, type Client, type Env } from './helpers';

const PORTAL = 'curahold-portal.test';
const HOST = `acme.${PORTAL}`;
const ORIGIN = `https://${HOST}`;
let env: Env;
let portal: ReturnType<typeof createPortalApp>;
let ada: Client;
const SELIN = 'selin@quillfield.example';

class PortalClient {
  jar = new Map<string, string>();
  async req(method: string, path: string, body?: unknown) {
    const h: Record<string, string> = { 'x-curahold-portal': '1', 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Chrome/131.0' };
    if (this.jar.size) h.cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
    if (body !== undefined) h['content-type'] = 'application/json';
    const res = await portal.request(path.startsWith('http') ? path : `${ORIGIN}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const [k, v] = [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)];
      if (!v || /max-age=0/i.test(line)) this.jar.delete(k);
      else this.jar.set(k, v);
    }
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: res.status, json, headers: res.headers };
  }
  get = (p: string) => this.req('GET', p);
  post = (p: string, b: unknown = {}) => this.req('POST', p, b);
  put = (p: string, b: unknown) => this.req('PUT', p, b);
}

const auth = (over: Record<string, unknown> = {}) => ({ email: true, google: true, microsoft: true, passkey: true, password: true, sessionDays: 30, notify: true, ...over });
const lastMail = (to: string) => env.email.last(to);
const codeIn = (text: string) => /\b(\d{6})\b/.exec(text)?.[1] ?? '';
const tokenIn = (text: string, key = 'token') => new RegExp(`#${key}=([A-Za-z0-9_-]+)`).exec(text)?.[1] ?? '';

// ------------------------------------------------- a software passkey

const b64u = (b: Uint8Array) => Buffer.from(b).toString('base64url');
const fromB64u = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'));
const sha = async (b: Uint8Array | string) => new Uint8Array(await crypto.subtle.digest('SHA-256', (typeof b === 'string' ? new TextEncoder().encode(b) : b) as BufferSource));
const cat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) out.set(p, (i += p.length) - p.length);
  return out;
};
/** Just enough CBOR for an attestation object and a COSE key. */
function cbor(v: unknown): Uint8Array {
  const head = (major: number, n: number) =>
    n < 24 ? new Uint8Array([(major << 5) | n]) : n < 256 ? new Uint8Array([(major << 5) | 24, n]) : new Uint8Array([(major << 5) | 25, n >> 8, n & 255]);
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (typeof v === 'string') {
    const b = new TextEncoder().encode(v);
    return cat(head(3, b.length), b);
  }
  if (v instanceof Uint8Array) return cat(head(2, v.length), v);
  if (v instanceof Map) return cat(head(5, v.size), ...[...v].flatMap(([k, x]) => [cbor(k), cbor(x)]));
  throw new Error('cbor: unsupported');
}
function der(raw: Uint8Array) {
  const int = (b: Uint8Array) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    const t = b.slice(i);
    const v = t[0] & 0x80 ? cat(new Uint8Array([0]), t) : t;
    return cat(new Uint8Array([2, v.length]), v);
  };
  const body = cat(int(raw.slice(0, 32)), int(raw.slice(32)));
  return cat(new Uint8Array([0x30, body.length]), body);
}
class SoftKey {
  id = crypto.getRandomValues(new Uint8Array(16));
  counter = 0;
  constructor(private keys: CryptoKeyPair) {}
  static async make() {
    return new SoftKey((await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair);
  }
  async register(challenge: string, rpId = HOST, origin = ORIGIN) {
    const jwk = await crypto.subtle.exportKey('jwk', this.keys.publicKey);
    const cose = cbor(new Map<number, unknown>([[1, 2], [3, -7], [-1, 1], [-2, fromB64u(jwk.x!)], [-3, fromB64u(jwk.y!)]]));
    const len = new Uint8Array([this.id.length >> 8, this.id.length & 255]);
    const authData = cat(await sha(rpId), new Uint8Array([0x45]), new Uint8Array(4), new Uint8Array(16), len, this.id, cose);
    const att = cbor(new Map<string, unknown>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]));
    const client = new TextEncoder().encode(JSON.stringify({ type: 'webauthn.create', challenge, origin, crossOrigin: false }));
    return { id: b64u(this.id), rawId: b64u(this.id), type: 'public-key', response: { clientDataJSON: b64u(client), attestationObject: b64u(att), transports: ['internal'] }, clientExtensionResults: {} };
  }
  async sign(challenge: string, rpId = HOST, origin = ORIGIN) {
    this.counter += 1;
    const authData = cat(await sha(rpId), new Uint8Array([0x05]), new Uint8Array([0, 0, 0, this.counter]));
    const client = new TextEncoder().encode(JSON.stringify({ type: 'webauthn.get', challenge, origin, crossOrigin: false }));
    const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, this.keys.privateKey, cat(authData, await sha(client))));
    return { id: b64u(this.id), rawId: b64u(this.id), type: 'public-key', response: { clientDataJSON: b64u(client), authenticatorData: b64u(authData), signature: b64u(der(raw)) }, clientExtensionResults: {} };
  }
}

// ------------------------------------------------- Google / Microsoft

function fakeIdToken(claims: object) {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${enc({ alg: 'none' })}.${enc(claims)}.x`;
}
async function viaProvider(p: PortalClient, provider: 'google' | 'microsoft', claims: (nonce: string) => object) {
  const start = await p.get(`/papi/auth/oauth/${provider}/start`);
  expect(start.status).toBe(302);
  const loc = new URL(start.headers.get('location')!);
  expect(loc.searchParams.get('redirect_uri')).toBe(`https://app.${BASE}/api/oauth/callback`);
  const tokenUrl = provider === 'google' ? 'https://oauth2.googleapis.com/token' : 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
  env.fetchHolder.impl = async (url) => (url.startsWith(tokenUrl) ? Response.json({ id_token: fakeIdToken(claims(loc.searchParams.get('nonce')!)) }) : new Response('no', { status: 500 }));
  const cb = await env.app.request(`https://app.${BASE}/api/oauth/callback?code=abc&state=${encodeURIComponent(loc.searchParams.get('state')!)}`);
  expect(cb.status).toBe(302);
  return new URL(cb.headers.get('location')!);
}
const google = (email: string, sub = 'g-1') => (nonce: string) => ({ iss: 'https://accounts.google.com', aud: 'google-client', exp: Math.floor(Date.now() / 1000) + 600, email, email_verified: true, nonce, sub });
const microsoft = (email: string, sub = 'm-1') => (nonce: string) => ({
  iss: 'https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0',
  aud: 'ms-client',
  exp: Math.floor(Date.now() / 1000) + 600,
  email,
  nonce,
  sub,
});

/** As if an hour had passed since the last emails (five an hour is the limit, tested below). */
const later = () => env.db.system((q) => q.query(`update portal_tokens set created_at = created_at - interval '2 hours'`));

async function signInWithCode(email = SELIN) {
  await later();
  const p = new PortalClient();
  await p.post('/papi/auth/start', { email });
  await env.settle();
  const r = await p.post('/papi/auth/code', { email, code: codeIn(lastMail(email).subject) });
  expect(r.status).toBe(200);
  return p;
}
const setAuth = async (over: Record<string, unknown>) => expect((await ada.put('/api/portal/settings', { auth: auth(over) })).status).toBe(200);

beforeAll(async () => {
  env = await setup({ portalDomain: PORTAL, oauth: { google: { clientId: 'google-client', clientSecret: 'g' }, microsoft: { clientId: 'ms-client', clientSecret: 'm' } } });
  portal = createPortalApp(env.deps);
  ada = await login(env, 'acme', 'ada@demo.example');
  await ada.put('/api/portal/settings', { enabled: true });
  const quill = env.a.accounts['Quillfield Retail'];
  expect((await ada.post('/api/portal/users', { accountId: quill, email: SELIN, name: 'Selin Kaya' })).status).toBe(201);
  await env.settle();
});

describe('the company chooses', () => {
  it('starts with email, Google, Microsoft and passkeys on, passwords off, 30 days', async () => {
    const s = (await ada.get('/api/portal')).json;
    expect(s.auth).toEqual({ email: true, google: true, microsoft: true, passkey: true, password: false, sessionDays: 30, notify: true });
    expect(s.providers).toEqual({ google: true, microsoft: true });
    expect((await new PortalClient().get('/papi/org')).json.signIn).toEqual({ email: true, google: true, microsoft: true, passkey: true, password: false });
  });

  it('cannot leave nobody a way in', async () => {
    const r = await ada.put('/api/portal/settings', { auth: auth({ email: false, google: false, microsoft: false, password: false }) });
    expect(r.json.error).toBe('portal_no_method');
  });
});

describe('email: a link and a code', () => {
  it('the same email carries both; the code works on another device, five wrong tries spend it', async () => {
    const p = new PortalClient();
    await p.post('/papi/auth/start', { email: SELIN });
    await env.settle();
    const mail = lastMail(SELIN);
    const code = codeIn(mail.subject);
    expect(code).toMatch(/^\d{6}$/);
    expect(mail.text).toContain(code);
    expect(mail.text).toContain(`${ORIGIN}/auth#token=`);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect((await p.post('/papi/auth/code', { email: SELIN, code: wrong })).json.error).toBe('portal_bad_code');
    expect((await p.post('/papi/auth/code', { email: SELIN, code })).json.error).toBe('portal_bad_code');
    const again = await signInWithCode();
    expect((await again.get('/papi/me')).status).toBe(200);
  });

  it('sends at most five emails an hour to one address, and answers the same', async () => {
    await later();
    const p = new PortalClient();
    const before = env.email.sent.filter((m) => m.to === SELIN).length;
    for (let i = 0; i < 7; i++) expect((await p.post('/papi/auth/start', { email: SELIN })).json).toEqual({ ok: true });
    await env.settle();
    expect(env.email.sent.filter((m) => m.to === SELIN).length - before).toBe(5);
  });
});

describe('Google and Microsoft', () => {
  it('Google: only the browser that started it can finish it; then the account is linked', async () => {
    const p = new PortalClient();
    const back = await viaProvider(p, 'google', google(SELIN));
    expect(back.origin).toBe(ORIGIN);
    const token = tokenIn(back.hash);
    // Someone else's browser (no flow cookie) cannot use the hand-over.
    expect((await new PortalClient().post('/papi/auth/verify', { token })).json.error).toBe('invalid_token');
    expect((await p.post('/papi/auth/verify', { token })).status).toBe(200);
    expect((await p.get('/papi/account')).json.identities).toMatchObject([{ provider: 'google', email: SELIN }]);
    await env.settle();
    expect(lastMail(SELIN).text).toContain('Google');
    // The linked account still matches if its address changes at Google.
    const p2 = new PortalClient();
    const back2 = await viaProvider(p2, 'google', google('selin.kaya@quillfield.example'));
    expect((await p2.post('/papi/auth/verify', { token: tokenIn(back2.hash) })).status).toBe(200);
  });

  it('nobody without access gets in', async () => {
    const back = await viaProvider(new PortalClient(), 'google', google('stranger@quillfield.example', 'g-9'));
    expect(back.search).toContain('error=no_access');
  });

  it('Microsoft: the first time is confirmed with an emailed code, after that not', async () => {
    const p = new PortalClient();
    const back = await viaProvider(p, 'microsoft', microsoft(SELIN));
    const token = tokenIn(back.hash, 'confirm');
    expect(token).not.toBe('');
    await env.settle();
    const code = codeIn(lastMail(SELIN).subject);
    expect((await p.post('/papi/auth/verify', { token })).json.error).toBe('portal_bad_code');
    expect((await p.post('/papi/auth/verify', { token, code: code === '000000' ? '111111' : '000000' })).json.error).toBe('portal_bad_code');
    expect((await p.post('/papi/auth/verify', { token, code })).status).toBe(200);
    const again = await viaProvider(new PortalClient(), 'microsoft', microsoft(SELIN));
    expect(tokenIn(again.hash)).not.toBe('');
  });

  it('switched off, a provider is neither offered nor accepted', async () => {
    await setAuth({ google: false });
    expect((await new PortalClient().get('/papi/org')).json.signIn.google).toBe(false);
    const start = await new PortalClient().get('/papi/auth/oauth/google/start');
    expect(start.headers.get('location')).toBe('/?error=method_off');
    await setAuth({});
  });
});

describe('passwords', () => {
  let signedIn: PortalClient;
  it('off by default; on, someone signed in sets one (a weak one is refused)', async () => {
    await setAuth({ password: false });
    signedIn = await signInWithCode();
    expect((await signedIn.put('/papi/account/password', { password: 'long enough password' })).json.error).toBe('portal_method_off');
    await setAuth({ password: true });
    expect((await signedIn.put('/papi/account/password', { password: 'short' })).json.error).toBe('portal_weak_password');
    expect((await signedIn.put('/papi/account/password', { password: 'selin-is-my-name' })).json.error).toBe('portal_weak_password');
    expect((await signedIn.put('/papi/account/password', { password: 'Mavi kuş 2026 sabah' })).status).toBe(200);
    // Changing it needs the current one.
    expect((await signedIn.put('/papi/account/password', { password: 'another long one 7' })).json.error).toBe('portal_bad_password');
  });

  it('signs in; five wrong tries lock it; an unknown address answers the same', async () => {
    const p = new PortalClient();
    expect((await p.post('/papi/auth/password', { email: SELIN, password: 'Mavi kuş 2026 sabah' })).status).toBe(200);
    expect((await p.get('/papi/me')).status).toBe(200);
    expect((await p.post('/papi/auth/password', { email: 'nobody@quillfield.example', password: 'whatever it is' })).json.error).toBe('portal_bad_password');
    for (let i = 0; i < 5; i++) expect((await p.post('/papi/auth/password', { email: SELIN, password: 'wrong guess ' + i })).json.error).toBe('portal_bad_password');
    const locked = await p.post('/papi/auth/password', { email: SELIN, password: 'Mavi kuş 2026 sabah' });
    expect(locked.status).toBe(429);
  });

  it('a forgotten password is reset by email, which also lifts the lock', async () => {
    const p = new PortalClient();
    await p.post('/papi/auth/forgot', { email: SELIN });
    await env.settle();
    const token = tokenIn(lastMail(SELIN).text, 'reset');
    expect((await p.post('/papi/auth/reset', { token, password: 'Yeni ve uzun parola 9' })).status).toBe(200);
    expect((await p.post('/papi/auth/reset', { token, password: 'Yeni ve uzun parola 9' })).json.error).toBe('invalid_token');
    expect((await new PortalClient().post('/papi/auth/password', { email: SELIN, password: 'Yeni ve uzun parola 9' })).status).toBe(200);
  });
});

describe('passkeys', () => {
  const key = { current: null as SoftKey | null };
  it('added after signing in, then used to sign in', async () => {
    key.current = await SoftKey.make();
    const p = await signInWithCode();
    const opts = (await p.post('/papi/account/passkeys/options')).json;
    expect(opts.options.rp.id).toBe(HOST);
    const added = await p.post('/papi/account/passkeys', { challengeId: opts.challengeId, response: await key.current.register(opts.options.challenge), name: 'MacBook' });
    expect(added.status).toBe(201);
    expect((await p.get('/papi/account')).json.passkeys).toMatchObject([{ name: 'MacBook' }]);

    const fresh = new PortalClient();
    const o = (await fresh.post('/papi/auth/passkey/options')).json;
    const r = await fresh.post('/papi/auth/passkey', { challengeId: o.challengeId, response: await key.current.sign(o.options.challenge) });
    expect(r.status).toBe(200);
    expect((await fresh.get('/papi/me')).json.user.email).toBe(SELIN);
    // A challenge works once.
    expect((await fresh.post('/papi/auth/passkey', { challengeId: o.challengeId, response: await key.current.sign(o.options.challenge) })).json.error).toBe('portal_passkey_failed');
  });

  it('refuses a passkey made for another address, or a different key', async () => {
    const p = new PortalClient();
    const o = (await p.post('/papi/auth/passkey/options')).json;
    const phishing = await key.current!.sign(o.options.challenge, 'acme.evil.example', 'https://acme.evil.example');
    expect((await p.post('/papi/auth/passkey', { challengeId: o.challengeId, response: phishing })).json.error).toBe('portal_passkey_failed');
    const other = await SoftKey.make();
    const o2 = (await p.post('/papi/auth/passkey/options')).json;
    const forged = await other.sign(o2.options.challenge);
    forged.id = forged.rawId = b64u(key.current!.id);
    expect((await p.post('/papi/auth/passkey', { challengeId: o2.challengeId, response: forged })).json.error).toBe('portal_passkey_failed');
  });
});

describe('changing the rules ends what they no longer allow', () => {
  it('switching email off ends the sessions opened by email, not the others', async () => {
    const byCode = await signInWithCode();
    const byPassword = new PortalClient();
    await byPassword.post('/papi/auth/password', { email: SELIN, password: 'Yeni ve uzun parola 9' });
    await setAuth({ email: false });
    expect((await byCode.get('/papi/me')).status).toBe(401);
    expect((await byPassword.get('/papi/me')).status).toBe(200);
    expect((await byCode.post('/papi/auth/start', { email: SELIN })).json.error).toBe('portal_method_off');
    await setAuth({});
  });

  it('a shorter session length ends older sessions', async () => {
    const p = await signInWithCode();
    await env.db.system((q) => q.query(`update portal_sessions set created_at = now() - interval '10 days' where revoked_at is null`));
    expect((await p.get('/papi/me')).status).toBe(200);
    await setAuth({ sessionDays: 7 });
    expect((await p.get('/papi/me')).status).toBe(401);
    await setAuth({});
  });

  it('signing out everywhere ends every session of the person', async () => {
    const a = await signInWithCode();
    const b = await signInWithCode();
    expect((await a.post('/papi/account/signout-all')).status).toBe(200);
    expect((await b.get('/papi/me')).status).toBe(401);
  });

  it('none of the sign-in tables can be read from the app or the portal role', async () => {
    for (const table of ['portal_passwords', 'portal_passkeys', 'portal_identities', 'portal_tokens', 'portal_sessions']) {
      await expect(env.db.tenant({ orgId: env.a.orgId, userId: env.a.ids.ada }, (q) => q.query(`select * from ${table}`))).rejects.toThrow(/permission denied/);
      await expect(env.db.portal({ orgId: env.a.orgId, portalUserId: null }, (q) => q.query(`select * from ${table}`))).rejects.toThrow(/permission denied/);
    }
  });
});
