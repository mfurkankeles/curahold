// A small router on the History API — the app has few screens and they all
// live in the URL, so a shared link opens the same board and task.
import { useEffect, useState } from 'react';

export function navigate(to: string, replace = false) {
  if (to === location.pathname + location.search) return;
  if (replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  window.dispatchEvent(new Event('tw:navigate'));
}

export function useLocation() {
  const [loc, setLoc] = useState(() => ({ path: location.pathname, search: location.search, hash: location.hash }));
  useEffect(() => {
    const on = () => setLoc({ path: location.pathname, search: location.search, hash: location.hash });
    window.addEventListener('popstate', on);
    window.addEventListener('tw:navigate', on);
    return () => {
      window.removeEventListener('popstate', on);
      window.removeEventListener('tw:navigate', on);
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
