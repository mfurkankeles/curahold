// A customer's timeline (activities people log, and what Tendwell saw
// happen), and the health score with its reasons. Everything is read under
// the viewer's own rights: a task on a board they cannot open, or a field
// hidden from their role, does not show up here either.
import { Hono } from 'hono';
import { z } from 'zod';
import { DEFAULT_HEALTH, HEALTH_FIELD, HEALTH_SIGNALS, healthConfig, type HealthConfig } from '../../../shared/src/health';
import type { AccountField } from '../../../shared/src/model';
import { ACTIVITY_KINDS, type Activity, type Timeline, type TimelineItem } from '../../../shared/src/timeline';
import { nowOf, requirePerm, requireWriter, run, type AppEnv, type C } from '../context';
import type { Row } from '../db';
import { audit } from '../lib/audit';
import { fail } from '../lib/errors';
import { canSeeField } from '../lib/fieldAccess';
import { recomputeHealth, scoreAccounts } from '../lib/health';
import { iso } from '../lib/mappers';
import { body, param, uuid } from '../lib/validate';

export const timelineRoutes = new Hono<AppEnv>();

export const toActivity = (r: Row): Activity => ({
  id: r.id,
  accountId: r.account_id,
  authorId: r.author_id,
  kind: r.kind,
  body: r.body,
  happenedAt: iso(r.happened_at)!,
  contactIds: r.contact_ids ?? [],
  pinned: r.pinned,
  source: r.source,
  createdAt: iso(r.created_at)!,
  editedAt: iso(r.edited_at),
});

const viewer = (c: C) => c.get('auth');
const scoreVisible = (c: C) => {
  const def = (c.get('org').account_fields as AccountField[]).find((f) => f.health);
  return !!def && canSeeField(def, viewer(c));
};

async function loadAccount(c: C, id: string) {
  const [a] = await run(c, (q) => q.query('select id from accounts where id = $1', [id]));
  if (!a) fail('not_found');
}

timelineRoutes.get('/accounts/:id/timeline', async (c) => {
  const id = param(c, 'id');
  const before = c.req.query('before');
  const at = before && !Number.isNaN(Date.parse(before)) ? new Date(before).toISOString() : '9999-12-31T00:00:00Z';
  const limit = Math.min(100, Math.max(5, Number(c.req.query('limit') ?? 40)));
  const withScore = scoreVisible(c);
  const data = await run(c, async (q) => {
    const [a] = await q.query('select id from accounts where id = $1', [id]);
    if (!a) fail('not_found');
    const acts = await q.query(`select * from activities where account_id = $1 and happened_at < $2 order by happened_at desc limit $3`, [id, at, limit]);
    const pinned = before ? [] : await q.query(`select * from activities where account_id = $1 and pinned order by happened_at desc limit 5`, [id]);
    const created = await q.query(
      `select t.id, t.title, t.board_id, t.created_by, t.created_at from tasks t
        where t.account_id = $1 and t.parent_id is null and t.archived_at is null and t.created_at < $2 order by t.created_at desc limit $3`,
      [id, at, limit],
    );
    const done = await q.query(
      `select t.id, t.title, t.board_id, t.updated_by, t.done_at from tasks t
        where t.account_id = $1 and t.parent_id is null and t.archived_at is null and t.done_at < $2 order by t.done_at desc limit $3`,
      [id, at, limit],
    );
    const comments = await q.query(
      `select cm.id, cm.body, cm.author_id, cm.created_at, t.id as task_id, t.title, t.board_id from comments cm join tasks t on t.id = cm.task_id
        where t.account_id = $1 and t.archived_at is null and cm.created_at < $2 order by cm.created_at desc limit $3`,
      [id, at, limit],
    );
    const contacts = await q.query(
      `select r.id, r.name, r.created_by, r.created_at from records r join record_types rt on rt.id = r.type_id
        where r.account_id = $1 and rt.kind = 'contact' and r.archived_at is null and r.created_at < $2 order by r.created_at desc limit $3`,
      [id, at, limit],
    );
    const history = withScore
      ? await q.query(`select day::text as day, score from health_history where account_id = $1 and day <= $2::date order by day desc limit 120`, [id, at.slice(0, 10)])
      : [];
    return { acts, pinned, created, done, comments, contacts, history };
  });
  const items: TimelineItem[] = [
    ...data.acts.map((r): TimelineItem => ({ type: 'activity', at: iso(r.happened_at)!, activity: toActivity(r) })),
    ...data.created.map((r): TimelineItem => ({ type: 'task_created', at: iso(r.created_at)!, taskId: r.id, title: r.title, boardId: r.board_id, byId: r.created_by })),
    ...data.done.map((r): TimelineItem => ({ type: 'task_done', at: iso(r.done_at)!, taskId: r.id, title: r.title, boardId: r.board_id, byId: r.updated_by })),
    ...data.comments.map((r): TimelineItem => ({ type: 'comment', at: iso(r.created_at)!, id: r.id, taskId: r.task_id, title: r.title, boardId: r.board_id, byId: r.author_id, body: r.body })),
    ...data.contacts.map((r): TimelineItem => ({ type: 'contact', at: iso(r.created_at)!, recordId: r.id, name: r.name, byId: r.created_by })),
  ];
  // A score that moved by ten points or more from one day to the next.
  const hist = data.history as { day: string; score: number }[];
  for (let i = 0; i < hist.length - 1; i++) {
    const to = hist[i];
    const from = hist[i + 1];
    if (Math.abs(to.score - from.score) >= 10) items.push({ type: 'score', at: `${to.day}T00:00:00.000Z`, from: from.score, to: to.score });
  }
  items.sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0));
  const page = items.filter((i) => i.at < at).slice(0, limit);
  const out: Timeline = { items: page, pinned: data.pinned.map(toActivity), next: page.length === limit ? page[page.length - 1].at : null };
  return c.json(out);
});

