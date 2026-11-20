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
    // Consents are personal data too: the assistant notice answer and the consent banner choices are in the file.
    await env.db.system(async (q) => {
      await q.query(`insert into assistant_consents (org_id, user_id, surface, version, locale, granted) values ($1, $2, 'app', 'v-test', 'en', true)`, [env.a.orgId, env.a.ids.zeynep]);
      await q.query(`insert into consent_log (org_id, user_id, analytics, marketing, source, policy_version, locale, action) values ($1, $2, true, false, 'app', 'p-test', 'en', 'custom')`, [env.a.orgId, env.a.ids.zeynep]);
    });
    const r = await ada.get(`/api/admin/users/${env.a.ids.zeynep}/export`);
    expect(r.json.assistantConsents).toContainEqual(expect.objectContaining({ version: 'v-test', granted: true }));
    expect(r.json.consentChoices).toContainEqual(expect.objectContaining({ analytics: true, marketing: false, policyVersion: 'p-test', action: 'custom' }));
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

    // What the first erase left behind (L1 audit): CuraAI questions, notifications, mentions in the AI team's memory.
    const [{ name: lenaName }] = await env.db.system((q) => q.query(`select name from users where id = $1`, [env.a.ids.lena]));
    await env.db.system(async (q) => {
      await q.query(`insert into assistant_log (org_id, user_id, surface, question, kind, engine) values ($1, $2, 'app', 'Lena asks something', 'answer', 'docs')`, [env.a.orgId, env.a.ids.lena]);
      await q.query(`insert into notifications (org_id, user_id, kind) values ($1, $2, 'mention')`, [env.a.orgId, env.a.ids.lena]);
      await q.query(`insert into seats (seat, title, team, tier) values ('erase-test', 'Erase test', 'ops', 'specialist') on conflict do nothing`);
      await q.query(`insert into agent_memory (seat, key, value) values ('erase-test', 'note.lena', $1)`, [`Follow up with ${lenaName} (lena@demo.example) and with Ada.`]);
    });

    const r = await ada.post(`/api/admin/users/${env.a.ids.lena}/erase`);
    expect(r.status).toBe(200);
    const extras = await env.db.system(async (q) => ({
      asked: (await q.query(`select count(*)::int as n from assistant_log where user_id = $1`, [env.a.ids.lena]))[0].n,
      notes: (await q.query(`select count(*)::int as n from notifications where user_id = $1`, [env.a.ids.lena]))[0].n,
      memory: (await q.query(`select value from agent_memory where seat = 'erase-test' and key = 'note.lena'`))[0].value,
    }));
    expect(extras).toMatchObject({ asked: 0, notes: 0 });
    expect(extras.memory).not.toContain('lena@demo.example');
    if (/\S+\s+\S+/.test(lenaName)) expect(extras.memory).not.toContain(lenaName);
    expect(extras.memory).toContain('Ada');

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

  it('a person at a customer: download their data, then erase them for good (not just switch them off)', async () => {
    const account = (await env.db.system((q) => q.query(`select id from accounts where org_id = $1 limit 1`, [env.a.orgId])))[0].id;
    const [pu] = await env.db.system((q) =>
      q.query(`insert into portal_users (org_id, account_id, email, name, status) values ($1, $2, 'pia.portal@demo.example', 'Pia Portal', 'active') returning id`, [env.a.orgId, account]),
    );
    await env.db.system((q) => q.query(`insert into comments (org_id, task_id, body, portal_author_id) select org_id, id, 'from Pia', $2 from tasks where org_id = $1 limit 1`, [env.a.orgId, pu.id]));
    // What she asked the portal's assistant and her answer to its notice (0249): in her file, and gone with her.
    await env.db.system(async (q) => {
      await q.query(`insert into assistant_log (org_id, portal_user_id, surface, question, kind, engine) values ($1, $2, 'portal', 'Where is my request?', 'answer', 'model')`, [env.a.orgId, pu.id]);
      await q.query(`insert into assistant_consents (org_id, portal_user_id, surface, version, locale, granted) values ($1, $2, 'portal', 'v-test', 'en', true)`, [env.a.orgId, pu.id]);
    });
    const zeynep = await login(env, 'acme', 'zeynep@demo.example');
    expect((await zeynep.post(`/api/admin/portal-users/${pu.id}/erase`)).status).toBe(403);
    // Another company's administrator cannot reach this person.
    const other = await login(env, 'beta', 'ada@demo.example');
    expect((await other.get(`/api/admin/portal-users/${pu.id}/export`)).status).toBe(404);
    expect((await other.post(`/api/admin/portal-users/${pu.id}/erase`)).status).toBe(404);

    const file = await ada.get(`/api/admin/portal-users/${pu.id}/export`);
    expect(file.status).toBe(200);
    expect(file.json.person).toMatchObject({ email: 'pia.portal@demo.example', name: 'Pia Portal' });
    expect(file.json.assistantQuestions).toEqual([expect.objectContaining({ question: 'Where is my request?' })]);
    expect(file.json.assistantConsents).toEqual([expect.objectContaining({ version: 'v-test', granted: true })]);

    expect((await ada.post(`/api/admin/portal-users/${pu.id}/erase`)).status).toBe(200);
    const left = await env.db.system((q) => q.query(`select 1 from portal_users where id = $1`, [pu.id]));
    expect(left).toHaveLength(0);
    expect(await env.db.system((q) => q.query(`select 1 from assistant_log where org_id = $1 and question = 'Where is my request?'`, [env.a.orgId]))).toHaveLength(0);
    // Her answer to the assistant's notice stays as proof, with nobody attached (0251).
    expect(await env.db.system((q) => q.query(`select portal_user_id, surface, version, granted from assistant_consents where org_id = $1 and version = 'v-test' and surface = 'portal'`, [env.a.orgId]))).toEqual([
      { portal_user_id: null, surface: 'portal', version: 'v-test', granted: true },
    ]);
    // What they wrote stays, with no author.
    const kept = await env.db.system((q) => q.query(`select portal_author_id from comments where org_id = $1 and body = 'from Pia'`, [env.a.orgId]));
    expect(kept).toEqual([{ portal_author_id: null }]);
    expect((await ada.post(`/api/admin/portal-users/${pu.id}/erase`)).status).toBe(404);
    const log = (await ada.get('/api/admin/audit')).json.entries;
    expect(log.some((e: any) => e.action === 'portal.user_erased' && e.entityId === pu.id)).toBe(true);
  });

  it('logs requests about personal data with the due date of their law, closes them, and keeps them from members', async () => {
    const logged = await ada.post('/api/admin/privacy-requests', { kind: 'objection', subjectName: 'Pia Portal', subjectEmail: 'pia.portal@demo.example', law: 'kvkk', receivedOn: '2026-11-02', note: 'Objects to the newsletter' });
    expect(logged.status).toBe(201);
    expect(logged.json.request).toMatchObject({ kind: 'objection', law: 'kvkk', receivedOn: '2026-11-02', dueOn: '2026-12-02', status: 'open' });
    const korea = (await ada.post('/api/admin/privacy-requests', { kind: 'restriction', subjectName: 'Min Park', law: 'pipa', receivedOn: '2026-11-02' })).json.request;
    expect(korea.dueOn).toBe('2026-11-12');
    expect((await ada.post('/api/admin/privacy-requests', { kind: 'access', subjectName: 'X', law: 'gdpr', receivedOn: '2026-11-02', dueOn: '2026-10-01' })).status).toBe(400);
    // The open one due first comes first.
    const list = (await ada.get('/api/admin/privacy-requests')).json.requests;
    expect(list.slice(0, 2).map((r: any) => r.subjectName)).toEqual(['Min Park', 'Pia Portal']);
    const closed = await ada.patch(`/api/admin/privacy-requests/${korea.id}`, { status: 'done', note: 'Processing restricted' });
    expect(closed.json.request).toMatchObject({ status: 'done', note: 'Processing restricted' });
    expect(closed.json.request.closedAt).toBeTruthy();
    // Members see nothing of it, in the route and in the database.
    const zeynep = await login(env, 'acme', 'zeynep@demo.example');
    expect((await zeynep.get('/api/admin/privacy-requests')).status).toBe(403);
    const seen = await env.db.tenant({ orgId: env.a.orgId, userId: env.a.ids.zeynep }, (q) => q.query('select id from privacy_requests'));
    expect(seen).toEqual([]);
    const log = (await ada.get('/api/admin/audit')).json.entries;
    expect(log.some((e: any) => e.action === 'privacy.request_logged')).toBe(true);
    expect(log.some((e: any) => e.action === 'privacy.request_updated' && e.entityId === korea.id)).toBe(true);
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

describe('nobody hands out more than they hold', () => {
  it('a user manager cannot make themselves or anyone an administrator, nor disable one', async () => {
    const roles = (await ada.get('/api/admin/roles')).json.roles as { id: string; key: string; perms: string[] }[];
    const adminRole = roles.find((r) => r.key === 'admin')!;
    const memberRole = roles.find((r) => r.key === 'member')!;
    // A role that may manage people, with what an ordinary member may do — and nothing more.
    const made = await ada.post('/api/admin/roles', { key: 'people_ops', name: 'People ops', perms: [...new Set([...memberRole.perms, 'users.manage'])] });
    expect(made.status).toBe(201);
    expect((await ada.patch(`/api/admin/users/${env.a.ids.mert}`, { roleId: made.json.role.id })).status).toBe(200);
    const mert = await login(env, 'acme', 'mert@demo.example');

    // Not themselves, not someone else, not on a new invitation.
    expect((await mert.patch(`/api/admin/users/${env.a.ids.mert}`, { roleId: adminRole.id })).status).toBe(403);
    expect((await mert.patch(`/api/admin/users/${env.a.ids.sofia}`, { roleId: adminRole.id })).status).toBe(403);
    expect((await mert.post('/api/admin/users', { email: 'new@demo.example', name: 'New', roleId: adminRole.id, seat: 'full' })).status).toBe(403);
    // Not a role they would have to build with permissions they lack, nor one widened past their own.
    expect((await mert.post('/api/admin/roles', { key: 'x_admin', name: 'X', perms: ['users.manage', 'org.manage'] })).status).toBe(403);
    // An administrator stays out of their reach.
    expect((await mert.patch(`/api/admin/users/${env.a.ids.ada}`, { status: 'disabled' })).status).toBe(403);
    expect((await mert.patch(`/api/admin/users/${env.a.ids.ada}`, { roleId: memberRole.id })).status).toBe(403);
    expect((await ada.get('/api/me')).status).toBe(200);

    // What they may do: give a role that asks for nothing more than they hold.
    expect((await mert.patch(`/api/admin/users/${env.a.ids.sofia}`, { roleId: memberRole.id })).status).toBe(200);
    expect((await mert.post('/api/admin/users', { email: 'new@demo.example', name: 'New', roleId: memberRole.id, seat: 'full' })).status).toBe(201);
  });
});
