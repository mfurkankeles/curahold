// Acceptance, for every address that names a thing by its id: someone from
// another company cannot read it and cannot change it, whatever they are
// allowed to do in their own.
//
// The addresses are read from the server's own code (the list the developer
// reference is built from), so a new one is tried the day it is written. Each
// is called by the other company's administrator with a real id of this
// company and a request body that would be accepted from one of its own
// people. Three things must hold: no call succeeds, no reading call says
// anything but "not found" or "not allowed", and afterwards every row of this
// company is exactly as it was.
import { beforeAll, describe, expect, it } from 'vitest';
import { readRoutes, type BodyField } from '../scripts/docs/routes';
import { blankDef } from '../shared/src/reports';
import { Client, login, picture, setup, type Env } from './helpers';

let env: Env;
let ada: Client;
let lena: Client;
let stranger: Client;

/** The table an address's id belongs to, by how the address starts. First match wins. */
const KINDS: [RegExp, string, string?][] = [
  [/^\/dev-links\/:id/, 'dev_links'],
  [/^\/connections\/:id\/jira/, 'connections', `provider = 'jira'`],
  [/^\/accounts\/:id/, 'accounts'],
  [/^\/imports\/:id/, 'import_batches', `kind = 'accounts'`],
  [/^\/task-imports\/:id/, 'import_batches', `kind = 'tasks'`],
  [/^\/admin\/roles\/:id/, 'roles', `key = 'member'`],
  [/^\/admin\/users\/:id/, 'users', `email = 'lena@demo.example'`],
  [/^\/reports\/person\/:id/, 'users', `email = 'lena@demo.example'`],
  [/^\/admin\/teams\/:id/, 'teams'],
  // A session of someone who plays no part here (signed in below): never the caller's own, which the
  // caller may end (DELETE /me/sessions/:id is "sign this device out"), leaving the rest of the run signed out.
  [/^\/(admin|me)\/sessions\/:id/, 'sessions', `user_id = (select id from users u where u.email = 'zeynep@demo.example' and u.org_id = sessions.org_id)`],
  [/^\/admin\/join-requests\/:id/, 'join_requests'],
  [/^\/automations\/:id/, 'automations'],
  [/^\/sprints\/:id/, 'sprints'],
  [/^\/boards\/:id/, 'boards'],
  [/^\/departments\/:id/, 'departments'],
  [/^\/reports\/saved\/:id/, 'reports'],
  [/^\/connections\/:id/, 'connections'],
  [/^\/dev\/analytics\/keys\/:id/, 'api_tokens'],
  [/^\/dev\/keys\/:id/, 'api_tokens'],
  [/^\/dev\/webhooks\/:id/, 'webhooks'],
  [/^\/(help\/files|help-files)\/:id/, 'help_files'],
  [/^\/help\/:id/, 'help_requests'],
  [/^\/support\/grants\/:id/, 'support_grants'],
  [/^\/activities\/:id/, 'activities'],
  [/^\/planned\/:id/, 'planned_meetings'],
  [/^\/pages\/:id/, 'pages'],
  [/^\/portal\/users\/:id/, 'portal_users'],
  [/^\/tasks\/:id/, 'tasks', 'parent_id is null'],
  [/^\/record-types\/:id/, 'record_types'],
  [/^\/records\/:id/, 'records'],
  [/^\/record-comments\/:id/, 'record_comments'],
  [/^\/time\/:id/, 'time_entries'],
  [/^\/undo\/:id/, 'undo_log'],
  [/^\/comments\/:id/, 'comments'],
  [/^\/files\/:id/, 'files'],
  [/^\/trash\/:id/, 'trash'],
  [/^\/views\/:id/, 'saved_views'],
  [/^\/checklists\/:id/, 'checklist_templates'],
  [/^\/plans\/:id/, 'plan_templates'],
  [/^\/promises\/:id/, 'promises'],
  [/^\/handovers\/:id/, 'handovers'],
  [/^\/request-links\/:id/, 'request_links'],
];

