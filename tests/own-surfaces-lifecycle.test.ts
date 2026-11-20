// The last integration surfaces run the way a customer's administrator (or, for product mail, the install's operator)
// runs them, with the same lifecycle and timings as the vendor runs in tests/integrations-onboarding.test.ts:
// set up → first use → a change on each side → an expired or rotated secret → a rate limit or retry → a bad payload →
// withdrawn access → reconnect → disconnect. Every outside party is a mock that follows its public protocol:
//   - an MCP client (JSON-RPC 2.0 over HTTP, OAuth 2.1 with PKCE and dynamic registration) for the AI connector;
//   - an OIDC identity provider (authorize → code → token endpoint with client secret → RS256 id_token, JWKS) and a
//     SAML 2.0 identity provider (signed assertions), plus a SCIM 2.0 client (RFC 7644 calls an IdP makes);
//   - a Google Workspace style SMTP relay (EHLO, STARTTLS, AUTH PLAIN, its 4xx/5xx replies) for product mail;
//   - Zapier and Make: REST-hook subscribe/unsubscribe, signed deliveries, 410 Gone, receivers that are down, and
//     their "send a webhook" steps into Curahold's incoming addresses (token and signed), with retries.
// With OWN_TIMINGS=<file> every step's machine time is written there as JSON (the console stays quiet in tests); the human minutes and clicks in
// the report come from the persona model stated there. Security rules get their own explicit checks below.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deliverWebhooks } from '../api/src/lib/webhooks';
import { curaholdSignature } from '../api/src/lib/inboundHooks';
import { SmtpRelayEmail, mailProvider, relayOptions, type SmtpSocket } from '../api/src/lib/smtpRelay';
import { acsUrl, spEntityId } from '../api/src/lib/sso';
import { MemoryEmail } from '../api/src/lib/services';
import { translate } from '../shared/src/i18n';
import { newDemoIdp } from './fixtures/saml-fixtures';
import { newDemoOidp, type DemoOidp } from './fixtures/oidc-fixtures';
import { BASE, Client, login, newDevice, setup, type Env } from './helpers';

// ------------------------------------------------------------------ the run recorder (same shape as tests/vendors/flow.ts)

interface Step {
  step: string;
  ok: boolean;
  ms: number;
  note?: string;
}
const results: Record<string, { steps: Step[]; connectedMs: number; firstUseMs: number }> = {};

function recorder(surface: string) {
  const steps: Step[] = [];
  const t0 = performance.now();
  const row = { steps, connectedMs: 0, firstUseMs: 0 };
  results[surface] = row;
  return {
    async step(name: string, fn: () => Promise<true | string>) {
      const s = performance.now();
      let r: true | string;
      try {
        r = await fn();
      } catch (e) {
        r = (e as Error).message.slice(0, 300);
      }
      steps.push({ step: name, ok: r === true, ms: Math.round(performance.now() - s), ...(r === true ? {} : { note: r }) });
      return r === true;
    },
    connected: () => void (row.connectedMs = Math.round(performance.now() - t0)),
    firstUse: () => void (row.firstUseMs = Math.round(performance.now() - t0)),
    failed: () => steps.filter((s) => !s.ok).map((s) => `${s.step}: ${s.note}`),
  };
}
/** "expected X, got Y" as a step's note, or true. */
const want = (cond: boolean, note: unknown): true | string => (cond ? true : typeof note === 'string' ? note : JSON.stringify(note).slice(0, 300));

let env: Env;
/** The same database and app with request limits at a twentieth, for the rate-limit steps (limits are off elsewhere). */
let tight: Env;
let ada: Client;
let lena: Client;
let sofia: Client;
const at = (slug: string, path: string) => `https://${slug}.${BASE}${path}`;
const cookieOf = (res: Response) => /app_session=([^;]*)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? '';

afterAll(() => {
  if (process.env.OWN_TIMINGS) writeFileSync(process.env.OWN_TIMINGS, JSON.stringify(results, null, 1));
});

