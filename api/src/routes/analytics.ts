// The analytics feed: one read-only way for BI tools to read a company's data.
//
//   /api/analytics/odata/            OData v4: service document, $metadata, one entity set per dataset
//   /api/analytics/v1/               the same datasets as plain JSON or CSV (Tasks.json, Tasks.csv)
//   /api/dev/analytics/…             analytics keys: make, rotate, revoke; who pulled what
//
// The feed is read with an analytics key (chb_…) as a Basic password (any user
// name), a Bearer token, or — for Power BI's "Web API" key option only — `?key=`,
// which is never written to a log or into a next-page link. A signed-in person can
// read it in the browser too. Either way it acts as one person: rows are what
// their row-level security lets through, columns are the fields their role may
// see (lib/analytics.ts), and the person must hold 'data.export', as for every
// export. A key may be narrowed further to some datasets and departments.
// Every pull is written down (analytics_pulls: key, person, dataset, rows,
// query, tool), with one activity-log line per key, dataset and hour; the
// company has a daily row budget and each key a request budget (lib/ratelimit.ts).
import { Hono } from 'hono';
import { z } from 'zod';
import { ANALYTICS_DEPARTMENTS, type AnalyticsDatasetInfo, type AnalyticsKeyInfo, type AnalyticsPullInfo } from '../../../shared/src/analytics';
import { translate, type Locale, type MessageKey } from '../../../shared/src/i18n';
import { requirePerm, run, type AppEnv, type C } from '../context';
import type { Q, Row } from '../db';
import {
  DAILY_ROWS_DEFAULT,
  PAGE_MAX,
  QueryError,
  allowed,
  catalog,
  csvOf,
  decodeCursor,
  decodeDelta,
  encodeCursor,
  encodeDelta,
  metadataXml,
  readPage,
  toolOf,
  type Dataset,
  type KeyScope,
  type Page,
  type PageQuery,
} from '../lib/analytics';
import { audit } from '../lib/audit';
import { HttpError, fail } from '../lib/errors';
import { requireFresh } from '../lib/identity';
import { iso } from '../lib/mappers';
import { ANALYTICS_PREFIX, newSecret } from '../lib/tokens';
import { body, param } from '../lib/validate';

export const analyticsRoutes = new Hono<AppEnv>();

const ODATA = '/api/analytics/odata';
const V1 = '/api/analytics/v1';
/**
 * Whether a path is one of the analytics feeds (OData or /v1), which take an analytics key instead of a session.
 */
export const isFeed = (path: string) => path === ODATA || path.startsWith(`${ODATA}/`) || path === V1 || path.startsWith(`${V1}/`);

/** The key a BI tool sent: the password of Basic sign-in, or the address's `key` (Power BI's Web API option). */
export function feedCredential(c: C): string | undefined {
  const basic = /^Basic\s+(\S+)/i.exec(c.req.header('authorization') ?? '')?.[1];
  if (basic) {
    try {
      const pair = atob(basic);
      const pass = pair.slice(pair.indexOf(':') + 1);
      if (pass) return pass;
    } catch {
      return undefined;
    }
  }
  return new URL(c.req.url).searchParams.get('key') ?? undefined;
}

/** 401 with a Basic challenge, so Excel, Power BI and Tableau ask for the key. */
export function feedChallenge(c: C) {
  const locale = (c.get('locale') as Locale) ?? 'en';
  return c.json({ error: { code: 'unauthenticated', message: translate(locale, 'errors.unauthenticated') } }, 401, {
    'www-authenticate': 'Basic realm="Curahold analytics", charset="UTF-8"',
    'cache-control': 'no-store',
  });
}

// ---------------------------------------------------------------- reading

interface Feed {
  sets: Dataset[];
  boardWhere: string | null;
}

async function feedOf(c: C, q: Q): Promise<Feed> {
  // An analytics key or a person: either way the person needs the export permission, as for any file.
  requirePerm(c, 'data.export');
  const locale = c.get('locale') as Locale;
  const all = await catalog({
    q,
    viewer: c.get('auth'),
    locale,
    accountFields: c.get('org').account_fields ?? [],
    about: (set, vars) => translate(locale, `analytics.set.${set}` as MessageKey, vars),
  });
  return allowed(q, all, (c.get('analyticsScope') as KeyScope | undefined) ?? null);
}

