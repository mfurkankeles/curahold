// Accessibility check (WCAG 2.2 A + AA, axe-core) of every surface people see: the app and the
// customer portal (through the demo, which runs both in the tab with the demo company's data), the
// onboarding hub, the platform owner's console with its Office (on the real API, signed in as the
// owner), the sales site, the demo hub and the docs. Each screen is checked in its states — filled,
// empty, an error on a form, a dialog open — in English, Turkish and Arabic (right to left), light and
// dark, at a desktop (1440) and a phone (390) width.
//
// It fails on a serious or critical finding that is not in tests/e2e/a11y-allow.ts (each entry there
// says why it is let through). Moderate and minor findings are printed; they never fail.
// Beyond axe it checks what axe cannot see on its own: a lang on every page (and dir="rtl" in Arabic),
// a way to skip to the content, and a text alternative for the Office's 3D floor.
//
//   npm run build && npm run build:site && npm run build:demo && npx tsx tests/e2e/a11y.ts
//   A11Y_ALL=1    every language × theme × width (the gate checks three combinations of them)
//   A11Y_OUT=f    writes every finding, of every severity, to f as JSON
//   A11Y_PORT     the first of three ports (default 8941)
//   A11Y_ONLY     app,console,signin,static — only those parts
//   A11Y_SHOTS=1  a screenshot of every screen checked, in tests/e2e/screens
import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join, normalize } from 'node:path';
import type { Browser, KeyInput, Page } from 'puppeteer-core';
import { base32Decode, hotp, stepOf } from '../../api/src/lib/totp';
import { CONSENT_POLICY_VERSION } from '../../shared/src/consent/core';
import { OWNER_LOCALES } from '../../shared/src/i18n/owner';
import { ALLOW } from './a11y-allow';
import { DESK_STAFF, SCREENS as SHOTS, startStack } from './browser';

const ALL = !!process.env.A11Y_ALL;
/** A11Y_ONLY=app,console,signin,static — only those parts (while fixing one surface). */
const ONLY = (process.env.A11Y_ONLY ?? '').split(',').filter(Boolean);
const part = (name: string) => !ONLY.length || ONLY.includes(name);
const PORT = Number(process.env.A11Y_PORT ?? 8941);
const DIST = join(import.meta.dirname, '..', '..', 'dist');
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();

type Locale = 'en' | 'tr' | 'ar';
type Theme = 'light' | 'dark';
interface Variant {
  locale: Locale;
  theme: Theme;
  width: 1440 | 390;
}
const V = (locale: Locale, theme: Theme, width: 1440 | 390): Variant => ({ locale, theme, width });
// The gate: each language once, each theme, each width. A11Y_ALL: all twelve.
const VARIANTS: Variant[] = ALL
  ? (['en', 'tr', 'ar'] as const).flatMap((l) => (['light', 'dark'] as const).flatMap((t) => [V(l, t, 1440), V(l, t, 390)]))
  : [V('tr', 'light', 1440), V('en', 'dark', 1440), V('ar', 'light', 390)];
const tag = (v: Variant) => `${v.locale}-${v.theme}-${v.width}`;

interface Finding {
  rule: string;
  impact: string;
  help: string;
  where: string;
  variant: string;
  target: string;
  html: string;
  summary: string;
}
const findings: Finding[] = [];
const problems: string[] = [];
const problem = (m: string) => {
  problems.push(m);
  console.log(`  ✗ ${m}`);
};
let checked = 0;

const save = () => process.env.A11Y_OUT && writeFileSync(process.env.A11Y_OUT, JSON.stringify({ checked, findings, problems }, null, 1));

