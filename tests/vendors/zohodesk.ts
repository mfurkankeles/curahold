// Zoho Desk API v1 + Zoho accounts, as documented (desk.zoho.com/DeskAPIDocument): the sign-in comes back with
// accounts-server naming the data centre (EU here); every call but /organizations carries `orgId`, a wrong one
// answers OAUTH_ORG_MISMATCH. Lists are { data: [...] } offset pages (`from`, `limit` ≤ 50 here, so paging is used);
// changed tickets come from /tickets/search with modifiedTimeRange. Errors { errorCode, message }; 429
// TOO_MANY_REQUESTS with Retry-After when the day's credits are spent. Auth header "Zoho-oauthtoken <token>".
import { allow, gate, json, tokenEndpoint, type Ctl, type MockReq, type VendorMock } from './kit';

export const ZD_ORG = '20079258';
const PAGE_MAX = 50;
type T = Record<string, any>;
let tickets: T[] = [];
let accounts: T[] = [];
let seq = 900;
export const zdComments: T[] = [];

const zerr = (status: number, errorCode: string, message: string, headers: Record<string, string> = {}) => json({ errorCode, message }, status, headers);

export const zohodeskMock: VendorMock = {
  id: 'zohodesk',
  hosts: /^(accounts\.zoho\.(com|eu)|desk\.zoho\.(com|eu))$/,
  reset() {
    const t = (d: number) => new Date(Date.parse('2026-11-17T08:00:00Z') + d * 3_600_000).toISOString().replace(/\.\d{3}Z$/, '.000Z');
    accounts = [
      { id: '5001', accountName: 'Pinecrest Foods', website: 'https://pinecrest.example', email: null, modifiedTime: t(1) },
      { id: '5002', accountName: 'Orbital Freight', website: 'orbital.example', email: 'ops@orbital.example', modifiedTime: t(2) },
    ];
    tickets = [
      { id: '7001', ticketNumber: '101', subject: 'Invoice PDF is blank', status: 'Open', statusType: 'Open', priority: 'High', createdTime: t(3), modifiedTime: t(3), closedTime: null, channel: 'Email', email: 'selin@pinecrest.example', accountId: '5001', assigneeId: '9001', webUrl: 'https://desk.zoho.eu/support/quillfield/ShowHomePage.do#Cases/dv/7001' },
      { id: '7002', ticketNumber: '102', subject: 'Cannot add a user', status: 'On Hold', statusType: 'On Hold', priority: 'Medium', createdTime: t(4), modifiedTime: t(4), closedTime: null, channel: 'Web', email: 'ops@orbital.example', accountId: '5002', assigneeId: null, webUrl: null },
      { id: '7003', ticketNumber: '103', subject: 'Thanks for the call', status: 'Closed', statusType: 'Closed', priority: 'Low', createdTime: t(5), modifiedTime: t(6), closedTime: t(6), channel: 'Phone', email: 'selin@pinecrest.example', accountId: '5001', assigneeId: '9001', webUrl: null },
    ];
    zdComments.length = 0;
    seq = 900;
  },
  consent: (u, ctl) => allow('zohodesk', u, ctl, { 'accounts-server': 'https://accounts.zoho.eu', location: 'eu' }),
  /** The second ticket is closed in Zoho Desk (and renamed). */
  remoteEdit(ctl, name) {
    const t = tickets[1];
    t.subject = name;
    t.status = 'Closed';
    t.statusType = 'Closed';
    t.closedTime = t.modifiedTime = ctl.now().toISOString();
    return { id: t.id };
  },
  remoteRow: (_o, id) => tickets.find((t) => t.id === id),
  async handle(req: MockReq, ctl: Ctl) {
    const p = req.url.pathname;
    if (/^accounts\.zoho\./.test(req.url.host)) {
      if (p !== '/oauth/v2/token') return zerr(404, 'URL_NOT_FOUND', 'The URL you requested could not be found');
      if (req.url.host !== 'accounts.zoho.eu') return json({ error: 'invalid_code' }, 200);
      return tokenEndpoint('zohodesk', req, ctl, () => ({ api_domain: 'https://www.zohoapis.eu', token_type: 'Bearer' }));
    }
    if (req.url.host !== 'desk.zoho.eu') return zerr(401, 'INVALID_OAUTH', 'The OAuth Token you provided is invalid.');
    const stop = gate('zohodesk', req, ctl, { unauthorized: () => zerr(401, 'INVALID_OAUTH', 'The OAuth Token you provided is invalid.'), limited: () => zerr(429, 'TOO_MANY_REQUESTS', 'API credits exhausted for the day', { 'retry-after': '30' }) });
    if (stop) return stop;
    if (p === '/api/v1/organizations') return json({ data: [{ id: ZD_ORG, companyName: 'Quillfield Support', portalName: 'quillfield', isDefault: true }] });
    if (req.headers.get('orgid') !== ZD_ORG) return zerr(400, 'OAUTH_ORG_MISMATCH', 'The orgId does not match the token');
    const q = req.url.searchParams;
    const from = Number(q.get('from') ?? 1);
    const limit = Number(q.get('limit') ?? 10);
    if (limit > PAGE_MAX || from < 1) return zerr(422, 'UNPROCESSABLE_ENTITY', 'limit must be at most 50');
    const page = <X>(rows: X[]) => rows.slice(from - 1, from - 1 + limit);
    if (p === '/api/v1/departments') return json({ data: [{ id: '3001', name: 'Support', isDefault: true, isEnabled: true }] });
    if (p === '/api/v1/agents') return json({ data: from > 1 ? [] : [{ id: '9001', name: 'Ada Demo', emailId: 'ada@demo.example' }, { id: '9002', name: 'Elsewhere', emailId: 'nobody@elsewhere.example' }] });
    if (p === '/api/v1/accounts') return json({ data: page([...accounts].sort((a, b) => Date.parse(b.modifiedTime) - Date.parse(a.modifiedTime))) });
    if (p === '/api/v1/tickets' && req.method === 'GET') return json({ data: page([...tickets].sort((a, b) => Date.parse(a.createdTime) - Date.parse(b.createdTime)).map(({ modifiedTime: _m, ...t }) => t)) });
    if (p === '/api/v1/tickets/search') {
      const [a, b] = String(q.get('modifiedTimeRange') ?? '').split(',').map((x) => Date.parse(x));
      if (!Number.isFinite(a) || !Number.isFinite(b)) return zerr(422, 'UNPROCESSABLE_ENTITY', 'modifiedTimeRange is invalid');
      const hit = tickets.filter((t) => Date.parse(t.modifiedTime) >= a && Date.parse(t.modifiedTime) <= b);
      // Zoho answers 204 when the search finds nothing.
      if (!hit.length) return new Response(null, { status: 204 });
      return json({ data: page(hit), count: hit.length });
    }
    const one = /^\/api\/v1\/tickets\/(\d+)$/.exec(p);
    if (one && req.method === 'PATCH') {
      const t = tickets.find((x) => x.id === one[1]);
      if (!t) return zerr(404, 'URL_NOT_FOUND', 'The URL you requested could not be found');
      if (ctl.take('badfield') || (req.body.status && !['Open', 'On Hold', 'Escalated', 'Closed'].includes(req.body.status))) return json({ errorCode: 'INVALID_DATA', message: 'An invalid value was given for the status field', errors: [{ fieldName: '/status', errorType: 'invalid' }] }, 422);
      Object.assign(t, req.body, { modifiedTime: ctl.now().toISOString() });
      if (req.body.status) t.statusType = req.body.status === 'Closed' ? 'Closed' : req.body.status === 'On Hold' ? 'On Hold' : 'Open';
      return json(t);
    }
    if (p === '/api/v1/tickets' && req.method === 'POST') {
      if (!req.body?.departmentId || !req.body?.subject || !req.body?.contact?.email) return json({ errorCode: 'INVALID_DATA', message: 'departmentId is required', errors: [{ fieldName: '/departmentId', errorType: 'missing' }] }, 422);
      const t = { id: String(++seq), ticketNumber: String(seq), subject: req.body.subject, status: 'Open', statusType: 'Open', priority: req.body.priority ?? 'Medium', createdTime: ctl.now().toISOString(), modifiedTime: ctl.now().toISOString(), email: req.body.contact.email, accountId: null, assigneeId: req.body.assigneeId ?? null };
      tickets.push(t);
      return json(t);
    }
    const cm = /^\/api\/v1\/tickets\/(\d+)\/comments$/.exec(p);
    if (cm && req.method === 'POST') {
      zdComments.push({ ticket: cm[1], ...req.body });
      return json({ id: `c${zdComments.length}`, ...req.body });
    }
    return zerr(404, 'URL_NOT_FOUND', 'The URL you requested could not be found');
  },
};
