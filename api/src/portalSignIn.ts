// Signing in to the customer portal, and the person's own sign-in settings.
// Each company chooses which ways are on (Settings → Customer portal):
//   email     — a one-time link and a six-digit code in the same email
//   google    — Google account (the address Google has verified)
//   microsoft — Microsoft account (confirmed once with an emailed code)
//   passkey   — fingerprint, face or device PIN, added after a first sign-in
//   password  — PBKDF2, five wrong tries lock it for 15 minutes
// Everything here touches only the sign-in tables, with owner access and
// explicit company filters; no route trusts an id the browser sends without
// tying it to this company and this person.
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import type { Context, Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import type { PortalAccount, PortalMethod } from '../../shared/src/portal';
import { defer, type Deps } from './context';
import { base64url, fromBase64url, randomToken, safeEqual, sha256Hex } from './lib/crypto';
import { fail } from './lib/errors';
import { checkPassword, hashPassword, weakPassword } from './lib/password';
import {
  FLOW_COOKIE,
  PORTAL_COOKIE,
  clientOf,
  emailNewSignIn,
  preparePortalEmail,
  portalAuth,
  signInOptions,
  type PortalEnv,
} from './lib/portal';
import { portalOAuthStart } from './lib/portalOAuth';
import { uuid } from './lib/validate';

type C = Context<PortalEnv>;
type Person = { id: string; email: string; name: string; locale: string | null };

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const MAX_CODE_TRIES = 5;
const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;

async function input<T extends z.ZodTypeAny>(c: C, schema: T): Promise<z.infer<T>> {
  const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((i) => i.path.join('.') || '(body)'))];
    fail('validation', { fields: fields.join(', ') }, { fields });
  }
  return parsed.data as z.infer<T>;
}

/** The portal's own host (a passkey belongs to it) and origin. */
function hostOf(c: C) {
  const host = (c.req.header('host') ?? new URL(c.req.url).host).toLowerCase();
  return { rpID: host.split(':')[0], host };
}

