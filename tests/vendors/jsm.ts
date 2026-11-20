// Jira Service Management Cloud as documented: Basic auth with email + API token, /rest/api/3/myself,
// /rest/servicedeskapi/servicedesk and /organization (start/limit, isLastPage), /rest/api/3/field for the
// "Organizations" custom field, /rest/api/3/search/jql (POST, nextPageToken), status categories;
// errors as { errorMessages: [], errors: {} }; 429 with Retry-After. Read only.
import { json, type Ctl, type MockReq, type VendorMock } from './kit';

const SITE = 'quillhelp';
const AUTH = `Basic ${btoa('ada@demo.example:jsm-mock-token-1')}`;
let issues: any[] = [];

export const jsmMock: VendorMock = {
  id: 'jsm',
  hosts: new RegExp(`^${SITE}\\.atlassian\\.net$`),
  keyValues: { site: SITE, email: 'ada@demo.example', token: 'jsm-mock-token-1' },
  reset() {
    const t = '2026-11-18T08:00:00.000+0000';
    issues = [
      { key: 'HELP-7', fields: { summary: 'Cannot open the shared report', status: { name: 'Waiting for support', statusCategory: { key: 'new' } }, priority: { name: 'High' }, created: t, updated: t, resolutiondate: null, reporter: { emailAddress: 'nora@cedarmoor.example' }, assignee: null, customfield_10002: [{ id: '3', name: 'Cedarmoor Health' }] } },
      { key: 'HELP-8', fields: { summary: 'Password reset', status: { name: 'Done', statusCategory: { key: 'done' } }, priority: { name: 'Low' }, created: t, updated: t, resolutiondate: t, reporter: { emailAddress: 'someone@elsewhere.example' }, assignee: null, customfield_10002: [] } },
    ];
  },
  remoteEdit(ctl, name) {
    issues[0].fields.summary = name;
    issues[0].fields.updated = ctl.now().toISOString().replace('Z', '+0000');
    return { id: 'HELP-7' };
  },
  remoteRow: (_o, id) => issues.find((i) => i.key === id),
  handle(req: MockReq, ctl: Ctl) {
    if (ctl.revoked() || req.headers.get('authorization') !== AUTH) return json({ errorMessages: ['Client must be authenticated to access this resource.'], errors: {} }, 401);
    if (ctl.take('ratelimit')) return json({ errorMessages: ['Rate limit exceeded.'], errors: {} }, 429, { 'retry-after': '15' });
    const p = req.url.pathname;
    if (p === '/rest/api/3/myself') return json({ accountId: '5b10ac8d82e05b22cc7d4ef5', emailAddress: 'ada@demo.example', displayName: 'Ada Demo' });
    if (p === '/rest/servicedeskapi/servicedesk') return json({ size: 1, start: 0, limit: 50, isLastPage: true, values: [{ id: '1', projectId: '10001', projectKey: 'HELP', projectName: 'Help desk' }] });
    if (p === '/rest/api/3/field') return json([{ id: 'summary', name: 'Summary', schema: { type: 'string' } }, { id: 'customfield_10002', name: 'Organizations', schema: { type: 'array', custom: 'com.atlassian.servicedesk:sd-customer-organizations' } }]);
    if (p === '/rest/api/3/user/assignable/search') return json([{ accountId: '5b10ac8d82e05b22cc7d4ef5', accountType: 'atlassian', displayName: 'Ada Demo', emailAddress: 'ada@demo.example' }]);
    if (p === '/rest/servicedeskapi/organization') return json({ size: 1, start: 0, limit: 50, isLastPage: true, values: [{ id: '3', name: 'Cedarmoor Health' }] });
    if (p === '/rest/api/3/search/jql' && req.method === 'POST') {
      const m = /updated >= "([^"]+)"/.exec(req.body.jql ?? '');
      const from = m ? Date.parse(`${m[1].replace(' ', 'T')}:00Z`) : 0;
      return json({ issues: issues.filter((i) => Date.parse(i.fields.updated.replace('+0000', 'Z')) >= from), isLast: true });
    }
    return json({ errorMessages: ['Not found'], errors: {} }, 404);
  },
};
