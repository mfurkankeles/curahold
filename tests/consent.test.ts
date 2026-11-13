// Wave-4C consent: the gating logic (nothing loads before an explicit opt-in,
// analytics vs marketing categories, reject keeps everything off), the pure
// analytics decision, and the consent_log record's row-level security (a person
// records and sees only their own consent; one company never sees another's).
import { beforeAll, describe, expect, it } from 'vitest';
import {
  acceptAll,
  allows,
  chooseConsent,
  defaultConsent,
  parseConsent,
  rejectAll,
  serializeConsent,
} from '../web/src/lib/consent';
import { plannedLoads } from '../web/src/lib/analytics';
import { setup, type Env } from './helpers';

describe('consent state', () => {
  it('defaults to nothing non-essential, undecided', () => {
    const s = defaultConsent();
    expect(s).toEqual({ analytics: false, marketing: false, decided: false, at: '' });
  });

  it('allows necessary always, but nothing else until a choice is made', () => {
    const s = defaultConsent();
    expect(allows(s, 'necessary')).toBe(true);
    expect(allows(s, 'analytics')).toBe(false);
    expect(allows(s, 'marketing')).toBe(false);
  });

  it('accept-all grants both categories and records the choice', () => {
    const s = acceptAll('2026-01-01T00:00:00.000Z');
    expect(s.decided).toBe(true);
    expect(s.at).toBe('2026-01-01T00:00:00.000Z');
    expect(allows(s, 'analytics')).toBe(true);
    expect(allows(s, 'marketing')).toBe(true);
  });

  it('reject keeps tracking off but is still a recorded decision', () => {
    const s = rejectAll();
    expect(s.decided).toBe(true);
    expect(s.at).not.toBe('');
    expect(allows(s, 'analytics')).toBe(false);
    expect(allows(s, 'marketing')).toBe(false);
    expect(allows(s, 'necessary')).toBe(true);
  });

  it('keeps the two categories independent', () => {
    const onlyAnalytics = chooseConsent({ analytics: true, marketing: false });
    expect(allows(onlyAnalytics, 'analytics')).toBe(true);
    expect(allows(onlyAnalytics, 'marketing')).toBe(false);
    const onlyMarketing = chooseConsent({ analytics: false, marketing: true });
    expect(allows(onlyMarketing, 'analytics')).toBe(false);
    expect(allows(onlyMarketing, 'marketing')).toBe(true);
  });

  it('parses missing, broken and partial stored values safely', () => {
    expect(parseConsent(null)).toEqual(defaultConsent());
    expect(parseConsent('not json')).toEqual(defaultConsent());
    expect(parseConsent('"a string"')).toEqual(defaultConsent());
    expect(parseConsent('{"analytics":true}')).toEqual({ analytics: true, marketing: false, decided: false, at: '' });
    const s = acceptAll('2026-02-02T00:00:00.000Z');
    expect(parseConsent(serializeConsent(s))).toEqual(s);
  });
});

describe('analytics gating', () => {
  const ids = { ga4: 'G-TEST', meta: '100000000000000', tiktok: 'CABCDEF0123456789' };

  it('loads nothing before an explicit opt-in, even with every id set', () => {
    expect(plannedLoads(defaultConsent(), ids)).toEqual({ ga4: false, meta: false, tiktok: false });
  });

  it('reject keeps every tracker off', () => {
    expect(plannedLoads(rejectAll(), ids)).toEqual({ ga4: false, meta: false, tiktok: false });
  });

  it('analytics consent loads GA4 only; marketing loads the Meta and TikTok pixels', () => {
    expect(plannedLoads(chooseConsent({ analytics: true, marketing: false }), ids)).toEqual({
      ga4: true,
      meta: false,
      tiktok: false,
    });
    expect(plannedLoads(chooseConsent({ analytics: false, marketing: true }), ids)).toEqual({
      ga4: false,
      meta: true,
      tiktok: true,
    });
  });

  it('is a no-op for any id that is unset, even with consent', () => {
    expect(plannedLoads(acceptAll(), {})).toEqual({ ga4: false, meta: false, tiktok: false });
    expect(plannedLoads(acceptAll(), { ga4: 'G-ONLY' })).toEqual({ ga4: true, meta: false, tiktok: false });
  });
});

