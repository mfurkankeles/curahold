// Support tools: Zendesk, Freshdesk, Intercom and Jira Service Management.
// Each is connected with its own address and an API key the administrator
// creates in the tool (no app registration, nothing to approve), and only
// read: tickets become "Support ticket" records under the right customer,
// organisations are matched to customers by name or web address.
//
// Every adapter offers the same two objects with the same field names, so
// one mapping fits all: tickets (subject, status, priority, opened, solved,
// requester, channel, link, organization, assignee) and organizations.
// Two hidden values help the engine find the customer: `__domains` on an
// organisation and `__requesterDomain` on a ticket.
import { ticketPriorityOf, ticketStatusOf } from '../../../../shared/src/records';
import type { RemoteField, RemoteObject, RemoteUser } from '../../../../shared/src/sync';
import { CrmError, errorText, type CrmAdapter, type CrmCtx, type Page, type RemoteRow } from './types';

const PAGE = 100;

/** A request with the stored Authorization value ("Basic …" or "Bearer …"). */
async function send(ctx: Pick<CrmCtx, 'fetch' | 'token'>, url: string, init: RequestInit & { json?: unknown } = {}, extra: Record<string, string> = {}): Promise<any> {
  const headers = new Headers(init.headers);
  headers.set('authorization', await ctx.token());
  headers.set('accept', 'application/json');
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(init.json);
  }
  const res = await ctx.fetch(url, { ...init, headers, body });
  if (res.status === 429 || res.status === 503) {
    const after = Number(res.headers.get('retry-after') ?? 60);
    throw new CrmError(await errorText(res), res.status, Number.isFinite(after) ? after : 60);
  }
  if (res.status === 401 || res.status === 403) throw new CrmError(await errorText(res), res.status, undefined, res.status === 401);
  if (!res.ok) throw new CrmError(await errorText(res), res.status);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const basic = (user: string, pass: string) => `Basic ${btoa(`${user}:${pass}`)}`;
