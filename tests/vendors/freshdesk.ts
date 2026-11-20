// Freshdesk API v2 as documented: Basic auth with "<API key>:X", /agents/me, plain JSON arrays with page/per_page
// (a full page means "there may be more"), tickets?updated_since with include=requester, numeric status (2 open,
// 3 pending, 4 resolved, 5 closed) and priority (1 low … 4 urgent); errors as { description, errors: [{ field,
// message, code }] }; 429 with Retry-After and X-RateLimit-* headers.
import { json, type Ctl, type MockReq, type VendorMock } from './kit';

const DOMAIN = 'quillfield';
const AUTH = `Basic ${btoa('fd-mock-key-1:X')}`;
let companies: any[] = [];
let tickets: any[] = [];
const replies: any[] = [];

export const freshdeskMock: VendorMock = {
  id: 'freshdesk',
  hosts: new RegExp(`^${DOMAIN}\\.freshdesk\\.com$`),
  keyValues: { domain: DOMAIN, token: 'fd-mock-key-1' },
  reset() {
    const t = '2026-11-18T08:00:00Z';
    companies = [{ id: 21, name: 'Cedarmoor Health', domains: [], updated_at: t }, { id: 23, name: 'HLB Group', domains: ['harborline.example'], updated_at: t }];
    tickets = [
      { id: 101, subject: 'Export stops halfway', status: 2, priority: 3, source: 1, created_at: t, updated_at: t, company_id: 21, responder_id: null, requester: { email: 'nora@cedarmoor.example' }, stats: {} },
      { id: 102, subject: 'Invoice address', status: 4, priority: 1, source: 2, created_at: t, updated_at: t, company_id: 23, responder_id: null, requester: { email: 'defne@harborline.example' }, stats: { resolved_at: t } },
    ];
    replies.length = 0;
  },
  remoteEdit(ctl, name) {
    tickets[0].subject = name;
    tickets[0].updated_at = ctl.now().toISOString();
    return { id: '101' };
  },
  remoteRow: (_o, id) => tickets.find((t) => String(t.id) === id),
  handle(req: MockReq, ctl: Ctl) {
    if (ctl.revoked() || req.headers.get('authorization') !== AUTH) return json({ code: 'invalid_credentials', message: 'You have to be logged in to perform this action.' }, 401);
    if (ctl.take('ratelimit')) return json({ code: 'rate_limit_exceeded', message: 'You have exceeded the limit of requests per minute' }, 429, { 'retry-after': '40', 'x-ratelimit-total': '200', 'x-ratelimit-remaining': '0' });
    const p = req.url.pathname.replace(/^\/api\/v2\//, '');
    const q = req.url.searchParams;
    if (p === 'agents/me') return json({ id: 7, contact: { name: 'Ada Demo', email: 'ada@demo.example' } });
    if (p === 'agents') return json([{ id: 7, contact: { name: 'Ada Demo', email: 'ada@demo.example' } }]);
    if (p === 'companies') return json(Number(q.get('page') ?? 1) === 1 ? companies : []);
    if (p === 'tickets' && req.method === 'GET') {
      const since = Date.parse(q.get('updated_since') ?? '2000-01-01T00:00:00Z');
      return json(Number(q.get('page') ?? 1) === 1 ? tickets.filter((t) => Date.parse(t.updated_at) >= since) : []);
    }
    const one = /^tickets\/(\d+)(?:\/(reply|notes))?$/.exec(p);
    const t = one && tickets.find((x) => String(x.id) === one[1]);
    if (one && !t) return json({ code: 'access_denied', message: 'Not found' }, 404);
    if (one && one[2] && req.method === 'POST') {
      replies.push({ ticket: t.id, ...req.body });
      return json({ id: replies.length, body: req.body.body, ticket_id: t.id }, 201);
    }
    if (one && req.method === 'PUT') {
      if (ctl.take('badfield')) return json({ description: 'Validation failed', errors: [{ field: 'priority', message: 'It should be one of these values: 1,2,3,4', code: 'invalid_value' }] }, 400);
      Object.assign(t, req.body, { updated_at: ctl.now().toISOString() });
      return json(t);
    }
    return json({ code: 'invalid_url', message: 'Not found' }, 404);
  },
};
