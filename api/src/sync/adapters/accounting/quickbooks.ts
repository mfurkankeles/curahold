// QuickBooks Online (Accounting API v3), read only: customers, invoices and
// payments, through the query endpoint. Signed in with Intuit (OAuth 2.0, the
// accounting scope); the company ("realm") chosen at sign-in is the one
// connected. Intuit allows 500 requests a minute per company and meters reads
// above the free developer tier, so pages are large (1,000 rows) and only what
// changed since the last run is asked for.
import { currency, day, num, type FinCustomer, type FinInvoice, type FinKind, type FinPayment } from '../../../../../shared/src/accounting';
import { call, codeGrant, CrmError, oneShotCtx, refreshGrant, type CrmCtx } from '../types';
import { accountingAdapter, isoOf, str } from './common';

const TOKEN = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const MINOR = '75';
const MAX = 1000;
const ENTITY: Record<FinKind, string> = { customers: 'Customer', invoices: 'Invoice', payments: 'Payment' };

const host = (config: Record<string, any>) => (config.sandbox ? 'https://sandbox-quickbooks.api.intuit.com' : 'https://quickbooks.api.intuit.com');

async function query(ctx: CrmCtx, kind: FinKind, since: string | null, start: number) {
  const where = since ? ` WHERE MetaData.LastUpdatedTime >= '${since.slice(0, 19)}Z'` : '';
  const q = `SELECT * FROM ${ENTITY[kind]}${where} ORDERBY MetaData.LastUpdatedTime STARTPOSITION ${start} MAXRESULTS ${MAX}`;
  const u = new URL(`${host(ctx.config)}/v3/company/${encodeURIComponent(String(ctx.config.realmId))}/query`);
  u.searchParams.set('query', q);
  u.searchParams.set('minorversion', MINOR);
  const j = await call(ctx, u.toString());
  return (j?.QueryResponse?.[ENTITY[kind]] ?? []) as any[];
}

export const quickbooks = accountingAdapter({
  provider: 'quickbooks',
  accounting: { perMinute: 300 },
  oauth: {
    authorizeUrl(client, redirectUri, state) {
      const u = new URL('https://appcenter.intuit.com/connect/oauth2');
      u.searchParams.set('client_id', client.clientId);
      u.searchParams.set('response_type', 'code');
      u.searchParams.set('scope', 'com.intuit.quickbooks.accounting');
      u.searchParams.set('redirect_uri', redirectUri);
      u.searchParams.set('state', state);
      return u.toString();
    },
    async exchange(fetcher, client, code, redirectUri, opts, now) {
      const realmId = (opts.realmId ?? '').trim();
      if (!/^\d{1,30}$/.test(realmId)) throw new CrmError('QuickBooks did not say which company was chosen', 400);
      const j = await codeGrant(fetcher, TOKEN, client, code, redirectUri, now, true);
      const config = { realmId, sandbox: opts.sandbox === '1' };
      const info = await call(oneShotCtx(fetcher, now, j.access_token, config), `${host(config)}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=${MINOR}`);
      return {
        secret: { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: j.expiresAt },
        config,
        label: str(info?.CompanyInfo?.CompanyName) ?? 'QuickBooks',
        instanceId: realmId,
      };
    },
  },

  async refresh(ctx, secret, client) {
    if (!secret.refreshToken) throw new CrmError('Reconnect QuickBooks', 401, undefined, true);
    return refreshGrant(ctx.fetch, TOKEN, client, secret.refreshToken, ctx.now(), {}, true);
  },

  async finance(ctx, kind, { since, cursor }) {
    const start = Number(cursor ?? 1);
    const list = await query(ctx, kind, since, start);
    const next = list.length >= MAX ? String(start + MAX) : null;
    if (kind === 'customers') {
      const rows = list.map(
        (c): FinCustomer => ({
          remoteId: String(c.Id),
          name: str(c.CompanyName) ?? str(c.DisplayName) ?? String(c.Id),
          taxId: str(c.PrimaryTaxIdentifier) ?? str(c.BusinessNumber),
          email: str(c.PrimaryEmailAddr?.Address),
          website: str(c.WebAddr?.URI),
          currency: currency(c.CurrencyRef?.value),
          balance: c.Balance === undefined ? null : num(c.Balance),
          modifiedAt: isoOf(c.MetaData?.LastUpdatedTime),
        }),
      );
      return { rows, next };
    }
    if (kind === 'invoices') {
      const rows = list.map((i): FinInvoice => {
        const balance = num(i.Balance);
        return {
          remoteId: String(i.Id),
          customerId: str(i.CustomerRef?.value),
          number: str(i.DocNumber),
          issuedOn: day(i.TxnDate),
          dueOn: day(i.DueDate),
          currency: currency(i.CurrencyRef?.value),
          total: num(i.TotalAmt),
          balance,
          status: balance > 0 ? 'open' : 'paid',
          modifiedAt: isoOf(i.MetaData?.LastUpdatedTime),
        };
      });
      return { rows, next };
    }
    const rows = list.map(
      (p): FinPayment => ({
        remoteId: String(p.Id),
        customerId: str(p.CustomerRef?.value),
        invoiceId: str(p.Line?.[0]?.LinkedTxn?.find((t: any) => t.TxnType === 'Invoice')?.TxnId),
        paidOn: day(p.TxnDate),
        amount: num(p.TotalAmt),
        currency: currency(p.CurrencyRef?.value),
        modifiedAt: isoOf(p.MetaData?.LastUpdatedTime),
      }),
    );
    return { rows, next };
  },

  url(_config, object, id) {
    return object === 'invoices' ? `https://app.qbo.intuit.com/app/invoice?txnId=${encodeURIComponent(id)}` : null;
  },
});
