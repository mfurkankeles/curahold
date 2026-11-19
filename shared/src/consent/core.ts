// The one consent library every Curahold surface uses: the sales site and its
// concept pages (bundled into site/consent.js by scripts/compliance/build-consent.ts),
// the product, the customer portal, the demo and the console (web/src/lib/consent.ts),
// and the trial form (inside the product). Pure functions, no browser needed,
// so all of it is unit-tested; the browser-bound parts live in ./browser.ts.
//
// The rules it enforces, for the strictest country we serve (KVKK cookie guide,
// ePrivacy art. 5(3), ICO 2026, PDPL consent logic in the Gulf):
//   - nothing optional before an explicit choice; an undecided visitor allows
//     only the strictly necessary category;
//   - granular: analytics and marketing are separate switches;
//   - the advertising pixels (Meta, TikTok) are OFF BY CONFIGURATION as well:
//     even with an id and consent they load only when `marketingPixels` is true;
//   - a choice expires after CONSENT_MAX_AGE_DAYS and whenever the cookie policy
//     gets a new version (COOKIE_POLICY_VERSION) — the visitor is asked again;
//   - every choice can be logged with the policy version, a SHA-256 of the exact
//     words shown, the language, the surface and an anonymous consent id.
import { COOKIE_POLICY_VERSION } from '../compliance/version';

/** Kept for compatibility with the pages already in visitors' browsers; the version lives inside the record. */
export const CONSENT_KEY = 'curahold_consent_v1';
export const CONSENT_POLICY_VERSION = COOKIE_POLICY_VERSION;
/** Re-ask after a year (KVKK guide and common practice: 6–12 months). */
export const CONSENT_MAX_AGE_DAYS = 365;

export type ConsentCategory = 'necessary' | 'analytics' | 'marketing';
export type OptionalCategory = Exclude<ConsentCategory, 'necessary'>;
export type Surface = 'site' | 'app' | 'portal' | 'docs' | 'demo' | 'console' | 'trial';
export const SURFACES: Surface[] = ['site', 'app', 'portal', 'docs', 'demo', 'console', 'trial'];
export type ConsentAction = 'accept_all' | 'reject_all' | 'custom';
export const CONSENT_ACTIONS: ConsentAction[] = ['accept_all', 'reject_all', 'custom'];

export interface ConsentState {
  analytics: boolean;
  marketing: boolean;
  /** True once the person made an explicit choice under the current policy version. */
  decided: boolean;
  /** When the choice was made (ISO 8601); '' before any choice. */
  at: string;
  /** The cookie-policy version the choice was made under; '' before any choice. */
  policy: string;
  /** Anonymous consent id (random), so a visitor's log rows can be tied together without a name; '' before any choice. */
  id: string;
}

export interface ConsentChoice {
  analytics: boolean;
  marketing: boolean;
}

export const defaultConsent = (): ConsentState => ({ analytics: false, marketing: false, decided: false, at: '', policy: '', id: '' });

/** Whether a category may run. Necessary always; the others need a recorded grant under the current policy. */
export function allows(state: ConsentState, category: ConsentCategory): boolean {
  if (category === 'necessary') return true;
  if (!state.decided) return false;
  return category === 'analytics' ? state.analytics : state.marketing;
}

