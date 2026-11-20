// Pictures for the help section "When a sync stops" (docs/site/<lang>/connections.md#sync-stops), one per step,
// in every help language. They need a connection that has really lost its sign-in, which the browser-only demo
// cannot show, so they are taken from the local app with the vendor mocks (tests/vendors): Salesforce is connected,
// synced once, then its access is withdrawn on the vendor's side.
//
//   npm run build && npx tsx scripts/integrations/help-shots.ts [lang …]     (default: every help language)
//
// Writes docs/site/<lang>/img/sync-stops-{1,2,3,4}.webp (the sign-in between 3 and 4 is the vendor's own screen).
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { Browser, Page } from 'puppeteer-core';
import { bootIntegrations } from './boot';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core') as typeof import('puppeteer-core');
const ROOT = join(import.meta.dirname, '..', '..');
const PORT = Number(process.env.PORT ?? 9771);
const LANGS = process.argv.slice(2).length ? process.argv.slice(2) : ['en', 'tr', 'ar', 'he', 'fa', 'zh-Hans', 'zh-Hant', 'ja', 'ko'];

/** The same numbered ring as scripts/docs/shots.ts, drawn over the element found by selector or by its text. */
const ring = (find: string, n: number) => `(() => {
  const el = (${find})();
  if (!el) throw new Error('no mark');
  el.scrollIntoView({ block: 'center', inline: 'nearest' });
  const r = el.getBoundingClientRect();
  const rtl = document.documentElement.dir === 'rtl';
  const box = document.createElement('div');
  box.setAttribute('aria-hidden', 'true');
  box.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border:3px solid #d9480f;border-radius:10px;box-shadow:0 0 0 5px rgba(217,72,15,.18)';
  Object.assign(box.style, { left: (r.left - 6) + 'px', top: (r.top - 6) + 'px', width: (r.width + 12) + 'px', height: (r.height + 12) + 'px' });
  const dot = document.createElement('div');
  dot.textContent = String(${n});
  dot.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;width:28px;height:28px;border-radius:50%;background:#d9480f;color:#fff;font:700 15px/28px system-ui,sans-serif;text-align:center';
  Object.assign(dot.style, { top: Math.max(4, r.top - 20) + 'px', left: (rtl ? Math.min(innerWidth - 32, r.right - 8) : Math.max(4, r.left - 20)) + 'px' });
  document.body.append(box, dot);
})()`;
const bySel = (sel: string) => `() => document.querySelector(${JSON.stringify(sel)})`;
/** "Reconnect" sits in the red notice at the top of the connection's page; "Sync now" is the header's main button. */
const headerButton = (which: 'sync' | 'reconnect') =>
  which === 'sync' ? `() => [...document.querySelectorAll('.btn--primary')].find((b) => !b.closest('.notice'))` : `() => document.querySelector('.notice--error .btn')`;

async function settle(page: Page) {
  try {
    await page.waitForNetworkIdle({ idleTime: 300, timeout: 4000 });
  } catch {
    // the live channel keeps a socket open
  }
}

const stack = await bootIntegrations({ port: PORT, latency: false });
const world = stack.world!;
let browser: Browser | null = null;
try {
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--no-first-run'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  // Vendor sign-in pages are the mocks' own consent: "Allow" goes straight back to the app.
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!u.hostname.endsWith('localhost') && r.isNavigationRequest() && u.hostname === 'login.salesforce.com') return void r.respond({ status: 302, headers: { location: world.mock('salesforce').consent!(u, world.ctl('salesforce')) } });
    if (!u.hostname.endsWith('localhost')) return void r.abort();
    void r.continue();
  });
  await page.goto(`${stack.origin}/`, { waitUntil: 'networkidle2' });
  await page.evaluate(`localStorage.setItem('curahold.consent', JSON.stringify({ v: 1, analytics: false }))`);
  await page.type('input[type=email]', stack.demo.adminEmail);
  await page.click('form button.btn--primary');
  await (await page.waitForSelector('a.btn[href^="/auth/verify"]'))!.click();
  await page.waitForSelector('.sidebar', { timeout: 20_000 });
  // Connect Salesforce through the real start address, map with the suggestions, sync once, then lose access.
  const api = (method: string, path: string, body?: unknown) => page.evaluate(`fetch(${JSON.stringify(`/api${path}`)}, { method: ${JSON.stringify(method)}, headers: { 'content-type': 'application/json', 'x-curahold-device': localStorage.getItem('app_device') || '' }, body: ${body ? JSON.stringify(JSON.stringify(body)) : 'undefined'} }).then((r) => r.json())`) as Promise<any>;
  await page.goto(`${stack.origin}/api/connect/salesforce/start`, { waitUntil: 'networkidle2' });
  const id = /\/settings\/sources\/([0-9a-f-]{36})/.exec(page.url())?.[1];
  if (!id) throw new Error(`not connected: ${page.url()}`);
  const objects: any[] = [];
  for (const [remote, target, kind] of [['Account', 'account', ''], ['Contact', 'record', 'contact']] as const) {
    const sug = await api('GET', `/connections/${id}/objects/${remote}/fields?kind=${target === 'account' ? 'account' : kind}`);
    objects.push({ remote, label: remote, target, ...(kind ? { typeKey: '__new', kind } : {}), enabled: true, create: true, fields: sug.suggested });
  }
  await api('PUT', `/connections/${id}/sync`, { objects, conflict: 'latest' });
  await api('POST', `/connections/${id}/sync/run`, {});
  world.arm('salesforce', 'revoked');
  await api('POST', `/connections/${id}/sync/run`, {});
  for (const lang of LANGS) {
    await api('PATCH', '/me', { locale: lang });
    const out = join(ROOT, 'docs', 'site', lang, 'img');
    const shoot = async (name: string, path: string, find: string, n: number) => {
      await page.goto(`${stack.origin}${path}`, { waitUntil: 'networkidle2' });
      await settle(page);
      await page.evaluate(ring(find, n));
      await page.screenshot({ path: join(out, `${name}.webp`) as `${string}.webp`, type: 'webp', quality: 72 });
    };
    await shoot('sync-stops-1', '/settings/sources', bySel('a[href="/settings/sources"]'), 1);
    await shoot('sync-stops-2', '/settings/sources', bySel('a.source-row'), 2);
    await shoot('sync-stops-3', `/settings/sources/${id}`, headerButton('reconnect'), 3);
    await shoot('sync-stops-4', `/settings/sources/${id}`, headerButton('sync'), 4);
    console.log(`${lang}: 4 pictures`);
  }
} finally {
  await browser?.close();
  stack.server.close();
}
process.exit(0);
