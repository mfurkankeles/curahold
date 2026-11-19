// The help centre speaks all nine languages: help links, help search and
// CuraAI's docs answers use the person's own language, never English by
// fallback. A page a language has no translation of (developer pages, legal
// texts outside English and Turkish) is built there as the English page with
// a note (scripts/build-docs.ts), so every link the product makes resolves.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ask, prepare, type DocSection } from '../shared/src/answers';
import { HELP_LANGUAGES, helpLanguageOf, LOCALES } from '../shared/src/i18n';
import { BASE } from './assistant-eval/cases';

const ROOT = join(import.meta.dirname, '..');
const SRC = join(ROOT, 'docs', 'site');
const md = (lang: string) => readdirSync(join(SRC, lang)).filter((f) => f.endsWith('.md'));
const sectionOf = (file: string) => /^section:\s*(\S+)/m.exec(readFileSync(join(SRC, 'en', file), 'utf8'))?.[1] ?? '';

/** Pages the product links to by name outside shared/src/helpLinks.ts (which docs-coverage checks). */
const LINKED = ['setup-health', 'legal-terms', 'legal-privacy', 'legal-dpa', 'legal-kvkk', 'legal-cookies', 'legal-subprocessors', 'getting-started'];

describe('help languages', () => {
  it('are all nine languages of the product', () => {
    expect([...HELP_LANGUAGES].sort()).toEqual([...LOCALES].sort());
    for (const l of LOCALES) expect(helpLanguageOf(l), l).toBe(l);
  });

  it('each has its docs folder with the whole user guide', () => {
    const guide = md('en').filter((f) => sectionOf(f) === 'help');
    for (const l of HELP_LANGUAGES) {
      expect(existsSync(join(SRC, l)), l).toBe(true);
      expect(guide.filter((f) => !md(l).includes(f)), `${l}: user-guide pages missing`).toEqual([]);
    }
  });

  it('every page the product links to by name exists in English (so it is built in every language)', () => {
    for (const slug of LINKED) expect(existsSync(join(SRC, 'en', `${slug}.md`)), slug).toBe(true);
  });
});

describe("CuraAI's docs answers in every language", () => {
  let dir = '';
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'curahold-help-langs-'));
    execFileSync(process.execPath, ['--import', 'tsx', join(ROOT, 'scripts', 'build-docs.ts'), dir], { stdio: 'ignore', cwd: ROOT, env: { ...process.env, DOCS_DATA_ONLY: '1' } });
  }, 180_000);
  afterAll(() => dir && rmSync(dir, { recursive: true, force: true }));

  // The free docs search (no model): Latin words are stemmed, the other scripts are matched in
  // pieces (shared/src/answers.ts). Measured 19 Nov: en/tr 40/40, ar 35, fa 35, he 31, ja 36, ko 32, zh 36–37.
  const howTo = BASE.filter((b) => (b.category === 'how_to' || b.category === 'multi_step') && b.cite);
  it.each(HELP_LANGUAGES.map((l) => [l] as const))('%s answers from its own pages', (lang) => {
    const sections = JSON.parse(readFileSync(join(dir, lang, 'answers.json'), 'utf8')) as DocSection[];
    expect(sections.length, lang).toBeGreaterThan(50);
    expect(sections.every((s) => s.u.startsWith(`/docs/${lang}/`)), `${lang}: every section is under its own language`).toBe(true);
    const index = prepare(sections);
    const hits = howTo.filter((b) => ask(index, b.q[lang]!).found.slice(0, 3).some((f) => f.section.u === `/docs/${lang}/${b.cite}/`));
    const floor = lang === 'en' || lang === 'tr' ? 0.95 : 0.75;
    expect(hits.length / howTo.length, `${lang}: ${hits.length}/${howTo.length} how-to questions find their page in the top three`).toBeGreaterThanOrEqual(floor);
  });
});
