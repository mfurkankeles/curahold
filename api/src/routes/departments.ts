// Departments: who is in which, who leads it, whether the company has it, and
// the record of the move into departments (administrators only).
import type { DepartmentMembersRow, UsersRow } from '../db/rows.gen';
import { Hono } from 'hono';
import { z } from 'zod';
import { DEPARTMENT_KEYS } from '../../../shared/src/model';
import { requirePerm, requireWriter, run, type AppEnv } from '../context';
import { audit } from '../lib/audit';
import { listDepartments, loadDepartment, mayManageMembers, seesAllDepartments } from '../lib/departments';
import { fail } from '../lib/errors';
import { body, param, uuid } from '../lib/validate';

export const departmentRoutes = new Hono<AppEnv>();

/** The departments with their people (for the settings screen and member pickers). */
departmentRoutes.get('/departments', async (c) => {
  const auth = c.get('auth');
  const out = await run(c, async (q) => {
    const departments = await listDepartments(q, auth);
    const members = await q.query<{ department_id: string; user_id: string; role: string }>(
      'select department_id, user_id, role from department_members order by created_at',
    );
    const boards = await q.query<{ department_id: string; n: number }>(
      // Every board, also ones this person cannot open: a count says nothing about them.
      `select d.id as department_id, (select count(*)::int from boards b where b.department_id = d.id and b.archived_at is null) as n from departments d`,
    );
    const visibleCounts = seesAllDepartments(auth) ? boards : [];
    return departments.map((d) => ({
      ...d,
      members: members.filter((m) => m.department_id === d.id).map((m) => ({ userId: m.user_id, role: m.role })),
      boardCount: visibleCounts.find((b) => b.department_id === d.id)?.n ?? null,
    }));
  });
  return c.json({ departments: out });
});

const patchSchema = z.object({
  /** Part of the company's plan (see the owner's pricing note); administrators switch it while billing is off. */
  enabled: z.boolean().optional(),
  bandView: z.array(z.enum(DEPARTMENT_KEYS)).max(4).nullable().optional(),
});

/** Renames a department or turns it on or off; at least one stays on. Needs org.manage and a writer seat. */
departmentRoutes.patch('/departments/:id', async (c) => {
  requireWriter(c);
  requirePerm(c, 'org.manage');
  const id = param(c, 'id');
  const input = await body(c, patchSchema);
  const auth = c.get('auth');
  const org = c.get('org');
  const departments = await run(c, async (q) => {
    const d = await loadDepartment(q, id);
    if (input.enabled === false) {
      // At least one department stays: the company's work has to live somewhere.
      const [{ n }] = await q.query<{ n: number }>('select count(*)::int as n from departments where enabled and id <> $1', [id]);
      if (n === 0) fail('validation', { fields: 'enabled' }, { fields: ['enabled'] });
    }
    await q.query(
      `update departments set enabled = coalesce($2, enabled), band_view = case when $3 then $4::text[] else band_view end where id = $1`,
      [id, input.enabled ?? null, input.bandView !== undefined, input.bandView ?? null],
    );
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'department.updated', entity: 'department', entityId: id, meta: { key: d.key, ...input } });
    return listDepartments(q, auth);
  });
  return c.json({ departments });
});

/** The settings screen: a department's leads and members, all at once (people managers). */
departmentRoutes.put('/departments/:id/people', async (c) => {
  requireWriter(c);
  requirePerm(c, 'users.manage');
  const id = param(c, 'id');
  const input = await body(c, z.object({ leadIds: z.array(uuid).max(50), memberIds: z.array(uuid).max(5000) }));
  const auth = c.get('auth');
  const org = c.get('org');
  await run(c, async (q) => {
    await loadDepartment(q, id);
    const leads = [...new Set(input.leadIds)];
    const members = [...new Set(input.memberIds)].filter((m) => !leads.includes(m));
    const all = [...leads, ...members];
    if (all.length) {
      const ok = await q.query<Pick<UsersRow, 'id'>>(`select id from users where id = any($1::uuid[]) and status <> 'deleted'`, [all]);
      if (ok.length !== all.length) fail('validation', { fields: 'memberIds' }, { fields: ['memberIds'] });
    }
    await q.query('delete from department_members where department_id = $1 and not (user_id = any($2::uuid[]))', [id, all]);
    for (const [list, role] of [[leads, 'lead'], [members, 'member']] as const) {
      for (const u of list) {
        await q.query(
          `insert into department_members (org_id, department_id, user_id, role) values ($1, $2, $3, $4)
           on conflict (department_id, user_id) do update set role = excluded.role`,
          [org.id, id, u, role],
        );
      }
    }
    if (all.length) await q.query(`update department_moves set applied = true where department_id = $1 and kind = 'member' and not applied and user_id = any($2::uuid[])`, [id, all]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'department.people_set', entity: 'department', entityId: id, meta: { leads: leads.length, members: members.length } });
  });
  return c.json({ ok: true });
});

/**
 * Adds a person to a department or changes their role there. A lead may add members; making or unmaking a lead
 * needs a people manager (mayManageMembers). Department walls are enforced in SQL (ADR 0009).
 */
