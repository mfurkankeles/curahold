// Demo company with invented people and accounts — nothing here is real.
// Used by the local server, the browser tests and (later) the live demo.
import type { Db } from '../api/src/db';
import { seedDepartments } from './seed-departments';
import { createOrg, defaultColumns, insertPreset } from '../api/src/lib/orgs';
import { TEMPLATES } from '../shared/src/templates';
import type { Locale } from '../shared/src/i18n/core';
import { amount, sayer, seedWords } from './seed-words';

// Their names, like every other text of the demo company, are in its language (scripts/seed-words).
const PEOPLE = [
  { key: 'ada', role: 'admin', seat: 'full' },
  { key: 'mert', role: 'manager', seat: 'full' },
  { key: 'zeynep', role: 'member', seat: 'full' },
  { key: 'lena', role: 'member', seat: 'full' },
  { key: 'omar', role: 'member', seat: 'full' },
  { key: 'sofia', role: 'viewer', seat: 'viewer' },
] as const;

// [name, owner, renewal in N days, annual value (in US dollars), health, tier, website]
export const ACCOUNTS: [string, string, number, number, string, string, string][] = [
  ['Quillfield Retail', 'zeynep', 160, 84000, 'good', 'enterprise', 'quillfield.example'],
  ['Harborline Bank', 'omar', 45, 126000, 'watch', 'enterprise', 'harborline.example'],
  ['Cedarmoor Health', 'lena', 210, 38000, 'good', 'mid', 'cedarmoor.example'],
  ['Velto Mobility', 'zeynep', 75, 52000, 'risk', 'mid', 'velto.example'],
  ['Orchardly Foods', 'lena', 300, 21000, 'good', 'smb', 'orchardly.example'],
  ['Fjordnet Telecom', 'omar', 120, 98000, 'watch', 'enterprise', 'fjordnet.example'],
];