/** The query string as the pull log keeps it: without a key, short. */
function cleanQuery(url: URL): string | null {
  const p = new URLSearchParams(url.search);
  p.delete('key');
  const s = decodeURIComponent(p.toString()).slice(0, 1000);
  return s || null;
}

/** Rows the company may still pull today; 429 when the day's budget is used up. */
async function checkBudget(c: C, q: Q) {
  const settings = (c.get('org').settings ?? {}) as { analytics?: { dailyRows?: number } };
  const set = Number(settings.analytics?.dailyRows);
  const max = set > 0 ? set : DAILY_ROWS_DEFAULT;
  const [{ n }] = await q.query<{ n: string }>('select app_analytics_rows_today() as n');
  if (Number(n) >= max) fail('analytics_budget', { max: max.toLocaleString(c.get('locale') as Locale) }, { retryAfter: 3600 });
}

/** Writes the pull down; the activity log gets one line per key (or person), dataset and hour. */
async function logPull(c: C, q: Q, dataset: string, face: 'odata' | 'json' | 'csv', rows: number) {
  const org = c.get('org');
  const auth = c.get('auth');
  const tokenId = c.get('tokenKind') ? auth.sessionId : null;
  const url = new URL(c.req.url);
  const ua = c.req.header('user-agent');
  const tool = toolOf(ua);
  const [{ seen }] = await q.query<{ seen: boolean }>(
    `select exists (select 1 from analytics_pulls where user_id = $1 and token_id is not distinct from $2::uuid and dataset = $3 and at >= date_trunc('hour', now())) as seen`,
    [auth.userId, tokenId, dataset],
  );
  await q.query(`insert into analytics_pulls (org_id, token_id, user_id, dataset, face, rows, query, client) values ($1, $2, $3, $4, $5, $6, $7, $8)`, [
    org.id,
    tokenId,
    auth.userId,
    dataset,
    face,
    rows,
    cleanQuery(url),
    `${tool} ${(ua ?? '').slice(0, 180)}`.trim(),
  ]);
  if (!seen) {
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'analytics.pull', entity: 'org', entityId: org.id, meta: { dataset, face, rows, tool, key: tokenId ?? undefined } });
  }
}

/** The page a request asks for, from OData options or the JSON/CSV face's simpler ones. */
function pageQuery(url: URL, face: 'odata' | 'json' | 'csv', prefer: string | undefined): PageQuery & { track: boolean } {
  const g = (k: string) => url.searchParams.get(k) ?? undefined;
  const int = (v: string | undefined, name: string, max = 10_000_000) => {
    if (v === undefined) return undefined;
    if (!/^\d+$/.test(v) || Number(v) > max) throw new QueryError(`${name} must be a whole number`);
    return Number(v);
  };
  if (face === 'odata') {
    for (const k of url.searchParams.keys()) {
      if (k.startsWith('$') && !['$select', '$filter', '$orderby', '$top', '$skip', '$count', '$skiptoken', '$deltatoken', '$format'].includes(k)) {
        throw new QueryError(`${k} is not supported by this feed`);
      }
    }
    const format = g('$format');
    if (format && !/^(json|application\/json)/i.test(format)) throw new QueryError('$format can only be json');
    const max = /odata\.maxpagesize=(\d+)/i.exec(prefer ?? '')?.[1];
    const token = g('$skiptoken');
    const delta = g('$deltatoken');
    return {
      select: g('$select')?.split(',').map((s) => s.trim()).filter(Boolean),
      filter: g('$filter') || undefined,
      orderby: g('$orderby') || undefined,
      top: int(g('$top'), '$top'),
      skip: int(g('$skip'), '$skip'),
      count: g('$count') === 'true',
      pageSize: max ? Math.min(PAGE_MAX, Number(max)) : undefined,
      token: token ? decodeCursor(token) : null,
      since: delta ? decodeDelta(delta) : null,
      track: /odata\.track-changes/i.test(prefer ?? '') || !!delta,
    };
  }
  const limit = int(g('limit'), 'limit', PAGE_MAX);
  const page = int(g('page'), 'page');
  const offset = int(g('offset'), 'offset');
  const since = g('since');
  const cursor = g('cursor');
  const delta = g('delta');
  if (since && !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,7})?)?(Z|[+-]\d{2}:\d{2})?)?$/.test(since)) throw new QueryError('since must be a date or a date and time');
  const sinceAt = since ? (since.length === 10 ? `${since}T00:00:00Z` : since) : delta ? decodeDelta(delta) : null;
  const skip = page && page > 1 ? (page - 1) * (limit ?? 1000) : offset;
  return {
    select: g('fields')?.split(',').map((s) => s.trim()).filter(Boolean),
    filter: g('filter') || undefined,
    orderby: g('orderby') || undefined,
    skip: cursor ? undefined : skip,
    count: g('count') === '1' || g('count') === 'true',
    pageSize: limit ?? 1000,
    token: cursor ? decodeCursor(cursor) : null,
    since: sinceAt,
    track: true,
  };
}

