// Xero Accounting API as documented: OAuth 2 with PKCE (login.xero.com, identity.xero.com/connect/token with
// Basic client auth, 30-minute access tokens, rotating refresh tokens), /connections for the chosen
// organisation, the `xero-tenant-id` header, If-Modified-Since, page/pageSize=100 lists of Contacts, Invoices
// (ACCREC) and Payments; errors as { Type, Title, Status, Detail }; 429 with Retry-After and X-Rate-Limit-Problem.
import { allow, gate, json, tokenEndpoint, type Ctl, type MockReq, type VendorMock } from './kit';

const TENANT = 'b7c1e1a2-0000-4000-8000-00000000xe01';
let contacts: any[] = [];
let invoices: any[] = [];
let payments: any[] = [];
const err = (Status: number, Title: string, Detail: string, headers: Record<string, string> = {}) => json({ Type: null, Title, Status, Detail, Instance: 'mock' }, Status, headers);
const unauthorized = () => err(401, 'Unauthorized', 'AuthenticationUnsuccessful');
const limited = () => err(429, 'Too Many Requests', 'Rate limit exceeded', { 'retry-after': '30', 'x-rate-limit-problem': 'minute', 'x-minlimit-remaining': '0' });
const since = (req: MockReq) => (req.headers.get('if-modified-since') ? Date.parse(`${req.headers.get('if-modified-since')}Z`) : 0);
const updated = (r: any) => Number(/\d+/.exec(r.UpdatedDateUTC)![0]);

export const xeroMock: VendorMock = {
  id: 'xero',
  hosts: /^(login\.xero\.com|identity\.xero\.com|api\.xero\.com)$/,
  reset() {
    const t = `/Date(${Date.parse('2026-11-18T08:00:00Z')}+0000)/`;
    contacts = [
      { ContactID: 'c-0001', Name: 'Quillfield Retail Ltd', EmailAddress: 'ap@quillfield.example', Website: null, TaxNumber: null, IsCustomer: true, DefaultCurrency: 'GBP', Balances: { AccountsReceivable: { Outstanding: 1800 } }, UpdatedDateUTC: t },
      { ContactID: 'c-0002', Name: 'Nobody We Know Ltd', EmailAddress: null, Website: null, IsCustomer: true, UpdatedDateUTC: t },
    ];
    invoices = [{ InvoiceID: 'i-0001', Type: 'ACCREC', InvoiceNumber: 'INV-0042', Contact: { ContactID: 'c-0001' }, DateString: '2026-10-01T00:00:00', DueDateString: '2026-10-31T00:00:00', CurrencyCode: 'GBP', Total: 1800, AmountDue: 1800, Status: 'AUTHORISED', UpdatedDateUTC: t }];
    payments = [];
  },
  consent: (u, ctl) => allow('xero', u, ctl),
  async handle(req: MockReq, ctl: Ctl) {
    const p = req.url.pathname;
    if (req.url.host === 'identity.xero.com') {
      if (!req.headers.get('authorization')?.startsWith('Basic ')) return json({ error: 'invalid_client' }, 400);
      return p === '/connect/token' ? tokenEndpoint('xero', req, ctl) : err(404, 'Not Found', 'not found');
    }
    const stop = gate('xero', req, ctl, { unauthorized, limited });
    if (stop) return stop;
    if (p === '/connections') return json([{ id: 'conn-1', tenantId: TENANT, tenantType: 'ORGANISATION', tenantName: 'Quillfield Demo Company (UK)' }]);
    if (req.headers.get('xero-tenant-id') !== TENANT) return err(403, 'Forbidden', 'AuthenticationUnsuccessful');
    const m = /^\/api\.xro\/2\.0\/(Contacts|Invoices|Payments)$/.exec(p);
    if (!m) return err(404, 'Not Found', 'The resource you\'re looking for cannot be found');
    const page = Number(req.url.searchParams.get('page') ?? 1);
    const all = m[1] === 'Contacts' ? contacts : m[1] === 'Invoices' ? invoices : payments;
    const hit = all.filter((r) => updated(r) >= since(req));
    return json({ Id: 'mock', Status: 'OK', ProviderName: 'Curahold', [m[1]]: page === 1 ? hit : [] });
  },
};
