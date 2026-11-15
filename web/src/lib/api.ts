// Thin fetch wrapper. Every call carries this device's id (the device limit
// and request-forgery check rely on it) and the chosen language.
import type { ApiError } from '../../../shared/src/model';
import { normalizeLocale, translate } from '../../../shared/src/i18n';
import { getDeviceId } from './device';
import { noteFailedRequest } from './diagnostics';

export class ApiFailure extends Error {
  constructor(
    public status: number,
    public body: ApiError,
  ) {
    super(body.message);
  }
  get code() {
    return this.body.error;
  }
}

let currentLocale = '';

// "See it as them": while an administrator previews someone, every request
// carries that person's id and the server answers as them, read only.
const PREVIEW = 'app-preview-as';
export function previewAs(): string | null {
  try {
    return sessionStorage.getItem(PREVIEW);
  } catch {
    return null;
  }
}
export function startPreview(userId: string, _name?: string) {
  try {
    sessionStorage.setItem(PREVIEW, userId);
  } catch {
    return;
  }
  location.href = '/home';
}
export function endPreview(to = '/settings/roles') {
  try {
    sessionStorage.removeItem(PREVIEW);
  } catch {
    /* private mode */
  }
  location.href = to;
}
export function setApiLocale(l: string) {
  currentLocale = l;
}

type Listener = (code: string) => void;
const authListeners = new Set<Listener>();
export function onAuthLost(fn: Listener) {
  authListeners.add(fn);
  return () => {
    authListeners.delete(fn);
  };
}

// Changes made while offline: held here, each with its key, until the connection is back.
const waiting = new Set<string>();
const waitingListeners = new Set<() => void>();
const tellWaiting = () => waitingListeners.forEach((f) => f());
/** How many changes are waiting for the connection (for OfflineBar). */
export const changesWaiting = () => waiting.size;
export function onChangesWaiting(f: () => void) {
  waitingListeners.add(f);
  return () => void waitingListeners.delete(f);
}
const online = () => new Promise<void>((r) => (navigator.onLine === false ? window.addEventListener('online', () => r(), { once: true }) : r()));
/** Holds a change until the connection is back, then sends it (the first moments online can still fail: tried a few times). */
async function afterReconnect(key: string, go: () => Promise<Response>): Promise<Response> {
  waiting.add(key);
  tellWaiting();
  try {
    for (let i = 0; ; i++) {
      await online();
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      try {
        return await go();
      } catch (e) {
        if (i >= 4 && navigator.onLine !== false) throw e;
      }
    }
  } finally {
    waiting.delete(key);
    tellWaiting();
  }
}

/**
 * A dangerous change (roles, keys, SSO…) answered "confirm it's you first"
 * (403 reauth_required): the confirmation dialog (components/Reauth.tsx)
 * asks, and on success the request is sent once more, so every such action
 * works without its screen knowing about it.
 */
let reauth: (() => Promise<boolean>) | null = null;
export function onReauth(fn: (() => Promise<boolean>) | null) {
  reauth = fn;
}

/** A key of its own for every change: sent again with a retry, so the server does the work once. */
const newKey = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

/** Changes on their way, by what they are: a second identical one (a double click) joins the first. */
const onTheWay = new Map<string, Promise<unknown>>();

export function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const change = method !== 'GET' && method !== 'HEAD';
  const same = change && !(body instanceof FormData) ? `${method} ${path} ${body === undefined ? '' : JSON.stringify(body)}` : null;
  const first = same ? onTheWay.get(same) : undefined;
  if (first) return first as Promise<T>;
  const sent = send<T>(method, path, body, change ? newKey() : null);
  if (same) {
    onTheWay.set(same, sent);
    const forget = () => void onTheWay.delete(same);
    sent.then(forget, forget);
  }
  return sent;
}

