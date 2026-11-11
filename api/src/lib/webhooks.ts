// Sending webhooks: events are captured by database triggers (every path —
// screen, API, CRM sync, automations — the same way) and sent here, signed,
// with retries. Receivers should use the event id to ignore repeats.
import type { Deps } from '../context';
import { fetchOf, orgUrl, secretsKey } from '../context';
import type { Q, Row } from '../db';
import { hmacHex, unseal } from './crypto';
import { toTask } from './mappers';
import { fail } from './errors';

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
  const h = u!.hostname.toLowerCase();
  const privateHost =
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h.endsWith('.internal') ||
    h.endsWith('.local') ||
    /^\[?(::1|f[cd][0-9a-f]{2}:|fe80:)/.test(h) ||
    /^(0|10|127)\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h);
  if (u!.protocol !== 'https:' || privateHost || u!.username || u!.password) fail('bad_webhook_url');
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
    const [a] = await q.query('select id, name, owner_id, team_id, fields, source, external_id, archived_at, updated_at from accounts where id = $1 and org_id = $2', [id, orgId]);
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
  const [cm] = await q.query('select id, task_id, author_id, body, created_at from comments where id = $1 and org_id = $2', [id, orgId]);
  return cm ? { id: cm.id, taskId: cm.task_id, authorId: cm.author_id, body: cm.body, createdAt: cm.created_at } : null;
}

export async function signBody(secret: string, body: string, at: number) {
  return `t=${at},v1=${await hmacHex(secret, `${at}.${body}`)}`;
}

/** Send one event (or a test) to one webhook. Returns the HTTP status (0 = no answer). */
export async function postWebhook(deps: Deps, hook: Row, body: string, event: string): Promise<number> {
  const secret = await unseal<{ secret: string }>(hook.secret, secretsKey(deps.config));
  const at = Math.floor(Date.now() / 1000);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10_000);
  try {
    const res = await fetchOf(deps)(hook.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'Tendwell-Webhooks/1', 'tendwell-event': event, 'tendwell-signature': await signBody(secret?.secret ?? '', body, at) },
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

export async function deliverWebhooks(deps: Deps, limit = 50): Promise<number> {
  const claimed = await deps.db.system((q) =>
    q.query(
      `update webhook_events set attempts = attempts + 1, next_at = now() + interval '10 minutes'
        where id in (select id from webhook_events where state = 'pending' and next_at <= now() order by created_at limit $1 for update skip locked)
        returning *`,
      [limit],
    ),
  );
  for (const e of claimed) {
    const { hooks, data, slug } = await deps.db.system(async (q) => ({
      hooks: await q.query('select * from webhooks where org_id = $1 and active and $2 = any (events)', [e.org_id, e.event]),
      data: await payloadOf(q, e.org_id, e.event, e.entity_id),
      slug: (await q.query('select slug from orgs where id = $1', [e.org_id]))[0]?.slug,
    }));
    if (!hooks.length || !data) {
      await deps.db.system((q) => q.query(`update webhook_events set state = 'sent' where id = $1`, [e.id]));
      continue;
    }
    const body = JSON.stringify({ id: e.id, event: e.event, occurredAt: e.created_at, company: slug, url: orgUrl(deps.config, slug), data });
    let allOk = true;
    for (const h of hooks) {
      const status = await postWebhook(deps, h, body, e.event);
      const ok = status >= 200 && status < 300;
      allOk &&= ok;
      await deps.db.system((q) =>
        q.query(
          `update webhooks set last_status = $2, last_at = now(), failures = case when $3 then 0 else failures + 1 end,
                  active = case when not $3 and failures + 1 >= $4 then false else active end where id = $1`,
          [h.id, status, ok, DISABLE_AFTER],
        ),
      );
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
