// Journeys for the shared patterns (docs/design/tokens.md, "Components"): the date
// field, the filter sheet, the five states, undo. In a real Chrome against the built
// app, like run.ts, but in its own file and port so it can run beside the others.
//   npm run build && PORT=9881 npx tsx tests/e2e/patterns.ts
import type { Page } from 'puppeteer-core';
import { byText, newPage, signIn, startStack } from './browser';

const s = await startStack(Number(process.env.PORT ?? 9881));
const results: { name: string; ok: boolean; error?: string }[] = [];
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
async function step(name: string, fn: () => Promise<void>) {
  if (only && !only.test(name)) return;
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}
function expect(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}
const sql = (text: string, params: unknown[] = []): Promise<any[]> => s.db.system((q: any) => q.query(text, params));
const csBoard: string = s.demo.boards.csBoard;
const selectAll = (el: { evaluate: (fn: (e: Element) => void) => Promise<unknown> }) => el.evaluate((e) => (e as HTMLInputElement).select());
const focused = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.className ?? '');

const desk = await newPage(s.browser);
await signIn(desk.page, s.origin, 'ada@demo.example');
const [task] = await sql('select id from tasks where board_id = $1 and archived_at is null order by created_at limit 1', [csBoard]);
const dueOf = async () => ((await sql('select due_date::text as d from tasks where id = $1', [task.id]))[0]?.d as string | null) ?? null;

await step('a date typed in the person’s own format is saved (15.11-style in Turkish)', async () => {
  const p = desk.page;
  await p.goto(`${s.origin}/b/${csBoard}?task=${task.id}`, { waitUntil: 'networkidle0' });
  const box = await p.waitForSelector('.panel input.datefield__input[aria-label="Son tarih"]');
  await box!.click();
  await selectAll(box!);
  await box!.type('20.12.2027');
  await p.keyboard.press('Tab');
  await pause(600);
  expect((await dueOf()) === '2027-12-20', `due is ${await dueOf()}`);
  expect((await box!.evaluate((el) => (el as HTMLInputElement).value)) === '20.12.2027', 'shown as typed, day first');
});

await step('the calendar answers the keyboard: Page Down, arrows, Enter, Escape', async () => {
  const p = desk.page;
  await p.click('.panel .datefield__open[aria-label$="Son tarih"]');
  await p.waitForSelector('.datepop[data-placed]');
  await pause(100);
  expect((await p.$eval('.datepop__month', (el) => el.textContent)) === 'Aralık 2027', 'opens on the chosen month');
  await p.keyboard.press('PageDown');
  await p.keyboard.press('ArrowRight');
  await p.keyboard.press('Enter');
  await pause(600);
  expect((await dueOf()) === '2028-01-21', `picked ${await dueOf()}`);
  expect(!(await p.$('.datepop')), 'closes after a pick');
  expect((await focused(p)).includes('datefield__open'), 'focus back on the calendar button');
  await p.click('.panel .datefield__open[aria-label$="Son tarih"]');
  await p.waitForSelector('.datepop[data-placed]');
  await p.keyboard.press('Escape');
  expect(!(await p.$('.datepop')), 'Escape closes the calendar');
  expect(!!(await p.$('.panel')), '…and only the calendar, not the panel');
});

await step('an impossible date says what to type and saves nothing', async () => {
  const p = desk.page;
  const box = await p.$('.panel input.datefield__input[aria-label="Son tarih"]');
  await box!.click();
  await selectAll(box!);
  await box!.type('31.02.2028');
  await p.keyboard.press('Tab');
  await pause(300);
  const msg = await p.$eval('.panel .datefield:has(input[aria-label="Son tarih"]) .datefield__error', (el) => el.textContent ?? '');
  expect(/31\.12\.\d{4}/.test(msg), `message gives an example: ${msg}`);
  expect((await dueOf()) === '2028-01-21', 'nothing saved');
});

await step('offline: a change waits in the tab, the bar says so, and it is sent when the connection is back', async () => {
  const p = desk.page;
  await p.goto(`${s.origin}/b/${csBoard}?task=${task.id}`, { waitUntil: 'networkidle0' });
  await p.setOfflineMode(true);
  await pause(300);
  const box = await p.waitForSelector('.panel input.datefield__input[aria-label="Son tarih"]');
  await box!.click();
  await selectAll(box!);
  await box!.type('05.03.2028');
  await p.keyboard.press('Tab');
  await pause(500);
  const bar = await p.$eval('.offlinebar', (el) => el.textContent ?? '').catch(() => '');
  expect(/tutuluyor/.test(bar) && /1 değişiklik bekliyor/.test(bar), `bar says: ${bar}`);
  expect((await dueOf()) !== '2028-03-05', 'not sent while offline');
  await p.setOfflineMode(false);
  await p.waitForFunction(() => !document.querySelector('.offlinebar'), { timeout: 8000 });
  await pause(500);
  expect((await dueOf()) === '2028-03-05', `sent after reconnecting: ${await dueOf()}`);
});

