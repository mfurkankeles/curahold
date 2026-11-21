// The yearly renewal notice the terms (§5) and the refund policy promise
// (api/src/billing/renewalNotice.ts): queued through the outbox once per
// administrator and period, only for active yearly plans inside the window,
// delivered by e-mail even to someone who muted notifications, and never sent
// twice however often the job runs.
import { beforeAll, describe, expect, it } from 'vitest';
import type { Deps } from '../api/src/context';
import { NOTICE_MARGIN_DAYS, queueRenewalNotices, renewalNoticeDaysOf, RENEWAL_NOTICE_DEFAULT_DAYS } from '../api/src/billing/renewalNotice';
import { deliverPending } from '../api/src/lib/notify';
import { setup, type Env } from './helpers';

const BILLING = {
  provider: 'paddle' as const,
  env: 'sandbox' as const,
  apiKey: 'test-key',
  webhookSecret: 'test-secret',
  clientToken: 'test-token',
  prices: { team: { month: 'pri_tm', year: 'pri_ty' }, business: { month: 'pri_bm', year: 'pri_by' } },
  renewalNoticeDays: 30,
};
const DAY = 86_400_000;

let env: Env;
let deps: Deps;
beforeAll(async () => {
  env = await setup({ billing: BILLING });
  deps = env.deps as unknown as Deps;
}, 60_000);

async function subscribe(orgId: string, s: { interval: 'month' | 'year'; endsInDays: number; cancel?: boolean; status?: string }, now: Date) {
  await env.db.system((q) =>
    q.query(
      `insert into subscriptions (org_id, plan, status, billing_interval, seats, current_period_end, cancel_at_period_end)
       values ($1, 'business', $2, $3, 12, $4, $5)
       on conflict (org_id) do update set plan = excluded.plan, status = excluded.status, billing_interval = excluded.billing_interval,
         seats = excluded.seats, current_period_end = excluded.current_period_end, cancel_at_period_end = excluded.cancel_at_period_end`,
      [orgId, s.status ?? 'active', s.interval, new Date(now.getTime() + s.endsInDays * DAY).toISOString(), !!s.cancel],
    ),
  );
}

const admins = (orgId: string) =>
  env.db.system((q) =>
    q.query<{ id: string; email: string }>(
      `select u.id, u.email from users u join roles r on r.id = u.role_id where u.org_id = $1 and u.status = 'active' and 'org.manage' = any(r.perms)`,
      [orgId],
    ),
  );
const queued = (orgId: string) =>
  env.db.system((q) => q.query<{ n: number }>(`select count(*)::int as n from notifications where org_id = $1 and kind = 'renewal_notice'`, [orgId])).then((r) => r[0].n);

describe('the yearly renewal notice', () => {
  it('reads the window from the operator setting, within 7–90 days', () => {
    expect(RENEWAL_NOTICE_DEFAULT_DAYS).toBe(30);
    expect(renewalNoticeDaysOf(undefined)).toBe(30);
    expect(renewalNoticeDaysOf('abc')).toBe(30);
    expect(renewalNoticeDaysOf('45')).toBe(45);
    expect(renewalNoticeDaysOf('3')).toBe(7);
    expect(renewalNoticeDaysOf('500')).toBe(90);
  });

  it('is queued once per administrator and period, and goes by e-mail even to someone who muted everything', async () => {
    const now = new Date();
    const orgId = env.a.orgId;
    await subscribe(orgId, { interval: 'year', endsInDays: 20 }, now);
    const people = await admins(orgId);
    expect(people.length).toBeGreaterThan(0);
    // One administrator turned every notification off: a contractual notice still reaches them.
    await env.db.system((q) => q.query(`update users set prefs = coalesce(prefs, '{}'::jsonb) || '{"channel":"none"}'::jsonb where id = $1 and org_id = $2`, [people[0].id, orgId]));

    expect(await queueRenewalNotices(deps, now)).toBe(people.length);
    expect(await queueRenewalNotices(deps, now)).toBe(0);
    expect(await queued(orgId)).toBe(people.length);

    const before = env.email.sent.length;
    await deliverPending(deps, 100);
    const mails = env.email.sent.slice(before);
    for (const p of people) {
      const m = mails.find((x) => x.to === p.email);
      expect(m, p.email).toBeTruthy();
      expect(m!.text).toContain('/settings/billing');
      expect(m!.text).toContain('Business');
    }
    // Delivered once: another delivery run sends nothing more.
    const after = env.email.sent.length;
    await deliverPending(deps, 100);
    expect(env.email.sent.length).toBe(after);
  });

  it('skips monthly plans, plans already set to end, plans outside the window and inactive ones', async () => {
    const now = new Date();
    const orgId = env.b.orgId;
    for (const s of [
      { interval: 'month' as const, endsInDays: 10 },
      { interval: 'year' as const, endsInDays: 10, cancel: true },
      { interval: 'year' as const, endsInDays: 40 },
      { interval: 'year' as const, endsInDays: 10, status: 'past_due' },
      { interval: 'year' as const, endsInDays: -1 },
    ]) {
      await subscribe(orgId, s, now);
      expect(await queueRenewalNotices(deps, now), JSON.stringify(s)).toBe(0);
    }
    expect(await queued(orgId)).toBe(0);
    // The same plan, now inside the window: the notice comes.
    await subscribe(orgId, { interval: 'year', endsInDays: 29 }, now);
    expect(await queueRenewalNotices(deps, now)).toBe((await admins(orgId)).length);
  });

  it('arrives at least the promised days before renewal: queued with a margin, never at N days or fewer', async () => {
    const now = new Date();
    const orgId = env.b.orgId;
    const n = await admins(orgId);
    expect(NOTICE_MARGIN_DAYS).toBeGreaterThanOrEqual(1);
    // Just outside window + margin: not yet.
    await subscribe(orgId, { interval: 'year', endsInDays: 30 + NOTICE_MARGIN_DAYS + 0.05 }, now);
    expect(await queueRenewalNotices(deps, now)).toBe(0);
    // Window + margin exactly, and an hour past the promised 30 days: queued in both cases. The hourly job
    // first sees a plan at about 32 days out, so the reader gets more than 30 whole days.
    for (const endsInDays of [30 + NOTICE_MARGIN_DAYS, 30 + 1 / 24]) {
      await env.db.system((q) => q.query(`delete from notifications where org_id = $1 and kind = 'renewal_notice'`, [orgId]));
      await subscribe(orgId, { interval: 'year', endsInDays }, now);
      expect(await queueRenewalNotices(deps, now), String(endsInDays)).toBe(n.length);
    }
  });

  it('a new year is a new notice', async () => {
    const now = new Date();
    const orgId = env.a.orgId;
    const next = new Date(now.getTime() + 365 * DAY);
    await subscribe(orgId, { interval: 'year', endsInDays: 385 }, now);
    expect(await queueRenewalNotices(deps, next)).toBe((await admins(orgId)).length);
  });

  it('does nothing while billing is off', async () => {
    const off = { ...deps, config: { ...deps.config, billing: undefined } } as Deps;
    await subscribe(env.a.orgId, { interval: 'year', endsInDays: 5 }, new Date());
    expect(await queueRenewalNotices(off, new Date())).toBe(0);
  });
});
