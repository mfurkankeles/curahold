// Accounts (customers) and their fields; importing from a file with undo;
// bulk changes. Works the same whether or not a CRM is connected.
import { foldText } from '../../../shared/src/text';
import { allowedCurrency } from '../lib/fx';
import { Hono } from 'hono';
import { z } from 'zod';
import { normalizeValue, optionKey } from '../../../shared/src/fields';
import { calculated, type Account, type AccountField, type ImportResult } from '../../../shared/src/model';
import { nowOf, requirePerm, requireWriter, run, type AppEnv } from '../context';
import type { Q, Row } from '../db';
import { audit } from '../lib/audit';
import { runAccountCreated } from '../lib/automations';
import { fail } from '../lib/errors';
import { iso, toTask } from '../lib/mappers';
import { changedKeys, kickSync, queueSync, recomputeRollups } from '../lib/records';
import { body, param, uuid } from '../lib/validate';
import { cleanFields, fieldSchema } from '../lib/fieldDefs';
import { linksFor } from '../lib/links';
import { saveUndo } from '../lib/undo';
import { changedFieldKeys, checkEditable, hiddenKeys, mergeDefs, stripFields } from '../lib/fieldAccess';

export const accountRoutes = new Hono<AppEnv>();

export const MAX_IMPORT_ROWS = 5000;
const HIDDEN = /^_/; // _owner, _team: values waiting for a person or team that does not exist yet

export const toAccount = (r: Row): Account => ({
  id: r.id,
  name: r.name,
  ownerId: r.owner_id ?? null,
  teamId: r.team_id ?? null,
  fields: Object.fromEntries(Object.entries(r.fields ?? {}).filter(([k]) => !HIDDEN.test(k))) as Account['fields'],
  source: r.source,
  externalId: r.external_id ?? null,
  createdAt: iso(r.created_at)!,
  updatedAt: iso(r.updated_at)!,
  archivedAt: iso(r.archived_at),
  ...(r.open_tasks != null ? { openTasks: Number(r.open_tasks) } : {}),
  ...(r.last_activity !== undefined ? { lastActivityAt: iso(r.last_activity) } : {}),
  ...(r.overdue_tasks != null ? { overdueTasks: Number(r.overdue_tasks), stuckTasks: Number(r.stuck_tasks), lastTouchAt: iso(r.last_touch) } : {}),
  reviewDays: r.review_days ?? null,
  ...(r.last_review !== undefined ? { lastReviewAt: iso(r.last_review) } : {}),
  currency: r.currency ?? null,
});

const currencyInput = z.string().regex(/^[A-Z]{3}$/).nullable();

const OPEN_TASKS = `(select count(*) from tasks t join boards b on b.id = t.board_id
    where t.account_id = a.id and t.archived_at is null and t.parent_id is null
      and t.done_at is null) as open_tasks,
  (select max(t.updated_at) from tasks t where t.account_id = a.id) as last_activity,
  (select max(x.happened_at) from activities x where x.account_id = a.id and x.kind = 'review') as last_review`;

/**
 * What needs attention on a customer, for the cards: overdue and stuck work
 * (open, untouched for 14 days) and the last time anyone was in touch (a
 * logged note, call, meeting or email, or a finished task). Worked out on
 * read, under the reader's own rights; nothing is stored.
 */
const SIGNALS = `(select count(*) from tasks t join boards b on b.id = t.board_id
    where t.account_id = a.id and t.archived_at is null and t.parent_id is null and t.due_date < current_date
      and t.done_at is null) as overdue_tasks,
  (select count(*) from tasks t join boards b on b.id = t.board_id
    where t.account_id = a.id and t.archived_at is null and t.parent_id is null and t.updated_at < now() - interval '14 days'
      and t.done_at is null) as stuck_tasks,
  greatest((select max(x.happened_at) from activities x where x.account_id = a.id),
           (select max(t.done_at) from tasks t where t.account_id = a.id)) as last_touch`;

