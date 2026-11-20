// One series over time, for the console's Today and the in-app metrics: a line
// (how something built up) or columns (how many each period). Values on the
// axis, the periods under it, the latest value read out above it; the pointer
// or the arrow keys read any other point, and a table carries every value for
// a screen reader. Plain HTML and SVG, drawn from the design system's tokens
// (surfaces/console.css). The shape follows the report charts
// (components/Charts.tsx), which need a company's store the console has not.
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import type { MetricPoint } from '../../../shared/src/metrics';
import type { Locale } from '../../../shared/src/i18n';
import { formatDate, formatMonth } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { Icon } from '../components/icons';

/** A round top for the axis and the steps up to it: 0, 250, 500 … never more than four steps. */
export function ticksFor(max: number): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const top = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

/** A period as the series names it: a month ("YYYY-MM") or a day or week ("YYYY-MM-DD"). */
export const periodOf = (t: string, locale: Locale): string =>
  /^\d{4}-\d{2}$/.test(t) ? formatMonth(t, locale, { short: true, year: true }) : formatDate(t, locale, { day: 'numeric', month: 'short' });

/** Space kept between two period names under the axis, and a name's width at the axis' text size (wide signs for CJK). */
const LABEL_GAP = 12;
const textWidth = (text: string) => [...text].reduce((w, ch) => w + (ch.codePointAt(0)! >= 0x2e80 ? 11 : 6.5), 0);

/** The width an element has, kept up to date (0 until it is laid out). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Which points get their period written under the axis: a steady step (every 2nd month, every 3rd…)
 * from the first, the smallest step whose names do not touch, and always the last; a regular one that
 * would touch the last gives way. A name near an edge is aligned to it (as drawn: under 10 % or over 90 %).
 */
export function labelled(names: string[], width: number, x: (k: number) => number): Set<number> {
  const n = names.length;
  if (n <= 1) return new Set([0]);
  const span = (k: number): [number, number] => {
    const p = (x(k) / 100) * width;
    const w = textWidth(names[k]);
    return x(k) < 10 ? [p, p + w] : x(k) > 90 ? [p - w, p] : [p - w / 2, p + w / 2];
  };
  const apart = (a: number, b: number) => span(a)[1] + LABEL_GAP <= span(b)[0];
  for (let step = 1; step < n; step++) {
    const ks: number[] = [];
    for (let k = 0; k < n - 1; k += step) ks.push(k);
    if (!ks.every((k, i) => i === 0 || apart(ks[i - 1], k))) continue;
    while (ks.length && !apart(ks[ks.length - 1], n - 1)) ks.pop();
    return new Set([...ks, n - 1]);
  }
  return new Set([n - 1]);
}

const pct = (v: number, of: number) => (of > 0 ? Math.max(0, Math.min(100, (v / of) * 100)) : 0);
const prop = (o: Record<string, string | number>) => o as CSSProperties;

