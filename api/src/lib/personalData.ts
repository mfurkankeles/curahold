// Everything Curahold holds about one person in one company, as one JSON
// document: the answer to a data-subject access request (KVKK m.11, GDPR
// Art. 15/20). Two doors use it:
//   * an administrator with privacy.manage (routes/admin.ts) — the whole of it,
//     tasks on boards the administrator personally cannot open included;
//   * the person themself, from My profile (routes/me.ts) — their own profile,
//     sign-ins, teams and activity, and the tasks and comments they can open
//     today (a board they were taken off stays closed to them; an administrator
//     can still answer a formal request with everything).
import type { AssistantLogRow, AuditLogRow, CommentsRow, FilesRow, PortalIdentitiesRow, PortalSessionsRow, SessionsRow, TasksRow } from '../db/rows.gen';
import { run, type C } from '../context';
import type { Q } from '../db';
import { iso, toComment, toTask } from './mappers';

/**
 * Everything stored about one person, for a KVKK/GDPR access request: by the person (`self`) or an administrator.
 * Reads with db.system() filtered to this org and person, because the request must include rows they cannot open.
 */
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
    sessions: await q.query<Pick<SessionsRow, 'device_label' | 'method' | 'ip' | 'geo' | 'created_at' | 'last_seen_at' | 'revoked_at' | 'revoke_reason'>>(
      'select device_label, method, ip, geo, created_at, last_seen_at, revoked_at, revoke_reason from sessions where org_id = $1 and user_id = $2 order by created_at',
      [org.id, userId],
    ),
    activity: await q.query<Pick<AuditLogRow, 'action' | 'entity' | 'entity_id' | 'at'>>('select action, entity, entity_id, at from audit_log where org_id = $1 and actor_id = $2 order by at', [org.id, userId]),
    teams: await q.query('select t.name from teams t join team_members m on m.team_id = t.id where t.org_id = $1 and m.user_id = $2', [org.id, userId]),
    // What they asked CuraAI, as long as the company keeps it (api/src/assistant).
    assistant: await q.query<Pick<AssistantLogRow, 'surface' | 'question' | 'kind' | 'created_at'>>('select surface, question, kind, created_at from assistant_log where org_id = $1 and user_id = $2 order by created_at', [org.id, userId]),
    // Their answers to the assistant's notice and to the cookie/consent banner: consents are personal data too.
    assistantConsents: await q.query<{ version: string; locale: string; granted: boolean; created_at: unknown }>(
      `select version, locale, granted, created_at from assistant_consents where org_id = $1 and user_id = $2 order by created_at`,
      [org.id, userId],
    ),
    consents: await q.query<{ analytics: boolean; marketing: boolean; source: string; policy_version: string | null; locale: string | null; action: string | null; created_at: unknown }>(
      `select analytics, marketing, source, policy_version, locale, action, created_at from consent_log where org_id = $1 and user_id = $2 order by created_at`,
      [org.id, userId],
    ),
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
    assistantConsents: own.assistantConsents.map((a) => ({ version: a.version, locale: a.locale, granted: a.granted, at: iso(a.created_at) })),
    consentChoices: own.consents.map((x) => ({ analytics: x.analytics, marketing: x.marketing, where: x.source, policyVersion: x.policy_version, locale: x.locale, action: x.action, at: iso(x.created_at) })),
  };
}

/**
 * Everything held about one person at a customer who signs in to the portal
 * (KVKK m.11, GDPR Art. 15/20): an administrator with privacy.manage answers
 * their request with this file. Owner-level reads, each filtered by the company.
 */
export async function portalPersonalData(c: C, portalUserId: string) {
  const org = c.get('org');
  return c.get('deps').db.system(async (q) => {
    const [person] = await q.query(
      `select pu.id, pu.email, pu.name, pu.status, pu.locale, pu.created_at, pu.last_seen_at, a.name as customer
         from portal_users pu join accounts a on a.org_id = pu.org_id and a.id = pu.account_id where pu.org_id = $1 and pu.id = $2`,
      [org.id, portalUserId],
    );
    if (!person) return null;
    const p = [org.id, portalUserId];
    const sessions = await q.query<Pick<PortalSessionsRow, 'created_at' | 'last_seen_at' | 'expires_at' | 'revoked_at'>>('select created_at, last_seen_at, expires_at, revoked_at from portal_sessions where org_id = $1 and portal_user_id = $2 order by created_at', p);
    const signIns = await q.query<Pick<PortalIdentitiesRow, 'provider' | 'email' | 'created_at' | 'last_used_at'>>('select provider, email, created_at, last_used_at from portal_identities where org_id = $1 and portal_user_id = $2', p);
    const tasks = await q.query<Pick<TasksRow, 'id' | 'title' | 'created_at'>>('select id, title, created_at from tasks where org_id = $1 and portal_author_id = $2 order by created_at', p);
    const comments = await q.query<Pick<CommentsRow, 'task_id' | 'body' | 'created_at'>>('select task_id, body, created_at from comments where org_id = $1 and portal_author_id = $2 order by created_at', p);
    const files = await q.query<Pick<FilesRow, 'name' | 'size' | 'mime' | 'created_at'>>('select name, size, mime, created_at from files where org_id = $1 and portal_author_id = $2 order by created_at', p);
    const assistant = await q.query<Pick<AssistantLogRow, 'question' | 'kind' | 'created_at'>>('select question, kind, created_at from assistant_log where org_id = $1 and portal_user_id = $2 order by created_at', p);
    const assistantConsents = await q.query<{ version: string; locale: string; granted: boolean; created_at: unknown }>(
      'select version, locale, granted, created_at from assistant_consents where org_id = $1 and portal_user_id = $2 order by created_at',
      p,
    );
    return {
      exportedAt: new Date().toISOString(),
      company: org.name,
      person: { ...person, created_at: iso(person.created_at), last_seen_at: iso(person.last_seen_at) },
      sessions: sessions.map((s) => ({ createdAt: iso(s.created_at), lastSeenAt: iso(s.last_seen_at), expiresAt: iso(s.expires_at), endedAt: iso(s.revoked_at) })),
      signIns: signIns.map((s) => ({ provider: s.provider, email: s.email, linkedAt: iso(s.created_at), lastUsedAt: iso(s.last_used_at) })),
      requestsOpened: tasks.map((t) => ({ id: t.id, title: t.title, at: iso(t.created_at) })),
      comments: comments.map((x) => ({ taskId: x.task_id, body: x.body, at: iso(x.created_at) })),
      files: files.map((f) => ({ name: f.name, size: f.size, mime: f.mime, at: iso(f.created_at) })),
      assistantQuestions: assistant.map((a) => ({ question: a.question, reply: a.kind, at: iso(a.created_at) })),
      assistantConsents: assistantConsents.map((a) => ({ version: a.version, locale: a.locale, granted: a.granted, at: iso(a.created_at) })),
    };
  });
}
