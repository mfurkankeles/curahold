// Checks the built docs (dist/web/docs): pages render without missing files,
// the language switch lands, search finds things, llms.txt is served.
//   npm run build && npx tsx tests/e2e/docs.ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { startLocal } from '../../api/src/node';
import { SCREENS } from './browser';

const local = await startLocal({ port: 8921, publicPort: 8921, serveStatic: true, quiet: true });
const base = 'http://localhost:8921';
const browser = await puppeteer.launch({
  executablePath: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => existsSync(p)),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? '✓' : '✗'} ${what}`);
  if (!ok) errors.push(what);
};

for (const [path, w, h] of [['/docs/tr/', 1440, 900], ['/docs/tr/webhooks/', 1440, 900], ['/docs/en/mcp-and-oauth/', 390, 844]] as const) {
  await page.setViewport({ width: w, height: h });
  await page.goto(base + path, { waitUntil: 'networkidle0' });
  check((await page.$eval('h1', (e) => e.textContent ?? '')).length > 3, `${path} has a title`);
  await page.screenshot({ path: join(SCREENS, `docs${path.replace(/\W+/g, '-')}.png`) });
}
await page.setViewport({ width: 1440, height: 900 });
await page.goto(`${base}/docs/tr/webhooks/`, { waitUntil: 'networkidle0' });
await page.click('.top__link[hreflang="en"]');
await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => undefined);
check(page.url().endsWith('/docs/en/webhooks/'), 'language switch keeps the page');
await page.type('#q', 'signature');
await page.waitForSelector('#results a', { timeout: 3000 }).catch(() => undefined);
const hits = await page.$$eval('#results a', (as) => as.map((a) => a.getAttribute('href')));
check(hits.some((h) => h?.startsWith('/docs/en/webhooks/')), 'search finds the webhook signature section');
const llms = await (await fetch(`${base}/llms.txt`)).text();
check(llms.startsWith('# Curahold') && llms.includes('/docs/en/api-keys.md'), 'llms.txt lists the docs');
check((await fetch(`${base}/docs/en/api-keys.md`)).ok, 'pages are also served as markdown');

// The start page: one question box, four ways in; and "Ask" answers from the docs.
await page.goto(`${base}/docs/en/`, { waitUntil: 'networkidle0' });
check((await page.$$('.entry')).length === 4, 'the start page offers four ways in');
check((await page.$$('.asked button')).length >= 5 && (await page.$$('.recent li')).length === 5, 'the start page lists what is asked most and what changed');
await page.type('.hero__ask input', 'How do I verify a webhook signature?');
await page.keyboard.press('Enter');
await page.waitForSelector('.ask__answer', { timeout: 8000 }).catch(() => undefined);
const answer = await page.$eval('.ask__answer', (e) => ({ heading: e.querySelector('h4')?.textContent ?? '', from: e.querySelector('.ask__from a')?.getAttribute('href') ?? '' })).catch(() => ({ heading: '', from: '' }));
check(answer.heading === 'Verifying the signature' && answer.from.startsWith('/docs/en/webhooks/#'), 'Ask answers a question from the docs and says where from');
await page.screenshot({ path: join(SCREENS, 'docs-ask.png') });
await page.click('.ask__helped button:last-child');
check((await page.$$('.ask__support a')).length === 1, 'Ask offers support when the answer did not help');
await page.setViewport({ width: 390, height: 844 });
await page.goto(`${base}/docs/tr/`, { waitUntil: 'networkidle0' });
await page.click('.asked button');
await page.waitForSelector('.ask__answer, .ask__chips', { timeout: 8000 }).catch(() => undefined);
check((await page.$$('.ask__msg--you')).length === 1 && (await page.$$('.ask__msg--bot')).length >= 2, 'a question from the start page opens Ask on a phone, in Turkish');
const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
check(!wide, 'the start page does not scroll sideways on a phone');

console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'docs ok');
await browser.close();
local.server.close();
process.exit(errors.length ? 1 : 0);
