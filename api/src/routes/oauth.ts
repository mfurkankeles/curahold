// OAuth 2.1 for apps and AI assistants (Claude, ChatGPT and others):
// discovery documents, dynamic client registration, the consent step (in
// the app, as the signed-in person) and tokens with PKCE. Every company is
// its own issuer at its own address.
import { Hono } from 'hono';
import { z } from 'zod';
import { orgUrl, run, type AppEnv, type C } from '../context';
import { audit } from '../lib/audit';
import { randomToken, sha256Hex, sign, verify } from '../lib/crypto';
import { fail } from '../lib/errors';
import { ACCESS_PREFIX, ACCESS_TTL_S, REFRESH_PREFIX, REFRESH_TTL_DAYS, newSecret } from '../lib/tokens';
import { body } from '../lib/validate';

export const oauthRoutes = new Hono<AppEnv>();
export const oauthApi = new Hono<AppEnv>();

const base = (c: C) => orgUrl(c.get('deps').config, c.get('org').slug);
const open = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version', 'cache-control': 'no-store' };
const oauthError = (c: C, error: string, description: string, status = 400) => c.json({ error, error_description: description }, status as 400, open);

interface AuthRequest {
  orgId: string;
  clientId: string;
  redirectUri: string;
  challenge: string;
  state: string | null;
  write: boolean;
  exp: number;
}

const b64url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const s256 = async (verifier: string) => b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));

// Loopback addresses are allowed for desktop apps; everything else must be https.
const okRedirect = (u: string) => {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  } catch {
    return false;
  }
};

for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
  oauthRoutes.get(path, (c) =>
    c.json({ resource: `${base(c)}/mcp`, authorization_servers: [base(c)], scopes_supported: ['read', 'write'], bearer_methods_supported: ['header'], resource_name: `Tendwell — ${c.get('org').name}` }, 200, open),
  );
}

