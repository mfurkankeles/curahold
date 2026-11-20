// How long Curahold keeps what it keeps, and the nightly job that lets go of
// the rest (KVKK m.4/2-d and m.7, GDPR Art. 5(1)(e): no longer than needed).
//
// The periods are the ones the privacy notice, the KVKK notice and the records
// of processing state (docs/site/<lang>/legal-privacy.md, docs/compliance/
// data-inventory.md). They can be changed per installation with the
// RETENTION_* settings (docs/ENVIRONMENT.md §6e); each has a floor so a typo
// cannot wipe evidence a law asks us to keep. The other clean-ups (sessions,
// tokens, errors, recordings) stay in lib/scheduler.ts cleanUp().
import type { Deps } from '../context';

/** Days each kind of record is kept (see RETENTION_DEFAULTS for the stated periods). */
export interface RetentionConfig {
  /** Trial requests from the sales site (and their e-mail codes' history). */
  trialRequestsDays: number;
  /** Consent and withdrawal records (trial form, cookie choices): the proof we must be able to show. */
  consentDays: number;
  /** Help requests, their messages and files, and the support desk's own log. */
  supportDays: number;
  /** The activity log (audit_log): security and administration records. */
  auditDays: number;
  /** Requests about personal data (privacy_requests, 0250), counted from when the request was answered or refused. */
  privacyRequestsDays: number;
  /** Days between a company's deletion request and the purge (it can be cancelled meanwhile). */
  companyDeleteGraceDays: number;
}

/**
 * The stated periods. Trial requests 12 months, consent proof 3 years (the
 * usual limitation period for a claim about it), support 24 months, the
 * activity log 12 months, company deletion after 30 days. A closed request
 * about personal data is kept 3 years after it was closed: it is the proof that
 * the request was answered on time, and 3 years is the same limitation reasoning
 * as consent proof. An open one is never purged. The period is an owner/lawyer
 * question (orch owner-questions, privacy request log): shorter is better for
 * minimisation, longer for evidence.
 */
export const RETENTION_DEFAULTS: RetentionConfig = {
  trialRequestsDays: 365,
  consentDays: 1095,
  supportDays: 730,
  auditDays: 365,
  privacyRequestsDays: 1095,
  companyDeleteGraceDays: 30,
};

/** The lowest value a setting may take: below it the default is used instead. */
const FLOORS: RetentionConfig = { trialRequestsDays: 30, consentDays: 365, supportDays: 90, auditDays: 90, privacyRequestsDays: 365, companyDeleteGraceDays: 7 };

const ENV_KEYS: Record<keyof RetentionConfig, string> = {
  trialRequestsDays: 'RETENTION_TRIAL_REQUEST_DAYS',
  consentDays: 'RETENTION_CONSENT_DAYS',
  supportDays: 'RETENTION_SUPPORT_DAYS',
  auditDays: 'RETENTION_AUDIT_DAYS',
  privacyRequestsDays: 'RETENTION_PRIVACY_REQUEST_DAYS',
  companyDeleteGraceDays: 'COMPANY_DELETE_GRACE_DAYS',
};

/** Reads the RETENTION_* settings; anything missing, not a whole number or under its floor falls back to the default. */
export function retentionFrom(env: Record<string, string | undefined>): RetentionConfig {
  const out = { ...RETENTION_DEFAULTS };
  for (const k of Object.keys(ENV_KEYS) as (keyof RetentionConfig)[]) {
    const n = Number(env[ENV_KEYS[k]]);
    if (Number.isInteger(n) && n >= FLOORS[k] && n <= 3650) out[k] = n;
  }
  return out;
}

/** The installation's periods (defaults where the configuration says nothing). */
export const retentionOf = (deps: Pick<Deps, 'config'>): RetentionConfig => ({ ...RETENTION_DEFAULTS, ...(deps.config.retention ?? {}) });

export interface RetentionResult {
  trialRequests: number;
  trialCodes: number;
  consentRecords: number;
  consentEvents: number;
  consentLog: number;
  /** The in-app and portal assistant's consent answers (0243), and the docs/site assistant's. */
  assistantConsents: number;
  assistantPublicConsents: number;
  helpRequests: number;
  deskLog: number;
  auditLog: number;
  /** Closed requests about personal data past their period (open ones always stay). */
  privacyRequests: number;
  files: number;
}

