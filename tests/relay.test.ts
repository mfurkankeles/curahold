// What Salesforce asks of partner apps, on our side of the line: a one-time
// proof with every sign-in (PKCE), one token renewal at a time however many
// server processes want one, and — when a relay is set up — renewals leaving
// from its fixed address. Plus the relay program itself.
import { beforeAll, describe, expect, it } from 'vitest';
import { base64url } from '../api/src/lib/crypto';
import { crmCtx, loadCrm } from '../api/src/sync/engine';
import { isSalesforceToken, viaRelay } from '../api/src/sync/relay';
import { Client, login, setup, type Env } from './helpers';

const TOKEN_URL = 'https://login.salesforce.com/services/oauth2/token';
const RELAY = { url: 'https://relay.curahold.test/', key: 'relay-key-0123456789abcdefghij' };
const INSTALL = 'https://login.salesforce.com/packaging/installPackage.apexp?p0=04tPACKAGEVERSION';

describe('which requests go through the relay', () => {
  it('only Salesforce’s token address counts', () => {
    for (const yes of [TOKEN_URL, 'https://test.salesforce.com/services/oauth2/token', 'https://acme.my.salesforce.com/services/oauth2/token', 'https://acme--uat.sandbox.my.salesforce.com/services/oauth2/token']) expect(isSalesforceToken(yes), yes).toBe(true);
    for (const no of [
      'http://login.salesforce.com/services/oauth2/token',
      'https://login.salesforce.com/services/oauth2/authorize',
      'https://login.salesforce.com/services/data/v62.0/query',
      'https://login.salesforce.com.evil.example/services/oauth2/token',
      'https://evilsalesforce.com/services/oauth2/token',
      'https://user@login.salesforce.com/services/oauth2/token',
      'https://login.salesforce.com:8443/services/oauth2/token',
      'https://login.salesforce.com/services/oauth2/token?next=x',
      'https://api.hubapi.com/oauth/v1/token',
      'not a url',
    ]) expect(isSalesforceToken(no), no).toBe(false);
  });

  it('a token request is sent to the relay with the key and where it was going; everything else goes direct', async () => {
    const seen: { url: string; key: string | null; target: string | null; body: string }[] = [];
    const inner = (async (u: RequestInfo | URL, init: RequestInit = {}) => {
      const h = new Headers(init.headers);
      seen.push({ url: String(u), key: h.get('x-relay-key'), target: h.get('x-relay-target'), body: String(init.body ?? '') });
      return new Response('{}');
    }) as typeof fetch;
    const out = viaRelay(inner, RELAY);
    await out(TOKEN_URL, { method: 'POST', body: 'grant_type=refresh_token' });
    await out('https://acme.my.salesforce.com/services/data/v62.0/sobjects');
    await out(new URL('https://oauth.pipedrive.com/oauth/token'), { method: 'POST' });
    expect(seen).toEqual([
      { url: RELAY.url, key: RELAY.key, target: TOKEN_URL, body: 'grant_type=refresh_token' },
      { url: 'https://acme.my.salesforce.com/services/data/v62.0/sobjects', key: null, target: null, body: '' },
      { url: 'https://oauth.pipedrive.com/oauth/token', key: null, target: null, body: '' },
    ]);
    // No relay set up: the same function, untouched.
    expect(viaRelay(inner, undefined)).toBe(inner);
  });
});

