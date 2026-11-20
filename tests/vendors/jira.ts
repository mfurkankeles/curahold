// Jira Cloud as documented (REST v3 + Agile 1.0), ported from the end-to-end stub in tests/jira.test.ts: API token
// with Basic auth (or Atlassian sign-in), /myself with the time zone JQL dates are read in, /search/jql with
// nextPageToken, issue types with hierarchy levels, workflow transitions (status is never written as a field),
// scrum boards and sprints; errors as { errorMessages: [], errors: {} }; 429 with Retry-After.
import { json, type Ctl, type MockReq, type VendorMock } from './kit';

const SITE = 'https://quillfield-dev.atlassian.net';
const AUTH = `Basic ${btoa('ada@demo.example:jira-mock-token-1')}`;
const FIELDS: any[] = [
  { id: 'customfield_10016', name: 'Story point estimate', schema: { custom: 'com.atlassian.jira.plugin.system.customfieldtypes:float' } },
  { id: 'customfield_10020', name: 'Sprint', schema: { custom: 'com.pyxis.greenhopper.jira:gh-sprint' } },
  { id: 'customfield_10014', name: 'Epic Link', schema: { custom: 'com.pyxis.greenhopper.jira:gh-epic-link' } },
  { id: 'customfield_10011', name: 'Epic Name', schema: { custom: 'com.pyxis.greenhopper.jira:gh-epic-label' } },
];
const TYPES: any[] = [
  { id: '10000', name: 'Epic', hierarchyLevel: 1 },
  { id: '10001', name: 'Story', hierarchyLevel: 0 },
  { id: '10002', name: 'Task', hierarchyLevel: 0 },
  { id: '10003', name: 'Bug', hierarchyLevel: 0 },
  { id: '10004', name: 'Sub-task', hierarchyLevel: -1, subtask: true },
];

