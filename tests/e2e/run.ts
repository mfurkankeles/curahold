// End-to-end acceptance in a real Chrome: the built app, the real API and
// embedded Postgres. `npm run test:e2e` (builds first). Screenshots land in
// tests/e2e/screens/ for a visual check.
import { createHash } from 'node:crypto';
import type { Page } from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCREENS, STAFF_KEY, byText, newPage, shot, signIn, startStack } from './browser';

const s = await startStack(8899);
const results: { name: string; ok: boolean; error?: string }[] = [];
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, error: e instanceof Error ? e.message : String(e) });
    // A picture of every open page at the moment of failure.
    for (const [i, pg] of (await s.browser.pages()).entries()) await shot(pg, `fail-${results.length}-${i}`).catch(() => undefined);
  }
}
function expect(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}
const sql = (text: string, params: unknown[] = []) => s.db.system((q) => q.query(text, params));
/** Toasts sit over the foot of the sidebar for a few seconds; close them before reaching for it. */
async function clearToasts(page: Page) {
  await page.evaluate(() => document.querySelectorAll<HTMLElement>('.toast__close').forEach((b) => b.click()));
}
async function text(page: Page, sel: string) {
  return page.$eval(sel, (el) => el.textContent ?? '');
}

const mert = await newPage(s.browser);
const csBoard = s.demo.boards.csBoard;

await step("sign in with an email link and land on the role's home page", async () => {
  await signIn(mert.page, s.origin, 'mert@demo.example');
  await mert.page.waitForSelector('.pane');
  expect(mert.page.url().endsWith('/home'), `landed on ${mert.page.url()}`);
  expect((await text(mert.page, '.topbar__title')).includes('Ekip görünümü'), 'team home missing');
  await mert.page.goto(`${s.origin}/my`, { waitUntil: 'networkidle0' });
  expect((await text(mert.page, '.topbar__title')).includes('Görevlerim'), 'My tasks title missing');
  await shot(mert.page, 'e2e-01-my-tasks');
});

let newTaskId = '';
await step('create a task from the board', async () => {
  await mert.page.goto(`${s.origin}/b/${csBoard}`, { waitUntil: 'networkidle0' });
  await (await byText(mert.page, '.toolbar .btn--primary', 'Yeni görev')).click();
  await mert.page.waitForSelector('.qa__input');
  await mert.page.type('.qa__input', 'Yenileme riskini konuş');
  await mert.page.keyboard.press('Enter');
  await mert.page.waitForFunction(() => [...document.querySelectorAll('.card__title')].some((e) => e.textContent === 'Yenileme riskini konuş'));
  const [row] = await sql(`select id, status from tasks where title = 'Yenileme riskini konuş'`);
  expect(row?.status === 'todo', 'task not stored in first column');
  newTaskId = row.id;
});

