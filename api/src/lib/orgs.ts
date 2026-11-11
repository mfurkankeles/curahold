// Creating a company: the org row, its built-in roles and the first admin.
// Runs with owner access because no company exists yet to scope it to.
import { translate, type Locale } from '../../../shared/src/i18n';
import { PERMS, type Perm } from '../../../shared/src/model';
import type { Db, Q } from '../db';

export const DEFAULT_ROLES: { key: string; perms: Perm[] }[] = [
  { key: 'admin', perms: [...PERMS] },
  { key: 'manager', perms: ['boards.view_all', 'teams.manage', 'tasks.delete_any'] },
  { key: 'member', perms: [] },
  { key: 'viewer', perms: [] },
];

export function defaultColumns(locale: Locale) {
  return [
    { key: 'todo', name: translate(locale, 'board.defaultColumns.todo'), done: false },
    { key: 'doing', name: translate(locale, 'board.defaultColumns.doing'), done: false },
    { key: 'done', name: translate(locale, 'board.defaultColumns.done'), done: true },
  ];
}

export interface NewOrg {
  slug: string;
  name: string;
  locale: Locale;
  timezone?: string;
  admin: { email: string; name: string };
}

export async function createOrg(db: Db, input: NewOrg) {
  return db.system(async (q: Q) => {
    const [org] = await q.query<{ id: string }>(
      'insert into orgs (slug, name, locale, timezone) values ($1, $2, $3, $4) returning id',
      [input.slug.toLowerCase(), input.name, input.locale, input.timezone ?? 'UTC'],
    );
    const roleIds: Record<string, string> = {};
    for (const r of DEFAULT_ROLES) {
      const [row] = await q.query<{ id: string }>(
        'insert into roles (org_id, key, name, perms, system) values ($1, $2, $3, $4, true) returning id',
        [org.id, r.key, translate(input.locale, `role.${r.key}` as any), r.perms],
      );
      roleIds[r.key] = row.id;
    }
    const [admin] = await q.query<{ id: string }>(
      `insert into users (org_id, email, name, role_id, seat, status)
       values ($1, $2, $3, $4, 'full', 'active') returning id`,
      [org.id, input.admin.email.toLowerCase(), input.admin.name, roleIds.admin],
    );
    return { orgId: org.id, adminId: admin.id, roleIds };
  });
}
