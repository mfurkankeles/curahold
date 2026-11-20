// Odoo 19 External JSON-2 API, as documented (odoo.com/documentation/19.0/developer/reference/external_api.html):
// POST /json/2/<model>/<method>, "Authorization: bearer <key>", optional X-Odoo-Database; the body carries the
// method's arguments by name (ids, domain, fields, limit, offset, order, context, vals, vals_list). Errors: a 4xx/5xx
// with { name, message, arguments, context, debug } (401 "Invalid apikey"; a missing model 404). Odoo publishes no
// rate limit; the mock answers 429 only when the fault is armed. Many2one values come as [id, name], empty as false.
import { json, type Ctl, type MockReq, type VendorMock } from './kit';

export const ODOO_KEY = 'odoo-crm-api-key-b19-0001';
type R = Record<string, any>;
let db: Record<string, R[]> = {};
let seq = 500;
const err = (status: number, name: string, message: string) => json({ name, message, arguments: [message], context: {}, debug: '' }, status);
const odooNow = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');

function match(row: R, domain: any[]): boolean {
  return (domain ?? []).every((c) => {
    if (!Array.isArray(c)) return true;
    const [k, op, v] = c;
    const x = row[k];
    if (op === '=') return x === v || (v === false && (x === false || x === null || x === undefined));
    if (op === '>=') return String(x) >= String(v);
    if (op === 'in') return (v as unknown[]).includes(x);
    return true;
  });
}

