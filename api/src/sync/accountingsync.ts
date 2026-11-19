// The accounting branch of a sync run. An accounting adapter (Zoho Books, Xero,
// Odoo, freee, Paraşüt, QuickBooks Online) does not map objects: its
// customers, invoices and payments are copied into finance_customers,
// finance_invoices and finance_payments, then each accounting customer not yet
// matched is matched to a Curahold customer when exactly one fits (tax number,
// web domain, name). Nothing is written back, ever.
//
// Requests are paced below the program's own per-minute limit and counted
// against its daily allowance; a rate-limit answer, the daily allowance or the
// run's time budget stop the run with its place saved, and the next run carries
// on from there. Runs with owner access, naming the company on every statement.
import { FIN_KINDS, matcher, type FinCustomer, type FinInvoice, type FinKind, type FinPayment, type FinRow, type MatchTarget } from '../../../shared/src/accounting';
import type { AccountField } from '../../../shared/src/model';
import { emptyStats, type SyncStats } from '../../../shared/src/sync';
import type { Deps } from '../context';
import type { Q } from '../db';
import type { LoadedCrm } from './engine';
import { CrmError, type CrmAdapter, type CrmCtx } from './adapters/types';

interface KindState {
  /** Read changes from here next time (ISO). */
  at?: string | null;
  /** A read that stopped half-way. */
  page?: { cursor: string | null; since: string | null; startedAt: string; maxSeen: string | null };
}

interface FinState {
  kinds?: Partial<Record<FinKind, KindState>>;
  /** Requests made today (UTC), against the program's daily allowance. */
  calls?: { day: string; n: number };
}

/** Stops a run when the day's allowance is used up. */
class Allowance extends Error {}

const TAX_FIELD = /^(tax|vat|vkn|tckn|tin|trn|gst|ein|abn|uen|crn|cr_number|corporate_number|houjin|vergi)/i;
const WEB_FIELD = /(web|site|domain|url|email|mail)/i;

/** The customers to match against, with their tax numbers and web addresses taken from the fields that hold them. */
export async function matchTargets(q: Q, orgId: string): Promise<MatchTarget[]> {
  const [org] = await q.query('select account_fields from orgs where id = $1', [orgId]);
  const defs = (org?.account_fields ?? []) as AccountField[];
  const taxKeys = defs.filter((f) => TAX_FIELD.test(f.key) && (f.type === 'text' || f.type === 'number')).map((f) => f.key);
  const webKeys = defs.filter((f) => f.type === 'url' || f.type === 'email' || (f.type === 'text' && WEB_FIELD.test(f.key))).map((f) => f.key);
  const rows = await q.query<{ id: string; name: string; fields: Record<string, unknown> }>(`select id, name, fields from accounts where org_id = $1 and archived_at is null`, [orgId]);
  const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    taxIds: taxKeys.map((k) => str(r.fields?.[k])).filter(Boolean),
    webs: webKeys.map((k) => str(r.fields?.[k])).filter(Boolean),
  }));
}

/** Matches the accounting customers that have no Curahold customer yet (a removed one included). Returns how many were matched. */
export async function autoMatch(q: Q, orgId: string, connectionId: string): Promise<number> {
  const open = await q.query<{ remote_id: string; name: string; tax_id: string | null; email: string | null; website: string | null }>(
    `select remote_id, name, tax_id, email, website from finance_customers
      where org_id = $1 and connection_id = $2 and account_id is null and match_state <> 'ignored'`,
    [orgId, connectionId],
  );
  if (!open.length) return 0;
  const match = matcher(await matchTargets(q, orgId));
  const out = open.map((c) => {
    const m = match({ name: c.name, taxId: c.tax_id, email: c.email, website: c.website });
    return { remote_id: c.remote_id, account_id: m.accountId, match_state: m.accountId ? 'auto' : 'none', match_reason: m.reason, candidates: m.candidates };
  });
  await q.query(
    `update finance_customers f set account_id = x.account_id, match_state = x.match_state, match_reason = x.match_reason,
            candidates = coalesce((select array_agg(c::uuid) from jsonb_array_elements_text(x.candidates) c), '{}')
       from jsonb_to_recordset($3::jsonb) as x(remote_id text, account_id uuid, match_state text, match_reason text, candidates jsonb)
      where f.org_id = $1 and f.connection_id = $2 and f.remote_id = x.remote_id`,
    [orgId, connectionId, JSON.stringify(out)],
  );
  return out.filter((x) => x.account_id).length;
}

const s200 = (v: string | null | undefined, n = 200) => (v ? String(v).slice(0, n) : null);