await step('a column’s "Add task" asks for the details in the New task dialog', async () => {
  const col = await mert.page.evaluateHandle(() => [...document.querySelectorAll('.column')].find((c) => c.querySelector('.column__name')?.textContent === 'Devam ediyor')!);
  await (await (col as any).$('.column__add')).click();
  await mert.page.waitForSelector('.qa .qa__grid');
  // The dialog opens on the column it was asked from, with the fields to fill.
  const status = await mert.page.$$eval('.qa__grid select', (els) => els.map((e) => (e as HTMLSelectElement).value));
  expect(status.includes('doing'), `column not preset: ${status.join(',')}`);
  await mert.page.keyboard.press('Escape');
  await mert.page.waitForFunction(() => !document.querySelector('.qa'));
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

await step('switch the interface to English from the personal menu', async () => {
  await clearToasts(mert.page);
  await mert.page.click('.sidebar__me');
  await (await byText(mert.page, '.popmenu__seg button', 'English')).click();
  await mert.page.waitForFunction(() => document.body.innerText.includes('My tasks'));
  const [u] = await sql(`select locale from users where email = 'mert@demo.example'`);
  expect(u.locale === 'en', 'language not saved to the profile');
  await (await byText(mert.page, '.popmenu__seg button', 'Türkçe')).click();
  await mert.page.waitForFunction(() => document.body.innerText.includes('Görevlerim'));
  await mert.page.keyboard.press('Escape');
});

await step('the New task dialog fills its fields from one line', async () => {
  await mert.page.goto(`${s.origin}/my`, { waitUntil: 'networkidle0' });
  await mert.page.keyboard.press('n');
  await mert.page.waitForSelector('.qa__input');
  await mert.page.type('.qa__input', 'QBR sunumunu hazırla yarın @zeynep !yüksek');
  // People, date and priority read from the title show in their fields, marked "from the title".
  await mert.page.waitForFunction(() => document.querySelectorAll('.qa__from').length >= 3);
  await shot(mert.page, 'e2e-06-quick-add');
  await mert.page.keyboard.press('Enter');
  await mert.page.waitForFunction(() => !document.querySelector('.qa'));
  const [row] = await sql(`select title, due_date::text as due, priority, assignee_ids from tasks where title = 'QBR sunumunu hazırla'`);
  expect(row, 'task not created');
  expect(row.priority === 'high', `priority ${row.priority}`);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  expect(Math.abs(Date.parse(row.due) - Date.parse(tomorrow)) <= 86_400_000, `due ${row.due}`);
  const [z] = await sql(`select id from users where email = 'zeynep@demo.example'`);
  const [m] = await sql(`select id from users where email = 'mert@demo.example'`);
  expect(row.assignee_ids.includes(z.id) && row.assignee_ids.includes(m.id), 'Zeynep and Mert (My tasks default) should both be on it');
});

await step('one click on the tick finishes a task, and undo brings it back', async () => {
  await mert.page.goto(`${s.origin}/my`, { waitUntil: 'networkidle0' });
  const before = await mert.page.$$eval('.tasklist__row', (r) => r.length);
  await mert.page.click('.tasklist__row .tick');
  await mert.page.waitForFunction(() => [...document.querySelectorAll('.toast')].some((x) => x.textContent?.includes('Tamamlandı')), { timeout: 5000 });
  await mert.page.waitForFunction((n) => document.querySelectorAll('.tasklist__row').length === n - 1, { timeout: 5000 }, before);
  await mert.page.evaluate(() => ([...document.querySelectorAll('.toast')].find((x) => x.textContent?.includes('Tamamlandı'))?.querySelector('.toast__action') as HTMLElement)?.click());
  await mert.page.waitForFunction((n) => document.querySelectorAll('.tasklist__row').length === n, { timeout: 5000 }, before);
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
  const inputs = await ada.page.$$('.sheet:nth-of-type(3) input.input');
  // The template already filled in a word; replace it.
  for (const [i, word] of [[2, 'Partner'], [3, 'Partnerler']] as const) {
    await inputs[i].click();
    await ada.page.keyboard.down('Control');
    await ada.page.keyboard.press('a');
    await ada.page.keyboard.up('Control');
    await inputs[i].type(word);
  }
  await (await byText(ada.page, 'form .btn--primary', 'Kaydet')).click();
  await pause(500);
  await ada.page.goto(`${s.origin}/b/${csBoard}`, { waitUntil: 'networkidle0' });
  const ph = await ada.page.$eval('input.search', (el) => (el as HTMLInputElement).placeholder);
  expect(ph === 'Görev veya partner ara', `placeholder: ${ph}`);
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
  expect(await phone.page.$('.tabbar__add'), 'no add button in the bottom bar');
  await phone.page.click('.mbar__btn');
  await pause(250);
  const open = await phone.page.$eval('.shell', (el) => el.getAttribute('data-nav'));
  expect(open === 'open', 'menu did not open');
  await shot(phone.page, 'e2e-10-phone-menu');
  await phone.page.browserContext().close();
});


// ------------------------------------------------------------- phase 2

const port = 8899;
const central = `http://app.localhost:${port}`;
const csv = 'Firma;Sorumlu;Yenileme;Yıllık tutar;Segment\nAkasya Mobilya;selin@yeni-sirket.example;31.03.2027;120.000;Kurumsal\nBeyaz Liman Lojistik;selin@yeni-sirket.example;15.05.2027;48.500;KOBİ\nÇınar Eczaneleri;Okan Demir;01.09.2027;64.000;Orta ölçek\n';
const csvPath = `${import.meta.dirname}/screens/musteriler.csv`;
(await import('node:fs')).writeFileSync(csvPath, csv);

const founder = await newPage(s.browser);
await step('a new company signs up alone and lands in the setup wizard, signed in', async () => {
  const p = founder.page;
  await p.goto(`${central}/`, { waitUntil: 'networkidle0' });
  await p.waitForSelector('input[type=email]');
  await (await byText(p, '.seg button', 'Türkçe')).click();
  await shot(p, 'p2-01-signup');
  await p.type('input[type=email]', 'deniz@yeni-sirket.example');
  await p.click('form button.btn--primary');
  const link = await p.waitForSelector('a.btn[href^="/signup/verify"]');
  await link!.click();
  await p.waitForSelector('.signup-form');
  const company = await p.$eval('.signup-form input', (el) => (el as HTMLInputElement).value);
  expect(company === 'Yeni Sirket', `suggested name: ${company}`);
  await p.$eval('.signup-form input', (el) => ((el as HTMLInputElement).value = ''));
  await p.type('.signup-form input', 'Yeni Şirket');
  await p.waitForFunction(() => document.querySelector('#slug-msg')?.textContent === 'Uygun.');
  const inputs = await p.$$('.signup-form input.input');
  await inputs[2].type('Deniz Kaya');
  await shot(p, 'p2-02-signup-details');
  await p.click('.signup-form button.btn--primary');
  await p.waitForSelector('.wizard', { timeout: 15_000 });
  expect(p.url().startsWith(`http://yeni-sirket.localhost:${port}/setup`), `landed on ${p.url()}`);
  await shot(p, 'p2-03-wizard-company');
});

await step('wizard: company, chat (skipped), customers from a spreadsheet', async () => {
  const p = founder.page;
  await (await byText(p, '.wizard__panel button.btn--primary', 'Kaydet ve devam et')).click();
  await p.waitForSelector('.tiles');
  await shot(p, 'p2-04-wizard-messaging');
  await (await byText(p, '.wizard__nav .btn--primary', 'Devam et')).click();
  await p.waitForSelector('.dropzone');
  const input = await p.$('.dropzone input[type=file]');
  await (input as any).uploadFile(csvPath);
  await p.waitForSelector('.map-table');
  const targets = await p.$$eval('.map-table select', (els) => els.map((e) => (e as HTMLSelectElement).value));
  expect(targets[0] === 'name' && targets[1] === 'owner' && targets[2] === 'field:renewal_date', `guessed: ${targets.join(',')}`);
  await shot(p, 'p2-05-wizard-import-mapping');
  await (await byText(p, '.importer .btn--primary', '3 satırı içe aktar')).click();
  await p.waitForSelector('.import-result');
  const [row] = await sql(`select fields from accounts a join orgs o on o.id = a.org_id where o.slug = 'yeni-sirket' and a.name = 'Akasya Mobilya'`);
  expect(row.fields.arr === 120000 && row.fields.renewal_date === '2027-03-31' && row.fields.tier === 'enterprise', JSON.stringify(row.fields));
  await shot(p, 'p2-06-wizard-import-result');
  await (await byText(p, '.wizard__nav .btn--primary', 'Devam et')).click();
});

await step('wizard: people from the file, rules, invitations', async () => {
  const p = founder.page;
  await p.waitForSelector('.people-picks');
  await shot(p, 'p2-07-wizard-people');
  const names = await p.$$eval('.people-picks tbody td .muted', (els) => els.map((e) => e.textContent));
  expect(names.includes('selin@yeni-sirket.example'), `suggested: ${names.join(',')}`);
  await p.type('.wizard__panel textarea', 'okan@yeni-sirket.example, Okan Demir');
  await (await byText(p, '.wizard__nav .btn--primary', '2 kişiyi ekle')).click();
  await p.waitForSelector('.rules .rule');
  await pause(300);
  await shot(p, 'p2-08-wizard-rules');
  await (await byText(p, '.wizard__nav .btn--primary', 'Devam et')).click();
  await p.waitForSelector('.checklist');
  await (await byText(p, '.wizard__nav .btn--primary', 'Bitir ve çalışmaya başla')).click();
  await p.waitForSelector('.board', { timeout: 15_000 });
  const owners = await sql(`select a.name, u.email from accounts a join users u on u.id = a.owner_id join orgs o on o.id = a.org_id where o.slug = 'yeni-sirket' order by a.name`);
  expect(owners.length === 3, `owners linked: ${JSON.stringify(owners)}`);
  const invited = s.email.sent.filter((m) => m.to === 'selin@yeni-sirket.example' || m.to === 'okan@yeni-sirket.example');
  expect(invited.length === 2, `invites sent: ${invited.length}`);
  await shot(p, 'p2-09-first-board');
});

await step('accounts list with fields, detail page, and the rule editor preview', async () => {
  const p = founder.page;
  await p.evaluate(() => localStorage.setItem('app_accounts_view', 'table'));
  await p.goto(`http://yeni-sirket.localhost:${port}/accounts`, { waitUntil: 'networkidle0' });
  await p.waitForSelector('.accounts-table');
  await shot(p, 'p2-10-accounts');
  await (await byText(p, '.accounts-table a.rowlink', 'Akasya Mobilya')).click();
  await p.waitForSelector('.account-page');
  await shot(p, 'p2-11-account-page');
  await p.goto(`http://yeni-sirket.localhost:${port}/settings/automations`, { waitUntil: 'networkidle0' });
  await p.waitForSelector('.rule');
  await (await byText(p, '.rules .section__head .btn', 'Yeni kural')).click();
  await (await byText(p, '.preset', 'Yenilemeden 90 gün önce plan aç')).click();
  await p.waitForSelector('.rule-preview');
  await p.waitForFunction(() => /kayıt için çalışırdı|hiçbir şey için çalışmazdı/.test(document.querySelector('.rule-preview')?.textContent ?? ''), { timeout: 5000 });
  await shot(p, 'p2-12-rule-editor');
  await p.keyboard.press('Escape');
});

await step('someone at the domain asks to join; an admin approves; they set themselves up', async () => {
  const guest = await newPage(s.browser);
  const g = guest.page;
  await g.goto(`${s.origin}/login`, { waitUntil: 'networkidle0' });
  await g.type('input[type=email]', 'yeni.gelen@demo.example');
  await g.click('form button.btn--primary');
  const link = await g.waitForSelector('a.btn[href^="/join"]');
  await link!.click();
  await g.waitForSelector('textarea');
  await g.type('input.input', 'Yeni Gelen');
  await g.type('textarea', 'CS ekibine katıldım');
  await shot(g, 'p2-13-join');
  await g.click('form button.btn--primary');
  await g.waitForFunction(() => document.querySelector('.auth__title')?.textContent === 'İstek gönderildi');

  const ada = await newPage(s.browser);
  await signIn(ada.page, s.origin, 'ada@demo.example');
  await ada.page.waitForFunction(() => Number(document.querySelector('.bell__count')?.textContent ?? 0) > 0, { timeout: 8000 });
  await ada.page.goto(`${s.origin}/settings/joining`, { waitUntil: 'networkidle0' });
  await ada.page.waitForSelector('.join-note');
  await shot(ada.page, 'p2-14-join-requests');
  await (await byText(ada.page, '.btn--primary', 'Onayla')).click();
  await ada.page.waitForFunction(() => !document.querySelector('.join-note'));

  const mail = s.email.sent.filter((m) => m.to === 'yeni.gelen@demo.example').pop()!;
  const token = /#token=([\w-]+)/.exec(mail.text)![1];
  await g.goto(`${s.origin}/auth/verify#token=${token}`, { waitUntil: 'networkidle0' });
  await g.waitForSelector('.choice-list', { timeout: 15_000 });
  expect(g.url().endsWith('/welcome'), `new person landed on ${g.url()}`);
  await shot(g, 'p2-15-welcome');
  await (await byText(g, '.choice strong', 'E-posta')).click();
  await (await byText(g, '.wizard__nav .btn--primary', 'Başla')).click();
  await g.waitForFunction(() => location.pathname === '/my');
  const [u] = await sql(`select onboarded_at, prefs from users where email = 'yeni.gelen@demo.example'`);
  expect(u.onboarded_at && u.prefs.channel === 'email', JSON.stringify(u));
  await ada.page.goto(`${s.origin}/settings/people`, { waitUntil: 'networkidle0' });
  await ada.page.waitForSelector('.seat-summary');
  await shot(ada.page, 'p2-16-people-admin');
  await ada.page.goto(`${s.origin}/settings/connections`, { waitUntil: 'networkidle0' });
  await ada.page.waitForSelector('.tiles');
  await shot(ada.page, 'p2-17-connections');
  await ada.page.goto(`${s.origin}/settings/fields`, { waitUntil: 'networkidle0' });
  await ada.page.waitForSelector('.field-row');
  await shot(ada.page, 'p2-18-fields');
  await ada.page.click('.bell__btn');
  await ada.page.waitForSelector('.bell__pop');
  await shot(ada.page, 'p2-19-bell');
  expect(founder.errors.length === 0 && ada.errors.length === 0 && guest.errors.length === 0, [...founder.errors, ...ada.errors, ...guest.errors].join(' | '));
  await guest.page.browserContext().close();
  await ada.page.browserContext().close();
});

await step('phone: wizard and accounts fit a phone screen', async () => {
  const phone = await newPage(s.browser, 390, 844);
  await signIn(phone.page, s.origin, 'lena@demo.example');
  await phone.page.goto(`${s.origin}/accounts`, { waitUntil: 'networkidle0' });
  // Cards first (the default), then the table: neither may scroll sideways.
  await phone.page.waitForSelector('.acards');
  expect(!(await phone.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'customer cards scroll sideways on a phone');
  await shot(phone.page, 'p2-19-phone-cards');
  await (await byText(phone.page, '.seg--views button', 'Tablo')).click();
  await phone.page.waitForSelector('.accounts-table');
  const overflow = await phone.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(!overflow, 'accounts page scrolls sideways on a phone');
  await shot(phone.page, 'p2-20-phone-accounts');
  await phone.page.browserContext().close();
});


await step('roles: the grid of who can do what, and one person explained', async () => {
  const ada = await newPage(s.browser);
  await signIn(ada.page, s.origin, 'ada@demo.example');
  await ada.page.goto(`${s.origin}/settings/roles`, { waitUntil: 'networkidle0' });
  await ada.page.waitForSelector('.matrix');
  await shot(ada.page, 'p3-01-roles');
  const [manager] = await sql(`select r.id, r.perms from roles r join orgs o on o.id = r.org_id where o.slug = 'demo' and r.key = 'manager'`);
  expect(!manager.perms.includes('boards.manage_all'), 'manager already has the permission');
  await ada.page.click('input[aria-label="Ekip lideri: Her panoyu düzenleme ve arşivleme"]');
  await ada.page.waitForFunction(() => (document.querySelector('input[aria-label="Ekip lideri: Her panoyu düzenleme ve arşivleme"]') as HTMLInputElement)?.checked);
  await pause(300);
  const [after] = await sql('select perms from roles where id = $1', [manager.id]);
  expect(after.perms.includes('boards.manage_all'), 'permission not saved');
  await (await byText(ada.page, '.seg button', 'Kişiye göre')).click();
  await ada.page.waitForSelector('.table tbody tr');
  const row = await ada.page.evaluateHandle(() => [...document.querySelectorAll('.table tbody tr')].find((tr) => tr.textContent?.includes('Lena Fischer')));
  await (await (row as any).$('button')).click();
  await ada.page.waitForSelector('.access__perms');
  await shot(ada.page, 'p3-02-access');
  expect(ada.errors.length === 0, ada.errors.join(' | '));
  await ada.page.browserContext().close();
});

await step('CRM: connect, choose, map, preview and start — then records everywhere', async () => {
  const ada = await newPage(s.browser);
  await signIn(ada.page, s.origin, 'ada@demo.example');
  await ada.page.goto(`${s.origin}/settings/sources`, { waitUntil: 'networkidle0' });
  await ada.page.waitForSelector('.tiles');
  await shot(ada.page, 'p3-03-sources');
  const demoTile = await ada.page.evaluateHandle(() => [...document.querySelectorAll('.tile')].find((t) => t.textContent?.includes('Demo CRM')));
  await (await (demoTile as any).$('button')).click();
  await ada.page.waitForSelector('.object-list');
  await ada.page.waitForFunction(() => document.querySelectorAll('.object-row').length === 5);
  const risk = await ada.page.evaluateHandle(() => [...document.querySelectorAll('.object-row')].find((r) => r.textContent?.includes('Risks')));
  // The sticky step bar can sit over a row near the bottom: bring it to the middle first.
  await (risk as any).evaluate((el: Element) => el.scrollIntoView({ block: 'center' }));
  await (await (risk as any).$('input[type=checkbox]')).click();
  await shot(ada.page, 'p3-04-objects');
  await (await byText(ada.page, '.stepbar .btn--primary', 'Devam')).click();
  await ada.page.waitForSelector('.map-table');
  await ada.page.waitForFunction(() => [...document.querySelectorAll('.map-object .badge')].every((b) => !b.textContent?.includes('Yükleniyor')));
  await shot(ada.page, 'p3-05-fields');
  await (await byText(ada.page, '.stepbar .btn--primary', 'Devam')).click();
  await ada.page.waitForSelector('.preview-list li', { timeout: 15_000 });
  await ada.page.waitForSelector('.owners-table');
  await shot(ada.page, 'p3-06-start');
  await (await byText(ada.page, '.stepbar .btn--primary', 'Eşitlemeyi başlat')).click();
  await ada.page.waitForSelector('.source__tabs', { timeout: 30_000 });
  await ada.page.waitForFunction(() => !!document.querySelector('.run--ok, .run--partial'), { timeout: 30_000 });
  await shot(ada.page, 'p3-07-status');
  const [n] = await sql(`select count(*)::int as n from accounts a join orgs o on o.id = a.org_id where o.slug = 'demo' and a.source = 'demo'`);
  expect(n.n === 12, `expected 12 accounts from the CRM, got ${n.n}`);
  const [r] = await sql(`select count(*)::int as n from records r join record_types t on t.id = r.type_id join orgs o on o.id = r.org_id where o.slug = 'demo' and t.kind = 'custom'`);
  expect(r.n > 0, 'no risk records came over');

  await ada.page.goto(`${s.origin}/records/contact`, { waitUntil: 'networkidle0' });
  await ada.page.waitForSelector('.record-tabs');
  await ada.page.waitForSelector('.table tbody tr');
  await shot(ada.page, 'p3-08-contacts');
  const [atlas] = await sql(`select a.id from accounts a join orgs o on o.id = a.org_id where o.slug = 'demo' and a.name = 'Atlas Logistics'`);
  await ada.page.goto(`${s.origin}/accounts/${atlas.id}`, { waitUntil: 'networkidle0' });
  await ada.page.waitForSelector('.record-lines');
  await shot(ada.page, 'p3-09-account-records');
  // An edit here goes to the CRM.
  await ada.page.$eval('.title-input', (el) => ((el as HTMLInputElement).value = ''));
  await ada.page.type('.title-input', 'Atlas Logistics Group');
  await ada.page.keyboard.press('Tab');
  await ada.page.waitForFunction(async () => true);
  await pause(1500);
  const [left] = await sql(`select count(*)::int as n from sync_changes s join orgs o on o.id = s.org_id where o.slug = 'demo'`);
  expect(left.n === 0, `change still waiting to be sent (${left.n})`);
  expect(ada.errors.length === 0, ada.errors.join(' | '));
  await ada.page.browserContext().close();
});


// Sign-in links are rate-limited per person, so the last admin session is kept for the steps after it.
let adaKeep: Awaited<ReturnType<typeof newPage>> | null = null;
await step('stakeholders: org chart with drag and drop, and a stakeholder card', async () => {
  const ada = await newPage(s.browser);
  adaKeep = ada;
  await signIn(ada.page, s.origin, 'ada@demo.example');
  const [blue] = await sql(`select a.id from accounts a join orgs o on o.id = a.org_id where o.slug = 'demo' and a.name = 'Bluebay Travel'`);
  const people = await sql(`select id, name, parent_id from records where account_id = $1 order by name`, [blue.id]);
  const jordan = people.find((p: any) => p.name === 'Jordan Blake')!;
  const other = people.find((p: any) => p.name !== 'Jordan Blake' && p.name && !/Renewal|Upsell|module|review|dropped|changed/i.test(p.name))!;
  expect(jordan && other && other.parent_id === jordan.id, `reports-to did not come over: ${JSON.stringify(people)}`);
  await ada.page.goto(`${s.origin}/accounts/${blue.id}`, { waitUntil: 'networkidle0' });
  await ada.page.waitForSelector('.org-card');
  await shot(ada.page, 'p3-11-org-chart');
  const drag = async (fromName: string, to: () => Promise<any>) => {
    // The chart sits below the timeline: bring it into view before dragging.
    await ada.page.evaluate(() => document.querySelector('.org__root')?.scrollIntoView({ block: 'start' }));
    await pause(100);
    const card = await ada.page.evaluateHandle((n) => [...document.querySelectorAll('.org-card')].find((c) => c.querySelector('strong')?.textContent === n), fromName);
    const a = (await (card as any).boundingBox())!;
    const target = await to();
    const b = (await target.boundingBox())!;
    await ada.page.mouse.move(a.x + 60, a.y + 20);
    await ada.page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await ada.page.mouse.move(a.x + 60 + ((b.x + b.width / 2 - a.x - 60) * i) / 10, a.y + 20 + ((b.y + b.height / 2 - a.y - 20) * i) / 10);
      await pause(16);
    }
    await pause(60);
    await ada.page.mouse.up();
    await pause(700);
  };
  await drag(other.name, () => ada.page.$('.org__root'));
  let [row] = await sql('select parent_id from records where id = $1', [other.id]);
  expect(row.parent_id === null, 'drop on the top strip did not clear the manager');
  await drag(other.name, async () => ada.page.evaluateHandle(() => [...document.querySelectorAll('.org-card')].find((c) => c.querySelector('strong')?.textContent === 'Jordan Blake')));
  [row] = await sql('select parent_id from records where id = $1', [other.id]);
  expect(row.parent_id === jordan.id, 'drop on a person did not set the manager');
  await (await byText(ada.page, '.org-card__main strong', 'Jordan Blake')).click();
  await ada.page.waitForSelector('.contact-links');
  await shot(ada.page, 'p3-12-stakeholder');
  expect(ada.errors.length === 0, ada.errors.join(' | '));

  // The same screens on a phone (same session: sign-in links are rate-limited).
  await ada.page.keyboard.press('Escape');
  await ada.page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  const [c] = await sql(`select c.id from connections c join orgs o on o.id = c.org_id where o.slug = 'demo' and c.kind = 'source' limit 1`);
  await ada.page.goto(`${s.origin}/settings/sources/${c.id}`, { waitUntil: 'networkidle0' });
  await ada.page.waitForSelector('.source__tabs');
  let overflow = await ada.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(!overflow, 'sync page scrolls sideways on a phone');
  await shot(ada.page, 'p3-10-phone-sync');
  await ada.page.goto(`${s.origin}/accounts/${blue.id}`, { waitUntil: 'networkidle0' });
  await ada.page.waitForSelector('.org-card');
  overflow = await ada.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(!overflow, 'account page scrolls sideways on a phone');
  await shot(ada.page, 'p3-13-phone-org');
});

await step('home pages: an admin adds a card and everyone with the page sees it', async () => {
  const ada = adaKeep!;
  await ada.page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await ada.page.goto(`${s.origin}/`, { waitUntil: 'networkidle0' });
  await ada.page.waitForSelector('.pane');
  expect((await text(ada.page, '.topbar__title')).includes('Ekip görünümü'), 'admin home is not the team view');
  await shot(ada.page, 'p4-01-home-team');
  await (await byText(ada.page, '.btn', 'Sayfayı düzenle')).click();
  await ada.page.waitForSelector('.pane__tools');
  await ada.page.click('.pane--add');
  await (await byText(ada.page, '.library__name', 'Not')).click();
  await ada.page.waitForSelector('.dialog textarea');
  await ada.page.type('.dialog textarea', 'Bu çeyrek önce yenilemeler.');
  await (await byText(ada.page, '.dialog .btn--primary', 'Kaydet')).click();
  await (await byText(ada.page, '.topbar .btn--primary', 'Kaydet')).click();
  await ada.page.waitForFunction(() => [...document.querySelectorAll('.pane[data-type="note"]')].some((e) => e.textContent?.includes('önce yenilemeler')));
  const [page] = await sql(`select p.cards from pages p join orgs o on o.id = p.org_id where o.slug = 'demo' and 'manager' = any (p.home_for)`);
  expect(page.cards.some((c: any) => c.type === 'note' && c.text.includes('yenilemeler')), 'note card not saved');
  await shot(ada.page, 'p4-02-home-note');
});

await step('field access: hide a field from members, then look as one of them', async () => {
  const ada = adaKeep!;
  await ada.page.goto(`${s.origin}/settings/fields`, { waitUntil: 'networkidle0' });
  await ada.page.waitForSelector('.access-pill');
  const pill = await ada.page.evaluateHandle(() => {
    const row = [...document.querySelectorAll('.field-row')].find((r) => [...r.querySelectorAll('input')].some((i) => (i as HTMLInputElement).value === 'Yıllık tutar'));
    return row?.querySelector('.access-pill');
  });
  await (pill as any).click();
  await ada.page.waitForSelector('.faccess .seg button', { timeout: 15_000 });
  await (await byText(ada.page, '.faccess .seg button', 'Seçili roller')).click();
  await shot(ada.page, 'p4-03-field-access');
  await (await byText(ada.page, '.dialog .btn--primary', 'Kaydet')).click();
  await ada.page.click('.savebar .btn--primary');
  await pause(500);
  const [org] = await sql(`select account_fields from orgs where slug = 'demo'`);
  const arr = org.account_fields.find((f: any) => f.key === 'arr');
  expect(arr.access?.view?.includes('manager') && !arr.access.view.includes('member'), `access not saved: ${JSON.stringify(arr.access)}`);

  await ada.page.goto(`${s.origin}/settings/roles`, { waitUntil: 'networkidle0' });
  await (await byText(ada.page, '.seg button', 'Kişiye göre')).click();
  const row = await ada.page.evaluateHandle(() => [...document.querySelectorAll('tbody tr')].find((r) => r.textContent?.includes('Lena Fischer'))?.querySelector('.btn'));
  await (row as any).click();
  await ada.page.waitForSelector('.access__preview');
  await (await byText(ada.page, '.access__preview .btn', 'Onun görünümünü aç')).click();
  await ada.page.waitForSelector('.previewbar', { timeout: 15_000 });
  await ada.page.waitForSelector('.pane');
  expect((await text(ada.page, '.topbar__title')).includes('Benim günüm'), 'member home not shown in preview');
  await shot(ada.page, 'p4-04-preview-home');
  await ada.page.evaluate(() => localStorage.setItem('app_accounts_view', 'table'));
  await ada.page.goto(`${s.origin}/accounts`, { waitUntil: 'networkidle0' });
  await ada.page.waitForSelector('.accounts-table');
  const heads = await ada.page.$$eval('.accounts-table th', (ths) => ths.map((t) => t.textContent ?? ''));
  expect(!heads.some((h) => h.includes('Yıllık tutar')), `hidden field shown: ${heads.join(', ')}`);
  expect(!(await ada.page.$('.topbar .btn--primary')), 'write button shown while previewing');
  await shot(ada.page, 'p4-05-preview-accounts');
  await (await byText(ada.page, '.previewbar .btn', 'Kendi görünümüme dön')).click();
  await ada.page.waitForFunction(() => !document.querySelector('.previewbar') && location.pathname.startsWith('/settings'));
  const [log] = await sql(`select count(*)::int as n from audit_log where action = 'user.previewed'`);
  expect(log.n > 0, 'preview not in the activity log');
  expect(ada.errors.length === 0, ada.errors.join(' | '));
  await ada.page.browserContext().close();
});

await step('search with Ctrl+K, change tasks together, then undo', async () => {
  await mert.page.goto(`${s.origin}/b/${csBoard}?view=list`, { waitUntil: 'networkidle0' });
  await mert.page.keyboard.down('Control');
  await mert.page.keyboard.press('k');
  await mert.page.keyboard.up('Control');
  await mert.page.waitForSelector('.palette-input');
  await mert.page.type('.palette-input', 'Quill');
  await mert.page.waitForFunction(() => [...document.querySelectorAll('.palette-item__title')].some((e) => e.textContent?.startsWith('Quillfield')));
  await mert.page.keyboard.press('Escape');
  const before = await sql('select id, priority from tasks where board_id = $1 and parent_id is null', [csBoard]);
  const boxes = await mert.page.$$('tbody .check-cell input');
  await boxes[0].click();
  await boxes[1].click();
  const selects = await mert.page.$$('.bulkbar select');
  await selects[2].select('urgent');
  await mert.page.waitForSelector('.toast__action');
  const after = await sql('select id, priority from tasks where board_id = $1 and parent_id is null', [csBoard]);
  const changed = after.filter((r: any) => before.find((b: any) => b.id === r.id)?.priority !== r.priority);
  expect(changed.length >= 1 && changed.every((r: any) => r.priority === 'urgent'), `bulk change not saved: ${JSON.stringify(changed)}`);
  await shot(mert.page, 'p4-06-bulk-undo');
  await mert.page.click('.toast__action');
  await pause(600);
  const back = await sql('select id, priority from tasks where board_id = $1 and parent_id is null', [csBoard]);
  expect(back.every((r: any) => before.find((b: any) => b.id === r.id)?.priority === r.priority), 'undo did not put the tasks back');
});

await step('an API key is shown once and works; an AI assistant asks and the person allows', async () => {
  const local = `http://localhost:${new URL(s.origin).port}`;
  const asCompany = { 'x-curahold-org': 'demo' };
  await mert.page.goto(`${s.origin}/profile`, { waitUntil: 'networkidle0' });
  const mcp = await mert.page.$$eval('.sheet input[readonly]', (els) => els.map((e) => (e as HTMLInputElement).value).find((v) => v.endsWith('/mcp')));
  expect(mcp === `${s.origin}/mcp`, `connector address not shown: ${mcp}`);
  await mert.page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /New API key|Yeni API anahtarı/.test(b.textContent ?? ''))?.click());
  await mert.page.waitForSelector('#newkey input');
  await mert.page.type('#newkey input', 'Weekly report');
  await mert.page.click('button[form="newkey"]');
  await mert.page.waitForSelector('.once__value');
  const token = await mert.page.$eval('.once__value', (e) => (e as HTMLInputElement).value);
  const me = await fetch(`${local}/api/me`, { headers: { authorization: `Bearer ${token}`, ...asCompany } }).then((r) => r.json());
  expect(me.user?.email === 'mert@demo.example', 'the new key does not work');
  await shot(mert.page, 'p5-01-api-key');
  await mert.page.keyboard.press('Escape');

  // An assistant registers, sends Mert to Curahold's consent screen, he allows.
  const redirect = 'https://assistant.example.com/callback';
  const verifier = 'e2e-verifier-0123456789-0123456789-0123456789';
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const reg = await fetch(`${local}/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json', ...asCompany }, body: JSON.stringify({ client_name: 'Assistant', redirect_uris: [redirect] }) }).then((r) => r.json());
  const q = new URLSearchParams({ client_id: reg.client_id, redirect_uri: redirect, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', state: 's1' });
  const auth = await fetch(`${local}/oauth/authorize?${q}`, { headers: asCompany, redirect: 'manual' });
  await mert.page.goto(`${s.origin}${auth.headers.get('location')}`, { waitUntil: 'networkidle0' });
  await mert.page.waitForSelector('.consent__title');
  await shot(mert.page, 'p5-02-consent');
  const back = mert.page.waitForRequest((r) => r.url().startsWith(redirect), { timeout: 10000 });
  await mert.page.click('.consent .btn--primary');
  const code = new URL((await back).url()).searchParams.get('code')!;
  const tok = await fetch(`${local}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...asCompany },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: reg.client_id, redirect_uri: redirect, code_verifier: verifier }).toString(),
  }).then((r) => r.json());
  const tools = await fetch(`${local}/mcp`, {
    method: 'POST',
    headers: { authorization: `Bearer ${tok.access_token}`, 'content-type': 'application/json', ...asCompany },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  }).then((r) => r.json());
  expect(tools.result?.tools?.some((t: any) => t.name === 'create_task'), `assistant has no tools: ${JSON.stringify(tools).slice(0, 200)}`);
  // The page left for the assistant's address; come back for the remaining checks.
  await mert.page.goto(`${s.origin}/my`, { waitUntil: 'networkidle0' });
});

