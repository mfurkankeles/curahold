// Everything Curahold holds about one person in one company, as one JSON
// document: the answer to a data-subject access request (KVKK m.11, GDPR
// Art. 15/20). Two doors use it:
//   * an administrator with privacy.manage (routes/admin.ts) — the whole of it,
//     tasks on boards the administrator personally cannot open included;
//   * the person themself, from My profile (routes/me.ts) — their own profile,
//     sign-ins, teams and activity, and the tasks and comments they can open
//     today (a board they were taken off stays closed to them; an administrator
//     can still answer a formal request with everything).
import { run, type C } from '../context';
import type { Q } from '../db';
import { iso, toComment, toTask } from './mappers';

export async function personalData(c: C, userId: string, scope: 'admin' | 'self') {
  const org = c.get('org');
  const db = c.get('deps').db;
  const [person] = await db.system((q) =>
    q.query(
      `select u.id, u.email, u.name, u.seat, u.status, u.locale, u.created_at, u.last_active_at, r.name as role
         from users u join roles r on r.id = u.role_id where u.org_id = $1 and u.id = $2`,
      [org.id, userId],
    ),
  );
  if (!person) return null;
  // The work: owner-level reads filtered by this company for an administrator; the person's own view otherwise.
  const taskSql = 'select * from tasks where org_id = $1 and (created_by = $2 or $2 = any(assignee_ids)) order by created_at';
  const commentSql = 'select * from comments where org_id = $1 and author_id = $2 order by created_at';
  const work = (fn: (q: Q) => Promise<{ tasks: any[]; comments: any[] }>) =>
    scope === 'admin' ? db.system(fn) : run(c, fn);
  const { tasks, comments } = await work(async (q) => ({
    tasks: await q.query(taskSql, [org.id, userId]),
    comments: await q.query(commentSql, [org.id, userId]),
  }));
  const own = await db.system(async (q) => ({
    sessions: await q.query(
      'select device_label, method, ip, geo, created_at, last_seen_at, revoked_at, revoke_reason from sessions where org_id = $1 and user_id = $2 order by created_at',
      [org.id, userId],
    ),
    activity: await q.query('select action, entity, entity_id, at from audit_log where org_id = $1 and actor_id = $2 order by at', [org.id, userId]),
    teams: await q.query('select t.name from teams t join team_members m on m.team_id = t.id where t.org_id = $1 and m.user_id = $2', [org.id, userId]),
    // What they asked CuraAI, as long as the company keeps it (api/src/assistant).
    assistant: await q.query('select surface, question, kind, created_at from assistant_log where org_id = $1 and user_id = $2 order by created_at', [org.id, userId]),
  }));
  return {
    exportedAt: new Date().toISOString(),
    company: org.name,
    person: { ...person, created_at: iso(person.created_at), last_active_at: iso(person.last_active_at) },
    teams: own.teams.map((t) => t.name),
    tasks: tasks.map(toTask),
    comments: comments.map(toComment),
    sessions: own.sessions.map((s) => ({
      device: s.device_label,
      method: s.method,
      ip: s.ip,
      country: s.geo,
      createdAt: iso(s.created_at),
      lastSeenAt: iso(s.last_seen_at),
      endedAt: iso(s.revoked_at),
      endReason: s.revoke_reason,
    })),
    activity: own.activity.map((a) => ({ action: a.action, entity: a.entity, entityId: a.entity_id, at: iso(a.at) })),
    assistantQuestions: own.assistant.map((a) => ({ where: a.surface, question: a.question, reply: a.kind, at: iso(a.created_at) })),
  };
}
