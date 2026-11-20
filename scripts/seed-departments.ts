// The demo company's departments: who is in which, who leads it, and (for the
// live demo) one board per department along the customer's path — a lead in
// Inside Sales, a deal in Sales, a kick-off in Onboarding — plus a Customer
// Success task handed to Product and a renewal waiting on a draft invoice. Every name comes from the dictionaries, so it reads right in
// all eleven languages.
import type { Q } from '../api/src/db';
import { translate, type Locale, type MessageKey } from '../shared/src/i18n';
import { TEMPLATES, pick } from '../shared/src/templates';
import { departmentTemplates } from '../shared/src/departments';

type People = Record<string, string>;

const MEMBERS: Record<string, [lead: string, members: string[]]> = {
  // Everyone stays in Customer Success & Support, the demo company's own kind of work.
  success: ['mert', ['ada', 'zeynep', 'lena', 'omar', 'sofia']],
  inside_sales: ['omar', []],
  sales: ['omar', ['ada']],
  onboarding: ['mert', ['lena']],
  product: ['lena', ['zeynep']],
  finance: ['ada', []],
};

/** Seeds the demo's departments, their boards and members, and a cross-department hand-off. */
export async function seedDepartments(
  q: Q,
  o: { orgId: string; ids: People; locale: Locale; accounts: Record<string, string>; boards?: boolean },
) {
  const depts = Object.fromEntries(
    (await q.query<{ id: string; key: string }>('select id, key from departments where org_id = $1', [o.orgId])).map((d) => [d.key, d.id]),
  );
  for (const [key, [lead, members]] of Object.entries(MEMBERS)) {
    await q.query(`insert into department_members (org_id, department_id, user_id, role) values ($1, $2, $3, 'lead') on conflict do nothing`, [o.orgId, depts[key], o.ids[lead]]);
    for (const m of members) {
      await q.query(`insert into department_members (org_id, department_id, user_id, role) values ($1, $2, $3, 'member') on conflict do nothing`, [o.orgId, depts[key], o.ids[m]]);
    }
  }
  if (!o.boards) return null;

  const T = (k: string) => translate(o.locale, k as MessageKey);
  const cols = (b: (typeof TEMPLATES)['sales']['boards'][number]) => JSON.stringify(b.columns.map((c) => ({ key: c.key, name: pick(c.name, o.locale), done: c.done })));
  const board = async (dept: string, tpl: (typeof TEMPLATES)['sales']['boards'][number], by: string, form: object | null = null) => {
    const id = crypto.randomUUID();
    await q.query(
      `insert into boards (id, org_id, department_id, name, visibility, columns, created_by, form, created_at)
       values ($1, $2, $3, $4, 'org', $5, $6, $7, now() + interval '1 second')`,
      [id, o.orgId, depts[dept], pick(tpl.name, o.locale), cols(tpl), o.ids[by], form ? JSON.stringify(form) : null],
    );
    return id;
  };
  const leads = await board('inside_sales', departmentTemplates('inside_sales')[0], 'omar');
  const pipeline = await board('sales', TEMPLATES.sales.boards[0], 'omar');
  const onboarding = await board('onboarding', departmentTemplates('onboarding')[0], 'mert');
  const delivery = await board('product', TEMPLATES.product.boards[0], 'lena', { on: true, title: T('dept.demo.deskTitle'), fields: ['description', 'account'], column: null });
  const approvals = await board('finance', TEMPLATES.finance.boards[0], 'ada');

  const first = Object.values(o.accounts);
  const task = async (boardId: string, title: string, status: string, who: string, account: string | null, due: number | null) => {
    const id = crypto.randomUUID();
    await q.query(
      `insert into tasks (id, org_id, board_id, title, status, assignee_ids, account_id, due_date, position, created_by, updated_by)
       values ($1, $2, $3, $4, $5, $6, $7, case when $8::int is null then null else current_date + $8::int end, 1024, $9, $9)`,
      [id, o.orgId, boardId, title, status, [o.ids[who]], account, due, o.ids[who]],
    );
    return id;
  };
  await task(leads, T('dept.demo.lead'), 'contacted', 'omar', null, 1);
  await task(pipeline, T('dept.demo.deal'), 'proposal', 'omar', first[1] ?? null, 6);
  await task(onboarding, T('dept.demo.onboard'), 'doing', 'lena', first[2] ?? null, 5);
  await task(pipeline, T('dept.demo.dealWon'), 'won', 'omar', first[2] ?? null, null);
  const ask = await task(delivery, T('dept.demo.ask'), 'backlog', 'lena', first[0] ?? null, 14);
  await task(delivery, T('dept.demo.build'), 'in_progress', 'zeynep', null, 4);
  await task(approvals, T('dept.demo.invoice'), 'requested', 'ada', first[2] ?? null, 2);

  // The hand-off: Customer Success's own task on its department-wide board, linked to
  // what it asked Product for (Sales' lead, also in Customer Success, sees the link, not Product's board).
  const [csBoard] = await q.query<{ id: string }>(
    `select b.id from boards b join departments d on d.id = b.department_id
      where b.org_id = $1 and d.key = 'success' and b.visibility = 'org' and b.archived_at is null order by b.created_at limit 1`,
    [o.orgId],
  );
  if (csBoard) {
    const [col] = await q.query<{ key: string }>(`select c ->> 'key' as key from boards b, jsonb_array_elements(b.columns) c where b.id = $1 limit 1`, [csBoard.id]);
    const cs = await task(csBoard.id, T('dept.demo.csAsk'), col.key, 'zeynep', first[0] ?? null, 10);
    await q.query(`insert into task_links (org_id, from_id, to_id, kind, created_by) values ($1, least($2::uuid, $3::uuid), greatest($2::uuid, $3::uuid), 'relates', $4) on conflict do nothing`, [o.orgId, cs, ask, o.ids.zeynep]);
  }
  return { leads, pipeline, onboarding, delivery, approvals };
}