const randomId = (): string => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Old browsers: still random, still the uuid shape the server checks.
  const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${h()}${h()}-${h()}-4${h().slice(1)}-a${h().slice(1)}-${h()}${h()}${h()}`;
};

/** A fresh decision; the consent id is kept from the previous record when there is one. */
export function decide(choice: ConsentChoice, opts: { at?: string; previous?: ConsentState; id?: string } = {}): ConsentState {
  return {
    analytics: choice.analytics === true,
    marketing: choice.marketing === true,
    decided: true,
    at: opts.at ?? new Date().toISOString(),
    policy: CONSENT_POLICY_VERSION,
    id: opts.id ?? (opts.previous?.id || randomId()),
  };
}
export const acceptAll = (at?: string, previous?: ConsentState) => decide({ analytics: true, marketing: true }, { at, previous });
export const rejectAll = (at?: string, previous?: ConsentState) => decide({ analytics: false, marketing: false }, { at, previous });
export const chooseConsent = (choice: ConsentChoice, at?: string, previous?: ConsentState) => decide(choice, { at, previous });

/**
 * Reads a stored record. Anything unreadable, older than a year or made under
 * another policy version comes back undecided (the id survives, so the visitor's
 * new answer joins the same anonymous trail).
 */
export function parseConsent(raw: string | null | undefined, now: number = Date.now()): ConsentState {
  if (!raw) return defaultConsent();
  let v: Partial<ConsentState> | null;
  try {
    v = JSON.parse(raw) as Partial<ConsentState> | null;
  } catch {
    return defaultConsent();
  }
  if (typeof v !== 'object' || v === null) return defaultConsent();
  const id = typeof v.id === 'string' && /^[0-9a-f-]{36}$/.test(v.id) ? v.id : '';
  const at = typeof v.at === 'string' ? v.at : '';
  const fresh = !!at && now - Date.parse(at) < CONSENT_MAX_AGE_DAYS * 86_400_000;
  if (v.decided !== true || v.policy !== CONSENT_POLICY_VERSION || !fresh) return { ...defaultConsent(), id };
  return { analytics: v.analytics === true, marketing: v.marketing === true, decided: true, at, policy: CONSENT_POLICY_VERSION, id };
}

export const serializeConsent = (state: ConsentState): string => JSON.stringify(state);

// ------------------------------------------------------------------ what may load

export interface VendorIds {
  ga4?: string;
  meta?: string;
  tiktok?: string;
}

/** A surface's measurement configuration (ids from the build, flags from config). */
export interface ConsentConfig {
  ids: VendorIds;
  /** The Meta and TikTok pixels: off unless switched on on purpose (CURAHOLD_MARKETING_PIXELS / VITE_MARKETING_PIXELS = 1). */
  marketingPixels?: boolean;
  /** The sales site's A/B test is on (it needs analytics consent). */
  ab?: boolean;
}

const has = (v: string | undefined) => typeof v === 'string' && v.trim() !== '';

/** The ids that can ever load on this surface: the pixels drop out unless the flag is on. */
export function activeIds(cfg: ConsentConfig): VendorIds {
  const pixels = cfg.marketingPixels === true;
  return {
    ga4: has(cfg.ids.ga4) ? cfg.ids.ga4!.trim() : undefined,
    meta: pixels && has(cfg.ids.meta) ? cfg.ids.meta!.trim() : undefined,
    tiktok: pixels && has(cfg.ids.tiktok) ? cfg.ids.tiktok!.trim() : undefined,
  };
}

/** Which optional categories are actually in use; the banner offers only these. */
export function categoriesInUse(cfg: ConsentConfig): Record<OptionalCategory, boolean> {
  const ids = activeIds(cfg);
  return { analytics: !!ids.ga4 || cfg.ab === true, marketing: !!(ids.meta || ids.tiktok) };
}

/** Is there anything to ask about? With nothing in use, no banner: there is nothing to consent to. */
export function hasMeasurement(cfg: ConsentConfig): boolean {
  const c = categoriesInUse(cfg);
  return c.analytics || c.marketing;
}

export interface PlannedLoads {
  ga4: boolean;
  meta: boolean;
  tiktok: boolean;
}

/** Pure: what may load now. */
export function plannedLoads(state: ConsentState, cfg: ConsentConfig): PlannedLoads {
  const ids = activeIds(cfg);
  return { ga4: !!ids.ga4 && allows(state, 'analytics'), meta: !!ids.meta && allows(state, 'marketing'), tiktok: !!ids.tiktok && allows(state, 'marketing') };
}

// ------------------------------------------------------------------ Google consent mode

export type ConsentModeValue = 'granted' | 'denied';
export interface ConsentModeSignals {
  ad_storage: ConsentModeValue;
  ad_user_data: ConsentModeValue;
  ad_personalization: ConsentModeValue;
  analytics_storage: ConsentModeValue;
  functionality_storage: ConsentModeValue;
  security_storage: ConsentModeValue;
}

/** Google consent mode v2 signals for a state: everything optional denied until granted. */
export function consentModeFor(state: ConsentState): ConsentModeSignals {
  const g = (on: boolean): ConsentModeValue => (on ? 'granted' : 'denied');
  const ads = allows(state, 'marketing');
  return {
    ad_storage: g(ads),
    ad_user_data: g(ads),
    ad_personalization: g(ads),
    analytics_storage: g(allows(state, 'analytics')),
    functionality_storage: 'granted',
    security_storage: 'granted',
  };
}
export const consentModeDefault = (): ConsentModeSignals => consentModeFor(defaultConsent());

// ------------------------------------------------------------------ the record

export function actionOf(choice: ConsentChoice, inUse: Record<OptionalCategory, boolean>): ConsentAction {
  const on = (['analytics', 'marketing'] as const).filter((k) => inUse[k]);
  if (on.length && on.every((k) => choice[k])) return 'accept_all';
  if (on.every((k) => !choice[k])) return 'reject_all';
  return 'custom';
}

/** What is sent to the server for each choice (consent_log for people signed in, consent_events for visitors). */
export interface ConsentEventBody {
  consentId: string;
  action: ConsentAction;
  analytics: boolean;
  marketing: boolean;
  policyVersion: string;
  /** SHA-256 of the exact words shown (bannerText). */
  textHash: string;
  locale: string;
  surface: Surface;
}

export function consentEvent(state: ConsentState, ctx: { inUse: Record<OptionalCategory, boolean>; textHash: string; locale: string; surface: Surface }): ConsentEventBody {
  return {
    consentId: state.id,
    action: actionOf(state, ctx.inUse),
    analytics: state.analytics,
    marketing: state.marketing,
    policyVersion: state.policy || CONSENT_POLICY_VERSION,
    textHash: ctx.textHash,
    locale: ctx.locale,
    surface: ctx.surface,
  };
}

/** The words a person saw, in a stable order, for the hash (labels of hidden categories are left out). */
export function bannerText(strings: Record<string, string | undefined>, inUse: Record<OptionalCategory, boolean>): string {
  const keys = ['title', 'body', 'acceptAll', 'rejectAll', 'manage', 'necessaryTitle', 'necessaryBody'];
  if (inUse.analytics) keys.push('analyticsTitle', 'analyticsBody');
  if (inUse.marketing) keys.push('marketingTitle', 'marketingBody');
  return [`policy:${CONSENT_POLICY_VERSION}`, ...keys.map((k) => `${k}:${strings[k] ?? ''}`)].join('\n');
}

/** SHA-256 hex through Web Crypto (browsers, Workers and Node 18+). */
export async function sha256Hex(text: string): Promise<string> {
  const subtle = (globalThis as { crypto?: { subtle?: { digest: (a: string, d: Uint8Array) => Promise<ArrayBuffer> } } }).crypto?.subtle;
  if (!subtle) return '';
  const buf = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
