// Every place in the product has a help page and an assistant evaluation case
// (shared/src/helpLinks.ts), so a new menu entry, screen, settings section or
// public API area cannot ship without both. CuraAI answers from the help pages,
// so a page here is also what the assistant knows.
//
// To fix a failure: add the place to shared/src/helpLinks.ts with its page and
// at least one case in tests/assistant-eval/cases.ts that cites the page (in
// all eleven languages), or, for something no customer sees, a line in
// NOT_FOR_HELP with the reason.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { API_HELP, LEGAL_PAGES, NAV_HELP, NOT_FOR_HELP, SCREEN_HELP, SETTINGS_HELP, type HelpLink } from '../shared/src/helpLinks';
import { LOCALES } from '../shared/src/i18n';
import { SETTINGS_TOPICS } from '../web/src/lib/settingsIndex';
import { GROUPS, INTERNAL } from '../scripts/docs/catalogue';
import { readRoutes } from '../scripts/docs/routes';
import { BASE } from './assistant-eval/cases';

const DOCS = join('docs', 'site');
const page = (lang: string, slug: string) => join(DOCS, lang, `${slug}.md`);
const sectionOf = (slug: string) => /^section:\s*(\S+)/m.exec(readFileSync(page('en', slug), 'utf8'))?.[1] ?? '';

