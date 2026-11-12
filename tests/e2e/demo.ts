// Checks the in-browser demo (dist/demo) the way a hosted page sees it: under a
// strict content security policy, inside a sandboxed frame of another site,
// from a sub-path. `npx vite build --config vite.demo.config.ts && npx tsx tests/e2e/demo.ts`
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import puppeteer from 'puppeteer-core';
import { SCREENS } from './browser';

const DIST = join(import.meta.dirname, '..', '..', 'dist', 'demo');
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  "connect-src 'self'",
].join('; ');
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.data': 'application/octet-stream' };

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><body style="margin:0"><iframe src="http://127.0.0.1:${PORT}/a/demo/index.html" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" style="border:0;width:100vw;height:100vh"></iframe></body>`);
    return;
  }
  const rel = normalize(url.pathname.replace(/^\/a\/demo\//, '')).replace(/^(\.\.[/\\])+/, '');
  const file = join(DIST, rel);
  if (!file.startsWith(DIST) || !existsSync(file)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'content-security-policy': CSP });
  res.end(readFileSync(file));
});
const PORT = 8911;
await new Promise<void>((r) => server.listen(PORT, r));

const browser = await puppeteer.launch({
  executablePath: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => existsSync(p)),
  headless: true,
  // A browser with a mouse, as on a desk: headless Chrome reports none, and then nothing here would
  // react to the pointer the way it does for a visitor (cards lifting under it, for one).
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=tr-TR', '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4'],
});
// The demo opens in English whatever the browser's language is (this one says Turkish);
// Turkish is chosen with the switch in the bar, and the checks below read Turkish.
const page = await browser.newPage();
await page.setViewport({ width: Number(process.env.W ?? 1440), height: Number(process.env.H ?? 900) });
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !/status of 404/.test(m.text()) && errors.push(`${m.type()}: ${m.text()}`));
page.on('response', (r) => r.status() >= 400 && !r.url().endsWith('/favicon.ico') && errors.push(`${r.status()} ${r.url()}`));
const t0 = Date.now();
await page.goto(`http://localhost:${PORT}/`);
const frame = await (await page.waitForSelector('iframe'))!.contentFrame();
let ok = true;
try {
  await frame!.waitForSelector('.shell', { timeout: 60000 });
  await frame!.waitForFunction(() => !document.getElementById('boot'), { timeout: 10000 });
} catch {
  ok = false;
}
console.log(`ready: ${ok} in ${Date.now() - t0} ms`);
/** Chooses Turkish in the bar; the demo starts over with its sample data written in Turkish. */
async function chooseTurkish(f: NonNullable<typeof frame>, who: string) {
  const first = await f.evaluate(() => ({ pressed: document.querySelector('.demobar__lang button[aria-pressed="true"]')?.textContent, nav: document.querySelector('.sidebar')?.textContent ?? '' }));
  if (first.pressed !== 'EN' || !first.nav.includes('Renewals') || first.nav.includes('Yenilemeler')) errors.push(`${who}: the demo does not open in English (${first.pressed})`);
  await f.evaluate(() => (document.querySelector('.demobar__lang button[lang="tr"]') as HTMLButtonElement).click());
  await f.waitForFunction(() => !document.getElementById('boot') && (document.querySelector('.sidebar')?.textContent ?? '').includes('Yenilemeler'), { timeout: 60000 }).catch(() => errors.push(`${who}: choosing Turkish did not give a Turkish demo`));
}
if (ok) await chooseTurkish(frame!, 'desktop');
console.log('money:', await frame!.$$eval('.pane', (els) => els.slice(1, 2).map((e) => e.textContent?.slice(0, 40))).catch(() => '?'));
const step = await frame!.$eval('#boot-step', (e) => e.textContent).catch(() => null);
if (step) console.log('boot text:', step);
await page.screenshot({ path: join(SCREENS, 'demo-home.png') });

