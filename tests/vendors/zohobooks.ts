// Zoho Books API v3 as documented: Zoho OAuth on the account's data centre (this mock is an India account:
// accounts.zoho.in, www.zohoapis.in), the `Zoho-oauthtoken` header, organization_id on every call,
// page/per_page with page_context.has_more_page, last_modified_time filter ("YYYY-MM-DDTHH:MM:SS+0000"),
// contacts / invoices / customerpayments; errors as { code, message } (code 57: not authorised);
// 429 with code 44 when the per-minute limit is hit.
import { allow, json, tokenEndpoint, type Ctl, type MockReq, type VendorMock } from './kit';

const ORG = '60012345678';
let data: Record<string, any[]> = {};
const err = (status: number, code: number, message: string) => json({ code, message }, status);

export const zohobooksMock: VendorMock = {
  id: 'zohobooks',
  // Sign-in starts at accounts.zoho.com and moves to the account's data centre (India here).
  hosts: /^(accounts\.zoho\.(com|in)|www\.zohoapis\.in)$/,
  reset() {
    const t = '2026-11-18T08:00:00+0530';
    data = {
      contacts: [
        { contact_id: '4600000000001', contact_name: 'Quillfield Retail', company_name: 'Quillfield Retail Ltd', email: 'ap@quillfield.example', currency_code: 'INR', outstanding_receivable_amount: 52000, last_modified_time: t },
        { contact_id: '4600000000002', contact_name: 'Someone Else Pvt Ltd', currency_code: 'INR', outstanding_receivable_amount: 0, last_modified_time: t },
      ],
      invoices: [{ invoice_id: '4600000000101', invoice_number: 'INV-000101', customer_id: '4600000000001', date: '2026-10-01', due_date: '2026-10-31', currency_code: 'INR', total: 52000, balance: 52000, status: 'overdue', last_modified_time: t }],
      customerpayments: [],
    };
  },
  consent: (u, ctl) => allow('zohobooks', u, ctl, { location: 'in', 'accounts-server': 'https://accounts.zoho.in' }),
  async handle(req: MockReq, ctl: Ctl) {
    const p = req.url.pathname;
    if (req.url.host === 'accounts.zoho.in') return p === '/oauth/v2/token' ? tokenEndpoint('zohobooks', req, ctl, () => ({ api_domain: 'https://www.zohoapis.in' })) : err(404, 5, 'Invalid URL');
    const auth = req.headers.get('authorization');
    if (!auth?.startsWith('Zoho-oauthtoken ') || ctl.revoked() || !ctl.tokens.valid('zohobooks', auth)) return err(401, 57, 'You are not authorized to perform this operation');
    if (ctl.take('ratelimit')) return err(429, 44, 'You have reached the maximum number of API calls allowed per minute.');
    if (p === '/books/v3/organizations') return json({ code: 0, message: 'success', organizations: [{ organization_id: ORG, name: 'Quillfield India', currency_code: 'INR' }] });
    const m = /^\/books\/v3\/(contacts|invoices|customerpayments)$/.exec(p);
    if (!m) return err(404, 5, 'Invalid URL Passed');
    const q = req.url.searchParams;
    if (q.get('organization_id') !== ORG) return err(400, 6041, 'This user is not associated with the CompanyID/CompanyName:.');
    const since = q.get('last_modified_time');
    const hit = data[m[1]].filter((r) => !since || Date.parse(r.last_modified_time.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')) >= Date.parse(since.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')));
    const page = Number(q.get('page') ?? 1);
    return json({ code: 0, message: 'success', [m[1]]: page === 1 ? hit : [], page_context: { page, per_page: Number(q.get('per_page') ?? 200), has_more_page: false } });
  },
};
