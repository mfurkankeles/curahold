// Retention (lib/retention.ts) and deleting a whole company (lib/companyDeletion.ts):
// the stated periods are kept by the nightly job, consent proof in force stays,
// consent records cannot be rewritten, and a company deletion waits for its
// grace period, can be cancelled, then removes everything of that company only
// — files and connector tokens included — and leaves a certificate.
import { beforeAll, describe, expect, it } from 'vitest';
import { createOrg } from '../api/src/lib/orgs';
import { purgeExpired, retentionFrom, RETENTION_DEFAULTS } from '../api/src/lib/retention';
import { purgeDueCompanies } from '../api/src/lib/companyDeletion';
import { login, setup, type Env } from './helpers';

let env: Env;
beforeAll(async () => {
  env = await setup();
});

const HASH = 'a'.repeat(64);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

async function consent(email: string, block: string, granted: boolean, at: string, orgId: string | null = null, kind = 'consent') {
  await env.db.system((q) =>
    q.query(
      `insert into consent_records (request_id, org_id, email, block, version, kind, locale, text_hash, granted, source, user_agent, created_at)
       values (null, $1, $2, $3, 'v1', $4, 'en', $5, $6, 'trial_form', 'Test browser', $7)`,
      [orgId, email, block, kind, HASH, granted, at],
    ),
  );
}

describe('retention settings', () => {
  it('uses the stated defaults, takes a valid setting and ignores one under its floor', () => {
    expect(retentionFrom({})).toEqual(RETENTION_DEFAULTS);
    expect(retentionFrom({ RETENTION_AUDIT_DAYS: '730' }).auditDays).toBe(730);
    expect(retentionFrom({ RETENTION_CONSENT_DAYS: '10' }).consentDays).toBe(RETENTION_DEFAULTS.consentDays);
    expect(retentionFrom({ COMPANY_DELETE_GRACE_DAYS: 'soon' }).companyDeleteGraceDays).toBe(30);
  });
});

describe('the nightly purge', () => {
  it('lets go of what is past its period and keeps consent proof still in force', async () => {
    const o = env.a.orgId;
    await env.db.system(async (q) => {
      await q.query(
        `insert into trial_requests (name, email, email_verified_at, company, country, created_at, updated_at)
         values ('Old Applicant', 'old.applicant@demo.example', now(), 'Old Co', 'DE', $1, $1), ('New Applicant', 'new.applicant@demo.example', now(), 'New Co', 'DE', now(), now())`,
        [daysAgo(400)],
      );
      await q.query(`insert into audit_log (org_id, actor_id, action, entity, at) values ($1, null, 'test.old', 'org', $2), ($1, null, 'test.new', 'org', now())`, [o, daysAgo(400)]);
      const [h] = await q.query(
        `insert into help_requests (org_id, category, subject, description, created_at, updated_at) values ($1, 'question', 'Old question', 'Old', $2, $2) returning id`,
        [o, daysAgo(800)],
      );
      await q.query(`insert into help_files (org_id, request_id, name, mime, size, storage_key) values ($1, $2, 'a.txt', 'text/plain', 1, 'help/old/a.txt')`, [o, h.id]);
    });
    await env.storage.put('help/old/a.txt', new TextEncoder().encode('x').buffer as ArrayBuffer, 'text/plain');
    // Marketing "yes" 4 years ago and never changed: still the proof for a consent in force.
    await consent('kept@demo.example', 'any.marketing.email', true, daysAgo(1500), null, 'marketing');
    // A "yes" 4 years ago, withdrawn 3.5 years ago: both are past the period and nothing relies on them.
    await consent('gone@demo.example', 'any.marketing.email', true, daysAgo(1500), null, 'marketing');
    await consent('gone@demo.example', 'any.marketing.email', false, daysAgo(1300), null, 'withdrawal');

    const r = await purgeExpired(env.deps);
    expect(r.trialRequests).toBeGreaterThanOrEqual(1);
    expect(r.auditLog).toBeGreaterThanOrEqual(1);
    expect(r.helpRequests).toBeGreaterThanOrEqual(1);
    expect(r.files).toBeGreaterThanOrEqual(1);
    expect(await env.storage.get('help/old/a.txt')).toBeNull();
    const left = await env.db.system(async (q) => ({
      trials: (await q.query(`select email from trial_requests where email like '%.applicant@demo.example'`)).map((x) => x.email),
      audit: (await q.query(`select action from audit_log where action like 'test.%'`)).map((x) => x.action),
      consent: (await q.query(`select email, kind from consent_records where email in ('kept@demo.example', 'gone@demo.example')`)).map((x) => `${x.email}:${x.kind}`),
    }));
    expect(left.trials).toEqual(['new.applicant@demo.example']);
    expect(left.audit).toEqual(['test.new']);
    expect(left.consent).toEqual(['kept@demo.example:marketing']);
  });

  it('consent records cannot be rewritten: only the anonymisation goes through', async () => {
    await consent('frozen@demo.example', 'tr.notice', true, new Date().toISOString(), null, 'notice');
    const tryIt = (sql: string) => env.db.system((q) => q.query(sql)).then(() => 'ok', (e: Error) => e.message);
    expect(await tryIt(`update consent_records set granted = false where email = 'frozen@demo.example'`)).toMatch(/append-only/);
    expect(await tryIt(`update consent_records set email = 'someone.else@demo.example' where email = 'frozen@demo.example'`)).toMatch(/append-only/);
    expect(
      await tryIt(`update consent_records set email = 'erased:' || encode(sha256(convert_to(email, 'UTF8')), 'hex'), user_agent = null where email = 'frozen@demo.example'`),
    ).toBe('ok');
  });
});

