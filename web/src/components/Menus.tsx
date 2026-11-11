// Small pop-up menus: the "+ New" menu and the person's own menu. Arrow keys
// move, Escape closes and gives focus back to the button that opened it.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Icon, type IconName } from './icons';

/** Closes a pop-up on a click outside it or on Escape. */
export function useDismiss(ref: RefObject<HTMLElement>, open: boolean, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | TouchEvent) => !ref.current?.contains(e.target as Node) && close.current();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), close.current());
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc, { passive: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, ref]);
}

export interface MenuItem {
  key: string;
  label: string;
  icon?: IconName;
  hint?: string;
  dot?: boolean;
  danger?: boolean;
  onSelect: () => void;
}

/** A button that opens a list of actions. */
export function MenuButton({
  label,
  button,
  items,
  header,
  footer,
  place = 'down',
  className,
  buttonClass = 'btn',
  title,
}: {
  label: string;
  button: ReactNode;
  items: (MenuItem | 'sep' | { key: string; node: ReactNode })[];
  header?: ReactNode;
  footer?: ReactNode;
  place?: 'down' | 'up' | 'down-end';
  className?: string;
  buttonClass?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };
  useDismiss(ref, open, () => close());
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);
  const onKey = (e: React.KeyboardEvent) => {
    const all = [...(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]') ?? [])];
    const i = all.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      all[(n + all.length) % all.length]?.focus();
    };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(all.length - 1);
    else if (e.key === 'Tab') close(false);
  };
  return (
    <div className={`menuwrap${className ? ` ${className}` : ''}`} ref={ref}>
      <button ref={trigger} type="button" className={buttonClass} aria-haspopup="menu" aria-expanded={open} aria-label={label} title={title} onClick={() => setOpen((o) => !o)}>
        {button}
      </button>
      {open && (
        <div className="popmenu" data-place={place} role="menu" aria-label={label} ref={list} onKeyDown={onKey}>
          {header}
          {items.map((it, i) =>
            it === 'sep' ? (
              <div key={`sep${i}`} className="popmenu__sep" role="separator" />
            ) : 'node' in it ? (
              <div key={it.key}>{it.node}</div>
            ) : (
              <button
                key={it.key}
                type="button"
                role="menuitem"
                className="popmenu__item"
                data-danger={it.danger || undefined}
                onClick={() => {
                  close(false);
                  it.onSelect();
                }}
              >
                {it.icon && <Icon name={it.icon} size={16} />}
                <span className="popmenu__label">{it.label}</span>
                {it.dot && <span className="popmenu__dot" aria-hidden="true" />}
                {it.hint && <kbd className="popmenu__kbd">{it.hint}</kbd>}
              </button>
            ),
          )}
          {footer}
        </div>
      )}
    </div>
  );
}

/** A row of choices inside a menu (theme, language): plain buttons, pressed state, no menu semantics needed. */
export function MenuChoices<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string; icon?: IconName }[]; onChange: (v: T) => void }) {
  return (
    <div className="popmenu__choices" role="group" aria-label={label}>
      <span className="popmenu__choiceslabel">{label}</span>
      <div className="popmenu__seg">
        {options.map((o) => (
          <button key={o.value} type="button" role="menuitemradio" aria-checked={value === o.value} title={o.label} onClick={() => onChange(o.value)}>
            {o.icon ? <Icon name={o.icon} size={15} label={o.label} /> : o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