/**
 * The nightly purge. Consent proof is the one careful case: a record older
 * than the period goes only when it is no longer the evidence for a choice in
 * force — the latest record of a person for a block that still says "yes"
 * stays as long as that consent is relied on (a withdrawal, a later answer or
 * the period after it ends that). Help files leave storage before their rows,
 * so a failure in between leaves rows for the next night rather than files
 * nobody can find.
 */
export async function purgeExpired(deps: Deps, now: Date = (deps.now ?? (() => new Date()))()): Promise<RetentionResult> {
  const r = retentionOf(deps);
  const at = now.toISOString();
  const count = async (sql: string, params: unknown[]) => (await deps.db.system((q) => q.query(`with gone as (${sql} returning 1) select count(*)::int as n from gone`, params)))[0].n as number;

  const keys = await deps.db.system((q) =>
    q.query<{ id: string; storage_key: string }>(
      `select f.id, f.storage_key from help_files f join help_requests h on h.org_id = f.org_id and h.id = f.request_id
        where h.updated_at < $1::timestamptz - make_interval(days => $2)`,
      [at, r.supportDays],
    ),
  );
  for (const k of keys) await deps.storage.delete(k.storage_key);

  return {
    trialRequests: await count(`delete from trial_requests where updated_at < $1::timestamptz - make_interval(days => $2)`, [at, r.trialRequestsDays]),
    trialCodes: await count(`delete from trial_codes where expires_at < $1::timestamptz - interval '1 day'`, [at]),
    consentRecords: await count(
      `delete from consent_records c
        where c.created_at < $1::timestamptz - make_interval(days => $2)
          and not (c.granted and c.kind in ('consent', 'marketing') and not exists (
                select 1 from consent_records n where n.email = c.email and n.block = c.block and n.created_at > c.created_at))`,
      [at, r.consentDays],
    ),
    consentEvents: await count(`delete from consent_events where created_at < $1::timestamptz - make_interval(days => $2)`, [at, r.consentDays]),
    consentLog: await count(`delete from consent_log where created_at < $1::timestamptz - make_interval(days => $2)`, [at, r.consentDays]),
    // The assistant's consent answers follow the same rule as consent_records: past the period they go, except a
    // person's latest answer when it is "yes" — that row is the proof the assistant may still be used (ADR 0014).
    assistantConsents: await count(
      `delete from assistant_consents c
        where c.created_at < $1::timestamptz - make_interval(days => $2)
          -- An erased portal person's rows (nobody attached, 0251) are never "in force": they go once past the period.
          and not (c.granted and num_nonnulls(c.user_id, c.portal_user_id) = 1 and not exists (
                select 1 from assistant_consents n
                 where n.org_id = c.org_id and n.surface = c.surface
                   and n.user_id is not distinct from c.user_id and n.portal_user_id is not distinct from c.portal_user_id
                   and n.created_at > c.created_at))`,
      [at, r.consentDays],
    ),
    assistantPublicConsents: await count(
      `delete from assistant_public_consents c
        where c.created_at < $1::timestamptz - make_interval(days => $2)
          and not (c.granted and not exists (select 1 from assistant_public_consents n where n.consent_id = c.consent_id and n.created_at > c.created_at))`,
      [at, r.consentDays],
    ),
    helpRequests: await count(`delete from help_requests where updated_at < $1::timestamptz - make_interval(days => $2)`, [at, r.supportDays]),
    deskLog: await count(`delete from desk_log where at < $1::timestamptz - make_interval(days => $2)`, [at, r.supportDays]),
    auditLog: await count(`delete from audit_log where at < $1::timestamptz - make_interval(days => $2)`, [at, r.auditDays]),
    privacyRequests: await count(
      `delete from privacy_requests where status <> 'open' and closed_at < $1::timestamptz - make_interval(days => $2)`,
      [at, r.privacyRequestsDays],
    ),
    files: keys.length,
  };
}
