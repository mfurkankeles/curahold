// Accounting programs, read only. The matching and the sums on their own;
// each adapter against recorded answers shaped like the program's documented
// ones (no live calls); then end to end through the API with Odoo (a key) and
// a file: connect, first run, match review, the customer page's figures, who
// may see them, the health score's late-payment signal, and that nothing is
// ever written to the program.
import { beforeAll, describe, expect, it } from 'vitest';
import { domainOf, fileRow, financeSummary, matcher, nameKey, taxKey } from '../shared/src/accounting';
import { computeHealth, DEFAULT_HEALTH, PAYMENT_SIGNAL } from '../shared/src/health';
import { freee } from '../api/src/sync/adapters/accounting/freee';
import { odooAdapter, odooUrl } from '../api/src/sync/adapters/accounting/odoo';
import { parasut } from '../api/src/sync/adapters/accounting/parasut';
import { quickbooks } from '../api/src/sync/adapters/accounting/quickbooks';
import { xeroAdapter } from '../api/src/sync/adapters/accounting/xero';
import { zohobooks, zohoApiDomain } from '../api/src/sync/adapters/accounting/zohobooks';
import { pacedCtx } from '../api/src/sync/accountingsync';
import { CrmError, type CrmCtx } from '../api/src/sync/adapters/types';
import { Client, login, setup, type Env } from './helpers';

type Call = { method: string; url: string; headers: Headers; body: any };
type Route = [RegExp, (call: Call) => unknown];

function ctxFor(config: Record<string, any>, routes: Route[]) {
  const calls: Call[] = [];
  const ctx: CrmCtx = {
    config,
    now: () => new Date('2026-11-19T10:00:00Z'),
    token: async () => 'tok',
    refresh: async () => 'tok',
    fetch: (async (u: string, init: RequestInit = {}) => {
      const body = typeof init.body === 'string' ? (init.body.startsWith('{') ? JSON.parse(init.body) : init.body) : null;
      const call: Call = { method: init.method ?? 'GET', url: String(u), headers: new Headers(init.headers), body };
      calls.push(call);
      for (const [re, fn] of routes) {
        if (!re.test(`${call.method} ${decodeURIComponent(call.url)}`)) continue;
        const out = fn(call);
        return out instanceof Response ? out : Response.json(out);
      }
      return new Response('no route', { status: 404 });
    }) as typeof fetch,
  };
  return { ctx, calls };
}

describe('matching and sums', () => {
  it('reads tax numbers, domains and names the way two systems differ on them', () => {
    expect(taxKey('TR 123 456 7890')).toBe('1234567890');
    expect(taxKey('1234567890')).toBe('1234567890');
    expect(taxKey('T1234567890123')).toBe('1234567890123');
    expect(taxKey('AE-100234567800003')).toBe('100234567800003');
    expect(taxKey('12')).toBeNull();
    expect(domainOf('https://www.Quillfield.example/about')).toBe('quillfield.example');
    expect(domainOf('billing@quillfield.example')).toBe('quillfield.example');
    expect(domainOf('someone@gmail.com')).toBeNull();
    expect(nameKey('Quillfield Retail Ltd. Şti.')).toBe(nameKey('QUILLFIELD RETAIL'));
    expect(nameKey('株式会社 クイルフィールド')).toBe(nameKey('クイルフィールド'));
    expect(nameKey('Harborline Bank A.Ş.')).toBe('harborline bank');
  });

  it('matches by tax number first, then domain, then name — and never guesses between two', () => {
    const m = matcher([
      { id: 'a1', name: 'Quillfield Retail', taxIds: ['1234567890'], webs: ['https://quillfield.example/'] },
      { id: 'a2', name: 'Harborline Bank', taxIds: [], webs: ['harborline.example'] },
      { id: 'a3', name: 'Orchardly Foods', taxIds: [], webs: [] },
      { id: 'a4', name: 'Orchardly Foods', taxIds: [], webs: [] },
    ]);
    expect(m({ name: 'Something else', taxId: 'TR1234567890', email: null, website: null })).toEqual({ accountId: 'a1', reason: 'tax', candidates: [] });
    expect(m({ name: 'HLB', taxId: null, email: 'ap@harborline.example', website: null })).toEqual({ accountId: 'a2', reason: 'domain', candidates: [] });
    expect(m({ name: 'Harborline Bank Inc.', taxId: null, email: null, website: null })).toEqual({ accountId: 'a2', reason: 'name', candidates: [] });
    expect(m({ name: 'Orchardly Foods Ltd', taxId: null, email: null, website: null })).toEqual({ accountId: null, reason: null, candidates: ['a3', 'a4'] });
    expect(m({ name: 'Nobody', taxId: null, email: null, website: null }).accountId).toBeNull();
  });

  it('sums what is open and overdue per currency, the oldest late days, and the last payment', () => {
    const s = financeSummary(
      [
        { dueOn: '2026-10-20', currency: 'EUR', balance: 1000, status: 'open' },
        { dueOn: '2026-11-10', currency: 'EUR', balance: 500.5, status: 'open' },
        { dueOn: '2026-12-10', currency: 'EUR', balance: 200, status: 'open' },
        { dueOn: '2026-09-01', currency: 'USD', balance: 300, status: 'open' },
        { dueOn: '2026-09-01', currency: 'EUR', balance: 900, status: 'paid' },
      ],
      [
        { paidOn: '2026-11-01', amount: 400, currency: 'EUR' },
        { paidOn: '2026-11-12', amount: 120, currency: 'EUR' },
      ],
      '2026-11-19',
      'EUR',
    );
    expect(s.byCurrency[0]).toEqual({ currency: 'EUR', open: 1700.5, overdue: 1500.5, overdueDays: 30, openInvoices: 3, overdueInvoices: 2 });
    expect(s.byCurrency[1]).toMatchObject({ currency: 'USD', overdue: 300, overdueDays: 79 });
    expect(s.lateDays).toBe(79);
    expect(s.lastPayment).toEqual({ on: '2026-11-12', amount: 120, currency: 'EUR' });
  });

  it('counts a late payment in the health score only where it is known, by days', () => {
    const cfg = { ...DEFAULT_HEALTH, enabled: true, signals: [PAYMENT_SIGNAL] };
    const base = { createdAt: '2026-01-01T00:00:00Z', lastTouchAt: null, lastTouchKind: null, overdue: 0, tickets: null, contacts: null, fields: {} };
    const now = new Date('2026-11-19T00:00:00Z');
    expect(computeHealth(cfg, [], { ...base, finance: null }, now).score).toBeNull();
    expect(computeHealth(cfg, [], { ...base, finance: { lateDays: 0, overdue: 0 } }, now).score).toBe(100);
    expect(computeHealth(cfg, [], { ...base, finance: { lateDays: 30, overdue: 2 } }, now).parts[0]).toMatchObject({ points: 50, detail: { days: 30, count: 2 } });
    expect(computeHealth(cfg, [], { ...base, finance: { lateDays: 90, overdue: 1 } }, now).score).toBe(0);
  });

  it('reads a row of the file template, whatever the status is called', () => {
    expect(fileRow('invoices', { invoice_id: 'F-1', customer_id: 'C1', total: '1200.50', balance: '', due_on: '2026-11-01', status: 'Ödenmedi', currency: 'tl' })).toMatchObject({ remoteId: 'F-1', total: 1200.5, balance: 1200.5, status: 'open', currency: 'TRY', dueOn: '2026-11-01' });
    expect(fileRow('invoices', { invoice_id: 'F-2', total: 10, balance: 0, status: 'whatever' })).toMatchObject({ status: 'paid' });
    expect(fileRow('customers', { name: 'No id' })).toBeNull();
  });
});