await step('timeline: log a call on a customer; switch the health score on and see why', async () => {
  const quill = s.demo.accounts['Quillfield Retail'];
  await mert.page.goto(`${s.origin}/accounts/${quill}`, { waitUntil: 'networkidle0' });
  // The note box opens from its one-line prompt.
  await mert.page.click('.tl__start');
  await mert.page.waitForSelector('.tl__compose');
  await mert.page.evaluate(() => ([...document.querySelectorAll('.tl__compose .seg button')].find((b) => /Görüşme|Call/.test(b.textContent ?? '')) as HTMLElement)?.click());
  await mert.page.type('.tl__compose textarea', 'Renewal call: they want a two-year option.');
  await mert.page.click('.tl__compose .btn--primary');
  await mert.page.waitForFunction(() => [...document.querySelectorAll('.tl__text')].some((e) => e.textContent?.includes('two-year option')), { timeout: 5000 });
  const [row] = await sql(`select kind from activities where account_id = $1 order by created_at desc limit 1`, [quill]);
  expect(row?.kind === 'call', `activity not saved as a call: ${JSON.stringify(row)}`);
  await mert.page.goto(`${s.origin}/settings/health`, { waitUntil: 'networkidle0' });
  await mert.page.waitForSelector('.signal');
  await mert.page.click('.sheet .checkbox input');
  await mert.page.waitForSelector('.healthpreview');
  await mert.page.evaluate(() => ([...document.querySelectorAll('.btn--primary')].find((b) => /Kaydet|Save/.test(b.textContent ?? '')) as HTMLElement)?.click());
  await mert.page.waitForFunction(() => [...document.querySelectorAll('.btn--primary')].some((b) => /Kaydet|Save/.test(b.textContent ?? '') && (b as HTMLButtonElement).disabled), { timeout: 5000 });
  await mert.page.goto(`${s.origin}/accounts/${quill}`, { waitUntil: 'networkidle0' });
  await mert.page.waitForSelector('.healthline .score');
  await mert.page.click('.healthline button');
  await mert.page.waitForSelector('.healthwhy li');
  await shot(mert.page, 'p6-01-timeline-health');
  const lines = await mert.page.$$eval('.healthwhy li', (els) => els.length);
  expect(lines >= 4, `only ${lines} reasons`);
});

