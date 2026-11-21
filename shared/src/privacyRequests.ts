// Requests people make about their personal data, and when each is due under the law that applies. Used by the
// company's privacy log (api/src/routes/admin.ts, Settings › Company) to fill in the due date; the administrator can
// move it (an extension the law allows, a clarification asked for). Days are calendar days from receipt; where a law
// gives "one month" (GDPR, UK GDPR) it is a calendar month (1 February → 1 March, 31 January → the last day of
// February: EU Reg. 1182/71 art. 3(2)(c)), since 30 days would be two days late in February. The periods are drafts
// for the lawyer to confirm (docs/compliance: "lawyer to confirm"); where a law says "without delay" the shortest
// common reading is used, so the log errs early, never late. DPDP's 90 days is the Rules' outer limit, not an early
// reading: the log shows the limit and the administrator answers sooner.

/** What a person asked for. */
export const PRIVACY_REQUEST_KINDS = ['access', 'rectification', 'erasure', 'restriction', 'objection', 'portability', 'withdrawal'] as const;
export type PrivacyRequestKind = (typeof PRIVACY_REQUEST_KINDS)[number];

/** Where a request stands. */
export const PRIVACY_REQUEST_STATUSES = ['open', 'done', 'refused'] as const;
export type PrivacyRequestStatus = (typeof PRIVACY_REQUEST_STATUSES)[number];

/**
 * Each law: its short name, the region it is shown with (an ISO code for Intl.DisplayNames, 'EU' for the Union) and
 * the days it gives to answer (`months` instead where the law counts in calendar months). `other` is for a law not
 * listed (30 days, the most common period).
 */
export const PRIVACY_LAWS = {
  kvkk: { name: 'KVKK', region: 'TR', days: 30 }, // KVKK m. 13/2: 30 days
  gdpr: { name: 'GDPR', region: 'EU', days: 28, months: 1 }, // Art. 12(3): one month, extendable by two
  uk_gdpr: { name: 'UK GDPR', region: 'GB', days: 28, months: 1 }, // one month (days: the shortest month, for a sort or a label)
  dpdp: { name: 'DPDP', region: 'IN', days: 90 }, // DPDP Rules 2025: grievances within 90 days at most
  pdpa_sg: { name: 'PDPA', region: 'SG', days: 30 }, // PDPA s. 21 / Reg. 4: as soon as reasonable, within 30 days
  pdpa_my: { name: 'PDPA', region: 'MY', days: 21 }, // PDPA 2010 s. 31: 21 days
  pipa: { name: 'PIPA', region: 'KR', days: 10 }, // Enforcement Decree art. 41: 10 days
  appi: { name: 'APPI', region: 'JP', days: 14 }, // "without delay": two weeks as the working reading
  pdpl_sa: { name: 'PDPL', region: 'SA', days: 30 }, // Implementing Regulation: 30 days
  pdpl_ae: { name: 'PDPL', region: 'AE', days: 30 },
  pdppl: { name: 'PDPPL', region: 'QA', days: 30 },
  ppl_il: { name: 'PPL', region: 'IL', days: 30 }, // Privacy Protection Regulations: 30 days for access
  pdpa_tw: { name: 'PDPA', region: 'TW', days: 15 }, // art. 13: 15 days for access (30 for correction)
  pdpo: { name: 'PDPO', region: 'HK', days: 40 }, // s. 19: 40 days
  other: { name: '', region: '', days: 30 },
} as const;
export type PrivacyLaw = keyof typeof PRIVACY_LAWS;
export const PRIVACY_LAW_KEYS = Object.keys(PRIVACY_LAWS) as PrivacyLaw[];

/** The day a request received on `received` (YYYY-MM-DD) is due under `law`. */
export function privacyDueOn(received: string, law: PrivacyLaw): string {
  const d = new Date(`${received}T00:00:00Z`);
  const rule: { days: number; months?: number } = PRIVACY_LAWS[law];
  if (rule.months) {
    // The same day of the month that many months on; where that month is shorter, its last day.
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + rule.months);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
  } else d.setUTCDate(d.getUTCDate() + rule.days);
  return d.toISOString().slice(0, 10);
}