describe('adapters against recorded answers', () => {
  it('never write: every write is refused by every accounting adapter', async () => {
    for (const a of [zohobooks, xeroAdapter, odooAdapter, freee, parasut, quickbooks]) {
      expect(a.readOnly).toBe(true);
      await expect(a.update({} as CrmCtx, 'x', '1', {}, [])).rejects.toBeInstanceOf(CrmError);
      await expect(a.create({} as CrmCtx, 'x', {}, [])).rejects.toBeInstanceOf(CrmError);
    }
  });

  it('Zoho Books: its own data centre, the changed-since filter, pages', async () => {
    expect(zohoApiDomain('https://www.zohoapis.sa')).toBe('https://www.zohoapis.sa');
    expect(zohoApiDomain('https://evil.example')).toBeNull();
    const { ctx, calls } = ctxFor({ apiDomain: 'https://www.zohoapis.sa', organizationId: '7001' }, [
      [/GET .*\/books\/v3\/contacts/, () => ({ contacts: [{ contact_id: '460', contact_name: 'Rami', company_name: 'Quillfield Retail', email: 'ap@quillfield.example', currency_code: 'SAR', outstanding_receivable_amount: 4200, tax_reg_no: '300123456700003', last_modified_time: '2026-11-18T09:00:00+0300' }], page_context: { has_more_page: true } })],
      [/GET .*\/books\/v3\/invoices/, () => ({ invoices: [{ invoice_id: '9001', customer_id: '460', invoice_number: 'INV-0012', date: '2026-10-01', due_date: '2026-10-31', currency_code: 'SAR', total: 5000, balance: 4200, status: 'overdue', last_modified_time: '2026-11-18T09:00:00+0300' }, { invoice_id: '9002', customer_id: '460', status: 'draft', total: 10, balance: 10 }], page_context: { has_more_page: false } })],
      [/GET .*\/books\/v3\/customerpayments/, () => ({ customerpayments: [{ payment_id: 'p1', customer_id: '460', date: '2026-10-15', amount: 800, currency_code: 'SAR' }], page_context: { has_more_page: false } })],
    ]);
    const c = await zohobooks.finance!(ctx, 'customers', { since: '2026-11-01T00:00:00.000Z', cursor: null });
    expect(c.next).toBe('2');
    expect(c.rows[0]).toMatchObject({ remoteId: '460', name: 'Quillfield Retail', taxId: '300123456700003', currency: 'SAR', balance: 4200, modifiedAt: '2026-11-18T06:00:00.000Z' });
    const u = new URL(calls[0].url);
    expect(u.origin).toBe('https://www.zohoapis.sa');
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ organization_id: '7001', contact_type: 'customer', last_modified_time: '2026-11-01T00:00:00+0000', page: '1', per_page: '200' });
    expect(calls[0].headers.get('authorization')).toBe('Zoho-oauthtoken tok');
    const i = await zohobooks.finance!(ctx, 'invoices', { since: null, cursor: null });
    expect(i.rows.map((r: any) => [r.remoteId, r.status, r.balance])).toEqual([['9001', 'open', 4200], ['9002', 'draft', 10]]);
    const p = await zohobooks.finance!(ctx, 'payments', { since: null, cursor: null });
    expect(p.rows[0]).toMatchObject({ remoteId: 'p1', customerId: '460', amount: 800, paidOn: '2026-10-15' });
    expect(zohobooks.url({ apiDomain: 'https://www.zohoapis.sa', organizationId: '7001' }, 'invoices', '9001')).toBe('https://books.zoho.sa/app/7001#/invoices/9001');
    expect(calls.every((x) => x.method === 'GET')).toBe(true);
  });

  it('Xero: the chosen organisation in a header, If-Modified-Since, sales invoices only; a rate limit says when to come back', async () => {
    const { ctx, calls } = ctxFor({ tenantId: 'tn-1' }, [
      [/GET .*\/Contacts\?/, () => ({ Contacts: [{ ContactID: 'c-1', Name: 'Harborline Bank', EmailAddress: 'ap@harborline.example', TaxNumber: 'GB123456789', DefaultCurrency: 'GBP', Balances: { AccountsReceivable: { Outstanding: 950, Overdue: 950 } }, UpdatedDateUTC: '/Date(1763460000000+0000)/' }] })],
      [/GET .*\/Invoices\?/, () => ({ Invoices: [
        { InvoiceID: 'i-1', InvoiceNumber: 'INV-7', Type: 'ACCREC', Contact: { ContactID: 'c-1' }, DateString: '2026-09-01T00:00:00', DueDateString: '2026-10-01T00:00:00', CurrencyCode: 'GBP', Total: 1000, AmountDue: 950, Status: 'AUTHORISED', UpdatedDateUTC: '/Date(1763460000000+0000)/' },
        { InvoiceID: 'i-2', Contact: { ContactID: 'c-1' }, Total: 50, AmountDue: 50, Status: 'VOIDED' },
      ] })],
      [/GET .*\/Payments\?/, () => new Response('{"Title":"Rate limit"}', { status: 429, headers: { 'retry-after': '30' } })],
    ]);
    const c = await xeroAdapter.finance!(ctx, 'customers', { since: '2026-11-01T00:00:00.000Z', cursor: null });
    expect(c.rows[0]).toMatchObject({ remoteId: 'c-1', taxId: 'GB123456789', balance: 950, currency: 'GBP', modifiedAt: '2025-11-18T10:00:00.000Z' });
    expect(calls[0].headers.get('xero-tenant-id')).toBe('tn-1');
    expect(calls[0].headers.get('if-modified-since')).toBe('2026-11-01T00:00:00');
    expect(decodeURIComponent(calls[0].url)).toContain('where=IsCustomer==true');
    const i = await xeroAdapter.finance!(ctx, 'invoices', { since: null, cursor: null });
    expect(decodeURIComponent(calls[1].url)).toContain('Type=="ACCREC"');
    expect(calls[1].headers.get('if-modified-since')).toBeNull();
    expect(i.rows.map((r: any) => [r.status, r.balance, r.dueOn])).toEqual([['open', 950, '2026-10-01'], ['void', 0, null]]);
    expect(i.next).toBeNull();
    await expect(xeroAdapter.finance!(ctx, 'payments', { since: null, cursor: null })).rejects.toMatchObject({ status: 429, retryAfter: 30 });
  });

  it('Odoo: JSON-2 with the key as a bearer token, companies only, changed since, offset pages', async () => {
    expect(odooUrl('yourcompany.odoo.com/odoo/action-1')).toBe('https://yourcompany.odoo.com');
    for (const bad of ['http://plain.example', 'https://localhost', 'https://10.0.0.5', 'https://u:p@odoo.example']) expect(() => odooUrl(bad), bad).toThrow(CrmError);
    const { ctx, calls } = ctxFor({ url: 'https://quill.odoo.example', database: 'quill', transport: 'json2' }, [
      [/POST .*\/json\/2\/account\.move\/search_read/, () => [
        { id: 31, name: 'INV/2026/0031', commercial_partner_id: [7, 'Quillfield Retail'], invoice_date: '2026-09-15', invoice_date_due: '2026-10-15', currency_id: [1, 'EUR'], amount_total: 2400, amount_residual: 2400, payment_state: 'not_paid', state: 'posted', write_date: '2026-11-02 08:00:00' },
        { id: 32, name: 'INV/2026/0032', commercial_partner_id: [7, 'Quillfield Retail'], currency_id: [1, 'EUR'], amount_total: 100, amount_residual: 0, payment_state: 'paid', state: 'posted', write_date: '2026-11-03 08:00:00' },
        { id: 33, name: 'INV/2026/0033', commercial_partner_id: [7, 'Quillfield Retail'], currency_id: [1, 'EUR'], amount_total: 100, amount_residual: 100, payment_state: 'not_paid', state: 'cancel', write_date: '2026-11-03 08:00:00' },
      ]],
    ]);
    const i = await odooAdapter.finance!(ctx, 'invoices', { since: '2026-11-01T00:00:00.000Z', cursor: null });
    expect(calls[0].headers.get('authorization')).toBe('bearer tok');
    expect(calls[0].headers.get('x-odoo-database')).toBe('quill');
    expect(calls[0].body).toMatchObject({ domain: [['move_type', '=', 'out_invoice'], ['state', 'in', ['posted', 'cancel']], ['write_date', '>=', '2026-11-01 00:00:00']], limit: 200, offset: 0, order: 'write_date asc, id asc' });
    expect(i.rows.map((r: any) => [r.remoteId, r.customerId, r.status, r.balance, r.currency])).toEqual([['31', '7', 'open', 2400, 'EUR'], ['32', '7', 'paid', 0, 'EUR'], ['33', '7', 'void', 0, 'EUR']]);
    expect(i.rows[0].modifiedAt).toBe('2026-11-02T08:00:00.000Z');
  });

  it('Odoo before 19: falls back to JSON-RPC and signs in with the database', async () => {
    const seen: string[] = [];
    const fetcher = (async (u: string, init: RequestInit) => {
      const b = JSON.parse(String(init.body));
      seen.push(`${u} ${b.params?.service ?? ''}.${b.params?.method ?? ''}`);
      if (u.endsWith('/json/2/res.company/search_read')) return new Response('Not Found', { status: 404 });
      if (b.params?.service === 'common') return Response.json({ jsonrpc: '2.0', id: 1, result: 6 });
      return Response.json({ jsonrpc: '2.0', id: 1, result: [{ id: 1, name: 'Quillfield Retail' }] });
    }) as unknown as typeof fetch;
    await expect(odooAdapter.keyed!.connect(fetcher, { url: 'https://old.odoo.example', login: 'fin@quillfield.example', apiKey: 'k' }, new Date())).rejects.toMatchObject({ status: 400 });
    const made = await odooAdapter.keyed!.connect(fetcher, { url: 'https://old.odoo.example', database: 'old', login: 'fin@quillfield.example', apiKey: 'k' }, new Date());
    expect(made).toMatchObject({ config: { transport: 'jsonrpc', uid: 6, database: 'old' }, label: 'Quillfield Retail', secret: { accessToken: 'k' } });
    expect(seen.at(-1)).toBe('https://old.odoo.example/jsonrpc object.execute_kw');
  });

  it('freee: the company on every call, income deals as invoices, their payments with them', async () => {
    const { ctx, calls } = ctxFor({ companyId: '1201' }, [
      [/GET .*\/api\/1\/partners/, () => ({ partners: [{ id: 501, name: 'クイルフィールド', long_name: '株式会社クイルフィールド', invoice_registration_number: 'T1234567890123', update_date: '2026-11-01' }] })],
      [/GET .*\/api\/1\/deals/, () => ({ deals: [{ id: 801, partner_id: 501, issue_date: '2026-09-30', due_date: '2026-10-31', amount: 330000, due_amount: 110000, status: 'unsettled', ref_number: 'INV-801', payments: [{ id: 1, date: '2026-10-30', amount: 220000 }] }] })],
    ]);
    const c = await freee.finance!(ctx, 'customers', { since: null, cursor: null });
    expect(c.rows[0]).toMatchObject({ remoteId: '501', name: '株式会社クイルフィールド', taxId: 'T1234567890123', currency: 'JPY' });
    const i = await freee.finance!(ctx, 'invoices', { since: '2026-11-10T03:00:00.000Z', cursor: null });
    const u = new URL(calls[1].url);
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ company_id: '1201', type: 'income', start_renew_date: '2026-11-10', limit: '100', offset: '0' });
    expect(i.rows[0]).toMatchObject({ remoteId: '801', customerId: '501', balance: 110000, status: 'open', currency: 'JPY' });
    expect(i.payments).toEqual([expect.objectContaining({ remoteId: '801:1', invoiceId: '801', amount: 220000, paidOn: '2026-10-30' })]);
    expect(freee.accounting?.paymentsWithInvoices).toBe(true);
  });

  it('Paraşüt: the password is used once and never kept; invoices bring their payments', async () => {
    const posted: string[] = [];
    const fetcher = (async (u: string, init: RequestInit = {}) => {
      if (u.endsWith('/oauth/token')) {
        posted.push(String(init.body));
        return Response.json({ access_token: 'at', refresh_token: 'rt', expires_in: 7200 });
      }
      return Response.json({ data: [], meta: { total_pages: 0 } });
    }) as unknown as typeof fetch;
    await expect(parasut.keyed!.connect(fetcher, { companyId: 'abc', clientId: 'x', clientSecret: 'y', username: 'u', password: 'p' }, new Date())).rejects.toMatchObject({ status: 400 });
    const made = await parasut.keyed!.connect(fetcher, { companyId: '123456', clientId: 'cid', clientSecret: 'csec', username: 'fin@quillfield.example', password: 'pw-123' }, new Date('2026-11-19T10:00:00Z'));
    expect(posted[0]).toContain('grant_type=password');
    expect(JSON.stringify(made)).not.toContain('pw-123');
    expect(made).toMatchObject({ config: { companyId: '123456' }, instanceId: '123456', secret: { accessToken: 'at', refreshToken: 'rt', clientId: 'cid' } });

    const { ctx, calls } = ctxFor({ companyId: '123456' }, [
      [/GET .*\/v4\/123456\/sales_invoices/, () => ({
        data: [
          { id: '71', type: 'sales_invoices', attributes: { invoice_series: 'A', invoice_id: 12, issue_date: '2026-09-01', due_date: '2026-10-01', currency: 'TRL', net_total: '11800.0', remaining: '5900.0', item_type: 'invoice', updated_at: '2026-11-05T10:00:00.000+03:00' }, relationships: { contact: { data: { id: '9', type: 'contacts' } }, payments: { data: [{ id: '501', type: 'payments' }] } } },
          { id: '72', type: 'sales_invoices', attributes: { item_type: 'estimate', net_total: '10.0', remaining: '10.0' }, relationships: { contact: { data: { id: '9', type: 'contacts' } } } },
        ],
        included: [{ id: '501', type: 'payments', attributes: { date: '2026-10-20', amount: '5900.0', currency: 'TRL' } }],
        meta: { total_pages: 3, current_page: 1 },
      })],
    ]);
    const i = await parasut.finance!(ctx, 'invoices', { since: null, cursor: null });
    expect(decodeURIComponent(calls[0].url)).toContain('include=payments&page[number]=1&page[size]=25');
    expect(i.rows).toHaveLength(1);
    expect(i.rows[0]).toMatchObject({ remoteId: '71', customerId: '9', number: 'A12', currency: 'TRY', total: 11800, balance: 5900, status: 'open' });
    expect(i.payments).toEqual([expect.objectContaining({ remoteId: '501', invoiceId: '71', amount: 5900, currency: 'TRY' })]);
    expect(i.next).toBe('2');
  });

  it('QuickBooks Online: the query endpoint, changed since, large pages', async () => {
    const { ctx, calls } = ctxFor({ realmId: '9130', sandbox: false }, [
      [/GET .*\/v3\/company\/9130\/query/, (c) => (c.url.includes('Invoice') ? { QueryResponse: { Invoice: [{ Id: '145', DocNumber: '1037', CustomerRef: { value: '58' }, TxnDate: '2026-10-01', DueDate: '2026-10-31', TotalAmt: 362.07, Balance: 362.07, CurrencyRef: { value: 'USD' }, MetaData: { LastUpdatedTime: '2026-11-02T09:00:00-08:00' } }] } } : { QueryResponse: {} })],
    ]);
    const i = await quickbooks.finance!(ctx, 'invoices', { since: '2026-11-01T00:00:00.000Z', cursor: null });
    const q = new URL(calls[0].url).searchParams.get('query');
    expect(q).toBe("SELECT * FROM Invoice WHERE MetaData.LastUpdatedTime >= '2026-11-01T00:00:00Z' ORDERBY MetaData.LastUpdatedTime STARTPOSITION 1 MAXRESULTS 1000");
    expect(new URL(calls[0].url).origin).toBe('https://quickbooks.api.intuit.com');
    expect(i.rows[0]).toMatchObject({ remoteId: '145', customerId: '58', balance: 362.07, status: 'open', modifiedAt: '2026-11-02T17:00:00.000Z' });
    expect(i.next).toBeNull();
    expect((await quickbooks.finance!(ctx, 'customers', { since: null, cursor: null })).rows).toEqual([]);
  });

  it('stops at the daily allowance instead of going over it', async () => {
    const { ctx } = ctxFor({}, [[/.*/, () => ({})]]);
    const fin: any = {};
    const paced = pacedCtx(ctx, { perMinute: 60, perDay: 2 }, fin, 0, () => new Date('2026-11-19T10:00:00Z'));
    await paced.fetch('https://x.example/1');
    await paced.fetch('https://x.example/2');
    await expect(paced.fetch('https://x.example/3')).rejects.toBeInstanceOf(Error);
    expect(fin.calls).toEqual({ day: '2026-11-19', n: 2 });
    // A new day, a new allowance.
    const tomorrow = pacedCtx(ctx, { perMinute: 60, perDay: 2 }, fin, 0, () => new Date('2026-11-20T00:01:00Z'));
    await tomorrow.fetch('https://x.example/4');
    expect(fin.calls).toEqual({ day: '2026-11-20', n: 1 });
  });
});

