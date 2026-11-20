// Click-accept evidence for the contract pack (agreement_evidence, migration 0160).
//
// Every acceptance of a document (terms/MSA, DPA, SLA, AUP; an order form that
// was signed) is one append-only row: who (user id, e-mail, name, role), for which
// company (name and tax number as stated), the authority tick, which document
// (id, version, language, SHA-256 of the text and of its PDF copy), the exact box
// text and button label (as a hash plus the label), when, from which country,
// the context (trial approval, purchase, re-acceptance) and the message id of the
// confirmation e-mail that carried the copy.
//
// Rows are hash-chained: row_hash = SHA-256(prev_hash + the row's fields), with
// an advisory lock so two acceptances never fork the chain. verifyAgreementChain
// recomputes it; a changed or removed row is found. The trial's acceptance step
// (b4-trial: routes/agreements.ts) calls recordAgreement once per document; the
// UI belongs to that package, the evidence and the texts to this one.
import { sha256Hex } from './crypto';
import type { AgreementDocId } from '../../../shared/src/compliance/agreements';

import type { Q as Querier } from '../db';

export const GENESIS = '0'.repeat(64);

export interface AgreementAcceptance {
  orgId: string | null;
  companyName: string | null;
  companyTaxId: string | null;
  userId: string | null;
  userEmail: string;
  userName: string | null;
  userRole: string | null;
  authority: boolean;
  doc: AgreementDocId;
  version: string;
  docLocale: string;
  docHash: string;
  pdfHash: string | null;
  /** The box text and the button label as rendered (hashed together). */
  statement: string;
  buttonLabel: string;
  context: 'trial_approval' | 'purchase' | 're_acceptance' | 'order_form';
  ipCountry: string | null;
  userAgent: string | null;
  copyMessageId: string | null;
  /** ISO time; the database clock when omitted. */
  acceptedAt?: string;
}

type Row = {
  id: string;
  company_name: string | null;
  company_tax_id: string | null;
  user_id: string | null;
  user_email: string;
  user_name: string | null;
  user_role: string | null;
  authority: boolean;
  doc: string;
  version: string;
  doc_locale: string;
  doc_hash: string;
  pdf_hash: string | null;
  statement_hash: string;
  button_label: string;
  context: string;
  ip_country: string | null;
  user_agent: string | null;
  copy_message_id: string | null;
  accepted_at: Date | string;
  prev_hash: string;
  row_hash: string;
};

/** The fields the chain covers, in a fixed order (org_id is left out: it is nulled when a company is deleted). */
function material(r: Omit<Row, 'row_hash' | 'prev_hash'>): string {
  const at = new Date(r.accepted_at).toISOString();
  return JSON.stringify([
    r.id,
    r.company_name,
    r.company_tax_id,
    r.user_id,
    r.user_email,
    r.user_name,
    r.user_role,
    r.authority,
    r.doc,
    r.version,
    r.doc_locale,
    r.doc_hash,
    r.pdf_hash,
    r.statement_hash,
    r.button_label,
    r.context,
    r.ip_country,
    r.user_agent,
    r.copy_message_id,
    at,
  ]);
}

/**
 * The hash chaining one evidence row to the previous one: sha256(previous hash + the row's fields). Changing or removing
 * any stored row breaks every hash after it, so tampering shows (ADR 0014).
 */
export const rowHash = (prev: string, r: Omit<Row, 'row_hash' | 'prev_hash'>) => sha256Hex(prev + material(r));

/** Writes one acceptance at the end of the chain (inside the caller's transaction). */
export async function recordAgreement(q: Querier, a: AgreementAcceptance): Promise<{ id: string; rowHash: string }> {
  if (!a.authority) throw new Error('agreement_evidence: the authority box must be ticked');
  await q.query(`select pg_advisory_xact_lock(hashtext('agreement_evidence'))`);
  const [last] = await q.query<{ row_hash: string }>('select row_hash from agreement_evidence order by seq desc limit 1');
  const prev = last?.row_hash ?? GENESIS;
  const [{ id, now }] = (await q.query<{ id: string; now: Date }>('select gen_random_uuid() as id, now() as now')) as [{ id: string; now: Date }];
  const r = {
    id,
    company_name: a.companyName,
    company_tax_id: a.companyTaxId,
    user_id: a.userId,
    user_email: a.userEmail.toLowerCase(),
    user_name: a.userName,
    user_role: a.userRole,
    authority: a.authority,
    doc: a.doc,
    version: a.version,
    doc_locale: a.docLocale,
    doc_hash: a.docHash,
    pdf_hash: a.pdfHash,
    statement_hash: await sha256Hex(a.statement),
    button_label: a.buttonLabel.slice(0, 120),
    context: a.context,
    ip_country: a.ipCountry,
    user_agent: a.userAgent ? a.userAgent.slice(0, 400) : null,
    copy_message_id: a.copyMessageId,
    accepted_at: a.acceptedAt ? new Date(a.acceptedAt).toISOString() : new Date(now).toISOString(),
  };
  const hash = await rowHash(prev, r);
  await q.query(
    `insert into agreement_evidence (id, org_id, company_name, company_tax_id, user_id, user_email, user_name, user_role, authority, doc, version,
       doc_locale, doc_hash, pdf_hash, statement_hash, button_label, context, ip_country, user_agent, copy_message_id, accepted_at, prev_hash, row_hash)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
    [
      r.id,
      a.orgId,
      r.company_name,
      r.company_tax_id,
      r.user_id,
      r.user_email,
      r.user_name,
      r.user_role,
      r.authority,
      r.doc,
      r.version,
      r.doc_locale,
      r.doc_hash,
      r.pdf_hash,
      r.statement_hash,
      r.button_label,
      r.context,
      r.ip_country,
      r.user_agent,
      r.copy_message_id,
      r.accepted_at,
      prev,
      hash,
    ],
  );
  return { id: r.id, rowHash: hash };
}

/** Recomputes the whole chain; the first row that does not verify, or null when all do. */
export async function verifyAgreementChain(q: Querier): Promise<{ ok: boolean; rows: number; brokenAt: string | null }> {
  const rows = await q.query<Row>('select * from agreement_evidence order by seq');
  let prev = GENESIS;
  for (const r of rows) {
    if (r.prev_hash !== prev || (await rowHash(prev, r)) !== r.row_hash) return { ok: false, rows: rows.length, brokenAt: r.id };
    prev = r.row_hash;
  }
  return { ok: true, rows: rows.length, brokenAt: null };
}
