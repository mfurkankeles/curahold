// The setup checks on the client: one request shared by the nav's badge, the
// panel and the warnings on each screen, asked again when the window comes
// back into focus or a check may have changed (SETUP_CHANGED).
import { useEffect, useState } from 'react';
import { ADMIN_PERMS, type Perm } from '../../../shared/src/model';
import { CHECKS, TEST_STEPS, type SetupHealth } from '../../../shared/src/setupHealth';
import { helpLanguageOf, type Locale } from '../../../shared/src/i18n';
import { apiLocale, get, post } from './api';
import { docsHref } from './docs';
import { useI18n } from './i18n';

export const SETUP_CHANGED = 'curahold:setup-changed';
const FRESH_MS = 30_000;

// The server writes the checks' texts in the language asked: an answer in another language is not reused
// (the first one is often asked before the person's language has arrived).
let last: { at: number; data: SetupHealth; locale: string } | null = null;
let asking: Promise<SetupHealth | null> | null = null;

/** The panel's data; a recent answer is reused (the nav, the panel and a screen's warnings ask at once). */
export function loadSetupHealth(force = false): Promise<SetupHealth | null> {
  if (!force && last && last.locale === apiLocale() && Date.now() - last.at < FRESH_MS) return Promise.resolve(last.data);
  const locale = apiLocale();
  return (asking ??= get<SetupHealth>('/setup-health')
    .then(
      (data) => ((last = { at: Date.now(), data, locale }), data),
      () => null,
    )
    .finally(() => (asking = null)));
}

/** Runs the checks now and remembers what failed ("Check again", and opening the panel); everyone showing them hears of it. */
export async function checkSetupHealth(): Promise<SetupHealth | null> {
  try {
    const data = await post<SetupHealth>('/setup-health/check', {});
    last = { at: Date.now(), data, locale: apiLocale() };
    window.dispatchEvent(new CustomEvent(SETUP_CHANGED, { detail: 'fresh' }));
    return data;
  } catch {
    return loadSetupHealth(true);
  }
}

/** Something a check reads may have changed: ask again next time, and tell whoever shows it. */
export function setupChanged() {
  last = null;
  window.dispatchEvent(new Event(SETUP_CHANGED));
}

/** Whether this person could fix any check or run any test step (others never ask). */
export function seesSetup(perms: readonly Perm[], owner: boolean): boolean {
  return owner || perms.some((p) => ADMIN_PERMS.includes(p)) || CHECKS.some((c) => c.fixer.some((f) => f !== 'owner' && perms.includes(f))) || TEST_STEPS.some((s) => s.fixer.some((f) => perms.includes(f)));
}

/** The setup checks, kept current while mounted. */
export function useSetupHealth(enabled = true): SetupHealth | null {
  const { locale } = useI18n();
  const [data, setData] = useState<SetupHealth | null>(last?.data ?? null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const load = (force: boolean) => void loadSetupHealth(force).then((d) => live && d && setData(d));
    // A fresh answer is already kept: read it; anything else: ask again.
    const again = (e: Event) => load((e as CustomEvent).detail !== 'fresh');
    const focus = () => load(false);
    // After this render's effects: the app hands the new language to the API in its own (parent) effect, which runs after this one.
    const first = setTimeout(() => load(false), 0);
    window.addEventListener(SETUP_CHANGED, again);
    window.addEventListener('focus', focus);
    return () => {
      live = false;
      clearTimeout(first);
      window.removeEventListener(SETUP_CHANGED, again);
      window.removeEventListener('focus', focus);
    };
  }, [enabled, locale]);
  return data;
}

/** Where a fix goes: a screen of the app, or a help page (the install's own checks). */
export function fixTarget(to: string, locale: Locale): { href: string; external: boolean } {
  if (to.startsWith('/docs/')) return { href: docsHref(`${helpLanguageOf(locale)}/${to.slice('/docs/'.length)}`), external: true };
  return { href: to, external: false };
}

/** The checks a screen shows as its own warnings: those whose fix is this screen (or one of its parts). */
export function checksFor(data: SetupHealth | null, path: string) {
  if (!data) return [];
  return data.checks.filter((c) => c.status === 'fail' && !c.manual && (c.fix === path || c.fix.startsWith(`${path}/`) || c.fix.startsWith(`${path}?`)));
}
