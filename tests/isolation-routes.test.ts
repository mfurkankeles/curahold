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
  [/^\/accounts\/:id/, 'accounts'],
  [/^\/imports\/:id/, 'import_batches', `kind = 'accounts'`],
  [/^\/task-imports\/:id/, 'import_batches', `kind = 'tasks'`],
  [/^\/admin\/roles\/:id/, 'roles', `key = 'member'`],
  [/^\/admin\/users\/:id/, 'users', `email = 'lena@demo.example'`],
  [/^\/reports\/person\/:id/, 'users', `email = 'lena@demo.example'`],
  [/^\/admin\/teams\/:id/, 'teams'],
  [/^\/(admin|me)\/sessions\/:id/, 'sessions'],
  [/^\/admin\/join-requests\/:id/, 'join_requests'],
  [/^\/automations\/:id/, 'automations'],
  [/^\/boards\/:id/, 'boards'],
  [/^\/reports\/saved\/:id/, 'reports'],
  [/^\/connections\/:id/, 'connections'],
  [/^\/dev\/keys\/:id/, 'api_tokens'],
  [/^\/dev\/webhooks\/:id/, 'webhooks'],
  [/^\/(help\/files|help-files)\/:id/, 'help_files'],
  [/^\/help\/:id/, 'help_requests'],
  [/^\/support\/grants\/:id/, 'support_grants'],
  [/^\/activities\/:id/, 'activities'],
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
];

/** Addresses whose parameter is not the id of something a company owns; each with the reason it is not tried here. */
const NOT_BY_ID: Record<string, string> = {
  'DELETE /admin/domains/:domain': 'a domain name, checked against the caller’s own company',
  'GET /calendar/:file': 'opened with a personal calendar link, not a session (tests/notifications.test.ts)',
  'GET /auth/oauth/:provider/start': 'the name of a sign-in provider',
  'GET /connect/:provider/start': 'the name of an app to connect',
  'PUT /support/requests/:ref': 'Curahold’s own support desk, behind its staff key (tests/help.test.ts)',
  'GET /desk/requests/:ref': 'Curahold’s own support desk, behind its staff sign-in or key (tests/desk.test.ts)',
  'POST /desk/requests/:ref/messages': 'Curahold’s own support desk, behind its staff sign-in or key (tests/desk.test.ts)',
  'PUT /desk/requests/:ref/owner': 'Curahold’s own support desk, behind its staff sign-in (tests/desk.test.ts)',
  'PUT /desk/requests/:ref/status': 'Curahold’s own support desk, behind its staff sign-in or key (tests/desk.test.ts)',
  'POST /desk/requests/:ref/enter-link': 'Curahold’s own support desk, behind its staff sign-in (tests/desk.test.ts)',
  'PUT /tickets/:source/:externalId': 'the ticket’s id in the caller’s own help desk (tests/timeline.test.ts)',
  'POST /inbound/tickets/:token': 'opened with a secret address, not a session (tests/timeline.test.ts)',
};

const sys = <T extends Record<string, any> = any>(sql: string, params: unknown[] = []) => env.db.system((q) => q.query<T>(sql, params));
const upload = (who: Client, path: string) => {
  const form = new FormData();
  form.append('file', new File(['x'], 'x.txt', { type: 'text/plain' }));
  return who.req('POST', path, form);
};

beforeAll(async () => {
  env = await setup({ connectors: { demoCrm: true }, portalDomain: 'portal.curahold.test' });
  ada = await login(env, 'acme', 'ada@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
  stranger = await login(env, 'beta', 'ada@demo.example');
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
  await sys(`insert into saved_views (org_id, user_id, board_id, name) values ($1, $2, $3, 'A view')`, [org, lenaId, board]);
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
  'POST /activities/:id/next-steps': (o) => ({ body: { steps: [{ title: 'A step' }], boardId: o.board } }),
  'POST /admin/users/:id/handover': (o) => ({ body: { toUserId: o.user } }),
  'POST /boards/:id/import': () => ({ body: { rows: [{ Title: 'A task' }], mapping: { title: 'Title' } } }),
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
      const path = r.path.replace(':id', id).replace(':other', tasks[1] ?? tasks[0]).replace(':object', 'Account');
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
