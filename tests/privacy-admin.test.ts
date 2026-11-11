// Company administration and the KVKK/GDPR tools.
import { beforeAll, describe, expect, it } from 'vitest';
import { login, setup, type Client, type Env } from './helpers';

let env: Env;
let ada: Client;
beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
});

describe('permissions', () => {
  it('members cannot reach administration', async () => {
    const z = await login(env, 'acme', 'zeynep@demo.example');
    for (const path of ['/api/admin/users', '/api/admin/roles', '/api/admin/audit']) {
      expect((await z.get(path)).status, path).toBe(403);
    }
    expect((await z.patch('/api/admin/org', { name: 'x' })).status).toBe(403);
  });

  it('the last administrator cannot be removed', async () => {
    const r = await ada.patch(`/api/admin/users/${env.a.ids.ada}`, { status: 'disabled' });
    expect(r.status).toBe(409);
    expect(r.json.error).toBe('last_admin');
  });

  it("the administrator role always keeps every permission", async () => {
    const roles = (await ada.get('/api/admin/roles')).json.roles;
    const admin = roles.find((r: any) => r.key === 'admin');
    const r = await ada.patch(`/api/admin/roles/${admin.id}`, { perms: [] });
    expect(r.json.role.perms.length).toBe((await import('../shared/src/model')).PERMS.length);
  });

  it('custom roles: create, use, refuse delete while in use', async () => {
    const role = (await ada.post('/api/admin/roles', { key: 'renewals', name: 'Renewal manager', perms: ['boards.view_all'] })).json.role;
    await ada.patch(`/api/admin/users/${env.a.ids.omar}`, { roleId: role.id });
    const omar = await login(env, 'acme', 'omar@demo.example');
    expect((await omar.get('/api/boards')).json.boards.length).toBe(3); // sees all now
    expect((await ada.del(`/api/admin/roles/${role.id}`)).json.error).toBe('role_in_use');
  });
});

describe('company settings and vocabulary', () => {
  it('changes the word for customers, used in messages', async () => {
    const r = await ada.patch('/api/admin/org', {
      terms: { account: { en: { one: 'Partner', other: 'Partners' }, tr: { one: 'Partner', other: 'Partnerler' } } },
      timezone: 'Europe/Istanbul',
    });
    expect(r.status).toBe(200);
    const me = (await ada.get('/api/me')).json;
    expect(me.org.terms.account.en.one).toBe('Partner');
    expect(me.org.timezone).toBe('Europe/Istanbul');
  });

  it('refuses an unknown time zone', async () => {
    expect((await ada.patch('/api/admin/org', { timezone: 'Nowhere/Atlantis' })).status).toBe(400);
  });
});

describe('personal data (KVKK / GDPR)', () => {
  it('exports everything held about a person', async () => {
    const r = await ada.get(`/api/admin/users/${env.a.ids.zeynep}/export`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-disposition')).toContain('attachment');
    expect(r.json.person.email).toBe('zeynep@demo.example');
    expect(r.json.tasks.length).toBeGreaterThan(0);
    expect(Array.isArray(r.json.sessions)).toBe(true);
    const log = (await ada.get('/api/admin/audit')).json.entries;
    expect(log.some((e: any) => e.action === 'user.exported' && e.entityId === env.a.ids.zeynep)).toBe(true);
  });

  it('erases a person everywhere and keeps the business record', async () => {
    const lena = await login(env, 'acme', 'lena@demo.example');
    const t = (await lena.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Lena task', assigneeIds: [env.a.ids.lena, env.a.ids.zeynep] })).json.task;
    await lena.post(`/api/tasks/${t.id}/comments`, { body: 'written by Lena' });

    const r = await ada.post(`/api/admin/users/${env.a.ids.lena}/erase`);
    expect(r.status).toBe(200);

    expect((await lena.get('/api/me')).status).toBe(401);
    const users = (await ada.get('/api/admin/users')).json.users;
    const erased = users.find((u: any) => u.id === env.a.ids.lena);
    expect(erased).toMatchObject({ status: 'deleted', name: '—' });
    expect(erased.email).not.toContain('lena');

    const task = (await ada.get(`/api/tasks/${t.id}`)).json.task;
    expect(task.assigneeIds).toEqual([env.a.ids.zeynep]);
    expect(task.createdBy).toBeNull();
    expect(task.comments[0]).toMatchObject({ body: 'written by Lena', authorId: null });

    // The address no longer signs anyone in (at most it can ask to join again, which an admin must approve).
    const before = env.email.sent.length;
    await new (await import('./helpers')).Client(env, 'acme').post('/api/auth/start', { email: 'lena@demo.example' });
    expect(env.email.sent.slice(before).some((m) => m.text.includes('/auth/verify'))).toBe(false);

    // No trace of the address in sessions or one-time tokens.
    const left = await env.db.system((q) =>
      q.query(`select (select count(*) from sessions where user_id = $1)::int as s,
                      (select count(*) from login_tokens where email = 'lena@demo.example' and org_id = $2 and kind <> 'join')::int as t`, [env.a.ids.lena, env.a.orgId]),
    );
    expect(left[0]).toEqual({ s: 0, t: 0 });
  });

  it('nobody can erase themselves', async () => {
    expect((await ada.post(`/api/admin/users/${env.a.ids.ada}/erase`)).status).toBe(403);
  });
});

describe('people and teams', () => {
  it('counts full seats; viewers are free', async () => {
    const r = (await ada.get('/api/admin/users')).json;
    const full = r.users.filter((u: any) => u.seat === 'full' && ['active', 'invited'].includes(u.status)).length;
    expect(r.seatsUsed).toBe(full);
    expect(r.users.some((u: any) => u.seat === 'viewer')).toBe(true);
  });

  it('refuses a duplicate email', async () => {
    const roles = (await ada.get('/api/admin/roles')).json.roles;
    const r = await ada.post('/api/admin/users', { email: 'MERT@demo.example', name: 'Dup', roleId: roles[0].id, seat: 'full' });
    expect(r.json.error).toBe('email_taken');
  });

  it('creates a team with a lead who becomes a member', async () => {
    const r = await ada.post('/api/admin/teams', { name: 'Onboarding', leadId: env.a.ids.zeynep, memberIds: [] });
    expect(r.status).toBe(201);
    const teams = (await ada.get('/api/people')).json.teams;
    expect(teams.find((t: any) => t.name === 'Onboarding').memberIds).toEqual([env.a.ids.zeynep]);
  });
});
