// Backup administrators when the company requires SSO (routes/auth.ts, routes/sso.ts):
// up to two chosen administrators keep the emailed link, always followed by their
// passkey or authenticator app; every such sign-in is in the activity log and emailed
// to the other administrators; nobody else gets through; requiring SSO with nobody
// who could get in is refused.
import { beforeAll, describe, expect, it } from 'vitest';
import { base32Decode, hotp, stepOf } from '../api/src/lib/totp';
import { Client, login, setup, type Env } from './helpers';

let env: Env;
let adaSecret = '';
let adaRecovery: string[] = [];
let admin: Client;
beforeAll(async () => {
  env = await setup();
  // Mert is a second administrator (he is told about backup sign-ins); Ada sets up an authenticator app.
  await env.db.system((q) => q.query(`update users set role_id = (select role_id from users where id = $2) where id = $1`, [env.a.ids.mert, env.a.ids.ada]));
  admin = await login(env, 'acme', 'ada@demo.example');
  const s = await admin.post('/api/me/security/totp', {});
  adaSecret = s.json.secret;
  const ok = await admin.post('/api/me/security/totp/confirm', { code: await codeFor(adaSecret) });
  expect(ok.status).toBe(200);
  adaRecovery = ok.json.recoveryCodes;
});

const codeFor = async (secret: string, offsetSteps = 0) => hotp(base32Decode(secret), stepOf(Date.now()) + offsetSteps);
const requireSso = (ids: string[]) =>
  env.db.system((q) =>
    q.query(
      `insert into sso_configs (org_id, protocol, enabled, enforced, sso_url, backup_admin_ids) values ($1, 'saml', true, true, 'https://idp.demo.example/sso', $2)
       on conflict (org_id) do update set enabled = true, enforced = true, backup_admin_ids = $2`,
      [env.a.orgId, ids],
    ),
  );
const relax = () => env.db.system((q) => q.query(`update sso_configs set enforced = false where org_id = $1`, [env.a.orgId]));

describe('choosing backup administrators', () => {
  it('only administrators, at most two, and only by someone who manages the company', async () => {
    const notAdmin = await admin.put('/api/sso/settings', { protocol: 'saml', enabled: false, backupAdminIds: [env.a.ids.zeynep] });
    expect(notAdmin.status).toBe(400);
    expect(notAdmin.json.error).toBe('backup_not_admin');
    const three = await admin.put('/api/sso/settings', { protocol: 'saml', enabled: false, backupAdminIds: [env.a.ids.ada, env.a.ids.mert, env.a.ids.zeynep] });
    expect(three.status).toBe(400);
    const ok = await admin.put('/api/sso/settings', { protocol: 'saml', enabled: false, backupAdminIds: [env.a.ids.ada, env.a.ids.mert] });
    expect(ok.status).toBe(200);
    // Who can actually get in: Ada has a second step, Mert has none yet.
    const got = await admin.get('/api/sso/settings');
    expect(got.json.backup.ids.sort()).toEqual([env.a.ids.ada, env.a.ids.mert].sort());
    const byId = Object.fromEntries(got.json.backup.people.map((p: any) => [p.id, p]));
    expect(byId[env.a.ids.ada]).toMatchObject({ admin: true, secondStep: true });
    expect(byId[env.a.ids.mert]).toMatchObject({ admin: true, secondStep: false });
    const [line] = await env.db.system((q) => q.query(`select actor_id from audit_log where org_id = $1 and action = 'sso.backup_changed' order by at desc limit 1`, [env.a.orgId]));
    expect(line.actor_id).toBe(env.a.ids.ada);
    // A member cannot change them.
    const zeynep = await login(env, 'acme', 'zeynep@demo.example');
    expect((await zeynep.put('/api/sso/settings', { enabled: false, backupAdminIds: [] })).status).toBe(403);
  });

  it('refuses to keep SSO required with nobody who could get in if the provider fails', async () => {
    await requireSso([env.a.ids.ada]);
    try {
      // Only Mert, who has no second step: refused. Nobody at all: refused.
      for (const ids of [[env.a.ids.mert], []]) {
        const r = await admin.put('/api/sso/settings', { protocol: 'saml', enabled: true, enforced: true, ssoUrl: 'https://idp.demo.example/sso', backupAdminIds: ids });
        expect(r.status).toBe(409);
        expect(r.json.error).toBe('sso_no_backup');
      }
      const [row] = await env.db.system((q) => q.query(`select backup_admin_ids from sso_configs where org_id = $1`, [env.a.orgId]));
      expect(row.backup_admin_ids).toEqual([env.a.ids.ada]);
    } finally {
      await relax();
    }
  });
});

