// Accounting programs, read only: who owes what. Customers, invoices and
// payments come from the company's accounting program and are matched to
// Curahold's customers, so the customer page can show the open balance, what
// is overdue and the last payment, and the health score can count a late
// payment. Nothing is ever written back. Shared so the screens and the server
// match and sum the same way.
import { foldText } from './text';

/** Programs with an open, documented API, in the order they were built (research: Middle East first, then the Far East). */
export const ACCOUNTING_PROVIDERS = ['zohobooks', 'xero', 'odoo', 'freee', 'parasut', 'quickbooks', 'stripe'] as const;
export type AccountingApiProvider = (typeof ACCOUNTING_PROVIDERS)[number];
/** Every other program: a file in the template's columns, exported from the program and uploaded. */
export const ACCOUNTING_FILE = 'finfile' as const;
export type AccountingProvider = AccountingApiProvider | typeof ACCOUNTING_FILE;
export const ACCOUNTING_ALL: readonly AccountingProvider[] = [...ACCOUNTING_PROVIDERS, ACCOUNTING_FILE];
/** Whether a provider is an accounting program (its figures are read only, never written). */
export const isAccounting = (p: string): p is AccountingProvider => (ACCOUNTING_ALL as readonly string[]).includes(p);

export type FinKind = 'customers' | 'invoices' | 'payments';
export const FIN_KINDS: FinKind[] = ['customers', 'invoices', 'payments'];

export interface FinCustomer {
  remoteId: string;
  name: string;
  taxId: string | null;
  email: string | null;
  website: string | null;
  currency: string | null;
  /** What the customer owes in total, as the program says (may be absent: then it is the sum of open invoices). */
  balance: number | null;
  modifiedAt: string | null;
}

export type FinInvoiceStatus = 'open' | 'paid' | 'void' | 'draft';

export interface FinInvoice {
  remoteId: string;
  customerId: string | null;
  number: string | null;
  issuedOn: string | null;
  dueOn: string | null;
  currency: string | null;
  total: number;
  /** Still to be paid. */
  balance: number;
  status: FinInvoiceStatus;
  modifiedAt: string | null;
}

export interface FinPayment {
  remoteId: string;
  customerId: string | null;
  invoiceId: string | null;
  paidOn: string | null;
  amount: number;
  currency: string | null;
  modifiedAt: string | null;
}

export type FinRow = FinCustomer | FinInvoice | FinPayment;

// ------------------------------------------------------------- cleaning up

/** A number out of whatever the program sends ("1.234,50" is not guessed at: programs send plain decimals). */
export function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim().replace(/\s/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** YYYY-MM-DD, or null. */
export function day(v: unknown): string | null {
  if (typeof v !== 'string' && !(v instanceof Date)) return null;
  const s = v instanceof Date ? v.toISOString() : v.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // Xero's "/Date(1700000000000+0000)/"
  const ms = /\/Date\((-?\d+)/.exec(s);
  if (ms) return new Date(Number(ms[1])).toISOString().slice(0, 10);
  return null;
}

/** ISO 4217, upper-case; the Turkish lira's old code is read as today's. */
export function currency(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const c = v.trim().toUpperCase();
  if (c === 'TRL' || c === 'TL') return 'TRY';
  return /^[A-Z]{3}$/.test(c) ? c : null;
}

const PUBLIC_MAIL = /^(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|aol|proton|protonmail|yandex|mail|gmx|qq|163|126|naver|daum|hanmail)\./;

/** The web domain a customer is known by, from a web address or an email; public mail services do not count. */
export function domainOf(v: string | null | undefined): string | null {
  if (!v) return null;
  let s = v.trim().toLowerCase();
  if (!s) return null;
  if (s.includes('@')) s = s.slice(s.lastIndexOf('@') + 1);
  s = s.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').replace(/[/:?#].*$/, '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s) || PUBLIC_MAIL.test(s)) return null;
  return s;
}

/**
 * A tax number to compare: letters and digits only, a two-letter country prefix dropped (VAT style,
 * "TR1234567890"), and Japan's qualified-invoice "T" before the 13-digit corporate number dropped.
 */
export function taxKey(v: string | null | undefined): string | null {
  if (!v) return null;
  let s = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^[A-Z]{2}\d{6,}$/.test(s)) s = s.slice(2);
  if (/^T\d{13}$/.test(s)) s = s.slice(1);
  return s.length >= 5 ? s : null;
}