/** Addresses whose parameter is not the id of something a company owns; each with the reason it is not tried here. */
const NOT_BY_ID: Record<string, string> = {
  'GET /analytics/odata/:set': 'the name of a dataset of the analytics feed, read inside the caller’s own company (tests/analytics.test.ts)',
  'GET /analytics/odata/:set/:sub': 'a dataset name and $count, inside the caller’s own company (tests/analytics.test.ts)',
  'GET /analytics/v1/:file': 'a dataset file name (Tasks.json), inside the caller’s own company (tests/analytics.test.ts)',
  'DELETE /me/security/passkeys/:id': 'one of the caller’s own passkeys, matched by company and person in the statement (tests/identity.test.ts)',
  'POST /inbound/dev/:provider': 'the name of a code host, opened with that company’s own signed webhook (tests/jira.test.ts)',
  'POST /dev-hooks/:provider': 'the name of a code host, for the caller’s own company (tests/jira.test.ts)',
  'DELETE /dev-hooks/:provider': 'the name of a code host, for the caller’s own company (tests/jira.test.ts)',
  'DELETE /admin/domains/:domain': 'a domain name, checked against the caller’s own company',
  'GET /calendar/:file': 'opened with a personal calendar link, not a session (tests/notifications.test.ts)',
  'GET /auth/oauth/:provider/start': 'the name of a sign-in provider',
  'POST /setup-health/:id/confirm': 'the name of a setup check, kept for the caller’s own company (tests/setup-health.test.ts)',
  'POST /setup-test/:id/run': 'the name of a test step, run in the caller’s own company (tests/setup-health.test.ts)',
  'POST /setup-test/:id/mark': 'the name of a test step, kept for the caller’s own company (tests/setup-health.test.ts)',
  'POST /setup-test/:id/input': 'the name of a test step, kept for the caller’s own company (tests/setup-health.test.ts)',
  'POST /setup-test/:id/issue': 'the name of a test step, kept for the caller’s own company (tests/setup-health.test.ts)',
  'GET /connect/:provider/start': 'the name of an app to connect',
  'PUT /support/requests/:ref': 'Curahold’s own support desk, behind its staff key (tests/help.test.ts)',
  'GET /desk/owner/requests/:id': 'a trial request: Curahold’s own, not a company’s; owner session only (tests/owner-console.test.ts)',
  'POST /desk/owner/requests/:id/contacted': 'a trial request; owner session only (tests/owner-console.test.ts)',
  'POST /desk/owner/requests/:id/approve': 'a trial request; owner session only (tests/owner-console.test.ts)',
  'POST /desk/owner/requests/:id/reject': 'a trial request; owner session only (tests/owner-console.test.ts)',
  'PATCH /desk/owner/plan/tasks/:id': 'the owner’s own plan task; owner session only (tests/owner-console.test.ts)',
  'DELETE /desk/owner/plan/tasks/:id': 'the owner’s own plan task; owner session only (tests/owner-console.test.ts)',
  'PUT /desk/owner/checklist/:item': 'a go-live checklist item from the repository; owner session only (tests/owner-console.test.ts)',
  'PUT /desk/office/seats/:seat': 'a seat of Curahold’s own AI team; owner session only (tests/owner-console.test.ts)',
  'POST /desk/office/seats/:seat/key': 'a seat of Curahold’s own AI team; owner session only (tests/owner-console.test.ts)',
  'POST /desk/office/seats/:seat/handover': 'a seat of Curahold’s own AI team; owner session only (tests/owner-console.test.ts)',
  'POST /desk/office/approvals/:id/decide': 'an approval of Curahold’s own AI team; owner session only (tests/owner-console.test.ts)',
  'GET /desk/office/meetings/:id': 'a meeting of Curahold’s own AI team; owner session only (tests/owner-console.test.ts)',
  'POST /desk/office/meetings/:id/lines': 'a meeting of Curahold’s own AI team; owner session only (tests/owner-console.test.ts)',
  'DELETE /desk/office/pauses/:id': 'a pause switch of Curahold’s own AI team; owner session only (tests/owner-console.test.ts)',
  'GET /desk/team/seats/:seat': 'Curahold’s own AI team (a seat, its chats, memory, meetings or approvals); owner session only (tests/team.test.ts)',
  'PATCH /desk/team/seats/:seat': 'Curahold’s own AI team (a seat, its chats, memory, meetings or approvals); owner session only (tests/team.test.ts)',
  'GET /desk/team/seats/:seat/job': 'Curahold’s own AI team (a seat, its chats, memory, meetings or approvals); owner session only (tests/team.test.ts)',
  'GET /desk/team/seats/:seat/handover': 'Curahold’s own AI team (a seat, its chats, memory, meetings or approvals); owner session only (tests/team.test.ts)',
  'GET /desk/team/seats/:seat/threads': 'Curahold’s own AI team (a seat, its chats, memory, meetings or approvals); owner session only (tests/team.test.ts)',
  'POST /desk/team/seats/:seat/threads': 'Curahold’s own AI team (a seat, its chats, memory, meetings or approvals); owner session only (tests/team.test.ts)',
  'GET /desk/team/threads/:id/messages': 'Curahold’s own AI team (a seat, its chats, memory, meetings or approvals); owner session only (tests/team.test.ts)',
  'POST /desk/team/threads/:id/messages': 'Curahold’s own AI team (a seat, its chats, memory, meetings or approvals); owner session only (tests/team.test.ts)',
  'DELETE /desk/team/threads/:id': 'Curahold’s own AI team (a seat, its chats, memory, meetings or approvals); owner session only (tests/team.test.ts)',
  'GET /desk/team/seats/:seat/export': 'Curahold’s own AI team (a seat, its chats, memory, meetings or approvals); owner session only (tests/team.test.ts)',
  'GET /desk/team/seats/:seat/memory': 'Curahold’s own AI team (a seat, its chats, memory, meetings or approvals); owner session only (tests/team.test.ts)',
  'PUT /desk/team/seats/:seat/memory/:key': 'Curahold’s own AI team (a seat, its chats, memory, meetings or approvals); owner session only (tests/team.test.ts)',
  'DELETE /desk/team/seats/:seat/memory/:key': 'Curahold’s own AI team (a seat, its chats, memory, meetings or approvals); owner session only (tests/team.test.ts)',
  'GET /desk/team/seats/:seat/precheck': 'Curahold’s own AI team (a seat, its chats, memory, meetings or approvals); owner session only (tests/team.test.ts)',
  'POST /desk/team/seats/:seat/wake': 'Curahold’s own AI team (a seat, its chats, memory, meetings or approvals); owner session only (tests/team.test.ts)',
  'POST /desk/team/seats/:seat/golden': 'Curahold’s own AI team (a seat, its chats, memory, meetings or approvals); owner session only (tests/team.test.ts)',
  'GET /desk/team/meetings/:id': 'Curahold’s own AI team (a seat, its chats, memory, meetings or approvals); owner session only (tests/team.test.ts)',
  'POST /desk/team/meetings/:id/round': 'Curahold’s own AI team (a seat, its chats, memory, meetings or approvals); owner session only (tests/team.test.ts)',
  'POST /desk/team/meetings/:id/say': 'Curahold’s own AI team (a seat, its chats, memory, meetings or approvals); owner session only (tests/team.test.ts)',
  'POST /desk/team/meetings/:id/close': 'Curahold’s own AI team (a seat, its chats, memory, meetings or approvals); owner session only (tests/team.test.ts)',
  'POST /desk/team/approvals/:id/execute': 'Curahold’s own AI team (a seat, its chats, memory, meetings or approvals); owner session only (tests/team.test.ts)',
  'PUT /agent/memory/:key': 'a key in the calling seat’s own memory, by its seat key (tests/owner-console.test.ts)',
  'DELETE /agent/memory/:key': 'a key in the calling seat’s own memory, by its seat key (tests/owner-console.test.ts)',
  'PATCH /agent/tasks/:id': 'a task of the calling seat only, matched by seat in the statement (tests/owner-console.test.ts)',
  'GET /agent/meetings/:id': 'a meeting the calling seat attends, by its seat key (tests/owner-console.test.ts)',
  'POST /agent/meetings/:id/lines': 'a meeting the calling seat attends, by its seat key (tests/owner-console.test.ts)',
  'PUT /agent/meetings/:id/minutes': 'a meeting, written only by the note-taker seat (tests/owner-console.test.ts)',
  'GET /desk/requests/:ref': 'Curahold’s own support desk, behind its staff sign-in or key (tests/desk.test.ts)',
  'GET /desk/customers/:orgId': 'Curahold’s own console on the desk host, behind its staff sign-in or key; a company session gets 403 (tests/desk.test.ts)',
  'POST /desk/requests/:ref/messages': 'Curahold’s own support desk, behind its staff sign-in or key (tests/desk.test.ts)',
  'PUT /desk/requests/:ref/owner': 'Curahold’s own support desk, behind its staff sign-in (tests/desk.test.ts)',
  'PUT /desk/requests/:ref/status': 'Curahold’s own support desk, behind its staff sign-in or key (tests/desk.test.ts)',
  'POST /desk/requests/:ref/enter-link': 'Curahold’s own support desk, behind its staff sign-in (tests/desk.test.ts)',
  'GET /desk/requests/:ref/replays/:id': 'Curahold’s own support desk, behind its staff sign-in or key (tests/replay.test.ts)',
  'PUT /tickets/:source/:externalId': 'the ticket’s id in the caller’s own help desk (tests/timeline.test.ts)',
  'POST /inbound/tickets/:token': 'opened with a secret address, not a session (tests/timeline.test.ts)',
  'POST /inbound/segment/:source': 'a Segment source id, opened with that company’s own signed secret (tests/wave5c.test.ts)',
  'GET /platform/customers/:orgId': 'the operator-only owner console; any non-owner, including another company, gets 403 (tests/platform.test.ts)',
  // Wave-6A enterprise SSO + SCIM. These are NOT session-addressed id routes:
  //   * SCIM is authenticated by a per-company bearer token (not a session); a
  //     session cannot reach it, and a token only ever maps to its own company.
  //   * SSO login picks the company by URL slug + a signed state, before anyone
  //     is signed in; the per-company IdP certificate / client secret is the
  //     isolation boundary.
  // Cross-company isolation for both is proven directly in tests/sso.test.ts
  // and tests/scim.test.ts (the per-company IdP certificate / client secret /
  // SCIM bearer token is the boundary).
  'GET /scim/v2/Users/:id': 'SCIM 2.0 user, bearer-token-authed per company (tests/scim.test.ts)',
  'PUT /scim/v2/Users/:id': 'SCIM 2.0 user, bearer-token-authed per company (tests/scim.test.ts)',
  'PATCH /scim/v2/Users/:id': 'SCIM 2.0 user, bearer-token-authed per company (tests/scim.test.ts)',
  'DELETE /scim/v2/Users/:id': 'SCIM 2.0 user (deactivate), bearer-token-authed per company (tests/scim.test.ts)',
  'GET /sso/:slug/info': 'SSO status, company chosen by slug, before sign-in (tests/sso.test.ts)',
  'GET /sso/:slug/saml/metadata': 'SP metadata, company chosen by slug, before sign-in (tests/sso.test.ts)',
  'GET /sso/:slug/start': 'begins SSO, company chosen by slug + signed state (tests/sso.test.ts)',
  'POST /sso/:slug/saml/acs': 'SAML ACS; a per-company signed assertion is the boundary (tests/sso.test.ts)',
  'GET /sso/:slug/oidc/callback': 'OIDC callback; a per-company signed state + id_token is the boundary (tests/sso.test.ts)',
};

