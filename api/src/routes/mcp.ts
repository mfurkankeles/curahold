// The Curahold connector for AI assistants (Claude, ChatGPT and any MCP
// client): a small set of tools over the same API the app uses. Each tool
// call is made as the person who connected the assistant, so it sees and
// changes exactly what they could in the app — and the thinking runs in
// their own assistant, at no model cost to the company.
import { Hono } from 'hono';
import { orgUrl, type AppEnv, type C } from '../context';
import { resolveToken } from '../lib/tokens';

export const mcpRoutes = new Hono<AppEnv>();

const PROTOCOL = '2025-06-18';
const open = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id', 'access-control-expose-headers': 'www-authenticate' };

type Json = Record<string, any>;
interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  write?: boolean;
  run: (api: Api, args: Json, ctx: { base: string }) => Promise<unknown>;
}
type Api = (method: string, path: string, body?: unknown) => Promise<any>;

class ToolError extends Error {}

const str = (description: string) => ({ type: 'string', description });
const date = (description: string) => ({ type: 'string', description, pattern: '^\\d{4}-\\d{2}-\\d{2}$' });
const bool = (description: string) => ({ type: 'boolean', description });
const obj = (properties: Json, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });

/** A board by id or name; else the person's default board, else the first one. */
async function boardFor(api: Api, ref?: string) {
  const { boards } = await api('GET', '/api/boards');
  if (!boards.length) throw new ToolError('There are no boards the person can use.');
  if (ref) {
    const b = boards.find((x: Json) => x.id === ref || x.name.toLocaleLowerCase('tr') === String(ref).toLocaleLowerCase('tr'));
    if (!b) throw new ToolError(`No board called "${ref}". Boards: ${boards.map((x: Json) => x.name).join(', ')}`);
    return b;
  }
  const me = await api('GET', '/api/me');
  return boards.find((x: Json) => x.id === me.user.prefs?.defaultBoardId) ?? boards[0];
}

async function accountFor(api: Api, ref?: string): Promise<string | null> {
  if (!ref) return null;
  if (/^[0-9a-f-]{36}$/i.test(ref)) return ref;
  const { accounts } = await api('GET', `/api/accounts?q=${encodeURIComponent(ref)}&limit=5`);
  const exact = accounts.find((a: Json) => a.name.toLocaleLowerCase('tr') === ref.toLocaleLowerCase('tr'));
  if (exact) return exact.id;
  if (accounts.length === 1) return accounts[0].id;
  throw new ToolError(accounts.length ? `Several customers match "${ref}": ${accounts.map((a: Json) => a.name).join(', ')}` : `No customer called "${ref}".`);
}

async function peopleFor(api: Api, refs?: string[]): Promise<string[] | undefined> {
  if (!refs?.length) return undefined;
  const { people } = await api('GET', '/api/people');
  return refs.map((r) => {
    const p = people.find((x: Json) => x.email === r.toLowerCase() || x.name.toLocaleLowerCase('tr') === r.toLocaleLowerCase('tr') || x.id === r);
    if (!p) throw new ToolError(`No person "${r}" in the company.`);
    return p.id;
  });
}

