// Filters on a phone. A list screen's filters, sort and view switch sit inline in its
// toolbar on a desktop; on a phone (the app's phone width, 860 px — where the bottom
// bar appears) they fold into one "Filter" button that shows how many filters are on,
// and open in a sheet from the bottom with Clear and Apply. Filters work as they are
// changed (the list behind updates); Apply closes the sheet.
//
//   <FilterSheet search={<input …/>} count={n} onClear={reset}>
//     …the same controls the toolbar shows…
//   </FilterSheet>
//
// On a desktop it renders `search` and the children in place (a fragment), so the
// screen's own toolbar layout is untouched.
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useI18n } from '../lib/i18n';
import { Icon } from './icons';
import { trapTab, CloseButton } from './ui';
import { useLeave } from '../lib/leave';

export const PHONE = '(max-width: 860px)';

/** Whether a media query matches now, kept current. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (on) => {
      const m = matchMedia(query);
      m.addEventListener('change', on);
      return () => m.removeEventListener('change', on);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}
/** Whether the screen is phone-sized. */
export const usePhone = () => useMedia(PHONE);

/** Filters as an inline bar on desktop and a bottom sheet on phones, with the count and Clear. */
export function FilterSheet({ search, count, onClear, children, title, after }: { search?: ReactNode; count: number; onClear?: () => void; children: ReactNode; title?: string; after?: ReactNode }) {
  const phone = usePhone();
  const [open, setOpen] = useState(false);
  if (!phone)
    return (
      <>
        {search}
        {children}
        {after}
      </>
    );
  return (
    <>
      {search}
      <FilterButton count={count} open={open} onOpen={() => setOpen(true)} />
      {after}
      {open && (
        <Sheet title={title} count={count} onClear={onClear} onClose={() => setOpen(false)}>
          {children}
        </Sheet>
      )}
    </>
  );
}

function FilterButton({ count, open, onOpen }: { count: number; open: boolean; onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <button type="button" className="btn filtersheet__open" aria-haspopup="dialog" aria-expanded={open} data-on={count > 0 || undefined} onClick={onOpen} aria-label={count ? t('filters.buttonCount', { n: count }) : t('filters.button')}>
      <Icon name="filter" size={16} />
      {t('filters.button')}
      {/* A space between the word and its count, so the name read aloud contains the label as seen ("Filter 2"). */}
      {count > 0 && ' '}
      {count > 0 && (
        <span className="fcount num" aria-hidden="true">
          {count}
        </span>
      )}
    </button>
  );
}

/** A modal sheet from the bottom of a phone: title, the controls, Clear and Apply. */
function Sheet({ title, count, onClear, onClose, children }: { title?: string; count: number; onClear?: () => void; onClose: () => void; children: ReactNode }) {
  const leaveSheet = useLeave<HTMLDivElement>();
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const head = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('.filtersheet__body button, .filtersheet__body input, .filtersheet__body select')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // A menu open inside the sheet closes first (it handles Escape itself).
        if (box.current?.querySelector('[aria-expanded="true"]:not(.filtersheet__open)')) return;
        close.current();
      } else trapTab(e, box.current);
    };
    document.addEventListener('keydown', onKey);
    document.documentElement.dataset.sheet = 'open';
    return () => {
      document.removeEventListener('keydown', onKey);
      delete document.documentElement.dataset.sheet;
      prev?.focus?.();
    };
  }, []);
  return (
    <div ref={leaveSheet} className="filtersheet" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="filtersheet__box" role="dialog" aria-modal="true" aria-labelledby={head} ref={box}>
        <div className="filtersheet__head">
          <h2 className="filtersheet__title" id={head}>
            {title ?? t('filters.sheetTitle')}
          </h2>
          <CloseButton onClick={onClose} />
        </div>
        <div className="filtersheet__body">{children}</div>
        <div className="filtersheet__foot">
          {onClear && (
            <button type="button" className="btn btn--quiet" disabled={!count} onClick={onClear}>
              <Icon name="close" size={16} />
              {t('filters.clear')}
            </button>
          )}
          <button type="button" className="btn btn--primary filtersheet__apply" onClick={onClose}>
            <Icon name="check" size={16} />
            {t('filters.apply')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A labelled group inside the sheet (and a plain wrapper on a desktop). */
export function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  const phone = usePhone();
  if (!phone) return <>{children}</>;
  return (
    <div className="filtersheet__group" role="group" aria-label={label}>
      <span className="filtersheet__label" aria-hidden="true">
        {label}
      </span>
      {children}
    </div>
  );
}
