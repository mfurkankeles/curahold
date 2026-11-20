// The flow between departments (db/migrations/0170_flow.sql):
//
//   * a deal is won → one hand-over card for the next team (Onboarding when
//     the company has it, else Customer Success); the owner is set when
//     someone confirms it;
//   * a product story the customers were waiting for is finished → each
//     customer's owner gets a task with a drafted message. Nothing goes to the
//     customer by itself: the owner sends it, or closes the portal request.
//
// The functions here that run after a change has committed use owner access
// (the change was the person's; what follows is the company's), so every
// query filters on org_id itself.
import { translate, type Locale } from '../../../shared/src/i18n';
import type { AccountField, Column } from '../../../shared/src/model';
import type { Deps } from '../context';
import type { Q, Row } from '../db';
import { audit } from './audit';
import { addDays, localDate } from '../../../shared/src/days';
import { kick, enqueue } from './notify';
import { renewalField } from './playbooks';
import { onTaskCreated } from './taskEvents';
import { openPlanForHandover } from './onboarding';

export interface FlowSettings {
  /** Prepare a hand-over card when a deal is won (default on). */
  handover: boolean;
  /** The playbook the card suggests; unset: one whose name says onboarding. */
  handoverPlanId: string | null;
  /** Where the "tell the customer" tasks go; unset: Customer Success's first board. */
  loopBoardId: string | null;
}

/** The company's handover settings (sales to delivery), with defaults for anything not set. */
export function flowSettings(settings: unknown): FlowSettings {
  const f = ((settings as Record<string, any> | null)?.flow ?? {}) as Record<string, unknown>;
  return {
    handover: f.handover !== false,
    handoverPlanId: typeof f.handoverPlanId === 'string' ? f.handoverPlanId : null,
    loopBoardId: typeof f.loopBoardId === 'string' ? f.loopBoardId : null,
  };
}

const PLAN_NAME = '(onboard|kick.?off|welcome|başlangıç|baslangic|kurulum|karşılama|تأهيل|ترحيب|راه‌اندازی|קליטה|オンボーディング|导入|導入|온보딩)';

/** The department that takes a won customer over: Onboarding when switched on, else Customer Success. */
export async function takeoverDepartment(q: Q, orgId: string): Promise<Row | null> {
  const [d] = await q.query(
    `select id, key from departments where org_id = $1 and enabled and key in ('onboarding', 'success')
      order by (key = 'onboarding') desc limit 1`,
    [orgId],
  );
  return d ?? null;
}

/** The pinned summary of the sales thread: the deal's latest messages, newest last. */
async function threadSummary(q: Q, orgId: string, kind: 'record' | 'task', id: string, locale: Locale): Promise<string> {
  const rows =
    kind === 'record'
      ? await q.query(`select body, created_at from record_comments where org_id = $1 and record_id = $2 and length(body) > 0 order by created_at desc limit 5`, [orgId, id])
      : await q.query(`select body, created_at from comments where org_id = $1 and task_id = $2 order by created_at desc limit 5`, [orgId, id]);
  if (!rows.length) return '';
  const clean = (s: string) => s.replace(/@\[([^\]]+)\]\([0-9a-f-]{36}\)/g, '@$1').replace(/\s+/g, ' ').trim().slice(0, 240);
  const lines = rows.reverse().map((r) => `• ${clean(r.body)}`);
  return [translate(locale, 'flow.summary.thread', { n: rows.length }), ...lines].join('\n');
}

/**
 * Prepares the hand-over card for a won deal (a record, or a task on a pipeline
 * board). Once per deal: a second win changes nothing. Returns the card's id,
 * or null when there is nothing to hand over (no customer on the deal).
 */
