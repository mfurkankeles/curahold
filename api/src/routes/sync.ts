// CRM and spreadsheet connections: sign in, pick the file (spreadsheets),
// map objects and fields, preview, start, run now, history and problems.
// Everything here needs the "connected tools" permission.
import { Hono } from 'hono';
import { z } from 'zod';
import { optionKey } from '../../../shared/src/fields';
import type { AccountField } from '../../../shared/src/model';
import { BUILTIN_TYPES, type RecordKind } from '../../../shared/src/records';
import { KEY_FIELDS, type RemoteField, type SyncConfig, type SyncProblem } from '../../../shared/src/sync';
import { centralUrl, fetchOf, nowOf, orgUrl, requirePerm, requirePlan, run, secretsKey, type AppEnv, type C, type OrgRow } from '../context';
import { audit } from '../lib/audit';
import { base64url, randomToken, seal, sign, unseal } from '../lib/crypto';
import { fail } from '../lib/errors';
import { recomputeRollups } from '../lib/records';
import { body, param } from '../lib/validate';
import { CRM_ADAPTERS, isCrm, oauthClient } from '../sync/adapters';
import { demoStore } from '../sync/adapters/demo';
import { orgUrlOf } from '../sync/adapters/dynamics';
import { resolveExcelFile, resolveGoogleFile } from '../sync/adapters/sheets';
import { CrmError } from '../sync/adapters/types';
import { crmCtx, loadCrm, previewSync, suggestFields, syncConnection, toRun } from '../sync/engine';
import { crmFetch } from '../sync/relay';
import { createRecordType, keyFrom } from './records';

export const syncRoutes = new Hono<AppEnv>();

const REQUEST_BUDGET_MS = 20_000;