/** An address as people read it: `$top`, not `%24top`; commas left alone (both are fine in a query). */
const tidy = (u: URL) => u.toString().replace(/%24/g, '$').replace(/%2C/gi, ',');

/** The same address with the next page's token (and what is left of $top), without a key. */
function nextUrl(url: URL, face: 'odata' | 'json' | 'csv', page: Page, started: string): string | null {
  if (!page.next) return null;
  const u = new URL(url.toString());
  u.searchParams.delete('key');
  const token = encodeCursor({ ...page.next, s: page.next.s ?? started });
  if (face === 'odata') {
    u.searchParams.delete('$skip');
    u.searchParams.set('$skiptoken', token);
    if (page.topLeft !== undefined) u.searchParams.set('$top', String(page.topLeft));
    u.searchParams.delete('$count');
  } else {
    for (const k of ['page', 'offset', 'count']) u.searchParams.delete(k);
    u.searchParams.set('cursor', token);
  }
  return tidy(u);
}

/** After the last page: the address that later returns only what changed since this read began. */
function deltaUrl(url: URL, face: 'odata' | 'json' | 'csv', started: string): string {
  const u = new URL(url.toString());
  for (const k of ['key', '$skip', '$skiptoken', '$top', '$count', '$deltatoken', 'page', 'offset', 'cursor', 'since', 'count', 'delta']) u.searchParams.delete(k);
  u.searchParams.set(face === 'odata' ? '$deltatoken' : 'delta', encodeDelta(new Date(started)));
  return tidy(u);
}

/** Answers a feed request; a query the feed cannot read is a 400 that says why. */
async function answer(c: C, face: 'odata' | 'json' | 'csv', fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    const locale = (c.get('locale') as Locale) ?? 'en';
    const err = e instanceof QueryError ? new HttpError('analytics_query', { detail: e.message }) : e instanceof HttpError ? e : null;
    if (!err) throw e;
    const message = translate(locale, err.key, err.vars, c.get('org')?.terms);
    const headers: Record<string, string> = { 'cache-control': 'no-store' };
    if (typeof err.extra.retryAfter === 'number') headers['retry-after'] = String(err.extra.retryAfter);
    if (face === 'odata') headers['odata-version'] = '4.0';
    return c.json(face === 'odata' ? { error: { code: err.code, message } } : { error: err.code, message }, err.status as 400 | 401 | 403 | 404 | 429, headers);
  }
}

const odataHeaders = { 'odata-version': '4.0', 'cache-control': 'no-store' };
const baseOf = (c: C) => `${new URL(c.req.url).origin}${ODATA}/`;

async function readSet(c: C, face: 'odata' | 'json' | 'csv', name: string) {
  const url = new URL(c.req.url);
  const pq = pageQuery(url, face, c.req.header('prefer'));
  const started = pq.token?.s ?? new Date().toISOString();
  const out = await run(c, async (q) => {
    const feed = await feedOf(c, q);
    const set = feed.sets.find((d) => d.name === name);
    if (!set) return fail('not_found');
    await checkBudget(c, q);
    const page = await readPage(q, set, pq, feed.boardWhere);
    await logPull(c, q, set.name, face, page.rows.length);
    return { set, page };
  });
  return { ...out, url, pq, started };
}

