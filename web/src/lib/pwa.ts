// Curahold as an installed app: the service worker (offline reading), the
// browser's install prompt, and knowing whether there is a connection.
import { useEffect, useState } from 'react';

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((fn) => fn());

export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
/** iPhone and iPad have no install prompt; the person adds it from the share sheet. */
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Called once at start. The try-it demo runs inside another page and keeps nothing. */
export function startPwa() {
  if (import.meta.env.APP_DEMO || !('serviceWorker' in navigator)) return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    changed();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    changed();
  });
  const register = () => void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

/** Signing out: what was kept for offline reading goes too. */
export async function forgetOffline() {
  try {
    navigator.serviceWorker?.controller?.postMessage('signed-out');
    if ('caches' in window) for (const k of await caches.keys()) if (k.endsWith('-data')) await caches.delete(k);
  } catch {
    /* nothing kept */
  }
}

export function useInstall() {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  const standalone = isStandalone();
  return {
    /** The browser offers a one-click install. */
    canPrompt: !!deferred && !standalone,
    /** No prompt on this device, but it can be added by hand. */
    byHand: !deferred && !standalone && isIos() && !import.meta.env.APP_DEMO,
    install: async () => {
      if (!deferred) return false;
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      changed();
      return outcome === 'accepted';
    },
  };
}

export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