await step('help: a request with a screenshot and consent; support visits read only; closing ends it', async () => {
  const p = mert.page;
  await p.goto(`${s.origin}/accounts`, { waitUntil: 'networkidle0' });
  await clearToasts(p);
  await p.click('.sidebar__me');
  await (await byText(p, '.popmenu__item', 'Yardım')).click();
  // Help opens on Ask: a question in plain words is answered from the docs, with where it came from.
  await p.waitForSelector('.ask__form input');
  await p.type('.ask__form input', 'Webhook imzasını nasıl doğrularım?');
  await p.keyboard.press('Enter');
  await p.waitForSelector('.ask__answer');
  expect((await text(p, '.ask__answer h4')).includes('İmza'), 'Ask did not answer from the webhooks page');
  expect(((await p.$eval('.ask__from a', (a) => a.getAttribute('href'))) ?? '').startsWith('/docs/tr/webhooks/#'), 'the answer does not say where it came from');
  await shot(p, 'p7-00-help-ask');
  // It did not help: the next closest places, and support with the question already written.
  await (await byText(p, '.ask__helped button', 'Hayır')).click();
  await (await byText(p, '.ask__write', 'Desteğe yaz')).click();
  await p.waitForSelector('.help__cats');
  expect((await p.$eval('.help input.input', (i) => (i as HTMLInputElement).value)) === 'Webhook imzasını nasıl doğrularım?', 'the question was not carried into the request');
  // Select the carried question so the next typing replaces it.
  await p.click('.help input.input', { count: 3 });
  await p.keyboard.press('Backspace');
  await (await byText(p, '.help__cat strong', 'Bir şey çalışmıyor')).click();
  await (await byText(p, '.help .seg button', 'İşimi durduruyor')).click();
  await p.type('.help input.input', 'Yenileme panosu açılmıyor');
  const areas = await p.$$('.help textarea');
  await areas[0].type('Panoyu açınca sayfa boş kalıyor, bu sabahtan beri böyle.');
  await areas[1].type('1. Yenilemeler panosunu aç\n2. Bekle');
  // A picture, as if pasted from the clipboard (a tiny PNG written for the test).
  const pic = `${import.meta.dirname}/screens/help-shot.png`;
  writeFileSync(pic, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
  await ((await p.$('.help__drop input[type=file]')) as any).uploadFile(pic);
  await p.waitForSelector('.help__shots img');
  await p.click('.help__details summary');
  await p.waitForSelector('.help__ctx pre');
  await (await byText(p, '.help__consent strong', 'Curahold desteğinin hesabıma bakmasına izin ver')).click();
  await p.waitForSelector('.help__grant select');
  await p.select('.help__grant select', '72');
  await shot(p, 'p7-01-help-form');
  await (await byText(p, '.help .btn--primary', 'Talebi gönder')).click();
  await p.waitForSelector('.help__sent');
  const sentText = await text(p, '.help__sent');
  expect(/TW-\d{6}/.test(sentText), `no reference: ${sentText}`);
  await shot(p, 'p7-02-help-sent');
  const [req] = await sql(`select h.ref, h.context, h.page_url, (select count(*)::int from help_files f where f.request_id = h.id) as files, g.level, extract(epoch from g.expires_at - now()) / 3600 as hours
                             from help_requests h join support_grants g on g.id = h.grant_id order by h.created_at desc limit 1`);
  expect(req?.files === 1 && req.level === 'view' && req.hours > 71 && req.hours <= 72, `stored: ${JSON.stringify(req)}`);
  expect(String(req.page_url).endsWith('/accounts') && req.context.browser, 'page or context missing');
  await (await byText(p, '.help__sent .btn--primary', 'Kapat')).click();
  await p.waitForSelector('.openbar');

  // Support's side: an entry link from its own tooling, opened in a separate browser.
  const [grant] = await sql(`select id from support_grants order by created_at desc limit 1`);
  const res = await fetch(`http://localhost:8899/api/support/enter-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-curahold-org': 'demo', 'x-curahold-staff-key': STAFF_KEY },
    body: JSON.stringify({ grantId: grant.id, staff: 'Deniz · Curahold' }),
  });
  const link = await res.json();
  expect(res.status === 201 && link.url, `no entry link: ${JSON.stringify(link)}`);
  const staff = await newPage(s.browser);
  await staff.page.goto(link.url.replace(/^http:\/\/[^/]+/, s.origin), { waitUntil: 'networkidle0' });
  await staff.page.waitForSelector('.supportbar');
  const bar = await text(staff.page, '.supportbar');
  expect(bar.includes('Mert Aksoy') && bar.includes('yalnızca okuma'), `bar: ${bar}`);
  expect(!staff.page.url().includes('token'), 'the entry token stayed in the address bar');
  await shot(staff.page, 'p7-03-support-visit');

  // Mert closes it; support's next step ends the visit.
  await p.click('.openbar button');
  await p.waitForSelector('.help__grants li');
  await shot(p, 'p7-04-my-requests');
  await (await byText(p, '.help__grants button', 'Erişimi kapat')).click();
  await p.waitForFunction(() => !document.querySelector('.help__grants li'), { timeout: 5000 });
  await staff.page.goto(`${s.origin}/accounts`, { waitUntil: 'networkidle0' });
  await staff.page.waitForSelector('.notice');
  expect((await text(staff.page, '.notice')).includes('destek oturumu sona erdi'), 'support visit did not end');
  await staff.page.browserContext().close();
});

await step('customer portal: switch on, invite, the customer opens a request, the team replies, the customer reads it', async () => {
  // Ada has signed in many times in this run; the sign-in rate limit is not what is tested here.
  await sql('delete from login_tokens');
  const admin = await newPage(s.browser);
  await signIn(admin.page, s.origin, 'ada@demo.example');
  await admin.page.goto(`${s.origin}/settings/portal`, { waitUntil: 'networkidle0' });
  await (await byText(admin.page, '.sheet .checkbox strong', 'Müşteri portalı açık')).click();
  await admin.page.waitForSelector('.portal-admin__address');
  // Open the CS board to customers (same as its settings dialog does).
  const [b] = await sql(`select columns from boards where id = $1`, [csBoard]);
  await sql(`update boards set portal = $2 where id = $1`, [csBoard, JSON.stringify({ enabled: true, intake: b.columns[0].key, labels: {}, fields: ['due', 'assignee'] })]);
  await admin.page.click('.portal-people__invite .picker__button');
  await admin.page.type('.picker__pop input', 'Quill');
  await admin.page.waitForFunction(() => [...document.querySelectorAll('.picker__opt')].some((o) => o.textContent?.includes('Quillfield')));
  await (await byText(admin.page, '.picker__opt span', 'Quillfield Retail')).click();
  const inputs = await admin.page.$$('.portal-people__invite input.input');
  await inputs[0].type('Selin Kaya');
  await inputs[1].type('selin@quillfield.example');
  await (await byText(admin.page, '.portal-people__invite .btn--primary', 'Davet et')).click();
  await admin.page.waitForFunction(() => document.querySelector('.portal-people table')?.textContent?.includes('selin@quillfield.example'), { timeout: 5000 });
  // Passwords too, for this company.
  await (await byText(admin.page, '.portal-methods strong', 'Şifre')).click();
  await (await byText(admin.page, '.sheet .btn--primary', 'Kaydet')).click();
  await admin.page.waitForFunction(() => [...document.querySelectorAll('.toast')].some((x) => x.textContent?.includes('Kaydedildi')), { timeout: 5000 });
  await shot(admin.page, 'p8-01-portal-settings');
  await admin.page.browserContext().close();

  await pause(300);
  const invite = s.email.sent.filter((m) => m.to === 'selin@quillfield.example').at(-1);
  const link = /(http:\/\/\S+\/auth#token=\S+)/.exec(invite?.text ?? '')?.[1];
  expect(link && link.startsWith('http://demo.portal.localhost:8899/'), `invite link: ${link}`);
  const customer = await newPage(s.browser, 1280, 860);
  await customer.page.goto(link!, { waitUntil: 'networkidle0' });
  await customer.page.waitForSelector('.p-head');
  expect(!customer.page.url().includes('token'), 'token stayed in the address bar');
  await (await byText(customer.page, '.p-head .p-btn--primary', 'Yeni talep')).click();
  await customer.page.waitForSelector('.p-form input');
  await customer.page.type('.p-form input', 'Rapora iki kullanıcı ekleyelim');
  await customer.page.type('.p-form textarea', 'Ayşe ve Can rapora erişemiyor; pazartesiye kadar açılabilir mi?');
  await shot(customer.page, 'p8-02-portal-new');
  await (await byText(customer.page, '.p-form .p-btn--primary', 'Talebi gönder')).click();
  await customer.page.waitForSelector('.p-task');
  const taskId = /\/t\/([0-9a-f-]{36})/.exec(customer.page.url())?.[1];
  const [row] = await sql(`select t.status, t.assignee_ids, a.owner_id from tasks t join accounts a on a.id = t.account_id where t.id = $1`, [taskId]);
  expect(row && row.assignee_ids[0] === row.owner_id, `not assigned to the owner: ${JSON.stringify(row)}`);

  // Inside: the owner sees who opened it and answers the customer.
  const zeynep = await newPage(s.browser);
  await signIn(zeynep.page, s.origin, 'zeynep@demo.example');
  await zeynep.page.goto(`${s.origin}/b/${csBoard}?task=${taskId}`, { waitUntil: 'networkidle0' });
  await zeynep.page.waitForSelector('.portal-share[data-on]');
  await (await byText(zeynep.page, '.composer__to button', 'Müşteriye yanıt')).click();
  await zeynep.page.type('.composer textarea', 'Merhaba Selin, ikisini de bugün ekliyoruz.');
  await (await byText(zeynep.page, '.composer .btn--primary', 'Müşteriye gönder')).click();
  await zeynep.page.waitForFunction(() => [...document.querySelectorAll('.comment .badge--customer')].length > 0, { timeout: 5000 });
  await shot(zeynep.page, 'p8-03-task-panel-reply');
  await zeynep.page.browserContext().close();

  await customer.page.reload({ waitUntil: 'networkidle0' });
  await customer.page.waitForSelector('.p-msg');
  expect((await text(customer.page, '.p-thread')).includes('bugün ekliyoruz'), 'reply not shown to the customer');
  await shot(customer.page, 'p8-04-portal-task');
  await customer.page.goto('http://demo.portal.localhost:8899/', { waitUntil: 'networkidle0' });
  await customer.page.waitForSelector('.p-item');
  await shot(customer.page, 'p8-05-portal-list');
  const phone = await newPage(s.browser, 390, 844);
  await phone.page.setCookie(...(await customer.page.cookies()));
  await phone.page.goto(`http://demo.portal.localhost:8899/t/${taskId}`, { waitUntil: 'networkidle0' });
  await phone.page.waitForSelector('.p-msg');
  await shot(phone.page, 'p8-06-portal-phone');
  // Her own account: a passkey on this device (Chrome's virtual authenticator), then in with it.
  const cdp = await customer.page.createCDPSession();
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  await customer.page.click('.p-top__me a');
  await customer.page.waitForSelector('.p-account');
  await (await byText(customer.page, '.p-account .p-btn', 'Bu cihaza passkey ekle')).click();
  await customer.page.waitForSelector('.p-rows li', { timeout: 10000 });
  await shot(customer.page, 'p8-07-portal-account');
  await (await byText(customer.page, '.p-account .p-btn', 'Her yerden çıkış yap')).click();
  await customer.page.waitForSelector('.p-signin');
  await shot(customer.page, 'p8-08-portal-signin');
  await (await byText(customer.page, '.p-ways .p-btn', 'Passkey ile giriş yap')).click();
  await customer.page.waitForSelector('.p-head', { timeout: 10000 });
  const [via] = await sql(`select method from portal_sessions where revoked_at is null order by created_at desc limit 1`);
  expect(via?.method === 'passkey', `signed in by ${via?.method}`);
  // And with the emailed code, the way most people will.
  await customer.page.click('.p-top__me button.p-link:last-child');
  await customer.page.waitForSelector('.p-signin input[type=email]');
  await customer.page.type('.p-signin input[type=email]', 'selin@quillfield.example');
  await (await byText(customer.page, '.p-signin .p-btn--primary', 'Kod gönder')).click();
  await customer.page.waitForSelector('.p-code');
  await pause(300);
  const code = /\b(\d{6})\b/.exec(s.email.sent.filter((m) => m.to === 'selin@quillfield.example').at(-1)?.subject ?? '')?.[1] ?? '';
  await customer.page.type('.p-code', code);
  await (await byText(customer.page, '.p-signin .p-btn--primary', 'Giriş yap')).click();
  await customer.page.waitForSelector('.p-head', { timeout: 10000 });
  expect(customer.errors.length === 0, customer.errors.join(' | '));
  await customer.page.browserContext().close();
  await phone.page.browserContext().close();
});

await step('tasks from a file: columns are recognised, cards appear, the import can be undone', async () => {
  const csv = join(SCREENS, 'e2e-import.csv');
  writeFileSync(csv, 'Task Name;Section;Assignee;Due Date\nDosyadan gelen bir\u0131;In progress;Mert;15.01.2027\nDosyadan gelen iki;;;\n');
  await mert.page.goto(`${s.origin}/b/${csBoard}`, { waitUntil: 'networkidle0' });
  await mert.page.click('button[aria-label="Dosyadan görev aktar"]');
  const input = await mert.page.waitForSelector('.dropzone input[type=file]');
  await (input as any).uploadFile(csv);
  await mert.page.waitForSelector('.map-table');
  const picked = await mert.page.$$eval('.map-table select', (els) => els.map((e) => (e as HTMLSelectElement).value));
  expect(picked.join(',') === 'title,status,assignee,dueDate', `columns guessed as ${picked.join(',')}`);
  await mert.page.click('.importer .btn--primary');
  await mert.page.waitForSelector('.import-result');
  expect((await text(mert.page, '.import-result__stat strong')) === '2', 'two tasks were not created');
  await (await byText(mert.page, '.importer .btn', 'Panoya bak')).click();
  await mert.page.waitForFunction(() => [...document.querySelectorAll('.card__title')].filter((e) => e.textContent?.startsWith('Dosyadan gelen')).length === 2, { timeout: 8000 });
  const [doing] = await sql(`select status, due_date::text as due, cardinality(assignee_ids) as n from tasks where title = 'Dosyadan gelen birı'`);
  expect(doing?.status === 'doing' && doing?.due === '2027-01-15' && Number(doing?.n) === 1, `imported as ${JSON.stringify(doing)}`);
  // Undo from the list of earlier imports.
  await mert.page.click('button[aria-label="Dosyadan görev aktar"]');
  await mert.page.waitForSelector('.importer__past .linkbtn', { timeout: 8000 });
  await (await byText(mert.page, '.importer__past .linkbtn', 'Geri al')).click();
  await mert.page.waitForSelector('.importer .notice');
  const [{ n }] = await sql(`select count(*)::int as n from tasks where title like 'Dosyadan gelen%'`);
  expect(n === 0, `${n} imported tasks survived the undo`);
  await mert.page.keyboard.press('Escape');
});

await step('reports: build one and keep it; a ready-made dashboard lands on the home with its charts drawn', async () => {
  const ada = await newPage(s.browser);
  await signIn(ada.page, s.origin, 'ada@demo.example');
  await ada.page.goto(`${s.origin}/reports/all`, { waitUntil: 'networkidle0' });
  await (await byText(ada.page, '.topbar .btn--primary', 'Yeni rapor')).click();
  await ada.page.waitForSelector('.rb-source');
  await (await byText(ada.page, '.rb-source', 'Müşteriler')).click();
  await ada.page.waitForFunction(() => document.querySelector('.rb-source[aria-pressed="true"]')?.textContent?.includes('Müşteriler'));
  // Grouped rows (a summary), by owner: a chart above, the rows under their groups below.
  await (await byText(ada.page, '.rb-format button', 'Gruplu')).click();
  await ada.page.waitForSelector('.rb__rail > section:nth-child(3) select');
  await ada.page.select('.rb__rail > section:nth-child(3) select', 'owner');
  await ada.page.waitForSelector('.rb__chart .hbar');
  expect((await ada.page.$$('.rb__chart .hbar')).length > 0, 'no bars drawn for customers by owner');
  await ada.page.waitForSelector('.rb__chart .rsum__group');
  expect((await ada.page.$$('.rb__chart .rsum__row')).length > 0, 'the summary shows no rows under its groups');
  await ada.page.type('.rb-name', 'Sorumluya göre müşteriler');
  await shot(ada.page, 'p9-01-report-builder');
  await (await byText(ada.page, '.topbar .btn--primary', 'Raporu kaydet')).click();
  await ada.page.waitForFunction(() => location.pathname.startsWith('/reports/r/'));
  const [kept] = await sql(`select r.def, r.shared from reports r join orgs o on o.id = r.org_id where o.slug = 'demo' and r.name = 'Sorumluya göre müşteriler'`);
  expect(kept?.def?.source === 'accounts' && kept.def.groups[0].field === 'owner' && kept.shared === false, 'the report was not kept as built');
  // Dashboards opens on a ready-made dashboard, already filled: nothing to add first.
  await ada.page.goto(`${s.origin}/dashboards`, { waitUntil: 'networkidle0' });
  await ada.page.waitForFunction(() => location.pathname.startsWith('/dashboards/'));
  await ada.page.waitForSelector('.pane[data-type="report"] :is(.vchart, .donut, .kpi, .hbars, .emptystate, .pane__note)');
  expect((await ada.page.$$('.pane[data-type="report"]')).length >= 4, 'the dashboard has no report cards');
  const ready = (await ada.page.$$('.dashpick__item')).length;
  expect(ready >= 4, `the ready-made dashboards did not arrive: ${ready}`);
  await shot(ada.page, 'p9-02-dashboard');
  // The names along the top move from one to another.
  const first = ada.page.url();
  const firstName = await text(ada.page, '.topbar__title');
  await ada.page.click('.dashpick__item:not([aria-current])');
  await ada.page.waitForFunction((u) => location.href !== u && document.querySelector('.dashpick__item[aria-current="page"]')?.textContent === document.querySelector('.topbar__title')?.textContent, {}, first);
  expect((await text(ada.page, '.topbar__title')) !== firstName, 'the switch did not change the dashboard');
  // Any of them can be deleted, and taken back from the toast.
  const doomed = await text(ada.page, '.topbar__title');
  await ada.page.click('.dash-top__delete');
  await (await byText(ada.page, '.dialog .btn--danger', 'Bu paneli sil')).click();
  await ada.page.waitForFunction((n) => document.querySelectorAll('.dashpick__item').length === n - 1, {}, ready);
  expect(!(await ada.page.$$eval('.dashpick__item', (xs) => xs.map((x) => x.textContent))).includes(doomed), 'the deleted dashboard is still listed');
  await (await byText(ada.page, '.toast button', 'Geri al')).click();
  await ada.page.waitForFunction((n) => document.querySelectorAll('.dashpick__item').length === n, {}, ready);
  expect((await text(ada.page, '.topbar__title')) === doomed, 'taking the dashboard back did not return to it');
  // A dashboard narrows every card to one person at once.
  await ada.page.select('.dash-viewas select', 'me');
  await ada.page.waitForFunction(() => document.querySelector('.page')?.getAttribute('aria-busy') === 'false');
  // It is a dashboard, not a home page: Home's tabs don't list it.
  const [kind] = await sql(`select p.kind from pages p join orgs o on o.id = p.org_id where o.slug = 'demo' order by p.created_at desc limit 1`);
  expect(kind?.kind === 'dashboard', `made a ${kind?.kind}`);
  expect(ada.errors.length === 0, `script errors: ${ada.errors.join(' | ')}`);
  await ada.page.close();
});

await step('settings: a currency and its rate, a playbook from an example, renewals that start by themselves', async () => {
  const ada = await newPage(s.browser);
  await signIn(ada.page, s.origin, 'ada@demo.example');
  await ada.page.goto(`${s.origin}/settings/currencies`, { waitUntil: 'networkidle0' });
  await ada.page.select('.fxadd select', 'EUR');
  await (await byText(ada.page, '.fxadd .btn', 'Para birimi ekle')).click();
  await ada.page.waitForSelector('.fxrow input');
  await ada.page.type('.fxrow input', '37,1');
  await (await byText(ada.page, '.currencies .btn--primary', 'Kaydet')).click();
  await ada.page.waitForFunction(() => [...document.querySelectorAll('.toast')].some((x) => x.textContent?.includes('Kaydedildi')));
  const [fx] = await sql(`select settings->'fx'->'rates' as rates from orgs where slug = 'demo'`);
  expect(Number(fx?.rates?.EUR) === 37.1, `rates kept: ${JSON.stringify(fx?.rates)}`);
  await shot(ada.page, 'p10-01-currencies');

  await ada.page.goto(`${s.origin}/settings/playbooks`, { waitUntil: 'networkidle0' });
  await (await byText(ada.page, '.pbexample .btn', 'Bunu kullan')).click();
  await ada.page.waitForSelector('.dialog .planrow');
  await shot(ada.page, 'p10-02-playbook');
  await (await byText(ada.page, '.dialog .btn--primary', 'Kaydet')).click();
  await ada.page.waitForSelector('.pblist__row');
  const [pb] = await sql(`select p.id, p.anchor, jsonb_array_length(p.tasks) as n from plan_templates p join orgs o on o.id = p.org_id where o.slug = 'demo' and p.name = 'Yenileme'`);
  expect(pb?.anchor === 'renewal' && Number(pb.n) === 7, `playbook kept: ${JSON.stringify(pb)}`);

  await ada.page.goto(`${s.origin}/settings/rhythm`, { waitUntil: 'networkidle0' });
  // Business reviews on; renewals on (six months ahead), with the playbook.
  const switches = await ada.page.$$('.rhythm__head .switch');
  await switches[0].click();
  await switches[1].click();
  await ada.page.waitForSelector('.rhythm__renewal select');
  const [days, playbook] = await ada.page.$$('.rhythm__renewal select');
  expect((await days.evaluate((el) => (el as HTMLSelectElement).value)) === '180', 'renewals do not start six months ahead');
  await playbook.select(pb.id);
  await shot(ada.page, 'p10-03-rhythm');
  await (await byText(ada.page, '.rhythm__save .btn--primary', 'Kaydet')).click();
  await ada.page.waitForFunction(() => [...document.querySelectorAll('.toast')].some((x) => x.textContent?.includes('Kaydedildi')));
  const [rh] = await sql(`select settings->'rhythm' as r from orgs where slug = 'demo'`);
  expect(rh?.r?.reviewDays === 90 && rh.r.renewal?.days === 180 && rh.r.renewal?.planId === pb.id, `rhythm kept: ${JSON.stringify(rh?.r)}`);
  // With reviews on, customers have a Business reviews view.
  await ada.page.goto(`${s.origin}/accounts`, { waitUntil: 'networkidle0' });
  await (await byText(ada.page, '[role="tab"]', 'İş değerlendirmeleri')).click();
  await ada.page.waitForSelector('.reviews__intro');
  // "Done" logs the review as a meeting: title, people, notes and a next step that becomes a task.
  await ada.page.click('.table--reviews .table__action .btn');
  await ada.page.waitForSelector('.logform input.input');
  await ada.page.type('.logform input.input', 'Çeyrek iş değerlendirmesi');
  await ada.page.type('.logform textarea', 'Kullanım hedefte; ikinci ekip için teklif istediler.');
  await (await byText(ada.page, '.logform .btn', 'Adım ekle')).click();
  await ada.page.type('.logform__step .input', 'İkinci ekip teklifini gönder');
  await shot(ada.page, 'p11-01-review-meeting');
  await (await byText(ada.page, '.dialog .btn--primary', 'Kaydet')).click();
  await ada.page.waitForFunction(() => !document.querySelector('.logform'));
  const [mt] = await sql(`select a.id, a.account_id, a.title from activities a where a.kind = 'review' and a.title = 'Çeyrek iş değerlendirmesi'`);
  expect(mt, 'the review was not logged as a meeting');
  const [step] = await sql(`select title, account_id from tasks where activity_id = $1`, [mt.id]);
  expect(step?.title === 'İkinci ekip teklifini gönder' && step.account_id === mt.account_id, 'the next step did not become a task on the customer');
  // The customer page lists it under Meetings, with its next step.
  await ada.page.goto(`${s.origin}/accounts/${mt.account_id}`, { waitUntil: 'networkidle0' });
  await ada.page.waitForFunction(() => [...document.querySelectorAll('.meeting__title')].some((e) => e.textContent === 'Çeyrek iş değerlendirmesi'));
  await ada.page.waitForSelector('.meeting__step');
  await shot(ada.page, 'p11-02-customer-meetings');
  expect(ada.errors.length === 0, `script errors: ${ada.errors.join(' | ')}`);
  await ada.page.close();
});

await step('an opportunity opens on its own: fields, tasks and its thread', async () => {
  const ada = await newPage(s.browser);
  await signIn(ada.page, s.origin, 'ada@demo.example');
  // An opportunity on a customer, put straight in (the CRM check made the kind already, or this does).
  const [org] = await sql(`select id from orgs where slug = 'demo'`);
  let [type] = await sql(`select id, key from record_types where org_id = $1 and kind = 'opportunity'`, [org.id]);
  if (!type) [type] = await sql(`insert into record_types (org_id, key, name, kind, fields) values ($1, 'opportunity', '{"one":{"en":"Opportunity","tr":"Fırsat"},"other":{"en":"Opportunities","tr":"Fırsatlar"}}', 'opportunity', '[{"key":"amount","label":{"en":"Amount","tr":"Tutar"},"type":"money"}]') returning id, key`, [org.id]);
  const [acc] = await sql(`select id from accounts where org_id = $1 order by name limit 1`, [org.id]);
  const [rec] = await sql(`insert into records (org_id, type_id, account_id, name, fields) values ($1, $2, $3, 'Panel denemesi', '{"amount": 12000}') returning id`, [org.id, type.id, acc.id]);
  await ada.page.goto(`${s.origin}/records/${type.key}?record=${rec.id}`, { waitUntil: 'networkidle0' });
  await ada.page.waitForSelector('.recpanel .recpanel__name');
  expect((await text(ada.page, '.recpanel__name')) === 'Panel denemesi', 'the record panel shows something else');
  await ada.page.type('.recpanel .composer textarea', 'Teklif hazır, link: https://docs.example/teklif');
  await (await byText(ada.page, '.recpanel .composer .btn--primary', 'Gönder')).click();
  await ada.page.waitForSelector('.recpanel .comment .smartlink');
  const [c] = await sql(`select body from record_comments where record_id = $1`, [rec.id]);
  expect(c?.body?.includes('docs.example'), 'the comment was not kept');
  await shot(ada.page, 'p10-04-record-panel');
  expect(ada.errors.length === 0, `script errors: ${ada.errors.join(' | ')}`);
  await ada.page.close();
});

await step('live: a card someone else adds shows up without reloading; the bell follows', async () => {
  const lena = await newPage(s.browser);
  await signIn(lena.page, s.origin, 'lena@demo.example');
  // Ask every second instead of every half minute.
  await lena.page.evaluate(() => localStorage.setItem('app_live_ms', '1000'));
  await lena.page.goto(`${s.origin}/b/${csBoard}`, { waitUntil: 'networkidle0' });
  await lena.page.waitForSelector('.card');
  const [u] = await sql(`select id, org_id from users where email = 'lena@demo.example' order by created_at limit 1`);
  const before = await lena.page.$eval('.bell', (e) => e.textContent ?? '').catch(() => '');
  const res = await mert.page.evaluate(
    async (board, lenaId) => {
      const r = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-curahold-device': localStorage.getItem('app_device') ?? '' },
        body: JSON.stringify({ boardId: board, title: 'Canlı gelen görev', assigneeIds: [lenaId] }),
      });
      return r.status;
    },
    csBoard,
    u.id,
  );
  expect(res === 201, `the other person could not add the task (${res})`);
  await lena.page.waitForFunction(() => [...document.querySelectorAll('.card__title')].some((e) => e.textContent === 'Canlı gelen görev'), { timeout: 8000 });
  await lena.page.waitForFunction((was) => (document.querySelector('.bell')?.textContent ?? '') !== was, { timeout: 8000 }, before);
  await lena.page.browserContext().close();
});

