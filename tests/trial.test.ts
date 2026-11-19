// The free-trial request (routes/trial.ts) and the trial's life around the
// owner's decision (lib/trial.ts, routes/agreements.ts): the e-mail code, spam
// guards, consent per country with its evidence, the seat cap, the terms/DPA
// click-accept, and the reminders up to a read-only end.
import { beforeAll, describe, expect, it } from 'vitest';
import type { Deps } from '../api/src/context';
import { sha256Hex, sign } from '../api/src/lib/crypto';
import { createOrg } from '../api/src/lib/orgs';
import { markAgreementsDue, reminderFor, sendTrialReminders } from '../api/src/lib/trial';
import { translate } from '../shared/src/i18n';
import { CONSENT_TEXT_VERSION } from '../shared/src/compliance/consentTexts';
import { shownText, trialConsent } from '../shared/src/compliance/trialConsent';
import { verifyAgreementChain } from '../api/src/lib/agreementEvidence';
import { AGREEMENT_PACK } from '../shared/src/compliance/agreements';
import { Client, login, setup, type Env } from './helpers';

let env: Env;
beforeAll(async () => {
  env = await setup({ signupMode: 'request', owner: 'owner@curahold.test' });
});

const central = () => new Client(env, 'app');
/** A form stamp from a minute ago (a person took their time). */
const oldStamp = () => sign({ tf: 1, t: Date.now() - 60_000 }, `${env.config.authSecret}:trial`);

async function proven(to: string) {
  const c = central();
  const code = await c.post('/api/trial/code', { email: to, locale: 'en' });
  expect(code.status).toBe(200);
  const v = await c.post('/api/trial/verify', { email: to, code: code.json.devCode });
  expect(v.status).toBe(200);
  return { c, ticket: v.json.ticket as string, freeMail: code.json.freeMail as boolean };
}

const form = (over: Record<string, unknown> = {}) => ({
  uiLocale: 'en',
  name: 'Nora Wind',
  title: 'Head of customer success',
  phone: '+90 212 555 01 01',
  linkedinUrl: 'https://www.linkedin.com/in/nora-wind-demo',
  company: 'Northwind Traders',
  website: 'northwind.example',
  country: 'DE',
  city: 'Berlin',
  industry: 'software',
  companySize: '51-200',
  seats: 12,
  seatsByDepartment: { sales: 4, success: 8 },
  departments: ['sales', 'success'],
  problems: ['handoff', 'renewals'],
  problemText: 'Hand-offs from sales to CS get lost.',
  tools: { crm: 'Demo CRM, Sheet', tasks: 'Board app', accounting: '', bi: '' },
  customersManaged: '101-500',
  timeline: 'month',
  heardFrom: 'friend',
  language: 'en',
  contactTime: 'morning',
  consents: [],
  ...over,
});

describe('the request path replaces the instant sign-up', () => {
  it('says which path is on, and the old instant door is closed', async () => {
    const c = central();
    const cfg = await c.get('/api/trial/config');
    expect(cfg.json).toMatchObject({ mode: 'request', ipCountry: null });
    expect(cfg.json.stamp.length).toBeGreaterThan(20);
    expect((await c.post('/api/signup/start', { email: 'x@northwind.example' })).status).toBe(404);
  });
});

describe('the e-mail code', () => {
  it('proves the address; a wrong code counts and five end it', async () => {
    const c = central();
    const to = 'tries@northwind.example';
    const sent = await c.post('/api/trial/code', { email: to, locale: 'tr' });
    expect(env.email.last(to).subject).toBe(translate('tr', 'email.trial.code.subject', { code: sent.json.devCode }));
    for (let i = 0; i < 5; i++)
      expect((await c.post('/api/trial/verify', { email: to, code: '000000' === sent.json.devCode ? '111111' : '000000' })).status).toBe(400);
    // Locked now, even with the right code.
    expect((await c.post('/api/trial/verify', { email: to, code: sent.json.devCode })).status).toBe(400);
  });

  it('a filled hidden field sends nothing, with the same answer', async () => {
    const before = env.email.sent.length;
    const r = await central().post('/api/trial/code', { email: 'robot@northwind.example', hp: 'http://spam.example' });
    expect(r.status).toBe(200);
    expect(env.email.sent.length).toBe(before);
  });

  it('says when an address is a free mail service', async () => {
    const r = await central().post('/api/trial/code', { email: 'someone@naver.com' });
    expect(r.json.freeMail).toBe(true);
  });
});

