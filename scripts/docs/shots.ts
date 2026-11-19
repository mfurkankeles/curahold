// Takes the help centre's pictures from the live demo: real screens of the
// product, in each language the demo company is written in, with its invented
// data. Run after `npm run build:demo`; the pictures are kept in the repository
// (docs/site/<lang>/img/*.webp) so the docs build needs no browser.
//
//   npx tsx scripts/docs/shots.ts [lang …]     (default: every demo language)
//
// The demo hub uses two of them (customers, customer-phone) as its hero.
// ONLY=name,name takes just those pictures (ONLY=setup- takes every picture whose name starts so).
//
// A picture of a step ("click this") sets `mark`: the element is ringed and
// numbered on the picture itself, so a guide can say one action per step and
// show exactly where it is. The ring is drawn on top of the page, never in it.
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import puppeteer from 'puppeteer-core';
import { SEED_LOCALES } from '../seed-words';
import type { Locale } from '../../shared/src/i18n/core';

const ROOT = join(import.meta.dirname, '..', '..');
const DEMO = join(ROOT, 'dist', 'demo');
const PORT = Number(process.env.SHOTS_PORT ?? 10045);
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };

/** One picture: where to go, what to do there, what must be on screen, and its size. */
interface Shot {
  name: string;
  /** Run in the page first (the demo's own helpers: globalThis.__demo). */
  go: string;
  /** Must be on screen before the picture is taken: no skeletons, no empty boxes. */
  ready: string;
  width: number;
  height: number;
  /** The element the step is about (a CSS selector): ringed and numbered on the picture. */
  mark?: string;
  /** The number on the ring (default 1). */
  n?: number;
}
const go = (path: string) => `__demo.navigate('${path}')`;
/** Setup health and "Test your setup" (docs/site/<lang>/setup-health.md): one picture per step. */
const SETUP: Shot[] = [
  { name: 'setup-nav', go: go('/home'), ready: '[data-tour="setup-badge"]', mark: '.navlink:has([data-tour="setup-badge"])', n: 1 },
  { name: 'setup-first', go: go('/setup-health'), ready: '.sh-item', mark: '[data-tour="setup-first"]', n: 2 },
  { name: 'setup-fix', go: go('/setup-health'), ready: '.sh-item', mark: '[data-tour="setup-fix"]', n: 3 },
  { name: 'setup-recheck', go: go('/setup-health'), ready: '.sh-item', mark: '[data-tour="setup-recheck"]', n: 4 },
  { name: 'setup-warning', go: go('/settings/sources'), ready: '.sh-warn', mark: '.sh-warn', n: 5 },
  { name: 'setup-test-link', go: go('/setup-health'), ready: '.sh-item', mark: '[data-tour="setup-test-link"]', n: 1 },
  { name: 'setup-test-run', go: go('/setup-test'), ready: '.sh-step', mark: '[data-tour="setup-run"]', n: 2 },
  { name: 'setup-test-evidence', go: go('/setup-test'), ready: '.sh-evidence', mark: '.sh-step[data-status="pass"] .sh-evidence', n: 3 },
  { name: 'setup-test-issue', go: go('/setup-test'), ready: '.sh-issue', mark: '[data-tour="setup-issue"] .sh-step__body', n: 4 },
  { name: 'setup-test-bundles', go: go('/setup-test'), ready: '.sh-bundle', mark: '[data-tour="setup-bundles"]', n: 5 },
  { name: 'setup-test-gate', go: go('/setup-test'), ready: '.sh-gate', mark: '[data-tour="setup-gate"]', n: 6 },
].map((x) => ({ ...x, width: 1280, height: 800 }));
const SHOTS: Shot[] = [
  { name: 'customers', go: `__demo.navigate('/accounts')`, ready: '.acard', width: 1280, height: 800 },
  { name: 'customer-phone', go: `__demo.navigate('/accounts'); await wait('.acard__name'); document.querySelector('.acard__name').click()`, ready: '.acc-band', width: 375, height: 667 },
  { name: 'customer', go: `__demo.navigate('/accounts'); await wait('.acard__name'); document.querySelector('.acard__name').click()`, ready: '.acc-band', width: 1280, height: 800 },
  { name: 'task', go: `document.querySelector('.navlink--board')?.click(); await wait('.board .card'); document.querySelector('.board .card').click()`, ready: '.panel', width: 1280, height: 800 },
  { name: 'home', go: `__demo.navigate('/home')`, ready: '.pane', width: 1280, height: 800 },
  { name: 'portal', go: `await __demo.as('customer')`, ready: '.p-list', width: 1280, height: 800 },
  ...SETUP,
  { name: 'setup-phone', go: go('/setup-health'), ready: '.sh-item', width: 390, height: 780 },
];

