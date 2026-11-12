import { Hono } from 'hono';
import { z } from 'zod';
import type { Column } from '../../../shared/src/model';
import { requireWriter, run, type AppEnv, type AuthCtx, type C } from '../context';
import type { Q, Row } from '../db';
import { audit } from '../lib/audit';
import { fail } from '../lib/errors';
import { toBoard } from '../lib/mappers';
import { defaultColumns } from '../lib/orgs';
import { body, param, uuid } from '../lib/validate';
import { taskFieldsSchema } from '../lib/taskFields';

export const boardRoutes = new Hono<AppEnv>();

const columnSchema = z.object({
  key: z.string().regex(/^[a-z0-9_-]{1,24}$/),
  name: z.string().trim().min(1).max(40),
  done: z.boolean(),
});
const columnsSchema = z
  .array(columnSchema)
  .min(1)
  .max(12)
  .refine((cols) => new Set(cols.map((c) => c.key)).size === cols.length, 'duplicate column keys');

const BOARD_SELECT = `
  select b.*, t.lead_id as team_lead_id,
         coalesce((select array_agg(m.user_id) from board_members m where m.board_id = b.id), '{}') as member_ids
    from boards b left join teams t on t.id = b.team_id`;

export function canManageBoard(auth: AuthCtx, b: Row): boolean {
  return (
    auth.seat === 'full' &&
    (auth.perms.includes('boards.manage_all') || b.created_by === auth.userId || (!!b.team_id && b.team_lead_id === auth.userId))
  );
}

export async function loadBoard(q: Q, id: string): Promise<Row> {
  const [b] = await q.query(`${BOARD_SELECT} where b.id = $1 and b.archived_at is null`, [id]);
  if (!b) fail('not_found');
  return b;
}

async function checkPeople(q: Q, ids: string[]) {
  if (!ids.length) return;
  const rows = await q.query(`select id from users where id = any($1::uuid[]) and status <> 'deleted'`, [ids]);
  if (rows.length !== new Set(ids).size) fail('validation', { fields: 'memberIds' }, { fields: ['memberIds'] });
}

async function checkVisibility(c: C, q: Q, visibility: string, teamId: string | null) {
  const auth = c.get('auth');
  if (visibility === 'org' && !auth.perms.includes('boards.manage_all')) fail('forbidden');
  if (visibility === 'team') {
    if (!teamId) fail('validation', { fields: 'teamId' }, { fields: ['teamId'] });
    const [t] = await q.query(
      `select t.id, t.lead_id, exists (select 1 from team_members m where m.team_id = t.id and m.user_id = $2) as is_member
         from teams t where t.id = $1`,
      [teamId, auth.userId],
    );
    if (!t) fail('validation', { fields: 'teamId' }, { fields: ['teamId'] });
    const allowed =
      t.is_member || t.lead_id === auth.userId || auth.perms.includes('teams.manage') || auth.perms.includes('boards.manage_all');
    if (!allowed) fail('forbidden');
  }
}

boardRoutes.get('/boards', async (c) => {
  const auth = c.get('auth');
  const rows = await run(c, (q) => q.query(`${BOARD_SELECT} where b.archived_at is null order by b.created_at`));
  return c.json({ boards: rows.map((r) => toBoard(r, canManageBoard(auth, r))) });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  visibility: z.enum(['org', 'team', 'private']),
  teamId: uuid.nullable().optional(),
  memberIds: z.array(uuid).max(200).optional(),
  columns: columnsSchema.optional(),
  /** Post new / finished tasks to a chat channel. */
  notify: z
    .array(z.object({ connectionId: uuid, channel: z.string().max(200).nullable(), events: z.array(z.enum(['created', 'done'])).min(1).max(2) }))
    .max(5)
    .optional(),
  taskFields: taskFieldsSchema.optional(),
  form: z
    .object({
      on: z.boolean(),
      title: z.string().trim().max(120).optional(),
      intro: z.string().trim().max(1000).optional(),
      fields: z.array(z.string().regex(/^(description|account|due|f:[a-z][a-z0-9_]{0,39})$/)).max(24),
      column: z.string().max(24).nullable().optional(),
    })
    .nullable()
    .optional(),
  /** Days after which finished tasks move to the archive; null keeps them on the board. */
  archiveDays: z.number().int().min(7).max(3650).nullable().optional(),
});

async function checkNotify(q: Q, list: { connectionId: string }[] | undefined) {
  if (!list?.length) return;
  const ids = [...new Set(list.map((n) => n.connectionId))];
  const rows = await q.query(`select id from connections where id = any($1::uuid[]) and kind = 'messaging'`, [ids]);
  if (rows.length !== ids.length) fail('validation', { fields: 'notify' }, { fields: ['notify'] });
}

