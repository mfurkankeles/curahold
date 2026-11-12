// Quality measurements in a real browser, against the built app (npm run build
// first): how fast the first screen appears on a phone, how quickly the screen
// answers a tap, how long someone else's change takes to show, how a very large
// board and list behave, accessibility findings, and texts that do not fit.
// It measures and prints; it changes nothing.
//
//   npx tsx scripts/quality/browser.mts [load] [tap] [live] [big] [axe] [fit]     (no words: all of them)
//
// "A mid-range phone on 4G" here means: 9 Mbit/s down, 1.5 Mbit/s up, 165 ms per
// request (Chrome's "Fast 4G") and a processor four times slower than this
// machine. "Slow 4G" is the harsher profile Lighthouse uses for its mobile score.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
import type { Page } from 'puppeteer-core';
import { newPage, signIn, startStack } from '../../tests/e2e/browser';

const want = process.argv.slice(2);
const on = (name: string) => !want.length || want.includes(name);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const out: string[] = [];
const say = (topic: string, text: string) => {
  out.push(`${topic.padEnd(6)} ${text}`);
  console.log(out[out.length - 1]);
};
const pct = (list: number[], p: number) => [...list].sort((a, b) => a - b)[Math.min(list.length - 1, Math.ceil((p / 100) * list.length) - 1)] ?? 0;

// The local server sends files as they are; a real host compresses them. A thin front does the same.
function compressingFront(target: number, port: number) {
  const srv = http.createServer((req, res) => {
    const sent: Buffer[] = [];
    req.on('data', (c) => sent.push(c));
    req.on('end', () => {
      const up = http.request({ host: '127.0.0.1', port: target, method: req.method, path: req.url, headers: req.headers }, (r) => {
        const got: Buffer[] = [];
        r.on('data', (c) => got.push(c));
        r.on('end', () => {
          let body = Buffer.concat(got);
          const headers = { ...r.headers };
          if (body.length > 1024 && /javascript|css|html|json|svg|text/.test(String(headers['content-type'] ?? '')) && /gzip/.test(String(req.headers['accept-encoding'] ?? ''))) {
            body = gzipSync(body, { level: 6 });
            headers['content-encoding'] = 'gzip';
          }
          delete headers['transfer-encoding'];
          headers['content-length'] = String(body.length);
          res.writeHead(r.statusCode ?? 200, headers);
          res.end(body);
        });
      });
      up.on('error', () => (res.writeHead(502), res.end()));
      if (sent.length) up.write(Buffer.concat(sent));
      up.end();
    });
  });
  return new Promise<http.Server>((r) => srv.listen(port, () => r(srv)));
}

const PORT = 8931;
const s = await startStack(PORT);
const front = await compressingFront(PORT, PORT + 1);
const origin = `http://demo.localhost:${PORT + 1}`;

/** Calls the API as whoever is signed in on this page. */
const api = (page: Page) => <T = any,>(method: string, path: string, body?: unknown): Promise<T> =>
  page.evaluate(
    async (m, p, b) => {
      const r = await fetch(p, { method: m, headers: { 'content-type': 'application/json', 'x-curahold-device': localStorage.getItem('tw_device') ?? '' }, body: b === undefined ? undefined : JSON.stringify(b), credentials: 'include' });
      return r.status === 204 ? null : r.json();
    },
    method,
    path,
    body,
  ) as Promise<T>;

// What the page itself measures: the largest paint, layout shifts, and how long each tap or key took to show.
const WATCH = `window.__name = (f) => f; window.__q = { lcp: 0, cls: 0, taps: [] };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__q.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__q.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.interactionId) window.__q.taps.push([e.interactionId, Math.round(e.duration)]); }).observe({ type: 'event', durationThreshold: 16, buffered: true });`;

/** A fresh browser profile with the watcher in every page it opens. */
const open = async (width = 1440, height = 900) => {
  const p = await newPage(s.browser, width, height);
  await p.page.evaluateOnNewDocument(WATCH);
  return p;
};
const ada = await open();
await signIn(ada.page, origin, 'ada@demo.example');
// The same invented portfolio the demo shows.
const { seedShowcase } = await import('../seed-showcase');
await seedShowcase(api(ada.page) as any, s.db).catch((e) => console.warn('seed', e));
const go = async (page: Page, path: string, wait = 350) => {
  await page.goto(`${origin}${path}`, { waitUntil: 'networkidle0', timeout: 60000 }).catch(() => undefined);
  await sleep(wait);
};

