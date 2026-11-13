// The calendar: what falls on which day. Tasks by their due date, meetings,
// calls and reviews that were held, renewals, and business reviews that are
// due — for the person asking, for everyone they can see, or (with
// 'calendar.view_team') for one teammate or a whole team.
//
// Narrowing to someone else opens nothing new. Every row still passes the
// same row-level rules as anywhere else, so a private board stays private and
// a customer outside the viewer's reach stays outside it; the permission only
// decides who may ask "show me this person's days".
import { Hono } from 'hono';
import type { CalendarItem, CalendarReach } from '../../../shared/src/model';
import { reviewDue, rhythmOf } from '../../../shared/src/rhythm';
import { run, todayOf, type AppEnv } from '../context';
import type { Q } from '../db';
import { fail } from '../lib/errors';
import { canSeeField } from '../lib/fieldAccess';
import { renewalField } from '../lib/playbooks';
import { isoDate, uuid } from '../lib/validate';

export const calendarRoutes = new Hono<AppEnv>();

const DAY = 86_400_000;
/** The longest stretch one call may ask for: a year and the weeks around it. */
const MAX_DAYS = 430;

/** Whose calendars this person may open besides their own: nobody, their teams, or everyone. */
async function reachOf(q: Q, auth: { userId: string; perms: readonly string[] }): Promise<{ everyone: boolean; teams: { id: string; name: string; memberIds: string[] }[] } | null> {
  if (!auth.perms.includes('calendar.view_team')) return null;
  const everyone = auth.perms.includes('org.manage');
  const rows = await q.query<{ id: string; name: string; member_ids: string[] }>(
    `select t.id, t.name, coalesce(array(select m.user_id from team_members m join users u on u.id = m.user_id where m.team_id = t.id and u.status = 'active'), '{}') as member_ids
       from teams t
      where $1 or t.lead_id = $2 or exists (select 1 from team_members m where m.team_id = t.id and m.user_id = $2)
      order by t.name`,
    [everyone, auth.userId],
  );
  return { everyone, teams: rows.map((r) => ({ id: r.id, name: r.name, memberIds: r.member_ids })) };
}

/** Who can be picked on the calendar: shown only to someone who may pick. */
calendarRoutes.get('/calendars', async (c) => {
  const auth = c.get('auth');
  const out = await run(c, async (q): Promise<CalendarReach> => {
    const reach = await reachOf(q, auth);
    if (!reach) return { can: false, everyone: false, teams: [], personIds: [] };
    const personIds = reach.everyone
      ? (await q.query<{ id: string }>(`select id from users where status = 'active' order by name`)).map((u) => u.id)
      : [...new Set(reach.teams.flatMap((t) => t.memberIds))];
    return { can: true, everyone: reach.everyone, teams: reach.teams, personIds: personIds.filter((id) => id !== auth.userId) };
  });
  return c.json(out);
});

