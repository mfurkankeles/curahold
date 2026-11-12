// Records under accounts (contacts, opportunities, risks…) and the kinds of
// record a company keeps. Works with or without a CRM; when one is
// connected, edits here are queued for it.
import { Hono } from 'hono';
import { z } from 'zod';
import { MENTION_RE, type Task } from '../../../shared/src/model';
import { AGREEMENT_RE, BUILTIN_TYPES, fullName, RECORD_KINDS, type AppRecord, type LinkInfo, type RecordComment, type RecordDetail, type RecordType, type RenewalLinks } from '../../../shared/src/records';
import { requirePerm, requireWriter, run, type AppEnv } from '../context';
import type { Q, Row } from '../db';
import { audit } from '../lib/audit';
import { fail } from '../lib/errors';
import { iso, toFile, toTask } from '../lib/mappers';
import { allowedCurrency } from '../lib/fx';
import { enqueue, kick, type NewNotification } from '../lib/notify';
import { readUpload } from '../lib/upload';
import { changedKeys, kickSync, queueSync, recomputeRollups } from '../lib/records';
import { body, param, uuid } from '../lib/validate';
import { cleanFields, fieldSchema } from '../lib/fieldDefs';
import { linksFor } from '../lib/links';
import { changedFieldKeys, checkEditable, defsFor, hiddenKeys, mergeDefs, stripFields, type Viewer } from '../lib/fieldAccess';

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
  columns: r.columns ?? null,
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
  currency: r.currency ?? null,
  createdBy: r.created_by ?? null,
});

/** Fields each kind of record keeps from this person, by type id. */
async function hiddenByType(q: Q, v: Viewer) {
  const types = await q.query<{ id: string; fields: any }>('select id, fields from record_types');
  return new Map(types.map((t) => [t.id, hiddenKeys(t.fields ?? [], v)]));
}

function viewRecord(r: Row, hidden: Map<string, Set<string>>, links: LinkInfo[] = []): AppRecord {
  const rec = toRecord(r, links);
  const h = hidden.get(r.type_id);
  return h?.size ? { ...rec, fields: stripFields(rec.fields, h) } : rec;
}

// ------------------------------------------------------------ record types

