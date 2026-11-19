// Salesforce REST API v62.0 as documented: OAuth web-server flow with PKCE (login. / test.salesforce.com),
// instance URL and identity URL in the token answer, SOQL query with nextRecordsUrl pages, describe,
// PATCH/POST on sobjects, errors as [{ message, errorCode }]. Daily API limit: 403 REQUEST_LIMIT_EXCEEDED;
// concurrent-request limit: 429-less too, so the rate-limit fault answers the documented 403 shape.
import { allow, gate, iso, json, tokenEndpoint, type Ctl, type MockReq, type VendorMock } from './kit';

const INSTANCE = 'https://quillfield.my.salesforce.com';
const ORG = 'mock-org-quillfield';
const PAGE = 2; // small pages so pagination is exercised

type Row = Record<string, any>;
let db: Record<string, Row[]> = {};
let seq = 100;

const DESCRIBE: Record<string, any[]> = {
  Account: [
    { name: 'Id', label: 'Account ID', type: 'id', updateable: false, createable: false, nillable: false },
    { name: 'Name', label: 'Account Name', type: 'string', updateable: true, createable: true, nillable: false },
    { name: 'Website', label: 'Website', type: 'url', updateable: true, createable: true, nillable: true },
    { name: 'AnnualRevenue', label: 'Annual Revenue', type: 'currency', updateable: true, createable: true, nillable: true },
    { name: 'OwnerId', label: 'Owner ID', type: 'reference', referenceTo: ['User'], updateable: true, createable: true, nillable: false, defaultedOnCreate: true },
    { name: 'SystemModstamp', label: 'System Modstamp', type: 'datetime', updateable: false, createable: false, nillable: false },
  ],
  Contact: [
    { name: 'Id', label: 'Contact ID', type: 'id', updateable: false, createable: false, nillable: false },
    { name: 'Name', label: 'Full Name', type: 'string', updateable: false, createable: false, nillable: false },
    { name: 'FirstName', label: 'First Name', type: 'string', updateable: true, createable: true, nillable: true },
    { name: 'LastName', label: 'Last Name', type: 'string', updateable: true, createable: true, nillable: false },
    { name: 'Email', label: 'Email', type: 'email', updateable: true, createable: true, nillable: true },
    { name: 'AccountId', label: 'Account ID', type: 'reference', referenceTo: ['Account'], updateable: true, createable: true, nillable: true },
    { name: 'SystemModstamp', label: 'System Modstamp', type: 'datetime', updateable: false, createable: false, nillable: false },
  ],
  Opportunity: [
    { name: 'Id', label: 'Opportunity ID', type: 'id', updateable: false, createable: false, nillable: false },
    { name: 'Name', label: 'Name', type: 'string', updateable: true, createable: true, nillable: false },
    { name: 'Amount', label: 'Amount', type: 'currency', updateable: true, createable: true, nillable: true },
    { name: 'CloseDate', label: 'Close Date', type: 'date', updateable: true, createable: true, nillable: false },
    { name: 'StageName', label: 'Stage', type: 'picklist', updateable: true, createable: true, nillable: false, picklistValues: [{ value: 'Prospecting', label: 'Prospecting', active: true }, { value: 'Closed Won', label: 'Closed Won', active: true }, { value: 'Closed Lost', label: 'Closed Lost', active: true }] },
    { name: 'AccountId', label: 'Account ID', type: 'reference', referenceTo: ['Account'], updateable: true, createable: true, nillable: true },
    { name: 'SystemModstamp', label: 'System Modstamp', type: 'datetime', updateable: false, createable: false, nillable: false },
  ],
};

const err = (status: number, errorCode: string, message: string, fields: string[] = []) => json([{ message, errorCode, fields }], status);
const unauthorized = () => err(401, 'INVALID_SESSION_ID', 'Session expired or invalid');
const limited = () => err(403, 'REQUEST_LIMIT_EXCEEDED', 'TotalRequests Limit exceeded.');