const domainOf = (email: unknown) => (typeof email === 'string' && email.includes('@') ? email.split('@').pop()!.trim().toLowerCase() : null);
const hostOf = (url: unknown) => {
  if (typeof url !== 'string' || !url.trim()) return null;
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
};
const iso = (v: unknown) => (v === null || v === undefined || v === '' ? null : typeof v === 'number' ? new Date(v * 1000).toISOString() : new Date(String(v)).toISOString());
const cleanSub = (v: string, suffix: RegExp) => v.trim().toLowerCase().replace(/^https?:\/\//, '').replace(suffix, '').replace(/\/.*$/, '');

const TICKET_OBJECT = (label: string, plural: string): RemoteObject => ({ name: 'tickets', label, labelPlural: plural, custom: false, hint: 'ticket' });
const ORG_OBJECT = (label: string, plural: string): RemoteObject => ({ name: 'organizations', label, labelPlural: plural, custom: false, hint: 'account' });
const sel = (name: string, label: string, keys: string[]): RemoteField => ({ name, label, type: 'select', options: keys.map((k) => ({ value: k, label: k })), updatable: false });
const TICKET_FIELDS = (withOrg: boolean): RemoteField[] => [
  { name: 'id', label: 'ID', type: 'id', updatable: false },
  { name: 'subject', label: 'Subject', type: 'text', updatable: false },
  sel('status', 'Status', ['open', 'pending', 'solved', 'closed']),
  sel('priority', 'Priority', ['low', 'normal', 'high', 'urgent']),
  { name: 'opened', label: 'Opened', type: 'datetime', updatable: false },
  { name: 'solved', label: 'Solved', type: 'datetime', updatable: false },
  { name: 'requester', label: 'Requester email', type: 'email', updatable: false },
  { name: 'channel', label: 'Channel', type: 'text', updatable: false },
  { name: 'link', label: 'Link', type: 'url', updatable: false },
  ...(withOrg ? [{ name: 'organization', label: 'Organization', type: 'ref' as const, refTo: ['organizations'], updatable: false }] : []),
  { name: 'assignee', label: 'Assignee', type: 'user', updatable: false },
];
const ORG_FIELDS: RemoteField[] = [
  { name: 'id', label: 'ID', type: 'id', updatable: false },
  { name: 'name', label: 'Name', type: 'text', updatable: false },
  { name: 'domains', label: 'Web addresses', type: 'text', updatable: false },
];

function ticketRow(id: string, modifiedAt: string | null, v: { subject: unknown; status: unknown; priority: unknown; opened: unknown; solved?: unknown; requester?: unknown; channel?: unknown; link?: string | null; organization?: unknown; assignee?: unknown }): RemoteRow {
  const status = ticketStatusOf(v.status);
  return {
    id,
    modifiedAt,
    values: {
      id,
      subject: String(v.subject ?? '').trim() || `#${id}`,
      status,
      priority: ticketPriorityOf(v.priority),
      opened: iso(v.opened),
      solved: status === 'solved' || status === 'closed' ? iso(v.solved ?? modifiedAt) : null,
      requester: typeof v.requester === 'string' ? v.requester.toLowerCase() : null,
      channel: v.channel ? String(v.channel) : null,
      link: v.link ?? null,
      organization: v.organization === null || v.organization === undefined ? null : String(v.organization),
      assignee: v.assignee === null || v.assignee === undefined ? null : String(v.assignee),
      __requesterDomain: domainOf(v.requester),
    },
  };
}
const orgRow = (id: string, name: unknown, domains: (string | null)[], modifiedAt: string | null): RemoteRow => {
  const list = [...new Set(domains.map((d) => (d ? hostOf(d) : null)).filter((d): d is string => !!d))];
  return { id, modifiedAt, values: { id, name: String(name ?? '').trim(), domains: list.join(', '), __domains: list } };
};
const readOnly = async (): Promise<never> => {
  throw new CrmError('This connection only reads');
};
const noRefresh = async (): Promise<never> => {
  throw new CrmError('The API key no longer works; connect again with a new one', 401, undefined, true);
};
const since = (s: string | null) => (s ? new Date(s).getTime() : 0);

// ------------------------------------------------------------------ Zendesk

const zdBase = (ctx: { config: Record<string, any> }) => `https://${ctx.config.subdomain}.zendesk.com/api/v2`;

export const zendesk: CrmAdapter = {
  provider: 'zendesk',
  tabular: false,
  readOnly: true,
  keyed: {
    async connect(fetcher, values, now) {
      const subdomain = cleanSub(values.subdomain ?? '', /\.zendesk\.com.*$/);
      if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(subdomain)) throw new CrmError('Enter the Zendesk address, e.g. yourcompany');
      const auth = basic(`${(values.email ?? '').trim()}/token`, (values.token ?? '').trim());
      const me = await send({ fetch: fetcher, token: async () => auth }, `https://${subdomain}.zendesk.com/api/v2/users/me.json`);
      if (!me?.user?.id || me.user.role === 'end-user') throw new CrmError('That email and API token are not an agent of this Zendesk', 401, undefined, true);
      void now;
      return { secret: { accessToken: auth }, config: { subdomain }, label: `${subdomain}.zendesk.com`, instanceId: subdomain };
    },
  },
  refresh: noRefresh,
  async objects() {
    return [TICKET_OBJECT('Ticket', 'Tickets'), ORG_OBJECT('Organization', 'Organizations')];
  },
  async fields(_ctx, object) {
    return object === 'tickets' ? TICKET_FIELDS(true) : ORG_FIELDS;
  },
  async users(ctx) {
    const out: RemoteUser[] = [];
    let url: string | null = `${zdBase(ctx)}/users.json?role[]=agent&role[]=admin&page[size]=${PAGE}`;
    while (url && out.length < 2000) {
      const j: any = await send(ctx, url);
      for (const u of j.users ?? []) out.push({ id: String(u.id), name: u.name, email: u.email ?? null });
      url = j.meta?.has_more ? j.links?.next : null;
    }
    return out;
  },
  async list(ctx, object, opts) {
    if (object === 'organizations') {
      const url = opts.cursor ?? `${zdBase(ctx)}/organizations.json?page[size]=${PAGE}`;
      const j = await send(ctx, url);
      const from = since(opts.since);
      const rows = (j.organizations ?? [])
        .filter((o: any) => !from || new Date(o.updated_at).getTime() >= from)
        .map((o: any) => orgRow(String(o.id), o.name, o.domain_names ?? [], o.updated_at));
      return { rows, next: j.meta?.has_more ? j.links?.next : null };
    }
    // Incremental export: everything changed since a moment, in order, with the requesters alongside.
    const start = Math.floor(since(opts.since) / 1000);
    const url = opts.cursor ?? `${zdBase(ctx)}/incremental/tickets/cursor.json?start_time=${start}&include=users&per_page=${PAGE}`;
    const j = await send(ctx, url);
    const emails = new Map<string, string>((j.users ?? []).map((u: any) => [String(u.id), u.email]));
    const rows: RemoteRow[] = (j.tickets ?? [])
      .filter((t: any) => t.status !== 'deleted')
      .map((t: any) =>
        ticketRow(String(t.id), t.updated_at, {
          subject: t.subject ?? t.raw_subject,
          status: t.status === 'new' ? 'open' : t.status === 'hold' ? 'pending' : t.status,
          priority: t.priority,
          opened: t.created_at,
          solved: t.status === 'solved' || t.status === 'closed' ? t.updated_at : null,
          requester: emails.get(String(t.requester_id)) ?? null,
          channel: t.via?.channel,
          link: `https://${ctx.config.subdomain}.zendesk.com/agent/tickets/${t.id}`,
          organization: t.organization_id,
          assignee: t.assignee_id,
        }),
      );
    return { rows, next: j.end_of_stream ? null : (j.after_url ?? null) };
  },
  async deleted(ctx, _object, sinceIso) {
    void ctx;
    void sinceIso;
    return [];
  },
  update: readOnly,
  create: readOnly,
  url(config, object, id) {
    return object === 'tickets' ? `https://${config.subdomain}.zendesk.com/agent/tickets/${id}` : `https://${config.subdomain}.zendesk.com/agent/organizations/${id}`;
  },
};

