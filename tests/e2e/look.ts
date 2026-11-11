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
const want = (name: string) => !only || name.includes(only);

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
    await go(page, '/my');
    await page.click('.tasklist__row');
    await page.waitForSelector('.panel');
    await pause(300);
    await shot(page, `look-${mode}-panel`);
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
}

await s.browser.close();
s.server.close();
process.exit(0);
