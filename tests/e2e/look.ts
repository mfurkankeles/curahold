// A visual pass, not a test: the main screens in light, dark and on a phone,
// written to tests/e2e/screens/look-*.png for a designer's eye.
//   npx vite build && npx tsx tests/e2e/look.ts [filter]
import type { Page } from 'puppeteer-core';
import { newPage, shot, signIn, startStack } from './browser';

const only = process.argv[2] ?? '';
const s = await startStack(8898);
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const { seedShowcase } = await import('../../scripts/seed-showcase');
// Showcase data through the API as Ada, like the demo.
const ada = await newPage(s.browser);
await signIn(ada.page, s.origin, 'ada@demo.example');
const call = async <T,>(method: string, path: string, body?: unknown): Promise<T> =>
  ada.page.evaluate(
    async (m, p, b) => {
      const r = await fetch(p, { method: m, headers: { 'content-type': 'application/json', 'x-tendwell-device': localStorage.getItem('tw_device') ?? '' }, body: b === undefined ? undefined : JSON.stringify(b), credentials: 'include' });
      return r.status === 204 ? null : r.json();
    },
    method,
    path,
    body,
  ) as Promise<T>;
await seedShowcase(call as any, s.db).catch((e) => console.warn('seed', e));

async function theme(page: Page, mode: 'light' | 'dark') {
  await page.evaluate((m) => {
    localStorage.setItem('tw_theme', m);
    document.documentElement.dataset.theme = m;
  }, mode);
}
async function go(page: Page, path: string) {
  await page.goto(`${s.origin}${path}`, { waitUntil: 'networkidle0' });
  await pause(250);
}
const wanted = only.split(',').filter(Boolean);
const want = (name: string) => !wanted.length || wanted.some((w) => name.includes(w));

for (const mode of ['light', 'dark'] as const) {
  const { page, errors } = await newPage(s.browser, 1440, 900);
  await signIn(page, s.origin, 'zeynep@demo.example');
  await theme(page, mode);
  if (want('home')) {
    await go(page, '/home');
    await pause(400);
    await shot(page, `look-${mode}-home`);
  }
  if (want('my')) {
    await go(page, '/my');
    await shot(page, `look-${mode}-my`);
  }
  if (want('quick')) {
    await go(page, '/my');
    await page.keyboard.press('n');
    await page.waitForSelector('.qa__input');
    await page.type('.qa__input', 'Acme yenileme görüşmesi cuma @Ali !yüksek her hafta');
    await pause(300);
    await shot(page, `look-${mode}-quick`);
    await page.keyboard.press('Escape');
  }
  if (want('panel')) {
    const href = await page.$eval('.navlink--board', (a) => a.getAttribute('href'));
    await go(page, href!);
    await page.click('.card .card__chips .schip, .card');
    await page.waitForSelector('.panel .props');
    await pause(400);
    await shot(page, `look-${mode}-panel`);
    await page.evaluate(() => document.querySelector('.panel__body')?.scrollTo(0, 99999));
    await pause(200);
    await shot(page, `look-${mode}-panel2`);
  }
  if (want('accounts')) {
    await go(page, '/accounts');
    await page.waitForSelector('.acards, .accounts-table', { timeout: 10_000 }).catch(() => undefined);
    await shot(page, `look-${mode}-accounts`);
  }
  if (want('board')) {
    await go(page, '/home');
    const href = await page.$eval('.navlink--board', (a) => a.getAttribute('href')).catch(() => null);
    if (href) {
      await go(page, href);
      await shot(page, `look-${mode}-board`);
    }
  }
  if (want('menu')) {
    await go(page, '/home');
    await page.click('.sidebar__me');
    await pause(200);
    await shot(page, `look-${mode}-menu`);
    await page.keyboard.press('Escape');
    await page.click('.sidebar__new');
    await pause(200);
    await shot(page, `look-${mode}-create`);
    await page.keyboard.press('Escape');
  }
  if (want('pipeline')) {
    await go(page, '/records/opportunity');
    await pause(400);
    await shot(page, `look-${mode}-pipeline`);
  }
  if (want('inbox')) {
    await go(page, '/inbox');
    await shot(page, `look-${mode}-inbox`);
  }
  if (want('reports')) {
    await go(page, '/reports');
    await pause(500);
    await shot(page, `look-${mode}-reports`);
    await go(page, '/team');
    await shot(page, `look-${mode}-team`);
    await page.click('.teamtable .rowlink');
    await pause(500);
    await shot(page, `look-${mode}-oneone`);
    await go(page, '/timeline');
    await pause(300);
    await shot(page, `look-${mode}-timeline`);
  }
  if (want('rhythm')) {
    await go(page, '/reports');
    await page.waitForSelector('.targets').catch(() => undefined);
    await page.evaluate(() => document.querySelector('.targets')?.scrollIntoView({ block: 'start' }));
    await pause(300);
    await shot(page, `look-${mode}-targets`);
    await go(page, '/accounts?view=reviews');
    await pause(400);
    await shot(page, `look-${mode}-reviews`);
    await page.click('.renewals .rowlink');
    await page.waitForSelector('.review').catch(() => undefined);
    await pause(300);
    await shot(page, `look-${mode}-account`);
  }
  if (want('calendar')) {
    await go(page, '/calendar');
    await shot(page, `look-${mode}-calendar`);
  }
  if (want('keys')) {
    await go(page, '/home');
    await page.keyboard.press('?');
    await pause(200);
    await shot(page, `look-${mode}-keys`);
    await page.keyboard.press('Escape');
  }
  if (errors.length) console.log(mode, 'page errors:', errors.slice(0, 5));
}

if (want('settings')) {
  for (const mode of ['light', 'dark'] as const) {
    await theme(ada.page, mode);
    await go(ada.page, '/settings/people');
    await shot(ada.page, `look-${mode}-settings`);
    await go(ada.page, '/settings/rhythm');
    await shot(ada.page, `look-${mode}-settings-rhythm`);
  }
}

if (want('phone')) {
  const { page } = await newPage(s.browser, 390, 844);
  await signIn(page, s.origin, 'zeynep@demo.example');
  await theme(page, 'light');
  await go(page, '/my');
  await shot(page, 'look-phone-my');
  await go(page, '/accounts');
  await shot(page, 'look-phone-accounts');
  await page.click('.mbar__btn');
  await pause(300);
  await shot(page, 'look-phone-drawer');
  await go(page, '/my');
  await page.click('.tabbar__add');
  await page.waitForSelector('.qa__input');
  await page.type('.qa__input', 'Teklifi gönder yarın @ben');
  await pause(200);
  await shot(page, 'look-phone-quick');
  await page.keyboard.press('Escape');
  for (const [name, path] of [['pipeline', '/records/opportunity'], ['inbox', '/inbox'], ['reports', '/reports'], ['team', '/team'], ['timeline', '/timeline'], ['reviews', '/accounts?view=reviews']] as const) {
    await go(page, path);
    await pause(400);
    await shot(page, `look-phone-${name}`);
  }
  const href = await page.$eval('.navlink--board', (a) => a.getAttribute('href')).catch(() => null);
  if (href) {
    await go(page, href);
    await shot(page, 'look-phone-board');
    await page.click('.card');
    await page.waitForSelector('.panel .props').catch(() => undefined);
    await pause(300);
    await shot(page, 'look-phone-panel');
  }
}

await s.browser.close();
s.server.close();
process.exit(0);