export interface CrmConnectState {
  o: string;
  p: string;
  u: string;
  r: string;
  n: string;
  x: number;
  /** What the administrator typed before signing in. */
  q: Record<string, string>;
  /** The sign-in's one-time proof (PKCE), sealed: it travels through the browser and must not be readable there. */
  k?: string;
  /** Set when reconnecting: the connection that lost its sign-in; signing in to a different account is refused. */
  rc?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const connectCallbackUrl = (c: C) => `${centralUrl(c.get('deps').config)}/api/connect/callback`;

/** Step one: off to the service's sign-in page. */
export async function crmStart(c: C, provider: string, back: string) {
  const deps = c.get('deps');
  const cfg = deps.config;
  const org = c.get('org');
  const home = `${orgUrl(cfg, org.slug)}${back}`;
  if (!isCrm(provider) || provider === 'demo') return c.redirect(`${home}?error=not_configured&provider=${provider}`);
  const client = oauthClient(cfg, provider);
  const adapter = CRM_ADAPTERS[provider];
  if (!client || !adapter.oauth) return c.redirect(`${home}?error=not_configured&provider=${provider}`);
  const q: Record<string, string> = {};
  // Reconnecting: the sign-in asks what it asked the first time (sandbox, Dynamics address), taken from the connection.
  let rc: string | undefined;
  let again: Record<string, any> = {};
  const reconnectId = c.req.query('reconnect') ?? '';
  if (reconnectId) {
    const [old] = UUID.test(reconnectId) ? await run(c, (x) => x.query(`select id, config from connections where id = $1 and kind = 'source' and provider = $2`, [reconnectId, provider])) : [];
    if (!old) return c.redirect(`${home}?error=connection_failed&provider=${provider}`);
    rc = old.id as string;
    again = old.config ?? {};
  }
  if (provider === 'salesforce' && (c.req.query('sandbox') === '1' || (rc && String(again.loginUrl ?? '').includes('test.salesforce.com')))) q.sandbox = '1';
  if (provider === 'dynamics') {
    const orgUrlRaw = orgUrlOf(c.req.query('orgUrl') ?? again.orgUrl ?? '');
    if (!orgUrlRaw) return c.redirect(`${home}?error=dynamics_url&provider=dynamics`);
    q.orgUrl = orgUrlRaw;
  }
  const state: CrmConnectState = { o: org.slug, p: provider, u: c.get('auth').userId, r: back, n: randomToken(12), x: nowOf(deps).getTime() + 15 * 60_000, q, ...(rc ? { rc } : {}) };
  const opts = { ...q };
  if (adapter.oauth.pkce) {
    const verifier = randomToken(48);
    opts.code_challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    state.k = await seal({ v: verifier }, secretsKey(cfg));
  }
  const signed = await sign(state, cfg.authSecret);
  return c.redirect(adapter.oauth.authorizeUrl(client, connectCallbackUrl(c), signed, opts));
}

/** Step two (central address): the service sends the administrator back with a code. */
export async function crmCallback(c: C, state: CrmConnectState, code: string, org: OrgRow) {
  const deps = c.get('deps');
  const cfg = deps.config;
  const home = `${orgUrl(cfg, state.o)}${state.r}`;
  const provider = state.p as keyof typeof CRM_ADAPTERS;
  const adapter = CRM_ADAPTERS[provider];
  const client = oauthClient(cfg, provider);
  if (!adapter?.oauth || !client) return c.redirect(`${home}?error=not_configured&provider=${provider}`);
  let made;
  try {
    const extras: Record<string, string> = { ...state.q, 'accounts-server': c.req.query('accounts-server') ?? '' };
    if (adapter.oauth.pkce) {
      const proof = state.k ? await unseal<{ v: string }>(state.k, secretsKey(cfg)) : null;
      if (!proof?.v) return c.redirect(`${home}?error=connection_failed&provider=${provider}`);
      extras.code_verifier = proof.v;
    }
    made = await adapter.oauth.exchange(crmFetch(deps, provider), client, code, connectCallbackUrl(c), extras, nowOf(deps));
  } catch (e) {
    console.error('[curahold] crm connect failed', provider, (e as Error).message);
    return c.redirect(`${home}?error=connection_failed&provider=${provider}`);
  }
  const sealed = await seal(made.secret, secretsKey(cfg));
  const id = await deps.db.system(async (q) => {
    // Signing in again to the same CRM refreshes the credentials and keeps the mapping.
    const [same] = await q.query(`select id from connections where org_id = $1 and kind = 'source' and provider = $2 and config->>'instanceId' = $3`, [org.id, provider, made.instanceId]);
    // Reconnecting a connection that lost its sign-in: it must be the same account, not a new connection beside it.
    if (state.rc && same?.id !== state.rc) return 'wrong_account' as const;
    if (same) {
      await q.query(`update connections set secret = $3, config = config || $4::jsonb, label = $5, status = 'active', last_error = null, updated_at = now() where id = $1 and org_id = $2`, [
        same.id,
        org.id,
        sealed,
        JSON.stringify({ ...made.config, instanceId: made.instanceId }),
        made.label,
      ]);
      return same.id as string;
    }
    const [row] = await q.query(
      `insert into connections (org_id, kind, provider, label, config, secret, created_by) values ($1, 'source', $2, $3, $4, $5, $6) returning id`,
      [org.id, provider, made.label.slice(0, 120), JSON.stringify({ ...made.config, instanceId: made.instanceId, sync: { objects: [], owners: {}, conflict: 'latest' } }), sealed, state.u],
    );
    await q.query(`insert into audit_log (org_id, actor_id, action, entity, entity_id, meta) values ($1, $2, 'connection.created', 'connection', $3, $4)`, [org.id, state.u, row.id, JSON.stringify({ provider })]);
    return row.id as string;
  });
  if (id === 'wrong_account') return c.redirect(`${home}?error=wrong_account&provider=${provider}`);
  return c.redirect(`${orgUrl(cfg, state.o)}/settings/sources/${id}?connected=${provider}${state.r.startsWith('/setup') ? '&from=setup' : ''}`);
}

// ------------------------------------------------------------ with a key

/** Support tools and key-based CRMs: the administrator types the tool's address and a key; Curahold checks them right away. */
syncRoutes.post('/connections/key', async (c) => {
  requirePerm(c, 'connections.manage');
  // Values are short (an address, a key), except a service-account key file and a warehouse query.
  const input = await body(c, z.object({ provider: z.string().max(40), values: z.record(z.string().max(40), z.string().max(10_000)), reconnect: z.string().uuid().optional() }));
  const adapter = isCrm(input.provider) ? CRM_ADAPTERS[input.provider] : null;
  if (!adapter?.keyed) fail('not_found');
  const deps = c.get('deps');
  let made;
  try {
    made = await adapter!.keyed!.connect(fetchOf(deps), input.values, nowOf(deps));
  } catch (e) {
    crmFail(e);
  }
  const org = c.get('org');
  const auth = c.get('auth');
  const sealed = await seal(made!.secret, secretsKey(deps.config));
  const id = await deps.db.system(async (q) => {
    // The same workspace again: new key, same mapping and history.
    const [same] = await q.query(`select id from connections where org_id = $1 and kind = 'source' and provider = $2 and config->>'instanceId' = $3`, [org.id, input.provider, made!.instanceId]);
    // Reconnecting: the new key must open the same workspace, or it would start a second connection beside the broken one.
    if (input.reconnect && same?.id !== input.reconnect) return null;
    if (same) {
      await q.query(`update connections set secret = $3, status = 'active', last_error = null, config = config || $4::jsonb, updated_at = now() where id = $1 and org_id = $2`, [same.id, org.id, sealed, JSON.stringify(made!.config)]);
      await audit(q, { orgId: org.id, actorId: auth.userId, action: 'connection.reconnected', entity: 'connection', entityId: same.id, meta: { provider: input.provider } });
      return same.id as string;
    }
    const [row] = await q.query(
      `insert into connections (org_id, kind, provider, label, config, secret, created_by) values ($1, 'source', $2, $3, $4, $5, $6) returning id`,
      [org.id, input.provider, made!.label.slice(0, 120), JSON.stringify({ ...made!.config, instanceId: made!.instanceId, sync: { objects: [], owners: {}, conflict: 'latest' } }), sealed, auth.userId],
    );
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'connection.created', entity: 'connection', entityId: row.id, meta: { provider: input.provider } });
    return row.id as string;
  });
  if (!id) fail('validation', { fields: 'reconnect' }, { fields: ['reconnect'], reason: 'other_workspace' });
  return c.json({ id }, 201);
});

