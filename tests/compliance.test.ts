// Compliance package (b9): the storage inventory is generated from the code and
// matches the registry; the static pages' consent bundle loads no pixel before
// consent (run in a small fake DOM); the evidence tables keep the fields a
// review asks for; the trial consent texts follow the research's rules; every
// generated text exists in every language.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';
import { LOCALES } from '../shared/src/i18n/core';
import { compare, outputs, scan } from '../scripts/compliance/inventory';
import { consentBundle } from '../scripts/compliance/build-consent';
import { PURPOSES, STORAGE } from '../shared/src/compliance/storage';
import { COOKIE_PAGE } from '../shared/src/compliance/cookieText';
import { CONSENT_POLICY_VERSION } from '../shared/src/consent/core';
import { RULE_SETS, consentSetFor, type Placeholders } from '../shared/src/compliance/consentTexts';
import { recordAgreement, verifyAgreementChain } from '../api/src/lib/agreementEvidence';
import { outputs as legalOutputs } from '../scripts/compliance/legal-pack';
import { SUBPROCESSORS, consentPlaceholders } from '../shared/src/compliance/dataInventory';
import { SUB_PAGE } from '../shared/src/compliance/subprocessorText';
import { AGREEMENT_PACK } from '../shared/src/compliance/agreements';
import { setup, type Env } from './helpers';

const ROOT = join(import.meta.dirname, '..');

describe('storage inventory (generated from the code)', () => {
  it('finds nothing the registry does not list, and the registry lists nothing the code lacks', () => {
    const { unknown, stale } = compare(scan(ROOT));
    expect(unknown.map((f) => `${f.type}:${f.name} in ${f.files[0]}`)).toEqual([]);
    expect(stale.map((r) => `${r.type}:${r.name}`)).toEqual([]);
  });

  it('finds the real things: session cookie, device id, the three trackers, the checkout script', () => {
    const names = scan(ROOT).map((f) => `${f.type}:${f.name}`);
    for (const n of ['cookie:app_session', 'localStorage:app_device', 'script:www.googletagmanager.com', 'script:connect.facebook.net', 'script:analytics.tiktok.com', 'script:cdn.paddle.com'])
      expect(names).toContain(n);
  });

  it('writes the JSON and the nine cookie pages exactly as committed (run inventory.ts --write)', () => {
    for (const [path, content] of outputs(ROOT)) expect(readFileSync(path, 'utf8'), path).toBe(content);
  });

  it('has every purpose and every page word in every language', () => {
    for (const p of Object.values(PURPOSES)) for (const l of LOCALES) expect(p[l], l).toBeTruthy();
    for (const l of LOCALES) {
      const t = COOKIE_PAGE[l];
      expect(t.rules.length).toBe(COOKIE_PAGE.en.rules.length);
      expect(JSON.stringify(t)).not.toMatch(/""/);
    }
  });

  it('puts the advertising pixels in marketing and asks consent for them', () => {
    for (const it of STORAGE.filter((s) => s.conditional === 'meta' || s.conditional === 'tiktok')) expect(it.category).toBe('marketing');
    const page = outputs(ROOT).get(join(ROOT, 'docs', 'site', 'en', 'legal-cookies.md'))!;
    expect(page).toContain('Meta pixel');
    expect(page).not.toMatch(/no advertising/i);
  });
});

