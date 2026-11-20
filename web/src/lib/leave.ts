// Exit animations for whatever closes: dialogs, side panels, menus, popovers, sheets and toasts.
// React takes a closed element out of the page at once, so nothing could animate on the way out
// (the interface felt abrupt). Here a closing element leaves a stand-in where it was: a copy that
// keeps its scroll position and field values, carries `data-leaving`, plays the exit written in
// motion.css (100–150 ms, docs/design/tokens.md "Motion") and then removes itself. The copy cannot be
// focused or clicked (`inert`), is hidden from screen readers and holds no ids, so focus return,
// aria-labelledby and the a11y checks only ever see the real interface.
import { useCallback, useRef, type MutableRefObject, type RefObject } from 'react';

/** The longest a stand-in may stay, in case the browser never reports the animation finished (the loader's hold of up to 400 ms + its fade). */
const LONGEST_MS = 700;

/** Every stand-in on screen right now (tests and screens that look for an open dialog skip them with `:not([data-leaving])`). */
export const LEAVING = '[data-leaving]';

/** Leaves a stand-in of `node` in its place for its exit animation. Call while `node` is still in the page. */
export function leaveFrom(node: HTMLElement) {
  const parent = node.parentNode;
  if (!parent || !node.isConnected || typeof queueMicrotask !== 'function') return;
  const next = node.nextSibling;
  const ghost = node.cloneNode(true) as HTMLElement;
  // What a copy does not carry: field values typed since the last render and where each list was scrolled.
  const from = [node, ...node.querySelectorAll<HTMLElement>('*')];
  const to = [ghost, ...ghost.querySelectorAll<HTMLElement>('*')];
  const scrolled: [HTMLElement, number, number][] = [];
  for (let i = 0; i < from.length; i++) {
    const a = from[i];
    const b = to[i];
    if (!b) break;
    if (a.scrollTop || a.scrollLeft) scrolled.push([b, a.scrollTop, a.scrollLeft]);
    if (a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement) {
      (b as HTMLInputElement).value = a.value;
      if (a instanceof HTMLInputElement) (b as HTMLInputElement).checked = a.checked;
    }
    if (b.id) b.removeAttribute('id');
  }
  // React removes the element right after this; the stand-in goes in only once it really has gone
  // (a development double render detaches and re-attaches the same element: then nothing happens).
  queueMicrotask(() => {
    if (node.isConnected || !parent.isConnected) return;
    ghost.setAttribute('data-leaving', '');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.removeAttribute('role');
    ghost.removeAttribute('aria-modal');
    ghost.inert = true;
    parent.insertBefore(ghost, next && next.parentNode === parent ? next : null);
    for (const [el, top, left] of scrolled) {
      el.scrollTop = top;
      el.scrollLeft = left;
    }
    const running = ghost.getAnimations?.({ subtree: true }) ?? [];
    let gone = false;
    const remove = () => {
      if (gone) return;
      gone = true;
      ghost.remove();
    };
    if (!running.length) return remove();
    void Promise.all(running.map((a) => a.finished)).then(remove, remove);
    setTimeout(remove, LONGEST_MS);
  });
}

/**
 * A ref for an element that should animate out when it closes. Stable across renders, so it is
 * only told "gone" when the element really leaves; `also` receives the element too (for a
 * component that already keeps a ref to it).
 */
export function useLeave<T extends HTMLElement>(also?: RefObject<T>) {
  const last = useRef<T | null>(null);
  const keep = useRef(also);
  keep.current = also;
  return useCallback((node: T | null) => {
    if (keep.current) (keep.current as MutableRefObject<T | null>).current = node;
    if (node) last.current = node;
    else if (last.current) {
      leaveFrom(last.current);
      last.current = null;
    }
  }, []);
}