// ------------------------------------------------------------------- demo

const STAND_INS = { salesforce: 'Salesforce', hubspot: 'HubSpot', dynamics: 'Dynamics 365', pipedrive: 'Pipedrive', zoho: 'Zoho CRM', bitrix24: 'Bitrix24', freshsales: 'Freshsales', zendesksell: 'Zendesk Sell' } as const;
const STAND_IN_IDS = Object.keys(STAND_INS) as [keyof typeof STAND_INS, ...(keyof typeof STAND_INS)[]];

/** The pretend CRM, on servers that offer it (development, the live demo). */
syncRoutes.post('/connections/demo', async (c) => {
  requirePerm(c, 'connections.manage');
  const deps = c.get('deps');
  if (!deps.config.connectors.demoCrm) fail('not_configured');
  // The try-it demo offers the pretend CRM under each real CRM's button, so a
  // visitor walks the real steps; the connection says "(demo)" in its name.
  const input = await body(c, z.object({ as: z.enum(STAND_IN_IDS).optional() }));
  const label = input.as ? `${STAND_INS[input.as]} (demo)` : 'Demo CRM';
  const org = c.get('org');
  const auth = c.get('auth');
  const id = await run(c, async (q) => {
    const people = await q.query<{ id: string; name: string; email: string }>(`select id, name, email from users where status = 'active' order by created_at limit 6`);
    const demoId = `${org.id}:${randomToken(6)}`;
    const users = people.map((p, i) => ({ id: `U${i + 1}`, name: p.name, email: p.email }));
    demoStore(demoId, users);
    const [row] = await q.query(
      `insert into connections (org_id, kind, provider, label, config, created_by) values ($1, 'source', 'demo', $4, $2, $3) returning id`,
      [org.id, JSON.stringify({ demoId, users, instanceId: demoId, as: input.as ?? null, sync: { objects: [], owners: {}, conflict: 'latest' } }), auth.userId, label],
    );
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'connection.created', entity: 'connection', entityId: row.id, meta: { provider: 'demo' } });
    return row.id as string;
  });
  return c.json({ id }, 201);
});

// ---------------------------------------------------------------- reading

async function loaded(c: C) {
  requirePerm(c, 'connections.manage');
  const id = param(c, 'id');
  const conn = await loadCrm(c.get('deps'), c.get('org').id, id);
  if (!conn) fail('not_found');
  return conn!;
}

/** The non-secret things typed when connecting with a key (an address, a region, a query) that the config keeps. */
function prefillOf(provider: string, config: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of KEY_FIELDS[provider as keyof typeof KEY_FIELDS] ?? []) if (!f.secret && typeof config?.[f.key] === 'string') out[f.key] = config[f.key];
  return out;
}

