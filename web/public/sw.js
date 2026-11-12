// Curahold's service worker: the app opens without a connection and shows
// what was last seen. It never answers from a copy while the network is
// there — pages and data come fresh first, the copy is only the fallback —
// and nothing is ever written from here: offline is for reading.
//
// What is kept: the app's own files, and the answers to a short list of
// read-only questions (my tasks, a board, a customer…). Signing out, or the
// server saying the session is over, throws the data away.

const VERSION = 'app-1';
const SHELL = `${VERSION}-shell`;
const DATA = `${VERSION}-data`;
const MAX_DATA = 160;

// Read-only answers worth having on a train. Not the pulse (it must be live),
// not files, exports, sign-in or settings.
const OFFLINE = [
  /^\/api\/me$/,
  /^\/api\/me\/start$/,
  /^\/api\/org$/,
  /^\/api\/people$/,
  /^\/api\/boards$/,
  /^\/api\/boards\/[^/]+\/tasks$/,
  /^\/api\/tasks$/,
  /^\/api\/tasks\/counts$/,
  /^\/api\/tasks\/[0-9a-f-]{36}$/,
  /^\/api\/accounts$/,
  /^\/api\/accounts\/[0-9a-f-]{36}$/,
  /^\/api\/accounts\/[0-9a-f-]{36}\/timeline$/,
  /^\/api\/record-types$/,
  /^\/api\/records$/,
  /^\/api\/notifications$/,
  /^\/api\/pages$/,
  /^\/api\/pages\/[^/]+\/data$/,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.add(new Request('/', { cache: 'reload' })))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'signed-out') event.waitUntil(caches.delete(DATA));
});

async function trim(cache) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_DATA))) await cache.delete(k);
}

// Fresh when there is a network; the last answer when there is not.
async function freshThenKept(request) {
  const cache = await caches.open(DATA);
  try {
    const res = await fetch(request);
    if (res.status === 200) {
      await cache.put(request, res.clone());
      void trim(cache);
    } else if (res.status === 401) {
      await caches.delete(DATA);
    }
    return res;
  } catch (err) {
    const kept = await cache.match(request);
    if (kept) return kept;
    throw err;
  }
}

// The app's own files have their content in their name: once fetched, always right.
async function keptThenFresh(request) {
  const cache = await caches.open(SHELL);
  const kept = await cache.match(request);
  if (kept) return kept;
  const res = await fetch(request);
  if (res.status === 200) await cache.put(request, res.clone());
  return res;
}

// Any page of the app is the same file; offline, the last copy of it.
async function page(request) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(request);
    if (res.status === 200 && (res.headers.get('content-type') || '').includes('text/html')) await cache.put('/', res.clone());
    return res;
  } catch (err) {
    const kept = await cache.match('/');
    if (kept) return kept;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;
  // The docs, sign-in for apps and the AI connector are not the app.
  if (path.startsWith('/docs') || path.startsWith('/mcp') || path.startsWith('/oauth') || path.startsWith('/.well-known') || path === '/llms.txt') return;
  if (path.startsWith('/api/')) {
    // "See it as them" answers are someone else's view: never kept, never served from a copy.
    if (request.headers.get('x-curahold-preview-as')) return;
    if (OFFLINE.some((re) => re.test(path))) event.respondWith(freshThenKept(request));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(page(request));
    return;
  }
  if (path.startsWith('/assets/') || path.startsWith('/icons/')) event.respondWith(keptThenFresh(request));
});
