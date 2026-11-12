// A small router on the History API — the app has few screens and they all
// live in the URL, so a shared link opens the same board and task.
import { useEffect, useState } from 'react';

// ---- the trail --------------------------------------------------------------
// Where this tab has been inside the app, in order. It lets every screen that
// was reached by following something on another screen offer the way back,
// also where the browser has no back button of its own (an installed app, a
// demo embedded in someone else's page). Choosing from the main menu starts a
// fresh visit: a screen reached that way offers no way back.

interface Step {
  url: string;
  fresh: boolean;
}

const here = () => location.pathname + location.search;
const KEY = 'app_trail';

let trail: Step[] = [{ url: here(), fresh: true }];
let at = 0;

// A reload keeps the browser's history, so it keeps the trail too.
try {
  const i = (history.state as { i?: unknown } | null)?.i;
  const kept = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as { trail: Step[] } | null;
  if (typeof i === 'number' && kept?.trail?.[i]?.url === here()) {
    trail = kept.trail;
    at = i;
  }
} catch {
  /* a tab that cannot keep it starts a new trail */
}

function keep() {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ trail: trail.slice(0, 200) }));
  } catch {
    /* per-tab convenience */
  }
}

/** The screen a URL shows, leaving out what only opens a panel over it or filters it. */
export function screenOf(url: string): string {
  const [path, qs = ''] = url.split('#')[0].split('?');
  const p = new URLSearchParams(qs);
  if (path === '/accounts' && ['renewals', 'reviews', 'products'].includes(p.get('view') ?? '')) return `${path}?view=${p.get('view')}`;
  if (path === '/team' && p.get('person')) return `${path}?person=${p.get('person')}`;
  if (path.startsWith('/b/') && p.get('view') === 'archive') return `${path}?view=archive`;
  return path;
}

/** What is open over the screen: a task or a record, or nothing. */
export function panelOf(url: string): string | null {
  const p = new URLSearchParams(url.split('#')[0].split('?')[1] ?? '');
  return p.get('task') ? `task:${p.get('task')}` : p.get('record') ? `record:${p.get('record')}` : null;
}

function announce() {
  window.dispatchEvent(new Event('app:navigate'));
}

// The address can change without a new step (a tidy-up of the query, a sign-in landing).
function sync() {
  if (trail[at].url !== here()) trail[at] = { ...trail[at], url: here() };
}

export function navigate(to: string, replace = false, fresh = false) {
  if (to === here()) return;
  sync();
  if (replace) {
    history.replaceState({ i: at }, '', to);
    trail[at] = { url: to, fresh: trail[at]?.fresh ?? false };
  } else {
    at += 1;
    trail.length = at;
    trail[at] = { url: to, fresh };
    history.pushState({ i: at }, '', to);
  }
  keep();
  announce();
}

/** From the main menu: the visit starts here, there is nothing to go back to. */
export function navigateFresh(to: string) {
  sync();
  if (to === here()) {
    if (!trail[at].fresh) {
      trail[at] = { url: to, fresh: true };
      keep();
      announce();
    }
    return;
  }
  navigate(to, false, true);
}

// The browser's own back and forward: find where in the trail that lands.
function onPop() {
  const i = (history.state as { i?: unknown } | null)?.i;
  const url = here();
  if (typeof i === 'number' && trail[i]) {
    at = i;
    trail[at] = { ...trail[at], url };
  } else if (trail[at - 1]?.url === url) at -= 1;
  else if (trail[at + 1]?.url === url) at += 1;
  else {
    trail = [{ url, fresh: true }];
    at = 0;
  }
  keep();
}
window.addEventListener('popstate', onPop);

export interface WayBack {
  /** The address back leads to. */
  url: string;
  go: () => void;
}

/**
 * The way back from the screen on show: the last different screen of this
 * visit. Null when the visit began here (opened by a link, or chosen from the
 * main menu).
 */
export function screenBack(): WayBack | null {
  sync();
  const cur = screenOf(trail[at].url);
  for (let j = at; j > 0; j--) {
    if (trail[j].fresh) return null;
    if (screenOf(trail[j - 1].url) !== cur) {
      const steps = at - (j - 1);
      return { url: trail[j - 1].url, go: () => history.go(-steps) };
    }
  }
  return null;
}

/**
 * The way back inside a panel: the task or record that was open over this
 * same screen just before the one on show.
 */
export function panelBack(): (WayBack & { was: string }) | null {
  sync();
  const prev = trail[at - 1];
  if (!prev || screenOf(prev.url) !== screenOf(trail[at].url)) return null;
  const was = panelOf(prev.url);
  const now = panelOf(trail[at].url);
  if (!was || !now || was === now) return null;
  return { url: prev.url, was, go: () => history.go(-1) };
}

// ---- names ------------------------------------------------------------------
// What a place is called, for the things only its own screen knows (a customer's
// name, a report's title). A screen says so once it has loaded.
const names = new Map<string, string>();
export function nameIt(key: string, name: string | null | undefined) {
  if (!name || names.get(key) === name) return;
  names.set(key, name);
  announce();
}
export const nameOf = (key: string) => names.get(key) ?? null;

export function useLocation() {
  const [loc, setLoc] = useState(() => ({ path: location.pathname, search: location.search, hash: location.hash, n: 0 }));
  useEffect(() => {
    const on = () => setLoc((l) => ({ path: location.pathname, search: location.search, hash: location.hash, n: l.n + 1 }));
    window.addEventListener('popstate', on);
    window.addEventListener('app:navigate', on);
    return () => {
      window.removeEventListener('popstate', on);
      window.removeEventListener('app:navigate', on);
    };
  }, []);
  return loc;
}

export function setQuery(key: string, value: string | null) {
  const p = new URLSearchParams(location.search);
  if (value === null) p.delete(key);
  else p.set(key, value);
  const qs = p.toString();
  navigate(location.pathname + (qs ? `?${qs}` : ''));
}

export function match(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split('/').filter(Boolean);
  const b = path.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const out: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) out[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return out;
}
