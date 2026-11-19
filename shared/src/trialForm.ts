// The public free-trial request form: its choices, and the consent each
// visitor is shown, decided by the country they pick (and the country their
// connection comes from, when that differs — both apply, the stricter wins).
//
// LEGAL STATUS: every consent and agreement text here is a versioned DRAFT
// (PLACEHOLDER), written conservatively and waiting for the legal research
// (orch out/research-legal.md) and the lawyer's review. Changing a sentence in
// the dictionaries means a new CONSENT_VERSION / AGREEMENT version: the stored
// records keep the version and a hash of the exact sentence each person read.
//
// Storage of the request itself: shared/src/trialRequest.ts (owner console).

/** Bump on any change to a consent sentence in any language. */
export const CONSENT_VERSION = '2026-11-19.0.1-draft';
/** True while the texts are placeholders; the console shows it next to every record. */
export const CONSENT_DRAFT = true;

export type ConsentKind = 'notice' | 'consent' | 'marketing';

/** Where the visitor is, as far as the law is concerned. */
export const CONSENT_REGIONS = ['tr', 'eu', 'ae', 'sa', 'eg', 'qa', 'il', 'jp', 'kr', 'cn', 'twn', 'hk', 'sg', 'any'] as const;
export type ConsentRegion = (typeof CONSENT_REGIONS)[number];

const EU = 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO GB CH'.split(' ');

export function regionOf(country: string | null | undefined): ConsentRegion {
  const c = (country ?? '').toUpperCase();
  if (EU.includes(c)) return 'eu';
  const direct: Record<string, ConsentRegion> = {
    TR: 'tr',
    AE: 'ae',
    SA: 'sa',
    EG: 'eg',
    QA: 'qa',
    IL: 'il',
    JP: 'jp',
    KR: 'kr',
    CN: 'cn',
    TW: 'twn',
    HK: 'hk',
    SG: 'sg',
  };
  return direct[c] ?? 'any';
}

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

/** The law article or rule a block rests on — for the lawyer's review, shown in the console only. */
export interface ConsentBlockDef {
  /** Stable id, stored with every record: '<region>.<what>'. */
  key: string;
  kind: ConsentKind;
  /** A required consent must be ticked to send the form; a notice is shown, never ticked. */
  required: boolean;
  /** The sentence, from the dictionaries. */
  text: ConsentTextKey;
  /** Why this block is here (draft legal basis, for the review). */
  basis: string;
}

export type ConsentTextKey =
  | 'trial.consent.notice'
  | 'trial.consent.capacity'
  | 'trial.consent.processing'
  | 'trial.consent.processingAbroad'
  | 'trial.consent.transfer'
  | 'trial.consent.itemised'
  | 'trial.consent.marketingEmail'
  | 'trial.consent.iysEmail'
  | 'trial.consent.trMarketing';

/**
 * The choices the legal research left to the owner and the lawyer
 * (orch out/research-legal.md §1.0 and §1.15). Defaults follow its table.
 */
export const CONSENT_SWITCHES = {
  /** Türkiye: a consent box for hosting abroad. Off: since Sep 2024 it only covers occasional transfers, and asking for consent where another basis exists counts as misleading. Standard contracts + notice to the Authority instead. */
  trTransfer: false,
  /** Japan: consent to handling in the countries named (APPI art. 28). Optional; the lawyer's call. */
  jpTransfer: false,
  /** Saudi Arabia and Qatar: a required consent box (the research's default). */
  saConsent: true,
  qaConsent: true,
} as const;

const notice = (r: ConsentRegion, basis: string): ConsentBlockDef => ({
  key: `${r}.notice`,
  kind: 'notice',
  required: false,
  text: 'trial.consent.notice',
  basis,
});
const consent = (r: ConsentRegion, basis: string, text: ConsentTextKey = 'trial.consent.processing'): ConsentBlockDef => ({
  key: `${r}.consent`,
  kind: 'consent',
  required: true,
  text,
  basis,
});
const transfer = (r: ConsentRegion, basis: string): ConsentBlockDef => ({
  key: `${r}.transfer`,
  kind: 'consent',
  required: true,
  text: 'trial.consent.transfer',
  basis,
});
const on = (flag: boolean, ...defs: ConsentBlockDef[]) => (flag ? defs : []);

