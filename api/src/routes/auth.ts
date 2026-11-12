// Signing in, without passwords:
//   1. email link  — POST /auth/start, then POST /auth/verify with the token
//   2. Google / Microsoft — GET /auth/oauth/:provider/start → provider →
//      GET /oauth/callback (central host) → back to the company with a
//      one-time token → POST /auth/verify; a device seen for the first time
//      must also enter a 6-digit code sent by email (POST /auth/device).
import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { z } from 'zod';
import { translate, type Locale } from '../../../shared/src/i18n';
import type { OrgPublic } from '../../../shared/src/model';
import { logoPath, maxDevices, nowOf, orgUrl, run, type AppEnv, type C, type OrgRow } from '../context';
import { buildIcs } from '../lib/ics';
import { day } from '../lib/mappers';
import { randomDigits, randomToken, sha256Hex, sign, verify } from '../lib/crypto';
import { audit } from '../lib/audit';
import { emailDomain } from '../lib/domains';
import { fail, HttpError } from '../lib/errors';
import { enqueue, kick } from '../lib/notify';
import { emailHtml } from '../lib/emailHtml';
import { logoUrl, userManagers } from '../lib/people';
import { authorizeUrl, exchangeCode, isProvider, PROVIDERS, type ProviderId } from '../lib/oidc';
import { knownDevice, openSession } from '../lib/sessions';
import { portalOAuthCallback, type PortalOAuthState } from '../lib/portalOAuth';
import { body, deviceId, deviceLabel, email } from '../lib/validate';

export const SESSION_COOKIE = 'tw_session';
const MAGIC_MINUTES = 15;
const JOIN_MINUTES = 60;
const OAUTH_MINUTES = 2;
const DEVICE_MINUTES = 10;
const MAX_LINKS_PER_15_MIN = 5;
const MAX_CODE_ATTEMPTS = 5;

export const authRoutes = new Hono<AppEnv>();

authRoutes.get('/org', (c) => {
  const org = c.get('org');
  const oauth = c.get('deps').config.oauth;
  const out: OrgPublic = {
    slug: org.slug,
    name: org.name,
    locale: org.locale,
    loginMethods: { email: true, google: !!oauth.google, microsoft: !!oauth.microsoft },
    maxDevices: maxDevices(c),
    joinRequests: (org.join_requests || org.auto_join) && org.domains.length > 0,
    logoUrl: logoPath(org),
  };
  return c.json(out);
});

// Installing Tendwell on a phone or a desktop: the browser reads this before
// anyone signs in, so it carries only what the sign-in page already shows.
authRoutes.get('/manifest.webmanifest', (c) => {
  const org = c.get('org');
  const tr = org.locale === 'tr';
  const manifest = {
    id: '/',
    name: `${org.name} · Tendwell`,
    short_name: 'Tendwell',
    description: tr ? 'Müşteriler, görevler ve satış hattı tek yerde.' : 'Customers, tasks and the pipeline in one place.',
    lang: org.locale,
    start_url: '/home',
    scope: '/',
    display: 'standalone',
    background_color: '#191541',
    theme_color: '#191541',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: tr ? 'Görevlerim' : 'My tasks', url: '/my' },
      { name: tr ? 'Gelen kutusu' : 'Inbox', url: '/inbox' },
      { name: tr ? 'Müşteriler' : 'Customers', url: '/accounts' },
    ],
  };
  return c.body(JSON.stringify(manifest), 200, { 'content-type': 'application/manifest+json; charset=utf-8', 'cache-control': 'public, max-age=3600' });
});

// The company logo is shown on the sign-in page, so it needs no session.
authRoutes.get('/logo', async (c) => {
  const logo = (c.get('org').settings as any)?.logo;
  if (!logo?.key) return c.text('Not found', 404);
  const obj = await c.get('deps').storage.get(logo.key);
  if (!obj) return c.text('Not found', 404);
  return c.body(obj.data, 200, {
    'content-type': logo.mime,
    'cache-control': 'public, max-age=86400',
    'x-content-type-options': 'nosniff',
    // An SVG opened directly must not run anything.
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  });
});

