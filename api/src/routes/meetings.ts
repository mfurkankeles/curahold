// A customer's meetings: the meetings, business reviews and calls people
// logged, newest first, each with who was there and the next steps agreed.
// Logging a meeting makes its next steps in the same go — tasks that remember
// the meeting — so nothing agreed lives only in someone's notes.
//
// A meeting is an `activities` row (kind meeting / review / call) with a
// title, its length and our people (migration 0020). Read under the viewer's
// own rights: a next step on a board they cannot open does not show up.
import { Hono } from 'hono';
import { z } from 'zod';
import type { Column } from '../../../shared/src/model';
import { MEETING_KINDS, isMeetingKind, type Meeting, type MeetingKind, type MeetingsPage, type NextStep } from '../../../shared/src/timeline';
import { nowOf, requireWriter, run, type AppEnv } from '../context';
import type { Q, Row } from '../db';
import { fail } from '../lib/errors';
import { addEvent } from '../lib/history';
import { day, iso } from '../lib/mappers';
import { kick } from '../lib/notify';
import { kickSync, queueSync } from '../lib/records';
import { onTaskCreated } from '../lib/taskEvents';
import { body, isoDate, param, uuid } from '../lib/validate';
import { loadBoard } from './boards';
import { checkContacts, toActivity } from './timeline';

export const meetingRoutes = new Hono<AppEnv>();

/** Meetings per page on the customer page. */
const PAGE = 20;

const stepInput = z.object({
  title: z.string().trim().min(1).max(300),
  assigneeIds: z.array(uuid).max(10).optional(),
  dueDate: isoDate.nullable().optional(),
});

const meetingFields = {
  kind: z.enum(MEETING_KINDS),
  title: z.string().trim().max(300),
  body: z.string().trim().max(20000),
  happenedAt: z.string().datetime({ offset: true }),
  minutes: z.number().int().min(1).max(1440).nullable(),
  contactIds: z.array(uuid).max(30),
  userIds: z.array(uuid).max(30),
};

// ------------------------------------------------------------------- reading

meetingRoutes.get('/accounts/:id/meetings', async (c) => {
  const id = param(c, 'id');
  const asked = c.req.query('kind') ?? '';
  const kinds: MeetingKind[] = isMeetingKind(asked) ? [asked] : [...MEETING_KINDS];
  const before = c.req.query('before');
  const at = before && !Number.isNaN(Date.parse(before)) ? new Date(before).toISOString() : '9999-12-31T00:00:00Z';
  const data = await run(c, async (q) => {
    const [a] = await q.query('select id from accounts where id = $1', [id]);
    if (!a) fail('not_found');
    const rows = await q.query(
      `select * from activities where account_id = $1 and kind = any($2::text[]) and happened_at < $3
        order by happened_at desc limit $4`,
      [id, kinds, at, PAGE],
    );
    const counts = await q.query(`select kind, count(*)::int as n from activities where account_id = $1 and kind = any($2::text[]) group by kind`, [id, [...MEETING_KINDS]]);
    const steps = await stepsOf(q, rows.map((r) => r.id));
    return { rows, counts, steps };
  });
  const page: MeetingsPage = {
    meetings: data.rows.map((r) => ({ ...toActivity(r), kind: r.kind as MeetingKind, nextSteps: data.steps.get(r.id) ?? [] })),
    next: data.rows.length === PAGE ? iso(data.rows[data.rows.length - 1].happened_at) : null,
    counts: Object.fromEntries(MEETING_KINDS.map((k) => [k, data.counts.find((x) => x.kind === k)?.n ?? 0])) as Record<MeetingKind, number>,
  };
  return c.json(page);
});

/** The next steps of these meetings, by meeting — only the ones this person may see. */
async function stepsOf(q: Q, ids: string[]): Promise<Map<string, NextStep[]>> {
  const out = new Map<string, NextStep[]>();
  if (!ids.length) return out;
  const rows = await q.query(
    `select t.id, t.title, t.board_id, t.assignee_ids, t.due_date, t.activity_id, t.done_at
       from tasks t
      where t.activity_id = any($1::uuid[]) and t.parent_id is null and t.archived_at is null
      order by t.created_at, t.position`,
    [ids],
  );
  for (const r of rows) {
    const list = out.get(r.activity_id) ?? [];
    list.push({ id: r.id, title: r.title, boardId: r.board_id, assigneeIds: r.assignee_ids ?? [], dueDate: day(r.due_date), done: !!r.done_at });
    out.set(r.activity_id, list);
  }
  return out;
}

// ------------------------------------------------------------------- logging