departmentRoutes.put('/departments/:id/members/:userId', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const userId = param(c, 'userId');
  const { role } = await body(c, z.object({ role: z.enum(['lead', 'member']) }));
  const auth = c.get('auth');
  const org = c.get('org');
  await run(c, async (q) => {
    await loadDepartment(q, id);
    const [u] = await q.query<Pick<UsersRow, 'id'>>(`select id from users where id = $1 and status <> 'deleted'`, [userId]);
    if (!u) fail('not_found');
    const [had] = await q.query<Pick<DepartmentMembersRow, 'role'>>('select role from department_members where department_id = $1 and user_id = $2', [id, userId]);
    // A lead may add members; making or unmaking a lead is a people manager's job.
    if (!(await mayManageMembers(q, auth, id, had?.role === 'lead' ? 'lead' : role))) fail('forbidden');
    if (had) await q.query('update department_members set role = $3 where department_id = $1 and user_id = $2', [id, userId, role]);
    else await q.query('insert into department_members (org_id, department_id, user_id, role) values ($1, $2, $3, $4)', [org.id, id, userId, role]);
    await q.query(`update department_moves set applied = true where department_id = $1 and user_id = $2 and kind = 'member' and not applied`, [id, userId]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'department.member_set', entity: 'department', entityId: id, meta: { userId, role } });
  });
  return c.json({ ok: true });
});

/** Removes a person from a department; same rule as adding. Audited. */
departmentRoutes.delete('/departments/:id/members/:userId', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const userId = param(c, 'userId');
  const auth = c.get('auth');
  const org = c.get('org');
  await run(c, async (q) => {
    await loadDepartment(q, id);
    const [had] = await q.query('select role from department_members where department_id = $1 and user_id = $2', [id, userId]);
    if (!had) fail('not_found');
    if (!(await mayManageMembers(q, auth, id, had.role))) fail('forbidden');
    await q.query('delete from department_members where department_id = $1 and user_id = $2', [id, userId]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'department.member_removed', entity: 'department', entityId: id, meta: { userId } });
  });
  return c.json({ ok: true });
});

/** Where every board went in the move into departments, and the people still to place. */
departmentRoutes.get('/departments/moves', async (c) => {
  requirePerm(c, 'org.manage');
  const out = await run(c, async (q) => {
    const boards = await q.query(
      `select mv.board_id, b.name, b.department_id, mv.department_id as moved_to, mv.reason, mv.detail, mv.created_at
         from department_moves mv join boards b on b.id = mv.board_id
        where mv.kind = 'board' and b.archived_at is null order by mv.created_at, b.name`,
    );
    const people = await q.query(
      `select mv.id, mv.user_id, mv.department_id, coalesce((mv.detail ->> 'boards')::int, 0) as boards
         from department_moves mv join users u on u.id = mv.user_id and u.status <> 'deleted'
        where mv.kind = 'member' and not mv.applied order by mv.created_at`,
    );
    return {
      boards: boards.map((r) => ({
        boardId: r.board_id,
        name: r.name,
        departmentId: r.department_id,
        movedTo: r.moved_to,
        reason: r.reason as string,
        personal: !!r.detail?.personal,
        visibility: r.detail?.visibility ?? null,
      })),
      suggestions: people.map((r) => ({ id: r.id, userId: r.user_id, departmentId: r.department_id, boards: Number(r.boards) })),
    };
  });
  return c.json(out);
});

/** Accept suggestions: those people join the department (and see its boards again). */
departmentRoutes.post('/departments/moves/accept', async (c) => {
  requireWriter(c);
  requirePerm(c, 'org.manage');
  const { ids } = await body(c, z.object({ ids: z.array(uuid).min(1).max(1000) }));
  const auth = c.get('auth');
  const org = c.get('org');
  const n = await run(c, async (q) => {
    const rows = await q.query<{ department_id: string; user_id: string }>(
      `update department_moves set applied = true where id = any($1::uuid[]) and kind = 'member' and not applied returning department_id, user_id`,
      [ids],
    );
    for (const r of rows) {
      await q.query('insert into department_members (org_id, department_id, user_id) values ($1, $2, $3) on conflict do nothing', [org.id, r.department_id, r.user_id]);
    }
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'department.suggestions_accepted', entity: 'department', entityId: null, meta: { count: rows.length } });
    return rows.length;
  });
  return c.json({ accepted: n });
});

/** Boards in other departments that take requests through their form (the way work crosses a wall). */
departmentRoutes.get('/departments/desks', async (c) => {
  const desks = await run(c, async (q) => {
    const rows = await q.query(`select r.*, r.id in (select app_visible_boards()) as mine from app_request_desks() r`);
    return rows
      .filter((r) => !r.mine)
      .map((r) => {
        const form = r.form ?? {};
        const asked = new Set<string>(form.fields ?? []);
        return {
          id: r.id,
          name: r.name,
          departmentKey: r.department_key,
          form: { on: true, title: form.title, intro: form.intro, fields: form.fields ?? [], column: form.column ?? null },
          // Only the fields the form asks for: the board's other settings stay with its department.
          taskFields: (r.task_fields ?? []).filter((f: { key: string }) => asked.has(`f:${f.key}`)),
        };
      });
  });
  return c.json({ desks });
});
