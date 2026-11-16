// Identity beyond the emailed link: passkeys, an authenticator app with
// one-time recovery codes, the company's "second step required" setting, and a
// fresh confirmation before dangerous actions.
//
// Rules that keep anyone from being locked out of their company:
//   - the emailed link (or SSO) is always the first step; a second step is added to it;
//   - ten recovery codes come with every authenticator app, each works once;
//   - an administrator can reset someone else's second step (they set it up again
//     at their next sign-in);
//   - the company setting can only be turned on by an administrator who has a
//     second step themselves, and nobody can remove their last one while it is on;
//   - a self-hosted install can reset a person from the server's environment
//     (RESET_SECOND_STEP, see selfhost.ts) — the break-glass path.
// SSO sign-ins pass: the identity provider does the company's second step.
// When SSO is required, a backup administrator's emailed link (routes/auth.ts) always
// needs a passkey or the authenticator app; recovery codes and setting one up are not offered.
//
// The tables (migration 0052) are reachable only with owner access, so every
// statement here names the company.
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import type { Perm } from '../../../shared/src/model';
import { SECOND_STEP_POLICIES, type SecondStepPolicy } from '../../../shared/src/identity';
import { maxDevices, nowOf, run, secretsKey, type C, type OrgRow } from '../context';
import type { Q } from '../db';
import { base64url, fromBase64url, randomToken, seal, sha256Hex, unseal } from './crypto';
import { fail } from './errors';
import { openSession } from './sessions';
import { checkTotp, newRecoveryCode, newSecret, otpauthUri, recoveryHash } from './totp';

/** A fresh confirmation (or a sign-in) counts this long for dangerous actions. */
export const FRESH_MINUTES = 10;
const SECOND_STEP_MINUTES = 15;
const MAX_TRIES = 5;
export const RECOVERY_CODES = 10;
const MAX_PASSKEYS = 10;

export function secondStepPolicy(org: Pick<OrgRow, 'settings'>): SecondStepPolicy {
  const p = (org.settings as any)?.secondStep;
  return (SECOND_STEP_POLICIES as readonly string[]).includes(p) ? p : 'off';
}

/** Does the company require a second step of someone with these permissions? */
export function secondStepRequired(org: Pick<OrgRow, 'settings'>, perms: readonly string[]): boolean {
  const p = secondStepPolicy(org);
  return p === 'everyone' || (p === 'admins' && perms.includes('org.manage'));
}

export interface Factors {
  totp: boolean;
  passkeys: number;
  recoveryLeft: number;
}

export async function factorsOf(c: C, userId: string): Promise<Factors> {
  const orgId = c.get('org').id;
  const [r] = await c.get('deps').db.system((q) =>
    q.query<{ totp: boolean; passkeys: number; recovery: number }>(
      `select exists (select 1 from user_totp where org_id = $1 and user_id = $2 and confirmed_at is not null) as totp,
              (select count(*)::int from user_passkeys where org_id = $1 and user_id = $2) as passkeys,
              (select count(*)::int from user_recovery_codes where org_id = $1 and user_id = $2 and used_at is null) as recovery`,
      [orgId, userId],
    ),
  );
  return { totp: r.totp, passkeys: r.passkeys, recoveryLeft: r.recovery };
}
export const hasFactor = (f: Factors) => f.totp || f.passkeys > 0;

/** The company's own address is the passkey's home (one company, one set of passkeys). */
export function rp(c: C) {
  const cfg = c.get('deps').config;
  const host = (c.req.header('host') ?? new URL(c.req.url).host).toLowerCase();
  return { rpID: host.split(':')[0], origin: `${cfg.scheme}://${host}` };
}

const ip = (c: C) => ({ ip: c.req.header('cf-connecting-ip') ?? null, geo: c.req.header('cf-ipcountry') ?? null });

// ------------------------------------------------------------------ signing in

export type SignInOutcome =
  | { kind: 'session'; token: string; evicted: number }
  | { kind: 'second'; token: string; methods: ('totp' | 'passkey' | 'recovery')[]; enroll: boolean };

/**
 * The first step (emailed link, provider plus device code) has proved who this is.
 * Either the session opens, or the person is asked for their second step — or,
 * when the company requires one and they have none yet, to set one up.
 */
