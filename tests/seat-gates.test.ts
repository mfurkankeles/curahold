// Every way a full seat is added keeps to the trial's approved seats and the plan's limit (security audit M3):
// invitations already did; joining by the company's domain, a first single sign-on and SCIM now do too.
import { beforeAll, describe, expect, it } from 'vitest';
import { findOrProvisionUser } from '../api/src/lib/sso';
import { Client, login, setup, type Env } from './helpers';
import { adminApp, adminAuth, authApp, orgRowOf } from './fixtures/sso-harness';

let env: Env;
let ada: Client;
let scimToken = '';

const fullSeats = async () =>
  (await env.db.system((q) => q.query<{ n: number }>(`select count(*)::int as n from users where org_id = $1 and seat = 'full' and status in ('active', 'invited')`, [env.a.orgId])))[0].n;

/** The trial company is full: its approved seats are exactly the seats it has. */
const fillTheTrial = async () => {
  const n = await fullSeats();
  await env.db.system((q) => q.query(`update orgs set billing = '{}'::jsonb, trial_seat_cap = $2 where id = $1`, [env.a.orgId, n]));
  return n;
};

beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
  const org = await orgRowOf(env, env.a.orgId);
  const res = await adminApp(env, org, adminAuth(env.a.ids.ada)).request('https://x/api/sso/settings/scim-token', { method: 'POST' });
  scimToken = ((await res.json()) as any).token;
});

describe('a full trial takes no more full seats', () => {
  it('joining by the company domain is refused with the seat limit', async () => {
    await ada.patch('/api/admin/org', { autoJoin: true });
    const n = await fillTheTrial();
    const c = new Client(env, 'acme');
    const start = await c.post('/api/auth/start', { email: 'one-too-many@demo.example' });
    const j = await c.post('/api/join', { token: start.json.devJoinToken, name: 'One Too Many', deviceId: c.device });
    expect(j.json.error).toBe('seat_cap_reached');
    expect(await fullSeats()).toBe(n);
    await ada.patch('/api/admin/org', { autoJoin: false });
  });

  it('a first single sign-on does not create a seat', async () => {
    const n = await fillTheTrial();
    await expect(
      env.db.tenant({ orgId: env.a.orgId, userId: null }, (q) => findOrProvisionUser(q, env.a.orgId, { email: 'sso-new@demo.example', name: 'Sso New' })),
    ).rejects.toMatchObject({ code: 'seat_cap_reached' });
    expect(await fullSeats()).toBe(n);
    // Someone who already has a seat still signs in.
    const found = await env.db.tenant({ orgId: env.a.orgId, userId: null }, (q) => findOrProvisionUser(q, env.a.orgId, { email: 'lena@demo.example', name: 'Lena' }));
    expect(found.provisioned).toBe(false);
  });

  it('SCIM is told there is no seat left (409), and adds no one', async () => {
    const n = await fillTheTrial();
    const scim = (method: string, path: string, body?: unknown) =>
      authApp(env).request(`https://x/api/scim/v2${path}`, {
        method,
        headers: { authorization: `Bearer ${scimToken}`, 'content-type': 'application/scim+json' },
        body: body ? JSON.stringify(body) : undefined,
      });
    const user = (email: string, active = true) => ({ schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], userName: email, displayName: 'Scim Person', active });
    const r = await scim('POST', '/Users', user('scim-new@demo.example'));
    expect(r.status).toBe(409);
    expect(((await r.json()) as any).scimType).toBe('tooMany');
    expect(await fullSeats()).toBe(n);
    // A disabled person may be added (no seat taken), but turning them on needs a seat.
    const off = await scim('POST', '/Users', user('scim-off@demo.example', false));
    expect(off.status).toBe(201);
    const id = ((await off.json()) as any).id;
    const on = await scim('PATCH', `/Users/${id}`, { schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'], Operations: [{ op: 'replace', path: 'active', value: true }] });
    expect(on.status).toBe(409);
    expect(await fullSeats()).toBe(n);
    // With a seat free again, the same call goes through.
    await env.db.system((q) => q.query(`update orgs set trial_seat_cap = $2 where id = $1`, [env.a.orgId, n + 1]));
    expect((await scim('PATCH', `/Users/${id}`, { schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'], Operations: [{ op: 'replace', path: 'active', value: true }] })).status).toBe(200);
  });
});
