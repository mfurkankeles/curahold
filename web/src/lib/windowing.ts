// Draw only what can be seen. A long list keeps two spacers, one above and one
// below the rows it draws; the spacers stand in for the rows that are not drawn,
// at the average height of the ones that are. It works inside anything that
// scrolls (a board column, the page itself) and needs nothing but the DOM.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const scrollerOf = (el: HTMLElement | null): HTMLElement | null => {
  for (let n = el; n; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY;
    if (o === 'auto' || o === 'scroll') return n;
  }
  return null;
};

export interface Windowed<S extends HTMLElement, E extends HTMLElement> {
  /** The first row drawn and one past the last. */
  start: number;
  end: number;
  /** Heights the two spacers stand in for, in pixels. */
  before: number;
  after: number;
  topRef: (el: S | null) => void;
  bottomRef: (el: E | null) => void;
}

/**
 * @param count   how many rows the list has
 * @param on      false draws every row (short lists stay exactly as they were)
 * @param estimate a first guess at one row's height (with its gap), in pixels
 */
export function useWindow<S extends HTMLElement = HTMLElement, E extends HTMLElement = HTMLElement>(count: number, on: boolean, estimate: number, overscan = 6): Windowed<S, E> {
  const top = useRef<S | null>(null);
  const bottom = useRef<E | null>(null);
  const avg = useRef(estimate);
  const first = Math.min(count, 24);
  const [range, setRange] = useState<[number, number]>([0, first]);
  const cur = useRef(range);
  cur.current = range;

  const measure = useCallback(() => {
    const a = top.current;
    const b = bottom.current;
    if (!on || !a || !b) return;
    const [s, e] = cur.current;
    const drawn = e - s;
    const between = b.getBoundingClientRect().top - a.getBoundingClientRect().bottom;
    if (drawn > 0 && between > 0) avg.current = Math.max(12, between / drawn);
    const scroller = scrollerOf(a.parentElement);
    const view = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
    const vTop = Math.max(view.top, 0);
    const vBottom = Math.min(view.bottom, window.innerHeight);
    // Where row 0 would sit: the top of the upper spacer.
    const origin = a.getBoundingClientRect().top;
    const h = avg.current;
    let ns = Math.floor((vTop - origin) / h) - overscan;
    let ne = Math.ceil((vBottom - origin) / h) + overscan;
    ns = Math.max(0, Math.min(ns, count));
    ne = Math.max(ns, Math.min(count, Math.max(ne, ns + 1)));
    if (ns !== s || ne !== e) setRange([ns, ne]);
  }, [on, count, overscan]);

  // Follow the scroll (once a frame) and the window's size.
  useEffect(() => {
    if (!on) return;
    let frame = 0;
    const tick = () => {
      if (!frame) frame = requestAnimationFrame(() => ((frame = 0), measure()));
    };
    const scroller = scrollerOf(top.current?.parentElement ?? null);
    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener('scroll', tick, { passive: true });
    window.addEventListener('resize', tick);
    if (scroller !== null && target !== window) window.addEventListener('scroll', tick, { passive: true });
    tick();
    return () => {
      cancelAnimationFrame(frame);
      target.removeEventListener('scroll', tick);
      window.removeEventListener('resize', tick);
      window.removeEventListener('scroll', tick);
    };
  }, [on, measure]);
  // A new count or a first draw: place the window again before the paint.
  useLayoutEffect(() => {
    if (on) measure();
  }, [on, count, measure]);

  const topRef = useCallback((el: S | null) => void (top.current = el), []);
  const bottomRef = useCallback((el: E | null) => void (bottom.current = el), []);
  if (!on) return { start: 0, end: count, before: 0, after: 0, topRef, bottomRef };
  const start = Math.min(range[0], count);
  const end = Math.min(Math.max(range[1], start), count);
  return { start, end, before: start * avg.current, after: (count - end) * avg.current, topRef, bottomRef };
}
