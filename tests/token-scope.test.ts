// API keys and app tokens never carry a person's whole power (security audit H1, ADR 0024): administration,
// identity, billing and credentials are for a signed-in person, and a key or an app may be limited to areas.
import { beforeAll, describe, expect, it } from 'vitest';
import { areaOf, sessionOnly } from '../api/src/lib/tokenScope';
import { readRoutes } from '../scripts/docs/routes';
import { BASE, Client, login, setup, type Env } from './helpers';

let env: Env;
let ada: Client; // administrator
let lena: Client; // member

const URL_OF = (path: string) => `https://acme.${BASE}${path}`;
const bearer = async (token: string, method: string, path: string, body?: unknown) => {
  const res = await env.app.request(URL_OF(path), {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as any };
};

beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
});

describe('administration is for a signed-in person, never a token', () => {
  it("an administrator's writing key cannot touch SSO, people, the company, billing or security settings", async () => {
    const { token } = (await ada.post('/api/dev/keys', { name: 'Automation', canWrite: true })).json;
    const zeynep = env.a.ids.zeynep;
    const calls: [string, string, unknown?][] = [
      ['PUT', '/api/sso/settings', { enabled: true, protocol: 'oidc', issuer: 'https://idp.example.com', clientId: 'x' }],
      ['POST', '/api/sso/settings/scim-token'],
      ['POST', `/api/admin/users/${zeynep}/erase`, { confirm: 'zeynep@demo.example' }],
      ['GET', `/api/admin/users/${zeynep}/export`],
      ['PATCH', `/api/admin/users/${zeynep}`, { roleId: env.a.ids.ada }],
      ['POST', '/api/admin/company/deletion', { confirm: 'acme' }],
      ['PUT', '/api/admin/security', { require: 'everyone' }],
      ['GET', '/api/billing'],
      ['POST', '/api/billing/checkout', { plan: 'team' }],
      ['GET', '/api/dev/keys'],
      ['GET', '/api/me/security'],
      ['POST', '/api/me/security/recovery-codes'],
      ['GET', '/api/connections'],
    ];
    for (const [method, path, body] of calls) {
      const r = await bearer(token, method, path, body);
      expect([path, r.status, r.json.error]).toEqual([path, 403, 'session_required']);
    }
    // Ordinary work still goes through.
    expect((await bearer(token, 'GET', '/api/boards')).status).toBe(200);
  });

  it('a route that asks for a fresh sign-in refuses a token instead of letting it through', async () => {
    const { requireFresh } = await import('../api/src/lib/identity');
    const c = { get: (k: string) => (k === 'tokenKind' ? 'key' : undefined) } as any;
    await expect(requireFresh(c)).rejects.toMatchObject({ code: 'session_required' });
  });

  it('every API address is either closed to tokens or has an area', () => {
    const open = new Set(['auth', 'join', 'logo', 'org', 'manifest.webmanifest', 'hooks', 'inbound', 'scim', 'signup', 'trial', 'share', 'consent-event', 'client-error', 'help', 'help-files', 'assist', 'oauth']);
    const loose = readRoutes()
      .filter((r) => r.api)
      .filter((r) => !sessionOnly(r.path) && !areaOf(r.path) && !open.has(r.path.split('/')[1] ?? ''))
      .map((r) => `${r.method} ${r.path}`);
    expect(loose, 'classify the address in api/src/lib/tokenScope.ts (an area, or session only)').toEqual([]);
  });
});

describe('keys limited to areas', () => {
  it('reads and writes only where it was allowed', async () => {
    const made = await lena.post('/api/dev/keys', { name: 'Task filer', canWrite: true, areas: ['work:write'] });
    expect(made.status).toBe(201);
    expect(made.json.key.areas).toEqual(['work:write']);
    const token = made.json.token;
    const boards = (await lena.get('/api/boards')).json.boards;
    expect((await bearer(token, 'GET', '/api/me')).status).toBe(200);
    expect((await bearer(token, 'POST', '/api/tasks', { boardId: boards[0].id, title: 'Filed by a script' })).status).toBe(201);
    const outside = await bearer(token, 'GET', '/api/accounts');
    expect([outside.status, outside.json.error]).toEqual([403, 'token_scope']);
  });

  it('a read grant reads but does not write', async () => {
    const { token } = (await lena.post('/api/dev/keys', { name: 'Reader', canWrite: true, areas: ['customers:read', 'work:write'] })).json;
    expect((await bearer(token, 'GET', '/api/accounts')).status).toBe(200);
    const write = await bearer(token, 'POST', '/api/accounts', { name: 'Nope Ltd' });
    expect([write.status, write.json.error]).toEqual([403, 'token_scope']);
  });

  it('an unknown area, or a write grant on a read-only key, is refused', async () => {
    expect((await lena.post('/api/dev/keys', { name: 'x', areas: ['admin:write'] })).status).toBe(400);
    expect((await lena.post('/api/dev/keys', { name: 'x', canWrite: false, areas: ['work:write'] })).status).toBe(400);
  });

  it('an app asking for areas gets a token limited to them; approved read only, its writes become reads', async () => {
    const redirect = 'https://assistant.example.com/cb';
    const reg = await env.app.request(URL_OF('/oauth/register'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Filer', redirect_uris: [redirect] }) });
    const clientId = (await reg.json()).client_id;
    const verifier = 'v'.repeat(50);
    const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))).toString('base64url');
    const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', scope: 'work:write customers:read' });
    const req = new URL((await env.app.request(URL_OF(`/oauth/authorize?${q}`))).headers.get('location')!, URL_OF('/')).searchParams.get('req')!;
    expect((await lena.get(`/api/oauth/request?req=${encodeURIComponent(req)}`)).json).toMatchObject({ write: true, areas: ['work:write', 'customers:read'] });
    const ok = await lena.post('/api/oauth/approve', { req, allow: true, write: false });
    const code = new URL(ok.json.redirect).searchParams.get('code')!;
    const form = new URLSearchParams({ grant_type: 'authorization_code', code, client_id: clientId, redirect_uri: redirect, code_verifier: verifier });
    const tok = await (await env.app.request(URL_OF('/oauth/token'), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString() })).json();
    expect(tok.scope).toBe('read work:read customers:read');
    expect((await bearer(tok.access_token, 'GET', '/api/accounts')).status).toBe(200);
    expect((await bearer(tok.access_token, 'GET', '/api/reports')).json.error).toBe('token_scope');
  });
});