/**
 * The blocks per rule set (DRAFT 0.1, research-legal §1.15 "Which blocks each
 * rule set shows"): N notice everywhere (never a box), C a required consent
 * where the law rests on consent, T a separate cross-border consent where
 * needed, M marketing — optional, unticked, e-mail only — and the capacity
 * line (18+, on behalf of the company) for everyone.
 */
export const CONSENT_RULES: Record<ConsentRegion, ConsentBlockDef[]> = {
  tr: [
    notice('tr', 'KVKK art. 10 + Aydınlatma Tebliği; basis art. 5/2-c and 5/2-f, so no consent box for the request'),
    ...on(CONSENT_SWITCHES.trTransfer, transfer('tr', 'KVKK art. 9/6-a: explicit consent, valid for occasional transfers only')),
  ],
  eu: [notice('eu', 'GDPR / UK GDPR art. 13; basis art. 6(1)(f); transfers under SCCs/IDTA, no consent box')],
  ae: [
    notice('ae', 'UAE PDPL art. 13'),
    consent('ae', 'UAE PDPL: consent is the rule (no legitimate-interest basis); covers storage abroad', 'trial.consent.processingAbroad'),
  ],
  sa: [
    notice('sa', 'Saudi PDPL art. 12'),
    ...on(CONSENT_SWITCHES.saConsent, consent('sa', 'Saudi PDPL: consent by default (switchable)', 'trial.consent.processingAbroad')),
  ],
  eg: [notice('eg', 'Egypt PDPL'), consent('eg', 'Egypt PDPL: express consent'), transfer('eg', 'Egypt PDPL arts. 14-15: transfer licence + consent')],
  qa: [notice('qa', 'Qatar PDPPL'), ...on(CONSENT_SWITCHES.qaConsent, consent('qa', 'Qatar PDPPL: consent by default (switchable)'))],
  il: [notice('il', 'Israel Privacy Protection Law s. 11 (full notice); Amendment 13')],
  jp: [notice('jp', 'APPI art. 21 purpose of use'), ...on(CONSENT_SWITCHES.jpTransfer, transfer('jp', "APPI art. 28 (optional, lawyer's switch)"))],
  kr: [
    {
      key: 'kr.notice',
      kind: 'notice',
      required: false,
      text: 'trial.consent.itemised',
      basis: 'PIPA art. 15(1)(4): itemised notice (items, purpose, retention, ground)',
    },
    transfer('kr', "PIPA art. 28-8: separate consent for overseas transfer (or the disclosure route, lawyer's call)"),
  ],
  cn: [
    notice('cn', 'PIPL art. 17'),
    consent('cn', 'PIPL arts. 13-14: informed consent'),
    transfer('cn', 'PIPL art. 39: separate consent for provision abroad'),
  ],
  twn: [notice('twn', 'Taiwan PDPA art. 8 notice'), consent('twn', 'Taiwan PDPA art. 7: consent as cheap proof')],
  hk: [notice('hk', 'PDPO DPP1(3) Personal Information Collection Statement')],
  sg: [notice('sg', 'Singapore PDPA s. 20 notification')],
  any: [notice('any', 'Generic privacy notice')],
};

/** Rule sets where marketing is not offered until a licence or the owner decides (Egypt, mainland China). */
const NO_MARKETING: ConsentRegion[] = ['eg', 'cn'];

