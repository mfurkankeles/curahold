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
import {
  MEETING_KINDS,
  MEETING_REPEATS,
  isMeetingKind,
  type Meeting,
  type MeetingKind,
  type MeetingRepeat,
  type MeetingsPage,
  type MeetingType,
  type NextStep,
  type PlannedMeeting,
} from '../../../shared/src/timeline';
import { nowOf, requirePerm, requireWriter, run, type AppEnv } from '../context';
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

// ============================================================ planned meetings
//
// The future side of a customer's meetings: what is on the calendar but not
// held yet. Planning one does not touch the timeline; the timeline is the
// record of what happened, so a planned meeting only reaches it when marked
// held, which writes the logged meeting (an activity) and links the two.

const PLANNED_PAST = 12; // recently ended ones kept on the company page

const mapPlanned = (r: Row): PlannedMeeting => ({
  id: r.id,
  accountId: r.account_id,
  kind: r.kind,
  typeLabel: r.type_label ?? '',
  title: r.title ?? '',
  agenda: r.agenda ?? '',
  startsAt: iso(r.starts_at)!,
  minutes: r.minutes ?? null,
  status: r.status,
  reason: r.reason ?? '',
  contactIds: r.contact_ids ?? [],
  userIds: r.user_ids ?? [],
  repeat: r.repeat,
  createdById: r.created_by ?? null,
  activityId: r.activity_id ?? null,
  createdAt: iso(r.created_at)!,
  updatedAt: iso(r.updated_at)!,
});

/** When the next one in a repeating series falls, from this one's start. */
function nextStart(startsAt: string, repeat: MeetingRepeat): Date | null {
  const d = new Date(startsAt);
  if (repeat === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
  else if (repeat === 'biweekly') d.setUTCDate(d.getUTCDate() + 14);
  else if (repeat === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1);
  else if (repeat === 'quarterly') d.setUTCMonth(d.getUTCMonth() + 3);
  else return null;
  return d;
}

const plannedInput = {
  kind: z.enum(MEETING_KINDS),
  typeLabel: z.string().trim().max(80),
  title: z.string().trim().max(300),
  agenda: z.string().trim().max(20000),
  startsAt: z.string().datetime({ offset: true }),
  minutes: z.number().int().min(1).max(1440).nullable(),
  contactIds: z.array(uuid).max(30),
  userIds: z.array(uuid).max(30),
  repeat: z.enum(MEETING_REPEATS),
};

// A company's planned meetings: the upcoming ones soonest first, and a short
// tail of those recently held, postponed or cancelled.
meetingRoutes.get('/accounts/:id/planned', async (c) => {
  const id = param(c, 'id');
  const data = await run(c, async (q) => {
    const [a] = await q.query('select id from accounts where id = $1', [id]);
    if (!a) fail('not_found');
    const upcoming = await q.query(
      `select * from planned_meetings where account_id = $1 and status = 'planned' order by starts_at limit 100`,
      [id],
    );
    const past = await q.query(
      `select * from planned_meetings where account_id = $1 and status <> 'planned' order by updated_at desc limit $2`,
      [id, PLANNED_PAST],
    );
    return { upcoming, past };
  });
  return c.json({ upcoming: data.upcoming.map(mapPlanned), past: data.past.map(mapPlanned) });
});

meetingRoutes.post('/accounts/:id/planned', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(
    c,
    z.object({
      kind: plannedInput.kind.default('meeting'),
      typeLabel: plannedInput.typeLabel.default(''),
      title: plannedInput.title.default(''),
      agenda: plannedInput.agenda.default(''),
      startsAt: plannedInput.startsAt,
      minutes: plannedInput.minutes.optional(),
      contactIds: plannedInput.contactIds.optional(),
      userIds: plannedInput.userIds.optional(),
      repeat: plannedInput.repeat.default('none'),
    }),
  );
  if (!input.title && !input.typeLabel) fail('validation', { fields: 'title' }, { fields: ['title'] });
  const org = c.get('org');
  const auth = c.get('auth');
  const planned = await run(c, async (q) => {
    const [a] = await q.query('select id from accounts where id = $1', [id]);
    if (!a) fail('not_found');
    const contacts = await checkContacts(q, id, input.contactIds ?? []);
    const users = await checkUsers(q, input.userIds ?? []);
    const [r] = await q.query(
      `insert into planned_meetings (org_id, account_id, created_by, kind, type_label, title, agenda, starts_at, minutes, contact_ids, user_ids, repeat)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning *`,
      [org.id, id, auth.userId, input.kind, input.typeLabel, input.title, input.agenda, input.startsAt, input.minutes ?? null, contacts, users, input.repeat],
    );
    return mapPlanned(r);
  });
  return c.json({ planned }, 201);
});