/** An account as this person may see it (fields closed to their role left out). */
function viewOf(c: Parameters<typeof requireWriter>[0]) {
  const hidden = hiddenKeys(c.get('org').account_fields, c.get('auth'));
  return (r: Row): Account => {
    const a = toAccount(r);
    return hidden.size ? { ...a, fields: stripFields(a.fields, hidden) } : a;
  };
}

/** New owner and/or team, allowed to move customers out of the giver's own reach. */
async function reassign(q: Q, ids: string[], ownerId: string | null | undefined, teamId: string | null | undefined) {
  await q.query('select app_reassign_accounts($1::uuid[], $2, $3::uuid, $4, $5::uuid)', [ids, ownerId !== undefined, ownerId ?? null, teamId !== undefined, teamId ?? null]);
}

async function checkOwner(q: Q, ownerId: string | null | undefined) {
  if (!ownerId) return;
  const [u] = await q.query(`select 1 from users where id = $1 and status in ('active', 'invited')`, [ownerId]);
  if (!u) fail('bad_assignee');
}

accountRoutes.get('/accounts', async (c) => {
  const search = (c.req.query('q') ?? '').trim().slice(0, 100);
  const owner = c.req.query('owner');
  const archived = c.req.query('archived') === '1';
  const limit = Math.min(500, Math.max(1, Number(c.req.query('limit') ?? 200)));
  const offset = Math.max(0, Number(c.req.query('offset') ?? 0));
  const ownerId = owner === 'me' ? c.get('auth').userId : owner && uuid.safeParse(owner).success ? owner : null;
  const signals = c.req.query('signals') === '1';
  const rows = await run(c, async (q) => {
    const list = await q.query(
      `select a.*, ${OPEN_TASKS}${signals ? `, ${SIGNALS}` : ''} from accounts a
        where ($1 = '' or a.name_fold like '%' || fold_text($1) || '%')
          and ($2::uuid is null or a.owner_id = $2::uuid)
          and (case when $3 then a.archived_at is not null else a.archived_at is null end)
        order by sort_key(a.name_fold, a.name_tr) limit $4 offset $5`,
      [search.replace(/[%_]/g, ''), ownerId, archived, limit, offset],
    );
    const [{ n }] = await q.query(
      `select count(*)::int as n from accounts a
        where ($1 = '' or a.name_fold like '%' || fold_text($1) || '%') and ($2::uuid is null or a.owner_id = $2::uuid)
          and (case when $3 then a.archived_at is not null else a.archived_at is null end)`,
      [search.replace(/[%_]/g, ''), ownerId, archived],
    );
    return { list, total: n };
  });
  return c.json({ accounts: rows.list.map(viewOf(c)), total: rows.total });
});

const accountInput = {
  name: z.string().trim().min(1).max(200),
  ownerId: uuid.nullable(),
  teamId: uuid.nullable(),
  fields: z.record(z.string().max(40), z.union([z.string().max(2000), z.number(), z.null()])),
};

/**
 * Which customers have which products (and which do not): records of one
 * type counted per customer and per option of one of its choice fields —
 * subscriptions by product, say. An empty cell is a cross-sell to talk about.
 */