beforeAll(async () => {
  env = await setup();
  tight = await setup({ limitScale: 0.05, clientIp: 'cf' });
  ada = await login(env, 'acme', 'ada@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
  sofia = await login(env, 'acme', 'sofia@demo.example');
});

// =================================================================== MCP (the AI connector)

/** An MCP client the way an assistant app implements one: discovery, registration, PKCE sign-in, JSON-RPC calls. */
function mcpClient(e: Env, slug = 'acme') {
  const redirect = 'https://assistant.quillfield.example/oauth/callback';
  const verifier = `mcp-verifier-${Math.random().toString(36).slice(2)}-0123456789abcdef`;
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const form = (path: string, fields: Record<string, string>) =>
    e.app.request(at(slug, path), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() });
  const self: any = {
    clientId: '',
    access: '',
    refresh: '',
    async register() {
      const reg = await e.app.request(at(slug, '/oauth/register'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Quillfield Assistant', redirect_uris: [redirect] }) });
      self.clientId = (await reg.json()).client_id;
      return reg.status;
    },
    /** authorize → the person's consent screen (as `who`) → code → tokens. */
    async signIn(who: Client, write: boolean) {
      const q = new URLSearchParams({ client_id: self.clientId, redirect_uri: redirect, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', state: 'st-1', scope: write ? 'read write' : 'read' });
      const go = await e.app.request(at(slug, `/oauth/authorize?${q}`));
      const req = new URL(go.headers.get('location')!, at(slug, '/')).searchParams.get('req')!;
      const ok = await who.post('/api/oauth/approve', { req, allow: true, write });
      const code = new URL(ok.json.redirect).searchParams.get('code')!;
      const tok = await form('/oauth/token', { grant_type: 'authorization_code', code, client_id: self.clientId, redirect_uri: redirect, code_verifier: verifier });
      const t = await tok.json();
      self.access = t.access_token;
      self.refresh = t.refresh_token;
      return t;
    },
    /** refresh_token grant; the refresh token rotates (`token`: try an older one). */
    async renew(token = self.refresh) {
      const r = await form('/oauth/token', { grant_type: 'refresh_token', refresh_token: token, client_id: self.clientId });
      if (r.status !== 200) return r.status;
      const t = await r.json();
      self.access = t.access_token;
      self.refresh = t.refresh_token;
      return 200;
    },
    raw: (body: string, token = self.access, extra: Record<string, string> = {}) =>
      e.app.request(at(slug, '/mcp'), { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...extra }, body }),
    rpc: async (method: string, params?: unknown, token = self.access) => {
      const res = await self.raw(JSON.stringify({ jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) }), token);
      return { status: res.status, headers: res.headers, json: (await res.json().catch(() => null)) as any };
    },
    call: async (name: string, args: Record<string, unknown> = {}, token = self.access) => (await self.rpc('tools/call', { name, arguments: args }, token)).json?.result,
  };
  return self;
}

describe('MCP: an assistant connected by a person, end to end', () => {
  it('set up → first use → both sides → expired token → rate limit → bad payload → revoked → reconnect → disconnect', async () => {
    const r = recorder('mcp');
    const mcp = mcpClient(env);
    let key = '';
    // Settings → AI assistants → copy the address → in the assistant: Add connector → paste → Connect → Allow (with changes).
    await r.step('discover', async () => {
      const res = await mcp.rpc('initialize', { protocolVersion: '2025-06-18' }, 'nothing');
      const meta = await (await env.app.request(at('acme', '/.well-known/oauth-protected-resource'))).json();
      return want(res.status === 401 && /resource_metadata=/.test(res.headers.get('www-authenticate') ?? '') && meta.authorization_servers?.length === 1, { status: res.status, meta });
    });
    await r.step('register', async () => want((await mcp.register()) === 201 && !!mcp.clientId, mcp.clientId));
    await r.step('sign in and allow', async () => {
      const t = await mcp.signIn(lena, true);
      return want(t.scope === 'read write' && /^cha_/.test(mcp.access), t);
    });
    r.connected();
    await r.step('initialize + tools', async () => {
      const init = await mcp.rpc('initialize', { protocolVersion: '2025-06-18' });
      const tools = (await mcp.rpc('tools/list')).json.result.tools as any[];
      const ro = tools.filter((t) => t.annotations.readOnlyHint).map((t) => t.name);
      return want(init.json.result.serverInfo.name === 'curahold' && ro.includes('search') && tools.some((t) => t.name === 'create_task'), tools.map((t) => t.name));
    });
    await r.step('first answer', async () => {
      const found = await mcp.call('search', { query: 'Cedarmoor' });
      return want(found?.structuredContent?.results?.[0]?.title === 'Cedarmoor Health', found);
    });
    r.firstUse();
    await r.step('a change here is seen there', async () => {
      const board = (await lena.get('/api/boards')).json.boards[0];
      await lena.post('/api/tasks', { boardId: board.id, title: 'Prepare the pilot review for Cedarmoor' });
      const seen = await mcp.call('search', { query: 'pilot review' });
      return want(seen.structuredContent.results.some((x: any) => x.title === 'Prepare the pilot review for Cedarmoor'), seen.structuredContent);
    });
    await r.step('a change there is seen here, as the person, in the audit trail', async () => {
      const made = await mcp.call('add_note', { account: 'Cedarmoor Health', text: 'Call summary: they want the pilot extended by a month.', kind: 'call' });
      const accId = made.structuredContent.url.split('/').pop();
      const tl = JSON.stringify((await ada.get(`/api/accounts/${accId}/timeline`)).json);
      const [a] = await env.db.system((q) => q.query<{ actor_id: string; meta: any }>(`select actor_id, meta from audit_log where action = 'ai.changed' order by at desc limit 1`));
      return want(tl.includes('pilot extended by a month') && a?.actor_id === env.a.ids.lena && a.meta.tool === 'add_note', { a });
    });
    await r.step('expired access token: told to sign in, the refresh renews it', async () => {
      await env.db.system((q) => q.query(`update api_tokens set expires_at = now() - interval '1 minute' where client_id = $1 and revoked_at is null`, [mcp.clientId]));
      const late = await mcp.rpc('ping');
      if (late.status !== 401 || !/resource_metadata=/.test(late.headers.get('www-authenticate') ?? '')) return `expired: ${late.status}`;
      const old = mcp.refresh;
      if ((await mcp.renew()) !== 200) return 'refresh refused';
      const reused = await mcp.renew(old);
      return want((await mcp.rpc('ping')).status === 200 && reused === 400, { reused });
    });
    await r.step('rate limit: a plain 429 with Retry-After, per connection', async () => {
      const busy = mcpClient(tight);
      await busy.register();
      const tl = await login(tight, 'acme', 'lena@demo.example');
      await busy.signIn(tl, false);
      let last: Response | null = null;
      for (let i = 0; i < 6; i++) {
        last = await busy.raw(JSON.stringify({ jsonrpc: '2.0', id: i, method: 'ping' }), busy.access, { 'cf-connecting-ip': '198.51.100.7' });
        if (last?.status === 429) break;
      }
      const body = last ? await last.json() : null;
      return want(last?.status === 429 && Number(last!.headers.get('retry-after')) > 0 && typeof body?.message === 'string' && body.message.length > 10, { status: last?.status, body });
    });
    await r.step('bad payloads: parse error, unknown tool, missing argument, oversized batch', async () => {
      const parse = await mcp.raw('{"jsonrpc":"2.0",');
      const unknown = await mcp.rpc('tools/call', { name: 'delete_everything', arguments: {} });
      const missing = await mcp.call('add_note', { text: 'no customer given' });
      const batch = await mcp.raw(JSON.stringify(Array.from({ length: 50 }, (_, i) => ({ jsonrpc: '2.0', id: i, method: 'tools/call', params: { name: 'list_tasks', arguments: {} } }))));
      const b = await batch.json();
      return want(
        parse.status === 400 && unknown.json.error.code === -32602 && missing.isError === true && !Array.isArray(b) && b.error?.code === -32600,
        { parse: parse.status, unknown: unknown.json, missing, batch: Array.isArray(b) ? `array of ${b.length}` : b },
      );
    });
    await r.step('access withdrawn in Settings: the assistant is turned away at once', async () => {
      const mine = (await lena.get('/api/dev/keys')).json.keys.find((k: any) => k.kind === 'oauth');
      key = mine?.id;
      if (!key) return 'no connected app listed';
      await lena.del(`/api/dev/keys/${key}`);
      return want((await mcp.rpc('ping')).status === 401 && (await mcp.renew()) === 400, 'still answers');
    });
    await r.step('reconnect', async () => {
      await mcp.signIn(lena, true);
      return want((await mcp.call('search', { query: 'Cedarmoor' }))?.isError === false, 'no answer after reconnect');
    });
    await r.step('disconnect', async () => {
      const k = (await lena.get('/api/dev/keys')).json.keys.find((x: any) => x.kind === 'oauth');
      await lena.del(`/api/dev/keys/${k.id}`);
      const gone = !(await lena.get('/api/dev/keys')).json.keys.some((x: any) => x.kind === 'oauth');
      return want(gone && (await mcp.rpc('ping')).status === 401, 'still listed or answering');
    });
    expect(r.failed()).toEqual([]);
  });

  it('read-only stays read-only: a viewer gets no change tools, and neither the tool nor the raw API takes a change', async () => {
    const mcp = mcpClient(env);
    await mcp.register();
    const t = await mcp.signIn(sofia, true);
    expect(t.scope).toBe('read');
    const tools = (await mcp.rpc('tools/list')).json.result.tools as any[];
    expect(tools.every((x) => x.annotations.readOnlyHint)).toBe(true);
    expect((await mcp.call('create_task', { title: 'Should not exist' })).isError).toBe(true);
    const board = (await ada.get('/api/boards')).json.boards[0];
    const direct = await env.app.request(at('acme', '/api/tasks'), { method: 'POST', headers: { authorization: `Bearer ${mcp.access}`, 'content-type': 'application/json' }, body: JSON.stringify({ boardId: board.id, title: 'Should not exist' }) });
    expect(direct.status).toBe(403);
    const [n] = await env.db.system((q) => q.query<{ n: number }>(`select count(*)::int as n from tasks where title = 'Should not exist'`));
    expect(n.n).toBe(0);
  });

  it('runs as the asker: a private board stays out of another person\'s assistant; a token stays in its company', async () => {
    const priv = await ada.post('/api/boards', { name: 'Leadership only', visibility: 'private' });
    expect(priv.status).toBe(201);
    const boardId = priv.json.board?.id ?? (await ada.get('/api/boards')).json.boards.find((b: any) => b.name === 'Leadership only').id;
    const task = (await ada.post('/api/tasks', { boardId, title: 'Quietly review the reorganisation' })).json.task;
    const mcp = mcpClient(env);
    await mcp.register();
    await mcp.signIn(lena, true);
    const found = await mcp.call('search', { query: 'reorganisation' });
    expect(found.structuredContent.results).toEqual([]);
    expect((await mcp.call('fetch', { id: `task:${task.id}` })).isError).toBe(true);
    expect((await mcp.call('update_task', { task_id: task.id, comment: 'seen it' })).isError).toBe(true);
    // The same token at another company's address is unknown there.
    const other = await env.app.request(at('beta', '/mcp'), { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${mcp.access}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }) });
    expect(other.status).toBe(401);
  });
});

