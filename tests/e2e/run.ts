// End-to-end acceptance in a real Chrome: the built app, the real API and
// embedded Postgres. `npm run test:e2e` (builds first). Screenshots land in
// tests/e2e/screens/ for a visual check.
import type { Page } from 'puppeteer-core';
import { byText, newPage, shot, signIn, startStack } from './browser';

const s = await startStack(8899);
const results: { name: string; ok: boolean; error?: string }[] = [];
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function step(name: string, fn: () => Promise<void>) {
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
const sql = (text: string, params: unknown[] = []) => s.db.system((q) => q.query(text, params));
async function text(page: Page, sel: string) {
  return page.$eval(sel, (el) => el.textContent ?? '');
}

const mert = await newPage(s.browser);
const csBoard = s.demo.boards.csBoard;

await step('sign in with an email link and land on My tasks', async () => {
  await signIn(mert.page, s.origin, 'mert@demo.example');
  expect((await text(mert.page, '.topbar__title')).includes("Task'larım"), 'My tasks title missing');
  await shot(mert.page, 'e2e-01-my-tasks');
});

let newTaskId = '';
await step('create a task from the board', async () => {
  await mert.page.goto(`${s.origin}/b/${csBoard}`, { waitUntil: 'networkidle0' });
  await (await byText(mert.page, '.toolbar .btn--primary', 'Yeni task')).click();
  await mert.page.waitForSelector('.column input.input');
  await mert.page.type('.column input.input', 'Yenileme riskini konuş');
  await mert.page.keyboard.press('Enter');
  await mert.page.waitForFunction(() => [...document.querySelectorAll('.card__title')].some((e) => e.textContent === 'Yenileme riskini konuş'));
  const [row] = await sql(`select id, status from tasks where title = 'Yenileme riskini konuş'`);
  expect(row?.status === 'todo', 'task not stored in first column');
  newTaskId = row.id;
});

await step('drag the card to another column and the move is saved', async () => {
  const card = await byText(mert.page, '.card__title', 'Yenileme riskini konuş');
  const from = (await card.boundingBox())!;
  const target = await byText(mert.page, '.column__name', 'Devam ediyor');
  const col = await target.evaluateHandle((el) => el.closest('.column')!);
  const to = (await (col as any).boundingBox())!;
  await mert.page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await mert.page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await mert.page.mouse.move(from.x + ((to.x + to.width / 2 - from.x) * i) / 12, from.y + ((to.y + to.height - 40 - from.y) * i) / 12);
    await pause(16);
  }
  await shot(mert.page, 'e2e-02-dragging');
  await mert.page.mouse.up();
  await pause(600);
  const [row] = await sql('select status, version from tasks where id = $1', [newTaskId]);
  expect(row.status === 'doing', `status is ${row.status}, expected doing`);
  const inColumn = await mert.page.evaluate(() => {
    const col = [...document.querySelectorAll('.column')].find((c) => c.querySelector('.column__name')?.textContent === 'Devam ediyor');
    return [...(col?.querySelectorAll('.card__title') ?? [])].some((e) => e.textContent === 'Yenileme riskini konuş');
  });
  expect(inColumn, 'card not shown in the new column');
  await shot(mert.page, 'e2e-03-moved');
});

await step('comment with an @mention', async () => {
  await (await byText(mert.page, '.card__title', 'Yenileme riskini konuş')).click();
  await mert.page.waitForSelector('.composer textarea');
  await mert.page.type('.composer textarea', 'Merhaba @Zey');
  await mert.page.waitForSelector('.suggest button');
  await mert.page.keyboard.press('Enter');
  await mert.page.type('.composer textarea', 'bu hafta arayabilir misin?');
  await (await byText(mert.page, '.composer .btn--primary', 'Gönder')).click();
  await mert.page.waitForSelector('.comment .mention');
  const [c] = await sql('select body, mentions from comments where task_id = $1', [newTaskId]);
  expect(c.mentions.includes(s.demo.ids.zeynep), 'mention not stored');
  expect(c.body.includes(`@[Zeynep Tunç](${s.demo.ids.zeynep})`), 'mention markup missing');
  await shot(mert.page, 'e2e-04-comment');
});

