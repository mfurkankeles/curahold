// One box to find anything and go anywhere: Ctrl/⌘ K from every screen.
// Results come from the server inside the person's own access; places
// and actions are matched here, instantly. The box itself (SearchPalette.tsx)
// is read when the browser is idle, so the first screen does not carry it.
import { lazy, Suspense, useEffect } from 'react';

const Palette = lazy(() => import('./SearchPalette'));
let asked = false;
/** Reads the box ahead of the first Ctrl K (once). */
export function preloadPalette() {
  if (asked) return;
  asked = true;
  void import('./SearchPalette');
}

export function useSearchKey(open: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener('keydown', onKey);
    // Ready before it is asked for: the browser reads it once it has nothing else to do.
    const idle = (window as Window & { requestIdleCallback?: (f: () => void) => number }).requestIdleCallback;
    const id = idle ? idle(preloadPalette) : window.setTimeout(preloadPalette, 1500);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (!idle) clearTimeout(id);
    };
  }, [open]);
}

export function SearchPalette(props: { onClose: () => void; onNewBoard: () => void }) {
  return (
    <Suspense fallback={null}>
      <Palette {...props} />
    </Suspense>
  );
}
