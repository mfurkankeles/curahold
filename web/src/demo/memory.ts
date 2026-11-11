// In-memory stand-ins for `location` and `history`. The demo build rewrites
// the app's `location.` and `history.pushState/replaceState` to these (see
// vite.demo.config.ts), so the app moves between screens exactly as it does
// on its real address, without touching the page that embeds it.
export const HOST = 'demo.tendwell.com';
export const ORIGIN = `https://${HOST}`;

let path = '/';
let search = '';
let hash = '';
let fullNavigation: (to: string) => void = () => undefined;

/** What a "real" page load (logout, entering a preview, a server redirect) should do. */
export function onFullNavigation(fn: (to: string) => void) {
  fullNavigation = fn;
}

export function current() {
  return path + search + hash;
}

/** Moves to `to` without telling anyone; the router announces it. */
export function setCurrent(to: string) {
  const u = new URL(to, ORIGIN + path + search);
  if (u.origin !== ORIGIN) return;
  path = u.pathname;
  search = u.search;
  hash = u.hash;
}

function go(to: string) {
  const u = new URL(to, ORIGIN + path + search);
  if (u.origin !== ORIGIN) {
    window.open(u.href, '_blank', 'noopener');
    return;
  }
  fullNavigation(u.pathname + u.search + u.hash);
}

export const memoryLocation = {
  get pathname() {
    return path;
  },
  get search() {
    return search;
  },
  get hash() {
    return hash;
  },
  set hash(v: string) {
    hash = v ? (v.startsWith('#') ? v : `#${v}`) : '';
  },
  host: HOST,
  hostname: HOST,
  origin: ORIGIN,
  protocol: 'https:',
  port: '',
  get href() {
    return ORIGIN + path + search + hash;
  },
  set href(v: string) {
    go(v);
  },
  assign: go,
  replace: go,
  reload() {
    fullNavigation(path + search + hash);
  },
  toString() {
    return ORIGIN + path + search + hash;
  },
};

export const memoryHistory = {
  pushState(_state: unknown, _title: string, url?: string | URL | null) {
    if (url != null) setCurrent(String(url));
  },
  replaceState(_state: unknown, _title: string, url?: string | URL | null) {
    if (url != null) setCurrent(String(url));
  },
};

const g = globalThis as unknown as Record<string, unknown>;
g.twLocation = memoryLocation;
g.twHistory = memoryHistory;
