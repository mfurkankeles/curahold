// Records under accounts (contacts, opportunities, risks…) and the kinds of
// record a company keeps. Works with or without a CRM; when one is
// connected, edits here are queued for it.
import { Hono } from 'hono';
import { z } from 'zod';
import { BUILTIN_TYPES, fullName, RECORD_KINDS, type AppRecord, type LinkInfo, type RecordType } from '../../../shared/src/records';
import { requirePerm, requireWriter, run, type AppEnv } from '../context';
import type { Q, Row } from '../db';
import { audit } from '../lib/audit';
import { fail } from '../lib/errors';
import { iso } from '../lib/mappers';
import { changedKeys, kickSync, queueSync, recomputeRollups } from '../lib/records';
import { body, param, uuid } from '../lib/validate';
import { cleanFields, fieldSchema } from '../lib/fieldDefs';
import { linksFor } from '../lib/links';

export const recordRoutes = new Hono<AppEnv>();

const localized = z.object({ en: z.string().trim().max(60).optional(), tr: z.string().trim().max(60).optional() }).refine((l) => !!(l.en || l.tr));

export const toRecordType = (r: Row): RecordType => ({
  id: r.id,
  key: r.key,
  name: r.name,
  kind: r.kind,
  fields: r.fields ?? [],
  position: r.position,
  archivedAt: iso(r.archived_at),
  ...(r.n != null ? { count: Number(r.n) } : {}),
});

export const toRecord = (r: Row, links: LinkInfo[] = []): AppRecord => ({
  id: r.id,
  typeId: r.type_id,
  accountId: r.account_id ?? null,
  parentId: r.parent_id ?? null,
  ...(r.account_name !== undefined ? { accountName: r.account_name ?? null } : {}),
  name: r.name,
  ownerId: r.owner_id ?? null,
  fields: r.fields ?? {},
  source: r.source,
  createdAt: iso(r.created_at)!,
  updatedAt: iso(r.updated_at)!,
  archivedAt: iso(r.archived_at),
  links,
});

// ------------------------------------------------------------ record types

recordRoutes.get('/record-types', async (c) => {
  const rows = await run(c, (q) =>
    q.query(
      `select rt.*, (select count(*) from records r where r.type_id = rt.id and r.archived_at is null) as n
         from record_types rt where rt.archived_at is null order by rt.position, rt.created_at`,
    ),
  );
  return c.json({ types: rows.map(toRecordType) });
});

const typeFields = z.array(fieldSchema).max(150);

recordRoutes.post('/record-types', async (c) => {
  requirePerm(c, 'accounts.manage');
  const input = await body(
    c,
    z.object({
      kind: z.enum(RECORD_KINDS).default('custom'),
      key: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/).optional(),
      name: z.object({ one: localized, other: localized }).optional(),
      fields: typeFields.optional(),
    }),
  );
  const org = c.get('org');
  const auth = c.get('auth');
  const row = await run(c, (q) => createRecordType(q, org.id, auth.userId, input));
  return c.json({ type: toRecordType(row) }, 201);
});

/** Creates a kind of record, or returns the existing built-in one. */
export async function createRecordType(
  q: Q,
  orgId: string,
  actorId: string | null,
  input: { kind: (typeof RECORD_KINDS)[number]; key?: string; name?: RecordType['name']; fields?: RecordType['fields'] },
): Promise<Row> {
  const builtin = input.kind !== 'custom' ? BUILTIN_TYPES[input.kind] : null;
  if (builtin) {
    const [have] = await q.query('select * from record_types where org_id = $1 and kind = $2 order by created_at limit 1', [orgId, input.kind]);
    if (have) {
      if (have.archived_at) {
        const [u] = await q.query('update record_types set archived_at = null where id = $1 returning *', [have.id]);
        return u;
      }
      return have;
    }
  }
  if (!builtin && !input.name) fail('validation', { fields: 'name' }, { fields: ['name'] });
  const base = input.key ?? builtin?.key ?? keyFrom(input.name!.other.en ?? input.name!.other.tr ?? 'records');
  const taken = new Set((await q.query<{ key: string }>('select key from record_types where org_id = $1', [orgId])).map((r) => r.key));
  let key = base;
  for (let i = 2; taken.has(key); i++) key = `${base.slice(0, 36)}_${i}`;
  const fields = input.fields ?? builtin?.fields ?? [];
  const keys = fields.map((f) => f.key);
  if (new Set(keys).size !== keys.length) fail('validation', { fields: 'fields' }, { fields: ['fields'] });
  const [{ n }] = await q.query<{ n: number }>('select count(*)::int as n from record_types where org_id = $1', [orgId]);
  const [row] = await q.query(
    'insert into record_types (org_id, key, name, kind, fields, position) values ($1, $2, $3, $4, $5, $6) returning *',
    [orgId, key, JSON.stringify(input.name ?? builtin!.name), input.kind, JSON.stringify(fields), n],
  );
  await audit(q, { orgId, actorId, action: 'record_type.created', entity: 'record_type', entityId: row.id, meta: { kind: input.kind } });
  return row;
}

