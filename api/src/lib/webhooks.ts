// Sending webhooks: events are captured by database triggers (every path —
// screen, API, CRM sync, automations — the same way) and sent here, signed,
// with retries. A retry goes only to the hooks that have not answered yet; receivers should still use the event id
// to ignore repeats (a timeout after a receiver has acted is one).
import type { AccountsRow, ActivitiesRow, CommentsRow, OrgsRow, RecordTypesRow, WebhookEventsRow } from '../db/rows.gen';
import type { Deps } from '../context';
import { fetchOf, orgUrl, secretsKey } from '../context';
import type { Q, Row } from '../db';
import type { AccountField } from '../../../shared/src/model';
import { hmacHex, unseal } from './crypto';
import { toTask } from './mappers';
import { fail } from './errors';
import { privateHost } from '../connectors/messaging/webhook';
import { hiddenKeys, stripFields, type Viewer } from './fieldAccess';
import { audit } from './audit';
import { enqueue, kick } from './notify';

const BACKOFF_MIN = [1, 5, 30, 120, 360];
const MAX_ATTEMPTS = 6;
const DISABLE_AFTER = 50;

/** Only public https addresses: never this machine or a private network. */
export function checkWebhookUrl(raw: string) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return fail('bad_webhook_url');
  }
  // One rule with the chat connectors: no local or private address, no IP literal of IPv6 (::ffff:127.0.0.1 and the like).
  const privateAddress = privateHost(u!.hostname);
  if (u!.protocol !== 'https:' || privateAddress || u!.username || u!.password) fail('bad_webhook_url');
  return u!.toString();
}

async function payloadOf(q: Q, orgId: string, event: string, id: string): Promise<Record<string, unknown> | null> {
  const kind = event.split('.')[0];
  if (kind === 'task') {
    const [t] = await q.query(
      `select t.*, a.name as account_name, b.columns from tasks t join boards b on b.id = t.board_id left join accounts a on a.id = t.account_id
        where t.id = $1 and t.org_id = $2`,
      [id, orgId],
    );
    if (!t) return null;
    const done = (t.columns ?? []).some((c: Row) => c.key === t.status && c.done);
    return { ...toTask(t), done, archived: !!t.archived_at };
  }
  if (kind === 'account') {
    const [a] = await q.query<Pick<AccountsRow, 'id' | 'name' | 'owner_id' | 'team_id' | 'fields' | 'source' | 'external_id' | 'archived_at' | 'updated_at'>>('select id, name, owner_id, team_id, fields, source, external_id, archived_at, updated_at from accounts where id = $1 and org_id = $2', [id, orgId]);
    if (!a) return null;
    const fields = Object.fromEntries(Object.entries(a.fields ?? {}).filter(([k]) => !k.startsWith('_')));
    return { id: a.id, name: a.name, ownerId: a.owner_id, teamId: a.team_id, fields, archived: !!a.archived_at, updatedAt: a.updated_at };
  }
  if (kind === 'record') {
    const [r] = await q.query(
      `select r.id, r.name, r.account_id, r.parent_id, r.owner_id, r.fields, r.archived_at, r.updated_at, rt.key as type
         from records r join record_types rt on rt.id = r.type_id where r.id = $1 and r.org_id = $2`,
      [id, orgId],
    );
    if (!r) return null;
    return { id: r.id, type: r.type, name: r.name, accountId: r.account_id, parentId: r.parent_id, ownerId: r.owner_id, fields: r.fields, archived: !!r.archived_at, updatedAt: r.updated_at };
  }
  if (kind === 'activity') {
    const [x] = await q.query<ActivitiesRow>('select * from activities where id = $1 and org_id = $2', [id, orgId]);
    return x ? { id: x.id, accountId: x.account_id, authorId: x.author_id, kind: x.kind, body: x.body, happenedAt: x.happened_at, contactIds: x.contact_ids } : null;
  }
  const [cm] = await q.query<Pick<CommentsRow, 'id' | 'task_id' | 'author_id' | 'body' | 'created_at'>>('select id, task_id, author_id, body, created_at from comments where id = $1 and org_id = $2', [id, orgId]);
  return cm ? { id: cm.id, taskId: cm.task_id, authorId: cm.author_id, body: cm.body, createdAt: cm.created_at } : null;
}

