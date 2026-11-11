// The automation engine. Rules are data (shared/src/automation.ts); this
// file finds what each rule applies to today and does it — once. Every
// firing claims a (rule, thing, occasion) key in automation_runs first, so
// a renewal plan is opened once per renewal date however often this runs.
//
// It runs with owner access (rules act for the company, not for whoever
// happens to be signed in), so every query here filters on org_id itself.
import { fillTitle, type Action, type Condition, type Trigger } from '../../../shared/src/automation';
import type { Column } from '../../../shared/src/model';
import type { Deps } from '../context';
import type { Q, Row } from '../db';
import { audit } from './audit';
import { day } from './mappers';
import { enqueue, kick } from './notify';
import { onTaskCreated } from './taskEvents';

export const MAX_FIRES_PER_RUN = 200;

export function localDate(now: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function localHour(now: Date, timeZone: string): number {
  try {
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(now));
  } catch {
    return now.getUTCHours();
  }
}

export const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
};

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
            and not exists (select 1 from jsonb_array_elements(b.columns) col where col->>'key' = t.status and (col->>'done')::boolean)
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

/** Does the rule's action. Returns what it did, stored with the run. */
async function act(q: Q, orgId: string, rule: Row, action: Action, account: Row | null, task: Row | null, today: string) {
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
    let assignees: string[] = [];
    if (bp.assignee === 'account_owner' && account?.owner_id) assignees = [account.owner_id];
    else if (bp.assignee === 'assignees') assignees = task?.assignee_ids ?? [];
    else if (bp.assignee.startsWith('user:')) assignees = [bp.assignee.slice(5)];
    assignees = await fullSeat(q, orgId, assignees);
    const [{ p }] = await q.query('select coalesce(max(position), 0) + 1024 as p from tasks where board_id = $1 and status = $2', [board.id, status]);
    const id = crypto.randomUUID();
    const [t] = await q.query(
      `insert into tasks (id, org_id, board_id, title, status, assignee_ids, account_id, due_date, position)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
      [id, orgId, board.id, fillTitle(bp.title, { account_name: account?.name }), status, assignees, account?.id ?? task?.account_id ?? null, addDays(today, bp.dueInDays), Number(p)],
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
async function fire(deps: Deps, orgId: string, rule: Row, key: string, account: Row | null, task: Row | null, today: string) {
  return deps.db.system(async (q) => {
    const claimed = await q.query(
      `insert into automation_runs (org_id, automation_id, run_key) values ($1, $2, $3) on conflict do nothing returning run_key`,
      [orgId, rule.id, `${account ? `a:${account.id}` : `t:${task?.id}`}:${key}`],
    );
    if (!claimed.length) return false;
    const result = await act(q, orgId, rule, rule.action as Action, account, task, today);
    await q.query(`update automation_runs set result = $4 where org_id = $1 and automation_id = $2 and run_key = $3`, [
      orgId,
      rule.id,
      claimed[0].run_key,
      JSON.stringify({ ...result, account: account?.id ?? undefined, task: task?.id ?? undefined }),
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
  const rules = await deps.db.system((q) =>
    q.query(`select * from automations where org_id = $1 and enabled and trigger->>'type' = 'task_moved' and trigger->>'column' = $2`, [orgId, column]),
  );
  if (!rules.length) return 0;
  const [task] = await deps.db.system((q) =>
    q.query(`select t.*, to_jsonb(a.*) as account from tasks t left join accounts a on a.id = t.account_id where t.id = $1 and t.org_id = $2`, [taskId, orgId]),
  );
  if (!task) return 0;
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

/** For the editor: how many things the rule would act on today (nothing is changed). */
export async function preview(q: Q, orgId: string, trigger: Trigger, conditions: Condition[], today: string) {
  if (trigger.type === 'account_created' || trigger.type === 'task_moved') return { count: null as number | null, sample: [] as string[] };
  const list = (await candidates(q, orgId, trigger, today)).filter((c) => matches(c.account, conditions));
  return { count: list.length, sample: list.slice(0, 5).map((c) => (c.task ? c.task.title : c.account?.name) as string) };
}

export { daysBetween };