export function keyFrom(label: string): string {
  const k = label
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 36);
  return /^[a-z]/.test(k) && k.length >= 2 ? k : `r_${k || 'records'}`.slice(0, 36);
}

recordRoutes.patch('/record-types/:id', async (c) => {
  requirePerm(c, 'accounts.manage');
  const id = param(c, 'id');
  const input = await body(
    c,
    z.object({
      name: z.object({ one: localized, other: localized }).optional(),
      fields: typeFields.optional(),
      position: z.number().int().min(0).max(1000).optional(),
      archived: z.boolean().optional(),
    }),
  );
  if (input.fields) {
    const keys = input.fields.map((f) => f.key);
    if (new Set(keys).size !== keys.length) fail('validation', { fields: 'fields' }, { fields: ['fields'] });
  }
  const org = c.get('org');
  const auth = c.get('auth');
  const row = await run(c, async (q) => {
    const [t] = await q.query('select * from record_types where id = $1', [id]);
    if (!t) fail('not_found');
    const [u] = await q.query(
      `update record_types set name = coalesce($2, name), fields = coalesce($3, fields), position = coalesce($4, position),
              archived_at = case when $5::boolean is null then archived_at when $5 then coalesce(archived_at, now()) else null end
        where id = $1 returning *`,
      [id, input.name ? JSON.stringify(input.name) : null, input.fields ? JSON.stringify(input.fields) : null, input.position ?? null, input.archived ?? null],
    );
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'record_type.updated', entity: 'record_type', entityId: id, meta: { fields: Object.keys(input) } });
    if (input.fields) await recomputeRollups(q, org.id, org.account_fields, null);
    return u;
  });
  return c.json({ type: toRecordType(row) });
});

recordRoutes.delete('/record-types/:id', async (c) => {
  requirePerm(c, 'accounts.manage');
  const id = param(c, 'id');
  const org = c.get('org');
  const auth = c.get('auth');
  await run(c, async (q) => {
    const [t] = await q.query('select * from record_types where id = $1', [id]);
    if (!t) fail('not_found');
    const [{ n }] = await q.query<{ n: number }>('select count(*)::int as n from records where type_id = $1', [id]);
    if (n > 0) fail('type_not_empty', { n });
    await q.query('delete from record_types where id = $1', [id]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'record_type.deleted', entity: 'record_type', entityId: id });
  });
  return c.json({ ok: true });
});

// ----------------------------------------------------------------- records

const SELECT = `select r.*, a.name as account_name from records r left join accounts a on a.id = r.account_id`;

async function typeOf(q: Q, ref: string): Promise<Row> {
  const byId = uuid.safeParse(ref).success;
  const [t] = await q.query(`select * from record_types where ${byId ? 'id = $1' : 'key = $1'}`, [ref]);
  if (!t) fail('not_found');
  return t;
}

