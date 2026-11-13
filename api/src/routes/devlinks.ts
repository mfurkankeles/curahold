// Code linked to tasks. GitHub and GitLab post their webhooks to the company's own address
// (/api/inbound/dev/github, /api/inbound/dev/gitlab); a branch, pull / merge request or commit that names a task
// (CURA-1a2b3c4d, or the whole id) in its branch name, title or message is linked to it, with its state (open, merged,
// closed) and the result of its checks. The receiver has no signed-in person: it verifies the host's signature, then
// writes through the definer functions of migration 0036, which only ever reach the company the address belongs to.
// The same data is readable on a task and, summarised, for a whole board.
import { Hono } from 'hono';
import { DEV_HOSTS, devKey, type DevHookInfo, type DevHost, type DevLink, type DevStatus, type DevSummary } from '../../../shared/src/sync';
import { requirePerm, requireWriter, run, secretsKey, type AppEnv, type C } from '../context';
import type { Row } from '../db';
import { audit } from '../lib/audit';
import { hmacHex, randomToken, safeEqual } from '../lib/crypto';
import { parseGithub, parseGitlab, taskRefs, worstChecks, type Parsed } from '../lib/devlinks';
import { fail } from '../lib/errors';
import { iso } from '../lib/mappers';
import { param } from '../lib/validate';
import { loadBoard } from './boards';

export const devLinkRoutes = new Hono<AppEnv>();
/** Mounted before sign-in: the signature (GitHub) or token (GitLab) is the credential. */
export const devInboundRoutes = new Hono<AppEnv>();

const MAX_BODY = 5_000_000;
const host = (c: C): DevHost => {
  const p = c.req.param('provider') ?? '';
  if (!(DEV_HOSTS as readonly string[]).includes(p)) fail('not_found');
  return p as DevHost;
};

/** The webhook secret: derived from the server's key, the company, the host and the salt kept for it — shown, never stored. */
export async function hookSecret(c: C, provider: DevHost, salt: string): Promise<string> {
  const cfg = c.get('deps').config;
  return (await hmacHex(secretsKey(cfg), `devhook:${c.get('org').id}:${provider}:${salt}`)).slice(0, 40);
}

const toLink = (r: Row): DevLink => ({
  id: r.id,
  taskId: r.task_id,
  provider: r.provider,
  kind: r.kind,
  repo: r.repo,
  ref: r.ref,
  title: r.title,
  url: r.url ?? null,
  author: r.author ?? null,
  state: r.state ?? null,
  checks: r.checks,
  headSha: r.head_sha ?? null,
  openedAt: iso(r.opened_at)!,
  updatedAt: iso(r.updated_at)!,
  mergedAt: iso(r.merged_at),
  closedAt: iso(r.closed_at),
});

export function summarize(links: Pick<DevLink, 'kind' | 'state' | 'checks'>[]): DevSummary {
  const live = links.filter((l) => l.kind !== 'commit');
  return {
    branches: links.filter((l) => l.kind === 'branch').length,
    prs: links.filter((l) => l.kind === 'pr').length,
    commits: links.filter((l) => l.kind === 'commit').length,
    open: live.filter((l) => l.state === 'open').length,
    merged: live.filter((l) => l.state === 'merged').length,
    closed: live.filter((l) => l.state === 'closed').length,
    checks: worstChecks(links.filter((l) => l.kind === 'pr' && l.state === 'open').map((l) => l.checks)),
  };
}

// ------------------------------------------------------------------ receiver

async function verified(c: C, provider: DevHost, raw: string, salt: string): Promise<boolean> {
  const secret = await hookSecret(c, provider, salt);
  if (provider === 'github') {
    const got = c.req.header('x-hub-signature-256') ?? '';
    return got.startsWith('sha256=') && safeEqual(got.slice(7), await hmacHex(secret, raw));
  }
  return safeEqual(c.req.header('x-gitlab-token') ?? '', secret);
}

devInboundRoutes.post('/inbound/dev/:provider', async (c) => {
  const provider = host(c);
  const org = c.get('org');
  const db = c.get('deps').db;
  const ctx = { orgId: org.id, userId: null };
  // The salt is the one thing read before the sender is known; row-level security keeps it to this company.
  const [hook] = await db.tenant(ctx, (q) => q.query<{ salt: string }>('select salt from dev_hooks where provider = $1', [provider]));
  if (!hook) return c.json({ error: 'not_found' }, 404);
  if (Number(c.req.header('content-length') ?? 0) > MAX_BODY) return c.json({ error: 'too_large' }, 413);
  const raw = await c.req.text();
  if (raw.length > MAX_BODY) return c.json({ error: 'too_large' }, 413);
  if (!(await verified(c, provider, raw, hook.salt))) return c.json({ error: 'bad_signature' }, 401);
  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return c.json({ error: 'validation', message: 'Send the webhook as application/json.' }, 400);
  }
  const event = c.req.header('x-github-event') ?? '';
  if (provider === 'github' && event === 'ping') return c.json({ ok: true, pong: true });
  const parsed: Parsed = provider === 'github' ? parseGithub(event, payload) : parseGitlab(payload);

  const linked = await db.tenant(ctx, async (q) => {
    const wanted = [...new Set(parsed.links.flatMap((l) => taskRefs(...l.texts)))];
    let n = 0;
    if (wanted.length) {
      const found = await q.query<{ ref: string; task_id: string }>('select ref, task_id from dev_resolve_tasks($1::text[])', [wanted]);
      const byRef = new Map(found.map((f) => [f.ref, f.task_id]));
      const events: Record<string, unknown>[] = [];
      for (const l of parsed.links) {
        // One link per task it names (a branch can name two).
        for (const task of new Set(taskRefs(...l.texts).map((r) => byRef.get(r)).filter((t): t is string => !!t))) {
          events.push({ task_id: task, provider: l.provider, kind: l.kind, repo: l.repo, ref: l.ref, title: l.title, url: l.url, author: l.author, state: l.state, head_sha: l.headSha, checks: l.checks });
        }
      }
      if (events.length) [{ n }] = await q.query<{ n: number }>('select dev_link_apply($1::jsonb) as n', [JSON.stringify(events)]);
    }
    for (const k of parsed.checks) await q.query('select dev_link_checks($1, $2, $3, $4)', [k.provider, k.repo, k.sha, k.checks]);
    return n;
  });
  return c.json({ ok: true, linked });
});

