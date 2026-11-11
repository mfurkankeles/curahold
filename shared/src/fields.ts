// Account field values: what people type or import ("1.250,50 ₺",
// "05.03.2027", "Riskli") turned into clean values. Shared so the import
// preview shows exactly what will be saved.
import type { Locale } from './i18n';
import type { AccountField, Localized } from './model';

export type FieldValue = string | number | null;

export function parseNumber(raw: string, locale: Locale): number | null {
  let s = raw.trim().replace(/[\s '’]/g, '').replace(/[^\d.,\-]/g, '');
  if (!s || !/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // Both used: the last one is the decimal separator.
    const dec = lastDot > lastComma ? '.' : ',';
    s = s.split(dec === '.' ? ',' : '.').join('').replace(dec, '.');
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.';
    const parts = s.split(sep);
    const looksThousands = parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3);
    // "1.250" is 1250 in Turkish and 1.25 in English; "1,250" the other way round.
    const thousandsSep = locale === 'tr' ? '.' : ',';
    if (parts.length > 2 || (looksThousands && sep === thousandsSep)) s = parts.join('');
    else s = parts.join('.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const pad = (n: number) => String(n).padStart(2, '0');

function validYmd(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parseDate(raw: string, locale: Locale): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return validYmd(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/.exec(s);
  if (m) return validYmd(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    if (a > 12) return validYmd(y, b, a);
    if (b > 12) return validYmd(y, a, b);
    return locale === 'tr' ? validYmd(y, b, a) : validYmd(y, a, b);
  }
  return null;
}

const fold = (s: string) =>
  s
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .trim();

export function labelOf(l: Localized | undefined, locale: Locale): string {
  return l?.[locale] ?? l?.en ?? l?.tr ?? '';
}

export function optionKey(label: string): string {
  return fold(label).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'option';
}

/** Turns raw input into the stored value, or reports why it cannot. */
export function normalizeValue(field: AccountField, raw: unknown, locale: Locale): { value: FieldValue } | { error: string } {
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) return { value: null };
  const s = String(raw).trim();
  switch (field.type) {
    case 'text':
      return { value: s.slice(0, 500) };
    case 'number':
    case 'money': {
      const n = typeof raw === 'number' ? raw : parseNumber(s, locale);
      return n === null ? { error: 'number' } : { value: n };
    }
    case 'date': {
      const d = parseDate(s, locale);
      return d ? { value: d } : { error: 'date' };
    }
    case 'select': {
      const f = fold(s);
      const opt = (field.options ?? []).find((o) => o.key === s || fold(o.key) === f || Object.values(o.label).some((l) => l && fold(l) === f));
      return opt ? { value: opt.key } : { error: 'option' };
    }
    case 'url': {
      const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
      try {
        const u = new URL(withScheme);
        return u.hostname.includes('.') ? { value: u.toString().slice(0, 500) } : { error: 'url' };
      } catch {
        return { error: 'url' };
      }
    }
    case 'email':
      return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? { value: s.toLowerCase().slice(0, 254) } : { error: 'email' };
    default:
      return { error: 'type' };
  }
}

/** Header names people use for the built-in columns, in both languages. */
export const HEADER_HINTS: Record<string, RegExp> = {
  name: /^(name|account|account name|company|company name|customer|customer name|client|organi[sz]ation|firma|firma adı|şirket|şirket adı|müşteri|müşteri adı|hesap|hesap adı|marka|unvan)$/i,
  owner: /^(owner|account owner|csm|am|account manager|manager|rep|sorumlu|hesap sorumlusu|müşteri temsilcisi|temsilci|yönetici|owner email|sahibi)$/i,
  team: /^(team|ekip|takım|department|departman)$/i,
  externalId: /^(id|account id|external id|crm id|record id|kayıt no|müşteri no|hesap no|kod|müşteri kodu)$/i,
};

export function guessFieldType(values: string[], locale: Locale): AccountField['type'] {
  const sample = values.map((v) => v.trim()).filter(Boolean).slice(0, 50);
  if (!sample.length) return 'text';
  const all = (fn: (v: string) => boolean) => sample.every(fn);
  if (all((v) => parseDate(v, locale) !== null)) return 'date';
  if (all((v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v))) return 'email';
  if (all((v) => /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(v) && !/^\d/.test(v))) return 'url';
  if (all((v) => /[₺$€£]|\b(TRY|USD|EUR|GBP|TL)\b/i.test(v) && parseNumber(v, locale) !== null)) return 'money';
  if (all((v) => parseNumber(v, locale) !== null && /^[\d\s.,\-]+$/.test(v))) return 'number';
  const distinct = new Set(sample.map((v) => fold(v)));
  if (distinct.size <= Math.min(8, Math.max(2, Math.floor(sample.length / 2)))) return 'select';
  return 'text';
}
