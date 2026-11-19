// Checks the demo hub (dist/demo-hub) and plays every step of every guided
// tour on the live demo, the way a visitor would: under a strict content
// security policy, from a sub-path (/demo/). A step whose element is no longer
// on its screen fails here, by tour and step — that is how tours stay true
// when the product changes.
//
//   npm run build:demo && npx tsx tests/e2e/tours.ts
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import puppeteer, { type Page } from 'puppeteer-core';
import { TOURS } from '../../shared/src/tours';
import { SCREENS } from './browser';

const HUB = join(import.meta.dirname, '..', '..', 'dist', 'demo-hub');
// Nothing from any other address. The hub's pictures (real screens of the demo, one set per language) are its own files.
const CSP = ["default-src 'self'", "script-src 'self' 'wasm-unsafe-eval'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self' data:", "connect-src 'self'"].join('; ');
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.json': 'application/json', '.webp': 'image/webp' };
const PORT = Number(process.env.DEMO_PORT ?? 8931);
mkdirSync(SCREENS, { recursive: true });
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  let rel = url.pathname.replace(/^\/demo\//, '');
  if (!rel || rel.endsWith('/')) rel += 'index.html';
  const file = join(HUB, normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(HUB) || !existsSync(file)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'content-security-policy': CSP });
  res.end(readFileSync(file));
});
await new Promise<void>((r) => server.listen(PORT, r));
const BASE = `http://localhost:${PORT}/demo/`;

const browser = await puppeteer.launch({
  executablePath: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => existsSync(p)),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const failures: string[] = [];
const fail = (m: string) => {
  failures.push(m);
  console.log(`  ✗ ${m}`);
};
async function open(path: string, width = 1440, height = 900) {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f;');
  await page.setViewport({ width, height });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/status of 404/.test(m.text()) && errors.push(m.text()));
  page.on('response', (r) => r.status() >= 400 && !/favicon|answers\.json/.test(r.url()) && errors.push(`${r.status()} ${r.url()}`));
  await page.goto(BASE + path);
  return { page, errors };
}
const t0 = Date.now();

