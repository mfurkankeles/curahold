// The brand loader and the route bar (docs/design/tokens.md "Loading"). The loader is the Curahold
// mark drawing itself: inline SVG + CSS, under 1.2 KB, sharp at any size, in the theme's colours,
// still under "reduce motion" (the mark and the word "Loading…" instead). No GIF: one would be
// 15–40 KB, 256 colours, rough-edged and impossible to pause. A view that waits for data shows its
// skeleton, never this; the loader is for the start, a whole-page wait and CuraAI thinking.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n';
import { leaveFrom } from '../lib/leave';
import { useLoadingNow } from '../lib/loading';
import { useAfter } from './Empty';

/** The shortest time the loader stays once it appeared, so it never blinks. */
const MIN_SHOWN_MS = 400;

/**
 * The brand loader. Shows nothing for the first 300 ms (`--wait`) unless `now`; once seen it stays
 * at least 400 ms (on its way out a stand-in holds the rest, lib/leave.ts), then fades.
 * `size` 16 for inline (CuraAI thinking), 48 for a whole page.
 */
export function Loader({ size = 48, now, label }: { size?: 16 | 24 | 48; now?: boolean; label?: string }) {
  const { t } = useI18n();
  const late = useAfter(300);
  const shown = now || late;
  const box = useRef<HTMLSpanElement | null>(null);
  const since = useRef(0);
  useEffect(() => {
    if (shown) since.current = performance.now();
  }, [shown]);
  // A layout effect: its clean-up runs while the element is still in the page, so it can leave a stand-in.
  useLayoutEffect(() => {
    const el = box.current;
    return () => {
      if (!el || !since.current) return;
      const hold = Math.max(0, MIN_SHOWN_MS - (performance.now() - since.current));
      el.style.setProperty('--hold', `${Math.round(hold)}ms`);
      leaveFrom(el);
    };
  }, []);
  const word = label ?? t('common.loading');
  return (
    // Only the whole-page loader speaks; a small one sits beside words that already say what is happening.
    <span ref={box} className="loader" data-size={size} data-on={shown || undefined} role={size === 48 ? 'status' : undefined} aria-label={size === 48 && shown ? word : undefined} aria-hidden={size === 48 ? undefined : true}>
      {shown && (
        <>
          <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
            <path className="loader__arc" d="M20.8 10.3A7.5 7.5 0 1 0 20.8 21.7" pathLength={100} />
            <circle className="loader__dot" cx="16.5" cy="16" r="2.6" />
          </svg>
          {size > 16 && <span className="loader__word">{word}</span>}
        </>
      )}
    </span>
  );
}

type Bar = 'idle' | 'run' | 'done';

/**
 * A 2 px brand line along the top while a screen or a part of it is loading (any skeleton or
 * route fallback on screen, lib/loading.ts): appears after --dur-2, creeps to 80 %, then fills
 * and fades when everything has arrived. A wait shorter than --dur-2 shows nothing.
 */
export function RouteBar() {
  const loading = useLoadingNow();
  const [bar, setBar] = useState<Bar>('idle');
  const [lit, setLit] = useState(false);
  useEffect(() => {
    if (loading) {
      const t = setTimeout(() => {
        setBar('run');
        // One frame at the start line first, so the creep animates from 0.
        requestAnimationFrame(() => requestAnimationFrame(() => setLit(true)));
      }, 150);
      return () => clearTimeout(t);
    }
    if (bar !== 'run') return;
    setBar('done');
    const t = setTimeout(() => {
      setBar('idle');
      setLit(false);
    }, 260);
    return () => clearTimeout(t);
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps
  if (bar === 'idle') return null;
  return <div className="routebar" data-state={bar === 'run' && !lit ? 'start' : bar} aria-hidden="true" />;
}
