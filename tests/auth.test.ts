// Sign-in, the device limit ("Dengeli": 2 devices, oldest signed out) and
// the new-device code for provider sign-ins.
import { beforeAll, describe, expect, it } from 'vitest';
import { Client, login, newDevice, setup, type Env } from './helpers';

let env: Env;
beforeAll(async () => {
  env = await setup();
});

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const fakeIdToken = (claims: object) => `${b64({ alg: 'RS256' })}.${b64(claims)}.sig`;

describe('email link sign-in', () => {
  it('signs in with a one-time link and opens a session', async () => {
    const c = new Client(env, 'acme');
    const start = await c.post('/api/auth/start', { email: 'Lena@Demo.Example' });
    expect(start.status).toBe(200);
    const mail = env.email.last('lena@demo.example');
    expect(mail.subject).toContain('Demo Company');
    expect(mail.text).toContain(`https://acme.curahold.test/auth/verify#token=${start.json.devToken}`);
    const v = await c.post('/api/auth/verify', { token: start.json.devToken, deviceId: c.device, deviceLabel: 'Chrome on Mac' });
    expect(v.json.status).toBe('ok');
    const me = await c.get('/api/me');
    expect(me.json.user.name).toBe('Lena Fischer');
    expect(me.json.org.slug).toBe('acme');
    // A link works once.
    const again = await new Client(env, 'acme').post('/api/auth/verify', { token: start.json.devToken, deviceId: newDevice() });
    expect(again.json.error).toBe('invalid_token');
  });

  it('answers the same for an unknown address and sends nothing', async () => {
    const before = env.email.sent.length;
    const r = await new Client(env, 'acme').post('/api/auth/start', { email: 'stranger@elsewhere.example' });
    expect(r.status).toBe(200);
    expect(r.json.devToken).toBeUndefined();
    expect(env.email.sent.length).toBe(before);
  });

  it('a link for one company does not open another', async () => {
    const start = await new Client(env, 'acme').post('/api/auth/start', { email: 'mert@demo.example' });
    const r = await new Client(env, 'beta').post('/api/auth/verify', { token: start.json.devToken, deviceId: newDevice() });
    expect(r.json.error).toBe('invalid_token');
  });

  it('an expired link is refused', async () => {
    const c = new Client(env, 'acme');
    const start = await c.post('/api/auth/start', { email: 'omar@demo.example' });
    await env.db.system((q) => q.query(`update login_tokens set expires_at = now() - interval '1 minute' where email = 'omar@demo.example'`));
    const r = await c.post('/api/auth/verify', { token: start.json.devToken, deviceId: c.device });
    expect(r.json.error).toBe('invalid_token');
  });

  it('limits how many links can be requested', async () => {
    const c = new Client(env, 'beta');
    for (let i = 0; i < 5; i++) expect((await c.post('/api/auth/start', { email: 'zeynep@demo.example' })).status).toBe(200);
    const r = await c.post('/api/auth/start', { email: 'zeynep@demo.example' });
    expect(r.status).toBe(429);
    expect(r.json.message).toMatch(/Çok fazla deneme/); // beta's language is Turkish
  });

  it('refuses writes without the app header (request forgery)', async () => {
    const c = await login(env, 'acme', 'mert@demo.example');
    const res = await env.app.request('https://acme.curahold.test/api/tasks', {
      method: 'POST',
      headers: { cookie: c.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ boardId: env.a.boards.csBoard, title: 'x' }),
    });
    expect(res.status).toBe(403);
  });

  it('logout ends the session', async () => {
    const c = await login(env, 'acme', 'mert@demo.example');
    expect((await c.post('/api/auth/logout')).status).toBe(200);
    expect((await c.get('/api/me')).status).toBe(401);
  });

  it('an invited person becomes active on first sign-in', async () => {
    const admin = await login(env, 'acme', 'ada@demo.example');
    const roles = (await admin.get('/api/admin/roles')).json.roles;
    const member = roles.find((r: any) => r.key === 'member');
    const inv = await admin.post('/api/admin/users', { email: 'new.person@demo.example', name: 'New Person', roleId: member.id, seat: 'full' });
    expect(inv.status).toBe(201);
    expect(env.email.last('new.person@demo.example').subject).toMatch(/invited you/);
    const c = new Client(env, 'acme');
    const v = await c.post('/api/auth/verify', { token: inv.json.devToken, deviceId: c.device });
    expect(v.json.status).toBe('ok');
    const users = (await admin.get('/api/admin/users')).json.users;
    expect(users.find((u: any) => u.email === 'new.person@demo.example').status).toBe('active');
  });

  it('a disabled person is signed out everywhere', async () => {
    const admin = await login(env, 'acme', 'ada@demo.example');
    const lena = await login(env, 'acme', 'lena@demo.example');
    expect((await admin.patch(`/api/admin/users/${env.a.ids.lena}`, { status: 'disabled' })).status).toBe(200);
    expect((await lena.get('/api/me')).status).toBe(401);
    await admin.patch(`/api/admin/users/${env.a.ids.lena}`, { status: 'active' });
  });
});