await step('installable, and readable without a connection', async () => {
  const omar = await newPage(s.browser);
  await signIn(omar.page, s.origin, 'omar@demo.example');
  const manifest = await omar.page.evaluate(async () => {
    const href = document.querySelector<HTMLLinkElement>('link[rel=manifest]')?.href ?? '';
    const r = await fetch(href);
    return { status: r.status, body: await r.json() };
  });
  expect(manifest.status === 200 && manifest.body.display === 'standalone' && manifest.body.icons.length === 3, 'no install manifest');
  expect(String(manifest.body.name).includes('Curahold'), 'the manifest has no name');
  for (const icon of manifest.body.icons) {
    const status = await omar.page.evaluate(async (src) => (await fetch(src)).status, icon.src);
    expect(status === 200, `icon missing: ${icon.src}`);
  }
  // The service worker takes the page over; a visit to My tasks leaves a copy behind.
  await omar.page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await omar.page.goto(`${s.origin}/my`, { waitUntil: 'networkidle0' });
  await omar.page.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 10000 });
  await omar.page.reload({ waitUntil: 'networkidle0' });
  await omar.page.waitForSelector('.tasklist__row, .emptystate');
  const rows = await omar.page.$$eval('.tasklist__row', (r) => r.length);
  await omar.page.setOfflineMode(true);
  await omar.page.reload({ waitUntil: 'domcontentloaded' });
  await omar.page.waitForSelector('.sidebar', { timeout: 15000 });
  await omar.page.waitForSelector('.offlinebar', { timeout: 5000 });
  await omar.page.waitForFunction((n) => document.querySelectorAll('.tasklist__row').length === n, { timeout: 8000 }, rows);
  await shot(omar.page, 'e2e-offline');
  // Signing out throws the kept data away.
  await omar.page.setOfflineMode(false);
  const kept = await omar.page.evaluate(async () => (await caches.keys()).filter((k) => k.endsWith('-data')).length);
  expect(kept === 1, 'nothing was kept for offline reading');
  await omar.page.evaluate(async () => {
    navigator.serviceWorker.controller?.postMessage('signed-out');
    for (const k of await caches.keys()) if (k.endsWith('-data')) await caches.delete(k);
  });
  expect((await omar.page.evaluate(async () => (await caches.keys()).filter((k) => k.endsWith('-data')).length)) === 0, 'offline data survived signing out');
  await omar.page.browserContext().close();
});

