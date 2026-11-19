// Consent: the shared library's gating logic (nothing optional before an explicit
// opt-in, analytics vs marketing, the advertising pixels off by configuration,
// re-ask on a new policy version or after a year), and the consent_log record's
// row-level security (a person records and sees only their own consent).
// The static pages' bundle and the evidence tables: tests/compliance.test.ts.
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
import { hasMeasurement, plannedLoads } from '../web/src/lib/analytics';
import { CONSENT_MAX_AGE_DAYS, CONSENT_POLICY_VERSION, actionOf, consentModeDefault, consentModeFor, categoriesInUse } from '../shared/src/consent/core';
import { setup, type Env } from './helpers';

describe('consent state', () => {
  it('defaults to nothing non-essential, undecided', () => {
    expect(defaultConsent()).toEqual({ analytics: false, marketing: false, decided: false, at: '', policy: '', id: '' });
  });

  it('allows necessary always, but nothing else until a choice is made', () => {
    const s = defaultConsent();
    expect(allows(s, 'necessary')).toBe(true);
    expect(allows(s, 'analytics')).toBe(false);
    expect(allows(s, 'marketing')).toBe(false);
  });

  it('accept-all grants both, under the current policy version, with an anonymous id', () => {
    const s = acceptAll('2026-01-01T00:00:00.000Z');
    expect(s).toMatchObject({ decided: true, at: '2026-01-01T00:00:00.000Z', policy: CONSENT_POLICY_VERSION });
    expect(s.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(allows(s, 'analytics') && allows(s, 'marketing')).toBe(true);
  });

  it('reject keeps tracking off but is still a recorded decision, and keeps the id', () => {
    const first = acceptAll();
    const s = rejectAll(undefined, first);
    expect(s.decided).toBe(true);
    expect(s.id).toBe(first.id);
    expect(allows(s, 'analytics') || allows(s, 'marketing')).toBe(false);
    expect(allows(s, 'necessary')).toBe(true);
  });

  it('keeps the two categories independent', () => {
    const onlyAnalytics = chooseConsent({ analytics: true, marketing: false });
    expect([allows(onlyAnalytics, 'analytics'), allows(onlyAnalytics, 'marketing')]).toEqual([true, false]);
    const onlyMarketing = chooseConsent({ analytics: false, marketing: true });
    expect([allows(onlyMarketing, 'analytics'), allows(onlyMarketing, 'marketing')]).toEqual([false, true]);
  });

  it('parses missing, broken and partial stored values safely', () => {
    expect(parseConsent(null)).toEqual(defaultConsent());
    expect(parseConsent('not json')).toEqual(defaultConsent());
    expect(parseConsent('"a string"')).toEqual(defaultConsent());
    expect(parseConsent('{"analytics":true}')).toEqual(defaultConsent());
    const s = acceptAll();
    expect(parseConsent(serializeConsent(s))).toEqual(s);
  });

  it('asks again on a new policy version (an old v1 record from before versioning counts as undecided)', () => {
    const old = JSON.stringify({ analytics: true, marketing: true, decided: true, at: new Date().toISOString() });
    expect(parseConsent(old).decided).toBe(false);
    const other = { ...acceptAll(), policy: '2020-01-01.1' };
    const back = parseConsent(JSON.stringify(other));
    expect(back.decided).toBe(false);
    expect(back.id).toBe(other.id); // the anonymous trail continues
  });

  it('asks again after a year', () => {
    const s = acceptAll('2026-01-01T00:00:00.000Z');
    const later = Date.parse('2026-01-01T00:00:00.000Z') + (CONSENT_MAX_AGE_DAYS + 1) * 86_400_000;
    expect(parseConsent(serializeConsent(s), later).decided).toBe(false);
    expect(parseConsent(serializeConsent(s), later - 2 * 86_400_000).decided).toBe(true);
  });
});

describe('analytics gating', () => {
  const ids = { ga4: 'G-TEST', meta: '100000000000000', tiktok: 'CABCDEF0123456789' };
  const all = { ids, marketingPixels: true };

  it('loads nothing before an explicit opt-in, even with every id set and the pixels allowed', () => {
    expect(plannedLoads(defaultConsent(), all)).toEqual({ ga4: false, meta: false, tiktok: false });
  });

  it('keeps the advertising pixels off by configuration, even with ids and consent', () => {
    expect(plannedLoads(acceptAll(), { ids })).toEqual({ ga4: true, meta: false, tiktok: false });
    expect(categoriesInUse({ ids })).toEqual({ analytics: true, marketing: false });
    expect(hasMeasurement({ ids: { meta: '1', tiktok: '2' } })).toBe(false);
  });

  it('asks for consent only when something is in use', () => {
    expect(hasMeasurement({ ids: {} })).toBe(false);
    expect(hasMeasurement({ ids: { ga4: ' ' } })).toBe(false);
    expect(hasMeasurement({ ids: { tiktok: 'CABCDEF0123456789' }, marketingPixels: true })).toBe(true);
    expect(hasMeasurement({ ids: {}, ab: true })).toBe(true);
  });

  it('reject keeps every tracker off', () => {
    expect(plannedLoads(rejectAll(), all)).toEqual({ ga4: false, meta: false, tiktok: false });
  });

  it('analytics consent loads GA4 only; marketing loads the two pixels', () => {
    expect(plannedLoads(chooseConsent({ analytics: true, marketing: false }), all)).toEqual({ ga4: true, meta: false, tiktok: false });
    expect(plannedLoads(chooseConsent({ analytics: false, marketing: true }), all)).toEqual({ ga4: false, meta: true, tiktok: true });
  });

  it('is a no-op for any id that is unset, even with consent', () => {
    expect(plannedLoads(acceptAll(), { ids: {}, marketingPixels: true })).toEqual({ ga4: false, meta: false, tiktok: false });
  });

  it('sends Google consent-mode signals: all denied by default, granted per category', () => {
    expect(consentModeDefault()).toMatchObject({ ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied', security_storage: 'granted' });
    expect(consentModeFor(chooseConsent({ analytics: true, marketing: false }))).toMatchObject({ analytics_storage: 'granted', ad_storage: 'denied' });
  });

  it('names the action against what was offered', () => {
    const inUse = { analytics: true, marketing: false };
    expect(actionOf({ analytics: true, marketing: false }, inUse)).toBe('accept_all');
    expect(actionOf({ analytics: false, marketing: false }, inUse)).toBe('reject_all');
    expect(actionOf({ analytics: true, marketing: false }, { analytics: true, marketing: true })).toBe('custom');
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