function soql(q: string) {
  const m = /^SELECT (.+) FROM (\w+)(?: WHERE SystemModstamp >= (\S+))?(?: ORDER BY \w+ \w+)?$/i.exec(q.trim());
  if (!m) return null;
  return { fields: m[1].split(',').map((s) => s.trim()), object: m[2], since: m[3] ?? null };
}

const cursors = new Map<string, Row[]>();
function page(rows: Row[], fields: string[], object: string, from: number) {
  // Contact.Name is Salesforce's compound name, worked out from the parts.
  const full = (r: Row) => (object === 'Contact' ? { ...r, Name: [r.FirstName, r.LastName].filter(Boolean).join(' ') } : r);
  const slice = rows.slice(from, from + PAGE).map(full).map((r) => ({ attributes: { type: object, url: `/services/data/v62.0/sobjects/${object}/${r.Id}` }, ...Object.fromEntries(fields.map((f) => [f, r[f] ?? null])) }));
  const more = from + PAGE < rows.length;
  let nextRecordsUrl: string | undefined;
  if (more) {
    const id = `mock-cursor-${Math.random().toString(36).slice(2, 8)}-${from + PAGE}`;
    cursors.set(id, rows);
    nextRecordsUrl = `/services/data/v62.0/query/${id}`;
    (cursors as any)[`f:${id}`] = { fields, object };
  }
  return { totalSize: rows.length, done: !more, records: slice, ...(nextRecordsUrl ? { nextRecordsUrl } : {}) };
}