// ---------------------------------------------------------------- Freshdesk

const fdBase = (ctx: { config: Record<string, any> }) => `https://${ctx.config.domain}.freshdesk.com/api/v2`;
const FD_STATUS: Record<number, string> = { 2: 'open', 3: 'pending', 4: 'solved', 5: 'closed', 6: 'pending', 7: 'pending' };
const FD_PRIORITY: Record<number, string> = { 1: 'low', 2: 'normal', 3: 'high', 4: 'urgent' };
const FD_SOURCE: Record<number, string> = { 1: 'email', 2: 'portal', 3: 'phone', 7: 'chat', 9: 'feedback widget', 10: 'outbound email' };

export const freshdesk: CrmAdapter = {
  provider: 'freshdesk',
  tabular: false,
  readOnly: true,
  keyed: {
    async connect(fetcher, values) {
      const domain = cleanSub(values.domain ?? '', /\.freshdesk\.com.*$/);
      if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(domain)) throw new CrmError('Enter the Freshdesk address, e.g. yourcompany');
      const auth = basic((values.token ?? '').trim(), 'X');
      const me = await send({ fetch: fetcher, token: async () => auth }, `https://${domain}.freshdesk.com/api/v2/agents/me`);
      if (!me?.id) throw new CrmError('That API key is not an agent of this Freshdesk', 401, undefined, true);
      return { secret: { accessToken: auth }, config: { domain }, label: `${domain}.freshdesk.com`, instanceId: domain };
    },
  },
  refresh: noRefresh,
  async objects() {
    return [TICKET_OBJECT('Ticket', 'Tickets'), ORG_OBJECT('Company', 'Companies')];
  },
  async fields(_ctx, object) {
    return object === 'tickets' ? TICKET_FIELDS(true) : ORG_FIELDS;
  },
  async users(ctx) {
    const out: RemoteUser[] = [];
    for (let page = 1; page <= 20; page++) {
      const list: any[] = await send(ctx, `${fdBase(ctx)}/agents?per_page=${PAGE}&page=${page}`);
      for (const a of list ?? []) out.push({ id: String(a.id), name: a.contact?.name ?? '', email: a.contact?.email ?? null });
      if (!list || list.length < PAGE) break;
    }
    return out;
  },
  async list(ctx, object, opts) {
    const page = Number(opts.cursor ?? 1);
    if (object === 'organizations') {
      const list: any[] = await send(ctx, `${fdBase(ctx)}/companies?per_page=${PAGE}&page=${page}`);
      const from = since(opts.since);
      const rows = (list ?? []).filter((o) => !from || new Date(o.updated_at).getTime() >= from).map((o) => orgRow(String(o.id), o.name, o.domains ?? [], o.updated_at));
      return { rows, next: list?.length === PAGE ? String(page + 1) : null };
    }
    // Without a date Freshdesk lists only the last 30 days; ask from the start of time on a first run.
    const from = opts.since ?? '2000-01-01T00:00:00Z';
    const list: any[] = await send(ctx, `${fdBase(ctx)}/tickets?updated_since=${encodeURIComponent(from)}&order_by=updated_at&order_type=asc&include=requester&per_page=${PAGE}&page=${page}`);
    const rows = (list ?? []).map((t) =>
      ticketRow(String(t.id), t.updated_at, {
        subject: t.subject,
        status: FD_STATUS[t.status] ?? 'open',
        priority: FD_PRIORITY[t.priority] ?? 'normal',
        opened: t.created_at,
        solved: t.stats?.resolved_at ?? t.stats?.closed_at ?? t.updated_at,
        requester: t.requester?.email ?? null,
        channel: FD_SOURCE[t.source] ?? null,
        link: `https://${ctx.config.domain}.freshdesk.com/a/tickets/${t.id}`,
        organization: t.company_id,
        assignee: t.responder_id,
      }),
    );
    // Freshdesk stops at page 300; the next run carries on from the last change it saw.
    return { rows, next: list?.length === PAGE && page < 300 ? String(page + 1) : null };
  },
  update: readOnly,
  create: readOnly,
  url(config, object, id) {
    return object === 'tickets' ? `https://${config.domain}.freshdesk.com/a/tickets/${id}` : `https://${config.domain}.freshdesk.com/a/companies/${id}`;
  },
};

