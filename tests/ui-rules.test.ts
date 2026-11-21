// The owner's UI rules on every page (MASTER-RULES 15), held by a static read of the code so they cannot regress:
//   - every action button carries an icon before its label (app components and the sales-site and demo-hub templates);
//   - every popup (role="dialog") has a visible Close of at least 44 × 44 and closes on Esc;
//   - every opened page of the sales site starts with Back, in the same place.
// What counts as an action button: an element styled with the `btn` class family (`btn`, `hx__btn`, `pt__btn`).
// Choice chips that are options in a list (an account picker row, a candidate to match) are not actions and are
// listed below with the reason. Segmented toggles, text links and tiles are not `btn`-styled and are not held here:
// a toggle is a choice, a text link is a link (decision, 21 Nov 2026; the localisation and UI review).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const walk = (dir: string): string[] =>
  readdirSync(join(ROOT, dir)).flatMap((n) => {
    const p = join(dir, n);
    return statSync(join(ROOT, p)).isDirectory() ? walk(p) : [p];
  });
const tsx = walk('web/src').filter((p) => p.endsWith('.tsx'));
const lineOf = (s: string, i: number) => s.slice(0, i).split('\n').length;

// Option rows in a list, not actions: they name a choice and have no verb.
const CHOICE_CHIPS = /\b(picker__opt|fin-match__fit)\b/;
const HAS_ICON = /<Icon\b|<svg\b|<Loader\b|<[A-Z]\w*Icon\b|\$\{ICON_\w+\}|\$\{icon\w*\}/;

describe('every action button has an icon and a label', () => {
  it('in the app (web/src)', () => {
    const bad: string[] = [];
    let seen = 0;
    for (const p of tsx) {
      const s = read(p);
      for (const m of s.matchAll(/<button\b/g)) {
        const end = s.indexOf('</button>', m.index);
        if (end < 0) continue;
        const el = s.slice(m.index, end);
        if (!/className=[{"`'][^>]*\bbtn\b/.test(el) || CHOICE_CHIPS.test(el)) continue;
        seen++;
        if (!HAS_ICON.test(el)) bad.push(`${relative(ROOT, join(ROOT, p))}:${lineOf(s, m.index!)}`);
      }
    }
    // The scan must see the app's buttons (about 770 on 21 Nov 2026), or it proves nothing.
    expect(seen).toBeGreaterThan(600);
    expect(bad.join('\n')).toBe('');
  });

  it('on the sales site and the demo hub (their HTML templates)', () => {
    const files = ['scripts/build-site.ts', 'scripts/site-pages.ts', 'scripts/site-chrome.ts', 'scripts/build-demo-hub.ts'];
    const bad: string[] = [];
    for (const p of files) {
      const s = read(p);
      for (const m of s.matchAll(/<(button|a)\b[^>]*class="([^"]*\bbtn\b[^"]*|[^"]*__btn\b[^"]*)"[^>]*>/g)) {
        const end = s.indexOf(`</${m[1]}>`, m.index! + m[0].length);
        const inner = s.slice(m.index! + m[0].length, end);
        if (!HAS_ICON.test(inner)) bad.push(`${p}:${lineOf(s, m.index!)}`);
      }
    }
    expect(bad.join('\n')).toBe('');
  });
});

describe('every popup has a visible Close (44 × 44) and closes on Esc', () => {
  // The banner and notice that ask for a choice close only through that choice (consent law: no pre-ticked
  // dismissal); both still answer Esc where the choice is optional (the assistant notice's "Not now").
  const CHOICE_REQUIRED = new Set(['web/src/components/ConsentBanner.tsx', 'web/src/components/AssistConsent.tsx']);
  // The shared Close (`CloseButton`, class `closex`, 44 × 44) or the tour card's own 44 × 44 Close.
  const CLOSE = /<CloseButton\b|className="closex"|className="tour__x"|<Dialog\b|<Sheet\b|<FilterSheet\b/;
  const ESC = /Escape|useDismiss\(|<Dialog\b|<Sheet\b|<FilterSheet\b/;
  it('in every file that renders role="dialog"', () => {
    const bad: string[] = [];
    for (const p of tsx) {
      const s = read(p);
      if (!/role="dialog"/.test(s) || CHOICE_REQUIRED.has(p)) continue;
      if (!CLOSE.test(s)) bad.push(`${p}: no visible Close`);
      if (!ESC.test(s)) bad.push(`${p}: Esc does not close it`);
    }
    expect(bad.join('\n')).toBe('');
  });
  it('the shared Close and the tour Close are 44 × 44, and so is the toast Close', () => {
    expect(read('web/src/patterns.css')).toMatch(/\.closex \{[^}]*inline-size: var\(--tap\); block-size: var\(--tap\)/);
    expect(read('web/src/demo/demo.css')).toMatch(/\.tour__x \{[^}]*inline-size: var\(--tap\); block-size: var\(--tap\)/);
    expect(read('web/src/styles.css')).toMatch(/\.toast__close \{[^}]*width: var\(--tap\); height: var\(--tap\)/);
    expect(read('web/src/styles.css')).toMatch(/--tap: 44px/);
  });
});

describe('every opened page of the sales site starts with Back', () => {
  it('each inner page goes through the hero (its first crumb is Back) or the Back bar', () => {
    const s = read('scripts/site-pages.ts');
    const pages = s.split('out.push({').slice(1);
    expect(pages.length).toBeGreaterThan(5);
    const bad = pages.filter((b) => !/main: `[\s\S]*?(\$\{hero\(|\$\{backBar\()/.test(b.slice(0, b.indexOf('});') + 1 || undefined)));
    expect(bad.map((b) => b.slice(0, 80)).join('\n')).toBe('');
    expect(s).toMatch(/class="ip__back"[^`]*\$\{ICON_BACK\}/);
  });
  it('the blog index and every blog post start with Back, with its icon', () => {
    const s = read('scripts/build-site.ts');
    const index = s.slice(s.indexOf('function blogIndexPage'), s.indexOf('function blogPostPage'));
    const post = s.slice(s.indexOf('function blogPostPage'));
    for (const part of [index, post]) expect(part).toMatch(/<nav class="post__back"><a href="[^"]*">\$\{ICON_BACK\}/);
  });
});
