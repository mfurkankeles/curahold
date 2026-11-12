// Checks the in-browser demo (dist/demo) the way a hosted page sees it: under a
// strict content security policy, inside a sandboxed frame of another site,
// from a sub-path. `npx vite build --config vite.demo.config.ts && npx tsx tests/e2e/demo.ts`
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import puppeteer from 'puppeteer-core';
import { SCREENS } from './browser';

const DIST = join(import.meta.dirname, '..', '..', 'dist', 'demo');
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  "connect-src 'self'",
].join('; ');
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.data': 'application/octet-stream' };

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><body style="margin:0"><iframe src="http://127.0.0.1:${PORT}/a/demo/index.html" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" style="border:0;width:100vw;height:100vh"></iframe></body>`);
    return;
  }
  const rel = normalize(url.pathname.replace(/^\/a\/demo\//, '')).replace(/^(\.\.[/\\])+/, '');
  const file = join(DIST, rel);
  if (!file.startsWith(DIST) || !existsSync(file)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'content-security-policy': CSP });
  res.end(readFileSync(file));
});
const PORT = 8911;
await new Promise<void>((r) => server.listen(PORT, r));

const browser = await puppeteer.launch({
  executablePath: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => existsSync(p)),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=tr-TR'],
});
// The demo writes its sample data in the visitor's language: these checks read Turkish.
const TURKISH = `Object.defineProperty(navigator, 'language', { get: function () { return 'tr-TR'; } }); Object.defineProperty(navigator, 'languages', { get: function () { return ['tr-TR', 'tr']; } });`;
const page = await browser.newPage();
await page.evaluateOnNewDocument(TURKISH);
await page.setViewport({ width: Number(process.env.W ?? 1440), height: Number(process.env.H ?? 900) });
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !/status of 404/.test(m.text()) && errors.push(`${m.type()}: ${m.text()}`));
page.on('response', (r) => r.status() >= 400 && !r.url().endsWith('/favicon.ico') && errors.push(`${r.status()} ${r.url()}`));
const t0 = Date.now();
await page.goto(`http://localhost:${PORT}/`);
const frame = await (await page.waitForSelector('iframe'))!.contentFrame();
let ok = true;
try {
  await frame!.waitForSelector('.shell', { timeout: 60000 });
  await frame!.waitForFunction(() => !document.getElementById('boot'), { timeout: 10000 });
} catch {
  ok = false;
}
console.log(`ready: ${ok} in ${Date.now() - t0} ms`);
console.log('money:', await frame!.$$eval('.pane', (els) => els.slice(1, 2).map((e) => e.textContent?.slice(0, 40))).catch(() => '?'));
const step = await frame!.$eval('#boot-step', (e) => e.textContent).catch(() => null);
if (step) console.log('boot text:', step);
await page.screenshot({ path: join(SCREENS, 'demo-home.png') });

