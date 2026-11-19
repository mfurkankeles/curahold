// Takes the help centre's pictures from the live demo: real screens of the
// product, in each language the demo company is written in, with its invented
// data. Run after `npm run build:demo`; the pictures are kept in the repository
// (docs/site/<lang>/img/*.webp) so the docs build needs no browser.
//
//   npx tsx scripts/docs/shots.ts [lang …]     (default: every demo language)
//
// The demo hub uses two of them (customers, customer-phone) as its hero.
// ONLY=name,name takes just those pictures (ONLY=setup- takes every picture whose name starts so).
//
// A picture of a step ("click this") sets `mark`: the element is ringed and
// numbered on the picture itself, so a guide can say one action per step and
// show exactly where it is. The ring is drawn on top of the page, never in it.
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import puppeteer from 'puppeteer-core';
import { SEED_LOCALES } from '../seed-words';
import type { Locale } from '../../shared/src/i18n/core';

const ROOT = join(import.meta.dirname, '..', '..');
const DEMO = join(ROOT, 'dist', 'demo');
const PORT = Number(process.env.SHOTS_PORT ?? 10045);
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };

/** One picture: where to go, what to do there, what must be on screen, and its size. */
interface Shot {
  name: string;
  /** Run in the page first (the demo's own helpers: globalThis.__demo). */
  go: string;
  /** Must be on screen before the picture is taken: no skeletons, no empty boxes. */
  ready: string;
  width: number;
  height: number;
  /** The element the step is about (a CSS selector; "a, b" takes the first that exists): ringed and numbered on the picture. */
  mark?: string;
  /** The number on the ring (default 1). */
  n?: number;
}
const go = (path: string) => `__demo.navigate('${path}')`;
/** Setup health and "Test your setup" (docs/site/<lang>/setup-health.md): one picture per step. */
const SETUP: Shot[] = [
  { name: 'setup-nav', go: go('/home'), ready: '[data-tour="setup-badge"]', mark: '.navlink:has([data-tour="setup-badge"])', n: 1 },
  { name: 'setup-first', go: go('/setup-health'), ready: '.sh-item', mark: '[data-tour="setup-first"]', n: 2 },
  { name: 'setup-fix', go: go('/setup-health'), ready: '.sh-item', mark: '[data-tour="setup-fix"]', n: 3 },
  { name: 'setup-recheck', go: go('/setup-health'), ready: '.sh-item', mark: '[data-tour="setup-recheck"]', n: 4 },
  { name: 'setup-warning', go: go('/settings/sources'), ready: '.sh-warn', mark: '.sh-warn', n: 5 },
  { name: 'setup-test-link', go: go('/setup-health'), ready: '.sh-item', mark: '[data-tour="setup-test-link"]', n: 1 },
  { name: 'setup-test-run', go: go('/setup-test'), ready: '.sh-step', mark: '[data-tour="setup-run"]', n: 2 },
  { name: 'setup-test-evidence', go: go('/setup-test'), ready: '.sh-evidence', mark: '.sh-step[data-status="pass"] .sh-evidence', n: 3 },
  { name: 'setup-test-issue', go: go('/setup-test'), ready: '.sh-issue', mark: '[data-tour="setup-issue"] .sh-step__body', n: 4 },
  { name: 'setup-test-bundles', go: go('/setup-test'), ready: '.sh-bundle', mark: '[data-tour="setup-bundles"]', n: 5 },
  { name: 'setup-test-gate', go: go('/setup-test'), ready: '.sh-gate', mark: '[data-tour="setup-gate"]', n: 6 },
].map((x) => ({ ...x, width: 1280, height: 800 }));
/** The first board link under a department's heading in the menu, as JS that leaves its address in `href`. */
const boardOf = (dept: string) =>
  `let a = document.querySelector('.sidebar .navdept[data-dept="${dept}"]'); while (a && !(a.matches && a.matches('a.navlink--board'))) a = a.nextElementSibling; const href = a.getAttribute('href')`;
/**
 * The demo's two customers of the flow guide, found by what they have (their names are the demo
 * language's own): the one whose won deal waits on its hand-over card, and the one with shipped work
 * still to tell them about.
 */
