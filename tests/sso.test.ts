// Wave-6A: enterprise SSO (SAML 2.0 + OIDC). End-to-end through the real
// handlers, database and row-level security. A session minted by SSO must be
// accepted by the real app, and an IdP for one company must never log into
// another.
import { beforeAll, describe, expect, it } from 'vitest';
import { setup, newDevice, BASE, type Env } from './helpers';
import { acsUrl, spEntityId } from '../api/src/lib/sso';
import { adminApp, adminAuth, authApp, orgRowOf } from './fixtures/sso-harness';
import { newDemoIdp } from './fixtures/saml-fixtures';
import { newDemoOidp } from './fixtures/oidc-fixtures';

let env: Env;
beforeAll(async () => {
  env = await setup();
});

const cookieOf = (res: Response) => /app_session=([^;]*)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? '';
const url = (slug: string, path: string) => `https://${slug}.${BASE}${path}`;

/** Call /api/me on the REAL app with an SSO-minted cookie: proves the session is real. */
async function whoAmI(e: Env, slug: string, cookie: string, device: string) {
  return e.app.request(url(slug, '/api/me'), { headers: { cookie: `app_session=${cookie}`, 'x-curahold-device': device } });
}

describe('SSO admin config', () => {
  it('stores config, seals the secret out of the request role, and returns SP details', async () => {
    const org = await orgRowOf(env, env.a.orgId);
    const app = adminApp(env, org, adminAuth(env.a.ids.ada));
    const idp = newDemoIdp();
    const put = await app.request('https://x/api/sso/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ protocol: 'saml', enabled: true, issuer: idp.entityId, ssoUrl: 'https://demo-idp.example/sso', cert: idp.certBase64, attrEmail: 'email', attrName: 'displayName' }),
    });
    expect(put.status).toBe(200);
    const body = (await put.json()) as any;
    expect(body.sp.acsUrl).toBe(acsUrl(env.config, 'acme'));
    expect(body.sp.entityId).toBe(spEntityId(env.config, 'acme'));

    const get = await app.request('https://x/api/sso/settings');
    const g = (await get.json()) as any;
    expect(g.config.protocol).toBe('saml');
    expect(g.config.enabled).toBe(true);
    expect(g.config.certSet).toBe(true);
    // The raw cert/clientSecret are never returned.
    expect(g.config.cert).toBeUndefined();
    // The request role cannot read the secret column directly; it is sealed.
    const stored = await env.db.system((q) => q.query<{ secret: string }>('select secret from sso_configs where org_id = $1', [env.a.orgId]));
    expect(stored[0].secret).toMatch(/^v1\./); // AES-GCM sealed blob
    expect(stored[0].secret).not.toContain(idp.certBase64);
  });

  it('refuses config changes without org.manage', async () => {
    const org = await orgRowOf(env, env.a.orgId);
    const noPerm = { ...adminAuth(env.a.ids.zeynep), perms: [] as any };
    const app = adminApp(env, org, noPerm);
    const res = await app.request('https://x/api/sso/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: true }) });
    expect(res.status).toBe(403);
  });
});

