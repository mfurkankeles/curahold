// Consent-gated measurement in the product: the shared library's loaders
// (shared/src/consent/browser.ts) with the ids and switches of this build.
//
//   VITE_GA4_ID           GA4 Measurement ID (analytics)
//   VITE_META_PIXEL_ID    Meta pixel id (marketing)
//   VITE_TIKTOK_PIXEL_ID  TikTok pixel id (marketing)
//   VITE_MARKETING_PIXELS =1 to let the two pixels load at all (off by default:
//                         the privacy and cookie texts must be live first)
//
// Nothing loads before the matching consent; with no id configured there is
// nothing to consent to and the banner stays away.
import { applyConsent as apply } from '../../../shared/src/consent/browser';
import type { ConsentConfig, ConsentState, VendorIds } from '../../../shared/src/consent/core';
import { loadConsent, onConsent } from './consent';

export { categoriesInUse, hasMeasurement, plannedLoads, type PlannedLoads } from '../../../shared/src/consent/core';
export type AnalyticsIds = VendorIds;

export function envIds(): VendorIds {
  // Written out in full so the build can replace each one with its literal value;
  // reading them through a variable would leave every id empty in a production build.
  const clean = (v: string | undefined) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  return { ga4: clean(import.meta.env.VITE_GA4_ID), meta: clean(import.meta.env.VITE_META_PIXEL_ID), tiktok: clean(import.meta.env.VITE_TIKTOK_PIXEL_ID) };
}

/** This build's measurement configuration. */
export function envConfig(): ConsentConfig {
  return { ids: envIds(), marketingPixels: import.meta.env.VITE_MARKETING_PIXELS === '1' };
}

export const applyConsent = (state: ConsentState, cfg: ConsentConfig = envConfig()): void => apply(state, cfg);

/** Read the stored consent, apply once, then follow every later change. */
export function initAnalytics(cfg: ConsentConfig = envConfig()): void {
  if (typeof window === 'undefined') return;
  apply(loadConsent(), cfg);
  onConsent((state) => apply(state, cfg));
}
