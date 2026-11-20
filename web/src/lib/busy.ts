// The busy state of a button that saves or sends (docs/design/tokens.md "Loading"): its label
// stays, its icon turns into a small ring after --dur-2 (CSS on [aria-busy]), the ring stays at
// least 300 ms once seen (no flicker), and a tick shows for 600 ms when it worked.
import { useCallback, useRef, useState } from 'react';

/** How long nothing changes on a pressed button (the CSS delay of the ring). */
const QUIET_MS = 150;
/** The shortest time the ring is on screen once it appeared. */
const SHOWN_MS = 300;
/** How long the tick says "done". */
const DONE_MS = 600;

export type BusyState = 'idle' | 'busy' | 'done';

/**
 * Returns `[state, run]`: `run(fn)` marks the button busy while `fn` runs, then done (after a wait the
 * person saw) or idle. Errors pass through unchanged. Spread `busyProps(state)` on the button.
 */
export function useBusy() {
  const [state, setState] = useState<BusyState>('idle');
  const running = useRef(false);
  const run = useCallback(async <T,>(fn: () => Promise<T> | T): Promise<T> => {
    running.current = true;
    const started = performance.now();
    setState('busy');
    try {
      const out = await fn();
      const took = performance.now() - started;
      // A wait the person saw ends with a ring that stayed long enough to read, then a tick.
      if (took > QUIET_MS) {
        if (took < QUIET_MS + SHOWN_MS) await new Promise((r) => setTimeout(r, QUIET_MS + SHOWN_MS - took));
        setState('done');
        setTimeout(() => setState((s) => (s === 'done' ? 'idle' : s)), DONE_MS);
      } else setState('idle');
      return out;
    } catch (e) {
      setState('idle');
      throw e;
    } finally {
      running.current = false;
    }
  }, []);
  return [state, run] as const;
}

/** The attributes that draw a button's busy and done states. */
export function busyProps(state: BusyState) {
  return { 'aria-busy': state === 'busy' || undefined, 'data-done': state === 'done' || undefined } as const;
}
