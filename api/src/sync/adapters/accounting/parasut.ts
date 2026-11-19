// Paraşüt (API v4, JSON:API), read only: customers (contacts of account type
// customer) and sales invoices, with the payments on each invoice. Paraşüt
// gives API access per company through its support: the company receives a
// client id and secret, and connects with those and a Paraşüt user. The user's
// password is used once, to get a renewable key, and is never stored. About ten
// requests every ten seconds; pages hold 25 rows. Paraşüt has no "changed since"
// filter, so every run reads the lists whole (small businesses: a few dozen pages).
import { currency, day, num, type FinCustomer, type FinInvoice, type FinPayment } from '../../../../../shared/src/accounting';
import { call, CrmError, errorText, oneShotCtx, refreshGrant, type CrmCtx } from '../types';
import { accountingAdapter, isoOf, str } from './common';

const API = 'https://api.parasut.com/v4';
const TOKEN = 'https://api.parasut.com/oauth/token';
const SIZE = 25;

const companyOf = (raw: string) => {
  const id = raw.trim();
  if (!/^\d{1,12}$/.test(id)) throw new CrmError('Enter the Paraşüt company number (the number after uygulama.parasut.com/ in the address bar)', 400);
  return id;
};

const get = (ctx: CrmCtx, path: string) => call(ctx, `${API}/${ctx.config.companyId}/${path}`);
const nextOf = (j: any, page: number) => (Number(j?.meta?.total_pages ?? 0) > page ? String(page + 1) : null);

export const parasut = accountingAdapter({
  provider: 'parasut',
  // Paraşüt allows about 10 requests in 10 seconds.
  accounting: { perMinute: 50, paymentsWithInvoices: true },
  keyed: {
    async connect(fetcher, values, now) {
      const companyId = companyOf(values.companyId ?? '');
      const clientId = (values.clientId ?? '').trim();
      const clientSecret = (values.clientSecret ?? '').trim();
      if (!clientId || !clientSecret || !values.username || !values.password) throw new CrmError('Enter every field', 400);
      const res = await fetcher(TOKEN, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams({ grant_type: 'password', client_id: clientId, client_secret: clientSecret, username: values.username.trim(), password: values.password, redirect_uri: 'urn:ietf:wg:oauth:2.0:oob' }),
      });
      if (!res.ok) throw new CrmError(await errorText(res), res.status, undefined, true);
      const j: any = await res.json();
      if (!j.access_token) throw new CrmError('Paraşüt did not return a key', res.status, undefined, true);
      // The company must open with this user.
      await call(oneShotCtx(fetcher, now, j.access_token, { companyId }), `${API}/${companyId}/contacts?page[size]=1`);
      return {
        secret: { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: j.expires_in ? now.getTime() + Number(j.expires_in) * 1000 : undefined, clientId, clientSecret },
        config: { companyId },
        label: `Paraşüt ${companyId}`,
        instanceId: companyId,
      };
    },
  },

  async refresh(ctx, secret) {
    if (!secret.refreshToken || !secret.clientId) throw new CrmError('Reconnect Paraşüt', 401, undefined, true);
    const next = await refreshGrant(ctx.fetch, TOKEN, { clientId: String(secret.clientId), clientSecret: String(secret.clientSecret ?? '') }, secret.refreshToken, ctx.now());
    return { ...next, clientId: secret.clientId, clientSecret: secret.clientSecret };
  },

  async finance(ctx, kind, { cursor }) {
    const page = Number(cursor ?? 1);
    if (kind === 'customers') {
      const j = await get(ctx, `contacts?filter[account_type]=customer&page[number]=${page}&page[size]=${SIZE}`);
      const rows = (j?.data ?? []).map((c: any): FinCustomer => {
        const a = c.attributes ?? {};
        return {
          remoteId: String(c.id),
          name: str(a.name) ?? String(c.id),
          taxId: str(a.tax_number),
          email: str(a.email),
          website: null,
          currency: 'TRY',
          balance: a.trl_balance !== undefined ? num(a.trl_balance) : a.balance !== undefined ? num(a.balance) : null,
          modifiedAt: isoOf(a.updated_at),
        };
      });
      return { rows, next: nextOf(j, page) };
    }
    if (kind === 'invoices') {
      const j = await get(ctx, `sales_invoices?include=payments&page[number]=${page}&page[size]=${SIZE}`);
      const paid = new Map<string, any>();
      for (const inc of j?.included ?? []) if (inc.type === 'payments') paid.set(String(inc.id), inc.attributes ?? {});
      const payments: FinPayment[] = [];
      const rows = (j?.data ?? [])
        .map((i: any): FinInvoice | null => {
          const a = i.attributes ?? {};
          const type = String(a.item_type ?? 'invoice');
          // Quotes and recurring templates are not money owed.
          if (type === 'estimate' || type === 'recurring_invoice' || type === 'recurring_estimate' || type === 'refund') return null;
          const customerId = str(i.relationships?.contact?.data?.id);
          const code = currency(a.currency);
          for (const p of i.relationships?.payments?.data ?? []) {
            const pa = paid.get(String(p.id));
            if (pa) payments.push({ remoteId: String(p.id), customerId, invoiceId: String(i.id), paidOn: day(pa.date), amount: num(pa.amount), currency: currency(pa.currency) ?? code, modifiedAt: isoOf(pa.updated_at) });
          }
          const cancelled = type === 'cancelled' || a.archived === true;
          const balance = cancelled ? 0 : num(a.remaining);
          return {
            remoteId: String(i.id),
            customerId,
            number: str([a.invoice_series, a.invoice_id ?? a.invoice_no].filter(Boolean).join('')) ?? str(a.invoice_no),
            issuedOn: day(a.issue_date),
            dueOn: day(a.due_date),
            currency: code,
            total: num(a.net_total ?? a.gross_total),
            balance,
            status: cancelled ? 'void' : balance > 0 ? 'open' : 'paid',
            modifiedAt: isoOf(a.updated_at),
          };
        })
        .filter((x: FinInvoice | null): x is FinInvoice => !!x);
      return { rows, payments, next: nextOf(j, page) };
    }
    return { rows: [], next: null };
  },

  url(config, object, id) {
    return object === 'invoices' && config.companyId ? `https://uygulama.parasut.com/${config.companyId}/satislar/${encodeURIComponent(id)}` : null;
  },
});
