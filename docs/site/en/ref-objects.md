---
title: Reference: objects
section: reference
order: 40
summary: The shape of a customer, a task, a record and the rest, as the API answers.
---
# Reference: objects

These are the shapes the API answers with, taken from the types the server itself is built on. A `?` after a name means the field may be missing; `| null` means it can be empty. Dates are `YYYY-MM-DD`, moments are ISO 8601 in UTC, ids are UUIDs.

## Account

```ts
interface Account {
  id: string;
  name: string;
  ownerId: string | null;
  teamId: string | null;
  fields: Record<string, string | number | null>;
  source: string;
  externalId: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  openTasks?: number;
  lastActivityAt?: string | null;
  /** With ?signals=1: open work past its date, open work untouched for 14 days, the last touch. */
  overdueTasks?: number;
  stuckTasks?: number;
  lastTouchAt?: string | null;
  /** Days between business reviews for this customer; null follows the company's rhythm, 0 is none. */
  reviewDays?: number | null;
  lastReviewAt?: string | null;
  /** The currency of this customer's amounts; null is the company's. */
  currency?: string | null;
}
```

## AccountField

```ts
interface AccountField {
  key: string;
  label: Localized;
  type: FieldType;
  options?: FieldOption[];
  /** Filled in by Curahold from records; read-only for people. */
  rollup?: Rollup;
  /** The health score: worked out by Curahold (see health.ts); read-only for people. */
  health?: true;
  access?: FieldAccess;
  /** Set by the server for the person asking: they can see it but not change it. */
  locked?: boolean;
}
```

## Board

```ts
interface Board {
  id: string;
  name: string;
  visibility: Visibility;
  teamId: string | null;
  columns: Column[];
  memberIds: string[];
  createdBy: string | null;
  canManage: boolean;
  notify: BoardNotify[];
  /** Open to customers (the customer portal), or null. */
  portal: import('./portal').BoardPortal | null;
  /** The board's own task fields (type, outcome, link…). */
  taskFields: TaskField[];
  /** An intake form colleagues fill in to put a request on this board; null when off. */
  form: BoardForm | null;
  /** Finished tasks move to the board's archive after this many days; null keeps them on the board. */
  archiveDays: number | null;
  /** The board's product-management switch: true/false override, null (or absent) follows the PM stages. */
  pmEnabled?: boolean | null;
}
```

## Column

```ts
interface Column {
  key: string;
  name: string;
  done: boolean;
}
```

## Task

```ts
interface Task {
  id: string;
  boardId: string;
  parentId: string | null;
  title: string;
  description: string;
  status: string;
  assigneeIds: string[];
  accountId: string | null;
  accountName: string | null;
  dueDate: string | null;
  priority: Priority;
  position: number;
  version: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  subtaskCount?: number;
  subtaskDone?: number;
  commentCount?: number;
  repeat?: Repeat | null;
  /** Shared with the customer in the portal. */
  portalShared?: boolean;
  /** Opened by someone at the customer, in the portal. */
  portalAuthorId?: string | null;
  portalAuthorName?: string | null;
  /** The board's own fields, by key. */
  fields?: Record<string, TaskFieldValue>;
  startDate?: string | null;
  /** How many unfinished tasks this one waits for. */
  blockedBy?: number;
  /** Finished (given where a list mixes open and finished work, such as a record's tasks). */
  done?: boolean;
  /** The record it belongs to (an opportunity, a ticket…). */
  recordId?: string | null;
  recordName?: string | null;
  recordType?: string | null;
  issueType?: IssueType;
  storyPoints?: number | null;
  epicId?: string | null;
  sprintId?: string | null;
}
```

## TaskDetail

```ts
interface TaskDetail extends Task {
  /** For a subtask: the task it is a step of, so the way back is one click. */
  parent?: { id: string; title: string } | null;
  subtasks: Task[];
  comments: Comment[];
  files: FileMeta[];
  /** The person asking has stopped comment notices for this task. */
  muted?: boolean;
  events?: TaskEvent[];
  /** People following the task. */
  watchers?: string[];
  links?: TaskLink[];
  time?: { total: number; entries: TimeEntry[] };
}
```

## Comment

```ts
interface Comment {
  id: string;
  taskId: string;
  authorId: string | null;
  body: string;
  mentions: string[];
  createdAt: string;
  /** "customer": written for the customer (or by them) and shown in the portal. */
  visibility: 'internal' | 'customer';
  /** Written by someone at the customer, in the portal. */
  portalAuthorName?: string | null;
  /** Files and pictures that came with it. */
  files?: FileMeta[];
}
```

## FileMeta

```ts
interface FileMeta {
  id: string;
  taskId: string | null;
  recordId?: string | null;
  /** The comment it came with. */
  commentId?: string | null;
  name: string;
  size: number;
  mime: string;
  uploadedBy: string | null;
  createdAt: string;
}
```

