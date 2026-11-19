// Departments: the walls between them, who opens boards, how work crosses a wall
// (links and requests, never the other board), the shared customer page with
// department field rules, and the same answers in the database itself.
//
// The demo company (scripts/seed-departments.ts): Customer Success — mert leads; ada,
// zeynep, lena, omar, sofia are members. Sales — omar leads, ada. Product — lena
// leads, zeynep. Finance — ada leads. Ada is the administrator; mert is a manager
// ("see every board"); zeynep, lena and omar are members; sofia is a viewer.
import { beforeAll, describe, expect, it } from 'vitest';
import { login, setup, type Client, type Env } from './helpers';

let env: Env;
let ada: Client, mert: Client, zeynep: Client, lena: Client, omar: Client, sofia: Client, stranger: Client;
const dept: Record<string, string> = {};
let pipeline: string, backlog: string, secret: string, account: string;

beforeAll(async () => {
  env = await setup();
  [ada, mert, zeynep, lena, omar, sofia] = await Promise.all(
    ['ada', 'mert', 'zeynep', 'lena', 'omar', 'sofia'].map((n) => login(env, 'acme', `${n}@demo.example`)),
  );
  stranger = await login(env, 'beta', env.b.adminEmail);
  for (const d of (await ada.get('/api/me')).json.departments) dept[d.key] = d.id;
  account = Object.values(env.a.accounts)[0] as string;
  // Sales' lead opens the pipeline; Product's lead opens a backlog that takes requests.
  const p = await omar.post('/api/boards', { name: 'Pipeline', visibility: 'org', departmentId: dept.sales });
  expect(p.status).toBe(201);
  pipeline = p.json.board.id;
  const b = await lena.post('/api/boards', { name: 'Backlog', visibility: 'org', departmentId: dept.product });
  expect(b.status).toBe(201);
  backlog = b.json.board.id;
  expect((await lena.patch(`/api/boards/${backlog}`, { form: { on: true, title: 'Ask Product', fields: ['description', 'account'] } })).status).toBe(200);
  const t = await omar.post('/api/tasks', { boardId: pipeline, title: 'Confidential deal terms', status: 'todo', accountId: account });
  expect(t.status).toBe(201);
  secret = t.json.task.id;
});

