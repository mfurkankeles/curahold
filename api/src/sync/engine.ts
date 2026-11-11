// The sync engine. One run for one connection:
//   1. send changes made in Tendwell since the last run (queued in sync_changes),
//   2. read what changed on the other side, object by object (accounts first,
//      so records and tasks can find their account), and apply it,
//   3. on a full run, archive what disappeared there,
//   4. record what happened (sync_runs) for the history screen.
// Works with owner access, so every statement filters by company explicitly.
import { normalizeValue, optionKey, parseDate } from '../../../shared/src/fields';
import type { Locale } from '../../../shared/src/i18n';
import { calculated, type AccountField, type FieldOption } from '../../../shared/src/model';
import { emptyStats, type FieldMap, type ObjectMap, type RemoteField, type RemoteUser, type SyncConfig, type SyncPreview, type SyncRun, type SyncStats, type TargetKind } from '../../../shared/src/sync';
import { fetchOf, nowOf, secretsKey, type Deps } from '../context';
import type { Q, Row } from '../db';
import { seal, sha256Hex, unseal } from '../lib/crypto';
import { iso } from '../lib/mappers';
import { fullName } from '../../../shared/src/records';
import { recomputeRollups } from '../lib/records';
import { CRM_ADAPTERS, isCrm, oauthClient } from './adapters';
import { CrmError, plain, type CrmAdapter, type CrmCtx, type CrmSecret, type RemoteRow } from './adapters/types';

const MAX_ERRORS = 50;
const BACKOFF_MIN = [1, 5, 30, 120, 720, 1440];
const STALE_RUN_MS = 20 * 60_000;

export interface LoadedCrm {
  id: string;
  orgId: string;
  provider: string;
  label: string;
  status: string;
  config: Record<string, any>;
  sync: SyncConfig;
  state: Record<string, any>;
  secret: CrmSecret;
}

export async function loadCrm(deps: Deps, orgId: string, id: string): Promise<LoadedCrm | null> {
  const [r] = await deps.db.system((q) => q.query(`select * from connections where id = $1 and org_id = $2 and kind = 'source'`, [id, orgId]));
  if (!r || !isCrm(r.provider)) return null;
  const config = r.config ?? {};
  return {
    id: r.id,
    orgId: r.org_id,
    provider: r.provider,
    label: r.label,
    status: r.status,
    config,
    sync: normalizeSync(config.sync),
    state: r.state ?? {},
    secret: (await unseal<CrmSecret>(r.secret ?? null, secretsKey(deps.config))) ?? {},
  };
}

export function normalizeSync(raw: any): SyncConfig {
  return { objects: Array.isArray(raw?.objects) ? raw.objects : [], owners: raw?.owners ?? {}, conflict: raw?.conflict ?? 'latest', file: raw?.file, startedAt: raw?.startedAt };
}

/** A context whose token refreshes itself and is saved, sealed, when it does. */
export function crmCtx(deps: Deps, conn: LoadedCrm): CrmCtx {
  const adapter = CRM_ADAPTERS[conn.provider as keyof typeof CRM_ADAPTERS];
  const client = oauthClient(deps.config, adapter.provider);
  const fetcher = fetchOf(deps);
  const now = () => nowOf(deps);
  const config: Record<string, any> = { ...conn.config, ...(conn.sync.file ? { file: conn.sync.file } : {}) };
  let refreshing: Promise<string> | null = null;
  const refresh = () =>
    (refreshing ??= (async () => {
      if (!client) throw new CrmError('This server is not set up for the service', 0, undefined, true);
      const next = await adapter.refresh({ fetch: fetcher, now, config }, conn.secret, client);
      conn.secret = { ...conn.secret, ...next };
      const extra: Record<string, unknown> = {};
      if (next.instanceUrl) extra.instanceUrl = config.instanceUrl = next.instanceUrl;
      if (next.apiDomain) extra.apiDomain = config.apiDomain = next.apiDomain;
      const sealed = await seal(conn.secret, secretsKey(deps.config));
      await deps.db.system((q) =>
        q.query('update connections set secret = $3, config = config || $4::jsonb, updated_at = now() where id = $1 and org_id = $2', [conn.id, conn.orgId, sealed, JSON.stringify(extra)]),
      );
      return conn.secret.accessToken!;
    })().finally(() => (refreshing = null)));
  return {
    fetch: fetcher,
    now,
    config,
    async token() {
      const s = conn.secret;
      if (!s.accessToken || (s.expiresAt && s.expiresAt - 60_000 < now().getTime())) return refresh();
      return s.accessToken;
    },
    refresh,
  };
}

// --------------------------------------------------------------- converting

const TRUE = /^(true|yes|1|evet|y)$/i;
const DONE = /(complet|done|closed|finish|tamam|bitti|kapal)/i;

type Lookups = {
  userFor: (remote: unknown, type: RemoteField['type']) => string | null;
  remoteUserFor: (localId: string | null, type: RemoteField['type']) => string | null;
  accountFor: (remoteId: unknown) => string | null;
  remoteAccountFor: (localId: string | null) => string | null;
};

interface Defs {
  locale: Locale;
  accountFields: AccountField[];
  types: Map<string, Row>;
  boards: Map<string, Row>;
  /** Field lists that gained options during this run and must be saved. */
  dirty: Set<string>;
}

const fieldDefs = (defs: Defs, map: ObjectMap): AccountField[] =>
  map.target === 'account' ? defs.accountFields : map.target === 'record' ? (defs.types.get(map.typeKey ?? '')?.fields ?? []) : [];

function toDate(raw: unknown, locale: Locale): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number' && raw > 20000 && raw < 80000) {
    // Spreadsheet serial day number.
    return new Date(Date.UTC(1899, 11, 30) + raw * 86_400_000).toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  if (/^\d{12,}$/.test(s)) return new Date(Number(s)).toISOString().slice(0, 10);
  return parseDate(s, locale);
}

/** One remote value → the local field's value; grows select options when a new one appears. */
function inValue(def: AccountField, rf: RemoteField | undefined, raw: unknown, defs: Defs, dirtyKey: string): string | number | null {
  let v = plain(raw);
  if (v === null || v === '') return null;
  if (def.type === 'date') return toDate(v, defs.locale);
  if (def.type === 'number' || def.type === 'money') {
    if (typeof v === 'number') return v;
    const r = normalizeValue(def, v, defs.locale);
    return 'error' in r ? null : r.value;
  }
  if (def.type === 'select') {
    if (rf?.type === 'bool' || typeof v === 'boolean') v = v === true || TRUE.test(String(v)) ? 'yes' : 'no';
    const s = String(v);
    const opts = (def.options ??= []);
    const hit = opts.find((o) => o.value === s) ?? opts.find((o) => o.key === s);
    if (hit) return hit.key;
    const r = normalizeValue(def, s, defs.locale);
    if (!('error' in r)) return r.value;
    if (opts.length >= 300) return null;
    const label = rf?.options?.find((o) => o.value === s)?.label ?? s;
    let k = optionKey(label);
    while (opts.some((o) => o.key === k)) k = `${k}_`.slice(0, 40);
    const opt: FieldOption = { key: k, label: { en: label.slice(0, 80), tr: label.slice(0, 80) }, value: s.slice(0, 200) };
    opts.push(opt);
    defs.dirty.add(dirtyKey);
    return k;
  }
  if (def.type === 'email') return String(v).trim().toLowerCase().slice(0, 254);
  return String(v).slice(0, 2000);
}

