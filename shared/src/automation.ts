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
  | { type: 'task_moved'; boardId: string | null; column: string };

export type TriggerType = Trigger['type'];
export const TRIGGER_TYPES: TriggerType[] = [
  'account_date',
  'account_every',
  'account_inactive',
  'account_created',
  'task_overdue',
  'task_moved',
];
export const ACCOUNT_TRIGGERS: TriggerType[] = ['account_date', 'account_every', 'account_inactive', 'account_created'];

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
  | { type: 'notify'; to: Recipient[]; message: string };

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

export function fillTitle(title: string, vars: { account_name?: string | null }) {
  return title.replace(/\{account_name\}/g, vars.account_name ?? '—').slice(0, 300);
}