const json = `const get = async (u) => (await fetch(u)).json()`;
const cedar = `${json}; const h = (await get('/api/handovers')).handovers[0]; __demo.navigate('/accounts/' + h.accountId)`;
const quill = `${json}; for (const a of (await get('/api/accounts?limit=100')).accounts) { const f = await get('/api/accounts/' + a.id + '/flow'); if (f.work.some((w) => w.done && !w.toldAt)) { __demo.navigate('/accounts/' + a.id); break; } }`;
const customer = (who: 'Cedarmoor' | 'Quillfield') => (who === 'Cedarmoor' ? cedar : quill);
/** An export from another tool, dropped on the import page (read in the tab, as a real file would be). */
const dropFile = `await wait('[data-tour="import-drop"] input'); const csv = ['ID,Title,List,Status,Assignee,Due date,Priority,Customer,Parent ID,Comments,Story points', '1,Kick-off call,Onboarding,To do,,2026-12-01,High,Cedarmoor Health,,,', '2,Import their users,Onboarding,In progress,,,Medium,Cedarmoor Health,,,3', '3,Fix the login bug,Bugs,To do,,,High,,,,2', '4,Prepare the renewal,Renewals,To do,,,Medium,Quillfield Retail,,,', '5,Send the agenda,Onboarding,To do,,,,,1,Ask about single sign-on,', '6,Check the invoice,Billing,To do,,31/13/2026,,,,,'].join(String.fromCharCode(10)); const inp = document.querySelector('[data-tour="import-drop"] input'); const dt = new DataTransfer(); dt.items.add(new File([csv], 'old-tool-export.csv', { type: 'text/csv' })); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true })); await wait('.wizard-steps')`;
const pause = (ms: number) => `await new Promise((r) => setTimeout(r, ${ms}))`;
const next = `document.querySelector('.dialog .btn--primary').click(); ${pause(1500)}`;
/**
 * The guides written for the features of 16–19 November (docs-completeness audit):
 * departments, hand-over and requests, moving in, the team's weeks, CuraAI's AI
 * answers, the BI feed and the accounting programs. One picture per step.
 */