## TimeEntry

```ts
interface TimeEntry {
  id: string;
  userId: string;
  minutes: number;
  day: string;
  note: string;
  createdAt: string;
}
```

## Person

```ts
interface Person {
  id: string;
  name: string;
  email: string;
  seat: Seat;
  status: UserStatus;
}
```

## TrashItem

```ts
interface TrashItem {
  id: string;
  kind: TrashKind;
  /** Its name or title when it was deleted. */
  label: string;
  /** How many things it holds: one as a rule; undoing an import puts many in at once. */
  count: number;
  /** The ids they had, and get again when put back (in a list, the first 100 when there are more). */
  ids: string[];
  /** Where it was: a task's board, the customer of a record or a timeline entry, a record's kind. */
  where: { boardId?: string; board?: string; accountId?: string; account?: string; type?: Localized; entry?: string; via?: 'import' };
  /** What went with it and comes back with it. */
  contents: { subtasks?: number; comments?: number; files?: number; records?: number; entries?: number; portalPeople?: number; timeEntries?: number; tasksLinked?: number };
  deletedBy: string | null;
  deletedAt: string;
  /** From this moment on it is gone for good. */
  purgeAt: string;
}
```

## TrashRestored

```ts
interface TrashRestored {
  kind: TrashKind;
  ids: string[];
  label: string;
  where: TrashItem['where'];
  /** It was already there (put back another way); nothing was changed. */
  already: boolean;
  /** Rows left out because what they belonged to has gone for good since, by table. */
  dropped: Record<string, number>;
  /** Links cleared because what they pointed at has gone since. */
  unlinked: { table: string; col: string; parent: string; n: number }[];
}
```

## CalendarItem

```ts
interface CalendarItem {
  /** Unique within an answer: the kind and the thing it is about. */
  id: string;
  kind: CalendarKind;
  /** The day, where the company is (YYYY-MM-DD). */
  date: string;
  /** The clock time for something that was held (HH:MM), else null. */
  time: string | null;
  title: string;
  /** Whose it is: assignees, the people who were there, the customer's owner. */
  personIds: string[];
  accountId?: string | null;
  accountName?: string | null;
  /** For a task: what opening it needs, and whether it is finished. */
  taskId?: string;
  boardId?: string;
  status?: string;
  done?: boolean;
  priority?: string | null;
  /** For something held: how long it took. */
  minutes?: number | null;
  /** For a planned meeting: the row to open, and which meeting kind it will be. */
  plannedId?: string;
  meetingKind?: string;
}
```

## CalendarReach

```ts
interface CalendarReach {
  can: boolean;
  /** Everyone in the company (an administrator), not only teammates. */
  everyone: boolean;
  teams: { id: string; name: string; memberIds: string[] }[];
  personIds: string[];
}
```

## ApiError

```ts
interface ApiError {
  error: string;
  message: string;
  fields?: string[];
  current?: unknown;
}
```

## RecordType

```ts
interface RecordType {
  id: string;
  key: string;
  name: { one: Localized; other: Localized };
  kind: RecordKind;
  fields: AccountField[];
  position: number;
  archivedAt: string | null;
  /** Records of this type that are not archived. */
  count?: number;
  /** The columns its table shows, as the company chose them; null is Curahold's choice. */
  columns?: string[] | null;
}
```

## AppRecord

```ts
interface AppRecord {
  id: string;
  typeId: string;
  accountId: string | null;
  /** Who this one reports to (another record of the same kind and account) — the org chart. */
  parentId: string | null;
  accountName?: string | null;
  name: string;
  ownerId: string | null;
  fields: Record<string, string | number | null>;
  source: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  links?: LinkInfo[];
  /** The currency of its amounts; null is the company's. */
  currency?: string | null;
  createdBy?: string | null;
}
```

## RecordDetail

```ts
interface RecordDetail extends AppRecord {
  comments: RecordComment[];
  files: import('./model').FileMeta[];
  tasks: import('./model').Task[];
}
```

## Activity

```ts
interface Activity {
  id: string;
  accountId: string;
  authorId: string | null;
  kind: ActivityKind;
  body: string;
  happenedAt: string;
  contactIds: string[];
  pinned: boolean;
  source: string;
  createdAt: string;
  editedAt: string | null;
  /** Meetings, reviews and calls: a title ("Quarterly review"), empty otherwise. */
  title: string;
  /** How long it took, in minutes (meetings and calls). */
  minutes: number | null;
  /** Our people who were there (the customer's people are contactIds). */
  userIds: string[];
}
```

## Meeting

```ts
interface Meeting extends Activity {
  kind: MeetingKind;
  nextSteps: NextStep[];
}
```