function crmFail(e: unknown): never {
  if (e instanceof CrmError) fail('crm_error', { message: e.message }, { reason: e.message, auth: e.auth });
  throw e;
}

syncRoutes.get('/connections/:id/sync', async (c) => {
  const conn = await loaded(c);
  const adapter = CRM_ADAPTERS[conn.provider as keyof typeof CRM_ADAPTERS];
  const data = await run(c, async (q) => {
    const types = await q.query('select id, key, name, kind, fields from record_types where archived_at is null order by position, created_at');
    const boards = await q.query('select id, name from boards where archived_at is null order by sort_text(name)');
    const [pending] = await q.query<{ n: number; failing: number }>(`select count(*)::int as n, count(*) filter (where attempts > 0)::int as failing from sync_changes where connection_id = $1`, [conn.id]);
    const [row] = await q.query<{ last_error: string | null }>('select last_error from connections where id = $1', [conn.id]);
    return { types, boards, pending, lastError: row?.last_error };
  });
  const lastError = data.lastError;
  return c.json({
    connection: {
      id: conn.id,
      provider: conn.provider,
      standsFor: (conn.config?.as as string | undefined) ?? null,
      label: conn.label,
      status: conn.status,
      lastError: lastError ?? null,
      /** How to sign in again when the connection says its credentials stopped working. */
      reconnect: conn.config?.mode === 'basic' && adapter.keyed ? 'key' : adapter.oauth ? 'oauth' : adapter.keyed ? 'key' : null,
      /** What was typed the first time, minus secrets, to start the new key's form filled in. */
      prefill: adapter.keyed ? prefillOf(conn.provider, conn.config) : {},
      /** Jira: the sign-in is also offered where this server has the Atlassian app registered. */
      mode: (conn.config?.mode as string | undefined) ?? null,
      tabular: adapter.tabular,
      readOnly: !!adapter.readOnly,
      canReply: !!adapter.reply && !adapter.readOnly,
    },
    sync: conn.sync,
    state: { lastRun: conn.state.lastRun ?? null, fullAt: conn.state.fullAt ?? null },
    recordTypes: data.types,
    boards: data.boards,
    pending: data.pending,
  });
});

syncRoutes.get('/connections/:id/objects', async (c) => {
  const conn = await loaded(c);
  const adapter = CRM_ADAPTERS[conn.provider as keyof typeof CRM_ADAPTERS];
  try {
    return c.json({ objects: await adapter.objects(crmCtx(c.get('deps'), conn)) });
  } catch (e) {
    crmFail(e);
  }
});

syncRoutes.get('/connections/:id/objects/:object/fields', async (c) => {
  const conn = await loaded(c);
  const object = c.req.param('object');
  const kind = (c.req.query('kind') ?? 'custom') as 'account' | 'contact' | 'opportunity' | 'ticket' | 'task' | 'custom';
  const typeKey = c.req.query('typeKey') ?? '';
  const adapter = CRM_ADAPTERS[conn.provider as keyof typeof CRM_ADAPTERS];
  let fields: RemoteField[];
  try {
    fields = await adapter.fields(crmCtx(c.get('deps'), conn), object);
  } catch (e) {
    crmFail(e);
  }
  const org = c.get('org');
  const typeFields = await run(c, async (q) => {
    if (typeKey) {
      const [t] = await q.query('select fields from record_types where key = $1', [typeKey]);
      if (t) return t.fields as AccountField[];
    }
    return kind === 'contact' || kind === 'opportunity' || kind === 'ticket' ? BUILTIN_TYPES[kind].fields : [];
  });
  const suggested = suggestFields(kind, fields!, org.account_fields, typeFields);
  return c.json({ fields: fields!, suggested: adapter.readOnly ? suggested.map((f) => ({ ...f, dir: 'pull' as const })) : suggested });
});

/** CRM users and the Curahold person each one is matched to (by email unless set by hand). */
syncRoutes.get('/connections/:id/owners', async (c) => {
  const conn = await loaded(c);
  const adapter = CRM_ADAPTERS[conn.provider as keyof typeof CRM_ADAPTERS];
  if (adapter.tabular) return c.json({ owners: [] });
  let users;
  try {
    users = await adapter.users(crmCtx(c.get('deps'), conn));
  } catch (e) {
    crmFail(e);
  }
  const local = await run(c, (q) => q.query<{ id: string; email: string }>(`select id, email from users where status in ('active', 'invited')`));
  const byEmail = new Map(local.map((u) => [u.email.toLowerCase(), u.id]));
  const set = conn.sync.owners ?? {};
  return c.json({
    owners: users!.map((u) => ({
      remoteId: u.id,
      name: u.name,
      email: u.email,
      userId: u.id in set ? set[u.id] : u.email ? (byEmail.get(u.email) ?? null) : null,
      manual: u.id in set,
    })),
  });
});