export const salesforceMock: VendorMock = {
  id: 'salesforce',
  hosts: /^(login|test)\.salesforce\.com$|^quillfield\.my\.salesforce\.com$/,
  reset() {
    const t = (m: number) => iso(new Date(Date.parse('2026-11-18T08:00:00Z') + m * 60_000));
    db = {
      Account: [
        { Id: 'mock-acc-1', Name: 'Pinecrest Foods', Website: 'https://pinecrest.example', AnnualRevenue: 1200000, OwnerId: 'mock-usr-1', SystemModstamp: t(1) },
        { Id: 'mock-acc-2', Name: 'Orbital Freight', Website: 'https://orbital.example', AnnualRevenue: 450000, OwnerId: 'mock-usr-2', SystemModstamp: t(2) },
        { Id: 'mock-acc-3', Name: 'Larkspur Clinics', Website: null, AnnualRevenue: null, OwnerId: 'mock-usr-1', SystemModstamp: t(3) },
      ],
      Contact: [{ Id: 'mock-con-1', FirstName: 'Selin', LastName: 'Akar', Email: 'selin@pinecrest.example', AccountId: 'mock-acc-1', SystemModstamp: t(4) }],
      Opportunity: [{ Id: 'mock-opp-1', Name: 'Pinecrest renewal', Amount: 24000, CloseDate: '2026-12-15', StageName: 'Prospecting', AccountId: 'mock-acc-1', SystemModstamp: t(5) }],
      User: [
        { Id: 'mock-usr-1', Name: 'Ada Demo', Email: 'ada@demo.example' },
        { Id: 'mock-usr-2', Name: 'Nobody Here', Email: 'nobody@elsewhere.example' },
      ],
    };
  },
  consent: (u, ctl) => allow('salesforce', u, ctl),
  remoteEdit(ctl, name) {
    const r = db.Account[1];
    r.Name = name;
    r.SystemModstamp = iso(ctl.now());
    return { id: r.Id };
  },
  remoteRow: (object, id) => db[object]?.find((r) => r.Id === id),
  async handle(req: MockReq, ctl: Ctl) {
    const p = req.url.pathname;
    if (p === '/services/oauth2/token') return tokenEndpoint('salesforce', req, ctl, () => ({ instance_url: INSTANCE, id: `https://login.salesforce.com/id/${ORG}/mock-usr-1`, signature: 'x', issued_at: String(ctl.now().getTime()) }));
    if (req.url.host !== 'quillfield.my.salesforce.com') return err(404, 'NOT_FOUND', 'The requested resource does not exist');
    const stop = gate('salesforce', req, ctl, { unauthorized, limited });
    if (stop) return stop;
    const base = '/services/data/v62.0';
    if (p === `${base}/sobjects`) return json({ encoding: 'UTF-8', sobjects: [['Account', 'Accounts'], ['Contact', 'Contacts'], ['Opportunity', 'Opportunities']].map(([n, plural]) => ({ name: n, label: n, labelPlural: plural, queryable: true, retrieveable: true, deprecatedAndHidden: false, custom: false })) });
    const d = new RegExp(`^${base}/sobjects/(\\w+)/describe$`).exec(p);
    if (d) return DESCRIBE[d[1]] ? json({ name: d[1], fields: DESCRIBE[d[1]] }) : err(404, 'NOT_FOUND', 'The requested resource does not exist');
    if (p === `${base}/query`) {
      const q = req.url.searchParams.get('q') ?? '';
      if (/FROM Organization/.test(q)) return json({ totalSize: 1, done: true, records: [{ Name: 'Quillfield Ltd' }] });
      if (/FROM User/.test(q)) return json({ totalSize: db.User.length, done: true, records: db.User });
      const s = soql(q);
      if (!s || !db[s.object]) return err(400, 'MALFORMED_QUERY', `unexpected token: ${q.slice(0, 40)}`);
      const unknown = s.fields.find((f) => f !== 'Id' && f !== 'SystemModstamp' && !DESCRIBE[s.object].some((x) => x.name === f));
      if (unknown) return err(400, 'INVALID_FIELD', `No such column '${unknown}' on entity '${s.object}'.`);
      const since = s.since ? Date.parse(s.since) : 0;
      const rows = db[s.object].filter((r) => Date.parse(r.SystemModstamp) >= since).sort((a, b) => Date.parse(a.SystemModstamp) - Date.parse(b.SystemModstamp));
      return json(page(rows, s.fields, s.object, 0));
    }
    const nx = new RegExp(`^${base}/query/([\\w-]+)$`).exec(p);
    if (nx) {
      const rows = cursors.get(nx[1]);
      const meta = (cursors as any)[`f:${nx[1]}`];
      if (!rows) return err(400, 'INVALID_QUERY_LOCATOR', 'invalid query locator');
      return json(page(rows, meta.fields, meta.object, Number(nx[1].split('-').pop())));
    }
    const del = new RegExp(`^${base}/sobjects/(\\w+)/deleted/$`).exec(p);
    if (del) return json({ deletedRecords: [], earliestDateAvailable: '2026-10-01T00:00:00.000+0000', latestDateCovered: iso(ctl.now()) });
    const one = new RegExp(`^${base}/sobjects/(\\w+)(?:/([\\w-]+))?$`).exec(p);
    if (one && (req.method === 'PATCH' || req.method === 'POST')) {
      const [, object, id] = one;
      if (ctl.take('badfield')) return err(400, 'FIELD_CUSTOM_VALIDATION_EXCEPTION', 'Website must start with https://', ['Website']);
      const bad = Object.keys(req.body ?? {}).find((k) => !DESCRIBE[object]?.some((f) => f.name === k && (req.method === 'PATCH' ? f.updateable : f.createable)));
      if (bad) return err(400, 'INVALID_FIELD_FOR_INSERT_UPDATE', `Unable to create/update fields: ${bad}. Please check the security settings of this field.`, [bad]);
      if (req.method === 'PATCH') {
        const row = db[object]?.find((r) => r.Id === id);
        if (!row) return err(404, 'NOT_FOUND', 'Provided external ID field does not exist or is not accessible');
        Object.assign(row, req.body, { SystemModstamp: iso(ctl.now()) });
        return new Response(null, { status: 204 });
      }
      const nid = `mock-new-${object.toLowerCase()}-${++seq}`;
      db[object].push({ Id: nid, ...req.body, SystemModstamp: iso(ctl.now()) });
      return json({ id: nid, success: true, errors: [] }, 201);
    }
    return err(404, 'NOT_FOUND', 'The requested resource does not exist');
  },
};