// ---------------------------------------------------------------- management

const HOOK_PATH = (c: C, provider: DevHost) => `${new URL(c.req.url).origin}/api/inbound/dev/${provider}`;

async function hookInfo(c: C, provider: DevHost, row: Row | undefined, stats: { n: number; last: unknown }): Promise<DevHookInfo> {
  return {
    provider,
    enabled: !!row,
    url: row ? HOOK_PATH(c, provider) : null,
    secret: row ? await hookSecret(c, provider, row.salt) : null,
    createdAt: row ? iso(row.created_at) : null,
    lastLinkAt: iso(stats.last),
    links: Number(stats.n),
  };
}

devLinkRoutes.get('/dev-hooks', async (c) => {
  requirePerm(c, 'connections.manage');
  const { rows, stats } = await run(c, async (q) => ({
    rows: await q.query('select * from dev_hooks'),
    stats: await q.query<{ provider: string; n: number; last: unknown }>('select provider, count(*)::int as n, max(updated_at) as last from dev_links group by provider'),
  }));
  const hooks = await Promise.all(DEV_HOSTS.map((p) => hookInfo(c, p, rows.find((r) => r.provider === p), stats.find((s) => s.provider === p) ?? { n: 0, last: null })));
  return c.json({ hooks });
});

/** Switches a host on, or gives its webhook a new secret (the old one stops working at once). */
devLinkRoutes.post('/dev-hooks/:provider', async (c) => {
  requirePerm(c, 'connections.manage');
  const provider = host(c);
  const org = c.get('org');
  const auth = c.get('auth');
  const row = await run(c, async (q) => {
    const [r] = await q.query(
      `insert into dev_hooks (org_id, provider, salt, created_by) values ($1, $2, $3, $4)
       on conflict (org_id, provider) do update set salt = excluded.salt, created_by = excluded.created_by, created_at = now() returning *`,
      [org.id, provider, randomToken(18), auth.userId],
    );
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'devhook.created', entity: 'org', entityId: org.id, meta: { provider } });
    return r;
  });
  return c.json({ hook: await hookInfo(c, provider, row, { n: 0, last: null }) }, 201);
});

devLinkRoutes.delete('/dev-hooks/:provider', async (c) => {
  requirePerm(c, 'connections.manage');
  const provider = host(c);
  const org = c.get('org');
  const auth = c.get('auth');
  await run(c, async (q) => {
    await q.query('delete from dev_hooks where provider = $1', [provider]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'devhook.deleted', entity: 'org', entityId: org.id, meta: { provider } });
  });
  return c.json({ ok: true });
});

// ------------------------------------------------------------------- reading

/** A task's branches, pull requests and commits, and the key to name them by. */
devLinkRoutes.get('/tasks/:id/dev', async (c) => {
  const id = param(c, 'id');
  const rows = await run(c, async (q) => {
    const [t] = await q.query('select id from tasks where id = $1 and archived_at is null', [id]);
    if (!t) fail('not_found');
    return q.query(`select * from dev_links where task_id = $1 order by case kind when 'pr' then 0 when 'branch' then 1 else 2 end, updated_at desc limit 200`, [id]);
  });
  const links = rows.map(toLink);
  const out: DevStatus = { key: devKey(id), links, summary: summarize(links) };
  return c.json(out);
});

/** For a board's cards: each task's summary, in one call. Tasks with nothing linked are left out. */
devLinkRoutes.get('/boards/:id/dev-links', async (c) => {
  const id = param(c, 'id');
  const rows = await run(c, async (q) => {
    await loadBoard(q, id);
    return q.query(
      `select l.* from dev_links l join tasks t on t.id = l.task_id and t.org_id = l.org_id
        where t.board_id = $1 and t.archived_at is null order by l.updated_at desc limit 5000`,
      [id],
    );
  });
  const by = new Map<string, DevLink[]>();
  for (const l of rows.map(toLink)) by.set(l.taskId, [...(by.get(l.taskId) ?? []), l]);
  return c.json({ summaries: Object.fromEntries([...by].map(([task, list]) => [task, summarize(list)])) });
});

devLinkRoutes.delete('/dev-links/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const org = c.get('org');
  const auth = c.get('auth');
  await run(c, async (q) => {
    const rows = await q.query('delete from dev_links where id = $1 returning task_id', [id]);
    if (!rows.length) fail('not_found');
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'devlink.removed', entity: 'task', entityId: rows[0].task_id });
  });
  return c.json({ ok: true });
});
