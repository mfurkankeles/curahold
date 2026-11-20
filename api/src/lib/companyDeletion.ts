// Deleting a whole company (KVKK m.7, GDPR Art. 17 and 28(3)(g): at the end of
// the service the processor deletes the customer's data; DPA §11).
//
//   1. An administrator asks (Settings → Company, routes/admin.ts): the request
//      is written with the date of the purge, after the grace period
//      (COMPANY_DELETE_GRACE_DAYS, 30 by default). Until then the company keeps
//      working, so the data can still be exported, and any administrator can
//      cancel.
//   2. The nightly job (lib/scheduler.ts cleanUp) purges what is due: files in
//      storage first (attachments, help files, files still in the trash, the
//      logo), then the company row, whose foreign keys cascade to every
//      company table — records, people, connector tokens (connections, chat
//      links, API keys, single sign-on), caches (assistant answers), the
//      search columns and indexes that live in those tables, the live
//      channel's change log. Rows outside the company tables that point at it
//      are dealt with by hand: trial requests and sign-ups are deleted, consent
//      records are anonymised (the evidence stays, no address), invoices stay
//      for tax law with the company's name copied onto them, agreement
//      evidence stays as the contract record (its chain must not break).
//   3. A certificate is written on the request: when, what was removed
//      (counted per table before the delete), how many files and connector
//      tokens, what was kept and why, with its SHA-256.
// Backups are outside this job: they roll off on the database provider's own
// schedule (docs/RUNBOOK.md "Company deletion").
import type { Deps } from '../context';
import type { Q } from '../db';
import { sha256Hex } from './crypto';
import { retentionOf } from './retention';
import { normalizeLocale, translate } from '../../../shared/src/i18n';

/** An open or finished request, as the settings card shows it. */
export interface CompanyDeletion {
  id: string;
  requestedAt: string;
  purgeAfter: string;
  cancelledAt: string | null;
  purgedAt: string | null;
}

/** The days a request waits before the purge on this installation. */
export const graceDaysOf = (deps: Pick<Deps, 'config'>): number => retentionOf(deps).companyDeleteGraceDays;

/** What the certificate says. */
export interface DeletionCertificate {
  company: { id: string; slug: string; name: string };
  requestedAt: string;
  purgedAt: string;
  /** Rows removed, per company table (only tables that had any). */
  removed: Record<string, number>;
  files: number;
  connectorTokens: number;
  kept: { invoices: number; agreementEvidence: number; consentRecordsAnonymised: number };
  notes: string[];
}

/** Purges every company whose grace period has ended. One company per transaction. */
export async function purgeDueCompanies(deps: Deps, now: Date = (deps.now ?? (() => new Date()))()): Promise<number> {
  const due = await deps.db.system((q) =>
    q.query<{ id: string }>(
      `select id from company_deletions where cancelled_at is null and purged_at is null and purge_after <= $1::timestamptz order by purge_after limit 20`,
      [now.toISOString()],
    ),
  );
  let done = 0;
  for (const d of due) {
    await purgeCompany(deps, d.id, now);
    done++;
  }
  return done;
}

/** Every storage key the company still owns: attachments, help files, files in the trash, the logo. */
async function storageKeys(q: Q, orgId: string): Promise<string[]> {
  const rows = await q.query<{ k: string }>(
    `select storage_key as k from files where org_id = $1
     union select storage_key from help_files where org_id = $1
     union select r.data->>'storage_key' from trash_rows r join trash t on t.id = r.trash_id where t.org_id = $1 and r.data ? 'storage_key'
     union select settings->'logo'->>'key' from orgs where id = $1 and settings->'logo'->>'key' is not null`,
    [orgId],
  );
  return rows.map((r) => r.k).filter(Boolean);
}

/** Rows per company table (every public table with an org_id column). */
async function countsOf(q: Q, orgId: string): Promise<Record<string, number>> {
  const tables = await q.query<{ t: string }>(
    `select c.table_name as t from information_schema.columns c
       join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
      where c.table_schema = 'public' and c.column_name = 'org_id'
        and c.table_name not in ('company_deletions', 'invoices', 'agreement_evidence', 'consent_records')
      order by 1`,
  );
  if (!tables.length) return {};
  // One statement: table names come from the catalogue, never from a request.
  const sql = tables.map((x) => `select '${x.t}' as t, (select count(*)::int from "${x.t}" where org_id = $1) as n`).join(' union all ');
  const rows = await q.query<{ t: string; n: number }>(sql, [orgId]);
  return Object.fromEntries(rows.filter((r) => r.n > 0).map((r) => [r.t, r.n]));
}

/**
 * Purges one company now (the request must be open). Storage goes first: a
 * failure afterwards leaves the rows for the next night, never files nobody
 * can find.
 */