boardRoutes.post('/boards', async (c) => {
  requireWriter(c);
  const input = await body(c, createSchema);
  const auth = c.get('auth');
  const org = c.get('org');
  const board = await run(c, async (q) => {
    const teamId = input.visibility === 'team' ? input.teamId ?? null : null;
    await checkVisibility(c, q, input.visibility, teamId);
    const members = [...new Set([...(input.memberIds ?? []), ...(input.visibility === 'private' ? [auth.userId] : [])])];
    await checkPeople(q, members);
    await checkNotify(q, input.notify);
    const columns: Column[] = input.columns ?? defaultColumns(org.locale);
    // No RETURNING: the visibility check behind boards' SELECT policy cannot
    // see a row inserted by the same statement, so the id is made here.
    const b = { id: crypto.randomUUID() };
    await q.query(
      `insert into boards (id, org_id, team_id, name, visibility, columns, created_by, notify, task_fields, form)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [b.id, org.id, teamId, input.name, input.visibility, JSON.stringify(columns), auth.userId, JSON.stringify(input.notify ?? []), JSON.stringify(input.taskFields ?? []), input.form ? JSON.stringify(input.form) : null],
    );
    if (input.archiveDays !== undefined) await q.query('update boards set archive_days = $2 where id = $1', [b.id, input.archiveDays]);
    for (const m of members) {
      await q.query('insert into board_members (org_id, board_id, user_id) values ($1, $2, $3)', [org.id, b.id, m]);
    }
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'board.created', entity: 'board', entityId: b.id });
    return loadBoard(q, b.id);
  });
  return c.json({ board: toBoard(board, canManageBoard(auth, board)) }, 201);
});

const updateSchema = createSchema.partial();

boardRoutes.patch('/boards/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(c, updateSchema);
  const auth = c.get('auth');
  const org = c.get('org');
  const board = await run(c, async (q) => {
    const b = await loadBoard(q, id);
    if (!canManageBoard(auth, b)) fail('forbidden');
    const visibility = input.visibility ?? b.visibility;
    const teamId = visibility === 'team' ? (input.teamId !== undefined ? input.teamId : b.team_id) : null;
    if (input.visibility !== undefined || input.teamId !== undefined) await checkVisibility(c, q, visibility, teamId);
    if (input.notify) await checkNotify(q, input.notify);
    if (input.columns) {
      const keys = new Set(input.columns.map((col) => col.key));
      // Tasks in a column that was removed move to the first column.
      await q.query(
        `update tasks set status = $1, version = version + 1, updated_at = now(), updated_by = $3
          where board_id = $2 and not (status = any($4::text[]))`,
        [input.columns[0].key, id, auth.userId, [...keys]],
      );
    }
    await q.query(
      `update boards set name = coalesce($2, name), visibility = $3, team_id = $4,
              columns = coalesce($5::jsonb, columns), notify = coalesce($6::jsonb, notify),
              task_fields = coalesce($7::jsonb, task_fields), form = case when $8 then $9::jsonb else form end,
              archive_days = case when $10 then $11::int else archive_days end
        where id = $1`,
      [id, input.name ?? null, visibility, teamId, input.columns ? JSON.stringify(input.columns) : null, input.notify ? JSON.stringify(input.notify) : null, input.taskFields ? JSON.stringify(input.taskFields) : null, input.form !== undefined, input.form ? JSON.stringify(input.form) : null, input.archiveDays !== undefined, input.archiveDays ?? null],
    );
    if (input.columns) {
      // "Finished" is kept on the task (done_at) so that lists and reports need not look the
      // column up for every row. When a column starts or stops meaning finished, its tasks follow.
      const done = input.columns.filter((col) => col.done).map((col) => col.key);
      await q.query(`update tasks set done_at = now() where board_id = $1 and done_at is null and status = any($2::text[])`, [id, done]);
      await q.query(`update tasks set done_at = null where board_id = $1 and done_at is not null and not (status = any($2::text[]))`, [id, done]);
    }
    if (input.memberIds) {
      const members = [...new Set(input.memberIds)];
      await checkPeople(q, members);
      await q.query('delete from board_members where board_id = $1', [id]);
      for (const m of members) {
        await q.query('insert into board_members (org_id, board_id, user_id) values ($1, $2, $3)', [org.id, id, m]);
      }
    }
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'board.updated', entity: 'board', entityId: id });
    return loadBoard(q, id);
  });
  return c.json({ board: toBoard(board, canManageBoard(auth, board)) });
});

boardRoutes.delete('/boards/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const auth = c.get('auth');
  const org = c.get('org');
  await run(c, async (q) => {
    const b = await loadBoard(q, id);
    if (!canManageBoard(auth, b)) fail('forbidden');
    await q.query('update boards set archived_at = now() where id = $1', [id]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'board.archived', entity: 'board', entityId: id });
  });
  return c.json({ ok: true });
});
