// "Something on this screen is loading": one counter for the whole app. Every skeleton and the
// route fallback (components/Empty.tsx, RouteFallback.tsx) holds a mark while it is on screen, and
// the route bar at the top (components/Loader.tsx) shows while any mark is held for longer than
// --dur-2. One signal, so a screen never has to remember to start or stop the bar itself.
import { useEffect, useSyncExternalStore } from 'react';

let held = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

/** Holds a "loading" mark until the returned function is called (calling it twice is harmless). */
export function markLoading(): () => void {
  held += 1;
  emit();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    held -= 1;
    emit();
  };
}

/** Holds a mark while the calling component is on screen (and `active`). */
export function useLoadingMark(active = true) {
  useEffect(() => (active ? markLoading() : undefined), [active]);
}

/** Whether anything is loading now. */
export function useLoadingNow(): boolean {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => held > 0,
    () => false,
  );
}
