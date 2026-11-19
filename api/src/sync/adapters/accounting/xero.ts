// Xero (Accounting API 2.0), read only: customers (contacts), sales invoices
// (ACCREC) and the payments received on them. Signed in with Xero (OAuth 2.0
// with PKCE, read scopes only); the first organisation the person picks is the
// one connected. Limits per organisation: 60 calls a minute, and a daily
// allowance (1,000 on Xero's free developer tier, 5,000 on paid ones), so a run
// stops before it and the next one carries on.
import { currency, day, num, type FinCustomer, type FinInvoice, type FinInvoiceStatus, type FinPayment } from '../../../../../shared/src/accounting';
import { call, codeGrant, CrmError, oneShotCtx, refreshGrant, type CrmCtx } from '../types';
import { accountingAdapter, isoOf, str } from './common';

/**
 * Read-only scopes. Xero is moving new app registrations to finer-grained scopes
 * (accounting.invoices.read, accounting.payments.read in place of accounting.transactions.read):
 * check the app's registration before going live (INTEGRATIONS.md).
 */
export const XERO_SCOPES = 'openid profile email offline_access accounting.contacts.read accounting.transactions.read';
const API = 'https://api.xero.com/api.xro/2.0';
const TOKEN = 'https://identity.xero.com/connect/token';
const PAGE = 100;

const xero = (ctx: CrmCtx, path: string, since: string | null) =>
  call(ctx, `${API}/${path}`, { headers: { 'xero-tenant-id': String(ctx.config.tenantId), ...(since ? { 'if-modified-since': since.slice(0, 19) } : {}) } });

function statusOf(s: unknown, due: number): FinInvoiceStatus {
  switch (String(s ?? '').toUpperCase()) {
    case 'DRAFT':
    case 'SUBMITTED':
      return 'draft';
    case 'VOIDED':
    case 'DELETED':
      return 'void';
    case 'PAID':
      return 'paid';
    default:
      return due > 0 ? 'open' : 'paid';
  }
}

export const xeroAdapter = accountingAdapter({
  provider: 'xero',
  accounting: { perMinute: 55, perDay: 950 },
  oauth: {
    pkce: true,
    authorizeUrl(client, redirectUri, state, opts) {
      const u = new URL('https://login.xero.com/identity/connect/authorize');
      u.searchParams.set('response_type', 'code');
      u.searchParams.set('client_id', client.clientId);
      u.searchParams.set('redirect_uri', redirectUri);
      u.searchParams.set('scope', XERO_SCOPES);
      u.searchParams.set('state', state);
      if (opts.code_challenge) {
        u.searchParams.set('code_challenge', opts.code_challenge);
        u.searchParams.set('code_challenge_method', 'S256');
      }
      return u.toString();
    },
    async exchange(fetcher, client, code, redirectUri, opts, now) {
      const j = await codeGrant(fetcher, TOKEN, client, code, redirectUri, now, true, opts.code_verifier ? { code_verifier: opts.code_verifier } : {});
      const tenants = await call(oneShotCtx(fetcher, now, j.access_token, {}), 'https://api.xero.com/connections');
      const t = (Array.isArray(tenants) ? tenants : []).find((x: any) => !x.tenantType || x.tenantType === 'ORGANISATION');
      if (!t?.tenantId) throw new CrmError('No Xero organisation was chosen', 404);
      return {
        secret: { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: j.expiresAt },
        config: { tenantId: String(t.tenantId) },
        label: t.tenantName ? String(t.tenantName) : 'Xero',
        instanceId: String(t.tenantId),
      };
    },
  },

  async refresh(ctx, secret, client) {
    if (!secret.refreshToken) throw new CrmError('Reconnect Xero', 401, undefined, true);
    return refreshGrant(ctx.fetch, TOKEN, client, secret.refreshToken, ctx.now(), {}, true);
  },

  async finance(ctx, kind, { since, cursor }) {
    const page = Number(cursor ?? 1);
    const next = (n: number) => (n >= PAGE ? String(page + 1) : null);
    if (kind === 'customers') {
      const j = await xero(ctx, `Contacts?page=${page}&pageSize=${PAGE}&where=${encodeURIComponent('IsCustomer==true')}&order=UpdatedDateUTC`, since);
      const list: any[] = j?.Contacts ?? [];
      const rows = list.map(
        (c): FinCustomer => ({
          remoteId: String(c.ContactID),
          name: str(c.Name) ?? String(c.ContactID),
          taxId: str(c.TaxNumber) ?? str(c.CompanyNumber),
          email: str(c.EmailAddress),
          website: str(c.Website),
          currency: currency(c.DefaultCurrency),
          balance: c.Balances?.AccountsReceivable?.Outstanding === undefined ? null : num(c.Balances.AccountsReceivable.Outstanding),
          modifiedAt: isoOf(c.UpdatedDateUTC),
        }),
      );
      return { rows, next: next(list.length) };
    }
    if (kind === 'invoices') {
      const j = await xero(ctx, `Invoices?page=${page}&pageSize=${PAGE}&where=${encodeURIComponent('Type=="ACCREC"')}&order=UpdatedDateUTC&summaryOnly=true`, since);
      const list: any[] = j?.Invoices ?? [];
      const rows = list.map((i): FinInvoice => {
        const due = num(i.AmountDue);
        const status = statusOf(i.Status, due);
        return {
          remoteId: String(i.InvoiceID),
          customerId: str(i.Contact?.ContactID),
          number: str(i.InvoiceNumber),
          issuedOn: day(i.DateString ?? i.Date),
          dueOn: day(i.DueDateString ?? i.DueDate),
          currency: currency(i.CurrencyCode),
          total: num(i.Total),
          balance: status === 'void' ? 0 : due,
          status,
          modifiedAt: isoOf(i.UpdatedDateUTC),
        };
      });
      return { rows, next: next(list.length) };
    }
    const j = await xero(ctx, `Payments?page=${page}&pageSize=${PAGE}&where=${encodeURIComponent('PaymentType=="ACCRECPAYMENT"')}&order=UpdatedDateUTC`, since);
    const list: any[] = j?.Payments ?? [];
    const rows = list.map(
      (p): FinPayment => ({
        remoteId: String(p.PaymentID),
        customerId: str(p.Invoice?.Contact?.ContactID),
        invoiceId: str(p.Invoice?.InvoiceID),
        paidOn: day(p.Date),
        // A payment removed in Xero stays listed as DELETED: it no longer counts.
        amount: String(p.Status).toUpperCase() === 'DELETED' ? 0 : num(p.Amount),
        currency: currency(p.Invoice?.CurrencyCode ?? p.CurrencyCode),
        modifiedAt: isoOf(p.UpdatedDateUTC),
      }),
    );
    return { rows, next: next(list.length) };
  },

  url(_config, object, id) {
    return object === 'invoices' ? `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${encodeURIComponent(id)}` : null;
  },
});