export async function createHandover(q: Q, orgId: string, actorId: string | null, src: { kind: 'record' | 'task'; id: string }, stage = 'won'): Promise<string | null> {
  const [org] = await q.query('select locale, settings from orgs where id = $1', [orgId]);
  const locale = (org?.locale ?? 'en') as Locale;
  const [deal] =
    src.kind === 'record'
      ? await q.query('select id, name, account_id, owner_id as seller from records where id = $1 and org_id = $2', [src.id, orgId])
      : await q.query('select id, title as name, account_id, assignee_ids[1] as seller from tasks where id = $1 and org_id = $2', [src.id, orgId]);
  if (!deal?.account_id) return null;
  const dept = await takeoverDepartment(q, orgId);
  const settings = flowSettings(org?.settings);
  const [plan] = settings.handoverPlanId
    ? await q.query('select id from plan_templates where id = $1 and org_id = $2', [settings.handoverPlanId, orgId])
    : await q.query(`select id from plan_templates where org_id = $1 and name ~* $2 order by created_at limit 1`, [orgId, PLAN_NAME]);
  const summary = await threadSummary(q, orgId, src.kind, src.id, locale);
  const [row] = await q.query(
    `insert into handovers (org_id, account_id, source_kind, source_id, source_name, stage, to_department, summary, plan_id, seller_id, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     on conflict (org_id, source_kind, source_id) do nothing returning id`,
    [orgId, deal.account_id, src.kind, src.id, String(deal.name ?? '').slice(0, 300), stage, dept?.key ?? 'success', summary, plan?.id ?? null, deal.seller ?? null, actorId],
  );
  if (!row) return null;
  await audit(q, { orgId, actorId, action: 'handover.created', entity: 'account', entityId: deal.account_id, meta: { source: src.kind, id: src.id } });
  // The customer's onboarding plan opens as a draft with the card (it starts when the card is confirmed).
  await openPlanForHandover(q, orgId, row.id, localDate(new Date(), (await q.query('select timezone from orgs where id = $1', [orgId]))[0]?.timezone));
  // The takeover department's leads hear about it at once (it is work waiting for them).
  const leads = dept
    ? await q.query<{ user_id: string }>(`select user_id from department_members where department_id = $1 and role = 'lead'`, [dept.id])
    : [];
  const [acc] = await q.query('select name, owner_id from accounts where id = $1 and org_id = $2', [deal.account_id, orgId]);
  const told = new Set<string>(leads.map((l) => l.user_id));
  if (!told.size && acc?.owner_id) told.add(acc.owner_id);
  await enqueue(
    q,
    [...told].map((u) => ({ orgId, userId: u, kind: 'handover', actorId, data: { account: acc?.name ?? '', accountId: deal.account_id, deal: deal.name, handoverId: row.id } })),
  );
  return row.id;
}

/** Whether a task's move is a deal being won: a column keyed "won" on a Sales board. */
export async function isWonColumn(q: Q, orgId: string, boardId: string, column: string): Promise<boolean> {
  if (column !== 'won') return false;
  const [b] = await q.query(
    `select 1 from boards b left join departments d on d.id = b.department_id where b.id = $1 and b.org_id = $2 and (d.key is null or d.key in ('sales', 'inside_sales'))`,
    [boardId, orgId],
  );
  return !!b;
}

/** Where a customer's "tell them it shipped" task goes. */
async function loopBoard(q: Q, orgId: string, settings: FlowSettings, accountId: string): Promise<Row | null> {
  if (settings.loopBoardId) {
    const [b] = await q.query('select * from boards where id = $1 and org_id = $2 and archived_at is null', [settings.loopBoardId, orgId]);
    if (b) return b;
  }
  const [b] = await q.query(
    `select b.* from boards b join departments d on d.id = b.department_id
      where b.org_id = $1 and b.archived_at is null and d.enabled and d.key = 'success'
      order by (b.visibility <> 'private') desc,
               (select count(*) from tasks t where t.board_id = b.id and t.account_id = $2) desc, b.created_at
      limit 1`,
    [orgId, accountId],
  );
  return b ?? null;
}

/** The message the owner can send, in the company's language. Never sent by itself. */
export function shippedDraft(locale: Locale, vars: { account: string; story: string; owner: string; note?: string }): string {
  return translate(locale, 'flow.draft.shipped', { account: vars.account, story: vars.story, owner: vars.owner || '—' });
}

/**
 * A story is finished: for every customer waiting for it, once, a task for the
 * customer's owner (Customer Success's owner when set, else the customer's own)
 * carrying a drafted message. Returns how many customers were looped back.
 */