// OData: the service document, $metadata, and each entity set.
const serviceDocument = (c: C) =>
  answer(c, 'odata', async () => {
    const feed = await run(c, (q) => feedOf(c, q));
    return c.json({ '@odata.context': `${baseOf(c)}$metadata`, value: feed.sets.map((d) => ({ name: d.name, kind: 'EntitySet', url: d.name })) }, 200, odataHeaders);
  });
// With or without the last slash: people paste it either way.
analyticsRoutes.get('/analytics/odata', serviceDocument);
/** The OData service document for BI tools (Power BI, Excel): the datasets this analytics key may read. */
analyticsRoutes.get('/analytics/odata/', serviceDocument);
/** One OData entity set (or `$metadata`), paged, within the key's own datasets and departments. */
analyticsRoutes.get('/analytics/odata/:set', (c) =>
  answer(c, 'odata', async () => {
    const name = c.req.param('set');
    if (name === '$metadata') {
      const feed = await run(c, (q) => feedOf(c, q));
      return c.body(metadataXml(feed.sets), 200, { ...odataHeaders, 'content-type': 'application/xml; charset=utf-8' });
    }
    const { set, page, url, pq, started } = await readSet(c, 'odata', name);
    const next = nextUrl(url, 'odata', page, started);
    const doc: Record<string, unknown> = { '@odata.context': `${baseOf(c)}$metadata#${set.name}${pq.select?.length ? `(${page.props.map((p) => p.name).join(',')})` : ''}` };
    if (page.count !== undefined) doc['@odata.count'] = page.count;
    doc.value = page.rows;
    if (next) doc['@odata.nextLink'] = next;
    else if (pq.track) doc['@odata.deltaLink'] = deltaUrl(url, 'odata', started);
    const headers: Record<string, string> = { ...odataHeaders };
    if (pq.pageSize) headers['preference-applied'] = `odata.maxpagesize=${pq.pageSize}`;
    return c.json(doc, 200, headers);
  }),
);
// `/Tasks/$count`: the number of rows, as plain text.
analyticsRoutes.get('/analytics/odata/:set/:sub', (c) =>
  answer(c, 'odata', async () => {
    if (c.req.param('sub') !== '$count') fail('not_found');
    const url = new URL(c.req.url);
    const pq = pageQuery(url, 'odata', undefined);
    const n = await run(c, async (q) => {
      const feed = await feedOf(c, q);
      const set = feed.sets.find((d) => d.name === c.req.param('set'));
      if (!set) return fail('not_found');
      const page = await readPage(q, set, { ...pq, count: true, top: 0 }, feed.boardWhere);
      return page.count ?? 0;
    });
    return c.text(String(n), 200, { ...odataHeaders, 'content-type': 'text/plain; charset=utf-8' });
  }),
);

// JSON and CSV: the list of datasets with their columns, then each one as a file.
const datasetList = (c: C) =>
  answer(c, 'json', async () => {
    const feed = await run(c, (q) => feedOf(c, q));
    const origin = new URL(c.req.url).origin;
    return c.json(
      {
        datasets: feed.sets.map((d) => ({ ...infoOf(d), json: `${origin}${V1}/${d.name}.json`, csv: `${origin}${V1}/${d.name}.csv` })),
        odata: `${origin}${ODATA}/`,
      },
      200,
      { 'cache-control': 'no-store' },
    );
  });
/** The plain JSON feed's list of datasets this key may read. */
analyticsRoutes.get('/analytics/v1', datasetList);
/** Same as GET /analytics/v1 (BI tools differ on the trailing slash). */
analyticsRoutes.get('/analytics/v1/', datasetList);
/**
 * One dataset as `<name>.json` (paged, with a delta cursor) or `<name>.csv`; 404 for an unknown name. Never cached.
 */
analyticsRoutes.get('/analytics/v1/:file', (c) => {
  const m = /^([A-Za-z][A-Za-z0-9]{0,79})\.(json|csv)$/.exec(c.req.param('file'));
  const face = (m?.[2] ?? 'json') as 'json' | 'csv';
  return answer(c, face, async () => {
    if (!m) return fail('not_found');
    const { set, page, url, started } = await readSet(c, face, m[1]);
    const next = nextUrl(url, face, page, started);
    const delta = next ? null : deltaUrl(url, face, started);
    if (face === 'csv') {
      const headers: Record<string, string> = { 'content-type': 'text/csv; charset=utf-8', 'cache-control': 'no-store', 'x-curahold-rows': String(page.rows.length) };
      if (next) headers.link = `<${next}>; rel="next"`;
      if (page.count !== undefined) headers['x-curahold-count'] = String(page.count);
      return c.body(csvOf(page.props, page.rows), 200, headers);
    }
    return c.json({ dataset: set.name, ...(page.count !== undefined ? { count: page.count } : {}), rows: page.rows, next, delta }, 200, { 'cache-control': 'no-store' });
  });
});

