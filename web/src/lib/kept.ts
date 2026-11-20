// State a screen keeps for "Back" (its filters, its order): filed under the step of history it
// belongs to (lib/router.ts historyKey), in this tab only. Coming back with Back finds the list as
// it was left; opening the same screen afresh from the menu or a link starts from the defaults.
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { historyKey } from './router';

const PREFIX = 'app_kept:';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/** Like useState, but the value comes back when the person returns to this step of history. */
export function useKept<T>(name: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const [key] = useState(() => `${PREFIX}${historyKey()}:${location.pathname}:${name}`);
  const [value, setValue] = useState<T>(() => read(key, typeof initial === 'function' ? (initial as () => T)() : initial));
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* a tab that cannot keep it starts from the defaults on return */
    }
  }, [key, value]);
  return [value, setValue];
}
