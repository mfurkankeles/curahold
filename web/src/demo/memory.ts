// In-memory stand-ins for `location` and `history`. The demo build rewrites
// the app's `location.` and `history.pushState/replaceState` to these (see
// vite.demo.config.ts), so the app moves between screens exactly as it does
// on its real address, without touching the page that embeds it.
export const HOST = 'demo.curahold.com';
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

// The steps taken, like a browser tab keeps them: "back" has somewhere to go
// even though the page that embeds the demo never changes its address.
const stack: { url: string; state: unknown }[] = [{ url: '/', state: null }];
let pos = 0;

/** Moves to `to` without telling anyone; the router announces it. */
export function setCurrent(to: string) {
  const u = new URL(to, ORIGIN + path + search);
  if (u.origin !== ORIGIN) return;
  path = u.pathname;
  search = u.search;
  hash = u.hash;
  stack[pos].url = path + search + hash;
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
  get state() {
    return stack[pos].state;
  },
  get length() {
    return stack.length;
  },
  pushState(state: unknown, _title: string, url?: string | URL | null) {
    pos += 1;
    stack.length = pos;
    stack[pos] = { url: path + search + hash, state };
    if (url != null) setCurrent(String(url));
  },
  replaceState(state: unknown, _title: string, url?: string | URL | null) {
    stack[pos].state = state;
    if (url != null) setCurrent(String(url));
  },
  go(n = 0) {
    const to = pos + n;
    if (!n || to < 0 || to >= stack.length) return;
    pos = to;
    setCurrent(stack[pos].url);
    const state = stack[pos].state;
    // Like a browser: the move is announced after the caller has returned.
    setTimeout(() => window.dispatchEvent(new PopStateEvent('popstate', { state })), 0);
  },
  back() {
    memoryHistory.go(-1);
  },
  forward() {
    memoryHistory.go(1);
  },
};

const g = globalThis as unknown as Record<string, unknown>;
g.appLocation = memoryLocation;
g.appHistory = memoryHistory;
