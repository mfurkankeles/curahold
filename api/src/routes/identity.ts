// A person's own sign-in security (authenticator app, passkeys, recovery codes,
// signing out other devices), the fresh confirmation before dangerous actions,
// and the company's setting "a second step is required" (lib/identity.ts).
import { Hono } from 'hono';
import { z } from 'zod';
import { translate, type Locale } from '../../../shared/src/i18n';
import { SECOND_STEP_POLICIES, type MySecurity, type PersonSecurity } from '../../../shared/src/identity';
import { requirePerm, run, type AppEnv, type C } from '../context';
import { audit } from '../lib/audit';
import { randomDigits, sha256Hex, safeEqual } from '../lib/crypto';
import { fail } from '../lib/errors';
import {
  checkPasskey,
  factorsOf,
  hasFactor,
  markConfirmed,
  newRecoveryCodes,
  passkeyOptions,
  registerPasskey,
  registrationOptions,
  requireFresh,
  resetFactors,
  secondStepPolicy,
  secondStepRequired,
  startTotp,
  useRecovery,
  useTotp,
} from '../lib/identity';
import { clientOf } from '../lib/portal';
import { body, param } from '../lib/validate';

export const identityRoutes = new Hono<AppEnv>();

const CONFIRM_CODE_MINUTES = 10;
const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);

/** Only the person, in their own browser session (not a key, not support, not a preview). */
function self(c: C) {
  if (c.get('tokenKind') || c.get('supportBy') || c.get('previewBy')) fail('forbidden');
  return c.get('auth');
}

const sys = (c: C) => c.get('deps').db.system.bind(c.get('deps').db);
const note = (c: C, action: string, meta?: Record<string, unknown>, entityId?: string) =>
  run(c, (q) => audit(q, { orgId: c.get('org').id, actorId: c.get('auth').userId, action, entity: 'user', entityId: entityId ?? c.get('auth').userId, meta }));

/** Removing this would leave the person without a second step the company requires. */
async function assertKeepsOne(c: C, removing: 'totp' | 'passkey') {
  const auth = c.get('auth');
  if (!secondStepRequired(c.get('org'), auth.perms)) return;
  const f = await factorsOf(c, auth.userId);
  const left = (removing === 'totp' ? 0 : Number(f.totp)) + (removing === 'passkey' ? f.passkeys - 1 : f.passkeys);
  if (left < 1) fail('second_step_required');
}

identityRoutes.get('/me/security', async (c) => {
  const auth = self(c);
  const org = c.get('org');
  const f = await factorsOf(c, auth.userId);
  const keys = await sys(c)((q) =>
    q.query('select id, name, created_at, last_used_at from user_passkeys where org_id = $1 and user_id = $2 order by created_at', [org.id, auth.userId]),
  );
  const out: MySecurity = {
    totp: f.totp,
    passkeys: keys.map((k) => ({ id: k.id, name: k.name, createdAt: iso(k.created_at)!, lastUsedAt: iso(k.last_used_at) })),
    recoveryLeft: f.recoveryLeft,
    required: secondStepRequired(org, auth.perms),
    policy: secondStepPolicy(org),
  };
  return c.json(out);
});

// ------------------------------------------------------------ authenticator app

identityRoutes.post('/me/security/totp', async (c) => {
  const auth = self(c);
  await requireFresh(c);
  if ((await factorsOf(c, auth.userId)).totp) fail('conflict');
  return c.json(await startTotp(c, { id: auth.userId, email: auth.email }));
});

identityRoutes.post('/me/security/totp/confirm', async (c) => {
  const auth = self(c);
  const { code } = await body(c, z.object({ code: z.string().trim().regex(/^\d{6}$/) }));
  if (!(await useTotp(c, auth.userId, code, true))) fail('second_step_failed');
  const recoveryCodes = await newRecoveryCodes(c, auth.userId);
  await note(c, 'second_step.added', { via: 'totp' });
  return c.json({ recoveryCodes });
});

identityRoutes.delete('/me/security/totp', async (c) => {
  const auth = self(c);
  await requireFresh(c);
  await assertKeepsOne(c, 'totp');
  await sys(c)(async (q) => {
    await q.query('delete from user_totp where org_id = $1 and user_id = $2', [c.get('org').id, auth.userId]);
    await q.query('delete from user_recovery_codes where org_id = $1 and user_id = $2', [c.get('org').id, auth.userId]);
  });
  await note(c, 'second_step.removed', { via: 'totp' });
  return c.json({ ok: true });
});