async function send<T>(method: string, path: string, body: unknown, key: string | null, again = false): Promise<T> {
  const headers: Record<string, string> = { 'x-curahold-device': getDeviceId() };
  if (currentLocale) headers['x-curahold-locale'] = currentLocale;
  if (key) headers['idempotency-key'] = key;
  const as = previewAs();
  if (as) headers['x-curahold-preview-as'] = as;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  inFlight++;
  if (quietTimer) clearTimeout(quietTimer);
  quietTimer = null;
  let asked: ApiFailure;
  try {
    return await sendCounted<T>(method, path, headers, payload, key);
  } catch (e) {
    if (again || !reauth || !(e instanceof ApiFailure) || e.status !== 403 || e.code !== 'reauth_required') throw e;
    asked = e;
  } finally {
    inFlight--;
    settle();
  }
  // "Confirm it's you first": the dialog asks (not counted as a request on its way, so
  // the page can still go quiet), and on success the change is sent once more.
  if (reauth && (await reauth())) return send<T>(method, path, body, key ? newKey() : null, true);
  throw asked;
}

async function sendCounted<T>(method: string, path: string, headers: Record<string, string>, payload: BodyInit | undefined, key: string | null): Promise<T> {
  let res: Response;
  try {
    res = await (early(method, path, headers) ?? fetch(`/api${path}`, { method, headers, body: payload, credentials: 'same-origin' }));
  } catch (first) {
    // The request, or its answer, was lost on the way. A change carries its key, so sending it once
    // more is safe: if the first copy did arrive, the server answers with what it did then.
    // Offline, a change waits in this tab until the connection is back, then goes (OfflineBar says so).
    try {
      if (!key) throw first;
      if (navigator.onLine === false) res = await afterReconnect(key, () => fetch(`/api${path}`, { method, headers, body: payload, credentials: 'same-origin' }));
      else {
        await new Promise((r) => setTimeout(r, 700));
        res = await fetch(`/api${path}`, { method, headers, body: payload, credentials: 'same-origin' });
      }
    } catch {
      noteFailedRequest(method, path, 0);
      // Said in words, so whatever shows the failure has something to show.
      const locale = normalizeLocale(currentLocale || document.documentElement.lang);
      throw new ApiFailure(0, { error: 'network', message: translate(locale, navigator.onLine === false ? 'errors.offline' : 'errors.network') });
    }
  }
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    if (!(res.status === 401 && path === '/me')) noteFailedRequest(method, path, res.status);
    const err = new ApiFailure(res.status, (data as ApiError) ?? { error: 'server', message: res.statusText });
    if (res.status === 401 && path !== '/me') authListeners.forEach((fn) => fn(err.code));
    throw err;
  }
  return data as T;
}

/**
 * The company and who is signed in, asked by index.html's first script while this
 * code was still downloading: taken once, and only if asked as this request would be
 * (the same device, no preview).
 */
function early(method: string, path: string, headers: Record<string, string>): Promise<Response> | null {
  const w = window as { __early?: Record<string, [string, string, Promise<Response>]> };
  const hit = method === 'GET' ? w.__early?.[path] : undefined;
  if (!hit) return null;
  // Only while the page is opening: an answer left unused is never handed out later as if fresh.
  if (performance.now() > 15_000) {
    w.__early = undefined;
    return null;
  }
  delete w.__early![path];
  const [device, locale, answer] = hit;
  return device === headers['x-curahold-device'] && locale === (headers['x-curahold-locale'] ?? '') && !headers['x-curahold-preview-as'] ? answer : null;
}

// Requests on their way: the rest of the language waits until the first screen's are in.
let inFlight = 0;
let quietWaiters: (() => void)[] = [];
let quietTimer: ReturnType<typeof setTimeout> | null = null;
function settle() {
  if (quietTimer) clearTimeout(quietTimer);
  quietTimer = inFlight ? null : setTimeout(() => {
    const ws = quietWaiters;
    quietWaiters = [];
    ws.forEach((f) => f());
  }, 150);
}
/** Runs `fn` once no request has been on its way for a moment (or after `maxMs` at the latest). */
export function afterQuiet(fn: () => void, maxMs = 4000) {
  let done = false;
  const once = () => void (done || ((done = true), fn()));
  quietWaiters.push(once);
  setTimeout(once, maxMs);
  if (!inFlight) settle();
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const get = <T = any>(p: string) => api<T>('GET', p);
export const post = <T = any>(p: string, b?: unknown) => api<T>('POST', p, b ?? {});
export const patch = <T = any>(p: string, b: unknown) => api<T>('PATCH', p, b);
export const del = <T = any>(p: string) => api<T>('DELETE', p);
export const put = <T = any>(p: string, b: unknown) => api<T>('PUT', p, b);
