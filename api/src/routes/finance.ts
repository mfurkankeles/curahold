// Accounting, read only: the figures on a customer's page (open balance, what is
// overdue and for how long, the last payment, the invoices), the review list of
// accounting customers matched — or not — to Curahold's customers, and the file
// upload for programs without an open API. Figures are seen only with
// 'finance.view'; the review list and the upload need 'connections.manage'.
import { Hono } from 'hono';
import { z } from 'zod';
import { FILE_COLUMNS, fileRow, financeSummary, isAccounting, type FinKind, type FinRow } from '../../../shared/src/accounting';
import { nowOf, requirePerm, run, todayOf, type AppEnv, type C } from '../context';
import { audit } from '../lib/audit';
import { fail } from '../lib/errors';
import { iso } from '../lib/mappers';
import { body, param } from '../lib/validate';
import { recordUrl } from '../sync/adapters';
import { applyFinance, autoMatch } from '../sync/accountingsync';
import { emptyStats } from '../../../shared/src/sync';

export const financeRoutes = new Hono<AppEnv>();

/** An invoice row as the finance tables hold it. */
interface InvoiceRow {
  connection_id: string;
  remote_id: string;
  number: string | null;
  issued_on: unknown;
  due_on: unknown;
  currency: string | null;
  total: string | number;
  balance: string | number;
  status: 'open' | 'paid' | 'void' | 'draft';
}
interface ConnRow {
  id: string;
  provider: string;
  label: string;
  config: Record<string, unknown> | null;
  last_ok_at: unknown;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const dayText = (v: unknown) => (v ? (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)) : null);

/** The accounting connections of this company (owner access, by company). */
async function accountingConnections(c: C) {
  const org = c.get('org');
  const rows = await c.get('deps').db.system((q) => q.query<ConnRow>(`select id, provider, label, config, last_ok_at from connections where org_id = $1 and kind = 'source'`, [org.id]));
  return rows.filter((r) => isAccounting(r.provider));
}

// ------------------------------------------------------------ the customer page

