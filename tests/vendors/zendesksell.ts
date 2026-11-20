// Zendesk Sell (Core API v2, api.getbase.com) as documented: Bearer access token, /accounts/self, companies and
// people in one /contacts list (is_organization), items wrapped as { items: [{ data, meta }] }, page/per_page with
// sort_by=updated_at:desc, writes as { data: {...} }; errors as { errors: [{ error: { code, message } }] }; 429
// with x-ratelimit headers.
import { json, type Ctl, type MockReq, type VendorMock } from './kit';

const TOKEN = 'zs-mock-access-token-0123456789abcdef';
let contacts: any[] = [];
let deals: any[] = [];
let seq = 4000;
const err = (status: number, code: string, message: string, headers: Record<string, string> = {}) => json({ errors: [{ error: { code, message, details: message } }], meta: { type: 'errors', http_status: `${status}` } }, status, headers);
const wrap = (rows: any[]) => ({ items: rows.map((data) => ({ data, meta: { type: data.is_organization === undefined ? 'deal' : 'contact' } })), meta: { type: 'collection', count: rows.length } });

export const zendesksellMock: VendorMock = {
  id: 'zendesksell',
  hosts: /^api\.getbase\.com$/,
  keyValues: { token: TOKEN },
  reset() {
    const t = '2026-11-18T08:00:00Z';
    contacts = [
      { id: 80001, is_organization: true, name: 'Pinecrest Foods', website: 'https://pinecrest.example', owner_id: 601, contact_id: null, updated_at: t },
      { id: 80002, is_organization: true, name: 'Orbital Freight', website: null, owner_id: 602, contact_id: null, updated_at: t },
      { id: 80003, is_organization: false, first_name: 'Selin', last_name: 'Akar', email: 'selin@pinecrest.example', owner_id: 601, contact_id: 80001, updated_at: t },
    ];
    deals = [{ id: 81001, name: 'Pinecrest renewal', value: '24000.00', currency: 'EUR', stage_id: 1, contact_id: 80001, organization_id: 80001, owner_id: 601, estimated_close_date: '2026-12-15', updated_at: t }];
  },
  remoteEdit(ctl, name) {
    const r = contacts[1];
    r.name = name;
    r.updated_at = ctl.now().toISOString();
    return { id: String(r.id) };
  },
  remoteRow: (object, id) => (object === 'deals' ? deals : contacts).find((r) => String(r.id) === id),
  handle(req: MockReq, ctl: Ctl) {
    if (ctl.revoked() || req.headers.get('authorization') !== `Bearer ${TOKEN}`) return err(401, 'unauthorized', 'Invalid or expired access token');
    if (ctl.take('ratelimit')) return err(429, 'too_many_requests', 'Too many requests', { 'x-ratelimit-limit': '36000', 'x-ratelimit-remaining': '0', 'retry-after': '60' });
    const p = req.url.pathname.replace(/^\/v2\//, '');
    const q = req.url.searchParams;
    if (p === 'accounts/self') return json({ data: { id: 424242, name: 'Quillfield Ltd', currency: 'EUR' } });
    if (p === 'users') return json(wrap([{ id: 601, name: 'Ada Demo', email: 'ada@demo.example', status: 'active' }, { id: 602, name: 'Nobody', email: 'nobody@elsewhere.example', status: 'active' }]));
    if (p === 'stages') return json(wrap([{ id: 1, name: 'Incoming', category: 'incoming' }, { id: 2, name: 'Won', category: 'won' }, { id: 3, name: 'Lost', category: 'lost' }]));
    if (/^(deal|contact)\/custom_fields$/.test(p)) return json(wrap([]));
    const m = /^(contacts|deals)(?:\/(\d+))?$/.exec(p);
    if (!m) return err(404, 'not_found', 'Resource not found');
    const rows = m[1] === 'deals' ? deals : contacts;
    if (req.method === 'GET') {
      const org = q.get('is_organization');
      const hit = rows.filter((r) => org === null || String(r.is_organization) === org).sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
      const page = Number(q.get('page') ?? 1);
      const per = Number(q.get('per_page') ?? 25);
      return json(wrap(hit.slice((page - 1) * per, page * per)));
    }
    if (ctl.take('badfield')) return err(422, 'invalid', 'website must be a valid URL');
    const body = req.body?.data ?? {};
    if (req.method === 'PUT') {
      const row = rows.find((r) => String(r.id) === m[2]);
      if (!row) return err(404, 'not_found', 'Resource not found');
      Object.assign(row, body, { updated_at: ctl.now().toISOString() });
      return json({ data: row, meta: { type: m[1] === 'deals' ? 'deal' : 'contact' } });
    }
    if (req.method === 'POST') {
      if (m[1] === 'deals' && !body.contact_id) return err(422, 'blank', 'contact_id can not be blank');
      const row = { id: ++seq, ...body, updated_at: ctl.now().toISOString() };
      rows.push(row);
      return json({ data: row, meta: { type: 'contact' } });
    }
    return err(405, 'method_not_allowed', 'Method not allowed');
  },
};