/** Runs axe on what the page shows now, and the checks axe cannot make by itself. */
async function scan(page: Page, where: string, v: Variant, extra: { skip?: boolean } = {}) {
  checked++;
  const has = await page.evaluate(() => !!(window as any).axe);
  if (!has) await page.evaluate(AXE);
  const r = await page.evaluate(async (tags: string[]) => {
    const res = await (window as any).axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] });
    const doc = document.documentElement;
    const first = document.querySelector('a[href^="#"], button, a[href]') as HTMLElement | null;
    return {
      v: res.violations.map((x: any) => ({ id: x.id, impact: x.impact, help: x.help, nodes: x.nodes.map((n: any) => ({ target: n.target.join(' '), html: String(n.html).slice(0, 180), summary: String(n.failureSummary ?? '').slice(0, 300) })) })),
      lang: doc.lang,
      dir: doc.dir || getComputedStyle(doc).direction,
      skip: !!document.querySelector('a.skip[href^="#"], a.skip-link[href^="#"], .skip-link'),
      first: first?.className ?? '',
    };
  }, TAGS);
  // A11Y_SHOTS=1: a picture of every screen checked (to look at mirroring, focus and zoom by eye).
  if (process.env.A11Y_SHOTS) await page.screenshot({ path: join(SHOTS, `a11y-${tag(v)}-${where.replace(/[^a-z0-9]+/gi, '_')}.png`) }).catch(() => undefined);
  for (const x of r.v) for (const n of x.nodes) findings.push({ rule: x.id, impact: x.impact, help: x.help, where, variant: tag(v), target: n.target, html: n.html, summary: n.summary });
  if (!r.lang) problem(`${where} ${tag(v)}: no lang on <html>`);
  else if (!r.lang.toLowerCase().startsWith(v.locale)) problem(`${where} ${tag(v)}: lang is "${r.lang}", not ${v.locale}`);
  if (v.locale === 'ar' && r.dir !== 'rtl') problem(`${where} ${tag(v)}: not right to left (${r.dir})`);
  if (extra.skip !== false && !r.skip) problem(`${where} ${tag(v)}: no "skip to content" link`);
}


/** Where the keyboard is, and whether it can be seen there: an outline, a ring (box-shadow) or a changed border/background. */
const focusNow = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return { tag: 'body', seen: false, inDialog: false, text: '' };
    const cs = getComputedStyle(el);
    const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none');
    // A field inside a wrapper that draws the ring (:focus-within).
    let up: HTMLElement | null = el.parentElement;
    let wrap = false;
    for (let i = 0; i < 3 && up && !wrap; i++, up = up.parentElement) {
      const u = getComputedStyle(up);
      wrap = (u.outlineStyle !== 'none' && parseFloat(u.outlineWidth) > 0) || (!!u.boxShadow && u.boxShadow !== 'none' && up.matches(':focus-within'));
    }
    const r = el.getBoundingClientRect();
    return { tag: `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''}`, seen: !!ring || wrap, inDialog: !!el.closest('[role=dialog], dialog, [aria-modal=true]'), text: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40), onScreen: r.width > 0 && r.height > 0 };
  });

/** The keyboard path through a screen: the skip link first, then every stop visibly focused, no stop twice in a row. */
async function keyboard(page: Page, where: string, v: Variant, tabs = 25) {
  // Start where the surface starts: the demo puts its own bar before the app, and the page may hold an
  // earlier focus. The skip link must be the surface's first stop.
  await page.evaluate(() => {
    const skip = document.querySelector('a.skip-link, a.skip');
    const box = skip?.parentElement ?? document.body;
    const start = document.createElement('span');
    start.tabIndex = -1;
    start.id = '__a11y_start';
    box.insertBefore(start, box.firstChild);
    start.focus();
  });
  await page.keyboard.press('Tab');
  await page.evaluate(() => document.getElementById('__a11y_start')?.remove());
  const first = await focusNow(page);
  if (!/skip/.test(first.tag)) problem(`${where} ${tag(v)}: the first Tab lands on ${first.tag}, not "skip to content"`);
  else {
    // After the skip link, the focus — or, where the target cannot take focus, the next Tab — is in the content.
    const target = await page.evaluate(() => (document.activeElement as HTMLAnchorElement).hash);
    await page.keyboard.press('Enter');
    await sleep(150);
    let inside = await page.evaluate((h) => !!document.activeElement?.closest(h), target);
    if (!inside) {
      await page.keyboard.press('Tab');
      inside = await page.evaluate((h) => !!document.activeElement?.closest(h), target);
    }
    if (!inside) problem(`${where} ${tag(v)}: "skip to content" does not lead the keyboard to ${target}`);
  }
  const unseen = new Set<string>();
  let same = 0;
  let last = '';
  for (let i = 0; i < tabs; i++) {
    await page.keyboard.press('Tab');
    const f = await focusNow(page);
    if (f.tag === 'body') break;
    if (!f.seen && f.onScreen) unseen.add(`${f.tag} "${f.text}"`);
    same = `${f.tag}|${f.text}` === last ? same + 1 : 0;
    last = `${f.tag}|${f.text}`;
    if (same >= 3) {
      problem(`${where} ${tag(v)}: the keyboard is stuck on ${f.tag} "${f.text}"`);
      break;
    }
  }
  for (const u of unseen) problem(`${where} ${tag(v)}: no visible focus on ${u}`);
}

