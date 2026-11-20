// The public free-trial request (app.<domain>/signup), replacing the instant
// sign-up (still there behind SIGNUP_MODE=instant):
//   GET  /api/trial/config       — which path is on, the visitor's country, a form stamp
//   POST /api/trial/code         — a six-digit code to the work e-mail
//   POST /api/trial/verify       — the code → a signed "address proven" ticket
//   POST /api/trial/submit       — the whole form + consents → a request for the owner
//   POST /api/trial/unsubscribe  — marketing permission taken back (link in every e-mail)
//
// Spam is kept out without a third-party captcha: a field people never see
// (honeypot), a minimum time between opening the form and sending it, request
// limits per address and per network, and the e-mail code itself.
import { Hono } from 'hono';
import { z } from 'zod';
import { translate, type Locale } from '../../../shared/src/i18n';
import {
  COMPANY_SIZES,
  CONTACT_TIMES,
  COUNTRIES,
  CUSTOMER_COUNTS,
  HEARD_FROM,
  INDUSTRIES,
  PROBLEMS,
  TIMELINES,
  TRIAL_FORM,
} from '../../../shared/src/trialForm';
import { trialConsent } from '../../../shared/src/compliance/trialConsent';
import { TRIAL_DEPARTMENTS, type TrialRequestInput } from '../../../shared/src/trialRequest';
import { centralUrl, nowOf, type AppEnv, type C } from '../context';
import { hmacHex, randomDigits, safeEqual, sign, verify } from '../lib/crypto';
import { fail } from '../lib/errors';
import { humanCheck, humanFields, turnstileSiteKey } from '../lib/humanCheck';
import { clientIp } from '../lib/ratelimit';
import { consentEvidence, ipCountryOf, ipHash, isFreeMail, recordConsents, withdrawMarketing } from '../lib/trial';
import { insertTrialRequest } from '../lib/trialRequests';
import { body, email, localeField } from '../lib/validate';

export const trialRoutes = new Hono<AppEnv>();

interface FormStamp {
  tf: 1;
  t: number;
}
interface Ticket {
  tv: 1;
  e: string;
  v: number;
  x: number;
}
interface Unsub {
  tu: 1;
  e: string;
}

const secretOf = (c: C) => `${c.get('deps').config.authSecret}:trial`;
const ipCountry = (c: C) => ipCountryOf(c.req.header('cf-ipcountry'));
const modeOf = (c: C) => c.get('deps').config.signupMode ?? 'request';

trialRoutes.use('*', async (c, next) => {
  const cfg = c.get('deps').config;
  if (!cfg.signupEnabled || cfg.singleTenantSlug) fail('not_found');
  // A form on another site cannot set this header.
  if (c.req.method !== 'GET' && !c.req.header('x-curahold-device')) fail('forbidden');
  await next();
});

/** The link that takes marketing permission back, in every e-mail the form sends. */
export async function unsubscribeLink(c: C, to: string) {
  const t = await sign({ tu: 1, e: to } satisfies Unsub, secretOf(c));
  return `${centralUrl(c.get('deps').config)}/signup/unsubscribe#t=${t}`;
}

/**
 * What the trial request form needs: sign-up mode, the visitor's country, a signed form stamp (for the too-fast check)
 * and the Turnstile site key when on (ADR 0015, 0017).
 */
trialRoutes.get('/config', async (c) => {
  const now = nowOf(c.get('deps')).getTime();
  c.header('cache-control', 'no-store');
  return c.json({ mode: modeOf(c), ipCountry: ipCountry(c), stamp: await sign({ tf: 1, t: now } satisfies FormStamp, secretOf(c)), turnstile: turnstileSiteKey(c.get('deps')) });
});

const codeHash = (c: C, to: string, code: string) => hmacHex(secretOf(c), `${to}:${code}`);

/**
 * Emails a code to confirm the address. A bot (hidden field, too fast, failed Turnstile) gets the same answer and
 * nothing is sent, so the form cannot be used to send mail (cost) or to learn what works.
 */