if (ok && !process.env.QUICK) {
  // A few journeys: a board, a customer, switching person, search.
  const click = async (sel: string, text?: string) => {
    const els = await frame!.$$(sel);
    for (const el of els) {
      const t = await el.evaluate((n) => n.textContent ?? '');
      if (!text || t.includes(text)) {
        await el.click();
        return true;
      }
    }
    throw new Error(`no ${sel} ${text ?? ''}`);
  };
  await click('.navlink--board', 'Yenilemeler');
  await frame!.waitForFunction(() => document.querySelectorAll('.card, .task, [data-task]').length > 0, { timeout: 10000 }).catch(() => undefined);
  await page.screenshot({ path: join(SCREENS, 'demo-board.png') });
  // The newer pages: the pipeline, the inbox, reports, the team and the timeline.
  await click('.navlink', 'Fırsatlar');
  await frame!.waitForSelector('.dealcard', { timeout: 10000 }).catch(() => errors.push('the pipeline shows no deals'));
  await page.screenshot({ path: join(SCREENS, 'demo-pipeline.png') });
  await click('.navlink', 'İş değerlendirmeleri');
  await frame!.waitForSelector('.table--reviews .review__when', { timeout: 10000 }).catch(() => errors.push('no reviews are due'));
  await page.screenshot({ path: join(SCREENS, 'demo-reviews.png') });
  // A customer's page lists its meetings, with who was there and the next steps.
  await click('.table--reviews a');
  await frame!.waitForSelector('.meetings .meeting', { timeout: 10000 }).catch(() => errors.push('a customer shows no meetings'));
  await page.screenshot({ path: join(SCREENS, 'demo-meetings.png') });
  await click('.navlink', 'Raporlar');
  await frame!.waitForSelector('.chart__col', { timeout: 10000 }).catch(() => errors.push('reports show no chart'));
  await frame!.waitForSelector('.target__track', { timeout: 10000 }).catch(() => errors.push('reports show no target'));
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: join(SCREENS, 'demo-reports.png') });
  await click('.navlink', 'Ekip');
  await frame!.waitForSelector('.teamtable .rowlink', { timeout: 10000 }).catch(() => errors.push('the team page lists nobody'));
  await click('.navlink', 'Zaman çizelgesi');
  await frame!.waitForSelector('.gantt__bar', { timeout: 10000 }).catch(() => errors.push('the timeline is empty'));
  await page.screenshot({ path: join(SCREENS, 'demo-timeline.png') });
  await click('.navlink', 'Gelen kutusu');
  await frame!.waitForSelector('.inbox__item, .emptystate', { timeout: 10000 }).catch(() => errors.push('the inbox did not open'));
  await click('.navlink', 'Tüm müşteriler');
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: join(SCREENS, 'demo-accounts.png') });
  // A customer: the timeline and the score's reasons.
  await click('a', 'Velto Mobility');
  await frame!.waitForSelector('.tl__item', { timeout: 10000 });
  await click('.healthline button');
  await frame!.waitForSelector('.healthwhy li', { timeout: 10000 });
  await page.screenshot({ path: join(SCREENS, 'demo-account.png') });
  const reasons = await frame!.$$eval('.healthwhy li', (els) => els.length);
  if (reasons < 4) errors.push(`only ${reasons} reasons shown`);
  await click('.navlink', 'Ayarlar');
  await new Promise((r) => setTimeout(r, 500));
  await click('.admin__link', 'Sağlık skoru');
  await frame!.waitForSelector('.signal', { timeout: 10000 });
  await frame!.waitForSelector('.healthpreview', { timeout: 10000 });
  await page.screenshot({ path: join(SCREENS, 'demo-health-settings.png') });
  await frame!.select('.demobar__who select', 'zeynep');
  await frame!.waitForFunction(() => document.querySelector('.sidebar')?.textContent?.includes('Zeynep'), { timeout: 10000 }).catch(() => console.log('switch: sidebar does not show Zeynep'));
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: join(SCREENS, 'demo-zeynep.png') });
  // The customer: the portal, inside the same tab, with only what was shared.
  await frame!.select('.demobar__who select', 'customer');
  await frame!.waitForSelector('.p-item', { timeout: 10000 });
  const items = await frame!.$$eval('.p-item__title', (els) => els.map((e) => e.textContent));
  if (items.length !== 2) errors.push(`portal shows ${items.length} requests: ${items.join(', ')}`);
  await page.screenshot({ path: join(SCREENS, 'demo-portal.png') });
  await (await frame!.$('.p-item'))!.click();
  await frame!.waitForSelector('.p-task', { timeout: 10000 });
  await page.screenshot({ path: join(SCREENS, 'demo-portal-task.png') });
  if ((await frame!.$eval('.p-task', (e) => e.textContent ?? '')).includes('iç not')) errors.push('an internal note reached the portal');
  await frame!.select('.demobar__who select', 'ada');
  await frame!.waitForSelector('.shell', { timeout: 10000 });
}
// On a phone, inside an app that gives the page storage that forgets (or wipes it):
// the demo still opens signed in, and stays that way.
if (ok) {
  const phone = await browser.newPage();
  await phone.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148');
  await phone.setViewport({ width: 393, height: 852, isMobile: true, hasTouch: true });
  await phone.evaluateOnNewDocument(TURKISH);
  await phone.evaluateOnNewDocument(`(function () {
    var fake = { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {}, clear: function () {}, key: function () { return null; }, length: 0 };
    Object.defineProperty(window, 'localStorage', { get: function () { return fake; } });
    Object.defineProperty(window, 'sessionStorage', { get: function () { return fake; } });
  })()`);
  await phone.goto(`http://localhost:${PORT}/`);
  const pf = await (await phone.waitForSelector('iframe'))!.contentFrame();
  await pf!.waitForFunction(() => !document.getElementById('boot'), { timeout: 60000 }).catch(() => undefined);
  await new Promise((r) => setTimeout(r, 2500));
  const seen = await pf!.evaluate(() => ({ shell: !!document.querySelector('.shell'), h1: document.querySelector('h1')?.textContent ?? '', problem: !!document.querySelector('.demobar__problem') }));
  if (!seen.shell || seen.problem) errors.push(`phone, storage that forgets: not signed in (${seen.h1})`);
  await phone.screenshot({ path: join(SCREENS, 'demo-phone.png') });
  await phone.close();
}
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no errors');
await browser.close();
server.close();
process.exit(ok && !errors.some((e) => !e.startsWith('warning')) ? 0 : 1);