describe('device limit (2 devices per seat)', () => {
  it('a third device signs out the least recently used one', async () => {
    const laptop = await login(env, 'beta', 'mert@demo.example');
    const phone = await login(env, 'beta', 'mert@demo.example');
    expect((await laptop.get('/api/me')).status).toBe(200);
    expect((await phone.get('/api/me')).status).toBe(200);

    const third = await login(env, 'beta', 'mert@demo.example');
    const kicked = await laptop.get('/api/me');
    expect(kicked.status).toBe(401);
    expect(kicked.json.error).toBe('session_evicted');
    expect((await phone.get('/api/me')).status).toBe(200);
    expect((await third.get('/api/me')).status).toBe(200);

    const sessions = (await third.get('/api/me/sessions')).json;
    expect(sessions.sessions).toHaveLength(2);
    expect(sessions.maxDevices).toBe(2);
    const log = await env.db.system((q) =>
      q.query(`select count(*)::int as n from audit_log where org_id = $1 and action = 'session.evicted'`, [env.b.orgId]),
    );
    expect(log[0].n).toBeGreaterThanOrEqual(1);
  });

  it('signing in again on the same device does not use another slot', async () => {
    const device = newDevice();
    await login(env, 'beta', 'lena@demo.example', device);
    await login(env, 'beta', 'lena@demo.example', device);
    const other = await login(env, 'beta', 'lena@demo.example');
    const list = (await other.get('/api/me/sessions')).json.sessions;
    expect(list).toHaveLength(2);
  });

  it('a session cookie copied to another device is refused', async () => {
    const c = await login(env, 'acme', 'omar@demo.example');
    const copy = new Client(env, 'acme');
    copy.cookie = c.cookie;
    const r = await copy.get('/api/me');
    expect(r.status).toBe(401);
    expect(r.json.error).toBe('device_mismatch');
  });

  it('a person can sign out one of their devices', async () => {
    const a1 = await login(env, 'acme', 'zeynep@demo.example');
    const a2 = await login(env, 'acme', 'zeynep@demo.example');
    const list = (await a1.get('/api/me/sessions')).json.sessions;
    const otherId = list.find((s: any) => !s.current).id;
    expect((await a1.del(`/api/me/sessions/${otherId}`)).status).toBe(200);
    expect((await a2.get('/api/me')).status).toBe(401);
  });
});