// ------------------------------------------------------------------- the hub
{
  const { page, errors } = await open('');
  await page.waitForSelector('.hub-card');
  // A first visit asks for a language: nine, by their own names, English first and chosen; Esc keeps English.
  const ask = await page.evaluate(() => ({
    open: getComputedStyle(document.getElementById('lang-pick')!).display !== 'none',
    names: [...document.querySelectorAll('#lang-pick a[data-l]')].map((a) => a.getAttribute('data-l')),
    focused: document.activeElement?.getAttribute('data-l') ?? '',
  }));
  if (!ask.open) fail('hub: a first visit is not asked for a language');
  if (ask.names.length !== 9 || ask.names[0] !== 'en') fail(`hub: the language chooser lists ${ask.names.join(',')}`);
  if (ask.focused !== 'en') fail(`hub: the chooser's focus is on “${ask.focused}”, not English`);
  await page.screenshot({ path: join(SCREENS, 'hub-en-chooser.png') });
  await page.keyboard.press('Escape');
  const kept = await page.evaluate(() => ({ open: getComputedStyle(document.getElementById('lang-pick')!).display !== 'none', lang: localStorage.getItem('curahold_demo_lang'), app: localStorage.getItem('app_locale') }));
  if (kept.open || kept.lang !== 'en' || kept.app !== 'en') fail(`hub: Esc on the chooser left ${JSON.stringify(kept)}`);
  const total = await page.$$eval('.hub-card', (c) => c.length);
  if (total !== TOURS.length) fail(`hub: ${total} cards for ${TOURS.length} tours`);
  // The role strip: one role, the tours for it, and the choice in the address.
  await page.click('.hub-role[data-value="lead"]');
  const lead = await page.$$eval('.hub-card:not([hidden])', (c) => c.map((x) => (x as HTMLElement).dataset.roles!));
  const want = TOURS.filter((t) => t.roles.includes('lead')).length;
  if (lead.length !== want || lead.some((r) => !r.split(' ').includes('lead'))) fail(`hub: team lead shows ${lead.length} tours, wants ${want}`);
  if (!page.url().includes('role=lead')) fail(`hub: the role is not in the address (${page.url()})`);
  // Two groups narrow each other; an impossible mix says so, and "clear" brings everything back.
  await page.click('.hub-chip[data-group="goal"][data-value="grow"]');
  const both = await page.$$eval('.hub-card:not([hidden])', (c) => c.length);
  if (both !== TOURS.filter((t) => t.roles.includes('lead') && t.goals.includes('grow')).length) fail(`hub: role + goal shows ${both}`);
  await page.click('.hub-chip[data-group="area"][data-value="portal"]');
  if (!(await page.$eval('.hub-empty', (e) => !(e as HTMLElement).hidden))) fail('hub: an impossible mix does not say so');
  await page.click('.hub-empty button');
  if ((await page.$$eval('.hub-card:not([hidden])', (c) => c.length)) !== TOURS.length) fail('hub: clearing does not show every tour again');
  // A link with filters opens on the same tours.
  const shared = await browser.newPage();
  await shared.goto(BASE + '?goal=setup');
  await shared.waitForSelector('.hub-card');
  const setup = await shared.$$eval('.hub-card:not([hidden])', (c) => c.length);
  if (setup !== TOURS.filter((t) => t.goals.includes('setup')).length) fail(`hub: ?goal=setup shows ${setup}`);
  await shared.close();
  // Every tour's button opens the live demo with that tour.
  const hrefs = await page.$$eval('.hub-card .btn', (a) => a.map((x) => x.getAttribute('href')));
  for (const t of TOURS) if (!hrefs.includes(`app/?tour=${t.id}`)) fail(`hub: no button for ${t.id}`);
  await page.screenshot({ path: join(SCREENS, 'hub-en.png') });
  await page.screenshot({ path: join(SCREENS, 'hub-en-full.png'), fullPage: true });
  if (errors.length) fail(`hub: ${errors.join(' | ')}`);
  await page.close();

  // Turkish, on a phone: its own words, and links into the demo in Turkish.
  const tr = await open('tr/', 390, 844);
  await tr.page.waitForSelector('.hub-card');
  const h1 = await tr.page.$eval('h1', (e) => e.textContent);
  if (!h1?.includes('Tura çık')) fail(`hub tr: heading is “${h1}”`);
  const trHref = await tr.page.$eval('.hub-card .btn', (a) => a.getAttribute('href'));
  if (!/^\.\.\/app\/\?tour=[a-z-]+#tr$/.test(trHref ?? '')) fail(`hub tr: tour link ${trHref}`);
  const wide = await tr.page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  if (wide) fail('hub tr: wider than a phone');
  await tr.page.click('.hub-filters__toggle');
  await tr.page.click('.hub-chip[data-group="role"][data-value="csm"]');
  await tr.page.screenshot({ path: join(SCREENS, 'hub-tr-phone.png') });
  if (tr.errors.length) fail(`hub tr: ${tr.errors.join(' | ')}`);
  await tr.page.close();
  // Every other language: its own page, the right direction, its own picture of the product, a phone's width.
  for (const l of ['ar', 'he', 'fa', 'ja', 'zh-Hans', 'zh-Hant', 'ko', 'hi', 'ms']) {
    const x = await open(`${l}/`, 390, 844);
    await x.page.waitForSelector('.hub-card');
    await x.page.waitForFunction(() => [...document.images].every((i) => i.complete), { timeout: 10000 }).catch(() => undefined);
    const seen = await x.page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, shot: (document.querySelector('.hub-shot img') as HTMLImageElement | null)?.currentSrc ?? '', loaded: [...document.images].every((i) => i.naturalWidth > 0), wide: document.documentElement.scrollWidth > innerWidth, link: document.querySelector('.hub-card .btn')?.getAttribute('href') ?? '' }));
    const rtl = ['ar', 'he', 'fa'].includes(l);
    if (seen.lang !== l || seen.dir !== (rtl ? 'rtl' : 'ltr')) fail(`hub ${l}: lang ${seen.lang}, dir ${seen.dir}`);
    if (!seen.shot.includes(`/${l}-`) || !seen.loaded) fail(`hub ${l}: picture ${seen.shot || 'missing'}${seen.loaded ? '' : ' (not loaded)'}`);
    if (seen.wide) fail(`hub ${l}: wider than a phone`);
    if (!seen.link.endsWith(`#${l}`)) fail(`hub ${l}: tour link ${seen.link}`);
    if (x.errors.length) fail(`hub ${l}: ${x.errors.join(' | ')}`);
    await x.page.close();
  }
  // The language button opens the chooser again; a pick opens the hub in it, and the app with it;
  // the root sends a returning visitor there; ?lang=en in a link comes back to English.
  {
    const { page: p, errors: e } = await open('?lang=en');
    await p.click('.hub-lang__open');
    await p.waitForSelector('#lang-pick.is-open a[data-l="ja"]', { visible: true });
    await Promise.all([p.waitForNavigation(), p.click('#lang-pick a[data-l="ja"]')]);
    const ja = await p.evaluate(() => ({ lang: document.documentElement.lang, app: localStorage.getItem('app_locale'), hint: localStorage.getItem('app_locale_hint') }));
    if (ja.lang !== 'ja' || ja.app !== 'ja' || ja.hint !== 'ja') fail(`hub: picking 日本語 gave ${JSON.stringify(ja)}`);
    await p.goto(BASE);
    await p.waitForFunction(() => document.documentElement.lang === 'ja', { timeout: 5000 }).catch(() => fail('hub: the root does not open the language chosen before'));
    await p.goto(BASE + '?lang=en');
    await p.waitForSelector('.hub-card');
    const back = await p.evaluate(() => ({ lang: document.documentElement.lang, app: localStorage.getItem('app_locale'), url: location.search, open: getComputedStyle(document.getElementById('lang-pick')!).display !== 'none' }));
    if (back.lang !== 'en' || back.app !== 'en' || back.url !== '' || back.open) fail(`hub: ?lang=en gave ${JSON.stringify(back)}`);
    if (e.length) fail(`hub chooser: ${e.join(' | ')}`);
    await p.close();
  }
  console.log(`hub: ${TOURS.length} tours, filters, nine languages, the language chooser — ${failures.length ? 'problems above' : 'fine'}`);
}