const TOOLS: Tool[] = [
  {
    name: 'search',
    title: 'Search Curahold',
    description: 'Find customers (accounts), tasks, contacts and other records, and people by name. Returns ids to use with fetch.',
    inputSchema: obj({ query: str('Words to look for, e.g. a customer or task name') }, ['query']),
    run: async (api, a, { base }) => {
      const r = await api('GET', `/api/search?q=${encodeURIComponent(a.query)}`);
      return {
        results: [
          ...r.accounts.map((x: Json) => ({ id: `account:${x.id}`, title: x.name, url: `${base}/accounts/${x.id}` })),
          ...r.tasks.map((x: Json) => ({ id: `task:${x.id}`, title: x.title, url: `${base}/b/${x.boardId}?task=${x.id}` })),
          ...r.records.map((x: Json) => ({ id: `record:${x.id}`, title: x.accountName ? `${x.name} (${x.accountName})` : x.name, url: x.accountId ? `${base}/accounts/${x.accountId}` : base })),
          ...r.people.map((x: Json) => ({ id: `person:${x.id}`, title: `${x.name} <${x.email}>`, url: base })),
        ],
      };
    },
  },
  {
    name: 'fetch',
    title: 'Open one item',
    description: 'Full details of an item found with search: account:<id> (with its fields, contacts, tasks, recent timeline and health score with reasons), task:<id> (with comments) or record:<id>.',
    inputSchema: obj({ id: str('An id from search, e.g. account:5f0…') }, ['id']),
    run: async (api, a, { base }) => {
      const [kind, id] = String(a.id).split(':');
      if (kind === 'account') {
        const r = await api('GET', `/api/accounts/${id}`);
        const [contacts, tickets, timeline, health] = await Promise.all([
          api('GET', `/api/records?type=contact&account=${id}`).catch(() => ({ records: [] })),
          api('GET', `/api/records?type=ticket&account=${id}&limit=30`).catch(() => ({ records: [] })),
          api('GET', `/api/accounts/${id}/timeline?limit=15`).catch(() => ({ items: [], pinned: [] })),
          api('GET', `/api/accounts/${id}/health`).catch(() => null),
        ]);
        return {
          id: a.id,
          title: r.account.name,
          url: `${base}/accounts/${id}`,
          account: r.account,
          contacts: contacts.records,
          supportTickets: tickets.records,
          tasks: r.tasks,
          health: health?.health ?? null,
          timeline: { pinned: timeline.pinned, recent: timeline.items },
        };
      }
      if (kind === 'task') {
        const r = await api('GET', `/api/tasks/${id}`);
        return { id: a.id, title: r.task.title, url: `${base}/b/${r.task.boardId}?task=${id}`, task: r.task };
      }
      if (kind === 'record') {
        const r = await api('GET', `/api/records/${id}`);
        return { id: a.id, title: r.record.name, record: r.record };
      }
      throw new ToolError('Use an id that starts with account:, task: or record:.');
    },
  },
  {
    name: 'list_accounts',
    title: 'List customers',
    description: 'Customers (accounts) with their fields (e.g. renewal date, annual value, health), owner and open tasks. Only those the person may see.',
    inputSchema: obj({ query: str('Optional name filter'), mine: bool('Only the ones the person owns'), limit: { type: 'integer', minimum: 1, maximum: 200 } }),
    run: async (api, a) => {
      const p = new URLSearchParams({ limit: String(a.limit ?? 100) });
      if (a.query) p.set('q', a.query);
      if (a.mine) p.set('owner', 'me');
      const [r, me] = await Promise.all([api('GET', `/api/accounts?${p}`), api('GET', '/api/me')]);
      return { total: r.total, fields: me.org.accountFields.map((f: Json) => ({ key: f.key, label: f.label, type: f.type, options: f.options })), accounts: r.accounts };
    },
  },
  {
    name: 'list_tasks',
    title: 'List tasks',
    description: "Tasks across the boards the person can see; by default the person's own. Filter by due dates.",
    inputSchema: obj({ mine: bool('Only tasks assigned to the person (default true)'), due_from: date('Earliest due date, YYYY-MM-DD'), due_to: date('Latest due date, YYYY-MM-DD') }),
    run: async (api, a) => {
      const p = new URLSearchParams();
      if (a.mine !== false) p.set('assignee', 'me');
      if (a.due_from) p.set('from', a.due_from);
      if (a.due_to) p.set('to', a.due_to);
      const { tasks } = await api('GET', `/api/tasks?${p}`);
      return { tasks: tasks.slice(0, 300) };
    },
  },
  {
    name: 'portfolio_summary',
    title: 'Portfolio summary',
    description: "What the person's home page shows, as data: counts, total value, renewals coming up, customers needing attention, stakeholder risks, team load. Good for summaries and presentations.",
    inputSchema: obj({}),
    run: async (api) => {
      const { pages, homeId } = await api('GET', '/api/pages');
      const page = pages.find((p: Json) => p.id === homeId) ?? pages[0];
      if (!page) return { cards: [] };
      const { data } = await api('GET', `/api/pages/${page.id}/data`);
      return { page: page.name, cards: page.cards.filter((cd: Json) => data[cd.id]?.kind !== 'hidden').map((cd: Json) => ({ type: cd.type, title: cd.title ?? null, scope: cd.scope ?? null, days: cd.days ?? null, data: data[cd.id] })) };
    },
  },
  {
    name: 'create_task',
    title: 'Create a task',
    description: 'Open a task on a board, optionally for a customer, with a due date and people. Board and customer may be given by name.',
    write: true,
    inputSchema: obj(
      {
        title: str('What needs doing'),
        description: str('More detail'),
        board: str("Board name or id (default: the person's default board)"),
        account: str('Customer name or id'),
        due_date: date('Due date, YYYY-MM-DD'),
        assignees: { type: 'array', items: { type: 'string' }, description: 'Emails or names of people to assign' },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
      },
      ['title'],
    ),
    run: async (api, a, { base }) => {
      const board = await boardFor(api, a.board);
      const r = await api('POST', '/api/tasks', {
        boardId: board.id,
        title: a.title,
        description: a.description,
        accountId: await accountFor(api, a.account),
        dueDate: a.due_date,
        assigneeIds: await peopleFor(api, a.assignees),
        priority: a.priority,
      });
      return { created: true, task: r.task, url: `${base}/b/${board.id}?task=${r.task.id}` };
    },
  },
  {
    name: 'add_note',
    title: 'Log a note, call, meeting or email',
    description: "Adds an entry to a customer's timeline, e.g. a summary of a call. It counts as a touch for the health score.",
    write: true,
    inputSchema: obj(
      {
        account: str('Customer name or id'),
        text: str('What happened, in a few sentences'),
        kind: { type: 'string', enum: ['note', 'call', 'meeting', 'email', 'review'], description: 'Default: note. "review" is a business review (QBR) and resets the customer\'s review rhythm' },
        happened_at: str('When it happened (ISO 8601, e.g. 2026-11-10T14:00:00Z); default now'),
      },
      ['account', 'text'],
    ),
    run: async (api, a, { base }) => {
      const id = await accountFor(api, a.account);
      if (!id) throw new ToolError('Say which customer.');
      const r = await api('POST', `/api/accounts/${id}/activities`, { kind: a.kind ?? 'note', body: a.text, happenedAt: a.happened_at });
      return { added: true, activity: r.activity, url: `${base}/accounts/${id}` };
    },
  },
  {
    name: 'update_task',
    title: 'Update a task',
    description: 'Move a task to another column (or mark it done), change its due date or priority, and/or add a comment.',
    write: true,
    inputSchema: obj(
      {
        task_id: str('Task id'),
        status: str('Column name, or "done" to finish it'),
        due_date: { type: ['string', 'null'], description: 'New due date YYYY-MM-DD, or null to clear' },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
        comment: str('A comment to add'),
      },
      ['task_id'],
    ),
    run: async (api, a) => {
      const id = String(a.task_id).replace(/^task:/, '');
      const { task } = await api('GET', `/api/tasks/${id}`);
      const changes: Json = { baseVersion: task.version };
      if (a.status) {
        const { boards } = await api('GET', '/api/boards');
        const cols: Json[] = boards.find((b: Json) => b.id === task.boardId)?.columns ?? [];
        const col = String(a.status).toLowerCase() === 'done' ? cols.find((c) => c.done) : cols.find((c) => c.key === a.status || c.name.toLocaleLowerCase('tr') === String(a.status).toLocaleLowerCase('tr'));
        if (!col) throw new ToolError(`No column "${a.status}". Columns: ${cols.map((c) => c.name).join(', ')}`);
        changes.status = col.key;
      }
      if (a.due_date !== undefined) changes.dueDate = a.due_date;
      if (a.priority) changes.priority = a.priority;
      const out: Json = {};
      if (Object.keys(changes).length > 1) out.task = (await api('PATCH', `/api/tasks/${id}`, changes)).task;
      if (a.comment) out.comment = (await api('POST', `/api/tasks/${id}/comments`, { body: a.comment })).comment;
      return { updated: true, ...out };
    },
  },
];

