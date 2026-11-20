// Stripe, read only: customers, invoices (with what is still owed and when it was due) and the payments made on
// them. Connected with a restricted key (rk_live_… or rk_test_…) the administrator creates in the Stripe Dashboard
// with Read on Customers, Invoices and Events and None on everything else, so the key cannot move money even if it
// leaked; a full secret key (sk_…) is refused for that reason. Stripe allows 100 requests a second in live mode and
// 25 in a sandbox (429 with a Stripe-Rate-Limited-Reason header beyond them) and asks reads to stay near 500 per
// transaction; Curahold reads a page of 100 at a time and only what changed after the first read.
//
// Lists are newest first with `starting_after`; changes are read from the Events list (customer.* and invoice.*,
// which Stripe keeps 30 days): a run more than 25 days after the last one reads everything again. Amounts are in the
// currency's smallest unit; zero- and three-decimal currencies are divided accordingly. A paid invoice brings its
// payment (paymentsWithInvoices). Stripe's own "uncollectible" stays owed (open) here, so the late signal sees it.
import { currency, day, num, type FinCustomer, type FinInvoice, type FinInvoiceStatus, type FinPayment } from '../../../../../shared/src/accounting';
import { call, CrmError, errorText, oneShotCtx, type CrmCtx } from '../types';
import { accountingAdapter, str } from './common';

const API = 'https://api.stripe.com/v1';
/** Pinned so every account answers in the same shape whatever its default version. */
const VERSION = '2024-06-20';
const PAGE = 100;
const EVENT_DAYS = 25;
const ZERO_DECIMAL = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']);
const THREE_DECIMAL = new Set(['bhd', 'jod', 'kwd', 'omr', 'tnd']);

/** Stripe's smallest unit to the amount people read. */
export const major = (amount: unknown, cur: unknown) => {
  const c = String(cur ?? '').toLowerCase();
  return num(amount) / (ZERO_DECIMAL.has(c) ? 1 : THREE_DECIMAL.has(c) ? 1000 : 100);
};
const at = (s: unknown) => (typeof s === 'number' && s > 0 ? new Date(s * 1000).toISOString() : null);

const get = (ctx: CrmCtx, path: string) => call(ctx, `${API}${path}`, { headers: { 'stripe-version': VERSION } });

function statusOf(s: unknown, owed: number): FinInvoiceStatus {
  if (s === 'void') return 'void';
  if (s === 'draft') return 'draft';
  if (s === 'paid') return 'paid';
  return owed > 0 ? 'open' : 'paid';
}

const toCustomer = (c: any): FinCustomer => ({
  remoteId: String(c.id),
  name: str(c.name) ?? str(c.email) ?? String(c.id),
  // Stripe keeps tax ids in a separate list; the first one, when the list came with the customer.
  taxId: str(c.tax_ids?.data?.[0]?.value),
  email: str(c.email),
  website: null,
  currency: currency(c.currency),
  balance: null,
  modifiedAt: at(c.created),
});
function toInvoice(i: any): FinInvoice {
  const owed = i.status === 'void' || i.status === 'draft' ? 0 : major(i.amount_remaining, i.currency);
  return {
    remoteId: String(i.id),
    customerId: typeof i.customer === 'string' ? i.customer : (i.customer?.id ?? null),
    number: str(i.number),
    issuedOn: day(at(i.status_transitions?.finalized_at ?? i.created)),
    dueOn: day(at(i.due_date)),
    currency: currency(i.currency),
    total: major(i.total, i.currency),
    balance: owed,
    status: statusOf(i.status, owed),
    modifiedAt: at(i.status_transitions?.paid_at ?? i.status_transitions?.voided_at ?? i.status_transitions?.finalized_at ?? i.created),
  };
}
const toPayment = (i: any): FinPayment | null =>
  num(i.amount_paid) > 0
    ? { remoteId: `${i.id}:paid`, customerId: typeof i.customer === 'string' ? i.customer : (i.customer?.id ?? null), invoiceId: String(i.id), paidOn: day(at(i.status_transitions?.paid_at)), amount: major(i.amount_paid, i.currency), currency: currency(i.currency), modifiedAt: at(i.status_transitions?.paid_at) }
    : null;

