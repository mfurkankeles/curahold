// Zendesk Support API v2 as documented: Basic auth with "<email>/token:<API token>", /users/me.json (an agent),
// cursor pages (page[size], meta.has_more, links.next), incremental ticket export with include=users and
// end_of_stream/after_url, PUT /tickets/<id>.json; errors as { error, description }; 429 with Retry-After.
import { json, type Ctl, type MockReq, type VendorMock } from './kit';

const SUB = 'quillfield';
const AUTH = `Basic ${btoa('ada@demo.example/token:zd-mock-token-1')}`;
let orgs: any[] = [];
let tickets: any[] = [];
let users: any[] = [];
let comments: any[] = [];

export const zendeskMock: VendorMock = {
  id: 'zendesk',
  hosts: new RegExp(`^${SUB}\\.zendesk\\.com$`),
  keyValues: { subdomain: SUB, email: 'ada@demo.example', token: 'zd-mock-token-1' },
  reset() {
    const t = '2026-11-18T08:00:00Z';
    // Organisations named as the support team names them; matched to the demo's customers by name and domain.
    orgs = [
      { id: 1, name: 'Cedarmoor Health', domain_names: [], updated_at: t },
      { id: 3, name: 'HLB Group', domain_names: ['harborline.example'], updated_at: t },
    ];
    users = [{ id: 91, email: 'nora@cedarmoor.example' }, { id: 95, email: 'defne@harborline.example' }];
    tickets = [
      { id: 11, subject: 'Dashboard is blank', status: 'open', priority: 'urgent', created_at: t, updated_at: t, organization_id: 1, requester_id: 91, assignee_id: null, via: { channel: 'email' } },
      { id: 15, subject: 'Statement mismatch', status: 'solved', priority: 'high', created_at: t, updated_at: t, organization_id: 3, requester_id: 95, assignee_id: null, via: { channel: 'web' } },
    ];
    comments = [];
  },
  remoteEdit(ctl, name) {
    tickets[0].subject = name;
    tickets[0].updated_at = ctl.now().toISOString();
    return { id: '11' };
  },
  remoteRow: (_o, id) => tickets.find((t) => String(t.id) === id),
  handle(req: MockReq, ctl: Ctl) {
    if (ctl.revoked() || req.headers.get('authorization') !== AUTH) return json({ error: "Couldn't authenticate you" }, 401);
    if (ctl.take('ratelimit')) return json({ error: 'APIRateLimitExceeded', description: 'Number of allowed API requests per minute exceeded' }, 429, { 'retry-after': '30' });
    const p = req.url.pathname.replace(/^\/api\/v2\//, '');
    if (p === 'users/me.json') return json({ user: { id: 1, email: 'ada@demo.example', role: 'admin' } });
    if (p === 'users.json') return json({ users: [{ id: 501, name: 'Ada Demo', email: 'ada@demo.example' }], meta: { has_more: false } });
    if (p === 'organizations.json') return json({ organizations: orgs, meta: { has_more: false, after_cursor: null }, links: { next: null } });
    if (p === 'incremental/tickets/cursor.json') {
      const start = Number(req.url.searchParams.get('start_time') ?? 0) * 1000;
      const hit = tickets.filter((t) => Date.parse(t.updated_at) >= start);
      return json({ tickets: hit, users, after_url: null, after_cursor: 'mock-cursor', end_of_stream: true });
    }
    const one = /^tickets\/(\d+)\.json$/.exec(p);
    if (one && req.method === 'PUT') {
      const t = tickets.find((x) => String(x.id) === one[1]);
      if (!t) return json({ error: 'RecordNotFound', description: 'Not found' }, 404);
      if (ctl.take('badfield')) return json({ error: 'RecordInvalid', description: 'Record validation errors', details: { priority: [{ description: 'Priority: is invalid' }] } }, 422);
      const { comment, ...rest } = req.body.ticket ?? {};
      if (comment) comments.push({ ticket: t.id, ...comment });
      Object.assign(t, rest, { updated_at: ctl.now().toISOString() });
      return json({ ticket: t });
    }
    return json({ error: 'InvalidEndpoint', description: 'Not found' }, 404);
  },
};