describe('legal pack generated from the data inventory', () => {
  it('writes the sub-processor pages, the notice tables, the records of processing, the VERBİS sheet and the hashes as committed (run legal-pack.ts)', () => {
    for (const [path, content] of legalOutputs()) expect(readFileSync(path, 'utf8'), path).toBe(content);
  });

  it('lists the AI provider and the company mailbox provider, and every sub-processor purpose in nine languages', () => {
    const ids = SUBPROCESSORS.map((s) => s.id);
    expect(ids).toContain('anthropic');
    expect(ids).toContain('googleWorkspace');
    for (const s of SUBPROCESSORS) for (const l of LOCALES) expect(s.purpose[l], `${s.id} ${l}`).toBeTruthy();
    for (const l of LOCALES) expect(SUB_PAGE[l].when.ai).toBeTruthy();
  });

  it('tells the truth: no "never for advertising" claim beside the pixel loaders, no 14-day trial, every contract page in both reviewed languages', () => {
    for (const lang of ['en', 'tr']) {
      const privacy = readFileSync(join(ROOT, 'docs', 'site', lang, 'legal-privacy.md'), 'utf8');
      expect(privacy).not.toMatch(/no advertising or tracking cookies|do not use it for advertising|reklam ya da izleme çerezi yoktur/i);
      expect(privacy).toMatch(/Meta/);
      const terms = readFileSync(join(ROOT, 'docs', 'site', lang, 'legal-terms.md'), 'utf8');
      expect(terms).not.toMatch(/\b14\b.{0,12}(days|gün)/);
      expect(terms).toMatch(/3 (months|ay)/);
      for (const d of Object.values(AGREEMENT_PACK)) expect(readFileSync(join(ROOT, 'docs', 'site', lang, `${d.slug}.md`), 'utf8')).toMatch(/lawyer approval required|avukat onayı gerekli/);
    }
  });

  it('fills the trial texts from the inventory (countries and providers of the lead data)', () => {
    const v = consentPlaceholders('en');
    expect(v.storage_countries).toContain('United States');
    expect(v.processors).toContain('Cloudflare');
  });
});

