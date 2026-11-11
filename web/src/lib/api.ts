// Thin fetch wrapper. Every call carries this device's id (the device limit
// and request-forgery check rely on it) and the chosen language.
import type { ApiError } from '../../../shared/src/model';
import { getDeviceId } from './device';

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
  const headers: Record<string, string> = { 'x-tendwell-device': getDeviceId() };
  if (currentLocale) headers['x-tendwell-locale'] = currentLocale;
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
    throw new ApiFailure(0, { error: 'network', message: '' });
  }
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
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
