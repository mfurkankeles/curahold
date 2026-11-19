// Translation quality across every language, over every surface that has text:
// the app's dictionaries (which also carry the system e-mails, the setup
// health screens, the trial form and the demo hub), the help centre
// (docs/site/<lang>) and the sales site copy (site/content.ts, site/info).
//
//   - nothing missing and no placeholder, plural or brace mistakes;
//   - no English left untranslated (brand and product terms aside: KEEP_ENGLISH);
//   - one word per concept per language (shared/src/i18n/glossary.ts);
//   - job titles stay English;
//   - Turkish says "siz" on the first-contact surfaces.
//
// A new language plugs in by being in LOCALES with its dictionary and a
// glossary column; nothing here lists the languages.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dictionaries, LOCALES, type Locale } from '../shared/src/i18n';
import { GLOSSARY, KEEP_ENGLISH, PLANNED, REGISTER, type Concept } from '../shared/src/i18n/glossary';
import { COPY, STORY_COPY } from '../site/content';
import { INFO } from '../site/info';
import { ORG_CHART as SEATS } from '../shared/src/team/orgChart';
import { OWNER_EN, OWNER_TR } from '../shared/src/i18n/owner';

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
  'tpl.onboarding', 'imp.dept.onboarding', 'demo.intent.team.onboarding', 'flow.dept.onboarding', 'tpl.premium', 'tpl.it', 'rtype.linkedin', 'rtype.risk', 'demo.bar.tag',
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
]);

describe('no English left untranslated', () => {
  it.each(others.map((l) => [l] as const))('%s: no dictionary string still reads exactly as in English', (l) => {
    const d = dict(l);
    const same = Object.keys(d).filter((k) => d[k] === en[k] && /[A-Za-z]{2,}/.test(en[k].replace(/\{\w+\}/g, '')) && !SAME_AS_ENGLISH.has(k));
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
  // The first-contact surfaces speak "siz" (B2B norm); the in-app product is still "sen" (owner question).
  const FIRST_CONTACT = /^(auth|signup|join|trial|trialMail|email|start)\./;
  const SEN = /(\b(sen|sana|seni|senin|sende|senden)\b|[a-zçğıöşü]{2,}(abilir|ebilir)sin\b|\b(istersen|istemediysen|yoksa sen)\b)/i;
  it('first-contact strings never say "sen"', () => {
    const tr = dict('tr');
    const bad = Object.keys(tr).filter((k) => FIRST_CONTACT.test(k) && SEN.test(tr[k]));
    expect(bad.map((k) => `${k}: ${tr[k].slice(0, 80)}`).join('\n')).toBe('');
  });
});