recordRoutes.get('/records', async (c) => {
  const typeRef = c.req.query('type') ?? '';
  const account = c.req.query('account');
  const search = (c.req.query('q') ?? '').trim().slice(0, 100).replace(/[%_]/g, '');
  const owner = c.req.query('owner');
  const archived = c.req.query('archived') === '1';
  const limit = Math.min(500, Math.max(1, Number(c.req.query('limit') ?? 200)));
  const offset = Math.max(0, Number(c.req.query('offset') ?? 0));
  const ownerId = owner === 'me' ? c.get('auth').userId : owner && uuid.safeParse(owner).success ? owner : null;
  const accountId = account && uuid.safeParse(account).success ? account : null;
  const data = await run(c, async (q) => {
    const type = typeRef ? await typeOf(q, typeRef) : null;
    const where = `($1::uuid is null or r.type_id = $1) and ($2::uuid is null or r.account_id = $2)
      and ($3 = '' or r.name ilike '%' || $3 || '%' or a.name ilike '%' || $3 || '%')
      and ($4::uuid is null or r.owner_id = $4)
      and (case when $5 then r.archived_at is not null else r.archived_at is null end)`;
    const args = [type?.id ?? null, accountId, search, ownerId, archived];
    const rows = await q.query(`${SELECT} where ${where} order by lower(r.name) limit ${limit} offset ${offset}`, args);
    const [{ n }] = await q.query<{ n: number }>(`select count(*)::int as n from records r left join accounts a on a.id = r.account_id where ${where}`, args);
    const links = await linksFor(q, 'record', rows.map((r) => r.id));
    return { rows, n, links };
  });
  return c.json({ records: data.rows.map((r) => toRecord(r, data.links.get(r.id))), total: data.n });
});

recordRoutes.get('/records/:id', async (c) => {
  const id = param(c, 'id');
  const data = await run(c, async (q) => {
    const [r] = await q.query(`${SELECT} where r.id = $1`, [id]);
    if (!r) fail('not_found');
    const links = await linksFor(q, 'record', [id]);
    return { r, links };
  });
  return c.json({ record: toRecord(data.r, data.links.get(id)) });
});

const recordValues = z.record(z.string().max(40), z.union([z.string().max(2000), z.number(), z.null()]));

async function checkRefs(q: Q, accountId: string | null | undefined, ownerId: string | null | undefined) {
  if (accountId) {
    const [a] = await q.query('select 1 from accounts where id = $1', [accountId]);
    if (!a) fail('validation', { fields: 'accountId' }, { fields: ['accountId'] });
  }
  if (ownerId) {
    const [u] = await q.query(`select 1 from users where id = $1 and status in ('active', 'invited')`, [ownerId]);
    if (!u) fail('bad_assignee');
  }
}

/**
 * "Reports to" must be another record of the same kind under the same
 * account, and must not make a loop (nobody can report to their own report).
 */
export async function checkParent(q: Q, self: { id: string | null; type_id: string; account_id: string | null }, parentId: string | null | undefined) {
  if (!parentId) return;
  if (parentId === self.id) fail('validation', { fields: 'parentId' }, { fields: ['parentId'] });
  const [p] = await q.query('select id, type_id, account_id from records where id = $1', [parentId]);
  if (!p || p.type_id !== self.type_id || (p.account_id ?? null) !== (self.account_id ?? null)) fail('validation', { fields: 'parentId' }, { fields: ['parentId'] });
  if (!self.id) return;
  const [loop] = await q.query(
    `with recursive up(id, parent_id, depth) as (
       select id, parent_id, 0 from records where id = $1
       union all
       select r.id, r.parent_id, up.depth + 1 from records r join up on r.id = up.parent_id where up.depth < 100
     ) select 1 from up where id = $2 limit 1`,
    [parentId, self.id],
  );
  if (loop) fail('org_loop');
}

/** Contacts: the name follows first and last name unless it was given. */
function contactName(kind: string, given: string | undefined, fields: Record<string, unknown>, fallback: string | null): string | null {
  if (given) return given;
  if (kind === 'contact') {
    const n = fullName(fields.first_name, fields.last_name);
    if (n) return n.slice(0, 300);
  }
  return fallback;
}