/** Writes one page of rows, idempotently (the program's id is the key). Returns how many were new and how many changed. */
export async function applyFinance(q: Q, orgId: string, connectionId: string, kind: FinKind, rows: FinRow[], st: SyncStats, at: Date): Promise<void> {
  const list = rows.filter((r) => r.remoteId);
  if (!list.length) return;
  let sql: string;
  let data: Record<string, unknown>[];
  if (kind === 'customers') {
    data = (list as FinCustomer[]).map((c) => ({ remote_id: s200(c.remoteId), name: s200(c.name, 300) ?? '', tax_id: s200(c.taxId, 60), email: s200(c.email, 320), website: s200(c.website, 500), currency: c.currency, balance: c.balance, modified_at: c.modifiedAt }));
    sql = `insert into finance_customers (org_id, connection_id, remote_id, name, tax_id, email, website, currency, balance, modified_at, synced_at)
           select $1, $2, x.remote_id, x.name, x.tax_id, x.email, x.website, x.currency, x.balance, x.modified_at, $4::timestamptz
             from jsonb_to_recordset($3::jsonb) as x(remote_id text, name text, tax_id text, email text, website text, currency text, balance numeric, modified_at timestamptz)
           on conflict (connection_id, remote_id) do update set name = excluded.name, tax_id = excluded.tax_id, email = excluded.email, website = excluded.website,
              currency = excluded.currency, balance = excluded.balance, modified_at = excluded.modified_at, synced_at = excluded.synced_at
           returning (xmax = 0) as fresh`;
  } else if (kind === 'invoices') {
    data = (list as FinInvoice[]).map((i) => ({ remote_id: s200(i.remoteId), customer_id: s200(i.customerId), number: s200(i.number, 100), issued_on: i.issuedOn, due_on: i.dueOn, currency: i.currency, total: i.total, balance: i.balance, status: i.status, modified_at: i.modifiedAt }));
    sql = `insert into finance_invoices (org_id, connection_id, remote_id, customer_id, number, issued_on, due_on, currency, total, balance, status, modified_at, synced_at)
           select $1, $2, x.remote_id, x.customer_id, x.number, x.issued_on, x.due_on, x.currency, x.total, x.balance, x.status, x.modified_at, $4::timestamptz
             from jsonb_to_recordset($3::jsonb) as x(remote_id text, customer_id text, number text, issued_on date, due_on date, currency text, total numeric, balance numeric, status text, modified_at timestamptz)
           on conflict (connection_id, remote_id) do update set customer_id = excluded.customer_id, number = excluded.number, issued_on = excluded.issued_on,
              due_on = excluded.due_on, currency = excluded.currency, total = excluded.total, balance = excluded.balance, status = excluded.status,
              modified_at = excluded.modified_at, synced_at = excluded.synced_at
           returning (xmax = 0) as fresh`;
  } else {
    data = (list as FinPayment[]).map((p) => ({ remote_id: s200(p.remoteId), customer_id: s200(p.customerId), invoice_id: s200(p.invoiceId), paid_on: p.paidOn, amount: p.amount, currency: p.currency, modified_at: p.modifiedAt }));
    sql = `insert into finance_payments (org_id, connection_id, remote_id, customer_id, invoice_id, paid_on, amount, currency, modified_at, synced_at)
           select $1, $2, x.remote_id, x.customer_id, x.invoice_id, x.paid_on, x.amount, x.currency, x.modified_at, $4::timestamptz
             from jsonb_to_recordset($3::jsonb) as x(remote_id text, customer_id text, invoice_id text, paid_on date, amount numeric, currency text, modified_at timestamptz)
           on conflict (connection_id, remote_id) do update set customer_id = excluded.customer_id, invoice_id = excluded.invoice_id, paid_on = excluded.paid_on,
              amount = excluded.amount, currency = excluded.currency, modified_at = excluded.modified_at, synced_at = excluded.synced_at
           returning (xmax = 0) as fresh`;
  }
  // The same id twice in one page would make the statement fail: the later one wins.
  const once = [...new Map(data.map((d) => [d.remote_id, d])).values()];
  const res = await q.query<{ fresh: boolean }>(sql, [orgId, connectionId, JSON.stringify(once), at]);
  for (const r of res) r.fresh ? st.created++ : st.updated++;
}

/** After a full read: what the program no longer has is removed here too. */
async function dropMissing(q: Q, orgId: string, connectionId: string, kind: FinKind, startedAt: string, st: SyncStats) {
  const table = kind === 'customers' ? 'finance_customers' : kind === 'invoices' ? 'finance_invoices' : 'finance_payments';
  const gone = await q.query(`delete from ${table} where org_id = $1 and connection_id = $2 and synced_at < $3 returning remote_id`, [orgId, connectionId, startedAt]);
  st.archived += gone.length;
}

/** The customers whose figures may have changed: their score is worked out again. */
async function markHealth(q: Q, orgId: string, connectionId: string) {
  await q.query(
    `insert into health_dirty (org_id, account_id)
     select distinct org_id, account_id from finance_customers where org_id = $1 and connection_id = $2 and account_id is not null
     on conflict do nothing`,
    [orgId, connectionId],
  );
}

const utcDay = (d: Date) => d.toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The adapter's requests, paced: at most `perMinute` a minute (a gap between requests; none in tests, where
 * request limits are off) and at most `perDay` a day, counted in `fin.calls`.
 */
