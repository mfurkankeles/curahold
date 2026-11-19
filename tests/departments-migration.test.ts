// The move into departments (db/migrations/0120_departments.sql), and its undo
// (db/rollback/0120_departments.sql), on a company that existed before.
//
//  * every board lands in a department, with the reason written down;
//  * people who work on a board keep it; everyone else who could see it is a
//    suggestion an administrator accepts — after which nobody has lost a board;
//  * the undo brings back exactly who-sees-what of before, and the move can run again.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { migrate, splitSql } from '../api/src/db/migrate';
import { loadMigrations, MIGRATIONS_DIR } from '../api/src/db/migrations-fs';
import { createMemoryPg, pgliteDb } from '../api/src/db/pglite';
import type { Db } from '../api/src/db';
import { PERMS } from '../shared/src/model';

const NAME = '0120_departments.sql';
const ROLLBACK = readFileSync(join(MIGRATIONS_DIR, '..', 'rollback', NAME), 'utf8');

let db: Db;
let org: string;
const ids: Record<string, string> = {};
const boards: Record<string, string> = {};
let before: Record<string, string[]>;

const sys = <T>(fn: (q: any) => Promise<T>) => db.system(fn);
async function seesAll(): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const [k, id] of Object.entries(ids)) {
    const rows = await db.tenant({ orgId: org, userId: id }, (q) => q.query<{ id: string }>('select id from boards where archived_at is null'));
    out[k] = rows.map((r) => Object.entries(boards).find(([, b]) => b === r.id)![0]).sort();
  }
  return out;
}

beforeAll(async () => {
  db = pgliteDb(await createMemoryPg());
  await migrate(db, loadMigrations().filter((m) => m.name < NAME));
  await sys(async (q) => {
    [{ id: org }] = await q.query(`insert into orgs (slug, name, locale, timezone, template) values ('old', 'Old Company', 'en', 'UTC', 'customer_success') returning id`);
    const role = async (key: string, perms: string[]) => (await q.query(`insert into roles (org_id, key, name, perms, system) values ($1, $2, $2, $3, true) returning id`, [org, key, perms]))[0].id;
    const admin = await role('admin', [...PERMS]);
    const member = await role('member', ['accounts.view_all']);
    const person = async (key: string, roleId: string) => {
      ids[key] = (await q.query(`insert into users (org_id, email, name, role_id, seat, status) values ($1, $2, $2, $3, 'full', 'active') returning id`, [org, `${key}@old.example`, roleId]))[0].id;
    };
    await person('admin', admin);
    await person('lead', member);
    await person('worker', member);
    await person('idle', member);
    await person('seller', member);
    const [team] = await q.query(`insert into teams (org_id, name, lead_id) values ($1, 'Onboarding crew', $2) returning id`, [org, ids.lead]);
    await q.query(`insert into team_members (org_id, team_id, user_id) values ($1, $2, $3)`, [org, team.id, ids.worker]);
    const board = async (key: string, name: string, visibility: string, by: string, teamId: string | null = null) => {
      boards[key] = (await q.query(`insert into boards (org_id, team_id, name, visibility, columns, created_by) values ($1, $2, $3, $4, '[{"key":"todo","name":"To do","done":false},{"key":"done","name":"Done","done":true}]', $5) returning id`, [org, teamId, name, visibility, ids[by]]))[0].id;
    };
    await board('pipeline', 'Sales pipeline', 'org', 'seller');
    await board('onboarding', 'Customer onboarding', 'team', 'lead', team.id);
    await board('notes', 'My notes', 'private', 'worker');
    await board('roadmap', 'Q3 things', 'org', 'admin');
    await board('misc', 'Everything else', 'org', 'admin');
    await q.query(`update boards set pm_enabled = true where id = $1`, [boards.roadmap]);
    // The worker works on "Everything else"; the idle person only ever looked.
    await q.query(`insert into tasks (org_id, board_id, title, status, assignee_ids, created_by) values ($1, $2, 'Call back', 'todo', $3, $4)`, [org, boards.misc, [ids.worker], ids.admin]);
  });
  before = await seesAll();
});