describe('the relay program', () => {
  type Relay = { allowedTarget(u: string): boolean; makeHandler(o: { key?: string; fetcher?: typeof fetch; log?: (l: unknown) => void }): (r: Request) => Promise<Response> };
  let relay: Relay;
  const upstream: { url: string; headers: Record<string, string>; body: string; redirect?: string }[] = [];
  const logs: unknown[] = [];
  let handle: (r: Request) => Promise<Response>;
  const post = (headers: Record<string, string>, body = 'grant_type=refresh_token&refresh_token=r-1') => handle(new Request('http://relay/', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }, body }));

  beforeAll(async () => {
    const path = '../tools/relay/relay.mjs';
    relay = (await import(path)) as Relay;
    handle = relay.makeHandler({
      key: RELAY.key,
      log: (l) => logs.push(l),
      fetcher: (async (u: RequestInfo | URL, init: RequestInit = {}) => {
        upstream.push({ url: String(u), headers: Object.fromEntries(new Headers(init.headers)), body: String(init.body), redirect: init.redirect });
        return new Response('{"access_token":"a-2","refresh_token":"r-2"}', { status: 200, headers: { 'content-type': 'application/json;charset=UTF-8' } });
      }) as typeof fetch,
    });
  });

  it('will not start with a short key', () => {
    expect(() => relay.makeHandler({ key: 'short' })).toThrow(/24/);
    expect(() => relay.makeHandler({})).toThrow(/24/);
  });

  it('passes a Salesforce token request on and returns the answer as it is', async () => {
    const res = await post({ 'x-relay-key': RELAY.key, 'x-relay-target': TOKEN_URL });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ access_token: 'a-2', refresh_token: 'r-2' });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(upstream).toHaveLength(1);
    expect(upstream[0]).toMatchObject({ url: TOKEN_URL, body: 'grant_type=refresh_token&refresh_token=r-1', redirect: 'manual' });
    // Our own key stays here; Salesforce never sees it.
    expect(Object.keys(upstream[0].headers).sort()).toEqual(['accept', 'content-type']);
    // The log says where and how it went, never what was in it.
    expect(logs).toEqual([{ target: 'login.salesforce.com', status: 200 }]);
    expect(JSON.stringify(logs)).not.toMatch(/r-1|a-2|relay-key/);
  });

  it('refuses every other caller, address, method and body', async () => {
    const before = upstream.length;
    expect((await post({ 'x-relay-target': TOKEN_URL })).status).toBe(401);
    expect((await post({ 'x-relay-key': 'relay-key-0123456789abcdefghiX', 'x-relay-target': TOKEN_URL })).status).toBe(401);
    for (const target of ['', 'https://evil.example/services/oauth2/token', 'https://login.salesforce.com.evil.example/services/oauth2/token', 'http://login.salesforce.com/services/oauth2/token', 'https://login.salesforce.com/services/data/v62.0/query', 'https://salesforce.com/services/oauth2/token', 'https://login.salesforce.com/services/oauth2/token?x=1', 'https://169.254.169.254/services/oauth2/token']) {
      expect((await post({ 'x-relay-key': RELAY.key, 'x-relay-target': target })).status, target).toBe(403);
    }
    expect((await handle(new Request('http://relay/', { headers: { 'x-relay-key': RELAY.key, 'x-relay-target': TOKEN_URL } }))).status).toBe(405);
    expect((await handle(new Request('http://relay/elsewhere', { method: 'POST', headers: { 'x-relay-key': RELAY.key, 'x-relay-target': TOKEN_URL } }))).status).toBe(404);
    expect((await handle(new Request('http://relay/', { method: 'POST', headers: { 'content-type': 'application/json', 'x-relay-key': RELAY.key, 'x-relay-target': TOKEN_URL }, body: '{}' }))).status).toBe(415);
    expect((await post({ 'x-relay-key': RELAY.key, 'x-relay-target': TOKEN_URL }, 'x'.repeat(9000))).status).toBe(413);
    expect(upstream.length).toBe(before);
    expect(await (await handle(new Request('http://relay/health'))).text()).toBe('ok');
  });

  it('says so when Salesforce cannot be reached', async () => {
    const down = relay.makeHandler({ key: RELAY.key, fetcher: (async () => Promise.reject(new Error('timeout'))) as unknown as typeof fetch });
    const res = await down(new Request('http://relay/', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-relay-key': RELAY.key, 'x-relay-target': TOKEN_URL }, body: 'a=b' }));
    expect(res.status).toBe(502);
  });
});

