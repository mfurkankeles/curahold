// Odoo (Online, Odoo.sh or self-hosted), read only: customers (res.partner
// with a customer rank, companies only), customer invoices (account.move of
// type out_invoice) and payments received (account.payment, inbound). Connected
// with the company's own address, database, a login and an API key made in
// Odoo (Preferences → Account Security). Odoo 19 and later answer on the JSON-2
// API (/json/2/<model>/<method>, the key as a bearer token); older versions on
// JSON-RPC (/jsonrpc, execute_kw). The connection finds out which at connect
// time. Odoo Online needs the Custom plan for API access (Odoo's own rule).
import { currency, day, num, type FinCustomer, type FinInvoice, type FinKind, type FinPayment } from '../../../../../shared/src/accounting';
import { privateHost } from '../../../connectors/messaging/webhook';
import { CrmError, errorText, type CrmCtx } from '../types';
import { accountingAdapter, isoOf, str } from './common';

const LIMIT = 200;

/** The company's Odoo address: https, a public host, nothing after it. */
export function odooUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    throw new CrmError('Enter the Odoo address, like https://yourcompany.odoo.com', 400);
  }
  if (u.protocol !== 'https:' || u.username || u.password || privateHost(u.hostname)) throw new CrmError('The Odoo address must be a public https address', 400);
  return u.origin;
}

type Transport = { kind: 'json2' } | { kind: 'jsonrpc'; uid: number };

