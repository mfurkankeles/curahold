// Demo data for the flow between departments (db/migrations/0170_flow.sql), on
// top of the boards scripts/seed-departments.ts opens in the live demo:
//   * Cedarmoor Health's renewal was just won on the Sales pipeline: its hand-over
//     card waits for Customer Success, with promises and the sales thread;
//   * three customers wait for the same Product story (bulk export), so the
//     backlog shows their count, value and the nearest renewal;
//   * single sign-on for the portal shipped: Quillfield Retail's owner has a
//     drafted message and a task to tell them.
// Invented names only (the demo's own).
import type { Q } from '../api/src/db';
import { createHandover, loopBack } from '../api/src/lib/handoff';
import { translate, type Locale, type MessageKey } from '../shared/src/i18n';
import { BUILTIN_TYPES } from '../shared/src/records';

/** Seeds the demo's customer flow: who owns each customer in each department, and their hand-offs. */
export async function seedFlow(
  q: Q,
  o: { orgId: string; ids: Record<string, string>; locale: Locale; accounts: Record<string, string>; boards: { pipeline: string; delivery: string } },
) {
  const T = (k: string, v?: Record<string, string | number>) => translate(o.locale, k as MessageKey, v);
  const [quill, harbor, cedar, velto] = Object.values(o.accounts);
  const depts = Object.fromEntries((await q.query<{ id: string; key: string }>('select id, key from departments where org_id = $1', [o.orgId])).map((d) => [d.key, d.id]));
  // Who owns each customer in each department.
  const team: [string, string, string][] = [
    [quill, 'success', 'zeynep'],
    [harbor, 'success', 'mert'],
    [harbor, 'sales', 'omar'],
    [cedar, 'sales', 'omar'],
    [velto, 'success', 'zeynep'],
  ];
  for (const [a, d, who] of team) {
    if (a && depts[d]) await q.query('insert into account_team (org_id, account_id, department_id, user_id) values ($1, $2, $3, $4) on conflict do nothing', [o.orgId, a, depts[d], o.ids[who]]);
  }

  // Product work customers wait for.
  const [ask] = await q.query<{ id: string }>(`select id from tasks where org_id = $1 and board_id = $2 and title = $3`, [o.orgId, o.boards.delivery, T('dept.demo.ask')]);
  const [build] = await q.query<{ id: string }>(`select id from tasks where org_id = $1 and board_id = $2 and title = $3`, [o.orgId, o.boards.delivery, T('dept.demo.build')]);
  const link = (story: string, account: string, source: string, note: string, by: string) =>
    q.query(`insert into request_links (org_id, story_id, account_id, source, note, created_by) values ($1, $2, $3, $4, $5, $6) on conflict do nothing`, [o.orgId, story, account, source, note, o.ids[by]]);
  if (ask) {
    await link(ask.id, quill, 'account', T('flow.demo.noteExport'), 'zeynep');
    await link(ask.id, harbor, 'meeting', T('flow.demo.noteAudit'), 'mert');
    if (velto) await link(ask.id, velto, 'ticket', '', 'zeynep');
  }
  if (build) await link(build.id, cedar, 'account', T('flow.demo.noteImport'), 'omar');

  // Shipped: a finished story, and the loop back to the customer who asked.
  const [board] = await q.query<{ columns: { key: string; done: boolean }[] }>('select columns from boards where id = $1', [o.boards.delivery]);
  const done = board.columns.find((c) => c.done)?.key ?? 'done';
  const [sso] = await q.query<{ id: string }>(
    `insert into tasks (org_id, board_id, title, status, assignee_ids, position, created_by, updated_by, issue_type)
     values ($1, $2, $3, $4, $5, 4096, $6, $6, 'story') returning id`,
    [o.orgId, o.boards.delivery, T('flow.demo.shipped'), done, [o.ids.lena], o.ids.lena],
  );
  await link(sso.id, quill, 'account', T('flow.demo.noteSso'), 'zeynep');
  await loopBack(q, o.orgId, sso.id, new Date());

  // Won: the hand-over card waiting for Customer Success.
  const [won] = await q.query<{ id: string }>(`select id from tasks where org_id = $1 and board_id = $2 and status = 'won' and account_id = $3 limit 1`, [o.orgId, o.boards.pipeline, cedar]);
  if (won) {
    // The people on the customer's side, with where they stand (the card lists them).
    let [contact] = await q.query<{ id: string }>(`select id from record_types where org_id = $1 and kind = 'contact' order by created_at limit 1`, [o.orgId]);
    if (!contact) {
      const c = BUILTIN_TYPES.contact;
      [contact] = await q.query<{ id: string }>(`insert into record_types (org_id, key, name, kind, fields) values ($1, $2, $3, 'contact', $4) returning id`, [o.orgId, c.key, JSON.stringify(c.name), JSON.stringify(c.fields)]);
    }
    const people: [string, string, string, string, string][] = [
      ['Defne', 'Aral', T('flow.demo.titleOps'), 'decision_maker', 'champion'],
      ['Jonas', 'Pike', T('flow.demo.titleBuy'), 'approver', 'neutral'],
    ];
    for (const [first, last, title, decision, stance] of people) {
      await q.query(`insert into records (org_id, type_id, account_id, name, fields) values ($1, $2, $3, $4, $5)`, [
        o.orgId,
        contact.id,
        cedar,
        `${first} ${last}`,
        JSON.stringify({ first_name: first, last_name: last, title, decision, stance }),
      ]);
    }
    let minutes = 90;
    for (const body of [T('flow.demo.thread1'), T('flow.demo.thread2')]) {
      await q.query(`insert into comments (org_id, task_id, author_id, body, created_at) values ($1, $2, $3, $4, now() - make_interval(mins => $5))`, [o.orgId, won.id, o.ids.omar, body, (minutes -= 30)]);
    }
    for (const [body, days] of [[T('flow.demo.promise1'), 7], [T('flow.demo.promise2'), 30]] as const) {
      await q.query(`insert into promises (org_id, account_id, body, due_date, created_by) values ($1, $2, $3, current_date + $4::int, $5)`, [o.orgId, cedar, body, days, o.ids.omar]);
    }
    await createHandover(q, o.orgId, o.ids.omar, { kind: 'task', id: won.id });
  }
}
