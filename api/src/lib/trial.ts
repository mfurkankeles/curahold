// The free trial around the owner's decision: the evidence the public form
// leaves (consent records), the seat cap and the terms a trial company works
// under, and the e-mails as its end comes near. The request itself is stored and
// decided in the owner console (lib/trialRequests.ts).
import type { Deps } from '../context';
import { orgUrl } from '../context';
import type { Q } from '../db';
import { translate, type Locale } from '../../../shared/src/i18n';
import { AGREEMENTS, AGREEMENT_DOCS, MORE_FREE_MAIL, type AgreementDoc } from '../../../shared/src/trialForm';
import { CONSENT_TEXT_VERSION } from '../../../shared/src/compliance/consentTexts';
import { shownText, type TrialConsentBlock } from '../../../shared/src/compliance/trialConsent';
import { TRIAL_DEFAULTS } from '../../../shared/src/trialRequest';
import { sha256Hex } from './crypto';
import { emailDomain, isPublicDomain } from './domains';
import { fail } from './errors';
import { trialApprovedHooks } from './trialRequests';

const FREE = new Set(MORE_FREE_MAIL);
/** An address anyone can get (Gmail, Naver, QQ…): the form asks why before it takes it. */
export const isFreeMail = (email: string) => {
  const d = emailDomain(email);
  return isPublicDomain(d) || FREE.has(d);
};

/** A hash of the network address — enough to count requests, without keeping the address. */
export const ipHash = async (secret: string, ip: string | null) => (ip ? (await sha256Hex(`${secret}:ip:${ip}`)).slice(0, 32) : null);

/** Two capital letters from the edge (Cloudflare's cf-ipcountry), or nothing. XX / T1 (Tor) are not countries. */
export const ipCountryOf = (h: string | undefined | null) => (h && /^[A-Z]{2}$/.test(h) && h !== 'XX' && h !== 'T1' ? h : null);

export interface ConsentEvidence {
  key: string;
  version: string;
  hash: string;
  granted: boolean;
  kind: TrialConsentBlock['kind'];
}

/** What each block said (its exact shown words, hashed) and what the person chose; notices count as shown (granted = seen). */
export async function consentEvidence(blocks: TrialConsentBlock[], granted: string[]): Promise<ConsentEvidence[]> {
  return Promise.all(
    blocks.map(async (b) => ({
      key: b.key,
      version: b.version,
      kind: b.kind,
      hash: await sha256Hex(shownText(b)),
      granted: b.kind === 'notice' ? true : granted.includes(b.key),
    })),
  );
}