syncRoutes.put('/connections/:id/owners', async (c) => {
  const conn = await loaded(c);
  const input = await body(c, z.object({ owners: z.record(z.string().max(100), z.string().uuid().nullable()) }));
  await run(c, async (q) => {
    if (Object.values(input.owners).some(Boolean)) {
      const ids = Object.values(input.owners).filter(Boolean);
      const found = await q.query(`select id from users where id = any($1::uuid[]) and status in ('active', 'invited')`, [ids]);
      if (found.length !== new Set(ids).size) fail('bad_assignee');
    }
    await q.query(`update connections set config = jsonb_set(config, '{sync,owners}', $2::jsonb, true), updated_at = now() where id = $1`, [conn.id, JSON.stringify(input.owners)]);
  });
  return c.json({ ok: true });
});

syncRoutes.patch('/connections/:id/sync', async (c) => {
  const conn = await loaded(c);
  const input = await body(c, z.object({ conflict: z.enum(['latest', 'crm', 'curahold']) }));
  await run(c, (q) => q.query(`update connections set config = jsonb_set(config, '{sync,conflict}', to_jsonb($2::text), true), updated_at = now() where id = $1`, [conn.id, input.conflict]));
  return c.json({ ok: true });
});

// ------------------------------------------------------------ spreadsheet

syncRoutes.post('/connections/:id/file', async (c) => {
  const conn = await loaded(c);
  const input = await body(c, z.object({ url: z.string().trim().min(10).max(2000) }));
  if (conn.provider !== 'gsheets' && conn.provider !== 'excel') fail('not_found');
  let file;
  try {
    const ctx = crmCtx(c.get('deps'), conn);
    file = conn.provider === 'gsheets' ? await resolveGoogleFile(ctx, input.url) : await resolveExcelFile(ctx, input.url);
  } catch (e) {
    crmFail(e);
  }
  await run(c, (q) => q.query(`update connections set config = jsonb_set(config, '{sync,file}', $2::jsonb, true), label = $3, updated_at = now() where id = $1`, [conn.id, JSON.stringify(file), file!.name.slice(0, 120)]));
  return c.json({ file });
});

// --------------------------------------------------------------- mapping

const fieldMap = z.object({ remote: z.string().min(1).max(200), local: z.string().regex(/^(name|owner|account|parent|title|description|due|assignee|done|stage|issue_type|story_points|epic|sprint|goal|state|starts_on|ends_on|new|f:[a-z][a-z0-9_]{0,39})$/), dir: z.enum(['both', 'pull']) });
const objectMap = z.object({
  remote: z.string().min(1).max(120),
  label: z.string().trim().min(1).max(120),
  target: z.enum(['account', 'record', 'task', 'sprint']),
  typeKey: z.string().regex(/^([a-z][a-z0-9_]{1,40}|__new)$/).optional(),
  kind: z.enum(['contact', 'opportunity', 'ticket', 'custom']).optional(),
  boardId: z.string().uuid().optional(),
  issueTypes: z.array(z.string().max(20)).max(10).optional(),
  enabled: z.boolean(),
  create: z.boolean(),
  linkOnly: z.boolean().optional(),
  fields: z.array(fieldMap).max(300),
  key: z.string().max(200).optional(),
});
const syncSchema = z.object({
  objects: z.array(objectMap).max(30),
  owners: z.record(z.string().max(100), z.string().uuid().nullable()).optional(),
  conflict: z.enum(['latest', 'crm', 'curahold']).optional(),
});