/** The field rules that apply to a customer or record payload, and the roles of the people who set up the webhooks. */
async function fieldRules(q: Q, orgId: string, data: Record<string, unknown> | null, hooks: Row[]) {
  const viewers = new Map<string, Viewer>();
  let defs: AccountField[] = [];
  if (!data || !('fields' in data)) return { defs, viewers };
  defs =
    'type' in data
      ? ((await q.query<Pick<RecordTypesRow, 'fields'>>('select fields from record_types where org_id = $1 and key = $2', [orgId, data.type]))[0]?.fields ?? [])
      : ((await q.query<Pick<OrgsRow, 'account_fields'>>('select account_fields from orgs where id = $1', [orgId]))[0]?.account_fields ?? []);
  const ids = hooks.map((h) => h.created_by).filter(Boolean);
  if (ids.length && defs.some((d) => d.access?.view?.length)) {
    const rows = await q.query(`select u.id, u.seat, r.key, r.perms from users u join roles r on r.id = u.role_id where u.org_id = $1 and u.id = any ($2::uuid[]) and u.status = 'active'`, [orgId, ids]);
    for (const r of rows) viewers.set(r.id, { roleKey: r.key, perms: r.perms ?? [], seat: r.seat });
  }
  return { defs, viewers };
}

/** The payload as `viewer` may see it; nobody known (the person left): only fields open to everyone. */
function forViewer(data: Record<string, unknown>, defs: AccountField[], viewer: Viewer | null): Record<string, unknown> {
  if (!('fields' in data) || !defs.some((d) => d.access?.view?.length)) return data;
  const hidden = viewer ? hiddenKeys(defs, viewer) : new Set(defs.filter((d) => d.access?.view?.length).map((d) => d.key));
  return { ...data, fields: stripFields((data.fields ?? {}) as Record<string, unknown>, hidden) };
}

/**
 * The signature header of an outgoing webhook: `t=<time>,v1=<HMAC of time.body>`, so receivers can check origin and age.
 */
export async function signBody(secret: string, body: string, at: number) {
  return `t=${at},v1=${await hmacHex(secret, `${at}.${body}`)}`;
}

/**
 * A second, shorter signature for tools that cannot recompute the first from the raw message (Make sees the
 * message already parsed): HMAC-SHA256 of the event's id alone, in hex. Anyone without the secret cannot
 * produce it for an event that never happened, which is what such a tool needs to tell Curahold's messages
 * from a stranger's post to the same address.
 */
export async function eventSignature(secret: string, eventId: string) {
  return hmacHex(secret, eventId);
}

/** Send one event (or a test) to one webhook. Returns the HTTP status (0 = no answer). */
export async function postWebhook(deps: Deps, hook: Row, body: string, event: string): Promise<number> {
  const secret = await unseal<{ secret: string }>(hook.secret, secretsKey(deps.config));
  const at = Math.floor(Date.now() / 1000);
  let eventId = '';
  try {
    eventId = String(JSON.parse(body).id ?? '');
  } catch {
    // a test message without an id
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10_000);
  try {
    const res = await fetchOf(deps)(hook.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'Curahold-Webhooks/1', 'curahold-event': event, 'curahold-signature': await signBody(secret?.secret ?? '', body, at), ...(eventId ? { 'curahold-event-signature': await eventSignature(secret?.secret ?? '', eventId) } : {}) },
      body,
      signal: ctl.signal,
      redirect: 'manual',
    });
    return res.status;
  } catch {
    return 0;
  } finally {
    clearTimeout(timer);
  }
}

/** Switches off a hook whose creator is gone, once: audit line and a notification to those who manage connections. */
async function orphan(deps: Deps, orgId: string, h: Row): Promise<void> {
  const told = await deps.db.system(async (q) => {
    const off = await q.query(`update webhooks set active = false, last_at = now() where id = $1 and org_id = $2 and active returning id`, [h.id, orgId]);
    if (!off.length) return false;
    await audit(q, { orgId, actorId: null, action: 'webhook.orphaned', entity: 'webhook', entityId: h.id, meta: { url: h.url, createdBy: h.created_by ?? null } });
    const managers = await q.query<{ id: string }>(
      `select u.id from users u join roles r on r.id = u.role_id
        where u.org_id = $1 and u.status = 'active' and ('org.manage' = any (r.perms) or 'connections.manage' = any (r.perms))`,
      [orgId],
    );
    await enqueue(q, managers.map((m) => ({ orgId, userId: m.id, kind: 'webhook_orphaned', data: { url: String(h.url).slice(0, 200) } })));
    return managers.length > 0;
  });
  if (told) kick(deps);
}

/**
 * Sends up to `limit` queued outgoing webhooks (claimed so two workers never send one twice), each body read as the
 * person who set the hook up (their boards, departments and fields); returns how many were claimed.
 */
