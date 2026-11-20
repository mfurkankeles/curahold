// Translation quality across every language, over every surface that has text:
// the app's dictionaries (which also carry the system e-mails, the setup
// health screens, the trial form and the demo hub), the help centre
// (docs/site/<lang>) and the sales site copy (site/content.ts, site/info).
//
//   - nothing missing and no placeholder, plural or brace mistakes;
//   - no English left untranslated (brand and product terms aside: KEEP_ENGLISH);
//   - one word per concept per language (shared/src/i18n/glossary.ts);
//   - job titles stay English;
//   - Turkish says "siz" everywhere (sentences; short labels keep the bare verb).
//
// A new language plugs in by being in LOCALES with its dictionary and a
// glossary column; nothing here lists the languages.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dictionaries, LOCALES, translate, type Locale, type MessageKey } from '../shared/src/i18n';
import { GLOSSARY, KEEP_ENGLISH, PLANNED, REGISTER, type Concept } from '../shared/src/i18n/glossary';
import { COPY, STORY_COPY } from '../site/content';
import { INFO } from '../site/info';
import { ORG_CHART as SEATS } from '../shared/src/team/orgChart';
import { OWNER_EN, OWNER_TR } from '../shared/src/i18n/owner';
import { OFFICE_EN, OFFICE_TR } from '../shared/src/i18n/ownerOffice';
import { TEAM_EN, TEAM_TR } from '../shared/src/i18n/ownerTeam';
import { CONSENT_STRINGS } from '../shared/src/consent/strings';
import { GROUPS, INTERNAL } from '../scripts/docs/catalogue';

const ROOT = join(import.meta.dirname, '..');
const en = dictionaries.en as Record<string, string>;
const dict = (l: Locale) => dictionaries[l] as Record<string, string>;
const others = LOCALES.filter((l) => l !== 'en');
const LATIN = new Set<Locale>(['en', 'tr']);