/** A Curahold field for a CRM field the administrator chose to bring over. */
export function localFieldFrom(rf: RemoteField, taken: Set<string>): AccountField {
  let base = optionKey(rf.label || rf.name).replace(/^[^a-z]+/, '');
  if (!/^[a-z]/.test(base)) base = `f_${base}`;
  base = base.slice(0, 36) || 'field';
  let key = base;
  for (let i = 2; taken.has(key); i++) key = `${base}_${i}`;
  taken.add(key);
  const label = { en: rf.label.slice(0, 80), tr: rf.label.slice(0, 80) };
  switch (rf.type) {
    case 'number':
    case 'percent':
      return { key, label, type: 'number' };
    case 'money':
      return { key, label, type: 'money' };
    case 'date':
    case 'datetime':
      return { key, label, type: 'date' };
    case 'email':
      return { key, label, type: 'email' };
    case 'url':
      return { key, label, type: 'url' };
    case 'bool':
      return { key, label, type: 'select', options: [{ key: 'yes', label: { en: 'Yes', tr: 'Evet' }, value: 'true' }, { key: 'no', label: { en: 'No', tr: 'Hayır' }, value: 'false' }] };
    case 'select': {
      const seen = new Set<string>();
      const options = (rf.options ?? []).slice(0, 300).map((o) => {
        let k = optionKey(o.label || o.value);
        while (seen.has(k)) k = `${k}_`.slice(0, 40);
        seen.add(k);
        return { key: k, label: { en: o.label.slice(0, 80), tr: o.label.slice(0, 80) }, value: String(o.value).slice(0, 200) };
      });
      return { key, label, type: 'select', options };
    }
    default:
      return { key, label, type: 'text' };
  }
}

syncRoutes.put('/connections/:id/sync', async (c) => {
  // Keeping a CRM or a spreadsheet in sync is part of the Business plan.
  requirePlan(c, 'crm_sync');
  const conn = await loaded(c);
  const input = await body(c, syncSchema);
  const deps = c.get('deps');
  const org = c.get('org');
  const auth = c.get('auth');
  const adapter = CRM_ADAPTERS[conn.provider as keyof typeof CRM_ADAPTERS];
  const enabled = input.objects.filter((o) => o.enabled);
  if (enabled.filter((o) => o.target === 'account').length > 1) fail('validation', { fields: 'objects' }, { fields: ['objects'] });
  if (adapter.tabular && input.objects.some((o) => o.enabled && !o.key)) fail('validation', { fields: 'key' }, { fields: ['objects.key'] });

  // Field metadata for every object that brings new fields along.
  const ctx = crmCtx(deps, conn);
  const meta = new Map<string, RemoteField[]>();
  try {
    for (const o of input.objects) if (o.fields.some((f) => f.local === 'new')) meta.set(o.remote, await adapter.fields(ctx, o.remote));
  } catch (e) {
    crmFail(e);
  }

  // Owner access with explicit company filters: mapping a CRM may add fields and
  // record types, which someone allowed to connect tools may do for that purpose.
  const saved = await deps.db.system(async (q) => {
    const [orgRow] = await q.query('select account_fields from orgs where id = $1', [org.id]);
    const accountFields: AccountField[] = orgRow.account_fields ?? [];
    let accountChanged = false;
    const objects: SyncConfig['objects'] = [];
    for (const o of input.objects) {
      let typeKey = o.typeKey;
      let typeRow: any = null;
      if (o.target === 'record') {
        if (!typeKey || typeKey === '__new') {
          const kind: RecordKind = o.kind ?? 'custom';
          typeRow = await createRecordType(q, org.id, auth.userId, {
            kind,
            key: kind === 'custom' ? keyFrom(o.label) : undefined,
            name: kind === 'custom' ? { one: { en: o.label, tr: o.label }, other: { en: o.label, tr: o.label } } : undefined,
            fields: kind === 'custom' ? [] : undefined,
          });
          typeKey = typeRow.key;
        } else {
          [typeRow] = await q.query('select * from record_types where org_id = $1 and key = $2', [org.id, typeKey]);
          if (!typeRow) fail('validation', { fields: 'typeKey' }, { fields: ['objects.typeKey'] });
        }
      }
      if (o.target === 'task' || o.target === 'sprint') {
        const [b] = await q.query('select id from boards where org_id = $1 and id = $2 and archived_at is null', [org.id, o.boardId ?? null]);
        if (!b) fail('validation', { fields: 'boardId' }, { fields: ['objects.boardId'] });
      }
      const defs: AccountField[] = o.target === 'account' ? accountFields : o.target === 'record' ? JSON.parse(JSON.stringify(typeRow.fields ?? [])) : [];
      const taken = new Set(defs.map((d) => d.key));
      let typeChanged = false;
      const fields = [];
      const usedLocal = new Set<string>();
      for (const f of o.fields) {
        let local = f.local;
        if (local === 'new') {
          if (o.target === 'task' || o.target === 'sprint') continue;
          const rf = meta.get(o.remote)?.find((x) => x.name === f.remote);
          if (!rf || rf.type === 'user' || rf.type === 'id') continue;
          const def = localFieldFrom(rf, taken);
          defs.push(def);
          local = `f:${def.key}`;
          if (o.target === 'account') accountChanged = true;
          else typeChanged = true;
        } else if (local.startsWith('f:') && !defs.some((d) => d.key === local.slice(2) && !d.rollup)) continue;
        // One CRM field per Curahold field: two would fight over the value.
        if (usedLocal.has(local)) continue;
        usedLocal.add(local);
        fields.push({ remote: f.remote, local, dir: f.dir });
      }
      if (typeChanged) await q.query('update record_types set fields = $3 where id = $1 and org_id = $2', [typeRow.id, org.id, JSON.stringify(defs)]);
      // A read-only source never creates anything on its side.
      objects.push({ remote: o.remote, label: o.label, target: o.target, typeKey, boardId: o.boardId, ...(o.issueTypes ? { issueTypes: o.issueTypes } : {}), enabled: o.enabled, create: adapter.readOnly ? false : o.create, ...(o.linkOnly ? { linkOnly: true } : {}), fields: adapter.readOnly ? fields.map((f) => ({ ...f, dir: 'pull' as const })) : fields, key: o.key });
    }
    if (accountChanged) await q.query('update orgs set account_fields = $2 where id = $1', [org.id, JSON.stringify(accountFields)]);

    // A spreadsheet whose key column changed: rows are matched afresh (by name), not by the old keys.
    const before = conn.sync.objects;
    for (const o of objects) {
      const was = before.find((b) => b.remote === o.remote);
      if (was && adapter.tabular && was.key !== o.key) await q.query('delete from sync_links where org_id = $1 and connection_id = $2 and object = $3', [org.id, conn.id, o.remote]);
    }
    const next: SyncConfig = { ...conn.sync, objects, owners: input.owners ?? conn.sync.owners ?? {}, conflict: input.conflict ?? conn.sync.conflict ?? 'latest' };
    await q.query(`update connections set config = jsonb_set(config, '{sync}', $3::jsonb, true), updated_at = now() where id = $1 and org_id = $2`, [conn.id, org.id, JSON.stringify(next)]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'connection.mapped', entity: 'connection', entityId: conn.id, meta: { objects: objects.filter((x) => x.enabled).map((x) => x.remote) } });
    return next;
  });
  return c.json({ sync: saved });
});