function outValue(def: AccountField, rf: RemoteField, value: unknown): unknown {
  if (value === null || value === undefined || value === '') return null;
  if (def.type === 'select') {
    const opt = def.options?.find((o) => o.key === value);
    if (rf.type === 'bool') return value === 'yes';
    const out = opt?.value ?? opt?.label.en ?? opt?.label.tr ?? String(value);
    if (rf.options?.length && !rf.options.some((o) => o.value === out)) {
      // Matched by label when the option was created here.
      const byLabel = rf.options.find((o) => o.label.toLowerCase() === String(opt?.label.en ?? opt?.label.tr ?? out).toLowerCase());
      return byLabel?.value ?? out;
    }
    return out;
  }
  if (def.type === 'date') return rf.type === 'datetime' ? `${value}T00:00:00Z` : value;
  if (rf.type === 'number' || rf.type === 'money' || rf.type === 'percent') return typeof value === 'number' ? value : Number(value);
  return value;
}

/** Remote row → local values, keyed the way the mapping names them. */
export function mapIn(map: ObjectMap, row: RemoteRow, meta: Map<string, RemoteField>, defs: Defs, look: Lookups): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const list = fieldDefs(defs, map);
  const dirtyKey = map.target === 'account' ? 'account' : `type:${map.typeKey}`;
  for (const fm of map.fields) {
    const rf = meta.get(fm.remote);
    const raw = row.values[fm.remote];
    switch (fm.local) {
      case 'name':
      case 'title':
        out[fm.local] = String(plain(raw) ?? '').trim().slice(0, fm.local === 'name' ? 200 : 500);
        break;
      case 'description':
        out.description = String(plain(raw) ?? '').slice(0, 10_000);
        break;
      case 'owner':
      case 'assignee':
        out[fm.local] = look.userFor(raw, rf?.type ?? 'user');
        break;
      case 'account':
        out.account = look.accountFor(plain(raw));
        break;
      case 'parent': {
        const v = plain(raw);
        out.parentRemote = v === null || v === '' ? null : String(v);
        break;
      }
      case 'due':
        out.due = toDate(plain(raw), defs.locale);
        break;
      case 'done': {
        const v = plain(raw);
        out.done = rf?.type === 'bool' ? v === true || TRUE.test(String(v)) : DONE.test(String(rf?.options?.find((o) => o.value === v)?.label ?? v ?? ''));
        break;
      }
      default:
        if (fm.local.startsWith('f:')) {
          const def = list.find((d) => d.key === fm.local.slice(2));
          if (def && !calculated(def)) out[fm.local] = inValue(def, rf, raw, defs, dirtyKey);
        }
    }
  }
  // Contacts: the name follows first and last name when the name itself is not synced.
  if (map.target === 'record' && defs.types.get(map.typeKey ?? '')?.kind === 'contact' && !('name' in out)) {
    const n = fullName(out['f:first_name'], out['f:last_name']);
    if (n) out.name = n.slice(0, 300);
  }
  // Opportunities: open, won or lost, from whatever the CRM says.
  if (map.target === 'record' && defs.types.get(map.typeKey ?? '')?.kind === 'opportunity' && !map.fields.some((f) => f.local === 'f:status')) {
    out['f:status'] = opportunityStatus(row.values, out['f:stage'], defs.types.get(map.typeKey ?? '')?.fields ?? []);
  }
  return out;
}

/** Fields read only to work out an opportunity's status. */
export const STATUS_FIELDS = ['IsClosed', 'IsWon', 'hs_is_closed', 'hs_is_closed_won', 'statecode', 'status', 'Stage'];

function opportunityStatus(values: Record<string, unknown>, stageKey: unknown, fields: AccountField[]): 'open' | 'won' | 'lost' {
  const t = (v: unknown) => v === true || TRUE.test(String(v));
  if ('IsClosed' in values || 'IsWon' in values) return t(values.IsWon) ? 'won' : t(values.IsClosed) ? 'lost' : 'open';
  if ('hs_is_closed_won' in values || 'hs_is_closed' in values) return t(values.hs_is_closed_won) ? 'won' : t(values.hs_is_closed) ? 'lost' : 'open';
  if (values.statecode !== undefined && values.statecode !== null) return String(values.statecode) === '1' ? 'won' : String(values.statecode) === '2' ? 'lost' : 'open';
  if (typeof values.status === 'string' && /^(won|lost|open)$/.test(values.status)) return values.status as 'won' | 'lost' | 'open';
  const stage = fields.find((f) => f.key === 'stage')?.options?.find((o) => o.key === stageKey);
  const label = `${stage?.label.en ?? ''} ${stage?.label.tr ?? ''} ${values.Stage ?? ''}`.toLowerCase();
  if (/won|kazan/.test(label)) return 'won';
  if (/lost|kayb|closed/.test(label)) return 'lost';
  return 'open';
}

/** Local item → remote values for the fields that go back (all, or only `changed`). */
export function mapOut(map: ObjectMap, item: Row, changed: string[] | null, meta: Map<string, RemoteField>, defs: Defs, look: Lookups, creating: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const list = fieldDefs(defs, map);
  const board = map.target === 'task' ? defs.boards.get(item.board_id) : null;
  for (const fm of map.fields) {
    if (fm.dir !== 'both') continue;
    const rf = meta.get(fm.remote);
    if (!rf || rf.type === 'id' || !(creating ? (rf.createable ?? rf.updatable) : rf.updatable)) continue;
    if (changed && !changed.includes(fm.local)) continue;
    let v: unknown;
    switch (fm.local) {
      case 'name':
        v = item.name;
        break;
      case 'title':
        v = item.title;
        break;
      case 'description':
        v = item.description ?? '';
        break;
      case 'owner':
        v = look.remoteUserFor(item.owner_id ?? null, rf.type);
        if (v === null && item.owner_id) continue;
        break;
      case 'assignee':
        v = look.remoteUserFor(item.assignee_ids?.[0] ?? null, rf.type);
        if (v === null && item.assignee_ids?.[0]) continue;
        break;
      case 'account':
        v = look.remoteAccountFor(item.account_id ?? null);
        if (v === null && item.account_id) continue;
        break;
      case 'parent':
        // Filled in by the caller: the parent's id on the other side, if it is there.
        v = item.__parent_remote ?? null;
        if (v === null && item.parent_id) continue;
        break;
      case 'due': {
        const d = item.due_date ? iso(item.due_date)?.slice(0, 10) ?? String(item.due_date).slice(0, 10) : null;
        v = d && rf.type === 'datetime' ? `${d}T00:00:00Z` : d;
        break;
      }
      case 'done': {
        const done = !!(board?.columns as any[])?.find((c) => c.key === item.status)?.done;
        if (rf.type === 'bool') v = done;
        else if (rf.options?.length) v = (done ? rf.options.find((o) => DONE.test(o.label)) : rf.options.find((o) => !DONE.test(o.label)))?.value ?? null;
        else v = done ? 'Completed' : 'Not Started';
        if (v === null) continue;
        break;
      }
      default: {
        if (!fm.local.startsWith('f:')) continue;
        const def = list.find((d) => d.key === fm.local.slice(2));
        if (!def || def.rollup) continue;
        v = outValue(def, rf, item.fields?.[def.key] ?? null);
      }
    }
    out[fm.remote] = v ?? null;
  }
  return out;
}

const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));
const hashRow = (map: ObjectMap, row: RemoteRow) => sha256Hex(stable(map.fields.map((f) => [f.remote, row.values[f.remote] ?? null])));

// --------------------------------------------------------------------- runs

