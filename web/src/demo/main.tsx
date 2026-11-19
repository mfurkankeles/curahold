// Entry point of the try-it-now demo (see vite.demo.config.ts).
import './memory';
import '../stylesheets';
import './demo.css';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { setStartLocale, storeLocale, storedLocale } from '../lib/i18n';
import { LOCALE_INFO, LOCALES, translate, type Locale, type MessageKey } from '../../../shared/src/i18n';
import { SEED_LOCALES, seedWords, type SeedWords } from '../../../scripts/seed-words';
import { startTheme } from '../lib/theme';
import { DEMO_DEVICE, signIn, startServer, type DemoServer } from './server';
import { ORIGIN, current as currentPath, onFullNavigation, setCurrent } from './memory';

startTheme();
// The live channel needs a server to hold a WebSocket; the demo has none (its API runs in this tab),
// so the app keeps to its polling, which reaches the in-tab API like every other request.
try {
  localStorage.setItem('app_live_channel', 'off');
} catch {
  /* no storage: the channel tries, fails and falls back by itself */
}

/** Who the visitor can be: the demo company's people (their names are in its language), or a customer's person in the portal. */
const PEOPLE = [
  { key: 'ada', role: 'role.admin' },
  { key: 'mert', role: 'role.manager' },
  { key: 'zeynep', role: 'role.member' },
  { key: 'sofia', role: 'role.viewer' },
  { key: 'customer', role: 'demo.bar.customer' },
] as const satisfies readonly { key: string; role: MessageKey }[];
type Key = (typeof PEOPLE)[number]['key'];
/** How many ideas "What to try" holds (demo.idea.1 … in the dictionaries). */
const IDEAS = 20;

// One language for the whole demo: the sample data is written in the language the visitor reads
// (scripts/seed-words has a file for each language it can be written in). English first; any other
// by choice (the picker in the bar). The choice also travels in the address (#ja), because some
// places that show the demo give it storage that forgets, and so a link can be sent that opens in it.
const asDemo = (l: string | null | undefined): Locale | undefined => SEED_LOCALES.find((x) => x === l);
const asLocale = (l: string | null | undefined): Locale | undefined => LOCALES.find((x) => x === l);
const fromAddress = asDemo(decodeURIComponent(window.location.hash.slice(1)));
const demoLocale: Locale = fromAddress ?? asDemo(storedLocale()) ?? 'en';
/** The hub's own memory of the language (web/src/demo/hub-lang.js), so the hub follows a switch made here. */
function keepDemoLocale(l: Locale) {
  storeLocale(l);
  try {
    localStorage.setItem('curahold_demo_lang', l);
  } catch {
    /* storage that forgets */
  }
}
if (fromAddress) keepDemoLocale(fromAddress);
setStartLocale(demoLocale);
// The bar speaks the page's language: the demo's, or whichever the app's own menu picked since
// (it follows <html lang> as the app switches it; no reload needed).
const lang = (): Locale => asLocale(document.documentElement.lang) ?? asLocale(storedLocale()) ?? demoLocale;
const say = (key: MessageKey, vars?: Record<string, string>) => translate(lang(), key, vars);
/** The demo hub in the demo's language: the page with every guided tour, one level up. */
const HUB = demoLocale === 'en' ? '../' : `../${demoLocale}/`;

/** Another language: the sample data is written again in it, so the demo starts over. */
function switchLanguage(to: Locale) {
  if (to === demoLocale) return;
  keepDemoLocale(to);
  window.location.hash = to;
  window.location.reload();
}

const bootEl = document.getElementById('boot')!;
// The page itself is written in English; a visitor who chose another language gets the opening screen in it too.
document.documentElement.lang = demoLocale;
document.documentElement.dir = LOCALE_INFO[demoLocale].dir;
document.getElementById('boot-title')!.textContent = translate(demoLocale, 'demo.bar.opening');
document.getElementById('boot-step')!.textContent = translate(demoLocale, 'demo.bar.step.db');
function step(pct: number, key: 'db' | 'schema' | 'data' | 'app') {
  document.getElementById('boot-step')!.textContent = translate(demoLocale, `demo.bar.step.${key}`);
  (document.getElementById('boot-bar') as HTMLElement).style.width = `${pct}%`;
}

