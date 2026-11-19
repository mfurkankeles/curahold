// The automation engine. Rules are data (shared/src/automation.ts); this
// file finds what each rule applies to today and does it — once. Every
// firing claims a (rule, thing, occasion) key in automation_runs first, so
// a renewal plan is opened once per renewal date however often this runs.
//
// It runs with owner access (rules act for the company, not for whoever
// happens to be signed in), so every query here filters on org_id itself.
import { tellCustomerStatus } from './portal';
import { addDays, localDate, localHour } from '../../../shared/src/days';
import { EVENT_TRIGGERS, fillTitle, type Action, type Assignee, type Condition, type Trigger } from '../../../shared/src/automation';
import type { Column } from '../../../shared/src/model';
import { nowOf, type Deps } from '../context';
import type { Q, Row } from '../db';
import { audit } from './audit';
import { day } from './mappers';
import { enqueue, kick } from './notify';
import { onTaskCreated } from './taskEvents';
import { createHandover, flowAfterMove, loopBack } from './handoff';

export const MAX_FIRES_PER_RUN = 200;

// The company's day and hour live in shared/src/days.ts; re-exported for the callers that grew up here.
export { localDate, localHour, addDays };

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400_000);

export function splitTrigger(raw: any): { trigger: Trigger; conditions: Condition[] } {
  const { conditions, ...trigger } = raw ?? {};
  return { trigger: trigger as Trigger, conditions: Array.isArray(conditions) ? conditions : [] };
}

/** Account rows carry fields + owner_id; conditions read either. */
export function matches(account: Row | null, conditions: Condition[]): boolean {
  if (!conditions.length) return true;
  if (!account) return false;
  return conditions.every((c) => {
    const raw = c.field === 'owner' ? account.owner_id : (account.fields ?? {})[c.field];
    const empty = raw === null || raw === undefined || raw === '';
    switch (c.op) {
      case 'empty':
        return empty;
      case 'not_empty':
        return !empty;
      case 'eq':
        return !empty && String(raw) === String(c.value ?? '');
      case 'neq':
        return empty || String(raw) !== String(c.value ?? '');
      case 'gt':
      case 'lt': {
        if (empty || c.value === null || c.value === undefined) return false;
        const a = Number(raw);
        const b = Number(c.value);
        const cmp = Number.isFinite(a) && Number.isFinite(b) ? a - b : String(raw).localeCompare(String(c.value));
        return c.op === 'gt' ? cmp > 0 : cmp < 0;
      }
      default:
        return false;
    }
  });
}

const DATE_RE = '^\\d{4}-\\d{2}-\\d{2}';

/** Accounts (or tasks) a scheduled trigger applies to today, each with its occasion key. */
export async function candidates(q: Q, orgId: string, trigger: Trigger, today: string): Promise<{ key: string; account: Row | null; task: Row | null }[]> {
  switch (trigger.type) {
    case 'account_date': {
      const rows = await q.query(
        `select a.*, (a.fields->>$2) as due from accounts a
          where a.org_id = $1 and a.archived_at is null and (a.fields->>$2) ~ '${DATE_RE}'
            and substr(a.fields->>$2, 1, 10)::date between $3::date and $3::date + $4::int
          order by a.name limit 2000`,
        [orgId, trigger.field, today, Math.max(0, trigger.daysBefore)],
      );
      return rows.map((a) => ({ key: `date:${trigger.field}:${String(a.due).slice(0, 10)}`, account: a, task: null }));
    }
    case 'account_every': {
      const every = Math.max(1, trigger.days);
      const rows = await q.query(
        `select a.*, ($2::date - a.created_at::date) as age from accounts a
          where a.org_id = $1 and a.archived_at is null and ($2::date - a.created_at::date) >= $3
          order by a.name limit 2000`,
        [orgId, today, every],
      );
      return rows.map((a) => ({ key: `every:${every}:${Math.floor(Number(a.age) / every)}`, account: a, task: null }));
    }
    case 'account_inactive': {
      const rows = await q.query(
        `select a.*, greatest(a.created_at, (select max(t.updated_at) from tasks t where t.account_id = a.id and t.org_id = a.org_id)) as last_activity
           from accounts a
          where a.org_id = $1 and a.archived_at is null
            and greatest(a.created_at, (select max(t.updated_at) from tasks t where t.account_id = a.id and t.org_id = a.org_id))
                < ($2::date - $3::int)::timestamptz
          order by a.name limit 2000`,
        [orgId, today, Math.max(1, trigger.days)],
      );
      return rows.map((a) => ({ key: `inactive:${new Date(a.last_activity).toISOString().slice(0, 10)}`, account: a, task: null }));
    }
    case 'task_overdue': {
      const rows = await q.query(
        `select t.*, to_jsonb(a.*) as account from tasks t
           join boards b on b.id = t.board_id
           left join accounts a on a.id = t.account_id
          where t.org_id = $1 and t.archived_at is null and b.archived_at is null and t.due_date is not null
            and t.due_date <= $2::date - $3::int
            and t.done_at is null
          order by t.due_date limit 2000`,
        [orgId, today, Math.max(0, trigger.days)],
      );
      return rows.map((t) => ({ key: `overdue:${t.id}:${day(t.due_date)}`, account: t.account ?? null, task: t }));
    }
    default:
      return [];
  }
}