// Company-form words that differ between two systems for the same customer.
const LEGAL = new Set(
  [
    'ltd', 'llc', 'inc', 'incorporated', 'corp', 'corporation', 'co', 'company', 'plc', 'gmbh', 'ag', 'sa', 'sas', 'sarl', 'bv', 'nv', 'srl', 'spa', 'pte', 'pty', 'kk',
    'as', 'a.s', 'sti', 'şti', 'tic', 'san', 've', 'anonim', 'sirketi', 'şirketi', 'limited', 'fze', 'fzco', 'fz', 'wll', 'est', 'establishment', 'llp', 'lp', 'oy', 'ab',
  ].map((w) => foldText(w)),
);
const LEGAL_CJK = /(株式会社|有限会社|合同会社|\(株\)|（株）|有限公司|股份有限公司|주식회사|\(주\))/g;

/** A name to compare: folded, punctuation and company-form words removed. */
export function nameKey(v: string | null | undefined): string | null {
  if (!v) return null;
  const words = foldText(v.replace(LEGAL_CJK, ' ').replace(/\./g, ''))
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((w) => w && !LEGAL.has(w));
  const s = words.join(' ').trim();
  return s.length >= 2 ? s : null;
}

// ------------------------------------------------------------- matching

export type MatchReason = 'tax' | 'domain' | 'name';

export interface MatchTarget {
  id: string;
  name: string;
  taxIds: string[];
  /** Web addresses and email addresses kept on the customer. */
  webs: string[];
}

export interface MatchResult {
  accountId: string | null;
  reason: MatchReason | null;
  /** More than one customer fits: an administrator picks. */
  candidates: string[];
}

/**
 * The Curahold customer an accounting customer is, if exactly one fits: the tax number first (the
 * surest), then the web domain, then the name. Two customers that fit equally are not guessed between.
 */
export function matcher(targets: MatchTarget[]): (c: Pick<FinCustomer, 'name' | 'taxId' | 'email' | 'website'>) => MatchResult {
  const by = { tax: new Map<string, Set<string>>(), domain: new Map<string, Set<string>>(), name: new Map<string, Set<string>>() };
  const put = (m: Map<string, Set<string>>, k: string | null, id: string) => {
    if (!k) return;
    const set = m.get(k) ?? new Set<string>();
    set.add(id);
    m.set(k, set);
  };
  for (const t of targets) {
    for (const x of t.taxIds) put(by.tax, taxKey(x), t.id);
    for (const w of t.webs) put(by.domain, domainOf(w), t.id);
    put(by.name, nameKey(t.name), t.id);
  }
  return (c) => {
    const tries: [MatchReason, string | null][] = [
      ['tax', taxKey(c.taxId)],
      ['domain', domainOf(c.website)],
      ['domain', domainOf(c.email)],
      ['name', nameKey(c.name)],
    ];
    let candidates: string[] = [];
    for (const [reason, key] of tries) {
      if (!key) continue;
      const hit = by[reason].get(key);
      if (!hit?.size) continue;
      if (hit.size === 1) return { accountId: [...hit][0], reason, candidates: [] };
      if (!candidates.length) candidates = [...hit].slice(0, 5);
    }
    return { accountId: null, reason: null, candidates };
  };
}

// ------------------------------------------------------------- the figures

export interface FinanceFigures {
  currency: string;
  open: number;
  overdue: number;
  /** Days the oldest overdue invoice is past its due date (0 when nothing is overdue). */
  overdueDays: number;
  openInvoices: number;
  overdueInvoices: number;
}

export interface FinanceSummary {
  /** One line per currency, the largest open balance first. */
  byCurrency: FinanceFigures[];
  lastPayment: { on: string; amount: number; currency: string | null } | null;
  /** Days the oldest overdue invoice is late, across currencies: what the health score counts. */
  lateDays: number;
  overdueInvoices: number;
}

