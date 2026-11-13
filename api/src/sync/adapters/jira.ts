// Jira Cloud, two-way, for product and project work: Jira issues become Curahold
// project tasks, Jira epics become epics (tasks with issue type "epic") and Jira
// sprints become sprints on a Curahold board.
//
//   issues  → tasks    summary, description, status (the board column), assignee, due date,
//                      story points, epic, sprint, issue type
//   epics   → tasks    the same, issue type "epic"
//   sprints → sprints  name, goal, state, start and end
//
// Reads are incremental: a JQL query for what was updated since the last run (in the
// signed-in user's own time zone, which is how JQL reads a date), paged with the
// token-based search. A status change made in Curahold goes out through Jira's workflow
// transitions, never as a field write: Jira only lets an issue move along a transition,
// so the one that leads to the wanted status (by name, else by status category) is taken.
// Descriptions are Atlassian Document Format on the wire and plain text with light
// markdown here (lib/adf.ts).
//
// Signing in: Atlassian Cloud OAuth 2.0 (3LO) where this server has an app registration
// (JIRA_CLIENT_ID / JIRA_CLIENT_SECRET), else — or as the administrator's choice — an
// API token with the account's email and the site's address. Jira Data Center and Server
// are out of scope: they have no 3LO, a different REST surface and no cloud id.
import { adfToText, textToAdf } from '../../lib/adf';
import type { RemoteField, RemoteObject, RemoteUser, SyncConfig } from '../../../../shared/src/sync';
import { codeGrantJson, CrmError, oneShotCtx, type CrmAdapter, type CrmCtx, type Page, type RemoteRow } from './types';

const AUTH = 'https://auth.atlassian.com';
const PAGE = 100;
/** Jira's classic scopes; offline_access is what gives a refresh token. */
export const JIRA_SCOPES = ['read:jira-work', 'write:jira-work', 'read:jira-user', 'offline_access'];

// ------------------------------------------------------------------ requests

async function failure(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  try {
    const j = JSON.parse(text);
    const first = j?.errorMessages?.[0] ?? (j?.errors ? Object.values(j.errors)[0] : null) ?? j?.message ?? j?.error_description ?? j?.error;
    if (first) return String(first).slice(0, 300);
  } catch {
    // not JSON
  }
  return (text || res.statusText || `HTTP ${res.status}`).slice(0, 300);
}

/**
 * One request to Jira. OAuth connections send their access token as a bearer and renew it once if Jira says it
 * expired; API-token connections store the whole Authorization value ("Basic …") and have nothing to renew.
 */