describe('consent_log record', () => {
  let env: Env;
  beforeAll(async () => {
    env = await setup();
  });

  const insert = (orgId: string, userId: string, analytics: boolean, marketing: boolean) =>
    env.db.tenant({ orgId, userId }, (q) =>
      q.query(
        `insert into consent_log (org_id, user_id, analytics, marketing, source, user_agent)
         values ($1, $2, $3, $4, 'app', $5) returning analytics, marketing, source, created_at`,
        [orgId, userId, analytics, marketing, 'test-agent'],
      ),
    );
  const readOwn = (orgId: string, userId: string) =>
    env.db.tenant({ orgId, userId }, (q) =>
      q.query('select analytics, marketing from consent_log where user_id = $1 order by created_at desc', [userId]),
    );

  it('records a choice and reads it back for the same person', async () => {
    const [row] = await insert(env.a.orgId, env.a.ids.zeynep, true, false);
    expect(row.analytics).toBe(true);
    expect(row.marketing).toBe(false);
    expect(row.source).toBe('app');
    const own = await readOwn(env.a.orgId, env.a.ids.zeynep);
    expect(own.length).toBeGreaterThanOrEqual(1);
    expect(own[0]).toMatchObject({ analytics: true, marketing: false });
  });

  it('is append-only history: a changed choice is a new row', async () => {
    await insert(env.a.orgId, env.a.ids.zeynep, true, true);
    const own = await readOwn(env.a.orgId, env.a.ids.zeynep);
    expect(own.length).toBeGreaterThanOrEqual(2);
    // Newest first, so the latest choice leads.
    expect(own[0]).toMatchObject({ analytics: true, marketing: true });
  });

  it('lets a viewer record their own consent (no write seat required)', async () => {
    const [row] = await insert(env.a.orgId, env.a.ids.sofia, true, false);
    expect(row.analytics).toBe(true);
  });

  it('shows a person only their own consent, never a colleague’s', async () => {
    await insert(env.a.orgId, env.a.ids.ada, false, true);
    const ada = await readOwn(env.a.orgId, env.a.ids.ada);
    expect(ada.every((r) => r.marketing === true)).toBe(true);
    // Zeynep cannot see Ada's rows — the select policy is user-scoped.
    const asZeynep = await env.db.tenant({ orgId: env.a.orgId, userId: env.a.ids.zeynep }, (q) =>
      q.query('select count(*)::int as n from consent_log where user_id = $1', [env.a.ids.ada]),
    );
    expect(asZeynep[0].n).toBe(0);
  });

  it('keeps one company’s consent invisible to another (org isolation)', async () => {
    await insert(env.a.orgId, env.a.ids.zeynep, true, true);
    // From company B, nothing of company A is visible, whatever user id is asked for.
    const fromB = await env.db.tenant({ orgId: env.b.orgId, userId: env.b.ids.zeynep }, (q) =>
      q.query('select count(*)::int as n from consent_log', []),
    );
    const aZeynepFromB = await env.db.tenant({ orgId: env.b.orgId, userId: env.b.ids.zeynep }, (q) =>
      q.query('select count(*)::int as n from consent_log where user_id = $1', [env.a.ids.zeynep]),
    );
    expect(aZeynepFromB[0].n).toBe(0);
    // Company B only ever counts its own rows (zero or more), never company A's.
    expect(fromB[0].n).toBe(0);
  });

  it('refuses to record consent on behalf of another person', async () => {
    await expect(
      env.db.tenant({ orgId: env.a.orgId, userId: env.a.ids.zeynep }, (q) =>
        q.query(
          `insert into consent_log (org_id, user_id, analytics, marketing) values ($1, $2, true, true)`,
          [env.a.orgId, env.a.ids.ada],
        ),
      ),
    ).rejects.toThrow();
  });
});