const activityInput = {
  kind: z.enum(ACTIVITY_KINDS),
  body: z.string().trim().min(1).max(20000),
  happenedAt: z.string().datetime({ offset: true }),
  contactIds: z.array(uuid).max(20),
  pinned: z.boolean(),
};

timelineRoutes.post('/accounts/:id/activities', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(
    c,
    z.object({
      kind: activityInput.kind.default('note'),
      body: activityInput.body,
      happenedAt: activityInput.happenedAt.optional(),
      contactIds: activityInput.contactIds.optional(),
      pinned: activityInput.pinned.optional(),
    }),
  );
  const org = c.get('org');
  const auth = c.get('auth');
  const now = nowOf(c.get('deps'));
  if (input.happenedAt && new Date(input.happenedAt).getTime() > now.getTime() + 86_400_000) fail('validation', { fields: 'happenedAt' }, { fields: ['happenedAt'] });
  const row = await run(c, async (q) => {
    const [a] = await q.query('select id from accounts where id = $1', [id]);
    if (!a) fail('not_found');
    const contacts = await checkContacts(q, id, input.contactIds ?? []);
    const [r] = await q.query(
      `insert into activities (org_id, account_id, author_id, kind, body, happened_at, contact_ids, pinned)
       values ($1, $2, $3, $4, $5, coalesce($6::timestamptz, now()), $7, $8) returning *`,
      [org.id, id, auth.userId, input.kind, input.body, input.happenedAt ?? null, contacts, input.pinned ?? false],
    );
    return r;
  });
  return c.json({ activity: toActivity(row) }, 201);
});

/** Only contacts of this customer can be named on its activities. */
async function checkContacts(q: { query: (s: string, p?: unknown[]) => Promise<Row[]> }, accountId: string, ids: string[]) {
  if (!ids.length) return [];
  const found = await q.query(`select r.id from records r join record_types rt on rt.id = r.type_id where r.account_id = $1 and rt.kind = 'contact' and r.id = any ($2::uuid[])`, [accountId, ids]);
  if (found.length !== new Set(ids).size) fail('validation', { fields: 'contactIds' }, { fields: ['contactIds'] });
  return [...new Set(ids)];
}

timelineRoutes.patch('/activities/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(
    c,
    z.object({
      kind: activityInput.kind.optional(),
      body: activityInput.body.optional(),
      happenedAt: activityInput.happenedAt.optional(),
      contactIds: activityInput.contactIds.optional(),
      pinned: activityInput.pinned.optional(),
    }),
  );
  const row = await run(c, async (q) => {
    const [cur] = await q.query('select * from activities where id = $1', [id]);
    if (!cur) fail('not_found');
    const contacts = input.contactIds ? await checkContacts(q, cur.account_id, input.contactIds) : cur.contact_ids;
    const textChanged = (input.body !== undefined && input.body !== cur.body) || (input.kind !== undefined && input.kind !== cur.kind);
    const [r] = await q.query(
      `update activities set kind = $2, body = $3, happened_at = $4, contact_ids = $5, pinned = $6,
              edited_at = case when $7 then now() else edited_at end
        where id = $1 returning *`,
      [id, input.kind ?? cur.kind, input.body ?? cur.body, input.happenedAt ?? cur.happened_at, contacts, input.pinned ?? cur.pinned, textChanged],
    );
    // Only its writer, or someone who manages customers, may change it.
    if (!r) fail('forbidden');
    return r;
  });
  return c.json({ activity: toActivity(row) });
});

timelineRoutes.delete('/activities/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const org = c.get('org');
  const auth = c.get('auth');
  await run(c, async (q) => {
    const [cur] = await q.query('select id, account_id, kind from activities where id = $1', [id]);
    if (!cur) fail('not_found');
    const gone = await q.query('delete from activities where id = $1 returning id', [id]);
    if (!gone.length) fail('forbidden');
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'activity.deleted', entity: 'account', entityId: cur.account_id, meta: { kind: cur.kind } });
  });
  return c.json({ ok: true });
});

