// The product's own date field (QUALITY.md: "Tarih seçici ürünün kendi bileşenidir").
// A text box that reads a date typed in the person's own format ("15.11.2026" in
// Turkish, "15/11/2026" in English, "2026/11/15" in Japanese, any digits), and a
// calendar beside it: a popover on a desktop, a sheet from the bottom on a phone
// (the same element; patterns.css decides by the width). Week start, month and
// weekday names and digits come from the language (Intl); min/max are kept.
//
// Keys in the calendar: arrows move a day / a week (mirrored right-to-left),
// Home/End go to the week's first/last day, Page Up/Down a month (with Shift a
// year), Enter or Space picks, Escape closes and gives focus back.
//
//   <DateField value={iso} onChange={setIso} label={t('task.due')} min={…} max={…} />
//   <DateField time value="2026-11-15T14:30" onChange={…} />          (date and time)
//   <DateRangeField from={a} to={b} onChange={({ from, to }) => …} />  (a period)
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
import { useI18n } from '../lib/i18n';
import { todayIso } from '../lib/time';
import { dayParts, formatDayLong, formatDayNumeric, formatInt, formatMonthYear, formatTime, isoDay, monthGrid, parseDay, parseTime, shiftDay, shiftMonth, weekdayNames, weekdayOf, weekStart } from '../lib/format';
import { useDismiss } from './Menus';
import { Icon } from './icons';
import { CloseButton } from './ui';
import { useLeave } from '../lib/leave';
import { SHEET_PHONE, useDragClose } from '../lib/dragClose';
import { useMedia } from './FilterSheet';

type Range = { from: string; to: string };

/** Why a day cannot be chosen, in words; null when it can. */
function rangeProblem(day: string, min: string | undefined, max: string | undefined, t: ReturnType<typeof useI18n>['t'], locale: ReturnType<typeof useI18n>['locale']): string | null {
  if (min && day < min.slice(0, 10)) return t('date.tooEarly', { min: formatDayNumeric(min, locale) });
  if (max && day > max.slice(0, 10)) return t('date.tooLate', { max: formatDayNumeric(max, locale) });
  return null;
}

/** The typed text of one day: shown formatted, read back on Enter, on leaving the box, or as soon as it is a whole date. */
function useDayText(value: string, onDay: (iso: string) => void, opts: { min?: string; max?: string; required?: boolean }) {
  const { t, locale } = useI18n();
  const shown = formatDayNumeric(value, locale);
  const [text, setText] = useState(shown);
  const [error, setError] = useState<string | null>(null);
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setText(shown);
  }, [shown]);
  const example = formatDayNumeric(`${todayIso().slice(0, 4)}-12-31`, locale);
  const read = (raw: string, final: boolean) => {
    if (!raw.trim()) {
      setError(null);
      if (final && !opts.required && value) onDay('');
      if (final && opts.required) setText(shown);
      return;
    }
    const day = parseDay(raw, locale, todayIso());
    // While typing, only a whole date (with its year) is taken: "15.11.2" is not 2002 yet.
    const whole = /\d{4}|^\D*\d{8}\D*$/.test(raw.replace(/[٠-٩۰-۹]/g, '0'));
    if (!day) {
      if (final) setError(t('date.invalid', { example }));
      return;
    }
    const problem = rangeProblem(day, opts.min, opts.max, t, locale);
    if (problem) {
      if (final || whole) setError(problem);
      return;
    }
    setError(null);
    if ((final || whole) && day !== value.slice(0, 10)) onDay(day);
    if (final) setText(formatDayNumeric(day, locale));
  };
  return {
    text,
    error,
    example,
    clearError: () => setError(null),
    props: {
      value: text,
      onFocus: (e: { target: { select: () => void } }) => {
        editing.current = true;
        // Arriving by keyboard: the date is selected, so typing replaces it.
        e.target.select();
      },
      onChange: (e: { target: { value: string } }) => {
        setText(e.target.value);
        read(e.target.value, false);
      },
      onBlur: () => {
        editing.current = false;
        read(text, true);
      },
    },
    commit: () => read(text, true),
  };
}

