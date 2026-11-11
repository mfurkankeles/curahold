// End-to-end acceptance in a real Chrome: the built app, the real API and
// embedded Postgres. `npm run test:e2e` (builds first). Screenshots land in
// tests/e2e/screens/ for a visual check.
import { createHash } from 'node:crypto';
import type { Page } from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
import { STAFF_KEY, byText, newPage, shot, signIn, startStack } from './browser';

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

await step('quick add reads a date, a person and a priority from one line', async () => {
  await mert.page.goto(`${s.origin}/my`, { waitUntil: 'networkidle0' });
  await mert.page.keyboard.press('n');
  await mert.page.waitForSelector('.qa__input');
  await mert.page.type('.qa__input', 'QBR sunumunu hazırla yarın @zeynep !yüksek');
  await mert.page.waitForSelector('.qchip[data-kind="person"]');
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
  await p.evaluate(() => localStorage.setItem('tw_accounts_view', 'table'));
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
  await ada.page.evaluate(() => localStorage.setItem('tw_accounts_view', 'table'));
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
  const asCompany = { 'x-tendwell-org': 'demo' };
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

  // An assistant registers, sends Mert to Tendwell's consent screen, he allows.
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
  await p.waitForSelector('.help__cats');
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
  await (await byText(p, '.help__consent strong', 'Tendwell desteğinin hesabıma bakmasına izin ver')).click();
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
    headers: { 'content-type': 'application/json', 'x-tendwell-org': 'demo', 'x-tendwell-staff-key': STAFF_KEY },
    body: JSON.stringify({ grantId: grant.id, staff: 'Deniz · Tendwell' }),
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

await step('no script errors in the browser', async () => {
  expect(mert.errors.length === 0, mert.errors.join(' | '));
});

await s.browser.close();
s.server.close();

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.error ? `\n    ${r.error}` : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} browser checks passed`);
process.exit(failed.length ? 1 : 0);
