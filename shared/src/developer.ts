// What the developer platform offers, shared by the API, the app and the docs.
export const WEBHOOK_EVENTS = ['task.created', 'task.updated', 'account.created', 'account.updated', 'record.created', 'record.updated', 'comment.created'] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export interface ApiKeyInfo {
  id: string;
  name: string;
  kind: 'key' | 'oauth';
  prefix: string;
  canWrite: boolean;
  userId: string;
  clientId: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

export interface WebhookInfo {
  id: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  failures: number;
  lastStatus: number | null;
  lastAt: string | null;
  createdAt: string;
}