async function recipients(q: Q, orgId: string, to: string[], account: Row | null, task: Row | null): Promise<string[]> {
  const out = new Set<string>();
  const assignees: string[] = task?.assignee_ids ?? [];
  for (const r of to) {
    if (r === 'account_owner' && account?.owner_id) out.add(account.owner_id);
    else if (r === 'assignees') assignees.forEach((a) => out.add(a));
    else if (r === 'team_lead') {
      const people = assignees.length ? assignees : account?.owner_id ? [account.owner_id] : [];
      const leads = await q.query<{ lead_id: string }>(
        `select distinct t.lead_id from teams t
          where t.org_id = $1 and t.lead_id is not null and (
            exists (select 1 from team_members m where m.team_id = t.id and m.user_id = any($2::uuid[]))
            or t.id = $3::uuid or t.id = (select team_id from boards where id = $4::uuid and org_id = $1))`,
        [orgId, people, account?.team_id ?? null, task?.board_id ?? null],
      );
      leads.forEach((l) => out.add(l.lead_id));
    } else if (r === 'admins') {
      const admins = await q.query<{ id: string }>(
        `select u.id from users u join roles r on r.id = u.role_id where u.org_id = $1 and r.key = 'admin' and u.status = 'active'`,
        [orgId],
      );
      admins.forEach((a) => out.add(a.id));
    } else if (r.startsWith('user:')) out.add(r.slice(5));
  }
  if (!out.size) return [];
  const active = await q.query<{ id: string }>(`select id from users where org_id = $1 and id = any($2::uuid[]) and status in ('active', 'invited')`, [
    orgId,
    [...out],
  ]);
  return active.map((a) => a.id);
}

async function fullSeat(q: Q, orgId: string, ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const rows = await q.query<{ id: string }>(
    `select id from users where org_id = $1 and id = any($2::uuid[]) and status in ('active', 'invited') and seat = 'full'`,
    [orgId, ids],
  );
  return rows.map((r) => r.id);
}

/** The people an "assign" or a new task goes to. */
async function assigneesOf(q: Q, orgId: string, who: Assignee, account: Row | null, task: Row | null, record: Row | null): Promise<string[]> {
  let out: string[] = [];
  if (who === 'account_owner' && (record?.owner_id || account?.owner_id)) out = [account?.owner_id ?? record!.owner_id];
  else if (who === 'assignees') out = task?.assignee_ids ?? (record?.owner_id ? [record.owner_id] : []);
  else if (who.startsWith('user:')) out = [who.slice(5)];
  return fullSeat(q, orgId, out);
}