// ------------------------------------------------------------------- health

timelineRoutes.get('/accounts/:id/health', async (c) => {
  const id = param(c, 'id');
  if (!scoreVisible(c)) fail('not_found');
  await loadAccount(c, id);
  const now = nowOf(c.get('deps'));
  const { result, history } = await run(c, async (q) => ({
    result: (await scoreAccounts(q, c.get('org').id, [id], now)).get(id) ?? null,
    history: await q.query(`select day::text as day, score from health_history where account_id = $1 and day > current_date - 91 order by day`, [id]),
  }));
  const cfg = healthConfig(c.get('org').settings?.health ?? DEFAULT_HEALTH);
  return c.json({ health: result, bands: cfg.bands, history });
});

timelineRoutes.get('/health/config', async (c) => {
  requirePerm(c, 'accounts.manage');
  return c.json({ config: healthConfig(c.get('org').settings?.health ?? DEFAULT_HEALTH) });
});

const signalInput = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,40}$/),
  key: z.enum(HEALTH_SIGNALS),
  weight: z.number().min(0).max(100),
  good: z.number().finite().optional(),
  bad: z.number().finite().optional(),
  field: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/).optional(),
});
const configInput = z.object({
  enabled: z.boolean(),
  signals: z.array(signalInput).max(12),
  bands: z.object({ watch: z.number().min(0).max(100), good: z.number().min(0).max(100) }),
});

/** What the settings would give, before saving: how many customers in each band, and the lowest ones. */
timelineRoutes.post('/health/preview', async (c) => {
  requirePerm(c, 'accounts.manage');
  const input = await body(c, z.object({ config: configInput }));
  const cfg = healthConfig({ ...input.config, enabled: true });
  const now = nowOf(c.get('deps'));
  const { scores, names } = await run(c, async (q) => ({
    scores: await scoreAccounts(q, c.get('org').id, null, now, cfg),
    names: new Map((await q.query('select id, name, fields from accounts where archived_at is null')).map((r) => [r.id, r])),
  }));
  const counts = { good: 0, watch: 0, risk: 0, none: 0 };
  const list: { id: string; name: string; score: number | null; band: string | null; current: number | null }[] = [];
  for (const [id, r] of scores) {
    const a = names.get(id);
    if (!a) continue;
    counts[r.band ?? 'none'] += 1;
    const cur = a.fields?.[HEALTH_FIELD];
    list.push({ id, name: a.name, score: r.score, band: r.band, current: typeof cur === 'number' ? cur : null });
  }
  list.sort((x, y) => (x.score ?? 101) - (y.score ?? 101) || x.name.localeCompare(y.name));
  return c.json({ counts, lowest: list.slice(0, 8) });
});

timelineRoutes.put('/health/config', async (c) => {
  requirePerm(c, 'accounts.manage');
  requireWriter(c);
  const input = await body(c, z.object({ config: configInput }));
  const cfg: HealthConfig = healthConfig(input.config);
  const org = c.get('org');
  const auth = c.get('auth');
  const defs = (org.account_fields ?? []) as AccountField[];
  const has = defs.some((f) => f.health);
  // Switching it on adds the "Health score" field; switching it off removes it.
  const fields: AccountField[] | null = cfg.enabled && !has
    ? [...defs.filter((f) => f.key !== HEALTH_FIELD), { key: HEALTH_FIELD, label: { en: 'Health score', tr: 'Sağlık skoru' }, type: 'number', health: true }]
    : !cfg.enabled && has
      ? defs.filter((f) => !f.health)
      : null;
  await run(c, async (q) => {
    await q.query('select app_set_health($1::jsonb, $2::jsonb)', [JSON.stringify(cfg), fields ? JSON.stringify(fields) : null]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'health.updated', entity: 'org', entityId: org.id, meta: { enabled: cfg.enabled } });
  });
  // Every customer, now, so the list and cards are right straight away; and today's point of the trend.
  const deps = c.get('deps');
  const now = nowOf(deps);
  if (cfg.enabled) {
    await deps.db.system(async (q) => {
      await recomputeHealth(q, org.id, null, now);
      await q.query(
        `insert into health_history (org_id, account_id, day, score)
         select a.org_id, a.id, $2::date, (a.fields->>'${HEALTH_FIELD}')::int from accounts a
          where a.org_id = $1 and a.archived_at is null and jsonb_typeof(a.fields->'${HEALTH_FIELD}') = 'number'
         on conflict (org_id, account_id, day) do update set score = excluded.score`,
        [org.id, now.toISOString().slice(0, 10)],
      );
    });
  } else {
    await deps.db.system((q) => q.query(`update accounts set fields = fields - '${HEALTH_FIELD}' where org_id = $1 and fields ? '${HEALTH_FIELD}'`, [org.id]));
  }
  return c.json({ config: cfg });
});
