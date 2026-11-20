// Operations watch, on free tiers only: every answer's status and time are
// counted in this isolate (Worker) or process (self-host), and when too many
// fail or the slow tail grows, an alert lands in the owner console's alerts
// (company_log, kind 'alert') — where the traffic alerts already go — and,
// once per alert, in the owner's mailbox and on his phones (Web Push, when set up). The hourly job adds one check across
// every isolate: the server errors recorded in error_log in the last hour.
//
// Per isolate means each Worker copy counts only what it served: a fault that
// hits every request still trips every copy; a rare one is caught by the hourly
// error_log check. Switch off with OPS_ALERTS=off.
import type { CompanyLogRow } from '../db/rows.gen';
import type { Deps } from '../context';
import { ownerWord, type OwnerKey } from '../../../shared/src/i18n/owner';
import { pushToOwner } from './ownerOutbox';

export const OPS_RULES = {
  /** The window counted, in ms. */
  windowMs: 5 * 60_000,
  /** At least this many answers in the window before a share means anything. */
  minRequests: 50,
  /** Share of 5xx answers that raises the error alert. */
  errorRate: 0.05,
  /** 95th percentile time (ms) that raises the latency alert. */
  p95Ms: 2000,
  /** Server errors in error_log within one hour, across every isolate. */
  errorLogPerHour: 20,
  /** Notifications waiting to go out for more than an hour. */
  stuckDeliveries: 200,
} as const;

export type OpsRule = 'errors' | 'latency' | 'error-log' | 'deliveries';
export interface OpsAlert {
  rule: OpsRule;
  ref: string;
  body: string;
  meta: Record<string, unknown>;
}

/** The 15-minute slot an alert belongs to: one alert per rule per slot. */
const slot = (now: number) => new Date(Math.floor(now / 900_000) * 900_000).toISOString().slice(0, 16);

/**
 * Counts answer times and failures in this isolate or process; when too many fail or the slow tail grows it raises an
 * alert in the owner console (and once by mail). Free-tier operations watch, no paid monitoring.
 */
export class OpsWatch {
  private samples: { at: number; ms: number; failed: boolean }[] = [];
  private fired = new Map<string, number>();
  constructor(private rules: { errorRate: number; p95Ms: number; minRequests: number; windowMs: number } = OPS_RULES) {}

  /** One answer: its status and how long it took. Returns an alert when a rule trips (once per rule per 15 minutes). */
  note(status: number, ms: number, now = Date.now()): OpsAlert | null {
    this.samples.push({ at: now, ms, failed: status >= 500 });
    const from = now - this.rules.windowMs;
    if (this.samples[0].at < from) this.samples = this.samples.filter((s) => s.at >= from);
    if (this.samples.length > 5000) this.samples.splice(0, this.samples.length - 5000);
    const n = this.samples.length;
    if (n < this.rules.minRequests) return null;
    const failed = this.samples.reduce((k, s) => k + (s.failed ? 1 : 0), 0);
    if (failed / n >= this.rules.errorRate) {
      const a = this.fire('errors', now, `Errors: ${failed} of ${n} answers failed (5xx) in the last 5 minutes`, { failed, total: n, rate: Math.round((failed / n) * 1000) / 10 });
      if (a) return a;
    }
    // The 95th percentile, only when the newest answer is itself slow (keeps the sort off the fast path).
    if (ms >= this.rules.p95Ms) {
      const sorted = this.samples.map((s) => s.ms).sort((a, b) => a - b);
      const p95 = sorted[Math.min(n - 1, Math.floor(n * 0.95))];
      if (p95 >= this.rules.p95Ms) return this.fire('latency', now, `Slow: 95% of answers took up to ${p95} ms in the last 5 minutes (limit ${this.rules.p95Ms} ms)`, { p95, total: n });
    }
    return null;
  }

  private fire(rule: OpsRule, now: number, body: string, meta: Record<string, unknown>): OpsAlert | null {
    const s = slot(now);
    if (this.fired.get(rule) === Number(new Date(s))) return null;
    this.fired.set(rule, Number(new Date(s)));
    return { rule, ref: `ops:${rule}:${s}`, body, meta };
  }
}