export const stripe = accountingAdapter({
  provider: 'stripe',
  // 25 a second is the sandbox's ceiling and every endpoint's own; a tenth of it is plenty for reading.
  accounting: { perMinute: 150, paymentsWithInvoices: true },
  keyed: {
    async connect(fetcher, values, now) {
      const key = (values.key ?? '').trim();
      if (/^sk_(live|test)_/.test(key)) throw new CrmError('Use a restricted key (rk_…) with Read access only, not the secret key', 400);
      if (!/^rk_(live|test)_[A-Za-z0-9]{16,}$/.test(key)) throw new CrmError('Paste a Stripe restricted key: it starts with rk_live_ or rk_test_', 400);
      const ctx = oneShotCtx(fetcher, now, key, {});
      // Each read the connection needs, so a missing permission is named now rather than at the first run.
      for (const [what, path] of [['Customers', '/customers?limit=1'], ['Invoices', '/invoices?limit=1'], ['Events', '/events?limit=1']] as const) {
        try {
          await get(ctx, path);
        } catch (e) {
          if (e instanceof CrmError && e.status === 403) throw new CrmError(`Give the key Read on ${what} in the Stripe Dashboard`, 403);
          throw e;
        }
      }
      // The account's name is optional: a key without that permission still connects.
      let account: any = null;
      const res = await fetcher(`${API}/account`, { headers: { authorization: `Bearer ${key}`, 'stripe-version': VERSION } });
      if (res.ok) account = await res.json();
      else await errorText(res);
      const live = key.startsWith('rk_live_');
      return {
        secret: { accessToken: key },
        config: { live },
        label: `${str(account?.settings?.dashboard?.display_name) ?? str(account?.business_profile?.name) ?? 'Stripe'}${live ? '' : ' (test)'}`,
        instanceId: str(account?.id) ?? `rk:${key.slice(-8)}`,
      };
    },
  },
  // Restricted keys do not expire; a rolled or deleted one has to be replaced (reconnect).
  async refresh(_ctx, secret) {
    if (!secret.accessToken) throw new CrmError('Reconnect Stripe', 401, undefined, true);
    return secret;
  },

  async finance(ctx, kind, { since, cursor }) {
    if (kind === 'payments') return { rows: [], next: null };
    const after = cursor ? `&starting_after=${encodeURIComponent(cursor)}` : '';
    const recent = since && ctx.now().getTime() - Date.parse(since) < EVENT_DAYS * 86_400_000;
    if (recent) {
      // What changed: the events of the period, newest first; each carries the object as it was then, so only the
      // newest of each id counts.
      const j = await get(ctx, `/events?type=${kind === 'customers' ? 'customer.*' : 'invoice.*'}&created[gte]=${Math.floor(Date.parse(since!) / 1000)}&limit=${PAGE}${after}`);
      const seen = new Set<string>();
      const objects: any[] = [];
      for (const e of j?.data ?? []) {
        const o = e.data?.object;
        if (!o?.id || seen.has(o.id) || (kind === 'customers' && e.type === 'customer.deleted')) continue;
        seen.add(o.id);
        objects.push(o);
      }
      const next = j?.has_more && j.data?.length ? String(j.data[j.data.length - 1].id) : null;
      return kind === 'customers' ? { rows: objects.map(toCustomer), next } : { rows: objects.map(toInvoice), payments: objects.map(toPayment).filter((p): p is FinPayment => !!p), next };
    }
    const j = await get(ctx, `/${kind}?limit=${PAGE}${after}`);
    const list: any[] = j?.data ?? [];
    const next = j?.has_more && list.length ? String(list[list.length - 1].id) : null;
    if (kind === 'customers') return { rows: list.filter((c) => !c.deleted).map(toCustomer), next };
    return { rows: list.map(toInvoice), payments: list.map(toPayment).filter((p): p is FinPayment => !!p), next };
  },

  url(config, object, id) {
    const base = `https://dashboard.stripe.com${config.live === false ? '/test' : ''}`;
    if (object === 'invoices') return `${base}/invoices/${encodeURIComponent(id)}`;
    if (object === 'customers') return `${base}/customers/${encodeURIComponent(id)}`;
    return null;
  },
});
