import { forwardRef, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react';
import type { Person } from '../../../shared/src/model';
import { useI18n } from '../lib/i18n';
import { dueState, type DueState } from '../lib/time';
import { Icon } from './icons';
import { formatDate } from '../lib/format';
import { useLeave } from '../lib/leave';
import { busyProps, useBusy } from '../lib/busy';

/** Avatar tones: --avatar-0 … --avatar-7 in styles.css. */
const AVATAR_TONES = 8;

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toLocaleUpperCase();
}

export function Avatar({ person, large }: { person?: Person; large?: boolean }) {
  const { t } = useI18n();
  const id = person?.id ?? '';
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const name = person?.name ?? t('common.unknownUser');
  return (
    // The initials are drawn by CSS (data-initials), not written as text: the avatar is an image named
    // after the person, so a control holding it is named by the names it shows (axe label-content-name-mismatch).
    <span className={`avatar${large ? ' avatar--l' : ''}`} data-tone={person ? h % AVATAR_TONES : 'none'} data-initials={person ? initials(person.name) : '?'} title={name} aria-label={name} role="img" />
  );
}

export function Avatars({ people, max = 3 }: { people: (Person | undefined)[]; max?: number }) {
  const shown = people.slice(0, max);
  return (
    <span className="avatars">
      {shown.map((p, i) => (
        <Avatar key={p?.id ?? i} person={p} />
      ))}
      {people.length > max && <span className="avatar avatar--more">+{people.length - max}</span>}
    </span>
  );
}

export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg className="sidebar__mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" className="mark__bg" />
      {/* A "C" (cura: care) whose open arc holds a dot (hold) — the name's story. */}
      <path d="M20.8 10.3A7.5 7.5 0 1 0 20.8 21.7" fill="none" className="mark__ink" strokeWidth="3" strokeLinecap="round" />
      <circle cx="16.5" cy="16" r="2.6" className="mark__dot" />
    </svg>
  );
}

export function DueLabel({ due, done }: { due: string | null; done: boolean }) {
  const { t, fmtDate } = useI18n();
  if (!due) return null;
  const state = dueState(due, done);
  const text = state === 'today' ? t('task.dueToday') : fmtDate(due);
  return (
    <span className={`due due--${state}`} title={state === 'late' ? t('task.overdue') : undefined}>
      {text}
      {state === 'late' && <span className="sr-only"> ({t('task.overdue')})</span>}
    </span>
  );
}

export function railState(due: string | null, done: boolean): DueState {
  return dueState(due, done);
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/**
 * Arrow-key handling for a role="tablist": put it on the list as onKeyDown, and give each
 * tab tabIndex={selected ? 0 : -1} (roving tabindex). Left/Right (reading direction aware),
 * Home and End move to a tab and select it.
 */
export function onTabKeys(e: ReactKeyboardEvent<HTMLElement>) {
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
  if (!keys.includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
  const tabs = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]:not([disabled])'));
  const at = tabs.indexOf(document.activeElement as HTMLElement);
  if (at < 0) return;
  const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
  const step = e.key === 'ArrowRight' ? (rtl ? -1 : 1) : e.key === 'ArrowLeft' ? (rtl ? 1 : -1) : e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (at + step + tabs.length) % tabs.length;
  e.preventDefault();
  tabs[next].focus();
  tabs[next].click();
}

/** Keeps Tab (and Shift+Tab) inside `box`: past the last control it comes round to the first. */
export function trapTab(e: KeyboardEvent, box: HTMLElement | null) {
  if (e.key !== 'Tab' || !box) return;
  const items = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
  if (!items.length) {
    e.preventDefault();
    box.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const at = document.activeElement;
  if (!at || !box.contains(at) || at === box) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  } else if (e.shiftKey && at === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && at === last) {
    e.preventDefault();
    first.focus();
  }
}

/** For a side panel that declares aria-modal: Tab stays in it (a dialog opened over it keeps its own focus). */
export function useFocusTrap(box: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.dialog:not([data-leaving])')) return;
      trapTab(e, box.current);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [box]);
}