/** Change a meeting still to come: its when, who, agenda, type or repeat. */
meetingRoutes.patch('/planned/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(
    c,
    z.object({
      kind: plannedInput.kind.optional(),
      typeLabel: plannedInput.typeLabel.optional(),
      title: plannedInput.title.optional(),
      agenda: plannedInput.agenda.optional(),
      startsAt: plannedInput.startsAt.optional(),
      minutes: plannedInput.minutes.optional(),
      contactIds: plannedInput.contactIds.optional(),
      userIds: plannedInput.userIds.optional(),
      repeat: plannedInput.repeat.optional(),
    }),
  );
  const planned = await run(c, async (q) => {
    const [m] = await q.query('select * from planned_meetings where id = $1', [id]);
    if (!m) fail('not_found');
    if (m.status !== 'planned') fail('validation', { fields: 'status' }, { reason: 'not_planned' });
    const contacts = input.contactIds ? await checkContacts(q, m.account_id, input.contactIds) : null;
    const users = input.userIds ? await checkUsers(q, input.userIds) : null;
    const [r] = await q.query(
      `update planned_meetings set
         kind = coalesce($2, kind), type_label = coalesce($3, type_label), title = coalesce($4, title),
         agenda = coalesce($5, agenda), starts_at = coalesce($6::timestamptz, starts_at), minutes = coalesce($7, minutes),
         contact_ids = coalesce($8::uuid[], contact_ids), user_ids = coalesce($9::uuid[], user_ids),
         repeat = coalesce($10, repeat), updated_at = now()
       where id = $1 returning *`,
      [id, input.kind ?? null, input.typeLabel ?? null, input.title ?? null, input.agenda ?? null, input.startsAt ?? null, input.minutes ?? null, contacts, users, input.repeat ?? null],
    );
    return mapPlanned(r);
  });
  return c.json({ planned });
});

/** Mark it held: the logged meeting is written and the two are linked. If it
 *  repeats, the next one is planned. Next steps can be agreed in the same go. */
meetingRoutes.post('/planned/:id/hold', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(
    c,
    z.object({
      body: meetingFields.body.default(''),
      happenedAt: meetingFields.happenedAt.optional(),
      minutes: meetingFields.minutes.optional(),
      nextSteps: z.array(stepInput).max(20).optional(),
      boardId: uuid.optional(),
    }),
  );
  notInFuture(input.happenedAt, nowOf(c.get('deps')));
  const org = c.get('org');
  const auth = c.get('auth');
  const out = await run(c, async (q) => {
    const [m] = await q.query('select * from planned_meetings where id = $1', [id]);
    if (!m) fail('not_found');
    if (m.status !== 'planned') fail('validation', { fields: 'status' }, { reason: 'not_planned' });
    const [a] = await q.query('select id, name from accounts where id = $1', [m.account_id]);
    if (!a) fail('not_found');
    const title = m.title || m.type_label || '';
    const [act] = await q.query(
      `insert into activities (org_id, account_id, author_id, kind, title, body, happened_at, minutes, contact_ids, user_ids)
       values ($1, $2, $3, $4, $5, $6, coalesce($7::timestamptz, now()), $8, $9, $10) returning *`,
      [org.id, m.account_id, auth.userId, m.kind, title, input.body || m.agenda, input.happenedAt ?? null, input.minutes ?? m.minutes ?? null, m.contact_ids, m.user_ids],
    );
    const steps = await makeSteps(q, { orgId: org.id, actorId: auth.userId, account: a, meeting: act, boardId: input.boardId, steps: input.nextSteps ?? [] });
    const [r] = await q.query(`update planned_meetings set status = 'held', activity_id = $2, updated_at = now() where id = $1 returning *`, [id, act.id]);
    // A repeating meeting rolls forward: the next one is planned from this start.
    let next: PlannedMeeting | null = null;
    const when = nextStart(iso(m.starts_at)!, m.repeat as MeetingRepeat);
    if (when) {
      const [n] = await q.query(
        `insert into planned_meetings (org_id, account_id, created_by, kind, type_label, title, agenda, starts_at, minutes, contact_ids, user_ids, repeat)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning *`,
        [org.id, m.account_id, auth.userId, m.kind, m.type_label, m.title, m.agenda, when.toISOString(), m.minutes ?? null, m.contact_ids, m.user_ids, m.repeat],
      );
      next = mapPlanned(n);
    }
    return { planned: mapPlanned(r), meeting: { ...toActivity(act), kind: act.kind as MeetingKind, nextSteps: steps } satisfies Meeting, next };
  });
  if (out.meeting.nextSteps.length) {
    kick(c.get('deps'));
    kickSync(c.get('deps'), org.id);
  }
  return c.json(out, 201);
});

