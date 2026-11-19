// freee 会計 (Accounting API v1), read only: customers (取引先 partners) and
// sales deals (取引, type income) — a deal that is not settled is money still
// owed — with the payments recorded on each deal. Signed in with freee (OAuth
// 2.0); the company chosen at sign-in is the one connected. freee Accounting
// has no separate invoice object for receivables: the deal is the invoice here.
import { day, num, type FinCustomer, type FinInvoice, type FinPayment } from '../../../../../shared/src/accounting';
import { call, codeGrant, CrmError, oneShotCtx, refreshGrant, type CrmCtx } from '../types';
import { accountingAdapter, isoOf, str } from './common';

const API = 'https://api.freee.co.jp/api/1';
const TOKEN = 'https://accounts.secure.freee.co.jp/public_api/token';
const PARTNERS = 3000;
const DEALS = 100;

const get = (ctx: CrmCtx, path: string, params: Record<string, string>) => {
  const u = new URL(`${API}/${path}`);
  u.searchParams.set('company_id', String(ctx.config.companyId));
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return call(ctx, u.toString());
};

export const freee = accountingAdapter({
  provider: 'freee',
  accounting: { perMinute: 50, paymentsWithInvoices: true },
  oauth: {
    authorizeUrl(client, redirectUri, state) {
      const u = new URL('https://accounts.secure.freee.co.jp/public_api/authorize');
      u.searchParams.set('client_id', client.clientId);
      u.searchParams.set('redirect_uri', redirectUri);
      u.searchParams.set('response_type', 'code');
      u.searchParams.set('state', state);
      // Ask which company to connect, rather than taking the person's first one.
      u.searchParams.set('prompt', 'select_company');
      return u.toString();
    },
    async exchange(fetcher, client, code, redirectUri, _opts, now) {
      const j = await codeGrant(fetcher, TOKEN, client, code, redirectUri, now);
      const companies = await call(oneShotCtx(fetcher, now, j.access_token, {}), `${API}/companies`);
      const list: any[] = companies?.companies ?? [];
      const c = list.find((x) => j.company_id && String(x.id) === String(j.company_id)) ?? list[0];
      if (!c?.id) throw new CrmError('No freee company on this account', 404);
      return {
        secret: { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: j.expiresAt },
        config: { companyId: String(c.id) },
        label: str(c.display_name) ?? str(c.name) ?? 'freee',
        instanceId: String(c.id),
      };
    },
  },

  async refresh(ctx, secret, client) {
    if (!secret.refreshToken) throw new CrmError('Reconnect freee', 401, undefined, true);
    return refreshGrant(ctx.fetch, TOKEN, client, secret.refreshToken, ctx.now());
  },

  async finance(ctx, kind, { since, cursor }) {
    const offset = Number(cursor ?? 0);
    if (kind === 'customers') {
      // Partners have no "changed since" filter: they are read whole each time (up to 3,000 a request).
      const j = await get(ctx, 'partners', { offset: String(offset), limit: String(PARTNERS) });
      const list: any[] = j?.partners ?? [];
      const rows = list.map(
        (p): FinCustomer => ({
          remoteId: String(p.id),
          name: str(p.long_name) ?? str(p.name) ?? String(p.id),
          // The qualified-invoice number (T + 13 digits) or the corporate number: either names the company.
          taxId: str(p.invoice_registration_number) ?? str(p.corporate_number),
          email: str(p.email),
          website: null,
          currency: 'JPY',
          balance: null,
          modifiedAt: isoOf(p.update_date),
        }),
      );
      return { rows, next: list.length >= PARTNERS ? String(offset + PARTNERS) : null };
    }
    if (kind === 'invoices') {
      const params: Record<string, string> = { type: 'income', offset: String(offset), limit: String(DEALS) };
      // Deals changed (renewed) on or after that day; the same day again is read twice rather than missed.
      if (since) params.start_renew_date = since.slice(0, 10);
      const j = await get(ctx, 'deals', params);
      const list: any[] = j?.deals ?? [];
      const payments: FinPayment[] = [];
      const rows = list.map((d): FinInvoice => {
        for (const p of d.payments ?? []) {
          payments.push({ remoteId: `${d.id}:${p.id}`, customerId: str(d.partner_id), invoiceId: String(d.id), paidOn: day(p.date), amount: num(p.amount), currency: 'JPY', modifiedAt: isoOf(d.update_date ?? d.renew_date) });
        }
        const balance = num(d.due_amount);
        return {
          remoteId: String(d.id),
          customerId: str(d.partner_id),
          number: str(d.ref_number),
          issuedOn: day(d.issue_date),
          dueOn: day(d.due_date),
          currency: 'JPY',
          total: num(d.amount),
          balance,
          status: d.status === 'settled' || balance <= 0 ? 'paid' : 'open',
          modifiedAt: isoOf(d.update_date ?? d.renew_date),
        };
      });
      return { rows, payments, next: list.length >= DEALS ? String(offset + DEALS) : null };
    }
    return { rows: [], next: null };
  },

  url() {
    return null;
  },
});