/** One call to an Odoo model (shared with Odoo CRM, adapters/odoocrm.ts). */
export async function send(fetcher: typeof fetch, url: string, db: string, key: string, t: Transport, model: string, method: string, kw: Record<string, unknown>): Promise<any> {
  if (t.kind === 'json2') {
    const res = await fetcher(`${url}/json/2/${model}/${method}`, {
      method: 'POST',
      headers: { authorization: `bearer ${key}`, 'content-type': 'application/json', accept: 'application/json', ...(db ? { 'x-odoo-database': db } : {}) },
      body: JSON.stringify(kw),
    });
    if (res.status === 429 || res.status === 503) throw new CrmError(await errorText(res), res.status, Number(res.headers.get('retry-after') ?? 60));
    if (res.status === 401 || res.status === 403) throw new CrmError(await errorText(res), res.status, undefined, true);
    if (!res.ok) throw new CrmError(await errorText(res), res.status);
    return res.json();
  }
  const { domain, ...rest } = kw;
  const res = await fetcher(`${url}/jsonrpc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: 1, params: { service: 'object', method: 'execute_kw', args: [db, t.uid, key, model, method, domain === undefined ? [] : [domain], rest] } }),
  });
  if (res.status === 429 || res.status === 503) throw new CrmError(await errorText(res), res.status, Number(res.headers.get('retry-after') ?? 60));
  if (!res.ok) throw new CrmError(await errorText(res), res.status);
  const j: any = await res.json();
  if (j?.error) {
    const msg = String(j.error.data?.message ?? j.error.message ?? 'Odoo error').slice(0, 300);
    throw new CrmError(msg, 400, undefined, /access ?denied|session|authenticat/i.test(`${j.error.data?.name ?? ''} ${msg}`));
  }
  return j?.result;
}

const transportOf = (config: Record<string, any>): Transport => (config.transport === 'jsonrpc' ? { kind: 'jsonrpc', uid: Number(config.uid) } : { kind: 'json2' });

/** Calls an Odoo model method over its JSON-RPC (or XML-RPC) API with the connection's database and key. */
export async function odoo(ctx: CrmCtx, model: string, method: string, kw: Record<string, unknown>) {
  return send(ctx.fetch, String(ctx.config.url), String(ctx.config.database ?? ''), await ctx.token(), transportOf(ctx.config), model, method, kw);
}

/** Odoo's "[id, name]" for a link to another record. */
const ref = (v: unknown): { id: string | null; name: string | null } => (Array.isArray(v) && v.length ? { id: String(v[0]), name: v[1] ? String(v[1]) : null } : { id: null, name: null });
/** Odoo writes UTC without a zone. */
const odooTime = (iso: string) => iso.slice(0, 19).replace('T', ' ');

const QUERY: Record<FinKind, { model: string; domain: unknown[]; fields: string[] }> = {
  customers: { model: 'res.partner', domain: [['customer_rank', '>', 0], ['parent_id', '=', false]], fields: ['id', 'name', 'vat', 'email', 'website', 'credit', 'write_date'] },
  invoices: {
    model: 'account.move',
    domain: [['move_type', '=', 'out_invoice'], ['state', 'in', ['posted', 'cancel']]],
    fields: ['id', 'name', 'commercial_partner_id', 'invoice_date', 'invoice_date_due', 'currency_id', 'amount_total', 'amount_residual', 'payment_state', 'state', 'write_date'],
  },
  payments: {
    model: 'account.payment',
    domain: [['payment_type', '=', 'inbound'], ['partner_type', '=', 'customer'], ['state', 'not in', ['draft', 'cancel', 'canceled', 'rejected']]],
    fields: ['id', 'partner_id', 'date', 'amount', 'currency_id', 'write_date'],
  },
};

/** Checks the address, login and key, finds which API this Odoo speaks, and names the company (shared with Odoo CRM). */
export async function odooConnect(fetcher: typeof fetch, values: Record<string, string>) {
  const url = odooUrl(values.url ?? '');
  const db = (values.database ?? '').trim();
  const login = (values.login ?? '').trim();
  const key = (values.apiKey ?? '').trim();
  if (!login || !key) throw new CrmError('Enter the login and the API key', 400);
  let t: Transport = { kind: 'json2' };
  let company: any;
  try {
    company = await send(fetcher, url, db, key, t, 'res.company', 'search_read', { domain: [], fields: ['name'], limit: 1 });
  } catch (e) {
    // Before Odoo 19 there is no JSON-2: sign in over JSON-RPC instead (it needs the database name).
    if (!(e instanceof CrmError) || (e.status !== 404 && e.status !== 405)) throw e;
    if (!db) throw new CrmError('This Odoo needs the database name too', 400);
    const res = await fetcher(`${url}/jsonrpc`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: 1, params: { service: 'common', method: 'authenticate', args: [db, login, key, {}] } }),
    });
    const j: any = await res.json().catch(() => null);
    if (!res.ok || !j || j.error || typeof j.result !== 'number') throw new CrmError('Odoo did not accept the login and API key', 401, undefined, true);
    t = { kind: 'jsonrpc', uid: j.result };
    company = await send(fetcher, url, db, key, t, 'res.company', 'search_read', { domain: [], fields: ['name'], limit: 1 });
  }
  const name = Array.isArray(company) && company[0]?.name ? String(company[0].name) : new URL(url).hostname;
  return {
    secret: { accessToken: key },
    config: { url, database: db, login, transport: t.kind, ...(t.kind === 'jsonrpc' ? { uid: t.uid } : {}) },
    label: name,
    instanceId: `${new URL(url).hostname}/${db}`,
  };
}

export const odooAdapter = accountingAdapter({
  provider: 'odoo',
  // Odoo publishes no hard limit; this stays polite to a small self-hosted server.
  accounting: { perMinute: 120 },
  keyed: {
    connect: (fetcher, values) => odooConnect(fetcher, values),
  },

  // API keys do not expire; one that was revoked has to be replaced (reconnect).
  async refresh(_ctx, secret) {
    if (!secret.accessToken) throw new CrmError('Reconnect Odoo', 401, undefined, true);
    return secret;
  },

  async finance(ctx, kind, { since, cursor }) {
    const offset = Number(cursor ?? 0);
    const q = QUERY[kind];
    const domain = since ? [...q.domain, ['write_date', '>=', odooTime(since)]] : q.domain;
    const list: any[] = (await odoo(ctx, q.model, 'search_read', { domain, fields: q.fields, limit: LIMIT, offset, order: 'write_date asc, id asc' })) ?? [];
    const next = list.length >= LIMIT ? String(offset + LIMIT) : null;
    if (kind === 'customers') {
      const rows = list.map(
        (p): FinCustomer => ({ remoteId: String(p.id), name: str(p.name) ?? String(p.id), taxId: str(p.vat), email: str(p.email), website: str(p.website), currency: null, balance: p.credit === undefined ? null : num(p.credit), modifiedAt: isoOf(p.write_date) }),
      );
      return { rows, next };
    }
    if (kind === 'invoices') {
      const rows = list.map((m): FinInvoice => {
        const cancelled = m.state === 'cancel';
        const paid = ['paid', 'in_payment', 'reversed'].includes(String(m.payment_state));
        const balance = cancelled || paid ? 0 : num(m.amount_residual);
        return {
          remoteId: String(m.id),
          customerId: ref(m.commercial_partner_id).id,
          number: str(m.name),
          issuedOn: day(m.invoice_date),
          dueOn: day(m.invoice_date_due),
          currency: currency(ref(m.currency_id).name),
          total: num(m.amount_total),
          balance,
          status: cancelled ? 'void' : balance > 0 ? 'open' : 'paid',
          modifiedAt: isoOf(m.write_date),
        };
      });
      return { rows, next };
    }
    const rows = list.map(
      (p): FinPayment => ({ remoteId: String(p.id), customerId: ref(p.partner_id).id, invoiceId: null, paidOn: day(p.date), amount: num(p.amount), currency: currency(ref(p.currency_id).name), modifiedAt: isoOf(p.write_date) }),
    );
    return { rows, next };
  },

  url(config, object, id) {
    return object === 'invoices' && config.url ? `${config.url}/web#id=${encodeURIComponent(id)}&model=account.move&view_type=form` : null;
  },
});