function world() {
    const status = (name: string) => ({ name, statusCategory: { key: name === 'Done' ? 'done' : name === 'To Do' ? 'new' : 'indeterminate' } });
    const store = {
      issues: [
        { id: '1001', key: 'CURA-1', fields: { summary: 'Checkout redesign', description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Make paying easy' }] }] }, status: status('In Progress'), issuetype: { name: 'Epic', hierarchyLevel: 1 }, assignee: { accountId: 'acc-mert' }, duedate: null, created: ('2026-11-01T09:00:00.000Z'), updated: ('2026-11-10T09:00:00.000Z'), parent: null, customfield_10016: null, customfield_10020: null } },
        { id: '1002', key: 'CURA-2', fields: { summary: 'Pay with card', description: null, status: status('To Do'), issuetype: { name: 'Story' }, assignee: null, duedate: '2026-12-05', created: ('2026-11-02T09:00:00.000Z'), updated: ('2026-11-10T09:00:00.000Z'), parent: { id: '1001', key: 'CURA-1', fields: { issuetype: { name: 'Epic', hierarchyLevel: 1 } } }, customfield_10016: 5, customfield_10020: [{ id: 101, name: 'Sprint 1', state: 'active' }] } },
        { id: '1003', key: 'CURA-3', fields: { summary: 'Fix totals', description: null, status: status('Done'), issuetype: { name: 'Bug' }, assignee: null, duedate: null, created: ('2026-11-03T09:00:00.000Z'), updated: ('2026-11-10T09:00:00.000Z'), parent: null, customfield_10016: 2, customfield_10020: [{ id: 100, name: 'Sprint 0', state: 'closed', completeDate: '2026-11-08T00:00:00.000Z' }] } },
      ] as any[],
      sprints: [
        { id: 100, name: 'Sprint 0', state: 'closed', startDate: '2026-10-26T06:00:00.000Z', endDate: '2026-11-08T06:00:00.000Z', completeDate: '2026-11-08T06:00:00.000Z', goal: '' },
        { id: 101, name: 'Sprint 1', state: 'active', startDate: '2026-11-09T06:00:00.000Z', endDate: '2026-11-23T06:00:00.000Z', goal: 'Ship checkout' },
        { id: 102, name: 'Sprint 2', state: 'future', startDate: null, endDate: null, goal: '' },
      ] as any[],
    };
    const transitions = [
      { id: '11', to: status('In Progress') },
      { id: '21', to: status('In Review') },
      { id: '31', to: status('Done') },
    ];
    const route = (url: string, init: { method?: string; body?: string }, ctl: Ctl): Response => {
      if (!url.startsWith(SITE)) return new Response('not here', { status: 404 });
      const path = url.slice(SITE.length);
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      const json = (v: unknown, status = 200) => Response.json(v, { status });
      if (method !== 'GET' && path !== '/rest/api/3/search/jql') void 0;
      if (path === '/_edge/tenant_info') return json({ cloudId: 'cloud-9' });
      if (path === '/rest/api/3/myself') return json({ accountId: 'acc-ada', timeZone: 'Europe/Istanbul' });
      if (path === '/rest/api/3/field') return json(FIELDS);
      if (path === '/rest/api/3/issuetype') return json(TYPES);
      if (path === '/rest/api/3/status') return json([{ name: 'To Do' }, { name: 'In Progress' }, { name: 'In Review' }, { name: 'Done' }]);
      if (path.startsWith('/rest/api/3/project/search')) return json({ values: [{ key: 'CURA', name: 'Curahold' }, { key: 'OPS', name: 'Operations' }], isLast: true });
      if (path === '/rest/api/3/project/CURA') return json({ issueTypes: TYPES });
      if (path.startsWith('/rest/api/3/user/assignable/multiProjectSearch')) return json([{ accountId: 'acc-mert', displayName: 'Mert', emailAddress: 'mert@demo.example', accountType: 'atlassian', active: true }, { accountId: 'acc-ada', displayName: 'Ada', emailAddress: 'ada@demo.example', accountType: 'atlassian', active: true }]);
      if (path.startsWith('/rest/agile/1.0/board?')) return json({ values: [{ id: 7 }] });
      if (/^\/rest\/agile\/1\.0\/board\/7\/sprint/.test(path)) return json({ isLast: true, values: store.sprints });
      if (path === '/rest/api/3/search/jql') {
        const jql: string = body.jql;
        const epics = /issuetype in \(10000\)/.test(jql);
        const m = /updated >= "(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})"/.exec(jql);
        const from = m ? Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+03:00`) : 0;
        return json({ issues: store.issues.filter((i) => (i.fields.issuetype.hierarchyLevel === 1) === epics && Date.parse(i.fields.updated) >= from), isLast: true });
      }
      let m = /^\/rest\/api\/3\/issue\/(\d+)\?fields=status$/.exec(path);
      if (m) return json({ fields: { status: store.issues.find((i) => i.id === m![1])!.fields.status } });
      m = /^\/rest\/api\/3\/issue\/(\d+)\/transitions$/.exec(path);
      if (m && method === 'GET') return json({ transitions });
      if (m && method === 'POST') {
        const to = transitions.find((t) => t.id === body.transition.id)!.to;
        const issue = store.issues.find((i) => i.id === m![1])!;
        issue.fields.status = to;
        issue.fields.updated = ctl.now().toISOString();
        return new Response(null, { status: 204 });
      }
      m = /^\/rest\/api\/3\/issue\/(\d+)$/.exec(path);
      if (m && method === 'PUT') {
        const issue = store.issues.find((i) => i.id === m![1])!;
        Object.assign(issue.fields, body.fields);
        issue.fields.updated = ctl.now().toISOString();
        return new Response(null, { status: 204 });
      }
      if (path === '/rest/api/3/issue' && method === 'POST') {
        const id = String(2000 + store.issues.length);
        const type = TYPES.find((t) => t.id === body.fields.issuetype.id)!;
        store.issues.push({ id, key: `CURA-${id}`, fields: { ...body.fields, description: body.fields.description ?? null, status: status('To Do'), issuetype: type, created: ctl.now().toISOString(), updated: ctl.now().toISOString() } });
        return json({ id, key: `CURA-${id}` }, 201);
      }
      m = /^\/rest\/agile\/1\.0\/sprint\/(\d+)\/issue$/.exec(path);
      if (m && method === 'POST') {
        const sp = store.sprints.find((s) => String(s.id) === m![1])!;
        for (const k of body.issues) {
          const issue = store.issues.find((i) => i.id === k)!;
          issue.fields.customfield_10020 = [sp];
          issue.fields.updated = ctl.now().toISOString();
        }
        return new Response(null, { status: 204 });
      }
      if (path === '/rest/agile/1.0/sprint' && method === 'POST') {
        const sp = { id: 110 + store.sprints.length, name: body.name, state: 'future', startDate: body.startDate ?? null, endDate: body.endDate ?? null, goal: body.goal ?? '' };
        store.sprints.push(sp);
        return json(sp, 201);
      }
      m = /^\/rest\/agile\/1\.0\/sprint\/(\d+)$/.exec(path);
      if (m && method === 'POST') {
        Object.assign(store.sprints.find((s) => String(s.id) === m![1])!, body);
        return json({});
      }
      return json({ errorMessages: [`no route ${method} ${path}`] }, 404);
    };
  return { store, route };
}
let w = world();

export const jiraMock: VendorMock = {
  id: 'jira',
  hosts: /^quillfield-dev\.atlassian\.net$/,
  keyValues: { site: 'quillfield-dev', email: 'ada@demo.example', token: 'jira-mock-token-1' },
  reset() {
    w = world();
  },
  remoteEdit(ctl, name) {
    const i = w.store.issues.find((x: any) => x.key === 'CURA-2');
    i.fields.summary = name;
    i.fields.updated = ctl.now().toISOString();
    return { id: i.id };
  },
  remoteRow: (_o, id) => w.store.issues.find((x: any) => x.id === id || x.key === id),
  handle(req: MockReq, ctl: Ctl) {
    if (ctl.revoked() || req.headers.get('authorization') !== AUTH) return json({ errorMessages: ['Client must be authenticated to access this resource.'], errors: {} }, 401);
    if (ctl.take('ratelimit')) return json({ errorMessages: ['Rate limit exceeded.'], errors: {} }, 429, { 'retry-after': '20', 'x-ratelimit-limit': '100', 'x-ratelimit-remaining': '0' });
    if (req.method !== 'GET' && ctl.take('badfield')) return json({ errorMessages: [], errors: { duedate: 'Due date: you can only set this on issues that have it on their screen.' } }, 400);
    return w.route(req.url.toString(), { method: req.method, body: req.raw || undefined }, ctl);
  },
};
