// What happened with a customer, newest first: notes, calls, meetings,
// emails and business reviews people logged, plus what Curahold saw happen
// around them.
export const ACTIVITY_KINDS = ['note', 'call', 'meeting', 'email', 'review'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export interface Activity {
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

/** The kinds of activity that are a conversation with the customer: they make up its meetings. */
export const MEETING_KINDS = ['meeting', 'review', 'call'] as const;
export type MeetingKind = (typeof MEETING_KINDS)[number];
export const isMeetingKind = (k: string): k is MeetingKind => (MEETING_KINDS as readonly string[]).includes(k);

/** A next step agreed in a meeting: a task that remembers the meeting. */
export interface NextStep {
  id: string;
  title: string;
  boardId: string;
  assigneeIds: string[];
  dueDate: string | null;
  done: boolean;
}

/** A meeting as the customer page shows it: the activity and its next steps. */
export interface Meeting extends Activity {
  kind: MeetingKind;
  nextSteps: NextStep[];
}

/** A page of a customer's meetings, newest first. */
export interface MeetingsPage {
  meetings: Meeting[];
  /** Pass as `before` to get older ones; null when there are none. */
  next: string | null;
  /** How many there are of each kind, for the filter. */
  counts: Record<MeetingKind, number>;
}

export type TimelineItem =
  | { type: 'activity'; at: string; activity: Activity }
  | { type: 'task_created' | 'task_done'; at: string; taskId: string; title: string; boardId: string; byId: string | null }
  | { type: 'comment'; at: string; id: string; taskId: string; title: string; boardId: string; byId: string | null; body: string }
  | { type: 'contact'; at: string; recordId: string; name: string; byId: string | null }
  | { type: 'score'; at: string; from: number; to: number }
  | { type: 'ticket_opened' | 'ticket_solved'; at: string; recordId: string; title: string; priority: string | null; url: string | null };

export interface Timeline {
  items: TimelineItem[];
  pinned: Activity[];
  /** Pass as `before` to get older items; null when there are none. */
  next: string | null;
}