/** One day, or a day and a time of day. `value` is 'YYYY-MM-DD' (or 'YYYY-MM-DDTHH:mm' with `time`), '' for none. */
export function DateField({
  value,
  onChange,
  min,
  max,
  label,
  time,
  required,
  disabled,
  className,
  id,
  title,
}: {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  label?: string;
  time?: boolean;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
  title?: string;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const errId = useId();
  const day = value.slice(0, 10);
  const clock = time ? value.slice(11, 16) || '09:00' : '';
  const emit = (d: string, c = clock) => onChange(!d ? '' : time ? `${d}T${c || '09:00'}` : d);
  const text = useDayText(day, (d) => emit(d), { min, max, required });
  const [timeText, setTimeText] = useState(formatTime(clock, locale));
  const [timeError, setTimeError] = useState<string | null>(null);
  useEffect(() => setTimeText(formatTime(clock, locale)), [clock, locale]);
  const error = text.error ?? timeError;
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };
  useDismiss(wrap as RefObject<HTMLElement>, open, () => close(false));
  return (
    <span className={`datefield${className ? ` ${className}` : ''}`} data-time={time || undefined} ref={wrap} title={title}>
      <span className="datefield__box">
        <input
          id={id}
          className="input num datefield__input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={text.example}
          aria-label={label}
          aria-invalid={!!text.error || undefined}
          aria-describedby={error ? errId : undefined}
          disabled={disabled}
          required={required}
          {...text.props}
          onKeyDown={(e) => {
            if (e.key === 'Enter') text.commit();
            if (e.key === 'ArrowDown' && e.altKey) (e.preventDefault(), setOpen(true));
          }}
        />
        <button
          type="button"
          ref={button}
          className="btn btn--quiet btn--icon btn--small datefield__open"
          aria-label={label ? `${t('date.open')}: ${label}` : t('date.open')}
          aria-haspopup="dialog"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
        >
          <Icon name="calendar" size={16} />
        </button>
      </span>
      {time && (
        <input
          className="input num datefield__time"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={label ? `${label}: ${t('date.time')}` : t('date.time')}
          placeholder={formatTime('14:30', locale)}
          aria-invalid={!!timeError || undefined}
          aria-describedby={error ? errId : undefined}
          disabled={disabled}
          value={timeText}
          onChange={(e) => setTimeText(e.target.value)}
          onBlur={() => {
            const c = parseTime(timeText);
            if (!c) return setTimeError(t('date.timeInvalid', { example: formatTime('14:30', locale) }));
            setTimeError(null);
            setTimeText(formatTime(c, locale));
            if (day && c !== clock) emit(day, c);
          }}
        />
      )}
      {error && (
        <span className="datefield__error" id={errId} role="alert">
          {error}
        </span>
      )}
      {open && (
        <CalendarPop
          anchor={wrap}
          value={day}
          min={min}
          max={max}
          clearable={!required && !!day}
          onPick={(d) => {
            text.clearError();
            emit(d);
            close(true);
          }}
          onClose={close}
        />
      )}
    </span>
  );
}

/** A period: two days typed or picked in one calendar (first the start, then the end). */
export function DateRangeField({ from, to, onChange, min, max, labels, disabled, className }: { from: string; to: string; onChange: (r: Range) => void; min?: string; max?: string; labels?: { from?: string; to?: string }; disabled?: boolean; className?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const errId = useId();
  const fromText = useDayText(from, (d) => onChange({ from: d, to: to && d && to < d ? d : to }), { min, max: to || max });
  const toText = useDayText(to, (d) => onChange({ from, to: d }), { min: from || min, max });
  const error = fromText.error ?? toText.error;
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };
  useDismiss(wrap as RefObject<HTMLElement>, open, () => close(false));
  const field = (txt: typeof fromText, label: string) => (
    <input className="input num datefield__input" type="text" inputMode="numeric" autoComplete="off" placeholder={txt.example} aria-label={label} aria-invalid={!!txt.error || undefined} aria-describedby={error ? errId : undefined} disabled={disabled} {...txt.props} onKeyDown={(e) => e.key === 'Enter' && txt.commit()} />
  );
  return (
    <span className={`datefield datefield--range${className ? ` ${className}` : ''}`} ref={wrap}>
      <span className="datefield__box">
        {field(fromText, labels?.from ?? t('date.from'))}
        <span className="datefield__dash" aria-hidden="true">
          –
        </span>
        {field(toText, labels?.to ?? t('date.to'))}
        <button type="button" ref={button} className="btn btn--quiet btn--icon btn--small datefield__open" aria-label={t('date.open')} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={() => setOpen((o) => !o)}>
          <Icon name="calendar" size={16} />
        </button>
      </span>
      {error && (
        <span className="datefield__error" id={errId} role="alert">
          {error}
        </span>
      )}
      {open && (
        <CalendarPop
          anchor={wrap}
          value={from}
          range={{ from, to }}
          min={min}
          max={max}
          clearable={!!(from || to)}
          onPick={() => undefined}
          onRange={(r) => {
            fromText.clearError();
            toText.clearError();
            onChange(r);
            close(true);
          }}
          onClose={close}
        />
      )}
    </span>
  );
}

