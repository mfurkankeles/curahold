// What happened with a customer, newest first: notes, calls, meetings and
// emails people logged, plus what Tendwell saw happen around them.
export const ACTIVITY_KINDS = ['note', 'call', 'meeting', 'email'] as const;
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