recordRoutes.post('/records', async (c) => {
  requireWriter(c);
  const input = await body(
    c,
    z.object({
      typeId: uuid,
      accountId: uuid.nullable().optional(),
      parentId: uuid.nullable().optional(),
      name: z.string().trim().min(1).max(300).optional(),
      ownerId: uuid.nullable().optional(),
      fields: recordValues.optional(),
    }),
  );
  const org = c.get('org');
  const auth = c.get('auth');
  const deps = c.get('deps');
  const row = await run(c, async (q) => {
    const type = await typeOf(q, input.typeId);
    await checkRefs(q, input.accountId, input.ownerId);
    const fields = cleanFields(type.fields, input.fields ?? {}, org.locale);
    const name = contactName(type.kind, input.name, fields, null);
    if (!name) fail('validation', { fields: 'name' }, { fields: ['name'] });
    await checkParent(q, { id: null, type_id: type.id, account_id: input.accountId ?? null }, input.parentId);
    const [r] = await q.query(
      `insert into records (org_id, type_id, account_id, parent_id, name, owner_id, fields, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [org.id, type.id, input.accountId ?? null, input.parentId ?? null, name, input.ownerId ?? null, JSON.stringify(fields), auth.userId],
    );
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'record.created', entity: 'record', entityId: r.id, meta: { type: type.key } });
    await recomputeRollups(q, org.id, org.account_fields, [input.accountId ?? null]);
    await queueSync(q, org.id, 'record', [r.id], null, { created: true, typeKey: type.key });
    const [full] = await q.query(`${SELECT} where r.id = $1`, [r.id]);
    return full;
  });
  kickSync(deps, org.id);
  return c.json({ record: toRecord(row) }, 201);
});

recordRoutes.patch('/records/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(
    c,
    z.object({
      name: z.string().trim().min(1).max(300).optional(),
      accountId: uuid.nullable().optional(),
      parentId: uuid.nullable().optional(),
      ownerId: uuid.nullable().optional(),
      fields: recordValues.optional(),
      archived: z.boolean().optional(),
    }),
  );
  const org = c.get('org');
  const auth = c.get('auth');
  const deps = c.get('deps');
  const row = await run(c, async (q) => {
    const [r] = await q.query('select * from records where id = $1', [id]);
    if (!r) fail('not_found');
    const [type] = await q.query('select * from record_types where id = $1', [r.type_id]);
    await checkRefs(q, input.accountId, input.ownerId);
    const fields = input.fields ? { ...(r.fields ?? {}), ...cleanFields(type.fields, input.fields, org.locale) } : r.fields;
    const namesChanged = !!input.fields && ('first_name' in input.fields || 'last_name' in input.fields);
    const accountId = input.accountId !== undefined ? input.accountId : r.account_id;
    const accountMoved = (accountId ?? null) !== (r.account_id ?? null);
    // Moving to another account leaves the old org chart behind.
    const parentId = input.parentId !== undefined ? input.parentId : accountMoved ? null : r.parent_id;
    await checkParent(q, { id, type_id: r.type_id, account_id: accountId }, parentId);
    const next = {
      name: contactName(type.kind, input.name, namesChanged ? fields : {}, r.name)!,
      owner_id: input.ownerId !== undefined ? input.ownerId : r.owner_id,
      account_id: accountId,
      parent_id: parentId ?? null,
      fields,
    };
    await q.query(
      `update records set name = $2, owner_id = $3, account_id = $4, fields = $5, parent_id = $7, updated_at = now(),
              archived_at = case when $6::boolean is null then archived_at when $6 then coalesce(archived_at, now()) else null end
        where id = $1`,
      [id, next.name, next.owner_id, next.account_id, JSON.stringify(fields), input.archived ?? null, next.parent_id],
    );
    if (accountMoved) await q.query('update records set parent_id = null where parent_id = $1', [id]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'record.updated', entity: 'record', entityId: id, meta: { fields: Object.keys(input) } });
    await recomputeRollups(q, org.id, org.account_fields, [r.account_id, next.account_id]);
    const keys = changedKeys(r, next);
    if (keys.length) await queueSync(q, org.id, 'record', [id], keys);
    const [full] = await q.query(`${SELECT} where r.id = $1`, [id]);
    const links = await linksFor(q, 'record', [id]);
    return { full, links };
  });
  kickSync(deps, org.id);
  return c.json({ record: toRecord(row.full, row.links.get(id)) });
});

recordRoutes.delete('/records/:id', async (c) => {
  requirePerm(c, 'accounts.manage');
  const id = param(c, 'id');
  const org = c.get('org');
  const auth = c.get('auth');
  await run(c, async (q) => {
    const rows = await q.query('delete from records where id = $1 returning name, account_id', [id]);
    if (!rows.length) fail('not_found');
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'record.deleted', entity: 'record', entityId: id, meta: { name: rows[0].name } });
    await recomputeRollups(q, org.id, org.account_fields, [rows[0].account_id]);
  });
  return c.json({ ok: true });
});
