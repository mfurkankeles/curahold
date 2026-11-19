// Click-to-accept at activation: before a trial company's work starts, its
// administrator accepts the terms of service and the data processing agreement
// (DPA). What is stored is the evidence a review asks for — which document,
// which version, the hash of the exact sentence clicked, who, when, from which
// country — and a new version asks again (lib/trial.ts markAgreementsDue).
// Each accepted document is also one row in the hash-chained agreement_evidence
// (lib/agreementEvidence.ts), with the SHA-256 of the document text itself.
import { Hono } from 'hono';
import { z } from 'zod';
import { AGREEMENTS, AGREEMENT_DOCS } from '../../../shared/src/trialForm';
import { helpLanguageOf, translate } from '../../../shared/src/i18n';
import { nowOf, orgUrl, requirePerm, run, type AppEnv } from '../context';
import { sha256Hex } from '../lib/crypto';
import { audit } from '../lib/audit';
import { recordAgreement } from '../lib/agreementEvidence';
import LEGAL_HASHES from '../../../shared/src/compliance/legal-hashes.json';
import { agreementStatement, ipCountryOf, type AgreementRow } from '../lib/trial';
import { localeField, body } from '../lib/validate';

export const agreementRoutes = new Hono<AppEnv>();

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

/** The document's text hash in the language read (English and Turkish are written today; else the English one, which those readers are shown). */
function docHash(slug: string, locale: string): { docLocale: string; docHash: string } {
  const per = (LEGAL_HASHES.sha256 as Record<string, Record<string, string>>)[slug] ?? {};
  const lang = per[locale] ? locale : 'en';
  return { docLocale: lang, docHash: per[lang] ?? '' };
}

/** What the company has accepted, and what is still waiting for its administrator. */
agreementRoutes.get('/agreements', async (c) => {
  const rows = await run(c, (q) =>
    q.query<{ doc: AgreementRow['doc']; version: string; due_at: Date; accepted_at: Date | null; accepted_name: string | null; accepted_email: string | null }>(
      `select doc, version, due_at, accepted_at, accepted_name, accepted_email from org_agreements where org_id = $1 order by due_at, doc`,
      [c.get('org').id],
    ),
  );
  const list: AgreementRow[] = rows.map((r) => ({
    doc: r.doc,
    version: r.version,
    dueAt: iso(r.due_at)!,
    acceptedAt: iso(r.accepted_at),
    acceptedName: r.accepted_name,
    acceptedEmail: r.accepted_email,
  }));
  return c.json({ agreements: list, due: list.filter((a) => !a.acceptedAt), docs: AGREEMENTS });
});

/** The administrator accepts every document waiting, with one click on one sentence. */
agreementRoutes.post('/agreements/accept', async (c) => {
  requirePerm(c, 'org.manage');
  const input = await body(c, z.object({ locale: localeField, docs: z.array(z.enum(AGREEMENT_DOCS as ['terms', 'dpa'])).min(1) }));
  const deps = c.get('deps');
  const org = c.get('org');
  const auth = c.get('auth');
  const hash = await sha256Hex(agreementStatement(input.locale));
  const country = ipCountryOf(c.req.header('cf-ipcountry'));
  const ua = (c.req.header('user-agent') ?? '').slice(0, 400) || null;
  const accepted = await deps.db.system(async (q) => {
    const done = await q.query<{ doc: string; version: string }>(
      `update org_agreements set accepted_at = now(), accepted_by = $2, accepted_email = $3, accepted_name = $4, text_hash = $5, locale = $6, ip_country = $7, user_agent = $8
        where org_id = $1 and accepted_at is null and doc = any($9::text[]) returning doc, version`,
      [org.id, auth.userId, auth.email, auth.name, hash, input.locale, country, ua, input.docs],
    );
    for (const d of done)
      await recordAgreement(q, {
        orgId: org.id,
        companyName: org.name,
        companyTaxId: null,
        userId: auth.userId,
        userEmail: auth.email,
        userName: auth.name,
        userRole: auth.roleKey,
        // The sentence clicked says the person is authorised to accept for the company.
        authority: true,
        doc: d.doc as 'terms' | 'dpa',
        version: d.version,
        ...docHash(AGREEMENTS[d.doc as 'terms' | 'dpa'].docs, helpLanguageOf(input.locale)),
        pdfHash: null,
        statement: agreementStatement(input.locale),
        buttonLabel: translate(input.locale, 'agreements.accept'),
        context: 'trial_approval',
        ipCountry: country,
        userAgent: ua,
        copyMessageId: null,
      });
    if (done.length)
      await audit(q, {
        orgId: org.id,
        actorId: auth.userId,
        action: 'agreements.accepted',
        entity: 'org',
        entityId: org.id,
        meta: { docs: done.map((d) => `${d.doc}@${d.version}`), hash },
      });
    return done;
  });
  // The durable copy: what was accepted, when, and where every version stays readable.
  if (accepted.length) {
    const docs = (doc: 'terms' | 'dpa') => `${orgUrl(deps.config, org.slug)}/docs/${helpLanguageOf(input.locale)}/${AGREEMENTS[doc].docs}/`;
    const vars = {
      name: auth.name,
      org: org.name,
      at: nowOf(deps).toISOString().slice(0, 16).replace('T', ' '),
      statement: agreementStatement(input.locale),
      terms: AGREEMENTS.terms.version,
      dpa: AGREEMENTS.dpa.version,
      termsLink: docs('terms'),
      dpaLink: docs('dpa'),
    };
    await deps.email
      .send({
        to: auth.email,
        subject: translate(input.locale, 'email.agreements.subject', vars),
        text: translate(input.locale, 'email.agreements.body', vars),
      })
      .catch((e) => console.error('[curahold] agreement copy failed', e));
  }
  return c.json({ accepted });
});