calendarRoutes.get('/calendar', async (c) => {
  const auth = c.get('auth');
  const org = c.get('org');
  const from = c.req.query('from') ?? '';
  const to = c.req.query('to') ?? '';
  if (!isoDate.safeParse(from).success || !isoDate.safeParse(to).success || to < from || (Date.parse(to) - Date.parse(from)) / DAY > MAX_DAYS) {
    fail('validation', { fields: 'from, to' }, { fields: ['from', 'to'] });
  }
  const who = c.req.query('who') ?? 'me';
  const today = todayOf(c);
  const rhythm = rhythmOf((org.settings as any)?.rhythm);
  const renewal = renewalField(org.account_fields ?? []);
  const seesRenewal = !!renewal && canSeeField(renewal, auth);

  const items = await run(c, async (q) => {
    // Whose days: null means everyone this person can see.
    let ids: string[] | null;
    if (who === 'me') ids = [auth.userId];
    else if (who === 'all') ids = null;
    else {
      const [kind, id] = [who.slice(0, 2), who.slice(2)];
      if (!['p:', 't:'].includes(kind) || !uuid.safeParse(id).success) fail('validation', { fields: 'who' }, { fields: ['who'] });
      if (kind === 'p:' && id === auth.userId) ids = [auth.userId];
      else {
        const reach = await reachOf(q, auth);
        if (!reach) fail('forbidden');
        if (kind === 't:') {
          const team = reach!.teams.find((t) => t.id === id);
          if (!team) fail('not_found');
          ids = team!.memberIds;
        } else {
          const known = reach!.everyone ? (await q.query(`select 1 from users where id = $1 and status = 'active'`, [id])).length > 0 : reach!.teams.some((t) => t.memberIds.includes(id));
          if (!known) fail('not_found');
          ids = [id];
        }
      }
    }

    const out: CalendarItem[] = [];
    const tasks = await q.query(
      `select t.id, t.title, t.due_date, t.status, t.board_id, t.assignee_ids, t.priority, t.done_at, t.account_id, a.name as account_name
         from tasks t join boards b on b.id = t.board_id left join accounts a on a.id = t.account_id
        where t.archived_at is null and b.archived_at is null and t.due_date between $1::date and $2::date
          and ($3::uuid[] is null or t.assignee_ids && $3::uuid[])
        order by t.due_date, t.position
        limit 4000`,
      [from, to, ids],
    );
    for (const t of tasks) {
      out.push({
        id: `task:${t.id}`,
        kind: 'task',
        date: new Date(t.due_date).toISOString().slice(0, 10),
        time: null,
        title: t.title,
        taskId: t.id,
        boardId: t.board_id,
        status: t.status,
        done: !!t.done_at,
        priority: t.priority ?? null,
        accountId: t.account_id ?? null,
        accountName: t.account_name ?? null,
        personIds: t.assignee_ids ?? [],
      });
    }

    // What was held with customers: on the company's own day and clock.
    const held = await q.query(
      `select x.id, x.kind, x.title, x.body, x.minutes, x.account_id, a.name as account_name, x.author_id, x.user_ids,
              to_char(x.happened_at at time zone $4, 'YYYY-MM-DD') as day, to_char(x.happened_at at time zone $4, 'HH24:MI') as clock
         from activities x join accounts a on a.id = x.account_id
        where x.kind in ('meeting', 'call', 'review')
          and (x.happened_at at time zone $4)::date between $1::date and $2::date
          and ($3::uuid[] is null or x.author_id = any ($3::uuid[]) or x.user_ids && $3::uuid[])
        order by x.happened_at
        limit 2000`,
      [from, to, ids, org.timezone],
    );
    for (const x of held) {
      out.push({
        id: `held:${x.id}`,
        kind: x.kind,
        date: x.day,
        time: x.clock === '00:00' ? null : x.clock,
        title: x.title || String(x.body ?? '').slice(0, 80),
        minutes: x.minutes ?? null,
        accountId: x.account_id,
        accountName: x.account_name,
        personIds: [...new Set([x.author_id, ...(x.user_ids ?? [])].filter(Boolean))],
      });
    }

    // Meetings still to come: planned ones, on the company's own day and clock.
    const planned = await q.query(
      `select p.id, p.kind, p.title, p.type_label, p.minutes, p.account_id, a.name as account_name, p.created_by, p.user_ids,
              to_char(p.starts_at at time zone $4, 'YYYY-MM-DD') as day, to_char(p.starts_at at time zone $4, 'HH24:MI') as clock
         from planned_meetings p join accounts a on a.id = p.account_id
        where p.status = 'planned'
          and (p.starts_at at time zone $4)::date between $1::date and $2::date
          and ($3::uuid[] is null or p.created_by = any ($3::uuid[]) or p.user_ids && $3::uuid[])
        order by p.starts_at
        limit 2000`,
      [from, to, ids, org.timezone],
    );
    for (const p of planned) {
      out.push({
        id: `planned:${p.id}`,
        kind: 'planned',
        date: p.day,
        time: p.clock === '00:00' ? null : p.clock,
        title: p.title || p.type_label || '',
        minutes: p.minutes ?? null,
        plannedId: p.id,
        meetingKind: p.kind,
        accountId: p.account_id,
        accountName: p.account_name,
        personIds: [...new Set([p.created_by, ...(p.user_ids ?? [])].filter(Boolean))],
      });
    }

    if (seesRenewal) {
      const rows = await q.query(
        `select a.id, a.name, a.owner_id, left(a.fields->>$4, 10) as day
           from accounts a
          where a.archived_at is null and left(a.fields->>$4, 10) between $1 and $2
            and ($3::uuid[] is null or a.owner_id = any ($3::uuid[]))
          order by 4, a.name
          limit 2000`,
        [from, to, ids, renewal!.key],
      );
      for (const a of rows) out.push({ id: `renewal:${a.id}`, kind: 'renewal', date: a.day, time: null, title: a.name, accountId: a.id, accountName: a.name, personIds: a.owner_id ? [a.owner_id] : [] });
    }

    // Business reviews that fall due in the window (a late one shows on the day it was due).
    const reviewed = await q.query(
      `select a.id, a.name, a.owner_id, a.review_days, a.created_at,
              (select max(x.happened_at) from activities x where x.account_id = a.id and x.kind = 'review') as last_review_at
         from accounts a
        where a.archived_at is null and coalesce(a.review_days, $2::int) > 0
          and ($1::uuid[] is null or a.owner_id = any ($1::uuid[]))
        limit 5000`,
      [ids, rhythm.reviewDays ?? 0],
    );
    for (const a of reviewed) {
      const due = reviewDue({ reviewDays: a.review_days, lastReviewAt: a.last_review_at ? new Date(a.last_review_at).toISOString() : null, createdAt: new Date(a.created_at).toISOString() }, rhythm.reviewDays ?? 0, today);
      if (due.due && due.due >= from && due.due <= to) {
        out.push({ id: `due:${a.id}`, kind: 'reviewDue', date: due.due, time: null, title: a.name, accountId: a.id, accountName: a.name, personIds: a.owner_id ? [a.owner_id] : [] });
      }
    }
    return out;
  });
  return c.json({ items, today });
});
