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
    res.end(`<!doctype html><body style="margin:0"><iframe src="http://127.0.0.1:${PORT}/a/demo/index.html" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" style="border:0;width:100vw;height:100vh"></iframe></body>`);
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
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=tr-TR'],
});
const page = await browser.newPage();
await page.setViewport({ width: Number(process.env.W ?? 1440), height: Number(process.env.H ?? 900) });
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
  await click('.navlink', 'Yenilemeler');
  await frame!.waitForFunction(() => document.querySelectorAll('.card, .task, [data-task]').length > 0, { timeout: 10000 }).catch(() => undefined);
  await page.screenshot({ path: join(SCREENS, 'demo-board.png') });
  await click('.navlink', 'Müşteriler');
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: join(SCREENS, 'demo-accounts.png') });
  await frame!.select('.demobar select', 'zeynep');
  await frame!.waitForFunction(() => document.querySelector('.sidebar')?.textContent?.includes('Zeynep'), { timeout: 10000 }).catch(() => console.log('switch: sidebar does not show Zeynep'));
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: join(SCREENS, 'demo-zeynep.png') });
}
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no errors');
await browser.close();
server.close();
process.exit(ok && !errors.some((e) => !e.startsWith('warning')) ? 0 : 1);