accountRoutes.get('/accounts/whitespace', async (c) => {
  const typeId = c.req.query('type') ?? '';
  const field = c.req.query('field') ?? '';
  if (!uuid.safeParse(typeId).success || !/^[a-z][a-z0-9_]{0,40}$/.test(field)) fail('validation', { fields: 'type, field' }, { fields: ['type', 'field'] });
  const out = await run(c, async (q) => {
    const [type] = await q.query('select id, fields from record_types where id = $1 and archived_at is null', [typeId]);
    if (!type) fail('not_found');
    const def = (type.fields as AccountField[]).find((f) => f.key === field && f.type === 'select');
    if (!def) fail('validation', { fields: 'field' }, { fields: ['field'] });
    const cells = await q.query<{ account_id: string; v: string; n: number }>(
      `select r.account_id, r.fields->>$2 as v, count(*)::int as n from records r
        where r.type_id = $1 and r.archived_at is null and r.account_id is not null and r.fields->>$2 is not null
        group by 1, 2`,
      [typeId, field],
    );
    const accounts = await q.query(`select a.id, a.name, a.owner_id from accounts a where a.archived_at is null order by sort_key(a.name_fold, a.name_tr) limit 1000`);
    const have = new Map<string, Record<string, number>>();
    for (const r of cells) have.set(r.account_id, { ...(have.get(r.account_id) ?? {}), [r.v]: r.n });
    return {
      options: def!.options ?? [],
      rows: accounts.map((a) => ({ accountId: a.id, name: a.name, ownerId: a.owner_id ?? null, have: have.get(a.id) ?? {} })),
    };
  });
  return c.json(out);
});

accountRoutes.post('/accounts', async (c) => {
  requireWriter(c);
  const input = await body(
    c,
    z.object({ name: accountInput.name, ownerId: accountInput.ownerId.optional(), teamId: accountInput.teamId.optional(), fields: accountInput.fields.optional(), currency: currencyInput.optional() }),
  );
  const org = c.get('org');
  const auth = c.get('auth');
  checkEditable(org.account_fields, changedFieldKeys({}, input.fields ?? {}), auth);
  if (!allowedCurrency(org, input.currency)) fail('validation', { fields: 'currency' }, { fields: ['currency'] });
  const row = await run(c, async (q) => {
    await checkOwner(q, input.ownerId);
    const fields = cleanFields(org.account_fields, input.fields ?? {}, org.locale);
    const id = crypto.randomUUID();
    await q.query(
      `insert into accounts (id, org_id, name, owner_id, team_id, fields, source, created_by, currency) values ($1, $2, $3, $4, $5, $6, 'manual', $7, $8)`,
      [id, org.id, input.name, input.ownerId ?? null, input.teamId ?? null, JSON.stringify(fields), auth.userId, input.currency && input.currency !== org.currency ? input.currency : null],
    );
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'account.created', entity: 'account', entityId: id });
    await queueSync(q, org.id, 'account', [id], null, { created: true });
    const [r] = await q.query('select * from accounts where id = $1', [id]);
    // Given to someone outside this person's reach: it is saved, they just no longer see it.
    return r ?? { id, name: input.name, owner_id: input.ownerId ?? null, team_id: input.teamId ?? null, fields, source: 'manual', created_at: new Date(), updated_at: new Date() };
  });
  kickSync(c.get('deps'), org.id);
  await runAccountCreated(c.get('deps'), org.id, [row.id], nowOf(c.get('deps'))).catch(() => 0);
  return c.json({ account: viewOf(c)(row) }, 201);
});

accountRoutes.get('/accounts/:id', async (c) => {
  const id = param(c, 'id');
  const data = await run(c, async (q) => {
    const [a] = await q.query(`select a.*, ${OPEN_TASKS} from accounts a where a.id = $1`, [id]);
    if (!a) fail('not_found');
    const tasks = await q.query(
      `select t.*, a.name as account_name, b.name as board_name from tasks t join boards b on b.id = t.board_id
         left join accounts a on a.id = t.account_id
        where t.account_id = $1 and t.archived_at is null and t.parent_id is null and b.archived_at is null
        order by t.due_date nulls last, t.updated_at desc limit 500`,
      [id],
    );
    const links = await linksFor(q, 'account', [id]);
    return { a, tasks, links };
  });
  return c.json({ account: { ...viewOf(c)(data.a), links: data.links.get(id) ?? [] }, tasks: data.tasks.map((t) => ({ ...toTask(t), boardName: t.board_name })) });
});

