// Zoho CRM API v6 as documented: OAuth on the account's own data centre (the callback carries
// `accounts-server`; this mock is an EU account: accounts.zoho.eu, www.zohoapis.eu), the
// `Zoho-oauthtoken` header, records with page_token pages and info.more_records, If-Modified-Since for
// "changed since" (304 Not Modified when nothing changed), writes as { data: [...] } with a per-record
// status; errors as { code, message, status: 'error' }; 429 TOO_MANY_REQUESTS.
import { allow, json, tokenEndpoint, type Ctl, type MockReq, type VendorMock } from './kit';

const API = 'https://www.zohoapis.eu';
const PAGE = 2;
let db: Record<string, any[]> = {};
let seq = 7000;
const FIELDS: Record<string, any[]> = {
  Accounts: [
    { api_name: 'Account_Name', field_label: 'Account Name', data_type: 'text', system_mandatory: true },
    { api_name: 'Website', field_label: 'Website', data_type: 'website' },
    { api_name: 'Owner', field_label: 'Account Owner', data_type: 'ownerlookup' },
    { api_name: 'Modified_Time', field_label: 'Modified Time', data_type: 'datetime', read_only: true },
  ],
  Contacts: [
    { api_name: 'First_Name', field_label: 'First Name', data_type: 'text' },
    { api_name: 'Last_Name', field_label: 'Last Name', data_type: 'text', system_mandatory: true },
    { api_name: 'Email', field_label: 'Email', data_type: 'email' },
    { api_name: 'Account_Name', field_label: 'Account Name', data_type: 'lookup', lookup: { module: { api_name: 'Accounts' } } },
  ],
  Deals: [
    { api_name: 'Deal_Name', field_label: 'Deal Name', data_type: 'text', system_mandatory: true },
    { api_name: 'Amount', field_label: 'Amount', data_type: 'currency' },
    { api_name: 'Closing_Date', field_label: 'Closing Date', data_type: 'date' },
    { api_name: 'Stage', field_label: 'Stage', data_type: 'picklist', pick_list_values: [{ actual_value: 'Qualification', display_value: 'Qualification' }, { actual_value: 'Closed Won', display_value: 'Closed Won' }] },
    { api_name: 'Account_Name', field_label: 'Account Name', data_type: 'lookup', lookup: { module: { api_name: 'Accounts' } } },
  ],
};
const err = (status: number, code: string, message: string) => json({ code, details: {}, message, status: 'error' }, status);
const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, '+00:00');