describe('signing in while SSO is required', () => {
  it('lets exactly the backup administrators through, with their second step, never the link alone', async () => {
    // A member's link asked for before SSO was required.
    const early = new Client(env, 'acme');
    const before = await early.post('/api/auth/start', { email: 'lena@demo.example' });
    expect(before.json.devToken).toBeTruthy();
    await requireSso([env.a.ids.ada, env.a.ids.mert]);
    try {
      // The ordinary way is closed for everyone, including the backup administrators.
      expect((await new Client(env, 'acme').post('/api/auth/start', { email: 'ada@demo.example' })).json.error).toBe('sso_required');
      // The old link no longer opens anything.
      expect((await early.post('/api/auth/verify', { token: before.json.devToken, deviceId: early.device })).json.error).toBe('sso_required');
      // The backup way answers the same for everyone, and sends a link only to a backup administrator who could get in.
      const sentBefore = env.email.sent.length;
      for (const who of ['zeynep@demo.example', 'nobody@demo.example', 'mert@demo.example']) {
        const r = await new Client(env, 'acme').post('/api/auth/start', { email: who, backup: true });
        expect(r.status).toBe(200);
        expect(r.json).toEqual({ ok: true });
      }
      expect(env.email.sent.length).toBe(sentBefore);

      const c = new Client(env, 'acme');
      const start = await c.post('/api/auth/start', { email: 'ada@demo.example', backup: true });
      expect(start.json.devToken).toBeTruthy();
      const v = await c.post('/api/auth/verify', { token: start.json.devToken, deviceId: c.device, deviceLabel: 'Backup laptop' });
      // The second step always follows; a recovery code is not offered and not accepted.
      expect(v.json).toMatchObject({ status: 'second_step', enroll: false });
      expect(v.json.methods).toEqual(['totp']);
      expect((await c.get('/api/me')).status).toBe(401);
      const rec = await c.post('/api/auth/second', { token: v.json.token, deviceId: c.device, recoveryCode: adaRecovery[0] });
      expect(rec.json.error).toBe('second_step_failed');
      const mailsBefore = env.email.sent.length;
      const ok = await c.post('/api/auth/second', { token: v.json.token, deviceId: c.device, code: await codeFor(adaSecret, 1) });
      expect(ok.json.status).toBe('ok');
      expect((await c.get('/api/me')).status).toBe(200);

      // The activity log has the sign-in.
      const [line] = await env.db.system((q) => q.query(`select actor_id, meta from audit_log where org_id = $1 and action = 'login.backup' order by at desc limit 1`, [env.a.orgId]));
      expect(line.actor_id).toBe(env.a.ids.ada);
      expect(line.meta).toMatchObject({ via: 'totp', device: 'Backup laptop' });
      // Every other administrator is emailed (Mert), and nobody else.
      const told = env.email.sent.slice(mailsBefore);
      expect(told.map((m) => m.to)).toEqual(['mert@demo.example']);
      expect(told[0].subject).toContain('Ada Demir');
      expect(told[0].subject).toContain('without SSO');
      expect(told[0].text).toContain('Backup laptop');
      expect(told[0].text).toContain('/settings/audit');
    } finally {
      await relax();
    }
  });

  it('a backup administrator without a second step, or no longer an administrator, is not let in', async () => {
    await requireSso([env.a.ids.ada, env.a.ids.mert]);
    try {
      // Mert has no second step: no link.
      const m = await new Client(env, 'acme').post('/api/auth/start', { email: 'mert@demo.example', backup: true });
      expect(m.json.devToken).toBeUndefined();
      // Ada asked for a link, then stopped being an administrator: the link does not open.
      const c = new Client(env, 'acme');
      const start = await c.post('/api/auth/start', { email: 'ada@demo.example', backup: true });
      expect(start.json.devToken).toBeTruthy();
      const [{ role_id }] = await env.db.system((q) => q.query(`select role_id from users where id = $1`, [env.a.ids.ada]));
      await env.db.system((q) => q.query(`update users set role_id = (select role_id from users where id = $2) where id = $1`, [env.a.ids.ada, env.a.ids.zeynep]));
      try {
        expect((await c.post('/api/auth/verify', { token: start.json.devToken, deviceId: c.device })).json.error).toBe('sso_required');
      } finally {
        await env.db.system((q) => q.query(`update users set role_id = $2 where id = $1`, [env.a.ids.ada, role_id]));
      }
    } finally {
      await relax();
    }
  });
});
