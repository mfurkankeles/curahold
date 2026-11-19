// Odoo external API as documented for 19+: JSON-2 (POST /json/2/<model>/<method>, `Authorization: bearer <api key>`,
// keyword arguments in the body, records as a JSON array), errors as { name, message }; HTTP 429 with Retry-After
// when a server's worker limit is hit. Read only: the adapter only ever calls search_read.
import { json, type Ctl, type MockReq, type VendorMock } from './kit';

const KEY = 'odoo-key-mock-1';
let partners: any[] = [];
let moves: any[] = [];
let pays: any[] = [];

export const odooMock: VendorMock = {
  id: 'odoo',
  hosts: /^quill\.odoo\.example$/,
  keyValues: { url: 'https://quill.odoo.example', database: 'quill', login: 'finance@quill.example', apiKey: KEY },
  reset() {
    const w = '2026-11-01 08:00:00';
    // Names as the accounting team writes them: matched to the demo's customers by web address and by name.
    partners = [
      { id: 7, name: 'Quillfield Retail Ltd.', vat: false, email: 'ap@quillfield.example', website: false, credit: 3400, write_date: w },
      { id: 8, name: 'HLB Holdings', vat: false, email: false, website: 'https://www.harborline.example', credit: 0, write_date: w },
      { id: 9, name: 'Somebody Else GmbH', vat: 'DE999999999', email: false, website: false, credit: 120, write_date: w },
    ];
    moves = [
      { id: 31, name: 'INV/2026/0031', commercial_partner_id: [7, 'Quillfield Retail Ltd.'], invoice_date: '2026-09-15', invoice_date_due: '2026-10-15', currency_id: [1, 'EUR'], amount_total: 2400, amount_residual: 2400, payment_state: 'not_paid', state: 'posted', write_date: w },
      { id: 35, name: 'INV/2026/0035', commercial_partner_id: [8, 'HLB Holdings'], invoice_date: '2026-08-01', invoice_date_due: '2026-09-01', currency_id: [1, 'EUR'], amount_total: 500, amount_residual: 0, payment_state: 'paid', state: 'posted', write_date: w },
    ];
    pays = [{ id: 61, partner_id: [7, 'Quillfield Retail Ltd.'], date: '2026-11-05', amount: 600, currency_id: [1, 'EUR'], write_date: w }];
  },
  handle(req: MockReq, ctl: Ctl) {
    const m = /^\/json\/2\/([\w.]+)\/(\w+)$/.exec(req.url.pathname);
    if (!m) return json({ name: 'werkzeug.exceptions.NotFound', message: 'Not Found' }, 404);
    if (ctl.revoked() || req.headers.get('authorization') !== `bearer ${KEY}`) return json({ name: 'odoo.exceptions.AccessDenied', message: 'Invalid apikey' }, 401);
    if (ctl.take('ratelimit')) return new Response('Too many requests', { status: 429, headers: { 'retry-after': '5' } });
    if (m[2] !== 'search_read') return json({ name: 'odoo.exceptions.AccessError', message: 'You are not allowed to modify this document' }, 403);
    const b = req.body ?? {};
    if (m[1] === 'res.company') return json([{ id: 1, name: 'Quill Finance' }]);
    const all = m[1] === 'res.partner' ? partners : m[1] === 'account.move' ? moves : m[1] === 'account.payment' ? pays : [];
    return json(all.slice(b.offset ?? 0, (b.offset ?? 0) + (b.limit ?? 200)));
  },
};
