// Light, dark, or whatever the device uses. Kept on this device only: a
// phone in the dark and a desk in daylight can each have their own.
import { useEffect, useState } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';
export const THEMES: ThemePref[] = ['light', 'dark', 'system'];
const KEY = 'app_theme';
const dark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;

export function storedTheme(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(pref: ThemePref = storedTheme()) {
  const mode = pref === 'system' ? (dark() ? 'dark' : 'light') : pref;
  document.documentElement.dataset.theme = mode;
  paintChrome();
  return mode;
}

/** The browser's own bar takes the colour of the well. */
function paintChrome() {
  const well = getComputedStyle(document.documentElement).getPropertyValue('--well').trim();
  if (well) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', well);
}

let listening = false;
/** Called once at start: applies the stored choice and follows the device while it is "system". */
export function startTheme() {
  applyTheme();
  if (listening || typeof matchMedia !== 'function') return;
  listening = true;
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => storedTheme() === 'system' && applyTheme('system'));
}

export function useTheme(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(storedTheme);
  useEffect(() => {
    applyTheme(pref);
  }, [pref]);
  return [
    pref,
    (p) => {
      try {
        if (p === 'system') localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, p);
      } catch {
        /* still applies for this visit */
      }
      setPref(p);
    },
  ];
}