function DemoBar({ current, onSwitch, problem, words }: { current: Key; onSwitch: (k: Key) => void; problem: string | null; words: SeedWords }) {
  const [, setTick] = useState(0);
  const [open, setOpen] = useState(false);
  // On a phone the strip has room for a short label: the given name and the role, not the full name.
  const [narrow, setNarrow] = useState(() => matchMedia('(max-width: 760px)').matches);
  useEffect(() => {
    const q = matchMedia('(max-width: 760px)');
    const on = () => setNarrow(q.matches);
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  useEffect(() => {
    const on = () => setTick((n) => n + 1);
    window.addEventListener('app:navigate', on);
    window.addEventListener('storage', on);
    // The app's own language menu changes <html lang>; the bar follows at once.
    const seen = new MutationObserver(on);
    seen.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    return () => {
      seen.disconnect();
      window.removeEventListener('app:navigate', on);
      window.removeEventListener('storage', on);
    };
  }, []);
  const l = lang();
  const company = words.text.Quillfield ?? 'Quillfield';
  const nameOf = (k: Key) => (k === 'customer' ? words.fullName(words.customer.first, words.customer.last) : words.people[k]);
  // "Ada Demir" → "Ada"; "佐藤 彩" → "佐藤" (Japanese and Chinese say the family name first, and use it).
  const shortOf = (k: Key) => nameOf(k).split(' ')[0];
  return (
    <div className="demobar" lang={l} dir={LOCALE_INFO[l].dir}>
      <span className="demobar__tag">{say('demo.bar.tag')}</span>
      <span className="demobar__note">{say('demo.bar.note')}</span>
      <label className="demobar__as demobar__who">
        <span>{say('demo.bar.as')}</span>
        <select value={current} onChange={(e) => onSwitch(e.target.value as Key)}>
          {PEOPLE.map((p) => (
            <option key={p.key} value={p.key}>
              {narrow ? shortOf(p.key) : nameOf(p.key)} · {say(p.role, { company })}
            </option>
          ))}
        </select>
      </label>
      <label className="demobar__as demobar__lang">
        <span className="demobar__sr">{say('demo.bar.language')}</span>
        {/* On a phone the language is a globe; the list it opens names every language in its own words. */}
        <svg className="demobar__globe" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5S9.6 5.9 12 3.5z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        </svg>
        <select value={demoLocale} onChange={(e) => switchLanguage(e.target.value as Locale)} aria-label={say('demo.bar.language')}>
          {SEED_LOCALES.map((x) => (
            <option key={x} value={x} lang={x}>
              {LOCALE_INFO[x].name}
            </option>
          ))}
        </select>
      </label>
      {/* The demo hub with every guided tour sits one level up (curahold.com/demo/ around /demo/app/). */}
      <a className="demobar__tours" href={HUB}>
        {say('demo.bar.tours')}
      </a>
      <div className="demobar__more">
        <button type="button" aria-expanded={open} aria-label={say('demo.bar.tries')} onClick={() => setOpen((o) => !o)}>
          <span className="demobar__long">{say('demo.bar.tries')}</span>
          <span className="demobar__short" aria-hidden="true">?</span>
        </button>
        {open && (
          <div className="demobar__ideas" role="dialog" aria-label={say('demo.bar.tries')}>
            <ul>
              {Array.from({ length: IDEAS }, (_, i) => (
                <li key={i}>{say(`demo.idea.${i + 1}` as MessageKey)}</li>
              ))}
            </ul>
            <button type="button" className="demobar__reset" onClick={() => window.location.reload()}>
              {say('demo.bar.reset')}
            </button>
          </div>
        )}
      </div>
      {problem && (
        <div className="demobar__problem" role="alert">
          <span>
            {say('demo.bar.stuck')} <small>({problem})</small>
          </span>
          <button type="button" onClick={() => window.location.reload()}>
            {say('demo.bar.reset')}
          </button>
        </div>
      )}
    </div>
  );
}

async function main() {
  const server: DemoServer = await startServer(step, demoLocale);
  const sessions: Partial<Record<Key, string>> = {};
  sessions.ada = await signIn(server, 'ada@demo.example');
  const { seedShowcase } = await import('../../../scripts/seed-showcase');
  await seedShowcase(server.call, server.db, demoLocale);
  const { seedPortal } = await import('./portal-seed');
  await seedPortal(server, demoLocale).catch((e) => console.warn('[demo] portal seed', e));
  // Any text of the seed this language does not say yet (the browser check reads it).
  const { untranslated } = await import('../../../scripts/seed-words');
  const { words } = await seedWords(demoLocale);
  step(92, 'app');

  const [{ App }, { navigate }, { PortalApp }] = await Promise.all([import('../App'), import('../lib/router'), import('../../portal/Portal')]);
  await import('../../portal/portal.css');
  const root = createRoot(document.getElementById('root')!);
  let generation = 0;
  let current: Key = 'ada';
  // The customer sees the portal (its own small app); everyone else, Curahold.
  const render = () =>
    root.render(<StrictMode>{current === 'customer' ? <PortalApp key={generation} /> : <App key={generation} />}</StrictMode>);
  // A "page load": start the app afresh on the same in-tab database.
  const reload = (to: string) => {
    setCurrent(to);
    generation += 1;
    render();
  };
  // The demo has no inbox: whenever the app would show its sign-in page (after
  // "Sign out", or a session that ended), the person in the bar is signed in again.
  // If that does not help three times in a row, a notice with "Start over" says so,
  // with the reason: a sign-in page nobody can use is never the last word here.
  let tries: number[] = [];
  let inFlight: Promise<boolean> | null = null;
  let problem: string | null = null;
  const signedOutPage = (to: string) => /^\/(login|auth\/verify)(?:[/?#]|$)/.test(to);
  function signBackIn(): Promise<boolean> {
    if (current === 'customer') return Promise.resolve(false);
    if (inFlight) return inFlight;
    const now = Date.now();
    tries = tries.filter((t) => now - t < 20000);
    if (tries.length >= 3) {
      problem = server.denied.last ?? 'sign-in';
      drawBar();
      return Promise.resolve(false);
    }
    tries.push(now);
    inFlight = (async () => {
      sessions[current] = await signIn(server, `${current}@demo.example`);
      server.jar.set('app_session', sessions[current]!);
      reload('/home');
      return true;
    })()
      .catch((e) => {
        problem = e instanceof Error ? e.message.slice(0, 80) : 'sign-in';
        drawBar();
        return false;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }
  window.addEventListener('app:navigate', () => {
    if (signedOutPage(currentPath())) void signBackIn();
  });
  onFullNavigation(async (to) => {
    if (signedOutPage(to) && (await signBackIn())) return;
    if (!to.startsWith('/api/')) return reload(to);
    // Server routes that answer with a redirect (connecting the demo CRM, say).
    const res = await server.request(to, { headers: { 'x-curahold-device': DEMO_DEVICE } });
    const next = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && next) {
      const u = new URL(next, ORIGIN);
      if (u.origin === ORIGIN) reload(u.pathname + u.search + u.hash);
    }
  });
  // Links inside the app that it does not handle itself stay inside the demo.
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const a = (e.target as Element | null)?.closest?.('a');
    const href = a?.getAttribute('href');
    if (!a || !href || !href.startsWith('/') || a.target === '_blank') return;
    e.preventDefault();
    if (href.startsWith('/api/')) memoryNav(href);
    else navigate(href);
  });
  const memoryNav = (href: string) => (globalThis as any).appLocation.assign(href);

  const bar = createRoot(document.getElementById('demobar')!);
  const drawBar = () => bar.render(<DemoBar current={current} onSwitch={switchTo} problem={problem} words={words} />);
  async function switchTo(k: Key) {
    if (k === 'customer') {
      await server.portalSignIn('selin@quillfield.example').catch(() => undefined);
      current = k;
      drawBar();
      reload('/');
      return;
    }
    // A fresh sign-in each time: a session ended by "Sign out" is never reused.
    sessions[k] = await signIn(server, `${k}@demo.example`);
    server.jar.set('app_session', sessions[k]!);
    try {
      sessionStorage.removeItem('app-preview-as');
    } catch {
      /* no storage */
    }
    current = k;
    problem = null;
    tries = [];
    drawBar();
    reload('/home');
  }

  setCurrent('/home');
  render();
  drawBar();
  step(100, 'app');
  setTimeout(() => bootEl.remove(), 250);

  // Moving between screens for a tour: the portal keeps its own little router.
  const go = (to: string) => {
    if (current !== 'customer') return navigate(to);
    (globalThis as any).appHistory.pushState(null, '', to);
    window.dispatchEvent(new Event('app:portal-nav'));
  };
  const { tourById, SIGNUP_URL } = await import('../../../shared/src/tours');
  const play = async (id: string) => {
    const tour = tourById(id);
    if (!tour) return false;
    const as = tour.as ?? 'ada';
    if (as !== current) await switchTo(as);
    const { playTour } = await import('./tour');
    playTour(tour, { lang: demoLocale, go, startFree: SIGNUP_URL, hub: HUB });
    return true;
  };
  // For the browser checks of every tour (tests/e2e/tours.ts), and nothing else.
  (globalThis as any).__demo = { play, navigate: go, who: () => current, as: switchTo, reset: () => reload(current === 'customer' ? '/' : '/home'), untranslated: () => [...untranslated] };
  // curahold.com/demo/app/?tour=renewals — a tour from the demo hub.
  const asked = new URLSearchParams(window.location.search).get('tour');
  if (asked) setTimeout(() => void play(asked), 350);
}

// A link that ends in #docs (or #docs-tr) opens the documentation that travels with the demo,
// so the developer guide can be sent to someone on its own.
const docsAt = /^#docs(?:-([a-zA-Z-]+))?$/.exec(window.location.hash);
if (docsAt) window.location.replace(docsAt[1] ? `docs/${docsAt[1]}/index.html` : 'docs/index.html');

(docsAt ? Promise.resolve() : main()).catch((err) => {
  console.error('[curahold demo]', err);
  bootEl.classList.add('failed');
  document.getElementById('boot-step')!.textContent = `${translate(demoLocale, 'demo.bar.failed')} (${err instanceof Error ? err.message.slice(0, 160) : 'error'})`;
});
