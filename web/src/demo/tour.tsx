// Plays one guided tour over the live demo (see shared/src/tours.ts). The
// product underneath is the real one: the visitor can click anything at any
// moment, and the tour simply points at the next thing worth seeing. A step's
// element is found on the real screen; if it is not showing (a visitor who
// wandered off, a screen that changed), the step says so in the middle of the
// screen instead of leaving anyone stuck.
//
// The card carries data-tour-step and data-anchor="found|missing|none", which
// the browser check (tests/e2e/tours.ts) reads to prove every step still lands.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Tour, TourLang } from '../../../shared/src/tours';

export interface TourDeps {
  lang: TourLang;
  /** Moves the app to a screen. */
  go: (path: string) => void;
  /** The address where a workspace is started. */
  startFree: string;
  /** The page with every tour. */
  hub: string;
}

const UI = {
  en: {
    of: (n: number, m: number) => `${n} of ${m}`,
    next: 'Next',
    back: 'Back',
    finish: 'Finish',
    close: 'End the tour',
    clickHint: 'Click the highlighted part to go on.',
    missing: 'That part of the screen is not showing right now. Go on with Next — the product is all yours meanwhile.',
    endTitle: 'That was the real product',
    endBody: 'Everything you just saw runs in your browser, with invented data. Keep exploring on your own, or start a workspace for your team.',
    keep: 'Keep exploring',
    free: 'Start free',
    all: 'All tours',
  },
  tr: {
    of: (n: number, m: number) => `${n} / ${m}`,
    next: 'İleri',
    back: 'Geri',
    finish: 'Bitir',
    close: 'Turu kapat',
    clickHint: 'Devam etmek için vurgulanan yere tıkla.',
    missing: 'Ekranın o kısmı şu an görünmüyor. İleri ile devam et — bu arada ürün tamamen senin.',
    endTitle: 'Gördüğün gerçek üründü',
    endBody: 'Az önce gördüğün her şey tarayıcında, uydurma verilerle çalışıyor. Kendi başına gezmeye devam et ya da ekibin için bir çalışma alanı aç.',
    keep: 'Gezmeye devam et',
    free: 'Ücretsiz başla',
    all: 'Tüm turlar',
  },
};

const FIND_MS = 6000;
const PAD = 6;

/** The element on screen and big enough to point at, or null. */
function visible(selector: string): HTMLElement | null {
  let el: HTMLElement | null = null;
  try {
    el = document.querySelector<HTMLElement>(selector);
  } catch {
    return null;
  }
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? el : null;
}

const typing = () => {
  const a = document.activeElement as HTMLElement | null;
  return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable);
};