/** Postpone it (kept, with a reason); optionally plan a fresh one for a new day. */
meetingRoutes.post('/planned/:id/postpone', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(c, z.object({ reason: z.string().trim().max(2000).default(''), startsAt: plannedInput.startsAt.optional() }));
  const org = c.get('org');
  const auth = c.get('auth');
  const out = await run(c, async (q) => {
    const [m] = await q.query('select * from planned_meetings where id = $1', [id]);
    if (!m) fail('not_found');
    if (m.status !== 'planned') fail('validation', { fields: 'status' }, { reason: 'not_planned' });
    const [r] = await q.query(`update planned_meetings set status = 'postponed', reason = $2, updated_at = now() where id = $1 returning *`, [id, input.reason]);
    let next: PlannedMeeting | null = null;
    if (input.startsAt) {
      const [n] = await q.query(
        `insert into planned_meetings (org_id, account_id, created_by, kind, type_label, title, agenda, starts_at, minutes, contact_ids, user_ids, repeat)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning *`,
        [org.id, m.account_id, auth.userId, m.kind, m.type_label, m.title, m.agenda, input.startsAt, m.minutes ?? null, m.contact_ids, m.user_ids, m.repeat],
      );
      next = mapPlanned(n);
    }
    return { planned: mapPlanned(r), next };
  });
  return c.json(out);
});

/** Cancel it (kept, with a reason — nothing is deleted in v1). */
meetingRoutes.post('/planned/:id/cancel', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(c, z.object({ reason: z.string().trim().max(2000).default('') }));
  const planned = await run(c, async (q) => {
    const [m] = await q.query('select * from planned_meetings where id = $1', [id]);
    if (!m) fail('not_found');
    if (m.status !== 'planned') fail('validation', { fields: 'status' }, { reason: 'not_planned' });
    const [r] = await q.query(`update planned_meetings set status = 'cancelled', reason = $2, updated_at = now() where id = $1 returning *`, [id, input.reason]);
    return mapPlanned(r);
  });
  return c.json({ planned });
});

// ---------------------------------------------------------- meeting types

const typeInput = z.object({
  id: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(80),
  kind: z.enum(MEETING_KINDS),
  minutes: z.number().int().min(1).max(1440).nullable().default(null),
  prompt: z.string().trim().max(4000).default(''),
});

const readTypes = (org: { settings?: unknown }): MeetingType[] => {
  const raw = (org.settings as any)?.meetingTypes;
  return Array.isArray(raw) ? (raw as MeetingType[]) : [];
};

/** The meeting types this company has saved (its own names and agenda prompts). */
meetingRoutes.get('/meeting-types', async (c) => c.json({ types: readTypes(c.get('org')) }));

/** Save the company's meeting types (an administrator). */
meetingRoutes.put('/meeting-types', async (c) => {
  requirePerm(c, 'org.manage');
  const input = await body(c, z.object({ types: z.array(typeInput).max(40) }));
  const org = c.get('org');
  await run(c, (q) =>
    q.query(`update orgs set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('meetingTypes', $2::jsonb) where id = $1`, [org.id, JSON.stringify(input.types)]),
  );
  return c.json({ types: input.types });
});