interface RunCtx {
  deps: Deps;
  conn: LoadedCrm;
  adapter: CrmAdapter;
  ctx: CrmCtx;
  defs: Defs;
  stats: Record<string, SyncStats>;
  errors: SyncRun['errors'];
  remoteUsers: RemoteUser[];
  localUsers: Row[];
  accountLinks: Map<string, string>;
  accountRemote: Map<string, string>;
  meta: Map<string, Map<string, RemoteField>>;
  deadline: number;
  look: Lookups;
}

const statsOf = (r: RunCtx, object: string) => (r.stats[object] ??= emptyStats());
function noteError(r: RunCtx, object: string, message: string, remoteId?: string, name?: string) {
  statsOf(r, object).failed++;
  if (r.errors.length < MAX_ERRORS) r.errors.push({ object, remoteId, name, message: message.slice(0, 300) });
}

async function loadDefs(deps: Deps, orgId: string): Promise<{ defs: Defs; localUsers: Row[] }> {
  return deps.db.system(async (q) => {
    const [org] = await q.query('select locale, account_fields from orgs where id = $1', [orgId]);
    const types = await q.query('select * from record_types where org_id = $1', [orgId]);
    const boards = await q.query('select id, columns from boards where org_id = $1', [orgId]);
    const localUsers = await q.query(`select id, email, name from users where org_id = $1 and status in ('active', 'invited')`, [orgId]);
    return {
      defs: {
        locale: org.locale,
        accountFields: JSON.parse(JSON.stringify(org.account_fields ?? [])),
        types: new Map(types.map((t) => [t.key, { ...t, fields: JSON.parse(JSON.stringify(t.fields ?? [])) }])),
        boards: new Map(boards.map((b) => [b.id, b])),
        dirty: new Set<string>(),
      },
      localUsers,
    };
  });
}

const fold = (s: string) => s.toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').trim();

function lookups(r: Omit<RunCtx, 'look'>): Lookups {
  const byEmail = new Map(r.localUsers.map((u) => [String(u.email).toLowerCase(), u.id as string]));
  const byName = new Map(r.localUsers.map((u) => [fold(u.name), u.id as string]));
  const owners = r.conn.sync.owners ?? {};
  const remoteToLocal = new Map<string, string | null>();
  for (const ru of r.remoteUsers) {
    const local = ru.id in owners ? owners[ru.id] : ru.email ? (byEmail.get(ru.email) ?? null) : (byName.get(fold(ru.name)) ?? null);
    remoteToLocal.set(ru.id, local && r.localUsers.some((u) => u.id === local) ? local : null);
  }
  const localToRemote = new Map<string, string>();
  for (const [rid, lid] of remoteToLocal) if (lid && !localToRemote.has(lid)) localToRemote.set(lid, rid);
  return {
    userFor(raw, type) {
      const v = plain(raw);
      if (v === null || v === '') return null;
      if (type === 'person') {
        const s = String(v).trim();
        return byEmail.get(s.toLowerCase()) ?? byName.get(fold(s)) ?? null;
      }
      return remoteToLocal.get(String(v)) ?? null;
    },
    remoteUserFor(localId, type) {
      if (!localId) return null;
      if (type === 'person') return r.localUsers.find((u) => u.id === localId)?.email ?? null;
      return localToRemote.get(localId) ?? null;
    },
    accountFor: (remoteId) => (remoteId === null || remoteId === undefined || remoteId === '' ? null : (r.accountLinks.get(String(remoteId)) ?? null)),
    remoteAccountFor: (localId) => (localId ? (r.accountRemote.get(localId) ?? null) : null),
  };
}

async function loadAccountLinks(r: Pick<RunCtx, 'deps' | 'conn' | 'accountLinks' | 'accountRemote'>) {
  const rows = await r.deps.db.system((q) =>
    q.query(`select remote_id, entity_id from sync_links where org_id = $1 and connection_id = $2 and entity = 'account' and entity_id is not null and not ignored`, [r.conn.orgId, r.conn.id]),
  );
  r.accountLinks.clear();
  r.accountRemote.clear();
  for (const l of rows) {
    r.accountLinks.set(l.remote_id, l.entity_id);
    r.accountRemote.set(l.entity_id, l.remote_id);
  }
}

async function metaFor(r: RunCtx, object: string): Promise<Map<string, RemoteField>> {
  let m = r.meta.get(object);
  if (!m) {
    m = new Map((await r.adapter.fields(r.ctx, object)).map((f) => [f.name, f]));
    r.meta.set(object, m);
  }
  return m;
}

async function prepare(deps: Deps, conn: LoadedCrm, budgetMs: number): Promise<RunCtx> {
  const adapter = CRM_ADAPTERS[conn.provider as keyof typeof CRM_ADAPTERS];
  const ctx = crmCtx(deps, conn);
  const { defs, localUsers } = await loadDefs(deps, conn.orgId);
  const needsUsers = conn.sync.objects.some((o) => o.enabled && o.fields.some((f) => f.local === 'owner' || f.local === 'assignee'));
  const remoteUsers = needsUsers && !adapter.tabular ? await adapter.users(ctx) : [];
  const base = { deps, conn, adapter, ctx, defs, stats: {}, errors: [], remoteUsers, localUsers, accountLinks: new Map(), accountRemote: new Map(), meta: new Map(), deadline: Date.now() + budgetMs } as Omit<RunCtx, 'look'>;
  await loadAccountLinks(base);
  return { ...base, look: lookups(base) };
}

/** Saves select options added while reading, so later rows and the UI see them. */
async function saveDefs(r: RunCtx) {
  if (!r.defs.dirty.size) return;
  await r.deps.db.system(async (q) => {
    if (r.defs.dirty.has('account')) await q.query('update orgs set account_fields = $2 where id = $1', [r.conn.orgId, JSON.stringify(r.defs.accountFields)]);
    for (const [key, t] of r.defs.types) {
      if (r.defs.dirty.has(`type:${key}`)) await q.query('update record_types set fields = $3 where id = $1 and org_id = $2', [t.id, r.conn.orgId, JSON.stringify(t.fields)]);
    }
  });
  r.defs.dirty.clear();
}

// -------------------------------------------------------------------- pull

const TABLE: Record<TargetKind, string> = { account: 'accounts', record: 'records', task: 'tasks' };

async function existingFor(q: Q, r: RunCtx, map: ObjectMap, ids: string[]): Promise<Map<string, Row>> {
  if (!ids.length) return new Map();
  const rows = await q.query(`select * from ${TABLE[map.target]} where org_id = $1 and id = any($2::uuid[])`, [r.conn.orgId, ids]);
  return new Map(rows.map((x) => [x.id, x]));
}