const sys = <T extends Record<string, any> = any>(sql: string, params: unknown[] = []) => env.db.system((q) => q.query<T>(sql, params));
const upload = (who: Client, path: string) => {
  const form = new FormData();
  form.append('file', new File(['x'], 'x.txt', { type: 'text/plain' }));
  return who.req('POST', path, form);
};

beforeAll(async () => {
  // A named platform owner, as production requires: no company administrator is the owner.
  env = await setup({ connectors: { demoCrm: true }, portalDomain: 'portal.curahold.test', owner: 'owner@curahold.test' });
  ada = await login(env, 'acme', 'ada@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
  stranger = await login(env, 'beta', 'ada@demo.example');
  // Only so there is a session nobody in this file uses (see KINDS).
  await login(env, 'acme', 'zeynep@demo.example');
  // The other company has its portal on too, so "your portal is off" never answers in place of "not found".
  await stranger.put('/api/portal/settings', { enabled: true });

  // Something of every kind in this company, made the way its people make them where that is short.
  const org = env.a.orgId;
  const board = env.a.boards.csBoard;
  const account = env.a.accounts['Cedarmoor Health'];
  const type = (await ada.post('/api/record-types', { kind: 'opportunity' })).json.type;
  const record = (await lena.post('/api/records', { typeId: type.id, accountId: account, name: 'A deal', fields: { status: 'open' } })).json.record;
  await lena.post(`/api/records/${record.id}/comments`, { body: 'A comment on the deal' });
  await upload(lena, `/api/records/${record.id}/files`);
  const task = (await lena.post('/api/tasks', { boardId: board, title: 'A task of this company', accountId: account })).json.task;
  await lena.post('/api/tasks', { boardId: board, title: 'Another task' });
  await lena.post(`/api/tasks/${task.id}/comments`, { body: 'A comment' });
  await lena.post(`/api/tasks/${task.id}/time`, { minutes: 15 });
  await upload(lena, `/api/tasks/${task.id}/files`);
  await lena.post(`/api/accounts/${account}/activities`, { kind: 'note', body: 'A note' });
  await lena.post('/api/reports/saved', { name: 'A report', def: { ...blankDef('tasks'), groups: [{ field: 'board' }], chart: 'bar' } });
  await ada.put('/api/portal/settings', { enabled: true });
  await lena.post('/api/portal/users', { accountId: account, email: 'someone@cedarmoor.example', name: 'Someone There' });
  await ada.post('/api/connections/demo', {});
  const gone = (await lena.post('/api/tasks', { boardId: board, title: 'In the trash' })).json.task;
  await lena.del(`/api/tasks/${gone.id}`);
  // The rest are written straight into their tables: what matters here is that the row is this company's.
  const lenaId = env.a.ids.lena;
  await sys(`insert into connections (org_id, kind, provider, label, config) values ($1, 'source', 'jira', 'acme-dev.atlassian.net', '{"mode":"basic","projects":[]}')`, [org]);
  await sys(`insert into dev_links (org_id, task_id, provider, kind, repo, ref, title) values ($1, $2, 'github', 'branch', 'acme/web', 'CURA-12345678-fix', '')`, [org, task.id]);
  await sys(`insert into saved_views (org_id, user_id, board_id, name) values ($1, $2, $3, 'A view')`, [org, lenaId, board]);
  await sys(`insert into promises (org_id, account_id, body) values ($1, $2, 'A promise')`, [org, account]);
  await sys(`insert into handovers (org_id, account_id, source_kind, source_id) values ($1, $2, 'task', $3)`, [org, account, task.id]);
  await sys(`insert into request_links (org_id, story_id, account_id, source, shipped_at) values ($1, $2, $3, 'account', now())`, [org, task.id, account]);
  await sys(`insert into checklist_templates (org_id, name, items) values ($1, 'A checklist', '[]')`, [org]);
  await sys(`insert into plan_templates (org_id, name, board_id, tasks) values ($1, 'A plan', $2, '[]')`, [org, board]);
  await sys(`insert into api_tokens (org_id, user_id, kind, name, token_hash, prefix) values ($1, $2, 'key', 'A key', 'not-a-real-hash', 'chk_test')`, [org, lenaId]);
  await sys(`insert into webhooks (org_id, url, events, secret) values ($1, 'https://example.com/hook', '{task.created}', 'not-a-real-secret')`, [org]);
  await sys(`insert into join_requests (org_id, email, name) values ($1, 'new@demo.example', 'New Person')`, [org]);
  await sys(`insert into undo_log (org_id, user_id, kind, payload) values ($1, $2, 'tasks', '[]')`, [org, lenaId]);
  await sys(`insert into import_batches (org_id, kind, file_name, created_ids, created_by) values ($1, 'accounts', 'a.csv', '{}', $2), ($1, 'tasks', 't.csv', '{}', $2)`, [org, lenaId]);
  await sys(`update import_batches set board_id = $2 where org_id = $1 and kind = 'tasks'`, [org, board]);
  await sys(`insert into support_grants (org_id, user_id, expires_at) values ($1, $2, now() + interval '1 day')`, [org, lenaId]);
  const [req] = await sys<{ id: string }>(`insert into help_requests (org_id, user_id, category, subject, description) values ($1, $2, 'question', 'A question', 'How?') returning id`, [org, lenaId]);
  await sys(`insert into help_files (org_id, request_id, name, mime, size, storage_key) values ($1, $2, 'shot.png', 'image/png', 1, 'help/x')`, [org, req.id]);
});

/** A value the address would accept for this field from one of the company's own people. */
function sample(f: BodyField, anId: string): unknown {
  if (f.type.startsWith('one of')) return f.type.slice('one of'.length).split('|')[0].trim().replace(/^[`'"]|[`'"]$/g, '');
  if (f.type.startsWith('list of')) return [];
  if (f.type === 'id') return anId;
  if (f.type.includes('number')) return 1;
  if (f.type === 'yes/no') return true;
  if (f.type === 'date') return '2026-12-01';
  if (f.type.startsWith('object')) return {};
  return 'x';
}

/**
 * Where the fields alone do not make a body the address accepts (a list that needs an item, a second
 * id, a query): what one of the company's own people would send. Other ids in a body are the
 * caller's own, so the only thing that is not theirs is the id in the address.
 */
type Own = { board: string; user: string; otherTask: string };
const OVERRIDES: Record<string, (own: Own) => { body?: unknown; query?: string }> = {
  'DELETE /tasks/:id/links/:other': () => ({ query: '?kind=relates' }),
  'POST /tasks/:id/links': (o) => ({ body: { otherId: o.otherTask, kind: 'relates' } }),
  'PATCH /plans/:id': (o) => ({ body: { name: 'A plan', boardId: o.board, tasks: [{ title: 'A step', dueInDays: 0, assignee: 'none' }] } }),
  'POST /accounts/:id/meetings': () => ({ body: { title: 'A meeting', happenedAt: new Date().toISOString() } }),
  'POST /accounts/:id/planned': () => ({ body: { title: 'A meeting', startsAt: new Date(Date.now() + 86_400_000).toISOString() } }),
  'POST /activities/:id/next-steps': (o) => ({ body: { steps: [{ title: 'A step' }], boardId: o.board } }),
  'POST /admin/users/:id/handover': (o) => ({ body: { toUserId: o.user } }),
  'POST /boards/:id/import': () => ({ body: { rows: [{ Title: 'A task' }], mapping: { title: 'Title' } } }),
  'PUT /sprints/:id/items': (o) => ({ body: { taskIds: [o.otherTask] } }),
  'PUT /sprints/:id/state': () => ({ body: { state: 'active' } }),
  'PUT /boards/:id/portal': () => ({ body: { enabled: true, intake: 'todo' } }),
};

describe('every address that names a thing by id', () => {
  it('is closed to another company: nothing read, nothing changed', async () => {
    const all = readRoutes().filter((r) => r.api && r.path.includes(':'));
    const tried: { key: string; status: number }[] = [];
    const notTried: string[] = [];
    const noRow: string[] = [];
    const ids = new Map<string, string[]>();
    const idsOf = async (table: string, where?: string) => {
      const key = `${table}|${where ?? ''}`;
      if (!ids.has(key)) ids.set(key, (await sys<{ id: string }>(`select id from ${table} where org_id = $1 ${where ? `and ${where}` : ''} order by id limit 2`, [env.a.orgId])).map((r) => r.id));
      return ids.get(key)!;
    };
    const before = await picture(env, env.a.orgId);
    const strangerBefore = await picture(env, env.b.orgId);

    for (const r of all) {
      const key = `${r.method} ${r.path}`;
      if (NOT_BY_ID[key]) {
        notTried.push(key);
        continue;
      }
      const kind = KINDS.find(([re]) => re.test(r.path));
      expect(kind, `${key}: which table does its id belong to? Add it to KINDS (or to NOT_BY_ID with the reason).`).toBeTruthy();
      const [, table, where] = kind!;
      const [id] = await idsOf(table, where);
      if (!id) {
        noRow.push(key);
        continue;
      }
      const tasks = await idsOf('tasks', 'parent_id is null');
      const path = r.path.replace(':id', id).replace(':other', tasks[1] ?? tasks[0]).replace(':object', 'Account').replace(':taskId', tasks[0]).replace(':remoteId', 'rem-1').replace(':userId', env.a.ids.lena);
      expect(path.includes(':'), `${key}: a parameter was left unfilled`).toBe(false);
      const special = OVERRIDES[key]?.({ board: env.b.boards.csBoard, user: env.b.ids.lena, otherTask: tasks[1] ?? tasks[0] }) ?? {};
      const body = special.body ?? Object.fromEntries(r.body.filter((f) => f.required).map((f) => [f.name, sample(f, id)]));
      const address = `/api${path}${special.query ?? ''}`;
      const res = /\/files$|\/file$/.test(r.path) && r.method === 'POST' ? await upload(stranger, address) : await stranger.req(r.method, address, r.method === 'GET' ? undefined : body);
      tried.push({ key, status: res.status });
      // Never a success, never a crash; a reading call says only "not found" or "not allowed".
      // (Soft: one run lists every address that breaks the rule, not just the first.)
      const said = `${key} answered ${res.status}: ${JSON.stringify(res.json).slice(0, 160)}`;
      expect.soft(res.status >= 400 && res.status < 500, said).toBe(true);
      if (r.method === 'GET') expect.soft([403, 404].includes(res.status), said).toBe(true);
    }

    // Whatever was answered, this company's rows are exactly as they were; so are the caller's own.
    const after = await picture(env, env.a.orgId);
    for (const table of Object.keys(before)) expect(after[table], table).toEqual(before[table]);
    const strangerAfter = await picture(env, env.b.orgId);
    for (const table of Object.keys(strangerBefore)) if (table !== 'users') expect(strangerAfter[table], `the caller's own ${table}`).toEqual(strangerBefore[table]);

    // What was covered, in numbers (QUALITY.md quotes them).
    const reached = tried.filter((t) => t.status === 404 || t.status === 403).length;
    const early = tried.filter((t) => t.status !== 404 && t.status !== 403);
    expect(noRow, 'addresses with no row of this company to try them on').toEqual([]);
    expect(notTried.sort()).toEqual(Object.keys(NOT_BY_ID).sort());
    expect(tried.length + notTried.length).toBe(all.length);
    // Refused before the thing was even looked for (a plan, a permission or the body came first): allowed,
    // since nothing changed, but kept few and named so that a new one is looked at.
    expect(early.map((t) => `${t.key} → ${t.status}`).sort()).toEqual(EARLY.sort());
    expect(reached).toBe(tried.length - EARLY.length);
  });
});

/** Addresses that refuse before looking the thing up, with what they answer. */
const EARLY: string[] = [];

// ---------------------------------------------------------------- the authorisation matrix
//
// Every role × every address of the API, inside one company. What each address needs is read
// from its own code (a writing seat, permissions; scripts/docs/routes.ts) and, where a whole
// area belongs to one permission whatever its handlers say, from POLICY below, written
// independently. A person without what an address needs is refused (4xx) and nothing of the
// company changes; a person with it is never told "not allowed" when reading. Writes that would
// succeed are not made (they would change what the next call finds), except the few a
// read-only seat may make (VIEWER_WRITES), which are pinned so a new one is looked at.

/** Areas that need a permission whatever their handlers ask for (any one of the list). */
const POLICY: [RegExp, string[], ('GET' | 'WRITE' | 'ALL')?][] = [
  [/^\/admin\/(users|teams|join-requests)/, ['users.manage', 'teams.manage', 'org.manage']],
  [/^\/admin\/(roles|domains|org|errors|access)/, ['org.manage']],
  [/^\/admin\/audit/, ['audit.view', 'org.manage']],
  [/^\/sso\/settings/, ['org.manage']],
  [/^\/dev\/webhooks|^\/dev\/inbound/, ['connections.manage']],
  // The analytics feed and what it offers: the export permission, as for every file (routes/analytics.ts).
  [/^\/analytics\/|^\/dev\/analytics\/datasets/, ['data.export'], 'ALL'],
  // Reading a connection's details needs the permission; its channel list does not (a board owner picks a channel).
  [/^\/connections\/:id(?!\/channels$)/, ['connections.manage'], 'ALL'],
  [/^\/connections/, ['connections.manage'], 'WRITE'],
  [/^\/admin\/users\/:id\/access/, ['users.manage', 'org.manage']],
  // Curahold's own whole-business numbers: the platform owner only, never a company role.
  [/^\/metrics/, ['platform.owner']],
  // The setup wizard (not setup health or the test list: those show each person what they can fix).
  [/^\/setup(\/|$)/, ['org.manage'], 'ALL'],
  [/^\/automations/, ['automations.manage'], 'WRITE'],
  [/^\/portal\/settings/, ['org.manage'], 'WRITE'],
  [/^\/support\/(policy|recording)/, ['org.manage'], 'WRITE'],
  [/^\/account-fields/, ['org.manage', 'accounts.manage'], 'WRITE'],
  [/^\/record-types/, ['org.manage', 'accounts.manage'], 'WRITE'],
];

/** What a read-only seat may still change: its own things. Pinned; a new entry is a decision. */
const VIEWER_WRITES: string[] = [
  'PATCH /me', // their own name, language, notification settings
  'POST /me/calendar', // their own calendar link
  'POST /assist', // a question to the assistant: it reads, and counts towards the company's cap
  'DELETE /me/calendar',
  'POST /notifications/read',
  'POST /consent', // their own cookie choice
  'POST /client-error', // an error their browser reports
  'POST /replay', // their own consented session recording
  'POST /support/leave', // ending a support visit
  'POST /views', // their own saved view of a board they can see
  'POST /assist', // a question to the assistant: it only reads, as them
  'PUT /tasks/:id/watch', // following a task they can see
  'DELETE /tasks/:id/watch',
  'POST /tasks/:id/mute',
  'POST /dev/keys', // their own key, read-only like their seat (tests/developer.test.ts)
  'DELETE /dev/keys/:id', // revoking their own key; someone else's is not theirs to see (row-level security)
  // Their own sign-in security: an authenticator app, recovery codes, passkeys, other devices,
  // confirming it is them (tests/identity.test.ts).
  'POST /me/security/totp',
  'POST /me/security/totp/confirm',
  'DELETE /me/security/totp',
  'POST /me/security/recovery-codes',
  'POST /me/security/passkeys/options',
  'POST /me/security/passkeys',
  'POST /me/sessions/sign-out-others',
  'POST /me/confirm/options',
  'POST /me/confirm/email',
  'POST /me/confirm',
];

type Person = { name: string; who: () => Client; perms: string[]; seat: 'full' | 'viewer' };

describe('every role × every address', () => {
  it('is refused without what it needs, and changes nothing; is never refused a read it may make', async () => {
    const org = env.a.orgId;
    // A role with no permission at all, on a full seat: what a newly made role starts from.
    const [role] = await sys<{ id: string }>(`insert into roles (org_id, key, name, perms) values ($1, 'nothing', 'Nothing', '{}') returning id`, [org]);
    await sys(`insert into users (org_id, email, name, role_id, seat, status) values ($1, 'nothing@demo.example', 'No Perms', $2, 'full', 'active')`, [org, role.id]);
    const mert = await login(env, 'acme', 'mert@demo.example');
    const sofia = await login(env, 'acme', 'sofia@demo.example');
    const nothing = await login(env, 'acme', 'nothing@demo.example');
    const permsOf = async (key: string) => (await sys<{ perms: string[] }>(`select perms from roles where org_id = $1 and key = $2`, [org, key]))[0].perms;
    const people: Person[] = [
      { name: 'admin', who: () => ada, perms: await permsOf('admin'), seat: 'full' },
      { name: 'manager', who: () => mert, perms: await permsOf('manager'), seat: 'full' },
      { name: 'member', who: () => lena, perms: await permsOf('member'), seat: 'full' },
      { name: 'viewer', who: () => sofia, perms: await permsOf('viewer'), seat: 'viewer' },
      { name: 'nothing', who: () => nothing, perms: [], seat: 'full' },
    ];

    const PUBLIC = /^\/(auth|signup|sso\/:slug|scim|desk|agent|hooks|inbound|oauth\/callback|connect\/callback|billing\/webhook|inbound|health|join|support\/enter|help-files|calendar\/:file|tickets|platform)/;
    const routes = readRoutes().filter((r) => r.api && !PUBLIC.test(r.path) && !NOT_BY_ID[`${r.method} ${r.path}`]);
    const ids = async (table: string, where?: string) =>
      (await sys<{ id: string }>(`select id from ${table} where org_id = $1 ${where ? `and ${where}` : ''} order by id limit 2`, [org])).map((r) => r.id);
    const tasks = await ids('tasks', 'parent_id is null');
    const filled = async (path: string) => {
      const kind = KINDS.find(([re]) => re.test(path));
      const [id] = kind ? await ids(kind[1], kind[2]) : [undefined];
      return { id, path: path.replace(':id', id ?? '00000000-0000-4000-8000-000000000000').replace(':other', tasks[1]).replace(':object', 'Account').replace(':taskId', tasks[0]).replace(':remoteId', 'rem-1') };
    };
    const needs = (method: string, path: string, r: (typeof routes)[number]) => {
      const write = method !== 'GET';
      const anyOf = POLICY.filter(([re, , when]) => re.test(path) && (!when || when === 'ALL' || (when === 'WRITE') === write)).map(([, p]) => p);
      return { writer: r.writer, perms: r.perms, anyOf };
    };
    const allowed = (p: Person, n: ReturnType<typeof needs>, method: string) =>
      (!n.writer || p.seat === 'full') &&
      (method === 'GET' || p.seat === 'full' || VIEWER_WRITES.includes(`${method}`)) &&
      n.perms.every((x) => p.perms.includes(x)) &&
      n.anyOf.every((set) => set.some((x) => p.perms.includes(x)));

    const before = await picture(env, org);
    const wrong: string[] = [];
    const viewerWrote: string[] = [];
    let calls = 0;
    for (const p of people) {
      for (const r of routes) {
        const key = `${r.method} ${r.path}`;
        const n = needs(r.method, r.path, r);
        if (p.seat === 'viewer' && VIEWER_WRITES.includes(key)) continue;
        const may = allowed(p, n, r.method);
        if (may && r.method !== 'GET') continue;
        const { id, path } = await filled(r.path);
        const special = OVERRIDES[key]?.({ board: env.a.boards.csBoard, user: env.a.ids.lena, otherTask: tasks[1] }) ?? {};
        const body = special.body ?? Object.fromEntries(r.body.filter((f) => f.required).map((f) => [f.name, sample(f, id ?? '00000000-0000-4000-8000-000000000000')]));
        const address = `/api${path}${special.query ?? ''}`;
        const who = p.who();
        const res = /\/files$|\/file$/.test(r.path) && r.method === 'POST' ? await upload(who, address) : await who.req(r.method, address, r.method === 'GET' ? undefined : body);
        calls++;
        if (!may && !(res.status >= 400 && res.status < 500)) (p.seat === 'viewer' && r.method !== 'GET' && !n.perms.length && !n.anyOf.length ? viewerWrote : wrong).push(`${p.name}: ${key} → ${res.status} (needs ${[n.writer ? 'a full seat' : '', ...n.perms, ...n.anyOf.map((s) => s.join('|'))].filter(Boolean).join(', ') || 'a full seat'})`);
        // 502/503: the outside service did not answer (a test company's made-up Jira); anything else 5xx is a crash.
        if (res.status >= 500 && res.status !== 502 && res.status !== 503) wrong.push(`${p.name}: ${key} → ${res.status} (a crash)`);
        else if (may && [401, 403].includes(res.status)) wrong.push(`${p.name}: ${key} → ${res.status} although allowed: ${JSON.stringify(res.json).slice(0, 120)}`);
      }
    }
    expect(wrong, 'role × address mismatches').toEqual([]);
    expect(viewerWrote, 'writes a read-only seat could make that are not in VIEWER_WRITES').toEqual([]);
    const after = await picture(env, org);
    // users: last seen; roles: the one made above; subscriptions: reading the plan starts the trial row the first time (billing/service.ts).
    for (const table of Object.keys(before)) if (!['users', 'roles', 'subscriptions'].includes(table)) expect(after[table], table).toEqual(before[table]);
    expect(calls).toBeGreaterThan(routes.length * 2);
    // Every pinned self-service write is still an address (a removed one leaves the list).
    for (const key of VIEWER_WRITES) expect(routes.some((r) => `${r.method} ${r.path}` === key), key).toBe(true);
  });
});