await step('two people edit at once: the change is merged, nothing lost', async () => {
  // Someone else renames the task while the panel is open.
  await sql(`update tasks set title = 'Yenileme riskini Zeynep ile konuş', version = version + 1 where id = $1`, [newTaskId]);
  await mert.page.select('.panel select:nth-of-type(1)', 'done').catch(async () => {
    const selects = await mert.page.$$('.panel .props select');
    await selects[0].select('done');
  });
  await mert.page.waitForSelector('.panel .notice');
  const notice = await text(mert.page, '.panel .notice');
  expect(notice.includes('değiştirdi'), `unexpected notice: ${notice}`);
  const [row] = await sql('select title, status from tasks where id = $1', [newTaskId]);
  expect(row.title === 'Yenileme riskini Zeynep ile konuş' && row.status === 'done', `lost a change: ${JSON.stringify(row)}`);
  await shot(mert.page, 'e2e-05-merged');
  await mert.page.keyboard.press('Escape');
});

await step('switch the interface to English', async () => {
  await (await byText(mert.page, '.navlink', 'Dil:')).click();
  await mert.page.waitForFunction(() => document.body.innerText.includes('Language: English'));
  expect(await mert.page.evaluate(() => document.body.innerText.includes('My tasks')), 'English navigation missing');
  const [u] = await sql(`select locale from users where email = 'mert@demo.example'`);
  expect(u.locale === 'en', 'language not saved to the profile');
  await (await byText(mert.page, '.navlink', 'Language:')).click();
});

await step('a viewer seat sees everything but cannot write', async () => {
  const sofia = await newPage(s.browser);
  await signIn(sofia.page, s.origin, 'sofia@demo.example');
  await sofia.page.goto(`${s.origin}/b/${s.demo.boards.renewals}`, { waitUntil: 'networkidle0' });
  await sofia.page.waitForSelector('.card');
  expect((await sofia.page.$$('.toolbar .btn--primary')).length === 0, 'viewer sees New task');
  expect(await sofia.page.evaluate(() => document.body.innerText.includes('Salt okunur koltuk')), 'read-only label missing');
  await shot(sofia.page, 'e2e-06-viewer');
  await sofia.page.browserContext().close();
});

await step('a third device signs out the oldest, with an explanation', async () => {
  const one = await newPage(s.browser);
  await signIn(one.page, s.origin, 'omar@demo.example');
  const two = await newPage(s.browser);
  await signIn(two.page, s.origin, 'omar@demo.example');
  const three = await newPage(s.browser);
  await signIn(three.page, s.origin, 'omar@demo.example');
  await one.page.goto(`${s.origin}/calendar`, { waitUntil: 'networkidle0' });
  await one.page.waitForSelector('.auth__card .notice');
  const msg = await text(one.page, '.auth__card .notice');
  expect(msg.includes('başka bir cihazda'), `unexpected message: ${msg}`);
  await shot(one.page, 'e2e-07-evicted');
  for (const p of [one, two, three]) await p.page.browserContext().close();
});

await step("the company's own vocabulary appears in the interface", async () => {
  const ada = await newPage(s.browser);
  await signIn(ada.page, s.origin, 'ada@demo.example');
  await ada.page.goto(`${s.origin}/settings/company`, { waitUntil: 'networkidle0' });
  const inputs = await ada.page.$$('.sheet:nth-of-type(2) input.input');
  await inputs[2].type('Partner');
  await inputs[3].type('Partnerler');
  await (await byText(ada.page, 'form .btn--primary', 'Kaydet')).click();
  await pause(500);
  await ada.page.goto(`${s.origin}/b/${csBoard}`, { waitUntil: 'networkidle0' });
  const ph = await ada.page.$eval('input.search', (el) => (el as HTMLInputElement).placeholder);
  expect(ph === 'Task veya partner ara', `placeholder: ${ph}`);
  await ada.page.goto(`${s.origin}/settings/people`, { waitUntil: 'networkidle0' });
  await ada.page.waitForSelector('.table');
  await shot(ada.page, 'e2e-08-settings-people');
  await ada.page.browserContext().close();
});

await step('phone layout: columns and the menu work', async () => {
  const phone = await newPage(s.browser, 390, 844);
  await signIn(phone.page, s.origin, 'zeynep@demo.example');
  await phone.page.goto(`${s.origin}/b/${csBoard}`, { waitUntil: 'networkidle0' });
  await phone.page.waitForSelector('.column');
  await shot(phone.page, 'e2e-09-phone-board');
  await phone.page.click('.menu-toggle');
  await pause(250);
  const open = await phone.page.$eval('.shell', (el) => el.getAttribute('data-nav'));
  expect(open === 'open', 'menu did not open');
  await shot(phone.page, 'e2e-10-phone-menu');
  await phone.page.browserContext().close();
});

await step('no script errors in the browser', async () => {
  expect(mert.errors.length === 0, mert.errors.join(' | '));
});

await s.browser.close();
s.server.close();

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.error ? `\n    ${r.error}` : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} browser checks passed`);
process.exit(failed.length ? 1 : 0);
