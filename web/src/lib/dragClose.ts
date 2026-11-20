// Drag-to-close for the sheets that rise from the bottom of a phone (filters, the date picker, the task and
// record panels). People expect to pull a bottom sheet down to put it away; until now only the Close button,
// the scrim and Esc did. The sheet follows the finger from its head (the grab bar), and on release it either
// closes — when pulled past a third of its height or flicked down — or settles back.
//
// Why it is built this way:
// - Only touch and pen start a drag. A mouse has the Close button and the scrim; a mouse drag on a desktop
//   would fight with selecting text. The keyboard is untouched: Esc and Tab are handled by each sheet.
// - The drag starts only from the sheet's head (`handle`), which has `touch-action: none` in CSS, so the
//   browser never claims the gesture for scrolling and the list inside the sheet still scrolls normally.
// - Closing goes through the same `onClose` as the Close button, so the stand-in from lib/leave.ts plays the
//   usual exit (motion.css `sheet-out`) — starting from where the finger let go, because the copy keeps the
//   offset it was dragged to (`--drag`, set on the element; a value from the pointer, not a style choice).
// - Reduce motion: the sheet does not follow the finger and does not spring back; a pull past the threshold
//   still closes it, with the 100 ms fade every closing element gets under reduce motion.
// - A drag swallows the click that would follow it, so letting go over a button in the head does not press it.
import { useEffect, useRef, type RefObject } from 'react';

/** A pull further than this share of the sheet's height closes it. */
const SHARE = 1 / 3;
/** A downward flick faster than this (px per ms) closes it, however short. */
const FLICK = 0.5;
/** Movement before a press becomes a drag, so a tap on a head button stays a tap. */
const SLOP = 8;

/** Where the task, record and date sheets rise from the bottom (motion.css; wider screens show a side panel or a popover). */
export const SHEET_PHONE = '(max-width: 600px)';

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Lets `box` be pulled down from `handle` (a selector inside it, default its head) and closes it with
 * `onClose` when let go far or fast enough. `on` turns it off (for example on a desktop, where the same
 * element is a side panel or a popover).
 */
export function useDragClose(box: RefObject<HTMLElement | null>, onClose: () => void, { handle, on = true }: { handle: string; on?: boolean }) {
  // Kept in a ref: callers pass a fresh arrow every render, and re-binding mid-drag would drop the gesture.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const el = box.current;
    if (!on || !el) return;
    let start: { id: number; y: number; x: number; t: number } | null = null;
    let dragging = false;
    let last = { y: 0, t: 0, v: 0 };
    const still = reduced();

    const set = (dy: number) => {
      if (still) return;
      el.style.setProperty('--drag', `${Math.max(0, dy)}px`);
    };
    const reset = () => {
      dragging = false;
      start = null;
      el.removeAttribute('data-dragging');
      if (still) return;
      // Spring back with a short transition, then drop the offset (data-settling carries the transition).
      el.setAttribute('data-settling', '');
      el.style.setProperty('--drag', '0px');
      const done = () => {
        el.removeAttribute('data-settling');
        el.style.removeProperty('--drag');
        el.removeEventListener('transitionend', done);
      };
      el.addEventListener('transitionend', done);
      setTimeout(done, 400);
    };

    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || !e.isPrimary) return;
      const target = e.target as Element | null;
      if (!target?.closest(handle) || target.closest('input, select, textarea, [contenteditable="true"]')) return;
      start = { id: e.pointerId, y: e.clientY, x: e.clientX, t: e.timeStamp };
      last = { y: e.clientY, t: e.timeStamp, v: 0 };
    };
    const move = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const dy = e.clientY - start.y;
      if (!dragging) {
        if (Math.abs(dy) < SLOP && Math.abs(e.clientX - start.x) < SLOP) return;
        // Sideways or upward first: not ours.
        if (dy <= 0 || Math.abs(e.clientX - start.x) > dy) {
          start = null;
          return;
        }
        dragging = true;
        el.setAttribute('data-dragging', '');
        el.removeAttribute('data-settling');
        el.setPointerCapture?.(e.pointerId);
      }
      const dt = e.timeStamp - last.t;
      if (dt > 0) last = { y: e.clientY, t: e.timeStamp, v: (e.clientY - last.y) / dt };
      set(dy);
    };
    const up = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      if (!dragging) {
        start = null;
        return;
      }
      const dy = e.clientY - start.y;
      const far = dy > el.getBoundingClientRect().height * SHARE;
      const fast = last.v > FLICK && dy > SLOP * 2;
      // Swallow the click the browser sends after a drag that ended on a button.
      const swallow = (c: Event) => {
        c.stopPropagation();
        c.preventDefault();
      };
      el.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => el.removeEventListener('click', swallow, { capture: true }), 0);
      if (far || fast) {
        // Keep the offset on the element: the stand-in copies it and its exit starts from there.
        start = null;
        dragging = false;
        close.current();
      } else reset();
    };
    const cancel = (e: PointerEvent) => {
      if (start && e.pointerId === start.id) (dragging ? reset() : (start = null));
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
    };
  }, [box, handle, on]);
}
