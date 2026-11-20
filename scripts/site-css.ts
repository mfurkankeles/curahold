// The sales site's styles, cut to what each kind of page uses (scripts/build-site.ts calls it).
// The four hand-written sheets (site/site.css, chrome.css, pages.css, consent.css) stay as they
// are for people to read and edit; at build time they are minified with esbuild (a dev tool the
// docs build already uses), then, per kind of page, every rule whose classes that page never
// uses is dropped. What the first screen needs is inlined in <head>; the rest loads without
// blocking the first paint. Why: the four sheets were 95 KB, all render-blocking, on every page
// (review: about one second of blocking on a phone). ADR 0020.
import { transformSync } from 'esbuild';

/** Classes that only scripts add (states), and the consent banner's own markup: always kept. */
const KEEP = /^(is-|js$|hx-lock$|cc-)/;

/** Minifies a stylesheet and flattens nesting, for browsers the site supports. */
export function minifyCss(css: string): string {
  return transformSync(css, { loader: 'css', minify: true, target: ['chrome109', 'safari16', 'firefox115'] }).code;
}

/** Every class name used in a piece of HTML. */
export function classesIn(html: string): Set<string> {
  const out = new Set<string>();
  for (const m of html.matchAll(/\bclass="([^"]*)"/g)) for (const c of m[1].split(/\s+/)) if (c) out.add(c);
  return out;
}

/** Splits at top-level commas only (not inside :is(…) or attribute brackets). */
function splitTop(s: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = '';
  let from = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === quote && s[i - 1] !== '\\') quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === sep && depth === 0) {
      parts.push(s.slice(from, i));
      from = i + 1;
    }
  }
  parts.push(s.slice(from));
  return parts;
}

/**
 * Whether a selector can match a page that uses `classes`. Conservative: classes inside
 * :not() are ignored, and a selector with :is()/:where()/:has() groups is kept when its other
 * classes are present (any one of a group may be the one in use).
 */
function selectorUsed(sel: string, classes: Set<string>): boolean {
  const plain = sel.replace(/:(not|is|where|has)\((?:[^()]|\([^()]*\))*\)/g, ' ');
  for (const m of plain.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) if (!KEEP.test(m[1]) && !classes.has(m[1])) return false;
  return true;
}

/** Reads `prelude{body}` blocks at the top level of minified CSS. */
function blocks(css: string): [prelude: string, body: string][] {
  const out: [string, string][] = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    const prelude = css.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    let quote = '';
    for (; j < css.length && depth > 0; j++) {
      const ch = css[j];
      if (quote) {
        if (ch === quote && css[j - 1] !== '\\') quote = '';
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    out.push([prelude, css.slice(open + 1, j - 1)]);
    i = j;
  }
  return out;
}

/**
 * Keeps the rules of minified CSS that a page using `classes` can need; @font-face and the like
 * stay whole, and an @keyframes stays only when a kept rule still names it.
 */
export function pruneCss(css: string, classes: Set<string>): string {
  const kept = pruneRules(css, classes);
  const named = new Set<string>();
  for (const m of kept.matchAll(/animation(?:-name)?:([^;}]+)/g)) for (const w of m[1].split(/[\s,]+/)) named.add(w);
  return kept.replace(/@keyframes ([\w-]+)\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, (all, name: string) => (named.has(name) ? all : ''));
}

function pruneRules(css: string, classes: Set<string>): string {
  let out = '';
  for (const [prelude, body] of blocks(css)) {
    if (prelude.startsWith('@media') || prelude.startsWith('@supports') || prelude.startsWith('@container') || prelude.startsWith('@layer')) {
      const inner = pruneRules(body, classes);
      if (inner) out += `${prelude}{${inner}}`;
    } else if (prelude.startsWith('@')) {
      out += `${prelude}{${body}}`;
    } else {
      const kept = splitTop(prelude, ',').filter((s) => selectorUsed(s, classes));
      if (kept.length) out += `${kept.join(',')}{${body}}`;
    }
  }
  return out;
}