authRoutes.post('/auth/start', async (c) => {
  const input = await body(c, z.object({ email }));
  const deps = c.get('deps');
  const org = c.get('org');
  // Someone without an account, at one of the company's own domains, gets a
  // link to ask to join (or to join straight away, if the company allows it).
  const mayJoin = (org.join_requests || org.auto_join) && org.domains.includes(emailDomain(input.email));
  const result = await run(c, async (q) => {
    const [recent] = await q.query<{ n: number }>(
      `select count(*)::int as n from login_tokens
        where email = $1 and kind in ('magic', 'join') and created_at > now() - interval '15 minutes'`,
      [input.email],
    );
    if (recent.n >= MAX_LINKS_PER_15_MIN) fail('too_many_requests');
    const [user] = await q.query<{ id: string; name: string; locale: Locale | null; status: string }>(
      `select id, name, locale, status from users where email = $1`,
      [input.email],
    );
    if (user && !['active', 'invited'].includes(user.status)) return { kind: 'none' as const };
    if (!user && !mayJoin) return { kind: 'none' as const };
    const token = randomToken(32);
    await q.query(
      `insert into login_tokens (org_id, email, token_hash, kind, expires_at)
       values ($1, $2, $3, $4, now() + make_interval(mins => $5::int))`,
      [org.id, input.email, await sha256Hex(token), user ? 'magic' : 'join', user ? MAGIC_MINUTES : JOIN_MINUTES],
    );
    return user ? { kind: 'magic' as const, token, user } : { kind: 'join' as const, token };
  });
  const base = orgUrl(deps.config, org.slug);
  if (result.kind === 'magic') {
    const locale = result.user.locale ?? org.locale;
    const link = `${base}/auth/verify#token=${result.token}`;
    const text = translate(locale, 'email.magic.body', { org: org.name, name: result.user.name, link });
    await deps.email.send({
      to: input.email,
      subject: translate(locale, 'email.magic.subject', { org: org.name }),
      text,
      html: emailHtml({ org: org.name, logo: logoUrl(deps, org), text, link, cta: translate(locale, 'email.cta.signIn') }),
    });
  } else if (result.kind === 'join') {
    const locale = c.get('locale');
    const link = `${base}/join#token=${result.token}`;
    await deps.email.send({
      to: input.email,
      subject: translate(locale, org.auto_join ? 'email.joinAuto.subject' : 'email.join.subject', { org: org.name }),
      text: translate(locale, org.auto_join ? 'email.joinAuto.body' : 'email.join.body', { org: org.name, link }),
    });
  }
  // Same answer whether or not the address has an account.
  const dev = deps.config.devExposeTokens && result.kind !== 'none';
  return c.json({ ok: true, ...(dev ? (result.kind === 'join' ? { devJoinToken: result.token } : { devToken: result.token }) : {}) });
});

