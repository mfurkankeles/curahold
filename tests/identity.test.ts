// Identity: authenticator app (TOTP) with recovery codes, passkeys, the
// company's "second step required" setting, an administrator's reset, and the
// fresh confirmation before dangerous actions (api/src/lib/identity.ts).
import { beforeAll, describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, checkTotp, hotp, stepOf } from '../api/src/lib/totp';
import { Client, login, setup, type Env } from './helpers';
import { SoftKey } from './softkey';

let env: Env;
let adaSecret = '';
let adaRecovery: string[] = [];
beforeAll(async () => {
  env = await setup();
});

const codeFor = async (secret: string, offsetSteps = 0) => hotp(base32Decode(secret), stepOf(Date.now()) + offsetSteps);

/** The emailed link, and whatever the server answers to it. */
async function firstStep(slug: string, email: string) {
  const c = new Client(env, slug);
  const start = await c.post('/api/auth/start', { email });
  const v = await c.post('/api/auth/verify', { token: start.json.devToken, deviceId: c.device, deviceLabel: 'Test browser' });
  return { c, v };
}

/** Signs in and sets up an authenticator app; returns the client, the secret and the recovery codes. */
async function withTotp(email: string) {
  const c = await login(env, 'acme', email);
  const s = await c.post('/api/me/security/totp', {});
  expect(s.status).toBe(200);
  expect(s.json.uri).toMatch(/^otpauth:\/\/totp\//);
  const ok = await c.post('/api/me/security/totp/confirm', { code: await codeFor(s.json.secret) });
  expect(ok.status).toBe(200);
  return { c, secret: s.json.secret as string, recovery: ok.json.recoveryCodes as string[] };
}

const age = (c: Client, minutes: number) =>
  env.db.system((q) =>
    q.query(`update sessions set created_at = now() - make_interval(mins => $1::int), confirmed_at = null where revoked_at is null and device_id = $2`, [minutes, c.device]),
  );

describe('TOTP (RFC 6238)', () => {
  it('matches the RFC test vectors and refuses a used step', async () => {
    const key = new TextEncoder().encode('12345678901234567890');
    expect(await hotp(key, Math.floor(59 / 30), 8)).toBe('94287082');
    expect(await hotp(key, Math.floor(1111111109 / 30), 8)).toBe('07081804');
    expect(await hotp(key, Math.floor(1234567890 / 30), 8)).toBe('89005924');
    const b32 = base32Encode(key);
    expect(base32Decode(b32)).toEqual(key);
    const now = 1_700_000_000_000;
    const code = await hotp(key, stepOf(now));
    const step = await checkTotp(b32, code, now);
    expect(step).toBe(stepOf(now));
    expect(await checkTotp(b32, code, now, step!)).toBeNull();
    // Two steps away is too far.
    expect(await checkTotp(b32, await hotp(key, stepOf(now) - 2), now)).toBeNull();
  });
});

describe('authenticator app and recovery codes', () => {
  it('asks for the second step at the next sign-in; a wrong code, a reused code and a used recovery code are refused', async () => {
    const { secret, recovery } = await withTotp('lena@demo.example');
    expect(recovery).toHaveLength(10);
    const { c, v } = await firstStep('acme', 'lena@demo.example');
    expect(v.json).toMatchObject({ status: 'second_step', enroll: false });
    expect(v.json.methods).toEqual(['totp', 'recovery']);
    expect((await c.get('/api/me')).status).toBe(401);
    expect((await c.post('/api/auth/second', { token: v.json.token, deviceId: c.device, code: '000000' })).json.error).toBe('second_step_failed');
    // The step belongs to this device.
    expect((await new Client(env, 'acme').post('/api/auth/second', { token: v.json.token, deviceId: 'other-device-0001', code: await codeFor(secret) })).json.error).toBe('invalid_token');
    // Next step's code, so it cannot clash with the one used while setting up.
    const code = await codeFor(secret, 1);
    const ok = await c.post('/api/auth/second', { token: v.json.token, deviceId: c.device, code });
    expect(ok.json.status).toBe('ok');
    expect((await c.get('/api/me')).status).toBe(200);
    // The same code again, on another sign-in: refused.
    const again = await firstStep('acme', 'lena@demo.example');
    expect((await again.c.post('/api/auth/second', { token: again.v.json.token, deviceId: again.c.device, code })).json.error).toBe('second_step_failed');
    // A recovery code works once.
    const r = await again.c.post('/api/auth/second', { token: again.v.json.token, deviceId: again.c.device, recoveryCode: recovery[0].toUpperCase() });
    expect(r.json.status).toBe('ok');
    const third = await firstStep('acme', 'lena@demo.example');
    expect((await third.c.post('/api/auth/second', { token: third.v.json.token, deviceId: third.c.device, recoveryCode: recovery[0] })).json.error).toBe('second_step_failed');
    const me = await again.c.get('/api/me/security');
    expect(me.json).toMatchObject({ totp: true, recoveryLeft: 9, required: false });
  });

  it('stops guessing after five tries', async () => {
    const { c, v } = await firstStep('acme', 'lena@demo.example');
    for (let i = 0; i < 5; i++) await c.post('/api/auth/second', { token: v.json.token, deviceId: c.device, code: '000000' });
    expect((await c.post('/api/auth/second', { token: v.json.token, deviceId: c.device, code: '000000' })).json.error).toBe('too_many_requests');
  });
});

describe('the company setting', () => {
  it('cannot be turned on by an administrator without a second step; when on, people without one set it up while signing in', async () => {
    const ada = await login(env, 'acme', 'ada@demo.example');
    expect((await ada.put('/api/admin/security', { secondStep: 'everyone' })).json.error).toBe('second_step_setup_first');
    const { c: adaToo, secret, recovery } = await withTotp('ada@demo.example');
    adaRecovery = recovery;
    expect((await adaToo.put('/api/admin/security', { secondStep: 'everyone' })).status).toBe(200);
    // Omar has no second step yet: the link alone no longer opens a session.
    const { c, v } = await firstStep('acme', 'omar@demo.example');
    expect(v.json).toMatchObject({ status: 'second_step', enroll: true, methods: [] });
    const s = await c.post('/api/auth/second/setup', { token: v.json.token, deviceId: c.device });
    const done = await c.post('/api/auth/second', { token: v.json.token, deviceId: c.device, code: await codeFor(s.json.secret) });
    expect(done.json.status).toBe('ok');
    expect(done.json.recoveryCodes).toHaveLength(10);
    expect((await c.put('/api/admin/security', { secondStep: 'off' })).status).toBe(403);
    // Nobody removes their last second step while it is required.
    expect((await c.del('/api/me/security/totp')).json.error).toBe('second_step_required');

    // An administrator resets Omar (lost phone): at his next sign-in he sets it up again.
    const people = (await adaToo.get('/api/admin/security')).json.people as { id: string; email: string; totp: boolean }[];
    const o = people.find((p) => p.email === 'omar@demo.example')!;
    expect(o.totp).toBe(true);
    expect((await adaToo.del(`/api/admin/users/${o.id}/second-step`)).status).toBe(200);
    expect((await firstStep('acme', 'omar@demo.example')).v.json).toMatchObject({ status: 'second_step', enroll: true });
    // Not oneself, and not without the permission.
    const adaId = people.find((p) => p.email === 'ada@demo.example')!.id;
    expect((await adaToo.del(`/api/admin/users/${adaId}/second-step`)).status).toBe(403);
    expect((await c.del(`/api/admin/users/${adaId}/second-step`)).status).toBe(403);

    const log = await env.db.system((q) => q.query(`select action from audit_log where org_id = $1 and action like 'second_step.%' or (org_id = $1 and action = 'org.second_step_policy')`, [env.a.orgId]));
    expect(log.map((r) => r.action)).toEqual(expect.arrayContaining(['org.second_step_policy', 'second_step.added', 'second_step.reset']));
    adaSecret = secret;
    expect((await adaToo.put('/api/admin/security', { secondStep: 'off' })).status).toBe(200);
  });
});

describe('fresh confirmation before dangerous actions', () => {
  it('a session older than ten minutes must confirm, by an emailed code when there is no second step', async () => {
    const mert = await login(env, 'acme', 'mert@demo.example');
    await age(mert, 30);
    const r = await mert.post('/api/me/security/passkeys/options', {});
    expect(r.status).toBe(403);
    expect(r.json.error).toBe('reauth_required');
    const opts = await mert.post('/api/me/confirm/options', {});
    expect(opts.json.methods).toEqual(['email']);
    const sent = await mert.post('/api/me/confirm/email', {});
    expect(env.email.last('mert@demo.example').text).toContain(sent.json.devCode);
    expect((await mert.post('/api/me/confirm', { emailCode: '000000' })).json.error).toBe('second_step_failed');
    expect((await mert.post('/api/me/confirm', { emailCode: sent.json.devCode })).status).toBe(200);
    expect((await mert.post('/api/me/security/passkeys/options', {})).status).toBe(200);
  });

  it('role changes, API keys and SSO settings need it; someone with an app confirms with a code, not email', async () => {
    // Ada set up her app in the setting test above.
    const secret = adaSecret;
    const { c: ada, v } = await firstStep('acme', 'ada@demo.example');
    expect((await ada.post('/api/auth/second', { token: v.json.token, deviceId: ada.device, code: await codeFor(secret, 1) })).json.status).toBe('ok');
    await age(ada, 30);
    const roles = (await ada.get('/api/admin/roles')).json;
    const role = (roles.roles ?? roles)[0];
    expect((await ada.post('/api/admin/roles', { name: 'Auditors', perms: [] })).json.error).toBe('reauth_required');
    expect((await ada.post('/api/dev/keys', { name: 'k' })).json.error).toBe('reauth_required');
    expect((await ada.put('/api/sso/settings', {})).json.error).toBe('reauth_required');
    expect(role).toBeTruthy();
    expect((await ada.post('/api/me/confirm/email', {})).status).toBe(403);
    // The app's codes around now are spent (sign-in); a recovery code also confirms.
    expect((await ada.post('/api/me/confirm', { recoveryCode: adaRecovery[1] })).status).toBe(200);
    expect((await ada.post('/api/dev/keys', { name: 'k' })).status).toBe(201);
  });
});

describe('passkeys', () => {
  it('registers a passkey, signs in with it (both steps at once), and refuses another origin', async () => {
    const zeynep = await login(env, 'acme', 'zeynep@demo.example');
    const key = new SoftKey('acme.curahold.test');
    const o = await zeynep.post('/api/me/security/passkeys/options', {});
    expect(o.status).toBe(200);
    const reg = await zeynep.post('/api/me/security/passkeys', { challengeId: o.json.challengeId, response: key.register(o.json.options), name: 'Test laptop' });
    expect(reg.status).toBe(201);
    const mine = (await zeynep.get('/api/me/security')).json.passkeys;
    expect(mine).toHaveLength(1);
    // Nobody else removes it: not a colleague, not another company.
    expect((await (await login(env, 'acme', 'mert@demo.example')).del(`/api/me/security/passkeys/${mine[0].id}`)).status).toBe(404);
    expect((await (await login(env, 'beta', 'ada@demo.example')).del(`/api/me/security/passkeys/${mine[0].id}`)).status).toBe(404);

    const c = new Client(env, 'acme');
    const lo = await c.post('/api/auth/passkey/options', {});
    const ok = await c.post('/api/auth/passkey', { challengeId: lo.json.challengeId, response: key.assert(lo.json.options), deviceId: c.device, deviceLabel: 'Laptop' });
    expect(ok.json.status).toBe('ok');
    expect((await c.get('/api/me')).json.user.name).toBe('Zeynep Tunç');
    const [s] = await env.db.system((q) => q.query(`select method, second_step from sessions where org_id = $1 and device_id = $2 and revoked_at is null`, [env.a.orgId, c.device]));
    expect(s).toMatchObject({ method: 'passkey', second_step: 'passkey' });

    // A challenge works once; another site's origin is refused; another company does not know the key.
    expect((await c.post('/api/auth/passkey', { challengeId: lo.json.challengeId, response: key.assert(lo.json.options), deviceId: c.device })).json.error).toBe('passkey_failed');
    const lo2 = await c.post('/api/auth/passkey/options', {});
    expect((await c.post('/api/auth/passkey', { challengeId: lo2.json.challengeId, response: key.assert(lo2.json.options, 'https://evil.example'), deviceId: c.device })).json.error).toBe('passkey_failed');
    const b = new Client(env, 'beta');
    const lb = await b.post('/api/auth/passkey/options', {});
    expect((await b.post('/api/auth/passkey', { challengeId: lb.json.challengeId, response: key.assert(lb.json.options), deviceId: b.device })).json.error).toBe('passkey_failed');

    // With a passkey, the emailed link asks for it as the second step.
    const { c: c2, v } = await firstStep('acme', 'zeynep@demo.example');
    expect(v.json.methods).toEqual(['passkey']);
    const po = await c2.post('/api/auth/second/passkey', { token: v.json.token, deviceId: c2.device });
    const done = await c2.post('/api/auth/second', { token: v.json.token, deviceId: c2.device, passkey: { challengeId: po.json.challengeId, response: key.assert(po.json.options) } });
    expect(done.json.status).toBe('ok');
  });
});

describe('devices', () => {
  it('signs out every other device and keeps this one', async () => {
    const one = await login(env, 'acme', 'sofia@demo.example');
    const two = await login(env, 'acme', 'sofia@demo.example');
    const r = await two.post('/api/me/sessions/sign-out-others', {});
    expect(r.json.signedOut).toBe(1);
    expect((await one.get('/api/me')).status).toBe(401);
    expect((await two.get('/api/me')).status).toBe(200);
  });
});

describe('break-glass on a self-hosted install', () => {
  it('RESET_SECOND_STEP removes a person’s second step at start-up and writes it down', async () => {
    const { breakGlass } = await import('../api/src/selfhost');
    const [before] = await env.db.system((q) => q.query(`select count(*)::int as n from user_totp where org_id = $1 and user_id = $2`, [env.a.orgId, env.a.ids.lena]));
    expect(before.n).toBe(1);
    expect(await breakGlass(env.db, 'acme', ' Lena@demo.example , nobody@demo.example')).toEqual(['lena@demo.example']);
    const [after] = await env.db.system((q) => q.query(`select count(*)::int as n from user_totp where org_id = $1 and user_id = $2`, [env.a.orgId, env.a.ids.lena]));
    expect(after.n).toBe(0);
    // (Lena has used up her links for this quarter hour in the tests above.)
    await env.db.system((q) => q.query(`delete from login_tokens where org_id = $1 and email = 'lena@demo.example'`, [env.a.orgId]));
    expect((await firstStep('acme', 'lena@demo.example')).v.json.status).toBe('ok');
    const log = await env.db.system((q) => q.query(`select 1 from audit_log where org_id = $1 and action = 'second_step.break_glass'`, [env.a.orgId]));
    expect(log).toHaveLength(1);
  });
});

describe('the activity log', () => {
  it('cannot be changed or removed, not even by the database owner, and exports with a fingerprint', async () => {
    const sys = (sql: string) => env.db.system((q) => q.query(sql, [env.a.orgId]));
    await expect(sys(`update audit_log set action = 'x' where org_id = $1`)).rejects.toThrow(/append-only/);
    await expect(sys(`delete from audit_log where org_id = $1`)).rejects.toThrow(/append-only/);
    await expect(env.db.system((q) => q.query('truncate audit_log'))).rejects.toThrow(/append-only/);
    // The request role has no such privilege at all.
    const [priv] = await env.db.system((q) => q.query(`select has_table_privilege('curahold_app', 'audit_log', 'UPDATE') as u, has_table_privilege('curahold_app', 'audit_log', 'DELETE') as d`));
    expect(priv).toEqual({ u: false, d: false });

    const sofia = await login(env, 'acme', 'sofia@demo.example');
    expect((await sofia.get('/api/admin/audit/export')).status).toBe(403);
    const ada = await firstStep('acme', 'ada@demo.example');
    if (ada.v.json.status === 'second_step') await ada.c.post('/api/auth/second', { token: ada.v.json.token, deviceId: ada.c.device, recoveryCode: adaRecovery[2] });
    const r = await ada.c.get('/api/admin/audit/export');
    expect(r.status).toBe(200);
    expect(r.json.entries.length).toBeGreaterThan(5);
    expect(r.json.digest).toBe(r.json.entries.at(-1).chain);
    const [last] = await env.db.system((q) => q.query(`select meta from audit_log where org_id = $1 and action = 'audit.exported' order by at desc limit 1`, [env.a.orgId]));
    expect(last.meta.digest).toBe(r.json.digest);
    // An old session confirms first.
    await age(ada.c, 30);
    expect((await ada.c.get('/api/admin/audit/export')).json.error).toBe('reauth_required');
  });
});
