// The AI assistant's consent notice, enforced by the API (assistant/consent.ts,
// migration 0243): no question is processed without a "yes" to the current
// notice version; the answer is the person's own (never another person's or
// another company's); withdrawing takes effect at once; every answer is in the
// activity log; a new notice version asks again.
import { beforeAll, describe, expect, it } from 'vitest';
import { mockProvider, respondWith } from '../api/src/assistant/provider';
import type { Deps } from '../api/src/context';
import { ASSIST_CONSENT_VERSION } from '../shared/src/assistConsent';
import { BASE, login, setup, type Client, type Env } from './helpers';

let env: Env;
let ada: Client;
const provider = mockProvider(() => respondWith({ kind: 'answer', text: 'From **Settings → People**.', sources: ['S1'] }), 'claude-sonnet-5-5');
const DOCS = [{ u: '/docs/en/people/', a: 'invite', t: 'People', h: 'Inviting', m: '<p>Invite people from <strong>Settings → People</strong>.</p>', s: 'help' }];

beforeAll(async () => {
  env = await setup();
  (env.deps as Deps).assistant = { provider, docs: async () => DOCS as never };
  ada = await login(env, 'acme', 'ada@demo.example');
}, 60_000);

const Q = { question: 'How do I invite people?' };

describe('in the app', () => {
  it('refuses a question before the notice is answered, and after a "no"', async () => {
    expect((await ada.get('/api/assist/consent')).json.consent).toMatchObject({ version: ASSIST_CONSENT_VERSION, granted: null });
    expect((await ada.get('/api/assist/status')).json.consent.granted).toBeNull();
    const r = await ada.post('/api/assist', Q);
    expect(r.status).toBe(403);
    expect(r.json.error).toBe('consent_required');
    expect((await ada.post('/api/assist/consent', { granted: false })).json.consent.granted).toBe(false);
    expect((await ada.post('/api/assist', Q)).json.error).toBe('consent_required');
  });

  it('answers after a "yes", stops at once after withdrawal, and logs each answer', async () => {
    const yes = await ada.post('/api/assist/consent', { granted: true });
    expect(yes.json.consent).toMatchObject({ granted: true, version: ASSIST_CONSENT_VERSION });
    expect(yes.json.consent.at).toBeTruthy();
    expect((await ada.post('/api/assist', Q)).status).toBe(200);
    expect((await ada.post('/api/assist/consent', { granted: false })).json.consent.granted).toBe(false);
    expect((await ada.post('/api/assist', Q)).json.error).toBe('consent_required');
    const log = (await ada.get('/api/admin/audit')).json.entries.map((e: any) => e.action);
    for (const a of ['assistant.consent_declined', 'assistant.consent_given', 'assistant.consent_withdrawn']) expect(log).toContain(a);
    const rows = await env.db.system((q) => q.query(`select version, locale, granted from assistant_consents where user_id = $1 order by created_at`, [env.a.ids.ada]));
    expect(rows.map((r) => r.granted)).toEqual([false, true, false]);
    expect(rows.every((r) => r.version === ASSIST_CONSENT_VERSION && r.locale)).toBe(true);
  });

  it('a "yes" to an older notice is not a "yes": the person is asked again', async () => {
    const lena = await login(env, 'acme', 'lena@demo.example');
    await env.db.system((q) =>
      q.query(`insert into assistant_consents (org_id, user_id, surface, version, locale, granted) values ($1, $2, 'app', '2000-01-01.1', 'en', true)`, [env.a.orgId, env.a.ids.lena]),
    );
    expect((await lena.get('/api/assist/consent')).json.consent.granted).toBeNull();
    expect((await lena.post('/api/assist', Q)).json.error).toBe('consent_required');
  });

  it('is the person’s own: a colleague’s or another company’s "yes" never counts, and nobody reads another’s', async () => {
    const zeynep = await login(env, 'acme', 'zeynep@demo.example');
    expect((await zeynep.post('/api/assist/consent', { granted: true })).status).toBe(200);
    // Same address, other company: no answer there yet.
    const betaAda = await login(env, 'beta', 'ada@demo.example');
    expect((await betaAda.get('/api/assist/consent')).json.consent.granted).toBeNull();
    expect((await betaAda.post('/api/assist', Q)).json.error).toBe('consent_required');
    // Row security: as Ada of Acme, only Ada's own rows; as Beta's company, none of Acme's.
    const asAda = await env.db.tenant({ orgId: env.a.orgId, userId: env.a.ids.ada }, (q) => q.query('select user_id from assistant_consents'));
    expect(asAda.every((r) => r.user_id === env.a.ids.ada)).toBe(true);
    const asBeta = await env.db.tenant({ orgId: env.b.orgId, userId: env.b.ids.ada }, (q) => q.query('select 1 from assistant_consents'));
    expect(asBeta).toHaveLength(0);
    // Nobody records an answer for someone else: the insert policy holds the person to themself.
    const forged = await env.db
      .tenant({ orgId: env.a.orgId, userId: env.a.ids.ada }, (q) =>
        q.query(`insert into assistant_consents (org_id, user_id, surface, version, locale, granted) values ($1, $2, 'app', $3, 'en', true)`, [env.a.orgId, env.a.ids.lena, ASSIST_CONSENT_VERSION]),
      )
      .then(() => 'ok', () => 'refused');
    expect(forged).toBe('refused');
  });
});

describe('on the public docs', () => {
  const post = (path: string, body: unknown) =>
    env.app.request(`https://${BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-curahold-ask': '1' }, body: JSON.stringify(body) });

  it('needs a "yes" under the browser’s consent id; a "no" or an unknown id is refused', async () => {
    const id = crypto.randomUUID();
    expect((await post('/api/assist/public', { ...Q, lang: 'en' })).status).toBe(403);
    expect((await post('/api/assist/public', { ...Q, lang: 'en', consentId: id })).status).toBe(403);
    expect((await post('/api/assist/public/consent', { consentId: id, granted: true, lang: 'en' })).status).toBe(200);
    expect((await post('/api/assist/public', { ...Q, lang: 'en', consentId: id })).status).toBe(200);
    expect((await post('/api/assist/public/consent', { consentId: id, granted: false, lang: 'en' })).status).toBe(200);
    const after = await post('/api/assist/public', { ...Q, lang: 'en', consentId: id });
    expect(after.status).toBe(403);
    expect(((await after.json()) as any).error).toBe('consent_required');
  });
});
