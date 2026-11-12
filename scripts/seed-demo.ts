// Demo company with invented people and accounts — nothing here is real.
// Used by the local server, the browser tests and (later) the live demo.
import type { Db } from '../api/src/db';
import { createOrg, defaultColumns, insertPreset } from '../api/src/lib/orgs';
import { TEMPLATES } from '../shared/src/templates';

const PEOPLE = [
  { key: 'ada', name: 'Ada Demir', role: 'admin', seat: 'full' },
  { key: 'mert', name: 'Mert Aksoy', role: 'manager', seat: 'full' },
  { key: 'zeynep', name: 'Zeynep Tunç', role: 'member', seat: 'full' },
  { key: 'lena', name: 'Lena Fischer', role: 'member', seat: 'full' },
  { key: 'omar', name: 'Omar Haddad', role: 'member', seat: 'full' },
  { key: 'sofia', name: 'Sofia Rossi', role: 'viewer', seat: 'viewer' },
] as const;

// [name, owner, renewal in N days, annual value, health, tier, website]
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

export async function seedDemo(db: Db, opts: { slug?: string; locale?: 'en' | 'tr' } = {}) {
  const slug = opts.slug ?? 'demo';
  const locale = opts.locale ?? 'en';
  const { orgId, adminId, roleIds } = await createOrg(db, {
    slug,
    name: 'Demo Company',
    locale,
    timezone: 'Europe/Istanbul',
    currency: locale === 'tr' ? 'TRY' : 'USD',
    template: 'customer_success',
    domains: ['demo.example'],
    admin: { email: 'ada@demo.example', name: 'Ada Demir' },
    boardMap: {},
  });
  return db.system(async (q) => {
    const ids: Record<string, string> = { ada: adminId };
    for (const p of PEOPLE) {
      if (p.key === 'ada') continue;
      const [u] = await q.query<{ id: string }>(
        `insert into users (org_id, email, name, role_id, seat, status) values ($1, $2, $3, $4, $5, 'active') returning id`,
        [orgId, `${p.key}@demo.example`, p.name, roleIds[p.role], p.seat],
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
    const cs = await team('Customer Success', 'mert', ['zeynep', 'lena']);
    await team('Account Management', 'omar', ['ada']);

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
    const csBoard = await board(locale === 'tr' ? 'CS — Genel' : 'CS — General', 'team', cs, 'mert');
    const renewals = await board(locale === 'tr' ? 'Yenilemeler' : 'Renewals', 'org', null, 'ada');
    const privateBoard = await board(locale === 'tr' ? 'Ada — notlar' : 'Ada — notes', 'private', null, 'ada');
    await q.query('insert into board_members (org_id, board_id, user_id) values ($1, $2, $3)', [orgId, privateBoard, ids.ada]);

    const accounts: Record<string, string> = {};
    for (const [name, owner, renewIn, value, health, tier, site] of ACCOUNTS) {
      const [a] = await q.query<{ id: string }>(
        `insert into accounts (org_id, name, owner_id, team_id, fields, created_at) values ($1, $2, $3, $4, $5, now() - interval '200 days') returning id`,
        [orgId, name, ids[owner], owner === 'omar' ? null : cs, JSON.stringify({ renewal_date: day(renewIn), arr: value, health, tier, website: `https://${site}/` })],
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
    const tr = locale === 'tr';
    const qbr = await task(csBoard, tr ? 'Çeyrek iş değerlendirmesi hazırlığı' : 'Prepare the quarterly business review', 'doing', ['zeynep'], 3, 'high', ACCOUNTS[0][0]);
    await task(csBoard, tr ? 'Onboarding başlangıç toplantısı' : 'Onboarding kickoff call', 'todo', ['lena'], 1, 'normal', ACCOUNTS[2][0]);
    await task(csBoard, tr ? 'Kullanım düşüşünü araştır' : 'Look into the usage drop', 'todo', ['zeynep', 'mert'], -2, 'urgent', ACCOUNTS[3][0]);
    await task(csBoard, tr ? 'Yeni ürün eğitimi planla' : 'Plan training on the new module', 'todo', ['lena'], 9, 'low', ACCOUNTS[4][0]);
    await task(csBoard, tr ? 'Memnuniyet anketi sonuçlarını paylaş' : 'Share the satisfaction survey results', 'done', ['mert'], -5, 'normal', null);
    await task(renewals, tr ? 'Yenileme teklifini gönder' : 'Send the renewal proposal', 'doing', ['omar'], 6, 'high', ACCOUNTS[1][0], 'ada');
    await task(renewals, tr ? 'Fiyat artışı onayını al' : 'Get the price increase approved', 'todo', ['ada'], 14, 'normal', ACCOUNTS[5][0], 'ada');
    await task(renewals, tr ? 'Sözleşme imzası' : 'Contract signature', 'done', ['omar'], -1, 'normal', ACCOUNTS[0][0], 'ada');
    await task(privateBoard, tr ? 'Bütçe taslağını gözden geçir' : 'Review the budget draft', 'todo', ['ada'], 4, 'normal', null, 'ada');

    for (const [i, title] of (tr ? ['Gündemi yaz', 'Kullanım rakamlarını çek', 'Sunumu gönder'] : ['Write the agenda', 'Pull usage numbers', 'Send the deck']).entries()) {
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
        tr
          ? `@[Zeynep Tunç](${ids.zeynep}) geçen çeyreğin kullanım grafiğini de ekleyebilir misin?`
          : `@[Zeynep Tunç](${ids.zeynep}) can you add last quarter's usage chart too?`,
        [ids.zeynep],
      ],
    );
    await q.query(`update orgs set setup = jsonb_build_object('finishedAt', now()) where id = $1`, [orgId]);
    await q.query(`update users set onboarded_at = now() where org_id = $1`, [orgId]);
    return { orgId, slug, ids, accounts, boards: { csBoard, renewals, privateBoard }, adminEmail: 'ada@demo.example' };
  });
}
