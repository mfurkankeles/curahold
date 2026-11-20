// Every button that shows only an icon says what it does when the pointer or the keyboard reaches it:
// its accessible name (aria-label) becomes its tooltip, the first time it is hovered or focused, unless it
// already has one. One listener for the whole app, so no icon button can be left without (owner's rule:
// icon + label on every button; an icon-only button gets a tooltip and an aria-label).
let started = false;

/** True for a control that has a name but no visible words. */
function iconOnly(el: Element): el is HTMLElement {
  return el instanceof HTMLElement && !el.title && !!el.getAttribute('aria-label') && !el.textContent?.trim();
}

/** Starts the listener (idempotent); called once by main.tsx and the demo. */
export function startTooltips() {
  if (started || typeof document === 'undefined') return;
  started = true;
  const name = (e: Event) => {
    const el = (e.target as Element | null)?.closest?.('button, a[href], [role="button"]');
    if (el && iconOnly(el)) el.title = el.getAttribute('aria-label')!;
  };
  document.addEventListener('pointerover', name, { passive: true });
  document.addEventListener('focusin', name);
}