// ----------------------------------------------------------------- the tours
async function walk(page: Page, id: string, shots: boolean) {
  const tour = TOURS.find((t) => t.id === id)!;
  for (let i = 0; i < tour.steps.length; i++) {
    const s = tour.steps[i];
    const sel = `.tour__card[data-tour-step="${i}"]`;
    try {
      await page.waitForFunction((q) => {
        const c = document.querySelector(q);
        return !!c && c.getAttribute('data-anchor') !== 'looking';
      }, { timeout: 12000 }, sel);
    } catch {
      fail(`${id} step ${i + 1}: the step never showed`);
      return;
    }
    const anchor = await page.$eval(sel, (c) => c.getAttribute('data-anchor'));
    if (anchor === 'missing') fail(`${id} step ${i + 1}: “${s.at}” is not on the screen`);
    if (shots && i === Math.min(1, tour.steps.length - 1)) await page.screenshot({ path: join(SCREENS, `tour-${id}.png`) });
    if (s.click && anchor === 'found') await page.evaluate((q) => (document.querySelector(q) as HTMLElement).click(), s.at!);
    else if (await page.$('.tour__card .tour__btn--primary')) await page.click('.tour__card .tour__btn--primary');
    else {
      fail(`${id} step ${i + 1}: no way on (${(await page.$eval('#tour', (e) => e.innerHTML).catch(() => 'no tour')).slice(0, 200)})`);
      await page.screenshot({ path: join(SCREENS, `fail-tour-${id}-${i + 1}.png`) });
      return;
    }
  }
  try {
    await page.waitForSelector('.tour__card[data-tour-step="end"]', { timeout: 5000 });
  } catch {
    fail(`${id}: the tour did not reach its end`);
    return;
  }
  await page.$$eval('.tour__card .tour__btn', (b) => (b.find((x) => x.tagName === 'BUTTON') as HTMLElement | undefined)?.click());
}

{
  // The first tour as a visitor gets it: from the hub's link.
  const { page, errors } = await open(`app/?tour=${TOURS[0].id}`);
  await page.waitForFunction(() => !!(globalThis as any).__demo && !document.getElementById('boot'), { timeout: 90000 });
  console.log(`demo up in ${Date.now() - t0} ms`);
  await walk(page, TOURS[0].id, true);
  // Every other one in the same tab, each from a fresh start as the person it is written for.
  for (const t of TOURS.slice(1)) {
    // A fresh screen (closed panels, home page) without signing in again; play() changes person if needed.
    await page.evaluate(() => (globalThis as any).__demo.reset());
    await new Promise((r) => setTimeout(r, 500));
    const ok = await page.evaluate((id) => (globalThis as any).__demo.play(id), t.id);
    if (!ok) fail(`${t.id}: the demo does not know it`);
    else await walk(page, t.id, true);
  }
  const steps = TOURS.reduce((n, t) => n + t.steps.length, 0);
  if (errors.length) fail(`tours: ${errors.slice(0, 5).join(' | ')}`);
  console.log(`tours: ${TOURS.length} tours, ${steps} steps walked`);
  await page.close();
}

{
  // A phone: the card docks at the bottom and the tour still walks; Turkish words in the card.
  const { page, errors } = await open(`app/?tour=quick-add#tr`, 390, 844);
  await page.waitForFunction(() => !!(globalThis as any).__demo && !document.getElementById('boot'), { timeout: 90000 });
  await page.waitForSelector('.tour__card[data-tour-step="0"]:not([data-anchor="looking"])', { timeout: 12000 }).catch(() => fail('phone: no first step'));
  const side = await page.$eval('.tour__card', (c) => c.getAttribute('data-side')).catch(() => null);
  if (side !== 'dock' && side !== 'center') fail(`phone: the card is “${side}”, not docked`);
  const words = await page.$eval('.tour__card', (c) => c.textContent ?? '').catch(() => '');
  if (!words.includes('Görevlerim')) fail(`phone: the card is not in Turkish (${words.slice(0, 60)})`);
  await page.screenshot({ path: join(SCREENS, 'tour-phone-tr.png') });
  if (errors.length) fail(`phone: ${errors.slice(0, 3).join(' | ')}`);
  await page.close();
}

await browser.close();
server.close();
console.log(`\n${failures.length ? `${failures.length} problem(s)` : 'all good'} in ${Math.round((Date.now() - t0) / 1000)} s`);
process.exit(failures.length ? 1 : 0);