export async function purgeCompany(deps: Deps, deletionId: string, now: Date = new Date()): Promise<DeletionCertificate> {
  const [req] = await deps.db.system((q) =>
    q.query<{ org_id: string; org_slug: string; org_name: string; requested_at: Date | string }>(
      `select org_id, org_slug, org_name, requested_at from company_deletions where id = $1 and cancelled_at is null and purged_at is null`,
      [deletionId],
    ),
  );
  if (!req) throw new Error('company deletion not open');
  const orgId = req.org_id;
  const keys = await deps.db.system((q) => storageKeys(q, orgId));
  for (const k of keys) await deps.storage.delete(k);

  // Who is told: the company's administrators, read now — after the delete there is nobody left to ask.
  let admins: { email: string; name: string; locale: string }[] = [];
  let hash = '';
  const cert = await deps.db.system(async (q) => {
    admins = await q.query<{ email: string; name: string; locale: string }>(
      `select u.email, u.name, coalesce(u.locale, o.locale) as locale from users u join roles r on r.id = u.role_id join orgs o on o.id = u.org_id
        where u.org_id = $1 and u.status = 'active' and 'org.manage' = any(r.perms)`,
      [orgId],
    );
    const removed = await countsOf(q, orgId);
    const tokens = removed.connections ?? 0;
    const tokenRows = (removed.api_tokens ?? 0) + (removed.chat_identities ?? 0) + (removed.sso_configs ?? 0) + (removed.oauth_clients ?? 0) + (removed.webhooks ?? 0);
    // Outside the company tables: the applicant's request and sign-up go; consent proof stays without the address.
    const consentIds = (
      await q.query<{ id: string }>(
        `select id from consent_records where org_id = $1 or request_id in (select id from trial_requests where created_org = $1)`,
        [orgId],
      )
    ).map((r) => r.id);
    const gone = async (sql: string) => (await q.query<{ n: number }>(`with g as (${sql} returning 1) select count(*)::int as n from g`, [orgId]))[0].n;
    const trial = await gone('delete from trial_requests where created_org = $1');
    const signups = await gone('delete from signups where org_id = $1');
    const [{ n: invoices }] = await q.query<{ n: number }>(
      `with k as (update invoices set company_name = $2 where org_id = $1 returning 1) select count(*)::int as n from k`,
      [orgId, req.org_name],
    );
    const [{ n: evidence }] = await q.query<{ n: number }>(`select count(*)::int as n from agreement_evidence where org_id = $1`, [orgId]);
    await q.query('delete from orgs where id = $1', [orgId]);
    const [{ n: anonymised }] = await q.query<{ n: number }>(
      `with a as (
         update consent_records set email = 'erased:' || encode(sha256(convert_to(email, 'UTF8')), 'hex'), user_agent = null
          where id = any($1::uuid[]) and email not like 'erased:%'
         returning 1)
       select count(*)::int as n from a`,
      [consentIds],
    );
    const body: DeletionCertificate = {
      company: { id: orgId, slug: req.org_slug, name: req.org_name },
      requestedAt: new Date(req.requested_at).toISOString(),
      purgedAt: now.toISOString(),
      removed: { ...removed, ...(trial ? { trial_requests: trial } : {}), ...(signups ? { signups } : {}) },
      files: keys.length,
      connectorTokens: tokens + tokenRows,
      kept: { invoices, agreementEvidence: evidence, consentRecordsAnonymised: anonymised },
      notes: [
        'invoices: kept for tax law (company name only, no people)',
        'agreement_evidence: kept as the contract record; its hash chain must stay whole',
        'backups: roll off on the database provider schedule',
        'connector apps: Curahold no longer holds their tokens; the customer may also remove the app at the provider',
      ],
    };
    hash = await sha256Hex(JSON.stringify(body));
    await q.query(`update company_deletions set purged_at = $2, certificate = $3::jsonb, certificate_hash = $4 where id = $1`, [deletionId, now.toISOString(), JSON.stringify(body), hash]);
    return body;
  });
  // The company's live room, if anyone is still in it, hears that it is gone.
  await deps.live?.poke?.(orgId).catch(() => undefined);
  // The certificate and its SHA-256 go to each administrator once the delete has committed. Straight through the
  // mailer, not the company outbox: the outbox is a company table and went with the company. A failed send does not
  // undo the deletion; the operator can still read the certificate (desk/owner/company-deletions).
  const text = JSON.stringify(cert, null, 2);
  for (const a of admins) {
    const locale = normalizeLocale(a.locale);
    await deps.email
      .send({ to: a.email, subject: translate(locale, 'email.companyDeleted.subject', { org: cert.company.name }), text: translate(locale, 'email.companyDeleted.body', { name: a.name, org: cert.company.name, hash, certificate: text }) })
      .catch(() => undefined);
  }
  return cert;
}

/** Every company deletion, newest first, for the operator: where each stands and the certificate's hash. */
export async function listCompanyDeletions(deps: Deps) {
  const rows = await deps.db.system((q) =>
    q.query<{ id: string; org_slug: string; org_name: string; requested_at: Date | string; purge_after: Date | string; cancelled_at: Date | string | null; purged_at: Date | string | null; certificate_hash: string | null }>(
      `select id, org_slug, org_name, requested_at, purge_after, cancelled_at, purged_at, certificate_hash from company_deletions order by requested_at desc limit 200`,
    ),
  );
  const at = (v: Date | string | null) => (v == null ? null : new Date(v).toISOString());
  return rows.map((r) => ({ id: r.id, slug: r.org_slug, name: r.org_name, requestedAt: at(r.requested_at), purgeAfter: at(r.purge_after), cancelledAt: at(r.cancelled_at), purgedAt: at(r.purged_at), certificateHash: r.certificate_hash }));
}

/** One deletion's certificate and hash (null while the company is not purged yet, or for an unknown id). */
export async function companyDeletionCertificate(deps: Deps, id: string): Promise<{ certificate: DeletionCertificate; hash: string } | null> {
  const [r] = await deps.db.system((q) => q.query<{ certificate: DeletionCertificate | null; certificate_hash: string | null }>(`select certificate, certificate_hash from company_deletions where id = $1`, [id]));
  return r?.certificate && r.certificate_hash ? { certificate: r.certificate, hash: r.certificate_hash } : null;
}