// ----------------------------------------------------------------- Intercom

const IC_HOSTS: Record<string, string> = { us: 'https://api.intercom.io', eu: 'https://api.eu.intercom.io', au: 'https://api.au.intercom.io' };
const icBase = (ctx: { config: Record<string, any> }) => IC_HOSTS[ctx.config.region] ?? IC_HOSTS.us;
const IC_VERSION = { 'intercom-version': '2.11' };

export const intercom: CrmAdapter = {
  provider: 'intercom',
  tabular: false,
  readOnly: true,
  keyed: {
    async connect(fetcher, values) {
      const region = ['us', 'eu', 'au'].includes((values.region ?? 'us').trim().toLowerCase()) ? (values.region ?? 'us').trim().toLowerCase() : 'us';
      const auth = `Bearer ${(values.token ?? '').trim()}`;
      const me = await send({ fetch: fetcher, token: async () => auth }, `${IC_HOSTS[region]}/me`, {}, IC_VERSION);
      const appId = me?.app?.id_code;
      if (!appId) throw new CrmError('That access token does not open an Intercom workspace', 401, undefined, true);
      return { secret: { accessToken: auth }, config: { region, appId }, label: me.app.name ?? 'Intercom', instanceId: appId };
    },
  },
  refresh: noRefresh,
  async objects() {
    return [TICKET_OBJECT('Conversation', 'Conversations'), ORG_OBJECT('Company', 'Companies')];
  },
  async fields(_ctx, object) {
    // Conversations name a person, not a company: the customer is found by the person's email address.
    return object === 'tickets' ? TICKET_FIELDS(false) : ORG_FIELDS;
  },
  async users(ctx) {
    const j = await send(ctx, `${icBase(ctx)}/admins`, {}, IC_VERSION);
    return (j?.admins ?? []).map((a: any) => ({ id: String(a.id), name: a.name, email: a.email ?? null }));
  },
  async list(ctx, object, opts) {
    if (object === 'organizations') {
      const url = `${icBase(ctx)}/companies/scroll${opts.cursor ? `?scroll_param=${encodeURIComponent(opts.cursor)}` : ''}`;
      const j = await send(ctx, url, {}, IC_VERSION);
      const from = since(opts.since) / 1000;
      const data: any[] = j?.data ?? [];
      const rows = data.filter((o) => !from || (o.updated_at ?? 0) >= from).map((o) => orgRow(String(o.id), o.name, [o.website ?? null], iso(o.updated_at)));
      return { rows, next: data.length ? (j.scroll_param ?? null) : null };
    }
    const query = { field: 'updated_at', operator: '>', value: Math.floor(since(opts.since) / 1000) };
    const j = await send(
      ctx,
      `${icBase(ctx)}/conversations/search`,
      { method: 'POST', json: { query, pagination: { per_page: PAGE, ...(opts.cursor ? { starting_after: opts.cursor } : {}) }, sort: { field: 'updated_at', order: 'ascending' } } },
      IC_VERSION,
    );
    const rows = (j?.conversations ?? []).map((cv: any) =>
      ticketRow(String(cv.id), iso(cv.updated_at), {
        subject: cv.title || cv.source?.subject || String(cv.source?.body ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120),
        status: cv.state === 'closed' ? 'solved' : cv.state === 'snoozed' ? 'pending' : 'open',
        priority: cv.priority === 'priority' ? 'high' : 'normal',
        opened: cv.created_at,
        solved: cv.statistics?.last_close_at ?? cv.updated_at,
        requester: cv.source?.author?.email ?? null,
        channel: cv.source?.delivered_as ?? cv.source?.type ?? null,
        link: `https://app.intercom.com/a/inbox/${ctx.config.appId}/inbox/conversation/${cv.id}`,
        assignee: cv.admin_assignee_id,
      }),
    );
    return { rows, next: j?.pages?.next?.starting_after ?? null };
  },
  update: readOnly,
  create: readOnly,
  url(config, object, id) {
    return object === 'tickets' ? `https://app.intercom.com/a/inbox/${config.appId}/inbox/conversation/${id}` : `https://app.intercom.com/a/apps/${config.appId}/companies/${id}`;
  },
};