export async function afterFirstStep(
  c: C,
  user: { id: string },
  device: { deviceId: string; deviceLabel: string | null; method: 'magic' | 'oauth' },
  // A backup administrator's sign-in while SSO is required: always a passkey or the app, never the link alone.
  backup = false,
): Promise<SignInOutcome> {
  const deps = c.get('deps');
  const org = c.get('org');
  const f = await factorsOf(c, user.id);
  const [role] = await deps.db.system((q) =>
    q.query<{ perms: Perm[] }>('select r.perms from users u join roles r on r.id = u.role_id where u.org_id = $1 and u.id = $2', [org.id, user.id]),
  );
  const required = secondStepRequired(org, role?.perms ?? []);
  if (backup && !hasFactor(f)) fail('sso_required');
  if (!hasFactor(f) && !required && !backup) {
    const s = await run(c, (q) =>
      openSession(q, { orgId: org.id, userId: user.id, ...device, ...ip(c), maxDevices: maxDevices(c), days: deps.config.sessionDays }),
    );
    return { kind: 'session', token: s.token, evicted: s.evicted.length };
  }
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  await deps.db.system((q) =>
    q.query(
      `insert into identity_steps (org_id, user_id, kind, token_hash, device_id, device_label, method, backup, expires_at)
       values ($1, $2, 'second', $3, $4, $5, $6, $8, now() + make_interval(mins => $7::int))`,
      [org.id, user.id, tokenHash, device.deviceId, device.deviceLabel, device.method, SECOND_STEP_MINUTES, backup],
    ),
  );
  const methods: ('totp' | 'passkey' | 'recovery')[] = [];
  if (f.totp) methods.push('totp');
  if (f.passkeys) methods.push('passkey');
  if (f.recoveryLeft && !backup) methods.push('recovery');
  return { kind: 'second', token, methods, enroll: !hasFactor(f) };
}

interface Step {
  id: string;
  user_id: string;
  device_id: string;
  device_label: string | null;
  method: 'magic' | 'oauth';
  challenge: string | null;
  attempts: number;
  backup: boolean;
}

/** A sign-in waiting for its second step, for this company and this device; counts a try. */
export async function takeStep(c: C, token: string, deviceId: string, count = true): Promise<Step> {
  const tokenHash = await sha256Hex(token);
  const [row] = await c.get('deps').db.system((q) =>
    q.query<Step>(
      `update identity_steps set attempts = attempts + $3
        where org_id = $1 and token_hash = $2 and kind = 'second' and used_at is null and expires_at > now()
        returning id, user_id, device_id, device_label, method, challenge, attempts, backup`,
      [c.get('org').id, tokenHash, count ? 1 : 0],
    ),
  );
  if (!row || row.device_id !== deviceId) fail('invalid_token');
  if (row!.attempts > MAX_TRIES) fail('too_many_requests');
  return row!;
}

/** Ends the waiting sign-in and opens the session, marked with the second step it passed. */
export async function finishStep(c: C, step: Step, secondStep: 'totp' | 'recovery' | 'passkey') {
  const deps = c.get('deps');
  const org = c.get('org');
  await deps.db.system((q) => q.query('update identity_steps set used_at = now() where org_id = $1 and id = $2', [org.id, step.id]));
  return run(c, async (q) => {
    await q.query(`update users set status = 'active' where id = $1 and status = 'invited'`, [step.user_id]);
    const s = await openSession(q, {
      orgId: org.id,
      userId: step.user_id,
      deviceId: step.device_id,
      deviceLabel: step.device_label,
      method: step.method,
      secondStep,
      ...ip(c),
      maxDevices: maxDevices(c),
      days: deps.config.sessionDays,
    });
    return { token: s.token, evicted: s.evicted.length };
  });
}

// ------------------------------------------------------------------ authenticator app

/** Starts (or restarts) setting up an authenticator app; only an unconfirmed one is replaced. */
export async function startTotp(c: C, user: { id: string; email: string }) {
  const deps = c.get('deps');
  const org = c.get('org');
  const secret = newSecret();
  const sealed = await seal({ s: secret }, secretsKey(deps.config));
  const rows = await deps.db.system((q) =>
    q.query(
      `insert into user_totp (org_id, user_id, secret_sealed) values ($1, $2, $3)
       on conflict (org_id, user_id) do update set secret_sealed = excluded.secret_sealed, created_at = now(), last_step = 0
        where user_totp.confirmed_at is null
       returning 1`,
      [org.id, user.id, sealed],
    ),
  );
  if (!rows.length) fail('conflict');
  return { secret, uri: otpauthUri(secret, user.email, org.name ? `Curahold ${org.name}` : 'Curahold') };
}

/**
 * Checks an authenticator code (confirmed app, or — with `confirming` — the one
 * being set up). Right: the step is stored so the code cannot be used again.
 */
