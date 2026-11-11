// The messaging layer. Notifications and automations only say "tell this
// person" or "post to this channel"; an adapter turns that into a Slack,
// Teams, Google Chat or webhook call. Adding a service means adding an
// adapter here — nothing else in the product changes.
import type { Deps } from '../../context';

export interface ChatMessage {
  title: string;
  body?: string;
  fields?: { label: string; value: string }[];
  url?: string;
  openLabel: string;
  /** Buttons that act on a task straight from the chat (two-way services only). */
  actions?: { kind: 'done' | 'snooze'; label: string; taskId: string }[];
  /** Status line shown after someone used a button ("Marked done by Ada"). */
  note?: string;
}

export type ChatTarget =
  | { kind: 'user'; externalId: string; data: Record<string, any> }
  | { kind: 'channel'; channel: string | null };

export interface LoadedConnection {
  id: string;
  orgId: string;
  kind: string;
  provider: string;
  label: string;
  externalId: string | null;
  config: Record<string, any>;
  secret: Record<string, any> | null;
}

export interface DirectoryPerson {
  externalId: string;
  email: string;
  name: string;
}

export interface Directory {
  people: DirectoryPerson[];
  groups: { name: string; memberIds: string[] }[];
}

export interface MessagingAdapter {
  provider: string;
  twoWay: boolean;
  send(deps: Deps, conn: LoadedConnection, target: ChatTarget, msg: ChatMessage): Promise<void>;
  /** Find the service's own id for a person by email (only where the service allows it). */
  lookupUser?(deps: Deps, conn: LoadedConnection, email: string): Promise<{ externalId: string; data?: Record<string, any> } | null>;
  /** People (and groups) in the workspace, to suggest who to invite. */
  directory?(deps: Deps, conn: LoadedConnection): Promise<Directory>;
  channels?(deps: Deps, conn: LoadedConnection): Promise<{ id: string; name: string }[]>;
}

/** An error the service gave that will not go away by retrying (revoked token, removed app). */
export class FatalChatError extends Error {}

export function plainText(msg: ChatMessage): string {
  const lines = [msg.title];
  if (msg.body) lines.push(msg.body);
  for (const f of msg.fields ?? []) lines.push(`${f.label}: ${f.value}`);
  if (msg.note) lines.push(msg.note);
  if (msg.url) lines.push(msg.url);
  return lines.join('\n');
}

export async function readJson(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