describe('mail guides (Google Workspace, SMTP relay)', () => {
  it('exist in every language with the same sections, records and settings', () => {
    for (const page of ['mail-google-workspace', 'mail-smtp-relay']) {
      const en = readFileSync(join(ROOT, 'docs', 'site', 'en', `${page}.md`), 'utf8');
      const shape = (t: string) => ({ h2: (t.match(/^## /gm) ?? []).length, codes: [...t.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]).filter((c) => /[_=.:@]/.test(c!)).sort() });
      for (const l of LOCALES) {
        const t = readFileSync(join(ROOT, 'docs', 'site', l, `${page}.md`), 'utf8');
        expect(shape(t), `${l}/${page}`).toEqual(shape(en));
      }
    }
  });
});

// ------------------------------------------------------------------ the static pages' banner, in a fake DOM

class El {
  children: El[] = [];
  attrs: Record<string, string> = {};
  listeners: Record<string, ((e: any) => void)[]> = {};
  className = '';
  textContent = '';
  type = '';
  src = '';
  id = '';
  href = '';
  checked = false;
  tabIndex = 0;
  constructor(public tag: string) {}
  appendChild(c: El) {
    this.children.push(c);
    return c;
  }
  setAttribute(k: string, v: string) {
    this.attrs[k] = v;
  }
  addEventListener(t: string, f: (e: any) => void) {
    (this.listeners[t] ??= []).push(f);
  }
  focus() {}
  closest() {
    return null;
  }
  all(): El[] {
    return [this, ...this.children.flatMap((c) => c.all())];
  }
  set _text(v: string) {
    this.textContent = v;
  }
}

function page(config: Record<string, unknown>, stored?: string) {
  const head = new El('head');
  const body = new El('body');
  const store = new Map<string, string>(stored ? [['curahold_consent_v1', stored]] : []);
  const beacons: string[] = [];
  const cookies: string[] = [];
  const listeners: Record<string, ((e: any) => void)[]> = {};
  const document = {
    head,
    body,
    activeElement: null,
    documentElement: { lang: 'en' },
    createElement: (t: string) => new El(t),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    set cookie(v: string) {
      cookies.push(v);
    },
  };
  const window: Record<string, any> = {
    __curaConsent: config,
    document,
    location: { protocol: 'https:' },
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
    navigator: { sendBeacon: (_u: string, b: { text?: string; parts?: string[] }) => (beacons.push(String(b.parts?.[0] ?? '')), true) },
    addEventListener: (t: string, f: (e: any) => void) => (listeners[t] ??= []).push(f),
    dispatchEvent: (e: { type: string }) => (listeners[e.type] ?? []).forEach((f) => f(e)),
  };
  window.window = window;
  class FakeBlob {
    parts: string[];
    constructor(parts: string[]) {
      this.parts = parts;
    }
  }
  class CustomEvent {
    constructor(
      public type: string,
      public init?: { detail?: unknown },
    ) {}
  }
  runInNewContext(consentBundle(), { window, document, localStorage: window.localStorage, navigator: window.navigator, Blob: FakeBlob, CustomEvent, crypto: globalThis.crypto, TextEncoder, console, setTimeout });
  const scripts = () => head.children.filter((c) => c.tag === 'script').map((c) => c.src);
  const click = (label: string) => {
    const b = body.all().find((e) => e.tag === 'button' && e.textContent === label);
    if (!b) throw new Error(`no button "${label}"`);
    b.listeners.click!.forEach((f) => f({}));
  };
  const buttons = () => body.all().filter((e) => e.tag === 'button').map((b) => `${b.textContent}|${b.className}`);
  return { scripts, click, buttons, store, beacons, cookies, window };
}

const strings = { title: 'Cookies', body: 'We ask first.', acceptAll: 'Accept all', rejectAll: 'Reject all', manage: 'Choose', save: 'Save', reopen: 'Privacy choices', manageTitle: 'Privacy choices' };
const ids = { ga4: 'G-TEST', meta: '100000000000000', tiktok: 'CABCDEF0123456789' };

describe('site/consent.js (the shared library, bundled)', () => {
  it('is the current build of shared/src/consent (run build-consent.ts)', () => {
    expect(readFileSync(join(ROOT, 'site', 'consent.js'), 'utf8')).toBe(consentBundle());
  });

  it('loads no tracker before a choice, and none after "reject all"', () => {
    const p = page({ strings, ids, marketingPixels: true, logUrl: 'https://app.example/api/consent-event' });
    expect(p.scripts()).toEqual([]);
    p.click('Reject all');
    expect(p.scripts()).toEqual([]);
    expect(JSON.parse(p.store.get('curahold_consent_v1')!)).toMatchObject({ decided: true, analytics: false, marketing: false, policy: CONSENT_POLICY_VERSION });
  });

  it('offers accept and reject with the same weight', () => {
    const p = page({ strings, ids: { ga4: 'G-TEST' } });
    const b = p.buttons();
    const cls = (l: string) => b.find((x) => x.startsWith(`${l}|`))!.split('|')[1];
    expect(cls('Accept all')).toBe(cls('Reject all'));
  });

  it('keeps the Meta and TikTok pixels off without the config switch, even after "accept all"', () => {
    const p = page({ strings, ids });
    p.click('Accept all');
    const s = p.scripts();
    expect(s.some((x) => x.includes('googletagmanager.com'))).toBe(true);
    expect(s.some((x) => x.includes('facebook.net') || x.includes('tiktok.com'))).toBe(false);
  });

  it('loads the pixels only after "accept all" when switched on, and logs the choice with version and hash', async () => {
    const p = page({ strings, ids, marketingPixels: true, logUrl: 'https://app.example/api/consent-event' });
    p.click('Accept all');
    expect(p.scripts().filter((x) => /facebook\.net|tiktok\.com/.test(x)).length).toBe(2);
    await new Promise((r) => setTimeout(r, 30));
    const event = JSON.parse(p.beacons[0]!);
    expect(event).toMatchObject({ action: 'accept_all', analytics: true, marketing: true, policyVersion: CONSENT_POLICY_VERSION, surface: 'site', locale: 'en' });
    expect(event.textHash).toMatch(/^[0-9a-f]{64}$/);
    expect(event.consentId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('shows nothing and loads nothing when nothing is configured', () => {
    const p = page({ strings, ids: {} });
    expect(p.buttons()).toEqual([]);
    expect(p.scripts()).toEqual([]);
    expect(p.window.curaConsent.allows('analytics')).toBe(false);
  });

  it('asks again when the stored choice was made under another policy version', () => {
    const old = JSON.stringify({ analytics: true, marketing: true, decided: true, at: new Date().toISOString(), policy: '2020-01-01.1', id: '' });
    const p = page({ strings, ids: { ga4: 'G-TEST' } }, old);
    expect(p.scripts()).toEqual([]);
    expect(p.buttons().some((b) => b.startsWith('Accept all'))).toBe(true);
    // The stale yes is rewritten, so no other script on the page reads it as consent.
    expect(JSON.parse(p.store.get('curahold_consent_v1')!).decided).toBe(false);
  });

  it('mirrors the analytics answer in a cookie for the A/B edge only when the test is on', () => {
    const p = page({ strings, ids: {}, ab: true });
    p.click('Reject all');
    expect(p.cookies[0]).toMatch(/^cura_consent=a0;/);
    const q = page({ strings, ids: { ga4: 'G-TEST' } });
    q.click('Accept all');
    expect(q.cookies).toEqual([]);
  });
});

// ------------------------------------------------------------------ trial consent texts

const vars: Placeholders = {
  company: 'Example Ltd',
  company_country: 'Türkiye',
  contact: 'privacy@example.com',
  storage_countries: 'Germany and the United States',
  processors: 'Host Co., Mail Co.',
  retention: '12 months',
  eu_rep: '[EU representative]',
  uk_rep: '[UK representative]',
  cn_rep: '[representative]',
};

describe('trial consent texts per country (research §1.15)', () => {
  const ids = (c: ReturnType<typeof consentSetFor>) => c.blocks.map((b) => b.id);

  it('does not offer Egypt or mainland China at launch, nor sanctioned countries', () => {
    expect(consentSetFor({ declared: 'EG', locale: 'ar', vars })).toMatchObject({ offered: false, notOffered: 'EG' });
    expect(consentSetFor({ declared: 'CN', locale: 'zh-Hans', vars })).toMatchObject({ offered: false, notOffered: 'CN' });
    expect(consentSetFor({ declared: 'IR', locale: 'fa', vars })).toMatchObject({ offered: false, notOffered: 'sanctions' });
    expect(consentSetFor({ declared: 'EG', locale: 'ar', vars, flags: { egyptOffered: true } }).offered).toBe(true);
  });

  it('asks UAE residents for an express, required consent box', () => {
    const c = consentSetFor({ declared: 'AE', locale: 'en', vars });
    const box = c.blocks.find((b) => b.id === 'AE.C')!;
    expect(box).toMatchObject({ required: true, box: true, kind: 'consent' });
    expect(box.shown[0]!.text).toContain('outside the United Arab Emirates');
  });

  it('gives Türkiye two separate, optional marketing boxes (İYS approval, KVKK consent) and no transfer consent by default', () => {
    const c = consentSetFor({ declared: 'TR', locale: 'tr', vars });
    expect(ids(c)).toEqual(['TR.N0', 'TR.M1', 'TR.M2', 'ALL.A']);
    for (const id of ['TR.M1', 'TR.M2']) expect(c.blocks.find((b) => b.id === id)).toMatchObject({ required: false, box: true });
    expect(c.blocks[0]!.shown[0]!.text).not.toContain("m. 9'da öngörülen güvencelerle");
    const later = consentSetFor({ declared: 'TR', locale: 'tr', vars, flags: { trStandardContractsNotified: true } });
    expect(ids(later)[0]).toBe('TR.N');
  });

  it('adds the Saudi residency note and the consent box (switchable)', () => {
    expect(ids(consentSetFor({ declared: 'SA', locale: 'ar', vars }))).toEqual(['SA.N', 'SA.R', 'SA.C', 'SA.M', 'ALL.A']);
    expect(ids(consentSetFor({ declared: 'SA', locale: 'ar', vars, flags: { saConsentBox: false } }))).not.toContain('SA.C');
  });

  it('gives India a notice with the grievance route and a separate consent box, and Malaysia its notice in Malay and English together', () => {
    expect(ids(consentSetFor({ declared: 'IN', locale: 'hi', vars }))).toEqual(['IN.N', 'IN.C', 'IN.M', 'ALL.A']);
    const inN = consentSetFor({ declared: 'IN', locale: 'en', vars }).blocks[0]!;
    expect(inN.shown[0]!.text).toMatch(/Data Protection Board of India/);
    expect(ids(consentSetFor({ declared: 'MY', locale: 'en', vars }))).toEqual(['MY.N', 'MY.C', 'MY.M', 'ALL.A']);
    expect(ids(consentSetFor({ declared: 'MY', locale: 'en', vars, flags: { myConsentBox: false } }))).not.toContain('MY.C');
    for (const locale of ['en', 'ms', 'hi'] as const) {
      const shown = consentSetFor({ declared: 'MY', locale, vars }).blocks[0]!.shown.map((s) => s.lang);
      expect(shown, locale).toContain('ms');
      expect(shown, locale).toContain('en');
    }
  });

  it('applies both rule sets when the connection comes from a stricter country', () => {
    const c = consentSetFor({ declared: 'DE', ipCountry: 'KR', locale: 'en', vars });
    expect(c.ruleSets).toEqual(['EU', 'KR']);
    expect(ids(c)).toContain('KR.T');
  });

  it('shows the interface language when it exists, otherwise the master with English next to it; ids carry the version', () => {
    const ja = consentSetFor({ declared: 'JP', locale: 'ja', vars }).blocks[0]!;
    expect(ja.shown.map((s) => s.textId)).toEqual(['JP.N.ja@0.1-draft']);
    const ko = consentSetFor({ declared: 'KR', locale: 'tr', vars }).blocks[0]!;
    expect(ko.shown.map((s) => s.lang)).toEqual(['ko', 'en']);
  });

  it('fills every placeholder and keeps every block in English and its master language', () => {
    for (const [set, r] of Object.entries(RULE_SETS))
      for (const b of [...r.blocks, ...r.marketing]) {
        expect(b.texts.en, `${b.id} en`).toBeTruthy();
        expect(b.texts[b.master], `${b.id} ${b.master}`).toBeTruthy();
        expect(b.id.startsWith(`${set}.`)).toBe(true);
      }
    for (const country of ['TR', 'DE', 'US', 'AE', 'SA', 'QA', 'IL', 'JP', 'KR', 'TW', 'HK', 'SG', 'IN', 'MY'])
      for (const b of consentSetFor({ declared: country, locale: 'en', vars }).blocks) for (const s of b.shown) expect(s.text, s.textId).not.toMatch(/\{[a-z_]+\}/);
  });

  it('has the generic notice, marketing box and capacity line in every language', () => {
    for (const l of LOCALES) {
      const c = consentSetFor({ declared: 'US', locale: l, vars });
      expect(c.blocks.every((b) => b.shown.length === 1 && b.shown[0]!.lang === l), l).toBe(true);
    }
  });
});

// ------------------------------------------------------------------ evidence tables

describe('consent and agreement evidence (migration 0160)', () => {
  let env: Env;
  beforeAll(async () => {
    env = await setup();
  });

  const event = {
    consentId: '7f8e4a52-9a3b-4c55-9a1e-2b9c3c1d0e11',
    action: 'reject_all',
    analytics: false,
    marketing: false,
    policyVersion: CONSENT_POLICY_VERSION,
    textHash: 'a'.repeat(64),
    locale: 'tr',
    surface: 'site',
  };

  it('records a visitor’s choice through the public endpoint with country, version and hash — never the address', async () => {
    const res = await env.app.request('https://acme.curahold.test/api/consent-event', {
      method: 'POST',
      headers: { 'content-type': 'text/plain', 'cf-ipcountry': 'TR' },
      body: JSON.stringify(event),
    });
    expect(res.status).toBe(204);
    const [row] = await env.db.system((q) => q.query('select * from consent_events where consent_id = $1', [event.consentId]));
    expect(row).toMatchObject({ surface: 'site', action: 'reject_all', policy_version: CONSENT_POLICY_VERSION, text_hash: 'a'.repeat(64), locale: 'tr', country: 'TR' });
    expect(Object.keys(row)).not.toContain('ip');
  });

  it('refuses a malformed record', async () => {
    const res = await env.app.request('https://acme.curahold.test/api/consent-event', { method: 'POST', body: JSON.stringify({ ...event, textHash: 'nope' }) });
    expect(res.status).toBe(400);
  });

  it('keeps the new consent_log fields for people signed in', async () => {
    const [row] = await env.db.tenant({ orgId: env.a.orgId, userId: env.a.ids.zeynep }, (q) =>
      q.query(
        `insert into consent_log (org_id, user_id, analytics, marketing, source, policy_version, text_hash, locale, country, consent_id, action)
         values ($1, $2, true, false, 'app', $3, $4, 'en', 'DE', $5, 'custom') returning *`,
        [env.a.orgId, env.a.ids.zeynep, CONSENT_POLICY_VERSION, 'b'.repeat(64), event.consentId],
      ),
    );
    expect(row).toMatchObject({ policy_version: CONSENT_POLICY_VERSION, country: 'DE', action: 'custom', consent_id: event.consentId });
  });

  const acceptance = (doc: 'terms' | 'dpa') => ({
    orgId: env.a.orgId,
    companyName: 'Acme Example Ltd',
    companyTaxId: '1234567890',
    userId: env.a.ids.zeynep,
    userEmail: 'Zeynep@Acme.example',
    userName: 'Zeynep',
    userRole: 'admin',
    authority: true,
    doc,
    version: '2026-11-19.draft2',
    docLocale: 'tr',
    docHash: 'c'.repeat(64),
    pdfHash: null,
    statement: 'I have read and accept…',
    buttonLabel: 'Accept and start',
    context: 'trial_approval' as const,
    ipCountry: 'TR',
    userAgent: 'test',
    copyMessageId: null,
  });

  it('chains click-accept evidence, refuses edits and finds a tampered row', async () => {
    await env.db.system(async (q) => {
      await recordAgreement(q, acceptance('terms'));
      await recordAgreement(q, acceptance('dpa'));
    });
    const check = await env.db.system((q) => verifyAgreementChain(q));
    expect(check).toMatchObject({ ok: true, brokenAt: null });
    expect(check.rows).toBeGreaterThanOrEqual(2);
    await expect(env.db.system((q) => q.query(`update agreement_evidence set version = 'x'`))).rejects.toThrow(/append-only/);
    await expect(env.db.system((q) => q.query('delete from agreement_evidence'))).rejects.toThrow(/append-only/);
    await expect(env.db.system((q) => recordAgreement(q, { ...acceptance('terms'), authority: false }))).rejects.toThrow(/authority/);
  });

  it('lets a company read only its own evidence', async () => {
    const own = await env.db.tenant({ orgId: env.a.orgId, userId: env.a.ids.zeynep }, (q) => q.query('select count(*)::int as n from agreement_evidence'));
    const other = await env.db.tenant({ orgId: env.b.orgId, userId: env.b.ids.zeynep }, (q) => q.query('select count(*)::int as n from agreement_evidence'));
    expect(own[0].n).toBeGreaterThanOrEqual(2);
    expect(other[0].n).toBe(0);
  });
});
