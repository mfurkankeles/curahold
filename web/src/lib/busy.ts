// The busy state of a button that saves or sends (docs/design/tokens.md "Loading"): its label
// stays, its icon turns into a small ring after --dur-2 (CSS on [aria-busy]), the ring stays at
// least 300 ms once seen (no flicker), and a tick shows for 600 ms when it worked.
//
// Two ways in. A button that owns its state (the confirm dialog) uses `useBusy` + `busyProps`. Every other
// save, send or delete button gets the same states without any wiring: a press on a button is remembered
// for a moment, and a change sent to the API in that moment (lib/api.ts calls `trackChange`) belongs to
// it — the button shows the ring while the change is on its way and the tick when it worked. This keeps
// one pattern on every save in the app without touching each of its hundreds of buttons, and a screen
// that forgets it still behaves. Buttons that open, toggle or navigate are left alone (see `SKIP`).
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

/** The attributes that draw a button's busy and done states (and mark it as owning them, so a press is not also followed). */
export function busyProps(state: BusyState) {
  return { 'aria-busy': state === 'busy' || undefined, 'data-done': state === 'done' || undefined, 'data-busy-own': '' } as const;
}

/** A change sent this long after a press belongs to the pressed button (a handler may check or read first). */
export const PRESS_MS = 600;
/** Presses that are not a save: menus, toggles, tabs, switches, ticks, links, stand-ins and buttons that run their own state. */
export const SKIP =
  '[aria-haspopup], [aria-expanded], [aria-pressed], [role=switch], [role=checkbox], [role=tab], [role=menuitem], [role=menuitemradio], [role=option], .tick, [data-busy-own], [data-leaving] *';

/** The parts of an element this needs (a real button, or a stand-in in tests). */
export interface Pressable {
  isConnected: boolean;
  matches(selector: string): boolean;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

let pressed: { el: Pressable; at: number } | null = null;
/** How many changes each followed button is waiting for (a press can send several at once). */
const pending = new Map<Pressable, { n: number; started: number; failed: boolean }>();
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Remembers a press on a save-like button (`.btn` that does not open, toggle or navigate). */
export function notePress(el: Pressable | null) {
  pressed = el && el.matches('.btn') && !el.matches(SKIP) ? { el, at: now() } : null;
}

/**
 * Ties a change on its way to the button pressed just before, if any: the ring after --dur-2 (CSS), at least
 * SHOWN_MS once seen, then the tick for DONE_MS when every change of that press worked. Returns `sent` unchanged.
 */
export function trackChange<T>(sent: Promise<T>): Promise<T> {
  const p = pressed;
  if (!p || now() - p.at > PRESS_MS || !p.el.isConnected) return sent;
  const el = p.el;
  const mine = pending.get(el) ?? { n: 0, started: now(), failed: false };
  if (!mine.n) {
    mine.started = now();
    mine.failed = false;
    el.removeAttribute('data-done');
    el.setAttribute('aria-busy', 'true');
  }
  mine.n += 1;
  pending.set(el, mine);
  const settle = async (ok: boolean) => {
    if (!ok) mine.failed = true;
    if (--mine.n > 0) return;
    pending.delete(el);
    const took = now() - mine.started;
    if (took > QUIET_MS && took < QUIET_MS + SHOWN_MS) await new Promise((r) => setTimeout(r, QUIET_MS + SHOWN_MS - took));
    if (mine.n > 0) return; // pressed again meanwhile: that change owns the button now
    el.removeAttribute('aria-busy');
    if (mine.failed || took <= QUIET_MS || !el.isConnected) return;
    el.setAttribute('data-done', '');
    setTimeout(() => !pending.has(el) && el.removeAttribute('data-done'), DONE_MS);
  };
  sent.then(
    () => void settle(true),
    () => void settle(false),
  );
  return sent;
}

if (typeof document !== 'undefined') {
  // Capture, so the press is known before the button's own handler sends anything.
  document.addEventListener('click', (e) => notePress((e.target as Element | null)?.closest?.<HTMLElement>('button') ?? null), true);
}
