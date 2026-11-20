// Moving between screens (docs/design/tokens.md "Motion"): a change of screen runs as one View
// Transition — the sidebar stays still, the main area cross-fades in 150 ms with an 8 px shift
// that follows the direction (Back comes from the other side) — and an item opened from a list
// grows into its page: the element marked `data-hero-key={id}` in the list and `data-hero={id}`
// on the page share one 280 ms morph, both ways. A task or record opened from a card or row in
// its panel (same screen, only the query changes) gets the same morph into the panel's title, on
// its own: the screen behind does not cross-fade, the panel slides in as usual, and closing is the
// panel's own exit. Where the browser has no View Transitions, or
// "reduce motion" is on, the screen simply changes. Called by lib/router.ts for every move.
//
// Back also finds the screen where it was left: its scroll position is filed under its step of
// history and put back (lib/kept.ts does the same for its filters).
import { flushSync } from 'react-dom';

/** How long a move waits for the opened item's page to show its title before cross-fading without it. */
const HERO_WAIT_MS = 200;
/** How long Back keeps trying to restore the scroll position while the list is still filling in. */
const RESTORE_MS = 1200;

type Dir = 'forward' | 'back' | 'none';
type ViewTransition = { finished: Promise<void>; ready: Promise<void>; updateCallbackDone: Promise<void> };
type Doc = Document & { startViewTransition?: (cb: () => Promise<void> | void) => ViewTransition };

const scrolls = new Map<string, { page: number; doc: number }>();
let lastClick: { el: Element; at: number } | null = null;

if (typeof document !== 'undefined') {
  // The item a person just picked from a list, to grow it into its page.
  document.addEventListener(
    'click',
    (e) => {
      const el = (e.target as Element | null)?.closest?.('[data-hero-key]');
      lastClick = el ? { el, at: performance.now() } : null;
    },
    true,
  );
}

const pageBox = () => document.querySelector<HTMLElement>('.main > .page');

function saveScroll(key: string) {
  scrolls.set(key, { page: pageBox()?.scrollTop ?? 0, doc: document.scrollingElement?.scrollTop ?? 0 });
}

/** Puts the scroll position back, again on each frame while the content is still growing (until a person scrolls). */
function restoreScroll(key: string) {
  const want = scrolls.get(key);
  if (!want || (!want.page && !want.doc)) return;
  const until = performance.now() + RESTORE_MS;
  let stop = false;
  const cancel = () => (stop = true);
  window.addEventListener('wheel', cancel, { once: true, passive: true });
  window.addEventListener('touchstart', cancel, { once: true, passive: true });
  window.addEventListener('keydown', cancel, { once: true });
  const tryIt = () => {
    if (stop) return;
    const box = pageBox();
    if (box) box.scrollTop = want.page;
    const doc = document.scrollingElement;
    if (doc) doc.scrollTop = want.doc;
    const there = (!box || Math.abs(box.scrollTop - want.page) < 2) && (!doc || Math.abs(doc.scrollTop - want.doc) < 2);
    if (!there && performance.now() < until) requestAnimationFrame(tryIt);
  };
  tryIt();
}

/**
 * Waits (at most HERO_WAIT_MS) for an element of the new screen to appear. Timers, not animation frames:
 * while a view transition waits for its update the browser draws no frames, so a frame callback never came.
 */
function waitFor(selector: string): Promise<HTMLElement | null> {
  return new Promise((done) => {
    const until = performance.now() + HERO_WAIT_MS;
    const look = () => {
      const el = document.querySelector<HTMLElement>(selector);
      if (el || performance.now() > until) done(el);
      else setTimeout(look, 16);
    };
    look();
  });
}

const cssId = (v: string) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(v) : v.replace(/["\\]/g, ''));

/**
 * Shows a move. `dir` is null when only the query changed on the same screen (no transition);
 * `run` re-renders the app at the new address; `keys` are the history steps left and reached.
 */
export function moveScreens(dir: Dir | null, run: () => void, keys: { from: string; to: string }, panel = false) {
  if (dir) saveScroll(keys.from);
  const doc = document as Doc;
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const back = dir === 'back';
  if (!dir && panel && !reduce && typeof doc.startViewTransition === 'function' && document.visibilityState !== 'hidden') return growIntoPanel(doc, run);
  if (!dir || reduce || !doc.startViewTransition || document.visibilityState === 'hidden') {
    run();
    if (back) restoreScroll(keys.to);
    return;
  }
  const root = document.documentElement;
  // The shared element of the old screen: the item just picked (forward), or the page's own title (back).
  const picked = lastClick && performance.now() - lastClick.at < 1000 && lastClick.el.isConnected ? (lastClick.el as HTMLElement) : null;
  const old = back ? document.querySelector<HTMLElement>('[data-hero]') : picked;
  const id = old ? (back ? old.dataset.hero : old.dataset.heroKey) : undefined;
  if (old && id) old.style.viewTransitionName = 'hero';
  lastClick = null;
  root.dataset.nav = back ? 'back' : 'forward';
  let shared: HTMLElement | null = null;
  const t = doc.startViewTransition(async () => {
    flushSync(run);
    if (old) old.style.viewTransitionName = '';
    if (id) {
      shared = await waitFor(back ? `[data-hero-key="${cssId(id)}"]` : `[data-hero="${cssId(id)}"]`);
      if (shared) shared.style.viewTransitionName = 'hero';
    }
    if (back) restoreScroll(keys.to);
  });
  // A transition the browser skips (another one started, the tab was hidden) rejects; the screen has changed anyway.
  const tidy = () => {
    delete root.dataset.nav;
    if (shared) shared.style.viewTransitionName = '';
  };
  t.finished.then(tidy, tidy);
  t.ready.catch(() => undefined);
  t.updateCallbackDone.catch(() => undefined);
}

/**
 * A task or record opened in its panel: the card or row just picked grows into the panel's title.
 * Only the hero moves (no `data-nav`, so the screen behind keeps still); without a picked item, or when
 * the title is not drawn within HERO_WAIT_MS, the panel simply opens.
 */
function growIntoPanel(doc: Doc, run: () => void) {
  const picked = lastClick && performance.now() - lastClick.at < 1000 && lastClick.el.isConnected ? (lastClick.el as HTMLElement) : null;
  lastClick = null;
  const id = picked?.dataset.heroKey;
  if (!picked || !id) return run();
  picked.style.viewTransitionName = 'hero';
  let shared: HTMLElement | null = null;
  const t = doc.startViewTransition!(async () => {
    flushSync(run);
    picked.style.viewTransitionName = '';
    shared = await waitFor(`.panel:not([data-leaving]) [data-hero="${cssId(id)}"]`);
    if (shared) shared.style.viewTransitionName = 'hero';
  });
  const tidy = () => {
    if (shared) shared.style.viewTransitionName = '';
  };
  t.finished.then(tidy, tidy);
  t.ready.catch(() => undefined);
  t.updateCallbackDone.catch(() => undefined);
}
