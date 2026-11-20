// freee Accounting API (api.freee.co.jp/api/1) as documented: OAuth at accounts.secure.freee.co.jp with
// prompt=select_company (the chosen company_id comes back with the token), company_id on every call,
// offset/limit lists of partners (取引先) and income deals with their payments, start_renew_date filter;
// errors as { status_code, errors: [{ type, messages }] }; 429 when the hourly limit is hit.
import { allow, gate, json, tokenEndpoint, type Ctl, type MockReq, type VendorMock } from './kit';

const COMPANY = 1234567;
let partners: any[] = [];
let deals: any[] = [];
const err = (status: number, type: string, message: string) => json({ status_code: status, errors: [{ type, messages: [message] }] }, status);
const unauthorized = () => err(401, 'status', '不正なアクセストークンです。');
const limited = () => err(429, 'status', 'リクエスト数が上限を超えました。しばらく時間をおいてから再度お試しください。');

export const freeeMock: VendorMock = {
  id: 'freee',
  hosts: /^(accounts\.secure\.freee\.co\.jp|api\.freee\.co\.jp)$/,
  reset() {
    const t = '2026-11-18T17:00:00+09:00';
    partners = [
      { id: 501, name: 'クイルフィールド', long_name: 'Quillfield Retail', email: 'ap@quillfield.example', invoice_registration_number: null, update_date: t },
      { id: 502, name: '別の会社', long_name: null, update_date: t },
    ];
    deals = [{ id: 9001, type: 'income', partner_id: 501, issue_date: '2026-10-01', due_date: '2026-10-31', amount: 330000, due_amount: 330000, status: 'unsettled', ref_number: 'INV-9001', payments: [], update_date: t, renew_date: '2026-11-18' }];
  },
  consent: (u, ctl) => allow('freee', u, ctl),
  async handle(req: MockReq, ctl: Ctl) {
    const p = req.url.pathname;
    if (req.url.host === 'accounts.secure.freee.co.jp') return p === '/public_api/token' ? tokenEndpoint('freee', req, ctl, () => ({ company_id: COMPANY, scope: 'read write' })) : err(404, 'status', 'not found');
    const stop = gate('freee', req, ctl, { unauthorized, limited });
    if (stop) return stop;
    if (p === '/api/1/companies') return json({ companies: [{ id: COMPANY, name: 'クイルフィールド株式会社', display_name: 'Quillfield KK', role: 'admin' }] });
    if (Number(req.url.searchParams.get('company_id')) !== COMPANY) return err(400, 'validation', '事業所IDが不正です。');
    const offset = Number(req.url.searchParams.get('offset') ?? 0);
    if (p === '/api/1/partners') return json({ partners: offset ? [] : partners });
    if (p === '/api/1/deals') {
      const from = req.url.searchParams.get('start_renew_date');
      const hit = deals.filter((d) => !from || d.renew_date >= from);
      return json({ deals: offset ? [] : hit, meta: { total_count: hit.length } });
    }
    return err(404, 'status', '指定されたリソースが見つかりません。');
  },
};
