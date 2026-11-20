// Paraşüt API v4 as documented: OAuth password grant at api.parasut.com/oauth/token with the client the support
// team issues (the password is used once; refresh tokens after that), JSON:API answers under /v4/<company id>/
// (data / attributes / relationships / included, page[number] + page[size] with meta.total_pages),
// contacts filtered to customers, sales_invoices with include=payments; errors as { errors: [{ title, detail }] };
// 429 when too many requests come at once.
import { gate, json, type Ctl, type MockReq, type VendorMock } from './kit';

const COMPANY = '123456';
let contacts: any[] = [];
let invoices: any[] = [];
const err = (status: number, title: string, detail: string) => json({ errors: [{ title, detail }] }, status);
const unauthorized = () => err(401, 'Unauthorized', 'The access token is invalid');
const limited = () => err(429, 'Too Many Requests', 'Rate limit exceeded');

export const parasutMock: VendorMock = {
  id: 'parasut',
  hosts: /^api\.parasut\.com$/,
  keyValues: { companyId: COMPANY, clientId: 'ps-client-1', clientSecret: 'ps-secret-1', username: 'finans@quillfield.example', password: 'not-a-real-password' },
  reset() {
    const t = '2026-11-18T11:00:00.000+03:00';
    contacts = [
      { id: '7001', type: 'contacts', attributes: { name: 'Quillfield Retail', short_name: 'Quillfield', email: 'ap@quillfield.example', tax_number: '1234567890', account_type: 'customer', balance: '18000.0', currency: 'TRL', updated_at: t } },
      { id: '7002', type: 'contacts', attributes: { name: 'Başka Bir Şirket', email: null, tax_number: null, account_type: 'customer', balance: '0.0', currency: 'TRL', updated_at: t } },
    ];
    invoices = [{ id: '8101', type: 'sales_invoices', attributes: { invoice_series: 'A', invoice_id: 101, issue_date: '2026-10-01', due_date: '2026-10-31', net_total: '18000.0', remaining: '18000.0', currency: 'TRL', item_type: 'invoice', updated_at: t }, relationships: { contact: { data: { id: '7001', type: 'contacts' } }, payments: { data: [] } } }];
  },
  async handle(req: MockReq, ctl: Ctl) {
    const p = req.url.pathname;
    if (p === '/oauth/token') {
      const b = req.body ?? {};
      if (b.client_id !== 'ps-client-1' || b.client_secret !== 'ps-secret-1') return json({ error: 'invalid_client', error_description: 'Client authentication failed' }, 401);
      if (b.grant_type === 'password') return b.username === 'finans@quillfield.example' && b.password === 'not-a-real-password' ? json({ ...ctl.tokens.issue('parasut', 7200), created_at: 0 }) : json({ error: 'invalid_grant', error_description: 'The provided authorization grant is invalid' }, 400);
      if (b.grant_type === 'refresh_token') {
        const t = ctl.revoked() ? null : ctl.tokens.rotate('parasut', b.refresh_token);
        return t ? json(t) : json({ error: 'invalid_grant', error_description: 'The provided authorization grant is invalid' }, 400);
      }
      return json({ error: 'unsupported_grant_type' }, 400);
    }
    const stop = gate('parasut', req, ctl, { unauthorized, limited });
    if (stop) return stop;
    const m = new RegExp(`^/v4/${COMPANY}/(contacts|sales_invoices)$`).exec(p);
    if (!m) return err(404, 'Not Found', 'Kayıt bulunamadı');
    const page = Number(req.url.searchParams.get('page[number]') ?? 1);
    const all = m[1] === 'contacts' ? contacts.filter((c) => c.attributes.account_type === (req.url.searchParams.get('filter[account_type]') ?? c.attributes.account_type)) : invoices;
    return json({ data: page === 1 ? all : [], included: [], meta: { current_page: page, total_pages: 1, total_count: all.length } });
  },
};
