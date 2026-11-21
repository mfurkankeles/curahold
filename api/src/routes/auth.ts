// Signing in, without passwords:
//   1. email link  — POST /auth/start, then POST /auth/verify with the token
//   2. Google / Microsoft — GET /auth/oauth/:provider/start → provider →
//      GET /oauth/callback (central host) → back to the company with a
//      one-time token → POST /auth/verify; a device seen for the first time
//      must also enter a 6-digit code sent by email (POST /auth/device).
import { seatGuard } from '../lib/trial';
import type { JoinRequestsRow, LoginTokensRow, UsersRow } from '../db/rows.gen';
import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { z } from 'zod';
import { accountWords, intlTag, normalizeLocale, translate, type Locale } from '../../../shared/src/i18n';
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
import { readyBackupAdmins, ssoEnforced, type BackupAdmin } from '../lib/sso';
import { authorizeUrl, exchangeCode, isProvider, PROVIDERS, type ProviderId } from '../lib/oidc';
import { knownDevice, openSession } from '../lib/sessions';
import {
  afterFirstStep,
  checkPasskey,
  factorsOf,
  finishStep,
  hasFactor,
  newRecoveryCodes,
  passkeyOptions,
  startTotp,
  takeStep,
  useRecovery,
  useTotp,
  type SignInOutcome,
} from '../lib/identity';
import type { SecondStepNeeded } from '../../../shared/src/identity';
import { portalOAuthCallback, type PortalOAuthState } from '../lib/portalOAuth';
import { body, deviceId, deviceLabel, email } from '../lib/validate';

export const SESSION_COOKIE = 'app_session';
const MAGIC_MINUTES = 15;
const JOIN_MINUTES = 60;
const OAUTH_MINUTES = 2;
const DEVICE_MINUTES = 10;
const MAX_LINKS_PER_15_MIN = 5;
const MAX_CODE_ATTEMPTS = 5;

export const authRoutes = new Hono<AppEnv>();

/**
 * The company's public sign-in facts (name, logo, which sign-in methods it allows) for the sign-in page; no session needed.
 */
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

