// A person downloads their own data from My profile (KVKK m.11, GDPR Art. 15/20):
// "Confirm it's you" first, at most three times a day, every download in the
// activity log; what they can no longer open stays closed; the administrator's
// export (privacy-admin.test.ts) keeps everything.
import { beforeAll, describe, expect, it } from 'vitest';
import { Client, login, setup, type Env } from './helpers';

let env: Env;
beforeAll(async () => {
  env = await setup();
});

const age = (c: Client, minutes: number) =>
  env.db.system((q) =>
    q.query(`update sessions set created_at = now() - make_interval(mins => $1::int), confirmed_at = null where revoked_at is null and device_id = $2`, [minutes, c.device]),
  );

describe('my own data', () => {
  it('asks to confirm it is you, then gives everything held about me that I can open, and logs it', async () => {
    const lena = await login(env, 'acme', 'lena@demo.example');
    // A private board Lena is not on, with a task assigned to her: in the administrator's export, not in hers.
    const [board] = await env.db.system((q) =>
      q.query(`insert into boards (org_id, name, visibility, columns, created_by) select org_id, 'Board kept private', 'private', columns, $2 from boards where org_id = $1 limit 1 returning id`, [
        env.a.orgId,
        env.a.ids.ada,
      ]),
    );
    await env.db.system((q) =>
      q.query(`insert into board_members (org_id, board_id, user_id) values ($1, $2, $3)`, [env.a.orgId, board.id, env.a.ids.ada]),
    );
    await env.db.system((q) =>
      q.query(`insert into tasks (org_id, board_id, title, status, assignee_ids, position, created_by) select $1, $2, 'Hidden follow-up', columns->0->>'key', array[$3::uuid], 1, $4 from boards where id = $2`, [
        env.a.orgId,
        board.id,
        env.a.ids.lena,
        env.a.ids.ada,
      ]),
    );

    await age(lena, 30);
    const stale = await lena.get('/api/me/export');
    expect(stale.status).toBe(403);
    expect(stale.json.error).toBe('reauth_required');
    const sent = await lena.post('/api/me/confirm/email', {});
    expect((await lena.post('/api/me/confirm', { emailCode: sent.json.devCode })).status).toBe(200);

    const r = await lena.get('/api/me/export');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-disposition')).toContain('attachment');
    expect(r.json.person.email).toBe('lena@demo.example');
    expect(r.json.sessions.length).toBeGreaterThan(0);
    const titles = r.json.tasks.map((t: any) => t.title);
    expect(titles).not.toContain('Hidden follow-up');
    // Only her own: no one else's comments or sessions.
    expect(r.json.comments.every((c: any) => c.authorId === env.a.ids.lena)).toBe(true);

    const ada = await login(env, 'acme', 'ada@demo.example');
    const full = await ada.get(`/api/admin/users/${env.a.ids.lena}/export`);
    expect(full.json.tasks.map((t: any) => t.title)).toContain('Hidden follow-up');
    expect(full.json.tasks.length).toBeGreaterThan(r.json.tasks.length);

    const [line] = await env.db.system((q) => q.query(`select actor_id, entity_id from audit_log where org_id = $1 and action = 'user.self_exported' order by at desc limit 1`, [env.a.orgId]));
    expect(line).toMatchObject({ actor_id: env.a.ids.lena, entity_id: env.a.ids.lena });
  });

  it('three times a day, then says when to try again', async () => {
    const omar = await login(env, 'acme', 'omar@demo.example');
    for (let i = 0; i < 3; i++) expect((await omar.get('/api/me/export')).status).toBe(200);
    const fourth = await omar.get('/api/me/export');
    expect(fourth.status).toBe(429);
    expect(fourth.json.error).toBe('too_many_requests');
    // Said in hours, not 1,440 minutes.
    expect(fourth.json.message).toMatch(/3 times a day.*(23|24) hours/);
    const wait = Number(fourth.headers.get('retry-after'));
    expect(wait).toBeGreaterThan(23 * 3600);
    expect(wait).toBeLessThanOrEqual(24 * 3600);
    // Another person's limit is their own.
    const zeynep = await login(env, 'acme', 'zeynep@demo.example');
    expect((await zeynep.get('/api/me/export')).status).toBe(200);
    // A day later it works again.
    // (The activity log cannot be changed: the test lifts that guard for a moment to move time.)
    await env.db.system(async (q) => {
      await q.query('alter table audit_log disable trigger audit_log_no_update');
      await q.query(`update audit_log set at = at - interval '25 hours' where org_id = $1 and actor_id = $2 and action = 'user.self_exported'`, [env.a.orgId, env.a.ids.omar]);
      await q.query('alter table audit_log enable trigger audit_log_no_update');
    });
    expect((await omar.get('/api/me/export')).status).toBe(200);
  });
});
