// Consent state for the product. Three categories: "necessary" is always on and
// is never stored as a choice; "analytics" and "marketing" are off until the
// person opts in. The privacy-preserving default is no tracking at all — nothing
// non-essential may load until `decided` is true AND the category is granted.
//
// The pure functions here (defaultConsent, allows, parse/serialize, accept/reject/
// choose) carry no browser dependency, so they are unit-tested directly. The
// storage/event helpers below are guarded and simply no-op off the browser.

export type ConsentCategory = 'necessary' | 'analytics' | 'marketing';

export interface ConsentState {
  analytics: boolean;
  marketing: boolean;
  /** True once the person has made an explicit choice (accept / reject / save). */
  decided: boolean;
  /** When the choice was made (ISO 8601), for the record; '' before any choice. */
  at: string;
}

export const CONSENT_VERSION = 1;
const STORE_KEY = `curahold_consent_v${CONSENT_VERSION}`;
/** A window event carrying the new state, so analytics loaders react to a change at once. */
export const CONSENT_EVENT = 'curahold:consent';

const nowIso = () => new Date().toISOString();

export function defaultConsent(): ConsentState {
  return { analytics: false, marketing: false, decided: false, at: '' };
}

/**
 * Whether a category may load given the current state. "necessary" is always
 * allowed; the others need an explicit, recorded grant — an undecided state
 * allows nothing but the necessary category.
 */
export function allows(state: ConsentState, category: ConsentCategory): boolean {
  if (category === 'necessary') return true;
  if (!state.decided) return false;
  return category === 'analytics' ? state.analytics : state.marketing;
}

function decided(choice: { analytics: boolean; marketing: boolean }, at: string): ConsentState {
  return { analytics: choice.analytics, marketing: choice.marketing, decided: true, at };
}
export const acceptAll = (at: string = nowIso()): ConsentState => decided({ analytics: true, marketing: true }, at);
export const rejectAll = (at: string = nowIso()): ConsentState => decided({ analytics: false, marketing: false }, at);
export const chooseConsent = (choice: { analytics: boolean; marketing: boolean }, at: string = nowIso()): ConsentState =>
  decided(choice, at);

/** Parse stored JSON into a state, defensively; an unknown or old shape becomes the undecided default. */
export function parseConsent(raw: string | null | undefined): ConsentState {
  if (!raw) return defaultConsent();
  try {
    const v = JSON.parse(raw) as Partial<ConsentState> | null;
    if (typeof v !== 'object' || v === null) return defaultConsent();
    return {
      analytics: v.analytics === true,
      marketing: v.marketing === true,
      decided: v.decided === true,
      at: typeof v.at === 'string' ? v.at : '',
    };
  } catch {
    return defaultConsent();
  }
}

export function serializeConsent(state: ConsentState): string {
  return JSON.stringify(state);
}

// ---------------------------------------------------------------- browser-bound
const hasStorage = () => typeof window !== 'undefined' && !!window.localStorage;

export function loadConsent(): ConsentState {
  if (!hasStorage()) return defaultConsent();
  try {
    return parseConsent(window.localStorage.getItem(STORE_KEY));
  } catch {
    return defaultConsent();
  }
}

export function saveConsent(state: ConsentState): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(STORE_KEY, serializeConsent(state));
  } catch {
    /* private mode: the choice holds for this page only */
  }
}

export function emitConsent(state: ConsentState): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ConsentState>(CONSENT_EVENT, { detail: state }));
}

export function onConsent(cb: (state: ConsentState) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (e: Event) => cb((e as CustomEvent<ConsentState>).detail);
  window.addEventListener(CONSENT_EVENT, handler);
  return () => window.removeEventListener(CONSENT_EVENT, handler);
}