// =================================================================== SSO (OIDC, SAML) and SCIM, at the second company

/** An OIDC identity provider following the spec closely enough for the run, with the faults an admin meets. */
function oidcProvider(oidp: DemoOidp) {
  const host = 'https://idp.quillfield.example';
  const codes = new Map<string, { nonce: string; email: string; name: string }>();
  let secret = 'quillfield-client-secret-1';
  let signer: DemoOidp = oidp;
  let keys = oidp.jwks.keys;
  let kid = 'demo-key-1';
  const state = { down: false, busy: 0, claims: {} as Record<string, unknown> };
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
  return {
    host,
    urls: { ssoUrl: `${host}/oauth2/v1/authorize`, tokenUrl: `${host}/oauth2/v1/token`, jwksUrl: `${host}/oauth2/v1/keys` },
    state,
    get secret() {
      return secret;
    },
    /** The admin makes a new client secret at the provider: the old one stops. */
    rotateSecret: () => (secret = `quillfield-client-secret-${Math.random().toString(36).slice(2, 8)}`),
    /** The provider rolls its signing key: the new key is published next to the old one, and signs from now on. */
    async rollKey() {
      signer = await newDemoOidp({ issuer: oidp.issuer, clientId: oidp.clientId });
      kid = 'demo-key-2';
      keys = [...keys, { ...signer.jwks.keys[0], kid }];
    },
    /** The person signs in at the provider: it sends the browser back with a code. */
    consent(authorize: string, who: { email: string; name: string }) {
      const u = new URL(authorize);
      const code = `code-${Math.random().toString(36).slice(2)}`;
      codes.set(code, { nonce: u.searchParams.get('nonce')!, ...who });
      return `${u.searchParams.get('redirect_uri')}?code=${code}&state=${encodeURIComponent(u.searchParams.get('state')!)}`;
    },
    async fetch(url: string, init?: RequestInit): Promise<Response> {
      if (state.down) throw new TypeError('fetch failed: getaddrinfo ENOTFOUND idp.quillfield.example');
      if (url === `${host}/oauth2/v1/keys`) return json({ keys });
      if (url !== `${host}/oauth2/v1/token`) return json({ error: 'not_found' }, 404);
      if (state.busy > 0) {
        state.busy--;
        return new Response(JSON.stringify({ error: 'temporarily_unavailable' }), { status: 429, headers: { 'retry-after': '1', 'content-type': 'application/json' } });
      }
      const f = new URLSearchParams(String(init?.body ?? ''));
      if (f.get('client_secret') !== secret) return json({ error: 'invalid_client', error_description: 'Client authentication failed.' }, 401);
      const c = codes.get(f.get('code') ?? '');
      codes.delete(f.get('code') ?? '');
      if (!c || !f.get('code_verifier')) return json({ error: 'invalid_grant' }, 400);
      return json({ token_type: 'Bearer', id_token: await signer.sign(signer.claims({ nonce: c.nonce, email: c.email, name: c.name, ...state.claims }), { kid }) });
    },
  };
}