describe('deleting a company', () => {
  it('waits for the grace period, can be cancelled, then removes that company only and leaves a certificate', async () => {
    const made = await createOrg(env.db, { slug: 'doomed', name: 'Doomed Co', locale: 'en', admin: { email: 'dora@demo.example', name: 'Dora Admin' } });
    const orgId = made.orgId;
    const dora = await login(env, 'doomed', 'dora@demo.example');
    const zeynep = await login(env, 'acme', 'zeynep@demo.example');
    expect((await zeynep.post('/api/admin/company/deletion', { confirm: 'acme' })).status).toBe(403);
    expect((await dora.post('/api/admin/company/deletion', { confirm: 'wrong' })).status).toBe(400);

    // Things that must go: a help file in storage, a connector's tokens, a person; and an invoice that must stay.
    await env.db.system(async (q) => {
      const [h] = await q.query(`insert into help_requests (org_id, category, subject, description) values ($1, 'question', 'Q', 'D') returning id`, [orgId]);
      await q.query(`insert into help_files (org_id, request_id, name, mime, size, storage_key) values ($1, $2, 'b.txt', 'text/plain', 1, $3)`, [orgId, h.id, `help/${orgId}/b.txt`]);
      await q.query(`insert into connections (org_id, kind, provider, label, config) values ($1, 'source', 'demo', 'CRM', '{"token":"secret-token"}'::jsonb)`, [orgId]);
      await q.query(`insert into invoices (org_id, amount_cents, currency, status, issued_at) values ($1, 1200, 'EUR', 'paid', now())`, [orgId]);
    });
    await consent('dora@demo.example', 'tr.notice', true, new Date().toISOString(), orgId, 'notice');
    await env.storage.put(`help/${orgId}/b.txt`, new TextEncoder().encode('x').buffer as ArrayBuffer, 'text/plain');

    const asked = await dora.post('/api/admin/company/deletion', { confirm: 'doomed' });
    expect(asked.status).toBe(200);
    expect(asked.json.graceDays).toBe(30);
    expect((await dora.post('/api/admin/company/deletion', { confirm: 'doomed' })).status).toBe(409);
    // Not yet due: nothing happens.
    expect(await purgeDueCompanies(env.deps)).toBe(0);
    // Cancelled, then asked again.
    expect((await dora.del('/api/admin/company/deletion')).json.deletion).toBeNull();
    expect((await dora.get('/api/admin/company/deletion')).json.deletion).toBeNull();
    await dora.post('/api/admin/company/deletion', { confirm: 'doomed' });

    const acmeTasks = async () => (await env.db.system((q) => q.query(`select count(*)::int as n from tasks where org_id = $1`, [env.a.orgId])))[0].n;
    const before = await acmeTasks();
    expect(await purgeDueCompanies(env.deps, new Date(Date.now() + 31 * 86_400_000))).toBe(1);

    const after = await env.db.system(async (q) => ({
      org: await q.query(`select 1 from orgs where id = $1`, [orgId]),
      users: await q.query(`select 1 from users where org_id = $1`, [orgId]),
      connections: await q.query(`select 1 from connections where org_id = $1`, [orgId]),
      invoices: await q.query(`select org_id, company_name from invoices where company_name = 'Doomed Co'`),
      consent: await q.query(`select email, user_agent from consent_records where email like 'erased:%' or email = 'dora@demo.example'`),
      cert: await q.query(`select certificate, certificate_hash from company_deletions where org_id = $1 and purged_at is not null`, [orgId]),
    }));
    expect(after.org).toHaveLength(0);
    expect(after.users).toHaveLength(0);
    expect(after.connections).toHaveLength(0);
    expect(after.invoices).toEqual([{ org_id: null, company_name: 'Doomed Co' }]);
    expect(after.consent.some((c: any) => c.email === 'dora@demo.example')).toBe(false);
    expect(after.consent.some((c: any) => c.email.startsWith('erased:') && c.user_agent === null)).toBe(true);
    expect(await env.storage.get(`help/${orgId}/b.txt`)).toBeNull();
    const cert = after.cert[0];
    expect(cert.certificate_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(cert.certificate.company.slug).toBe('doomed');
    expect(cert.certificate.removed.users).toBe(1);
    expect(cert.certificate.connectorTokens).toBeGreaterThanOrEqual(1);
    expect(cert.certificate.files).toBe(1);
    expect(cert.certificate.kept.invoices).toBe(1);
    expect(JSON.stringify(cert.certificate)).not.toContain('dora@demo.example');
    // The other companies are untouched.
    expect(await acmeTasks()).toBe(before);
  });
});