export async function loopBack(q: Q, orgId: string, storyId: string, now: Date): Promise<number> {
  const links = await q.query(
    `select l.*, a.name as account_name, a.owner_id,
            (select m.user_id from account_team m join departments d on d.id = m.department_id
              where m.account_id = a.id and d.key = 'success' limit 1) as cs_owner
       from request_links l join accounts a on a.id = l.account_id
      where l.org_id = $1 and l.story_id = $2 and l.shipped_at is null and a.archived_at is null
      for update of l`,
    [orgId, storyId],
  );
  if (!links.length) return 0;
  const [org] = await q.query('select locale, timezone, settings from orgs where id = $1', [orgId]);
  const [story] = await q.query('select title from tasks where id = $1 and org_id = $2', [storyId, orgId]);
  const locale = (org?.locale ?? 'en') as Locale;
  const settings = flowSettings(org?.settings);
  const today = localDate(now, org?.timezone || 'UTC');
  const byAccount = new Map<string, Row[]>();
  for (const l of links) byAccount.set(l.account_id, [...(byAccount.get(l.account_id) ?? []), l]);
  let n = 0;
  for (const [accountId, group] of byAccount) {
    const first = group[0];
    const ownerId: string | null = first.cs_owner ?? first.owner_id ?? null;
    const [owner] = ownerId ? await q.query(`select id, name, seat, status from users where id = $1 and org_id = $2`, [ownerId, orgId]) : [];
    const draft = shippedDraft(locale, { account: first.account_name, story: story?.title ?? '', owner: owner?.name ?? '' });
    let taskId: string | null = null;
    const board = await loopBoard(q, orgId, settings, accountId);
    if (board) {
      const columns = board.columns as Column[];
      const status = columns.find((c) => !c.done)?.key ?? columns[0].key;
      const assignees = owner && owner.seat === 'full' && ['active', 'invited'].includes(owner.status) ? [owner.id] : [];
      const [{ p }] = await q.query('select coalesce(max(position), 0) + 1024 as p from tasks where board_id = $1 and status = $2', [board.id, status]);
      const [t] = await q.query(
        `insert into tasks (org_id, board_id, title, description, status, assignee_ids, account_id, due_date, position)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
        [orgId, board.id, translate(locale, 'flow.loop.task', { account: first.account_name, story: story?.title ?? '' }).slice(0, 300), draft, status, assignees, accountId, addDays(today, 2), Number(p)],
      );
      taskId = t.id;
      await onTaskCreated(q, orgId, null, t, board, { shipped: story?.title ?? '' });
    }
    await q.query(`update request_links set shipped_at = now(), draft = $3, loop_task_id = $4 where org_id = $1 and id = any($2::uuid[])`, [orgId, group.map((l) => l.id), draft, taskId]);
    await audit(q, { orgId, actorId: null, action: 'request.shipped', entity: 'account', entityId: accountId, meta: { story: storyId, task: taskId } });
    n++;
  }
  return n;
}

/** What was built for a customer since a day: the renewal's summary lists it. */
export async function builtFor(q: Q, orgId: string, accountId: string, since: string): Promise<{ title: string; shippedAt: string }[]> {
  const rows = await q.query(
    `select distinct on (t.id) t.title, l.shipped_at from request_links l join tasks t on t.id = l.story_id
      where l.org_id = $1 and l.account_id = $2 and l.shipped_at is not null and l.shipped_at >= $3::date
      order by t.id, l.shipped_at`,
    [orgId, accountId, since],
  );
  return rows.map((r) => ({ title: r.title, shippedAt: new Date(r.shipped_at).toISOString() })).sort((a, b) => a.shippedAt.localeCompare(b.shippedAt));
}

/** The renewal summary's lines about work built for the customer this term (empty when none). */
export async function builtForLines(q: Q, orgId: string, accountId: string, since: string, locale: Locale): Promise<string> {
  const built = await builtFor(q, orgId, accountId, since);
  if (!built.length) return '';
  return [translate(locale, 'flow.renewal.built', { n: built.length }), ...built.slice(0, 10).map((b) => `• ${b.title}`)].join('\n');
}

/** After a task moved (runs with owner access, after the move committed). */
export async function flowAfterMove(deps: Deps, orgId: string, task: Row, board: Row, column: string, now: Date) {
  const columns = (board.columns ?? []) as Column[];
  const done = columns.some((c) => c.key === column && c.done);
  let shipped = 0;
  await deps.db.system(async (q) => {
    if (done) shipped = await loopBack(q, orgId, task.id, now);
    const [org] = await q.query('select settings from orgs where id = $1', [orgId]);
    if (flowSettings(org?.settings).handover && task.account_id && (await isWonColumn(q, orgId, board.id, column))) {
      await createHandover(q, orgId, task.updated_by ?? null, { kind: 'task', id: task.id });
    }
  });
  if (shipped) kick(deps);
}

/** After a record changed (owner access, after commit): a deal whose status became "won" gets its hand-over card. */
export async function flowAfterRecord(deps: Deps, orgId: string, actorId: string | null, recordId: string, before: Record<string, unknown> | null, after: Record<string, unknown>) {
  if (after.status !== 'won' || before?.status === 'won') return;
  const made = await deps.db.system(async (q) => {
    const [org] = await q.query('select settings from orgs where id = $1', [orgId]);
    if (!flowSettings(org?.settings).handover) return null;
    const [r] = await q.query(`select r.id from records r join record_types t on t.id = r.type_id where r.id = $1 and r.org_id = $2 and t.kind = 'opportunity'`, [recordId, orgId]);
    return r ? createHandover(q, orgId, actorId, { kind: 'record', id: recordId }) : null;
  });
  if (made) kick(deps);
}

/** The renewal date field's value on a customer, when there is one. */
export function renewalOf(defs: AccountField[], fields: Record<string, unknown>): string | null {
  const f = renewalField(defs);
  const v = f ? fields?.[f.key] : null;
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
}