describe('SSO with OIDC, SAML and SCIM: the identity team\'s whole run', () => {
  let beta: Client;
  const slug = 'beta';
  const ssoPut = (b: Record<string, unknown>) => beta.put('/api/sso/settings', b);
  /** The browser's trip: Curahold → provider → Curahold, as the person `who`. Returns where it ends and the cookie. */
  async function browserSignIn(idp: ReturnType<typeof oidcProvider>, who: { email: string; name: string }, opts: { test?: boolean; device?: string } = {}) {
    const device = opts.device ?? newDevice();
    const start = await env.app.request(at(slug, `/api/sso/${slug}/start?device=${device}${opts.test ? '&test=1' : ''}`));
    const go = start.headers.get('location') ?? '';
    if (!go.startsWith(idp.urls.ssoUrl)) return { to: new URL(go || at(slug, '/')), cookie: '', device };
    const back = await env.app.request(idp.consent(go, who));
    const loc = back.headers.get('location');
    return { to: new URL(loc ?? at(slug, `/__status_${back.status}`)), cookie: cookieOf(back), device, status: back.status };
  }
  const me = (cookie: string, device: string) => env.app.request(at(slug, '/api/me'), { headers: { cookie: `app_session=${cookie}`, 'x-curahold-device': device } });

  beforeAll(async () => {
    beta = await login(env, 'beta', 'ada@demo.example');
    // The backup administrator needs a second step before SSO can be required (tests/sso-backup.test.ts).
    await env.db.system((q) => q.query(`insert into user_totp (org_id, user_id, secret_sealed, confirmed_at) values ($1, $2, 'sealed-for-test', now()) on conflict do nothing`, [env.b.orgId, env.b.ids.ada]));
  });

  it('OIDC: set up → test → require → first sign-in → rotated secret → rolled key → provider down → bad tokens → rate limit → removed person → reconnect → off', async () => {
    const r = recorder('sso-oidc');
    const oidp = await newDemoOidp({ issuer: 'https://idp.quillfield.example', clientId: 'curahold-beta' });
    const idp = oidcProvider(oidp);
    env.fetchHolder.impl = (u, i) => idp.fetch(u, i);
    const details = () => ({ protocol: 'oidc', issuer: oidp.issuer, ...idp.urls, clientId: oidp.clientId, clientSecret: idp.secret, attrEmail: 'email', attrName: 'name' });
    // Settings → Single sign-on → OpenID Connect → paste 5 values → Save → Test sign-in → (provider) sign in → Require → choose backup → Save.
    await r.step('save details (off)', async () => want((await ssoPut({ ...details(), enabled: false })).status === 200, 'refused'));
    await r.step('test sign-in', async () => {
      const t = await browserSignIn(idp, { email: 'it@beta.example', name: 'IT Desk' }, { test: true });
      return want(t.to.pathname === '/settings/sso' && t.to.searchParams.get('ssoTest') === 'ok' && !t.cookie, t.to.toString());
    });
    await r.step('require, with a backup administrator', async () => {
      const res = await ssoPut({ ...details(), enabled: true, enforced: true, backupAdminIds: [env.b.ids.ada] });
      return want(res.status === 200 && (await (await env.app.request(at(slug, `/api/sso/${slug}/info`))).json()).enforced === true, res.json);
    });
    r.connected();
    let first = { cookie: '', device: '' };
    await r.step('first sign-in provisions the person and the session works', async () => {
      const t = await browserSignIn(idp, { email: 'deniz@beta.example', name: 'Deniz Ova' });
      first = t;
      const m = await me(t.cookie, t.device);
      return want(t.to.pathname === '/' && m.status === 200 && (await m.json()).user.email === 'deniz@beta.example', t.to.toString());
    });
    r.firstUse();
    await r.step('required means required: the emailed link is refused for everyone but the backup', async () => {
      const c = new Client(env, slug);
      const res = await c.post('/api/auth/start', { email: 'deniz@beta.example' });
      return want(res.status === 403 && res.json.error === 'sso_required' && !res.json.devToken && typeof res.json.message === 'string', res);
    });
    await r.step('client secret rotated at the provider: sign-in refused, the test names the secret', async () => {
      idp.rotateSecret();
      const t = await browserSignIn(idp, { email: 'deniz@beta.example', name: 'Deniz Ova' });
      const test = await browserSignIn(idp, { email: 'it@beta.example', name: 'IT Desk' }, { test: true });
      return want(t.to.pathname === '/login' && !t.cookie && test.to.searchParams.get('ssoTest') === 'bad_secret', { login: t.to.toString(), test: test.to.toString() });
    });
    await r.step('paste the new secret: works again (no new test needed while required)', async () => {
      const res = await ssoPut({ ...details(), enabled: true, enforced: true });
      const t = await browserSignIn(idp, { email: 'deniz@beta.example', name: 'Deniz Ova' });
      return want(res.status === 200 && !!t.cookie, { res: res.json, to: t.to.toString() });
    });
    await r.step('signing key rolled at the provider: nothing to do here', async () => {
      await idp.rollKey();
      const t = await browserSignIn(idp, { email: 'deniz@beta.example', name: 'Deniz Ova' });
      return want(!!t.cookie, t.to.toString());
    });
    await r.step('provider unreachable: back on the sign-in page, never an error page', async () => {
      idp.state.down = true;
      const device = newDevice();
      const start = await env.app.request(at(slug, `/api/sso/${slug}/start?device=${device}`));
      const back = await env.app.request(idp.consent(start.headers.get('location')!, { email: 'deniz@beta.example', name: 'Deniz Ova' }));
      const tstart = await env.app.request(at(slug, `/api/sso/${slug}/start?device=${device}&test=1`));
      const tback = await env.app.request(idp.consent(tstart.headers.get('location')!, { email: 'it@beta.example', name: 'IT Desk' }));
      idp.state.down = false;
      const loc = back.headers.get('location') ?? '';
      const tloc = new URL(tback.headers.get('location') ?? at(slug, '/'));
      return want(back.status === 302 && loc.includes('/login?error=') && tloc.searchParams.get('ssoTest') === 'idp_unreachable', { status: back.status, loc, test: tloc.toString() });
    });
    await r.step('provider busy (429 from its token endpoint): refused plainly, the next try works', async () => {
      idp.state.busy = 1;
      const t = await browserSignIn(idp, { email: 'deniz@beta.example', name: 'Deniz Ova' });
      const again = await browserSignIn(idp, { email: 'deniz@beta.example', name: 'Deniz Ova' });
      return want(t.status === 302 && !t.cookie && !!again.cookie, { first: t.to.toString() });
    });
    await r.step('bad tokens: another app\'s, expired, unverified email', async () => {
      const outcomes: string[] = [];
      for (const claims of [{ aud: 'someone-else' }, { exp: Math.floor(Date.now() / 1000) - 600 }, { email_verified: false }]) {
        idp.state.claims = claims;
        const t = await browserSignIn(idp, { email: 'deniz@beta.example', name: 'Deniz Ova' });
        outcomes.push(t.cookie ? 'signed in' : t.to.searchParams.get('error') ?? '?');
      }
      idp.state.claims = {};
      return want(outcomes.every((o) => o !== 'signed in'), outcomes);
    });
    await r.step('rate limit on the sign-in door: a plain 429', async () => {
      const go = (ip: string) => tight.app.request(at(slug, `/api/sso/${slug}/start?device=${newDevice()}`), { headers: { 'cf-connecting-ip': ip } });
      let last = 0;
      for (let i = 0; i < 4 && last !== 429; i++) last = (await go('203.0.113.9')).status;
      return want(last === 429, `last status ${last}`);
    });
    await r.step('person removed in the provider (SCIM deactivate): session ends, sign-in refused', async () => {
      const tok = (await beta.post('/api/sso/settings/scim-token', {})).json.token;
      const scim = (m: string, p: string, b?: unknown) => env.app.request(at(slug, `/api/scim/v2${p}`), { method: m, headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/scim+json' }, body: b ? JSON.stringify(b) : undefined });
      const u = (await (await scim('GET', `/Users?filter=${encodeURIComponent('userName eq "deniz@beta.example"')}`)).json()).Resources[0];
      await scim('PATCH', `/Users/${u.id}`, { schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'], Operations: [{ op: 'replace', path: 'active', value: false }] });
      const live = await me(first.cookie, first.device);
      const t = await browserSignIn(idp, { email: 'deniz@beta.example', name: 'Deniz Ova' });
      await scim('PATCH', `/Users/${u.id}`, { schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'], Operations: [{ op: 'replace', path: 'active', value: true }] });
      return want(live.status === 401 && !t.cookie && t.to.searchParams.get('error') === 'no_account', { live: live.status, to: t.to.toString() });
    });
    await r.step('off: the emailed link works again', async () => {
      const res = await ssoPut({ ...details(), enabled: false, enforced: false });
      const c = new Client(env, slug);
      const link = await c.post('/api/auth/start', { email: 'deniz@beta.example' });
      return want(res.status === 200 && !!link.json.devToken, link.json);
    });
    expect(r.failed()).toEqual([]);
  });

  it('SAML: set up → test → first sign-in → certificate renewed at the provider → replay, expired, forged → paste new certificate → off', async () => {
    const r = recorder('sso-saml');
    const idp = newDemoIdp('https://idp.quillfield.example/saml');
    const cfg = env.config;
    const details = (cert: string) => ({ protocol: 'saml', issuer: idp.entityId, ssoUrl: 'https://idp.quillfield.example/saml/sso', cert, attrEmail: 'email', attrName: 'displayName' });
    const post = (resp: string, relay: string) => env.app.request(at(slug, `/api/sso/${slug}/saml/acs`), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ SAMLResponse: resp, RelayState: relay }).toString() });
    const relay = async (test = false) => new URL((await env.app.request(at(slug, `/api/sso/${slug}/start?device=${newDevice()}${test ? '&test=1' : ''}`))).headers.get('location')!).searchParams.get('RelayState')!;
    const assertion = (signer = idp, extra: Record<string, unknown> = {}) => signer.sign({ email: 'samlperson@beta.example', name: 'Saml Person', audience: spEntityId(cfg, slug), acs: acsUrl(cfg, slug), ...extra });
    // Settings → Single sign-on → SAML → copy the two addresses into the provider → paste issuer, address, certificate → Save → Test sign-in.
    await r.step('save details (off), metadata served', async () => {
      const res = await ssoPut({ ...details(idp.certBase64), enabled: false });
      const meta = await env.app.request(at(slug, `/api/sso/${slug}/saml/metadata`));
      return want(res.status === 200 && (await meta.text()).includes(acsUrl(cfg, slug)), res.json);
    });
    await r.step('test sign-in', async () => {
      const back = await post(assertion(), await relay(true));
      return want(new URL(back.headers.get('location')!).searchParams.get('ssoTest') === 'ok', back.headers.get('location'));
    });
    await r.step('switch on', async () => want((await ssoPut({ ...details(idp.certBase64), enabled: true })).status === 200, 'refused'));
    r.connected();
    await r.step('first sign-in', async () => {
      const back = await post(assertion(), await relay());
      return want(!!cookieOf(back) && new URL(back.headers.get('location')!).pathname === '/', back.headers.get('location'));
    });
    r.firstUse();
    await r.step('the same assertion again is refused (replay)', async () => {
      const once = assertion();
      await post(once, await relay());
      const again = await post(once, await relay());
      return want(!cookieOf(again), 'replay signed in');
    });
    await r.step('an expired assertion is refused', async () => {
      const old = assertion(idp, { now: Date.now() - 3_600_000, notOnOrAfterMs: Date.now() - 1_800_000 });
      return want(!cookieOf(await post(old, await relay())), 'expired signed in');
    });
    const renewed = newDemoIdp('https://idp.quillfield.example/saml');
    await r.step('certificate renewed at the provider: refused, and the test says it is the certificate', async () => {
      const back = await post(assertion(renewed), await relay());
      const test = await post(assertion(renewed), await relay(true));
      return want(!cookieOf(back) && new URL(test.headers.get('location')!).searchParams.get('ssoTest') === 'bad_signature', test.headers.get('location'));
    });
    await r.step('paste the new certificate: works; the old one no longer does', async () => {
      await ssoPut({ ...details(renewed.certBase64), enabled: true });
      const ok = await post(assertion(renewed), await relay());
      const old = await post(assertion(idp), await relay());
      return want(!!cookieOf(ok) && !cookieOf(old), 'certificate swap');
    });
    await r.step('off', async () => {
      await ssoPut({ ...details(renewed.certBase64), enabled: false });
      const start = await env.app.request(at(slug, `/api/sso/${slug}/start?device=${newDevice()}`));
      return want(new URL(start.headers.get('location')!).searchParams.get('error') === 'not_configured', start.headers.get('location'));
    });
    expect(r.failed()).toEqual([]);
  });

  it('SCIM: token → push people → edit on each side → bad payloads → deactivate ends access → rotated token → off', async () => {
    const r = recorder('scim');
    let tok = '';
    let base = '';
    const scim = (m: string, p: string, b?: unknown, t = tok) =>
      env.app.request(`${base}${p}`, { method: m, headers: { authorization: `Bearer ${t}`, 'content-type': 'application/scim+json' }, body: b === undefined ? undefined : typeof b === 'string' ? b : JSON.stringify(b) });
    let id = '';
    // Settings → Single sign-on → Provisioning → Make a token → copy address and token into the provider → Test connection.
    await r.step('make a token', async () => {
      const res = await beta.post('/api/sso/settings/scim-token', {});
      tok = res.json.token;
      base = res.json.baseUrl;
      return want(res.status === 200 && /\/api\/scim\/v2$/.test(base), res.json);
    });
    await r.step('provider tests the connection', async () => {
      const cfgRes = await scim('GET', '/ServiceProviderConfig');
      const list = await scim('GET', '/Users?count=1');
      return want(cfgRes.status === 200 && list.status === 200, { a: cfgRes.status, b: list.status });
    });
    r.connected();
    await r.step('first person pushed', async () => {
      const res = await scim('POST', '/Users', { schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], userName: 'mira@beta.example', name: { givenName: 'Mira', familyName: 'Tan' }, emails: [{ value: 'mira@beta.example', primary: true }], active: true });
      const b = await res.json();
      id = b.id;
      const people = JSON.stringify((await beta.get('/api/admin/users')).json);
      return want(res.status === 201 && people.includes('mira@beta.example'), b);
    });
    r.firstUse();
    await r.step('renamed in the provider', async () => {
      await scim('PATCH', `/Users/${id}`, { schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'], Operations: [{ op: 'replace', path: 'name.givenName', value: 'Mira' }, { op: 'replace', path: 'name.familyName', value: 'Tan-Ova' }] });
      const got = await (await scim('GET', `/Users/${id}`)).json();
      return want(JSON.stringify(got).includes('Tan-Ova'), got);
    });
    await r.step('renamed here, the provider reads it', async () => {
      const res = await beta.patch(`/api/admin/users/${id}`, { name: 'Mira Tan Ova' });
      const got = await (await scim('GET', `/Users/${id}`)).json();
      return want(res.status === 200 && JSON.stringify(got).includes('Mira Tan Ova'), { res: res.json, got });
    });
    await r.step('bad payloads: not JSON, no userName, twice the same person', async () => {
      const a = await scim('POST', '/Users', '{"userName":');
      const b = await scim('POST', '/Users', { schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'] });
      const c = await scim('POST', '/Users', { schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], userName: 'mira@beta.example' });
      const ja = await a.json();
      return want(a.status === 400 && ja.scimType === 'invalidSyntax' && b.status === 400 && c.status === 409, [a.status, b.status, c.status]);
    });
    await r.step('deactivated in the provider: sessions and keys stop at once', async () => {
      const mira = await login(env, 'beta', 'mira@beta.example');
      const key = (await mira.post('/api/dev/keys', { name: 'Mira script' })).json.token;
      // As Entra ID sends it: capitalised op, the boolean as a string.
      await scim('PATCH', `/Users/${id}`, { schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'], Operations: [{ op: 'Replace', path: 'active', value: 'False' }] });
      const s = await mira.get('/api/me');
      const k = await env.app.request(at(slug, '/api/me'), { headers: { authorization: `Bearer ${key}` } });
      const again = await new Client(env, slug).post('/api/auth/start', { email: 'mira@beta.example' });
      return want(s.status === 401 && k.status === 401 && !again.json.devToken, { session: s.status, key: k.status, link: again.json });
    });
    await r.step('token rotated: the old one is refused, the new one works', async () => {
      const old = tok;
      tok = (await beta.post('/api/sso/settings/scim-token', {})).json.token;
      return want((await scim('GET', '/Users', undefined, old)).status === 401 && (await scim('GET', '/Users')).status === 200, 'rotation');
    });
    await r.step('another company\'s token sees nothing here', async () => {
      const acmeTok = (await ada.post('/api/sso/settings/scim-token', {})).json.token;
      const res = await scim('GET', `/Users/${id}`, undefined, acmeTok);
      const list = await (await scim('GET', '/Users', undefined, acmeTok)).json();
      return want(res.status === 404 && !JSON.stringify(list).includes('mira@beta.example'), res.status);
    });
    await r.step('provisioning off: the token stops', async () => {
      const cur = (await beta.get('/api/sso/settings')).json.config;
      await ssoPut({ protocol: cur.protocol, issuer: cur.issuer ?? '', ssoUrl: cur.ssoUrl ?? '', enabled: false, scimEnabled: false });
      return want((await scim('GET', '/Users')).status === 401, 'still answers');
    });
    expect(r.failed()).toEqual([]);
  });
});

// =================================================================== product mail through the SMTP relay

/** A relay that answers like smtp-relay.gmail.com; `script` decides the reply to each command, once or for good. */
function relay() {
  const state = { password: 'app-password-1', said: [] as string[], messages: [] as string[], once: [] as { at: string; reply: string }[], connections: 0 };
  const open = async (): Promise<SmtpSocket> => {
    state.connections++;
    const queue = ['220 smtp-relay.gmail.com ESMTP ready\r\n'];
    let tls = false;
    let inData = false;
    let data = '';
    let pending = '';
    let authUser = '';
    const answer = (line: string) => {
      if (inData) {
        if (line === '.') {
          inData = false;
          state.messages.push(data);
          data = '';
          queue.push('250 2.0.0 OK queued\r\n');
        } else data += line + '\r\n';
        return;
      }
      const cmd = line.split(/[ :]/)[0].toUpperCase();
      state.said.push(cmd);
      const forced = state.once.findIndex((o) => o.at === cmd);
      if (forced >= 0) {
        queue.push(state.once.splice(forced, 1)[0].reply + '\r\n');
        return;
      }
      if (cmd === 'EHLO') queue.push(`250-smtp-relay.gmail.com\r\n${tls ? '' : '250-STARTTLS\r\n'}250 AUTH PLAIN LOGIN\r\n`);
      else if (cmd === 'STARTTLS') queue.push('220 2.0.0 Ready to start TLS\r\n');
      else if (cmd === 'AUTH') {
        const [, user, pass] = Buffer.from(line.split(' ')[2] ?? '', 'base64').toString('utf8').split('\u0000');
        authUser = user;
        queue.push(tls && pass === state.password ? '235 2.7.0 Accepted\r\n' : '535 5.7.8 Username and Password not accepted. Learn more at https://support.google.com/mail/?p=BadCredentials\r\n');
      } else if (cmd === 'MAIL' || cmd === 'RCPT') queue.push(authUser ? '250 2.1.0 OK\r\n' : '530 5.7.0 Authentication Required\r\n');
      else if (cmd === 'DATA') {
        inData = true;
        queue.push('354 Go ahead\r\n');
      } else if (cmd === 'QUIT') queue.push('221 2.0.0 closing connection\r\n');
      else queue.push('502 5.5.1 Unrecognized command\r\n');
    };
    const sock = (): SmtpSocket => ({
      read: async () => queue.shift() ?? null,
      write: async (t) => {
        pending += t;
        const lines = pending.split('\r\n');
        pending = lines.pop()!;
        lines.forEach(answer);
      },
      startTls: async () => {
        tls = true;
        return sock();
      },
      close: async () => undefined,
    });
    return sock();
  };
  return { state, open };
}

describe('product mail through the workspace SMTP relay (the operator\'s run)', () => {
  it('set up → first mail → sender changed → app password rotated → relay busy → refused recipient → reconnect → off', async () => {
    const r = recorder('mail-relay');
    const smtp = relay();
    const kept = env.deps.email;
    const mailEnv = { SMTP_RELAY_USER: 'no-reply@quillfield.example', SMTP_RELAY_PASSWORD: 'app-password-1', EMAIL_FROM: 'Quillfield <no-reply@quillfield.example>' };
    const use = (e: Record<string, string>) => void ((env.deps as any).email = new SmtpRelayEmail(relayOptions(e), smtp.open, { pauseMs: 0 }));
    // Sign-in links per address are capped (5 in 15 minutes): each step starts from a clean count, as a new person would.
    const fresh = (email: string) => env.db.system((q) => q.query('delete from login_tokens where email = $1', [email]));
    const askLink = async (email = 'lena@demo.example') => {
      await fresh(email);
      return new Client(env, 'acme').post('/api/auth/start', { email });
    };
    try {
      // Workspace admin: Gmail → Routing → SMTP relay (require auth + TLS); app password for the sender; set 3 secrets; redeploy.
      await r.step('the relay is chosen from the settings', async () => want(mailProvider(mailEnv) === 'google_relay', mailProvider(mailEnv)));
      use(mailEnv);
      r.connected();
      await r.step('first mail: a sign-in link over STARTTLS with sign-in', async () => {
        const res = await askLink();
        const msg = smtp.state.messages.at(-1) ?? '';
        const order = smtp.state.said.join(' ');
        return want(res.status === 200 && /EHLO STARTTLS EHLO AUTH MAIL RCPT DATA/.test(order) && msg.includes('From: Quillfield <no-reply@quillfield.example>') && msg.includes('To: lena@demo.example'), { status: res.status, order });
      });
      r.firstUse();
      await r.step('sender name changed in the settings', async () => {
        use({ ...mailEnv, EMAIL_FROM: 'Quillfield Team <no-reply@quillfield.example>' });
        await askLink();
        return want((smtp.state.messages.at(-1) ?? '').includes('From: Quillfield Team <no-reply@quillfield.example>'), 'old sender');
      });
      await r.step('app password rotated in Workspace: a plain answer, not an error page, and no secret in it', async () => {
        smtp.state.password = 'app-password-2';
        const res = await askLink();
        const words = JSON.stringify(res.json);
        return want(res.status === 503 && res.json.error === 'mail_unavailable' && !/app-password|535|BadCredentials/.test(words) && typeof res.json.message === 'string', res);
      });
      await r.step('a Turkish person gets the same answer in Turkish', async () => {
        const res = await (await fresh('ada@demo.example'), new Client(env, 'beta').post('/api/auth/start', { email: 'ada@demo.example' }));
        return want(res.status === 503 && res.json.message === translate('tr', 'errors.mail_unavailable'), res.json);
      });
      await r.step('reconnect: the new app password', async () => {
        use({ ...mailEnv, SMTP_RELAY_PASSWORD: 'app-password-2' });
        return want((await askLink()).status === 200, 'still refused');
      });
      await r.step('relay busy (421 4.7.0 try again later): sent on the next try, once', async () => {
        const before = smtp.state.messages.length;
        smtp.state.once.push({ at: 'MAIL', reply: '421 4.7.0 Try again later, closing connection.' });
        const res = await askLink();
        return want(res.status === 200 && smtp.state.messages.length === before + 1, { status: res.status, sent: smtp.state.messages.length - before });
      });
      await r.step('daily limit reached (550 5.4.5): not retried, a plain answer', async () => {
        const conns = smtp.state.connections;
        smtp.state.once.push({ at: 'MAIL', reply: '550 5.4.5 Daily user sending limit exceeded.' });
        const res = await askLink();
        return want(res.status === 503 && smtp.state.connections === conns + 1, { status: res.status, tries: smtp.state.connections - conns });
      });
      await r.step('a refused recipient (550 5.1.1): not retried, a plain answer', async () => {
        const conns = smtp.state.connections;
        smtp.state.once.push({ at: 'RCPT', reply: "550 5.1.1 The email account that you tried to reach does not exist." });
        const res = await askLink();
        return want(res.status === 503 && smtp.state.connections === conns + 1, { status: res.status, tries: smtp.state.connections - conns });
      });
      await r.step('off: mail goes to the log, and setup health says nothing is delivered', async () => {
        const off = { ...mailEnv, EMAIL_PROVIDER: 'console' };
        (env.deps as any).email = new MemoryEmail();
        const res = await askLink();
        return want(mailProvider(off) === 'console' && res.status === 200 && (env.deps.email as MemoryEmail).delivers === false, mailProvider(off));
      });
    } finally {
      (env.deps as any).email = kept;
    }
    expect(r.failed()).toEqual([]);
  });
});

// =================================================================== Zapier and Make

/** A Zapier or Make catch-hook: records signed deliveries; can be down, or gone (410, the Zap was deleted). */
function catcher(url: string) {
  const got: { body: any; sig: string | null }[] = [];
  const state = { mode: 'ok' as 'ok' | 'down' | 'gone' };
  return {
    url,
    got,
    state,
    answer(u: string, init?: RequestInit): Response | null {
      if (u !== url) return null;
      if (state.mode === 'down') return new Response('Service Unavailable', { status: 503 });
      if (state.mode === 'gone') return new Response(JSON.stringify({ status: 'error', message: 'The hook was removed.' }), { status: 410 });
      got.push({ body: JSON.parse(String(init?.body)), sig: new Headers(init?.headers).get('curahold-signature') });
      return new Response(JSON.stringify({ status: 'success', attempt: 'a1', id: 'r1', request_id: 'q1' }), { headers: { 'content-type': 'application/json' } });
    },
  };
}

describe('Zapier and Make: automations out of Curahold and into it', () => {
  const zap = catcher('https://hooks.zapier.com/hooks/standard/1234567/abcdef1/');
  const make = catcher('https://hook.eu2.make.com/quillfieldscenario0001');
  let key = '';
  const asKey = (method: string, path: string, body?: unknown, k = key, e = env) =>
    Promise.resolve(e.app.request(at('acme', `/api${path}`), { method, headers: { authorization: `Bearer ${k}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })).then(async (res: Response) => ({ status: res.status, headers: res.headers, json: (await res.json().catch(() => null)) as any }));
  const flush = async () => {
    await env.settle();
    await deliverWebhooks(env.deps, 50);
  };
  const due = () => env.db.system((q) => q.query(`update webhook_events set next_at = now() where state = 'pending'`));

  beforeAll(() => {
    env.fetchHolder.impl = async (u, i) => zap.answer(u, i) ?? make.answer(u, i) ?? new Response('no', { status: 404 });
  });

  it('out: key → test → subscribe → event → edit → both sides → receiver down → 410 → bad payload → rate limit → revoked key → reconnect → unsubscribe', async () => {
    const r = recorder('zapier-make-out');
    let zapHook = '';
    let makeHook = '';
    let taskId = '';
    // Settings → Developers → New key (can make changes) → copy → in Zapier: Connect Curahold → paste company address + key → Yes, continue.
    await r.step('make a key and connect (Zapier\'s connection test)', async () => {
      const made = await ada.post('/api/dev/keys', { name: 'Zapier', canWrite: true });
      key = made.json.token;
      const test = await asKey('GET', '/me');
      return want(made.status === 201 && test.status === 200 && test.json.org.name, test.json);
    });
    r.connected();
    await r.step('a Zap and a Make scenario subscribe (REST hooks)', async () => {
      const a = await asKey('POST', '/dev/webhooks', { url: zap.url, events: ['task.created', 'task.updated'] });
      const b = await asKey('POST', '/dev/webhooks', { url: make.url, events: ['task.created'] });
      zapHook = a.json.webhook?.id;
      makeHook = b.json.webhook?.id;
      return want(a.status === 201 && b.status === 201 && !!zapHook && !!makeHook, [a.json, b.json]);
    });
    await r.step('a task made here reaches both, signed, once each', async () => {
      const board = (await ada.get('/api/boards')).json.boards[0];
      taskId = (await ada.post('/api/tasks', { boardId: board.id, title: 'Send the onboarding pack' })).json.task.id;
      await flush();
      const z = zap.got.filter((g) => g.body.data?.id === taskId);
      const m = make.got.filter((g) => g.body.data?.id === taskId);
      return want(z.length === 1 && m.length === 1 && /^t=\d+,v1=[0-9a-f]{64}$/.test(z[0].sig ?? ''), { zap: z.length, make: m.length });
    });
    r.firstUse();
    await r.step('the Zap\'s action changes the task: seen here', async () => {
      const t = (await ada.get(`/api/tasks/${taskId}`)).json.task;
      const res = await asKey('PATCH', `/tasks/${taskId}`, { baseVersion: t.version, priority: 'high' });
      return want(res.status === 200 && (await ada.get(`/api/tasks/${taskId}`)).json.task.priority === 'high', res.json);
    });
    await r.step('Make is down: retried later, and the Zap is not sent the same event twice', async () => {
      make.state.mode = 'down';
      const board = (await ada.get('/api/boards')).json.boards[0];
      const id = (await ada.post('/api/tasks', { boardId: board.id, title: 'Book the kickoff call' })).json.task.id;
      await flush();
      make.state.mode = 'ok';
      await due();
      await flush();
      const z = zap.got.filter((g) => g.body.data?.id === id && g.body.event === 'task.created').length;
      const m = make.got.filter((g) => g.body.data?.id === id).length;
      return want(z === 1 && m === 1, { zap: z, make: m });
    });
    await r.step('the Zap was deleted without unsubscribing (410 Gone): its hook is turned off at once', async () => {
      zap.state.mode = 'gone';
      const board = (await ada.get('/api/boards')).json.boards[0];
      await ada.post('/api/tasks', { boardId: board.id, title: 'Ask for the logo files' });
      await flush();
      zap.state.mode = 'ok';
      const hooks = (await ada.get('/api/dev/webhooks')).json.webhooks as any[];
      const z = hooks.find((h) => h.id === zapHook);
      const pending = await env.db.system((q) => q.query(`select count(*)::int as n from webhook_events where state = 'pending'`));
      return want(z && z.active === false && z.lastStatus === 410 && pending[0].n === 0, { z, pending: pending[0].n });
    });
    await r.step('bad payloads from the Zap: plain words, the field named', async () => {
      const res = await asKey('POST', '/tasks', { title: '' });
      return want(res.status === 400 && typeof res.json.message === 'string' && !/zod|stack|undefined/i.test(res.json.message), res.json);
    });
    await r.step('rate limit: 429 with Retry-After (Zapier and Make wait and retry)', async () => {
      const tk = (await (await login(tight, 'acme', 'ada@demo.example')).post('/api/dev/keys', { name: 'Busy Zap' })).json.token;
      let last: any = null;
      for (let i = 0; i < 40; i++) {
        last = await asKey('GET', '/boards', undefined, tk, tight);
        if (last.status === 429) break;
      }
      return want(last.status === 429 && Number(last.headers.get('retry-after')) > 0, last.status);
    });
    await r.step('key revoked: the automations stop at once', async () => {
      const id = (await ada.get('/api/dev/keys')).json.keys.find((k: any) => k.name === 'Zapier').id;
      await ada.del(`/api/dev/keys/${id}`);
      return want((await asKey('GET', '/me')).status === 401, 'still works');
    });
    await r.step('reconnect with a new key, turn the Zap back on (subscribes again)', async () => {
      key = (await ada.post('/api/dev/keys', { name: 'Zapier', canWrite: true })).json.token;
      const a = await asKey('POST', '/dev/webhooks', { url: zap.url, events: ['task.created'] });
      zapHook = a.json.webhook?.id;
      return want(a.status === 201, a.json);
    });
    await r.step('unsubscribe both: nothing is sent after', async () => {
      const a = await asKey('DELETE', `/dev/webhooks/${zapHook}`);
      const b = await asKey('DELETE', `/dev/webhooks/${makeHook}`);
      const before = zap.got.length + make.got.length;
      const board = (await ada.get('/api/boards')).json.boards[0];
      await ada.post('/api/tasks', { boardId: board.id, title: 'After the Zap was turned off' });
      await flush();
      return want(a.status === 200 && b.status === 200 && zap.got.length + make.got.length === before, 'still sent');
    });
    expect(r.failed()).toEqual([]);
  });

  it('in: a Zap\'s "Webhooks" step and a Make HTTP module post into Curahold, with retries, replays, rotation and removal', async () => {
    const r = recorder('zapier-make-in');
    const account = (await ada.post('/api/accounts', { name: 'Brightwell Optics' })).json.account.id;
    const contactType = (await ada.get('/api/record-types')).json.types.find((t: any) => t.kind === 'contact') ?? (await ada.post('/api/record-types', { kind: 'contact' })).json.type;
    await ada.post('/api/records', { typeId: contactType.id, accountId: account, name: 'Iris Brightwell', fields: { email: 'iris@brightwell.example' } });
    const send = (url: string, body: string, headers: Record<string, string> = {}, e = env) => Promise.resolve(e.app.request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body })).then(async (res: Response) => ({ status: res.status, headers: res.headers, json: (await res.json().catch(() => null)) as any }));
    let zapIn: any;
    let makeIn: any;
    const now = () => Math.floor(Date.now() / 1000);
    // Settings → Data sources → Incoming webhook → "Your own tool" → choose board → Create → copy address and token → paste in the Zap's Webhooks step.
    await r.step('make the two addresses (Zapier: token, Make: signed)', async () => {
      const z = await ada.post('/api/inbound-hooks', { name: 'Zapier: form answers', recipe: 'custom', mapping: { externalId: '{{id}}', title: '{{title}}', status: '{{state}}', doneWords: 'done', customer: { email: '{{email}}' }, boardId: env.a.boards.csBoard } });
      const m = await ada.post('/api/inbound-hooks', { name: 'Make: call notes', recipe: 'curahold' });
      zapIn = z.json.hook;
      makeIn = m.json.hook;
      return want(z.status === 201 && m.status === 201 && !!zapIn.secret && /^whsec_/.test(makeIn.secret), [z.json, m.json]);
    });
    r.connected();
    let taskId = '';
    await r.step('first delivery from the Zap becomes a task for the customer', async () => {
      const res = await send(zapIn.url, JSON.stringify({ id: 'zap-77', title: 'Call back about the invoice', state: 'open', email: 'iris@brightwell.example' }), { 'x-curahold-token': zapIn.secret });
      taskId = res.json?.result?.id;
      return want(res.status === 200 && res.json.result?.how === 'created', res.json);
    });
    r.firstUse();
    await r.step('Zapier retries the same delivery: nothing doubled', async () => {
      await send(zapIn.url, JSON.stringify({ id: 'zap-77', title: 'Call back about the invoice', state: 'open', email: 'iris@brightwell.example' }), { 'x-curahold-token': zapIn.secret });
      const rows = await env.db.system((q) => q.query(`select count(*)::int as n from tasks where title = 'Call back about the invoice' and org_id = $1`, [env.a.orgId]));
      return want(rows[0].n === 1, rows[0]);
    });
    await r.step('the source changes the item: the task follows (done)', async () => {
      const res = await send(zapIn.url, JSON.stringify({ id: 'zap-77', title: 'Call back about the invoice', state: 'done', email: 'iris@brightwell.example' }), { 'x-curahold-token': zapIn.secret });
      const [row] = await env.db.system((q) => q.query('select done_at from tasks where id = $1', [taskId]));
      return want(res.json.result?.how === 'updated' && !!row.done_at, res.json);
    });
    await r.step('Make posts a signed note; its retry with the same event id is kept once', async () => {
      const body = JSON.stringify({ id: 'mk-1', email: 'iris@brightwell.example', text: 'Asked for a second quote', at: new Date().toISOString() });
      const h = { 'x-curahold-signature': await curaholdSignature(makeIn.secret, now(), body), 'x-curahold-event-id': 'mk-1' };
      const a = await send(makeIn.url, body, h);
      const b = await send(makeIn.url, body, h);
      return want(a.json.status === 'ok' && b.json.status === 'duplicate', [a.json, b.json]);
    });
    await r.step('a captured delivery replayed later, and a forged one, are refused', async () => {
      const body = JSON.stringify({ id: 'mk-2', email: 'iris@brightwell.example', text: 'replayed' });
      const old = await send(makeIn.url, body, { 'x-curahold-signature': await curaholdSignature(makeIn.secret, now() - 3600, body), 'x-curahold-event-id': 'mk-2' });
      const forged = await send(makeIn.url, body, { 'x-curahold-signature': await curaholdSignature('whsec_guess', now(), body) });
      const noToken = await send(zapIn.url, JSON.stringify({ id: 'zap-78', title: 'x' }), { 'x-curahold-token': 'guess' });
      return want(old.status === 401 && forged.status === 401 && noToken.status === 401, [old.status, forged.status, noToken.status]);
    });
    await r.step('bad payloads: not JSON is refused; a delivery about nobody waits in the log, said plainly in each language', async () => {
      const notJson = await send(zapIn.url, 'hello there', { 'x-curahold-token': zapIn.secret });
      const nobody = await send(zapIn.url, JSON.stringify({ id: 'zap-79', title: '', email: 'stranger@unknown.example' }), { 'x-curahold-token': zapIn.secret });
      const log = (await ada.get(`/api/inbound-hooks/${zapIn.id}/deliveries`)).json.deliveries as any[];
      const code = String(log[0]?.error ?? '');
      const key = `hooks.why.${code.split(':')[0]}` as any;
      const shown = ['en', 'tr', 'ar', 'ja'].map((l) => translate(l as any, key));
      return want(notJson.status === 400 && nobody.json.status === 'failed' && /^[a-z_]+(:|$)/.test(code) && shown.every((s) => s && s !== key), { code, shown });
    });
    await r.step('rate limit: a flood is answered 429 with Retry-After (Zapier and Make retry)', async () => {
      // The limiter is one per process: Ada's own allowance was spent by the earlier rate-limit steps; it refills.
      const ta = await login(tight, 'acme', 'ada@demo.example');
      let h: any = null;
      for (let i = 0; i < 20 && !h; i++) {
        h = (await ta.post('/api/inbound-hooks', { name: 'Busy Make', recipe: 'curahold' })).json.hook ?? null;
        if (!h) await new Promise((res) => setTimeout(res, 500));
      }
      let last: any = null;
      for (let i = 0; i < 400 && last?.status !== 429; i++) last = await send(h.url, '{}', { 'cf-connecting-ip': '192.0.2.44' }, tight);
      return want(last.status === 429 && Number(last.headers.get('retry-after')) > 0, last?.status);
    });
    await r.step('secret rotated: the old one stops, the new one works', async () => {
      const re = (await ada.patch(`/api/inbound-hooks/${makeIn.id}`, { rotate: true })).json.hook;
      const body = JSON.stringify({ id: 'mk-3', email: 'iris@brightwell.example', text: 'after rotation' });
      const old = await send(makeIn.url, body, { 'x-curahold-signature': await curaholdSignature(makeIn.secret, now(), body) });
      const fresh = await send(makeIn.url, body, { 'x-curahold-signature': await curaholdSignature(re.secret, now(), body) });
      makeIn = re;
      return want(old.status === 401 && fresh.status === 200, [old.status, fresh.status]);
    });
    await r.step('paused, then another company\'s address, then removed: unknown each time', async () => {
      await ada.patch(`/api/inbound-hooks/${zapIn.id}`, { enabled: false });
      const paused = await send(zapIn.url, '{}', { 'x-curahold-token': zapIn.secret });
      await ada.patch(`/api/inbound-hooks/${zapIn.id}`, { enabled: true });
      const other = await send(zapIn.url.replace('acme.', 'beta.'), '{}', { 'x-curahold-token': zapIn.secret });
      await ada.del(`/api/inbound-hooks/${zapIn.id}`);
      const gone = await send(zapIn.url, '{}', { 'x-curahold-token': zapIn.secret });
      return want(paused.status === 404 && other.status === 404 && gone.status === 404, [paused.status, other.status, gone.status]);
    });
    expect(r.failed()).toEqual([]);
  });
});
