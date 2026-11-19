// Trial requests: the sales site's form writes one (insertTrialRequest), the
// owner console lists them, marks them contacted, approves or rejects them.
// Approving creates the company with the departments asked for, starts a
// trial with a seat cap and an end date, and emails the first administrator
// a sign-in link. Rejecting prepares a polite answer in the person's own
// language for the owner to send. Every step lands in the desk's log.
import { z } from 'zod';
import { normalizeLocale, translate, type Locale } from '../../../shared/src/i18n';
import {
  TRIAL_DEFAULTS,
  TRIAL_DEPARTMENTS,
  type TrialRequestDetail,
  type TrialRequestInput,
  type TrialRequestRow,
  type TrialRequestStatus,
} from '../../../shared/src/trialRequest';
import { deskUrl, nowOf, orgUrl, type Deps } from '../context';
import type { Q } from '../db';
import { projectBillingQ } from '../billing/project';
import { startTrial } from '../billing/service';
import { audit } from './audit';
import { randomToken, sha256Hex } from './crypto';
import { emailDomain, isPublicDomain, slugify, slugProblem } from './domains';
import { fail } from './errors';
import { createOrg } from './orgs';

const short = (n: number) => z.string().trim().max(n).nullable().default(null);
const names = z.array(z.string().trim().min(1).max(80)).max(20).optional();

/** The form's payload, as the public route must validate it before calling insertTrialRequest. */
export const trialRequestInput = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(320),
  emailVerifiedAt: z.string().datetime(),
  freeMailNote: short(300),
  phone: short(40),
  title: short(120),
  linkedinUrl: z.string().trim().url().max(300).regex(/^https:\/\//).nullable().default(null),
  company: z.string().trim().min(1).max(160),
  website: z.string().trim().max(300).nullable().default(null),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
  city: short(120),
  industry: short(80),
  companySize: short(20),
  teamSize: z.number().int().min(1).max(100000).nullable().default(null),
  seats: z.number().int().min(1).max(100000).nullable().default(null),
  seatsByDepartment: z.object({ sales: z.number().int().min(0).max(100000).optional(), success: z.number().int().min(0).max(100000).optional(), product: z.number().int().min(0).max(100000).optional(), finance: z.number().int().min(0).max(100000).optional() }).default({}),
  departments: z.array(z.enum(TRIAL_DEPARTMENTS)).max(4).default([]),
  problems: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  problemText: short(4000),
  tools: z.object({ crm: names, tasks: names, accounting: names, bi: names, other: z.string().trim().max(500).nullable().optional() }).default({}),
  customersManaged: short(40),
  timeline: short(40),
  heardFrom: short(120),
  language: z.string().trim().max(10),
  contactTime: short(120),
  source: short(40),
  utm: z.record(z.string().max(40), z.string().max(200)).default({}),
  consents: z.array(z.object({ key: z.string().min(1).max(40), version: z.string().min(1).max(40), hash: z.string().regex(/^[0-9a-f]{64}$/), granted: z.boolean() })).max(20),
  marketing: z.boolean().default(false),
  ipCountry: z.string().regex(/^[A-Z]{2}$/).nullable().default(null),
});

/**
 * What else must happen once a company was created from a request (e.g. the
 * terms/DPA click-accept gate for its first administrator). A module adds its
 * step here; a failing step is logged and does not undo the approval.
 */
export const trialApprovedHooks: ((deps: Deps, orgId: string) => Promise<void>)[] = [];

// ------------------------------------------------------------ settings

export const CONSOLE_SETTING_DEFAULTS = {
  'trial.seatCap': TRIAL_DEFAULTS.seatCap as number,
  'trial.months': TRIAL_DEFAULTS.months as number,
} as const;
export type ConsoleSettingKey = keyof typeof CONSOLE_SETTING_DEFAULTS;

export async function getConsoleSetting<K extends ConsoleSettingKey>(deps: Pick<Deps, 'db'>, key: K): Promise<(typeof CONSOLE_SETTING_DEFAULTS)[K]> {
  const [row] = await deps.db.system((q) => q.query<{ value: unknown }>('select value from console_settings where key = $1', [key]));
  const v = row?.value;
  return (typeof v === typeof CONSOLE_SETTING_DEFAULTS[key] ? v : CONSOLE_SETTING_DEFAULTS[key]) as (typeof CONSOLE_SETTING_DEFAULTS)[K];
}