await step('renewals and products are places of their own, and a customer opened from one leads back to it', async () => {
  const zey = await newPage(s.browser);
  await signIn(zey.page, s.origin, 'zeynep@demo.example');
  await zey.page.goto(`${s.origin}/home`, { waitUntil: 'networkidle0' });
  // From the menu: its own title, its own entry lit, and nothing to go back to.
  await zey.page.click('a.navlink[href="/accounts?view=renewals"]');
  await zey.page.waitForFunction(() => document.querySelector('.topbar__title')?.textContent === 'Sözleşme yenilemeleri');
  expect((await zey.page.$('.backbar')) === null, 'a place chosen from the menu offers a way back');
  expect((await text(zey.page, '.navlink[aria-current="page"]')).includes('Yenilemeler'), 'the menu does not show Renewals as the place');
  // The switch on the page moves to Products, and the menu follows; it does not fall back to the list.
  await (await byText(zey.page, '.seg--views button', 'Ürünler')).click();
  await zey.page.waitForFunction(() => document.querySelector('.topbar__title')?.textContent === 'Ürünler');
  expect(zey.page.url().endsWith('/accounts?view=products'), `products has no address of its own: ${zey.page.url()}`);
  expect((await text(zey.page, '.navlink[aria-current="page"]')).includes('Ürünler'), 'the menu does not show Products as the place');
  // A customer opened from Renewals: the way back names Renewals and returns there.
  await zey.page.click('a.navlink[href="/accounts?view=renewals"]');
  await zey.page.waitForSelector('.renewals .rowlink');
  await zey.page.click('.renewals .rowlink');
  await zey.page.waitForSelector('.backbar__back');
  expect(/\/accounts\/[0-9a-f-]{36}/.test(zey.page.url()), `the customer did not open: ${zey.page.url()}`);
  expect((await text(zey.page, '.backbar__back')).trim() === 'Yenilemeler', `the way back says: ${await text(zey.page, '.backbar__back')}`);
  await shot(zey.page, 'p7-03-way-back');
  const customer = zey.page.url();
  await zey.page.click('.backbar__back');
  await zey.page.waitForFunction(() => location.search === '?view=renewals' && !document.querySelector('.backbar'));
  // Opened by its own address there is no "before": the way back is the list it belongs to.
  await zey.page.goto(customer, { waitUntil: 'networkidle0' });
  await zey.page.waitForSelector('.backbar__back');
  // (An earlier step may have renamed "customers" for this company: the way back uses the company's own word.)
  const word = await zey.page.$eval('a.navlink[href="/accounts"]', (a) => a.closest('.navsec')?.querySelector('.navsec__toggle span')?.textContent ?? '');
  expect(word.length > 0 && (await text(zey.page, '.backbar__back')).trim() === word, `a customer opened by its link has no way up: ${await text(zey.page, '.backbar__back')} / ${word}`);
  await zey.page.click('.backbar__back');
  await zey.page.waitForFunction(() => location.pathname === '/accounts' && !location.search);
  expect(zey.errors.length === 0, zey.errors.join(' | '));
  await zey.page.browserContext().close();
});