export const zohoMock: VendorMock = {
  id: 'zoho',
  hosts: /^(accounts\.zoho\.(com|eu)|www\.zohoapis\.eu)$/,
  reset() {
    const t = '2026-11-18T08:00:00+00:00';
    db = {
      Accounts: [
        { id: '5725767000000411001', Account_Name: 'Pinecrest Foods', Website: 'pinecrest.example', Owner: { id: '57001', email: 'ada@demo.example' }, Modified_Time: t },
        { id: '5725767000000411002', Account_Name: 'Orbital Freight', Website: null, Owner: { id: '57002', email: 'nobody@elsewhere.example' }, Modified_Time: t },
      ],
      Contacts: [{ id: '5725767000000412001', First_Name: 'Selin', Last_Name: 'Akar', Email: 'selin@pinecrest.example', Account_Name: { id: '5725767000000411001', name: 'Pinecrest Foods' }, Modified_Time: t }],
      Deals: [{ id: '5725767000000413001', Deal_Name: 'Pinecrest renewal', Amount: 24000, Closing_Date: '2026-12-15', Stage: 'Qualification', Account_Name: { id: '5725767000000411001', name: 'Pinecrest Foods' }, Modified_Time: t }],
    };
  },
  // An EU account: Zoho sends the browser back with its own data centre.
  consent: (u, ctl) => allow('zoho', u, ctl, { location: 'eu', 'accounts-server': 'https://accounts.zoho.eu' }),
  remoteEdit(ctl, name) {
    const r = db.Accounts[1];
    r.Account_Name = name;
    r.Modified_Time = iso(ctl.now());
    return { id: r.id };
  },
  remoteRow: (object, id) => db[object]?.find((r) => r.id === id),
  async handle(req: MockReq, ctl: Ctl) {
    const p = req.url.pathname;
    if (req.url.host.startsWith('accounts.zoho')) {
      // A token asked of the wrong data centre is refused, as Zoho does.
      if (req.url.host !== 'accounts.zoho.eu') return json({ error: 'invalid_code' }, 200);
      return p === '/oauth/v2/token' ? tokenEndpoint('zoho', req, ctl, () => ({ api_domain: API, token_type: 'Bearer' })) : err(404, 'NOT_FOUND', 'not found');
    }
    const auth = req.headers.get('authorization');
    if (!auth?.startsWith('Zoho-oauthtoken ') || ctl.revoked() || !ctl.tokens.valid('zoho', auth)) return err(401, 'INVALID_TOKEN', 'invalid oauth token');
    if (ctl.take('expired')) {
      ctl.tokens.forget('zoho');
      return err(401, 'INVALID_TOKEN', 'invalid oauth token');
    }
    if (ctl.take('ratelimit')) return err(429, 'TOO_MANY_REQUESTS', 'The number of requests you have made has exceeded the allowed limit.');
    const m = /^\/crm\/v6\/(.+)$/.exec(p);
    if (!m) return err(404, 'INVALID_URL_PATTERN', 'Please check if the URL trying to access is a correct one');
    const path = m[1];
    if (path === 'org') return json({ org: [{ id: '20099001', company_name: 'Quillfield Ltd' }] });
    if (path === 'settings/modules') return json({ modules: Object.keys(FIELDS).map((n) => ({ api_name: n, singular_label: n.slice(0, -1), plural_label: n, api_supported: true, generated_type: 'default' })) });
    if (path === 'settings/fields') {
      const f = FIELDS[req.url.searchParams.get('module') ?? ''];
      return f ? json({ fields: f }) : err(400, 'INVALID_MODULE', 'the module name given seems to be invalid');
    }
    if (path === 'users') return json({ users: [{ id: '57001', full_name: 'Ada Demo', email: 'ada@demo.example', status: 'active' }, { id: '57002', full_name: 'Nobody', email: 'nobody@elsewhere.example', status: 'active' }], info: { more_records: false } });
    const [module, rest] = path.split('/');
    if (!db[module]) return err(400, 'INVALID_MODULE', 'the module name given seems to be invalid');
    if (rest === 'deleted') return req.headers.get('if-modified-since') ? new Response(null, { status: 304 }) : json({ data: [], info: { more_records: false } });
    if (req.method === 'GET') {
      const since = req.headers.get('if-modified-since');
      const rows = db[module].filter((r) => !since || Date.parse(r.Modified_Time) >= Date.parse(since)).sort((a, b) => Date.parse(a.Modified_Time) - Date.parse(b.Modified_Time));
      if (!rows.length) return new Response(null, { status: since ? 304 : 204 });
      const tok = req.url.searchParams.get('page_token');
      const from = tok ? Number(tok.replace('pt-', '')) : 0;
      const want = (req.url.searchParams.get('fields') ?? '').split(',').filter(Boolean);
      const slice = rows.slice(from, from + PAGE).map((r) => ({ id: r.id, ...Object.fromEntries(want.map((k) => [k, r[k] ?? null])) }));
      const more = from + PAGE < rows.length;
      return json({ data: slice, info: { per_page: PAGE, count: slice.length, more_records: more, ...(more ? { next_page_token: `pt-${from + PAGE}` } : {}) } });
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const rec = req.body?.data?.[0] ?? {};
      if (ctl.take('badfield')) return json({ data: [{ code: 'INVALID_DATA', details: { api_name: 'Website' }, message: 'invalid data', status: 'error' }] }, 202);
      if (req.method === 'PUT') {
        const row = db[module].find((r) => r.id === rec.id);
        if (!row) return json({ data: [{ code: 'INVALID_DATA', details: { id: rec.id }, message: 'the related id given seems to be invalid', status: 'error' }] }, 202);
        Object.assign(row, rec, { Modified_Time: iso(ctl.now()) });
        return json({ data: [{ code: 'SUCCESS', details: { id: row.id, Modified_Time: row.Modified_Time }, message: 'record updated', status: 'success' }] });
      }
      const id = `57257670000004${++seq}`;
      db[module].push({ id, ...rec, Modified_Time: iso(ctl.now()) });
      return json({ data: [{ code: 'SUCCESS', details: { id }, message: 'record added', status: 'success' }] }, 201);
    }
    return err(405, 'METHOD_NOT_ALLOWED', 'method not allowed');
  },
};