describe('an accounting program end to end (Odoo)', () => {
  let env: Env;
  let ada: Client;
  let mert: Client;
  let lena: Client;
  let connId: string;
  let acc: Record<string, string>;
  const methods: string[] = [];
  let limitOnce = false;
  const partners = [
    { id: 7, name: 'Quillfield Retail Ltd.', vat: false, email: 'ap@quillfield.example', website: false, credit: 3400, write_date: '2026-11-01 08:00:00' },
    { id: 8, name: 'HLB Holdings', vat: false, email: false, website: 'https://www.harborline.example', credit: 0, write_date: '2026-11-01 08:00:00' },
    { id: 9, name: 'Somebody Else GmbH', vat: 'DE999999999', email: false, website: false, credit: 120, write_date: '2026-11-01 08:00:00' },
  ];
  const moves = [
    { id: 31, name: 'INV/2026/0031', commercial_partner_id: [7, 'Quillfield Retail Ltd.'], invoice_date: '2026-09-15', invoice_date_due: '2026-10-15', currency_id: [1, 'EUR'], amount_total: 2400, amount_residual: 2400, payment_state: 'not_paid', state: 'posted', write_date: '2026-11-02 08:00:00' },
    { id: 34, name: 'INV/2026/0034', commercial_partner_id: [7, 'Quillfield Retail Ltd.'], invoice_date: '2026-11-01', invoice_date_due: '2026-12-01', currency_id: [1, 'EUR'], amount_total: 1000, amount_residual: 1000, payment_state: 'not_paid', state: 'posted', write_date: '2026-11-02 08:00:00' },
    { id: 35, name: 'INV/2026/0035', commercial_partner_id: [8, 'HLB Holdings'], invoice_date: '2026-08-01', invoice_date_due: '2026-09-01', currency_id: [1, 'EUR'], amount_total: 500, amount_residual: 0, payment_state: 'paid', state: 'posted', write_date: '2026-11-02 08:00:00' },
  ];
  const pays = [{ id: 61, partner_id: [7, 'Quillfield Retail Ltd.'], date: '2026-11-05', amount: 600, currency_id: [1, 'EUR'], write_date: '2026-11-05 08:00:00' }];
  const odoo = async (url: string, init?: RequestInit): Promise<Response> => {
    const m = /^https:\/\/quill\.odoo\.example\/json\/2\/([\w.]+)\/(\w+)$/.exec(url);
    if (!m) return new Response('not here', { status: 404 });
    if (new Headers(init?.headers).get('authorization') !== 'bearer odoo-key-1') return Response.json({ message: 'Invalid apikey' }, { status: 401 });
    methods.push(`${m[1]}.${m[2]}`);
    if (m[2] !== 'search_read') return Response.json({ message: 'no' }, { status: 403 });
    const b = JSON.parse(String(init?.body ?? '{}'));
    if (m[1] === 'res.company') return Response.json([{ id: 1, name: 'Acme Finance' }]);
    if (m[1] === 'account.move' && limitOnce) {
      limitOnce = false;
      return new Response('Too many requests', { status: 429, headers: { 'retry-after': '5' } });
    }
    const all = m[1] === 'res.partner' ? partners : m[1] === 'account.move' ? moves : m[1] === 'account.payment' ? pays : [];
    return Response.json(all.slice(b.offset ?? 0, (b.offset ?? 0) + (b.limit ?? 200)));
  };

  beforeAll(async () => {
    env = await setup();
    env.clock.now = new Date('2026-11-19T10:00:00Z');
    ada = await login(env, 'acme', 'ada@demo.example');
    mert = await login(env, 'acme', 'mert@demo.example');
    lena = await login(env, 'acme', 'lena@demo.example');
    env.fetchHolder.impl = odoo;
    const list = (await ada.get('/api/accounts')).json.accounts as { id: string; name: string }[];
    acc = Object.fromEntries(list.map((a) => [a.name, a.id]));
  });

  it('is offered, read only, with a key; a wrong key is refused and the key is sealed', async () => {
    const p = (await ada.get('/api/connections')).json.providers.find((x: any) => x.id === 'odoo');
    expect(p).toMatchObject({ kind: 'source', twoWay: false, available: true, setup: 'key' });
    expect((await ada.post('/api/connections/key', { provider: 'odoo', values: { url: 'https://quill.odoo.example', login: 'fin', apiKey: 'wrong' } })).status).toBeGreaterThanOrEqual(400);
    expect((await lena.post('/api/connections/key', { provider: 'odoo', values: { url: 'https://quill.odoo.example', login: 'fin', apiKey: 'odoo-key-1' } })).status).toBe(403);
    const ok = await ada.post('/api/connections/key', { provider: 'odoo', values: { url: 'https://quill.odoo.example', database: 'quill', login: 'fin', apiKey: 'odoo-key-1' } });
    expect(ok.status, JSON.stringify(ok.json)).toBe(201);
    connId = ok.json.id;
    const d = (await ada.get(`/api/connections/${connId}/sync`)).json;
    expect(d.connection).toMatchObject({ provider: 'odoo', label: 'Acme Finance', readOnly: true, accounting: true });
    const [row] = await env.db.system((q) => q.query('select config::text as config from connections where id = $1', [connId]));
    expect(row.config).not.toContain('odoo-key-1');
  });

  it('a rate limit stops the run with its place kept; the next run carries on', async () => {
    limitOnce = true;
    const first = await ada.post(`/api/connections/${connId}/sync/run`, { start: true });
    expect(first.status).toBe(200);
    expect(first.json.run).toMatchObject({ status: 'partial', more: true });
    expect(first.json.run.errors.map((e: any) => e.object)).toContain('invoices');
    const again = await ada.post(`/api/connections/${connId}/sync/run`, {});
    expect(again.json.run, JSON.stringify(again.json.run.errors)).toMatchObject({ status: 'ok', more: false });
    // Only reads, ever.
    expect([...new Set(methods)].sort()).toEqual(['account.move.search_read', 'account.payment.search_read', 'res.company.search_read', 'res.partner.search_read']);
  });

  it('matches by domain and name; the rest wait on the review list', async () => {
    const r = (await ada.get(`/api/connections/${connId}/finance/matches?show=all`)).json;
    expect(r.counts).toMatchObject({ total: 3, matched: 2, review: 1 });
    const by = Object.fromEntries(r.customers.map((c: any) => [c.remoteId, c]));
    expect(by['7']).toMatchObject({ account: { id: acc['Quillfield Retail'] }, state: 'auto', reason: 'domain', open: 3400 });
    expect(by['8']).toMatchObject({ account: { id: acc['Harborline Bank'] }, reason: 'domain' });
    expect(by['9']).toMatchObject({ account: null, state: 'none' });
    expect((await lena.get(`/api/connections/${connId}/finance/matches`)).status).toBe(403);
    // Chosen by hand, then left out; both written to the activity log.
    const put = await ada.put(`/api/connections/${connId}/finance/matches/9`, { accountId: acc["Orchardly Foods"] });
    expect(put.status, JSON.stringify(put.json)).toBe(200);
    expect((await ada.put(`/api/connections/${connId}/finance/matches/9`, { accountId: null, ignore: true })).status).toBe(200);
    const review = (await ada.get(`/api/connections/${connId}/finance/matches`)).json;
    expect(review.counts).toMatchObject({ review: 0, ignored: 1 });
    const log = await env.db.system((q) => q.query(`select count(*)::int as n from audit_log where action = 'finance.match_changed' and entity_id = $1 and org_id = $2`, [connId, env.a.orgId]));
    expect(log[0].n).toBe(2);
  });

  it('the customer page shows what is open, overdue and the last payment — only to those who may see money', async () => {
    const f = (await mert.get(`/api/accounts/${acc['Quillfield Retail']}/finance`)).json.finance;
    expect(f.linked).toBe(true);
    expect(f.summary.byCurrency[0]).toMatchObject({ currency: 'EUR', open: 3400, overdue: 2400, overdueDays: 35, openInvoices: 2, overdueInvoices: 1 });
    expect(f.summary.lastPayment).toEqual({ on: '2026-11-05', amount: 600, currency: 'EUR' });
    expect(f.invoices[0]).toMatchObject({ number: 'INV/2026/0031', provider: 'odoo', url: 'https://quill.odoo.example/web#id=31&model=account.move&view_type=form' });
    // A member without the permission gets nothing, and the tables themselves stay closed to them.
    expect((await lena.get(`/api/accounts/${acc['Quillfield Retail']}/finance`)).status).toBe(403);
    const other = await login(env, 'beta', env.b.adminEmail);
    expect((await other.get(`/api/accounts/${acc['Quillfield Retail']}/finance`)).status).toBe(404);
    // An unmatched customer: connected, nothing linked.
    expect((await mert.get(`/api/accounts/${acc['Velto Mobility']}/finance`)).json.finance).toMatchObject({ linked: false });
  });

  it('the Finance department sees the money too; another department once Finance’s band is widened to it', async () => {
    const url = `/api/accounts/${acc['Quillfield Retail']}/finance`;
    const sys = (sql: string, args: unknown[] = []) => env.db.system((q) => q.query(sql, args));
    const [{ id: lenaId }] = await sys(`select id from users where org_id = $1 and email = 'lena@demo.example'`, [env.a.orgId]);
    const dept = async (key: string) => (await sys(`select id from departments where org_id = $1 and key = $2`, [env.a.orgId, key]))[0].id as string;
    const [fin, sales] = [await dept('finance'), await dept('sales')];
    const before = await sys(`select department_id, role from department_members where user_id = $1`, [lenaId]);
    const bandBefore = (await sys(`select band_view from departments where id = $1`, [fin]))[0].band_view;
    await sys(`delete from department_members where user_id = $1`, [lenaId]);
    try {
      await sys(`insert into department_members (org_id, department_id, user_id) values ($1, $2, $3)`, [env.a.orgId, fin, lenaId]);
      const f = await lena.get(url);
      expect(f.status).toBe(200);
      expect(f.json.finance.summary.byCurrency[0]).toMatchObject({ currency: 'EUR', open: 3400 });
      expect((await lena.get('/api/me')).json.user.perms).toContain('finance.view');
      // Finance switched off: gone again.
      await sys(`update departments set enabled = false where id = $1`, [fin]);
      expect((await lena.get(url)).status).toBe(403);
      await sys(`update departments set enabled = true where id = $1`, [fin]);
      // In Sales only: not until Finance's band is widened to Sales.
      await sys(`delete from department_members where user_id = $1`, [lenaId]);
      await sys(`insert into department_members (org_id, department_id, user_id) values ($1, $2, $3)`, [env.a.orgId, sales, lenaId]);
      expect((await lena.get(url)).status).toBe(403);
      await sys(`update departments set band_view = array['finance', 'sales'] where id = $1`, [fin]);
      expect((await lena.get(url)).status).toBe(200);
    } finally {
      await sys(`update departments set enabled = true, band_view = $2 where id = $1`, [fin, bandBefore]);
      await sys(`delete from department_members where user_id = $1`, [lenaId]);
      for (const r of before) await sys(`insert into department_members (org_id, department_id, user_id, role) values ($1, $2, $3, $4)`, [env.a.orgId, r.department_id, lenaId, r.role]);
    }
  });

  it('a late payment counts in the health score once the signal is on, by days, the same for everyone', async () => {
    const cfg = (await ada.get('/api/health/config')).json.config;
    expect((await ada.put('/api/health/config', { config: { ...cfg, enabled: true, signals: [...cfg.signals, { id: 'payment', key: 'payment', weight: 15, good: 0, bad: 60 }] } })).status).toBe(200);
    const mine = (await mert.get(`/api/accounts/${acc['Quillfield Retail']}/health`)).json.health;
    const theirs = (await lena.get(`/api/accounts/${acc['Quillfield Retail']}/health`)).json.health;
    const pay = mine.parts.find((p: any) => p.key === 'payment');
    expect(pay).toMatchObject({ points: 42, detail: { days: 35, count: 1 } });
    expect(theirs.score).toBe(mine.score);
    expect(JSON.stringify(theirs)).not.toContain('2400');
    // Paid in full on a customer with no overdue invoices: full points.
    const harbor = (await lena.get(`/api/accounts/${acc['Harborline Bank']}/health`)).json.health.parts.find((p: any) => p.key === 'payment');
    expect(harbor).toMatchObject({ points: 100 });
    // Not matched to the accounting program: the signal does not count.
    const velto = (await lena.get(`/api/accounts/${acc['Velto Mobility']}/health`)).json.health.parts.find((p: any) => p.key === 'payment');
    expect(velto.points).toBeNull();
  });

  it('shows in the connection list like any other source', async () => {
    const c = (await ada.get('/api/connections')).json.connections.find((x: any) => x.id === connId);
    expect(c).toMatchObject({ kind: 'source', provider: 'odoo', status: 'active', sync: { lastRun: { status: 'ok' } } });
  });
});