export async function useTotp(c: C, userId: string, code: string, confirming = false): Promise<boolean> {
  const deps = c.get('deps');
  const orgId = c.get('org').id;
  const [row] = await deps.db.system((q) =>
    q.query<{ secret_sealed: string; last_step: string; confirmed_at: Date | null }>(
      'select secret_sealed, last_step, confirmed_at from user_totp where org_id = $1 and user_id = $2',
      [orgId, userId],
    ),
  );
  if (!row || !!row.confirmed_at === confirming) return false;
  const secret = (await unseal<{ s: string }>(row.secret_sealed, secretsKey(deps.config)))?.s;
  if (!secret) return false;
  const step = await checkTotp(secret, code, nowOf(deps).getTime(), Number(row.last_step));
  if (step === null) return false;
  const done = await deps.db.system((q) =>
    q.query(
      `update user_totp set last_step = $3, confirmed_at = coalesce(confirmed_at, now())
        where org_id = $1 and user_id = $2 and last_step < $3 returning 1`,
      [orgId, userId, step],
    ),
  );
  return done.length > 0;
}

/** A new set of recovery codes (the old ones stop working). Shown once. */
export async function newRecoveryCodes(c: C, userId: string): Promise<string[]> {
  const orgId = c.get('org').id;
  const codes = Array.from({ length: RECOVERY_CODES }, newRecoveryCode);
  const hashes = await Promise.all(codes.map(recoveryHash));
  await c.get('deps').db.system(async (q) => {
    await q.query('delete from user_recovery_codes where org_id = $1 and user_id = $2', [orgId, userId]);
    for (const h of hashes) await q.query('insert into user_recovery_codes (org_id, user_id, code_hash) values ($1, $2, $3)', [orgId, userId, h]);
  });
  return codes;
}

export async function useRecovery(c: C, userId: string, code: string): Promise<boolean> {
  const rows = await c.get('deps').db.system(async (q) =>
    q.query(
      `update user_recovery_codes set used_at = now()
        where id = (select id from user_recovery_codes where org_id = $1 and user_id = $2 and code_hash = $3 and used_at is null limit 1)
        returning 1`,
      [c.get('org').id, userId, await recoveryHash(code)],
    ),
  );
  return rows.length > 0;
}

// ------------------------------------------------------------------ passkeys

async function saveChallenge(c: C, userId: string | null, kind: 'login' | 'register' | 'confirm', challenge: string) {
  const [row] = await c.get('deps').db.system((q) =>
    q.query<{ id: string }>(
      `insert into identity_steps (org_id, user_id, kind, challenge, expires_at) values ($1, $2, $3, $4, now() + interval '5 minutes') returning id`,
      [c.get('org').id, userId, kind, challenge],
    ),
  );
  return row.id;
}

async function takeChallenge(c: C, id: string, kind: 'login' | 'register' | 'confirm', userId: string | null): Promise<string> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) fail('passkey_failed');
  const [row] = await c.get('deps').db.system((q) =>
    q.query<{ challenge: string }>(
      `update identity_steps set used_at = now()
        where id = $1 and org_id = $2 and kind = $3 and used_at is null and expires_at > now() and user_id is not distinct from $4
        returning challenge`,
      [id, c.get('org').id, kind, userId],
    ),
  );
  if (!row) fail('passkey_failed');
  return row!.challenge;
}

async function credentialsOf(c: C, userId: string) {
  return c.get('deps').db.system((q) =>
    q.query<{ credential_id: string; transports: string[] }>('select credential_id, transports from user_passkeys where org_id = $1 and user_id = $2', [
      c.get('org').id,
      userId,
    ]),
  );
}

/** Options for signing in or confirming with a passkey. `userId` limits it to that person's passkeys. */
export async function passkeyOptions(c: C, kind: 'login' | 'confirm', userId: string | null) {
  const allow = userId ? (await credentialsOf(c, userId)).map((k) => ({ id: k.credential_id, transports: k.transports as any })) : undefined;
  const options = await generateAuthenticationOptions({ rpID: rp(c).rpID, userVerification: 'required', timeout: 120_000, allowCredentials: allow });
  return { challengeId: await saveChallenge(c, userId, kind, options.challenge), options };
}