/** The month calendar itself, placed under (or over) the field; a bottom sheet on a phone. */
function CalendarPop({
  anchor,
  value,
  range,
  min,
  max,
  clearable,
  onPick,
  onRange,
  onClose,
}: {
  anchor: RefObject<HTMLElement | null>;
  value: string;
  range?: Range;
  min?: string;
  max?: string;
  clearable: boolean;
  onPick: (day: string) => void;
  onRange?: (r: Range) => void;
  onClose: (refocus: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const today = todayIso();
  const lo = min?.slice(0, 10);
  const hi = max?.slice(0, 10);
  const clamp = (d: string) => (lo && d < lo ? lo : hi && d > hi ? hi : d);
  const [focus, setFocus] = useState(() => clamp(dayParts(value) ? value : today));
  const [start, setStart] = useState<string | null>(null); // range: the first day picked, waiting for the second
  const [place, setPlace] = useState<{ x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const leaveScrim = useLeave<HTMLSpanElement>();
  const leaveBox = useLeave<HTMLDivElement>(box);
  // On a phone the picker is a bottom sheet with nothing to scroll, so the whole sheet is the handle.
  useDragClose(box, () => onClose(true), { handle: '.datepop', on: useMedia(SHEET_PHONE) });
  const grid = useRef<HTMLTableElement>(null);
  const headId = useId();
  const p = dayParts(focus)!;
  const month = isoDay(p.y, p.m, 1);
  const weeks = monthGrid(month, locale);
  const names = weekdayNames(locale);
  const rtl = document.documentElement.dir === 'rtl';

  // Under the field, or over it when there is no room below; kept inside the window.
  useLayoutEffect(() => {
    const a = anchor.current?.getBoundingClientRect();
    const me = box.current?.getBoundingClientRect();
    if (!a || !me) return;
    const below = a.bottom + 4 + me.height <= innerHeight - 8 || a.top - 4 - me.height < 8;
    const y = below ? a.bottom + 4 : a.top - 4 - me.height;
    const x0 = rtl ? a.right - me.width : a.left;
    setPlace({ x: Math.max(8, Math.min(x0, innerWidth - me.width - 8)), y: Math.max(8, y) });
  }, [anchor, rtl]);
  // The focused day keeps the keyboard focus as it moves, and takes it once the calendar is placed (visible).
  const placed = !!place;
  useEffect(() => {
    if (placed || matchMedia('(max-width: 600px)').matches) grid.current?.querySelector<HTMLButtonElement>(`button[data-day="${focus}"]`)?.focus({ preventScroll: true });
  }, [focus, placed]);

  const allowed = (d: string) => (!lo || d >= lo) && (!hi || d <= hi);
  const pick = (d: string) => {
    if (!allowed(d)) return;
    if (!onRange) return onPick(d);
    if (!start) return (setStart(d), setFocus(d));
    const [a, b] = d < start ? [d, start] : [start, d];
    onRange({ from: a, to: b });
  };
  const move = (d: string) => setFocus(clamp(d));
  const onKey = (e: ReactKeyboardEvent) => {
    const fwd = rtl ? -1 : 1;
    const wd = (weekdayOf(focus) - weekStart(locale) + 7) % 7;
    const by: Record<string, () => string> = {
      ArrowRight: () => shiftDay(focus, fwd),
      ArrowLeft: () => shiftDay(focus, -fwd),
      ArrowDown: () => shiftDay(focus, 7),
      ArrowUp: () => shiftDay(focus, -7),
      Home: () => shiftDay(focus, -wd),
      End: () => shiftDay(focus, 6 - wd),
      PageDown: () => shiftMonth(focus, e.shiftKey ? 12 : 1),
      PageUp: () => shiftMonth(focus, e.shiftKey ? -12 : -1),
    };
    if (by[e.key]) {
      e.preventDefault();
      move(by[e.key]());
    }
  };
  const lit = (d: string) => {
    const a = start ?? range?.from;
    const b = start ? null : range?.to;
    if (!a) return undefined;
    if (d === a || d === b) return 'end';
    return b && d > a && d < b ? 'in' : undefined;
  };
  const chosen = (d: string) => (range ? lit(d) === 'end' : d === value);

  return (
    <>
      <span ref={leaveScrim} className="datepop__scrim" aria-hidden="true" onMouseDown={() => onClose(false)} />
      <div
        ref={leaveBox}
        className="datepop"
        role="dialog"
        aria-labelledby={headId}
        data-placed={place ? '' : undefined}
        style={place ? ({ '--x': `${place.x}px`, '--y': `${place.y}px` } as CSSProperties) : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            e.preventDefault();
            onClose(true);
          }
        }}
      >
        <div className="datepop__head">
          <button type="button" className="btn btn--quiet btn--icon datepop__step" aria-label={t('date.prevMonth')} onClick={() => move(shiftMonth(focus, -1))}>
            <Icon name="chevronLeft" size={16} />
          </button>
          <span className="datepop__month" id={headId} aria-live="polite">
            {formatMonthYear(month, locale)}
          </span>
          <button type="button" className="btn btn--quiet btn--icon datepop__step" aria-label={t('date.nextMonth')} onClick={() => move(shiftMonth(focus, 1))}>
            <Icon name="chevronRight" size={16} />
          </button>
          {/* A visible Close at the end corner, as on every popup; Esc and picking a day close it too. */}
          <CloseButton onClick={() => onClose(true)} />
        </div>
        {onRange && <p className="datepop__hint" aria-live="polite">{t(start ? 'date.rangeLast' : 'date.rangeFirst')}</p>}
        <table className="datepop__grid" role="grid" aria-labelledby={headId} ref={grid} onKeyDown={onKey}>
          <thead>
            <tr>
              {names.map((n) => (
                <th key={n.long} scope="col" abbr={n.long}>
                  {n.short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w[0]}>
                {w.map((d) => {
                  const off = d.slice(0, 7) !== month.slice(0, 7);
                  return (
                    <td key={d} aria-selected={chosen(d)} data-lit={lit(d)}>
                      <button
                        type="button"
                        className="datepop__day num"
                        data-day={d}
                        data-off={off || undefined}
                        aria-label={formatDayLong(d, locale)}
                        aria-current={d === today ? 'date' : undefined}
                        aria-disabled={!allowed(d) || undefined}
                        tabIndex={d === focus ? 0 : -1}
                        onClick={() => pick(d)}
                      >
                        {formatInt(Number(d.slice(8)), locale)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="datepop__foot">
          {allowed(today) && (
            <button type="button" className="btn btn--small" onClick={() => (onRange ? move(today) : pick(today))}>
              <Icon name="calendar" size={16} />
              {t('date.today')}
            </button>
          )}
          {clearable && (
            <button type="button" className="btn btn--small btn--quiet" onClick={() => (onRange ? onRange({ from: '', to: '' }) : onPick(''))}>
              <Icon name="close" size={16} />
              {t('date.clear')}
            </button>
          )}
          <button type="button" className="btn btn--small btn--quiet datepop__done" onClick={() => onClose(true)}>
            <Icon name="check" size={16} />
            {t('date.done')}
          </button>
        </div>
      </div>
    </>
  );
}