// ------------------------------------------------- Jira Service Management

const jsmBase = (ctx: { config: Record<string, any> }) => `https://${ctx.config.site}.atlassian.net`;

export const jsm: CrmAdapter = {
  provider: 'jsm',
  tabular: false,
  readOnly: true,
  keyed: {
    async connect(fetcher, values) {
      const site = cleanSub(values.site ?? '', /\.atlassian\.net.*$/);
      if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(site)) throw new CrmError('Enter the Atlassian address, e.g. yourcompany');
      const auth = basic((values.email ?? '').trim(), (values.token ?? '').trim());
      const ctx = { fetch: fetcher, token: async () => auth };
      const me = await send(ctx, `https://${site}.atlassian.net/rest/api/3/myself`);
      if (!me?.accountId) throw new CrmError('That email and API token do not open this Atlassian site', 401, undefined, true);
      // Service desk projects, and the field that names a request's organisations.
      const desks = await send(ctx, `https://${site}.atlassian.net/rest/servicedeskapi/servicedesk?limit=50`);
      const projects = (desks?.values ?? []).map((d: any) => d.projectKey).filter(Boolean);
      if (!projects.length) throw new CrmError('This Atlassian site has no service desk projects this account can see');
      const fields: any[] = await send(ctx, `https://${site}.atlassian.net/rest/api/3/field`);
      const orgField = fields.find((f) => f.schema?.custom === 'com.atlassian.servicedesk:sd-customer-organizations')?.id ?? null;
      return { secret: { accessToken: auth }, config: { site, projects, orgField }, label: `${site}.atlassian.net`, instanceId: site };
    },
  },
  refresh: noRefresh,
  async objects() {
    return [TICKET_OBJECT('Request', 'Requests'), ORG_OBJECT('Organization', 'Organizations')];
  },
  async fields(ctx, object) {
    return object === 'tickets' ? TICKET_FIELDS(!!ctx.config.orgField) : ORG_FIELDS;
  },
  async users(ctx) {
    // People who can be assigned in the service desk projects.
    const keys: string[] = ctx.config.projects ?? [];
    const seen = new Map<string, RemoteUser>();
    for (const k of keys.slice(0, 10)) {
      const list: any[] = await send(ctx, `${jsmBase(ctx)}/rest/api/3/user/assignable/search?project=${encodeURIComponent(k)}&maxResults=200`);
      for (const u of list ?? []) if (u.accountType === 'atlassian') seen.set(u.accountId, { id: u.accountId, name: u.displayName, email: u.emailAddress ?? null });
    }
    return [...seen.values()];
  },
  async list(ctx, object, opts): Promise<Page> {
    if (object === 'organizations') {
      const start = Number(opts.cursor ?? 0);
      const j = await send(ctx, `${jsmBase(ctx)}/rest/servicedeskapi/organization?start=${start}&limit=50`);
      const rows = (j?.values ?? []).map((o: any) => orgRow(String(o.id), o.name, [], null));
      return { rows, next: j?.isLastPage === false ? String(start + 50) : null };
    }
    const keys: string[] = ctx.config.projects ?? [];
    const after = opts.since ? new Date(new Date(opts.since).getTime() - 60_000) : null;
    const pad = (n: number) => String(n).padStart(2, '0');
    const when = after ? `${after.getUTCFullYear()}-${pad(after.getUTCMonth() + 1)}-${pad(after.getUTCDate())} ${pad(after.getUTCHours())}:${pad(after.getUTCMinutes())}` : null;
    const jql = `project in (${keys.map((k) => `"${k}"`).join(',')})${when ? ` AND updated >= "${when}"` : ''} ORDER BY updated ASC`;
    const orgField: string | null = ctx.config.orgField ?? null;
    const j = await send(ctx, `${jsmBase(ctx)}/rest/api/3/search/jql`, {
      method: 'POST',
      json: {
        jql,
        maxResults: PAGE,
        fields: ['summary', 'status', 'priority', 'created', 'updated', 'resolutiondate', 'reporter', 'assignee', ...(orgField ? [orgField] : [])],
        ...(opts.cursor ? { nextPageToken: opts.cursor } : {}),
      },
    });
    const rows = (j?.issues ?? []).map((i: any) => {
      const f = i.fields ?? {};
      const cat = f.status?.statusCategory?.key;
      return ticketRow(i.key, f.updated ?? null, {
        subject: f.summary,
        status: cat === 'done' ? 'solved' : /wait|pend|beklem/i.test(f.status?.name ?? '') ? 'pending' : 'open',
        priority: f.priority?.name,
        opened: f.created,
        solved: f.resolutiondate ?? f.updated,
        requester: f.reporter?.emailAddress ?? null,
        channel: 'service desk',
        link: `${jsmBase(ctx)}/browse/${i.key}`,
        organization: orgField ? (f[orgField]?.[0]?.id ?? null) : null,
        assignee: f.assignee?.accountId ?? null,
      });
    });
    return { rows, next: j?.nextPageToken ?? null };
  },
  update: readOnly,
  create: readOnly,
  url(config, object, id) {
    return object === 'tickets' ? `https://${config.site}.atlassian.net/browse/${id}` : null;
  },
};