/** Local values from mapIn → a patch against the current row (only what differs). */
function diff(map: ObjectMap, cur: Row | null, vals: Record<string, unknown>, board: Row | null): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  const curFields = cur?.fields ?? {};
  for (const [k, v] of Object.entries(vals)) {
    if (k.startsWith('f:')) {
      const key = k.slice(2);
      if (JSON.stringify(curFields[key] ?? null) !== JSON.stringify(v ?? null)) p[k] = v;
      continue;
    }
    switch (k) {
      case 'name':
        if (v && v !== cur?.name) p.name = v;
        break;
      case 'title':
        if (v && v !== cur?.title) p.title = v;
        break;
      case 'description':
        if ((v ?? '') !== (cur?.description ?? '')) p.description = v ?? '';
        break;
      case 'owner':
        if ((v ?? null) !== (cur?.owner_id ?? null)) p.owner = v ?? null;
        break;
      case 'assignee':
        if ((v ?? null) !== (cur?.assignee_ids?.[0] ?? null)) p.assignee = v ?? null;
        break;
      case 'account':
        if ((v ?? null) !== (cur?.account_id ?? null)) p.account = v ?? null;
        break;
      case 'parent':
        if ((v ?? null) !== (cur?.parent_id ?? null)) p.parent = v ?? null;
        break;
      case 'due': {
        const was = cur?.due_date ? (iso(cur.due_date)?.slice(0, 10) ?? String(cur.due_date).slice(0, 10)) : null;
        if ((v ?? null) !== was) p.due = v ?? null;
        break;
      }
      case 'done': {
        const isDone = !!(board?.columns as any[])?.find((c) => c.key === cur?.status)?.done;
        if (!cur || isDone !== !!v) p.done = !!v;
        break;
      }
    }
  }
  return p;
}

async function writeEntity(q: Q, r: RunCtx, map: ObjectMap, cur: Row | null, patch: Record<string, unknown>): Promise<string> {
  const orgId = r.conn.orgId;
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (k.startsWith('f:')) fields[k.slice(2)] = v;
  if (map.target === 'task') {
    const board = r.defs.boards.get(map.boardId ?? '');
    if (!board) throw new CrmError('The board chosen for tasks no longer exists');
    const cols = board.columns as { key: string; done: boolean }[];
    const status = 'done' in patch ? (patch.done ? (cols.find((c) => c.done) ?? cols[cols.length - 1]).key : (cols.find((c) => !c.done) ?? cols[0]).key) : null;
    if (cur) {
      await q.query(
        `update tasks set title = coalesce($3, title), description = coalesce($4, description), due_date = case when $5 then $6::date else due_date end,
                assignee_ids = case when $7 then (case when $8::uuid is null then '{}'::uuid[] else array[$8::uuid] end) else assignee_ids end,
                account_id = case when $9 then $10::uuid else account_id end, status = coalesce($11, status),
                version = version + 1, updated_at = now()
          where id = $1 and org_id = $2`,
        [cur.id, orgId, patch.title ?? null, patch.description ?? null, 'due' in patch, patch.due ?? null, 'assignee' in patch, patch.assignee ?? null, 'account' in patch, patch.account ?? null, status],
      );
      return cur.id;
    }
    const st = status ?? cols[0].key;
    const [{ p }] = await q.query(`select coalesce(max(position), 0) + 1024 as p from tasks where org_id = $1 and board_id = $2 and status = $3`, [orgId, board.id, st]);
    const [t] = await q.query(
      `insert into tasks (org_id, board_id, title, description, status, assignee_ids, account_id, due_date, priority, position)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'normal', $9) returning id`,
      [orgId, board.id, (patch.title as string) || '—', patch.description ?? '', st, patch.assignee ? [patch.assignee] : [], patch.account ?? null, patch.due ?? null, Number(p)],
    );
    return t.id;
  }
  if (cur) {
    if (map.target === 'record') {
      await q.query(
        `update records set name = coalesce($3, name), owner_id = case when $4 then $5::uuid else owner_id end,
                account_id = case when $7 then $8::uuid else account_id end, parent_id = case when $9 then $10::uuid else parent_id end,
                fields = fields || $6::jsonb, updated_at = now()
          where id = $1 and org_id = $2`,
        [cur.id, orgId, patch.name ?? null, 'owner' in patch, patch.owner ?? null, JSON.stringify(fields), 'account' in patch, patch.account ?? null, 'parent' in patch, patch.parent ?? null],
      );
    } else {
      await q.query(
        `update accounts set name = coalesce($3, name), owner_id = case when $4 then $5::uuid else owner_id end, fields = fields || $6::jsonb, updated_at = now()
          where id = $1 and org_id = $2`,
        [cur.id, orgId, patch.name ?? null, 'owner' in patch, patch.owner ?? null, JSON.stringify(fields)],
      );
    }
    return cur.id;
  }
  const name = (patch.name as string) || '—';
  if (map.target === 'account') {
    const [a] = await q.query(`insert into accounts (org_id, name, owner_id, fields, source) values ($1, $2, $3, $4, $5) returning id`, [orgId, name, patch.owner ?? null, JSON.stringify(fields), r.conn.provider]);
    return a.id;
  }
  const type = r.defs.types.get(map.typeKey ?? '');
  if (!type) throw new CrmError('The record type for this object no longer exists');
  const [x] = await q.query(`insert into records (org_id, type_id, account_id, parent_id, name, owner_id, fields, source) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`, [
    orgId,
    type.id,
    patch.account ?? null,
    patch.parent ?? null,
    name,
    patch.owner ?? null,
    JSON.stringify(fields),
    r.conn.provider,
  ]);
  return x.id;
}

/** Applies one page of remote rows. Returns the local ids touched (for rollups). */
/** "Reports to" from the other side: same kind, same account, and no loops; otherwise left as it is. */
async function parentOk(q: Q, orgId: string, id: string | null, parentId: string, accountId: string | null): Promise<boolean> {
  const [p] = await q.query('select account_id from records where id = $1 and org_id = $2', [parentId, orgId]);
  if (!p || (p.account_id ?? null) !== (accountId ?? null)) return false;
  if (!id) return true;
  const [loop] = await q.query(
    `with recursive up(id, parent_id, depth) as (
       select id, parent_id, 0 from records where id = $1 and org_id = $3
       union all
       select x.id, x.parent_id, up.depth + 1 from records x join up on x.id = up.parent_id where up.depth < 100
     ) select 1 from up where id = $2 limit 1`,
    [parentId, id, orgId],
  );
  return !loop;
}