const GUIDES: Shot[] = [
  // departments.md
  { name: 'dept-open', go: go('/settings/departments'), ready: '.dept-sheet', mark: 'a[href="/settings/departments"]', n: 1 },
  { name: 'dept-plan', go: go('/settings/departments'), ready: '.dept-sheet', mark: '.dept-sheet[data-dept="onboarding"] .dept-sheet__head', n: 2 },
  { name: 'dept-leads', go: go('/settings/departments'), ready: '.dept-sheet', mark: '.dept-sheet[data-dept="success"] .dept-sheet__people > .field:first-child', n: 3 },
  { name: 'dept-members', go: go('/settings/departments'), ready: '.dept-sheet', mark: '.dept-sheet[data-dept="success"] .dept-sheet__people > .field:nth-child(2)', n: 4 },
  { name: 'dept-band', go: go('/settings/departments'), ready: '.dept-sheet', mark: '.dept-sheet[data-dept="finance"] .dept-sheet__band', n: 5 },
  { name: 'dept-menu', go: go('/home'), ready: '.sidebar .navdept', mark: '.sidebar .navdept[data-dept="success"]', n: 1 },
  { name: 'dept-newboard', go: `${go('/home')}; await wait('.sidebar__add'); document.querySelector('.sidebar__add').click()`, ready: '.dialog select', mark: '.dialog .field:has(select)', n: 2 },
  { name: 'dept-ask', go: `${go('/home')}; await wait('.sidebar .navdept'); ${boardOf('success')}; __demo.navigate(href); await wait('.board .card'); document.querySelector('.board .card').click()`, ready: '.panel [data-tour="dept-ask"]', mark: '.panel [data-tour="dept-ask"]', n: 3 },
  { name: 'dept-customer', go: customer('Cedarmoor'), ready: '.acc-depts', mark: '.acc-depts', n: 1 },
  { name: 'dept-owners', go: `${customer('Cedarmoor')}; await wait('.flow-team')`, ready: '.flow-team', mark: '.flow-team', n: 2 },
  // handover-and-requests.md
  { name: 'flow-card', go: customer('Cedarmoor'), ready: '.flow-handover', mark: '.flow-handover__head', n: 1 },
  { name: 'flow-owner', go: customer('Cedarmoor'), ready: '.flow-handover [data-tour="flow-owner"]', mark: '.flow-handover [data-tour="flow-owner"]', n: 2 },
  {
    name: 'flow-confirm',
    go: `${customer('Cedarmoor')}; await wait('[data-tour="flow-owner"] select'); const s = document.querySelector('[data-tour="flow-owner"] select'); const o = [...s.options].find((x) => x.value); if (o) { s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); }`,
    ready: '.flow-handover__foot .btn--primary',
    mark: '.flow-handover__foot .btn--primary',
    n: 3,
  },
  { name: 'flow-link', go: `${customer('Quillfield')}; await wait('.flow-waiting')`, ready: '.flow-waiting button.btn', mark: '.flow-waiting button.btn', n: 1 },
  { name: 'flow-demand', go: `${go('/home')}; await wait('.sidebar .navdept'); ${boardOf('product')}; __demo.navigate(href + '?view=backlog')`, ready: '.pm-demand', mark: '.pm-demand', n: 2 },
  { name: 'flow-renewing', go: `${go('/home')}; await wait('.sidebar .navdept'); ${boardOf('product')}; __demo.navigate(href + '?view=backlog')`, ready: '.pm-ready', mark: '.pm-ready', n: 3 },
  { name: 'flow-told', go: `${customer('Quillfield')}; await wait('.flow-loop')`, ready: '.flow-loop__actions', mark: '.flow-loop__actions .btn--primary', n: 1 },
  { name: 'flow-settings', go: `${go('/settings/automations')}; await wait('.flow-settings')`, ready: '.flow-settings', mark: '.flow-settings', n: 1 },
  // moving-in.md
  { name: 'imp-drop', go: go('/import'), ready: '[data-tour="import-drop"]', mark: '[data-tour="import-drop"]', n: 1 },
  { name: 'imp-columns', go: `${go('/import')}; ${dropFile}; ${pause(500)}`, ready: '.dialog .btn--primary', mark: '.dialog .btn--primary', n: 2 },
  { name: 'imp-boards', go: `${go('/import')}; ${dropFile}; ${pause(500)}; ${next}`, ready: '.dialog .seg', mark: '.dialog .seg', n: 3 },
  { name: 'imp-check', go: `${go('/import')}; ${dropFile}; ${pause(500)}; ${next}; ${next}; ${pause(1000)}`, ready: '.adopt-plan', mark: '.dialog .btn--primary', n: 4 },
  { name: 'imp-undo', go: `${go('/import')}; ${dropFile}; ${pause(500)}; ${next}; ${next}; ${pause(1000)}; ${next}; ${pause(2500)}`, ready: '.import-result', mark: '.import-result ~ .inline-actions .btn:not(.btn--primary), .importer .inline-actions .btn:not(.btn--primary)', n: 5 },
  // team-load.md
  { name: 'team-weeks', go: go('/team?view=weeks'), ready: '.weeks', mark: '[data-tour="team-weeks"]', n: 1 },
  { name: 'team-cell', go: go('/team?view=weeks'), ready: '.weeks', mark: '.weeks tbody tr:first-child td:nth-child(3) .weeks__box, .weeks tbody tr:first-child .weeks__box', n: 2 },
  { name: 'team-customers', go: go('/team?view=customers'), ready: '.portfolio', mark: '.portfolio thead', n: 1 },
  { name: 'team-cost', go: go('/reports/all'), ready: 'a.rcard[href*="cost_to_serve"]', mark: 'a.rcard[href*="cost_to_serve"]', n: 1 },
  // automations.md
  { name: 'auto-new', go: go('/settings/automations'), ready: '.admin__content .btn--primary', mark: '.admin__content .btn--primary', n: 1 },
  { name: 'auto-presets', go: `${go('/settings/automations')}; await wait('.admin__content .btn--primary'); document.querySelector('.admin__content .btn--primary').click()`, ready: '.preset-list', mark: '.preset-list', n: 2 },
  { name: 'auto-rule', go: `${go('/settings/automations')}; await wait('.admin__content .btn--primary'); document.querySelector('.admin__content .btn--primary').click(); await wait('.preset-list .preset'); document.querySelector('.preset-list .preset').click()`, ready: '.rule-editor .clause', mark: '.rule-editor .clause', n: 3 },
  { name: 'auto-save', go: `${go('/settings/automations')}; await wait('.admin__content .btn--primary'); document.querySelector('.admin__content .btn--primary').click(); await wait('.preset-list .preset'); document.querySelector('.preset-list .preset').click()`, ready: '.rule-editor', mark: '.dialog .btn--primary', n: 4 },
  // getting-help.md
  { name: 'ai-open', go: go('/home'), ready: '.navlink--ask', mark: '.navlink--ask', n: 1 },
  { name: 'ai-settings', go: go('/settings/support'), ready: '[data-tour="ai-settings"]', mark: '[data-tour="ai-settings"]', n: 1 },
  { name: 'ai-switch', go: go('/settings/support'), ready: '[data-tour="ai-settings"] .checkbox', mark: '[data-tour="ai-settings"] .checkbox', n: 2 },
  // bi-tools.md
  { name: 'bi-new', go: go('/settings/analytics'), ready: '[data-tour="bi-new"]', mark: '[data-tour="bi-new"]', n: 2 },
  { name: 'bi-feed', go: go('/settings/analytics'), ready: '[data-tour="bi-feed"]', mark: '[data-tour="bi-feed"] .form', n: 3 },
  // accounting.md
  { name: 'fin-tiles', go: go('/settings/sources'), ready: '[data-tour="fin-finfile"]', mark: '[data-tour="fin-odoo"], [data-tour="fin-finfile"]', n: 2 },
].map((x) => ({ ...x, width: 1280, height: 800 }));
const SHOTS: Shot[] = [
  { name: 'customers', go: `__demo.navigate('/accounts')`, ready: '.acard', width: 1280, height: 800 },
  { name: 'customer-phone', go: `__demo.navigate('/accounts'); await wait('.acard__name'); document.querySelector('.acard__name').click()`, ready: '.acc-band', width: 375, height: 667 },
  { name: 'customer', go: `__demo.navigate('/accounts'); await wait('.acard__name'); document.querySelector('.acard__name').click()`, ready: '.acc-band', width: 1280, height: 800 },
  { name: 'task', go: `document.querySelector('.navlink--board')?.click(); await wait('.board .card'); document.querySelector('.board .card').click()`, ready: '.panel', width: 1280, height: 800 },
  { name: 'home', go: `__demo.navigate('/home')`, ready: '.pane', width: 1280, height: 800 },
  { name: 'portal', go: `await __demo.as('customer')`, ready: '.p-list', width: 1280, height: 800 },
  ...SETUP,
  { name: 'setup-phone', go: go('/setup-health'), ready: '.sh-item', width: 390, height: 780 },
  // The onboarding plan guide (docs/site/<lang>/onboarding-hub.md): one picture per step, the click target marked.
  { name: 'ob-open', go: `__demo.navigate('/home')`, ready: '.sidebar a[href="/onboarding"]', mark: '.sidebar a[href="/onboarding"]', width: 1280, height: 800 },
  { name: 'ob-next', go: `__demo.navigate('/onboarding')`, ready: '[data-tour="ob-next"]', mark: '[data-tour="ob-next"] .btn--primary', width: 1280, height: 800 },
  { name: 'ob-step', go: `__demo.navigate('/onboarding'); await wait('.ob-step__row'); document.querySelector('.ob-step[data-status="doing"] .ob-step__row, .ob-step:not([data-status="done"]) .ob-step__row').click()`, ready: '.ob-step__body', mark: '.ob-step__body .ob-step__actions .btn', width: 1280, height: 800 },
  { name: 'ob-issues', go: `__demo.navigate('/onboarding')`, ready: '#issues .ob-issue', mark: '#issues .ob-issue[data-source="setup_test"] .btn, #issues .ob-issue .btn', width: 1280, height: 800 },
  { name: 'ob-mapping', go: `__demo.navigate('/onboarding')`, ready: '#mapping .ob-tick', mark: '#mapping tr[data-state="failing"] td:nth-child(3), #mapping .ob-tick', width: 1280, height: 800 },
  { name: 'ob-share', go: `__demo.navigate('/onboarding')`, ready: '.ob-top__tools', mark: '.ob-top__tools .btn:last-child', width: 1280, height: 800 },
  { name: 'ob-plans', go: `__demo.navigate('/onboarding/plans')`, ready: '.ob-port__table', mark: '.ob-port__table tbody tr a', width: 1280, height: 800 },
  { name: 'ob-phone', go: `__demo.navigate('/onboarding')`, ready: '[data-tour="ob-next"]', mark: '[data-tour="ob-next"] .btn--primary', width: 375, height: 667 },
  ...GUIDES,
];

