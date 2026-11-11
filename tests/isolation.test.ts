// Acceptance: one company can never read or change another company's data —
// not through the API and not through a raw SQL query in its own context.
import { beforeAll, describe, expect, it } from 'vitest';
import { Client, login, setup, type Env } from './helpers';

let env: Env;
beforeAll(async () => {
  env = await setup();
});

describe('database row-level security', () => {
  it('a raw query in company A context only returns company A rows', async () => {
    for (const table of ['users', 'roles', 'teams', 'boards', 'tasks', 'comments', 'audit_log', 'sessions']) {
      const rows = await env.db.tenant({ orgId: env.a.orgId, userId: env.a.ids.ada }, (q) =>
        q.query(`select org_id from ${table}`),
      );
      expect(rows.every((r) => r.org_id === env.a.orgId), table).toBe(true);
    }
    const tasks = await env.db.tenant({ orgId: env.a.orgId, userId: env.a.ids.ada }, (q) => q.query('select id from tasks'));
    expect(tasks.length).toBeGreaterThan(5);
  });

  it('without a company context nothing is visible', async () => {
    const rows = await env.db.tenant({ orgId: null, userId: null }, (q) => q.query('select id from tasks'));
    expect(rows).toHaveLength(0);
    const orgs = await env.db.tenant({ orgId: null, userId: null }, (q) => q.query('select id from orgs'));
    expect(orgs).toHaveLength(0);
  });

  it('refuses to write a row into another company', async () => {
    await expect(
      env.db.tenant({ orgId: env.a.orgId, userId: env.a.ids.ada }, (q) =>
        q.query(`insert into tasks (org_id, board_id, title, status) values ($1, $2, 'x', 'todo')`, [env.b.orgId, env.b.boards.renewals]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("cannot update or delete another company's rows", async () => {
    const updated = await env.db.tenant({ orgId: env.a.orgId, userId: env.a.ids.ada }, (q) =>
      q.query(`update tasks set title = 'hacked' where org_id = $1 returning id`, [env.b.orgId]),
    );
    expect(updated).toHaveLength(0);
    const deleted = await env.db.tenant({ orgId: env.a.orgId, userId: env.a.ids.ada }, (q) =>
      q.query('delete from users where org_id = $1 returning id', [env.b.orgId]),
    );
    expect(deleted).toHaveLength(0);
  });

  it('hides a private board from people who are not on it', async () => {
    const rows = await env.db.tenant({ orgId: env.a.orgId, userId: env.a.ids.zeynep }, (q) =>
      q.query('select id from tasks where board_id = $1', [env.a.boards.privateBoard]),
    );
    expect(rows).toHaveLength(0);
  });

  it('hides a team board from people outside the team', async () => {
    const rows = await env.db.tenant({ orgId: env.a.orgId, userId: env.a.ids.omar }, (q) =>
      q.query('select id from boards where id = $1', [env.a.boards.csBoard]),
    );
    expect(rows).toHaveLength(0);
  });

  it('a viewer seat cannot write even with raw SQL', async () => {
    await expect(
      env.db.tenant({ orgId: env.a.orgId, userId: env.a.ids.sofia }, (q) =>
        q.query(`insert into tasks (org_id, board_id, title, status) values ($1, $2, 'x', 'todo')`, [env.a.orgId, env.a.boards.renewals]),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe('API isolation', () => {
  it('a session from company A does not work on company B', async () => {
    const ada = await login(env, 'acme', 'ada@demo.example');
    expect((await ada.get('/api/me')).status).toBe(200);
    const stolen = new Client(env, 'beta', ada.device);
    stolen.cookie = ada.cookie;
    const r = await stolen.get('/api/me');
    expect(r.status).toBe(401);
    expect(r.json.error).toBe('unauthenticated');
  });

  it('cannot open a task of another company by id', async () => {
    const ada = await login(env, 'acme', 'ada@demo.example');
    const betaTasks = await env.db.tenant({ orgId: env.b.orgId, userId: env.b.ids.ada }, (q) => q.query('select id from tasks limit 1'));
    const r = await ada.get(`/api/tasks/${betaTasks[0].id}`);
    expect(r.status).toBe(404);
  });

  it('unknown and reserved addresses have no workspace', async () => {
    expect((await new Client(env, 'nobody').get('/api/org')).json.error).toBe('org_not_found');
    expect((await new Client(env, 'app').get('/api/org')).status).toBe(404);
  });

  it('only shows boards the person may see', async () => {
    const omar = await login(env, 'acme', 'omar@demo.example');
    const names = (await omar.get('/api/boards')).json.boards.map((b: any) => b.name);
    expect(names).toEqual(['Renewals']);
    const ada = await login(env, 'acme', 'ada@demo.example');
    expect((await ada.get('/api/boards')).json.boards).toHaveLength(3);
  });

  it('refuses writes from a read-only seat with a clear message', async () => {
    const sofia = await login(env, 'acme', 'sofia@demo.example');
    const r = await sofia.post('/api/tasks', { boardId: env.a.boards.renewals, title: 'x' });
    expect(r.status).toBe(403);
    expect(r.json.error).toBe('read_only_seat');
    expect(r.json.message).toMatch(/read-only/);
  });
});