export async function recordConsents(
  q: Q,
  rows: ConsentEvidence[],
  at: {
    requestId: string | null;
    orgId?: string | null;
    email: string;
    locale: Locale;
    ipCountry: string | null;
    userAgent?: string | null;
    source?: 'trial_form' | 'email_link' | 'console';
  },
) {
  for (const r of rows) {
    await q.query(
      `insert into consent_records (request_id, org_id, email, block, version, kind, locale, text_hash, granted, ip_country, source, user_agent)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        at.requestId,
        at.orgId ?? null,
        at.email,
        r.key,
        r.version,
        r.kind,
        at.locale,
        r.hash,
        r.granted,
        at.ipCountry,
        at.source ?? 'trial_form',
        at.userAgent?.slice(0, 400) || null,
      ],
    );
  }
}

/**
 * Marketing permission taken back from the link in an e-mail: a new record for
 * each marketing block this address had granted (the history stays). Returns
 * how many were withdrawn.
 */
export async function withdrawMarketing(deps: Pick<Deps, 'db'>, email: string, locale: Locale, ipCountry: string | null): Promise<number> {
  const hash = await sha256Hex(translate(locale, 'trial.unsubscribe.done'));
  return deps.db.system(async (q) => {
    const live = await q.query<{ block: string; request_id: string | null; org_id: string | null; granted: boolean }>(
      `select distinct on (block) block, request_id, org_id, granted, kind from consent_records
        where email = $1 and kind in ('marketing', 'withdrawal') order by block, created_at desc`,
      [email],
    );
    const on = live.filter((r) => r.granted);
    for (const r of on) {
      await q.query(
        `insert into consent_records (request_id, org_id, email, block, version, kind, locale, text_hash, granted, ip_country, source)
         values ($1, $2, $3, $4, $5, 'withdrawal', $6, $7, false, $8, 'email_link')`,
        [r.request_id, r.org_id, email, r.block, CONSENT_TEXT_VERSION, locale, hash, ipCountry],
      );
    }
    return on.length;
  });
}

// ------------------------------------------------------------------ seat cap + terms

/**
 * Before a full seat is added (an invitation, a person from a list): a trial
 * company stays inside the seats it was approved for, and its administrator has
 * accepted the terms first. Viewer seats are free and never counted. A company
 * that pays is governed by its plan, not by the trial's cap.
 */
export async function seatGuard(q: Q, orgId: string, adding: number, seat: string = 'full'): Promise<void> {
  const [o] = await q.query<{ cap: number | null; status: string | null; due: boolean }>(
    `select o.trial_seat_cap as cap, o.billing->>'status' as status,
            exists (select 1 from org_agreements a where a.org_id = o.id and a.accepted_at is null) as due
       from orgs o where o.id = $1`,
    [orgId],
  );
  if (!o) return;
  if (o.due) fail('terms_required');
  if (seat !== 'full' || adding <= 0 || o.cap == null || o.status === 'active' || o.status === 'past_due') return;
  const [n] = await q.query<{ n: number }>(`select count(*)::int as n from users where org_id = $1 and seat = 'full' and status in ('active', 'invited')`, [
    orgId,
  ]);
  if (n.n + adding > o.cap) fail('seat_cap_reached', { cap: o.cap, used: n.n }, { cap: o.cap, used: n.n });
}

// ------------------------------------------------------------------ agreements at activation

/** The sentence the administrator clicks to accept, with the versions in it (its hash is the evidence). */
export const agreementStatement = (locale: Locale) =>
  translate(locale, 'agreements.statement', { terms: AGREEMENTS.terms.version, dpa: AGREEMENTS.dpa.version });

/**
 * Ask the company's administrator to accept the current terms and DPA before
 * the trial opens (called when a trial is approved; again for a new version).
 * Nothing changes for a version already accepted.
 */
export async function markAgreementsDue(deps: Pick<Deps, 'db'>, orgId: string): Promise<void> {
  await deps.db.system(async (q) => {
    for (const doc of AGREEMENT_DOCS) {
      await q.query(`insert into org_agreements (org_id, doc, version) values ($1, $2, $3) on conflict (org_id, doc, version) do nothing`, [
        orgId,
        doc,
        AGREEMENTS[doc].version,
      ]);
    }
  });
}

// An approved trial asks its administrator for the terms and DPA first (the console's approval runs this).
trialApprovedHooks.push((deps, orgId) => markAgreementsDue(deps, orgId));

export interface AgreementRow {
  doc: AgreementDoc;
  version: string;
  dueAt: string;
  acceptedAt: string | null;
  acceptedName: string | null;
  acceptedEmail: string | null;
}

// ------------------------------------------------------------------ reminders and the end

const DAY = 86_400_000;
type ReminderKind = 'd14' | 'd7' | 'd1' | 'ended';

/** Which reminder is due for a trial ending at `ends`: the nearest step passed, once each. */
export function reminderFor(ends: Date, now: Date, days: readonly number[] = TRIAL_DEFAULTS.reminderDays): ReminderKind | null {
  const left = (ends.getTime() - now.getTime()) / DAY;
  if (left <= 0) return left > -30 ? 'ended' : null;
  const steps = [...days].sort((a, b) => a - b);
  for (const d of steps) if (left <= d) return `d${d}` as ReminderKind;
  return null;
}

/**
 * Hourly: every company still on its trial gets the 14/7/1-day reminders and,
 * when the trial is over, a note that it is now read-only — everything can still
 * be read and exported, nothing is deleted. To its administrators, in its language.
 */
export async function sendTrialReminders(deps: Deps, now: Date): Promise<number> {
  const orgs = await deps.db.system((q) =>
    q.query<{ id: string; slug: string; name: string; locale: string; trial_ends_at: Date | string }>(
      `select id, slug, name, locale, trial_ends_at from orgs
        where trial_ends_at is not null and trial_ends_at between $1::timestamptz - interval '30 days' and $1::timestamptz + interval '15 days'
          and coalesce(billing->>'status', '') not in ('active', 'past_due')`,
      [now.toISOString()],
    ),
  );
  let sent = 0;
  for (const o of orgs) {
    const ends = new Date(o.trial_ends_at);
    const kind = reminderFor(ends, now);
    if (!kind) continue;
    const claimed = await deps.db.system((q) =>
      q.query(`insert into trial_reminders (org_id, kind, trial_ends_at) values ($1, $2, $3) on conflict do nothing returning org_id`, [
        o.id,
        kind,
        ends.toISOString(),
      ]),
    );
    if (!claimed.length) continue;
    const admins = await deps.db.system((q) =>
      q.query<{ email: string; name: string; locale: string | null }>(
        `select u.email, u.name, u.locale from users u join roles r on r.id = u.role_id
          where u.org_id = $1 and u.status = 'active' and 'org.manage' = any(r.perms)`,
        [o.id],
      ),
    );
    const days = Math.max(0, Math.ceil((ends.getTime() - now.getTime()) / DAY));
    for (const a of admins) {
      const locale = (a.locale ?? o.locale) as Locale;
      const vars = { name: a.name, org: o.name, days, link: `${orgUrl(deps.config, o.slug)}/settings/billing` };
      const which = kind === 'ended' ? 'ended' : kind === 'd1' ? 'lastDay' : 'reminder';
      const subject = `email.trial.${which}.subject` as const;
      const text = `email.trial.${which}.body` as const;
      await deps.email
        .send({ to: a.email, subject: translate(locale, subject, vars), text: translate(locale, text, vars) })
        .catch((e) => console.error('[curahold] trial reminder failed', e));
      sent++;
    }
  }
  return sent;
}
