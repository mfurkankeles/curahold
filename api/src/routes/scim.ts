// SCIM 2.0 user provisioning, per company.
//
// A company's IdP pushes users here with a per-company bearer token. The token
// is the only input that says which company this is: scim_resolve_token() turns
// its hash into exactly one org_id, and every read and write then runs inside
// db.tenant({orgId, userId: null}) — so row-level security keeps provisioning
// inside that one company. A token for company A can neither see nor change a
// user in company B.
//
// Deactivation never deletes: active=false (and DELETE) set the user's status
// to 'disabled', which is how the app already locks someone out.
//
// Mounting (api/src/app.ts, reported to the coordinator): register BEFORE the
// companyFromHost / person middleware (it is bearer-authed and server-to-server,
// like the OAuth callback):  app.route('/api/scim/v2', scimRoutes)
import { Hono } from 'hono';
import { orgUrl, type AppEnv, type C, type OrgRow } from '../context';
import { audit } from '../lib/audit';
import { sha256Hex } from '../lib/crypto';

export const scimRoutes = new Hono<AppEnv>();

const USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User';
const LIST_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';
const ERROR_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:Error';
const PATCH_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:PatchOp';
const SCIM_CT = 'application/scim+json; charset=utf-8';

const scimError = (c: C, status: number, detail: string, scimType?: string) =>
  c.body(JSON.stringify({ schemas: [ERROR_SCHEMA], status: String(status), detail, ...(scimType ? { scimType } : {}) }), status as any, { 'content-type': SCIM_CT });
const scimJson = (c: C, status: number, obj: unknown) => c.body(JSON.stringify(obj), status as any, { 'content-type': SCIM_CT });

interface UserRow {
  id: string;
  email: string;
  name: string;
  status: string;
  created_at: string;
  last_active_at: string | null;
}

function toScimUser(c: C, slug: string, u: UserRow) {
  const [given, ...rest] = (u.name || '').split(' ');
  return {
    schemas: [USER_SCHEMA],
    id: u.id,
    userName: u.email,
    name: { formatted: u.name, givenName: given || u.name, familyName: rest.join(' ') || '' },
    displayName: u.name,
    emails: [{ value: u.email, primary: true, type: 'work' }],
    active: u.status === 'active' || u.status === 'invited',
    meta: {
      resourceType: 'User',
      created: u.created_at,
      lastModified: u.last_active_at ?? u.created_at,
      location: `${orgUrl(c.get('deps').config, slug)}/api/scim/v2/Users/${u.id}`,
    },
  };
}

const COLS = 'id, email, name, status, created_at, last_active_at';
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

// ---------------------------------------------------------- authenticate

// Resolve the company from the bearer token and pin the context to it.
scimRoutes.use('*', async (c, next) => {
  const m = /^Bearer\s+(\S+)$/i.exec(c.req.header('authorization') ?? '');
  if (!m) return scimError(c, 401, 'Missing bearer token');
  const deps = c.get('deps');
  const hash = await sha256Hex(m[1]);
  const [row] = await deps.db.tenant({ orgId: null, userId: null }, (q) => q.query<{ org_id: string }>('select * from scim_resolve_token($1)', [hash]));
  if (!row) return scimError(c, 401, 'Invalid bearer token');
  // The slug is needed only for `meta.location`; resolve it once.
  const [org] = await deps.db.tenant({ orgId: row.org_id, userId: null }, (q) => q.query<{ slug: string }>('select slug from orgs where id = $1', [row.org_id]));
  c.set('org', { id: row.org_id, slug: org?.slug ?? '' } as OrgRow);
  await next();
});

// ---------------------------------------------------------- service metadata

scimRoutes.get('/ServiceProviderConfig', (c) =>
  scimJson(c, 200, {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 200 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [{ type: 'oauthbearertoken', name: 'OAuth Bearer Token', description: 'Authentication via the SCIM bearer token' }],
  }),
);

// ---------------------------------------------------------- Users: read

