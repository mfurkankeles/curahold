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
    // A picture of every open page at the moment of failure.
    for (const [i, pg] of (await s.browser.pages()).entries()) await shot(pg, `fail-${results.length}-${i}`).catch(() => undefined);
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
  expect((await text(mert.page, '.topbar__title')).includes('Görevlerim'), 'My tasks title missing');
  await shot(mert.page, 'e2e-01-my-tasks');
});

let newTaskId = '';
await step('create a task from the board', async () => {
  await mert.page.goto(`${s.origin}/b/${csBoard}`, { waitUntil: 'networkidle0' });
  await (await byText(mert.page, '.toolbar .btn--primary', 'Yeni görev')).click();
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
  await phone.page.click('.menu-toggle');
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
  await p.waitForSelector('.rules');
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


await step('stakeholders: org chart with drag and drop, and a stakeholder card', async () => {
  const ada = await newPage(s.browser);
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
  await ada.page.browserContext().close();
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