oauthRoutes.get('/.well-known/oauth-authorization-server', (c) =>
  c.json(
    {
      issuer: base(c),
      authorization_endpoint: `${base(c)}/oauth/authorize`,
      token_endpoint: `${base(c)}/oauth/token`,
      registration_endpoint: `${base(c)}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['read', 'write'],
    },
    200,
    open,
  ),
);

oauthRoutes.options('*', (c) => c.body(null, 204, { ...open, 'access-control-allow-methods': 'GET, POST, OPTIONS' }));

/** Dynamic client registration: an app introduces itself. */
oauthRoutes.post('/oauth/register', async (c) => {
  let input: { redirect_uris?: unknown; client_name?: unknown };
  try {
    input = await c.req.json();
  } catch {
    return oauthError(c, 'invalid_client_metadata', 'JSON body expected');
  }
  const uris = Array.isArray(input.redirect_uris) ? input.redirect_uris.filter((u): u is string => typeof u === 'string' && u.length <= 500) : [];
  if (!uris.length || uris.length > 10 || !uris.every(okRedirect)) return oauthError(c, 'invalid_redirect_uri', 'https redirect addresses (or loopback) are required');
  const name = typeof input.client_name === 'string' && input.client_name.trim() ? input.client_name.trim().slice(0, 80) : 'App';
  const id = `twc_${randomToken(18)}`;
  await c.get('deps').db.system((q) => q.query('insert into oauth_clients (id, name, redirect_uris) values ($1, $2, $3)', [id, name, uris]));
  return c.json(
    { client_id: id, client_name: name, redirect_uris: uris, token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] },
    201,
    open,
  );
});

/** The app sends the person here; Tendwell asks them (signed in, in the app) whether to allow it. */
oauthRoutes.get('/oauth/authorize', async (c) => {
  const p = (k: string) => c.req.query(k) ?? '';
  const [client] = await c.get('deps').db.system((q) => q.query('select * from oauth_clients where id = $1', [p('client_id')]));
  if (!client || !client.redirect_uris.includes(p('redirect_uri'))) return c.text('Unknown app or redirect address.', 400);
  const back = (error: string) => {
    const u = new URL(p('redirect_uri'));
    u.searchParams.set('error', error);
    if (p('state')) u.searchParams.set('state', p('state'));
    return c.redirect(u.toString(), 302);
  };
  if (p('response_type') !== 'code') return back('unsupported_response_type');
  if (!p('code_challenge') || p('code_challenge_method') !== 'S256') return back('invalid_request');
  const req: AuthRequest = {
    orgId: c.get('org').id,
    clientId: client.id,
    redirectUri: p('redirect_uri'),
    challenge: p('code_challenge'),
    state: p('state') || null,
    write: !p('scope') || p('scope').split(/\s+/).includes('write'),
    exp: Date.now() + 15 * 60_000,
  };
  const token = await sign(req, c.get('deps').config.authSecret);
  return c.redirect(`/connect-ai?req=${encodeURIComponent(token)}`, 302);
});

async function readRequest(c: C, token: string): Promise<AuthRequest> {
  const req = await verify<AuthRequest>(token, c.get('deps').config.authSecret);
  if (!req || req.orgId !== c.get('org').id || req.exp < Date.now()) fail('invalid_token');
  return req!;
}

/** For the consent screen: which app, asking for what. */
oauthApi.get('/oauth/request', async (c) => {
  const req = await readRequest(c, c.req.query('req') ?? '');
  const [client] = await c.get('deps').db.system((q) => q.query('select name from oauth_clients where id = $1', [req.clientId]));
  if (!client) fail('not_found');
  return c.json({ app: client.name, redirectHost: new URL(req.redirectUri).host, write: req.write, canWrite: c.get('auth').seat === 'full' });
});

oauthApi.post('/oauth/approve', async (c) => {
  if (c.get('tokenKind') || c.get('previewBy')) fail('forbidden');
  const input = await body(c, z.object({ req: z.string().max(4000), allow: z.boolean(), write: z.boolean().default(false) }));
  const req = await readRequest(c, input.req);
  const auth = c.get('auth');
  const org = c.get('org');
  const u = new URL(req.redirectUri);
  if (req.state) u.searchParams.set('state', req.state);
  if (!input.allow) {
    u.searchParams.set('error', 'access_denied');
    return c.json({ redirect: u.toString() });
  }
  const code = randomToken(32);
  const write = input.write && req.write && auth.seat === 'full';
  const codeHash = await sha256Hex(code);
  await c.get('deps').db.system((q) =>
    q.query(
      `insert into oauth_codes (code_hash, org_id, user_id, client_id, redirect_uri, challenge, can_write, expires_at)
       values ($1, $2, $3, $4, $5, $6, $7, now() + interval '5 minutes')`,
      [codeHash, org.id, auth.userId, req.clientId, req.redirectUri, req.challenge, write],
    ),
  );
  await run(c, (q) => audit(q, { orgId: org.id, actorId: auth.userId, action: 'app.connected', entity: 'app', meta: { client: req.clientId, write } }));
  u.searchParams.set('code', code);
  return c.json({ redirect: u.toString() });
});

type Grant = { org_id: string; user_id: string; client_id: string; can_write: boolean };

async function issue(c: C, row: Grant, name: string, replaceId?: string) {
  const access = await newSecret(ACCESS_PREFIX);
  const refresh = await newSecret(REFRESH_PREFIX);
  await c.get('deps').db.system((q) =>
    replaceId
      ? q.query(
          `update api_tokens set token_hash = $2, refresh_hash = $3, prefix = $4, expires_at = now() + make_interval(secs => $5),
                  refresh_expires_at = now() + make_interval(days => $6) where id = $1`,
          [replaceId, access.hash, refresh.hash, access.shown, ACCESS_TTL_S, REFRESH_TTL_DAYS],
        )
      : q.query(
          `insert into api_tokens (org_id, user_id, kind, name, token_hash, refresh_hash, client_id, can_write, prefix, expires_at, refresh_expires_at)
           values ($1, $2, 'oauth', $3, $4, $5, $6, $7, $8, now() + make_interval(secs => $9), now() + make_interval(days => $10))`,
          [row.org_id, row.user_id, name, access.hash, refresh.hash, row.client_id, row.can_write, access.shown, ACCESS_TTL_S, REFRESH_TTL_DAYS],
        ),
  );
  return c.json(
    { access_token: access.token, token_type: 'Bearer', expires_in: ACCESS_TTL_S, refresh_token: refresh.token, scope: row.can_write ? 'read write' : 'read' },
    200,
    open,
  );
}

oauthRoutes.post('/oauth/token', async (c) => {
  const type = c.req.header('content-type') ?? '';
  const raw: Record<string, string> = type.includes('application/json') ? await c.req.json().catch(() => ({})) : Object.fromEntries(Object.entries(await c.req.parseBody()).map(([k, v]) => [k, String(v)]));
  const db = c.get('deps').db;
  const org = c.get('org');
  if (raw.grant_type === 'authorization_code') {
    const hash = await sha256Hex(raw.code ?? '');
    const [code] = await db.system((q) => q.query<Grant & { redirect_uri: string; challenge: string; expires_at: string }>('delete from oauth_codes where code_hash = $1 returning *', [hash]));
    if (!code || code.org_id !== org.id || new Date(code.expires_at) < new Date()) return oauthError(c, 'invalid_grant', 'The code is unknown or has expired.');
    if (code.client_id !== raw.client_id || code.redirect_uri !== raw.redirect_uri) return oauthError(c, 'invalid_grant', 'The code was issued to another app or address.');
    if (!raw.code_verifier || (await s256(raw.code_verifier)) !== code.challenge) return oauthError(c, 'invalid_grant', 'The code verifier does not match.');
    const [client] = await db.system((q) => q.query('select name from oauth_clients where id = $1', [code.client_id]));
    return issue(c, code, client?.name ?? 'App');
  }
  if (raw.grant_type === 'refresh_token') {
    const hash = await sha256Hex(raw.refresh_token ?? '');
    const [t] = await db.system((q) =>
      q.query<Grant & { id: string; name: string }>(`select * from api_tokens where refresh_hash = $1 and org_id = $2 and revoked_at is null and refresh_expires_at > now()`, [hash, org.id]),
    );
    if (!t || (raw.client_id && raw.client_id !== t.client_id)) return oauthError(c, 'invalid_grant', 'The refresh token is unknown, used or revoked.');
    return issue(c, t, t.name, t.id);
  }
  return oauthError(c, 'unsupported_grant_type', 'Use authorization_code or refresh_token.');
});