async function applyPage(
  r: RunCtx,
  map: ObjectMap,
  rows: RemoteRow[],
  seen: Set<string> | null,
  touchedAccounts: Set<string>,
  parents?: { links: Map<string, string>; pending: { id: string; remote: string }[] },
) {
  const meta = await metaFor(r, map.remote);
  const orgId = r.conn.orgId;
  const st = statsOf(r, map.remote);
  await r.deps.db.system(async (q) => {
    const links = await q.query(`select * from sync_links where org_id = $1 and connection_id = $2 and object = $3 and remote_id = any($4::text[])`, [orgId, r.conn.id, map.remote, rows.map((x) => x.id)]);
    const byRemote = new Map(links.map((l) => [l.remote_id, l]));
    const cur = await existingFor(q, r, map, links.filter((l) => l.entity_id).map((l) => l.entity_id));
    const pending = await q.query(`select entity_id, fields, changed_at from sync_changes where org_id = $1 and connection_id = $2 and entity = $3 and entity_id = any($4::uuid[])`, [
      orgId,
      r.conn.id,
      map.target,
      [...cur.keys()],
    ]);
    const pendingBy = new Map(pending.map((p) => [p.entity_id, p]));
    // Items here with no link yet, to match by name instead of duplicating.
    let byName: Map<string, Row> | null = null;
    const matchable = async () => {
      if (byName) return byName;
      const typeId = r.defs.types.get(map.typeKey ?? '')?.id ?? null;
      const typeFilter = map.target === 'record' ? 'and x.type_id = $4::uuid' : 'and $4::uuid is null';
      const rowsHere =
        map.target === 'task' || (map.target === 'record' && !typeId)
          ? []
          : await q.query(
              `select x.* from ${TABLE[map.target]} x where x.org_id = $1 and x.archived_at is null ${typeFilter}
                 and not exists (select 1 from sync_links l where l.connection_id = $2 and l.entity = $3 and l.entity_id = x.id)`,
              [orgId, r.conn.id, map.target, typeId],
            );
      byName = new Map();
      for (const x of rowsHere) {
        const k = `${fold(x.name)}|${map.target === 'record' ? (x.account_id ?? '') : ''}`;
        if (!byName.has(k)) byName.set(k, x);
      }
      return byName;
    };

    for (const row of rows) {
      seen?.add(row.id);
      await q.query('savepoint sync_row');
      try {
        const link = byRemote.get(row.id);
        let pendingParent: string | null = null;
        const remoteHash = await hashRow(map, row);
        if (link?.ignored || (link?.entity_id && link.remote_hash === remoteHash && cur.has(link.entity_id))) {
          await q.query('release savepoint sync_row');
          continue;
        }
        const vals = mapIn(map, row, meta, r.defs, r.look);
        let entity = link?.entity_id ? (cur.get(link.entity_id) ?? null) : null;
        if (!entity && !link && map.target !== 'task') {
          const names = await matchable();
          const k = `${fold(String(vals.name ?? ''))}|${map.target === 'record' ? ((vals.account as string) ?? '') : ''}`;
          entity = names.get(k) ?? null;
          if (entity) names.delete(k);
        }
        if ('parentRemote' in vals) {
          const remoteParent = vals.parentRemote as string | null;
          delete vals.parentRemote;
          const local = remoteParent ? parents?.links.get(remoteParent) : null;
          const accountId = (vals.account as string | null | undefined) ?? entity?.account_id ?? null;
          if (!remoteParent) vals.parent = null;
          else if (local && (await parentOk(q, orgId, entity?.id ?? null, local, accountId))) vals.parent = local;
          else if (!local) pendingParent = remoteParent;
        }
        const board = map.target === 'task' ? (r.defs.boards.get(map.boardId ?? '') ?? null) : null;
        let patch = diff(map, entity, vals, board);
        // Same field changed here and there since the last run: the policy decides.
        const pend = entity ? pendingBy.get(entity.id) : null;
        if (pend) {
          const localKeys: string[] | null = pend.fields;
          const remoteNewer = row.modifiedAt ? new Date(row.modifiedAt).getTime() > new Date(pend.changed_at).getTime() : false;
          const keepLocal = r.conn.sync.conflict === 'tendwell' || (r.conn.sync.conflict === 'latest' && !remoteNewer);
          if (keepLocal) {
            const keys = new Set(localKeys ?? Object.keys(patch));
            patch = Object.fromEntries(Object.entries(patch).filter(([k]) => !keys.has(k)));
          } else if (localKeys) {
            const left = localKeys.filter((k) => !(k in patch));
            if (left.length) await q.query('update sync_changes set fields = $2 where org_id = $1 and entity_id = $3 and connection_id = $4', [orgId, left, entity!.id, r.conn.id]);
            else await q.query('delete from sync_changes where org_id = $1 and entity_id = $2 and connection_id = $3', [orgId, entity!.id, r.conn.id]);
          }
        }
        let id = entity?.id ?? null;
        if (!entity || Object.keys(patch).length) {
          if (!entity && map.target !== 'task' && !vals.name) {
            await q.query('release savepoint sync_row');
            noteError(r, map.remote, 'Has no name', row.id);
            continue;
          }
          id = await writeEntity(q, r, map, entity, patch);
          if (entity) st.updated++;
          else st.created++;
        }
        if (map.target === 'account') touchedAccounts.add(id!);
        if (map.target === 'record') {
          if (entity?.account_id) touchedAccounts.add(entity.account_id);
          if (vals.account) touchedAccounts.add(vals.account as string);
        }
        await q.query(
          `insert into sync_links (org_id, connection_id, object, remote_id, entity, entity_id, remote_hash, remote_modified_at, synced_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, now())
           on conflict (connection_id, object, remote_id) do update set entity_id = excluded.entity_id, remote_hash = excluded.remote_hash,
              remote_modified_at = excluded.remote_modified_at, synced_at = now()`,
          [orgId, r.conn.id, map.remote, row.id, map.target, id, remoteHash, row.modifiedAt ?? null],
        );
        if (map.target === 'account') {
          r.accountLinks.set(row.id, id!);
          r.accountRemote.set(id!, row.id);
        }
        if (parents && id) {
          parents.links.set(row.id, id);
          if (pendingParent) parents.pending.push({ id, remote: pendingParent });
        }
        await q.query('release savepoint sync_row');
      } catch (e) {
        await q.query('rollback to savepoint sync_row');
        noteError(r, map.remote, e instanceof Error ? e.message : String(e), row.id, String(plain(row.values[map.fields.find((f) => f.local === 'name' || f.local === 'title')?.remote ?? '']) ?? ''));
      }
    }
  });
}

/** Archives items whose rows are gone on the other side; refuses when it looks like a bad read. */
async function archiveMissing(r: RunCtx, map: ObjectMap, remoteIds: string[] | null, seen: Set<string> | null) {
  const orgId = r.conn.orgId;
  await r.deps.db.system(async (q) => {
    let gone: Row[];
    if (remoteIds) {
      if (!remoteIds.length) return;
      gone = await q.query(`select * from sync_links where org_id = $1 and connection_id = $2 and object = $3 and remote_id = any($4::text[]) and not ignored`, [orgId, r.conn.id, map.remote, remoteIds]);
    } else {
      const all = await q.query(`select * from sync_links where org_id = $1 and connection_id = $2 and object = $3 and not ignored`, [orgId, r.conn.id, map.remote]);
      gone = all.filter((l) => !seen!.has(l.remote_id));
      if (gone.length && (seen!.size === 0 || (gone.length > 20 && gone.length > all.length / 2))) {
        noteError(r, map.remote, `${gone.length} items seem to be missing on the other side; nothing was archived to be safe`);
        return;
      }
    }
    for (const l of gone) {
      if (l.entity_id) await q.query(`update ${TABLE[map.target]} set archived_at = coalesce(archived_at, now()) where id = $1 and org_id = $2`, [l.entity_id, orgId]);
      await q.query('update sync_links set ignored = true, synced_at = now() where connection_id = $1 and object = $2 and remote_id = $3', [r.conn.id, map.remote, l.remote_id]);
      statsOf(r, map.remote).archived++;
    }
  });
}

const ORDER: Record<TargetKind, number> = { account: 0, record: 1, task: 2 };

async function recordLinks(r: RunCtx, object: string): Promise<Map<string, string>> {
  const rows = await r.deps.db.system((q) =>
    q.query(`select remote_id, entity_id from sync_links where org_id = $1 and connection_id = $2 and object = $3 and entity_id is not null and not ignored`, [r.conn.orgId, r.conn.id, object]),
  );
  return new Map(rows.map((x) => [x.remote_id, x.entity_id]));
}

async function settleParents(r: RunCtx, parents: { links: Map<string, string>; pending: { id: string; remote: string }[] }) {
  await r.deps.db.system(async (q) => {
    for (const p of parents.pending.splice(0)) {
      const local = parents.links.get(p.remote);
      if (!local) continue;
      const [me] = await q.query('select account_id from records where id = $1 and org_id = $2', [p.id, r.conn.orgId]);
      if (me && (await parentOk(q, r.conn.orgId, p.id, local, me.account_id))) {
        await q.query('update records set parent_id = $3 where id = $1 and org_id = $2', [p.id, r.conn.orgId, local]);
      }
    }
  });
}