/** Rings the element and puts its number beside it (inline-start, so it follows right-to-left too). */
const ring = (sel: string, n: number) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) throw new Error('no mark ' + ${JSON.stringify(sel)});
  el.scrollIntoView({ block: 'center', inline: 'nearest' });
  const r = el.getBoundingClientRect();
  const rtl = document.documentElement.dir === 'rtl';
  const box = document.createElement('div');
  box.setAttribute('aria-hidden', 'true');
  box.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border:3px solid #d9480f;border-radius:10px;box-shadow:0 0 0 5px rgba(217,72,15,.18)';
  Object.assign(box.style, { left: (r.left - 6) + 'px', top: (r.top - 6) + 'px', width: (r.width + 12) + 'px', height: (r.height + 12) + 'px' });
  const dot = document.createElement('div');
  dot.textContent = String(${n});
  dot.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;width:28px;height:28px;border-radius:50%;background:#d9480f;color:#fff;font:700 15px/28px system-ui,sans-serif;text-align:center';
  Object.assign(dot.style, { top: Math.max(4, r.top - 20) + 'px', left: (rtl ? Math.min(innerWidth - 32, r.right - 8) : Math.max(4, r.left - 20)) + 'px' });
  document.body.append(box, dot);
})()`;

const server = createServer((req, res) => {
  try {
    let f = normalize(join(DEMO, decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)));
    if (!f.startsWith(DEMO)) throw new Error('outside');
    if (statSync(f).isDirectory()) f = join(f, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
    res.end(readFileSync(f));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise<void>((r) => server.listen(PORT, '127.0.0.1', () => r()));
const langs = (process.argv.slice(2).length ? process.argv.slice(2) : SEED_LOCALES) as Locale[];
const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none'] });
let failed = 0;
try {
  for (const l of langs) {
    const out = join(ROOT, 'docs', 'site', l, 'img');
    mkdirSync(out, { recursive: true });
    const only = process.env.ONLY?.split(',');
    for (const shot of SHOTS.filter((x) => !only || only.some((o) => (o.endsWith('-') ? x.name.startsWith(o) : x.name === o)))) {
      // A fresh tab for each picture, so one screen's state never leaks into the next.
      const page = await browser.newPage();
      await page.evaluateOnNewDocument(() => {
        try {
          localStorage.setItem('app_theme', 'light');
        } catch {
          /* no storage */
        }
      });
      await page.setViewport({ width: shot.width, height: shot.height, deviceScaleFactor: shot.width < 600 ? 2 : 1, isMobile: shot.width < 600, hasTouch: shot.width < 600 });
      await page.goto(`http://127.0.0.1:${PORT}/index.html#${l}`);
      await page.waitForFunction(() => !document.getElementById('boot') && (globalThis as any).__demo, { timeout: 120000 });
      await page.evaluate(`(async () => { const wait = (s) => new Promise((ok, no) => { const t0 = Date.now(); const f = () => document.querySelector(s) ? ok() : Date.now() - t0 > 15000 ? no(new Error('no ' + s)) : setTimeout(f, 100); f(); }); ${shot.go}; })()`);
      try {
        await page.waitForSelector(shot.ready, { visible: true, timeout: 20000 });
        // Past the 300 ms skeleton rule and any entrance motion: only finished screens.
        await page.waitForFunction(() => !document.querySelector('.skeleton, [aria-busy="true"]'), { timeout: 10000 }).catch(() => undefined);
        await new Promise((r) => setTimeout(r, 900));
        // The demo bar is the demo's, not the product's: it stays out of the picture.
        await page.addStyleTag({ content: '.demobar{display:none!important}#root{height:100%!important}' });
        await new Promise((r) => setTimeout(r, 300));
        if (shot.mark) {
          await page.evaluate(ring(shot.mark, shot.n ?? 1));
          await new Promise((r) => setTimeout(r, 150));
        }
        await page.screenshot({ path: join(out, `${shot.name}.webp`) as `${string}.webp`, type: 'webp', quality: 72 });
        console.log(`${l} ${shot.name}`);
      } catch (e) {
        failed++;
        console.error(`${l} ${shot.name}: ${(e as Error).message}`);
      }
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