describe('departments', () => {
  it('every company has the four, in order, and each person knows their place', async () => {
    const me = (await omar.get('/api/me')).json;
    expect(me.departments.map((d: any) => d.key)).toEqual(['sales', 'success', 'product', 'finance']);
    expect(me.departments.find((d: any) => d.key === 'sales').myRole).toBe('lead');
    expect(me.departments.find((d: any) => d.key === 'product').myRole).toBeNull();
    expect(me.departments.find((d: any) => d.key === 'sales').leadIds).toEqual([env.a.ids.omar]);
  });

  it('a member of one department cannot reach another department\'s board by any address', async () => {
    const boards = (await zeynep.get('/api/boards')).json.boards.map((x: any) => x.id);
    expect(boards).not.toContain(pipeline);
    expect(boards).toContain(backlog); // zeynep is in Product too
    const tries = [
      zeynep.get(`/api/tasks/${secret}`),
      zeynep.patch(`/api/tasks/${secret}`, { title: 'mine', baseVersion: 1 }),
      zeynep.post(`/api/tasks/${secret}/comments`, { body: 'hello' }),
      zeynep.get(`/api/tasks/${secret}/chain`),
      zeynep.patch(`/api/boards/${pipeline}`, { name: 'x' }),
      zeynep.del(`/api/boards/${pipeline}`),
      zeynep.post('/api/tasks', { boardId: pipeline, title: 'sneak in' }),
      zeynep.post(`/api/boards/${pipeline}/requests`, { title: 'not a desk' }),
    ];
    for (const r of await Promise.all(tries)) expect([403, 404], JSON.stringify(r.json).slice(0, 120)).toContain(r.status);
    const listed = (await zeynep.get(`/api/tasks?board=${pipeline}`)).json.tasks ?? [];
    expect(listed.map((x: any) => x.id)).not.toContain(secret);
    const search = (await zeynep.get('/api/search?q=Confidential')).json;
    expect(JSON.stringify(search)).not.toContain('Confidential deal terms');
    const page = (await zeynep.get(`/api/accounts/${account}`)).json;
    expect(page.tasks.map((x: any) => x.id)).not.toContain(secret);
    // Sales sees it; "see every board" sees it.
    expect((await omar.get(`/api/tasks/${secret}`)).status).toBe(200);
    expect((await mert.get(`/api/tasks/${secret}`)).status).toBe(200);
  });

  it('only administrators and a department\'s leads open boards, and only in their own department', async () => {
    const member = await zeynep.post('/api/boards', { name: 'Mine', visibility: 'private' });
    expect(member.status).toBe(403);
    expect(member.json.error).toBe('board_lead_only');
    expect((await sofia.post('/api/boards', { name: 'Mine', visibility: 'private' })).status).toBe(403);
    const elsewhere = await omar.post('/api/boards', { name: 'Not mine', visibility: 'org', departmentId: dept.product });
    expect(elsewhere.json.error).toBe('board_lead_only');
    const admin = await ada.post('/api/boards', { name: 'Close the month', visibility: 'org', departmentId: dept.finance });
    expect(admin.status).toBe(201);
    expect(admin.json.board.departmentId).toBe(dept.finance);
  });

  it('only an administrator moves a board to another department — the database refuses anyone else', async () => {
    expect((await omar.patch(`/api/boards/${pipeline}`, { departmentId: dept.success })).status).toBe(403);
    await expect(
      env.db.tenant({ orgId: env.a.orgId, userId: env.a.ids.omar }, (q) => q.query('update boards set department_id = $2 where id = $1', [pipeline, dept.success])),
    ).rejects.toThrow(/administrator/);
    const moved = await ada.patch(`/api/boards/${pipeline}`, { departmentId: dept.success });
    expect(moved.status).toBe(200);
    expect((await zeynep.get('/api/boards')).json.boards.map((x: any) => x.id)).toContain(pipeline);
    expect((await ada.patch(`/api/boards/${pipeline}`, { departmentId: dept.sales })).status).toBe(200);
    expect((await zeynep.get('/api/boards')).json.boards.map((x: any) => x.id)).not.toContain(pipeline);
  });

  it('a department the company switched off is hidden from everyone and keeps its boards', async () => {
    expect((await omar.patch(`/api/departments/${dept.sales}`, { enabled: false })).status).toBe(403);
    expect((await ada.patch(`/api/departments/${dept.sales}`, { enabled: false })).status).toBe(200);
    expect((await omar.get('/api/me')).json.departments.map((d: any) => d.key)).not.toContain('sales');
    expect((await ada.get('/api/me')).json.departments.find((d: any) => d.key === 'sales').enabled).toBe(false);
    expect((await omar.get('/api/boards')).json.boards.map((x: any) => x.id)).not.toContain(pipeline);
    expect((await ada.get('/api/boards')).json.boards.map((x: any) => x.id)).not.toContain(pipeline);
    expect((await omar.get(`/api/tasks/${secret}`)).status).toBe(404);
    expect((await ada.post('/api/boards', { name: 'x', visibility: 'org', departmentId: dept.sales })).json.error).toBe('department_off');
    expect((await ada.patch(`/api/departments/${dept.sales}`, { enabled: true })).status).toBe(200);
    expect((await omar.get(`/api/tasks/${secret}`)).status).toBe(200);
  });

  it('work crosses a wall as a linked request: the sender sees where it stands, never the board', async () => {
    // omar works in Customer Success's renewals board; he is not in Product.
    const own = await omar.post('/api/tasks', { boardId: env.a.boards.renewals, title: 'Customer asks for bulk export', accountId: account });
    expect(own.status).toBe(201);
    const desksRes = await omar.get('/api/departments/desks');
    expect(desksRes.status, JSON.stringify(desksRes.json)).toBe(200);
    const desks = desksRes.json.desks;
    expect(desks.map((d: any) => d.id)).toContain(backlog);
    expect(desks.find((d: any) => d.id === backlog).departmentKey).toBe('product');
    expect((await lena.get('/api/departments/desks')).json.desks.map((d: any) => d.id)).not.toContain(backlog);
    const sent = await omar.post(`/api/boards/${backlog}/requests`, { title: 'Bulk export for usage reports', accountId: account, fromTaskId: own.json.task.id });
    expect(sent.status).toBe(201);
    const ask = sent.json.task.id;
    expect((await omar.get(`/api/tasks/${ask}`)).status).toBe(404);
    const link = (await omar.get(`/api/tasks/${own.json.task.id}`)).json.task.links.find((l: any) => l.taskId === ask);
    expect(link).toMatchObject({ title: 'Bulk export for usage reports', boardId: null, boardName: null, departmentKey: 'product', kind: 'relates', done: false });
    expect(link.statusName).toBeTruthy();
    // Product sees the request on its own board, with where it came from.
    const there = (await lena.get(`/api/tasks/${ask}`)).json.task;
    expect(there.boardId).toBe(backlog);
    expect(there.events.some((e: any) => e.kind === 'created')).toBe(true);
    expect(there.links.find((l: any) => l.taskId === own.json.task.id)).toMatchObject({ departmentKey: 'success', boardId: env.a.boards.renewals });
    // A link to a task one cannot see cannot be made by hand.
    expect((await omar.post(`/api/tasks/${own.json.task.id}/links`, { otherId: ask, kind: 'blocks' })).status).toBe(404);
  });

  it('the customer page is shared: each department\'s open work as counts, behind its band rule', async () => {
    const asZeynep = (await zeynep.get(`/api/accounts/${account}`)).json.departments;
    const sales = asZeynep.find((d: any) => d.key === 'sales');
    expect(sales).toMatchObject({ open: 1, mine: false });
    // Finance's band is Finance's own by default; administrators see it.
    expect(asZeynep.map((d: any) => d.key)).not.toContain('finance');
    expect((await ada.get(`/api/accounts/${account}`)).json.departments.map((d: any) => d.key)).toContain('finance');
    // An administrator opens Finance's band to Customer Success.
    expect((await ada.patch(`/api/departments/${dept.finance}`, { bandView: ['finance', 'success'] })).status).toBe(200);
    expect((await zeynep.get(`/api/accounts/${account}`)).json.departments.map((d: any) => d.key)).toContain('finance');
  });

  it('a field can be given to a department: hidden from the others everywhere', async () => {
    const fields = (await ada.get('/api/me')).json.org.accountFields;
    const next = fields.map((f: any) => (f.key === 'arr' ? { ...f, access: { view: ['dept:finance'] } } : f));
    expect((await ada.put('/api/account-fields', { fields: next })).status).toBe(200);
    expect((await zeynep.get('/api/me')).json.org.accountFields.map((f: any) => f.key)).not.toContain('arr');
    expect(Object.keys((await zeynep.get(`/api/accounts/${account}`)).json.account.fields)).not.toContain('arr');
    // zeynep joins Finance: now she sees it.
    expect((await ada.put(`/api/departments/${dept.finance}/members/${env.a.ids.zeynep}`, { role: 'member' })).status).toBe(200);
    const zeynep2 = await login(env, 'acme', 'zeynep@demo.example');
    expect((await zeynep2.get('/api/me')).json.org.accountFields.map((f: any) => f.key)).toContain('arr');
  });

  it('a lead adds members to their department, never leads; people managers do the rest', async () => {
    expect((await omar.put(`/api/departments/${dept.sales}/members/${env.a.ids.lena}`, { role: 'member' })).status).toBe(200);
    expect((await omar.put(`/api/departments/${dept.sales}/members/${env.a.ids.lena}`, { role: 'lead' })).status).toBe(403);
    expect((await omar.put(`/api/departments/${dept.product}/members/${env.a.ids.sofia}`, { role: 'member' })).status).toBe(403);
    expect((await zeynep.del(`/api/departments/${dept.sales}/members/${env.a.ids.lena}`)).status).toBe(403);
    expect((await omar.del(`/api/departments/${dept.sales}/members/${env.a.ids.lena}`)).status).toBe(200);
    // The database says the same to a member writing directly.
    await expect(
      env.db.tenant({ orgId: env.a.orgId, userId: env.a.ids.zeynep }, (q) =>
        q.query(`insert into department_members (org_id, department_id, user_id, role) values ($1, $2, $3, 'lead')`, [env.a.orgId, dept.sales, env.a.ids.zeynep]),
      ),
    ).rejects.toThrow();
  });

  it('the row rules hold below the server: no board, task or count of another department or company', async () => {
    const rows = await env.db.tenant({ orgId: env.a.orgId, userId: env.a.ids.lena }, async (q) => ({
      boards: await q.query('select id from boards where id = $1', [pipeline]),
      tasks: await q.query('select id from tasks where id = $1', [secret]),
      links: await q.query('select * from app_task_link_cards($1)', [secret]),
    }));
    expect(rows.boards).toHaveLength(0);
    expect(rows.tasks).toHaveLength(0);
    expect(rows.links).toHaveLength(0);
    const other = await env.db.tenant({ orgId: env.b.orgId, userId: env.b.ids.ada }, async (q) => ({
      depts: await q.query('select id from departments where org_id = $1', [env.a.orgId]),
      members: await q.query('select 1 from department_members where org_id = $1', [env.a.orgId]),
      desks: await q.query('select id from app_request_desks() where id = $1', [backlog]),
      counts: await q.query('select * from app_account_departments($1)', [account]),
    }));
    expect(other).toEqual({ depts: [], members: [], desks: [], counts: [] });
  });

  it('another company reaches none of it', async () => {
    expect((await stranger.get('/api/departments')).json.departments.map((d: any) => d.id)).not.toContain(dept.sales);
    expect((await stranger.patch(`/api/departments/${dept.sales}`, { enabled: false })).status).toBe(404);
    expect((await stranger.put(`/api/departments/${dept.sales}/members/${env.a.ids.lena}`, { role: 'lead' })).status).toBe(404);
    expect((await stranger.post(`/api/boards/${backlog}/requests`, { title: 'from outside' })).status).toBe(404);
    const moves = await ada.get('/api/departments/moves');
    expect(moves.status).toBe(200);
    expect((await stranger.post('/api/departments/moves/accept', { ids: [crypto.randomUUID()] })).json.accepted).toBe(0);
    expect((await zeynep.get('/api/departments/moves')).status).toBe(403);
  });
});