export function Dialog({ title, children, onClose, footer, wide }: { title: string; children: ReactNode; onClose: () => void; footer?: ReactNode; wide?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const leave = useLeave<HTMLDivElement>();
  // The latest onClose, without re-running the focus effect on every render
  // (that would pull focus away from whatever the person is typing in).
  const close = useRef(onClose);
  close.current = onClose;
  // Who opened it, read while rendering: by the time the effect runs, a field's autoFocus has already
  // taken the focus, and closing must give it back to the opener (WCAG 2.4.3).
  const [opener] = useState(() => (typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null)));
  useEffect(() => {
    const prev = opener;
    // The first thing to type in; otherwise the first button of the dialog's own content.
    const first =
      box.current?.querySelector<HTMLElement>('.dialog__body input:not([type="hidden"]), .dialog__body select, .dialog__body textarea') ??
      box.current?.querySelector<HTMLElement>('.dialog__body button, .dialog__foot button') ??
      box.current?.querySelector<HTMLElement>('button');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
      else {
        // Only the topmost dialog holds the focus.
        const open = document.querySelectorAll('.dialog__box:not([data-leaving] *)');
        if (open[open.length - 1] === box.current) trapTab(e, box.current);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [opener]);
  return (
    <div className="dialog" ref={leave} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog__box${wide ? ' dialog__box--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="dlg-title" ref={box}>
        <div className="dialog__top">
          <h2 className="dialog__head" id="dlg-title">
            {title}
          </h2>
          <CloseButton onClick={onClose} />
        </div>
        <div className="dialog__body">{children}</div>
        {footer && <div className="dialog__foot">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * The one Close of every dialog, panel and sheet: at the end corner of its header, 44 × 44, with a visible
 * fill (never a bare cross that could be mistaken for, or sit flush against, a destructive button),
 * named "Close" and hinting at Esc. `onClick` closes. A ref reaches the button, for a panel that focuses it on opening.
 */
export const CloseButton = forwardRef<HTMLButtonElement, { onClick: () => void; label?: string }>(function CloseButton({ onClick, label }, ref) {
  const { t } = useI18n();
  const name = label ?? t('common.close');
  return (
    <button ref={ref} type="button" className="closex" onClick={onClick} aria-label={name} title={`${name} (Esc)`}>
      <Icon name="close" size={20} />
    </button>
  );
});

export function Confirm({ title, body, confirmLabel, danger, onConfirm, onClose, children }: { title: string; body: string; confirmLabel: string; danger?: boolean; onConfirm: () => void | Promise<void>; onClose: () => void; children?: ReactNode }) {
  const { t } = useI18n();
  const [busy, run] = useBusy();
  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--quiet" onClick={onClose}>
            <Icon name="close" size={16} />
            {t('common.cancel')}
          </button>
          <button
            className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`}
            disabled={busy === 'busy'}
            {...busyProps(busy)}
            onClick={() =>
              void run(async () => {
                await onConfirm();
                onClose();
              }).catch(() => undefined)
            }
          >
            <Icon name={danger ? 'alert' : 'check'} size={16} />
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="u-m-0">{body}</p>
      {children}
    </Dialog>
  );
}

export function PeoplePicker({ people, value, onChange, max = 10, label, disabled }: { people: Person[]; value: string[]; onChange: (ids: string[]) => void; max?: number; label: string; disabled?: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const pid = useId();
  const selected = value.map((id) => people.find((p) => p.id === id)).filter(Boolean) as Person[];
  const needle = q.trim().toLocaleLowerCase();
  const list = people.filter((p) => !needle || p.name.toLocaleLowerCase().includes(needle) || p.email.includes(needle));
  return (
    <div className="picker" ref={ref}>
      <span id={`${pid}l`} hidden>
        {label}
      </span>
      {/* Named "field, value": the field's name first, then what the button shows. */}
      <button type="button" id={pid} className="picker__button" aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${pid}l ${pid}`} disabled={disabled} onClick={() => setOpen((o) => !o)}>
        {selected.length ? (
          <>
            {/* The faces repeat the names that follow: hidden from the name, so it says what the button shows. */}
            <span aria-hidden="true" className="u-display-flex">
              <Avatars people={selected} max={4} />
            </span>
            <span className="u-overflow-hidden u-text-overflow-ellipsis u-white-space-nowrap">{selected.map((p) => p.name).join(', ')}</span>
          </>
        ) : (
          <span className="muted">{t('task.unassigned')}</span>
        )}
      </button>
      {open && (
        <div className="picker__pop" role="listbox" aria-multiselectable="true">
          <input className="input u-mb-4" autoFocus placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
          {list.map((p) => {
            const on = value.includes(p.id);
            return (
              <label key={p.id} className="picker__opt">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!on && value.length >= max}
                  onChange={() => onChange(on ? value.filter((x) => x !== p.id) : [...value, p.id])}
                />
                <Avatar person={p} />
                <span>{p.name}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function IconCheck() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="1.5" y="1.5" width="13" height="13" rx="3" />
      <path d="M4.5 8.2l2.3 2.3 4.7-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconComment() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" strokeLinejoin="round" />
    </svg>
  );
}

/** A "more" button (⋯) with a short list of actions for one row. */
export function RowMenu({ label, items }: { label: string; items: { label: string; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="rowmenu" ref={ref}>
      <button type="button" className="btn btn--quiet btn--icon" aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label} onClick={() => setOpen((o) => !o)}>
        <Icon name="more" size={18} />
      </button>
      {open && (
        <div className="rowmenu__pop" role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              className={it.danger ? 'rowmenu__item rowmenu__item--danger' : 'rowmenu__item'}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One currency per screen: under a list whose amounts were converted (marked "≈"), the
 * currency they are shown in and the date of the rates used.
 */
export function ConvertedNote({ currency, ratesAt }: { currency: string; ratesAt?: string | null }) {
  const { t, locale } = useI18n();
  return (
    <p className="convertednote">
      <span aria-hidden="true">≈ </span>
      {ratesAt ? t('convert.note', { currency, date: formatDate(ratesAt, locale, { day: 'numeric', month: 'long', year: 'numeric' }) }) : t('convert.noteNoDate', { currency })}
    </p>
  );
}