async function pullAll(r: RunCtx, full: boolean): Promise<boolean> {
  const cursors: Record<string, string> = { ...(r.conn.state.cursors ?? {}) };
  const pages: Record<string, any> = { ...(r.conn.state.pages ?? {}) };
  let complete = true;
  const touchedAccounts = new Set<string>();
  const maps = r.conn.sync.objects.filter((o) => o.enabled).sort((a, b) => ORDER[a.target] - ORDER[b.target]);
  for (const map of maps) {
    if (Date.now() > r.deadline) {
      complete = false;
      break;
    }
    try {
      const meta = await metaFor(r, map.remote);
      const wanted = [...new Set(map.fields.map((f) => f.remote))].map((n) => meta.get(n)).filter((f): f is RemoteField => !!f);
      if (map.target === 'record' && r.defs.types.get(map.typeKey ?? '')?.kind === 'opportunity') {
        for (const n of STATUS_FIELDS) if (meta.has(n) && !wanted.some((w) => w.name === n)) wanted.push(meta.get(n)!);
      }
      // A run that stopped half way resumes exactly where it was.
      const saved = pages[map.remote] as unknown as { cursor: string; since: string | null; full: boolean; startedAt: string; maxSeen: string | null } | undefined;
      const readAll = saved ? saved.full : full || r.adapter.tabular || !cursors[map.remote];
      const since = saved ? saved.since : readAll ? null : cursors[map.remote];
      const startedAt = saved?.startedAt ?? r.ctx.now().toISOString();
      let maxSeen = saved?.maxSeen ?? since;
      // Archiving needs every row seen in one go, so a resumed full read skips it once.
      const seen = readAll && !saved ? new Set<string>() : null;
      let cursor: string | null = saved?.cursor ?? null;
      // Org charts: who reports to whom, resolved once every row of the object is here.
      const parents = map.target === 'record' && map.fields.some((f) => f.local === 'parent') ? { links: await recordLinks(r, map.remote), pending: [] as { id: string; remote: string }[] } : undefined;
      let done = false;
      while (!done) {
        const page = await r.adapter.list(r.ctx, map.remote, { since, cursor, fields: wanted, key: map.key });
        await applyPage(r, map, page.rows, seen, touchedAccounts, parents);
        for (const row of page.rows) if (row.modifiedAt && (!maxSeen || row.modifiedAt > maxSeen)) maxSeen = row.modifiedAt;
        cursor = page.next;
        done = !cursor;
        if (!done && Date.now() > r.deadline) {
          (pages as Record<string, unknown>)[map.remote] = { cursor, since, full: readAll, startedAt, maxSeen };
          complete = false;
          break;
        }
      }
      if (parents?.pending.length) await settleParents(r, parents);
      if (!done) break;
      delete pages[map.remote];
      // Next time: changes from the newest one seen (or from when this read began).
      cursors[map.remote] = maxSeen ?? startedAt;
      if (seen) await archiveMissing(r, map, null, seen);
      else if (!readAll && r.adapter.deleted && since) await archiveMissing(r, map, await r.adapter.deleted(r.ctx, map.remote, since), null);
      await saveDefs(r);
    } catch (e) {
      if (e instanceof CrmError && (e.auth || e.retryAfter)) throw e;
      noteError(r, map.remote, e instanceof Error ? e.message : String(e));
    }
  }
  await saveDefs(r);
  if (touchedAccounts.size) {
    await r.deps.db.system(async (q) => {
      const [org] = await q.query('select account_fields from orgs where id = $1', [r.conn.orgId]);
      await recomputeRollups(q, r.conn.orgId, org.account_fields ?? [], [...touchedAccounts]);
    });
  }
  r.conn.state = { ...r.conn.state, cursors, pages };
  return complete;
}

// -------------------------------------------------------------------- push

/** `freshOnly`: right after an edit, send only new changes; retries wait for a run that reads first. */
async function pushChanges(r: RunCtx, freshOnly = false): Promise<boolean> {
  const orgId = r.conn.orgId;
  const due = await r.deps.db.system((q) =>
    q.query(`select * from sync_changes where org_id = $1 and connection_id = $2 and next_at <= $3 ${freshOnly ? 'and attempts = 0' : ''} order by changed_at limit 200`, [orgId, r.conn.id, r.ctx.now()]),
  );
  due.sort((a, b) => ORDER[a.entity as TargetKind] - ORDER[b.entity as TargetKind]);
  for (const ch of due) {
    if (Date.now() > r.deadline) return false;
    const target = ch.entity as TargetKind;
    try {
      const [item] = await r.deps.db.system((q) => q.query(`select * from ${TABLE[target]} where id = $1 and org_id = $2`, [ch.entity_id, orgId]));
      const [link] = await r.deps.db.system((q) => q.query(`select * from sync_links where connection_id = $1 and entity = $2 and entity_id = $3`, [r.conn.id, target, ch.entity_id]));
      const typeKey = target === 'record' && item ? [...r.defs.types.values()].find((t) => t.id === item.type_id)?.key : undefined;
      const map = link
        ? r.conn.sync.objects.find((o) => o.enabled && o.remote === link.object)
        : r.conn.sync.objects.find((o) => o.enabled && o.create && o.target === target && (target !== 'record' || o.typeKey === typeKey) && (target !== 'task' || o.boardId === item?.board_id));
      if (!item || !map || link?.ignored || (item.archived_at && !link)) {
        await r.deps.db.system((q) => q.query('delete from sync_changes where id = $1 and org_id = $2', [ch.id, orgId]));
        continue;
      }
      const meta = await metaFor(r, map.remote);
      const fields = [...meta.values()];
      if (target === 'record' && item.parent_id && map.fields.some((f) => f.local === 'parent')) {
        const [pl] = await r.deps.db.system((q) =>
          q.query(`select remote_id from sync_links where connection_id = $1 and object = $2 and entity = 'record' and entity_id = $3 and not ignored`, [r.conn.id, map.remote, item.parent_id]),
        );
        if (pl) item.__parent_remote = pl.remote_id;
      }
      if (link) {
        const values = mapOut(map, item, ch.fields, meta, r.defs, r.look, false);
        if (Object.keys(values).length) await r.adapter.update(r.ctx, map.remote, link.remote_id, values, fields, map.key);
      } else {
        // Records and tasks go after their account; if it is not there yet, wait for it.
        if (item.account_id && !r.accountRemote.has(item.account_id) && target !== 'account') {
          const waiting = await r.deps.db.system((q) => q.query(`select 1 from sync_changes where org_id = $1 and connection_id = $2 and entity = 'account' and entity_id = $3`, [orgId, r.conn.id, item.account_id]));
          if (waiting.length) continue;
        }
        const values = mapOut(map, item, null, meta, r.defs, r.look, true);
        // Contacts: services that want first and last name separately get them split from the full name.
        if (meta.get('LastName')?.createable && !('LastName' in values) && item.name) {
          const parts = String(item.name).trim().split(/\s+/);
          values.LastName = parts.pop();
          if (parts.length && meta.get('FirstName')?.createable && !('FirstName' in values)) values.FirstName = parts.join(' ');
          delete values.Name;
        }
        const missing = fields.filter((f) => f.required && !(f.name in values) && f.type !== 'id' && f.type !== 'user');
        if (missing.length) throw new CrmError(`Needs ${missing.map((f) => f.label).join(', ')} to be created there`);
        const remoteId = await r.adapter.create(r.ctx, map.remote, values, fields, map.key);
        await r.deps.db.system((q) =>
          q.query(
            `insert into sync_links (org_id, connection_id, object, remote_id, entity, entity_id, synced_at) values ($1, $2, $3, $4, $5, $6, now())
             on conflict (connection_id, object, remote_id) do update set entity_id = excluded.entity_id, ignored = false, synced_at = now()`,
            [orgId, r.conn.id, map.remote, remoteId, target, item.id],
          ),
        );
        if (target === 'account') {
          r.accountLinks.set(remoteId, item.id);
          r.accountRemote.set(item.id, remoteId);
        }
      }
      // Our own write will come back on the next read; forget the old fingerprint so it is compared, not skipped.
      if (link) await r.deps.db.system((q) => q.query('update sync_links set remote_hash = null where connection_id = $1 and object = $2 and remote_id = $3', [r.conn.id, link.object, link.remote_id]));
      await r.deps.db.system((q) => q.query('delete from sync_changes where id = $1 and org_id = $2 and changed_at = $3', [ch.id, orgId, ch.changed_at]));
      statsOf(r, map.remote).pushed++;
    } catch (e) {
      if (e instanceof CrmError && (e.auth || e.retryAfter)) throw e;
      const attempts = ch.attempts + 1;
      const wait = BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)];
      await r.deps.db.system((q) =>
        q.query(`update sync_changes set attempts = $3, last_error = $4, next_at = $5 where id = $1 and org_id = $2`, [ch.id, orgId, attempts, String((e as Error).message).slice(0, 300), new Date(r.ctx.now().getTime() + wait * 60_000)]),
      );
      noteError(r, r.conn.sync.objects.find((o) => o.target === target)?.remote ?? target, (e as Error).message);
    }
  }
  return true;
}