export const odoocrmMock: VendorMock = {
  id: 'odoocrm',
  hosts: /^pinecrest-erp\.odoo\.example$/,
  keyValues: { url: 'https://pinecrest-erp.odoo.example', login: 'sales@quillfield.example', apiKey: ODOO_KEY },
  reset() {
    const t = (m: number) => odooNow(new Date(Date.parse('2026-11-18T08:00:00Z') + m * 60_000));
    db = {
      'res.company': [{ id: 1, name: 'Quillfield Trading' }],
      'res.users': [{ id: 2, name: 'Ada Demo', login: 'ada@demo.example', email: 'ada@demo.example', share: false }, { id: 6, name: 'Elsewhere', login: 'nobody@elsewhere.example', email: false, share: false }],
      'crm.stage': [{ id: 1, name: 'New', sequence: 1 }, { id: 2, name: 'Proposition', sequence: 2 }, { id: 4, name: 'Won', sequence: 4 }],
      'res.partner': [
        { id: 11, name: 'Pinecrest Foods', is_company: true, type: 'contact', website: 'https://pinecrest.example', email: false, phone: '+90 212 555 0100', vat: 'TR1234567890', user_id: [2, 'Ada Demo'], parent_id: false, function: false, active: true, write_date: t(1) },
        { id: 12, name: 'Orbital Freight', is_company: true, type: 'contact', website: 'orbital.example', email: 'ops@orbital.example', phone: false, vat: false, user_id: [6, 'Elsewhere'], parent_id: false, function: false, active: true, write_date: t(2) },
        { id: 21, name: 'Selin Akar', is_company: false, type: 'contact', website: false, email: 'selin@pinecrest.example', phone: '+90 532 555 0101', vat: false, user_id: [2, 'Ada Demo'], parent_id: [11, 'Pinecrest Foods'], function: 'Head of Operations', active: true, write_date: t(3) },
        { id: 22, name: 'Archived Person', is_company: false, type: 'contact', email: 'old@pinecrest.example', parent_id: [11, 'Pinecrest Foods'], active: false, write_date: t(3) },
      ],
      'crm.lead': [
        { id: 31, name: 'Pinecrest renewal', type: 'opportunity', expected_revenue: 24000, date_deadline: '2026-12-15', stage_id: [2, 'Proposition'], probability: 60, partner_id: [11, 'Pinecrest Foods'], user_id: [2, 'Ada Demo'], active: true, write_date: t(4) },
        { id: 32, name: 'Orbital pilot', type: 'opportunity', expected_revenue: 5000, date_deadline: false, stage_id: [4, 'Won'], probability: 100, partner_id: [12, 'Orbital Freight'], user_id: [2, 'Ada Demo'], active: true, write_date: t(5) },
        { id: 33, name: 'Orbital extra seats', type: 'opportunity', expected_revenue: 900, date_deadline: false, stage_id: [1, 'New'], probability: 0, partner_id: [12, 'Orbital Freight'], user_id: false, active: false, write_date: t(6) },
        { id: 34, name: 'A lead, not yet an opportunity', type: 'lead', expected_revenue: 0, partner_id: false, active: true, write_date: t(6) },
      ],
    };
    seq = 500;
  },
  /** The second sample customer is renamed in Odoo, and the first opportunity's revenue changes with it. */
  remoteEdit(ctl, name) {
    const c = db['res.partner'][1];
    c.name = name;
    c.write_date = odooNow(ctl.now());
    const o = db['crm.lead'][0];
    o.expected_revenue = 26500;
    o.write_date = odooNow(ctl.now());
    return { id: String(c.id) };
  },
  remoteRow: (object, id) => (object === 'opportunities' ? db['crm.lead'] : db['res.partner']).find((r) => String(r.id) === id),
  async handle(req: MockReq, ctl: Ctl) {
    const m = /^\/json\/2\/([\w.]+)\/(\w+)$/.exec(req.url.pathname);
    if (!m) return err(404, 'werkzeug.exceptions.NotFound', 'Not Found');
    if (ctl.revoked() || req.headers.get('authorization') !== `bearer ${ODOO_KEY}`) return err(401, 'odoo.exceptions.AccessDenied', 'Invalid apikey');
    if (ctl.take('ratelimit')) return json({ name: 'TooManyRequests', message: 'Too many requests' }, 429, { 'retry-after': '20' });
    const [, model, method] = m;
    const rows = db[model];
    if (!rows) return err(404, 'builtins.KeyError', `Model not found: ${model}`);
    const b = req.body ?? {};
    const activeTest = b.context?.active_test !== false;
    if (method === 'search_count') return json(rows.filter((r) => match(r, b.domain)).length);
    if (method === 'fields_get') return json({ name: { string: 'Name', type: 'char' }, x_segment: { string: 'Segment', type: 'selection', selection: [['smb', 'SMB'], ['ent', 'Enterprise']], readonly: false }, x_internal: { string: 'Internal', type: 'many2many' } });
    if (method === 'search_read') {
      const unknown = (b.fields ?? []).find((f: string) => !['id', 'write_date', 'name', 'website', 'email', 'phone', 'vat', 'user_id', 'parent_id', 'function', 'expected_revenue', 'date_deadline', 'stage_id', 'probability', 'partner_id', 'active', 'login', 'sequence', 'x_segment'].includes(f));
      if (unknown) return err(422, 'builtins.ValueError', `Invalid field '${unknown}' on model '${model}'`);
      let hit = rows.filter((r) => match(r, b.domain) && (!activeTest || r.active !== false || !('active' in r)));
      if (String(b.order ?? '').startsWith('write_date desc')) hit = [...hit].sort((x, y) => String(y.write_date).localeCompare(String(x.write_date)) || y.id - x.id);
      const off = Number(b.offset ?? 0);
      hit = hit.slice(off, b.limit ? off + Number(b.limit) : undefined);
      return json(hit.map((r) => Object.fromEntries((b.fields ?? Object.keys(r)).map((f: string) => [f, r[f] ?? false]))));
    }
    if (method === 'write') {
      if (ctl.take('badfield')) return err(422, 'odoo.exceptions.ValidationError', 'The expected closing date must be a valid date');
      const bad = Object.keys(b.vals ?? {}).find((k) => k === 'probability_text');
      if (bad) return err(422, 'builtins.ValueError', `Invalid field '${bad}'`);
      for (const id of b.ids ?? []) {
        const r = rows.find((x) => x.id === id);
        if (!r) return err(404, 'odoo.exceptions.MissingError', 'Record does not exist or has been deleted.');
        for (const [k, v] of Object.entries<any>(b.vals)) r[k] = (k === 'partner_id' || k === 'parent_id' || k === 'user_id' || k === 'stage_id') && typeof v === 'number' ? [v, String(v)] : v;
        r.write_date = odooNow(ctl.now());
      }
      return json(true);
    }
    if (method === 'create') {
      const ids = (b.vals_list ?? []).map((v: R) => {
        const id = ++seq;
        rows.push({ id, active: true, ...Object.fromEntries(Object.entries(v).map(([k, x]) => [k, (k === 'partner_id' || k === 'parent_id' || k === 'user_id') && typeof x === 'number' ? [x, String(x)] : x])), write_date: odooNow(ctl.now()) });
        return id;
      });
      return json(ids);
    }
    return err(404, 'builtins.AttributeError', `The method '${method}' does not exist on the model '${model}'`);
  },
};
