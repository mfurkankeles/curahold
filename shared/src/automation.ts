// Automations are plain data: "When <trigger> (and <conditions>), then <action>."
// The same shapes are edited in the admin screens, stored as JSON and run by
// the API's engine (api/src/lib/automations.ts).
import type { Localized } from './model';

export type Trigger =
  /** A date field on the account (e.g. renewal) is N days away. */
  | { type: 'account_date'; field: string; daysBefore: number }
  /** Every N days for each account, counted from when it was added. */
  | { type: 'account_every'; days: number }
  /** No task created, updated or finished for the account in N days. */
  | { type: 'account_inactive'; days: number }
  /** An account is added by hand (imports never fire this). */
  | { type: 'account_created' }
  /** A task is N days past its due date and not finished. */
  | { type: 'task_overdue'; days: number }
  /** A task moves into a column (on one board, or any board with that column). */
  | { type: 'task_moved'; boardId: string | null; column: string }
  /** A task is added (on one board, or any board). Tasks made by other rules never fire it. */
  | { type: 'task_created'; boardId: string | null }
  /** A task is finished (moved into a done column). */
  | { type: 'task_done'; boardId: string | null }
  /** A request arrives through a board's form (a person's, another department's, or the customer portal's). */
  | { type: 'form_received'; boardId: string | null }
  /** A record's choice field takes a value: a deal's status becomes "won", its stage "proposal"… */
  | { type: 'record_stage'; typeKey: string | null; field: string; value: string }
  /** A support ticket is opened (by hand or from a support tool). */
  | { type: 'ticket_opened' };

export type TriggerType = Trigger['type'];
export const TRIGGER_TYPES: TriggerType[] = [
  'account_date',
  'account_every',
  'account_inactive',
  'account_created',
  'task_overdue',
  'task_moved',
  'task_created',
  'task_done',
  'form_received',
  'record_stage',
  'ticket_opened',
];
export const ACCOUNT_TRIGGERS: TriggerType[] = ['account_date', 'account_every', 'account_inactive', 'account_created'];
/** Triggers that hand a task to the action (assign, move, comment act on it). */
export const TASK_TRIGGERS: TriggerType[] = ['task_overdue', 'task_moved', 'task_created', 'task_done', 'form_received'];
/** Triggers that hand a record (a deal, a ticket) to the action. */
export const RECORD_TRIGGERS: TriggerType[] = ['record_stage', 'ticket_opened'];
/** Triggers that fire the moment something happens, not on the hourly round. */
export const EVENT_TRIGGERS: TriggerType[] = ['account_created', 'task_moved', 'task_created', 'task_done', 'form_received', 'record_stage', 'ticket_opened'];

export type ConditionOp = 'eq' | 'neq' | 'gt' | 'lt' | 'empty' | 'not_empty';
/** Only for accounts where … (all conditions must hold). `field` is an account field key or "owner". */
export interface Condition {
  field: string;
  op: ConditionOp;
  value?: string | number | null;
}

/** Who a task goes to or who is told. `user:<id>` is a specific person. */
export type Assignee = 'account_owner' | 'assignees' | 'none' | `user:${string}`;
export type Recipient = 'account_owner' | 'assignees' | 'team_lead' | 'admins' | `user:${string}`;

export interface TaskBlueprint {
  /** May contain {account_name}. */
  title: string;
  dueInDays: number;
  assignee: Assignee;
  subtasks?: string[];
}

export type Action =
  | { type: 'create_tasks'; boardId: string; column?: string | null; tasks: TaskBlueprint[] }
  | { type: 'notify'; to: Recipient[]; message: string }
  /** Gives the task (or the record, for record triggers) to someone. */
  | { type: 'assign'; to: Assignee }
  /** Moves the task into a column of its own board. */
  | { type: 'move'; column: string }
  /** Sets a field: the task's own field, the customer's, or the record's. */
  | { type: 'set_field'; target: 'task' | 'account' | 'record'; field: string; value: string | number | null }
  /** Writes a comment on the task (or the record), signed by the rule. May contain {account_name}. */
  | { type: 'comment'; body: string }
  /** Sends the task or record to the company's webhooks that listen for "automation". */
  | { type: 'webhook' }
  /** Prepares the hand-over card for the next team (a won deal). */
  | { type: 'handover' };

export type ActionType = Action['type'];
export const ACTION_TYPES: ActionType[] = ['create_tasks', 'notify', 'assign', 'move', 'set_field', 'comment', 'webhook', 'handover'];
/** Actions that need a task or record from the trigger to act on. */
export const ACTIONS_ON_ITEM: ActionType[] = ['assign', 'move', 'set_field', 'comment', 'webhook', 'handover'];

/** Which actions make sense after a trigger: moving needs a task; a hand-over needs a deal. */
export function actionsFor(trigger: TriggerType): ActionType[] {
  const onTask = TASK_TRIGGERS.includes(trigger);
  const onRecord = RECORD_TRIGGERS.includes(trigger);
  return ACTION_TYPES.filter((a) => {
    if (a === 'move') return onTask;
    if (a === 'handover') return trigger === 'record_stage' || trigger === 'task_moved' || trigger === 'task_done';
    if (a === 'assign' || a === 'comment' || a === 'webhook') return onTask || onRecord;
    if (a === 'set_field') return true;
    return true;
  });
}

export interface Automation {
  id: string;
  name: string;
  enabled: boolean;
  trigger: Trigger;
  conditions: Condition[];
  action: Action;
  preset: string | null;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  runs30d: number;
}

export interface AutomationRun {
  key: string;
  at: string;
  result: { tasks?: string[]; notified?: number; account?: string; task?: string; error?: string };
}

/** Template form, before boards exist: board refers to a template board key. */
export interface AutomationPreset {
  key: string;
  name: Localized;
  trigger: Trigger;
  conditions?: Condition[];
  action:
    | { type: 'create_tasks'; board: string; tasks: { title: Localized; dueInDays: number; assignee: Assignee; subtasks?: Localized[] }[] }
    | { type: 'notify'; to: Recipient[]; message: Localized };
}

/** An automation's task title with `{account_name}` filled in, capped at 300 characters. */
export function fillTitle(title: string, vars: { account_name?: string | null }) {
  return title.replace(/\{account_name\}/g, vars.account_name ?? '—').slice(0, 300);
}
