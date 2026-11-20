// Pipedrive API v1 as documented: OAuth (oauth.pipedrive.com, Basic client auth, api_domain in the token answer),
// { success, data, additional_data.pagination } answers with start/limit pages, /recents for "changed since",
// update_time as "YYYY-MM-DD HH:MM:SS" UTC, errors as { success: false, error, errorCode }; 429 with
// x-ratelimit-* headers.
import { allow, gate, json, tokenEndpoint, type Ctl, type MockReq, type VendorMock } from './kit';

const API = 'https://quillfield.pipedrive.com';
let db: Record<string, any[]> = {};
let seq = 900;
const FIELDS: Record<string, any[]> = {
  organizationFields: [
    { key: 'id', name: 'ID', field_type: 'int' },
    { key: 'name', name: 'Name', field_type: 'varchar', edit_flag: false },
    { key: 'owner_id', name: 'Owner', field_type: 'user' },
    { key: 'update_time', name: 'Update time', field_type: 'date' },
  ],
  personFields: [
    { key: 'id', name: 'ID', field_type: 'int' },
    { key: 'name', name: 'Name', field_type: 'varchar' },
    { key: 'email', name: 'Email', field_type: 'varchar' },
    { key: 'org_id', name: 'Organization', field_type: 'org' },
  ],
  dealFields: [
    { key: 'id', name: 'ID', field_type: 'int' },
    { key: 'title', name: 'Title', field_type: 'varchar' },
    { key: 'value', name: 'Value', field_type: 'monetary' },
    { key: 'expected_close_date', name: 'Expected close date', field_type: 'date' },
    { key: 'status', name: 'Status', field_type: 'status', options: [{ id: 'open', label: 'Open' }, { id: 'won', label: 'Won' }, { id: 'lost', label: 'Lost' }] },
    { key: 'org_id', name: 'Organization', field_type: 'org' },
  ],
  activityFields: [{ key: 'id', name: 'ID', field_type: 'int' }, { key: 'subject', name: 'Subject', field_type: 'varchar' }],
};
const SINGULAR: Record<string, string> = { organizations: 'organization', persons: 'person', deals: 'deal', activities: 'activity' };
const stamp = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 19);
const err = (status: number, error: string, errorCode = status) => json({ success: false, error, errorCode, error_info: 'Please check developers.pipedrive.com for more information about Pipedrive API.' }, status);
const unauthorized = () => err(401, 'Invalid token: access token is invalid or expired');
const limited = () => json({ success: false, error: 'Request over limit', errorCode: 429 }, 429, { 'x-ratelimit-limit': '80', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '2', 'retry-after': '2' });
const page = (rows: any[], start: number, limit: number) => ({ success: true, data: rows.slice(start, start + limit), additional_data: { pagination: { start, limit, more_items_in_collection: start + limit < rows.length, ...(start + limit < rows.length ? { next_start: start + limit } : {}) } } });

export const pipedriveMock: VendorMock = {
  id: 'pipedrive',
  hosts: /^(oauth\.pipedrive\.com|quillfield\.pipedrive\.com)$/,
  reset() {
    const t = '2026-11-18 08:00:00';
    db = {
      organizations: [
        { id: 1, name: 'Pinecrest Foods', owner_id: { id: 10, email: 'ada@demo.example' }, update_time: t },
        { id: 2, name: 'Orbital Freight', owner_id: { id: 11, email: 'nobody@elsewhere.example' }, update_time: t },
      ],
      persons: [{ id: 21, name: 'Selin Akar', email: [{ value: 'selin@pinecrest.example', primary: true }], org_id: { value: 1, name: 'Pinecrest Foods' }, update_time: t }],
      deals: [{ id: 31, title: 'Pinecrest renewal', value: 24000, currency: 'EUR', expected_close_date: '2026-12-15', status: 'open', org_id: { value: 1, name: 'Pinecrest Foods' }, update_time: t }],
      activities: [],
    };
  },
  consent: (u, ctl) => allow('pipedrive', u, ctl),
  remoteEdit(ctl, name) {
    const r = db.organizations[1];
    r.name = name;
    r.update_time = stamp(ctl.now());
    return { id: String(r.id) };
  },
  remoteRow: (object, id) => db[object]?.find((r) => String(r.id) === id),
  async handle(req: MockReq, ctl: Ctl) {
    const p = req.url.pathname;
    if (req.url.host === 'oauth.pipedrive.com') {
      // Pipedrive wants the client in a Basic header, not in the form.
      if (!req.headers.get('authorization')?.startsWith('Basic ')) return json({ success: false, message: 'Invalid client' }, 401);
      return p === '/oauth/token' ? tokenEndpoint('pipedrive', req, ctl, () => ({ api_domain: API, scope: 'base,deals:full,contacts:full' })) : err(404, 'Not found');
    }
    const stop = gate('pipedrive', req, ctl, { unauthorized, limited });
    if (stop) return stop;
    const m = /^\/api\/v1\/(\w+)(?:\/(\w+))?$/.exec(p);
    if (!m) return err(404, 'Unknown method .');
    const [, what, id] = m;
    const q = req.url.searchParams;
    if (what === 'users' && id === 'me') return json({ success: true, data: { id: 10, email: 'ada@demo.example', company_id: 4242, company_name: 'Quillfield Ltd' } });
    if (what === 'users') return json({ success: true, data: [{ id: 10, name: 'Ada Demo', email: 'ada@demo.example', active_flag: true }, { id: 11, name: 'Nobody', email: 'nobody@elsewhere.example', active_flag: true }] });
    if (FIELDS[what]) return json({ success: true, data: FIELDS[what] });
    if (what === 'stages') return json({ success: true, data: [{ id: 1, name: 'Qualified', pipeline_name: 'Sales' }] });
    if (what === 'recents') {
      const since = Date.parse(`${q.get('since_timestamp')!.replace(' ', 'T')}Z`);
      const obj = Object.keys(SINGULAR).find((k) => SINGULAR[k] === q.get('items'))!;
      const rows = db[obj].filter((r) => Date.parse(`${r.update_time.replace(' ', 'T')}Z`) >= since).map((r) => ({ item: SINGULAR[obj], id: r.id, data: r }));
      return json(page(rows, Number(q.get('start') ?? 0), Number(q.get('limit') ?? 100)));
    }
    if (!db[what]) return err(404, 'Unknown method .');
    if (req.method === 'GET') return json(page([...db[what]].sort((a, b) => b.update_time.localeCompare(a.update_time)), Number(q.get('start') ?? 0), Number(q.get('limit') ?? 100)));
    if (ctl.take('badfield')) return err(400, 'Invalid field: name must not be empty', 400);
    if (req.method === 'PUT') {
      const row = db[what].find((r) => String(r.id) === id);
      if (!row) return err(404, 'Item not found');
      Object.assign(row, req.body, { update_time: stamp(ctl.now()) });
      return json({ success: true, data: row });
    }
    if (req.method === 'POST') {
      const row = { id: ++seq, ...req.body, update_time: stamp(ctl.now()) };
      db[what].push(row);
      return json({ success: true, data: row }, 201);
    }
    return err(405, 'Method not allowed');
  },
};