describe('OIDC login', () => {
  it('signs a user in and the real app accepts the session', async () => {
    const oidp = await newDemoOidp();
    const org = await orgRowOf(env, env.a.orgId);
    const admin = adminApp(env, org, adminAuth(env.a.ids.ada));
    await admin.request('https://x/api/sso/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ protocol: 'oidc', enabled: true, issuer: oidp.issuer, ssoUrl: 'https://oidc.demo.example/authorize', tokenUrl: 'https://oidc.demo.example/token', jwksUrl: 'https://oidc.demo.example/jwks', clientId: oidp.clientId, clientSecret: 'demo-secret', attrEmail: 'email', attrName: 'name' }),
    });

    const app = authApp(env);
    const device = newDevice();
    const start = await app.request(url('acme', `/api/sso/acme/start?device=${device}`));
    expect(start.status).toBe(302);
    const loc = new URL(start.headers.get('location')!);
    expect(loc.origin + loc.pathname).toBe('https://oidc.demo.example/authorize');
    expect(loc.searchParams.get('code_challenge_method')).toBe('S256');
    const state = loc.searchParams.get('state')!;
    const nonce = loc.searchParams.get('nonce')!;

    // Act as the IdP: the token endpoint returns an id_token carrying our nonce.
    env.fetchHolder.impl = async (u: string) => {
      if (u === 'https://oidc.demo.example/token') return new Response(JSON.stringify({ id_token: await oidp.sign(oidp.claims({ nonce, email: 'newhire@demo.example', name: 'New Hire' })) }), { headers: { 'content-type': 'application/json' } });
      if (u === 'https://oidc.demo.example/jwks') return new Response(JSON.stringify(oidp.jwks), { headers: { 'content-type': 'application/json' } });
      return new Response('no', { status: 404 });
    };

    const cb = await app.request(url('acme', `/api/sso/acme/oidc/callback?code=abc123&state=${encodeURIComponent(state)}`));
    expect(cb.status).toBe(302);
    expect(new URL(cb.headers.get('location')!).pathname).toBe('/');
    const cookie = cookieOf(cb);
    expect(cookie).toBeTruthy();

    const me = await whoAmI(env, 'acme', cookie, device);
    expect(me.status).toBe(200);
    expect((await me.json()).user.email).toBe('newhire@demo.example');
  });

  it('rejects an id_token whose nonce does not match (no session)', async () => {
    const oidp = await newDemoOidp();
    const org = await orgRowOf(env, env.a.orgId);
    const admin = adminApp(env, org, adminAuth(env.a.ids.ada));
    await admin.request('https://x/api/sso/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ protocol: 'oidc', enabled: true, issuer: oidp.issuer, ssoUrl: 'https://oidc.demo.example/authorize', tokenUrl: 'https://oidc.demo.example/token', jwksUrl: 'https://oidc.demo.example/jwks', clientId: oidp.clientId, clientSecret: 'demo-secret' }),
    });
    const app = authApp(env);
    const device = newDevice();
    const start = await app.request(url('acme', `/api/sso/acme/start?device=${device}`));
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
    env.fetchHolder.impl = async (u: string) => {
      if (u === 'https://oidc.demo.example/token') return new Response(JSON.stringify({ id_token: await oidp.sign(oidp.claims({ nonce: 'the-wrong-nonce' })) }), { headers: { 'content-type': 'application/json' } });
      if (u === 'https://oidc.demo.example/jwks') return new Response(JSON.stringify(oidp.jwks), { headers: { 'content-type': 'application/json' } });
      return new Response('no', { status: 404 });
    };
    const cb = await app.request(url('acme', `/api/sso/acme/oidc/callback?code=abc&state=${encodeURIComponent(state)}`));
    expect(cb.status).toBe(302);
    expect(new URL(cb.headers.get('location')!).searchParams.get('error')).toBe('oauth_failed');
    expect(cookieOf(cb)).toBe('');
  });
});