export async function deliverWebhooks(deps: Deps, limit = 50): Promise<number> {
  const claimed = await deps.db.system((q) =>
    q.query<WebhookEventsRow>(
      `update webhook_events set attempts = attempts + 1, next_at = now() + interval '10 minutes'
        where id in (select id from webhook_events where state = 'pending' and next_at <= now() order by created_at limit $1 for update skip locked)
        returning *`,
      [limit],
    ),
  );
  for (const e of claimed) {
    const { hooks, data, slug, defs, viewers, active } = await deps.db.system(async (q) => {
      // Only the hooks that do not have this event yet: a retry never sends it twice to one that answered (0247).
      const hooks = await q.query('select * from webhooks where org_id = $1 and active and $2 = any (events) and not (id = any ($3::uuid[]))', [e.org_id, e.event, e.sent_to ?? []]);
      const data = await payloadOf(q, e.org_id, e.event, e.entity_id);
      const ids = hooks.map((h) => h.created_by).filter(Boolean);
      const active = new Set(
        (ids.length ? await q.query<{ id: string }>(`select id from users where org_id = $1 and id = any ($2::uuid[]) and status = 'active'`, [e.org_id, ids]) : []).map((r) => r.id),
      );
      return { hooks, data, active, slug: (await q.query('select slug from orgs where id = $1', [e.org_id]))[0]?.slug, ...(await fieldRules(q, e.org_id, data, hooks)) };
    });
    if (!hooks.length || !data) {
      await deps.db.system((q) => q.query(`update webhook_events set state = 'sent' where id = $1`, [e.id]));
      continue;
    }
    let allOk = true;
    for (const h of hooks) {
      // A webhook carries only what the person who set it up may see (security audit M4): the row is read again as
      // them, under row security, so private boards and other departments' boards (ADR 0009) stay out. A hook whose
      // creator has left sends nothing. Either way the hook counts as done for this event, so it is not retried.
      if (!active.has(h.created_by)) {
        // The creator has left (review S6): the hook is switched off, the activity log says why, and the people who
        // manage connections are told, so a quiet integration does not look healthy for ever. Added again by someone else.
        await orphan(deps, e.org_id, h);
        await deps.db.system((q) => q.query('update webhook_events set sent_to = array_append(sent_to, $2::uuid) where id = $1 and org_id = $3', [e.id, h.id, e.org_id]));
        continue;
      }
      const seen = await deps.db.tenant({ orgId: e.org_id, userId: h.created_by }, (q) => payloadOf(q, e.org_id, e.event, e.entity_id));
      if (!seen) {
        await deps.db.system((q) => q.query('update webhook_events set sent_to = array_append(sent_to, $2::uuid) where id = $1 and org_id = $3', [e.id, h.id, e.org_id]));
        continue;
      }
      // Fields hidden from their role stay out too.
      const body = JSON.stringify({ id: e.id, event: e.event, occurredAt: e.created_at, company: slug, url: orgUrl(deps.config, slug), data: forViewer(seen, defs, viewers.get(h.created_by) ?? null) });
      const status = await postWebhook(deps, h, body, e.event);
      const ok = status >= 200 && status < 300;
      // 410 Gone: the receiver says the subscription no longer exists (Zapier's and Make's answer for a deleted Zap or
      // scenario that did not unsubscribe). Turn the hook off at once instead of retrying it 50 times.
      const gone = status === 410;
      allOk &&= ok || gone;
      await deps.db.system(async (q) => {
        await q.query(
          `update webhooks set last_status = $2, last_at = now(), failures = case when $3 then 0 else failures + 1 end,
                  active = case when $5 or (not $3 and failures + 1 >= $4) then false else active end where id = $1 and org_id = $6`,
          [h.id, status, ok, DISABLE_AFTER, gone, e.org_id],
        );
        if (ok || gone) await q.query('update webhook_events set sent_to = array_append(sent_to, $2::uuid) where id = $1 and org_id = $3', [e.id, h.id, e.org_id]);
      });
    }
    await deps.db.system((q) =>
      allOk
        ? q.query(`update webhook_events set state = 'sent' where id = $1`, [e.id])
        : q.query(
            `update webhook_events set state = case when attempts >= $2 then 'failed' else 'pending' end,
                    next_at = now() + make_interval(mins => $3) where id = $1`,
            [e.id, MAX_ATTEMPTS, BACKOFF_MIN[Math.min(e.attempts - 1, BACKOFF_MIN.length - 1)]],
          ),
    );
  }
  return claimed.length;
}