syncRoutes.post('/connections/:id/preview', async (c) => {
  const conn = await loaded(c);
  try {
    return c.json(await previewSync(c.get('deps'), conn, conn.sync));
  } catch (e) {
    crmFail(e);
  }
});

// ------------------------------------------------------------------- runs

syncRoutes.post('/connections/:id/sync/run', async (c) => {
  const conn = await loaded(c);
  const input = await body(c, z.object({ full: z.boolean().optional(), start: z.boolean().optional() }));
  const deps = c.get('deps');
  const org = c.get('org');
  const auth = c.get('auth');
  if (!conn.sync.objects.some((o) => o.enabled)) fail('validation', { fields: 'objects' }, { fields: ['objects'] });
  const first = !conn.sync.startedAt;
  if (first) {
    await run(c, async (q) => {
      await q.query(`update connections set config = jsonb_set(config, '{sync,startedAt}', to_jsonb($2::text), true), updated_at = now() where id = $1`, [conn.id, nowOf(deps).toISOString()]);
      await audit(q, { orgId: org.id, actorId: auth.userId, action: 'connection.sync_started', entity: 'connection', entityId: conn.id });
    });
  }
  const result = await syncConnection(deps, org.id, conn.id, { trigger: first || input.start ? 'setup' : 'manual', userId: auth.userId, full: input.full, budgetMs: REQUEST_BUDGET_MS });
  if (!result) fail('sync_running');
  return c.json({ run: result });
});

syncRoutes.get('/connections/:id/runs', async (c) => {
  const conn = await loaded(c);
  const rows = await run(c, (q) => q.query('select * from sync_runs where connection_id = $1 order by started_at desc limit 30', [conn.id]));
  return c.json({ runs: rows.map(toRun) });
});

