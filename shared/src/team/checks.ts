// Output checks: what an agent wrote is read by code before it reaches the
// owner's approval queue (and before it is stored as a chat reply or a log
// line). Secrets and other companies' data block the item; personal data,
// competitor names, unproven claims and unknown links flag it (the card shows
// why). The rules are code — no model is called.

export type FindingRule = 'secret' | 'cross-company' | 'competitor' | 'pii' | 'unproven-claim' | 'unknown-link';
export interface Finding {
  rule: FindingRule;
  severity: 'block' | 'flag';
  /** What matched, shortened and masked (never the whole secret). */
  sample: string;
}

const SECRET = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|\bsk[_-](live|test|ant)[_-][A-Za-z0-9_-]{10,}|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{20,}|\bxox[abpr]-[A-Za-z0-9-]{10,}|\bag_[a-z0-9-]+_[A-Za-z0-9_-]{20,}|\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|\b(password|parola|şifre|api[_ -]?key)\s*[:=]\s*\S{6,})/i;
const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE = /(?<![\w+])(\+?\d[\d ().-]{8,}\d)(?![\w])/g;
const IBAN = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b/g;
const DIGITS11 = /\b[1-9]\d{10}\b/g;
const CARD = /\b(?:\d[ -]?){13,19}\b/g;
const URL = /\bhttps?:\/\/([a-z0-9.-]+)/gi;
const CLAIM = /(world['’]?s (best|fastest|leading)|#1\b|number one|best[- ]in[- ]class|guaranteed|100 ?% (secure|uptime|accurate)|dünyanın en (iyi|hızlı)|piyasanın en|garantili|%100 (güvenli|doğru))/i;
const PERCENT = /\b\d{1,3}(?:[.,]\d+)? ?%|%\d{1,3}/;
const SOURCE = /(source|kaynak|ölçüm|measured|https?:\/\/)/i;

const mask = (s: string) => (s.length <= 6 ? '***' : `${s.slice(0, 3)}…${s.slice(-2)}`);

/** Turkish national id: 11 digits with two check digits. */
function isTrId(s: string): boolean {
  const d = s.split('').map(Number);
  if (d.length !== 11 || d[0] === 0) return false;
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  return (odd * 7 - even) % 10 === d[9] && (d.slice(0, 10).reduce((a, b) => a + b, 0) % 10) === d[10];
}
function luhn(s: string): boolean {
  const d = s.replace(/\D/g, '');
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

const fold = (s: string) => s.toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[̀-ͯ]/g, '');

export interface CheckOptions {
  /** Competitor names (configuration, never in code). */
  blockedNames?: string[];
  /** Customer company names known to the installation (cross-company check). */
  companyNames?: string[];
  /** Hosts links may point to without a flag. */
  knownHosts?: string[];
  /** Addresses that are allowed (the company's own). */
  ownDomains?: string[];
}

/**
 * The AI team's output checks over texts: secrets, personal data, competitor names, other companies' names, unknown
 * links and unproven claims. Returns findings with severity; the gate refuses anything with a block (ADR 0011).
 */
export function screen(texts: (string | null | undefined)[], o: CheckOptions = {}): Finding[] {
  const text = texts.filter(Boolean).join('\n');
  const out: Finding[] = [];
  const add = (rule: FindingRule, severity: Finding['severity'], sample: string) => {
    if (!out.some((f) => f.rule === rule && f.sample === sample)) out.push({ rule, severity, sample });
  };
  const sec = SECRET.exec(text);
  if (sec) add('secret', 'block', mask(sec[0]));

  const own = (o.ownDomains ?? []).map(fold);
  for (const m of text.match(EMAIL) ?? []) if (!own.some((d) => fold(m).endsWith(`@${d}`) || fold(m).endsWith(`.${d}`))) add('pii', 'flag', mask(m));
  for (const m of text.match(IBAN) ?? []) add('pii', 'flag', mask(m.replace(/ /g, '')));
  for (const m of text.match(DIGITS11) ?? []) if (isTrId(m)) add('pii', 'block', mask(m));
  for (const m of text.match(CARD) ?? []) if (luhn(m)) add('pii', 'block', mask(m.replace(/\D/g, '')));
  for (const m of text.match(PHONE) ?? []) if (m.replace(/\D/g, '').length >= 10 && m.replace(/\D/g, '').length <= 15 && !luhn(m)) add('pii', 'flag', mask(m.replace(/\D/g, '')));

  const folded = fold(text);
  for (const n of o.blockedNames ?? []) if (n.trim() && new RegExp(`(^|[^\\p{L}\\p{N}])${fold(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'u').test(folded)) add('competitor', 'flag', n);

  const companies = new Set<string>();
  for (const n of o.companyNames ?? []) if (n.trim().length >= 3 && folded.includes(fold(n))) companies.add(n);
  if (companies.size > 1) add('cross-company', 'block', [...companies].slice(0, 3).join(', '));

  const claim = CLAIM.exec(text);
  if (claim) add('unproven-claim', 'flag', claim[0]);
  else if (PERCENT.test(text) && /\b(faster|increase|artır|hızl|more|daha)\b/i.test(text) && !SOURCE.test(text)) add('unproven-claim', 'flag', (PERCENT.exec(text) ?? [''])[0]);

  const known = (o.knownHosts ?? []).map((h) => h.toLowerCase());
  for (const m of text.matchAll(URL)) {
    const host = m[1].toLowerCase();
    if (!known.some((k) => host === k || host.endsWith(`.${k}`))) add('unknown-link', 'flag', host);
  }
  return out;
}

/** Whether any finding blocks. */
export const blocks = (f: Finding[]) => f.some((x) => x.severity === 'block');
