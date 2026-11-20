// The recorded answer to the assistant's consent notice, for each chat surface
// (shared/src/assistConsent.ts, migration 0243). The assistant routes call
// these before a question is processed: without a "yes" to the current notice
// version the request fails with consent_required, so the check holds even
// for a client that never showed the notice. App people go through row
// security as themselves; portal people through the portal's own functions;
// public visitors by the random consent id their browser keeps.
import { ASSIST_CONSENT_VERSION, type AssistConsentState } from '../../../shared/src/assistConsent';
import type { Db, Q } from '../db';
import { iso } from '../lib/mappers';

type Row = { granted: boolean; created_at: Date | string; version: string };
const stateOf = (r: Row | undefined): AssistConsentState => ({
  version: ASSIST_CONSENT_VERSION,
  granted: r && r.version === ASSIST_CONSENT_VERSION ? r.granted : null,
  at: r && r.version === ASSIST_CONSENT_VERSION ? iso(r.created_at) : null,
});

/** A company person's current answer (inside run(c): row security limits it to themselves). */
export async function appConsent(q: Q, userId: string): Promise<AssistConsentState> {
  const [r] = await q.query<Row>(`select granted, created_at, version from assistant_consents where user_id = $1 and surface = 'app' order by created_at desc limit 1`, [userId]);
  return stateOf(r);
}

/** Records a company person's choice (inside run(c)). */
export async function setAppConsent(q: Q, orgId: string, userId: string, granted: boolean, locale: string): Promise<AssistConsentState> {
  await q.query(`insert into assistant_consents (org_id, user_id, surface, version, locale, granted) values ($1, $2, 'app', $3, $4, $5)`, [orgId, userId, ASSIST_CONSENT_VERSION, locale, granted]);
  return appConsent(q, userId);
}

/** A portal person's current answer, through the portal's function (the person comes from the session). */
export async function portalConsent(q: { query(sql: string, p?: unknown[]): Promise<any[]> }): Promise<AssistConsentState> {
  const [r] = await q.query('select portal_assist_consent($1) as granted', [ASSIST_CONSENT_VERSION]);
  const granted = r?.granted ?? null;
  return { version: ASSIST_CONSENT_VERSION, granted: granted === null ? null : !!granted, at: null };
}

/** Records a portal person's choice. */
export async function setPortalConsent(q: { query(sql: string, p?: unknown[]): Promise<any[]> }, granted: boolean, locale: string): Promise<AssistConsentState> {
  await q.query('select portal_assist_consent_set($1, $2, $3)', [ASSIST_CONSENT_VERSION, locale, granted]);
  return portalConsent(q);
}

/** A public visitor's current answer, by the consent id their browser keeps. */
export async function publicConsent(db: Db, consentId: string): Promise<AssistConsentState> {
  const [r] = await db.system((q) =>
    q.query<Row>('select granted, created_at, version from assistant_public_consents where consent_id = $1 order by created_at desc limit 1', [consentId]),
  );
  return stateOf(r);
}

/** Records a public visitor's choice (no company, no person: the random id, the surface, the language). */
export async function setPublicConsent(db: Db, consentId: string, surface: 'docs' | 'site', granted: boolean, locale: string): Promise<AssistConsentState> {
  await db.system((q) =>
    q.query('insert into assistant_public_consents (consent_id, surface, version, locale, granted) values ($1, $2, $3, $4, $5)', [consentId, surface, ASSIST_CONSENT_VERSION, locale, granted]),
  );
  return publicConsent(db, consentId);
}