/** Marketing, optional and separate, by e-mail only; Türkiye asks Law 6563 approval and KVKK consent as two boxes (Board Decision 2025/1072). */
export function marketingBlocks(regions: ConsentRegion[]): ConsentBlockDef[] {
  if (regions.some((r) => NO_MARKETING.includes(r))) return [];
  if (regions.includes('tr')) {
    return [
      {
        key: 'tr.m1',
        kind: 'marketing',
        required: false,
        text: 'trial.consent.iysEmail',
        basis: 'Law 6563 + Regulation art. 7: prior approval, unticked, not a condition; İYS',
      },
      {
        key: 'tr.m2',
        kind: 'marketing',
        required: false,
        text: 'trial.consent.trMarketing',
        basis: 'KVKK explicit consent for marketing, separate box (Board Decision 2025/1072)',
      },
    ];
  }
  return [
    {
      key: 'any.marketing',
      kind: 'marketing',
      required: false,
      text: 'trial.consent.marketingEmail',
      basis: 'ePrivacy / PECR, Israel §30A, Qatar, PDPO Part 6A, PIPA, Singapore (e-mail only, no calls/SMS)',
    },
  ];
}

/** Shown to everyone, recorded as shown; not a consent. */
export const CAPACITY_BLOCK: ConsentBlockDef = {
  key: 'any.capacity',
  kind: 'notice',
  required: false,
  text: 'trial.consent.capacity',
  basis: 'Block A: 18 or older, acting for the company (research-legal §1.15)',
};

export interface ConsentBlock extends ConsentBlockDef {
  region: ConsentRegion;
  /** The law named in the sentence ({law}); null when the generic word is used. */
  law: string | null;
  version: string;
}

/**
 * Every block the visitor must see for the countries that apply to them (the one
 * they picked and, when known and different, the one they connect from). Notices
 * of each region come first, then consents, then one set of marketing choices.
 */
export function consentBlocksFor(countries: (string | null | undefined)[]): ConsentBlock[] {
  const regions = [...new Set(countries.filter(Boolean).map(regionOf))];
  if (!regions.length) regions.push('any');
  const seen = new Set<string>();
  const out: ConsentBlock[] = [];
  const add = (def: ConsentBlockDef, region: ConsentRegion) => {
    if (seen.has(def.key)) return;
    seen.add(def.key);
    out.push({ ...def, region, law: LAW_NAME[region], version: CONSENT_VERSION });
  };
  for (const r of regions) for (const d of CONSENT_RULES[r]) if (d.kind === 'notice') add(d, r);
  for (const r of regions) for (const d of CONSENT_RULES[r]) if (d.kind === 'consent') add(d, r);
  for (const d of marketingBlocks(regions)) add(d, d.key.startsWith('tr.') ? 'tr' : regions[0]);
  add(CAPACITY_BLOCK, regions[0]);
  return out;
}

/** The help page each region's notice opens (Turkey has its own aydınlatma metni). */
const P = 'legal-privacy' as const;
export const NOTICE_PAGE: Record<ConsentRegion, 'legal-kvkk' | 'legal-privacy'> = {
  tr: 'legal-kvkk',
  eu: P,
  ae: P,
  sa: P,
  eg: P,
  qa: P,
  il: P,
  jp: P,
  kr: P,
  cn: P,
  twn: P,
  hk: P,
  sg: P,
  any: P,
};

/**
 * Countries the trial is not offered in: Iran (sanctions); Egypt (fully enforceable since 1 Nov 2026 —
 * licence, DPO, local representative) and mainland China (representative in China) until the owner and
 * a local lawyer decide (research-legal §0). Their rule sets above are ready for when they are taken off.
 */
export const NOT_OFFERED = ['IR', 'EG', 'CN'];

/** ISO 3166-1 alpha-2 codes; names come from Intl.DisplayNames in the reader's language. */
export const COUNTRIES = (
  'AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ ' +
  'DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IQ IS IT JE JM JO JP ' +
  'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ ' +
  'OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ ' +
  'UA UG US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW'
)
  .split(' ')
  .filter((c) => !NOT_OFFERED.includes(c));

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

/** The documents a new company's administrator accepts with a click before the trial opens. DRAFT versions. */
export const AGREEMENTS = {
  terms: { version: '2026-11-19.draft1', docs: 'legal-terms' },
  dpa: { version: '2026-11-19.draft1', docs: 'legal-dpa' },
} as const;
export type AgreementDoc = keyof typeof AGREEMENTS;
export const AGREEMENT_DOCS = Object.keys(AGREEMENTS) as AgreementDoc[];
