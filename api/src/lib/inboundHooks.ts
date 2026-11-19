// Incoming webhooks, the receiving side (the screens are routes/inboundHooks.ts, the model shared/src/inboundHooks.ts).
//
// A delivery is checked before anything is read from it:
//   curahold  X-Curahold-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>; t within 5 minutes.
//   hmac      the sender's own signature header: HMAC-SHA256 or HMAC-SHA1 of the raw body, hex or base64, with an
//             optional prefix ("sha256="), keyed with the secret Curahold gave or the one the sender generated.
//   token     a shared token in a header, in ?token=, or in a body field (for senders that do not sign).
// Then the replay guard: the delivery's event id (X-Curahold-Event-Id, or the hook's event-id template) is taken
// once; a repeat is answered 200 and logged as skipped. A timestamp older than the hook's window is refused.
//
// The hook acts with the rights of the person who set it up (like an API key): its writes go through row-level
// security as that person, so it can only reach boards and customers they can, and it stops if they leave.
import { HOOK_TARGETS, render, type HookAuth, type HookMapping, type HookTarget } from '../../../shared/src/inboundHooks';
import { ticketPriorityOf } from '../../../shared/src/records';
import type { AccountField, Column } from '../../../shared/src/model';
import { secretsKey, type Deps } from '../context';
import type { Q, Row } from '../db';
import { hmacHex, safeEqual, unseal } from './crypto';
import { onTaskCreated, onTaskUpdated } from './taskEvents';
import { upsertTicket } from '../routes/tickets';

export const MAX_HOOK_BODY = 1_000_000;
const WINDOW_SEC = 300;
const KEEP_DAYS = 30;
const KEEP_PER_HOOK = 500;

/** The secret Curahold gives for a hook: derived from the server's key, never stored. */
export async function hookSecretOf(deps: Deps, orgId: string, hookId: string, salt: string): Promise<string> {
  return `whsec_${(await hmacHex(secretsKey(deps.config), `inhook:${orgId}:${hookId}:${salt}`)).slice(0, 40)}`;
}

/** What a sender (or the test screen) puts in X-Curahold-Signature. */
export async function curaholdSignature(secret: string, seconds: number, raw: string): Promise<string> {
  return `t=${seconds},v1=${await hmacHex(secret, `${seconds}.${raw}`)}`;
}

async function mac(algo: 'sha256' | 'sha1', secret: string, raw: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: algo === 'sha1' ? 'SHA-1' : 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
}
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));

export interface Incoming {
  raw: string;
  headers: (name: string) => string | undefined;
  query: (name: string) => string | undefined;
  now: Date;
}

/** Checks who sent it and when. Returns the event id to take, or why it is refused. */
export async function checkDelivery(auth: HookAuth, secret: string, inc: Incoming, payload: unknown): Promise<{ ok: true; eventId: string | null } | { ok: false; reason: string }> {
  if (!secret) return { ok: false, reason: 'no_secret' };
  const nowSec = Math.floor(inc.now.getTime() / 1000);
  if (auth.scheme === 'curahold') {
    const h = inc.headers('x-curahold-signature') ?? '';
    const t = Number(/(?:^|,)\s*t=(\d+)/.exec(h)?.[1]);
    const v1 = /(?:^|,)\s*v1=([0-9a-f]{64})/i.exec(h)?.[1] ?? '';
    if (!t || !v1) return { ok: false, reason: 'bad_signature' };
    if (Math.abs(nowSec - t) > (auth.maxAgeSec ?? WINDOW_SEC)) return { ok: false, reason: 'too_old' };
    if (!safeEqual(v1.toLowerCase(), await hmacHex(secret, `${t}.${inc.raw}`))) return { ok: false, reason: 'bad_signature' };
    // Without an id of its own, the signature (unique per body and second) is the replay key.
    return { ok: true, eventId: (inc.headers('x-curahold-event-id') ?? '').slice(0, 200) || render(auth.eventId, payload).slice(0, 200) || `sig:${v1.slice(0, 32)}` };
  }
  if (auth.scheme === 'hmac') {
    const raw = (inc.headers(auth.header ?? 'x-signature') ?? '').trim();
    const got = auth.prefix && raw.startsWith(auth.prefix) ? raw.slice(auth.prefix.length) : raw;
    const want = await mac(auth.algo ?? 'sha256', secret, inc.raw);
    const ok = auth.encoding === 'base64' ? safeEqual(got, b64(want)) : safeEqual(got.toLowerCase(), hex(want));
    if (!got || !ok) return { ok: false, reason: 'bad_signature' };
  } else {
    const field = auth.field ? render(`{{${auth.field}}}`, payload) : '';
    const got = (auth.header ? inc.headers(auth.header) : undefined) ?? inc.query('token') ?? field;
    if (!got || !safeEqual(got, secret)) return { ok: false, reason: 'bad_token' };
  }
  if (auth.timestamp) {
    const v = render(auth.timestamp, payload);
    const ms = /^\d{9,10}$/.test(v) ? Number(v) * 1000 : /^\d{12,13}$/.test(v) ? Number(v) : Date.parse(v);
    if (Number.isFinite(ms) && Math.abs(inc.now.getTime() - ms) > (auth.maxAgeSec ?? 86_400) * 1000) return { ok: false, reason: 'too_old' };
  }
  return { ok: true, eventId: render(auth.eventId, payload).slice(0, 200) || null };
}