describe('Google sign-in', () => {
  function stubGoogle(claims: object) {
    env.fetchHolder.impl = async (url) => {
      if (url.startsWith('https://oauth2.googleapis.com/token')) return Response.json({ id_token: fakeIdToken(claims) });
      return new Response('unexpected', { status: 500 });
    };
  }

  async function startAndCallback(c: Client, claims: (nonce: string) => object) {
    const start = await env.app.request(`https://acme.curahold.test/api/auth/oauth/google/start?device=${c.device}`);
    expect(start.status).toBe(302);
    const loc = new URL(start.headers.get('location')!);
    expect(loc.origin).toBe('https://accounts.google.com');
    expect(loc.searchParams.get('redirect_uri')).toBe('https://app.curahold.test/api/oauth/callback');
    const nonce = loc.searchParams.get('nonce')!;
    stubGoogle(claims(nonce));
    const cb = await env.app.request(
      `https://app.curahold.test/api/oauth/callback?code=abc&state=${encodeURIComponent(loc.searchParams.get('state')!)}`,
    );
    expect(cb.status).toBe(302);
    return new URL(cb.headers.get('location')!);
  }

  const good = (email: string) => (nonce: string) => ({
    iss: 'https://accounts.google.com',
    aud: 'google-client',
    exp: Math.floor(Date.now() / 1000) + 600,
    email,
    email_verified: true,
    nonce,
  });

  it('a new device must enter the emailed code, a known device does not', async () => {
    const c = new Client(env, 'acme');
    const back = await startAndCallback(c, good('lena@demo.example'));
    expect(back.origin).toBe('https://acme.curahold.test');
    const token = new URLSearchParams(back.hash.slice(1)).get('token')!;
    const v = await c.post('/api/auth/verify', { token, deviceId: c.device, deviceLabel: 'Firefox' });
    expect(v.json.status).toBe('device_code');
    expect(env.email.last('lena@demo.example').subject).toContain(v.json.devCode);

    const wrong = await c.post('/api/auth/device', { challenge: v.json.challenge, code: v.json.devCode === '000000' ? '111111' : '000000', deviceId: c.device });
    expect(wrong.json.error).toBe('invalid_token');
    const ok = await c.post('/api/auth/device', { challenge: v.json.challenge, code: v.json.devCode, deviceId: c.device });
    expect(ok.json.status).toBe('ok');
    expect((await c.get('/api/me')).json.user.email).toBe('lena@demo.example');

    // Same device later: straight in.
    const back2 = await startAndCallback(c, good('lena@demo.example'));
    const v2 = await c.post('/api/auth/verify', { token: new URLSearchParams(back2.hash.slice(1)).get('token')!, deviceId: c.device });
    expect(v2.json.status).toBe('ok');
  });

  it('stops after too many wrong codes', async () => {
    const c = new Client(env, 'acme');
    const back = await startAndCallback(c, good('omar@demo.example'));
    const v = await c.post('/api/auth/verify', { token: new URLSearchParams(back.hash.slice(1)).get('token')!, deviceId: c.device });
    const wrongCode = v.json.devCode === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await c.post('/api/auth/device', { challenge: v.json.challenge, code: wrongCode, deviceId: c.device });
    const r = await c.post('/api/auth/device', { challenge: v.json.challenge, code: v.json.devCode, deviceId: c.device });
    expect(r.json.error).toBe('too_many_requests');
  });

  it('refuses an unverified Google address', async () => {
    const c = new Client(env, 'acme');
    const back = await startAndCallback(c, (nonce) => ({ ...good('lena@demo.example')(nonce), email_verified: false }));
    expect(back.pathname).toBe('/login');
    expect(back.searchParams.get('error')).toBe('oauth_failed');
  });

  it('refuses a token for another app or with the wrong nonce', async () => {
    const c = new Client(env, 'acme');
    const wrongAud = await startAndCallback(c, (nonce) => ({ ...good('lena@demo.example')(nonce), aud: 'someone-else' }));
    expect(wrongAud.searchParams.get('error')).toBe('oauth_failed');
    const wrongNonce = await startAndCallback(c, () => good('lena@demo.example')('not-the-nonce'));
    expect(wrongNonce.searchParams.get('error')).toBe('oauth_failed');
  });

  it('tells a person without an account to ask for an invite', async () => {
    const c = new Client(env, 'acme');
    const back = await startAndCallback(c, good('outsider@demo.example'));
    expect(back.searchParams.get('error')).toBe('no_account');
  });

  it('rejects a tampered state', async () => {
    const r = await env.app.request('https://app.curahold.test/api/oauth/callback?code=x&state=eyJvIjoiYWNtZSJ9.forged');
    expect(r.status).toBe(400);
  });
});