/** The actions that work on the trigger's own task or record (D5): assign, move, set a field, comment, webhook, hand-over. */
async function actOnItem(q: Q, orgId: string, rule: Row, action: Action, account: Row | null, task: Row | null, record: Row | null, now: Date) {
  const sign = `[${rule.name}]`;
  switch (action.type) {
    case 'assign': {
      const ids = await assigneesOf(q, orgId, action.to, account, task, record);
      if (task) {
        const [u] = await q.query(`update tasks set assignee_ids = $3, version = version + 1, updated_at = now() where id = $1 and org_id = $2 returning *`, [task.id, orgId, ids]);
        const had = new Set<string>(task.assignee_ids ?? []);
        await enqueue(q, ids.filter((x) => !had.has(x)).map((x) => ({ orgId, userId: x, kind: 'assigned', taskId: task.id, data: { rule: rule.name } })));
        return { task: u?.id, assigned: ids.length };
      }
      if (record && ids[0]) await q.query('update records set owner_id = $3, updated_at = now() where id = $1 and org_id = $2', [record.id, orgId, ids[0]]);
      return { assigned: record && ids[0] ? 1 : 0 };
    }
    case 'move': {
      if (!task) return { error: 'no_task' };
      const [b] = await q.query('select * from boards where id = $1 and org_id = $2', [task.board_id, orgId]);
      const columns = (b?.columns ?? []) as Column[];
      if (!columns.some((c) => c.key === action.column)) return { error: 'column_missing' };
      if (task.status === action.column) return { moved: 0 };
      await q.query(`update tasks set status = $3, version = version + 1, updated_at = now() where id = $1 and org_id = $2`, [task.id, orgId, action.column]);
      // Finished by a rule: the customers waiting for it are looped back all the same.
      if (columns.some((c) => c.key === action.column && c.done)) await loopBack(q, orgId, task.id, now);
      return { moved: 1 };
    }
    case 'set_field': {
      const table = action.target === 'task' ? 'tasks' : action.target === 'record' ? 'records' : 'accounts';
      const id = action.target === 'task' ? task?.id : action.target === 'record' ? record?.id : (account?.id ?? task?.account_id ?? record?.account_id);
      if (!id) return { error: 'nothing_to_set' };
      await q.query(`update ${table} set fields = coalesce(fields, '{}'::jsonb) || jsonb_build_object($3::text, $4::jsonb), updated_at = now() where id = $1 and org_id = $2`, [
        id,
        orgId,
        action.field,
        JSON.stringify(action.value),
      ]);
      return { set: 1 };
    }
    case 'comment': {
      const body = `${sign} ${fillTitle(action.body, { account_name: account?.name })}`.slice(0, 2000);
      if (task) await q.query('insert into comments (org_id, task_id, author_id, body) values ($1, $2, null, $3)', [orgId, task.id, body]);
      else if (record) await q.query('insert into record_comments (org_id, record_id, author_id, body) values ($1, $2, null, $3)', [orgId, record.id, body]);
      else return { error: 'nothing_to_comment' };
      return { commented: 1 };
    }
    case 'webhook': {
      const entity = task ? 'task' : 'record';
      const id = task?.id ?? record?.id;
      if (!id) return { error: 'nothing_to_send' };
      await q.query(`insert into webhook_events (org_id, event, entity_id) values ($1, $2, $3)`, [orgId, `${entity}.automation`, id]);
      return { webhook: 1 };
    }
    case 'handover': {
      const src = record ? { kind: 'record' as const, id: record.id } : task ? { kind: 'task' as const, id: task.id } : null;
      if (!src) return { error: 'no_deal' };
      const id = await createHandover(q, orgId, null, src, record?.fields?.status ?? task?.status ?? 'won');
      return { handover: id ? 1 : 0 };
    }
    default:
      return { error: 'unknown_action' };
  }
}