const textResult = (value: unknown, isError = false) => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 1).slice(0, 200_000) }],
  ...(isError || typeof value === 'string' ? {} : { structuredContent: value }),
  isError,
});

function unauthorized(c: C) {
  const base = orgUrl(c.get('deps').config, c.get('org').slug);
  return c.json({ jsonrpc: '2.0', error: { code: -32001, message: 'Sign in to Curahold to connect.' }, id: null }, 401, {
    ...open,
    'www-authenticate': `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`,
  });
}

mcpRoutes.options('/mcp', (c) => c.body(null, 204, { ...open, 'access-control-allow-methods': 'POST, GET, DELETE, OPTIONS' }));
mcpRoutes.get('/mcp', (c) => c.body(null, 405, { ...open, allow: 'POST' }));
mcpRoutes.delete('/mcp', (c) => c.body(null, 204, open));

mcpRoutes.post('/mcp', async (c) => {
  const bearer = /^Bearer\s+(\S+)/i.exec(c.req.header('authorization') ?? '')?.[1];
  const who = bearer ? await resolveToken(c.get('deps').db, c.get('org').id, bearer) : null;
  if (!who) return unauthorized(c);
  const base = orgUrl(c.get('deps').config, c.get('org').slug);
  const origin = new URL(c.req.url).origin;
  const self = c.get('self');
  // Calls go through the same API the app uses, with the same rules.
  const api: Api = async (method, path, body) => {
    const headers: Record<string, string> = { authorization: `Bearer ${bearer}`, 'x-curahold-locale': c.req.header('accept-language')?.startsWith('tr') ? 'tr' : 'en' };
    const devOrg = c.req.header('x-curahold-org');
    if (devOrg) headers['x-curahold-org'] = devOrg;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await self.request(`${origin}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ToolError(data?.message || `Request failed (${res.status})`);
    return data;
  };

  let msg: any;
  try {
    msg = await c.req.json();
  } catch {
    return c.json({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null }, 400, open);
  }
  const handle = async (m: any) => {
    if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return { jsonrpc: '2.0', error: { code: -32600, message: 'Invalid request' }, id: m?.id ?? null };
    if (m.id === undefined) return null; // a notification: nothing to answer
    const ok = (result: unknown) => ({ jsonrpc: '2.0', result, id: m.id });
    switch (m.method) {
      case 'initialize':
        return ok({
          protocolVersion: typeof m.params?.protocolVersion === 'string' ? m.params.protocolVersion : PROTOCOL,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'curahold', title: 'Curahold', version: '1.0.0' },
          instructions:
            "Curahold holds this company's customers (accounts), their contacts and stakeholders, and the team's tasks. Use search/fetch to find things, list_accounts and portfolio_summary for overviews and presentations, create_task and update_task to act. Everything is limited to what the connected person may see and do.",
        });
      case 'ping':
        return ok({});
      case 'tools/list':
        return ok({
          tools: TOOLS.filter((t) => !t.write || who.canWrite).map((t) => ({
            name: t.name,
            title: t.title,
            description: t.description,
            inputSchema: t.inputSchema,
            annotations: { readOnlyHint: !t.write, destructiveHint: false, openWorldHint: false },
          })),
        });
      case 'tools/call': {
        const tool = TOOLS.find((t) => t.name === m.params?.name);
        if (!tool) return { jsonrpc: '2.0', error: { code: -32602, message: `Unknown tool: ${m.params?.name}` }, id: m.id };
        if (tool.write && !who.canWrite) return ok(textResult('This connection is read only. Reconnect and allow changes to use this tool.', true));
        try {
          return ok(textResult(await tool.run(api, m.params?.arguments ?? {}, { base })));
        } catch (e) {
          return ok(textResult(e instanceof Error ? e.message : 'Something went wrong.', true));
        }
      }
      default:
        return { jsonrpc: '2.0', error: { code: -32601, message: `Method not found: ${m.method}` }, id: m.id };
    }
  };
  if (Array.isArray(msg)) {
    const out = (await Promise.all(msg.map(handle))).filter(Boolean);
    return out.length ? c.json(out, 200, open) : c.body(null, 202, open);
  }
  const out = await handle(msg);
  return out ? c.json(out, 200, open) : c.body(null, 202, open);
});