export function mountSignIn(app: Hono<PortalEnv>, deps: Deps) {
  const cfg = deps.config;
  const options = (c: C) => signInOptions(c.get('org'), deps);
  const need = (c: C, m: PortalMethod) => {
    if (!options(c)[m]) fail('portal_method_off');
  };
  const rp = (c: C) => {
    const { rpID, host } = hostOf(c);
    return { rpID, origin: `${cfg.scheme}://${host}` };
  };

  const personByEmail = async (orgId: string, email: string) => {
    const [p] = await deps.db.system((q) =>
      q.query<Person & { recent: number }>(
        `select pu.id, pu.email, pu.name, pu.locale,
                (select count(*)::int from portal_tokens t where t.portal_user_id = pu.id and t.kind in ('link', 'reset') and t.created_at > now() - interval '1 hour') as recent
           from portal_users pu join accounts a on a.id = pu.account_id and a.archived_at is null
          where pu.org_id = $1 and pu.email = $2 and pu.status in ('invited', 'active')`,
        [orgId, email],
      ),
    );
    return p ?? null;
  };

  /** A session on this device, as long as the company says; a notice when the inbox was not involved. */
  async function openSession(c: C, person: Person, method: string) {
    const org = c.get('org');
    const auth = portalAuth(org);
    const session = randomToken(32);
    const client = clientOf(c.req.header('user-agent'));
    await deps.db.system(async (q) => {
      await q.query(`update portal_users set status = 'active', last_seen_at = now() where id = $1 and org_id = $2`, [person.id, org.id]);
      await q.query(
        `insert into portal_sessions (org_id, portal_user_id, token_hash, expires_at, method, client)
         values ($1, $2, $3, now() + make_interval(days => $4), $5, $6)`,
        [org.id, person.id, await sha256Hex(session), auth.sessionDays, method, client],
      );
    });
    // Host-only, on the portal's own domain: never sent to the company's app.
    setCookie(c, PORTAL_COOKIE, session, { httpOnly: true, secure: cfg.scheme === 'https', sameSite: 'Strict', path: '/', maxAge: auth.sessionDays * 86400 });
    if (auth.notify && ['google', 'microsoft', 'passkey', 'password'].includes(method)) defer(deps, emailNewSignIn(deps, org, person, method, client));
    return c.json({ ok: true, locale: person.locale ?? null });
  }

  // ------------------------------------------------- email: link and code

  /** Always the same answer, so the form cannot be used to find out who has access. */
  app.post('/papi/auth/start', async (c) => {
    need(c, 'email');
    const { email } = await input(c, z.object({ email: emailSchema }));
    const p = await personByEmail(c.get('org').id, email);
    if (p && p.recent < 5) defer(deps, (await preparePortalEmail(deps, c.get('org'), p, 'signin'))());
    return c.json({ ok: true });
  });

  /** The six-digit code from the same email: for when the email is read on another device. */
  app.post('/papi/auth/code', async (c) => {
    need(c, 'email');
    const { email, code } = await input(c, z.object({ email: emailSchema, code: z.string().trim().regex(/^\d{6}$/) }));
    const org = c.get('org');
    const p = await personByEmail(org.id, email);
    if (!p) fail('portal_bad_code');
    const ok = await deps.db.system(async (q) => {
      const [t] = await q.query(
        `select token_hash, code_hash, attempts from portal_tokens
          where org_id = $1 and portal_user_id = $2 and kind = 'link' and code_hash is not null and used_at is null and expires_at > now()
          order by created_at desc limit 1`,
        [org.id, p!.id],
      );
      if (!t || t.attempts >= MAX_CODE_TRIES) return false;
      if (!safeEqual(await sha256Hex(`${t.token_hash}.${code}`), t.code_hash)) {
        await q.query('update portal_tokens set attempts = attempts + 1 where token_hash = $1', [t.token_hash]);
        return false;
      }
      const claimed = await q.query('update portal_tokens set used_at = now() where token_hash = $1 and used_at is null returning 1', [t.token_hash]);
      return claimed.length > 0;
    });
    if (!ok) fail('portal_bad_code');
    return openSession(c, p!, 'code');
  });

  /** A link from an email (invitation, sign-in) or the hand-over after Google/Microsoft. */
  app.post('/papi/auth/verify', async (c) => {
    const { token, code } = await input(c, z.object({ token: z.string().min(20).max(200), code: z.string().trim().regex(/^\d{6}$/).optional() }));
    const org = c.get('org');
    const hash = await sha256Hex(token);
    const [t] = await deps.db.system((q) =>
      q.query(
        `select t.*, pu.email, pu.name, pu.locale from portal_tokens t
           join portal_users pu on pu.id = t.portal_user_id and pu.org_id = t.org_id and pu.status in ('invited', 'active')
           join accounts a on a.id = pu.account_id and a.archived_at is null
          where t.token_hash = $1 and t.org_id = $2 and t.used_at is null and t.expires_at > now()
            and t.kind in ('invite', 'link', 'oauth', 'oauth_confirm')`,
        [hash, org.id],
      ),
    );
    if (!t) fail('invalid_token');
    const person: Person = { id: t.portal_user_id, email: t.email, name: t.name, locale: t.locale };
    let method: string = t.kind === 'invite' ? 'invite' : 'link';
    if (t.kind === 'link') need(c, 'email');
    if (t.kind === 'oauth' || t.kind === 'oauth_confirm') {
      need(c, t.provider);
      // Only the browser that started this sign-in may finish it.
      const flow = getCookie(c, FLOW_COOKIE);
      if (!flow || !safeEqual(await sha256Hex(flow), t.flow_hash ?? '')) fail('invalid_token');
      if (t.kind === 'oauth_confirm') {
        if (!code || t.attempts >= MAX_CODE_TRIES) fail('portal_bad_code');
        if (!safeEqual(await sha256Hex(`${hash}.${code}`), t.code_hash ?? '')) {
          await deps.db.system((q) => q.query('update portal_tokens set attempts = attempts + 1 where token_hash = $1', [hash]));
          fail('portal_bad_code');
        }
      }
      method = t.provider;
    }
    const claimed = await deps.db.system(async (q) => {
      const rows = await q.query('update portal_tokens set used_at = now() where token_hash = $1 and used_at is null returning 1', [hash]);
      if (rows.length && t.subject) {
        await q.query(
          `insert into portal_identities (org_id, portal_user_id, provider, subject, email, last_used_at) values ($1, $2, $3, $4, $5, now())
           on conflict (org_id, provider, subject) do update set last_used_at = now(), portal_user_id = excluded.portal_user_id`,
          [org.id, person.id, t.provider, t.subject, person.email],
        );
      }
      return rows.length > 0;
    });
    if (!claimed) fail('invalid_token');
    deleteCookie(c, FLOW_COOKIE, { path: '/papi/auth' });
    return openSession(c, person, method);
  });

  // --------------------------------------------------- Google / Microsoft

  app.get('/papi/auth/oauth/:provider/start', async (c) => {
    const flow = randomToken(24);
    const url = await portalOAuthStart(deps, c.get('org'), c.req.param('provider'), flow);
    if (!url) return c.redirect('/?error=method_off');
    setCookie(c, FLOW_COOKIE, flow, { httpOnly: true, secure: cfg.scheme === 'https', sameSite: 'Lax', path: '/papi/auth', maxAge: 600 });
    return c.redirect(url);
  });

  // ------------------------------------------------------------ password

  app.post('/papi/auth/password', async (c) => {
    need(c, 'password');
    const { email, password } = await input(c, z.object({ email: emailSchema, password: z.string().min(1).max(200) }));
    const org = c.get('org');
    const p = await personByEmail(org.id, email);
    const [stored] = p
      ? await deps.db.system((q) =>
          q.query(`select hash, failed, locked_until > now() as locked from portal_passwords where org_id = $1 and portal_user_id = $2`, [org.id, p.id]),
        )
      : [];
    if (stored?.locked) fail('portal_locked', { minutes: LOCK_MINUTES });
    // Unknown address or no password: the same time, the same answer.
    const ok = await checkPassword(password, stored?.hash ?? null);
    if (!ok || !p) {
      if (p && stored) {
        await deps.db.system((q) =>
          q.query(
            `update portal_passwords set failed = case when failed + 1 >= $3 then 0 else failed + 1 end,
                    locked_until = case when failed + 1 >= $3 then now() + make_interval(mins => $4) else locked_until end
              where org_id = $1 and portal_user_id = $2`,
            [org.id, p.id, LOCK_AFTER, LOCK_MINUTES],
          ),
        );
      }
      fail('portal_bad_password');
    }
    await deps.db.system((q) => q.query(`update portal_passwords set failed = 0, locked_until = null where org_id = $1 and portal_user_id = $2`, [org.id, p!.id]));
    return openSession(c, p!, 'password');
  });

  app.post('/papi/auth/forgot', async (c) => {
    need(c, 'password');
    const { email } = await input(c, z.object({ email: emailSchema }));
    const p = await personByEmail(c.get('org').id, email);
    if (p && p.recent < 5) defer(deps, (await preparePortalEmail(deps, c.get('org'), p, 'reset'))());
    return c.json({ ok: true });
  });

  app.post('/papi/auth/reset', async (c) => {
    need(c, 'password');
    const { token, password } = await input(c, z.object({ token: z.string().min(20).max(200), password: z.string().max(200) }));
    const org = c.get('org');
    const hash = await sha256Hex(token);
    const [t] = await deps.db.system((q) =>
      q.query(
        `select t.portal_user_id, pu.email, pu.name, pu.locale from portal_tokens t
           join portal_users pu on pu.id = t.portal_user_id and pu.org_id = t.org_id and pu.status in ('invited', 'active')
          where t.token_hash = $1 and t.org_id = $2 and t.kind = 'reset' and t.used_at is null and t.expires_at > now()`,
        [hash, org.id],
      ),
    );
    if (!t) fail('invalid_token');
    if (weakPassword(password, t.email)) fail('portal_weak_password');
    const stored = await hashPassword(password);
    const claimed = await deps.db.system(async (q) => {
      const rows = await q.query('update portal_tokens set used_at = now() where token_hash = $1 and used_at is null returning 1', [hash]);
      if (!rows.length) return false;
      await savePassword(q, org.id, t.portal_user_id, stored);
      return true;
    });
    if (!claimed) fail('invalid_token');
    return openSession(c, { id: t.portal_user_id, email: t.email, name: t.name, locale: t.locale }, 'password');
  });

  // ------------------------------------------------------------ passkeys

  app.post('/papi/auth/passkey/options', async (c) => {
    need(c, 'passkey');
    const { rpID } = rp(c);
    const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred', timeout: 120_000 });
    const challengeId = await saveChallenge(c.get('org').id, null, 'login', options.challenge);
    return c.json({ challengeId, options });
  });

  app.post('/papi/auth/passkey', async (c) => {
    need(c, 'passkey');
    const { challengeId, response } = await input(c, z.object({ challengeId: uuid, response: z.record(z.string(), z.any()) }));
    const org = c.get('org');
    const challenge = await takeChallenge(org.id, challengeId, 'login', null);
    const r = response as unknown as AuthenticationResponseJSON;
    const [cred] = await deps.db.system((q) =>
      q.query(
        `select k.*, pu.email, pu.name, pu.locale from portal_passkeys k
           join portal_users pu on pu.id = k.portal_user_id and pu.org_id = k.org_id and pu.status = 'active'
           join accounts a on a.id = pu.account_id and a.archived_at is null
          where k.org_id = $1 and k.credential_id = $2`,
        [org.id, String(r.id ?? '')],
      ),
    );
    if (!cred) fail('portal_passkey_failed');
    const { rpID, origin } = rp(c);
    const result = await verifyAuthenticationResponse({
      response: r,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: { id: cred.credential_id, publicKey: fromBase64url(cred.public_key), counter: Number(cred.counter), transports: cred.transports },
      requireUserVerification: false,
    }).catch(() => null);
    if (!result?.verified) fail('portal_passkey_failed');
    await deps.db.system((q) => q.query('update portal_passkeys set counter = $2, last_used_at = now() where id = $1', [cred.id, result!.authenticationInfo.newCounter]));
    return openSession(c, { id: cred.portal_user_id, email: cred.email, name: cred.name, locale: cred.locale }, 'passkey');
  });

  async function saveChallenge(orgId: string, personId: string | null, kind: 'login' | 'register', challenge: string) {
    const [row] = await deps.db.system((q) =>
      q.query(`insert into portal_challenges (org_id, portal_user_id, kind, challenge, expires_at) values ($1, $2, $3, $4, now() + interval '5 minutes') returning id`, [
        orgId,
        personId,
        kind,
        challenge,
      ]),
    );
    return row.id as string;
  }
  /** One use, five minutes, this company (and this person, when registering). */
  async function takeChallenge(orgId: string, id: string, kind: 'login' | 'register', personId: string | null): Promise<string> {
    const [row] = await deps.db.system((q) =>
      q.query(
        `update portal_challenges set used_at = now()
          where id = $1 and org_id = $2 and kind = $3 and used_at is null and expires_at > now()
            and portal_user_id is not distinct from $4
          returning challenge`,
        [id, orgId, kind, personId],
      ),
    );
    if (!row) fail('portal_passkey_failed');
    return row.challenge as string;
  }

  app.post('/papi/auth/logout', async (c) => {
    const token = getCookie(c, PORTAL_COOKIE);
    if (token) {
      const hash = await sha256Hex(token);
      await deps.db.system((q) => q.query('update portal_sessions set revoked_at = now() where token_hash = $1 and org_id = $2', [hash, c.get('org').id]));
    }
    deleteCookie(c, PORTAL_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  return { saveChallenge, takeChallenge, rp };
}

async function savePassword(q: { query: (s: string, p?: unknown[]) => Promise<unknown> }, orgId: string, personId: string, stored: string) {
  await q.query(
    `insert into portal_passwords (org_id, portal_user_id, hash, set_at) values ($1, $2, $3, now())
     on conflict (org_id, portal_user_id) do update set hash = excluded.hash, set_at = now(), failed = 0, locked_until = null`,
    [orgId, personId, stored],
  );
}

/** The signed-in person's own sign-in settings: passkeys, password, linked accounts, signing out everywhere. */
export function mountAccount(app: Hono<PortalEnv>, deps: Deps, helpers: ReturnType<typeof mountSignIn>) {
  const { saveChallenge, takeChallenge, rp } = helpers;
  const options = (c: C) => signInOptions(c.get('org'), deps);

  app.get('/papi/account', async (c) => {
    const org = c.get('org');
    const person = c.get('person');
    const out = await deps.db.system(async (q) => {
      const [u] = await q.query('select email from portal_users where id = $1 and org_id = $2', [person.id, org.id]);
      const [pw] = await q.query('select set_at from portal_passwords where org_id = $1 and portal_user_id = $2', [org.id, person.id]);
      const keys = await q.query('select id, name, created_at, last_used_at from portal_passkeys where org_id = $1 and portal_user_id = $2 order by created_at', [org.id, person.id]);
      const ids = await q.query('select provider, email, last_used_at from portal_identities where org_id = $1 and portal_user_id = $2 order by provider', [org.id, person.id]);
      const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
      const account: PortalAccount = {
        email: u.email,
        methods: options(c),
        password: { set: !!pw, setAt: iso(pw?.set_at) },
        passkeys: keys.map((k) => ({ id: k.id, name: k.name, createdAt: iso(k.created_at)!, lastUsedAt: iso(k.last_used_at) })),
        identities: ids.map((i) => ({ provider: i.provider, email: i.email, lastUsedAt: iso(i.last_used_at) })),
      };
      return account;
    });
    return c.json(out);
  });

  app.put('/papi/account/password', async (c) => {
    if (!options(c).password) fail('portal_method_off');
    const { current, password } = await input(c, z.object({ current: z.string().max(200).optional(), password: z.string().max(200) }));
    const org = c.get('org');
    const person = c.get('person');
    const [u] = await deps.db.system((q) => q.query('select email from portal_users where id = $1 and org_id = $2', [person.id, org.id]));
    const [stored] = await deps.db.system((q) => q.query('select hash from portal_passwords where org_id = $1 and portal_user_id = $2', [org.id, person.id]));
    // Changing a password needs the current one.
    if (stored && !(await checkPassword(current ?? '', stored.hash))) fail('portal_bad_password');
    if (weakPassword(password, u.email)) fail('portal_weak_password');
    const hash = await hashPassword(password);
    await deps.db.system((q) => savePassword(q, org.id, person.id, hash));
    return c.json({ ok: true });
  });

  app.post('/papi/account/passkeys/options', async (c) => {
    if (!options(c).passkey) fail('portal_method_off');
    const org = c.get('org');
    const person = c.get('person');
    const existing = await deps.db.system((q) => q.query('select credential_id, transports from portal_passkeys where org_id = $1 and portal_user_id = $2', [org.id, person.id]));
    if (existing.length >= 10) fail('portal_passkey_failed');
    const [u] = await deps.db.system((q) => q.query('select email, name from portal_users where id = $1 and org_id = $2', [person.id, org.id]));
    const { rpID } = rp(c);
    const opts = await generateRegistrationOptions({
      rpName: org.name,
      rpID,
      userName: u.email,
      userDisplayName: u.name,
      userID: new TextEncoder().encode(person.id),
      attestationType: 'none',
      excludeCredentials: existing.map((e) => ({ id: e.credential_id, transports: e.transports })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
      timeout: 120_000,
    });
    const challengeId = await saveChallenge(org.id, person.id, 'register', opts.challenge);
    return c.json({ challengeId, options: opts });
  });

  app.post('/papi/account/passkeys', async (c) => {
    if (!options(c).passkey) fail('portal_method_off');
    const { challengeId, response, name } = await input(c, z.object({ challengeId: uuid, response: z.record(z.string(), z.any()), name: z.string().trim().max(80).optional() }));
    const org = c.get('org');
    const person = c.get('person');
    const challenge = await takeChallenge(org.id, challengeId, 'register', person.id);
    const { rpID, origin } = rp(c);
    const result = await verifyRegistrationResponse({
      response: response as unknown as RegistrationResponseJSON,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    }).catch(() => null);
    if (!result?.verified || !result.registrationInfo) fail('portal_passkey_failed');
    const cred = result!.registrationInfo!.credential;
    const transports = cred.transports ?? ((response as any).response?.transports as string[] | undefined) ?? [];
    const [row] = await deps.db.system((q) =>
      q.query(
        `insert into portal_passkeys (org_id, portal_user_id, credential_id, public_key, counter, transports, name)
         values ($1, $2, $3, $4, $5, $6, $7) on conflict (org_id, credential_id) do nothing returning id`,
        [org.id, person.id, cred.id, base64url(cred.publicKey), cred.counter, transports, name || clientOf(c.req.header('user-agent')) || 'Passkey'],
      ),
    );
    if (!row) fail('portal_passkey_failed');
    return c.json({ ok: true }, 201);
  });

  app.delete('/papi/account/passkeys/:id', async (c) => {
    const id = c.req.param('id');
    if (!uuid.safeParse(id).success) fail('not_found');
    const rows = await deps.db.system((q) =>
      q.query('delete from portal_passkeys where id = $1 and org_id = $2 and portal_user_id = $3 returning 1', [id, c.get('org').id, c.get('person').id]),
    );
    if (!rows.length) fail('not_found');
    return c.json({ ok: true });
  });

  app.delete('/papi/account/identities/:provider', async (c) => {
    const provider = c.req.param('provider');
    if (provider !== 'google' && provider !== 'microsoft') fail('not_found');
    await deps.db.system((q) => q.query('delete from portal_identities where org_id = $1 and portal_user_id = $2 and provider = $3', [c.get('org').id, c.get('person').id, provider]));
    return c.json({ ok: true });
  });

  /** Signs out on every device, this one too. */
  app.post('/papi/account/signout-all', async (c) => {
    await deps.db.system((q) =>
      q.query('update portal_sessions set revoked_at = now() where org_id = $1 and portal_user_id = $2 and revoked_at is null', [c.get('org').id, c.get('person').id]),
    );
    deleteCookie(c, PORTAL_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });
}
