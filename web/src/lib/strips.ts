// Strips of tabs that scroll sideways on a phone (.tabs, .record-tabs): the chosen tab is always fully
// in view, past the strip's faded edge — when a screen opens on it, and when the person picks one (a tap,
// the arrow keys, a link) that was half under the edge. One observer for every strip, started by the shell;
// a strip the person scrolled by hand stays where they left it until the choice changes.
const STRIP = '.tabs, .record-tabs';
const CHOSEN = '[aria-selected="true"], [aria-current="page"]';
const FADE = 40; // px, the width of the fade (styles.css, strip-edges)

function reveal(tab: Element | null) {
  const strip = tab?.closest<HTMLElement>(STRIP);
  if (!tab || !strip || strip.scrollWidth <= strip.clientWidth + 1) return;
  const s = strip.getBoundingClientRect();
  const b = tab.getBoundingClientRect();
  if (b.left < s.left + FADE) strip.scrollBy({ left: b.left - s.left - FADE });
  else if (b.right > s.right - FADE) strip.scrollBy({ left: b.right - s.right + FADE });
}

export function startStrips(): () => void {
  const seen = new WeakSet<Element>();
  const fresh = (root: Element) => {
    const strips = root.matches(STRIP) ? [root] : [...root.querySelectorAll(STRIP)];
    for (const strip of strips) {
      if (seen.has(strip)) continue;
      seen.add(strip);
      reveal(strip.querySelector(CHOSEN));
    }
  };
  // New parts of the page are looked through when the browser is idle, never in the middle of answering a tap.
  const later: Element[] = [];
  let queued = false;
  const idle = (fn: () => void) => ('requestIdleCallback' in window ? window.requestIdleCallback(fn, { timeout: 300 }) : setTimeout(fn, 50));
  const flush = () => {
    queued = false;
    for (const n of later.splice(0)) if (n.isConnected) fresh(n);
  };
  const mo = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'attributes') {
        if (m.target instanceof Element && m.target.matches(CHOSEN)) reveal(m.target);
      } else for (const n of m.addedNodes) if (n instanceof Element && n.firstElementChild) later.push(n);
    }
    if (later.length && !queued) {
      queued = true;
      idle(flush);
    }
  });
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-selected', 'aria-current'] });
  fresh(document.body);
  return () => mo.disconnect();
}