financeRoutes.get('/accounts/:id/finance', async (c) => {
  requirePerm(c, 'finance.view');
  const id = param(c, 'id');
  // The customer must be one this person sees (row-level security on accounts).
  const [visible] = await run(c, (q) => q.query('select id from accounts where id = $1', [id]));
  if (!visible) fail('not_found');
  const conns = await accountingConnections(c);
  if (!conns.length) return c.json({ finance: null });
  const byId = new Map(conns.map((x) => [x.id, x]));
  const data = await run(c, async (q) => {
    const [a] = await q.query('select id, currency from accounts where id = $1', [id]);
    if (!a) fail('not_found');
    const links = await q.query<{ connection_id: string; remote_id: string }>(`select connection_id, remote_id from finance_customers where account_id = $1`, [id]);
    if (!links.length) return null;
    const pairs = JSON.stringify(links.map((l) => ({ c: l.connection_id, r: l.remote_id })));
    const match = `exists (select 1 from jsonb_to_recordset($1::jsonb) as k(c uuid, r text) where k.c = x.connection_id and k.r = x.customer_id)`;
    const open = await q.query<InvoiceRow>(`select x.* from finance_invoices x where ${match} and x.status = 'open' and x.balance > 0 order by x.due_on nulls last, x.issued_on limit 500`, [pairs]);
    const recent = await q.query<InvoiceRow>(`select x.* from finance_invoices x where ${match} and x.status in ('open', 'paid') order by x.issued_on desc nulls last limit 20`, [pairs]);
    const payments = await q.query<{ paid_on: unknown; amount: string | number; currency: string | null }>(`select x.paid_on, x.amount, x.currency from finance_payments x where ${match} and x.amount > 0 order by x.paid_on desc nulls last limit 1`, [pairs]);
    return { a, links, open, recent, payments };
  });
  if (!data) return c.json({ finance: { linked: false, sources: conns.map((x) => ({ provider: x.provider, label: x.label })) } });
  const fallback = data.a.currency ?? c.get('org').currency ?? 'USD';
  const summary = financeSummary(
    data.open.map((i) => ({ dueOn: dayText(i.due_on), currency: i.currency, balance: Number(i.balance), status: i.status })),
    data.payments.map((p) => ({ paidOn: dayText(p.paid_on), amount: Number(p.amount), currency: p.currency })),
    todayOf(c),
    fallback,
  );
  const seen = new Set<string>();
  const invoices = [...data.open, ...data.recent]
    .filter((i) => {
      const k = `${i.connection_id}:${i.remote_id}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 30)
    .map((i) => {
      const conn = byId.get(i.connection_id);
      return {
        id: i.remote_id,
        number: i.number,
        issuedOn: dayText(i.issued_on),
        dueOn: dayText(i.due_on),
        currency: i.currency ?? fallback,
        total: Number(i.total),
        balance: Number(i.balance),
        status: i.status,
        provider: conn?.provider ?? null,
        url: conn ? recordUrl(conn.provider, (conn.config ?? {}) as Record<string, string>, 'invoices', i.remote_id) : null,
      };
    });
  const used = [...new Set(data.links.map((l) => l.connection_id))].map((cid) => byId.get(cid)).filter((x): x is ConnRow => !!x);
  return c.json({
    finance: {
      linked: true,
      summary,
      invoices,
      sources: used.map((x) => ({ provider: x.provider, label: x.label, syncedAt: iso(x.last_ok_at) })),
    },
  });
});

// ------------------------------------------------------------ the review list

async function accountingConnection(c: C) {
  requirePerm(c, 'connections.manage');
  const id = param(c, 'id');
  const [row] = await c.get('deps').db.system((q) => q.query(`select id, provider, label, config from connections where id = $1 and org_id = $2 and kind = 'source'`, [id, c.get('org').id]));
  if (!row || !isAccounting(row.provider)) fail('not_found');
  return row as { id: string; provider: string; label: string; config: Record<string, unknown> };
}

/** The review list: accounting customers matched, or not, to Curahold customers. Needs connections.manage. */
financeRoutes.get('/connections/:id/finance/matches', async (c) => {
  const conn = await accountingConnection(c);
  const show = c.req.query('show') === 'all' ? 'all' : c.req.query('show') === 'matched' ? 'matched' : 'review';
  const where = show === 'review' ? `and f.account_id is null and f.match_state <> 'ignored'` : show === 'matched' ? 'and f.account_id is not null' : '';
  const out = await run(c, async (q) => {
    const rows = await q.query(
      `select f.remote_id, f.name, f.tax_id, f.email, f.website, f.currency, f.balance, f.account_id, f.match_state, f.match_reason, f.candidates, a.name as account_name,
              (select coalesce(sum(i.balance), 0) from finance_invoices i where i.connection_id = f.connection_id and i.customer_id = f.remote_id and i.status = 'open') as open
         from finance_customers f left join accounts a on a.id = f.account_id
        where f.connection_id = $1 ${where}
        order by f.account_id is not null, open desc, f.name limit 500`,
      [conn.id],
    );
    const ids = [...new Set(rows.flatMap((r) => r.candidates ?? []))];
    const names = ids.length ? await q.query<{ id: string; name: string }>('select id, name from accounts where id = any ($1::uuid[])', [ids]) : [];
    const [counts] = await q.query(
      `select count(*)::int as total, count(*) filter (where account_id is not null)::int as matched,
              count(*) filter (where account_id is null and match_state <> 'ignored')::int as review, count(*) filter (where match_state = 'ignored')::int as ignored
         from finance_customers where connection_id = $1`,
      [conn.id],
    );
    return { rows, names: new Map(names.map((n) => [n.id, n.name])), counts };
  });
  return c.json({
    counts: out.counts,
    customers: out.rows.map((r) => ({
      remoteId: r.remote_id,
      name: r.name,
      taxId: r.tax_id,
      email: r.email,
      website: r.website,
      currency: r.currency,
      balance: num(r.balance),
      open: num(r.open),
      account: r.account_id ? { id: r.account_id, name: r.account_name } : null,
      state: r.match_state,
      reason: r.match_reason,
      candidates: (r.candidates ?? []).map((id: string) => ({ id, name: out.names.get(id) ?? '' })).filter((x: { name: string }) => x.name),
    })),
  });
});

/** Matches (or unmatches) one accounting customer to a Curahold customer by hand. Needs connections.manage. */
financeRoutes.put('/connections/:id/finance/matches/:remoteId', async (c) => {
  const conn = await accountingConnection(c);
  // The program's own id, not a uuid.
  const remoteId = decodeURIComponent(c.req.param('remoteId') ?? '');
  if (!remoteId || remoteId.length > 200) fail('not_found');
  const input = await body(c, z.object({ accountId: z.string().uuid().nullable(), ignore: z.boolean().optional() }));
  const org = c.get('org');
  const auth = c.get('auth');
  await run(c, async (q) => {
    if (input.accountId) {
      const [a] = await q.query('select id from accounts where id = $1 and archived_at is null', [input.accountId]);
      if (!a) fail('not_found');
    }
    const state = input.accountId ? 'manual' : input.ignore ? 'ignored' : 'none';
    const rows = await q.query(
      `update finance_customers set account_id = $3, match_state = $4, match_reason = null, candidates = '{}'
        where connection_id = $1 and remote_id = $2 returning remote_id`,
      [conn.id, remoteId, input.accountId, state],
    );
    if (!rows.length) fail('not_found');
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'finance.match_changed', entity: 'connection', entityId: conn.id, meta: { remoteId, accountId: input.accountId, state } });
  });
  // Both the customer it now belongs to and the one it left are worked out again.
  await c.get('deps').db.system((q) =>
    q.query(`insert into health_dirty (org_id, account_id) select $1, a.id from accounts a where a.org_id = $1 and a.id = any ($2::uuid[]) on conflict do nothing`, [org.id, [input.accountId].filter(Boolean)]),
  );
  return c.json({ ok: true });
});

// ------------------------------------------------------------ a file

const MAX_ROWS = 2000;

/**
 * Takes in an accounting file for programs without an open API ('finfile' connections only). Matches made by hand
 * survive a new file. Needs connections.manage.
 */
financeRoutes.post('/connections/:id/finance/import', async (c) => {
  const conn = await accountingConnection(c);
  if (conn.provider !== 'finfile') fail('not_found');
  const input = await body(
    c,
    z.object({
      kind: z.enum(['customers', 'invoices', 'payments']),
      rows: z.array(z.record(z.string().max(40), z.union([z.string().max(500), z.number(), z.null()]))).max(MAX_ROWS),
      /** The first part of a file: what this kind held before is replaced. */
      replace: z.boolean().optional(),
      /** The last part of the file: match and count. */
      last: z.boolean().optional(),
    }),
  );
  const kind = input.kind as FinKind;
  const known = new Set(FILE_COLUMNS[kind]);
  const rows = input.rows
    .map((r) => fileRow(kind, Object.fromEntries(Object.entries(r).filter(([k]) => known.has(k)))))
    .filter((r): r is FinRow => !!r);
  const skipped = input.rows.length - rows.length;
  const deps = c.get('deps');
  const org = c.get('org');
  const auth = c.get('auth');
  const st = emptyStats();
  let matched = 0;
  await deps.db.system(async (q) => {
    if (input.replace) {
      const table = kind === 'customers' ? 'finance_customers' : kind === 'invoices' ? 'finance_invoices' : 'finance_payments';
      // Matches made by hand survive a new file of the same customers.
      const keep = kind === 'customers' ? await q.query(`select remote_id, account_id, match_state from finance_customers where org_id = $1 and connection_id = $2 and match_state in ('manual', 'ignored')`, [org.id, conn.id]) : [];
      await q.query(`delete from ${table} where org_id = $1 and connection_id = $2`, [org.id, conn.id]);
      await applyFinance(q, org.id, conn.id, kind, rows, st, nowOf(deps));
      if (keep.length) {
        await q.query(
          `update finance_customers f set account_id = k.account_id, match_state = k.match_state
             from jsonb_to_recordset($3::jsonb) as k(remote_id text, account_id uuid, match_state text)
            where f.org_id = $1 and f.connection_id = $2 and f.remote_id = k.remote_id`,
          [org.id, conn.id, JSON.stringify(keep)],
        );
      }
    } else await applyFinance(q, org.id, conn.id, kind, rows, st, nowOf(deps));
    if (input.last) {
      matched = await autoMatch(q, org.id, conn.id);
      await q.query(`insert into health_dirty (org_id, account_id) select distinct org_id, account_id from finance_customers where org_id = $1 and connection_id = $2 and account_id is not null on conflict do nothing`, [org.id, conn.id]);
      const at = nowOf(deps).toISOString();
      await q.query(
        `update connections set config = jsonb_set(config, '{sync,startedAt}', coalesce(config->'sync'->'startedAt', to_jsonb($3::text)), true),
                state = state || jsonb_build_object('lastRun', jsonb_build_object('status', 'ok', 'at', $3::text, 'more', false, 'stats', '{}'::jsonb)),
                status = 'active', last_error = null, last_ok_at = now(), updated_at = now()
          where id = $1 and org_id = $2`,
        [conn.id, org.id, at],
      );
      await audit(q, { orgId: org.id, actorId: auth.userId, action: 'finance.imported', entity: 'connection', entityId: conn.id, meta: { kind } });
    }
  });
  return c.json({ added: st.created, changed: st.updated, skipped, matched });
});
