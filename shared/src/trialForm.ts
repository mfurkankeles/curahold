// The public free-trial request form: its choices and limits. The consent each
// visitor is shown — decided by the country they pick and the one their
// connection comes from — is the compliance package's (compliance/trialConsent.ts
// on consentTexts.ts); the agreements' versions are the contract pack's.
//
// LEGAL STATUS: every consent and agreement text is a versioned DRAFT waiting
// for the lawyer's review. The stored records keep the version and a hash of
// the exact sentence each person read.
//
// Storage of the request itself: shared/src/trialRequest.ts (owner console).
import { AGREEMENT_PACK } from './compliance/agreements';

/** True while the texts are placeholders; the console shows it next to every record. */
export const CONSENT_DRAFT = true;

/** Where the visitor is, as far as the law is concerned. */
export const CONSENT_REGIONS = ['tr', 'eu', 'ae', 'sa', 'eg', 'qa', 'il', 'jp', 'kr', 'cn', 'twn', 'hk', 'sg', 'any'] as const;
export type ConsentRegion = (typeof CONSENT_REGIONS)[number];

/** The law each region's notice names (a proper name, written the same in every language). Null: the generic word. */
export const LAW_NAME: Record<ConsentRegion, string | null> = {
  tr: 'KVKK',
  eu: 'GDPR',
  ae: 'UAE PDPL',
  sa: 'Saudi PDPL',
  eg: 'Egypt PDPL',
  qa: 'Qatar PDPPL',
  il: 'Israel PPL',
  jp: 'APPI',
  kr: 'PIPA',
  cn: 'PIPL',
  twn: 'Taiwan PDPA',
  hk: 'PDPO',
  sg: 'Singapore PDPA',
  any: null,
};

/**
 * Countries the trial is not offered in: Iran (sanctions); Egypt (fully enforceable since 1 Nov 2026 —
 * licence, DPO, local representative) and mainland China (representative in China) until the owner and
 * a local lawyer decide (research-legal §0). Their rule sets in compliance/consentTexts.ts are ready for when they are taken off.
 */
export const NOT_OFFERED = ['IR', 'EG', 'CN'];

/** Every ISO 3166-1 alpha-2 code; names come from Intl.DisplayNames in the reader's language. */
export const ALL_COUNTRIES = (
  'AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ ' +
  'DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IQ IS IT JE JM JO JP ' +
  'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ ' +
  'OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ ' +
  'UA UG US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW'
).split(' ');

/** The countries a trial can be asked for from: every code except those not offered yet. */
export const COUNTRIES = ALL_COUNTRIES.filter((c) => !NOT_OFFERED.includes(c));

// ------------------------------------------------------------------ choices

export const INDUSTRIES = [
  'software',
  'agency',
  'consulting',
  'finance',
  'ecommerce',
  'manufacturing',
  'health',
  'education',
  'logistics',
  'media',
  'realestate',
  'other',
] as const;
export const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-1000', '1000+'] as const;
export const CUSTOMER_COUNTS = ['0-20', '21-100', '101-500', '501-2000', '2000+'] as const;
export const TIMELINES = ['now', 'month', 'quarter', 'exploring'] as const;
export const HEARD_FROM = ['search', 'social', 'friend', 'event', 'article', 'partner', 'ai', 'other'] as const;
export const CONTACT_TIMES = ['morning', 'afternoon', 'evening', 'email'] as const;
export const PROBLEMS = ['handoff', 'onePlace', 'renewals', 'pipeline', 'sprints', 'reporting', 'portal', 'replace'] as const;
export const TOOL_KINDS = ['crm', 'tasks', 'accounting', 'bi'] as const;

/** The form's own limits (also checked by the server). */
export const TRIAL_FORM = {
  /** A form sent faster than this after it opened was not typed by a person. */
  minFillMs: 4000,
  codeDigits: 6,
  codeMinutes: 15,
  codesPerHour: 5,
  codeTries: 5,
  /** How long a verified address stays good for sending the form. */
  ticketMinutes: 120,
  requestsPerDay: 3,
  maxSeats: 5000,
} as const;

// Free mail services beyond the ones company sign-up already knows (lib/domains.ts), by region.
export const MORE_FREE_MAIL = [
  '126.com',
  '139.com',
  'sina.com',
  'sina.cn',
  'sohu.com',
  'yeah.net',
  'aliyun.com',
  'foxmail.com',
  'naver.com',
  'daum.net',
  'hanmail.net',
  'kakao.com',
  'nate.com',
  'yahoo.co.jp',
  'docomo.ne.jp',
  'ezweb.ne.jp',
  'softbank.ne.jp',
  'outlook.jp',
  'hotmail.co.jp',
  'walla.co.il',
  'walla.com',
  'yahoo.com.hk',
  'netvigator.com',
  'yahoo.com.sg',
  'rocketmail.com',
  't-online.de',
  'orange.fr',
  'free.fr',
  'laposte.net',
  'wanadoo.fr',
  'seznam.cz',
  'wp.pl',
  'o2.pl',
  'interia.pl',
  'abv.bg',
  'ukr.net',
  'rambler.ru',
  'bk.ru',
  'list.ru',
  'inbox.ru',
  'outlook.fr',
  'outlook.es',
  'hotmail.es',
  'yahoo.es',
  'yahoo.it',
  'gmx.at',
  'gmx.ch',
  'rediffmail.com',
  'yahoo.com',
  'outlook.sa',
  'yahoo.ae',
  'yandex.ua',
  'tuta.io',
  'duck.com',
];

// ------------------------------------------------------------------ agreements at activation

/** The documents a new company's administrator accepts with a click before the trial opens. DRAFT versions, from the contract pack. */
export const AGREEMENTS = {
  terms: { version: AGREEMENT_PACK.terms.version, docs: 'legal-terms' },
  dpa: { version: AGREEMENT_PACK.dpa.version, docs: 'legal-dpa' },
} as const;
export type AgreementDoc = keyof typeof AGREEMENTS;
export const AGREEMENT_DOCS = Object.keys(AGREEMENTS) as AgreementDoc[];
