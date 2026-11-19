// Takes the help centre's pictures from the live demo: real screens of the
// product, in each language the demo company is written in, with its invented
// data. Run after `npm run build:demo`; the pictures are kept in the repository
// (docs/site/<lang>/img/*.webp) so the docs build needs no browser.
//
//   npx tsx scripts/docs/shots.ts [lang …]     (default: every demo language)
//
// The demo hub uses two of them (customers, customer-phone) as its hero.
// ONLY=name,name takes just those pictures.
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
}
const SHOTS: Shot[] = [
  { name: 'customers', go: `__demo.navigate('/accounts')`, ready: '.acard', width: 1280, height: 800 },
  { name: 'customer-phone', go: `__demo.navigate('/accounts'); await wait('.acard__name'); document.querySelector('.acard__name').click()`, ready: '.acc-band', width: 375, height: 667 },
  { name: 'customer', go: `__demo.navigate('/accounts'); await wait('.acard__name'); document.querySelector('.acard__name').click()`, ready: '.acc-band', width: 1280, height: 800 },
  { name: 'task', go: `document.querySelector('.navlink--board')?.click(); await wait('.board .card'); document.querySelector('.board .card').click()`, ready: '.panel', width: 1280, height: 800 },
  { name: 'home', go: `__demo.navigate('/home')`, ready: '.pane', width: 1280, height: 800 },
  { name: 'portal', go: `await __demo.as('customer')`, ready: '.p-list', width: 1280, height: 800 },
];

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
    for (const shot of SHOTS.filter((x) => !only || only.includes(x.name))) {
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