scimRoutes.get('/Users', async (c) => {
  const org = c.get('org');
  const filter = c.req.query('filter') ?? '';
  const startIndex = Math.max(1, Number(c.req.query('startIndex') ?? '1') || 1);
  const count = Math.min(200, Math.max(0, Number(c.req.query('count') ?? '100') || 100));
  // SCIM filter we support: userName eq "x".
  const eq = /userName\s+eq\s+"([^"]+)"/i.exec(filter);
  const rows = await c.get('deps').db.tenant({ orgId: org.id, userId: null }, (q) =>
    eq
      ? q.query<UserRow>(`select ${COLS} from users where email = $1 and status <> 'deleted' order by created_at`, [eq[1].toLowerCase()])
      : q.query<UserRow>(`select ${COLS} from users where status <> 'deleted' order by created_at`),
  );
  const page = rows.slice(startIndex - 1, startIndex - 1 + count);
  return scimJson(c, 200, {
    schemas: [LIST_SCHEMA],
    totalResults: rows.length,
    startIndex,
    itemsPerPage: page.length,
    Resources: page.map((u) => toScimUser(c, org.slug, u)),
  });
});

scimRoutes.get('/Users/:id', async (c) => {
  const org = c.get('org');
  const id = c.req.param('id');
  if (!isUuid(id)) return scimError(c, 404, 'User not found');
  const [u] = await c.get('deps').db.tenant({ orgId: org.id, userId: null }, (q) => q.query<UserRow>(`select ${COLS} from users where id = $1 and status <> 'deleted'`, [id]));
  if (!u) return scimError(c, 404, 'User not found');
  return scimJson(c, 200, toScimUser(c, org.slug, u));
});

// ---------------------------------------------------------- Users: write

interface ScimUserBody {
  userName?: string;
  displayName?: string;
  active?: boolean;
  name?: { formatted?: string; givenName?: string; familyName?: string };
  emails?: { value?: string; primary?: boolean }[];
}

const emailOf = (b: ScimUserBody): string => {
  const primary = (b.emails ?? []).find((e) => e.primary) ?? (b.emails ?? [])[0];
  return (b.userName || primary?.value || '').trim().toLowerCase();
};
const nameOf = (b: ScimUserBody, email: string): string =>
  (b.displayName || b.name?.formatted || [b.name?.givenName, b.name?.familyName].filter(Boolean).join(' ') || '').trim() || email.split('@')[0];
const validEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e.length <= 254;

scimRoutes.post('/Users', async (c) => {
  const org = c.get('org');
  let b: ScimUserBody;
  try {
    b = (await c.req.json()) as ScimUserBody;
  } catch {
    return scimError(c, 400, 'Invalid JSON', 'invalidSyntax');
  }
  const email = emailOf(b);
  if (!validEmail(email)) return scimError(c, 400, 'A valid userName / email is required', 'invalidValue');
  const name = nameOf(b, email);
  const active = b.active !== false;
  const result = await c.get('deps').db.tenant({ orgId: org.id, userId: null }, async (q) => {
    const [existing] = await q.query<{ id: string }>(`select id from users where email = $1`, [email]);
    if (existing) return { conflict: true as const };
    const [role] = await q.query<{ id: string }>(`select id from roles where key = 'member' and system`);
    const [u] = await q.query<UserRow>(
      `insert into users (org_id, email, name, role_id, seat, status) values ($1, $2, $3, $4, 'full', $5) returning ${COLS}`,
      [org.id, email, name, role.id, active ? 'active' : 'disabled'],
    );
    await audit(q, { orgId: org.id, actorId: null, action: 'sso.provisioned', entity: 'user', entityId: u.id, meta: { via: 'scim' } });
    return { user: u };
  });
  if ('conflict' in result) return scimError(c, 409, 'A user with this userName already exists', 'uniqueness');
  return scimJson(c, 201, toScimUser(c, org.slug, result.user));
});