export function pacedCtx(ctx: CrmCtx, limits: NonNullable<CrmAdapter['accounting']>, fin: FinState, scale: number, now: () => Date): CrmCtx {
  const gap = scale > 0 ? Math.ceil((60_000 / Math.max(1, limits.perMinute)) * scale) : 0;
  let last = 0;
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const today = utcDay(now());
    if (fin.calls?.day !== today) fin.calls = { day: today, n: 0 };
    if (limits.perDay && fin.calls.n >= limits.perDay) throw new Allowance();
    const wait = last + gap - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    fin.calls.n++;
    return ctx.fetch(input, init);
  }) as typeof fetch;
  return { ...ctx, fetch: fetcher };
}

/**
 * Reads customers, invoices and payments, then matches. `stats` is the run's; `deadline` is when to stop and save the
 * place. Returns true when everything was read, false when the run stopped early (the next run carries on).
 */
export async function syncAccounting(deps: Deps, conn: LoadedCrm, adapter: CrmAdapter, ctx: CrmCtx, full: boolean, stats: Record<string, SyncStats>, deadline: number, errors: { object: string; message: string }[]): Promise<boolean> {
  if (!adapter.finance || !adapter.accounting) return true;
  // An uploaded file is read when it is uploaded; a run only matches what is new on Curahold's side.
  if (adapter.accounting.file) {
    const matched = await deps.db.system((q) => autoMatch(q, conn.orgId, conn.id));
    if (matched) (stats.matched ??= emptyStats()).updated += matched;
    return true;
  }
  const fin: FinState = { ...((conn.state.fin as FinState | undefined) ?? {}) };
  fin.kinds = { ...(fin.kinds ?? {}) };
  const now = () => ctx.now();
  const paced = pacedCtx(ctx, adapter.accounting, fin, deps.config.limitScale ?? 1, now);
  let finished = true;
  let changed = 0;
  try {
    const withInvoices = !!adapter.accounting.paymentsWithInvoices;
    for (const kind of FIN_KINDS) {
      if (kind === 'payments' && withInvoices) continue;
      const st = (stats[kind] ??= emptyStats());
      const ks: KindState = { ...(fin.kinds[kind] ?? {}) };
      const saved = ks.page;
      const since = saved ? saved.since : full ? null : (ks.at ?? null);
      const startedAt = saved?.startedAt ?? now().toISOString();
      let maxSeen = saved?.maxSeen ?? since;
      let cursor: string | null = saved?.cursor ?? null;
      let done = false;
      while (!done) {
        let page;
        try {
          page = await adapter.finance(paced, kind, { since, cursor });
        } catch (e) {
          if (e instanceof Allowance || (e instanceof CrmError && e.retryAfter !== undefined)) {
            // Over the program's limit: keep the place, carry on next run.
            fin.kinds[kind] = { ...ks, page: { cursor, since, startedAt, maxSeen } };
            errors.push({ object: kind, message: e instanceof Allowance ? 'Daily request allowance reached; the next run carries on.' : `Rate limited by the program (${e.message}); the next run carries on.` });
            finished = false;
            return false;
          }
          throw e;
        }
        await deps.db.system(async (q) => {
          await applyFinance(q, conn.orgId, conn.id, kind, page.rows, st, now());
          if (page.payments?.length) await applyFinance(q, conn.orgId, conn.id, 'payments', page.payments, (stats.payments ??= emptyStats()), now());
        });
        changed += page.rows.length;
        for (const r of page.rows) if (r.modifiedAt && (!maxSeen || r.modifiedAt > maxSeen)) maxSeen = r.modifiedAt;
        cursor = page.next;
        if (!cursor) done = true;
        else if (Date.now() > deadline) {
          fin.kinds[kind] = { ...ks, page: { cursor, since, startedAt, maxSeen } };
          finished = false;
          return false;
        }
      }
      // A full read that reached the end: what was not seen is gone there.
      if (since === null) {
        await deps.db.system(async (q) => {
          await dropMissing(q, conn.orgId, conn.id, kind, startedAt, st);
          if (kind === 'invoices' && withInvoices) await dropMissing(q, conn.orgId, conn.id, 'payments', startedAt, (stats.payments ??= emptyStats()));
        });
      }
      // Next time from the newest change seen, never past when this read began (the same cap the object pull uses).
      const begun = Date.parse(startedAt);
      fin.kinds[kind] = { at: maxSeen && Date.parse(maxSeen) < begun ? maxSeen : startedAt };
    }
    return true;
  } finally {
    conn.state = { ...conn.state, fin };
    // Whatever was read is matched and counted, even when the run stops early.
    if (changed || finished) {
      const matched = await deps.db.system(async (q) => {
        const n = await autoMatch(q, conn.orgId, conn.id);
        await markHealth(q, conn.orgId, conn.id);
        return n;
      });
      if (matched) (stats.matched ??= emptyStats()).updated += matched;
    }
  }
}