// --------------------------------------------------------------- the runs

export interface RunOptions {
  trigger: SyncRun['trigger'];
  userId?: string | null;
  full?: boolean;
  /** Stop and save the place after this long (Workers: request lifetime). */
  budgetMs?: number;
  /** Only send queued changes. */
  pushOnly?: boolean;
}

async function claim(deps: Deps, conn: LoadedCrm, opts: RunOptions, mode: SyncRun['mode']): Promise<string | null> {
  return deps.db.system(async (q) => {
    // One run per connection at a time; a run that died long ago no longer counts.
    await q.query(`update sync_runs set status = 'error', finished_at = now(), errors = '[{"object":"","message":"Stopped"}]' where connection_id = $1 and status = 'running' and started_at < $2`, [
      conn.id,
      new Date(nowOf(deps).getTime() - STALE_RUN_MS),
    ]);
    const [busy] = await q.query(`select id from sync_runs where connection_id = $1 and status = 'running'`, [conn.id]);
    if (busy) return null;
    const [run] = await q.query(`insert into sync_runs (org_id, connection_id, mode, trigger, started_by, started_at) values ($1, $2, $3, $4, $5, $6) returning id`, [
      conn.orgId,
      conn.id,
      mode,
      opts.trigger,
      opts.userId ?? null,
      nowOf(deps),
    ]);
    return run.id as string;
  });
}

export async function syncConnection(deps: Deps, orgId: string, connectionId: string, opts: RunOptions): Promise<SyncRun | null> {
  const conn = await loadCrm(deps, orgId, connectionId);
  if (!conn || conn.status === 'disabled' || !conn.sync.startedAt) return null;
  const lastFull = conn.state.fullAt ? new Date(conn.state.fullAt).getTime() : 0;
  const full = !!opts.full || (!opts.pushOnly && nowOf(deps).getTime() - lastFull > 23 * 3_600_000);
  const mode: SyncRun['mode'] = full ? 'full' : 'incremental';
  const runId = await claim(deps, conn, opts, mode);
  if (!runId) return null;
  let status: SyncRun['status'] = 'ok';
  let more = false;
  let r: RunCtx | null = null;
  let fatal: string | null = null;
  try {
    r = await prepare(deps, conn, opts.budgetMs ?? 10 * 60_000);
    // Read first: a change made there after ours was queued must be seen
    // (and weighed by the conflict rule) before ours goes out.
    const pulled = opts.pushOnly ? true : await pullAll(r, full);
    const pushed = await pushChanges(r, !!opts.pushOnly);
    if (!pushed || !pulled) {
      status = 'partial';
      more = true;
    }
    if (pulled && full && !opts.pushOnly) conn.state.fullAt = nowOf(deps).toISOString();
  } catch (e) {
    status = 'error';
    fatal = e instanceof Error ? e.message : String(e);
    if (r) r.errors.unshift({ object: '', message: fatal });
  }
  const errors = r?.errors ?? [{ object: '', message: fatal ?? 'Failed' }];
  if (status === 'ok' && errors.length) status = 'partial';
  // A send-only run that had nothing to send leaves no trace in the history.
  const sent = Object.values(r?.stats ?? {}).reduce((n, x) => n + x.pushed + x.failed, 0);
  if (opts.pushOnly && status === 'ok' && sent === 0) {
    await deps.db.system((q) => q.query('delete from sync_runs where id = $1 and org_id = $2', [runId, orgId]));
    return null;
  }
  const authLost = fatal !== null && /reconnect|invalid_grant|expired|revoked|unauthori/i.test(fatal);
  const lastRun = { id: runId, status, more, at: nowOf(deps).toISOString(), stats: r?.stats ?? {} };
  await deps.db.system(async (q) => {
    await q.query(`update sync_runs set status = $3, finished_at = $4, stats = $5, errors = $6, more = $7 where id = $1 and org_id = $2`, [
      runId,
      orgId,
      status,
      nowOf(deps),
      JSON.stringify(r?.stats ?? {}),
      JSON.stringify(errors),
      more,
    ]);
    await q.query(
      `update connections set state = $3, status = case when $4 then 'error' when status = 'error' and $5 then 'active' else status end,
              last_error = case when $5 then null else $6 end, last_ok_at = case when $5 then now() else last_ok_at end, updated_at = now()
        where id = $1 and org_id = $2`,
      [conn.id, orgId, JSON.stringify({ ...conn.state, lastRun }), authLost, status !== 'error', fatal],
    );
  });
  const [row] = await deps.db.system((q) => q.query('select * from sync_runs where id = $1 and org_id = $2', [runId, orgId]));
  return toRun(row);
}

export const toRun = (r: Row): SyncRun => ({
  id: r.id,
  mode: r.mode,
  trigger: r.trigger,
  startedBy: r.started_by ?? null,
  startedAt: iso(r.started_at)!,
  finishedAt: iso(r.finished_at),
  status: r.status,
  more: !!r.more,
  stats: r.stats ?? {},
  errors: r.errors ?? [],
});

/** Sends what is queued for every connection of a company (after an edit). */
export async function pushOrg(deps: Deps, orgId: string) {
  const conns = await deps.db.system((q) =>
    q.query(
      `select distinct c.id from connections c join sync_changes s on s.connection_id = c.id
        where c.org_id = $1 and c.kind = 'source' and c.status = 'active' and s.next_at <= $2 and s.attempts = 0`,
      [orgId, nowOf(deps)],
    ),
  );
  for (const c of conns) await syncConnection(deps, orgId, c.id, { trigger: 'change', pushOnly: true, budgetMs: 20_000 }).catch(() => null);
}