/** The one watch of this isolate or process. */
export const sharedOps = new OpsWatch();

/** Writes the alert to the console's alerts once (by ref) and tells the owner by e-mail; never throws. */
export async function raiseOpsAlert(deps: Deps, a: OpsAlert): Promise<boolean> {
  console.warn('[curahold] ops alert', JSON.stringify({ ref: a.ref, ...a.meta }));
  try {
    const rows = await deps.db.system((q) =>
      q.query<Pick<CompanyLogRow, 'id'>>(
        `insert into company_log (seat, kind, body, ref, meta)
         select 'system', 'alert', $1, $2, $3 where not exists (select 1 from company_log where ref = $2) returning id`,
        [a.body, a.ref, JSON.stringify(a.meta)],
      ),
    );
    if (!rows.length) return false;
    const to = deps.config.owner;
    if (to && deps.config.ops?.email !== false)
      await deps.email
        .send({ to, subject: ownerWord('tr', 'ops.mail.subject', { rule: a.rule }), text: ownerWord('tr', 'ops.mail.body', { body: a.body, ref: a.ref }) })
        .catch((e) => console.error('[curahold] ops alert mail failed', e instanceof Error ? e.message : String(e)));
    // And to the owner's phones, once per alert, when he added any (lib/ownerOutbox.ts; never throws).
    await pushToOwner(deps, `push:${a.ref}`, (l) => ({ title: ownerWord(l, 'ops.push.title'), body: ownerWord(l, `ops.rule.${a.rule}` as OwnerKey), url: '/system', urgency: 'high' }));
    return true;
  } catch (e) {
    console.error('[curahold] ops alert not stored', e instanceof Error ? e.message : String(e));
    return false;
  }
}

/** The hourly check across every isolate: server errors recorded, and deliveries stuck. */
export async function opsHourlyCheck(deps: Deps, now: Date): Promise<OpsAlert[]> {
  if (deps.config.ops?.alerts === false) return [];
  const hour = now.toISOString().slice(0, 13);
  // Across every company on purpose (the installation's health); how many companies is part of the alert.
  const [e] = await deps.db.system((q) =>
    q.query<{ n: number; orgs: number }>(`select count(*)::int as n, count(distinct org_id)::int as orgs from error_log where source = 'server' and at > $1::timestamptz - interval '1 hour'`, [now.toISOString()]),
  );
  const [d] = await deps.db.system((q) =>
    q.query<{ n: number; orgs: number }>(
      `select count(*)::int as n, count(distinct org_id)::int as orgs from notifications where state = 'pending' and created_at < $1::timestamptz - interval '1 hour' and created_at > $1::timestamptz - interval '2 days'`,
      [now.toISOString()],
    ),
  );
  const out: OpsAlert[] = [];
  if (Number(e?.n) >= OPS_RULES.errorLogPerHour) out.push({ rule: 'error-log', ref: `ops:error-log:${hour}`, body: `Errors: ${e.n} server errors recorded in the last hour`, meta: { count: Number(e.n), companies: Number(e.orgs) } });
  if (Number(d?.n) >= OPS_RULES.stuckDeliveries) out.push({ rule: 'deliveries', ref: `ops:deliveries:${hour}`, body: `Deliveries: ${d.n} notifications waiting for more than an hour`, meta: { count: Number(d.n), companies: Number(d.orgs) } });
  for (const a of out) await raiseOpsAlert(deps, a);
  return out;
}

/** What /api/health/ready answers: the database reached and how fast. */
export async function readiness(deps: Pick<Deps, 'db'>): Promise<{ ok: boolean; db: { ok: boolean; ms: number }; at: string }> {
  const t0 = Date.now();
  let ok = true;
  try {
    await deps.db.system((q) => q.query('select 1 as one'));
  } catch {
    ok = false;
  }
  return { ok, db: { ok, ms: Date.now() - t0 }, at: new Date().toISOString() };
}