/** Checks a passkey answer. Returns the person it belongs to (must be `userId` when given). */
export async function checkPasskey(c: C, kind: 'login' | 'confirm', challengeId: string, response: unknown, userId: string | null): Promise<string> {
  const challenge = await takeChallenge(c, challengeId, kind, userId);
  const r = response as AuthenticationResponseJSON;
  const orgId = c.get('org').id;
  const [cred] = await c.get('deps').db.system((q) =>
    q.query(
      `select k.id, k.user_id, k.credential_id, k.public_key, k.counter, k.transports from user_passkeys k
         join users u on u.id = k.user_id and u.org_id = k.org_id and u.status in ('active', 'invited')
        where k.org_id = $1 and k.credential_id = $2`,
      [orgId, String((r as any)?.id ?? '')],
    ),
  );
  if (!cred || (userId && cred.user_id !== userId)) fail('passkey_failed');
  const { rpID, origin } = rp(c);
  const result = await verifyAuthenticationResponse({
    response: r,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: { id: cred.credential_id, publicKey: fromBase64url(cred.public_key), counter: Number(cred.counter), transports: cred.transports },
    requireUserVerification: true,
  }).catch(() => null);
  if (!result?.verified) fail('passkey_failed');
  await c
    .get('deps')
    .db.system((q) => q.query('update user_passkeys set counter = $3, last_used_at = now() where org_id = $1 and id = $2', [orgId, cred.id, result!.authenticationInfo.newCounter]));
  return cred.user_id as string;
}

export async function registrationOptions(c: C, user: { id: string; email: string; name: string }) {
  const existing = await credentialsOf(c, user.id);
  if (existing.length >= MAX_PASSKEYS) fail('passkey_failed');
  const opts = await generateRegistrationOptions({
    rpName: c.get('org').name,
    rpID: rp(c).rpID,
    userName: user.email,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(user.id),
    attestationType: 'none',
    excludeCredentials: existing.map((e) => ({ id: e.credential_id, transports: e.transports as any })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    timeout: 120_000,
  });
  return { challengeId: await saveChallenge(c, user.id, 'register', opts.challenge), options: opts };
}

export async function registerPasskey(c: C, userId: string, challengeId: string, response: unknown, name: string | undefined, fallbackName: string) {
  const challenge = await takeChallenge(c, challengeId, 'register', userId);
  const { rpID, origin } = rp(c);
  const result = await verifyRegistrationResponse({
    response: response as RegistrationResponseJSON,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  }).catch(() => null);
  if (!result?.verified || !result.registrationInfo) fail('passkey_failed');
  const cred = result!.registrationInfo!.credential;
  const transports = cred.transports ?? ((response as any)?.response?.transports as string[] | undefined) ?? [];
  const [row] = await c.get('deps').db.system((q) =>
    q.query<{ id: string }>(
      `insert into user_passkeys (org_id, user_id, credential_id, public_key, counter, transports, name)
       values ($1, $2, $3, $4, $5, $6, $7) on conflict (org_id, credential_id) do nothing returning id`,
      [c.get('org').id, userId, cred.id, base64url(cred.publicKey), cred.counter, transports, (name || fallbackName || 'Passkey').slice(0, 80)],
    ),
  );
  if (!row) fail('passkey_failed');
  return row!.id;
}

// ------------------------------------------------------------------ fresh confirmation

/**
 * Dangerous actions (roles, SSO and SCIM, API keys, exports, removing people,
 * the security settings themselves) need the person to have signed in or
 * confirmed it is them in the last ten minutes. API keys and app tokens are
 * their own credential and pass; support never reaches these addresses.
 */
export async function requireFresh(c: C): Promise<void> {
  if (c.get('tokenKind')) return;
  if (c.get('supportBy') || c.get('previewBy')) fail('forbidden');
  const auth = c.get('auth');
  const [row] = await c.get('deps').db.system((q) =>
    q.query<{ fresh: boolean }>(
      `select greatest(created_at, coalesce(confirmed_at, created_at)) > now() - make_interval(mins => $3::int) as fresh
         from sessions where org_id = $1 and id = $2`,
      [c.get('org').id, auth.sessionId, FRESH_MINUTES],
    ),
  );
  if (!row?.fresh) fail('reauth_required');
}

export async function markConfirmed(c: C) {
  const orgId = c.get('org').id;
  await c.get('deps').db.system((q) => q.query('update sessions set confirmed_at = now() where org_id = $1 and id = $2', [orgId, c.get('auth').sessionId]));
}

/** Removes every second step of a person (an administrator's reset, or the break-glass path). */
export async function resetFactors(q: Q, orgId: string, userId: string) {
  await q.query('delete from user_totp where org_id = $1 and user_id = $2', [orgId, userId]);
  await q.query('delete from user_recovery_codes where org_id = $1 and user_id = $2', [orgId, userId]);
  await q.query('delete from user_passkeys where org_id = $1 and user_id = $2', [orgId, userId]);
}

