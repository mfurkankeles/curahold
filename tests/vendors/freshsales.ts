// Freshsales (Freshworks CRM) API as documented: `Authorization: Token token=<API key>` on the bundle address
// (<alias>.myfreshworks.com/crm/sales/api/...), field settings per object, rows read through a saved view
// ("All accounts" …) with page / sort=updated_at, meta.total_pages; writes wrapped in the singular name
// ({ sales_account: {...} }); errors as { errors: { code, message } }; 429 with Retry-After.
import { json, type Ctl, type MockReq, type VendorMock } from './kit';

const HOST = 'quillfield.myfreshworks.com';
const KEY = 'fs-mock-key-123456';
const ONE: Record<string, string> = { sales_accounts: 'sales_account', contacts: 'contact', deals: 'deal' };
let db: Record<string, any[]> = {};
let seq = 3000;
const FIELDS: Record<string, any[]> = {
  sales_accounts: [
    { name: 'name', label: 'Name', type: 'text', required: true },
    { name: 'website', label: 'Website', type: 'text' },
    { name: 'owner_id', label: 'Sales owner', type: 'dropdown' },
  ],
  contacts: [
    { name: 'first_name', label: 'First name', type: 'text' },
    { name: 'last_name', label: 'Last name', type: 'text', required: true },
    { name: 'email', label: 'Emails', type: 'email' },
    { name: 'owner_id', label: 'Sales owner', type: 'dropdown' },
  ],
  deals: [
    { name: 'name', label: 'Name', type: 'text', required: true },
    { name: 'amount', label: 'Deal value', type: 'number' },
    { name: 'expected_close', label: 'Expected close date', type: 'date' },
    { name: 'sales_account_id', label: 'Account', type: 'auto_complete' },
  ],
};
const err = (status: number, code: string, message: string, headers: Record<string, string> = {}) => json({ errors: { code: [code], message: [message] } }, status, headers);

export const freshsalesMock: VendorMock = {
  id: 'freshsales',
  hosts: new RegExp(`^${HOST.replace(/\./g, '\\.')}$`),
  keyValues: { domain: `https://${HOST}/crm/sales`, token: KEY },
  reset() {
    const t = '2026-11-18T08:00:00Z';
    db = {
      sales_accounts: [
        { id: 70001, name: 'Pinecrest Foods', website: 'https://pinecrest.example', owner_id: 501, updated_at: t },
        { id: 70002, name: 'Orbital Freight', website: null, owner_id: 502, updated_at: t },
      ],
      contacts: [{ id: 71001, first_name: 'Selin', last_name: 'Akar', email: 'selin@pinecrest.example', owner_id: 501, sales_accounts: [{ id: 70001, name: 'Pinecrest Foods', is_primary: true }], updated_at: t }],
      deals: [{ id: 72001, name: 'Pinecrest renewal', amount: '24000.0', expected_close: '2026-12-15', sales_account_id: 70001, updated_at: t }],
    };
  },
  remoteEdit(ctl, name) {
    const r = db.sales_accounts[1];
    r.name = name;
    r.updated_at = ctl.now().toISOString();
    return { id: String(r.id) };
  },
  remoteRow: (object, id) => db[object]?.find((r) => String(r.id) === id),
  handle(req: MockReq, ctl: Ctl) {
    if (ctl.revoked() || req.headers.get('authorization') !== `Token token=${KEY}`) return err(401, 'login_failed', 'Invalid API key or token');
    if (ctl.take('ratelimit')) return err(429, 'too_many_requests', 'You have exceeded the limit of requests per hour', { 'retry-after': '60' });
    const m = /^\/crm\/sales\/api\/(.+)$/.exec(req.url.pathname);
    if (!m) return err(404, 'not_found', 'Not found');
    const path = m[1];
    if (path === 'selector/owners') return json({ users: [{ id: 501, display_name: 'Ada Demo', email: 'ada@demo.example', is_active: true }, { id: 502, display_name: 'Nobody', email: 'nobody@elsewhere.example', is_active: true }] });
    const fields = /^settings\/(\w+)\/fields$/.exec(path);
    if (fields) return FIELDS[fields[1]] ? json({ fields: FIELDS[fields[1]] }) : err(404, 'not_found', 'Not found');
    const filters = /^(\w+)\/filters$/.exec(path);
    if (filters) return json({ filters: [{ id: 9001, name: `All ${filters[1] === 'sales_accounts' ? 'Accounts' : filters[1][0].toUpperCase() + filters[1].slice(1)}` }, { id: 9002, name: 'My items' }] });
    const view = /^(\w+)\/view\/(\d+)$/.exec(path);
    if (view) {
      const rows = [...(db[view[1]] ?? [])].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
      const n = Number(req.url.searchParams.get('page') ?? 1);
      const per = 25;
      return json({ [view[1]]: rows.slice((n - 1) * per, n * per), meta: { total: rows.length, total_pages: Math.max(1, Math.ceil(rows.length / per)) } });
    }
    const one = /^(\w+)(?:\/(\d+))?$/.exec(path);
    if (one && db[one[1]] && (req.method === 'PUT' || req.method === 'POST')) {
      const body = req.body?.[ONE[one[1]]] ?? {};
      if (ctl.take('badfield')) return err(400, 'invalid_value', 'Website is invalid');
      if (req.method === 'PUT') {
        const row = db[one[1]].find((r) => String(r.id) === one[2]);
        if (!row) return err(404, 'not_found', 'Record not found');
        Object.assign(row, body, { updated_at: ctl.now().toISOString() });
        return json({ [ONE[one[1]]]: row });
      }
      const row = { id: ++seq, ...body, updated_at: ctl.now().toISOString() };
      db[one[1]].push(row);
      return json({ [ONE[one[1]]]: row });
    }
    return err(404, 'not_found', 'Not found');
  },
};
