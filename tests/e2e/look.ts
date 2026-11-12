// A visual pass, not a test: the main screens in light, dark and on a phone,
// written to tests/e2e/screens/look-*.png for a designer's eye.
//   npx vite build && npx tsx tests/e2e/look.ts [filter]
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'puppeteer-core';
import { SCREENS, newPage, shot, signIn, startStack } from './browser';

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
      const r = await fetch(p, { method: m, headers: { 'content-type': 'application/json', 'x-curahold-device': localStorage.getItem('app_device') ?? '' }, body: b === undefined ? undefined : JSON.stringify(b), credentials: 'include' });
      return r.status === 204 ? null : r.json();
    },
    method,
    path,
    body,
  ) as Promise<T>;
await seedShowcase(call as any, s.db, 'tr').catch((e) => console.warn('seed', e));

async function theme(page: Page, mode: 'light' | 'dark') {
  await page.evaluate((m) => {
    localStorage.setItem('app_theme', m);
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
  if (want('sub')) {
    // A task of one's own with two subtasks: opened from My tasks, then one subtask from inside it.
    await go(page, '/my');
    const as = async (method: string, path: string, body?: unknown): Promise<any> =>
      page.evaluate(
        async (m, p, b) => {
          const r = await fetch(p, { method: m, headers: { 'content-type': 'application/json', 'x-curahold-device': localStorage.getItem('app_device') ?? '' }, body: b === undefined ? undefined : JSON.stringify(b), credentials: 'include' });
          return r.status === 204 ? null : r.json();
        },
        method,
        path,
        body,
      );
    const me = await as('GET', '/api/me');
    const board = (await as('GET', '/api/boards')).boards[0];
    const parent = (await as('POST', '/api/tasks', { boardId: board.id, title: 'Yenileme teklifini hazırla', assigneeIds: [me.user.id], dueDate: new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10) })).task;
    const sub = (await as('POST', '/api/tasks', { boardId: board.id, parentId: parent.id, title: 'Fiyat tablosunu güncelle', assigneeIds: [me.user.id] })).task;
    await as('POST', '/api/tasks', { boardId: board.id, parentId: parent.id, title: 'Hukuk onayını al' });
    const made = { parent: parent.id as string, sub: sub.id as string };
    await go(page, `/my?task=${made.parent}`);
    await page.waitForSelector('.subtask__title');
    await pause(300);
    await shot(page, `look-${mode}-sub1`);
    await page.click('.subtask__title');
    await page.waitForSelector('.panel__back');
    await pause(400);
    await shot(page, `look-${mode}-sub2`);
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
  if (want('import')) {
    const href = await page.$eval('.navlink--board', (a) => a.getAttribute('href')).catch(() => null);
    if (href) {
      await go(page, href);
      await page.click('button[aria-label="Dosyadan görev aktar"]');
      await page.waitForSelector('.dropzone');
      await shot(page, `look-${mode}-import1`);
      const csv = join(SCREENS, 'look-import.csv');
      writeFileSync(csv, 'Task Name;Notes;Section;Assignee;Due Date;Priority;Customer\nYeni sözleşme taslağı;Hukuk onayı gerekli;In progress;Mert;15.01.2027;High;Quillfield Retail\nEğitim videosu çek;;Backlog;lena@demo.example, Bilinmeyen Kişi;22/01/2027;;\nEski iş;;Done;Ada;01.10.2026;;\n');
      const input = await page.$('.dropzone input[type=file]');
      await (input as any).uploadFile(csv);
      await page.waitForSelector('.map-table');
      await pause(200);
      await shot(page, `look-${mode}-import2`);
      await page.click('.importer .btn--primary');
      await page.waitForSelector('.import-result');
      await shot(page, `look-${mode}-import3`);
      await page.keyboard.press('Escape');
      await go(page, `${href}?view=archive`);
      await pause(400);
      await shot(page, `look-${mode}-archive`);
    }
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
  await go(page, '/home');
  await pause(400);
  await shot(page, 'look-phone-home');
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
