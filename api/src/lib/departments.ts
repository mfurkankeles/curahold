// Departments (db/migrations/0120_departments.sql): the four places work lives in.
// The walls themselves are in the database (app_visible_boards); this is what the
// server reads and checks on top, in the same transaction as the rest of a request.
import { DEPARTMENT_KEYS, type Department, type DepartmentKey, type DepartmentRole } from '../../../shared/src/model';
import type { AuthCtx } from '../context';
import type { Q, Row } from '../db';
import { fail } from './errors';

/** Administrators see switched-off departments too (to switch them on, or to see what is kept). */
export const seesAllDepartments = (auth: Pick<AuthCtx, 'perms'>) => auth.perms.includes('org.manage');

/** A departments row as the API's Department. */
export function toDepartment(r: Row): Department {
  return {
    id: r.id,
    key: r.key as DepartmentKey,
    enabled: !!r.enabled,
    position: Number(r.position ?? 0),
    bandView: Array.isArray(r.band_view) ? (r.band_view.filter((k: string) => (DEPARTMENT_KEYS as readonly string[]).includes(k)) as DepartmentKey[]) : null,
    leadIds: r.lead_ids ?? [],
    myRole: (r.my_role as DepartmentRole | null) ?? null,
  };
}

/** The company's departments as this person gets them: one query, part of /me. */
export async function listDepartments(q: Q, auth: Pick<AuthCtx, 'userId' | 'perms'>): Promise<Department[]> {
  const rows = await q.query(
    `select d.id, d.key, d.enabled, d.position, d.band_view,
            coalesce((select array_agg(m.user_id) from department_members m where m.department_id = d.id and m.role = 'lead'), '{}') as lead_ids,
            (select m.role from department_members m where m.department_id = d.id and m.user_id = $1) as my_role
       from departments d
      where d.enabled or $2
      order by d.position`,
    [auth.userId, seesAllDepartments(auth)],
  );
  return rows.map(toDepartment);
}

/** A department the caller can see, or 'not_found'. */
export async function loadDepartment(q: Q, id: string): Promise<Row> {
  const [d] = await q.query('select * from departments where id = $1', [id]);
  if (!d) fail('not_found');
  return d;
}

/** Whether this person may open boards in the department: administrators and its leads. */
export async function mayOpenBoards(q: Q, auth: Pick<AuthCtx, 'userId' | 'perms'>, departmentId: string): Promise<boolean> {
  if (auth.perms.includes('boards.manage_all')) return true;
  const [r] = await q.query(`select app_leads_department($1) as ok`, [departmentId]);
  return !!r?.ok;
}

/**
 * The department a new board goes to when the request names none: for
 * administrators the company's home department, for a lead the first one they lead.
 */
export async function departmentForNewBoard(q: Q, auth: Pick<AuthCtx, 'userId' | 'perms'>, asked: string | null | undefined): Promise<string> {
  if (asked) {
    const [d] = await q.query('select id, enabled from departments where id = $1', [asked]);
    if (!d) fail('validation', { fields: 'departmentId' }, { fields: ['departmentId'] });
    if (!d.enabled) fail('department_off');
    if (!(await mayOpenBoards(q, auth, asked))) fail('board_lead_only');
    return asked;
  }
  // Administrators: the company's home department (its own kind of work).
  if (auth.perms.includes('boards.manage_all')) {
    const [home] = await q.query(`select app_home_department(app_org()) as id`);
    return home.id;
  }
  const [lead] = await q.query(
    `select d.id from department_members m join departments d on d.id = m.department_id
      where m.user_id = $1 and m.role = 'lead' and d.enabled order by d.position limit 1`,
    [auth.userId],
  );
  if (!lead) fail('board_lead_only');
  return lead.id;
}

/** Who may add or remove people in a department: people managers, and its leads (members only). */
export async function mayManageMembers(q: Q, auth: Pick<AuthCtx, 'userId' | 'perms'>, departmentId: string, role: DepartmentRole): Promise<boolean> {
  if (auth.perms.includes('users.manage')) return true;
  if (role === 'lead') return false;
  const [r] = await q.query(`select app_leads_department($1) as ok`, [departmentId]);
  return !!r?.ok;
}