describe('signing in to Salesforce and renewing its tokens', () => {
  let env: Env;
  let ada: Client;
  let connId: string;
  const tokenCalls: { via: string; target: string | null; form: Record<string, string> }[] = [];
  let issued = 0;
  let slow: Promise<void> | null = null;

  beforeAll(async () => {
    env = await setup({ connectors: { crm: { salesforce: { clientId: 'sf-client', clientSecret: 'sf-secret' } }, salesforceRelay: RELAY, salesforceInstallUrl: INSTALL } });
    ada = await login(env, 'acme', 'ada@demo.example');
    env.fetchHolder.impl = async (url, init) => {
      const h = new Headers(init?.headers);
      if (url === RELAY.url || url === TOKEN_URL) {
        const form = Object.fromEntries(new URLSearchParams(String(init?.body ?? '')));
        tokenCalls.push({ via: url, target: h.get('x-relay-target'), form });
        if (slow) await slow;
        issued++;
        return Response.json({ access_token: `access-${issued}`, refresh_token: `refresh-${issued}`, instance_url: 'https://acme.my.salesforce.com', id: 'https://login.salesforce.com/id/00Dxx/005xx' });
      }
      if (url.includes('/query?q=')) return Response.json({ records: [{ Name: 'Acme Org' }] });
      if (url.endsWith('/sobjects')) return h.get('authorization') === `Bearer access-${issued}` ? Response.json({ sobjects: [] }) : new Response('[{"message":"Session expired","errorCode":"INVALID_SESSION_ID"}]', { status: 401 });
      return new Response('no stub', { status: 404 });
    };
  });

  it('tells the screen where an administrator installs the package first', async () => {
    const providers = (await ada.get('/api/connections')).json.providers;
    expect(providers.find((p: any) => p.id === 'salesforce')).toMatchObject({ available: true, setup: 'oauth', installUrl: INSTALL });
    expect(providers.filter((p: any) => p.installUrl).map((p: any) => p.id)).toEqual(['salesforce']);
  });

  it('sends a one-time proof with the sign-in and its other half with the exchange', async () => {
    const start = await ada.req('GET', '/api/connect/salesforce/start');
    expect(start.status).toBe(302);
    const to = new URL(start.headers.get('location')!);
    expect(`${to.origin}${to.pathname}`).toBe('https://login.salesforce.com/services/oauth2/authorize');
    const challenge = to.searchParams.get('code_challenge')!;
    expect(to.searchParams.get('code_challenge_method')).toBe('S256');
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const state = to.searchParams.get('state')!;
    const cb = await new Client(env, 'app').req('GET', `/api/connect/callback?code=the-code&state=${encodeURIComponent(state)}`);
    expect(cb.status).toBe(302);
    const back = new URL(cb.headers.get('location')!);
    expect(back.searchParams.get('connected')).toBe('salesforce');
    connId = back.pathname.split('/').pop()!;
    const form = tokenCalls[0].form;
    expect(form).toMatchObject({ grant_type: 'authorization_code', code: 'the-code', client_id: 'sf-client' });
    // The proof matches what was promised at the start…
    expect(base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(form.code_verifier))))).toBe(challenge);
    // …and could not be read out of the address that carried it through the browser.
    expect(state).not.toContain(form.code_verifier);
    expect(Buffer.from(state.split('.')[0], 'base64url').toString('utf8')).not.toContain(form.code_verifier);
    // With a relay set up, the exchange already leaves through it.
    expect(tokenCalls[0]).toMatchObject({ via: RELAY.url, target: TOKEN_URL });
  });

  it('a sign-in whose proof is missing or was tampered with is refused', async () => {
    const start = await ada.req('GET', '/api/connect/salesforce/start');
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
    const before = tokenCalls.length;
    const cb = await new Client(env, 'app').req('GET', `/api/connect/callback?code=the-code&state=${encodeURIComponent(`${state}x`)}`);
    expect(cb.headers.get('location') ?? '').not.toContain('connected=');
    expect(tokenCalls.length).toBe(before);
  });

  it('two processes that both find the token expired renew it once, and both carry on with the new one', async () => {
    const one = (await loadCrm(env.deps, env.a.orgId, connId))!;
    const two = (await loadCrm(env.deps, env.a.orgId, connId))!;
    expect(one.secret).toMatchObject({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    const before = tokenCalls.length;
    let release!: () => void;
    slow = new Promise<void>((r) => (release = r));
    const a = crmCtx(env.deps, one).refresh();
    const b = crmCtx(env.deps, two).refresh();
    await new Promise((r) => setTimeout(r, 30));
    release();
    slow = null;
    expect(await Promise.all([a, b])).toEqual(['access-2', 'access-2']);
    const renewals = tokenCalls.slice(before);
    expect(renewals).toHaveLength(1);
    expect(renewals[0]).toMatchObject({ via: RELAY.url, target: TOKEN_URL, form: { grant_type: 'refresh_token', refresh_token: 'refresh-1', client_id: 'sf-client' } });
    // The new refresh token replaced the old one: the next renewal uses it.
    const three = (await loadCrm(env.deps, env.a.orgId, connId))!;
    expect(three.secret).toMatchObject({ accessToken: 'access-2', refreshToken: 'refresh-2' });
    expect(await crmCtx(env.deps, three).refresh()).toBe('access-3');
    expect(tokenCalls.at(-1)!.form.refresh_token).toBe('refresh-2');
  });

  it('a process still holding the old token picks up the renewed one instead of renewing again', async () => {
    const stale = (await loadCrm(env.deps, env.a.orgId, connId))!;
    const fresh = (await loadCrm(env.deps, env.a.orgId, connId))!;
    expect(await crmCtx(env.deps, fresh).refresh()).toBe('access-4');
    const before = tokenCalls.length;
    // Salesforce turns the old token down; asking again finds the one the other process saved.
    const objects = (await ada.get(`/api/connections/${connId}/objects`)).status;
    expect(objects).toBe(200);
    expect(await crmCtx(env.deps, stale).refresh()).toBe('access-4');
    expect(tokenCalls.length).toBe(before);
  });
});
