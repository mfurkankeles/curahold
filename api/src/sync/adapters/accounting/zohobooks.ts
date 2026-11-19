// Zoho Books (API v3), read only: customers (contacts of type customer),
// invoices and customer payments. Signed in with Zoho (OAuth 2.0, read scopes
// only); Zoho keeps each customer in one data centre (.com, .eu, .in, .com.au,
// .jp, .ca, .sa, .uk, .com.cn) and the sign-in says which, so every call goes
// there. Limit: 100 requests a minute per organisation, and a daily allowance
// by the customer's plan (1,000 on the free plan).
import { currency, day, num, type FinCustomer, type FinInvoice, type FinInvoiceStatus, type FinKind, type FinPayment } from '../../../../../shared/src/accounting';
import { call, codeGrant, CrmError, oneShotCtx, refreshGrant, type CrmCtx } from '../types';
import { zohoAccountsServer } from '../zoho';
import { accountingAdapter, isoOf, str } from './common';

const SCOPES = 'ZohoBooks.contacts.READ,ZohoBooks.invoices.READ,ZohoBooks.customerpayments.READ,ZohoBooks.settings.READ';
const PER_PAGE = 200;

/** Only Zoho's own API hosts are accepted from the token answer. */
export function zohoApiDomain(raw: unknown): string | null {
  try {
    const u = new URL(String(raw));
    return u.protocol === 'https:' && /^www\.zohoapis\.(com|eu|in|com\.au|jp|ca|sa|uk|com\.cn)$/.test(u.hostname) ? `https://${u.hostname}` : null;
  } catch {
    return null;
  }
}

const base = (ctx: CrmCtx) => `${zohoApiDomain(ctx.config.apiDomain) ?? 'https://www.zohoapis.com'}/books/v3`;
const zb = (ctx: CrmCtx, url: string) => call(ctx, url, {}, 'zoho');
/** Zoho's own time format for the changed-since filter: 2026-11-12T09:30:00+0000. */
const zohoTime = (iso: string) => `${iso.slice(0, 19)}+0000`;

function statusOf(s: unknown, balance: number): FinInvoiceStatus {
  const v = String(s ?? '').toLowerCase();
  if (v === 'void') return 'void';
  if (v === 'draft' || v === 'pending_approval' || v === 'approved') return 'draft';
  if (v === 'paid') return 'paid';
  return balance > 0 ? 'open' : 'paid';
}

const PATH: Record<FinKind, string> = { customers: 'contacts', invoices: 'invoices', payments: 'customerpayments' };

export const zohobooks = accountingAdapter({
  provider: 'zohobooks',
  accounting: { perMinute: 90, perDay: 950 },
  oauth: {
    authorizeUrl(client, redirectUri, state) {
      const u = new URL('https://accounts.zoho.com/oauth/v2/auth');
      u.searchParams.set('scope', SCOPES);
      u.searchParams.set('client_id', client.clientId);
      u.searchParams.set('response_type', 'code');
      u.searchParams.set('access_type', 'offline');
      u.searchParams.set('prompt', 'consent');
      u.searchParams.set('redirect_uri', redirectUri);
      u.searchParams.set('state', state);
      return u.toString();
    },
    async exchange(fetcher, client, code, redirectUri, opts, now) {
      const accountsServer = zohoAccountsServer(opts['accounts-server']);
      if (!accountsServer) throw new CrmError('Unknown Zoho data centre');
      const j = await codeGrant(fetcher, `${accountsServer}/oauth/v2/token`, client, code, redirectUri, now);
      const apiDomain = zohoApiDomain(j.api_domain);
      if (!apiDomain) throw new CrmError('Unknown Zoho data centre');
      const orgs = await call(oneShotCtx(fetcher, now, j.access_token, { apiDomain }), `${apiDomain}/books/v3/organizations`, {}, 'zoho');
      const list: any[] = orgs?.organizations ?? [];
      const o = list.find((x) => x.is_default_org) ?? list[0];
      if (!o?.organization_id) throw new CrmError('No Zoho Books organisation on this account', 404);
      return {
        secret: { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: j.expiresAt },
        config: { apiDomain, accountsServer, organizationId: String(o.organization_id) },
        label: o.name ? String(o.name) : 'Zoho Books',
        instanceId: String(o.organization_id),
      };
    },
  },

  async refresh(ctx, secret, client) {
    if (!secret.refreshToken) throw new CrmError('Reconnect Zoho Books', 401, undefined, true);
    return refreshGrant(ctx.fetch, `${zohoAccountsServer(ctx.config.accountsServer) ?? 'https://accounts.zoho.com'}/oauth/v2/token`, client, secret.refreshToken, ctx.now());
  },

  async finance(ctx, kind, { since, cursor }) {
    const page = Number(cursor ?? 1);
    const u = new URL(`${base(ctx)}/${PATH[kind]}`);
    u.searchParams.set('organization_id', String(ctx.config.organizationId));
    u.searchParams.set('page', String(page));
    u.searchParams.set('per_page', String(PER_PAGE));
    u.searchParams.set('sort_column', 'last_modified_time');
    u.searchParams.set('sort_order', 'A');
    if (kind === 'customers') u.searchParams.set('contact_type', 'customer');
    if (since) u.searchParams.set('last_modified_time', zohoTime(since));
    const j = await zb(ctx, u.toString());
    const next = j?.page_context?.has_more_page ? String(page + 1) : null;
    if (kind === 'customers') {
      const rows = (j?.contacts ?? []).map(
        (c: any): FinCustomer => ({
          remoteId: String(c.contact_id),
          name: str(c.company_name) ?? str(c.contact_name) ?? String(c.contact_id),
          taxId: str(c.tax_reg_no) ?? str(c.vat_reg_no) ?? str(c.trn) ?? str(c.gst_no) ?? str(c.tax_id),
          email: str(c.email),
          website: str(c.website),
          currency: currency(c.currency_code),
          balance: c.outstanding_receivable_amount === undefined ? null : num(c.outstanding_receivable_amount),
          modifiedAt: isoOf(c.last_modified_time),
        }),
      );
      return { rows, next };
    }
    if (kind === 'invoices') {
      const rows = (j?.invoices ?? []).map((i: any): FinInvoice => {
        const balance = num(i.balance);
        return {
          remoteId: String(i.invoice_id),
          customerId: str(i.customer_id),
          number: str(i.invoice_number),
          issuedOn: day(i.date),
          dueOn: day(i.due_date),
          currency: currency(i.currency_code),
          total: num(i.total),
          balance,
          status: statusOf(i.status, balance),
          modifiedAt: isoOf(i.last_modified_time),
        };
      });
      return { rows, next };
    }
    const rows = (j?.customerpayments ?? []).map(
      (p: any): FinPayment => ({
        remoteId: String(p.payment_id),
        customerId: str(p.customer_id),
        invoiceId: null,
        paidOn: day(p.date),
        amount: num(p.amount),
        currency: currency(p.currency_code),
        modifiedAt: isoOf(p.last_modified_time),
      }),
    );
    return { rows, next };
  },

  url(config, object, id) {
    const m = /zohoapis\.([a-z.]+)$/.exec(zohoApiDomain(config.apiDomain) ? new URL(config.apiDomain).hostname : '');
    return m && config.organizationId && object === 'invoices' ? `https://books.zoho.${m[1]}/app/${config.organizationId}#/invoices/${encodeURIComponent(id)}` : null;
  },
});
