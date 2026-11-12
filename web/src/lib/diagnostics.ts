// What a help request carries on its own, so support can act without a
// back-and-forth: the browser, the last few pages, errors on the page and
// requests that failed. It stays in this tab's memory, holds no page content
// or typed text, and the person sees all of it (and can drop any of it)
// before sending.
import type { HelpContext } from '../../../shared/src/help';

declare const __APP_VERSION__: string;
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
const KEEP = 10;

const errors: { at: string; message: string }[] = [];
const failed: { at: string; method: string; path: string; status: number }[] = [];
const pages: string[] = [];
const push = <T,>(list: T[], v: T) => {
  list.push(v);
  if (list.length > KEEP) list.shift();
};

/** Anything that could be a secret or an address out of a message. */
function scrub(s: string): string {
  return s
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/\b(ch[kar]_|Bearer\s+)[\w.-]+/g, '$1…')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '…')
    .slice(0, 300);
}

/** A path without its query values or fragment, and ids shortened. */
export function cleanPath(p: string): string {
  const [path, query] = p.split('#')[0].split('?');
  const keys = query ? new URLSearchParams(query) : null;
  const q = keys && [...keys.keys()].length ? `?${[...new Set(keys.keys())].join('&')}` : '';
  return (path + q).slice(0, 300);
}

let installed = false;
export function installDiagnostics() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const now = () => new Date().toISOString();
  window.addEventListener('error', (e) => push(errors, { at: now(), message: scrub(String(e.message || e.error || 'error')) }));
  window.addEventListener('unhandledrejection', (e) => push(errors, { at: now(), message: scrub(String((e.reason as any)?.message ?? e.reason ?? 'rejection')) }));
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    push(errors, { at: now(), message: scrub(args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : '')).join(' ').trim() || 'console.error') });
    original(...args);
  };
  const page = () => notePage(location.pathname + location.search);
  window.addEventListener('app:navigate', page);
  window.addEventListener('popstate', page);
  page();
}

export function noteFailedRequest(method: string, path: string, status: number) {
  push(failed, { at: new Date().toISOString(), method, path: cleanPath(path), status });
}

export function notePage(path: string) {
  const p = cleanPath(path);
  if (pages[pages.length - 1] !== p) push(pages, p);
}

function browserName(): string {
  const ua = navigator.userAgent;
  const m =
    /Edg\/(\d+)/.exec(ua) ? `Edge ${/Edg\/(\d+)/.exec(ua)![1]}` :
    /Firefox\/(\d+)/.exec(ua) ? `Firefox ${/Firefox\/(\d+)/.exec(ua)![1]}` :
    /Chrome\/(\d+)/.exec(ua) ? `Chrome ${/Chrome\/(\d+)/.exec(ua)![1]}` :
    /Version\/(\d+).*Safari/.exec(ua) ? `Safari ${/Version\/(\d+)/.exec(ua)![1]}` : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? (/(iPhone|iPad)/.test(ua) ? 'iOS' : 'macOS') : /Android/.test(ua) ? 'Android' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${m} · ${os}` : m;
}

/** Everything the app would add, grouped the way the form shows it. */
export function collectContext(refs?: HelpContext['refs']): Required<Pick<HelpContext, 'browser' | 'screen' | 'viewport' | 'version' | 'locale' | 'timezone' | 'at' | 'pages' | 'errors' | 'failed'>> & { refs?: HelpContext['refs'] } {
  return {
    browser: browserName(),
    screen: `${screen.width}×${screen.height}@${Math.round((devicePixelRatio || 1) * 100) / 100}x`,
    viewport: `${innerWidth}×${innerHeight}`,
    version: VERSION,
    locale: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    at: new Date().toISOString(),
    pages: [...pages],
    errors: [...errors],
    failed: [...failed],
    ...(refs && Object.keys(refs).length ? { refs } : {}),
  };
}