accountRoutes.patch('/accounts/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(
    c,
    z.object({
      name: accountInput.name.optional(),
      ownerId: accountInput.ownerId.optional(),
      teamId: accountInput.teamId.optional(),
      fields: accountInput.fields.optional(),
      archived: z.boolean().optional(),
      /** Days between business reviews; null follows the company's rhythm, 0 is none. */
      reviewDays: z.number().int().min(0).max(730).nullable().optional(),
      currency: currencyInput.optional(),
    }),
  );
  const org = c.get('org');
  const auth = c.get('auth');
  if (input.archived !== undefined) requirePerm(c, 'accounts.manage');
  if (!allowedCurrency(org, input.currency)) fail('validation', { fields: 'currency' }, { fields: ['currency'] });
  const row = await run(c, async (q) => {
    const [a] = await q.query('select * from accounts where id = $1', [id]);
    if (!a) fail('not_found');
    if (input.ownerId !== undefined) await checkOwner(q, input.ownerId);
    const cleaned = input.fields ? cleanFields(org.account_fields, input.fields, org.locale) : {};
    // Sending a read-only field back unchanged is fine; changing it is not.
    checkEditable(org.account_fields, changedFieldKeys(a.fields, cleaned), auth);
    const fields = input.fields ? { ...(a.fields ?? {}), ...cleaned } : a.fields;
    await q.query(
      `update accounts set name = $2, fields = $3, updated_at = now(),
              archived_at = case when $4::boolean is null then archived_at when $4 then coalesce(archived_at, now()) else null end,
              review_days = case when $5 then $6::int else review_days end,
              currency = case when $7 then $8::text else currency end
        where id = $1`,
      [id, input.name ?? a.name, JSON.stringify(fields), input.archived ?? null, input.reviewDays !== undefined, input.reviewDays ?? null, input.currency !== undefined, input.currency && input.currency !== org.currency ? input.currency : null],
    );
    // A new owner or team may take the customer out of this person's reach.
    if ((input.ownerId !== undefined && input.ownerId !== a.owner_id) || (input.teamId !== undefined && input.teamId !== a.team_id)) {
      await reassign(q, [id], input.ownerId, input.teamId);
    }
    const [seen] = await q.query(`select a.*, (select max(x.happened_at) from activities x where x.account_id = a.id and x.kind = 'review') as last_review from accounts a where a.id = $1`, [id]);
    const u = seen ?? {
      ...a,
      review_days: input.reviewDays !== undefined ? input.reviewDays : a.review_days,
      name: input.name ?? a.name,
      owner_id: input.ownerId !== undefined ? input.ownerId : a.owner_id,
      team_id: input.teamId !== undefined ? input.teamId : a.team_id,
      fields,
      updated_at: new Date(),
    };
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'account.updated', entity: 'account', entityId: id, meta: { fields: Object.keys(input) } });
    const keys = changedKeys(a, u);
    if (keys.length) await queueSync(q, org.id, 'account', [id], keys);
    return u;
  });
  kickSync(c.get('deps'), org.id);
  return c.json({ account: viewOf(c)(row) });
});

accountRoutes.delete('/accounts/:id', async (c) => {
  requirePerm(c, 'accounts.manage');
  const id = param(c, 'id');
  const org = c.get('org');
  const auth = c.get('auth');
  await run(c, async (q) => {
    const rows = await q.query('delete from accounts where id = $1 returning name', [id]);
    if (!rows.length) fail('not_found');
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'account.deleted', entity: 'account', entityId: id, meta: { name: rows[0].name } });
  });
  return c.json({ ok: true });
});

