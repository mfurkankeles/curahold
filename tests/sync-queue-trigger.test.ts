// A task can be edited while its very first sync is still queued. The PM trigger
// used to record such an edit only for tasks that already had a sync link, so a
// brand-new task put in a sprint (or given story points) in the same burst its
// create was going out could lose that edit. The trigger now also refreshes a
// still-queued create, so the edit survives and rides out on the next run.
import { beforeAll, describe, expect, it } from 'vitest';
import { setup, login, type Env } from './helpers';

describe('a field edit on a not-yet-synced task', () => {
  let env: Env;
  let ada: Awaited<ReturnType<typeof login>>;
  let board: string;
  let connId: string;

  beforeAll(async () => {
    env = await setup();
    ada = await login(env, 'acme', 'ada@demo.example');
    board = (await ada.get('/api/boards')).json.boards[0].id;
    // A live, set-up source connection, so the PM trigger has somewhere to queue to.
    const [c] = await env.db.system((q) =>
      q.query(
        `insert into connections (org_id, kind, provider, label, status, config) values ($1, 'source', 'jira', 'acme.atlassian.net', 'active', $2) returning id`,
        [env.a.orgId, JSON.stringify({ sync: { startedAt: '2026-01-01T00:00:00.000Z', objects: [] } })],
      ),
    );
    connId = c.id;
  });

  it('refreshes the still-queued create instead of being dropped', async () => {
    const made = await ada.post('/api/tasks', { boardId: board, title: 'Ship it' });
    expect(made.status).toBe(201);
    const taskId = made.json.task.id;
    const version = made.json.task.version;

    // Stand in for the task's queued create, not yet pushed (so no sync link exists),
    // aged an hour so a refresh is unmistakable.
    await env.db.system((q) =>
      q.query(
        `insert into sync_changes (org_id, connection_id, entity, entity_id, fields, changed_at, next_at)
         values ($1, $2, 'task', $3, null, now() - interval '1 hour', now() - interval '1 hour')
         on conflict (connection_id, entity, entity_id) do update set fields = null, changed_at = now() - interval '1 hour', next_at = now() - interval '1 hour'`,
        [env.a.orgId, connId, taskId],
      ),
    );
    const [before] = await env.db.system((q) => q.query(`select changed_at from sync_changes where connection_id = $1 and entity = 'task' and entity_id = $2`, [connId, taskId]));

    // Edit a PM field while the task is still unlinked.
    const patched = await ada.patch(`/api/tasks/${taskId}/pm`, { baseVersion: version, storyPoints: 5 });
    expect(patched.status).toBe(200);

    const after = await env.db.system((q) => q.query(`select changed_at, fields from sync_changes where connection_id = $1 and entity = 'task' and entity_id = $2`, [connId, taskId]));
    // The queued create is still there, refreshed (so an in-flight push's changed_at-guarded
    // delete misses it), and still a full create that will carry the new field on the next run.
    expect(after).toHaveLength(1);
    expect(new Date(after[0].changed_at).getTime()).toBeGreaterThan(new Date(before.changed_at).getTime());
    expect(after[0].fields).toBeNull();
  });
});
