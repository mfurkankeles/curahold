// Shared browser setup for the end-to-end checks: the real built app, the
// real API on embedded Postgres, and the machine's Chrome.
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { startLocal } from '../../api/src/node';

export const SCREENS = join(import.meta.dirname, 'screens');

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean) as string[];

export const STAFF_KEY = 'e2e-staff-key-e2e-staff-key-0001';

export async function startStack(port = 8899) {
  const local = await startLocal({ port, publicPort: port, serveStatic: true, quiet: true, staffKey: STAFF_KEY, locale: 'tr' });
  const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!executablePath) throw new Error('Chrome not found; set CHROME_PATH');
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=tr-TR'],
  });
  mkdirSync(SCREENS, { recursive: true });
  return { ...local, browser, origin: `http://demo.localhost:${port}` };
}

export async function newPage(browser: Browser, width = 1440, height = 900) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  // The checks read what is on the page as soon as it is there: no counting up, no growing bars.
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/401|404|409/.test(m.text()) && errors.push(m.text()));
  return { page, errors };
}

export async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(SCREENS, `${name}.png`), fullPage: false });
}

export async function signIn(page: Page, origin: string, email: string) {
  await page.goto(`${origin}/`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('input[type=email]');
  await page.type('input[type=email]', email);
  await page.click('form button.btn--primary');
  const link = await page.waitForSelector('a.btn[href^="/auth/verify"]');
  await link!.click();
  await page.waitForSelector('.sidebar', { timeout: 15_000 });
}

export async function byText(page: Page, selector: string, text: string) {
  const handles = await page.$$(selector);
  for (const h of handles) {
    const t = await h.evaluate((el) => el.textContent?.trim() ?? '');
    if (t === text || t.startsWith(text)) return h;
  }
  throw new Error(`no ${selector} with text "${text}"`);
}