/** Does the rule's action. Returns what it did, stored with the run. */
async function act(q: Q, orgId: string, rule: Row, action: Action, account: Row | null, task: Row | null, today: string, record: Row | null = null, now = new Date()) {
  if (action.type !== 'notify' && action.type !== 'create_tasks') return actOnItem(q, orgId, rule, action, account, task, record, now);
  if (action.type === 'notify') {
    const to = await recipients(q, orgId, action.to, account, task);
    await enqueue(
      q,
      to.map((u) => ({
        orgId,
        userId: u,
        kind: 'automation',
        taskId: task?.id ?? null,
        data: { rule: rule.name, message: action.message, account: account?.name ?? null },
      })),
    );
    return { notified: to.length };
  }
  const [board] = await q.query('select * from boards where id = $1 and org_id = $2 and archived_at is null', [action.boardId, orgId]);
  if (!board) return { error: 'board_missing' };
  const columns = board.columns as Column[];
  const status = action.column && columns.some((c) => c.key === action.column) ? action.column : columns[0].key;
  const created: string[] = [];
  for (const bp of action.tasks) {
    const assignees = await assigneesOf(q, orgId, bp.assignee, account, task, record);
    const [{ p }] = await q.query('select coalesce(max(position), 0) + 1024 as p from tasks where board_id = $1 and status = $2', [board.id, status]);
    const id = crypto.randomUUID();
    const [t] = await q.query(
      `insert into tasks (id, org_id, board_id, title, status, assignee_ids, account_id, due_date, position)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
      [id, orgId, board.id, fillTitle(bp.title, { account_name: account?.name }), status, assignees, account?.id ?? task?.account_id ?? record?.account_id ?? null, addDays(today, bp.dueInDays), Number(p)],
    );
    let pos = 0;
    for (const s of bp.subtasks ?? []) {
      pos += 1024;
      await q.query(
        `insert into tasks (org_id, board_id, parent_id, title, status, assignee_ids, account_id, position) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [orgId, board.id, id, fillTitle(s, { account_name: account?.name }), columns[0].key, assignees, t.account_id, pos],
      );
    }
    await audit(q, { orgId, actorId: null, action: 'automation.task_created', entity: 'task', entityId: id, meta: { rule: rule.id } });
    await onTaskCreated(q, orgId, null, t, board, { rule: rule.name });
    created.push(id);
  }
  return { tasks: created };
}

/** Claims the occasion and acts, in one transaction. False when it already ran. */
async function fire(deps: Deps, orgId: string, rule: Row, key: string, account: Row | null, task: Row | null, today: string, record: Row | null = null) {
  return deps.db.system(async (q) => {
    const claimed = await q.query(
      `insert into automation_runs (org_id, automation_id, run_key) values ($1, $2, $3) on conflict do nothing returning run_key`,
      [orgId, rule.id, `${record ? `r:${record.id}` : account ? `a:${account.id}` : `t:${task?.id}`}:${key}`],
    );
    if (!claimed.length) return false;
    const result = await act(q, orgId, rule, rule.action as Action, account, task, today, record, nowOf(deps));
    await q.query(`update automation_runs set result = $4 where org_id = $1 and automation_id = $2 and run_key = $3`, [
      orgId,
      rule.id,
      claimed[0].run_key,
      JSON.stringify({ ...result, account: account?.id ?? undefined, task: task?.id ?? undefined, record: record?.id ?? undefined }),
    ]);
    return true;
  });
}

export async function runScheduledAutomations(deps: Deps, now: Date, onlyOrg?: string, onlyRule?: string) {
  const orgs = await deps.db.system((q) => q.query(`select id, timezone from orgs where ($1::uuid is null or id = $1::uuid)`, [onlyOrg ?? null]));
  let fired = 0;
  for (const org of orgs) {
    const today = localDate(now, org.timezone);
    const rules = await deps.db.system((q) =>
      q.query(
        `select * from automations where org_id = $1 and ($2::uuid is null or id = $2::uuid) and ($2::uuid is not null or enabled)
            and trigger->>'type' in ('account_date', 'account_every', 'account_inactive', 'task_overdue')`,
        [org.id, onlyRule ?? null],
      ),
    );
    for (const rule of rules) {
      const { trigger, conditions } = splitTrigger(rule.trigger);
      const list = await deps.db.system((q) => candidates(q, org.id, trigger, today));
      let n = 0;
      for (const c of list) {
        if (n >= MAX_FIRES_PER_RUN) break;
        if (!matches(c.account, conditions)) continue;
        if (await fire(deps, org.id, rule, c.key, c.account, c.task, today)) n++;
      }
      fired += n;
    }
  }
  if (fired) kick(deps);
  return fired;
}