await step('a settings page this person may not open says who can give access', async () => {
  const m = await newPage(s.browser);
  await signIn(m.page, s.origin, 'mert@demo.example');
  await m.page.goto(`${s.origin}/settings/people`, { waitUntil: 'networkidle0' });
  const text = await m.page.$eval('.main', (el) => el.textContent ?? '');
  expect(/erişimin yok/.test(text) && /yöneticilerinden/.test(text), `shows: ${text.slice(0, 200)}`);
  await m.page.close();
});

await step('undo: a finished task comes back with Ctrl+Z while its toast shows', async () => {
  const p = desk.page;
  const [open] = await sql(`select t.id, t.status, t.title from tasks t where t.board_id = $1 and t.archived_at is null and t.status = (select b.columns->0->>'key' from boards b where b.id = $1) order by t.position limit 1`, [csBoard]);
  await p.goto(`${s.origin}/b/${csBoard}`, { waitUntil: 'networkidle0' });
  const ticked = await p.evaluate((title) => {
    const card = [...document.querySelectorAll('.card')].find((c) => c.querySelector('.card__title')?.textContent === title);
    const tick = card?.querySelector<HTMLElement>('.tick');
    tick?.click();
    return !!tick;
  }, open.title);
  expect(ticked, 'found the card and its tick');
  await pause(600);
  const [after] = await sql('select status from tasks where id = $1', [open.id]);
  expect(after.status !== open.status, 'the tick finished it');
  const btn = await p.$eval('.toast__action', (el) => `${el.getAttribute('aria-keyshortcuts')}|${el.textContent}`);
  expect(btn.startsWith('Control+Z') && btn.includes('Geri al'), `undo button: ${btn}`);
  await p.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await p.keyboard.down('Control');
  await p.keyboard.press('z');
  await p.keyboard.up('Control');
  await pause(800);
  const [back] = await sql('select status from tasks where id = $1', [open.id]);
  expect(back.status === open.status, `Ctrl+Z put it back: ${back.status}`);
});

const phone = await newPage(s.browser, 375, 667);
await signIn(phone.page, s.origin, 'ada@demo.example');

await step('on a phone the board’s filters fold into one button with a count, Clear and Apply', async () => {
  const p = phone.page;
  await p.goto(`${s.origin}/b/${csBoard}`, { waitUntil: 'networkidle0' });
  const top = await p.$eval('.card, .kanban .card, .col .card', (el) => el.getBoundingClientRect().top).catch(() => 9999);
  expect(top < 667 / 2, `first card starts at ${top}`);
  const search = await p.$eval('.topbar .input.search', (el) => el.getBoundingClientRect().width);
  expect(search > 120, `search box is ${search} px wide`);
  await p.click('.filtersheet__open');
  await p.waitForSelector('.filtersheet__box');
  await (await byText(p, '.filtersheet .fchip', 'Acil')).click();
  await pause(200);
  expect((await p.$eval('.filtersheet__open', (el) => el.textContent ?? '')).includes('1'), 'the button counts one filter');
  await (await byText(p, '.filtersheet__foot .btn', 'Filtreleri temizle')).click();
  await pause(200);
  expect(!(await p.$('.filtersheet__open .fcount')), 'Clear empties the count');
  await p.click('.filtersheet__apply');
  expect(!(await p.$('.filtersheet__box')), 'Apply closes the sheet');
});

await step('on a phone the customer list starts in the top half', async () => {
  const p = phone.page;
  await p.goto(`${s.origin}/accounts`, { waitUntil: 'networkidle0' });
  const top = await p.$eval('.acard', (el) => el.getBoundingClientRect().top).catch(() => 9999);
  expect(top < 667 / 2, `first customer starts at ${top}`);
});

for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.error ? `\n    ${r.error}` : ''}`);
for (const pg of [desk, phone]) if (pg.errors.length) console.log(`page errors: ${pg.errors.slice(0, 3).join(' | ')}`);
await s.browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