function day(offset: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** `departments: true` (the live demo) also opens a board in each department with work that crosses between them. */
export async function seedDemo(db: Db, opts: { slug?: string; locale?: Locale; departments?: boolean } = {}) {
  const slug = opts.slug ?? 'demo';
  const { locale, words: W } = await seedWords(opts.locale ?? 'en');
  const say = sayer(locale, W);
  const B = W.base;
  const { orgId, adminId, roleIds } = await createOrg(db, {
    slug,
    name: W.company,
    locale,
    timezone: W.timezone,
    currency: W.money.currency,
    template: 'customer_success',
    domains: ['demo.example'],
    admin: { email: 'ada@demo.example', name: W.people.ada },
    boardMap: {},
  });
  return db.system(async (q) => {
    const ids: Record<string, string> = { ada: adminId };
    for (const p of PEOPLE) {
      if (p.key === 'ada') continue;
      const [u] = await q.query<{ id: string }>(
        `insert into users (org_id, email, name, role_id, seat, status) values ($1, $2, $3, $4, $5, 'active') returning id`,
        [orgId, `${p.key}@demo.example`, W.people[p.key], roleIds[p.role], p.seat],
      );
      ids[p.key] = u.id;
    }
    const team = async (name: string, lead: string, members: string[]) => {
      const [t] = await q.query<{ id: string }>('insert into teams (org_id, name, lead_id) values ($1, $2, $3) returning id', [
        orgId,
        name,
        ids[lead],
      ]);
      for (const m of new Set([lead, ...members])) {
        await q.query('insert into team_members (org_id, team_id, user_id) values ($1, $2, $3)', [orgId, t.id, ids[m]]);
      }
      return t.id;
    };
    const cs = await team(W.teams.cs, 'mert', ['zeynep', 'lena']);
    await team(W.teams.am, 'omar', ['ada']);

    const cols = defaultColumns(locale);
    let made = 0;
    const board = async (name: string, visibility: string, teamId: string | null, by: string) => {
      const [b] = await q.query<{ id: string }>(
        // A millisecond apart: lists are ordered by when a board was made.
        `insert into boards (org_id, team_id, name, visibility, columns, created_by, created_at) values ($1, $2, $3, $4, $5, $6, now() + ($7::int * interval '1 millisecond')) returning id`,
        [orgId, teamId, name, visibility, JSON.stringify(cols), ids[by], made++],
      );
      return b.id;
    };
    const csBoard = await board(B.boards.cs, 'team', cs, 'mert');
    const renewals = await board(B.boards.renewals, 'org', null, 'ada');
    const privateBoard = await board(B.boards.notes, 'private', null, 'ada');
    await q.query('insert into board_members (org_id, board_id, user_id) values ($1, $2, $3)', [orgId, privateBoard, ids.ada]);

    const accounts: Record<string, string> = {};
    for (const [name, owner, renewIn, value, health, tier, site] of ACCOUNTS) {
      const [a] = await q.query<{ id: string }>(
        `insert into accounts (org_id, name, owner_id, team_id, fields, created_at) values ($1, $2, $3, $4, $5, now() - interval '200 days') returning id`,
        [orgId, say(name), ids[owner], owner === 'omar' ? null : cs, JSON.stringify({ renewal_date: day(renewIn), arr: amount(W, value), health, tier, website: `https://${site}/` })],
      );
      accounts[name] = a.id;
    }
    // The template's rules, pointed at these boards — off in the demo until someone switches them on.
    for (const preset of TEMPLATES.customer_success.automations) {
      const id = await insertPreset(q, orgId, adminId, preset, { main: csBoard, onboarding: csBoard, renewals }, locale);
      if (id) await q.query('update automations set enabled = false where id = $1', [id]);
    }

    let pos = 0;
    const task = async (
      boardId: string,
      title: string,
      status: string,
      assignees: string[],
      due: number | null,
      priority: string,
      account: string | null,
      by = 'mert',
    ) => {
      pos += 1024;
      const [t] = await q.query<{ id: string }>(
        `insert into tasks (org_id, board_id, title, status, assignee_ids, due_date, priority, account_id, position, created_by, updated_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10) returning id`,
        [orgId, boardId, title, status, assignees.map((a) => ids[a]), due === null ? null : day(due), priority, account ? accounts[account] : null, pos, ids[by]],
      );
      return t.id;
    };
    const [t1, t2, t3, t4, t5, t6, t7, t8, t9] = B.tasks;
    const qbr = await task(csBoard, t1, 'doing', ['zeynep'], 3, 'high', ACCOUNTS[0][0]);
    await task(csBoard, t2, 'todo', ['lena'], 1, 'normal', ACCOUNTS[2][0]);
    await task(csBoard, t3, 'todo', ['zeynep', 'mert'], -2, 'urgent', ACCOUNTS[3][0]);
    await task(csBoard, t4, 'todo', ['lena'], 9, 'low', ACCOUNTS[4][0]);
    await task(csBoard, t5, 'done', ['mert'], -5, 'normal', null);
    await task(renewals, t6, 'doing', ['omar'], 6, 'high', ACCOUNTS[1][0], 'ada');
    await task(renewals, t7, 'todo', ['ada'], 14, 'normal', ACCOUNTS[5][0], 'ada');
    await task(renewals, t8, 'done', ['omar'], -1, 'normal', ACCOUNTS[0][0], 'ada');
    await task(privateBoard, t9, 'todo', ['ada'], 4, 'normal', null, 'ada');
    await q.query(
      `insert into sprints (org_id, board_id, name, goal, position, created_by) values ($1, $2, $3, $4, 1024, $5)`,
      [orgId, csBoard, B.sprint[0], B.sprint[1], ids.mert],
    );

    for (const [i, title] of B.subtasks.entries()) {
      pos += 1024;
      await q.query(
        `insert into tasks (org_id, board_id, parent_id, title, status, assignee_ids, position, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [orgId, csBoard, qbr, title, i === 0 ? 'done' : 'todo', [ids.zeynep], pos, ids.mert],
      );
    }
    await q.query(
      `insert into comments (org_id, task_id, author_id, body, mentions) values ($1, $2, $3, $4, $5)`,
      [
        orgId,
        qbr,
        ids.mert,
        `@[${W.people.zeynep}](${ids.zeynep}) ${B.ask}`,
        [ids.zeynep],
      ],
    );
    // A few meetings still to come, on the first account's calendar.
    const planned = B.planned;
    for (const [kind, title, agenda, inDays, minutes, who, repeat] of planned) {
      await q.query(
        `insert into planned_meetings (org_id, account_id, created_by, kind, title, agenda, starts_at, minutes, user_ids, repeat)
         values ($1, $2, $3, $4, $5, $6, (now() + ($7::int * interval '1 day'))::date + interval '10 hours', $8, $9, $10)`,
        [orgId, accounts[ACCOUNTS[0][0]], ids.mert, kind, title, agenda, inDays, minutes, who.map((w) => ids[w]), repeat],
      );
    }
    // One saved meeting type, with an agenda prompt to start from.
    await q.query(
      `update orgs set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('meetingTypes', $2::jsonb) where id = $1`,
      [orgId, JSON.stringify([{ id: 'qbr', label: B.meetingType[0], kind: 'review', minutes: 60, prompt: B.meetingType[1] }])],
    );
    await seedDepartments(q, { orgId, ids, locale, accounts, boards: !!opts.departments });
    await q.query(`update orgs set setup = jsonb_build_object('finishedAt', now()) where id = $1`, [orgId]);
    await q.query(`update users set onboarded_at = now() where org_id = $1`, [orgId]);
    return { orgId, slug, locale, ids, accounts, boards: { csBoard, renewals, privateBoard }, adminEmail: 'ada@demo.example' };
  });
}