/** A dialog opened from the keyboard: focus goes in, Tab stays in, Escape closes it and focus comes back. */
async function dialogKeys(page: Page, where: string, v: Variant) {
  const inside = await focusNow(page);
  await page.evaluate(() => document.activeElement?.closest('[role=dialog], dialog')?.setAttribute('data-a11y-open', ''));
  if (!inside.inDialog) problem(`${where} ${tag(v)}: focus is not in the dialog when it opens (${inside.tag})`);
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Tab');
    const f = await focusNow(page);
    if (!f.inDialog) {
      problem(`${where} ${tag(v)}: Tab leaves the open dialog (to ${f.tag})`);
      break;
    }
  }
  await page.keyboard.press('Escape');
  await sleep(300);
  const open = await page.evaluate(() => {
    const d = document.querySelector('[data-a11y-open]');
    return !!d && d.getClientRects().length > 0;
  });
  if (open) problem(`${where} ${tag(v)}: Escape does not close the dialog`);
}

/** Reflow (1.4.10) at 320 px, and text spacing (1.4.12): nothing should need a sideways scroll of the page. */
async function reflow(page: Page, where: string, v: Variant) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (wide > 2) problem(`${where} ${tag(v)}: ${wide}px wider than the window`);
}
const SPACING = `* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }`;

// ---------------------------------------------------------------- the browser and the plain files
const s = await startStack(PORT);
const browser: Browser = s.browser;
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png' };
/** A folder of built files at a port of its own; /demo/ is the demo hub's sub-path, as where it is published. */
function serve(root: string, port: number, strip: string | RegExp = '') {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    let rel = decodeURIComponent(url.pathname).replace(strip, '/');
    if (rel.endsWith('/')) rel += 'index.html';
    let file = join(root, normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    if (!extname(file) && existsSync(join(file, 'index.html'))) file = join(file, 'index.html');
    if (!file.startsWith(root) || !existsSync(file)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise<typeof server>((r) => server.listen(port, () => r(server)));
}
for (const need of ['site/index.html', 'demo-hub/index.html', 'demo-hub/app/index.html', 'web/docs/en/index.html']) if (!existsSync(join(DIST, need))) throw new Error(`dist/${need} is missing: build first (see the top of this file)`);
const site = await serve(join(DIST, 'site'), PORT + 1);
const hub = await serve(join(DIST, 'demo-hub'), PORT + 2, /^\/demo\//);

/** A fresh profile at the variant's width, theme and motion; the cookie choice already made unless asked. */
async function open(v: Variant, opts: { consent?: boolean } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const phone = v.width === 390;
  await page.setViewport({ width: v.width, height: phone ? 844 : 900, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone });
  await page.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'reduce' },
    { name: 'prefers-color-scheme', value: v.theme },
  ]);
  await page.evaluateOnNewDocument(
    (theme: string, policy: string, consent: boolean) => {
      (globalThis as any).__name = (f: unknown) => f;
      try {
        localStorage.setItem('app_theme', theme);
        if (consent) for (const n of [1, 2, 3]) localStorage.setItem(`curahold_consent_v${n}`, JSON.stringify({ analytics: false, marketing: false, decided: true, at: new Date().toISOString(), policy }));
      } catch {
        /* no storage */
      }
    },
    v.theme,
    CONSENT_POLICY_VERSION,
    opts.consent !== false,
  );
  return { page, close: () => ctx.close() };
}
/** Opens a page; false when there is none (a language without a blog, say): nothing to check there. */
const go = async (page: Page, url: string, wait = 300) => {
  const r = await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 }).catch(() => null);
  await sleep(wait);
  return !r || r.status() < 400;
};

