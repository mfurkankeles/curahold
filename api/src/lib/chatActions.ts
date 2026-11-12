// What a button or command in a chat app does. Each runs as the person who
// pressed it — inside db.tenant() with their user id — so row-level security
// applies exactly as in the web app: no board they cannot see, no writes
// from a viewer seat.
import type { Column } from '../../../shared/src/model';
import { nowOf, orgUrl, type Deps } from '../context';
import type { Q } from '../db';
import { addDays, localDate, runTaskMoved } from './automations';
import { audit } from './audit';
import { day } from './mappers';
import { kick, prefsOf } from './notify';
import { isDone, onTaskCreated, onTaskUpdated } from './taskEvents';

export type ChatOutcome =
  | { ok: true; title: string; url: string; date?: string }
  | { ok: false; reason: 'not_found' | 'read_only' | 'not_member' };

async function writer(q: Q, userId: string) {
  const [u] = await q.query(`select id, name, seat, status, prefs from users where id = $1`, [userId]);
  if (!u || u.status !== 'active') return null;
  return u;
}

async function orgOf(deps: Deps, orgId: string) {
  const [o] = await deps.db.system((q) => q.query('select id, slug, timezone from orgs where id = $1', [orgId]));
  return o;
}

export async function completeTask(deps: Deps, orgId: string, userId: string, taskId: string): Promise<ChatOutcome> {
  const org = await orgOf(deps, orgId);
  const res = await deps.db.tenant({ orgId, userId }, async (q): Promise<ChatOutcome & { moved?: string }> => {
    const u = await writer(q, userId);
    if (!u) return { ok: false, reason: 'not_member' };
    if (u.seat !== 'full') return { ok: false, reason: 'read_only' };
    const [t] = await q.query('select * from tasks where id = $1 and archived_at is null', [taskId]);
    if (!t) return { ok: false, reason: 'not_found' };
    const [board] = await q.query('select * from boards where id = $1', [t.board_id]);
    const cols = board.columns as Column[];
    const url = `${orgUrl(deps.config, org.slug)}/b/${t.board_id}?task=${t.id}`;
    if (isDone(cols, t.status)) return { ok: true, title: t.title, url };
    const doneCol = cols.find((c) => c.done)!;
    const [after] = await q.query(
      `update tasks set status = $2, version = version + 1, updated_at = now(), updated_by = $3 where id = $1 returning *`,
      [t.id, doneCol.key, userId],
    );
    await audit(q, { orgId, actorId: userId, action: 'task.updated', entity: 'task', entityId: t.id, meta: { fields: ['status'], via: 'chat' } });
    await onTaskUpdated(q, orgId, userId, t, after, board);
    return { ok: true, title: t.title, url, moved: doneCol.key };
  });
  if (res.ok && res.moved) {
    await runTaskMoved(deps, orgId, taskId, res.moved, nowOf(deps)).catch(() => 0);
    kick(deps);
  }
  return res.ok ? { ok: true, title: res.title, url: res.url } : res;
}

export async function snoozeTask(deps: Deps, orgId: string, userId: string, taskId: string, days = 1): Promise<ChatOutcome> {
  const org = await orgOf(deps, orgId);
  const today = localDate(nowOf(deps), org.timezone);
  return deps.db.tenant({ orgId, userId }, async (q): Promise<ChatOutcome> => {
    const u = await writer(q, userId);
    if (!u) return { ok: false, reason: 'not_member' };
    if (u.seat !== 'full') return { ok: false, reason: 'read_only' };
    const [t] = await q.query('select * from tasks where id = $1 and archived_at is null', [taskId]);
    if (!t) return { ok: false, reason: 'not_found' };
    const from = day(t.due_date) && day(t.due_date)! > today ? day(t.due_date)! : today;
    const date = addDays(from, days);
    await q.query(`update tasks set due_date = $2, version = version + 1, updated_at = now(), updated_by = $3 where id = $1`, [t.id, date, userId]);
    await audit(q, { orgId, actorId: userId, action: 'task.updated', entity: 'task', entityId: t.id, meta: { fields: ['dueDate'], via: 'chat' } });
    return { ok: true, title: t.title, url: `${orgUrl(deps.config, org.slug)}/b/${t.board_id}?task=${t.id}`, date };
  });
}

/** "Create a task from this message" / "/curahold <title>": lands on the person's default board, assigned to them. */
export async function createFromChat(
  deps: Deps,
  orgId: string,
  userId: string,
  input: { title: string; description?: string },
): Promise<ChatOutcome> {
  const org = await orgOf(deps, orgId);
  const res = await deps.db.tenant({ orgId, userId }, async (q): Promise<ChatOutcome> => {
    const u = await writer(q, userId);
    if (!u) return { ok: false, reason: 'not_member' };
    if (u.seat !== 'full') return { ok: false, reason: 'read_only' };
    const prefs = prefsOf(u.prefs);
    let [board] = prefs.defaultBoardId ? await q.query('select * from boards where id = $1 and archived_at is null', [prefs.defaultBoardId]) : [];
    if (!board) [board] = await q.query(`select * from boards where archived_at is null order by (visibility = 'private'), created_at limit 1`);
    if (!board) return { ok: false, reason: 'not_found' };
    const cols = board.columns as Column[];
    const title = input.title.replace(/\s+/g, ' ').trim().slice(0, 300) || '—';
    const [{ p }] = await q.query('select coalesce(max(position), 0) + 1024 as p from tasks where board_id = $1 and status = $2', [board.id, cols[0].key]);
    const [t] = await q.query(
      `insert into tasks (org_id, board_id, title, description, status, assignee_ids, position, created_by, updated_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $8) returning *`,
      [orgId, board.id, title, (input.description ?? '').slice(0, 20000), cols[0].key, [userId], Number(p), userId],
    );
    await audit(q, { orgId, actorId: userId, action: 'task.created', entity: 'task', entityId: t.id, meta: { via: 'chat' } });
    await onTaskCreated(q, orgId, userId, t, board);
    return { ok: true, title, url: `${orgUrl(deps.config, org.slug)}/b/${board.id}?task=${t.id}` };
  });
  if (res.ok) kick(deps);
  return res;
}

/** Which Curahold person is this chat user? Matched once by email, then remembered. */
export async function userByEmail(deps: Deps, orgId: string, email: string) {
  const rows = await deps.db.system((q) =>
    q.query(`select id, name, locale from users where org_id = $1 and email = $2 and status = 'active'`, [orgId, email.toLowerCase()]),
  );
  return rows[0] ?? null;
}

export async function userByIdentity(deps: Deps, connectionId: string, externalId: string) {
  const rows = await deps.db.system((q) =>
    q.query(
      `select u.id, u.name, u.locale, i.data from chat_identities i join users u on u.id = i.user_id
        where i.connection_id = $1 and i.external_id = $2 and u.status = 'active'`,
      [connectionId, externalId],
    ),
  );
  return rows[0] ?? null;
}