// Step two of joining: the link proved the address; now the name, and
// either a request for an administrator or (auto-join) a session right away.
authRoutes.post('/join', async (c) => {
  const input = await body(
    c,
    z.object({
      token: z.string().min(20).max(200),
      name: z.string().trim().min(1).max(120),
      note: z.string().trim().max(500).optional(),
      deviceId,
      deviceLabel,
    }),
  );
  const deps = c.get('deps');
  const org = c.get('org');
  const outcome = await run(c, async (q) => {
    const [tok] = await q.query(
      `update login_tokens set used_at = now()
        where token_hash = $1 and kind = 'join' and used_at is null and expires_at > now() returning email`,
      [await sha256Hex(input.token)],
    );
    if (!tok) fail('invalid_token');
    const email = tok.email as string;
    if (!org.domains.includes(emailDomain(email))) fail('join_closed');
    const [existing] = await q.query('select id, status from users where email = $1', [email]);
    if (existing) fail('already_member');
    if (org.auto_join) {
      const [role] = await q.query<{ id: string }>(`select id from roles where key = 'member' and system`);
      const [u] = await q.query<{ id: string }>(
        `insert into users (org_id, email, name, role_id, seat, status, locale) values ($1, $2, $3, $4, 'full', 'active', $5) returning id`,
        [org.id, email, input.name, role.id, c.get('locale')],
      );
      await audit(q, { orgId: org.id, actorId: u.id, action: 'user.joined', entity: 'user', entityId: u.id });
      const s = await openSession(q, {
        orgId: org.id,
        userId: u.id,
        deviceId: input.deviceId,
        deviceLabel: input.deviceLabel ?? null,
        method: 'magic',
        ip: c.req.header('cf-connecting-ip') ?? null,
        geo: c.req.header('cf-ipcountry') ?? null,
        maxDevices: maxDevices(c),
        days: deps.config.sessionDays,
      });
      return { kind: 'joined' as const, token: s.token };
    }
    if (!org.join_requests) fail('join_closed');
    return { kind: 'pending' as const, email };
  });
  if (outcome.kind === 'pending') {
    // Filed with owner access: the person asking cannot read requests (nor
    // should they), and the duplicate check needs to.
    await deps.db.system(async (q) => {
      const inserted = await q.query(
        `insert into join_requests (org_id, email, name, note) values ($1, $2, $3, $4)
         on conflict (org_id, email) where status = 'pending' do nothing returning id`,
        [org.id, outcome.email, input.name, input.note || null],
      );
      if (!inserted.length) return;
      const managers = await userManagers(q, org.id);
      await enqueue(q, managers.map((m) => ({ orgId: org.id, userId: m, kind: 'join_request', data: { name: input.name, email: outcome.email } })));
      await audit(q, { orgId: org.id, actorId: null, action: 'join.requested', entity: 'join_request', entityId: inserted[0].id, meta: { email: outcome.email } });
    });
  }
  if (outcome.kind === 'joined') {
    setSessionCookie(c, outcome.token);
    return c.json({ status: 'ok' });
  }
  kick(deps);
  return c.json({ status: 'pending' });
});

const verifyInput = z.object({ token: z.string().min(20).max(200), deviceId, deviceLabel });

authRoutes.post('/auth/verify', async (c) => {
  const input = await body(c, verifyInput);
  const deps = c.get('deps');
  const org = c.get('org');
  const outcome = await run(c, async (q) => {
    const [tok] = await q.query(
      `update login_tokens set used_at = now()
        where token_hash = $1 and kind in ('magic', 'oauth') and used_at is null and expires_at > now()
        returning email, kind, device_id`,
      [await sha256Hex(input.token)],
    );
    if (!tok) fail('invalid_token');
    if (tok.kind === 'oauth' && tok.device_id !== input.deviceId) fail('invalid_token');
    const [user] = await q.query(
      `select id, name, email, locale from users where email = $1 and status in ('active', 'invited')`,
      [tok.email],
    );
    if (!user) fail('invalid_token');

    // An email link proves the address. A provider sign-in on a device we
    // have never seen must still prove it with a code — this is what makes
    // sharing one seat across many people hard.
    if (tok.kind === 'oauth' && !(await knownDevice(q, user.id, input.deviceId))) {
      const challenge = randomToken(24);
      const code = randomDigits(6);
      await q.query(
        `insert into login_tokens (org_id, email, token_hash, kind, device_id, code_hash, expires_at)
         values ($1, $2, $3, 'device', $4, $5, now() + make_interval(mins => $6::int))`,
        [org.id, user.email, await sha256Hex(challenge), input.deviceId, await sha256Hex(code), DEVICE_MINUTES],
      );
      return { kind: 'device' as const, challenge, code, user };
    }
    await q.query(`update users set status = 'active' where id = $1 and status = 'invited'`, [user.id]);
    const s = await openSession(q, {
      orgId: org.id,
      userId: user.id,
      deviceId: input.deviceId,
      deviceLabel: input.deviceLabel ?? null,
      method: tok.kind === 'oauth' ? 'oauth' : 'magic',
      ip: c.req.header('cf-connecting-ip') ?? null,
      geo: c.req.header('cf-ipcountry') ?? null,
      maxDevices: maxDevices(c),
      days: deps.config.sessionDays,
    });
    return { kind: 'session' as const, token: s.token, evicted: s.evicted.length };
  });

  if (outcome.kind === 'device') {
    const locale = outcome.user.locale ?? org.locale;
    await deps.email.send({
      to: outcome.user.email,
      subject: translate(locale, 'email.device.subject', { org: org.name, code: outcome.code }),
      text: translate(locale, 'email.device.body', {
        org: org.name,
        name: outcome.user.name,
        code: outcome.code,
        device: input.deviceLabel ?? '—',
      }),
    });
    return c.json({
      status: 'device_code',
      challenge: outcome.challenge,
      email: maskEmail(outcome.user.email),
      ...(deps.config.devExposeTokens ? { devCode: outcome.code } : {}),
    });
  }
  setSessionCookie(c, outcome.token);
  return c.json({ status: 'ok', evictedDevices: outcome.evicted });
});

