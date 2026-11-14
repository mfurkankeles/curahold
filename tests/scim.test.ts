// Wave-6A: SCIM 2.0 user provisioning. Create / read / patch / deactivate, and
// strict cross-company isolation — a token for one company can neither see nor
// change another company's users.
import { beforeAll, describe, expect, it } from 'vitest';
import { setup, type Env } from './helpers';
import { adminApp, adminAuth, authApp, orgRowOf } from './fixtures/sso-harness';

let env: Env;
let tokenA = '';
let tokenB = '';

async function scimTokenFor(e: Env, orgId: string, adminId: string): Promise<string> {
  const org = await orgRowOf(e, orgId);
  const app = adminApp(e, org, adminAuth(adminId));
  const res = await app.request('https://x/api/sso/settings/scim-token', { method: 'POST' });
  return ((await res.json()) as any).token as string;
}

beforeAll(async () => {
  env = await setup();
  tokenA = await scimTokenFor(env, env.a.orgId, env.a.ids.ada);
  tokenB = await scimTokenFor(env, env.b.orgId, env.b.ids.ada);
});

const scim = (token: string, method: string, path: string, body?: unknown) =>
  authApp(env).request(`https://x/api/scim/v2${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/scim+json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

const userBody = (email: string, active = true) => ({
  schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
  userName: email,
  name: { givenName: 'Scim', familyName: 'User' },
  displayName: 'Scim User',
  emails: [{ value: email, primary: true }],
  active,
});

describe('SCIM provisioning', () => {
  it('rejects a missing or invalid bearer token', async () => {
    expect((await authApp(env).request('https://x/api/scim/v2/Users')).status).toBe(401);
    expect((await scim('not-a-real-token', 'GET', '/Users')).status).toBe(401);
  });

  it('creates, reads, filters and provisions a user into the right company only', async () => {
    const create = await scim(tokenA, 'POST', '/Users', userBody('provisioned@demo.example'));
    expect(create.status).toBe(201);
    const u = (await create.json()) as any;
    expect(u.userName).toBe('provisioned@demo.example');
    expect(u.active).toBe(true);
    expect(u.id).toMatch(/^[0-9a-f-]{36}$/);

    // Provisioned into company A, and ONLY company A.
    const inA = await env.db.system((q) => q.query(`select status from users where org_id=$1 and email=$2`, [env.a.orgId, 'provisioned@demo.example']));
    const inB = await env.db.system((q) => q.query(`select 1 from users where org_id=$1 and email=$2`, [env.b.orgId, 'provisioned@demo.example']));
    expect(inA.length).toBe(1);
    expect((inA[0] as any).status).toBe('active');
    expect(inB.length).toBe(0);

    const get = await scim(tokenA, 'GET', `/Users/${u.id}`);
    expect(get.status).toBe(200);
    expect(((await get.json()) as any).userName).toBe('provisioned@demo.example');

    const list = await scim(tokenA, 'GET', `/Users?filter=${encodeURIComponent('userName eq "provisioned@demo.example"')}`);
    const l = (await list.json()) as any;
    expect(l.totalResults).toBe(1);
    expect(l.Resources[0].id).toBe(u.id);
  });

  it('rejects a duplicate userName (409)', async () => {
    await scim(tokenA, 'POST', '/Users', userBody('dupe@demo.example'));
    const again = await scim(tokenA, 'POST', '/Users', userBody('dupe@demo.example'));
    expect(again.status).toBe(409);
  });

  it('deactivates via PATCH active=false and reactivates (no hard delete)', async () => {
    const created = (await (await scim(tokenA, 'POST', '/Users', userBody('toggle@demo.example'))).json()) as any;
    const off = await scim(tokenA, 'PATCH', `/Users/${created.id}`, { schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'], Operations: [{ op: 'replace', path: 'active', value: false }] });
    expect(((await off.json()) as any).active).toBe(false);
    expect((await env.db.system((q) => q.query(`select status from users where id=$1`, [created.id])))[0] as any).toMatchObject({ status: 'disabled' });

    const on = await scim(tokenA, 'PATCH', `/Users/${created.id}`, { schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'], Operations: [{ op: 'replace', value: { active: true } }] });
    expect(((await on.json()) as any).active).toBe(true);
  });

  it('DELETE deactivates rather than removing the row', async () => {
    const created = (await (await scim(tokenA, 'POST', '/Users', userBody('deleteme@demo.example'))).json()) as any;
    const del = await scim(tokenA, 'DELETE', `/Users/${created.id}`);
    expect(del.status).toBe(204);
    const row = await env.db.system((q) => q.query(`select status from users where id=$1`, [created.id]));
    expect(row.length).toBe(1); // still there
    expect((row[0] as any).status).toBe('disabled');
  });

  it('CROSS-ORG: a token for company A cannot see or create users in company B', async () => {
    // Make a user in B with B's token.
    const bUser = (await (await scim(tokenB, 'POST', '/Users', userBody('bonly@demo.example'))).json()) as any;
    // A's token cannot fetch B's user.
    expect((await scim(tokenA, 'GET', `/Users/${bUser.id}`)).status).toBe(404);
    // A's token listing never includes B's user.
    const listA = (await (await scim(tokenA, 'GET', '/Users')).json()) as any;
    expect(listA.Resources.some((r: any) => r.userName === 'bonly@demo.example')).toBe(false);
    // A's token cannot deactivate B's user.
    expect((await scim(tokenA, 'PATCH', `/Users/${bUser.id}`, { Operations: [{ op: 'replace', path: 'active', value: false }] })).status).toBe(404);
    const stillActive = await env.db.system((q) => q.query(`select status from users where id=$1`, [bUser.id]));
    expect((stillActive[0] as any).status).toBe('active');

    // Creating the same userName through A lands only in A (B's row untouched).
    await scim(tokenA, 'POST', '/Users', userBody('bonly@demo.example'));
    const both = await env.db.system((q) => q.query(`select org_id, status from users where email=$1 order by org_id`, ['bonly@demo.example']));
    expect(both.length).toBe(2); // one per company, independent rows
  });

  it('serves ServiceProviderConfig with PATCH support', async () => {
    const res = await scim(tokenA, 'GET', '/ServiceProviderConfig');
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).patch.supported).toBe(true);
  });
});