/** Every string in a nested copy object, keyed by its path. */
function leaves(value: unknown, path = '', out = new Map<string, string>()): Map<string, string> {
  if (typeof value === 'string') out.set(path, value);
  else if (Array.isArray(value)) value.forEach((v, i) => leaves(v, `${path}.${i}`, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) leaves(v, path ? `${path}.${k}` : k, out);
  return out;
}

/** The help centre's text in a language: every page, without code blocks, links and picture paths. */
function docsText(l: Locale): Map<string, string> {
  const dir = join(ROOT, 'docs', 'site', l);
  const out = new Map<string, string>();
  if (!existsSync(dir)) return out;
  // Legal texts are the lawyer's: reviewed for flags only, never rewritten to pass a check.
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md') && !x.startsWith('legal-'))) {
    const text = readFileSync(join(dir, f), 'utf8')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      // Another product's menus, quoted in bold as the reader sees them (often in English).
      .replace(/\*\*[^*]*\*\*/g, ' ')
      .replace(/`[^`]*`/g, ' ')
      .replace(/\]\([^)]*\)/g, ']')
      .replace(/\{#[\w-]+\}/g, ' ');
    out.set(`docs/${l}/${f}`, text);
  }
  return out;
}

/** The sales site's words in a language. */
function siteText(l: Locale): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of leaves(COPY[l] ?? {})) out.set(`site.${k}`, v);
  for (const [k, v] of leaves(STORY_COPY[l] ?? {})) out.set(`story.${k}`, v);
  for (const [k, v] of leaves((INFO as Record<string, unknown>)[l] ?? {})) out.set(`info.${k}`, v);
  return out;
}

const matcher = (w: string) => (w.startsWith('/') && w.endsWith('/') ? new RegExp(w.slice(1, -1), 'u') : { test: (s: string) => s.includes(w) });

describe('number agreement (CLDR plural rules)', () => {
  it('Arabic puts the counted noun in the form its number needs', () => {
    const ar = (key: string, n: number) => translate('ar', key as MessageKey, { n });
    expect([5, 30, 100, 365].map((n) => ar('home.within', n))).toEqual(['خلال 5 أيام', 'خلال 30 يومًا', 'خلال 100 يوم', 'خلال 365 يومًا']);
    expect([5, 30].map((n) => ar('portal.admin.days', n))).toEqual(['5 أيام', '30 يومًا']);
    expect([5, 12].map((n) => ar('nav.setupLeft', n))).toEqual(['بقيت 5 خطوات', 'بقيت 12 خطوة']);
    expect(translate('en', 'home.within', { n: 30 })).toBe('within 30 days');
  });
});

describe('English singular after a count of one', () => {
  // A renewals list said "1 renewals": the noun after a count of exactly one is singular in English.
  const en = (key: MessageKey, n: number) => translate('en', key, { n });
  it('says "1 renewal", "1 day", "1 reply", and keeps the plural otherwise', () => {
    expect([1, 2].map((n) => en('acards.renewalsCount', n))).toEqual(['1 renewal', '2 renewals']);
    expect([1, 7].map((n) => en('time.daysAgo', n))).toEqual(['1 day ago', '7 days ago']);
    expect(en('portal.replies', 1)).toBe('1 reply');
    expect(en('repeat.dayN', 1)).toBe('Every 1 day');
    expect(translate('ar', 'acards.renewalsCount', { n: 1 })).toBe('1 تجديد');
    expect(translate('tr', 'acards.renewalsCount', { n: 1 })).toBe('1 yenileme');
  });
});

describe('Hebrew singular after a count of one', () => {
  // "1 ימים", "1 משימות הועברו": for exactly one Hebrew says the noun, then "one" in its gender, and the verb agrees.
  const he = (key: MessageKey, vars: Record<string, number>) => translate('he', key, vars);
  it('says "יום אחד", "משימה אחת הועברה", and keeps the count otherwise', () => {
    expect(he('time.daysAgo', { n: 1 })).toBe('לפני יום אחד');
    expect(he('time.daysAgo', { n: 4 })).toBe('לפני 4 ימים');
    expect(he('board.bulk.moved', { n: 1 })).toBe('משימה אחת הועברה.');
    expect(he('board.bulk.moved', { n: 2 })).toBe('2 משימות הועברו.');
    expect(he('import.problems', { n: 1 })).toBe('שורה אחת דורשת בדיקה');
    expect(he('conn.linkedPeople', { n: 1 })).toBe('אדם מקושר אחד');
    expect(he('setup.minutesLeft', { n: 1 })).toBe('נותרה כדקה אחת');
    // A one-letter prefix joins the word ("בשורה"); before a numeral it keeps its hyphen ("ב-3").
    expect(he('sh.import.badDates.problem', { n: 1 })).toMatch(/^בשורה אחת /);
    expect(he('sh.import.badDates.problem', { n: 3 })).toMatch(/^ב-3 שורות /);
    expect(he('auto.when.account_every.text', { n: 1 })).toMatch(/^כל יום /);
  });
  it('no Hebrew string shows "1" before a plural noun it knows', () => {
    const d = dictionaries.he as Record<string, string>;
    const bad = Object.keys(d)
      .filter((k) => !k.endsWith('.one'))
      .flatMap((k) => [...d[k].matchAll(/\{(\w+)\}/g)].map((m) => [k, translate('he', k as MessageKey, { [m[1]]: 1 })] as const))
      .filter(([, s]) => /(^|[^\d])1 (ימים|משימות|שורות|אנשים|קבצים|שבועות|פעמים|לקוחות|דקות|שעות)(?![\p{L}])/u.test(s));
    expect(bad.map(([k, s]) => `${k}: ${s}`).join('\n')).toBe('');
  });
});

describe('dictionaries: completeness and shape', () => {
  it.each(others.map((l) => [l] as const))('%s has every key, and none English does not have', (l) => {
    const own = dict(l);
    expect(Object.keys(en).filter((k) => !(k in own)), 'missing').toEqual([]);
    expect(Object.keys(own).filter((k) => !(k in en)), 'extra').toEqual([]);
  });

  it.each(LOCALES.map((l) => [l] as const))('%s: every brace is a {placeholder}, no ICU syntax, no stray braces', (l) => {
    const bad = Object.entries(dict(l)).filter(([, v]) => {
      const rest = v.replace(/\{\w+\}/g, '');
      return /[{}]/.test(rest);
    });
    expect(bad.map(([k, v]) => `${k}: ${v.slice(0, 60)}`).join('\n')).toBe('');
  });

  it.each(LOCALES.map((l) => [l] as const))('%s: a ".one" form belongs to a counted string (its base key, ".other" or ".many")', (l) => {
    const d = dict(l);
    const bad = Object.keys(d).filter((k) => k.endsWith('.one') && !(k.slice(0, -4) in en) && !(`${k.slice(0, -4)}.other` in en) && !(`${k.slice(0, -4)}.many` in en));
    expect(bad.join('\n')).toBe('');
  });
});

// Strings that rightly read the same as English in some language: names,
// standards, sample file names and addresses, and words the market writes in
// English (the glossary's "english" column). A new identical string fails.
const SAME_AS_ENGLISH = new Set([
  'task.priority.normal', 'ob.urgency.normal', 'settings.company.logo', 'portal.admin.logo', 'export.xlsx', 'export.csv', 'portal.english', 'portal.turkish',
  'portal.method.google', 'portal.method.microsoft', 'portal.method.passkey', 'portal.admin.m.google', 'portal.admin.m.microsoft',
  'metrics.mrr', 'metrics.arr', 'metrics.dau', 'metrics.wau', 'metrics.mau', 'platform.tile.mrr', 'platform.tile.arr', 'task.history.system', 'ob.side.vendor.self',
  'recordPanel.playbook', 'billing.plan.team', 'billing.plan.business', 'ask.nav', 'cura.name', 'demo.tour.area.ai', 'pm.sprint', 'pm.backlog', 'pm.stage.backlog', 'pm.stage.qa', 'pm.stage.uat',
  'support.field.front.token', 'nav.platform', 'platform.col.plan', 'platform.sub.plan', 'founder.area.crm', 'trial.tools.crm', 'sso.protocol.saml', 'sso.protocol.oidc',
  'tpl.onboarding', 'dept.onboarding', 'imp.dept.onboarding', 'demo.intent.team.onboarding', 'flow.dept.onboarding', 'tpl.premium', 'tpl.it', 'rtype.linkedin', 'rtype.risk', 'demo.bar.tag',
  'ob.view.sponsor', 'ob.role.sponsor', 'trial.hint.linkedin', 'sync.rtype.id',
  'analytics.guide.powerbi', 'analytics.guide.excel', 'analytics.guide.fabric', 'analytics.guide.tableau', 'analytics.guide.lookerstudio', 'analytics.guide.qlik', 'analytics.guide.zoho',
  'analytics.tool.powerquery', 'analytics.tool.tableau', 'analytics.tool.qlik', 'analytics.tool.zoho', 'analytics.tool.lookerstudio', 'analytics.tool.domo', 'analytics.tool.sap',
  // Field names exactly as the identity provider, Git host or CRM shows them.
  'support.field.parasut.clientId', 'support.field.parasut.clientSecret', 'support.field.gmail.refreshToken', 'support.field.outlook.refreshToken',
  'sso.oidc.issuer', 'sso.oidc.authUrl', 'sso.oidc.tokenUrl', 'sso.oidc.clientId', 'sso.oidc.clientSecret', 'sso.oidc.jwksUrl', 'sso.sp.redirectUri', 'sso.scim.token', 'devtools.hook.url', 'dev.hooks.title',
  // Sample files and example addresses.
  'auth.emailPlaceholder', 'billing.profile.billingEmailPlaceholder', 'import.sample.file', 'import.sample.row1', 'timport.sampleFile', 'imp.templateFile', 'imp.csv.file',
  // Units.
  'pm.points.short.one', 'weeks.pts',
  // Job titles stay English in every language (owner, 19 Nov).
  'flow.demo.titleOps', 'flow.demo.titleBuy',
  // A keyboard key, named as printed on it.
  'pm.plan.keySpace',
]);
// Words a language writes exactly as English does, because they are its own words too
// (Malay "status", "data", "menu", "agenda", "media", "item" are standard Malay; DBP).
const SAME_IN: Partial<Record<Locale, Set<string>>> = {
  ms: new Set([
    'sh.gate.title', 'ob.phase.golive', 'task.status', 'settings.people.status', 'import.untitled', 'accounts.import', 'accounts.importTitle', 'board.importShort', 'sync.tab.status',
    'fields.colorName.plum', 'support.region.au', 'portal.people.status', 'portal.status', 'nav.menu', 'docs.menu', 'rb.format.matrix', 'meetings.minutes',
    'calendar.minutes', 'desk.replay.length', 'plannedForm.agenda', 'pm.flow.medianShort', 'platform.col.status', 'platform.sub.status', 'pm.burndown',
    'pm.burndown.ideal', 'tpl.idea', 'tpl.standard', 'rtype.neutral', 'rtype.status', 'rsrc.status', 'settings.audit.entity', 'trial.dept.onboarding',
    'trial.industry.media', 'dept.onboarding', 'fin.inv.status', 'ob.phase.data', 'ob.issueType.data', 'ob.report.data',
  ]),
};

describe('no English left untranslated', () => {
  it.each(others.map((l) => [l] as const))('%s: no dictionary string still reads exactly as in English', (l) => {
    const d = dict(l);
    const same = Object.keys(d).filter((k) => d[k] === en[k] && /[A-Za-z]{2,}/.test(en[k].replace(/\{\w+\}/g, '')) && !SAME_AS_ENGLISH.has(k) && !SAME_IN[l]?.has(k));
    expect(same.join('\n')).toBe('');
  });

  // A run of English words inside another language: an untranslated sentence or
  // example. Third-party menus quoted as the user sees them are allowed per key.
  const QUOTES_UI = /^(conn\.where\.|support\.how\.|me\.calendarHow|dev\.ai\.|devtools\.hook\.|fin\.steps\.|quick\.help\.|settings\.find\.)/;
  const keep = new Set(KEEP_ENGLISH.map((w) => w.toLowerCase()));
  const SMALL = /\b(the|and|your|you|with|this|that|from|are|will|have|please|when|which|into)\b/i;
  const englishRun = (s: string) => {
    const plain = s.replace(/\{\w+\}/g, ' ').replace(/https?:\/\/\S+|\S+@\S+|[\w.-]+\.(com|net|io|csv|sh)\b/g, ' ');
    for (const m of plain.matchAll(/[A-Za-z][A-Za-z'’-]*(?:[ ,]+[A-Za-z][A-Za-z'’-]*){2,}/g)) {
      const words = m[0].split(/[ ,]+/).filter((w) => !keep.has(w.toLowerCase()) && !/^[A-Z0-9]+$/.test(w));
      if (words.length >= 3 && SMALL.test(m[0])) return m[0];
    }
    return null;
  };
  it.each(others.map((l) => [l] as const))('%s: no English sentence inside the app, help or site text', (l) => {
    const found: string[] = [];
    for (const [k, v] of Object.entries(dict(l))) if (!QUOTES_UI.test(k) && englishRun(v)) found.push(`${k}: «${englishRun(v)}»`);
    if (!LATIN.has(l)) {
      for (const [k, v] of siteText(l)) if (englishRun(v)) found.push(`${k}: «${englishRun(v)}»`);
      for (const [file, text] of docsText(l))
        for (const line of text.split('\n')) if (englishRun(line) && !/^---|^(title|summary|section|order):/.test(line)) found.push(`${file}: «${englishRun(line)}»`);
    }
    expect(found.join('\n')).toBe('');
  });
});

describe('one word per concept (shared/src/i18n/glossary.ts)', () => {
  it('has a column for every language the product ships, and the planned ones are not shipped yet', () => {
    for (const c of GLOSSARY) for (const l of others) expect(c.terms[l]?.use, `${c.id} ${l}`).toBeTruthy();
    for (const l of LOCALES) expect(REGISTER[l], l).toBeTruthy();
    for (const p of PLANNED) expect((LOCALES as readonly string[]).includes(p), `${p} ships now: move it out of PLANNED`).toBe(false);
  });

  const where = (c: Concept, l: Locale): Map<string, string> => {
    const out = new Map<string, string>();
    for (const [k, v] of Object.entries(dict(l))) if (c.scope === 'everywhere' || c.match.test(en[k] ?? '')) out.set(k, v);
    if (c.scope === 'everywhere') for (const m of [docsText(l), siteText(l)]) for (const [k, v] of m) out.set(k, v);
    return out;
  };
  // Search keywords list every synonym on purpose, so people find the screen with whichever word they type.
  const SYNONYMS_ON_PURPOSE = /^settings\.find\./;

  it.each(LOCALES.map((l) => [l] as const))('%s writes each concept with its one word', (l) => {
    const found: string[] = [];
    for (const c of GLOSSARY) {
      const avoid = c.terms[l]?.avoid ?? [];
      if (!avoid.length) continue;
      for (const [k, v] of where(c, l)) {
        if (SYNONYMS_ON_PURPOSE.test(k)) continue;
        for (const a of avoid) if (matcher(a).test(v)) found.push(`${c.id}: ${k} has "${a}" (write "${c.terms[l]!.use}")`);
      }
    }
    expect(found.join('\n')).toBe('');
  });
});

describe('job titles stay English (owner, 19 Nov)', () => {
  it('every seat title is written in English only', () => {
    // Every letter Latin, and no Turkish letters (the console's other language).
    for (const s of SEATS) expect(/[^\P{L}\p{Script=Latin}]|[ğışçöĞİŞÇÖ]/u.test(s.title), `${s.seat}: ${s.title}`).toBe(false);
  });
  it('no Turkish console text translates a seat title', () => {
    const titles = new Set(SEATS.map((s) => s.title));
    const en = OWNER_EN as Record<string, string>;
    const tr = OWNER_TR as Record<string, string>;
    const changed = Object.keys(en).filter((k) => titles.has(en[k]) && tr[k] !== en[k]);
    expect(changed.join('\n')).toBe('');
  });
});

describe('Turkish register', () => {
  // Turkish says "siz" everywhere, in the product as on the first-contact surfaces (owner, 20 Nov 2026;
  // shared/src/i18n/glossary.ts REGISTER). Short button and menu labels keep the bare verb Turkish
  // interfaces use ("Kaydet", "Görev ekle"): a label, not an address. Every sentence says "siz".
  // JavaScript's \b does not know Turkish letters, so the edges are written out.
  const L = '[a-zçğıöşüâîû]';
  const SEN = [
    // Pronouns of "sen" (kendine/kendini are left out: also third person).
    new RegExp(`(?<!${L})(sen|seni|sana|senin|sende|senden|seninle|seninki${L}*|kendin)(?!${L})`, 'i'),
    // Verbs in the second person singular: -abilirsin, -iyorsun, -acaksın, -malısın, -mışsın, the aorist.
    new RegExp(`${L}{2,}([ıiuü]yor|abilir|ebilir|amaz|emez|acak|ecek|malı|meli|mış|miş|muş|müş|[ıiuü]r|[ae]r|maz|mez)s[ıiuü]n(?!${L})`, 'i'),
    // If-clauses (-iyorsan, -irsen) and questions (misin), "hazırsın".
    new RegExp(`${L}{2,}(yor|[ıiuüae]r|ma|me|maz|mez|y)(san|sen)(?!${L})|(?<!${L})(mısın|misin|musun|müsün|hazırsın|değilsin)(?!${L})`, 'i'),
    // "your" on a participle: "yaptığın", "istediğin", "göreceğin" (sentences say "yaptığınız").
    // Two nouns whose genitive looks the same are let through.
    new RegExp(`(?<!${L})(?!(betiğin|koltuğun)(?!${L}))${L}{2,}(dığ|diğ|duğ|düğ|tığ|tiğ|tuğ|tüğ|eceğ|acağ)[ıiuü]n(?!${L})`, 'i'),
    // A sentence or clause that ends in a bare imperative ("… tekrar dene.", "… giriş yap;"): sentences say "deneyin".
    // "You have/need" on a "your" noun: "ihtiyacın var", "değişikliklerin var" (sentences say "ihtiyacınız var").
    // Nouns that end in -un/-in themselves ("sorun yok", "sütun yok") are let through.
    new RegExp(`(?<!${L})(?!(sorun|sütun|tahmin|metin|ürün|oyun) )${L}{3,}[ıiuü]n (var|yok)(?!${L})`, 'i'),
    // "with your …": "kimlik sağlayıcınla", "verinle", "cümlelerinle" (sentences say "verinizle").
    // "bununla", "kiminle", "sizinle" and nouns on -un/-in ("sorunla", "metinle") are let through.
    new RegExp(`(?<!${L})(?!(şunun|bunun|onun|kimin|sizin|bizim|sorun|sütun|tahmin|metin|ürün|oyun)l[ae](?!${L}))${L}{3,}[ıiuü]n(la|le)(?!${L})`, 'i'),
    // "yours": "senindir", "seninkiler".
    new RegExp(`(?<!${L})senin${L}+`, 'i'),
    new RegExp(`(?<!${L})(dene|seç|yaz|gir|iste|ekle|kaydet|gönder|bağla|bak|tıkla|kopyala|yapıştır|sürükle|bırak|aç|kapat|sil|değiştir|kaldır|indir|yükle|onayla|paylaş|başla|bekle|kullan|ver|al|sor|dön|bas|kur|kontrol et|devam et|davet et|göz at|yap|güncelle|iptal et|başlat|gör|koy|yolla|düzelt|belirt|daralt|grupla|eşleştir|yerleştir|kaydır|vurgula|ilişkilendir|abone ol|yenile|seçip|oluştur)[.!?;](?=\\s|$)`, 'i'),
  ];
  // "Your …" on a noun looks like the third person or a genitive in Turkish ("raporların" is "your reports"
  // and "of the reports"; "hesabına" is "to your account" and "to his account"). So these count only where the
  // English says "you": then the Turkish must say "raporlarınız", "hesabınıza".
  const YOUR = [
    // Plural nouns and "what you did": "Raporların", "Görevlerin", "Sildiklerin", "favorilerinde", "Hesaplarını".
    new RegExp(`(?<!${L})${L}{2,}(lar|ler)[ıi]n(ı|i|a|e|da|de|dan|den|daki|deki|la|le)?(?!${L})`, 'i'),
    // Singular nouns with a case: "hesabına", "Cevabını", "Onayını", "şirketindeki", "sekmende", "verinden".
    new RegExp(`(?<!${L})${L}{3,}([ıiuü]n|[aeıioöuü]n)(a|e|ı|i|u|ü|da|de|dan|den|daki|deki)(?!${L})`, 'i'),
    // Bare "your" on a noun that opens a title or ends a phrase: "Haftan:", "Koltuğun …", "Görevlerin", "Önünde".
    new RegExp(`(^|[.:;!?]\\s+)${L}{3,}([ıiuü]n|[ae]n)(?=[\\s:,.]|$)`, 'i'),
    // "Your" closing a short label: "Sıradaki görevin", "Bu panoya önceki aktarımların".
    new RegExp(`\\s${L}{3,}[ıiuü]n$`, 'i'),
    // Words that read as "your" in any sentence: "Önünde bekleyen iş", "haberin olacak", "ekibinin kullandığı".
    new RegExp(`(?<!${L})(önünde|haberin|ekibinin|ekibinde|şirketinin|şirketindeki|hesabına|koltuğun|haftan)(?!${L})`, 'i'),
    // "You are …" on a noun or adjective: "Çevrimdışısın", "Çevrimiçisin".
    new RegExp(`(?<!${L})${L}{4,}[ıiuü]s[ıiuü]n(?!${L})`, 'i'),
  ];
  const YOU_EN = /\byou(r|rs|'re|'ve|'ll)?\b/i;
  // A sentence that already says "siz" somewhere uses the third person for the rest ("şirketinizin planında").
  // So does one that ends a clause in the polite imperative ("… kopyalayın.", "Kaydetmeden önce görün").
  const SIZ = new RegExp(`n[ıiuü]z|(?<!${L})siz|${L}{2,}[ıiuü]n([.!?:,]?(\\s|$))`, 'i');
  // Read here as "your", these say "the" or "its": "Ücretsiz denemenin bitmesine" (until the trial ends),
  // "Fırsatın CRM'deki kimliği" (the deal's id), "asistanına sormadan önce" (before asking the assistant).
  const NOT_YOUR = new Set([
    'sh.sync.mappingIncomplete.why', 'auto.paused', 'timport.peopleMissing', 'billing.bar.trial', 'demo.tour.curaai.4.title',
    'agreements.title', 'assist.opt.contacts_customer', 'assistConsent.title', 'settings.about.departments', 'demo.tour.sprint.4.body',
    'hooks.field.dealId', 'flow.draft.byAssistant', 'quick.unknownTitle', 'settings.roles.seeAsWho',
  ]);
  const sen = (text: string, english: string, key = '') =>
    SEN.some((re) => re.test(text)) || (YOU_EN.test(english) && !NOT_YOUR.has(key) && !SIZ.test(text) && YOUR.some((re) => re.test(text)));
  it('no Turkish string says "sen"', () => {
    const tr = dict('tr');
    const en = dict('en');
    const bad = Object.keys(tr).filter((k) => sen(tr[k], en[k] ?? '', k));
    expect(bad.map((k) => `${k}: ${tr[k].slice(0, 80)}`).join('\n')).toBe('');
  });
  // The owner's console speaks Turkish too, and "siz" there as everywhere (owner, 20 Nov 2026).
  it('no Turkish string in the owner console says "sen"', () => {
    const blocks: [Record<string, string>, Record<string, string>][] = [
      [OWNER_TR, OWNER_EN],
      [OFFICE_TR, OFFICE_EN],
      [TEAM_TR, TEAM_EN],
    ];
    const bad = blocks.flatMap(([tr, en]) => Object.keys(tr).filter((k) => typeof tr[k] === 'string' && sen(tr[k], String(en[k] ?? ''), k)).map((k) => `${k}: ${tr[k].slice(0, 80)}`));
    expect(bad.join('\n')).toBe('');
  });
  // The cookie banner's words are the consent proof (their hash is stored with each choice), and the first thing a
  // visitor reads; the public API reference is generated from the catalogue's Turkish column. Both say "siz" too.
  it('no Turkish cookie-banner string or API reference line says "sen"', () => {
    const tr = CONSENT_STRINGS.tr as unknown as Record<string, string>;
    const enC = CONSENT_STRINGS.en as unknown as Record<string, string>;
    const bad = Object.keys(tr).filter((k) => sen(tr[k], enC[k] ?? '', k)).map((k) => `consent ${k}: ${tr[k].slice(0, 80)}`);
    const pairs: [string, string, string][] = [
      ...GROUPS.flatMap((g) => g.routes.map(([route, e, t]) => [route, e, t] as [string, string, string])),
      ...Object.entries(INTERNAL).map(([route, [e, t]]) => [route, e, t] as [string, string, string]),
    ];
    for (const [route, e, t] of pairs) if (sen(t, e)) bad.push(`api ${route}: ${t.slice(0, 80)}`);
    expect(bad.join('\n')).toBe('');
  });
  // The help centre and the sales site are first-contact surfaces too: a reader who meets "sen" in the
  // docs after "siz" in the app sees two products (owner, 20 Nov 2026). Line by line, so a failure names it.
  it('no Turkish help page or site text says "sen"', () => {
    const found: string[] = [];
    for (const [file, text] of docsText('tr'))
      text.split('\n').forEach((line, i) => {
        if (SEN.some((re) => re.test(line))) found.push(`${file}:${i + 1}: ${line.trim().slice(0, 90)}`);
      });
    for (const [k, v] of siteText('tr')) if (SEN.some((re) => re.test(v))) found.push(`${k}: ${v.slice(0, 90)}`);
    expect(found.join('\n')).toBe('');
  });
});