await step('a subtask opened from its task has a way back to it', async () => {
  const lena = await newPage(s.browser);
  await signIn(lena.page, s.origin, 'lena@demo.example');
  const add = (body: unknown) =>
    lena.page.evaluate(
      async (b) => (await (await fetch('/api/tasks', { method: 'POST', headers: { 'content-type': 'application/json', 'x-curahold-device': localStorage.getItem('app_device') ?? '' }, body: JSON.stringify(b), credentials: 'include' })).json()).task.id as string,
      body,
    );
  const parentId = await add({ boardId: csBoard, title: 'Kurulum planını hazırla' });
  const made = { parent: parentId, sub: await add({ boardId: csBoard, title: 'Toplantı tarihini netleştir', parentId }) };
  // From My tasks: the task, then its subtask.
  await lena.page.goto(`${s.origin}/my?task=${made.parent}`, { waitUntil: 'networkidle0' });
  await lena.page.waitForSelector('.subtask__title');
  expect((await lena.page.$('.panel__back')) === null, 'a task that is nobody’s subtask shows a way back');
  await lena.page.click('.subtask__title');
  await lena.page.waitForSelector('.panel__back');
  expect(lena.page.url().includes(`task=${made.sub}`), `the subtask did not open: ${lena.page.url()}`);
  expect((await text(lena.page, '.panel__back')).includes('Kurulum planını hazırla'), 'the way back does not name the task it goes to');
  await shot(lena.page, 'p7-02-subtask-back');
  await lena.page.click('.panel__back');
  await lena.page.waitForFunction((id) => location.search.includes(`task=${id}`) && !!document.querySelector('.subtask__title') && !document.querySelector('.panel__back'), {}, made.parent);
  expect(lena.page.url().startsWith(`${s.origin}/my`), `going back left My tasks: ${lena.page.url()}`);
  expect(lena.errors.length === 0, lena.errors.join(' | '));
  await lena.page.browserContext().close();
});