/** The hourly run: every live connection reads its changes; failed sends are retried. */
export async function runScheduledSyncs(deps: Deps, now: Date, budgetMs = 10 * 60_000) {
  const conns = await deps.db.system((q) =>
    q.query(`select id, org_id, state from connections where kind = 'source' and status <> 'disabled' and config->'sync'->>'startedAt' is not null order by updated_at`),
  );
  let ran = 0;
  const until = Date.now() + budgetMs;
  for (const c of conns) {
    if (Date.now() > until) break;
    const last = c.state?.lastRun?.at ? new Date(c.state.lastRun.at).getTime() : 0;
    if (now.getTime() - last < 50 * 60_000 && !c.state?.lastRun?.more) continue;
    await syncConnection(deps, c.org_id, c.id, { trigger: 'schedule', budgetMs: Math.max(30_000, until - Date.now()) }).catch(() => null);
    ran++;
  }
  return ran;
}

// ------------------------------------------------------------------ preview

/** What a first sync would bring, without changing anything. */
export async function previewSync(deps: Deps, conn: LoadedCrm, sync: SyncConfig): Promise<SyncPreview> {
  const adapter = CRM_ADAPTERS[conn.provider as keyof typeof CRM_ADAPTERS];
  const ctx = crmCtx(deps, conn);
  const { defs, localUsers } = await loadDefs(deps, conn.orgId);
  const remoteUsers = adapter.tabular ? [] : await adapter.users(ctx).catch(() => []);
  const fake = { ...conn, sync } as LoadedCrm;
  const base = { deps, conn: fake, adapter, ctx, defs, stats: {}, errors: [], remoteUsers, localUsers, accountLinks: new Map(), accountRemote: new Map(), meta: new Map(), deadline: Date.now() + 20_000 } as Omit<RunCtx, 'look'>;
  const look = lookups(base);
  const existing = await deps.db.system((q) => q.query('select lower(name) as n from accounts where org_id = $1 and archived_at is null', [conn.orgId]));
  const names = new Set(existing.map((e) => fold(e.n)));
  const objects = [];
  for (const map of sync.objects.filter((o) => o.enabled)) {
    const fields = await adapter.fields(ctx, map.remote);
    const wanted = fields.filter((f) => map.fields.some((m) => m.remote === f.name));
    const page = await adapter.list(ctx, map.remote, { since: null, cursor: null, fields: wanted, key: map.key });
    const nameField = map.fields.find((f) => f.local === 'name' || f.local === 'title')?.remote;
    const sample = page.rows.slice(0, 5).map((row) => String(plain(row.values[nameField ?? '']) ?? row.id));
    const matched = map.target === 'account' ? page.rows.filter((row) => names.has(fold(String(plain(row.values[nameField ?? '']) ?? '')))).length : 0;
    objects.push({ remote: map.remote, label: map.label, total: page.next ? null : page.rows.length, matched, sample });
  }
  const owners = remoteUsers.map((u) => ({ remoteId: u.id, name: u.name, email: u.email, userId: look.userFor(u.id, 'user') }));
  return { objects, owners };
}

// ------------------------------------------------------- mapping suggestions

const SUGGEST: Record<string, Record<string, string>> = {
  account: { name: 'name', account_name: 'name', company: 'name', firma: 'name', owner: 'owner', ownerid: 'owner', hubspot_owner_id: 'owner', owner_id: 'owner', _ownerid_value: 'owner' },
  contact: { firstname: 'f:first_name', first_name: 'f:first_name', lastname: 'f:last_name', last_name: 'f:last_name', reportstoid: 'parent', reports_to: 'parent', linkedin: 'f:linkedin', linkedin_url: 'f:linkedin', hs_linkedin_url: 'f:linkedin', linkedin__c: 'f:linkedin', name: 'name', full_name: 'name', fullname: 'name', accountid: 'account', parentcustomerid: 'account', account_name: 'account', org_id: 'account', __company: 'account', email: 'f:email', emailaddress1: 'f:email', phone: 'f:phone', telephone1: 'f:phone', title: 'f:title', jobtitle: 'f:title', ownerid: 'owner', owner: 'owner', hubspot_owner_id: 'owner', owner_id: 'owner' },
  opportunity: { name: 'name', dealname: 'name', deal_name: 'name', title: 'name', accountid: 'account', customerid: 'account', account_name: 'account', org_id: 'account', __company: 'account', amount: 'f:amount', value: 'f:amount', estimatedvalue: 'f:amount', closedate: 'f:close_date', close_date: 'f:close_date', estimatedclosedate: 'f:close_date', expected_close_date: 'f:close_date', closing_date: 'f:close_date', stagename: 'f:stage', dealstage: 'f:stage', stage: 'f:stage', stage_id: 'f:stage', salesstage: 'f:stage', ownerid: 'owner', owner: 'owner', hubspot_owner_id: 'owner', user_id: 'owner' },
  task: { subject: 'title', hs_task_subject: 'title', title: 'title', whatid: 'account', what_id: 'account', regardingobjectid: 'account', org_id: 'account', __company: 'account', activitydate: 'due', due_date: 'due', scheduledend: 'due', hs_timestamp: 'due', description: 'description', hs_task_body: 'description', note: 'description', status: 'done', done: 'done', hs_task_status: 'done', statecode: 'done', ownerid: 'assignee', owner: 'assignee', hubspot_owner_id: 'assignee', user_id: 'assignee' },
};

/** First guess at how a CRM object's fields map onto Tendwell, by name. */
export function suggestFields(kind: 'account' | 'contact' | 'opportunity' | 'task' | 'custom', fields: RemoteField[], accountFields: AccountField[], typeFields: AccountField[]): FieldMap[] {
  const table = SUGGEST[kind === 'custom' ? 'contact' : kind] ?? {};
  const out: FieldMap[] = [];
  const used = new Set<string>();
  const local = kind === 'account' ? accountFields : typeFields;
  for (const f of fields) {
    const k = f.name.toLowerCase();
    let target = table[k];
    if (!target && kind === 'contact') {
      if (/stance|sentiment|duruş|tutum/i.test(`${f.name} ${f.label}`)) target = 'f:stance';
      else if (/buying.?role|decision|karar/i.test(`${f.name} ${f.label}`)) target = 'f:decision';
    }
    if (!target && kind === 'custom') {
      if (f.type === 'ref' && (f.refTo ?? []).some((t) => /^(account|accounts|companies|organizations)$/i.test(t))) target = 'account';
      else if (f.type === 'user' && /owner/i.test(f.name)) target = 'owner';
      else if (/^name$/i.test(f.name)) target = 'name';
    }
    if (!target) {
      const same = local.find((d) => d.key === k || d.label.en?.toLowerCase() === f.label.toLowerCase() || d.label.tr?.toLowerCase() === f.label.toLowerCase());
      if (same && !same.rollup) target = `f:${same.key}`;
    }
    if (!target && kind === 'account' && f.type === 'id') continue;
    if (!target || used.has(target)) continue;
    if (target === 'f:email' && kind !== 'contact') continue;
    used.add(target);
    out.push({ remote: f.name, local: target, dir: f.updatable ? 'both' : 'pull' });
  }
  // A custom object brings all of its own fields along as new fields.
  if (kind === 'custom') {
    for (const f of fields) {
      if (out.some((m) => m.remote === f.name) || f.type === 'id' || f.type === 'ref' || f.type === 'user') continue;
      if (/^(createddate|lastmodifieddate|systemmodstamp|isdeleted|lastvieweddate|lastreferenceddate|createdbyid|lastmodifiedbyid|hs_.*|created_time|modified_time|owneridtype|statecode)$/i.test(f.name)) continue;
      out.push({ remote: f.name, local: 'new', dir: f.updatable ? 'both' : 'pull' });
    }
  }
  return out;
}