/** Change many at once: new owner, new team, archive or restore. */
accountRoutes.post('/accounts/bulk', async (c) => {
  requirePerm(c, 'accounts.manage');
  const input = await body(
    c,
    z.object({ ids: z.array(uuid).min(1).max(2000), ownerId: uuid.nullable().optional(), teamId: uuid.nullable().optional(), archived: z.boolean().optional() }),
  );
  const org = c.get('org');
  const auth = c.get('auth');
  const n = await run(c, async (q) => {
    if (input.ownerId) await checkOwner(q, input.ownerId);
    const rows = await q.query('select id, owner_id, team_id, archived_at from accounts where id = any($1::uuid[])', [input.ids]);
    const ids = rows.map((r) => r.id);
    const undoId = await saveUndo(q, org.id, auth.userId, 'accounts', rows);
    if (input.archived !== undefined) {
      await q.query(
        `update accounts set archived_at = case when $2 then coalesce(archived_at, now()) else null end, updated_at = now() where id = any($1::uuid[])`,
        [ids, input.archived],
      );
    }
    if (input.ownerId !== undefined || input.teamId !== undefined) await reassign(q, ids, input.ownerId, input.teamId);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'account.bulk_updated', entity: 'account', meta: { count: rows.length, fields: Object.keys(input).filter((k) => k !== 'ids') } });
    if (input.ownerId !== undefined) await queueSync(q, org.id, 'account', rows.map((r) => r.id), ['owner']);
    return { n: rows.length, undoId };
  });
  if (input.ownerId !== undefined) kickSync(c.get('deps'), org.id);
  return c.json({ updated: n.n, undoId: n.undoId });
});

// ------------------------------------------------------------------ fields

accountRoutes.put('/account-fields', async (c) => {
  requirePerm(c, 'accounts.manage');
  const input = await body(c, z.object({ fields: z.array(fieldSchema).max(150) }));
  const keys = input.fields.map((f) => f.key);
  if (new Set(keys).size !== keys.length) fail('validation', { fields: 'key' }, { fields: ['key'] });
  const org = c.get('org');
  const auth = c.get('auth');
  const defs = mergeDefs(org.account_fields, input.fields as AccountField[], auth);
  await run(c, async (q) => {
    await q.query('select app_set_account_fields($1::jsonb)', [JSON.stringify(defs)]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'org.account_fields', entity: 'org', entityId: org.id, meta: { count: defs.length } });
    const access = (list: AccountField[]) => JSON.stringify(list.map((f) => [f.key, f.access ?? null]));
    if (access(org.account_fields) !== access(defs)) {
      await audit(q, { orgId: org.id, actorId: auth.userId, action: 'org.field_access', entity: 'org', entityId: org.id, meta: { fields: defs.filter((f) => f.access?.view?.length || f.access?.edit?.length).map((f) => f.key) } });
    }
    await recomputeRollups(q, org.id, defs, null);
  });
  return c.json({ ok: true });
});

// ------------------------------------------------------------------ import

const importSchema = z.object({
  fileName: z.string().max(200).optional(),
  rows: z.array(z.record(z.string().max(200), z.union([z.string().max(5000), z.number(), z.null()]))).max(MAX_IMPORT_ROWS),
  mapping: z.object({
    name: z.string().max(200),
    owner: z.string().max(200).nullable().optional(),
    team: z.string().max(200).nullable().optional(),
    externalId: z.string().max(200).nullable().optional(),
    fields: z.record(z.string().max(40), z.string().max(200)).optional(),
  }),
  /** Columns to keep as new fields: { column: { key, label, type } } */
  newFields: z.array(z.object({ column: z.string().max(200), field: fieldSchema })).max(40).optional(),
  /** Imported customers are existing ones, so "new customer" rules do not run unless asked. */
  runAutomations: z.boolean().optional(),
  /** How the file writes numbers and dates ("1.250,50" / "05.03.2027" vs "1,250.50" / "03/05/2027"). */
  locale: z.enum(['en', 'tr']).optional(),
});

const fold = (s: string) => foldText(s).trim();

