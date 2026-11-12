// Thin fetch wrapper. Every call carries this device's id (the device limit
// and request-forgery check rely on it) and the chosen language.
import type { ApiError } from '../../../shared/src/model';
import { translate, type Locale } from '../../../shared/src/i18n';
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

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'x-curahold-device': getDeviceId() };
  if (currentLocale) headers['x-curahold-locale'] = currentLocale;
  const as = previewAs();
  if (as) headers['x-curahold-preview-as'] = as;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: payload, credentials: 'same-origin' });
  } catch {
    noteFailedRequest(method, path, 0);
    // Said in words, so whatever shows the failure has something to show.
    const locale = (currentLocale === 'tr' || currentLocale === 'en' ? currentLocale : document.documentElement.lang === 'tr' ? 'tr' : 'en') as Locale;
    throw new ApiFailure(0, { error: 'network', message: translate(locale, navigator.onLine === false ? 'errors.offline' : 'errors.network') });
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
