// Consent state for the product, the demo and the console: the shared consent
// library (shared/src/consent/) with the product's own events on top. The rules
// — nothing optional before an explicit choice, analytics and marketing apart,
// pixels off by configuration, re-ask on a new policy version or after a year —
// live in the library and are the same as on the static pages.
import { readStored, store } from '../../../shared/src/consent/browser';
import type { ConsentState } from '../../../shared/src/consent/core';

export {
  CONSENT_KEY,
  CONSENT_POLICY_VERSION,
  acceptAll,
  allows,
  chooseConsent,
  defaultConsent,
  parseConsent,
  rejectAll,
  serializeConsent,
  type ConsentCategory,
  type ConsentState,
} from '../../../shared/src/consent/core';

/** A window event carrying the new state, so the loaders react to a change at once. */
export const CONSENT_EVENT = 'curahold:consent';

/** The visitor's stored consent. */
export const loadConsent = (): ConsentState => readStored();
/** Stores the visitor's consent. */
export const saveConsent = (state: ConsentState): void => store(state);

/** Tells the page the consent changed (scripts that wait for it load or stop). */
export function emitConsent(state: ConsentState): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ConsentState>(CONSENT_EVENT, { detail: state }));
}

/** Subscribes to consent changes; returns the unsubscribe function. */
export function onConsent(cb: (state: ConsentState) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (e: Event) => cb((e as CustomEvent<ConsentState>).detail);
  window.addEventListener(CONSENT_EVENT, handler);
  return () => window.removeEventListener(CONSENT_EVENT, handler);
}

/** Asks the consent component to open its choices panel (from the profile page's privacy line). */
export const CONSENT_OPEN_EVENT = 'curahold:consent-open';
/** Opens the consent choices dialog (from the footer link), so a choice can always be changed. */
export function openConsentChoices(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
}
/** Subscribes to requests to open the consent choices. */
export function onConsentOpen(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(CONSENT_OPEN_EVENT, cb);
  return () => window.removeEventListener(CONSENT_OPEN_EVENT, cb);
}