syncRoutes.get('/connections/:id/problems', async (c) => {
  const conn = await loaded(c);
  const rows = await run(c, (q) =>
    q.query(
      `select s.*, coalesce(a.name, r.name, t.title, sp.name) as name from sync_changes s
         left join accounts a on s.entity = 'account' and a.id = s.entity_id
         left join records r on s.entity = 'record' and r.id = s.entity_id
         left join tasks t on s.entity = 'task' and t.id = s.entity_id
         left join sprints sp on s.entity = 'sprint' and sp.id = s.entity_id
        where s.connection_id = $1 and s.attempts > 0 order by s.changed_at desc limit 100`,
      [conn.id],
    ),
  );
  const problems: SyncProblem[] = rows.map((r) => ({ entity: r.entity, entityId: r.entity_id, name: r.name ?? '—', attempts: r.attempts, lastError: r.last_error, nextAt: new Date(r.next_at).toISOString() }));
  return c.json({ problems });
});

syncRoutes.post('/connections/:id/problems/retry', async (c) => {
  const conn = await loaded(c);
  await run(c, (q) => q.query('update sync_changes set next_at = now(), attempts = 0 where connection_id = $1 and attempts > 0', [conn.id]));
  const result = await syncConnection(c.get('deps'), c.get('org').id, conn.id, { trigger: 'manual', userId: c.get('auth').userId, pushOnly: true, budgetMs: REQUEST_BUDGET_MS });
  return c.json({ run: result });
});

// ------------------------------------------------------- support write-back

/** Support tools that take things back: an answer to a ticket, or a new ticket, made from Curahold. */
function writable(conn: Awaited<ReturnType<typeof loaded>>) {
  const adapter = CRM_ADAPTERS[conn.provider as keyof typeof CRM_ADAPTERS];
  if (adapter.readOnly || !adapter.reply) fail('not_found');
  if (conn.status === 'disabled') fail('forbidden');
  return adapter;
}

syncRoutes.post('/connections/:id/tickets', async (c) => {
  const conn = await loaded(c);
  const adapter = writable(conn);
  const input = await body(
    c,
    z.object({
      subject: z.string().trim().min(1).max(300),
      requester: z.string().trim().email().max(254),
      description: z.string().trim().max(10_000).optional(),
      priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
      status: z.enum(['open', 'pending', 'solved', 'closed']).optional(),
      assignee: z.string().max(100).optional(),
    }),
  );
  const deps = c.get('deps');
  let remoteId: string;
  try {
    remoteId = await adapter.create(crmCtx(deps, conn), 'tickets', input, [], undefined);
  } catch (e) {
    crmFail(e);
  }
  await run(c, (q) => audit(q, { orgId: c.get('org').id, actorId: c.get('auth').userId, action: 'connection.ticket_created', entity: 'connection', entityId: conn.id, meta: { remoteId: remoteId! } }));
  // The ticket comes back with the next read, under the right customer, like any other.
  return c.json({ id: remoteId!, url: adapter.url(conn.config, 'tickets', remoteId!) }, 201);
});

syncRoutes.post('/connections/:id/tickets/:remoteId/reply', async (c) => {
  const conn = await loaded(c);
  const adapter = writable(conn);
  const input = await body(c, z.object({ body: z.string().trim().min(1).max(20_000), internal: z.boolean().optional() }));
  const remoteId = c.req.param('remoteId');
  if (!remoteId || remoteId.length > 100) fail('validation', { fields: 'remoteId' }, { fields: ['remoteId'] });
  try {
    await adapter.reply!(crmCtx(c.get('deps'), conn), remoteId, { body: input.body, internal: input.internal });
  } catch (e) {
    crmFail(e);
  }
  await run(c, (q) => audit(q, { orgId: c.get('org').id, actorId: c.get('auth').userId, action: input.internal ? 'connection.ticket_noted' : 'connection.ticket_replied', entity: 'connection', entityId: conn.id, meta: { remoteId } }));
  return c.json({ ok: true });
});

/** Rolled-up fields recomputed on demand (after changing their definition). */
syncRoutes.post('/rollups/recompute', async (c) => {
  requirePerm(c, 'accounts.manage');
  const org = c.get('org');
  await run(c, async (q) => {
    const [o] = await q.query('select account_fields from orgs where id = $1', [org.id]);
    await recomputeRollups(q, org.id, o.account_fields ?? [], null);
  });
  return c.json({ ok: true });
});