await step('trash: a deleted task can be taken back at once, or later from the trash, whole', async () => {
  const lena = await newPage(s.browser);
  await signIn(lena.page, s.origin, 'lena@demo.example');
  const call = (method: string, path: string, body?: unknown): Promise<any> =>
    lena.page.evaluate(
      async (m, p, b) => {
        const r = await fetch(`/api${p}`, { method: m, headers: { 'content-type': 'application/json', 'x-curahold-device': localStorage.getItem('app_device') ?? '' }, body: b === undefined ? undefined : JSON.stringify(b), credentials: 'include' });
        return r.json();
      },
      method,
      path,
      body,
    );
  const task = (await call('POST', '/tasks', { boardId: csBoard, title: 'Sözleşme taslağını gözden geçir' })).task;
  await call('POST', '/tasks', { boardId: csBoard, title: 'Hukuktan görüş al', parentId: task.id });
  await call('POST', `/tasks/${task.id}/comments`, { body: 'Taslak ekte.' });
  const rowsOf = async () => Number((await sql('select (select count(*) from tasks where id = $1 or parent_id = $1) + (select count(*) from comments where task_id = $1) as n', [task.id]))[0].n);
  expect((await rowsOf()) === 3, 'the task, its subtask and its comment were not made');

  // Delete from the task's panel: the notice offers to take it back.
  await lena.page.goto(`${s.origin}/b/${csBoard}?task=${task.id}`, { waitUntil: 'networkidle0' });
  await lena.page.waitForSelector('button[aria-label="Görevi sil"]');
  await lena.page.click('button[aria-label="Görevi sil"]');
  await (await byText(lena.page, '.dialog .btn--danger', 'Sil')).click();
  await lena.page.waitForFunction(() => [...document.querySelectorAll('.toast__text')].some((e) => e.textContent?.includes('Çöp kutusuna taşındı')));
  expect((await rowsOf()) === 0, 'the task was not removed');
  await lena.page.click('.toast__action');
  await lena.page.waitForFunction(() => [...document.querySelectorAll('.toast__text')].some((e) => e.textContent?.includes('Geri alındı')));
  expect((await rowsOf()) === 3, 'undo did not bring the task back whole');
  await clearToasts(lena.page);

  // Delete again, and this time find it in the trash from the personal menu.
  await call('DELETE', `/tasks/${task.id}`);
  await lena.page.goto(`${s.origin}/my`, { waitUntil: 'networkidle0' });
  await lena.page.click('.sidebar__me');
  await (await byText(lena.page, '.popmenu__item', 'Çöp kutusu')).click();
  await lena.page.waitForSelector('.trashrow');
  const row = await text(lena.page, '.trashrow');
  expect(row.includes('Sözleşme taslağını gözden geçir') && row.includes('1 alt görev ve 1 yorum') && row.includes('30 gün kaldı'), `trash row: ${row}`);
  expect((await lena.page.$('.trashrow__forever')) === null, 'a member was offered "delete for good"');
  await shot(lena.page, 'p7-01-trash');
  await lena.page.click('.trashrow__actions .btn');
  await lena.page.waitForFunction(() => [...document.querySelectorAll('.toast__text')].some((e) => e.textContent?.includes('geri geldi')));
  expect((await rowsOf()) === 3, 'putting back from the trash lost something');
  expect((await lena.page.$('.trashrow')) === null, 'the item stayed in the list after it was put back');
  // "Open" in the notice goes to the task.
  await lena.page.click('.toast__action');
  await lena.page.waitForSelector('.panel, .taskpanel, aside[role="dialog"], aside');
  expect(lena.page.url().includes(`task=${task.id}`), `"Open" went to ${lena.page.url()}`);
  expect(lena.errors.length === 0, lena.errors.join(' | '));
  await lena.page.browserContext().close();
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