// ---------------------------------------------------------------- load: the first screen on a phone
if (on('load')) {
  const NETS = { '4G': { latency: 165, downloadThroughput: (9_000_000 / 8) * 0.9, uploadThroughput: (1_500_000 / 8) * 0.9 }, 'slow 4G': { latency: 562.5, downloadThroughput: (1_638_400 / 8) * 0.9, uploadThroughput: (750_000 / 8) * 0.9 } };
  for (const [net, conditions] of Object.entries(NETS)) {
    const phone = await open(390, 844);
    await signIn(phone.page, origin, 'ada@demo.example');
    await go(phone.page, '/home', 1500);
    const cdp = await phone.page.createCDPSession();
    await cdp.send('Network.enable');
    const measure = async (label: string, cold: boolean) => {
      if (cold) {
        await cdp.send('Network.clearBrowserCache');
        await cdp.send('Storage.clearDataForOrigin', { origin, storageTypes: 'cache_storage,service_workers' });
      }
      await cdp.send('Network.emulateNetworkConditions', { offline: false, ...conditions });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      let bytes = 0;
      let requests = 0;
      const count = (e: any) => ((bytes += e.encodedDataLength), requests++);
      cdp.on('Network.loadingFinished', count);
      const t0 = Date.now();
      await phone.page.goto(`${origin}/home`, { waitUntil: 'networkidle0', timeout: 120000 }).catch(() => undefined);
      await sleep(1200);
      const q = await phone.page.evaluate(() => (window as any).__q);
      cdp.off('Network.loadingFinished', count);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      say('load', `${net}, ${label}: largest paint ${(q.lcp / 1000).toFixed(2)} s, layout shift ${q.cls.toFixed(3)}, ${requests} requests, ${(bytes / 1024).toFixed(0)} KB over the wire, quiet after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    };
    await measure('first open (nothing cached)', true);
    await measure('opening again', false);
    await phone.page.close();
  }
}

// ---------------------------------------------------------------- tap: how long the screen takes to answer
if (on('tap')) {
  const p = await open(390, 844);
  await signIn(p.page, origin, 'ada@demo.example');
  // Motion on, as for most people: the checks elsewhere switch it off.
  await p.page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await go(p.page, '/home', 800);
  const cdp = await p.page.createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const done: [string, number][] = [];
  const act = async (name: string, fn: () => Promise<unknown>, settle = 900) => {
    await p.page.evaluate(() => ((window as any).__q.taps = []));
    await fn().catch(() => undefined);
    await sleep(settle);
    const taps: [number, number][] = await p.page.evaluate(() => (window as any).__q.taps);
    if (taps.length) done.push([name, Math.max(...taps.map((t) => t[1]))]);
  };
  const tap = (sel: string) => async () => {
    const el = await p.page.$(sel);
    if (!el) throw new Error(sel);
    await el.click();
  };
  // Real taps on the phone's bottom bar (a scripted click is not an interaction to the browser).
  for (const [name, path] of [['open the customer list', '/accounts'], ['open the calendar', '/calendar'], ['open My tasks', '/'], ['open Home', '/home']] as const) {
    await act(name, tap(`.tabbar a[href="${path}"]`));
  }
  const board = (await api(p.page)('GET', '/api/boards')).boards[0].id;
  await go(p.page, `/b/${board}`, 800);
  await act('open a task', tap('.card'));
  await act('tap the task title', tap('.panel__title'));
  await act('type in the task title', async () => {
    await p.page.keyboard.type('abc', { delay: 40 });
  });
  await act('tick a checklist box or the done button', tap('.panel input[type="checkbox"], .panel .btn'));
  await act('close the task', async () => p.page.keyboard.press('Escape'));
  await go(p.page, '/accounts', 800);
  await act('type in the customer search', async () => {
    const input = await p.page.$('input[type="search"], .toolbar input');
    await input?.focus();
    await p.page.keyboard.type('ve', { delay: 60 });
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const times = done.map((d) => d[1]);
  say('tap', `${done.length} taps and key presses on a 4× slower processor: 75th percentile ${pct(times, 75)} ms, slowest ${Math.max(...times)} ms (${done.sort((a, b) => b[1] - a[1]).slice(0, 4).map((d) => `${d[0]} ${d[1]} ms`).join('; ')})`);
  await p.page.close();
}

// ---------------------------------------------------------------- live: someone else's change
if (on('live')) {
  const boards = (await api(ada.page)('GET', '/api/boards')).boards;
  const board = boards[0];
  await go(ada.page, `/b/${board.id}`, 600);
  const other = await open();
  await signIn(other.page, origin, 'zeynep@demo.example');
  const waits: number[] = [];
  for (let i = 0; i < 3; i++) {
    // Not in step with the page's own clock: wait a different while before each change.
    await sleep(2000 + i * 7000);
    const title = `Canlı ölçüm ${Date.now()}`;
    const t0 = Date.now();
    await api(other.page)('POST', '/api/tasks', { boardId: board.id, title });
    const seen = await ada.page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: 120000, polling: 100 }, title).then(() => true, () => false);
    waits.push(seen ? (Date.now() - t0) / 1000 : Infinity);
  }
  say('live', `a card added by someone else shows on an open board after: ${waits.map((w) => (Number.isFinite(w) ? `${w.toFixed(1)} s` : 'never (2 min)')).join(', ')} (three tries; no reload)`);
  await other.page.close();
}

// ---------------------------------------------------------------- axe and fit: every screen
const screens: string[] = [];
if (on('axe') || on('fit')) {
  await go(ada.page, '/home', 500);
  const nav: string[] = await ada.page.$$eval('.sidebar a[href^="/"]', (els) => [...new Set(els.map((a) => a.getAttribute('href')!))]);
  const account = (await api(ada.page)('GET', '/api/accounts?limit=1&q=Velto')).accounts[0]?.id;
  const tabs = ['company', 'billing', 'currencies', 'fields', 'health', 'rhythm', 'playbooks', 'records', 'people', 'joining', 'teams', 'roles', 'connections', 'sources', 'automations', 'developer', 'portal', 'support', 'audit'];
  screens.push(...nav, `/accounts/${account}`, '/reports/all', '/reports/new', '/profile', '/devices', '/connect-ai', ...tabs.map((t) => `/settings/${t}`));
}
const look = async (page: Page, theme: 'light' | 'dark', locale: 'tr' | 'en') => {
  await api(page)('PATCH', '/api/me', { locale });
  await page.evaluate((m) => {
    localStorage.setItem('tw_theme', m);
    document.documentElement.dataset.theme = m;
  }, theme);
};

if (on('axe')) {
  const require = createRequire(import.meta.url);
  const axe = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  for (const theme of ['light', 'dark'] as const) {
    const p = await open(1440, 900);
    await signIn(p.page, origin, 'ada@demo.example');
    await look(p.page, theme, 'tr');
    const byRule = new Map<string, number>();
    const byImpact: Record<string, number> = {};
    let withFindings = 0;
    for (const path of screens) {
      await go(p.page, path, 250);
      await p.page.evaluate(axe);
      const found: { id: string; impact: string; nodes: number }[] = await p.page.evaluate(async () => {
        const r = await (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
        return r.violations.map((v: any) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
      });
      if (found.length) withFindings++;
      for (const f of found) {
        byRule.set(f.id, (byRule.get(f.id) ?? 0) + f.nodes);
        byImpact[f.impact] = (byImpact[f.impact] ?? 0) + f.nodes;
      }
    }
    const total = [...byRule.values()].reduce((a, b) => a + b, 0);
    say('axe', `${theme}: ${total} findings on ${withFindings} of ${screens.length} screens (${Object.entries(byImpact).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}); most common: ${[...byRule].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    await p.page.close();
  }
}

if (on('fit')) {
  for (const [width, locale, theme] of [[375, 'tr', 'light'], [768, 'en', 'dark'], [1440, 'tr', 'light']] as const) {
    const p = await open(width, 900);
    await signIn(p.page, origin, 'ada@demo.example');
    await look(p.page, theme, locale);
    let sideways = 0;
    let cut = 0;
    let out2 = 0;
    let manyMain = 0;
    const worst: string[] = [];
    for (const path of screens) {
      await go(p.page, path, 200);
      const r = await p.page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const scroller = (el: Element | null): boolean => {
          for (let a = el; a && a !== document.body; a = a.parentElement) if (/auto|scroll|hidden|clip/.test(getComputedStyle(a).overflowX)) return true;
          return false;
        };
        let cut = 0;
        let out = 0;
        const samples: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>('body *')) {
          const box = el.getBoundingClientRect();
          if (!box.width || !box.height || getComputedStyle(el).visibility === 'hidden') continue;
          const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim().length > 1);
          // A label (button, tab, heading, menu item, field name) whose own text does not fit its box.
          if (ownText && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible' && el.closest('button, [role="tab"], h1, h2, h3, label, th, .btn, .tab, .navlink, .admin__link, .field__label, .stat__label, .sheet__title')) {
            cut++;
            if (samples.length < 2) samples.push(el.textContent!.trim().slice(0, 28));
          }
          // Something that sticks out of the window with nothing to scroll it.
          if (ownText && box.right > vw + 1 && !scroller(el.parentElement)) out++;
        }
        const main = [...document.querySelectorAll<HTMLElement>('.main .btn--primary')].filter((b) => b.offsetParent && !b.closest('.dialog, .panel, .billingbar')).length;
        return { sideways: document.documentElement.scrollWidth > vw + 1, cut, out, main, samples };
      });
      if (r.sideways) sideways++;
      cut += r.cut;
      out2 += r.out;
      if (r.main > 1) manyMain++;
      if ((r.cut || r.sideways) && worst.length < 5) worst.push(`${path.replace(/[0-9a-f-]{36}/, '…')}${r.samples.length ? ` ("${r.samples[0]}")` : ''}`);
    }
    say('fit', `${width} px, ${locale}, ${theme}: ${screens.length} screens; scroll sideways: ${sideways}; labels that do not fit: ${cut}; text sticking out of the window: ${out2}; screens with more than one main button: ${manyMain}${worst.length ? `; e.g. ${worst.join(', ')}` : ''}`);
    await p.page.close();
  }
  await api(ada.page)('PATCH', '/api/me', { locale: null });
}

