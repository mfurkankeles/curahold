// Jira Cloud set-up: which Jira projects to bring over and which Curahold board the work lands on. The field mapping
// is the same for everyone (jiraDefaultSync), so choosing those two things is all there is to it; the sync then runs
// like any other connection's (history, "needs attention", reconnect).
import { Hono } from 'hono';
import { z } from 'zod';
import { requirePerm, requirePlan, run, type AppEnv, type C } from '../context';
import { audit } from '../lib/audit';
import { fail } from '../lib/errors';
import { body, param } from '../lib/validate';
import { jira, jiraDefaultSync, jiraProjects, jiraScrumBoards } from '../sync/adapters/jira';
import { CrmError } from '../sync/adapters/types';
import { crmCtx, loadCrm } from '../sync/engine';

export const jiraRoutes = new Hono<AppEnv>();

async function loadedJira(c: C) {
  requirePerm(c, 'connections.manage');
  const conn = await loadCrm(c.get('deps'), c.get('org').id, param(c, 'id'));
  if (!conn || conn.provider !== jira.provider) fail('not_found');
  return conn!;
}

function crmFail(e: unknown): never {
  if (e instanceof CrmError) fail('crm_error', { message: e.message }, { reason: e.message, auth: e.auth });
  throw e;
}

/** The projects this Atlassian account can see, and what is chosen now. */
jiraRoutes.get('/connections/:id/jira', async (c) => {
  const conn = await loadedJira(c);
  let projects;
  try {
    projects = await jiraProjects(crmCtx(c.get('deps'), conn));
  } catch (e) {
    crmFail(e);
  }
  const boards = await run(c, (q) => q.query<{ id: string; name: string }>('select id, name from boards where archived_at is null order by sort_text(name)'));
  const board = conn.sync.objects.find((o) => o.target === 'task')?.boardId ?? null;
  return c.json({ projects: projects!, selected: (conn.config.projects as string[] | undefined) ?? [], boardId: board, boards, site: conn.config.siteUrl ?? null, mode: conn.config.mode ?? null });
});

/** Chooses the projects and the board; writes the standard mapping. The first sync reads everything afresh. */
jiraRoutes.put('/connections/:id/jira', async (c) => {
  requirePlan(c, 'crm_sync');
  const conn = await loadedJira(c);
  const input = await body(c, z.object({ projects: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9_]{1,19}$/)).min(1).max(10), boardId: z.string().uuid() }));
  const deps = c.get('deps');
  const org = c.get('org');
  const auth = c.get('auth');
  const projects = [...new Set(input.projects.map((k) => k.toUpperCase()))];
  // Sprints live on the projects' scrum boards; the first one is where sprints made here are created.
  let boardIds: number[] = [];
  try {
    boardIds = await jiraScrumBoards(crmCtx(deps, conn), projects);
  } catch (e) {
    crmFail(e);
  }
  await run(c, async (q) => {
    const [b] = await q.query('select id from boards where id = $1 and archived_at is null', [input.boardId]);
    if (!b) fail('validation', { fields: 'boardId' }, { fields: ['boardId'] });
    const next = { ...conn.sync, objects: jiraDefaultSync(input.boardId), conflict: conn.sync.conflict ?? 'latest' };
    await q.query(
      `update connections set config = config || $2::jsonb, state = state - 'cursors' - 'pages' - 'fullAt', updated_at = now() where id = $1`,
      [conn.id, JSON.stringify({ projects, createProject: projects[0], boardIds, jiraBoardId: boardIds[0] ?? null, sync: next })],
    );
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'connection.updated', entity: 'connection', entityId: conn.id, meta: { provider: 'jira', projects } });
  });
  return c.json({ ok: true, projects, boards: boardIds.length });
});
