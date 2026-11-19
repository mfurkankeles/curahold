// The browser half of the consent library: storage, the third-party loaders
// (GA4, Meta pixel, TikTok pixel) behind the consent decision, Google consent
// mode signals, the A/B cookie mirror and the anonymous log beacon. Used by the
// static pages (site/consent.js is built from ./site.ts) and by the product
// (web/src/lib/consent.ts, web/src/lib/analytics.ts). Every function is a
// no-op off the browser.
import {
  CONSENT_KEY,
  consentModeFor,
  defaultConsent,
  parseConsent,
  plannedLoads,
  serializeConsent,
  type ConsentConfig,
  type ConsentEventBody,
  type ConsentState,
} from './core';

type W = Window & Record<string, any>;
const win = (): W | null => (typeof window === 'undefined' ? null : (window as unknown as W));

export function readStored(): ConsentState {
  const w = win();
  if (!w) return defaultConsent();
  try {
    const raw = w.localStorage.getItem(CONSENT_KEY);
    const state = parseConsent(raw);
    // An expired or old-version record is removed, so no other script reads it as a yes.
    if (raw && !state.decided) w.localStorage.setItem(CONSENT_KEY, serializeConsent(state));
    return state;
  } catch {
    return defaultConsent();
  }
}

export function store(state: ConsentState, cfg?: Pick<ConsentConfig, 'ab'>): void {
  const w = win();
  if (!w) return;
  try {
    w.localStorage.setItem(CONSENT_KEY, serializeConsent(state));
  } catch {
    /* private mode: the choice holds for this page */
  }
  // The A/B edge cannot read localStorage; it reads this copy of the analytics answer (strictly necessary).
  if (cfg?.ab) {
    try {
      const secure = w.location?.protocol === 'https:' ? '; Secure' : '';
      w.document.cookie = 'cura_consent=' + (state.analytics ? 'a1' : 'a0') + '; Max-Age=31536000; Path=/; SameSite=Lax' + secure;
    } catch {
      /* no cookies: the visitor is simply left out of the test */
    }
  }
}

// ------------------------------------------------------------------ loaders

const loaded = { ga4: false, meta: false, tiktok: false };
/** For tests: forget what was loaded. */
export function resetLoaded(): void {
  loaded.ga4 = loaded.meta = loaded.tiktok = false;
}

function addScript(src: string): void {
  const w = win();
  if (!w?.document) return;
  const s = w.document.createElement('script');
  s.async = true;
  s.src = src;
  w.document.head.appendChild(s);
}

function gtagOf(w: W): (...a: unknown[]) => void {
  w.dataLayer = w.dataLayer || [];
  if (!w.gtag)
    w.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer.push(arguments);
    };
  return w.gtag;
}

function loadGa4(w: W, id: string, state: ConsentState): void {
  if (loaded.ga4) return;
  loaded.ga4 = true;
  const gtag = gtagOf(w);
  // Basic consent mode: the tag is only fetched after the grant, and it starts with the granted signals.
  gtag('consent', 'default', consentModeFor(state));
  gtag('js', new Date());
  gtag('config', id, { anonymize_ip: true, allow_google_signals: false, allow_ad_personalization_signals: false });
  addScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id));
}

function loadMeta(w: W, id: string): void {
  if (loaded.meta) return;
  loaded.meta = true;
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
  addScript('https://connect.facebook.net/en_US/fbevents.js');
  w.fbq('consent', 'grant');
  w.fbq('init', id);
  w.fbq('track', 'PageView');
}

function loadTiktok(w: W, id: string): void {
  if (loaded.tiktok) return;
  loaded.tiktok = true;
  w.TiktokAnalyticsObject = 'ttq';
  const q: any = (w.ttq = w.ttq || []);
  q.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie', 'grantConsent', 'revokeConsent'];
  q.setAndDefer = (obj: any, method: string) => {
    obj[method] = function deferred(...args: unknown[]) {
      obj.push([method, ...args]);
    };
  };
  for (const m of q.methods) q.setAndDefer(q, m);
  addScript('https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=' + encodeURIComponent(id) + '&lib=ttq');
  q.load?.(id);
  q.page?.();
}

/**
 * Bring the page in line with the state: load what is granted and still absent;
 * tell what is already running when a grant is withdrawn (GA4's disable flag and
 * consent update; the pixels' own revoke calls). A reload clears them entirely.
 */
export function applyConsent(state: ConsentState, cfg: ConsentConfig): void {
  const w = win();
  if (!w) return;
  const plan = plannedLoads(state, cfg);
  const ga4 = cfg.ids.ga4?.trim();
  if (ga4) w['ga-disable-' + ga4] = !plan.ga4;
  if (loaded.ga4 && w.gtag) w.gtag('consent', 'update', consentModeFor(state));
  if (plan.ga4 && ga4) loadGa4(w, ga4, state);
  if (plan.meta) loadMeta(w, cfg.ids.meta!.trim());
  else if (loaded.meta && w.fbq) w.fbq('consent', 'revoke');
  if (plan.tiktok) loadTiktok(w, cfg.ids.tiktok!.trim());
  else if (loaded.tiktok && w.ttq?.revokeConsent) w.ttq.revokeConsent();
}

// ------------------------------------------------------------------ the log

/**
 * Sends one consent record. A beacon with a text body needs no CORS preflight,
 * so the static site can log to the app's address; best effort by design.
 */
export function sendConsentEvent(url: string | undefined, body: ConsentEventBody): void {
  const w = win();
  if (!w || !url) return;
  const data = JSON.stringify(body);
  try {
    if (w.navigator?.sendBeacon && w.navigator.sendBeacon(url, new Blob([data], { type: 'text/plain' }))) return;
  } catch {
    /* fall through */
  }
  try {
    void w.fetch?.(url, { method: 'POST', body: data, keepalive: true, credentials: 'omit', headers: { 'content-type': 'text/plain' } }).catch(() => undefined);
  } catch {
    /* offline: the choice still holds in this browser */
  }
}
