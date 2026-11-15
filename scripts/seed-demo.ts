// Demo company with invented people and accounts — nothing here is real.
// Used by the local server, the browser tests and (later) the live demo.
import type { Db } from '../api/src/db';
import { createOrg, defaultColumns, insertPreset } from '../api/src/lib/orgs';
import { TEMPLATES } from '../shared/src/templates';
import type { MeetingKind, MeetingRepeat } from '../shared/src/timeline';

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

// The demo's sample data, written in the two languages the demo is offered in (its own decision; the
// product's built-in content comes from the dictionaries). One table, so no line asks "is it Turkish?".
const DEMO_TEXT = {
  en: {
    ask: (id: string) => `@[Zeynep Tunç](${id}) can you add last quarter's usage chart too?`,
    planned: [
      ['review', 'Quarterly business review', 'Usage, goals and the renewal roadmap.', 7, 60, ['mert', 'zeynep'], 'quarterly'],
      ['meeting', 'New module walkthrough', 'Show the team the new module and take questions.', 2, 45, ['lena'], 'none'],
      ['call', 'Monthly check-in call', 'A short status and the open items.', 21, 30, ['mert'], 'monthly'],
    ] as [MeetingKind, string, string, number, number, string[], MeetingRepeat][],
    t1: 'Prepare the quarterly business review',
    t2: 'Onboarding kickoff call',
    t3: 'Look into the usage drop',
    t4: 'Plan training on the new module',
    t5: 'Share the satisfaction survey results',
    t6: 'Send the renewal proposal',
    t7: 'Get the price increase approved',
    t8: 'Contract signature',
    t9: 'Review the budget draft',
    t10: 'Sprint 1',
    t11: 'The first sprint',
    t12: ['Write the agenda', 'Pull usage numbers', 'Send the deck'],
    t13: 'Business review',
    t14: 'Goals · Usage · Risks · Roadmap',
    t15: 'USD',
    t16: 'CS — General',
    t17: 'Renewals',
    t18: 'Ada — notes',
  },
  tr: {
    ask: (id: string) => `@[Zeynep Tunç](${id}) geçen çeyreğin kullanım grafiğini de ekleyebilir misin?`,
    planned: [
      ['review', 'Çeyrek iş değerlendirmesi', 'Kullanım, hedefler ve yenileme yol haritası.', 7, 60, ['mert', 'zeynep'], 'quarterly'],
      ['meeting', 'Yeni modül tanıtımı', 'Ekibe yeni modülü gösterelim ve soruları alalım.', 2, 45, ['lena'], 'none'],
      ['call', 'Aylık durum araması', 'Kısa durum ve açık işler.', 21, 30, ['mert'], 'monthly'],
    ] as [MeetingKind, string, string, number, number, string[], MeetingRepeat][],
    t1: 'Çeyrek iş değerlendirmesi hazırlığı',
    t2: 'Onboarding başlangıç toplantısı',
    t3: 'Kullanım düşüşünü araştır',
    t4: 'Yeni ürün eğitimi planla',
    t5: 'Memnuniyet anketi sonuçlarını paylaş',
    t6: 'Yenileme teklifini gönder',
    t7: 'Fiyat artışı onayını al',
    t8: 'Sözleşme imzası',
    t9: 'Bütçe taslağını gözden geçir',
    t10: 'Sprint 1',
    t11: 'İlk sprint',
    t12: ['Gündemi yaz', 'Kullanım rakamlarını çek', 'Sunumu gönder'],
    t13: 'İş değerlendirmesi',
    t14: 'Hedefler · Kullanım · Riskler · Yol haritası',
    t15: 'TRY',
    t16: 'CS — Genel',
    t17: 'Yenilemeler',
    t18: 'Ada — notlar',
  },
};

function day(offset: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

export async function seedDemo(db: Db, opts: { slug?: string; locale?: 'en' | 'tr' } = {}) {
  const slug = opts.slug ?? 'demo';
  const locale = opts.locale ?? 'en';
  const W = DEMO_TEXT[locale];
  const { orgId, adminId, roleIds } = await createOrg(db, {
    slug,
    name: 'Demo Company',
    locale,
    timezone: 'Europe/Istanbul',
    currency: W.t15,
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
    const csBoard = await board(W.t16, 'team', cs, 'mert');
    const renewals = await board(W.t17, 'org', null, 'ada');
    const privateBoard = await board(W.t18, 'private', null, 'ada');
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
    const qbr = await task(csBoard, W.t1, 'doing', ['zeynep'], 3, 'high', ACCOUNTS[0][0]);
    await task(csBoard, W.t2, 'todo', ['lena'], 1, 'normal', ACCOUNTS[2][0]);
    await task(csBoard, W.t3, 'todo', ['zeynep', 'mert'], -2, 'urgent', ACCOUNTS[3][0]);
    await task(csBoard, W.t4, 'todo', ['lena'], 9, 'low', ACCOUNTS[4][0]);
    await task(csBoard, W.t5, 'done', ['mert'], -5, 'normal', null);
    await task(renewals, W.t6, 'doing', ['omar'], 6, 'high', ACCOUNTS[1][0], 'ada');
    await task(renewals, W.t7, 'todo', ['ada'], 14, 'normal', ACCOUNTS[5][0], 'ada');
    await task(renewals, W.t8, 'done', ['omar'], -1, 'normal', ACCOUNTS[0][0], 'ada');
    await task(privateBoard, W.t9, 'todo', ['ada'], 4, 'normal', null, 'ada');
    await q.query(
      `insert into sprints (org_id, board_id, name, goal, position, created_by) values ($1, $2, $3, $4, 1024, $5)`,
      [orgId, csBoard, W.t10, W.t11, ids.mert],
    );

    for (const [i, title] of (W.t12).entries()) {
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
        W.ask(ids.zeynep),
        [ids.zeynep],
      ],
    );
    // A few meetings still to come, on the first account's calendar.
    const planned = W.planned;
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
      [orgId, JSON.stringify([{ id: 'qbr', label: W.t13, kind: 'review', minutes: 60, prompt: W.t14 }])],
    );
    await q.query(`update orgs set setup = jsonb_build_object('finishedAt', now()) where id = $1`, [orgId]);
    await q.query(`update users set onboarded_at = now() where org_id = $1`, [orgId]);
    return { orgId, slug, ids, accounts, boards: { csBoard, renewals, privateBoard }, adminEmail: 'ada@demo.example' };
  });
}