if (ok && !process.env.QUICK) {
  // A few journeys: a board, a customer, switching person, search.
  const click = async (sel: string, text?: string) => {
    const els = await frame!.$$(sel);
    for (const el of els) {
      const t = await el.evaluate((n) => n.textContent ?? '');
      if (!text || t.includes(text)) {
        await el.click();
        return true;
      }
    }
    throw new Error(`no ${sel} ${text ?? ''}`);
  };
  await click('.navlink--board', 'Yenilemeler');
  await frame!.waitForFunction(() => document.querySelectorAll('.card, .task, [data-task]').length > 0, { timeout: 10000 }).catch(() => undefined);
  await page.screenshot({ path: join(SCREENS, 'demo-board.png') });
  // The newer pages: the pipeline, the inbox, reports, the team and the timeline.
  await click('.navlink', 'Fırsatlar');
  await frame!.waitForSelector('.dealcard', { timeout: 10000 }).catch(() => errors.push('the pipeline shows no deals'));
  await page.screenshot({ path: join(SCREENS, 'demo-pipeline.png') });
  await click('.navlink', 'İş değerlendirmeleri');
  await frame!.waitForSelector('.table--reviews .review__when', { timeout: 10000 }).catch(() => errors.push('no reviews are due'));
  await page.screenshot({ path: join(SCREENS, 'demo-reviews.png') });
  // A customer's page lists its meetings, with who was there and the next steps.
  await click('.table--reviews a');
  await frame!.waitForSelector('.meetings .meeting', { timeout: 10000 }).catch(() => errors.push('a customer shows no meetings'));
  await page.screenshot({ path: join(SCREENS, 'demo-meetings.png') });
  await click('.navlink', 'Raporlar');
  await frame!.waitForSelector('.chart__col', { timeout: 10000 }).catch(() => errors.push('reports show no chart'));
  await frame!.waitForSelector('.target__track', { timeout: 10000 }).catch(() => errors.push('reports show no target'));
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: join(SCREENS, 'demo-reports.png') });
  await click('.navlink', 'Ekip');
  await frame!.waitForSelector('.teamtable .rowlink', { timeout: 10000 }).catch(() => errors.push('the team page lists nobody'));
  await click('.navlink', 'Zaman çizelgesi');
  await frame!.waitForSelector('.gantt__bar', { timeout: 10000 }).catch(() => errors.push('the timeline is empty'));
  await page.screenshot({ path: join(SCREENS, 'demo-timeline.png') });
  await click('.navlink', 'Gelen kutusu');
  await frame!.waitForSelector('.inbox__item, .emptystate', { timeout: 10000 }).catch(() => errors.push('the inbox did not open'));
  await click('.navlink', 'Tüm müşteriler');
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: join(SCREENS, 'demo-accounts.png') });
  // A customer: the timeline and the score's reasons.
  await click('a', 'Velto Mobility');
  await frame!.waitForSelector('.tl__item', { timeout: 10000 });
  await click('.healthline button');
  await frame!.waitForSelector('.healthwhy li', { timeout: 10000 });
  await page.screenshot({ path: join(SCREENS, 'demo-account.png') });
  const reasons = await frame!.$$eval('.healthwhy li', (els) => els.length);
  if (reasons < 4) errors.push(`only ${reasons} reasons shown`);
  await click('.navlink', 'Ayarlar');
  await new Promise((r) => setTimeout(r, 500));
  await click('.admin__link', 'Sağlık skoru');
  await frame!.waitForSelector('.signal', { timeout: 10000 });
  await frame!.waitForSelector('.healthpreview', { timeout: 10000 });
  await page.screenshot({ path: join(SCREENS, 'demo-health-settings.png') });
  // A dialog opened from a card covers the whole window and stays there, wherever the pointer is.
  // (The card lifts under the pointer; a lifted card used to pull its dialog into itself, and the
  // dialog jumped between the card and the window for as long as the pointer moved.)
  await click('.admin__link', 'CRM ve tablolar');
  await frame!.waitForSelector('.tile .btn', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 300));
  await click('.tile .btn');
  await frame!.waitForSelector('.dialog', { timeout: 10000 });
  const view = page.viewport()!;
  const seen = new Set<string>();
  // Where the click left the pointer (on the card), then over the dialog, beside it and back:
  // the dialog's frame is the window every time.
  for (const at of [null, [0.5, 0.5], [0.52, 0.5], [0.97, 0.5], [0.5, 0.5], [0.6, 0.3], [0.5, 0.55]]) {
    if (at) await page.mouse.move(view.width * at[0], view.height * at[1], { steps: 4 });
    await new Promise((r) => setTimeout(r, 120));
    const box = await frame!.$eval('.dialog', (d) => ({ w: Math.round(d.getBoundingClientRect().width), h: Math.round(d.getBoundingClientRect().height), fullW: innerWidth, fullH: innerHeight }));
    seen.add(box.w === box.fullW && box.h === box.fullH ? 'window' : `${box.w}x${box.h}`);
  }
  await page.screenshot({ path: join(SCREENS, 'demo-dialog-from-card.png') });
  if (seen.size !== 1 || !seen.has('window')) errors.push(`a dialog opened from a card does not stay over the whole window: ${[...seen].join(', ')}`);
  // A CRM's own button walks the real steps against the pretend CRM: allow, then the
  // connection's page asks what should come over.
  await click('.dialog .btn--primary');
  await frame!.waitForFunction(() => !document.querySelector('.dialog') && /Salesforce \(demo\)/.test(document.body.textContent ?? ''), { timeout: 15000 }).catch(() => errors.push('connecting a CRM in the demo did not open its connection page'));
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: join(SCREENS, 'demo-connect.png') });
  // The documentation travels with the demo: a folder beside the page, every link relative.
  {
    const docs = await browser.newPage();
    const failed: string[] = [];
    docs.on('requestfailed', (r) => failed.push(r.url()));
    docs.on('response', (r) => void (r.status() >= 400 && failed.push(`${r.status()} ${r.url()}`)));
    await docs.goto(`http://127.0.0.1:${PORT}/a/demo/docs/tr/quickstart/index.html`);
    const links = await docs.$$eval('.nav a', (els) => els.length);
    if (links < 30) errors.push(`the docs inside the demo list only ${links} pages`);
    // Follow a link to another page, then "Go to the app" (hidden on a narrow window, so clicked in script).
    await Promise.all([docs.waitForNavigation({ timeout: 10000 }), docs.$eval('.pager a', (a) => (a as HTMLAnchorElement).click())]);
    if (!(await docs.$('h1'))) errors.push('a link between docs pages inside the demo leads nowhere');
    await Promise.all([docs.waitForNavigation({ timeout: 10000 }), docs.$eval('.top__app', (a) => (a as HTMLAnchorElement).click())]);
    await docs.waitForSelector('#demobar, #boot', { timeout: 15000 }).catch(() => errors.push('"Go to the app" in the demo docs does not lead back to the demo'));
    // The demo's own address with #docs opens the documentation directly.
    await docs.goto('about:blank');
    await docs.goto(`http://127.0.0.1:${PORT}/a/demo/index.html#docs`);
    await docs.waitForSelector('.nav a', { timeout: 15000 }).catch(() => errors.push('the demo address with #docs does not open the docs'));
    if (failed.length) errors.push(`the docs inside the demo could not load: ${failed.slice(0, 3).join(', ')}`);
    await docs.close();
  }
  // Ask answers inside the demo too: the docs' sections are read from the folder beside the page.
  await click('.navlink--ask');
  await frame!.waitForSelector('.ask__form input', { timeout: 10000 });
  await frame!.type('.ask__form input', 'Müşterileri nasıl içe aktarırım?');
  await page.keyboard.press('Enter');
  await frame!.waitForSelector('.ask__answer, .ask__chips .ask__chip', { timeout: 10000 }).catch(() => errors.push('Ask did not answer inside the demo'));
  const from = await frame!.$eval('.ask__from a', (a) => a.getAttribute('href') ?? '').catch(() => '');
  if (!/^docs\/tr\/[a-z-]+\/index\.html/.test(from)) errors.push(`Ask's source link does not point into the demo's docs: ${from}`);
  await page.screenshot({ path: join(SCREENS, 'demo-ask.png') });
  await page.keyboard.press('Escape');
  await frame!.waitForFunction(() => !document.querySelector('.dialog'), { timeout: 5000 });
  // The trash works inside the demo as well: a task is deleted from its panel, taken back from the
  // notice, deleted again and put back from the Trash page — the same database functions, in the browser.
  {
    await click('.navlink--board', 'Yenilemeler');
    await frame!.waitForSelector('.card', { timeout: 10000 });
    const cardsBefore = await frame!.$$eval('.card', (els) => els.length);
    const open = async () => {
      await (await frame!.$('.card'))!.click();
      await frame!.waitForSelector('button[aria-label="Görevi sil"]', { timeout: 10000 });
      await frame!.click('button[aria-label="Görevi sil"]');
      await click('.dialog .btn--danger', 'Sil');
      await frame!.waitForFunction(() => [...document.querySelectorAll('.toast__text')].some((e) => e.textContent?.includes('Çöp kutusuna taşındı')), { timeout: 10000 });
    };
    try {
      await open();
      await frame!.click('.toast__action');
      await frame!.waitForFunction((n) => document.querySelectorAll('.card').length === n, { timeout: 10000 }, cardsBefore);
      await frame!.evaluate(() => document.querySelectorAll<HTMLElement>('.toast__close').forEach((b) => b.click()));
      await open();
      await frame!.evaluate(() => document.querySelectorAll<HTMLElement>('.toast__close').forEach((b) => b.click()));
      await frame!.click('.sidebar__me');
      await click('.popmenu__item', 'Çöp kutusu');
      await frame!.waitForSelector('.trashrow', { timeout: 10000 });
      await page.screenshot({ path: join(SCREENS, 'demo-trash.png') });
      await frame!.click('.trashrow__actions .btn');
      await frame!.waitForFunction(() => !document.querySelector('.trashrow') && [...document.querySelectorAll('.toast__text')].some((e) => e.textContent?.includes('geri geldi')), { timeout: 10000 });
      await frame!.evaluate(() => document.querySelectorAll<HTMLElement>('.toast__close').forEach((b) => b.click()));
    } catch (e) {
      errors.push(`the trash inside the demo: ${e instanceof Error ? e.message : e}`);
    }
  }
  // The demo has no address bar and no browser history of its own: the way back is the app's.
  // Renewals from the menu, a customer from there, back to Renewals; then dashboards open filled.
  try {
    await click('a.navlink', 'Yenilemeler');
    await frame!.waitForFunction(() => document.querySelector('.topbar__title')?.textContent === 'Sözleşme yenilemeleri', { timeout: 10000 });
    await frame!.waitForSelector('.renewals .rowlink', { timeout: 10000 });
    await frame!.click('.renewals .rowlink');
    await frame!.waitForSelector('.backbar__back', { timeout: 10000 });
    const says = await frame!.$eval('.backbar__back', (e) => e.textContent?.trim());
    if (says !== 'Yenilemeler') errors.push(`the way back inside the demo says "${says}"`);
    await page.screenshot({ path: join(SCREENS, 'demo-way-back.png') });
    await frame!.click('.backbar__back');
    await frame!.waitForFunction(() => document.querySelector('.topbar__title')?.textContent === 'Sözleşme yenilemeleri' && !document.querySelector('.backbar'), { timeout: 10000 });
    await click('a.navlink', 'Paneller');
    await frame!.waitForSelector('.dashpick__item[aria-current="page"]', { timeout: 15000 });
    await frame!.waitForSelector('.pane[data-type="report"] :is(.vchart, .donut, .kpi, .hbars, .emptystate, .pane__note)', { timeout: 15000 });
    if ((await frame!.$$('.dashpick__item')).length < 7) errors.push('the ready-made dashboards did not arrive inside the demo');
    await page.screenshot({ path: join(SCREENS, 'demo-dashboards.png') });
    await click('a.navlink', 'Takvim');
    await frame!.waitForSelector('.cal .cal__day', { timeout: 10000 });
    await click('.seg--views button', 'Hafta');
    await frame!.waitForSelector('.calweek__day', { timeout: 10000 });
    await page.screenshot({ path: join(SCREENS, 'demo-calendar-week.png') });
  } catch (e) {
    errors.push(`getting around inside the demo: ${e instanceof Error ? e.message : e}`);
  }
  await frame!.select('.demobar__who select', 'zeynep');
  await frame!.waitForFunction(() => document.querySelector('.sidebar')?.textContent?.includes('Zeynep'), { timeout: 10000 }).catch(() => console.log('switch: sidebar does not show Zeynep'));
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: join(SCREENS, 'demo-zeynep.png') });
  // The customer: the portal, inside the same tab, with only what was shared.
  await frame!.select('.demobar__who select', 'customer');
  await frame!.waitForSelector('.p-item', { timeout: 10000 });
  const items = await frame!.$$eval('.p-item__title', (els) => els.map((e) => e.textContent));
  if (items.length !== 2) errors.push(`portal shows ${items.length} requests: ${items.join(', ')}`);
  await page.screenshot({ path: join(SCREENS, 'demo-portal.png') });
  await (await frame!.$('.p-item'))!.click();
  await frame!.waitForSelector('.p-task', { timeout: 10000 });
  await page.screenshot({ path: join(SCREENS, 'demo-portal-task.png') });
  if ((await frame!.$eval('.p-task', (e) => e.textContent ?? '')).includes('iç not')) errors.push('an internal note reached the portal');
  await frame!.select('.demobar__who select', 'ada');
  await frame!.waitForSelector('.shell', { timeout: 10000 });
}
// On a phone, inside an app that gives the page storage that forgets (or wipes it):
// the demo still opens signed in, and stays that way.
if (ok) {
  const phone = await browser.newPage();
  await phone.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148');
  await phone.setViewport({ width: 393, height: 852, isMobile: true, hasTouch: true });
  phone.on('pageerror', (e) => errors.push(`phone: ${String(e)}`));
  phone.on('console', (m) => m.type() === 'error' && !/status of 404/.test(m.text()) && errors.push(`phone console: ${m.text()}`));
  await phone.evaluateOnNewDocument(`(function () {
    var fake = { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {}, clear: function () {}, key: function () { return null; }, length: 0 };
    Object.defineProperty(window, 'localStorage', { get: function () { return fake; } });
    Object.defineProperty(window, 'sessionStorage', { get: function () { return fake; } });
  })()`);
  // Inside a Claude viewer the page can ask Claude. Here a stand-in answers the way a model with
  // tools would: it reads through the tools the page offers, writes in two steps, and resolves.
  await phone.evaluateOnNewDocument(`(function () {
    var sample = function (input, opts) {
      var q = input[input.length - 1].content;
      var call = function (name, args) { return Promise.resolve(opts.tools.find(function (t) { return t.name === name; }).execute(args)); };
      return call('list_customers', { sort: 'value', limit: 3 }).then(function (list) {
        var first = list.customers[0].name;
        var more = /görev|task/i.test(q) ? call('propose_task', { title: 'Yenileme teklifini gönder', customer: first, due_date: '2027-01-15' }) : call('search_docs', { query: 'renewals' });
        return more.then(function () {
          var text = /görev|task/i.test(q) ? 'Görevi hazırladım: **' + first + '** için. Oluşturmak için düğmeye bas.' : 'En büyük müşteriler:\\n- **' + first + '**\\n- ' + list.customers[1].name + '\\n<img src=x onerror=alert(1)> https://cok-uzun-bir-adres.example/' + 'a'.repeat(90);
          if (opts.onText) { opts.onText({ text: text.slice(0, 12), delta: text.slice(0, 12) }); opts.onText({ text: text, delta: text.slice(12) }); }
          return { text: text, truncated: false, modelTierApplied: 'quick' };
        });
      });
    };
    sample.limits = function () { return Promise.resolve({ maxPromptBytes: 262144, tools: { maxCount: 16 } }); };
    window.claude = { use: function (name) { return Promise.resolve(name === 'sample' ? sample : null); } };
  })()`);
  await phone.goto(`http://localhost:${PORT}/`);
  const pf = await (await phone.waitForSelector('iframe'))!.contentFrame();
  await pf!.waitForFunction(() => !document.getElementById('boot'), { timeout: 60000 }).catch(() => undefined);
  await new Promise((r) => setTimeout(r, 2500));
  const seen = await pf!.evaluate(() => ({ shell: !!document.querySelector('.shell'), h1: document.querySelector('h1')?.textContent ?? '', problem: !!document.querySelector('.demobar__problem') }));
  if (!seen.shell || seen.problem) errors.push(`phone, storage that forgets: not signed in (${seen.h1})`);
  // The language choice survives too: it travels in the address, not only in storage.
  if (seen.shell) await chooseTurkish(pf!, 'phone, storage that forgets');
  await phone.screenshot({ path: join(SCREENS, 'demo-phone.png') });
  // CuraAI on a phone: the chat is exactly the screen (nothing wider, nothing cut off), its field
  // does not make the phone zoom in, and — with Claude there — it answers from the workspace.
  if (seen.shell) {
    const fits = () =>
      pf!.evaluate(() => {
        const box = document.querySelector<HTMLElement>('.cura')!;
        const r = box.getBoundingClientRect();
        const wide = [...box.querySelectorAll<HTMLElement>('*')].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1).map((el) => el.className || el.tagName);
        return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height), vw: window.innerWidth, vh: window.innerHeight, wide: wide.slice(0, 4), logWide: (document.querySelector('.cura .ask__log')?.scrollWidth ?? 0) > (document.querySelector('.cura .ask__log')?.clientWidth ?? 0) + 1, font: parseFloat(getComputedStyle(document.querySelector('.cura .ask__form input')!).fontSize), sub: document.querySelector('.cura__who span')?.textContent ?? '' };
      });
    await pf!.waitForSelector('.cura__fab');
    await pf!.$eval('.cura__fab', (el) => (el as HTMLElement).click());
    await pf!.waitForSelector('.cura .ask__form input', { timeout: 8000 }).catch(async () => errors.push(`phone: the chat did not open (${await pf!.evaluate(() => document.body.innerText.slice(0, 200))})`));
    await pf!.waitForFunction(() => /Claude/.test(document.querySelector('.cura__who span')?.textContent ?? ''), { timeout: 15000 }).catch(() => undefined);
    if (!(await pf!.$('.cura .ask__form input'))) throw new Error(errors.join('\n'));
    let f = await fits();
    if (f.left !== 0 || f.top !== 0 || f.width !== f.vw || f.height !== f.vh) errors.push(`phone: the chat is not the screen (${JSON.stringify(f)})`);
    if (f.font < 16) errors.push(`phone: the chat's field would make the phone zoom in (${f.font}px)`);
    if (!/Claude/.test(f.sub)) errors.push(`phone: the chat does not say Claude answers ("${f.sub}")`);
    await pf!.$eval('.cura .ask__chip', (el) => (el as HTMLElement).click());
    await pf!.waitForSelector('.ask__ai:not([data-live]) .ask__helped', { timeout: 20000 }).catch(() => errors.push('phone: the model’s answer never finished'));
    const answer = await pf!.evaluate(() => ({ text: document.querySelector('.ask__ai .ask__body')?.textContent ?? '', bold: document.querySelectorAll('.ask__ai .ask__body strong').length, items: document.querySelectorAll('.ask__ai .ask__body li').length, img: document.querySelectorAll('.ask__ai img').length, sources: [...document.querySelectorAll('.ask__ai .ask__from')].map((e) => e.textContent ?? '') }));
    if (!answer.text.includes('En büyük müşteriler') || answer.bold !== 1 || answer.items !== 2) errors.push(`phone: the answer is not drawn as written (${JSON.stringify(answer)})`);
    // What the model writes is text, whatever it looks like.
    if (answer.img !== 0 || !answer.text.includes('<img')) errors.push('phone: markup in an answer was treated as markup');
    if (!answer.sources.some((x) => x.startsWith('Belgelerden')) || !answer.sources.some((x) => x.startsWith('Bu çalışma alanından'))) errors.push(`phone: the answer does not say where it came from (${answer.sources.join(' | ')})`);
    f = await fits();
    if (f.wide.length || f.logWide) errors.push(`phone: something in the chat is wider than the screen (${f.wide.join(', ')})`);
    await pf!.type('.cura .ask__form input', 'Bunun için bir görev aç');
    await pf!.$eval('.cura .ask__form', (el) => (el as HTMLFormElement).requestSubmit());
    await pf!.waitForSelector('.ask__proposal .btn', { timeout: 20000 }).catch(() => errors.push('phone: the prepared task is not shown'));
    const before = await pf!.evaluate(() => document.querySelectorAll('.ask__done').length);
    await pf!.$eval('.ask__proposal .btn', (el) => (el as HTMLElement).click());
    await pf!.waitForSelector('.ask__done', { timeout: 10000 }).catch(() => errors.push('phone: pressing "create" did not create the task'));
    if (before !== 0) errors.push('phone: a task was created before anyone pressed the button');
    await new Promise((r) => setTimeout(r, 400));
    await phone.screenshot({ path: join(SCREENS, 'demo-phone-cura.png') });
  }
  await phone.close();
}
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no errors');
await browser.close();
server.close();
process.exit(ok && !errors.some((e) => !e.startsWith('warning')) ? 0 : 1);