const DAY = 86_400_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Sums invoices and payments for one customer, as of `today` (YYYY-MM-DD in the company's time zone). */
export function financeSummary(
  invoices: Pick<FinInvoice, 'dueOn' | 'currency' | 'balance' | 'status'>[],
  payments: Pick<FinPayment, 'paidOn' | 'amount' | 'currency'>[],
  today: string,
  fallbackCurrency: string,
): FinanceSummary {
  const cur = new Map<string, FinanceFigures>();
  const now = Date.parse(today);
  for (const i of invoices) {
    if (i.status !== 'open' || !(i.balance > 0)) continue;
    const code = i.currency ?? fallbackCurrency;
    const f = cur.get(code) ?? { currency: code, open: 0, overdue: 0, overdueDays: 0, openInvoices: 0, overdueInvoices: 0 };
    f.open += i.balance;
    f.openInvoices++;
    const due = i.dueOn ? Date.parse(i.dueOn) : NaN;
    if (Number.isFinite(due) && due < now) {
      f.overdue += i.balance;
      f.overdueInvoices++;
      f.overdueDays = Math.max(f.overdueDays, Math.floor((now - due) / DAY));
    }
    cur.set(code, f);
  }
  const byCurrency = [...cur.values()].map((f) => ({ ...f, open: round2(f.open), overdue: round2(f.overdue) })).sort((a, b) => b.open - a.open);
  let last: FinanceSummary['lastPayment'] = null;
  for (const p of payments) if (p.paidOn && p.amount > 0 && (!last || p.paidOn > last.on)) last = { on: p.paidOn, amount: round2(p.amount), currency: p.currency };
  return {
    byCurrency,
    lastPayment: last,
    lateDays: byCurrency.reduce((n, f) => Math.max(n, f.overdueDays), 0),
    overdueInvoices: byCurrency.reduce((n, f) => n + f.overdueInvoices, 0),
  };
}

// ------------------------------------------------------------- file import

/** The columns of the import template, one sheet per kind (or one file with a "type" column). */
export const FILE_COLUMNS: Record<FinKind, string[]> = {
  customers: ['customer_id', 'name', 'tax_id', 'email', 'website', 'currency', 'balance'],
  invoices: ['invoice_id', 'customer_id', 'number', 'issued_on', 'due_on', 'currency', 'total', 'balance', 'status'],
  payments: ['payment_id', 'customer_id', 'invoice_id', 'paid_on', 'amount', 'currency'],
};

const STATUS_WORDS: Record<string, FinInvoiceStatus> = {
  open: 'open', unpaid: 'open', due: 'open', overdue: 'open', partial: 'open', partially_paid: 'open', sent: 'open', authorised: 'open', posted: 'open', acik: 'open', 'açık': 'open', odenmedi: 'open', 'ödenmedi': 'open',
  paid: 'paid', closed: 'paid', settled: 'paid', odendi: 'paid', 'ödendi': 'paid', kapali: 'paid', 'kapalı': 'paid',
  void: 'void', voided: 'void', cancelled: 'void', canceled: 'void', deleted: 'void', iptal: 'void',
  draft: 'draft', taslak: 'draft',
};

/** An invoice status as a person types it in a sheet; unknown words are judged by what is still owed. */
export function statusWord(v: unknown, balance: number): FinInvoiceStatus {
  const w = typeof v === 'string' ? STATUS_WORDS[v.trim().toLowerCase().replace(/\s+/g, '_')] : undefined;
  return w ?? (balance > 0 ? 'open' : 'paid');
}

/** One row of the template, read into the shared shape; null when it has no id. */
export function fileRow(kind: FinKind, r: Record<string, unknown>): FinRow | null {
  const s = (k: string) => (r[k] === null || r[k] === undefined ? null : String(r[k]).trim() || null);
  if (kind === 'customers') {
    const id = s('customer_id');
    if (!id) return null;
    const bal = s('balance');
    return { remoteId: id, name: s('name') ?? id, taxId: s('tax_id'), email: s('email'), website: s('website'), currency: currency(s('currency')), balance: bal === null ? null : num(bal), modifiedAt: null };
  }
  if (kind === 'invoices') {
    const id = s('invoice_id');
    if (!id) return null;
    const total = num(r.total);
    const balance = s('balance') === null ? total : num(r.balance);
    return { remoteId: id, customerId: s('customer_id'), number: s('number'), issuedOn: day(s('issued_on')), dueOn: day(s('due_on')), currency: currency(s('currency')), total, balance, status: statusWord(r.status, balance), modifiedAt: null };
  }
  const id = s('payment_id');
  if (!id) return null;
  return { remoteId: id, customerId: s('customer_id'), invoiceId: s('invoice_id'), paidOn: day(s('paid_on')), amount: num(r.amount), currency: currency(s('currency')), modifiedAt: null };
}