// ---------------------------------------------------------------- big: 20,000 tasks on a board, 2,000 customers
if (on('big')) {
  const d = s.demo as any;
  await s.db.system(async (q) => {
    await q.query(
      `insert into tasks (org_id, board_id, title, status, position, created_by, updated_by, assignee_ids, due_date)
       select $1, $2, 'Yük görevi ' || g, (array['todo','doing','waiting','done'])[1 + g % 4], g * 1024, $3, $3, array[$3]::uuid[], current_date + (g % 60) - 20 from generate_series(1, 20000) g`,
      [d.orgId, d.boards.csBoard, d.ids.ada],
    );
    await q.query(`insert into accounts (org_id, name, owner_id, created_by, fields) select $1, 'Yük müşterisi ' || g, $2, $2, jsonb_build_object('arr', g * 100) from generate_series(1, 2000) g`, [d.orgId, d.ids.ada]);
  });
  const p = await open(1440, 900);
  await signIn(p.page, origin, 'ada@demo.example');
  const timed = async (label: string, path: string, ready: string) => {
    await go(p.page, '/profile', 300);
    const t0 = Date.now();
    await p.page.evaluate((to) => {
      history.pushState({}, '', to);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, path);
    const ok = await p.page.waitForSelector(ready, { timeout: 90000 }).then(() => true, () => false);
    const shown = Date.now() - t0;
    await sleep(400);
    const info = await p.page.evaluate((sel) => {
      const calls = (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter((e) => e.name.includes('/api/'));
      const slow = calls.sort((a, b) => b.duration - a.duration)[0];
      return { nodes: document.querySelectorAll('*').length, rows: document.querySelectorAll(sel).length, api: slow ? `${Math.round(slow.duration)} ms for ${new URL(slow.name).pathname.replace(/[0-9a-f-]{36}/, '…')} (${Math.round(slow.transferSize / 1024)} KB)` : 'n/a' };
    }, ready);
    await p.page.evaluate(() => performance.clearResourceTimings());
    say('big', `${label}: ${ok ? `shown after ${shown} ms` : 'not shown within 90 s'}; ${info.rows} rows drawn, ${info.nodes} elements on the page; slowest request ${info.api}`);
  };
  await timed('a board with 20,000 tasks', `/b/${d.boards.csBoard}`, '.card');
  await timed('the customer list with 2,000 customers', '/accounts', '.acard, .accounts-table tbody tr');
  await go(p.page, '/home', 500);
  const typed: number[] = [];
  for (const word of ['yük', 'velto', 'harbor']) {
    await p.page.keyboard.down('Control');
    await p.page.keyboard.press('k');
    await p.page.keyboard.up('Control');
    await p.page.waitForSelector('.palette-input', { timeout: 5000 }).catch(() => undefined);
    const t0 = Date.now();
    await p.page.keyboard.type(word);
    const ok = await p.page.waitForFunction((w) => [...document.querySelectorAll('.palette-list [role="option"]')].some((o) => o.textContent!.toLocaleLowerCase('tr-TR').includes(w)), { timeout: 15000, polling: 16 }, word).then(() => true, () => false);
    typed.push(ok ? Date.now() - t0 : Infinity);
    await p.page.keyboard.press('Escape');
    await sleep(300);
  }
  say('big', `Ctrl K, from the last key to the first results: ${typed.map((t) => (Number.isFinite(t) ? `${t} ms` : 'none')).join(', ')}`);
  await p.page.close();
}

front.close();
await s.browser.close();
process.exit(0);