// ------------------------------------------------------------------ writing

export interface Outcome {
  status: 'ok' | 'skipped' | 'failed';
  error?: string;
  result?: { kind: HookTarget; id: string; action: 'created' | 'updated' };
}

const hostOf = (v: string) => v.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/:?#].*$/, '');
const PUBLIC_MAIL = /^(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|aol|proton|protonmail|yandex|mail|gmx)\./;
const DONE_WORDS = 'done,completed,complete,closed,resolved,finished,signed';
const day = (v: string) => {
  const t = /^\d{9,10}$/.test(v) ? Number(v) * 1000 : Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
};
const when = (v: string) => {
  const t = /^\d{9,10}$/.test(v) ? Number(v) * 1000 : Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

/** The customer a delivery is about: by id, a contact's email, a web address (or the email's domain), then the name. */
async function customerOf(q: Q, orgId: string, m: HookMapping, payload: unknown): Promise<string | null> {
  const id = render(m.customer?.id, payload);
  if (/^[0-9a-f-]{36}$/i.test(id)) {
    const [hit] = await q.query('select id from accounts where id = $1 and archived_at is null', [id]);
    if (hit) return hit.id;
  }
  const email = render(m.customer?.email, payload).toLowerCase();
  if (email.includes('@')) {
    const [contact] = await q.query(
      `select r.account_id from records r join record_types rt on rt.id = r.type_id
        where rt.kind = 'contact' and r.archived_at is null and r.account_id is not null and lower(r.fields->>'email') = $1 order by r.created_at limit 1`,
      [email],
    );
    if (contact?.account_id) return contact.account_id;
  }
  const domains = [render(m.customer?.domain, payload), email.includes('@') ? email.split('@')[1] : ''].map(hostOf).filter((d) => d && d.includes('.') && !PUBLIC_MAIL.test(d));
  if (domains.length) {
    const [org] = await q.query('select account_fields from orgs where id = $1', [orgId]);
    const urlKeys = ((org?.account_fields ?? []) as AccountField[]).filter((f) => f.type === 'url').map((f) => f.key);
    if (urlKeys.length) {
      const [hit] = await q.query(
        `select a.id from accounts a where a.archived_at is null and exists (select 1 from jsonb_each_text(a.fields) f where f.key = any ($1::text[])
           and lower(regexp_replace(regexp_replace(f.value, '^https?://(www\\.)?', '', 'i'), '[/:?#].*$', '')) = any ($2::text[])) order by a.created_at limit 1`,
        [urlKeys, domains],
      );
      if (hit) return hit.id;
    }
  }
  const name = render(m.customer?.name, payload);
  if (name) {
    const [hit] = await q.query('select id from accounts where archived_at is null and name_fold = fold_text($1) order by created_at limit 1', [name]);
    if (hit) return hit.id;
  }
  return null;
}

export async function linkOf(q: Q, hookId: string, externalId: string): Promise<string | null> {
  if (!externalId) return null;
  const [l] = await q.query<{ target_id: string }>('select target_id from inbound_links where hook_id = $1 and external_id = $2', [hookId, externalId]);
  return l?.target_id ?? null;
}

/**
 * One delivery made into what the hook says. `q` runs as the hook's owner (row-level security applies). The two writes
 * the request role may not make (the link table, a deal note's update) are queued in `later` and run with owner access,
 * anchored to the company, once the owner's transaction is done. `existing` is what an earlier delivery of the same item
 * made (read beforehand with owner access).
 */
export async function applyHook(
  q: Q,
  later: ((sys: Q) => Promise<unknown>)[],
  orgId: string,
  actorId: string,
  hook: { id: string; target: HookTarget; mapping: HookMapping },
  payload: unknown,
  today: string,
  existing: string | null,
): Promise<Outcome> {
  const m = hook.mapping ?? {};
  if (m.when?.value) {
    const v = render(m.when.value, payload).toLowerCase();
    const allowed = String(m.when.equals ?? '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
    if (!allowed.includes(v)) return { status: 'skipped', error: `not used: ${v || '(empty)'}` };
  }
  if (!HOOK_TARGETS.includes(hook.target)) return { status: 'failed', error: 'unknown target' };
  const externalId = render(m.externalId, payload).slice(0, 200);
  const remember = async (target: string) => {
    if (externalId && !existing) later.push((s) => s.query(`insert into inbound_links (org_id, hook_id, external_id, kind, target_id) values ($1, $2, $3, $4, $5) on conflict do nothing`, [orgId, hook.id, externalId, hook.target, target]));
  };
  const account = await customerOf(q, orgId, m, payload);

  if (hook.target === 'task') {
    const [board] = await q.query('select * from boards where id = $1 and archived_at is null', [m.boardId ?? '00000000-0000-0000-0000-000000000000']);
    if (!board) return { status: 'failed', error: 'board: choose a board the hook can reach' };
    const cols = board.columns as Column[];
    const title = render(m.title, payload).replace(/\s+/g, ' ').slice(0, 300);
    const finished = (m.doneWords || DONE_WORDS).toLowerCase().split(',').map((s) => s.trim()).includes(render(m.status, payload).toLowerCase());
    const status = (finished ? cols.find((c) => c.done) : cols[0])?.key ?? cols[0].key;
    const due = day(render(m.due, payload));
    const assigneeEmail = render(m.assigneeEmail, payload).toLowerCase();
    const [assignee] = assigneeEmail ? await q.query(`select id from users where email = $1 and status = 'active'`, [assigneeEmail]) : [];
    if (existing) {
      const [before] = await q.query('select * from tasks where id = $1', [existing]);
      if (before) {
        const [after] = await q.query(
          `update tasks set title = coalesce(nullif($2, ''), title), description = case when $3 = '' then description else $3 end, due_date = coalesce($4::date, due_date),
                  status = case when $5::boolean then $6 else status end, updated_by = $7, updated_at = now(), version = version + 1 where id = $1 returning *`,
          [existing, title, render(m.description, payload).slice(0, 20000), due, finished || !!render(m.status, payload), status, actorId],
        );
        if (after) {
          await onTaskUpdated(q, orgId, actorId, before, after, board);
          return { status: 'ok', result: { kind: 'task', id: existing, action: 'updated' } };
        }
      }
    }
    if (!title) return { status: 'failed', error: 'title: the template gave nothing' };
    const [{ p }] = await q.query('select coalesce(max(position), 0) + 1024 as p from tasks where board_id = $1 and status = $2', [board.id, status]);
    const [t] = await q.query(
      `insert into tasks (org_id, board_id, title, description, status, assignee_ids, account_id, due_date, position, created_by, updated_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10) returning *`,
      [orgId, board.id, title, render(m.description, payload).slice(0, 20000), status, assignee ? [assignee.id] : [], account, due, Number(p), actorId],
    );
    await onTaskCreated(q, orgId, actorId, t, board, { via: 'webhook' });
    await remember(t.id);
    return { status: 'ok', result: { kind: 'task', id: t.id, action: 'created' } };
  }

  if (hook.target === 'ticket') {
    const subject = render(m.subject, payload).slice(0, 300);
    if (!subject && !existing) return { status: 'failed', error: 'subject: the template gave nothing' };
    if (!account) return { status: 'failed', error: 'customer: no customer matches this delivery' };
    const requester = render(m.requester, payload).toLowerCase();
    const url = render(m.url, payload);
    const out = await upsertTicket(q, orgId, actorId, `hook-${hook.id.slice(0, 8)}`, (externalId || crypto.randomUUID()).replace(/[^A-Za-z0-9._:-]/g, '-').slice(0, 120), {
      subject: subject || '—',
      ...(render(m.status, payload) ? { status: render(m.status, payload) } : {}),
      ...(render(m.priority, payload) ? { priority: ticketPriorityOf(render(m.priority, payload)) } : {}),
      ...(requester.includes('@') ? { requester } : {}),
      ...(/^https:\/\//i.test(url) ? { url: url.slice(0, 500) } : {}),
      account: { id: account },
    } as any, today);
    await remember(out.id);
    return { status: 'ok', result: { kind: 'ticket', id: out.id, action: out.created ? 'created' : 'updated' } };
  }

  if (hook.target === 'activity') {
    if (!account) return { status: 'failed', error: 'customer: no customer matches this delivery' };
    const kind = ['note', 'call', 'meeting', 'email'].includes(String(m.kind)) ? String(m.kind) : 'note';
    const body = render(m.body, payload).slice(0, 20000);
    if (!body && kind !== 'call' && kind !== 'meeting') return { status: 'failed', error: 'body: the template gave nothing' };
    const seconds = Number(render(m.minutes, payload));
    // `minutes` holds minutes unless the sender counts in seconds (telephony does).
    const minutes = Number.isFinite(seconds) && seconds > 0 ? Math.min(1440, Math.max(1, Math.round(m.durationUnit === 'seconds' ? seconds / 60 : seconds))) : null;
    const source = `hook:${hook.id.slice(0, 8)}`;
    const ext = externalId || null;
    const rows = await q.query<{ id: string; created: boolean }>(
      `insert into activities (org_id, account_id, author_id, kind, title, minutes, body, happened_at, source, external_id)
       values ($1, $2, $3, $4, $5, $6, $7, coalesce($8::timestamptz, now()), $9, $10)
       on conflict (org_id, source, external_id) where external_id is not null do update set body = excluded.body, title = excluded.title, minutes = excluded.minutes, edited_at = now()
       returning id, (xmax = 0) as created`,
      [orgId, account, actorId, kind, render(m.title, payload).slice(0, 300), minutes, body, when(render(m.happenedAt, payload)), source, ext],
    );
    if (!rows[0]) return { status: 'failed', error: 'the entry could not be written' };
    await remember(rows[0].id);
    return { status: 'ok', result: { kind: 'activity', id: rows[0].id, action: rows[0].created ? 'created' : 'updated' } };
  }

  // A note on a deal: the opportunity found by its id in the CRM it came from, else by name under the customer.
  const body = render(m.body, payload).slice(0, 10000);
  if (!body) return { status: 'failed', error: 'body: the template gave nothing' };
  if (existing) {
    const [still] = await q.query('select id from record_comments where id = $1', [existing]);
    if (still) {
      later.push((s) => s.query('update record_comments set body = $3, edited_at = now() where id = $1 and org_id = $2', [existing, orgId, body]));
      return { status: 'ok', result: { kind: 'deal_note', id: existing, action: 'updated' } };
    }
  }
  const dealId = render(m.dealId, payload);
  const dealName = render(m.dealName, payload);
  let deal: Row | undefined;
  if (dealId) [deal] = await q.query(`select r.id from records r join record_types rt on rt.id = r.type_id where rt.kind = 'opportunity' and r.archived_at is null and (r.external_id = $1 or r.id::text = $1) limit 1`, [dealId]);
  if (!deal && dealName)
    [deal] = await q.query(
      `select r.id from records r join record_types rt on rt.id = r.type_id where rt.kind = 'opportunity' and r.archived_at is null and fold_text(r.name) = fold_text($1) and ($2::uuid is null or r.account_id = $2) order by r.updated_at desc limit 1`,
      [dealName, account],
    );
  if (!deal && account) [deal] = await q.query(`select r.id from records r join record_types rt on rt.id = r.type_id where rt.kind = 'opportunity' and r.archived_at is null and r.account_id = $1 order by r.updated_at desc limit 1`, [account]);
  if (!deal) return { status: 'failed', error: 'deal: no deal matches this delivery' };
  const [c] = await q.query('insert into record_comments (org_id, record_id, author_id, body) values ($1, $2, $3, $4) returning id', [orgId, deal.id, actorId, body]);
  await remember(c.id);
  return { status: 'ok', result: { kind: 'deal_note', id: c.id, action: 'created' } };
}

// ------------------------------------------------------------------ the whole delivery

export interface HookRow {
  id: string;
  org_id: string;
  target: HookTarget;
  auth: HookAuth;
  mapping: HookMapping;
  salt: string;
  sealed: string | null;
  enabled: boolean;
  created_by: string | null;
}

/** The secret a delivery must be checked with. */
export async function secretFor(deps: Deps, hook: HookRow): Promise<string> {
  if (hook.auth?.senderSecret) return (await unseal<{ secret?: string }>(hook.sealed, secretsKey(deps.config)))?.secret ?? '';
  return hookSecretOf(deps, hook.org_id, hook.id, hook.salt);
}

/**
 * Checks, applies and logs one delivery. Returns the HTTP status to answer and what happened. A refused delivery is
 * logged too (without its payload: it may not be the sender's), so the log shows a wrong secret at once.
 */
export async function receive(deps: Deps, hook: HookRow, inc: Incoming, today: string, opts: { test?: boolean } = {}): Promise<{ http: number; status: string; eventId: string | null; error?: string; result?: Outcome['result'] }> {
  const orgId = hook.org_id;
  const log = (status: string, eventId: string | null, error: string | null, result: unknown, payload: string | null) =>
    deps.db.system(async (q) => {
      const [row] = await q.query(
        `insert into inbound_deliveries (org_id, hook_id, event_id, status, test, error, result, payload) values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (hook_id, event_id) where event_id is not null and status in ('ok', 'skipped') do nothing returning id`,
        [orgId, hook.id, eventId, status, !!opts.test, error ? error.slice(0, 500) : null, result ? JSON.stringify(result) : null, payload ? payload.slice(0, 20000) : null],
      );
      await q.query('update inbound_hooks set last_delivery_at = now() where id = $1 and org_id = $2', [hook.id, orgId]);
      // Kept 30 days and 500 a hook: the log is for finding a problem, not an archive.
      await q.query(
        `delete from inbound_deliveries where org_id = $1 and hook_id = $2 and (received_at < now() - make_interval(days => $3)
            or id in (select id from inbound_deliveries where hook_id = $2 order by received_at desc offset $4))`,
        [orgId, hook.id, KEEP_DAYS, KEEP_PER_HOOK],
      );
      return !!row;
    });
  if (!hook.enabled) return { http: 404, status: 'rejected', eventId: null, error: 'paused' };
  let payload: unknown;
  try {
    payload = JSON.parse(inc.raw);
  } catch {
    // Form-encoded senders: their fields, as a flat object.
    payload = Object.fromEntries(new URLSearchParams(inc.raw));
    if (!inc.raw.includes('=')) {
      await log('rejected', null, 'not JSON', null, null);
      return { http: 400, status: 'rejected', eventId: null, error: 'not_json' };
    }
  }
  const check = opts.test ? ({ ok: true, eventId: null } as const) : await checkDelivery(hook.auth ?? { scheme: 'curahold' }, await secretFor(deps, hook), inc, payload);
  if (!check.ok) {
    await log('rejected', null, check.reason, null, null);
    return { http: 401, status: 'rejected', eventId: null, error: check.reason };
  }
  const eventId = check.eventId;
  if (eventId) {
    const [seen] = await deps.db.system((q) => q.query(`select 1 from inbound_deliveries where hook_id = $1 and event_id = $2 and status in ('ok', 'skipped')`, [hook.id, eventId]));
    if (seen) return { http: 200, status: 'duplicate', eventId };
  }
  if (!hook.created_by) {
    await log('failed', eventId, 'the person who set this hook up has left: set it up again', null, inc.raw);
    return { http: 200, status: 'failed', eventId, error: 'owner_gone' };
  }
  let out: Outcome;
  try {
    // One transaction at a time: the link is read first, the owner's writes go next, the queued owner-access writes last.
    const externalId = render(hook.mapping?.externalId, payload).slice(0, 200);
    const existing = externalId ? await deps.db.system((q) => linkOf(q, hook.id, externalId)) : null;
    const later: ((q: Q) => Promise<unknown>)[] = [];
    out = await deps.db.tenant({ orgId, userId: hook.created_by }, (q) => applyHook(q, later, orgId, hook.created_by!, hook, payload, today, existing));
    if (later.length) await deps.db.system(async (q) => {
      for (const fn of later) await fn(q);
    });
  } catch (e) {
    out = { status: 'failed', error: e instanceof Error ? e.message.slice(0, 300) : 'failed' };
  }
  const fresh = await log(out.status, eventId, out.error ?? null, out.result ?? null, inc.raw);
  if (!fresh && eventId) return { http: 200, status: 'duplicate', eventId };
  // A delivery that was understood but could not be used is answered 200: sending it again would not help, and
  // most senders switch a hook off after repeated errors. It waits in the log.
  return { http: 200, status: out.status, eventId, error: out.error, result: out.result };
}