// Installing Curahold on a phone or a desktop: the browser reads this before
// anyone signs in, so it carries only what the sign-in page already shows.
authRoutes.get('/manifest.webmanifest', (c) => {
  const org = c.get('org');
  const lang = normalizeLocale(org.locale);
  const manifest = {
    id: '/',
    name: `${org.name} · Curahold`,
    short_name: 'Curahold',
    description: translate(lang, 'pwa.manifestDescription'),
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
      { name: translate(lang, 'nav.myTasks'), url: '/my' },
      { name: translate(lang, 'nav.inbox'), url: '/inbox' },
      { name: accountWords(lang, org.terms).other, url: '/accounts' },
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

/**
 * Starts an email sign-in: sends a link (or a join link to someone at the company's domain). Rate-limited per address;
 * the answer is the same whether or not the address has an account, so it cannot be used to find out who works where.
 * Under required SSO only backup administrators may use it ('sso_required').
 */
authRoutes.post('/auth/start', async (c) => {
  const input = await body(c, z.object({ email, backup: z.boolean().optional() }));
  const deps = c.get('deps');
  const org = c.get('org');
  // A company that requires SSO accepts only its own identity provider here — and its backup administrators.
  if (await run(c, (q) => ssoEnforced(q))) {
    if (!input.backup) fail('sso_required');
    return backupStart(c, input.email);
  }
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

/**
 * A chosen backup administrator who could get in right now (active, an administrator,
 * with a passkey or the authenticator app) — or null. Owner access: the factor tables
 * are out of the request role's reach.
 */
async function backupAdmin(c: C, who: { email?: string; id?: string }): Promise<BackupAdmin | null> {
  const orgId = c.get('org').id;
  return c.get('deps').db.system(async (q) => {
    const [s] = await q.query<{ ids: string[] }>('select backup_admin_ids as ids from sso_configs where org_id = $1', [orgId]);
    const ready = await readyBackupAdmins(q, orgId, s?.ids ?? []);
    return ready.find((a) => (who.id ? a.id === who.id : a.email.toLowerCase() === who.email?.toLowerCase())) ?? null;
  });
}

/**
 * The emailed link while SSO is required: sent only to a backup administrator, and the
 * answer is the same for every address (nobody learns who the backup administrators are).
 * The second step always follows (lib/identity.ts afterFirstStep).
 */
async function backupStart(c: C, address: string) {
  const deps = c.get('deps');
  const org = c.get('org');
  const admin = await backupAdmin(c, { email: address });
  const token = admin
    ? await run(c, async (q) => {
        const [recent] = await q.query<{ n: number }>(
          `select count(*)::int as n from login_tokens where email = $1 and kind in ('magic', 'join') and created_at > now() - interval '15 minutes'`,
          [admin.email],
        );
        // Over the limit: nothing is sent, and the answer stays the same.
        if (recent.n >= MAX_LINKS_PER_15_MIN) return null;
        const t = randomToken(32);
        await q.query(
          `insert into login_tokens (org_id, email, token_hash, kind, expires_at) values ($1, $2, $3, 'magic', now() + make_interval(mins => $4::int))`,
          [org.id, admin.email, await sha256Hex(t), MAGIC_MINUTES],
        );
        return t;
      })
    : null;
  if (admin && token) {
    const locale = normalizeLocale(admin.locale ?? org.locale);
    const link = `${orgUrl(deps.config, org.slug)}/auth/verify#token=${token}`;
    const text = translate(locale, 'email.magic.body', { org: org.name, name: admin.name, link });
    await deps.email.send({
      to: admin.email,
      subject: translate(locale, 'email.magic.subject', { org: org.name }),
      text,
      html: emailHtml({ org: org.name, logo: logoUrl(deps, org), text, link, cta: translate(locale, 'email.cta.signIn') }),
    });
  }
  return c.json({ ok: true, ...(deps.config.devExposeTokens && token ? { devToken: token } : {}) });
}

/**
 * A backup administrator got in while SSO is required: one line in the activity log,
 * and an email to every other administrator (in their own language), so nobody can
 * use the backup way in unnoticed.
 */
async function backupSignedIn(c: C, userId: string, via: 'totp' | 'passkey', device: string | null) {
  const deps = c.get('deps');
  const org = c.get('org');
  const { me, others } = await deps.db.system(async (q) => {
    await audit(q, { orgId: org.id, actorId: userId, action: 'login.backup', entity: 'user', entityId: userId, meta: { via, device } });
    const [me] = await q.query<{ name: string; email: string }>('select name, email from users where org_id = $1 and id = $2', [org.id, userId]);
    const others = await q.query<{ email: string; name: string; locale: string | null }>(
      `select u.email, u.name, u.locale from users u join roles r on r.id = u.role_id
        where u.org_id = $1 and u.id <> $2 and u.status = 'active' and 'org.manage' = any(r.perms)`,
      [org.id, userId],
    );
    return { me, others };
  });
  const at = nowOf(deps);
  const link = `${orgUrl(deps.config, org.slug)}/settings/audit`;
  for (const o of others) {
    const locale = normalizeLocale(o.locale ?? org.locale);
    const when = at.toLocaleString(intlTag(locale), { dateStyle: 'medium', timeStyle: 'short', timeZone: org.timezone || 'UTC' });
    const vars = { org: org.name, who: me?.name ?? '', email: me?.email ?? '', when, device: device ?? '—', method: translate(locale, via === 'passkey' ? 'email.backupSignIn.passkey' : 'email.backupSignIn.app'), link };
    const text = translate(locale, 'email.backupSignIn.body', vars);
    await deps.email.send({
      to: o.email,
      subject: translate(locale, 'email.backupSignIn.subject', vars),
      text,
      html: emailHtml({ org: org.name, logo: logoUrl(deps, org), text, link, cta: translate(locale, 'email.backupSignIn.cta') }),
    });
  }
}

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
  // A link sent before the company required SSO does not open a way around it.
  if (await run(c, (q) => ssoEnforced(q))) fail('sso_required');
  const outcome = await run(c, async (q) => {
    const [tok] = await q.query<Pick<LoginTokensRow, 'email'>>(
      `update login_tokens set used_at = now()
        where token_hash = $1 and kind = 'join' and used_at is null and expires_at > now() returning email`,
      [await sha256Hex(input.token)],
    );
    if (!tok) fail('invalid_token');
    const email = tok.email as string;
    if (!org.domains.includes(emailDomain(email))) fail('join_closed');
    const [existing] = await q.query<Pick<UsersRow, 'id' | 'status'>>('select id, status from users where email = $1', [email]);
    if (existing) fail('already_member');
    if (org.auto_join) {
      // Money (security audit M3): joining by the company's domain takes a full seat, within the trial's or plan's limit.
      await seatGuard(q, org.id, 1);
      const [role] = await q.query<{ id: string }>(`select id from roles where key = 'member' and system`);
      const [u] = await q.query<{ id: string }>(
        `insert into users (org_id, email, name, role_id, seat, status, locale) values ($1, $2, $3, $4, 'full', 'active', $5) returning id`,
        [org.id, email, input.name, role.id, c.get('locale')],
      );
      await audit(q, { orgId: org.id, actorId: u.id, action: 'user.joined', entity: 'user', entityId: u.id });
      return { kind: 'joined' as const, userId: u.id };
    }
    if (!org.join_requests) fail('join_closed');
    return { kind: 'pending' as const, email };
  });
  if (outcome.kind === 'pending') {
    // Filed with owner access: the person asking cannot read requests (nor
    // should they), and the duplicate check needs to.
    await deps.db.system(async (q) => {
      const inserted = await q.query<Pick<JoinRequestsRow, 'id'>>(
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
    return signedIn(c, await afterFirstStep(c, { id: outcome.userId }, { deviceId: input.deviceId, deviceLabel: input.deviceLabel ?? null, method: 'magic' }), false);
  }
  kick(deps);
  return c.json({ status: 'pending' });
});

/**
 * A failed sign-in step goes in the company's activity log (so an administrator
 * can see someone guessing). At most one line a minute per kind, so guessing
 * cannot fill the log; written on its own, because the failing request rolls back.
 */
async function loginFailed(c: C, via: 'link' | 'device_code' | 'second_step' | 'passkey', reason: string) {
  const org = c.get('org');
  await c
    .get('deps')
    .db.system((q) =>
      q.query(
        `insert into audit_log (org_id, actor_id, action, entity, meta)
         select $1, null, 'login.failed', 'org', $2::jsonb
          where not exists (select 1 from audit_log where org_id = $1 and action = 'login.failed' and at > now() - interval '1 minute' and meta->>'via' = $3)`,
        [org.id, JSON.stringify({ via, reason }), via],
      ),
    )
    .catch(() => undefined);
}

const verifyInput = z.object({ token: z.string().min(20).max(200), deviceId, deviceLabel });

/**
 * Finishes a sign-in from an emailed link or a provider's token on this device; 'invalid_token' for anything stale,
 * used or from another device. Under required SSO only a backup administrator's emailed link goes on.
 */
authRoutes.post('/auth/verify', async (c) => {
  const input = await body(c, verifyInput);
  const deps = c.get('deps');
  const org = c.get('org');
  // While SSO is required, only a backup administrator's emailed link goes on (to the second step);
  // a provider sign-in or anyone else's link, even one sent before, is refused.
  const sso = await run(c, (q) => ssoEnforced(q));
  if (sso) {
    const [tok] = await run(c, async (q) =>
      q.query<{ email: string; kind: string }>(`select email, kind from login_tokens where token_hash = $1 and kind in ('magic', 'oauth') and used_at is null and expires_at > now()`, [await sha256Hex(input.token)]),
    );
    if (tok && (tok.kind !== 'magic' || !(await backupAdmin(c, { email: tok.email })))) fail('sso_required');
  }
  const attempt = () => run(c, async (q) => {
    const [tok] = await q.query<Pick<LoginTokensRow, 'email' | 'kind' | 'device_id'>>(
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
    return { kind: 'ready' as const, user: { id: user.id as string }, method: (tok.kind === 'oauth' ? 'oauth' : 'magic') as 'magic' | 'oauth' };
  });
  let outcome: Awaited<ReturnType<typeof attempt>>;
  try {
    outcome = await attempt();
  } catch (e) {
    if (e instanceof HttpError && e.code === 'invalid_token') await loginFailed(c, 'link', 'invalid_token');
    throw e;
  }

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
  return signedIn(c, await afterFirstStep(c, outcome.user, { deviceId: input.deviceId, deviceLabel: input.deviceLabel ?? null, method: outcome.method }, sso));
});

/**
 * Signs in on a new device with the code shown on a trusted one. Wrong attempts are counted even when the code fails
 * (the error is raised after the counter is committed), so guessing is bounded.
 */
authRoutes.post('/auth/device', async (c) => {
  const input = await body(
    c,
    z.object({ challenge: z.string().min(20).max(200), code: z.string().regex(/^\d{6}$/), deviceId, deviceLabel }),
  );
  if (await run(c, (q) => ssoEnforced(q))) fail('sso_required');
  const outcome = await run(c, async (q) => {
    const [tok] = await q.query<Pick<LoginTokensRow, 'id' | 'email' | 'device_id' | 'code_hash' | 'attempts'>>(
      `update login_tokens set attempts = attempts + 1
        where token_hash = $1 and kind = 'device' and used_at is null and expires_at > now()
        returning id, email, device_id, code_hash, attempts`,
      [await sha256Hex(input.challenge)],
    );
    if (!tok || tok.device_id !== input.deviceId) return { error: 'invalid_token' as const };
    if (tok.attempts > MAX_CODE_ATTEMPTS) return { error: 'too_many_requests' as const };
    if (tok.code_hash !== (await sha256Hex(input.code))) return { error: 'invalid_token' as const };
    await q.query('update login_tokens set used_at = now() where id = $1', [tok.id]);
    const [user] = await q.query<Pick<UsersRow, 'id'>>(`select id from users where email = $1 and status in ('active', 'invited')`, [tok.email]);
    if (!user) return { error: 'invalid_token' as const };
    await q.query(`update users set status = 'active' where id = $1 and status = 'invited'`, [user.id]);
    return { user: { id: user.id as string } };
  });
  // The attempt counter must be saved even when the code is wrong, so the
  // error is raised after the transaction has committed.
  if ('error' in outcome) {
    if (outcome.error === 'invalid_token') await loginFailed(c, 'device_code', 'wrong_code');
    throw new HttpError(outcome.error!);
  }
  return signedIn(c, await afterFirstStep(c, outcome.user, { deviceId: input.deviceId, deviceLabel: input.deviceLabel ?? null, method: 'oauth' }));
});

/** The session, or the second step the person still has to take (lib/identity.ts). */
function signedIn(c: C, o: SignInOutcome, withEvicted = true) {
  if (o.kind === 'second') {
    const out: SecondStepNeeded = { status: 'second_step', token: o.token, methods: o.methods, enroll: o.enroll };
    return c.json(out);
  }
  setSessionCookie(c, o.token);
  return c.json(withEvicted ? { status: 'ok', evictedDevices: o.evicted } : { status: 'ok' });
}

// ------------------------------------------------------------ the second step

const stepInput = z.object({ token: z.string().min(20).max(200), deviceId });

/** Setting up an authenticator app during sign-in, when the company requires a second step and the person has none. */
authRoutes.post('/auth/second/setup', async (c) => {
  const input = await body(c, stepInput);
  const step = await takeStep(c, input.token, input.deviceId, false);
  if (hasFactor(await factorsOf(c, step.user_id))) fail('forbidden');
  const [u] = await c.get('deps').db.system((q) => q.query<Pick<UsersRow, 'email'>>('select email from users where org_id = $1 and id = $2', [c.get('org').id, step.user_id]));
  return c.json(await startTotp(c, { id: step.user_id, email: u.email }));
});

/** Passkey challenge options for the second sign-in step. */
authRoutes.post('/auth/second/passkey', async (c) => {
  const input = await body(c, stepInput);
  const step = await takeStep(c, input.token, input.deviceId, false);
  return c.json(await passkeyOptions(c, 'confirm', step.user_id));
});

/**
 * Checks the second sign-in step (authenticator app, passkey or a recovery code) and creates the session; audited.
 * Setting up the app during sign-in shows the recovery codes once.
 */
authRoutes.post('/auth/second', async (c) => {
  const input = await body(
    c,
    stepInput.extend({
      code: z.string().trim().regex(/^\d{6}$/).optional(),
      recoveryCode: z.string().trim().min(8).max(20).optional(),
      passkey: z.object({ challengeId: z.string().max(40), response: z.record(z.string(), z.any()) }).optional(),
    }),
  );
  const step = await takeStep(c, input.token, input.deviceId);
  const f = await factorsOf(c, step.user_id);
  // A backup administrator under required SSO: only a passkey or the app they already have.
  if (step.backup && !hasFactor(f)) fail('sso_required');
  let passed: 'totp' | 'recovery' | 'passkey' | null = null;
  let recoveryCodes: string[] | undefined;
  if (input.code) {
    if (hasFactor(f)) passed = (await useTotp(c, step.user_id, input.code)) ? 'totp' : null;
    else if (await useTotp(c, step.user_id, input.code, true)) {
      // Setting up during sign-in: the app is confirmed, and the recovery codes are shown once.
      passed = 'totp';
      recoveryCodes = await newRecoveryCodes(c, step.user_id);
    }
  } else if (input.recoveryCode && hasFactor(f) && !step.backup) {
    passed = (await useRecovery(c, step.user_id, input.recoveryCode)) ? 'recovery' : null;
  } else if (input.passkey && f.passkeys) {
    passed = (await checkPasskey(c, 'confirm', input.passkey.challengeId, input.passkey.response, step.user_id).catch(() => null)) ? 'passkey' : null;
  }
  if (!passed) {
    await loginFailed(c, 'second_step', 'wrong_code');
    fail('second_step_failed');
  }
  const s = await finishStep(c, step, passed!);
  await c.get('deps').db.system((q) =>
    audit(q, { orgId: c.get('org').id, actorId: step.user_id, action: recoveryCodes ? 'second_step.added' : passed === 'recovery' ? 'second_step.recovery_used' : 'second_step.passed', entity: 'user', entityId: step.user_id, meta: { via: passed } }),
  );
  if (step.backup) await backupSignedIn(c, step.user_id, passed === 'passkey' ? 'passkey' : 'totp', step.device_label);
  setSessionCookie(c, s.token);
  return c.json({ status: 'ok', evictedDevices: s.evicted, ...(recoveryCodes ? { recoveryCodes } : {}) });
});

// ------------------------------------------------------------ passkey sign-in

/** A passkey is both steps at once (something you have, unlocked by fingerprint, face or PIN). */
authRoutes.post('/auth/passkey/options', async (c) => {
  if (await run(c, (q) => ssoEnforced(q))) fail('sso_required');
  return c.json(await passkeyOptions(c, 'login', null));
});

/**
 * Signs in with a passkey alone. Refused under required SSO; reports devices signed out to stay within the device limit.
 */
authRoutes.post('/auth/passkey', async (c) => {
  const input = await body(c, z.object({ challengeId: z.string().max(40), response: z.record(z.string(), z.any()), deviceId, deviceLabel }));
  if (await run(c, (q) => ssoEnforced(q))) fail('sso_required');
  const deps = c.get('deps');
  const org = c.get('org');
  let userId: string;
  try {
    userId = await checkPasskey(c, 'login', input.challengeId, input.response, null);
  } catch (e) {
    await loginFailed(c, 'passkey', 'passkey_failed');
    throw e;
  }
  const s = await run(c, async (q) => {
    await q.query(`update users set status = 'active' where id = $1 and status = 'invited'`, [userId]);
    return openSession(q, {
      orgId: org.id,
      userId,
      deviceId: input.deviceId,
      deviceLabel: input.deviceLabel ?? null,
      method: 'passkey',
      secondStep: 'passkey',
      ip: c.req.header('cf-connecting-ip') ?? null,
      geo: c.req.header('cf-ipcountry') ?? null,
      maxDevices: maxDevices(c),
      days: deps.config.sessionDays,
    });
  });
  setSessionCookie(c, s.token);
  return c.json({ status: 'ok', evictedDevices: s.evicted.length });
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
    q.query<Pick<UsersRow, 'id' | 'name' | 'locale'>>(`select id, name, locale from users where calendar_token_hash = $1 and status = 'active'`, [hash]),
  );
  if (!u) return c.text('Not found', 404);
  const rows = await deps.db.tenant({ orgId: org.id, userId: u.id }, (q) =>
    q.query(
      `select t.id, t.title, t.due_date, t.board_id, t.updated_at, a.name as account_name
         from tasks t join boards b on b.id = t.board_id left join accounts a on a.id = t.account_id
        where $1 = any(t.assignee_ids) and t.archived_at is null and b.archived_at is null and t.due_date is not null
          and t.due_date >= app_today() - 60 and t.due_date <= app_today() + 400
          and t.done_at is null
        order by t.due_date limit 1000`,
      [u.id],
    ),
  );
  const base = orgUrl(deps.config, org.slug);
  const ics = buildIcs(
    `${org.name} — Curahold`,
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

/**
 * Starts Google or Microsoft sign-in: a signed state (with this device) and a redirect to the provider. Refused under
 * required SSO; a provider not configured redirects back with an error.
 */
authRoutes.get('/auth/oauth/:provider/start', async (c) => {
  const deps = c.get('deps');
  const org = c.get('org');
  const provider = c.req.param('provider');
  const device = c.req.query('device') ?? '';
  const back = `${orgUrl(deps.config, org.slug)}/login`;
  // A company that requires SSO accepts only its own identity provider, not Google/Microsoft here.
  if (await run(c, (q) => ssoEnforced(q))) return c.redirect(`${back}?error=sso_required`);
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

/**
 * The return from Google or Microsoft sign-in: checks the signed state and its expiry, finds the person in the company,
 * and continues the sign-in on the same device. A customer portal's sign-in comes back here too and goes on to the portal.
 */
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
    const [user] = await q.query<Pick<UsersRow, 'id'>>(`select id from users where email = $1 and status in ('active', 'invited')`, [identity.email]);
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

/**
 * Sets the session cookie: host-only, HttpOnly, SameSite=Lax, Secure on https, so one company's session is never
 * sent to another company's.
 */
export function setSessionCookie(c: C, token: string) {
  const cfg = c.get('deps').config;
  // Host-only cookie: a session for acme.curahold.com is never sent to any
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