scimRoutes.put('/Users/:id', async (c) => {
  const org = c.get('org');
  const id = c.req.param('id');
  if (!isUuid(id)) return scimError(c, 404, 'User not found');
  let b: ScimUserBody;
  try {
    b = (await c.req.json()) as ScimUserBody;
  } catch {
    return scimError(c, 400, 'Invalid JSON', 'invalidSyntax');
  }
  const out = await c.get('deps').db.tenant({ orgId: org.id, userId: null }, async (q) => {
    const [cur] = await q.query<UserRow>(`select ${COLS} from users where id = $1 and status <> 'deleted'`, [id]);
    if (!cur) return { missing: true as const };
    const name = nameOf(b, cur.email);
    const status = b.active === false ? 'disabled' : cur.status === 'disabled' ? (b.active ? 'active' : 'disabled') : cur.status;
    const [u] = await q.query<UserRow>(`update users set name = $2, status = $3 where id = $1 returning ${COLS}`, [id, name, status]);
    await audit(q, { orgId: org.id, actorId: null, action: 'sso.updated', entity: 'user', entityId: id, meta: { via: 'scim' } });
    return { user: u };
  });
  if ('missing' in out) return scimError(c, 404, 'User not found');
  return scimJson(c, 200, toScimUser(c, org.slug, out.user));
});

interface PatchOp {
  op?: string;
  path?: string;
  value?: unknown;
}

scimRoutes.patch('/Users/:id', async (c) => {
  const org = c.get('org');
  const id = c.req.param('id');
  if (!isUuid(id)) return scimError(c, 404, 'User not found');
  let b: { schemas?: string[]; Operations?: PatchOp[] };
  try {
    b = (await c.req.json()) as typeof b;
  } catch {
    return scimError(c, 400, 'Invalid JSON', 'invalidSyntax');
  }
  const ops = Array.isArray(b.Operations) ? b.Operations : [];
  const out = await c.get('deps').db.tenant({ orgId: org.id, userId: null }, async (q) => {
    const [cur] = await q.query<UserRow>(`select ${COLS} from users where id = $1 and status <> 'deleted'`, [id]);
    if (!cur) return { missing: true as const };
    let name = cur.name;
    let active = cur.status === 'active' || cur.status === 'invited';
    for (const op of ops) {
      const kind = (op.op ?? '').toLowerCase();
      if (kind !== 'replace' && kind !== 'add') continue;
      const path = (op.path ?? '').toLowerCase();
      if (path === 'active') active = op.value === true || op.value === 'true';
      else if (path === 'displayname' || path === 'name.formatted') name = String(op.value ?? name);
      else if (!op.path && op.value && typeof op.value === 'object') {
        const v = op.value as Record<string, unknown>;
        if ('active' in v) active = v.active === true || v.active === 'true';
        if (typeof v.displayName === 'string') name = v.displayName;
        if (v.name && typeof v.name === 'object' && typeof (v.name as any).formatted === 'string') name = (v.name as any).formatted;
      }
    }
    const status = active ? (cur.status === 'invited' ? 'invited' : 'active') : 'disabled';
    const [u] = await q.query<UserRow>(`update users set name = $2, status = $3 where id = $1 returning ${COLS}`, [id, name, status]);
    await audit(q, { orgId: org.id, actorId: null, action: active ? 'sso.updated' : 'sso.deactivated', entity: 'user', entityId: id, meta: { via: 'scim' } });
    return { user: u };
  });
  if ('missing' in out) return scimError(c, 404, 'User not found');
  return scimJson(c, 200, toScimUser(c, org.slug, out.user));
});

// Deactivate (never a hard delete), per the task's rule.
scimRoutes.delete('/Users/:id', async (c) => {
  const org = c.get('org');
  const id = c.req.param('id');
  if (!isUuid(id)) return scimError(c, 404, 'User not found');
  const out = await c.get('deps').db.tenant({ orgId: org.id, userId: null }, async (q) => {
    const rows = await q.query(`update users set status = 'disabled' where id = $1 and status <> 'deleted' returning id`, [id]);
    if (!rows.length) return { missing: true as const };
    await audit(q, { orgId: org.id, actorId: null, action: 'sso.deactivated', entity: 'user', entityId: id, meta: { via: 'scim' } });
    return {};
  });
  if ('missing' in out) return scimError(c, 404, 'User not found');
  return c.body(null, 204);
});

scimRoutes.all('*', (c) => scimError(c, 404, 'Not found'));

export const _schemas = { USER_SCHEMA, LIST_SCHEMA, ERROR_SCHEMA, PATCH_SCHEMA };