authRoutes.post('/auth/device', async (c) => {
  const input = await body(
    c,
    z.object({ challenge: z.string().min(20).max(200), code: z.string().regex(/^\d{6}$/), deviceId, deviceLabel }),
  );
  const deps = c.get('deps');
  const org = c.get('org');
  const outcome = await run(c, async (q) => {
    const [tok] = await q.query(
      `update login_tokens set attempts = attempts + 1
        where token_hash = $1 and kind = 'device' and used_at is null and expires_at > now()
        returning id, email, device_id, code_hash, attempts`,
      [await sha256Hex(input.challenge)],
    );
    if (!tok || tok.device_id !== input.deviceId) return { error: 'invalid_token' as const };
    if (tok.attempts > MAX_CODE_ATTEMPTS) return { error: 'too_many_requests' as const };
    if (tok.code_hash !== (await sha256Hex(input.code))) return { error: 'invalid_token' as const };
    await q.query('update login_tokens set used_at = now() where id = $1', [tok.id]);
    const [user] = await q.query(`select id from users where email = $1 and status in ('active', 'invited')`, [tok.email]);
    if (!user) return { error: 'invalid_token' as const };
    await q.query(`update users set status = 'active' where id = $1 and status = 'invited'`, [user.id]);
    const s = await openSession(q, {
      orgId: org.id,
      userId: user.id,
      deviceId: input.deviceId,
      deviceLabel: input.deviceLabel ?? null,
      method: 'oauth',
      ip: c.req.header('cf-connecting-ip') ?? null,
      geo: c.req.header('cf-ipcountry') ?? null,
      maxDevices: maxDevices(c),
      days: deps.config.sessionDays,
    });
    return { token: s.token, evicted: s.evicted.length };
  });
  // The attempt counter must be saved even when the code is wrong, so the
  // error is raised after the transaction has committed.
  if ('error' in outcome) throw new HttpError(outcome.error!);
  setSessionCookie(c, outcome.token);
  return c.json({ status: 'ok', evictedDevices: outcome.evicted });
});

// A person's task calendar, fetched by their calendar app (no cookie): the
// secret in the address is the only credential, and tasks are read as that
// person so they only ever see their own boards.
authRoutes.get('/calendar/:file', async (c) => {
  const m = /^([A-Za-z0-9_-]{20,64})\.ics$/.exec(c.req.param('file'));
  if (!m) return c.text('Not found', 404);
  const deps = c.get('deps');
  const org = c.get('org');
  const hash = await sha256Hex(m[1]);
  const [u] = await deps.db.tenant({ orgId: org.id, userId: null }, (q) =>
    q.query(`select id, name, locale from users where calendar_token_hash = $1 and status = 'active'`, [hash]),
  );
  if (!u) return c.text('Not found', 404);
  const rows = await deps.db.tenant({ orgId: org.id, userId: u.id }, (q) =>
    q.query(
      `select t.id, t.title, t.due_date, t.board_id, t.updated_at, a.name as account_name
         from tasks t join boards b on b.id = t.board_id left join accounts a on a.id = t.account_id
        where $1 = any(t.assignee_ids) and t.archived_at is null and b.archived_at is null and t.due_date is not null
          and t.due_date >= current_date - 60 and t.due_date <= current_date + 400
          and t.done_at is null
        order by t.due_date limit 1000`,
      [u.id],
    ),
  );
  const base = orgUrl(deps.config, org.slug);
  const ics = buildIcs(
    `${org.name} — Tendwell`,
    rows.map((t) => ({ id: t.id, title: t.title, due: day(t.due_date)!, url: `${base}/b/${t.board_id}?task=${t.id}`, account: t.account_name, updatedAt: new Date(t.updated_at) })),
    nowOf(deps),
  );
  return c.body(ics, 200, { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'private, max-age=300' });
});