trialRoutes.post('/code', async (c) => {
  const input = await body(c, z.object({ email, locale: localeField.optional(), ...humanFields }));
  const deps = c.get('deps');
  const locale = input.locale ?? 'en';
  const free = isFreeMail(input.email);
  // A robot filled the hidden field or was too quick: the same answer, and nothing is sent.
  // With Turnstile on, the e-mail (the step that costs) also needs its token (lib/humanCheck.ts).
  const human = await humanCheck(deps, input, { ip: clientIp(c, deps.config.clientIp) });
  if (human === 'bot') return c.json({ ok: true, freeMail: free });
  if (human === 'failed') fail('human_check');
  const ip = await ipHash(deps.config.authSecret, clientIp(c, deps.config.clientIp) ?? c.req.header('cf-connecting-ip') ?? null);
  const code = randomDigits(TRIAL_FORM.codeDigits);
  await deps.db.system(async (q) => {
    const [byEmail] = await q.query<{ n: number }>(`select count(*)::int as n from trial_codes where email = $1 and created_at > now() - interval '1 hour'`, [
      input.email,
    ]);
    if (byEmail.n >= TRIAL_FORM.codesPerHour) fail('too_many_requests');
    if (ip) {
      const [byIp] = await q.query<{ n: number }>(`select count(*)::int as n from trial_codes where ip_hash = $1 and created_at > now() - interval '1 hour'`, [
        ip,
      ]);
      if (byIp.n >= 30) fail('too_many_requests');
    }
    await q.query(`insert into trial_codes (email, code_hash, ip_hash, expires_at) values ($1, $2, $3, now() + make_interval(mins => $4::int))`, [
      input.email,
      await codeHash(c, input.email, code),
      ip,
      TRIAL_FORM.codeMinutes,
    ]);
  });
  const vars = { code, minutes: TRIAL_FORM.codeMinutes };
  await deps.email.send({
    to: input.email,
    subject: translate(locale, 'email.trial.code.subject', vars),
    text: translate(locale, 'email.trial.code.body', vars),
  });
  return c.json({ ok: true, freeMail: free, ...(deps.config.devExposeTokens ? { devCode: code } : {}) });
});

/** Checks the emailed code and returns a ticket for the submit step; 'invalid_token' otherwise. */
trialRoutes.post('/verify', async (c) => {
  const input = await body(
    c,
    z.object({
      email,
      code: z
        .string()
        .trim()
        .regex(/^\d{6}$/),
    }),
  );
  const deps = c.get('deps');
  const now = nowOf(deps).getTime();
  const want = await codeHash(c, input.email, input.code);
  const ok = await deps.db.system(async (q) => {
    const [row] = await q.query<{ id: string; code_hash: string; tries: number }>(
      `select id, code_hash, tries from trial_codes where email = $1 and used_at is null and expires_at > now() order by created_at desc limit 1`,
      [input.email],
    );
    if (!row || row.tries >= TRIAL_FORM.codeTries) return false;
    if (!safeEqual(row.code_hash, want)) {
      await q.query('update trial_codes set tries = tries + 1 where id = $1', [row.id]);
      return false;
    }
    await q.query('update trial_codes set used_at = now() where id = $1', [row.id]);
    return true;
  });
  if (!ok) fail('invalid_token');
  const ticket = await sign({ tv: 1, e: input.email, v: now, x: now + TRIAL_FORM.ticketMinutes * 60_000 } satisfies Ticket, secretOf(c));
  return c.json({ ticket, freeMail: isFreeMail(input.email) });
});

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
const choice = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .enum(values)
    .optional()
    .nullable()
    .transform((v) => v ?? null);
const names = z
  .string()
  .trim()
  .max(200)
  .optional()
  .nullable()
  .transform((v) =>
    v
      ? v
          .split(/[,;\n]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 10)
      : [],
  );
const seatCount = z.number().int().min(1).max(TRIAL_FORM.maxSeats);

const submitSchema = z.object({
  ticket: z.string().min(20).max(1000),
  stamp: z.string().min(20).max(400),
  hp: z.string().max(200).optional(),
  /** The language the form was shown in (the consent sentences were read in it). */
  uiLocale: localeField,
  name: z.string().trim().min(1).max(120),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()./-]{6,30}$/)
    .optional()
    .nullable()
    .or(z.literal(''))
    .transform((v) => v || null),
  title: text(120),
  linkedinUrl: z
    .string()
    .trim()
    .max(300)
    .regex(/^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/\S+$/i)
    .optional()
    .nullable()
    .or(z.literal(''))
    .transform((v) => v || null),
  company: z.string().trim().min(1).max(160),
  website: z
    .string()
    .trim()
    .max(300)
    .regex(/^(https?:\/\/)?[^\s/$.?#][^\s]*\.[^\s]{2,}$/i)
    .optional()
    .nullable()
    .or(z.literal(''))
    .transform((v) => v || null),
  country: z.enum(COUNTRIES as [string, ...string[]]),
  city: text(120),
  industry: choice(INDUSTRIES),
  companySize: choice(COMPANY_SIZES),
  seats: seatCount,
  seatsByDepartment: z.partialRecord(z.enum(TRIAL_DEPARTMENTS), seatCount).optional().default({}),
  departments: z.array(z.enum(TRIAL_DEPARTMENTS)).min(1).max(TRIAL_DEPARTMENTS.length),
  problems: z.array(z.enum(PROBLEMS)).max(PROBLEMS.length).optional().default([]),
  problemText: text(1000),
  tools: z
    .object({ crm: names, tasks: names, accounting: names, bi: names, other: text(300) })
    .partial()
    .optional()
    .default({}),
  customersManaged: choice(CUSTOMER_COUNTS),
  timeline: choice(TIMELINES),
  heardFrom: choice(HEARD_FROM),
  language: localeField,
  contactTime: choice(CONTACT_TIMES),
  source: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{1,30}$/)
    .optional()
    .nullable()
    .transform((v) => v ?? null),
  utm: z
    .record(z.string().regex(/^utm_[a-z]{2,10}$/), z.string().max(120))
    .optional()
    .default({}),
  /** The keys of the boxes ticked. */
  consents: z.array(z.string().regex(/^[A-Za-z0-9_.-]{2,60}$/)).max(30),
  /** Why a free-mail address (Gmail…) is used for a company trial; required for one. */
  freeMailNote: text(300),
});