export async function runAccountCreated(deps: Deps, orgId: string, accountIds: string[], now: Date) {
  if (!accountIds.length) return 0;
  const [org] = await deps.db.system((q) => q.query('select timezone from orgs where id = $1', [orgId]));
  const today = localDate(now, org?.timezone ?? 'UTC');
  const rules = await deps.db.system((q) => q.query(`select * from automations where org_id = $1 and enabled and trigger->>'type' = 'account_created'`, [orgId]));
  if (!rules.length) return 0;
  const accounts = await deps.db.system((q) => q.query('select * from accounts where org_id = $1 and id = any($2::uuid[])', [orgId, accountIds]));
  let fired = 0;
  for (const rule of rules) {
    const { conditions } = splitTrigger(rule.trigger);
    for (const a of accounts) if (matches(a, conditions) && (await fire(deps, orgId, rule, 'created', a, null, today))) fired++;
  }
  if (fired) kick(deps);
  return fired;
}

export async function runTaskMoved(deps: Deps, orgId: string, taskId: string, column: string, now: Date) {
  // People at the customer hear when work starts and when it is done (lib/portal.ts).
  await tellCustomerStatus(deps, orgId, taskId).catch((e) => console.error('[curahold] portal status email', e));
  const [task] = await deps.db.system((q) =>
    q.query(
      `select t.*, to_jsonb(a.*) as account, to_jsonb(b.*) as board from tasks t join boards b on b.id = t.board_id
         left join accounts a on a.id = t.account_id where t.id = $1 and t.org_id = $2`,
      [taskId, orgId],
    ),
  );
  if (!task) return 0;
  // Won deals get their hand-over card; finished stories loop back to the customers who asked (lib/handoff.ts).
  await flowAfterMove(deps, orgId, task, task.board, column, now).catch((e) => console.error('[curahold] flow after move', e));
  const finished = ((task.board?.columns ?? []) as Column[]).some((c) => c.key === column && c.done);
  if (finished) await runTaskEvent(deps, orgId, taskId, 'task_done', now, task).catch(() => 0);
  const rules = await deps.db.system((q) =>
    q.query(`select * from automations where org_id = $1 and enabled and trigger->>'type' = 'task_moved' and trigger->>'column' = $2`, [orgId, column]),
  );
  if (!rules.length) return 0;
  const [org] = await deps.db.system((q) => q.query('select timezone from orgs where id = $1', [orgId]));
  const today = localDate(now, org?.timezone ?? 'UTC');
  let fired = 0;
  for (const rule of rules) {
    const { trigger, conditions } = splitTrigger(rule.trigger);
    if (trigger.type !== 'task_moved' || (trigger.boardId && trigger.boardId !== task.board_id)) continue;
    if (conditions.length && !matches(task.account ?? null, conditions)) continue;
    if (await fire(deps, orgId, rule, `moved:${column}`, null, task, today)) fired++;
  }
  if (fired) kick(deps);
  return fired;
}

/**
 * A task was added, finished, or arrived through a form (after the change committed).
 * Tasks the rules themselves make never fire these, so rules cannot chain into a loop.
 */
export async function runTaskEvent(deps: Deps, orgId: string, taskId: string, kind: 'task_created' | 'task_done' | 'form_received', now: Date, loaded?: Row) {
  const rules = await deps.db.system((q) => q.query(`select * from automations where org_id = $1 and enabled and trigger->>'type' = $2`, [orgId, kind]));
  if (!rules.length) return 0;
  const [task] = loaded
    ? [loaded]
    : await deps.db.system((q) =>
        q.query(`select t.*, to_jsonb(a.*) as account from tasks t left join accounts a on a.id = t.account_id where t.id = $1 and t.org_id = $2`, [taskId, orgId]),
      );
  if (!task) return 0;
  const [org] = await deps.db.system((q) => q.query('select timezone from orgs where id = $1', [orgId]));
  const today = localDate(now, org?.timezone ?? 'UTC');
  let fired = 0;
  for (const rule of rules) {
    const { trigger, conditions } = splitTrigger(rule.trigger);
    if ('boardId' in trigger && trigger.boardId && trigger.boardId !== task.board_id) continue;
    if (conditions.length && !matches(task.account ?? null, conditions)) continue;
    const key = kind === 'task_done' ? `done:${task.done_at ? new Date(task.done_at).toISOString() : now.toISOString().slice(0, 16)}` : kind;
    if (await fire(deps, orgId, rule, key, null, task, today)) fired++;
  }
  if (fired) kick(deps);
  return fired;
}