meetingRoutes.post('/accounts/:id/meetings', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(
    c,
    z.object({
      kind: meetingFields.kind.default('meeting'),
      title: meetingFields.title.default(''),
      body: meetingFields.body.default(''),
      happenedAt: meetingFields.happenedAt.optional(),
      minutes: meetingFields.minutes.optional(),
      contactIds: meetingFields.contactIds.optional(),
      userIds: meetingFields.userIds.optional(),
      nextSteps: z.array(stepInput).max(20).optional(),
      boardId: uuid.optional(),
    }),
  );
  const org = c.get('org');
  const auth = c.get('auth');
  notInFuture(input.happenedAt, nowOf(c.get('deps')));
  // A meeting needs something to remember it by: a title, notes or a next step.
  if (!input.title && !input.body && !input.nextSteps?.length) fail('validation', { fields: 'title' }, { fields: ['title'] });
  const meeting = await run(c, async (q) => {
    const [a] = await q.query('select id, name from accounts where id = $1', [id]);
    if (!a) fail('not_found');
    const contacts = await checkContacts(q, id, input.contactIds ?? []);
    const users = await checkUsers(q, input.userIds ?? []);
    const [r] = await q.query(
      `insert into activities (org_id, account_id, author_id, kind, title, body, happened_at, minutes, contact_ids, user_ids)
       values ($1, $2, $3, $4, $5, $6, coalesce($7::timestamptz, now()), $8, $9, $10) returning *`,
      [org.id, id, auth.userId, input.kind, input.title, input.body, input.happenedAt ?? null, input.minutes ?? null, contacts, users],
    );
    const steps = await makeSteps(q, { orgId: org.id, actorId: auth.userId, account: a, meeting: r, boardId: input.boardId, steps: input.nextSteps ?? [] });
    return { ...toActivity(r), kind: r.kind as MeetingKind, nextSteps: steps } satisfies Meeting;
  });
  if (meeting.nextSteps.length) {
    kick(c.get('deps'));
    kickSync(c.get('deps'), org.id);
  }
  return c.json({ meeting }, 201);
});

/** More next steps for a meeting already logged ("we also agreed to…"). */
meetingRoutes.post('/activities/:id/next-steps', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(c, z.object({ steps: z.array(stepInput).min(1).max(20), boardId: uuid }));
  const org = c.get('org');
  const auth = c.get('auth');
  const steps = await run(c, async (q) => {
    const [m] = await q.query('select * from activities where id = $1', [id]);
    if (!m || !isMeetingKind(m.kind)) fail('not_found');
    const [a] = await q.query('select id, name from accounts where id = $1', [m.account_id]);
    if (!a) fail('not_found');
    return makeSteps(q, { orgId: org.id, actorId: auth.userId, account: a, meeting: m, boardId: input.boardId, steps: input.steps });
  });
  kick(c.get('deps'));
  kickSync(c.get('deps'), org.id);
  return c.json({ nextSteps: steps }, 201);
});

/** A meeting is logged after it happened (a day of leeway for time zones). */
function notInFuture(at: string | undefined, now: Date) {
  if (at && new Date(at).getTime() > now.getTime() + 86_400_000) fail('validation', { fields: 'happenedAt' }, { fields: ['happenedAt'] });
}

/** Our people named on a meeting must be people of this company. */
async function checkUsers(q: Q, ids: string[]): Promise<string[]> {
  const want = [...new Set(ids)];
  if (!want.length) return [];
  const found = await q.query('select id from users where id = any($1::uuid[])', [want]);
  if (found.length !== want.length) fail('validation', { fields: 'userIds' }, { fields: ['userIds'] });
  return want;
}

/**
 * The next steps as tasks on the chosen board, in its first column, on the
 * customer, each remembering the meeting. They are announced like any new task.
 */
async function makeSteps(
  q: Q,
  x: { orgId: string; actorId: string; account: Row; meeting: Row; boardId?: string; steps: z.infer<typeof stepInput>[] },
): Promise<NextStep[]> {
  if (!x.steps.length) return [];
  const boardId = x.boardId;
  if (!boardId) return fail('validation', { fields: 'boardId' }, { fields: ['boardId'] });
  const board = await loadBoard(q, boardId);
  const columns = board.columns as Column[];
  const status = columns[0].key;
  // Only people who can be given work: a full seat, not switched off.
  const wanted = [...new Set(x.steps.flatMap((s) => s.assigneeIds ?? []))];
  const ok = new Set(
    wanted.length ? (await q.query(`select id from users where id = any($1::uuid[]) and status in ('active', 'invited') and seat = 'full'`, [wanted])).map((u) => u.id as string) : [],
  );
  const [{ p }] = await q.query('select coalesce(max(position), 0) as p from tasks where board_id = $1 and status = $2', [board.id, status]);
  let position = Number(p);
  const out: NextStep[] = [];
  for (const s of x.steps) {
    position += 1024;
    const assignees = (s.assigneeIds ?? []).filter((u) => ok.has(u));
    const [t] = await q.query(
      `insert into tasks (org_id, board_id, title, status, assignee_ids, account_id, due_date, position, activity_id, created_by, updated_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10) returning *, $11::text as account_name`,
      [x.orgId, board.id, s.title, status, assignees, x.account.id, s.dueDate ?? null, position, x.meeting.id, x.actorId, x.account.name],
    );
    await addEvent(q, x.orgId, t.id, x.actorId, 'created', { meeting: x.meeting.title || x.meeting.kind });
    await onTaskCreated(q, x.orgId, x.actorId, t, board);
    await queueSync(q, x.orgId, 'task', [t.id], null, { created: true, boardId: t.board_id });
    out.push({ id: t.id, title: t.title, boardId: t.board_id, assigneeIds: t.assignee_ids ?? [], dueDate: day(t.due_date), done: false });
  }
  return out;
}