identityRoutes.post('/me/security/recovery-codes', async (c) => {
  const auth = self(c);
  await requireFresh(c);
  if (!hasFactor(await factorsOf(c, auth.userId))) fail('forbidden');
  const recoveryCodes = await newRecoveryCodes(c, auth.userId);
  await note(c, 'second_step.recovery_renewed');
  return c.json({ recoveryCodes });
});

// ------------------------------------------------------------ passkeys

identityRoutes.post('/me/security/passkeys/options', async (c) => {
  const auth = self(c);
  await requireFresh(c);
  return c.json(await registrationOptions(c, { id: auth.userId, email: auth.email, name: auth.name }));
});

identityRoutes.post('/me/security/passkeys', async (c) => {
  const auth = self(c);
  const input = await body(c, z.object({ challengeId: z.string().max(40), response: z.record(z.string(), z.any()), name: z.string().trim().max(80).optional() }));
  const id = await registerPasskey(c, auth.userId, input.challengeId, input.response, input.name, clientOf(c.req.header('user-agent')) ?? '');
  await note(c, 'second_step.added', { via: 'passkey' });
  return c.json({ id }, 201);
});

identityRoutes.delete('/me/security/passkeys/:id', async (c) => {
  const auth = self(c);
  const id = param(c, 'id');
  await requireFresh(c);
  await assertKeepsOne(c, 'passkey');
  const rows = await sys(c)((q) => q.query('delete from user_passkeys where org_id = $1 and user_id = $2 and id = $3 returning 1', [c.get('org').id, auth.userId, id]));
  if (!rows.length) fail('not_found');
  await note(c, 'second_step.removed', { via: 'passkey' });
  return c.json({ ok: true });
});

// ------------------------------------------------------------ other devices

identityRoutes.post('/me/sessions/sign-out-others', async (c) => {
  const auth = self(c);
  const n = await run(c, async (q) => {
    const rows = await q.query(
      `update sessions set revoked_at = now(), revoke_reason = 'user' where user_id = $1 and id <> $2 and revoked_at is null returning id`,
      [auth.userId, auth.sessionId],
    );
    if (rows.length) await audit(q, { orgId: c.get('org').id, actorId: auth.userId, action: 'session.revoked_others', entity: 'user', entityId: auth.userId, meta: { count: rows.length } });
    return rows.length;
  });
  return c.json({ signedOut: n });
});

// ------------------------------------------------------------ fresh confirmation

/** How this person can confirm it is them: their second step if they have one, else a code by email. */
identityRoutes.post('/me/confirm/options', async (c) => {
  const auth = self(c);
  const f = await factorsOf(c, auth.userId);
  const methods: string[] = [];
  if (f.totp) methods.push('totp');
  if (f.passkeys) methods.push('passkey');
  if (hasFactor(f) && f.recoveryLeft) methods.push('recovery');
  if (!hasFactor(f)) methods.push('email');
  return c.json({ methods, ...(f.passkeys ? { passkey: await passkeyOptions(c, 'confirm', auth.userId) } : {}) });
});

identityRoutes.post('/me/confirm/email', async (c) => {
  const auth = self(c);
  // Someone with a second step confirms with it; an emailed code would be the weaker way round.
  if (hasFactor(await factorsOf(c, auth.userId))) fail('forbidden');
  const org = c.get('org');
  const deps = c.get('deps');
  const code = randomDigits(6);
  const made = await sys(c)(async (q) => {
    const [{ n }] = await q.query<{ n: number }>(
      `select count(*)::int as n from identity_steps where org_id = $1 and user_id = $2 and kind = 'confirm' and code_hash is not null and created_at > now() - interval '15 minutes'`,
      [org.id, auth.userId],
    );
    if (n >= 5) return false;
    await q.query(
      `insert into identity_steps (org_id, user_id, kind, code_hash, expires_at) values ($1, $2, 'confirm', $3, now() + make_interval(mins => $4::int))`,
      [org.id, auth.userId, await sha256Hex(`confirm:${code}`), CONFIRM_CODE_MINUTES],
    );
    return true;
  });
  if (!made) fail('too_many_requests');
  const locale = (auth.locale ?? org.locale) as Locale;
  await deps.email.send({
    to: auth.email,
    subject: translate(locale, 'email.confirm.subject', { org: org.name, code }),
    text: translate(locale, 'email.confirm.body', { org: org.name, name: auth.name, code }),
  });
  return c.json({ ok: true, ...(deps.config.devExposeTokens ? { devCode: code } : {}) });
});

