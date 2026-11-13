// Consent-gated loaders for GA4, the Meta pixel and the TikTok pixel.
//
// Two hard rules, both enforced here:
//   1. Nothing loads until the matching consent category is granted. GA4 is an
//      "analytics" tracker; the Meta and TikTok pixels are "marketing".
//   2. Every loader is a no-op when its id is absent. The ids come from
//      build-time env placeholders the owner fills in later — never hard-coded:
//        VITE_GA4_ID          GA4 Measurement ID      (e.g. G-XXXXXXXXXX)
//        VITE_META_PIXEL_ID   Meta (Facebook) Pixel ID
//        VITE_TIKTOK_PIXEL_ID TikTok Pixel ID
//
// `plannedLoads` is the pure decision (consent + which ids exist → what may
// load) and is unit-tested. The injecting functions run only in the browser.
import { allows, loadConsent, onConsent, type ConsentState } from './consent';

export interface AnalyticsIds {
  ga4?: string;
  meta?: string;
  tiktok?: string;
}

export interface PlannedLoads {
  ga4: boolean;
  meta: boolean;
  tiktok: boolean;
}

/** Pure: which trackers may load, given the consent state and which ids exist. */
export function plannedLoads(state: ConsentState, ids: AnalyticsIds): PlannedLoads {
  return {
    ga4: !!ids.ga4 && allows(state, 'analytics'),
    meta: !!ids.meta && allows(state, 'marketing'),
    tiktok: !!ids.tiktok && allows(state, 'marketing'),
  };
}

function envIds(): AnalyticsIds {
  const meta = import.meta as unknown as { env?: Record<string, string | undefined> };
  const env = meta.env ?? {};
  const clean = (v: string | undefined) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  return { ga4: clean(env.VITE_GA4_ID), meta: clean(env.VITE_META_PIXEL_ID), tiktok: clean(env.VITE_TIKTOK_PIXEL_ID) };
}

// Each tracker is injected at most once per page load.
const loaded = { ga4: false, meta: false, tiktok: false };

function injectScript(src: string): void {
  if (typeof document === 'undefined') return;
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

function loadGa4(id: string): void {
  if (loaded.ga4 || typeof window === 'undefined') return;
  loaded.ga4 = true;
  const w = window as any;
  w.dataLayer = w.dataLayer || [];
  w.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer.push(arguments);
  };
  // Google Consent Mode: default denied, then grant only analytics storage (GA4 is not advertising).
  w.gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'granted',
  });
  w.gtag('js', new Date());
  w.gtag('config', id, { anonymize_ip: true });
  injectScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`);
}

function loadMeta(id: string): void {
  if (loaded.meta || typeof window === 'undefined') return;
  loaded.meta = true;
  const w = window as any;
  if (!w.fbq) {
    const n: any = (w.fbq = function fbq() {
      // eslint-disable-next-line prefer-rest-params
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    });
    if (!w._fbq) w._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = '2.0';
    n.queue = [];
  }
  injectScript('https://connect.facebook.net/en_US/fbevents.js');
  w.fbq('init', id);
  w.fbq('track', 'PageView');
}

function loadTiktok(id: string): void {
  if (loaded.tiktok || typeof window === 'undefined') return;
  loaded.tiktok = true;
  const w = window as any;
  w.TiktokAnalyticsObject = 'ttq';
  const q: any = (w.ttq = w.ttq || []);
  q.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie'];
  q.setAndDefer = (obj: any, method: string) => {
    obj[method] = function deferred(...args: unknown[]) {
      obj.push([method, ...args]);
    };
  };
  for (const m of q.methods) q.setAndDefer(q, m);
  injectScript(`https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(id)}&lib=ttq`);
  q.load?.(id);
  q.page?.();
}

/**
 * Bring the loaded trackers in line with the consent state: load what is now
 * granted and still absent. A category revoked after it loaded cannot pull a
 * running third-party script back, but GA4 is switched off through its own
 * disable flag, and a page reload clears the marketing pixels entirely.
 */
export function applyConsent(state: ConsentState, ids: AnalyticsIds): void {
  if (typeof window === 'undefined') return;
  const plan = plannedLoads(state, ids);
  const w = window as any;
  if (ids.ga4) w[`ga-disable-${ids.ga4}`] = !plan.ga4;
  if (plan.ga4) loadGa4(ids.ga4!);
  if (plan.meta) loadMeta(ids.meta!);
  if (plan.tiktok) loadTiktok(ids.tiktok!);
}

/** Read the stored consent and env ids, apply once, then follow every later change. */
export function initAnalytics(ids: AnalyticsIds = envIds()): void {
  if (typeof window === 'undefined') return;
  applyConsent(loadConsent(), ids);
  onConsent((state) => applyConsent(state, ids));
}