/** A record changed (after commit): a choice field took a value (record_stage), or a ticket was opened (ticket_opened). */
export async function runRecordEvent(deps: Deps, orgId: string, recordId: string, kind: 'record_stage' | 'ticket_opened', changed: Record<string, unknown> | null, now: Date) {
  const rules = await deps.db.system((q) => q.query(`select * from automations where org_id = $1 and enabled and trigger->>'type' = $2`, [orgId, kind]));
  if (!rules.length) return 0;
  const [record] = await deps.db.system((q) =>
    q.query(
      `select r.*, rt.key as type_key, rt.kind as type_kind, to_jsonb(a.*) as account from records r join record_types rt on rt.id = r.type_id
         left join accounts a on a.id = r.account_id where r.id = $1 and r.org_id = $2`,
      [recordId, orgId],
    ),
  );
  if (!record || (kind === 'ticket_opened' && record.type_kind !== 'ticket')) return 0;
  const [org] = await deps.db.system((q) => q.query('select timezone from orgs where id = $1', [orgId]));
  const today = localDate(now, org?.timezone ?? 'UTC');
  let fired = 0;
  for (const rule of rules) {
    const { trigger, conditions } = splitTrigger(rule.trigger);
    let key = 'opened';
    if (trigger.type === 'record_stage') {
      if (trigger.typeKey && trigger.typeKey !== record.type_key) continue;
      if (!changed || !(trigger.field in changed) || String(changed[trigger.field] ?? '') !== trigger.value) continue;
      key = `stage:${trigger.field}:${trigger.value}`;
    }
    if (conditions.length && !matches(record.account ?? null, conditions)) continue;
    if (await fire(deps, orgId, rule, key, record.account ?? null, null, today, record)) fired++;
  }
  if (fired) kick(deps);
  return fired;
}

/**
 * The hourly round's share: records that came in from a CRM or a support tool
 * since the last round fire the same rules as ones changed here (each fires
 * once per record and occasion), and deals won in the CRM get their hand-over card.
 */
export async function sweepRecordEvents(deps: Deps, now: Date) {
  const recent = await deps.db.system((q) =>
    q.query(
      `select r.id, r.org_id, r.fields, rt.kind, (r.created_at > now() - interval '2 hours') as fresh from records r join record_types rt on rt.id = r.type_id
        where r.source <> 'manual' and r.updated_at > now() - interval '2 hours' and r.archived_at is null
          and (rt.kind in ('ticket', 'opportunity') or exists (select 1 from automations a where a.org_id = r.org_id and a.enabled and a.trigger->>'type' = 'record_stage'))
        order by r.updated_at limit 2000`,
    ),
  );
  let n = 0;
  for (const r of recent) {
    if (r.kind === 'ticket' && r.fresh) n += await runRecordEvent(deps, r.org_id, r.id, 'ticket_opened', null, now).catch(() => 0);
    n += await runRecordEvent(deps, r.org_id, r.id, 'record_stage', r.fields ?? {}, now).catch(() => 0);
    if (r.kind === 'opportunity' && r.fields?.status === 'won') {
      const { flowAfterRecord } = await import('./handoff');
      await flowAfterRecord(deps, r.org_id, null, r.id, null, r.fields).catch(() => undefined);
    }
  }
  return n;
}

/** For the editor: how many things the rule would act on today (nothing is changed). */
export async function preview(q: Q, orgId: string, trigger: Trigger, conditions: Condition[], today: string) {
  if (EVENT_TRIGGERS.includes(trigger.type)) return { count: null as number | null, sample: [] as string[] };
  const list = (await candidates(q, orgId, trigger, today)).filter((c) => matches(c.account, conditions));
  return { count: list.length, sample: list.slice(0, 5).map((c) => (c.task ? c.task.title : c.account?.name) as string) };
}

export { daysBetween };