interface OAuthState {
  o: string; // company slug
  p: ProviderId;
  d: string; // device id
  n: string; // nonce
  x: number; // expiry (ms)
}

authRoutes.get('/auth/oauth/:provider/start', async (c) => {
  const deps = c.get('deps');
  const org = c.get('org');
  const provider = c.req.param('provider');
  const device = c.req.query('device') ?? '';
  const back = `${orgUrl(deps.config, org.slug)}/login`;
  if (!isProvider(provider) || !deps.config.oauth[provider]) return c.redirect(`${back}?error=oauth_not_configured`);
  if (!deviceId.safeParse(device).success) return c.redirect(`${back}?error=oauth_failed&provider=${provider}`);
  const now = (deps.now ?? (() => new Date()))();
  const state: OAuthState = { o: org.slug, p: provider, d: device, n: randomToken(16), x: now.getTime() + 10 * 60_000 };
  const signed = await sign(state, deps.config.authSecret);
  return c.redirect(authorizeUrl(provider, deps.config.oauth[provider]!, callbackUrl(c), signed, state.n));
});

function callbackUrl(c: C) {
  const cfg = c.get('deps').config;
  const port = cfg.publicPort ? `:${cfg.publicPort}` : '';
  return `${cfg.scheme}://${cfg.centralHost}${port}/api/oauth/callback`;
}

export async function oauthCallback(c: C) {
  const deps = c.get('deps');
  const cfg = deps.config;
  const now = (deps.now ?? (() => new Date()))();
  const state = await verify<OAuthState & { k?: string }>(c.req.query('state') ?? '', cfg.authSecret);
  if (!state || state.x < now.getTime() || !isProvider(state.p)) return c.text('Invalid sign-in state', 400);
  // A customer portal's sign-in comes back here too (one registered address); it goes on to the portal.
  if (state.k === 'portal') return portalOAuthCallback(c, state as unknown as PortalOAuthState);
  const back = `${orgUrl(cfg, state.o)}/login`;
  const providerCfg = cfg.oauth[state.p];
  const code = c.req.query('code');
  if (!providerCfg || !code) return c.redirect(`${back}?error=oauth_failed&provider=${state.p}`);
  const identity = await exchangeCode(state.p, providerCfg, code, callbackUrl(c), state.n, deps.fetch ?? fetch, now);
  if (!identity) return c.redirect(`${back}?error=oauth_failed&provider=${state.p}`);

  const orgRows = await deps.db.tenant({ orgId: null, userId: null }, (q) =>
    q.query<OrgRow>('select * from resolve_org($1)', [state.o]),
  );
  const org = orgRows[0];
  if (!org) return c.text('Unknown workspace', 404);
  const token = randomToken(32);
  const found = await deps.db.tenant({ orgId: org.id, userId: null }, async (q) => {
    const [user] = await q.query(`select id from users where email = $1 and status in ('active', 'invited')`, [identity.email]);
    if (!user) return false;
    await q.query(
      `insert into login_tokens (org_id, email, token_hash, kind, device_id, expires_at)
       values ($1, $2, $3, 'oauth', $4, now() + make_interval(mins => $5::int))`,
      [org.id, identity.email, await sha256Hex(token), state.d, OAUTH_MINUTES],
    );
    return true;
  });
  if (!found) return c.redirect(`${back}?error=no_account&email=${encodeURIComponent(identity.email)}`);
  return c.redirect(`${orgUrl(cfg, org.slug)}/auth/verify#token=${token}&m=oauth`);
}

export { callbackUrl };

export function setSessionCookie(c: C, token: string) {
  const cfg = c.get('deps').config;
  // Host-only cookie: a session for acme.tendwell.com is never sent to any
  // other company's address.
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cfg.scheme === 'https',
    sameSite: 'Lax',
    path: '/',
    maxAge: cfg.sessionDays * 86400,
  });
}

function maskEmail(e: string) {
  const [name, domain] = e.split('@');
  return `${name.slice(0, 2)}${'•'.repeat(Math.max(1, name.length - 2))}@${domain}`;
}

export const _test = { PROVIDERS, MAX_CODE_ATTEMPTS };