/** Rings the element and puts its number beside it (inline-start, so it follows right-to-left too). */
const ring = (sel: string, n: number) => `(() => {
  const el = ${JSON.stringify(sel)}.split(',').map((x) => document.querySelector(x.trim())).find(Boolean);
  if (!el) throw new Error('no mark ' + ${JSON.stringify(sel)});
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

const server = createServer((req, res) => {
  try {
    let f = normalize(join(DEMO, decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)));
    if (!f.startsWith(DEMO)) throw new Error('outside');
    if (statSync(f).isDirectory()) f = join(f, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
    res.end(readFileSync(f));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise<void>((r) => server.listen(PORT, '127.0.0.1', () => r()));
const langs = (process.argv.slice(2).length ? process.argv.slice(2) : SEED_LOCALES) as Locale[];
const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none'] });
let failed = 0;
try {
  for (const l of langs) {
    const out = join(ROOT, 'docs', 'site', l, 'img');
    mkdirSync(out, { recursive: true });
    const only = process.env.ONLY?.split(',');
    for (const shot of SHOTS.filter((x) => !only || only.some((o) => (o.endsWith('-') ? x.name.startsWith(o) : x.name === o)))) {
      // A fresh tab for each picture, so one screen's state never leaks into the next.
      const page = await browser.newPage();
      await page.evaluateOnNewDocument(() => {
        try {
          localStorage.setItem('app_theme', 'light');
        } catch {
          /* no storage */
        }
      });
      await page.setViewport({ width: shot.width, height: shot.height, deviceScaleFactor: shot.width < 600 ? 2 : 1, isMobile: shot.width < 600, hasTouch: shot.width < 600 });
      await page.goto(`http://127.0.0.1:${PORT}/index.html#${l}`);
      await page.waitForFunction(() => !document.getElementById('boot') && (globalThis as any).__demo, { timeout: 120000 });
      try {
        await page.evaluate(`(async () => { const wait = (s) => new Promise((ok, no) => { const t0 = Date.now(); const f = () => document.querySelector(s) ? ok() : Date.now() - t0 > 15000 ? no(new Error('no ' + s)) : setTimeout(f, 100); f(); }); ${shot.go}; })()`);
        await page.waitForSelector(shot.ready, { visible: true, timeout: 20000 });
        // Past the 300 ms skeleton rule and any entrance motion: only finished screens.
        await page.waitForFunction(() => !document.querySelector('.skeleton, [aria-busy="true"]'), { timeout: 10000 }).catch(() => undefined);
        await new Promise((r) => setTimeout(r, 900));
        // The demo bar is the demo's, not the product's: it stays out of the picture.
        await page.addStyleTag({ content: '.demobar{display:none!important}#root{height:100%!important}' });
        await new Promise((r) => setTimeout(r, 300));
        if (shot.mark) {
          await page.evaluate(ring(shot.mark, shot.n ?? 1));
          await new Promise((r) => setTimeout(r, 150));
        }
        await page.screenshot({ path: join(out, `${shot.name}.webp`) as `${string}.webp`, type: 'webp', quality: 72 });
        console.log(`${l} ${shot.name}`);
      } catch (e) {
        failed++;
        console.error(`${l} ${shot.name}: ${(e as Error).message}`);
      }
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