/** One series drawn as a line or columns, read by pointer or arrows, with a switch to its values as a table. */
export function ConsoleChart({
  kind,
  points,
  label,
  value,
  tick,
  when,
}: {
  kind: 'line' | 'columns';
  points: MetricPoint[];
  /** What is drawn: the chart's name for a screen reader and the table's caption. */
  label: string;
  /** A value in full, for the reading and the table. */
  value: (v: number) => string;
  /** A value on the axis; `short` when every step is large enough to be written short (one style per axis). */
  tick: (v: number, short: boolean) => string;
  /** A period, as written under the axis and in the reading. */
  when: (t: string) => string;
}) {
  const [at, setAt] = useState<number | null>(null);
  const focused = useRef(false);
  const [xRef, width] = useWidth<HTMLDivElement>();
  const [asTable, setAsTable] = useState(false);
  const { t } = useI18n();
  const n = points.length;
  if (n === 0) return null;
  const ticks = ticksFor(Math.max(0, ...points.map((p) => p.v)));
  const top = ticks[ticks.length - 1] || 1;
  const short = ticks.length > 1 && ticks[1] >= 10_000;
  const line = kind === 'line';
  // A line runs edge to edge; a column stands in the middle of its slice.
  const x = (k: number) => (line ? (n <= 1 ? 50 : (k / (n - 1)) * 100) : ((k + 0.5) / n) * 100);
  const y = (v: number) => 100 - pct(v, top);
  const names = points.map((p) => when(p.t));
  const shown = labelled(names, width, x);
  const reading = points[at ?? n - 1];

  // Time runs left to right in every language (the chart keeps its direction), so the arrows do too.
  const onKeyDown = (e: KeyboardEvent) => {
    const cur = at ?? n;
    let next: number;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') next = cur + (e.key === 'ArrowRight' ? 1 : -1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    else if (e.key === 'Escape' && at != null) {
      e.stopPropagation();
      setAt(null);
      return;
    } else return;
    e.preventDefault();
    setAt(Math.max(0, Math.min(n - 1, next)));
  };
  const path = points.map((p, k) => `${k ? 'L' : 'M'}${x(k).toFixed(2)},${y(p.v).toFixed(2)}`).join(' ');

  return (
    <figure className="cchart" data-kind={kind} data-table={asTable || undefined}>
      <p className="cchart__read num" role="status">
        <span>{when(reading.t)}</span>
        <strong>{value(reading.v)}</strong>
      </p>
      <div className="cchart__axis" aria-hidden="true">
        {[...ticks].reverse().map((v) => (
          <span key={v}>{tick(v, short)}</span>
        ))}
      </div>
      <div
        className="cchart__plot"
        style={prop({ '--rows': ticks.length - 1 })}
        role="img"
        aria-label={label}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          setAt(null);
        }}
        onPointerLeave={(e: PointerEvent) => {
          if (e.pointerType === 'mouse' && !focused.current) setAt(null);
        }}
      >
        {line ? (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path className="cchart__area" d={`${path} L${x(n - 1)},100 L${x(0)},100 Z`} />
            <path className="cchart__line" d={path} />
          </svg>
        ) : (
          <div className="cchart__cols" aria-hidden="true">
            {points.map((p, k) => (
              <span key={p.t} className="cchart__col" data-on={at === k || undefined} data-off={(at != null && at !== k) || undefined}>
                <i style={prop({ '--h': `${pct(p.v, top)}%` })} />
              </span>
            ))}
          </div>
        )}
        {/* One slice of the width per point, so the pointer reads the nearest one. */}
        <div className="cchart__hits">
          {points.map((p, k) => (
            <span key={p.t} onPointerEnter={() => setAt(k)} onPointerDown={() => setAt(k)} />
          ))}
        </div>
        {line && at != null ? <i className="cchart__rule" style={prop({ '--x': `${x(at)}%` })} /> : null}
        {line ? <i className="cchart__dot" style={prop({ '--x': `${x(at ?? n - 1)}%`, '--y': `${y(reading.v)}%` })} /> : null}
      </div>
      <div className="cchart__x" aria-hidden="true" ref={xRef}>
        {points.map((p, k) =>
          shown.has(k) ? (
            <span key={p.t} data-edge={x(k) < 10 ? 'start' : x(k) > 90 ? 'end' : undefined} style={prop({ '--x': `${x(k)}%` })}>
              {names[k]}
            </span>
          ) : null,
        )}
      </div>
      <table className={asTable ? 'table cchart__table' : 'sr-only'}>
        <caption className={asTable ? 'sr-only' : undefined}>{label}</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.t}>
              <th scope="row">{when(p.t)}</th>
              <td className="num">{value(p.v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn btn--small btn--quiet cchart__switch" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>
        <Icon name={asTable ? 'chart' : 'list'} size={14} />
        {t(asTable ? 'rb.asChart' : 'rb.asTable')}
      </button>
    </figure>
  );
}