describe('sending the request', () => {
  it('stores the request for the owner, with the consent evidence, and mails a receipt', async () => {
    const to = 'nora@northwind.example';
    const { c, ticket } = await proven(to);
    const r = await c.req('POST', '/api/trial/submit', { ...form(), ticket, stamp: await oldStamp(), consents: ['EU.M'] }, { 'cf-ipcountry': 'DE' });
    expect(r.status).toBe(201);
    expect(r.json.ref).toMatch(/^TQ-\d+$/);
    const [row] = await env.db.system((q) =>
      q.query('select id, email, company, country, departments, seats, details, consent from trial_requests where ref = $1', [r.json.ref]),
    );
    expect(row).toMatchObject({ email: to, company: 'Northwind Traders', country: 'DE', seats: 12 });
    expect(row.departments).toEqual(['sales', 'success']);
    expect(row.details.tools.crm).toEqual(['Demo CRM', 'Sheet']);
    expect(row.consent.marketing).toBe(true);
    // One record per block, each with its version, the hash of the sentence read and the country.
    const records = await env.db.system((q) =>
      q.query<{ block: string; version: string; granted: boolean; ip_country: string; text_hash: string }>(
        'select block, version, kind, granted, ip_country, text_hash from consent_records where request_id = $1 order by block',
        [row.id],
      ),
    );
    expect(records.map((x) => x.block)).toEqual(['ALL.A', 'EU.M', 'EU.N']);
    expect(records.every((x) => x.version === CONSENT_TEXT_VERSION && x.ip_country === 'DE' && /^[0-9a-f]{64}$/.test(x.text_hash))).toBe(true);
    expect(records.find((x) => x.block === 'EU.M')!.granted).toBe(true);
    // The hash is the hash of the exact words the form showed (the compliance package's texts, placeholders filled).
    const notice = trialConsent('DE', 'DE', 'en').blocks.find((b) => b.key === 'EU.N')!;
    expect(records.find((x) => x.block === 'EU.N')!.text_hash).toBe(await sha256Hex(shownText(notice)));
    // The owner hears of it; the person gets a receipt with the way out of marketing.
    expect(env.email.sent.some((m) => m.to === 'owner@curahold.test' && m.text.includes(to))).toBe(true);
    expect(env.email.last(to).text).toMatch(/\/signup\/unsubscribe#t=/);
  });

  it('asks every consent the countries that apply need — the one picked and the one connected from', async () => {
    const { c, ticket } = await proven('ayse@kuzey.example');
    const stamp = await oldStamp();
    // Türkiye picked (notice only: no consent box where another basis exists), from Korea: PIPA's separate transfer consent.
    const need = trialConsent('TR', 'KR', 'tr')
      .blocks.filter((b) => b.required)
      .map((b) => b.key);
    expect(need).toEqual(['KR.T']);
    // The United Arab Emirates rest on consent: a required box.
    expect(
      trialConsent('AE', null, 'ar')
        .blocks.filter((b) => b.required)
        .map((b) => b.key),
    ).toEqual(['AE.C']);
    const missing = await c.req('POST', '/api/trial/submit', { ...form({ country: 'TR' }), ticket, stamp, consents: [] }, { 'cf-ipcountry': 'KR' });
    expect(missing.status).toBe(400);
    expect(missing.json.missing).toEqual(['KR.T']);
    const ok = await c.req('POST', '/api/trial/submit', { ...form({ country: 'TR' }), ticket, stamp, consents: [...need, 'TR.M1'] }, { 'cf-ipcountry': 'KR' });
    expect(ok.status).toBe(201);
    // Türkiye's marketing is two separate boxes (Law 6563 approval, KVKK consent); the ticked one only.
    const rows = await env.db.system((q) =>
      q.query(`select block, granted from consent_records where email = 'ayse@kuzey.example' and kind = 'marketing' order by block`),
    );
    expect(rows).toEqual([
      { block: 'TR.M1', granted: true },
      { block: 'TR.M2', granted: false },
    ]);
  });

  it('turns a robot away quietly: hidden field or a form sent at once', async () => {
    const { c, ticket } = await proven('fast@northwind.example');
    const [{ n: before }] = await env.db.system((q) => q.query('select count(*)::int as n from trial_requests'));
    const fresh = (await c.get('/api/trial/config')).json.stamp;
    expect((await c.post('/api/trial/submit', { ...form(), ticket, stamp: fresh })).json.ref).toBe('TQ-000000');
    expect((await c.post('/api/trial/submit', { ...form(), ticket, stamp: await oldStamp(), hp: 'x' })).json.ref).toBe('TQ-000000');
    const [{ n: after }] = await env.db.system((q) => q.query('select count(*)::int as n from trial_requests'));
    expect(after).toBe(before);
  });

  it('takes a personal address only with a reason', async () => {
    const { c, ticket, freeMail } = await proven('nora.wind@gmail.com');
    expect(freeMail).toBe(true);
    const stamp = await oldStamp();
    const bare = await c.post('/api/trial/submit', { ...form(), ticket, stamp });
    expect(bare.json.error).toBe('free_mail_note');
    expect((await c.post('/api/trial/submit', { ...form(), ticket, stamp, freeMailNote: 'Our company has no domain yet.' })).status).toBe(201);
  });

  it('refuses a forged ticket, a country not offered and seats split over teams not chosen', async () => {
    const c = central();
    const stamp = await oldStamp();
    expect((await c.post('/api/trial/submit', { ...form(), ticket: 'x'.repeat(40), stamp })).status).toBe(400);
    const { ticket } = await proven('split@northwind.example');
    expect((await c.post('/api/trial/submit', { ...form({ country: 'IR' }), ticket, stamp })).status).toBe(400);
    expect((await c.post('/api/trial/submit', { ...form({ seatsByDepartment: { finance: 3 } }), ticket, stamp })).status).toBe(400);
  });

  it('takes marketing permission back from the e-mail link, keeping the history', async () => {
    const link = env.email.last('nora@northwind.example').text.match(/#t=(\S+)/)![1];
    const r = await central().post('/api/trial/unsubscribe', { t: link, locale: 'en' });
    expect(r.json).toMatchObject({ ok: true, withdrawn: 1 });
    const rows = await env.db.system((q) =>
      q.query(`select kind, granted from consent_records where email = 'nora@northwind.example' and block = 'EU.M' order by created_at`),
    );
    expect(rows).toEqual([
      { kind: 'marketing', granted: true },
      { kind: 'withdrawal', granted: false },
    ]);
    expect((await central().post('/api/trial/unsubscribe', { t: 'bad'.repeat(10) })).status).toBe(400);
  });
});

describe('a trial company: terms first, then seats within the cap', () => {
  let orgId = '';
  let admin: Client;
  beforeAll(async () => {
    const made = await createOrg(env.db, {
      slug: 'capco',
      name: 'Capco',
      locale: 'en',
      template: 'customer_success',
      admin: { email: 'lead@capco.example', name: 'Lead Person' },
    });
    orgId = made.orgId;
    await env.db.system((q) => q.query('update orgs set trial_seat_cap = 2 where id = $1', [orgId]));
    await markAgreementsDue(env.deps, orgId);
    admin = await login(env, 'capco', 'lead@capco.example');
  });

  it('asks the administrator to accept the terms and DPA, and keeps the evidence', async () => {
    const me = (await admin.get('/api/me')).json;
    expect(me.org).toMatchObject({ agreementsDue: true, seatCap: 2 });
    const roles = (await admin.get('/api/admin/roles')).json.roles;
    const member = roles.find((r: { key: string; id: string }) => r.key === 'member');
    const early = await admin.post('/api/admin/users', { email: 'one@capco.example', name: 'One', roleId: member.id, seat: 'full' });
    expect(early.json.error).toBe('terms_required');
    const due = (await admin.get('/api/agreements')).json.due;
    expect(due.map((d: { doc: string }) => d.doc).sort()).toEqual(['dpa', 'terms']);
    const ok = await admin.post('/api/agreements/accept', { locale: 'en', docs: ['terms', 'dpa'] });
    expect(ok.json.accepted).toHaveLength(2);
    const [row] = await env.db.system((q) => q.query(`select accepted_email, text_hash from org_agreements where org_id = $1 and doc = 'terms'`, [orgId]));
    expect(row.accepted_email).toBe('lead@capco.example');
    expect(row.text_hash).toMatch(/^[0-9a-f]{64}$/);
    // And one row per document in the hash-chained evidence, with the document's own text hash.
    const evidence = await env.db.system((q) =>
      q.query(`select doc, version, doc_locale, doc_hash, context, authority from agreement_evidence where org_id = $1 order by doc`, [orgId]),
    );
    expect(evidence.map((e) => `${e.doc}@${e.version}:${e.doc_locale}:${e.context}:${e.authority}`)).toEqual([
      `dpa@${AGREEMENT_PACK.dpa.version}:en:trial_approval:true`,
      `terms@${AGREEMENT_PACK.terms.version}:en:trial_approval:true`,
    ]);
    expect(evidence.every((e) => /^[0-9a-f]{64}$/.test(e.doc_hash))).toBe(true);
    expect((await env.db.system((q) => verifyAgreementChain(q))).ok).toBe(true);
    expect((await admin.get('/api/me')).json.org.agreementsDue).toBe(false);
    // A copy goes to the person who accepted, with both versions and where they stay readable.
    expect(env.email.last('lead@capco.example').text).toMatch(/legal-terms\/[\s\S]*legal-dpa\//);
  });

  it('stops at the seat cap for full seats; viewers are free', async () => {
    const roles = (await admin.get('/api/admin/roles')).json.roles;
    const member = roles.find((r: { key: string; id: string }) => r.key === 'member');
    expect((await admin.post('/api/admin/users', { email: 'two@capco.example', name: 'Two', roleId: member.id, seat: 'full' })).status).toBe(201);
    const over = await admin.post('/api/admin/users', { email: 'three@capco.example', name: 'Three', roleId: member.id, seat: 'full' });
    expect(over.status).toBe(409);
    expect(over.json.error).toBe('seat_cap_reached');
    const viewer = roles.find((r: { key: string; id: string }) => r.key === 'viewer') ?? member;
    expect((await admin.post('/api/admin/users', { email: 'four@capco.example', name: 'Four', roleId: viewer.id, seat: 'viewer' })).status).toBe(201);
  });

  it('sends the 14/7/1-day reminders once each, then says it is read-only and nothing is deleted', async () => {
    expect(reminderFor(new Date(Date.now() + 10 * 86_400_000), new Date())).toBe('d14');
    expect(reminderFor(new Date(Date.now() + 6 * 86_400_000), new Date())).toBe('d7');
    expect(reminderFor(new Date(Date.now() + 3_600_000), new Date())).toBe('d1');
    expect(reminderFor(new Date(Date.now() + 20 * 86_400_000), new Date())).toBe(null);
    expect(reminderFor(new Date(Date.now() - 3_600_000), new Date())).toBe('ended');
    const now = new Date();
    await env.db.system((q) => q.query(`update orgs set trial_ends_at = $2 where id = $1`, [orgId, new Date(now.getTime() + 6 * 86_400_000).toISOString()]));
    const before = env.email.sent.length;
    await sendTrialReminders(env.deps as unknown as Deps, now);
    const mail = env.email.last('lead@capco.example');
    expect(mail.subject).toBe(translate('en', 'email.trial.reminder.subject', { days: 6 }));
    await sendTrialReminders(env.deps as unknown as Deps, now);
    expect(env.email.sent.filter((m) => m.to === 'lead@capco.example').length).toBe(
      env.email.sent.slice(0, before).filter((m) => m.to === 'lead@capco.example').length + 1,
    );
    await env.db.system((q) => q.query(`update orgs set trial_ends_at = $2 where id = $1`, [orgId, new Date(now.getTime() - 3_600_000).toISOString()]));
    await sendTrialReminders(env.deps as unknown as Deps, now);
    expect(env.email.last('lead@capco.example').text).toContain(
      translate('en', 'email.trial.ended.body', { name: 'Lead Person', org: 'Capco', days: 0, link: '' }).split('\n\n')[1].slice(0, 40),
    );
    // Nothing went away.
    const [{ n }] = await env.db.system((q) => q.query('select count(*)::int as n from orgs where id = $1', [orgId]));
    expect(n).toBe(1);
  });
});
