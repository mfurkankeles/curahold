// Playbooks: a company's way of doing a thing, as tasks with dates. A step is
// due so many days after the day the playbook is put on a customer ('start'),
// or so many days before the customer's renewal date ('renewal') or a deal's
// close date ('close'). The same code puts one on by hand and starts a
// renewal by itself, so both make the same tasks.
import type { TaskBlueprint } from '../../../shared/src/automation';
import type { Locale } from '../../../shared/src/i18n';
import { translate } from '../../../shared/src/i18n';
import type { AccountField, Column } from '../../../shared/src/model';
import { rhythmOf } from '../../../shared/src/rhythm';
import type { Deps } from '../context';
import type { Db, Q, Row } from '../db';
import { audit } from './audit';
import { localDate } from './automations';
import { fail } from './errors';
import { addEvent } from './history';
import { kick } from './notify';
import { queueSync, recomputeRollups } from './records';
import { onTaskCreated } from './taskEvents';

export type Anchor = 'start' | 'renewal' | 'close';

export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);

/** The customer field that holds the renewal date. */
export function renewalField(defs: AccountField[]): AccountField | undefined {
  return defs.find((f) => f.key === 'renewal_date' && f.type === 'date') ?? defs.find((f) => f.type === 'date' && /renew|yenile/i.test(`${f.key} ${f.label?.en ?? ''} ${f.label?.tr ?? ''}`));
}

/** The money field that says what a customer is worth a year. */
export function valueField(defs: AccountField[]): AccountField | undefined {
  return ['arr', 'mrr', 'deal_value'].map((k) => defs.find((f) => f.key === k && f.type === 'money')).find(Boolean) ?? defs.find((f) => f.type === 'money' && !f.rollup && !f.health);
}

/** When a step is due. Never before today: a playbook started late puts what is behind on today. */
export function stepDay(anchor: Anchor, from: string, days: number, today: string): string {
  const d = anchor === 'start' ? addDays(from, days) : addDays(from, -days);
  return d < today ? today : d;
}

export interface ApplyInput {
  orgId: string;
  /** Who put it on; null when Curahold did (a renewal it started). */
  actorId: string | null;
  plan: Row;
  /** The customer (id, name, owner_id). */
  account: Row;
  /** The record (id, name, owner_id), when it is put on one. */
  record?: Row | null;
  /** The day dates count from: the start, the renewal date or the close date. */
  from: string;
  today: string;
  /**
   * Started by Curahold after some steps' dates had already passed (renewals
   * switched on mid-way): those steps become one "catch up" task for today,
   * each of them a subtask, instead of a pile of tasks all due today.
   */
  catchUp?: { locale: Locale };
}

/** One task to make: its title, when it is due, and its subtasks. */
interface Step {
  title: string;
  due: string;
  assignee: TaskBlueprint['assignee'];
  subtasks: string[];
}