const infoOf = (d: Dataset): AnalyticsDatasetInfo => ({
  name: d.name,
  about: d.about,
  departments: d.departments === 'boards' ? 'boards' : [...d.departments],
  columns: d.props.map((p) => ({ name: p.name, type: p.type.replace('Edm.', '') })),
});

// ---------------------------------------------------------------- analytics keys (Settings → Analytics)

const KEY_COLS = `t.id, t.name, t.prefix, t.user_id, t.datasets, t.departments, t.created_at, t.expires_at, t.last_used_at, t.rotated_at,
  coalesce(p.pulls, 0) as pulls, coalesce(p.rows, 0) as rows, p.last_tool, p.last_at`;
const PULLS_30 = `left join lateral (
    select count(*)::int as pulls, coalesce(sum(x.rows), 0)::bigint as rows, max(x.at) as last_at,
           (select split_part(y.client, ' ', 1) from analytics_pulls y where y.token_id = t.id order by y.at desc limit 1) as last_tool
      from analytics_pulls x where x.token_id = t.id and x.at > now() - interval '30 days') p on true`;

const toKey = (r: Row): AnalyticsKeyInfo => ({
  id: r.id,
  name: r.name,
  prefix: r.prefix,
  userId: r.user_id,
  datasets: r.datasets ?? null,
  departments: r.departments ?? null,
  createdAt: iso(r.created_at) ?? '',
  expiresAt: iso(r.expires_at),
  lastUsedAt: iso(r.last_used_at),
  rotatedAt: iso(r.rotated_at),
  pulls: Number(r.pulls ?? 0),
  rows: Number(r.rows ?? 0),
  lastTool: r.last_tool || null,
  lastPullAt: iso(r.last_at),
});

const managesAll = (c: C) => {
  const perms = c.get('auth').perms as string[];
  return perms.includes('users.manage') || perms.includes('org.manage');
};
/** Keys are made and changed in the app, by a person: never with another key. */
const notWithAKey = (c: C) => {
  if (c.get('tokenKind')) fail('forbidden');
};

/** Your analytics keys; with ?scope=all, the company's (for people who manage people). */
analyticsRoutes.get('/dev/analytics/keys', async (c) => {
  notWithAKey(c);
  const auth = c.get('auth');
  const all = c.req.query('scope') === 'all' && managesAll(c);
  const rows = await run(c, (q) =>
    q.query(
      `select ${KEY_COLS} from api_tokens t ${PULLS_30}
        where t.kind = 'analytics' and t.revoked_at is null and ($1 or t.user_id = $2) order by t.created_at desc limit 500`,
      [all, auth.userId],
    ),
  );
  return c.json({ keys: rows.map(toKey) });
});

/** The datasets the person could put on a key, with their columns (what the key's owner may see). */
analyticsRoutes.get('/dev/analytics/datasets', async (c) => {
  notWithAKey(c);
  const sets = await run(c, async (q) => (await feedOf(c, q)).sets);
  const origin = new URL(c.req.url).origin;
  return c.json({ datasets: sets.map(infoOf), odata: `${origin}${ODATA}/`, json: `${origin}${V1}/` });
});

const keyInput = z.object({
  name: z.string().trim().min(1).max(80),
  datasets: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,79}$/)).min(1).max(100).nullable().default(null),
  departments: z.array(z.enum(ANALYTICS_DEPARTMENTS)).min(1).max(6).nullable().default(null),
  expiresInDays: z.number().int().min(1).max(730).default(365),
});

/**
 * Creates an analytics key limited to chosen datasets and departments. Needs data.export and a recent sign-in, and
 * cannot be done with a key (a key may not mint keys). Only datasets the person can read now; audited. The key is
 * shown once and stored only as a hash.
 */
