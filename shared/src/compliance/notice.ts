// The legal notice in every footer (site, docs, demo hub, app sign-in pages,
// onboarding hub, portal): copyright with the right years, the unregistered
// trademark sign, and the copyright/trade-secret line. Only true statements:
// Curahold holds no patent and has filed none, so nothing here may say
// "patented" or "patent pending" (false marking); ® waits for a registration.
// No dictionary import here: the portal and the app load their languages lazily and pass their own t().
import type { MessageKey, Vars } from '../i18n/core';

/** The year Curahold was first published; the notice runs from here to the current year. */
export const COPYRIGHT_FROM = 2026;

/** "2026", then "2026–2027" once the calendar moves on. */
export function copyrightYears(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  return y > COPYRIGHT_FROM ? `${COPYRIGHT_FROM}–${y}` : String(COPYRIGHT_FROM);
}

/** The two short lines, in one language, through the caller's own t(). */
export function legalNotice(t: (key: MessageKey, vars?: Vars) => string, now?: Date): { rights: string; protected: string } {
  return { rights: t('legal.notice.rights', { years: copyrightYears(now) }), protected: t('legal.notice.protected') };
}