function TourCard({ tour, deps, onClose }: { tour: Tour; deps: TourDeps; onClose: () => void }) {
  const ui = UI[deps.lang];
  const steps = tour.steps;
  const [i, setI] = useState(0);
  const [el, setEl] = useState<HTMLElement | null>(null);
  // What was found, and for which step: a new step is "looking" from its very first frame.
  const [seen, setSeen] = useState<{ i: number; anchor: 'found' | 'missing' | 'none' }>({ i: -1, anchor: 'none' });
  const anchor = seen.i === i ? seen.anchor : 'looking';
  const setAnchor = (a: 'found' | 'missing' | 'none') => setSeen({ i, anchor: a });
  const [rect, setRect] = useState<DOMRect | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = useState({ w: 340, h: 200 });
  const done = i >= steps.length;
  const s = done ? null : steps[i];
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Each step: go to its screen, then find its element (it may take a moment to appear).
  useEffect(() => {
    setEl(null);
    setRect(null);
    if (!s) return;
    if (s.path) deps.go(s.path);
    // A shortcut pressed for the visitor (after the screen has changed), as if they had pressed it.
    if (s.press) setTimeout(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: s.press, bubbles: true })), s.path ? 300 : 80);
    if (!s.at) {
      setAnchor('none');
      return;
    }
    let alive = true;
    const started = Date.now();
    const look = () => {
      if (!alive) return;
      const found = visible(s.at!);
      if (found) {
        const r = found.getBoundingClientRect();
        if (r.top < 64 || r.bottom > innerHeight - 24) found.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
        setEl(found);
        setAnchor('found');
        return;
      }
      if (Date.now() - started > FIND_MS) setAnchor('missing');
      else setTimeout(look, 120);
    };
    // Let the screen change first.
    setTimeout(look, s.path || s.press ? 400 : 60);
    return () => {
      alive = false;
    };
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the spotlight on its element while the page scrolls or redraws.
  useEffect(() => {
    if (!el) return;
    let raf = 0;
    const tick = () => {
      if (!el.isConnected) {
        setRect(null);
        const again = s?.at ? visible(s.at) : null;
        if (again) setEl(again);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect((old) => (old && old.x === r.x && old.y === r.y && old.width === r.width && old.height === r.height ? old : r));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [el]); // eslint-disable-line react-hooks/exhaustive-deps

  // A step the visitor does themselves: their click on the element moves the tour on.
  useEffect(() => {
    if (!s?.click || !el) return;
    const on = (e: MouseEvent) => {
      if (el.contains(e.target as Node)) setTimeout(() => setI((n) => n + 1), 450);
    };
    document.addEventListener('click', on, true);
    return () => document.removeEventListener('click', on, true);
  }, [el, i]); // eslint-disable-line react-hooks/exhaustive-deps

  const next = useCallback(() => setI((n) => Math.min(n + 1, steps.length)), [steps.length]);
  const back = useCallback(() => setI((n) => Math.max(n - 1, 0)), []);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (typing()) return;
      else if (e.key === 'ArrowRight' && !s?.click) next();
      else if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [next, back, onClose, s]);

  useEffect(() => {
    const c = card.current;
    if (c) setCardSize({ w: c.offsetWidth, h: c.offsetHeight });
  }, [i, anchor, rect?.width]);

  // Where the card goes: beside the element if there is room, else below, above, or docked.
  const narrow = innerWidth < 700;
  let pos: React.CSSProperties = {};
  let side = 'center';
  if (done || !rect || narrow) {
    side = done || !rect ? 'center' : 'dock';
  } else {
    const gap = 14;
    const room = { right: innerWidth - rect.right, left: rect.left, below: innerHeight - rect.bottom, above: rect.top };
    const clampY = (y: number) => Math.max(12, Math.min(y, innerHeight - cardSize.h - 12));
    const clampX = (x: number) => Math.max(12, Math.min(x, innerWidth - cardSize.w - 12));
    if (room.right > cardSize.w + gap + 12) {
      side = 'right';
      pos = { left: rect.right + gap, top: clampY(rect.top + rect.height / 2 - cardSize.h / 2) };
    } else if (room.below > cardSize.h + gap + 12) {
      side = 'below';
      pos = { top: rect.bottom + gap, left: clampX(rect.left + rect.width / 2 - cardSize.w / 2) };
    } else if (room.above > cardSize.h + gap + 12) {
      side = 'above';
      pos = { top: rect.top - gap - cardSize.h, left: clampX(rect.left + rect.width / 2 - cardSize.w / 2) };
    } else if (room.left > cardSize.w + gap + 12) {
      side = 'left';
      pos = { left: rect.left - gap - cardSize.w, top: clampY(rect.top + rect.height / 2 - cardSize.h / 2) };
    } else side = 'dock';
  }

  const total = steps.length;
  return (
    <div className="tour" data-tour-id={tour.id}>
      {rect && !done ? (
        <div
          className="tour__spot"
          data-click={s?.click || undefined}
          style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
          aria-hidden="true"
        />
      ) : (
        <div className="tour__dim" aria-hidden="true" />
      )}
      <div
        ref={card}
        className="tour__card"
        data-side={side}
        data-tour-step={done ? 'end' : i}
        data-anchor={done ? 'none' : anchor}
        role="dialog"
        aria-live="polite"
        aria-label={tour.title[deps.lang]}
        style={side === 'right' || side === 'left' || side === 'below' || side === 'above' ? pos : undefined}
      >
        {done ? (
          <>
            <h2 className="tour__title">{ui.endTitle}</h2>
            <p className="tour__body">{ui.endBody}</p>
            <div className="tour__end">
              <a className="tour__btn tour__btn--primary" href={deps.startFree} target="_blank" rel="noopener">
                {ui.free}
              </a>
              <button type="button" className="tour__btn" onClick={onClose}>
                {ui.keep}
              </button>
              <a className="tour__link" href={deps.hub}>
                ← {ui.all}
              </a>
            </div>
          </>
        ) : (
          <>
            <div className="tour__top">
              <span className="tour__count">{ui.of(i + 1, total)}</span>
              <span className="tour__name">{tour.title[deps.lang]}</span>
              <button type="button" className="tour__x" aria-label={ui.close} title={ui.close} onClick={onClose}>
                ×
              </button>
            </div>
            <div className="tour__bar" aria-hidden="true">
              <span style={{ width: `${((i + 1) / total) * 100}%` }} />
            </div>
            <h2 className="tour__title">{s!.title[deps.lang]}</h2>
            <p className="tour__body">{anchor === 'missing' ? ui.missing : s!.body[deps.lang]}</p>
            {s!.click && anchor === 'found' && <p className="tour__hint">{ui.clickHint}</p>}
            <div className="tour__nav">
              {i > 0 ? (
                <button type="button" className="tour__btn" onClick={back}>
                  {ui.back}
                </button>
              ) : (
                <a className="tour__link" href={deps.hub}>
                  ← {ui.all}
                </a>
              )}
              {(!s!.click || anchor !== 'found') && (
                <button type="button" className="tour__btn tour__btn--primary" onClick={next} autoFocus>
                  {i + 1 === total ? ui.finish : ui.next}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

let root: Root | null = null;

/** Plays a tour over the demo; playing another one replaces it. */
export function playTour(tour: Tour, deps: TourDeps) {
  let host = document.getElementById('tour');
  if (!host) {
    host = document.createElement('div');
    host.id = 'tour';
    document.body.appendChild(host);
  }
  if (!root) root = createRoot(host);
  const close = () => root?.render(<></>);
  root.render(<TourCard key={`${tour.id}-${Date.now()}`} tour={tour} deps={deps} onClose={close} />);
}