analyticsRoutes.post('/dev/analytics/keys', async (c) => {
  notWithAKey(c);
  requirePerm(c, 'data.export');
  await requireFresh(c);
  const input = await body(c, keyInput);
  const auth = c.get('auth');
  const org = c.get('org');
  const s = await newSecret(ANALYTICS_PREFIX);
  const row = await run(c, async (q) => {
    // Only datasets this person can read now; a name that is not one is a mistake, not a wish for later.
    if (input.datasets) {
      const names = new Set((await feedOf(c, q)).sets.map((d) => d.name));
      const unknown = input.datasets.filter((d) => !names.has(d));
      if (unknown.length) fail('validation', { fields: 'datasets' }, { fields: ['datasets'], unknown });
    }
    const [r] = await q.query(
      `insert into api_tokens (org_id, user_id, kind, name, token_hash, can_write, prefix, expires_at, datasets, departments)
       values ($1, $2, 'analytics', $3, $4, false, $5, now() + make_interval(days => $6::int), $7, $8) returning *`,
      [org.id, auth.userId, input.name, s.hash, s.shown, input.expiresInDays, input.datasets ? [...new Set(input.datasets)] : null, input.departments ? [...new Set(input.departments)] : null],
    );
    await audit(q, {
      orgId: org.id,
      actorId: auth.userId,
      action: 'analytics_key.created',
      entity: 'api_key',
      entityId: r.id,
      meta: { name: input.name, datasets: input.datasets ?? 'all', departments: input.departments ?? 'all', days: input.expiresInDays },
    });
    return r;
  });
  // The only time the key is shown.
  return c.json({ key: toKey(row), token: s.token }, 201);
});

/** A new secret for the same key (name, limits and history stay); the old one stops at once. Only its owner. */
analyticsRoutes.post('/dev/analytics/keys/:id/rotate', async (c) => {
  notWithAKey(c);
  requirePerm(c, 'data.export');
  await requireFresh(c);
  const id = param(c, 'id');
  const auth = c.get('auth');
  const org = c.get('org');
  const s = await newSecret(ANALYTICS_PREFIX);
  const row = await run(c, async (q) => {
    const [r] = await q.query(
      `update api_tokens set token_hash = $3, prefix = $4, rotated_at = now(), last_used_at = null
        where id = $1 and user_id = $2 and kind = 'analytics' and revoked_at is null and expires_at > now() returning *`,
      [id, auth.userId, s.hash, s.shown],
    );
    if (!r) fail('not_found');
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'analytics_key.rotated', entity: 'api_key', entityId: id, meta: { name: r.name } });
    return r;
  });
  return c.json({ key: toKey(row), token: s.token });
});

/** Revoke: the owner, or someone who manages people (row-level security decides which keys they reach). */
analyticsRoutes.delete('/dev/analytics/keys/:id', async (c) => {
  notWithAKey(c);
  const id = param(c, 'id');
  const auth = c.get('auth');
  const org = c.get('org');
  await run(c, async (q) => {
    const r = await q.query(`update api_tokens set revoked_at = now() where id = $1 and kind = 'analytics' and revoked_at is null returning id, name, user_id`, [id]);
    if (!r.length) fail('not_found');
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'analytics_key.revoked', entity: 'api_key', entityId: id, meta: { name: r[0].name, owner: r[0].user_id } });
  });
  return c.json({ ok: true });
});

/** The latest pulls: your own, or the company's for people who manage people. */
analyticsRoutes.get('/dev/analytics/pulls', async (c) => {
  notWithAKey(c);
  const auth = c.get('auth');
  const all = managesAll(c);
  const rows = await run(c, (q) =>
    q.query(`select at, user_id, token_id, dataset, face, rows, split_part(client, ' ', 1) as tool from analytics_pulls where ($1 or user_id = $2) order by at desc limit 100`, [all, auth.userId]),
  );
  const pulls: AnalyticsPullInfo[] = rows.map((r) => ({ at: iso(r.at) ?? '', userId: r.user_id ?? null, keyId: r.token_id ?? null, dataset: r.dataset, face: r.face, rows: Number(r.rows), tool: r.tool || 'unknown' }));
  return c.json({ pulls });
});