/** Puts a playbook's tasks on a customer (and a record, when given). Returns the tasks made. */
export async function applyPlan(q: Q, input: ApplyInput): Promise<Row[]> {
  const { orgId, actorId, plan, account, record } = input;
  const anchor = (plan.anchor ?? 'start') as Anchor;
  const [board] = await q.query('select * from boards where id = $1 and archived_at is null', [plan.board_id]);
  if (!board) fail('not_found');
  const columns = board.columns as Column[];
  const status = plan.column_key && columns.some((col) => col.key === plan.column_key) ? plan.column_key : columns[0].key;
  const fill = (s: string) => s.replace(/\{account_name\}/g, account.name).replace(/\{record_name\}/g, record?.name ?? account.name);
  // "The owner": whoever owns the deal when it is put on one, else whoever owns the customer.
  const owner = record?.owner_id ?? account.owner_id;

  // What to make, step by step. Steps whose day has passed are due today —
  // or, for a renewal Curahold starts late, gathered into one catch-up task.
  const blueprints = plan.tasks as TaskBlueprint[];
  const late = input.catchUp ? blueprints.filter((bp) => rawDay(anchor, input.from, bp.dueInDays) < input.today) : [];
  const steps: Step[] = [];
  if (late.length >= 2) {
    steps.push({
      title: translate(input.catchUp!.locale, 'renewal.catchUp' as any, { account: account.name }),
      due: input.today,
      assignee: 'account_owner',
      subtasks: late.map((bp) => fill(bp.title)),
    });
  }
  for (const bp of blueprints) {
    if (late.length >= 2 && late.includes(bp)) continue;
    steps.push({ title: fill(bp.title), due: stepDay(anchor, input.from, bp.dueInDays, input.today), assignee: bp.assignee, subtasks: (bp.subtasks ?? []).map(fill) });
  }

  const out: Row[] = [];
  for (const step of steps) {
    let assignees: string[] = [];
    if (step.assignee === 'account_owner' && owner) assignees = [owner];
    else if (step.assignee.startsWith('user:')) assignees = [step.assignee.slice(5)];
    if (assignees.length) {
      // Only people who can still be given work (a full seat, not switched off).
      const ok = await q.query(`select id from users where id = any($1::uuid[]) and status in ('active', 'invited') and seat = 'full'`, [assignees]);
      assignees = ok.map((u) => u.id);
    }
    const [{ p }] = await q.query('select coalesce(max(position), 0) + 1024 as p from tasks where board_id = $1 and status = $2', [board.id, status]);
    const [t] = await q.query(
      `insert into tasks (org_id, board_id, title, status, assignee_ids, account_id, record_id, due_date, position, created_by, updated_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10) returning *, $11::text as account_name`,
      [orgId, board.id, step.title.slice(0, 300), status, assignees, account.id, record?.id ?? null, step.due, Number(p), actorId, account.name],
    );
    let pos = 0;
    for (const sub of step.subtasks) {
      pos += 1024;
      await q.query(
        `insert into tasks (org_id, board_id, parent_id, title, status, assignee_ids, account_id, position, created_by, updated_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
        [orgId, board.id, t.id, sub.slice(0, 300), columns[0].key, assignees, account.id, pos, actorId],
      );
    }
    await addEvent(q, orgId, t.id, actorId, 'created', { plan: plan.name });
    await onTaskCreated(q, orgId, actorId, t, board, actorId ? {} : { rule: plan.name });
    out.push(t);
  }
  await audit(q, { orgId, actorId, action: 'plan.applied', entity: 'account', entityId: account.id, meta: { plan: plan.name, tasks: out.length, ...(record ? { record: record.id } : {}) } });
  return out;
}

/** The day a step falls on, before "never before today". */
const rawDay = (anchor: Anchor, from: string, days: number) => (anchor === 'start' ? addDays(from, days) : addDays(from, -days));

/** The day a playbook counts from, for this customer (and deal). Fails when it needs a date that is not there. */
export function anchorDay(plan: Row, start: string, account: Row, record: Row | null, defs: AccountField[]): string {
  const anchor = (plan.anchor ?? 'start') as Anchor;
  if (anchor === 'start') return start;
  if (anchor === 'close') {
    const d = record?.fields?.close_date;
    if (!isDay(d)) fail('plan_no_date');
    return (d as string).slice(0, 10);
  }
  const f = renewalField(defs);
  const d = f ? account.fields?.[f.key] : null;
  if (!isDay(d)) fail('plan_no_date');
  return (d as string).slice(0, 10);
}

// ------------------------------------------------- renewals, by themselves

const words = (locale: Locale, key: 'renewal.taskTitle' | 'renewal.dealName' | 'renewal.rule', vars: Record<string, string> = {}) => translate(locale, key as any, vars);

/**
 * Starts the renewals that have come close enough: for each customer whose
 * renewal date is within the company's lead time, once per renewal date —
 * the renewal playbook's tasks (or one task for the owner), and a renewal
 * opportunity when the company asked for one.
 */
export async function startRenewals(deps: Deps, now: Date): Promise<number> {
  const started = await startRenewalsIn(deps.db, now);
  // The new tasks' notifications go out now rather than with the next round.
  if (started) kick(deps);
  return started;
}

/** The same, with only the database at hand (the demo's seed uses this). */
export async function startRenewalsIn(db: Db, now: Date): Promise<number> {
  let started = 0;
  const orgs = await db.system((q) => q.query(`select id, locale, timezone, currency, settings, account_fields from orgs where coalesce((settings->'rhythm'->'renewal'->>'days')::int, 0) > 0`));
  for (const org of orgs) {
    try {
      started += await db.system((q) => startFor(q, org, now));
    } catch (e) {
      // One company's problem never stops the others.
      console.error('[curahold] starting renewals failed', org.id, e);
    }
  }
  return started;
}

async function startFor(q: Q, org: Row, now: Date): Promise<number> {
  const rhythm = rhythmOf(org.settings?.rhythm);
  const defs = (org.account_fields ?? []) as AccountField[];
  const field = renewalField(defs);
  if (!field || !rhythm.renewal.days) return 0;
  const today = localDate(now, org.timezone || 'UTC');
  const due = await q.query(
    `select a.id, a.name, a.owner_id, a.currency, a.fields, left(a.fields->>$2, 10) as day
       from accounts a
      where a.org_id = $1 and a.archived_at is null and a.fields->>$2 ~ '^\\d{4}-\\d{2}-\\d{2}'
        and left(a.fields->>$2, 10)::date between $3::date and $3::date + $4::int
        and not exists (select 1 from playbook_runs pr where pr.org_id = a.org_id and pr.account_id = a.id and pr.anchor_day = left(a.fields->>$2, 10)::date)
      order by left(a.fields->>$2, 10) limit 200`,
    [org.id, field.key, today, rhythm.renewal.days],
  );
  if (!due.length) return 0;
  const [plan] = rhythm.renewal.planId ? await q.query('select * from plan_templates where id = $1 and org_id = $2', [rhythm.renewal.planId, org.id]) : [];
  const locale = (org.locale ?? 'en') as Locale;
  let n = 0;
  for (const a of due) {
    const record = rhythm.renewal.opportunity ? await renewalDeal(q, org, a, defs, locale) : null;
    let made = 0;
    if (plan) made = (await applyPlan(q, { orgId: org.id, actorId: null, plan: { ...plan, anchor: 'renewal' }, account: a, record, from: a.day, today, catchUp: { locale } })).length;
    else made = await oneTask(q, org, a, record, today, locale);
    await q.query('insert into playbook_runs (org_id, account_id, anchor_day, plan_id, record_id, tasks) values ($1, $2, $3, $4, $5, $6) on conflict do nothing', [
      org.id,
      a.id,
      a.day,
      plan?.id ?? null,
      record?.id ?? null,
      made,
    ]);
    n += 1;
  }
  return n;
}

/** Without a renewal playbook: one task for the customer's owner, on the renewals board. */
async function oneTask(q: Q, org: Row, a: Row, record: Row | null, today: string, locale: Locale): Promise<number> {
  const [board] = await q.query(
    `select * from boards where org_id = $1 and archived_at is null order by (name ~* '(renew|yenile)') desc, (visibility = 'org') desc, created_at limit 1`,
    [org.id],
  );
  if (!board) return 0;
  const columns = board.columns as Column[];
  const [{ p }] = await q.query('select coalesce(max(position), 0) + 1024 as p from tasks where board_id = $1 and status = $2', [board.id, columns[0].key]);
  // Two weeks to get going, and never after the renewal itself.
  const dueDay = [addDays(today, 14), a.day].sort()[0];
  const [t] = await q.query(
    `insert into tasks (org_id, board_id, title, status, assignee_ids, account_id, record_id, due_date, position) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning *, $10::text as account_name`,
    [org.id, board.id, words(locale, 'renewal.taskTitle', { account: a.name }).slice(0, 300), columns[0].key, a.owner_id ? [a.owner_id] : [], a.id, record?.id ?? null, dueDay, Number(p), a.name],
  );
  await addEvent(q, org.id, t.id, null, 'created', { renewal: a.day });
  await onTaskCreated(q, org.id, null, t, board, { rule: words(locale, 'renewal.rule') });
  return 1;
}

/** The customer's open renewal opportunity, or a new one for this renewal. */
async function renewalDeal(q: Q, org: Row, a: Row, defs: AccountField[], locale: Locale): Promise<Row | null> {
  const [type] = await q.query(`select * from record_types where org_id = $1 and kind = 'opportunity' and archived_at is null order by position, created_at limit 1`, [org.id]);
  if (!type) return null;
  const tf = (type.fields ?? []) as AccountField[];
  const opt = (key: string, want: string) => tf.find((f) => f.key === key)?.options?.some((o) => o.key === want);
  const [open] = await q.query(
    `select id, name, owner_id from records r where r.type_id = $1 and r.account_id = $2 and r.archived_at is null
        and ($3::boolean is false or r.fields->>'kind' = 'renewal') and coalesce(r.fields->>'status', 'open') not in ('won', 'lost')
      order by r.created_at desc limit 1`,
    [type.id, a.id, !!opt('kind', 'renewal')],
  );
  if (open) return open;
  const value = valueField(defs);
  const amount = value && typeof a.fields?.[value.key] === 'number' ? a.fields[value.key] : null;
  const firstStage = tf.find((f) => f.key === 'stage')?.options?.[0]?.key;
  const fields: Record<string, unknown> = {};
  if (tf.some((f) => f.key === 'amount') && amount !== null) fields.amount = amount;
  if (tf.some((f) => f.key === 'close_date')) fields.close_date = a.day;
  if (firstStage) fields.stage = firstStage;
  if (opt('status', 'open')) fields.status = 'open';
  if (opt('kind', 'renewal')) fields.kind = 'renewal';
  const name = words(locale, 'renewal.dealName', { account: a.name, year: a.day.slice(0, 4) }).slice(0, 300);
  const [r] = await q.query(
    `insert into records (org_id, type_id, account_id, name, owner_id, fields, currency) values ($1, $2, $3, $4, $5, $6, $7) returning id, name, owner_id`,
    [org.id, type.id, a.id, name, a.owner_id, JSON.stringify(fields), a.currency ?? null],
  );
  await audit(q, { orgId: org.id, actorId: null, action: 'record.created', entity: 'record', entityId: r.id, meta: { type: type.key, renewal: a.day } });
  await recomputeRollups(q, org.id, defs, [a.id]);
  await queueSync(q, org.id, 'record', [r.id], null, { created: true, typeKey: type.key });
  return r;
}