/**
 * Sends the trial request with its consents. A bot gets a plausible reference and nothing is stored (ADR 0015).
 * The consents asked for depend on the chosen and the connecting country; they are kept as evidence (ADR 0014).
 */
trialRoutes.post('/submit', async (c) => {
  const input = await body(c, submitSchema);
  const deps = c.get('deps');
  const now = nowOf(deps).getTime();
  const stamp = await verify<FormStamp>(input.stamp, secretOf(c));
  if (!stamp || stamp.tf !== 1) fail('invalid_token');
  // The hidden field, or a form sent faster than anyone types: a quiet, plausible answer and nothing stored.
  if (input.hp || now - stamp!.t < TRIAL_FORM.minFillMs) return c.json({ ref: 'TQ-000000' }, 201);
  const ticket = await verify<Ticket>(input.ticket, secretOf(c));
  if (!ticket || ticket.tv !== 1 || ticket.x < now) fail('invalid_token');
  const to = ticket!.e;
  const free = isFreeMail(to);
  if (free && !input.freeMailNote) fail('free_mail_note', undefined, { fields: ['freeMailNote'] });
  const per = input.seatsByDepartment as Record<string, number>;
  if (Object.keys(per).some((d) => !input.departments.includes(d as never)))
    fail('validation', { fields: 'seatsByDepartment' }, { fields: ['seatsByDepartment'] });

  // The consents the countries that apply ask for: the one picked and the one the connection comes from.
  const country = ipCountry(c);
  const consent = trialConsent(input.country, country, input.uiLocale as Locale);
  if (!consent.offered) fail('validation', { fields: 'country' }, { fields: ['country'] });
  const blocks = consent.blocks;
  const missing = blocks.filter((b) => b.required && !input.consents.includes(b.key)).map((b) => b.key);
  if (missing.length) fail('validation', { fields: 'consents' }, { fields: ['consents'], missing });
  const evidence = await consentEvidence(blocks, input.consents);

  const [recent] = await deps.db.system((q) =>
    q.query<{ n: number }>(`select count(*)::int as n from trial_requests where email = $1 and created_at > now() - interval '1 day'`, [to]),
  );
  if (recent.n >= TRIAL_FORM.requestsPerDay) fail('too_many_requests');

  const request: TrialRequestInput & { freeMailNote: string | null } = {
    name: input.name,
    email: to,
    emailVerifiedAt: new Date(ticket!.v).toISOString(),
    phone: input.phone,
    title: input.title,
    linkedinUrl: input.linkedinUrl,
    company: input.company,
    website: input.website,
    country: input.country,
    city: input.city,
    industry: input.industry,
    companySize: input.companySize,
    teamSize: input.seats,
    seats: input.seats,
    seatsByDepartment: per,
    departments: input.departments,
    problems: input.problems,
    problemText: input.problemText,
    tools: input.tools,
    customersManaged: input.customersManaged,
    timeline: input.timeline,
    heardFrom: input.heardFrom,
    language: input.language,
    contactTime: input.contactTime,
    source: input.source,
    utm: input.utm,
    consents: evidence.map(({ key, version, hash, granted }) => ({ key, version, hash, granted })),
    marketing: evidence.some((e) => e.kind === 'marketing' && e.granted),
    ipCountry: country,
    freeMailNote: input.freeMailNote,
  };
  const made = await insertTrialRequest(deps, request);
  await deps.db.system((q) =>
    recordConsents(q, evidence, {
      requestId: made.id,
      email: to,
      locale: input.uiLocale as Locale,
      ipCountry: country,
      userAgent: c.req.header('user-agent') ?? null,
    }),
  );

  const l = input.language as Locale;
  const vars = { name: input.name, ref: made.ref, unsubscribe: await unsubscribeLink(c, to) };
  await deps.email
    .send({ to, subject: translate(l, 'email.trial.received.subject', vars), text: translate(l, 'email.trial.received.body', vars) })
    .catch((e) => console.error('[curahold] trial receipt failed', e));
  return c.json({ ref: made.ref }, 201);
});

/** Withdraws marketing consent from a signed link in a mail; 'invalid_token' for a bad link. */
trialRoutes.post('/unsubscribe', async (c) => {
  const input = await body(c, z.object({ t: z.string().min(20).max(600), locale: localeField.optional() }));
  const t = await verify<Unsub>(input.t, secretOf(c));
  if (!t || t.tu !== 1) fail('invalid_token');
  const n = await withdrawMarketing(c.get('deps'), t!.e, input.locale ?? 'en', ipCountry(c));
  return c.json({ ok: true, withdrawn: n });
});