describe('test sign-in, and requiring SSO only after one worked', () => {
  const details = (oidp: Awaited<ReturnType<typeof newDemoOidp>>, extra: Record<string, unknown>) =>
    JSON.stringify({ protocol: 'oidc', issuer: oidp.issuer, ssoUrl: 'https://oidc.demo.example/authorize', tokenUrl: 'https://oidc.demo.example/token', jwksUrl: 'https://oidc.demo.example/jwks', clientId: oidp.clientId, clientSecret: 'demo-secret', attrEmail: 'email', ...extra });
  const put = (admin: ReturnType<typeof adminApp>, body: string) => admin.request('https://x/api/sso/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body });

  it('a test runs before SSO is on, signs nobody in, and unlocks "require" for exactly those details', async () => {
    const oidp = await newDemoOidp();
    const org = await orgRowOf(env, env.b.orgId);
    const admin = adminApp(env, org, adminAuth(env.b.ids.ada, 'ada@beta.example'));
    // Saved but off, then asked to be required at once: refused, nothing has proved the details yet.
    expect((await put(admin, details(oidp, { enabled: false }))).status).toBe(200);
    const early = await put(admin, details(oidp, { enabled: true, enforced: true }));
    expect(early.status).toBe(409);
    expect(JSON.stringify(await early.json())).toContain('sso_untested');

    const app = authApp(env);
    const start = await app.request(url(org.slug, `/api/sso/${org.slug}/start?test=1&device=${newDevice()}`));
    expect(start.status).toBe(302);
    const loc = new URL(start.headers.get('location')!);
    const state = loc.searchParams.get('state')!;
    const nonce = loc.searchParams.get('nonce')!;
    env.fetchHolder.impl = async (u: string) => {
      if (u === 'https://oidc.demo.example/token') return new Response(JSON.stringify({ id_token: await oidp.sign(oidp.claims({ nonce, email: 'it@beta.example', name: 'IT Desk' })) }), { headers: { 'content-type': 'application/json' } });
      if (u === 'https://oidc.demo.example/jwks') return new Response(JSON.stringify(oidp.jwks), { headers: { 'content-type': 'application/json' } });
      return new Response('no', { status: 404 });
    };
    const cb = await app.request(url(org.slug, `/api/sso/${org.slug}/oidc/callback?code=abc&state=${encodeURIComponent(state)}`));
    expect(cb.status).toBe(302);
    const back = new URL(cb.headers.get('location')!);
    expect(back.pathname).toBe('/settings/sso');
    expect(back.searchParams.get('ssoTest')).toBe('ok');
    expect(back.searchParams.get('as')).toBe('it@beta.example');
    // Nobody was signed in, and nobody was created.
    expect(cookieOf(cb)).toBe('');
    const made = await env.db.system((q) => q.query(`select 1 from users where email = 'it@beta.example'`));
    expect(made.length).toBe(0);

    const got = await (await admin.request('https://x/api/sso/settings')).json();
    expect(got.test?.current).toBe(true);
    // Tested, but nobody could get in if the provider failed: still refused until a backup administrator
    // with a second step is chosen (tests/sso-backup.test.ts has the sign-in itself).
    const noBackup = await put(admin, details(oidp, { enabled: true, enforced: true }));
    expect(noBackup.status).toBe(409);
    expect(JSON.stringify(await noBackup.json())).toContain('sso_no_backup');
    await env.db.system((q) => q.query(`insert into user_totp (org_id, user_id, secret_sealed, confirmed_at) values ($1, $2, 'sealed-for-test', now()) on conflict do nothing`, [org.id, env.b.ids.ada]));
    expect((await put(admin, details(oidp, { enabled: true, enforced: true, backupAdminIds: [env.b.ids.ada] }))).status).toBe(200);
    // Other details (a different client) have not been proved: requiring them again after switching off is refused.
    expect((await put(admin, details(oidp, { enabled: false }))).status).toBe(200);
    const other = await put(admin, details(oidp, { enabled: true, enforced: true, clientId: 'another-client' }));
    expect(other.status).toBe(409);
    await put(admin, details(oidp, { enabled: false }));
  });
});

describe('SAML login', () => {
  async function configure(e: Env, orgId: string, idp: ReturnType<typeof newDemoIdp>) {
    const org = await orgRowOf(e, orgId);
    const admin = adminApp(e, org, adminAuth(org.slug === 'acme' ? e.a.ids.ada : e.b.ids.ada, `ada@demo.example`));
    await admin.request('https://x/api/sso/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ protocol: 'saml', enabled: true, issuer: idp.entityId, ssoUrl: 'https://demo-idp.example/sso', cert: idp.certBase64, attrEmail: 'email', attrName: 'displayName' }),
    });
    return org;
  }
  async function relayFor(app: ReturnType<typeof authApp>, slug: string, device: string) {
    const start = await app.request(url(slug, `/api/sso/${slug}/start?device=${device}`));
    expect(start.status).toBe(302);
    return new URL(start.headers.get('location')!).searchParams.get('RelayState')!;
  }
  const postAcs = (app: ReturnType<typeof authApp>, slug: string, SAMLResponse: string, RelayState: string) =>
    app.request(url(slug, `/api/sso/${slug}/saml/acs`), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ SAMLResponse, RelayState }).toString() });

  it('verifies a signed assertion, provisions the user, and mints a real session', async () => {
    const idp = newDemoIdp();
    await configure(env, env.a.orgId, idp);
    const app = authApp(env);
    const device = newDevice();
    const relay = await relayFor(app, 'acme', device);
    const resp = idp.sign({ email: 'samluser@demo.example', name: 'SAML User', audience: spEntityId(env.config, 'acme'), acs: acsUrl(env.config, 'acme') });
    const acs = await postAcs(app, 'acme', resp, relay);
    expect(acs.status).toBe(302);
    expect(new URL(acs.headers.get('location')!).pathname).toBe('/');
    const cookie = cookieOf(acs);
    expect(cookie).toBeTruthy();
    const me = await whoAmI(env, 'acme', cookie, device);
    expect(me.status).toBe(200);
    expect((await me.json()).user.email).toBe('samluser@demo.example');
  });

  it('rejects an unsigned/forged assertion (bad signature) — no session', async () => {
    const idp = newDemoIdp();
    await configure(env, env.a.orgId, idp);
    const app = authApp(env);
    const device = newDevice();
    const relay = await relayFor(app, 'acme', device);
    const good = idp.sign({ email: 'tamper@demo.example', audience: spEntityId(env.config, 'acme'), acs: acsUrl(env.config, 'acme') });
    // Flip the signed email in the base64 payload.
    const xml = Buffer.from(good, 'base64').toString('utf8').replace('tamper@demo.example', 'attacker@demo.example');
    const acs = await postAcs(app, 'acme', Buffer.from(xml, 'utf8').toString('base64'), relay);
    expect(acs.status).toBe(302);
    expect(new URL(acs.headers.get('location')!).searchParams.get('error')).toBe('oauth_failed');
    expect(cookieOf(acs)).toBe('');
  });

  it('refuses an assertion replay (one-time use)', async () => {
    const idp = newDemoIdp();
    await configure(env, env.a.orgId, idp);
    const app = authApp(env);
    const device = newDevice();
    const relay = await relayFor(app, 'acme', device);
    const resp = idp.sign({ email: 'once@demo.example', audience: spEntityId(env.config, 'acme'), acs: acsUrl(env.config, 'acme') });
    const first = await postAcs(app, 'acme', resp, relay);
    expect(cookieOf(first)).toBeTruthy();
    const second = await postAcs(app, 'acme', resp, relay);
    expect(new URL(second.headers.get('location')!).searchParams.get('error')).toBe('oauth_failed');
    expect(cookieOf(second)).toBe('');
  });

  it('CROSS-ORG: an assertion signed by company A\'s IdP cannot log into company B', async () => {
    const idpA = newDemoIdp();
    const idpB = newDemoIdp(); // same entityId, different signing key
    await configure(env, env.a.orgId, idpA); // acme trusts IdP A
    await configure(env, env.b.orgId, idpB); // beta trusts IdP B
    const app = authApp(env);
    const device = newDevice();

    // A assertion signed by IdP A, addressed to BETA's SP, posted to beta's ACS.
    const relayBeta = await relayFor(app, 'beta', device);
    const forged = idpA.sign({ email: 'intruder@demo.example', audience: spEntityId(env.config, 'beta'), acs: acsUrl(env.config, 'beta') });
    const bad = await postAcs(app, 'beta', forged, relayBeta);
    expect(new URL(bad.headers.get('location')!).searchParams.get('error')).toBe('oauth_failed');
    expect(cookieOf(bad)).toBe('');
    // No user was provisioned in beta.
    const leaked = await env.db.system((q) => q.query('select 1 from users where org_id = $1 and email = $2', [env.b.orgId, 'intruder@demo.example']));
    expect(leaked.length).toBe(0);

    // Beta's own IdP works for beta.
    const relayBeta2 = await relayFor(app, 'beta', newDevice());
    const okResp = idpB.sign({ email: 'betamember@demo.example', audience: spEntityId(env.config, 'beta'), acs: acsUrl(env.config, 'beta') });
    const ok = await postAcs(app, 'beta', okResp, relayBeta2);
    expect(cookieOf(ok)).toBeTruthy();
  });
});
