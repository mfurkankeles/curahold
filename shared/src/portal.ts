// The customer portal: what a company opens to its customers' people.
export const PORTAL_FIELDS = ['due', 'priority', 'assignee'] as const;
export type PortalField = (typeof PORTAL_FIELDS)[number];

/** A board's portal settings. Customers see only what is listed here. */
export interface BoardPortal {
  enabled: boolean;
  /** The column new requests land in. */
  intake: string;
  /** What the customer reads for each column (the internal name otherwise). */
  labels: Record<string, string>;
  fields: PortalField[];
}

export interface PortalPerson {
  id: string;
  accountId: string;
  accountName: string | null;
  email: string;
  name: string;
  status: 'invited' | 'active' | 'disabled';
  createdAt: string;
  lastSeenAt: string | null;
}

export interface PortalSettings {
  /** False when this installation has no portal address. */
  available: boolean;
  enabled: boolean;
  address: string | null;
  boards: { id: string; name: string }[];
}

// What the portal app reads (from /papi).
export interface PortalColumn {
  key: string;
  name: string;
  done: boolean;
}
export interface PortalBoard {
  id: string;
  name: string;
  columns: PortalColumn[];
  fields: PortalField[];
}
export interface PortalMe {
  user: { id: string; name: string; email: string; locale: 'tr' | 'en' | null };
  account: { id: string; name: string };
  boards: PortalBoard[];
}
export interface PortalTask {
  id: string;
  boardId: string;
  title: string;
  description: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  mine: boolean;
  openedBy: string | null;
  dueDate?: string | null;
  priority?: string | null;
  assignees?: string[] | null;
  replies: number;
}
export interface PortalComment {
  id: string;
  body: string;
  createdAt: string;
  fromCustomer: boolean;
  mine: boolean;
  author: string | null;
}
export interface PortalTaskDetail extends PortalTask {
  board: PortalBoard;
  comments: PortalComment[];
}
export interface PortalOrg {
  name: string;
  locale: 'tr' | 'en';
  logoUrl: string | null;
}