export async function consoleSettings(deps: Pick<Deps, 'db'>): Promise<Record<ConsoleSettingKey, number>> {
  const rows = await deps.db.system((q) => q.query<{ key: string; value: unknown }>('select key, value from console_settings'));
  const out = { ...CONSOLE_SETTING_DEFAULTS } as Record<ConsoleSettingKey, number>;
  for (const r of rows) if (r.key in out && typeof r.value === 'number') out[r.key as ConsoleSettingKey] = r.value;
  return out;
}

export async function setConsoleSetting(deps: Pick<Deps, 'db'>, key: ConsoleSettingKey, value: number, by: string) {
  await deps.db.system((q) =>
    q.query(
      `insert into console_settings (key, value, updated_by) values ($1, $2, $3)
       on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
      [key, JSON.stringify(value), by],
    ),
  );
}

// ------------------------------------------------------------ writing

/** A request from the form (after the email code was right). The owner hears of it by email; the console moves. */
export async function insertTrialRequest(deps: Deps, input: TrialRequestInput): Promise<{ id: string; ref: string }> {
  const v = trialRequestInput.parse(input);
  const { name, email, emailVerifiedAt, company, country, departments, seats, consents, marketing, ipCountry, ...details } = v;
  const [row] = await deps.db.system((q) =>
    q.query<{ id: string; ref: string }>(
      `insert into trial_requests (name, email, email_verified_at, company, country, departments, seats, details, consent)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id, ref`,
      [name, email, emailVerifiedAt, company, country, departments, seats, JSON.stringify(details), JSON.stringify({ consents, marketing, ipCountry, at: nowOf(deps).toISOString() })],
    ),
  );
  const owner = deps.config.owner ?? deps.config.support?.staff?.[0];
  if (owner) {
    await deps.email
      .send({
        to: owner,
        subject: `New trial request ${row.ref}: ${company}`,
        text: `${name} (${email}) from ${company}, ${country}, asked for a trial${seats ? ` for ${seats} seats` : ''}.\n\nOpen it in the console: ${deskUrl(deps.config)}/requests?q=${row.id}`,
      })
      .catch(() => undefined);
  }
  await deps.live?.platform?.().catch(() => undefined);
  return row;
}

// ------------------------------------------------------------ reading

const iso = (v: unknown): string | null => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));

/** Same address, same company domain (not a public mail service), or the same company name. */
const SAME = `(o.email = r.email or (split_part(o.email, '@', 2) = split_part(r.email, '@', 2) and not (split_part(r.email, '@', 2) = any ($1::text[]))) or lower(o.company) = lower(r.company))`;

function publicDomains(rows: { email: string }[]): string[] {
  return [...new Set(rows.map((r) => emailDomain(r.email)).filter(isPublicDomain))];
}

export async function listTrialRequests(deps: Pick<Deps, 'db'>, status: TrialRequestStatus | 'open' | 'all'): Promise<TrialRequestRow[]> {
  const where = status === 'all' ? '' : status === 'open' ? `where r.status in ('new', 'contacted')` : `where r.status = $2`;
  return deps.db.system(async (q) => {
    const emails = await q.query<{ email: string }>('select distinct email from trial_requests');
    const rows = await q.query(
      `select r.id, r.ref, r.status, r.name, r.email, r.company, r.country, r.departments, r.seats, r.created_at,
              (select o.ref from trial_requests o where o.id <> r.id and o.created_at < r.created_at and ${SAME} order by o.created_at limit 1) as dup
         from trial_requests r ${where}
        order by (r.status = 'new') desc, r.created_at desc limit 500`,
      status === 'all' || status === 'open' ? [publicDomains(emails)] : [publicDomains(emails), status],
    );
    return rows.map((r) => ({
      id: String(r.id),
      ref: String(r.ref),
      status: r.status as TrialRequestStatus,
      name: String(r.name),
      email: String(r.email),
      company: String(r.company),
      country: String(r.country),
      departments: (r.departments ?? []) as TrialRequestRow['departments'],
      seats: r.seats == null ? null : Number(r.seats),
      createdAt: iso(r.created_at)!,
      duplicateOf: r.dup ? String(r.dup) : null,
    }));
  });
}

export async function trialRequestDetail(deps: Pick<Deps, 'db'>, id: string): Promise<TrialRequestDetail | null> {
  return deps.db.system(async (q) => {
    const [r] = await q.query(`select r.*, o.slug as org_slug from trial_requests r left join orgs o on o.id = r.created_org where r.id = $1`, [id]);
    if (!r) return null;
    const pub = isPublicDomain(emailDomain(String(r.email))) ? [emailDomain(String(r.email))] : [];
    const dups = await q.query(
      `select o.id, o.ref, o.status, o.company, o.email from trial_requests o, trial_requests r where r.id = $2 and o.id <> r.id and ${SAME} order by o.created_at limit 10`,
      [pub, id],
    );
    const d = (r.details ?? {}) as Partial<TrialRequestInput>;
    const consent = (r.consent ?? {}) as { consents?: TrialRequestInput['consents']; marketing?: boolean; ipCountry?: string | null };
    return {
      id: String(r.id),
      ref: String(r.ref),
      status: r.status as TrialRequestStatus,
      name: String(r.name),
      email: String(r.email),
      emailVerifiedAt: iso(r.email_verified_at)!,
      company: String(r.company),
      country: String(r.country),
      departments: (r.departments ?? []) as TrialRequestRow['departments'],
      seats: r.seats == null ? null : Number(r.seats),
      createdAt: iso(r.created_at)!,
      duplicateOf: dups[0] ? String(dups[0].ref) : null,
      freeMailNote: d.freeMailNote ?? null,
      phone: d.phone ?? null,
      title: d.title ?? null,
      linkedinUrl: d.linkedinUrl ?? null,
      website: d.website ?? null,
      city: d.city ?? null,
      industry: d.industry ?? null,
      companySize: d.companySize ?? null,
      teamSize: d.teamSize ?? null,
      seatsByDepartment: d.seatsByDepartment ?? {},
      problems: d.problems ?? [],
      problemText: d.problemText ?? null,
      tools: d.tools ?? {},
      customersManaged: d.customersManaged ?? null,
      timeline: d.timeline ?? null,
      heardFrom: d.heardFrom ?? null,
      language: d.language ?? 'en',
      contactTime: d.contactTime ?? null,
      source: d.source ?? null,
      utm: d.utm ?? {},
      consents: consent.consents ?? [],
      marketing: !!consent.marketing,
      ipCountry: consent.ipCountry ?? null,
      contactedAt: iso(r.contacted_at),
      decidedAt: iso(r.decided_at),
      decidedBy: r.decided_by ? String(r.decided_by) : null,
      seatCap: r.seat_cap == null ? null : Number(r.seat_cap),
      trialEndsAt: iso(r.trial_ends_at),
      orgId: r.created_org ? String(r.created_org) : null,
      orgSlug: r.org_slug ? String(r.org_slug) : null,
      rejectReason: r.reject_reason ? String(r.reject_reason) : null,
      replyDraft: r.reply_draft ? String(r.reply_draft) : null,
      note: r.note ? String(r.note) : null,
      duplicates: dups.map((x) => ({ id: String(x.id), ref: String(x.ref), status: x.status as TrialRequestStatus, company: String(x.company), email: String(x.email) })),
    };
  });
}

// ------------------------------------------------------------ deciding

const deskNote = (q: Q, by: string, action: string, ref: string, orgId: string | null = null) =>
  q.query('insert into desk_log (staff_email, action, ref, org_id) values ($1, $2, $3, $4)', [by, action, ref, orgId]);

export async function markContacted(deps: Pick<Deps, 'db'>, id: string, by: string, note: string | null) {
  await deps.db.system(async (q) => {
    const [r] = await q.query<{ ref: string }>(
      `update trial_requests set status = 'contacted', contacted_at = coalesce(contacted_at, now()), note = coalesce($2, note), updated_at = now()
        where id = $1 and status in ('new', 'contacted') returning ref`,
      [id, note],
    );
    if (!r) fail('conflict');
    await deskNote(q, by, 'trial.contacted', r.ref);
  });
}

export interface ApproveInput {
  departments: (typeof TRIAL_DEPARTMENTS)[number][];
  seatCap: number;
  /** Trial end (date); default: today + the console's trial.months. */
  endsOn?: string | null;
  /** The company's address; default: from its name. */
  slug?: string | null;
  note?: string | null;
}

/** A free address made from the company's name: "acme", "acme-2", … */
async function freeSlug(q: Q, wanted: string): Promise<string> {
  const base = (slugify(wanted).slice(0, 34).replace(/-+$/, '') || 'company').padEnd(3, '0');
  for (let i = 1; i < 50; i++) {
    const s = i === 1 ? base : `${base}-${i}`;
    if (slugProblem(s)) continue;
    const [taken] = await q.query('select 1 from orgs where slug = $1', [s]);
    if (!taken) return s;
  }
  return `${base.slice(0, 30)}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, 'x')}`;
}

export async function approveTrialRequest(deps: Deps, id: string, by: string, input: ApproveInput) {
  const detail = await trialRequestDetail(deps, id);
  if (!detail) fail('not_found');
  if (detail!.status === 'approved' || detail!.status === 'rejected') fail('conflict');
  const r = detail!;
  const now = nowOf(deps);
  const months = await getConsoleSetting(deps, 'trial.months');
  const ends = input.endsOn ? new Date(`${input.endsOn}T23:59:59Z`) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + months, now.getUTCDate(), 23, 59, 59));
  if (Number.isNaN(ends.getTime()) || ends.getTime() <= now.getTime() || ends.getTime() > now.getTime() + 366 * 86400_000) fail('validation', { fields: 'endsOn' }, { fields: ['endsOn'] });
  const locale: Locale = normalizeLocale(r.language);
  const slug = input.slug ? input.slug.trim().toLowerCase() : await deps.db.system((q) => freeSlug(q, r.company));
  if (slugProblem(slug)) fail('validation', { fields: 'slug' }, { fields: ['slug'] });
  const domain = emailDomain(r.email);
  let created: Awaited<ReturnType<typeof createOrg>>;
  try {
    created = await createOrg(deps.db, { slug, name: r.company, locale, domains: isPublicDomain(domain) ? [] : [domain], admin: { email: r.email, name: r.name } });
  } catch (err) {
    if (/orgs_slug_key|duplicate key/.test(String((err as Error).message))) fail('slug_taken');
    throw err;
  }
  await startTrial(deps, { orgId: created.orgId, plan: 'business' });
  const token = randomToken(32);
  await deps.db.system(async (q) => {
    await q.query('update subscriptions set trial_ends_at = $2 where org_id = $1', [created.orgId, ends.toISOString()]);
    await projectBillingQ(q, created.orgId);
    await q.query(`update orgs set trial_seat_cap = $2, settings = settings || jsonb_build_object('departments', $3::jsonb) where id = $1`, [created.orgId, input.seatCap, JSON.stringify(input.departments)]);
    await q.query(`insert into login_tokens (org_id, email, token_hash, kind, expires_at) values ($1, $2, $3, 'magic', now() + interval '7 days')`, [created.orgId, r.email, await sha256Hex(token)]);
    await q.query(
      `update trial_requests set status = 'approved', decided_at = now(), decided_by = $2, seat_cap = $3, trial_ends_at = $4, created_org = $5,
              departments = $6, note = coalesce($7, note), updated_at = now() where id = $1`,
      [id, by, input.seatCap, ends.toISOString(), created.orgId, input.departments, input.note ?? null],
    );
    await audit(q, { orgId: created.orgId, actorId: null, action: 'org.created', entity: 'org', entityId: created.orgId, meta: { from: r.ref, seatCap: input.seatCap, departments: input.departments } });
    await deskNote(q, by, 'trial.approved', r.ref, created.orgId);
  });
  for (const hook of trialApprovedHooks) await hook(deps, created.orgId).catch((e) => console.error('trial approved hook', e));
  const link = `${orgUrl(deps.config, slug)}/auth/verify#token=${token}&m=signup`;
  const day = ends.toISOString().slice(0, 10);
  await deps.email.send({
    to: r.email,
    subject: translate(locale, 'trialMail.approved.subject', { company: r.company }),
    text: translate(locale, 'trialMail.approved.body', { name: r.name, company: r.company, seats: String(input.seatCap), until: day, link }),
  });
  await deps.live?.platform?.().catch(() => undefined);
  return { orgId: created.orgId, slug, trialEndsAt: ends.toISOString() };
}

/** Rejecting sends nothing: it prepares a polite answer in the person's language for the owner to send himself. */
export async function rejectTrialRequest(deps: Deps, id: string, by: string, reason: string | null) {
  const detail = await trialRequestDetail(deps, id);
  if (!detail) fail('not_found');
  if (detail!.status === 'approved' || detail!.status === 'rejected') fail('conflict');
  const locale = normalizeLocale(detail!.language);
  const draft = translate(locale, 'trialMail.rejected.body', { name: detail!.name, company: detail!.company });
  await deps.db.system(async (q) => {
    await q.query(`update trial_requests set status = 'rejected', decided_at = now(), decided_by = $2, reject_reason = $3, reply_draft = $4, updated_at = now() where id = $1`, [id, by, reason, draft]);
    await deskNote(q, by, 'trial.rejected', detail!.ref);
  });
  await deps.live?.platform?.().catch(() => undefined);
  return { subject: translate(locale, 'trialMail.rejected.subject', { company: detail!.company }), draft, to: detail!.email };
}