accountRoutes.post('/accounts/import', async (c) => {
  requirePerm(c, 'accounts.manage');
  // Matching rows to existing customers needs to see all of them.
  requirePerm(c, 'accounts.view_all');
  if (Number(c.req.header('content-length') ?? 0) > 12 * 1024 * 1024) fail('import_too_large', { max: MAX_IMPORT_ROWS });
  const input = await body(c, importSchema);
  const org = c.get('org');
  const auth = c.get('auth');
  const locale = input.locale ?? org.locale;
  checkEditable(org.account_fields, Object.keys(input.mapping.fields ?? {}), auth);
  const result = await run(c, async (q) => {
    // Field definitions: existing + new ones, with select options grown from the file.
    const defs: AccountField[] = JSON.parse(JSON.stringify(org.account_fields ?? []));
    const fieldColumns: Record<string, string> = { ...(input.mapping.fields ?? {}) };
    for (const nf of input.newFields ?? []) {
      if (!defs.some((d) => d.key === nf.field.key)) defs.push({ ...nf.field, options: nf.field.options ?? (nf.field.type === 'select' ? [] : undefined) });
      fieldColumns[nf.field.key] = nf.column;
    }
    for (const [key, col] of Object.entries(fieldColumns)) {
      const def = defs.find((d) => d.key === key);
      if (!def || calculated(def)) fail('validation', { fields: `mapping.fields.${key}` }, { fields: [`mapping.fields.${key}`] });
      if (def!.type !== 'select') continue;
      def!.options = def!.options ?? [];
      for (const row of input.rows) {
        const raw = row[col];
        if (raw === null || raw === undefined || String(raw).trim() === '') continue;
        if ('error' in normalizeValue(def!, raw, locale) && def!.options.length < 50) {
          const label = String(raw).trim().slice(0, 60);
          let k = optionKey(label);
          while (def!.options.some((o) => o.key === k)) k = `${k}_`;
          def!.options.push({ key: k, label: { [locale]: label } });
        }
      }
    }
    const fieldsChanged = JSON.stringify(defs) !== JSON.stringify(org.account_fields ?? []);
    if (fieldsChanged) await q.query('select app_set_account_fields($1::jsonb)', [JSON.stringify(defs)]);

    const users = await q.query(`select id, email, name from users where status in ('active', 'invited')`);
    const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));
    const byName = new Map(users.map((u) => [fold(u.name), u.id]));
    const teams = await q.query('select id, name from teams');
    const teamByName = new Map(teams.map((t) => [fold(t.name), t.id]));
    const existing = await q.query('select * from accounts where archived_at is null');
    const byExt = new Map(existing.filter((a) => a.external_id).map((a) => [`${a.source}:${a.external_id}`, a]));
    const byAccName = new Map(existing.map((a) => [fold(a.name), a]));

    const out: ImportResult = { batch: '', created: 0, updated: 0, skipped: 0, errors: [], unmatchedOwners: [] };
    const hints = new Map<string, { email: string | null; name: string | null; count: number }>();
    const createdIds: string[] = [];
    const previous: Row[] = [];
    const touched = new Set<string>();

    for (const [i, row] of input.rows.entries()) {
      const rowNo = i + 2; // spreadsheet row number (header is row 1)
      const name = String(row[input.mapping.name] ?? '').trim().slice(0, 200);
      if (!name) {
        out.skipped++;
        out.errors.push({ row: rowNo, reason: 'name' });
        continue;
      }
      const fields: Record<string, unknown> = {};
      const bad: string[] = [];
      for (const [key, col] of Object.entries(fieldColumns)) {
        const def = defs.find((d) => d.key === key)!;
        const r = normalizeValue(def, row[col], locale);
        if ('error' in r) bad.push(key);
        else if (r.value !== null) fields[key] = r.value;
      }
      if (bad.length) out.errors.push({ row: rowNo, reason: `fields:${bad.join(',')}` });

      let ownerId: string | null | undefined;
      const ownerRaw = input.mapping.owner ? String(row[input.mapping.owner] ?? '').trim() : '';
      if (input.mapping.owner) {
        ownerId = ownerRaw ? (byEmail.get(ownerRaw.toLowerCase()) ?? byName.get(fold(ownerRaw)) ?? null) : null;
        if (ownerRaw && !ownerId) {
          fields._owner = ownerRaw.slice(0, 200);
          const isEmail = ownerRaw.includes('@');
          const k = fold(ownerRaw);
          const h = hints.get(k) ?? { email: isEmail ? ownerRaw.toLowerCase() : null, name: isEmail ? null : ownerRaw, count: 0 };
          h.count++;
          hints.set(k, h);
        }
      }
      let teamId: string | null | undefined;
      const teamRaw = input.mapping.team ? String(row[input.mapping.team] ?? '').trim() : '';
      if (input.mapping.team) {
        teamId = teamRaw ? (teamByName.get(fold(teamRaw)) ?? null) : null;
        if (teamRaw && !teamId) fields._team = teamRaw.slice(0, 120);
      }
      const ext = input.mapping.externalId ? String(row[input.mapping.externalId] ?? '').trim().slice(0, 200) || null : null;
      const match = (ext ? byExt.get(`import:${ext}`) : undefined) ?? byAccName.get(fold(name));
      if (match) {
        if (!touched.has(match.id)) {
          previous.push({ id: match.id, name: match.name, owner_id: match.owner_id, team_id: match.team_id, fields: match.fields, external_id: match.external_id, source: match.source });
          touched.add(match.id);
        }
        const merged = { ...(match.fields ?? {}), ...fields };
        if (ownerId) delete merged._owner;
        if (teamId) delete merged._team;
        await q.query(
          `update accounts set name = $2, owner_id = $3, team_id = $4, fields = $5, external_id = coalesce($6, external_id),
                  source = case when $6::text is not null and external_id is null then 'import' else source end, updated_at = now()
            where id = $1`,
          [match.id, name, ownerId === undefined ? match.owner_id : (ownerId ?? match.owner_id), teamId === undefined ? match.team_id : (teamId ?? match.team_id), JSON.stringify(merged), ext],
        );
        Object.assign(match, { name, fields: merged });
        if (!createdIds.includes(match.id)) out.updated++;
      } else {
        const id = crypto.randomUUID();
        await q.query(
          `insert into accounts (id, org_id, name, owner_id, team_id, fields, source, external_id, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [id, org.id, name, ownerId ?? null, teamId ?? null, JSON.stringify(fields), ext ? 'import' : 'manual', ext, auth.userId],
        );
        const row2 = { id, name, fields, external_id: ext, source: ext ? 'import' : 'manual', owner_id: ownerId ?? null, team_id: teamId ?? null };
        byAccName.set(fold(name), row2);
        if (ext) byExt.set(`import:${ext}`, row2);
        createdIds.push(id);
        out.created++;
      }
    }
    out.unmatchedOwners = [...hints.values()].sort((a, b) => b.count - a.count).slice(0, 200);
    if (touched.size) await queueSync(q, org.id, 'account', [...touched], null);
    if (createdIds.length) await queueSync(q, org.id, 'account', createdIds, null, { created: true });
    const batchId = crypto.randomUUID();
    await q.query(
      `insert into import_batches (id, org_id, file_name, created_ids, previous, summary, created_by) values ($1, $2, $3, $4, $5, $6, $7)`,
      [batchId, org.id, input.fileName ?? null, createdIds, JSON.stringify(previous), JSON.stringify({ created: out.created, updated: out.updated, skipped: out.skipped, errors: out.errors.length, fieldsBefore: fieldsChanged ? org.account_fields : null }), auth.userId],
    );
    if (!org.setup?.finishedAt && out.unmatchedOwners.length) {
      await q.query(`update orgs set setup = jsonb_set(setup, '{ownerHints}', $2::jsonb) where id = $1`, [org.id, JSON.stringify(out.unmatchedOwners)]);
    }
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'account.imported', entity: 'import', entityId: batchId, meta: { created: out.created, updated: out.updated, skipped: out.skipped } });
    out.batch = batchId;
    return { out, createdIds };
  });
  kickSync(c.get('deps'), org.id);
  if (input.runAutomations && result.createdIds.length) {
    await runAccountCreated(c.get('deps'), org.id, result.createdIds, nowOf(c.get('deps'))).catch(() => 0);
  }
  return c.json(result.out);
});

accountRoutes.get('/imports', async (c) => {
  requirePerm(c, 'accounts.manage');
  const rows = await run(c, (q) =>
    q.query(`select b.id, b.file_name, b.summary, b.created_at, b.undone_at, b.created_by, b.previous <> '[]'::jsonb or cardinality(b.created_ids) > 0 as undoable
               from import_batches b where b.kind = 'accounts' order by b.created_at desc limit 20`),
  );
  return c.json({
    imports: rows.map((r) => ({
      id: r.id,
      fileName: r.file_name,
      summary: r.summary,
      createdAt: iso(r.created_at),
      undoneAt: iso(r.undone_at),
      createdBy: r.created_by,
      undoable: !r.undone_at && r.undoable && Date.now() - new Date(r.created_at).getTime() < 30 * 86400_000,
    })),
  });
});

/** Undo an import: remove what it added, put back what it changed (30 days). */
accountRoutes.post('/imports/:id/undo', async (c) => {
  requirePerm(c, 'accounts.manage');
  const id = param(c, 'id');
  const org = c.get('org');
  const auth = c.get('auth');
  const out = await run(c, async (q) => {
    const [b] = await q.query(`select * from import_batches where id = $1 and kind = 'accounts' for update`, [id]);
    if (!b || b.undone_at) fail('not_found');
    if (Date.now() - new Date(b.created_at).getTime() > 30 * 86400_000) fail('not_found');
    const removed = await q.query('delete from accounts where id = any($1::uuid[]) returning id', [b.created_ids]);
    let restored = 0;
    for (const p of (b.previous ?? []) as Row[]) {
      const r = await q.query(
        `update accounts set name = $2, owner_id = $3, team_id = $4, fields = $5, external_id = $6, source = $7, updated_at = now() where id = $1 returning id`,
        [p.id, p.name, p.owner_id, p.team_id, JSON.stringify(p.fields ?? {}), p.external_id, p.source],
      );
      restored += r.length;
    }
    if (b.summary?.fieldsBefore) await q.query('select app_set_account_fields($1::jsonb)', [JSON.stringify(b.summary.fieldsBefore)]);
    await q.query(`update import_batches set undone_at = now(), previous = '[]'::jsonb where id = $1`, [id]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'account.import_undone', entity: 'import', entityId: id, meta: { removed: removed.length, restored } });
    return { removed: removed.length, restored };
  });
  return c.json(out);
});

/** After people join, give imported accounts the owners and teams the file named. */
export async function linkPendingOwners(q: Q, orgId: string) {
  await q.query(
    `update accounts a set owner_id = u.id, fields = a.fields - '_owner'
       from users u
      where a.org_id = $1 and u.org_id = $1 and a.owner_id is null and a.fields ? '_owner'
        and u.status in ('active', 'invited')
        and (lower(a.fields->>'_owner') = u.email or fold_text(a.fields->>'_owner') = fold_text(u.name))`,
    [orgId],
  );
  await q.query(
    `update accounts a set team_id = t.id, fields = a.fields - '_team'
       from teams t
      where a.org_id = $1 and t.org_id = $1 and a.team_id is null and a.fields ? '_team' and fold_text(a.fields->>'_team') = fold_text(t.name)`,
    [orgId],
  );
}