/** The menu's entries: the first argument of every link(...) in the shell, `${…}` written as `:id`, `:type`. */
function navEntries(): string[] {
  const src = readFileSync(join('web', 'src', 'components', 'Shell.tsx'), 'utf8');
  const out = new Set<string>();
  for (const m of src.matchAll(/\blink\(\s*(['`])(\/[^'`]*)\1/g)) out.add(m[2].replace(/\$\{[^}]*?ty\.key\}/g, ':type').replace(/\$\{[^}]*\}/g, ':id'));
  for (const m of src.matchAll(/href="(\/[a-z-/]*)"/g)) out.add(m[1]);
  return [...out];
}

/** The app's screens: every address App.tsx matches. */
function screens(): string[] {
  const src = readFileSync(join('web', 'src', 'App.tsx'), 'utf8');
  const out = new Set<string>();
  for (const m of src.matchAll(/path === '(\/[^']*)'/g)) out.add(m[1]);
  for (const m of src.matchAll(/match\('(\/[^']*)'/g)) out.add(m[1]);
  return [...out];
}

/** Public API areas: the first part of the address of every route the developer reference describes. */
function apiAreas(): string[] {
  const described = new Set(GROUPS.flatMap((g) => g.routes.map(([k]) => k)));
  const out = new Set<string>();
  for (const r of readRoutes()) if (r.api && described.has(`${r.method} ${r.path}`)) out.add(r.path.split('/')[1]);
  return [...out];
}

/** What is wrong with one link, or nothing. */
function problems(where: string, l: HelpLink): string[] {
  const out: string[] = [];
  if (!existsSync(page('en', l.page))) return [`${where}: docs/site/en/${l.page}.md does not exist`];
  // The user guide is whole in every help language; developer pages are kept in English and Turkish (build-docs.ts).
  const langs = sectionOf(l.page) === 'help' ? LOCALES : (['en', 'tr'] as const);
  for (const lang of langs) {
    if (!existsSync(page(lang, l.page))) out.push(`${where}: ${l.page} is missing in ${lang}`);
    else if (l.anchor && !readFileSync(page(lang, l.page), 'utf8').includes(`{#${l.anchor}}`)) out.push(`${where}: ${lang}/${l.page} has no heading {#${l.anchor}}`);
  }
  if (!l.evals.length) out.push(`${where}: no assistant evaluation case`);
  for (const id of l.evals) if (!BASE.some((c) => c.id === id)) out.push(`${where}: evaluation case ${id} does not exist`);
  if (!l.evals.some((id) => BASE.find((c) => c.id === id)?.cite === l.page)) out.push(`${where}: none of its cases (${l.evals.join(', ')}) cites ${l.page}`);
  return out;
}

describe('every place in the product has a help page and an assistant case', () => {
  it('every menu entry', () => {
    const found = navEntries();
    expect(found.length).toBeGreaterThan(15);
    const missing = found.filter((p) => !NAV_HELP[p] && !NOT_FOR_HELP[`nav:${p}`]);
    expect(missing, 'add these to NAV_HELP in shared/src/helpLinks.ts').toEqual([]);
    expect(Object.entries(NAV_HELP).flatMap(([k, l]) => problems(`nav ${k}`, l))).toEqual([]);
  });

  it('every screen', () => {
    const found = screens();
    expect(found.length).toBeGreaterThan(30);
    const missing = found.filter((p) => !SCREEN_HELP[p] && !NOT_FOR_HELP[`screen:${p}`]);
    expect(missing, 'add these to SCREEN_HELP in shared/src/helpLinks.ts').toEqual([]);
    expect(Object.entries(SCREEN_HELP).flatMap(([k, l]) => problems(`screen ${k}`, l))).toEqual([]);
  });

  it('every settings section', () => {
    const missing = SETTINGS_TOPICS.map((x) => x.key).filter((k) => !SETTINGS_HELP[k]);
    expect(missing, 'add these to SETTINGS_HELP in shared/src/helpLinks.ts').toEqual([]);
    expect(Object.entries(SETTINGS_HELP).flatMap(([k, l]) => problems(`settings ${k}`, l))).toEqual([]);
  });

  it('every public API area', () => {
    const found = apiAreas();
    expect(found.length).toBeGreaterThan(40);
    const missing = found.filter((a) => !API_HELP[a] && !INTERNAL[a]);
    expect(missing, 'add these to API_HELP in shared/src/helpLinks.ts').toEqual([]);
    expect(Object.entries(API_HELP).flatMap(([k, l]) => problems(`api /${k}`, l))).toEqual([]);
  });

  it('every legal page the product and the site link to, in every help language', () => {
    const missing = LEGAL_PAGES.flatMap((slug) => LOCALES.filter((l) => !existsSync(page(l, slug))).map((l) => `${l}/${slug}`));
    expect(missing).toEqual([]);
    const all = readdirSync(join(DOCS, 'en')).filter((f) => f.startsWith('legal-')).map((f) => f.replace(/\.md$/, ''));
    expect([...LEGAL_PAGES].sort(), 'LEGAL_PAGES lists every legal page of the docs').toEqual(all.sort());
  });

  it('keeps no stale entries, and every exception says why', () => {
    const nav = new Set(navEntries());
    const scr = new Set(screens());
    const api = new Set(apiAreas());
    expect(Object.keys(NAV_HELP).filter((k) => !nav.has(k)), 'NAV_HELP lists entries the menu no longer has').toEqual([]);
    expect(Object.keys(SCREEN_HELP).filter((k) => !scr.has(k)), 'SCREEN_HELP lists screens App.tsx no longer has').toEqual([]);
    expect(Object.keys(API_HELP).filter((k) => !api.has(k)), 'API_HELP lists areas the API no longer has').toEqual([]);
    for (const [k, why] of Object.entries(NOT_FOR_HELP)) expect(why.length > 20, k).toBe(true);
    for (const [k, [en, tr]] of Object.entries(INTERNAL)) expect(en.length > 5 && tr.length > 5, k).toBe(true);
  });
});

/**
 * The owner's style for illustrated guides: one action per numbered step, each followed by its own
 * picture of the screen with the click target ringed (scripts/docs/shots.ts), and every value to type
 * in a copy-button block. A page that has picture steps keeps them all illustrated, in every language.
 */
describe('illustrated guides keep their pictures', () => {
  const GUIDES = ['setup-health', 'onboarding-hub', 'departments', 'handover-and-requests', 'moving-in', 'team-load', 'automations'];
  const helpPages = readdirSync(join(DOCS, 'en')).filter((f) => f.endsWith('.md') && sectionOf(f.slice(0, -3)) === 'help').map((f) => f.slice(0, -3));

  it('the guides of 16–19 November are illustrated', () => {
    for (const g of GUIDES) expect(readFileSync(page('en', g), 'utf8').includes('](img/'), g).toBe(true);
  });

  it.each(LOCALES.map((l) => [l] as const))('%s: every numbered step on an illustrated page has its own picture, and it exists', (lang) => {
    const bad: string[] = [];
    for (const slug of helpPages) {
      if (!existsSync(page(lang, slug))) continue;
      const md = readFileSync(page(lang, slug), 'utf8').replace(/```[\s\S]*?```/g, '');
      if (!md.includes('](img/')) continue;
      const lines = md.split('\n');
      lines.forEach((line, i) => {
        if (!/^\d+\. /.test(line)) return;
        // The step's own lines, up to the next step, heading or blank line.
        const own: string[] = [];
        for (let j = i + 1; j < lines.length && /^\s{2,}\S/.test(lines[j]); j++) own.push(lines[j]);
        const pic = own.find((x) => /!\[[^\]]+\]\(img\/[\w-]+\.webp\)/.test(x));
        const inSection = (() => {
          // Only sections that are guides: a section with at least one picture.
          let a = i;
          while (a > 0 && !/^##? /.test(lines[a])) a--;
          let b = i + 1;
          while (b < lines.length && !/^##? /.test(lines[b])) b++;
          return lines.slice(a, b).some((x) => x.includes('](img/'));
        })();
        if (!inSection) return;
        if (!pic) bad.push(`${lang}/${slug}: step "${line.slice(0, 50)}" has no picture of its own`);
        else {
          const file = /\(img\/([\w-]+\.webp)\)/.exec(pic)![1];
          if (!existsSync(join(DOCS, lang, 'img', file))) bad.push(`${lang}/${slug}: img/${file} is missing (scripts/docs/shots.ts)`);
        }
      });
    }
    expect(bad).toEqual([]);
  });
});