export async function jx(ctx: CrmCtx, path: string, init: RequestInit & { json?: unknown } = {}): Promise<any> {
  const url = path.startsWith('http') ? path : `${ctx.config.base}${path}`;
  const basic = ctx.config.mode === 'basic';
  const send = async (value: string) => {
    const headers = new Headers(init.headers);
    headers.set('authorization', basic ? value : `Bearer ${value}`);
    headers.set('accept', 'application/json');
    let body = init.body;
    if (init.json !== undefined) {
      headers.set('content-type', 'application/json');
      body = JSON.stringify(init.json);
    }
    return ctx.fetch(url, { ...init, headers, body });
  };
  let res = await send(await ctx.token());
  if (res.status === 401 && !basic) res = await send(await ctx.refresh());
  if (res.status === 429 || res.status === 503) {
    const after = Number(res.headers.get('retry-after') ?? 60);
    throw new CrmError(await failure(res), res.status, Number.isFinite(after) ? after : 60);
  }
  if (res.status === 401) throw new CrmError(await failure(res), 401, undefined, true);
  if (!res.ok) throw new CrmError(await failure(res), res.status);
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const basicAuth = (email: string, token: string) => `Basic ${btoa(`${email}:${token}`)}`;

// ------------------------------------------------------------- site knowledge

interface SiteFacts {
  storyPoints: string | null;
  sprint: string | null;
  epicLink: string | null;
  epicName: string | null;
  /** Issue type ids at the epic level of the hierarchy. */
  epicTypes: string[];
  timeZone: string;
  at: number;
}
const facts = new Map<string, SiteFacts>();
const FACTS_TTL = 10 * 60_000;

/** Custom field ids (story points, sprint, epic link), the epic issue types and the user's time zone: they differ per site. */
export async function siteFacts(ctx: CrmCtx): Promise<SiteFacts> {
  const key = String(ctx.config.base);
  const hit = facts.get(key);
  if (hit && ctx.now().getTime() - hit.at < FACTS_TTL) return hit;
  const fields: any[] = (await jx(ctx, '/rest/api/3/field')) ?? [];
  const byCustom = (c: string) => fields.find((f) => f.schema?.custom === c)?.id ?? null;
  const points = fields.find((f) => f.name === 'Story point estimate') ?? fields.find((f) => f.name === 'Story Points');
  let epicTypes: string[] = [];
  try {
    const types: any[] = (await jx(ctx, '/rest/api/3/issuetype')) ?? [];
    epicTypes = [...new Set(types.filter((t) => t.hierarchyLevel === 1).map((t) => String(t.id)))];
  } catch {
    // Without the list, "Epic" by name stands in.
  }
  let timeZone = 'UTC';
  try {
    timeZone = (await jx(ctx, '/rest/api/3/myself'))?.timeZone || 'UTC';
  } catch {
    // UTC
  }
  const out: SiteFacts = {
    storyPoints: points?.id ?? null,
    sprint: byCustom('com.pyxis.greenhopper.jira:gh-sprint'),
    epicLink: byCustom('com.pyxis.greenhopper.jira:gh-epic-link'),
    epicName: byCustom('com.pyxis.greenhopper.jira:gh-epic-label'),
    epicTypes,
    timeZone,
    at: ctx.now().getTime(),
  };
  facts.set(key, out);
  return out;
}

/** JQL reads a date in the signed-in user's time zone, to the minute: "2026/11/14 13:05". One minute back, to be safe. */
export function jqlTime(iso: string, timeZone: string): string {
  const d = new Date(new Date(iso).getTime() - 60_000);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

const lc = (s: unknown) => String(s ?? '').trim().toLowerCase();
const isoOrNull = (v: unknown) => {
  if (!v) return null;
  const t = new Date(String(v));
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
};

// -------------------------------------------------------------------- mapping

/** Jira's issue type name → Curahold's issue type key. */
export function issueTypeKey(name: unknown, subtask = false, level?: number): string {
  const n = lc(name);
  if (level === 1 || n === 'epic') return 'epic';
  if (subtask || /sub-?task/.test(n)) return 'subtask';
  if (/story/.test(n)) return 'story';
  if (/bug|defect/.test(n)) return 'bug';
  if (/spike|research/.test(n)) return 'spike';
  return 'task';
}

/** Which of an issue's sprints is "the" sprint here (a task is in one): the running one, else the next, else the latest finished. */
export function pickSprint(list: any[] | null | undefined): string | null {
  const sprints = (Array.isArray(list) ? list : []).filter((s) => s && s.id !== undefined);
  if (!sprints.length) return null;
  const by = (state: string) => sprints.filter((s) => lc(s.state) === state);
  const pick = by('active')[0] ?? by('future').sort((a, b) => Number(a.id) - Number(b.id))[0] ?? by('closed').sort((a, b) => String(b.completeDate ?? '').localeCompare(String(a.completeDate ?? '')) || Number(b.id) - Number(a.id))[0];
  return pick ? String(pick.id) : null;
}

async function statusOptions(ctx: CrmCtx): Promise<{ value: string; label: string }[]> {
  try {
    const list: any[] = (await jx(ctx, '/rest/api/3/status')) ?? [];
    const seen = new Set<string>();
    return list.filter((s) => (seen.has(s.name) ? false : seen.add(s.name))).map((s) => ({ value: s.name, label: s.name }));
  } catch {
    return [];
  }
}

const KEYS = ['epic', 'story', 'task', 'bug', 'subtask', 'spike'];
const TYPE_OPTIONS = KEYS.map((k) => ({ value: k, label: k }));

async function issueFields(ctx: CrmCtx, epics: boolean): Promise<RemoteField[]> {
  const f = await siteFacts(ctx);
  const out: RemoteField[] = [
    { name: 'id', label: 'ID', type: 'id', updatable: false },
    { name: 'key', label: 'Key', type: 'text', updatable: false },
    { name: 'summary', label: 'Summary', type: 'text', updatable: true, createable: true, required: true },
    { name: 'description', label: 'Description', type: 'textarea', updatable: true, createable: true },
    { name: 'status', label: 'Status', type: 'select', options: await statusOptions(ctx), updatable: true, createable: true, extra: { transition: true } },
    // Curahold's own words for the type; only used when an issue is created from here (an issue is not moved to another type).
    { name: 'issuetype', label: 'Issue type', type: 'select', options: TYPE_OPTIONS, updatable: false, createable: true },
    { name: 'assignee', label: 'Assignee', type: 'user', updatable: true, createable: true },
    { name: 'duedate', label: 'Due date', type: 'date', updatable: true, createable: true },
  ];
  if (!epics) {
    out.push(
      { name: 'story_points', label: 'Story points', type: 'number', updatable: !!f.storyPoints, createable: !!f.storyPoints },
      { name: 'epic', label: 'Epic', type: 'ref', refTo: ['epics'], updatable: true, createable: true },
      { name: 'sprint', label: 'Sprint', type: 'ref', refTo: ['sprints'], updatable: true, createable: true },
    );
  }
  out.push(
    { name: 'created', label: 'Created', type: 'datetime', updatable: false },
    { name: 'updated', label: 'Updated', type: 'datetime', updatable: false },
    { name: 'link', label: 'Link', type: 'url', updatable: false },
  );
  return out;
}

const SPRINT_FIELDS: RemoteField[] = [
  { name: 'id', label: 'ID', type: 'id', updatable: false },
  { name: 'name', label: 'Name', type: 'text', updatable: true, createable: true, required: true },
  { name: 'goal', label: 'Goal', type: 'textarea', updatable: true, createable: true },
  { name: 'state', label: 'State', type: 'select', options: ['future', 'active', 'closed'].map((v) => ({ value: v, label: v })), updatable: true },
  { name: 'startDate', label: 'Start', type: 'datetime', updatable: true, createable: true },
  { name: 'endDate', label: 'End', type: 'datetime', updatable: true, createable: true },
  { name: 'completeDate', label: 'Completed', type: 'datetime', updatable: false },
];

/** The shape Jira returns for an issue → what the engine maps. `epicKeys` resolves legacy "Epic Link" keys to ids. */
export function issueRow(ctx: Pick<CrmCtx, 'config'>, i: any, f: SiteFacts, epicIds: Map<string, string> = new Map()): RemoteRow {
  const x = i.fields ?? {};
  const parent = x.parent;
  const parentIsEpic = parent && (parent.fields?.issuetype?.hierarchyLevel === 1 || lc(parent.fields?.issuetype?.name) === 'epic');
  const legacy = f.epicLink ? x[f.epicLink] : null;
  const points = f.storyPoints ? x[f.storyPoints] : null;
  const site = String(ctx.config.siteUrl ?? '').replace(/\/$/, '');
  return {
    id: String(i.id),
    modifiedAt: isoOrNull(x.updated),
    values: {
      id: String(i.id),
      key: i.key ?? null,
      summary: String(x.summary ?? '').trim() || String(i.key ?? i.id),
      description: adfToText(x.description),
      status: x.status?.name ?? null,
      __statusCategory: x.status?.statusCategory?.key ?? null,
      issuetype: issueTypeKey(x.issuetype?.name, !!x.issuetype?.subtask, x.issuetype?.hierarchyLevel),
      assignee: x.assignee?.accountId ?? null,
      duedate: x.duedate ?? null,
      story_points: typeof points === 'number' ? points : null,
      epic: parentIsEpic ? String(parent.id) : legacy ? (epicIds.get(String(legacy)) ?? null) : null,
      sprint: f.sprint ? pickSprint(x[f.sprint]) : null,
      created: isoOrNull(x.created),
      updated: isoOrNull(x.updated),
      link: site && i.key ? `${site}/browse/${i.key}` : null,
    },
  };
}

// ------------------------------------------------------------------ the adapter

const epicClause = (f: SiteFacts, epics: boolean) => (f.epicTypes.length ? `issuetype ${epics ? 'in' : 'not in'} (${f.epicTypes.join(',')})` : `issuetype ${epics ? '=' : '!='} Epic`);

/** Legacy company-managed projects give an issue's epic as its key; the engine links by id. */
async function epicIdsFor(ctx: CrmCtx, keys: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(keys)].slice(0, 100);
  if (!unique.length) return out;
  const j = await jx(ctx, '/rest/api/3/search/jql', { method: 'POST', json: { jql: `key in (${unique.map((k) => `"${k}"`).join(',')})`, fields: ['summary'], maxResults: PAGE } });
  for (const i of j?.issues ?? []) out.set(String(i.key), String(i.id));
  return out;
}

async function boardIds(ctx: CrmCtx): Promise<number[]> {
  if (Array.isArray(ctx.config.boardIds) && ctx.config.boardIds.length) return ctx.config.boardIds.map(Number);
  const ids = new Set<number>();
  for (const k of (ctx.config.projects ?? []).slice(0, 10)) {
    try {
      const j = await jx(ctx, `/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(k)}&type=scrum&maxResults=50`);
      for (const b of j?.values ?? []) ids.add(Number(b.id));
    } catch (e) {
      // A project without Jira Software boards has no sprints.
      if (!(e instanceof CrmError) || (e.status !== 400 && e.status !== 403 && e.status !== 404)) throw e;
    }
  }
  return [...ids];
}

function sprintRow(s: any): RemoteRow {
  return {
    id: String(s.id),
    modifiedAt: null,
    values: { id: String(s.id), name: String(s.name ?? '').trim() || `Sprint ${s.id}`, goal: s.goal ?? '', state: lc(s.state) || 'future', startDate: isoOrNull(s.startDate), endDate: isoOrNull(s.endDate), completeDate: isoOrNull(s.completeDate) },
  };
}

async function listSprints(ctx: CrmCtx, cursor: string | null): Promise<Page> {
  const boards = await boardIds(ctx);
  // The cursor is "board index:start".
  let [bi, start] = (cursor ?? '0:0').split(':').map(Number);
  while (bi < boards.length) {
    try {
      const j = await jx(ctx, `/rest/agile/1.0/board/${boards[bi]}/sprint?startAt=${start}&maxResults=50`);
      const rows = (j?.values ?? []).map(sprintRow);
      const more = j?.isLast === false;
      const next = more ? `${bi}:${start + (j.values?.length || 50)}` : bi + 1 < boards.length ? `${bi + 1}:0` : null;
      return { rows, next };
    } catch (e) {
      // A kanban board has no sprints.
      if (!(e instanceof CrmError) || e.status !== 400) throw e;
      bi++;
      start = 0;
    }
  }
  return { rows: [], next: null };
}

/** An issue type's id on a project, for Curahold's key. */
async function createType(ctx: CrmCtx, project: string, key: string): Promise<string> {
  const p = await jx(ctx, `/rest/api/3/project/${encodeURIComponent(project)}`);
  const types: any[] = p?.issueTypes ?? [];
  const top = types.filter((t) => !t.subtask);
  const find = (re: RegExp) => top.find((t) => re.test(lc(t.name)));
  const hit =
    key === 'epic' ? (top.find((t) => t.hierarchyLevel === 1) ?? find(/^epic$/)) : key === 'story' ? find(/story/) : key === 'bug' ? find(/bug|defect/) : key === 'spike' ? find(/spike|research/) : find(/^task$/);
  const fallback = hit ?? find(/^task$/) ?? top.find((t) => (t.hierarchyLevel ?? 0) === 0) ?? top[0];
  if (!fallback) throw new CrmError(`Project ${project} has no issue type an issue can be created with`);
  return String(fallback.id);
}

const dateOnly = (v: unknown) => (v ? String(v).slice(0, 10) : null);
const sprintDate = (v: unknown) => (v ? (String(v).length === 10 ? `${v}T09:00:00.000Z` : new Date(String(v)).toISOString()) : null);

/** A status change goes out as the workflow transition that leads to it. */
export async function transitionTo(ctx: CrmCtx, id: string, want: unknown): Promise<void> {
  const w = (typeof want === 'string' ? { name: want } : (want ?? {})) as { name?: string; category?: string };
  if (!w.name && !w.category) return;
  const cur = await jx(ctx, `/rest/api/3/issue/${encodeURIComponent(id)}?fields=status`);
  const now = cur?.fields?.status;
  if (w.name && lc(now?.name) === lc(w.name)) return;
  const j = await jx(ctx, `/rest/api/3/issue/${encodeURIComponent(id)}/transitions`);
  const list: any[] = j?.transitions ?? [];
  const byName = w.name ? list.find((t) => lc(t.to?.name) === lc(w.name)) : undefined;
  // No status of that name here: the same kind of status will do (any "in progress" for "in review").
  if (!byName && w.category && now?.statusCategory?.key === w.category) return;
  // Several statuses of that kind: the one whose name shares a word with the wanted one ("Code review" → "In Review").
  const words = new Set(lc(w.name).split(/[^\p{L}\p{N}]+/u).filter((x) => x.length > 2));
  const share = (t: any) => lc(t.to?.name).split(/[^\p{L}\p{N}]+/u).filter((x) => words.has(x)).length;
  const sameKind = w.category ? list.filter((t) => t.to?.statusCategory?.key === w.category) : [];
  const hit = byName ?? [...sameKind].sort((a, b) => share(b) - share(a))[0];
  if (!hit) throw new CrmError(`Jira has no transition from "${now?.name ?? '?'}" to "${w.name ?? w.category}"`);
  await jx(ctx, `/rest/api/3/issue/${encodeURIComponent(id)}/transitions`, { method: 'POST', json: { transition: { id: hit.id } } });
}

async function moveToSprint(ctx: CrmCtx, id: string, sprint: unknown): Promise<void> {
  if (sprint === undefined) return;
  if (sprint === null || sprint === '') await jx(ctx, '/rest/agile/1.0/backlog/issue', { method: 'POST', json: { issues: [id] } });
  else await jx(ctx, `/rest/agile/1.0/sprint/${encodeURIComponent(String(sprint))}/issue`, { method: 'POST', json: { issues: [id] } });
}

/** Curahold's values → Jira's `fields` for an issue (what is a plain field write; status and sprint are not). */
async function issueFieldsOut(ctx: CrmCtx, v: Record<string, unknown>): Promise<Record<string, unknown>> {
  const f = await siteFacts(ctx);
  const out: Record<string, unknown> = {};
  if (typeof v.summary === 'string' && v.summary.trim()) out.summary = v.summary.trim().slice(0, 255);
  if ('description' in v) out.description = v.description ? textToAdf(String(v.description)) : null;
  if ('assignee' in v) out.assignee = v.assignee ? { accountId: String(v.assignee) } : null;
  if ('duedate' in v) out.duedate = dateOnly(v.duedate);
  if ('story_points' in v && f.storyPoints) out[f.storyPoints] = v.story_points === null || v.story_points === '' ? null : Number(v.story_points);
  return out;
}

async function setEpic(ctx: CrmCtx, id: string, epicId: unknown): Promise<void> {
  const put = (fields: Record<string, unknown>) => jx(ctx, `/rest/api/3/issue/${encodeURIComponent(id)}`, { method: 'PUT', json: { fields } });
  try {
    await put({ parent: epicId ? { id: String(epicId) } : null });
  } catch (e) {
    // Older company-managed projects link by "Epic Link" (the epic's key), not by parent.
    const f = await siteFacts(ctx);
    if (!(e instanceof CrmError) || e.status !== 400 || !f.epicLink) throw e;
    const key = epicId ? (await jx(ctx, `/rest/api/3/issue/${encodeURIComponent(String(epicId))}?fields=summary`))?.key : null;
    await put({ [f.epicLink]: key ?? null });
  }
}

export const jira: CrmAdapter = {
  provider: 'jira',
  tabular: false,

  oauth: {
    authorizeUrl(client, redirectUri, state) {
      const u = new URL(`${AUTH}/authorize`);
      u.searchParams.set('audience', 'api.atlassian.com');
      u.searchParams.set('client_id', client.clientId);
      u.searchParams.set('scope', JIRA_SCOPES.join(' '));
      u.searchParams.set('redirect_uri', redirectUri);
      u.searchParams.set('state', state);
      u.searchParams.set('response_type', 'code');
      // Without it Atlassian does not hand out a refresh token a second time.
      u.searchParams.set('prompt', 'consent');
      return u.toString();
    },
    async exchange(fetcher, client, code, redirectUri, _opts, now) {
      const j = await codeGrantJson(fetcher, `${AUTH}/oauth/token`, client, code, redirectUri, now);
      const sites = await oneShotJson(fetcher, 'https://api.atlassian.com/oauth/token/accessible-resources', j.access_token);
      const site = (Array.isArray(sites) ? sites : []).find((s: any) => (s.scopes ?? []).some((x: string) => /jira/.test(x))) ?? sites?.[0];
      if (!site?.id) throw new CrmError('This Atlassian account has no Jira Cloud site Curahold may use');
      const host = String(site.url ?? '').replace(/^https?:\/\//, '');
      return {
        secret: { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: j.expiresAt },
        config: { mode: 'oauth', cloudId: site.id, siteUrl: site.url, base: `https://api.atlassian.com/ex/jira/${site.id}` },
        label: host || site.name || 'Jira',
        instanceId: String(site.id),
      };
    },
  },

  /** An API token (email + token + site) for servers without an Atlassian app registration, or by choice. */
  keyed: {
    async connect(fetcher, values) {
      const site = (values.site ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\.atlassian\.net.*$/, '').replace(/\/.*$/, '');
      if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(site)) throw new CrmError('Enter the Atlassian address, e.g. yourcompany');
      const email = (values.email ?? '').trim();
      const auth = basicAuth(email, (values.token ?? '').trim());
      const siteUrl = `https://${site}.atlassian.net`;
      const ctx = { ...oneShotCtx(fetcher, new Date(), auth, { mode: 'basic', base: siteUrl, siteUrl }) };
      const me = await jx(ctx, '/rest/api/3/myself');
      if (!me?.accountId) throw new CrmError('That email and API token do not open this Atlassian site', 401, undefined, true);
      // The cloud id makes the same site, reached by token or by sign-in, one connection.
      let cloudId: string | null = null;
      try {
        const res = await fetcher(`${siteUrl}/_edge/tenant_info`);
        cloudId = res.ok ? ((await res.json()) as any)?.cloudId ?? null : null;
      } catch {
        // The site name stands in.
      }
      return { secret: { accessToken: auth }, config: { mode: 'basic', site, email, siteUrl, base: siteUrl, ...(cloudId ? { cloudId } : {}) }, label: `${site}.atlassian.net`, instanceId: cloudId ?? site };
    },
  },

  async refresh(ctx, secret, client) {
    if (ctx.config.mode === 'basic' || !secret.refreshToken) throw new CrmError('Reconnect Jira: the sign-in or API token no longer works', 401, undefined, true);
    const res = await ctx.fetch(`${AUTH}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ grant_type: 'refresh_token', client_id: client.clientId, client_secret: client.clientSecret, refresh_token: secret.refreshToken }),
    });
    if (!res.ok) throw new CrmError(await failure(res), res.status, undefined, true);
    const j: any = await res.json();
    if (!j.access_token) throw new CrmError('No access token in the refresh response', res.status, undefined, true);
    // Atlassian rotates refresh tokens: the new one replaces the old.
    return { accessToken: j.access_token, refreshToken: j.refresh_token ?? secret.refreshToken, expiresAt: j.expires_in ? ctx.now().getTime() + Number(j.expires_in) * 1000 : undefined };
  },

  async objects() {
    return [
      { name: 'epics', label: 'Epic', labelPlural: 'Epics', custom: false, hint: 'task' },
      { name: 'issues', label: 'Issue', labelPlural: 'Issues', custom: false, hint: 'task' },
      { name: 'sprints', label: 'Sprint', labelPlural: 'Sprints', custom: false, hint: null },
    ] satisfies RemoteObject[];
  },

  async fields(ctx, object) {
    if (object === 'sprints') return SPRINT_FIELDS;
    return issueFields(ctx, object === 'epics');
  },

  async users(ctx) {
    const keys: string[] = ctx.config.projects ?? [];
    if (!keys.length) return [];
    const out = new Map<string, RemoteUser>();
    let start = 0;
    for (let page = 0; page < 10; page++) {
      const list: any[] = (await jx(ctx, `/rest/api/3/user/assignable/multiProjectSearch?projectKeys=${encodeURIComponent(keys.join(','))}&startAt=${start}&maxResults=100`)) ?? [];
      for (const u of list) if (u.accountType === 'atlassian' && u.active !== false) out.set(u.accountId, { id: u.accountId, name: u.displayName, email: u.emailAddress ? String(u.emailAddress).toLowerCase() : null });
      if (list.length < 100) break;
      start += list.length;
    }
    return [...out.values()];
  },

  async list(ctx, object, opts): Promise<Page> {
    if (object === 'sprints') return listSprints(ctx, opts.cursor);
    const keys: string[] = ctx.config.projects ?? [];
    if (!keys.length) throw new CrmError('Choose the Jira projects to bring over first');
    const f = await siteFacts(ctx);
    const jql = [`project in (${keys.map((k) => `"${k}"`).join(',')})`, epicClause(f, object === 'epics'), ...(opts.since ? [`updated >= "${jqlTime(opts.since, f.timeZone)}"`] : [])].join(' AND ') + ' ORDER BY updated ASC, id ASC';
    const fieldList = ['summary', 'description', 'status', 'issuetype', 'assignee', 'duedate', 'created', 'updated', 'parent', ...[f.storyPoints, f.sprint, f.epicLink].filter((x): x is string => !!x)];
    const j = await jx(ctx, '/rest/api/3/search/jql', { method: 'POST', json: { jql, fields: fieldList, maxResults: PAGE, ...(opts.cursor ? { nextPageToken: opts.cursor } : {}) } });
    const issues: any[] = j?.issues ?? [];
    const legacyKeys = f.epicLink ? issues.map((i) => i.fields?.[f.epicLink!]).filter((k): k is string => typeof k === 'string') : [];
    const epicIds = await epicIdsFor(ctx, legacyKeys);
    return { rows: issues.map((i) => issueRow(ctx, i, f, epicIds)), next: j?.isLast === true ? null : (j?.nextPageToken ?? null) };
  },

  async update(ctx, object, id, values) {
    if (object === 'sprints') return updateSprint(ctx, id, values);
    const body = await issueFieldsOut(ctx, values);
    if (Object.keys(body).length) await jx(ctx, `/rest/api/3/issue/${encodeURIComponent(id)}`, { method: 'PUT', json: { fields: body } });
    if ('epic' in values && object !== 'epics') await setEpic(ctx, id, values.epic);
    if ('status' in values && values.status) await transitionTo(ctx, id, values.status);
    if ('sprint' in values && object !== 'epics') await moveToSprint(ctx, id, values.sprint ?? null);
  },

  async create(ctx, object, values) {
    if (object === 'sprints') return createSprint(ctx, values);
    const project = String(ctx.config.createProject ?? ctx.config.projects?.[0] ?? '');
    if (!project) throw new CrmError('Choose the Jira projects to bring over first');
    const f = await siteFacts(ctx);
    const typeKey = object === 'epics' ? 'epic' : lc(values.issuetype) || 'task';
    const fields: Record<string, unknown> = { project: { key: project }, issuetype: { id: await createType(ctx, project, typeKey) }, ...(await issueFieldsOut(ctx, values)) };
    if (typeKey === 'epic' && f.epicName && typeof fields.summary === 'string') fields[f.epicName] = fields.summary;
    if (values.epic && object !== 'epics') fields.parent = { id: String(values.epic) };
    const made = await jx(ctx, '/rest/api/3/issue', { method: 'POST', json: { fields } });
    const id = made?.id ? String(made.id) : '';
    if (!id) throw new CrmError('Jira did not return an id');
    // A new issue starts in the workflow's first status; the wanted one is a transition away.
    if (values.status) await transitionTo(ctx, id, values.status);
    if (values.sprint && object !== 'epics') await moveToSprint(ctx, id, values.sprint);
    return id;
  },

  url(config, object, id) {
    const site = String(config.siteUrl ?? '').replace(/\/$/, '');
    if (!site) return null;
    if (object === 'sprints') return config.jiraBoardId ? `${site}/jira/software/c/projects/${(config.projects ?? [])[0] ?? ''}/boards/${config.jiraBoardId}/backlog` : null;
    // The id, not the key: keys change when an issue moves projects.
    return `${site}/secure/ViewIssue.jspa?id=${encodeURIComponent(id)}`;
  },
};

async function updateSprint(ctx: CrmCtx, id: string, v: Record<string, unknown>): Promise<void> {
  const body: Record<string, unknown> = {};
  if (typeof v.name === 'string' && v.name.trim()) body.name = v.name.trim().slice(0, 30);
  if ('goal' in v) body.goal = v.goal ? String(v.goal).slice(0, 1000) : '';
  if ('startDate' in v) body.startDate = sprintDate(v.startDate);
  if ('endDate' in v) body.endDate = sprintDate(v.endDate);
  if (v.state) {
    // Jira refuses a state it is already in.
    const now = await jx(ctx, `/rest/agile/1.0/sprint/${encodeURIComponent(id)}`);
    if (lc(now?.state) !== lc(v.state)) body.state = lc(v.state);
    // Starting a sprint needs both dates; keep the ones it has.
    if (body.state === 'active') {
      body.startDate ??= now?.startDate ?? new Date().toISOString();
      body.endDate ??= now?.endDate ?? new Date(Date.now() + 14 * 86_400_000).toISOString();
    }
  }
  if (Object.keys(body).length) await jx(ctx, `/rest/agile/1.0/sprint/${encodeURIComponent(id)}`, { method: 'POST', json: body });
}

async function createSprint(ctx: CrmCtx, v: Record<string, unknown>): Promise<string> {
  const board = Number(ctx.config.jiraBoardId ?? (await boardIds(ctx))[0]);
  if (!board) throw new CrmError('No Jira scrum board to create the sprint on');
  const made = await jx(ctx, '/rest/agile/1.0/sprint', {
    method: 'POST',
    json: { name: String(v.name ?? '').trim().slice(0, 30) || 'Sprint', originBoardId: board, ...(v.goal ? { goal: String(v.goal).slice(0, 1000) } : {}), ...(v.startDate ? { startDate: sprintDate(v.startDate) } : {}), ...(v.endDate ? { endDate: sprintDate(v.endDate) } : {}) },
  });
  if (!made?.id) throw new CrmError('Jira did not return an id');
  return String(made.id);
}

async function oneShotJson(fetcher: typeof fetch, url: string, token: string): Promise<any> {
  const res = await fetcher(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } });
  if (!res.ok) throw new CrmError(await failure(res), res.status);
  return res.json();
}

// ----------------------------------------------------------- setup, for routes

/** Projects the signed-in account can see, for the "which projects" step. */
export async function jiraProjects(ctx: CrmCtx): Promise<{ key: string; name: string }[]> {
  const out: { key: string; name: string }[] = [];
  for (let start = 0; start < 1000; ) {
    const j = await jx(ctx, `/rest/api/3/project/search?startAt=${start}&maxResults=100&orderBy=name`);
    for (const p of j?.values ?? []) out.push({ key: p.key, name: p.name });
    if (j?.isLast !== false || !j?.values?.length) break;
    start += j.values.length;
  }
  return out;
}

/** The scrum boards of those projects (sprints live on them), the first of which new sprints are created on. */
export async function jiraScrumBoards(ctx: CrmCtx, projects: string[]): Promise<number[]> {
  return boardIds({ ...ctx, config: { ...ctx.config, projects, boardIds: undefined } } as CrmCtx);
}

/**
 * The mapping a Jira connection starts with. The administrator picks the Jira projects and the Curahold board the work
 * lands on; the field choices are the same for everyone (status → the board's columns, epic, sprint, points…), so there is
 * nothing to match by hand.
 */
export function jiraDefaultSync(boardId: string, existing?: Pick<SyncConfig, 'owners' | 'conflict'>): SyncConfig['objects'] {
  const both = (remote: string, local: string, dir: 'both' | 'pull' = 'both') => ({ remote, local, dir });
  const common = [both('summary', 'title'), both('description', 'description'), both('status', 'stage'), both('issuetype', 'issue_type'), both('assignee', 'assignee'), both('duedate', 'due')];
  void existing;
  return [
    { remote: 'epics', label: 'Epics', target: 'task', boardId, enabled: true, create: true, issueTypes: ['epic'], fields: common },
    { remote: 'issues', label: 'Issues', target: 'task', boardId, enabled: true, create: true, issueTypes: ['story', 'task', 'bug', 'subtask', 'spike'], fields: [...common, both('story_points', 'story_points'), both('epic', 'epic'), both('sprint', 'sprint')] },
    { remote: 'sprints', label: 'Sprints', target: 'sprint', boardId, enabled: true, create: true, fields: [both('name', 'name'), both('goal', 'goal'), both('state', 'state'), both('startDate', 'starts_on'), both('endDate', 'ends_on')] },
  ];
}