// ---------------------------------------------------------------- the app and the portal, in the demo
const DEMO = `http://localhost:${PORT + 2}/demo/app/`;
const APP_SCREENS = ['/home', '/my', '/accounts', ':account', '/b/:product', '/inbox', '/calendar', '/reports', '/reports/all', '/reports/new', '/dashboards', '/team', '/timeline', '/onboarding', '/onboarding/plans', '/setup', '/setup-test', '/setup-health', '/settings/company', '/settings/roles', '/settings/fields', '/profile', '/import', '/trash'];
const PHONE_SCREENS = ['/home', '/my', '/accounts', ':account', '/b/:product', '/inbox', '/onboarding', '/setup-test', '/settings/company'];
const nav = async (page: Page, to: string, wait = 700) => {
  await page.evaluate((p) => (globalThis as any).__demo.navigate(p), to);
  await sleep(wait);
  await page.waitForNetworkIdle({ idleTime: 200, timeout: 8000 }).catch(() => undefined);
};
const press = async (page: Page, key: KeyInput, mod?: KeyInput) => {
  if (mod) await page.keyboard.down(mod);
  await page.keyboard.press(key);
  if (mod) await page.keyboard.up(mod);
  await sleep(400);
};

for (const v of part('app') ? VARIANTS : []) {
  const phone = v.width === 390;
  const first = v === VARIANTS[0];
  const { page, close } = await open(v, { consent: !first });
  await go(page, `${DEMO}#${v.locale}`, 0);
  await page.waitForFunction(() => !!(globalThis as any).__demo && !document.getElementById('boot'), { timeout: 120000 });
  await sleep(800);
  // The cookie banner, once, as a first visit sees it.
  if (first) {
    await scan(page, 'app:consent-banner', v, { skip: false });
    await page.evaluate(() => (document.querySelector('.consent [data-consent="reject"], .consent button') as HTMLElement | null)?.click());
  }
  let account = '';
  for (const raw of phone ? PHONE_SCREENS : APP_SCREENS) {
    let to = raw;
    if (raw === ':account') {
      if (!account) continue;
      to = account;
    }
    await nav(page, to);
    await scan(page, `app:${raw}`, v);
    if (raw === '/accounts' && !account) account = (await page.$eval('a[href^="/accounts/"]', (a) => a.getAttribute('href') ?? '').catch(() => '')) || '';
  }
  // The keyboard: once per width, through the home and the task list; and the reflow and text-spacing checks.
  const firstOfWidth = VARIANTS.find((x) => x.width === v.width) === v;
  if (firstOfWidth) {
    for (const to of ['/home', '/my', '/accounts']) {
      await nav(page, to);
      await keyboard(page, `app:${to}`, v);
    }
    if (phone) {
      await page.setViewport({ width: 320, height: 700, isMobile: true, hasTouch: true });
      for (const to of ['/home', '/my', '/accounts', '/settings/company']) {
        await nav(page, to);
        await reflow(page, `app:${to}@320`, v);
      }
      const css = await page.addStyleTag({ content: SPACING });
      await nav(page, '/my');
      await reflow(page, 'app:/my+text-spacing', v);
      await page.screenshot({ path: join(SHOTS, `text-spacing-${tag(v)}.png`) });
      await css.evaluate((n) => n.remove());
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    }
  }
  // States: a dialog open, an empty list, an error on a form.
  await nav(page, '/home');
  await press(page, 'k', 'Control');
  await scan(page, 'app:/home+search-palette', v);
  if (firstOfWidth) await dialogKeys(page, 'app:/home+search-palette', v);
  else await press(page, 'Escape');
  await nav(page, '/my');
  const row = await page.$('.tasklist__row .rowlink');
  if (row) {
    await row.click().catch(() => undefined);
    await sleep(700);
    await scan(page, 'app:/my+task-panel', v);
    await press(page, 'Escape');
  }
  await nav(page, '/accounts?q=zzzz-nobody');
  await page.evaluate(() => {
    const i = document.querySelector('input[type=search], .search input, input[placeholder]') as HTMLInputElement | null;
    if (!i) return;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    set.call(i, 'zzzz-nobody');
    i.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(700);
  await scan(page, 'app:/accounts+empty', v);
  // A dialog with a form: a new customer.
  if (await page.$('.listtop__new')) {
    // From the keyboard, as someone without a mouse opens it.
    await page.focus('.listtop__new');
    await page.keyboard.press('Enter');
    await sleep(500);
    await scan(page, 'app:/accounts+new-dialog', v);
    if (firstOfWidth) {
      await dialogKeys(page, 'app:/accounts+new-dialog', v);
      const back = await page.evaluate(() => document.activeElement?.classList.contains('listtop__new') ?? false);
      if (!back) problem(`app:/accounts+new-dialog ${tag(v)}: focus does not return to the button that opened the dialog`);
    } else await press(page, 'Escape');
  }
  // The customer's portal: the same demo, as the customer's person.
  await page.evaluate(() => (globalThis as any).__demo.as('customer'));
  await sleep(2500);
  await page.waitForNetworkIdle({ idleTime: 300, timeout: 10000 }).catch(() => undefined);
  await scan(page, 'portal:/', v);
  if (VARIANTS.find((x) => x.width === v.width) === v) await keyboard(page, 'portal:/', v);
  for (const to of ['/new', '/account']) {
    await nav(page, to, 900);
    await scan(page, `portal:${to}`, v);
  }
  await close();
  save();
  console.log(`app + portal ${tag(v)}: done (${Math.round((Date.now() - t0) / 1000)} s)`);
}

// ---------------------------------------------------------------- the owner's console and its Office
const desk = `http://desk.localhost:${PORT}`;
const CONSOLE = ['/', '/customers', '/support', '/revenue', '/trials', '/requests', '/approvals', '/plan', '/plan?q=investors', '/plan?q=summary', '/checklist', '/system', '/activity', '/team', '/chats', '/meetings', '/office'];
const CONSOLE_PHONE = ['/', '/support', '/approvals', '/plan?q=investors', '/office'];
const deskCode = () => s.email.sent.filter((m: any) => m.to === DESK_STAFF && /desk code/.test(m.subject)).map((m: any) => /\b(\d{6})\b/.exec(m.text)?.[1]).at(-1);
if (part('console')) {
  // One sign-in (email code, then the authenticator) for the whole walk; each variant then changes the
  // language, theme and width in the same session, as the owner would. Signing in again for each one
  // would reuse an authenticator code inside its 30 seconds, which the console rightly refuses.
  const v0 = VARIANTS[0];
  const { page, close } = await open(v0);
  await go(page, `${desk}/`);
  await page.waitForSelector('.desk-signin__card input[type=email]', { timeout: 20000 });
  await page.select('.desk__langs select', v0.locale);
  await sleep(300);
  await scan(page, 'console:sign-in', v0, { skip: false });
  await page.type('.desk-signin__card input[type=email]', DESK_STAFF);
  await page.click('.desk-signin__card .btn--primary');
  await page.waitForFunction(() => !!document.querySelector('.desk-signin__code:not([disabled])'));
  for (let i = 0; i < 50 && !deskCode(); i++) await sleep(100);
  await page.type('.desk-signin__code', deskCode()!);
  await page.click('.desk-signin__card .btn--primary');
  await page.waitForSelector('.desk-signin__card [data-secret]', { timeout: 15000 });
  const secret = await page.$eval('.desk-signin__card [data-secret]', (el) => (el as HTMLElement).dataset.secret!);
  await scan(page, 'console:second-step', v0, { skip: false });
  await page.type('.desk-signin__card input[autocomplete="one-time-code"]', await hotp(base32Decode(secret), stepOf(Date.now())));
  await page.click('.desk-signin__card .btn--primary');
  await page.waitForSelector('.console__rail', { timeout: 20000 });
  // The owner's console speaks the owner's languages (OWNER_LOCALES); in another one it is checked in English.
  for (const asked of VARIANTS) {
    const v: Variant = (OWNER_LOCALES as string[]).includes(asked.locale) ? asked : { ...asked, locale: 'en' };
    const phone = v.width === 390;
    await page.setViewport({ width: v.width, height: phone ? 844 : 900, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone });
    await page.emulateMediaFeatures([
      { name: 'prefers-reduced-motion', value: 'reduce' },
      { name: 'prefers-color-scheme', value: v.theme },
    ]);
    await page.evaluate((t: string) => localStorage.setItem('app_theme', t), v.theme);
    await page.goto(`${desk}/`, { waitUntil: 'load', timeout: 30000 }).catch(() => undefined);
    // The walk asks for pages much faster than a person: the per-person request budget (lib/ratelimit.ts)
    // can run out. Wait for it to fill again, once, before calling it a problem.
    let rail = await page.waitForSelector('.console__rail', { timeout: 20000 }).catch(() => null);
    if (!rail) {
      await sleep(30000);
      await page.goto(`${desk}/`, { waitUntil: 'load', timeout: 30000 }).catch(() => undefined);
      rail = await page.waitForSelector('.console__rail', { timeout: 20000 }).catch(() => null);
    }
    if (!rail) {
      problem(`console ${tag(v)}: the console did not open (${(await page.evaluate(() => document.body.innerText.slice(0, 160))).replace(/\s+/g, ' ')})`);
      continue;
    }
    if (await page.$('.desk__langs select')) {
      await page.select('.desk__langs select', v.locale);
      await sleep(600);
    }
    for (const to of phone ? CONSOLE_PHONE : CONSOLE) {
      await page.goto(`${desk}${to}`, { waitUntil: 'load', timeout: 30000 }).catch(() => undefined);
      await page.waitForSelector('.console__main, .of', { timeout: 10000 }).catch(() => undefined);
      await sleep(to === '/office' ? 1500 : 700);
      await scan(page, `console:${to}`, v);
      if (to === '/' && VARIANTS.find((x) => x.width === v.width) === asked) await keyboard(page, 'console:/', v);
      if (to === '/office') {
        // Without a graphics card the floor is drawn in 2D; with one it is 3D. Either way the people on it
        // must be readable as text: a list of seats a screen reader can walk.
        const alt = await page.evaluate(() => {
          const stage = document.querySelector('.of-stage');
          const canvas = document.querySelector('.of-stage canvas');
          const list = document.querySelectorAll('.of-stage [role=listitem], .of-stage li, .of-list li, .of-stage button');
          return { stage: !!stage, label: stage?.getAttribute('aria-label') ?? '', canvasHidden: !canvas || canvas.getAttribute('aria-hidden') === 'true' || !!canvas.getAttribute('aria-label') || canvas.getAttribute('role') === 'img', items: list.length };
        });
        if (!alt.stage || !alt.label || !alt.canvasHidden || alt.items < 1) problem(`console:/office ${tag(v)}: no text alternative for the floor (${JSON.stringify(alt)})`);
      }
    }
    save();
    console.log(`console ${tag(v)}: done (${Math.round((Date.now() - t0) / 1000)} s)`);
  }
  await close();
}

// ---------------------------------------------------------------- the sign-in page (the real app, signed out)
for (const v of part('signin') ? VARIANTS.slice(0, 2) : []) {
  const { page, close } = await open(v);
  await go(page, `http://demo.localhost:${PORT}/`);
  await page.evaluate((l) => localStorage.setItem('app_locale', l), v.locale);
  await go(page, `http://demo.localhost:${PORT}/`);
  await scan(page, 'app:sign-in', v, { skip: false });
  // An address that cannot be one: the error must be said in words, next to the field.
  await page.type('input[type=email]', 'not-an-address').catch(() => undefined);
  await page.click('form button.btn--primary').catch(() => undefined);
  await sleep(700);
  await scan(page, 'app:sign-in+error', v, { skip: false });
  await close();
}

// ---------------------------------------------------------------- the sales site, the demo hub, the docs
const SITE_PAGES = ['', 'pricing/', 'solutions/', 'integrations/', 'why/', 'trust/', 'about/', 'ai/', 'blog/'];
const sitePrefix = (l: Locale) => (l === 'en' ? '/' : `/${l}/`);
for (const v of part('static') ? VARIANTS : []) {
  const { page, close } = await open(v, { consent: v !== VARIANTS[0] });
  for (const p of v.width === 390 ? ['', 'pricing/'] : SITE_PAGES) {
    if (!(await go(page, `http://localhost:${PORT + 1}${sitePrefix(v.locale)}${p}`))) continue;
    await scan(page, `site:/${p}${v === VARIANTS[0] && p === '' ? '+consent-banner' : ''}`, v);
    if (p === '' && v !== VARIANTS[0] && VARIANTS.find((x) => x.width === v.width && x !== VARIANTS[0]) === v) await keyboard(page, 'site:/', v, 15);
  }
  if (v.width === 390) {
    await page.evaluate(() => (document.querySelector('.hdr__burger, [aria-controls][aria-expanded], .nav__toggle') as HTMLElement | null)?.click());
    await sleep(400);
    await scan(page, 'site:/+menu-open', v);
  }
  await go(page, `http://localhost:${PORT + 2}/demo/${v.locale === 'en' ? '' : `${v.locale}/`}`);
  await scan(page, 'hub:/', v);
  for (const p of v.width === 390 ? ['', 'tasks/'] : ['', 'tasks/', 'getting-started/', 'customers/', 'legal-privacy/']) {
    await go(page, `http://demo.localhost:${PORT}/docs/${v.locale}/${p}`);
    await scan(page, `docs:/${p}`, v);
    if (p === 'tasks/' && VARIANTS.find((x) => x.width === v.width) === v) await keyboard(page, 'docs:/tasks/', v, 15);
  }
  await close();
  save();
  console.log(`site + hub + docs ${tag(v)}: done (${Math.round((Date.now() - t0) / 1000)} s)`);
}

// ---------------------------------------------------------------- what was found
const allowed = (f: Finding) => ALLOW.some((a) => a.rule === f.rule && (!a.where || f.where.includes(a.where)) && (!a.target || f.target.includes(a.target)));
const bySeverity: Record<string, number> = {};
const byRule = new Map<string, { impact: string; n: number; where: Set<string> }>();
for (const f of findings) {
  bySeverity[f.impact] = (bySeverity[f.impact] ?? 0) + 1;
  const e = byRule.get(f.rule) ?? { impact: f.impact, n: 0, where: new Set<string>() };
  e.n++;
  e.where.add(f.where);
  byRule.set(f.rule, e);
}
const order = ['critical', 'serious', 'moderate', 'minor'];
console.log(`\n${checked} screens checked; findings by severity: ${order.map((k) => `${k} ${bySeverity[k] ?? 0}`).join(', ')}`);
for (const [rule, e] of [...byRule].sort((a, b) => order.indexOf(a[1].impact) - order.indexOf(b[1].impact) || b[1].n - a[1].n)) console.log(`  ${e.impact.padEnd(8)} ${rule.padEnd(28)} ${String(e.n).padStart(4)}  ${[...e.where].slice(0, 6).join(' ')}${e.where.size > 6 ? ' …' : ''}`);
const stopping = findings.filter((f) => (f.impact === 'serious' || f.impact === 'critical') && !allowed(f));
for (const f of stopping.slice(0, 40)) problem(`${f.impact} ${f.rule} on ${f.where} ${f.variant}: ${f.target} — ${f.summary.split('\n').slice(0, 2).join(' ')}`);
if (stopping.length > 40) problem(`… and ${stopping.length - 40} more serious/critical findings`);
if (process.env.A11Y_OUT) writeFileSync(process.env.A11Y_OUT, JSON.stringify({ checked, bySeverity, findings, problems }, null, 1));

await browser.close();
site.close();
hub.close();
console.log(`\n${problems.length ? `${problems.length} problem(s)` : 'all good'} in ${Math.round((Date.now() - t0) / 1000)} s`);
process.exit(problems.length ? 1 : 0);
