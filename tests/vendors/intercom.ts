// Intercom REST API 2.11 as documented: Bearer access token, `Intercom-Version` header, regional hosts (this
// mock is an EU workspace: api.eu.intercom.io), /me with app.id_code, companies/scroll, conversations/search
// (POST, pages.next.starting_after), conversation parts for open/close/assign, /reply; errors as
// { type: 'error.list', errors: [{ code, message }] }; 429 with X-RateLimit-Reset.
import { json, type Ctl, type MockReq, type VendorMock } from './kit';

const TOKEN = 'ic-mock-token-1';
let conversations: any[] = [];
let companies: any[] = [];
const err = (status: number, code: string, message: string, headers: Record<string, string> = {}) => json({ type: 'error.list', request_id: 'mock-req', errors: [{ code, message }] }, status, headers);

export const intercomMock: VendorMock = {
  id: 'intercom',
  hosts: /^api\.eu\.intercom\.io$/,
  keyValues: { region: 'eu', token: TOKEN },
  reset() {
    const t = Math.floor(Date.parse('2026-11-18T08:00:00Z') / 1000);
    companies = [{ id: 'c1', name: 'Cedarmoor Health', website: 'https://cedarmoor.example', updated_at: t }];
    conversations = [
      { id: '9001', title: 'Login link expired', state: 'open', priority: 'not_priority', created_at: t, updated_at: t, source: { type: 'email', delivered_as: 'customer_initiated', author: { email: 'nora@cedarmoor.example' } }, admin_assignee_id: null, statistics: {} },
    ];
  },
  remoteEdit(ctl, name) {
    conversations[0].title = name;
    conversations[0].updated_at = Math.floor(ctl.now().getTime() / 1000);
    return { id: '9001' };
  },
  remoteRow: (_o, id) => conversations.find((c) => c.id === id),
  handle(req: MockReq, ctl: Ctl) {
    if (ctl.revoked() || req.headers.get('authorization') !== `Bearer ${TOKEN}`) return err(401, 'unauthorized', 'Access Token Invalid');
    if (ctl.take('ratelimit')) return err(429, 'rate_limit_exceeded', 'Exceeded rate limit of 166 requests per 10 seconds', { 'x-ratelimit-limit': '166', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1795000000', 'retry-after': '10' });
    const p = req.url.pathname;
    if (p === '/me') return json({ type: 'admin', id: '814860', email: 'ada@demo.example', app: { id_code: 'quill123', name: 'Quillfield Support' } });
    if (p === '/admins') return json({ type: 'admin.list', admins: [{ id: '814860', name: 'Ada Demo', email: 'ada@demo.example' }] });
    if (p === '/companies/scroll') return json({ type: 'list', data: req.url.searchParams.get('scroll_param') ? [] : companies, scroll_param: 'mock-scroll-1' });
    if (p === '/conversations/search' && req.method === 'POST') {
      const after = Number(req.body?.query?.value ?? 0);
      return json({ type: 'conversation.list', conversations: conversations.filter((c) => c.updated_at > after), total_count: conversations.length, pages: { type: 'pages', page: 1, per_page: 50, total_pages: 1 } });
    }
    const part = /^\/conversations\/(\d+)\/(parts|reply)$/.exec(p);
    if (part && req.method === 'POST') {
      const c = conversations.find((x) => x.id === part[1]);
      if (!c) return err(404, 'not_found', 'Resource Not Found');
      if (ctl.take('badfield')) return err(400, 'parameter_invalid', 'Assignee not found');
      if (req.body.message_type === 'close') c.state = 'closed';
      if (req.body.message_type === 'open') c.state = 'open';
      if (req.body.message_type === 'assignment') c.admin_assignee_id = req.body.assignee_id;
      c.updated_at = Math.floor(ctl.now().getTime() / 1000);
      return json({ type: 'conversation', id: c.id, state: c.state });
    }
    return err(404, 'not_found', 'Resource Not Found');
  },
};