describe('the move into departments', () => {
  it('puts every board in a department, and writes down where and why', async () => {
    await migrate(db, loadMigrations());
    const rows = await sys((q) =>
      q.query(`select b.id, d.key, mv.reason, (mv.detail ->> 'personal')::boolean as personal
                 from boards b join departments d on d.id = b.department_id
                 join department_moves mv on mv.board_id = b.id and mv.kind = 'board' where b.org_id = $1`, [org]),
    );
    const of = (k: string) => rows.find((r: any) => r.id === boards[k]);
    expect(rows).toHaveLength(5);
    expect(of('pipeline')).toMatchObject({ key: 'sales', reason: 'name' });
    expect(of('onboarding')).toMatchObject({ key: 'success', reason: 'name' });
    expect(of('roadmap')).toMatchObject({ key: 'product', reason: 'sprints' });
    expect(of('misc')).toMatchObject({ key: 'success', reason: 'company' });
    expect(of('notes')).toMatchObject({ personal: true });
    const depts = await sys((q) => q.query(`select key, enabled from departments where org_id = $1 order by position`, [org]));
    expect(depts.map((d: any) => d.key)).toEqual(['sales', 'success', 'product', 'finance']);
    expect(depts.every((d: any) => d.enabled)).toBe(true);
  });

  it('keeps every board for the people who work on it; the team lead leads the department', async () => {
    const now = await seesAll();
    expect(now.admin).toEqual(before.admin);
    expect(now.worker).toEqual(expect.arrayContaining(['misc', 'notes', 'onboarding']));
    expect(now.seller).toContain('pipeline');
    const [lead] = await sys((q) => q.query(`select dm.role from department_members dm join departments d on d.id = dm.department_id where dm.user_id = $1 and d.key = 'success'`, [ids.lead]));
    expect(lead.role).toBe('lead');
  });

  it('leaves nobody without a department, and lists the rest as suggestions', async () => {
    const now = await seesAll();
    // The idle person saw every company-wide board; now only their home department's.
    expect(before.idle).toEqual(['misc', 'pipeline', 'roadmap']);
    expect(now.idle).toEqual(['misc']);
    const open = await sys((q) => q.query(`select d.key from department_moves mv join departments d on d.id = mv.department_id where mv.user_id = $1 and not mv.applied order by d.key`, [ids.idle]));
    expect(open.map((r: any) => r.key)).toEqual(['product', 'sales']);
  });

  it('after the suggestions are accepted, nobody has lost a board', async () => {
    await sys((q) =>
      q.query(`insert into department_members (org_id, department_id, user_id)
               select org_id, department_id, user_id from department_moves where org_id = $1 and kind = 'member' and not applied on conflict do nothing`, [org]),
    );
    const now = await seesAll();
    for (const k of Object.keys(ids)) expect(now[k], k).toEqual(expect.arrayContaining(before[k]));
  });

  it('a switched-off department hides its boards from everyone, and keeps them', async () => {
    await sys((q) => q.query(`update departments set enabled = false where org_id = $1 and key = 'sales'`, [org]));
    const now = await seesAll();
    expect(now.admin).not.toContain('pipeline');
    expect(now.seller).not.toContain('pipeline');
    const [{ n }] = await sys((q) => q.query(`select count(*)::int as n from boards where id = $1`, [boards.pipeline]));
    expect(n).toBe(1);
    await sys((q) => q.query(`update departments set enabled = true where org_id = $1`, [org]));
  });

  it('the undo brings back exactly who saw what before, and the move can run again', async () => {
    await sys(async (q) => {
      for (const s of splitSql(ROLLBACK)) await q.query(s);
    });
    expect(await seesAll()).toEqual(before);
    const [{ n }] = await sys((q) => q.query(`select count(*)::int as n from information_schema.columns where table_name = 'boards' and column_name = 'department_id'`));
    expect(n).toBe(0);
    expect(await migrate(db, loadMigrations())).toEqual([NAME]);
    const [{ missing }] = await sys((q) => q.query(`select count(*)::int as missing from boards where department_id is null`));
    expect(missing).toBe(0);
  });
});