describe('a file from any other program', () => {
  let env: Env;
  let ada: Client;
  let id: string;
  beforeAll(async () => {
    env = await setup();
    env.clock.now = new Date('2026-11-19T10:00:00Z');
    ada = await login(env, 'acme', 'ada@demo.example');
  });

  it('takes the template, matches, replaces on a new file and keeps matches made by hand', async () => {
    const made = await ada.post('/api/connections/key', { provider: 'finfile', values: { label: 'Logo export' } });
    expect(made.status).toBe(201);
    id = made.json.id;
    const up = (kind: string, rows: unknown[], extra = {}) => ada.post(`/api/connections/${id}/finance/import`, { kind, rows, replace: true, ...extra });
    expect((await up('customers', [{ customer_id: 'C1', name: 'Cedarmoor Health', email: 'ap@cedarmoor.example' }, { customer_id: 'C2', name: 'Unknown Ltd' }, { name: 'no id' }])).json).toMatchObject({ added: 2, skipped: 1 });
    await up('invoices', [{ invoice_id: 'F1', customer_id: 'C1', number: 'F-1', due_on: '2026-11-01', total: 900, balance: 900, currency: 'TRY', status: 'açık' }]);
    const done = await up('payments', [{ payment_id: 'P1', customer_id: 'C1', paid_on: '2026-10-01', amount: 100, currency: 'TRY' }], { last: true });
    expect(done.json.matched).toBe(1);
    const fin = (await ada.get(`/api/accounts/${(await ada.get('/api/accounts')).json.accounts.find((a: any) => a.name === 'Cedarmoor Health').id}/finance`)).json.finance;
    expect(fin.summary.byCurrency[0]).toMatchObject({ currency: 'TRY', overdue: 900, overdueDays: 18 });
    const orch = (await ada.get('/api/accounts')).json.accounts.find((a: any) => a.name === 'Orchardly Foods').id;
    await ada.put(`/api/connections/${id}/finance/matches/C2`, { accountId: orch });
    // The next month's file: C2's hand-made match survives.
    await up('customers', [{ customer_id: 'C2', name: 'Unknown Ltd' }], { last: true });
    const list = (await ada.get(`/api/connections/${id}/finance/matches?show=all`)).json.customers;
    expect(list).toEqual([expect.objectContaining({ remoteId: 'C2', state: 'manual', account: expect.objectContaining({ id: orch }) })]);
    // A scheduled run fetches nothing and removes nothing.
    const run = await ada.post(`/api/connections/${id}/sync/run`, {});
    expect(run.json.run.status).toBe('ok');
    expect((await ada.get(`/api/connections/${id}/finance/matches?show=all`)).json.counts.total).toBe(1);
  });
});
