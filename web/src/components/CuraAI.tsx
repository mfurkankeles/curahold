// CuraAI: the product's own helper, kept in the corner of every screen like a
// chat. It answers from the docs on this device (shared/src/answers.ts); when
// an answer does not help, writing to support is one step away with the
// question already filled in. Closing it keeps the conversation: it is the
// same chat when it is opened again.
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n';
import { Ask } from './Ask';
import { Icon } from './icons';

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
  const box = useRef<HTMLElement>(null);
  const fab = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open) setMade(true);
  }, [open]);
  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => box.current?.querySelector<HTMLInputElement>('.ask__form input')?.focus());
      wasOpen.current = true;
      return () => cancelAnimationFrame(id);
    }
    // Closed with the keyboard: focus returns to the button that opens it.
    if (wasOpen.current) fab.current?.focus({ preventScroll: true });
    wasOpen.current = false;
  }, [open]);
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
        <button ref={fab} type="button" className="cura__fab" data-lifted={lifted || undefined} aria-label={t('cura.open')} title={t('cura.open')} onClick={onOpen}>
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
        <section ref={box} className="cura" data-lifted={lifted || undefined} hidden={!open} role="dialog" aria-label={t('cura.name')}>
          <header className="cura__head">
            <span className="cura__mark cura__mark--head">
              <Icon name="spark" size={18} />
            </span>
            <div className="cura__who">
              <strong>{t('cura.name')}</strong>
              <span>{t('cura.sub')}</span>
            </div>
            <button type="button" className="cura__tool" aria-label={t('help.tab.mine')} title={t('help.tab.mine')} onClick={onMine}>
              <Icon name="inbox" size={18} />
              {unread > 0 && <span className="cura__badge cura__badge--tool">{unread}</span>}
            </button>
            <button type="button" className="cura__tool" aria-label={t('cura.minimize')} title={t('cura.minimize')} onClick={onClose}>
              <Icon name="chevronDown" size={18} />
            </button>
          </header>
          <Ask onWrite={onWrite} />
          <footer className="cura__foot">
            <span>{t('cura.person')}</span>
            <button type="button" className="cura__write" onClick={() => onWrite('')}>
              <Icon name="send" size={15} />
              {t('ask.write')}
            </button>
          </footer>
        </section>
      )}
    </>
  );
}
