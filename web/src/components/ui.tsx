import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Person } from '../../../shared/src/model';
import { useI18n } from '../lib/i18n';
import { dueState, type DueState } from '../lib/time';
import { Icon } from './icons';

const AVATAR_TONES = ['#2f6f73', '#8a5a2b', '#5b6aa0', '#7a4f7c', '#3f7a4c', '#9a4a3a', '#46667a', '#6b6b2f'];

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
    <span className={`avatar${large ? ' avatar--l' : ''}`} style={{ background: person ? AVATAR_TONES[h % AVATAR_TONES.length] : '#9aa7a9' }} title={name} aria-label={name} role="img">
      {person ? initials(person.name) : '?'}
    </span>
  );
}

export function Avatars({ people, max = 3 }: { people: (Person | undefined)[]; max?: number }) {
  const shown = people.slice(0, max);
  return (
    <span className="avatars">
      {shown.map((p, i) => (
        <Avatar key={p?.id ?? i} person={p} />
      ))}
      {people.length > max && <span className="avatar" style={{ background: '#74878a' }}>+{people.length - max}</span>}
    </span>
  );
}

export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg className="sidebar__mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" style={{ fill: 'var(--mark-bg, #eceafe)' }} />
      {/* A "C" (cura: care) whose open arc holds a dot (hold) — the name's story. */}
      <path d="M20.8 10.3A7.5 7.5 0 1 0 20.8 21.7" fill="none" style={{ stroke: 'var(--mark-ink, #191541)' }} strokeWidth="3" strokeLinecap="round" />
      <circle cx="16.5" cy="16" r="2.6" style={{ fill: 'var(--mark-dot, #5b4de8)' }} />
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

export function Dialog({ title, children, onClose, footer, wide }: { title: string; children: ReactNode; onClose: () => void; footer?: ReactNode; wide?: boolean }) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  // The latest onClose, without re-running the focus effect on every render
  // (that would pull focus away from whatever the person is typing in).
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    // The first thing to type in; otherwise the first button of the dialog's own content.
    const first =
      box.current?.querySelector<HTMLElement>('.dialog__body input:not([type="hidden"]), .dialog__body select, .dialog__body textarea') ??
      box.current?.querySelector<HTMLElement>('.dialog__body button, .dialog__foot button') ??
      box.current?.querySelector<HTMLElement>('button');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, []);
  return (
    <div className="dialog" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog__box${wide ? ' dialog__box--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="dlg-title" ref={box}>
        <div className="dialog__top">
          <h2 className="dialog__head" id="dlg-title">
            {title}
          </h2>
          <button type="button" className="btn btn--quiet btn--icon btn--small dialog__x" onClick={onClose} aria-label={t('common.close')} title={`${t('common.close')} (Esc)`}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="dialog__body">{children}</div>
        {footer && <div className="dialog__foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({ title, body, confirmLabel, danger, onConfirm, onClose }: { title: string; body: string; confirmLabel: string; danger?: boolean; onConfirm: () => void | Promise<void>; onClose: () => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--quiet" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{body}</p>
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
  const selected = value.map((id) => people.find((p) => p.id === id)).filter(Boolean) as Person[];
  const needle = q.trim().toLocaleLowerCase();
  const list = people.filter((p) => !needle || p.name.toLocaleLowerCase().includes(needle) || p.email.includes(needle));
  return (
    <div className="picker" ref={ref}>
      <button type="button" className="picker__button" aria-haspopup="listbox" aria-expanded={open} aria-label={label} disabled={disabled} onClick={() => setOpen((o) => !o)}>
        {selected.length ? (
          <>
            <Avatars people={selected} max={4} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.map((p) => p.name).join(', ')}</span>
          </>
        ) : (
          <span className="muted">{t('task.unassigned')}</span>
        )}
      </button>
      {open && (
        <div className="picker__pop" role="listbox" aria-multiselectable="true">
          <input className="input" autoFocus placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 4 }} />
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

/** A "⋯" button with a short list of actions for one row. */
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
        ⋯
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
