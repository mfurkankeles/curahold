// CuraAI: the product's own helper, kept in the corner of every screen like a
// chat. It answers from the docs on this device (shared/src/answers.ts); when
// an answer does not help, writing to support is one step away with the
// question already filled in. Closing it keeps the conversation: it is the
// same chat when it is opened again.
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n';
import { Icon } from './icons';
import { CloseButton } from './ui';

// The answering engine loads the first time the panel opens, not with the app.
const Ask = lazy(() => import('./Ask').then((m) => ({ default: m.Ask })));

/** The assistant's side panel: open, close and the conversation. */
export function CuraAI({
  open,
  lifted,
  unread = 0,
  onOpen,
  onClose,
  onWrite,
  onMine,
}: {
  open: boolean;
  /** On a phone the main menu sits at the bottom: the button stands above it. */
  lifted: boolean;
  /** Answers from support the person has not opened yet. */
  unread?: number;
  onOpen: () => void;
  onClose: () => void;
  onWrite: (question: string) => void;
  onMine: () => void;
}) {
  const { t } = useI18n();
  // The chat is built the first time it is opened and then kept, so its messages survive closing it.
  const [made, setMade] = useState(open);
  // Whether a model writes the answers here (the demo) or the docs do.
  const [model, setModel] = useState(false);
  const box = useRef<HTMLElement>(null);
  const fab = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open) setMade(true);
  }, [open]);
  // Closing plays a short exit (motion.css rules: exits are shorter than entries) before the chat is hidden;
  // the timer is the fallback for a browser that never reports the animation's end (reduced motion included).
  const [closing, setClosing] = useState(false);
  const shownBefore = useRef(open);
  useEffect(() => {
    if (open) {
      setClosing(false);
    } else if (shownBefore.current) {
      setClosing(true);
      const id = setTimeout(() => setClosing(false), 400);
      shownBefore.current = open;
      return () => clearTimeout(id);
    }
    shownBefore.current = open;
  }, [open]);
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      // On a phone, focusing the field brings the keyboard up over half the chat before anything is read.
      if (window.matchMedia?.('(pointer: coarse)').matches) return;
      const id = requestAnimationFrame(() => box.current?.querySelector<HTMLInputElement>('.ask__form input')?.focus());
      return () => cancelAnimationFrame(id);
    }
    // Closed with the keyboard: focus returns to the button that opens it.
    if (wasOpen.current) fab.current?.focus({ preventScroll: true });
    wasOpen.current = false;
  }, [open]);
  // On a phone the keyboard covers the bottom of the screen. Keep the chat in exactly what is still
  // visible, so its title stays on top and the field stays above the keys instead of sliding away.
  useEffect(() => {
    const vv = window.visualViewport;
    const el = box.current;
    if (!open || !made || !vv || !el) return;
    const fit = () => {
      if (window.innerWidth > 860) {
        el.style.removeProperty('top');
        el.style.removeProperty('bottom');
        el.style.removeProperty('height');
        return;
      }
      el.style.top = `${Math.max(0, vv.offsetTop)}px`;
      el.style.bottom = 'auto';
      el.style.height = `${vv.height}px`;
    };
    fit();
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    return () => {
      vv.removeEventListener('resize', fit);
      vv.removeEventListener('scroll', fit);
      el.style.removeProperty('top');
      el.style.removeProperty('bottom');
      el.style.removeProperty('height');
    };
  }, [open, made]);
  // The button never sits on what the person is working with, on a phone or a desktop: it steps aside while
  // they type (the field is what matters) and while they scroll down through a page or a list, and it is back
  // as soon as they scroll up, reach the end of the page (which ends above it, .page padding) or stop typing.
  const [away, setAway] = useState(false);
  useEffect(() => {
    const seen = new WeakMap<Element, number>();
    const typing = () => {
      const a = document.activeElement;
      return !!a && !box.current?.contains(a) && a.matches('textarea, select, [contenteditable="true"], input:not([type=checkbox], [type=radio], [type=button], [type=submit], [type=range], [type=color])');
    };
    const onScroll = (e: Event) => {
      const el = e.target instanceof Element ? e.target : document.scrollingElement;
      if (!el || box.current?.contains(el)) return;
      const y = el.scrollTop;
      const before = seen.get(el);
      seen.set(el, y);
      if (before === undefined || Math.abs(y - before) < 6) return; // the first event, or a sideways scroll
      const atEnd = el.classList.contains('page') && y + el.clientHeight >= el.scrollHeight - 8;
      setAway(typing() || (y > before && !atEnd));
    };
    const onFocus = () => setAway(typing());
    const onBlur = () => requestAnimationFrame(onFocus);
    // A new screen starts at its top: the button is back.
    const onMove = () => setAway(false);
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onBlur);
    window.addEventListener('popstate', onMove);
    window.addEventListener('app:navigate', onMove);
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', onBlur);
      window.removeEventListener('popstate', onMove);
      window.removeEventListener('app:navigate', onMove);
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && box.current?.contains(document.activeElement)) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      {!open && (
        <button ref={fab} type="button" className="cura__fab" data-lifted={lifted || undefined} data-away={away || undefined} aria-label={t('cura.open')} title={t('cura.open')} onClick={onOpen}>
          <span className="cura__mark">
            <Icon name="spark" size={20} />
          </span>
          <span className="cura__fabname">{t('cura.name')}</span>
          {unread > 0 && (
            <span className="cura__badge" aria-label={t('cura.unread', { n: unread })} title={t('cura.unread', { n: unread })}>
              {unread}
            </span>
          )}
        </button>
      )}
      {made && (
        <section
          ref={box}
          className="cura"
          data-lifted={lifted || undefined}
          data-closing={(!open && closing) || undefined}
          hidden={!open && !closing}
          role="dialog"
          aria-label={t('cura.name')}
          onAnimationEnd={(e) => e.target === box.current && !open && setClosing(false)}
        >
          <header className="cura__head">
            <span className="cura__mark cura__mark--head">
              <Icon name="spark" size={18} />
            </span>
            <div className="cura__who">
              <strong>{t('cura.name')}</strong>
              <span>{t(model ? 'cura.sub.ai' : 'cura.sub')}</span>
            </div>
            {/* Minimize and Close both keep the conversation; Close is the one every popup has (44 x 44, end corner, Esc). */}
            <button type="button" className="cura__tool" aria-label={t('cura.minimize')} title={t('cura.minimize')} onClick={onClose}>
              <Icon name="chevronDown" size={20} />
            </button>
            <CloseButton onClick={onClose} />
          </header>
          <Suspense fallback={<div className="cura__wait" />}>
            <Ask onWrite={onWrite} onEngine={setModel} />
          </Suspense>
          <footer className="cura__foot">
            <span>{t('cura.person')}</span>
            <button type="button" className="cura__write" onClick={() => onWrite('')}>
              <Icon name="send" size={15} />
              {t('ask.write')}
            </button>
            <button type="button" className="cura__write cura__mine" onClick={onMine}>
              <Icon name="inbox" size={15} />
              {t('help.tab.mine')}
              {unread > 0 && <span className="cura__badge cura__badge--tool">{unread}</span>}
            </button>
          </footer>
        </section>
      )}
    </>
  );
}