recordRoutes.get('/record-types', async (c) => {
  const rows = await run(c, (q) =>
    q.query(
      `select rt.*, (select count(*) from records r where r.type_id = rt.id and r.archived_at is null) as n
         from record_types rt where rt.archived_at is null order by rt.position, rt.created_at`,
    ),
  );
  const auth = c.get('auth');
  return c.json({ types: rows.map(toRecordType).map((t) => ({ ...t, fields: defsFor(t.fields, auth) })) });
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
      /** The columns of its table; null goes back to Curahold's choice. */
      columns: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,39}$/)).max(20).nullable().optional(),
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
              archived_at = case when $5::boolean is null then archived_at when $5 then coalesce(archived_at, now()) else null end,
              columns = case when $6 then $7::text[] else columns end
        where id = $1 returning *`,
      [
        id,
        input.name ? JSON.stringify(input.name) : null,
        input.fields ? JSON.stringify(mergeDefs(t.fields ?? [], input.fields as any, auth)) : null,
        input.position ?? null,
        input.archived ?? null,
        input.columns !== undefined,
        input.columns ? [...new Set(input.columns)] : null,
      ],
    );
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'record_type.updated', entity: 'record_type', entityId: id, meta: { fields: Object.keys(input) } });
    if (input.fields) await recomputeRollups(q, org.id, org.account_fields, null);
    return u;
  });
  const type = toRecordType(row);
  return c.json({ type: { ...type, fields: defsFor(type.fields, auth) } });
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
    return { rows, n, links, hidden: await hiddenByType(q, c.get('auth')) };
  });
  return c.json({ records: data.rows.map((r) => viewRecord(r, data.hidden, data.links.get(r.id))), total: data.n });
});

// ------------------------------------------------------------- renewals

/**
 * For the Renewals view: each asked-for customer's open renewal opportunity
 * and its agreements kept as records. Worked out on read from what is there
 * (no table of its own). A renewal opportunity is an open opportunity whose
 * Type is "renewal", or — where opportunities have no Type — whose name says
 * renewal. Fields this person may not see stay out.
 */
recordRoutes.get('/renewals/links', async (c) => {
  const ids = (c.req.query('accounts') ?? '').split(',').filter(Boolean);
  if (ids.length > 500 || ids.some((x) => !uuid.safeParse(x).success)) fail('validation', { fields: 'accounts' }, { fields: ['accounts'] });
  const auth = c.get('auth');
  const out = await run(c, async (q) => {
    const links: Record<string, RenewalLinks> = Object.fromEntries(ids.map((id) => [id, { deal: null, agreements: [] }]));
    if (!ids.length) return links;
    const types = await q.query<Row>('select id, key, kind, name, fields from record_types where archived_at is null order by position, created_at');

    // The renewal opportunity: one per customer, the newest.
    const deals = types.find((t) => t.kind === 'opportunity');
    if (deals) {
      const defs = (deals.fields ?? []) as RecordType['fields'];
      const hidden = hiddenKeys(defs, auth);
      const hasKind = defs.some((f) => f.key === 'kind' && f.options?.some((o) => o.key === 'renewal'));
      const rows = await q.query<Row>(
        `select distinct on (r.account_id) r.account_id, r.id, r.name, r.currency, r.fields->>'stage' as stage, r.fields->'amount' as amount
           from records r
          where r.type_id = $1 and r.account_id = any($2::uuid[]) and r.archived_at is null
            and coalesce(r.fields->>'status', 'open') not in ('won', 'lost')
            and (case when $3::boolean then r.fields->>'kind' = 'renewal' else r.name ~* '(renew|yenile)' end)
          order by r.account_id, r.created_at desc`,
        [deals.id, ids, hasKind],
      );
      for (const r of rows) {
        const amount = hidden.has('amount') || r.amount === null ? null : Number(r.amount);
        links[r.account_id].deal = { id: r.id, name: r.name, stage: hidden.has('stage') ? null : (r.stage ?? null), amount: Number.isFinite(amount) ? amount : null, currency: r.currency ?? null, typeKey: deals.key };
      }
    }

    // Agreements kept as records: the kinds of record named like one, newest first, three per customer.
    for (const t of types.filter((x) => x.kind !== 'opportunity' && x.kind !== 'contact' && AGREEMENT_RE.test(`${x.key} ${JSON.stringify(x.name)}`))) {
      const defs = (t.fields ?? []) as RecordType['fields'];
      const hidden = hiddenKeys(defs, auth);
      const urlKey = defs.find((f) => f.type === 'url' && !hidden.has(f.key))?.key ?? null;
      const rows = await q.query<Row>(
        `select * from (
           select r.account_id, r.id, r.name, ${urlKey ? 'r.fields->>$3' : 'null::text'} as url,
                  row_number() over (partition by r.account_id order by r.created_at desc) as n
             from records r
            where r.type_id = $1 and r.account_id = any($2::uuid[]) and r.archived_at is null
         ) x where x.n <= 3`,
        urlKey ? [t.id, ids, urlKey] : [t.id, ids],
      );
      for (const r of rows) links[r.account_id].agreements.push({ recordId: r.id, name: r.name, url: r.url && /^https?:\/\//i.test(r.url) ? r.url : null, typeKey: t.key });
    }
    return links;
  });
  return c.json({ links: out });
});

recordRoutes.get('/records/:id', async (c) => {
  const id = param(c, 'id');
  const full = c.req.query('full') === '1';
  const data = await run(c, async (q) => {
    const [r] = await q.query(`${SELECT} where r.id = $1`, [id]);
    if (!r) fail('not_found');
    const links = await linksFor(q, 'record', [id]);
    if (!full) return { r, links, hidden: await hiddenByType(q, c.get('auth')) };
    const comments = await q.query('select * from record_comments where record_id = $1 order by created_at', [id]);
    const files = await q.query('select * from files where record_id = $1 order by created_at', [id]);
    // Its tasks: what is open, and what was finished in the last ninety days.
    const tasks = await q.query(
      `select t.*, a.name as account_name, b.name as board_name from tasks t join boards b on b.id = t.board_id left join accounts a on a.id = t.account_id
        where t.record_id = $1 and t.parent_id is null and b.archived_at is null
          and (t.done_at is null and t.archived_at is null or t.done_at > now() - interval '90 days')
        order by (t.done_at is not null), t.due_date nulls last, t.created_at limit 100`,
      [id],
    );
    return { r, links, hidden: await hiddenByType(q, c.get('auth')), comments, files, tasks };
  });
  const record = viewRecord(data.r, data.hidden, data.links.get(id));
  if (!full) return c.json({ record });
  const files = (data.files ?? []).map(toFile);
  const detail: RecordDetail = {
    ...record,
    comments: (data.comments ?? []).map((cm) => ({
      id: cm.id,
      recordId: cm.record_id,
      authorId: cm.author_id ?? null,
      body: cm.body,
      mentions: cm.mentions ?? [],
      createdAt: iso(cm.created_at)!,
      files: files.filter((f) => f.commentId === cm.id),
    })),
    files,
    tasks: (data.tasks ?? []).map((t) => ({ ...toTask(t), boardName: t.board_name, done: t.done_at != null }) as Task),
  };
  return c.json({ record: detail });
});

// ------------------------------------------------------------ the thread

recordRoutes.post('/records/:id/comments', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(c, z.object({ body: z.string().trim().max(10000), fileIds: z.array(uuid).max(10).optional() }));
  if (!input.body && !input.fileIds?.length) fail('validation', { fields: 'body' }, { fields: ['body'] });
  const auth = c.get('auth');
  const org = c.get('org');
  const row = await run(c, async (q) => {
    const [r] = await q.query('select r.id, r.name, r.owner_id, t.key as type_key from records r join record_types t on t.id = r.type_id where r.id = $1', [id]);
    if (!r) fail('not_found');
    const mentioned = [...new Set([...input.body.matchAll(MENTION_RE)].map((m) => m[2]))];
    const valid = mentioned.length ? (await q.query<{ id: string }>(`select id from users where id = any($1::uuid[]) and status <> 'deleted'`, [mentioned])).map((u) => u.id) : [];
    const [cm] = await q.query('insert into record_comments (org_id, record_id, author_id, body, mentions) values ($1, $2, $3, $4, $5) returning *', [org.id, id, auth.userId, input.body, valid]);
    // Files uploaded for this comment, by its author, onto this record.
    const files = input.fileIds?.length
      ? await q.query('update files set record_comment_id = $1 where id = any($2::uuid[]) and record_id = $3 and uploaded_by = $4 and record_comment_id is null returning *', [cm.id, input.fileIds, id, auth.userId])
      : [];
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'record_comment.created', entity: 'record', entityId: id });
    const excerpt = input.body.replace(/@\[([^\]]+)\]\([0-9a-f-]{36}\)/g, '@$1').slice(0, 280) || (files[0]?.name ?? '');
    const data = { excerpt, recordId: id, recordName: r.name, typeKey: r.type_key };
    const told = new Set(valid);
    const list: NewNotification[] = valid.map((u) => ({ orgId: org.id, userId: u, kind: 'mentioned', actorId: auth.userId, data }));
    // Whoever owns the record hears about a new comment, unless they wrote it or were named in it.
    if (r.owner_id && !told.has(r.owner_id)) list.push({ orgId: org.id, userId: r.owner_id, kind: 'comment', actorId: auth.userId, data });
    await enqueue(q, list);
    return { cm, files };
  });
  kick(c.get('deps'));
  const comment: RecordComment = {
    id: row.cm.id,
    recordId: id,
    authorId: row.cm.author_id,
    body: row.cm.body,
    mentions: row.cm.mentions ?? [],
    createdAt: iso(row.cm.created_at)!,
    files: row.files.map(toFile),
  };
  return c.json({ comment }, 201);
});

recordRoutes.delete('/record-comments/:id', async (c) => {
  const id = param(c, 'id');
  const auth = c.get('auth');
  const org = c.get('org');
  const keys = await run(c, async (q) => {
    const files = await q.query<{ id: string; storage_key: string }>('select id, storage_key from files where record_comment_id = $1', [id]);
    const rows = await q.query('delete from record_comments where id = $1 returning record_id', [id]);
    if (!rows.length) fail('not_found');
    // Its pictures and files go with it.
    if (files.length) await q.query('delete from files where id = any($1::uuid[])', [files.map((f) => f.id)]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'record_comment.deleted', entity: 'record', entityId: rows[0].record_id });
    return files.map((f) => f.storage_key);
  });
  for (const k of keys) await c.get('deps').storage.delete(k);
  return c.json({ ok: true });
});

recordRoutes.post('/records/:id/files', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const org = c.get('org');
  const auth = c.get('auth');
  const deps = c.get('deps');
  const f = await readUpload(c);
  const key = `${org.id}/r/${id}/${crypto.randomUUID()}`;
  const row = await run(c, async (q) => {
    const [r] = await q.query('select id from records where id = $1', [id]);
    if (!r) fail('not_found');
    await deps.storage.put(key, f.data, f.mime);
    const [x] = await q.query(
      `insert into files (org_id, record_id, name, size, mime, storage_key, uploaded_by) values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [org.id, id, f.name, f.size, f.mime, key, auth.userId],
    );
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'file.uploaded', entity: 'file', entityId: x.id, meta: { name: f.name } });
    return x;
  });
  return c.json({ file: toFile(row) }, 201);
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
      currency: z.string().regex(/^[A-Z]{3}$/).nullable().optional(),
    }),
  );
  const org = c.get('org');
  const auth = c.get('auth');
  const deps = c.get('deps');
  if (!allowedCurrency(org, input.currency)) fail('validation', { fields: 'currency' }, { fields: ['currency'] });
  const row = await run(c, async (q) => {
    const type = await typeOf(q, input.typeId);
    checkEditable(type.fields ?? [], changedFieldKeys({}, input.fields ?? {}), auth);
    await checkRefs(q, input.accountId, input.ownerId);
    const fields = cleanFields(type.fields, input.fields ?? {}, org.locale);
    const name = contactName(type.kind, input.name, fields, null);
    if (!name) fail('validation', { fields: 'name' }, { fields: ['name'] });
    await checkParent(q, { id: null, type_id: type.id, account_id: input.accountId ?? null }, input.parentId);
    const [r] = await q.query(
      `insert into records (org_id, type_id, account_id, parent_id, name, owner_id, fields, created_by, currency)
       values ($1, $2, $3, $4, $5, $6, $7, $8,
               -- Without a currency of its own it is in its customer's, else in the company's.
               coalesce($9, (select a.currency from accounts a where a.id = $3))) returning id`,
      [org.id, type.id, input.accountId ?? null, input.parentId ?? null, name, input.ownerId ?? null, JSON.stringify(fields), auth.userId, input.currency && input.currency !== org.currency ? input.currency : null],
    );
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'record.created', entity: 'record', entityId: r.id, meta: { type: type.key } });
    await recomputeRollups(q, org.id, org.account_fields, [input.accountId ?? null]);
    await queueSync(q, org.id, 'record', [r.id], null, { created: true, typeKey: type.key });
    const [full] = await q.query(`${SELECT} where r.id = $1`, [r.id]);
    return { full, hidden: await hiddenByType(q, auth) };
  });
  kickSync(deps, org.id);
  return c.json({ record: viewRecord(row.full, row.hidden) }, 201);
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
      currency: z.string().regex(/^[A-Z]{3}$/).nullable().optional(),
    }),
  );
  const org = c.get('org');
  const auth = c.get('auth');
  const deps = c.get('deps');
  if (!allowedCurrency(org, input.currency)) fail('validation', { fields: 'currency' }, { fields: ['currency'] });
  const row = await run(c, async (q) => {
    const [r] = await q.query('select * from records where id = $1', [id]);
    if (!r) fail('not_found');
    const [type] = await q.query('select * from record_types where id = $1', [r.type_id]);
    await checkRefs(q, input.accountId, input.ownerId);
    const cleaned = input.fields ? cleanFields(type.fields, input.fields, org.locale) : {};
    checkEditable(type.fields ?? [], changedFieldKeys(r.fields, cleaned), auth);
    const fields = input.fields ? { ...(r.fields ?? {}), ...cleaned } : r.fields;
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
              archived_at = case when $6::boolean is null then archived_at when $6 then coalesce(archived_at, now()) else null end,
              currency = case when $8 then $9::text else currency end
        where id = $1`,
      [id, next.name, next.owner_id, next.account_id, JSON.stringify(fields), input.archived ?? null, next.parent_id, input.currency !== undefined, input.currency && input.currency !== org.currency ? input.currency : null],
    );
    if (accountMoved) await q.query('update records set parent_id = null where parent_id = $1', [id]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'record.updated', entity: 'record', entityId: id, meta: { fields: Object.keys(input) } });
    await recomputeRollups(q, org.id, org.account_fields, [r.account_id, next.account_id]);
    const keys = changedKeys(r, next);
    if (keys.length) await queueSync(q, org.id, 'record', [id], keys);
    const [full] = await q.query(`${SELECT} where r.id = $1`, [id]);
    const links = await linksFor(q, 'record', [id]);
    return { full, links, hidden: await hiddenByType(q, auth) };
  });
  kickSync(deps, org.id);
  return c.json({ record: viewRecord(row.full, row.hidden, row.links.get(id)) });
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