identityRoutes.post('/me/confirm', async (c) => {
  const auth = self(c);
  const input = await body(
    c,
    z.object({
      code: z.string().trim().regex(/^\d{6}$/).optional(),
      emailCode: z.string().trim().regex(/^\d{6}$/).optional(),
      recoveryCode: z.string().trim().min(8).max(20).optional(),
      passkey: z.object({ challengeId: z.string().max(40), response: z.record(z.string(), z.any()) }).optional(),
    }),
  );
  const f = await factorsOf(c, auth.userId);
  const org = c.get('org');
  let via: string | null = null;
  if (input.code && f.totp) via = (await useTotp(c, auth.userId, input.code)) ? 'totp' : null;
  else if (input.recoveryCode && hasFactor(f)) via = (await useRecovery(c, auth.userId, input.recoveryCode)) ? 'recovery' : null;
  else if (input.passkey && f.passkeys) via = (await checkPasskey(c, 'confirm', input.passkey.challengeId, input.passkey.response, auth.userId).catch(() => null)) ? 'passkey' : null;
  else if (input.emailCode && !hasFactor(f)) {
    const want = await sha256Hex(`confirm:${input.emailCode}`);
    via = await sys(c)(async (q) => {
      const [row] = await q.query<{ id: string; code_hash: string; attempts: number }>(
        `select id, code_hash, attempts from identity_steps
          where org_id = $1 and user_id = $2 and kind = 'confirm' and code_hash is not null and used_at is null and expires_at > now()
          order by created_at desc limit 1 for update`,
        [org.id, auth.userId],
      );
      if (!row || row.attempts >= 5) return null;
      if (!safeEqual(row.code_hash, want)) {
        await q.query('update identity_steps set attempts = attempts + 1 where org_id = $1 and id = $2', [org.id, row.id]);
        return null;
      }
      await q.query('update identity_steps set used_at = now() where org_id = $1 and id = $2', [org.id, row.id]);
      return 'email';
    });
  }
  if (!via) fail('second_step_failed');
  await markConfirmed(c);
  await note(c, 'user.confirmed', { via });
  return c.json({ ok: true });
});

// ------------------------------------------------------------ the company's setting

identityRoutes.get('/admin/security', async (c) => {
  requirePerm(c, 'org.manage');
  const org = c.get('org');
  const rows = await sys(c)((q) =>
    q.query(
      `select u.id, u.name, u.email, 'org.manage' = any(r.perms) as admin,
              exists (select 1 from user_totp t where t.org_id = u.org_id and t.user_id = u.id and t.confirmed_at is not null) as totp,
              (select count(*)::int from user_passkeys k where k.org_id = u.org_id and k.user_id = u.id) as passkeys
         from users u join roles r on r.id = u.role_id
        where u.org_id = $1 and u.status in ('active', 'invited')
        order by u.name limit 5000`,
      [org.id],
    ),
  );
  const people: PersonSecurity[] = rows.map((r) => ({ id: r.id, name: r.name, email: r.email, admin: r.admin, totp: r.totp, passkeys: r.passkeys }));
  return c.json({ policy: secondStepPolicy(org), people });
});

identityRoutes.put('/admin/security', async (c) => {
  requirePerm(c, 'org.manage');
  const { secondStep } = await body(c, z.object({ secondStep: z.enum(SECOND_STEP_POLICIES) }));
  await requireFresh(c);
  const auth = c.get('auth');
  const org = c.get('org');
  // Whoever turns it on must already have a second step: nobody locks the company's last administrator out.
  if (secondStep !== 'off' && !hasFactor(await factorsOf(c, auth.userId))) fail('second_step_setup_first');
  const before = secondStepPolicy(org);
  await run(c, async (q) => {
    await q.query(`update orgs set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{secondStep}', to_jsonb($2::text)) where id = $1`, [org.id, secondStep]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'org.second_step_policy', entity: 'org', entityId: org.id, meta: { from: before, to: secondStep } });
  });
  return c.json({ policy: secondStep });
});

/** An administrator resets someone's second step (lost phone): they set it up again at their next sign-in. */
identityRoutes.delete('/admin/users/:id/second-step', async (c) => {
  requirePerm(c, 'org.manage');
  const id = param(c, 'id');
  const auth = c.get('auth');
  if (id === auth.userId) fail('forbidden');
  await requireFresh(c);
  const org = c.get('org');
  await run(c, async (q) => {
    const [u] = await q.query(`select 1 from users where id = $1 and status <> 'deleted'`, [id]);
    if (!u) fail('not_found');
  });
  await sys(c)((q) => resetFactors(q, org.id, id));
  await note(c, 'second_step.reset', {}, id);
  return c.json({ ok: true });
});
