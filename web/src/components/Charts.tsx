// Draws a report's result: one figure, bars, columns, a line, a ring, or a
// table. Plain HTML and SVG (no chart library): the shapes are simple, they
// take the palette's colours, and they grow in when the data lands.
import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import type { OptionColor } from '../../../shared/src/model';
import type { Bucket, ChartKind, ReportGroupRow, ReportResult, ReportUnit } from '../../../shared/src/reports';
import { useI18n } from '../lib/i18n';
import { useStore } from '../lib/store';
import { CountUp } from './CountUp';
import { EmptyState } from './Empty';
import { Icon } from './icons';
import { intlTag } from '../../../shared/src/i18n';
import { currencySign, formatDate, formatMoney, formatNumber, formatPercent } from '../lib/format';

type Ok = Extract<ReportResult, { kind: 'ok' }>;
/** How many chart slots the palette has (styles.css --series-1 … --series-8). */
export const SERIES_SLOTS = 8;
/**
 * The colour of a part: its own (a colour a person chose) or the next slot of the validated palette.
 * Slots are taken in order and never cycled: the order is what keeps neighbours apart for
 * colour-blind readers (docs/design/tokens.md "Chart colours"); a ninth part and beyond is "Other".
 */
export function paint(k: number, own?: OptionColor | null): { 'data-color'?: OptionColor; 'data-series'?: string } {
  if (own) return { 'data-color': own };
  return { 'data-series': k < SERIES_SLOTS ? String(k + 1) : 'other' };
}

/** How a report writes its figures: a value in its unit (money in the company's currency), a time bucket, a plain number. */
export function useReportFormat() {
  const { t, locale } = useI18n();
  const { me } = useStore();
  const tag = intlTag(locale);
  return useMemo(() => {
    const num = (v: number, digits = 1) => formatNumber(v, locale, { digits });
    const value = (v: number, unit: ReportUnit, compact = false): string => {
      if (unit === 'money') {
        return formatMoney(v, me.org.currency, locale, { compact });
      }
      if (unit === 'hours') return t('rb.unit.hours', { n: num(v) });
      if (unit === 'days') return t('rb.unit.days', { n: num(v) });
      if (compact && Math.abs(v) >= 10000) return formatNumber(v, locale, { compact: true });
      return num(v, unit === 'count' ? 0 : 1);
    };
    const bucket = (key: string, b: Bucket | null): string => {
      if (!b || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return key;
      const d = new Date(`${key}T00:00:00Z`);
      const opt = (o: Intl.DateTimeFormatOptions) => formatDate(key, locale, o);
      if (b === 'year') return String(d.getUTCFullYear());
      if (b === 'quarter') return `${t('rb.quarterShort', { n: Math.floor(d.getUTCMonth() / 3) + 1 })} ${String(d.getUTCFullYear()).slice(2)}`;
      if (b === 'month') return opt({ month: 'short', year: '2-digit' });
      return opt({ day: 'numeric', month: 'short' });
    };
    return { value, bucket, num };
  }, [t, tag, me.org.currency]);
}

/** A round upper bound for an axis, and the steps up to it. */
function axis(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const top = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

const pct = (v: number, of: number) => `${of > 0 ? Math.max(0, Math.min(100, (v / of) * 100)) : 0}%`;
const i = (n: number) => ({ '--i': n }) as CSSProperties;

/** What a chart's figures are, said above its axis: "Number of rows", "Amount (₺)", "Hours". */
function useUnitName() {
  const { t, locale } = useI18n();
  const { me } = useStore();
  return (unit: ReportUnit) => (unit === 'money' ? t('rb.axis.money', { currency: currencySign(me.org.currency, locale) }) : t(`rb.axis.${unit}` as const));
}

/**
 * Reading a chart's values one by one: with the pointer over a bar or a point, or with the
 * arrow keys once the chart has the focus (Home, End; Escape lets go). The value read is
 * written above the plot, where it never covers the bar it belongs to and is announced.
 */
function useReadout(n: number) {
  const [at, setAt] = useState<number | null>(null);
  const focused = useRef(false);
  const onKeyDown = (e: KeyboardEvent) => {
    const back = document.documentElement.dir === 'rtl';
    const cur = at ?? -1;
    let next: number;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') next = cur + ((e.key === 'ArrowRight') !== back ? 1 : -1);
    else if (e.key === 'ArrowDown') next = cur + 1;
    else if (e.key === 'ArrowUp') next = cur - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    else if (e.key === 'Escape' && at != null) {
      e.stopPropagation();
      return setAt(null);
    } else return;
    e.preventDefault();
    setAt(Math.max(0, Math.min(n - 1, next < 0 && cur < 0 ? 0 : next)));
  };
  return {
    at,
    plot: {
      tabIndex: 0,
      onKeyDown,
      onFocus: () => {
        focused.current = true;
      },
      onBlur: () => {
        focused.current = false;
        setAt(null);
      },
      onPointerLeave: (e: PointerEvent) => {
        if (e.pointerType === 'mouse' && !focused.current) setAt(null);
      },
    },
    item: (k: number) => ({ onPointerEnter: () => setAt(k), 'data-on': at === k || undefined, 'data-off': (at != null && at !== k) || undefined }),
  };
}

/** The line above a chart: what the figures are, and the value being read. */
function ChartTop({ unit, read }: { unit: string; read: string }) {
  return (
    <div className="charttop">
      <span className="charttop__unit">{unit}</span>
      <span className="charttop__read num" role="status">
        {read}
      </span>
    </div>
  );
}

/** The chart's figures as a table, for screen readers (the drawing itself is one image). */
function ChartTable({ r, label, unit, apart }: { r: Ok; label: (g: ReportGroupRow) => string; unit: string; apart?: boolean }) {
  const { t } = useI18n();
  const f = useReportFormat();
  const split = r.series.length > 0;
  return (
    <table className="sr-only">
      <caption>{t('rb.chartTable')}</caption>
      <thead>
        <tr>
          <td />
          {split ? r.series.map((s) => <th key={s.key} scope="col">{s.label}</th>) : null}
          {!(split && apart) && <th scope="col">{split ? t('rb.total') : unit}</th>}
        </tr>
      </thead>
      <tbody>
        {r.groups.map((g) => (
          <tr key={g.key}>
            <th scope="row">{label(g)}</th>
            {split ? r.series.map((s, si) => <td key={s.key}>{f.value(g.cells?.[si] ?? 0, r.unit)}</td>) : null}
            {!(split && apart) && <td>{f.value(g.value, r.unit)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** "Kurumsal · İyi 3 · İzlenmeli 2 — 5": a group's figures in one line. */
function readOf(r: Ok, g: ReportGroupRow | undefined, label: (g: ReportGroupRow) => string, value: (v: number) => string, total: string | null): string {
  if (!g) return '';
  if (!r.series.length) return `${label(g)}: ${value(g.value)}`;
  const parts = r.series.map((s, si) => (g.cells?.[si] || total === null ? `${s.label} ${value(g.cells?.[si] ?? 0)}` : null)).filter(Boolean);
  return `${label(g)}: ${[...parts, ...(total === null ? [] : [`${total} ${value(g.value)}`])].join(' · ')}`;
}

/**
 * A report's result drawn as asked: one figure, a gauge, a table of rows, or a chart with its switch to a table.
 * `apart`: the series are side by side and never added up (what came in, what got done).
 */
export function ReportChart({ result, chart, compact, goal, apart }: { result: ReportResult; chart: ChartKind; compact?: boolean; goal?: number; apart?: boolean }) {
  const { t } = useI18n();
  const f = useReportFormat();
  if (result.kind === 'missing') return <p className="pane__note">{t('rb.missing', { what: result.what.replace(/^\$/, '') })}</p>;
  const r = result;
  const label = (g: ReportGroupRow) => (r.bucket ? f.bucket(g.key, r.bucket) : g.label);

  // A gauge: the one figure against what it should reach (a figure without a goal stays a figure).
  if (chart === 'gauge' && goal && goal > 0) return <Gauge value={r.total} goal={goal} unit={r.unit} compact={compact} />;

  if (chart === 'number' || (!r.groups.length && !r.table)) {
    return (
      <div className="kpi">
        <strong className="kpi__value num">
          <CountUp value={r.total} format={(v) => f.value(v, r.unit, true)} />
        </strong>
        <span className="kpi__sub">{t('rb.fromRows', { n: f.num(r.matched, 0) })}</span>
      </div>
    );
  }

  if (r.table) return <RowsTable r={r} compact={compact} />;
  if (!r.groups.length || r.matched === 0) return <EmptyState compact icon="chart" title={t('rb.nothing')} />;
  if (chart === 'table') return <GroupTable r={r} label={label} />;
  const drawn =
    chart === 'donut' ? (
      <Donut r={r} label={label} compact={compact} />
    ) : chart === 'bar' ? (
      <Bars r={r} label={label} />
    ) : chart === 'line' ? (
      <Line r={r} label={label} compact={compact} />
    ) : (
      <Columns r={r} label={label} compact={compact} stacked={chart === 'stacked'} apart={apart} />
    );
  return <ChartOrTable table={<GroupTable r={r} label={label} apart={apart} />}>{drawn}</ChartOrTable>;
}

/**
 * A drawn chart with a switch to its figures as a table (and back): every value readable as text, by
 * anyone, without the pointer (docs/design/tokens.md "Chart colours"). The switch keeps its place.
 */
export function ChartOrTable({ table, children }: { table: ReactNode; children: ReactNode }) {
  const { t } = useI18n();
  const [asTable, setAsTable] = useState(false);
  return (
    <div className="chartview" data-table={asTable || undefined}>
      {asTable ? table : children}
      <button type="button" className="btn btn--small btn--quiet chartview__switch" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>
        <Icon name={asTable ? 'chart' : 'list'} size={14} />
        {t(asTable ? 'rb.asChart' : 'rb.asTable')}
      </button>
    </div>
  );
}

type Drawn = { r: Ok; label: (g: ReportGroupRow) => string; compact?: boolean };

function Legend({ r }: { r: Ok }) {
  if (!r.series.length) return null;
  return (
    <ul className="chartkey">
      {r.series.map((s, k) => (
        <li key={s.key}>
          <i {...paint(k, s.color)} /> {s.label}
        </li>
      ))}
    </ul>
  );
}

function Donut({ r, label, compact }: Drawn) {
  const { locale } = useI18n();
  const f = useReportFormat();
  const total = r.groups.reduce((n, g) => n + Math.max(0, g.value), 0) || 1;
  const R = 42;
  const C = 2 * Math.PI * R;
  let at = 0;
  return (
    <div className="donut" data-compact={compact || undefined}>
      <div className="donut__ring">
        <svg viewBox="0 0 120 120" role="img" aria-label={r.groups.map((g) => `${label(g)}: ${f.value(g.value, r.unit)}`).join(', ')}>
          <circle cx="60" cy="60" r={R} className="donut__track" />
          {r.groups.map((g, k) => {
            const len = (Math.max(0, g.value) / total) * C;
            const arc = <circle key={g.key} cx="60" cy="60" r={R} className="donut__arc" {...paint(k, g.color)} style={{ strokeDasharray: `${Math.max(0, len - 1.5)} ${C}`, strokeDashoffset: -at, ...i(k) }} />;
            at += len;
            return arc;
          })}
        </svg>
        <div className="donut__mid" aria-hidden="true">
          <strong className="num">{f.value(r.total, r.unit, true)}</strong>
        </div>
      </div>
      <ul className="donut__key">
        {r.groups.map((g, k) => (
          <li key={g.key}>
            <i {...paint(k, g.color)} />
            <span className="donut__label">{label(g)}</span>
            <b className="num">{f.value(g.value, r.unit, true)}</b>
            <span className="donut__pct num">{formatPercent((Math.max(0, g.value) / total) * 100, locale)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bars({ r, label }: Drawn) {
  const { t } = useI18n();
  const f = useReportFormat();
  const unit = useUnitName()(r.unit);
  const read = useReadout(r.groups.length);
  const split = r.series.length > 0;
  const colored = r.groups.some((g) => g.color);
  const max = Math.max(1e-9, ...r.groups.map((g) => g.value));
  const v = (n: number) => f.value(n, r.unit);
  return (
    <figure className="hbars">
      {split && <ChartTop unit={unit} read={readOf(r, read.at == null ? undefined : r.groups[read.at], label, v, t('rb.total'))} />}
      {/* Every row's label and figure are text already: the list reads well as it is; the arrows only light a row. */}
      <ul className="hbars__list" {...(split ? { ...read.plot, 'aria-label': t('rb.chartKeys') } : {})}>
        {r.groups.map((g, k) => (
          <li className="hbar" key={g.key} {...(split ? read.item(k) : {})}>
            <span className="hbar__label">{label(g)}</span>
            <span className="hbar__track" aria-hidden="true">
              <span className="hbar__fill" {...(split || !colored ? {} : paint(k, g.color))} style={{ width: pct(g.value, max) }}>
                {split && g.cells?.map((c, si) => (c > 0 ? <i key={si} {...paint(si, r.series[si]?.color)} style={{ flexGrow: c }} /> : null))}
              </span>
            </span>
            <b className="hbar__value num">{f.value(g.value, r.unit, true)}</b>
            {split && <span className="sr-only">{readOf(r, g, label, v, t('rb.total'))}</span>}
          </li>
        ))}
      </ul>
      <Legend r={r} />
    </figure>
  );
}

function Line({ r, label, compact }: Drawn) {
  const { t } = useI18n();
  const f = useReportFormat();
  const unit = useUnitName()(r.unit);
  const read = useReadout(r.groups.length);
  const split = r.series.length > 0;
  const lines = split ? r.series.map((s, si) => ({ key: s.key, label: s.label, paint: paint(si, s.color), points: r.groups.map((g) => g.cells?.[si] ?? 0) })) : [{ key: 'v', label: '', paint: {}, points: r.groups.map((g) => g.value) }];
  const ticks = axis(Math.max(0, ...lines.flatMap((l) => l.points)));
  const top = ticks[ticks.length - 1] || 1;
  const n = r.groups.length;
  const x = (k: number) => (n <= 1 ? 50 : (k / (n - 1)) * 100);
  const y = (v: number) => 100 - (v / top) * 100;
  // Labels under the axis: as many as fit (fewer on a small card), never two touching.
  const every = Math.max(1, Math.ceil(n / (compact ? 4 : 7)));
  const shown = (k: number) => k % every === 0 && (k === n - 1 || n - 1 - k >= every * 0.75 || every === 1);
  const v = (n: number) => f.value(n, r.unit);
  return (
    <figure className="linechart">
      <ChartTop unit={unit} read={readOf(r, read.at == null ? undefined : r.groups[read.at], label, v, t('rb.total'))} />
      <div className="vchart__axis" aria-hidden="true">
        {[...ticks].reverse().map((tv) => (
          <span key={tv}>{f.value(tv, r.unit, true)}</span>
        ))}
      </div>
      <div className="linechart__plot" style={{ '--rows': ticks.length - 1 } as CSSProperties} role="img" aria-label={t('rb.chartLabel', { n: f.num(n, 0) })} {...read.plot}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {lines.map((l) => {
            const d = l.points.map((pv, k) => `${k ? 'L' : 'M'}${x(k).toFixed(2)},${y(pv).toFixed(2)}`).join(' ');
            return (
              <g key={l.key} {...l.paint}>
                {!split && <path className="linechart__area" d={`${d} L${x(n - 1)},100 L${x(0)},100 Z`} />}
                <path className="linechart__path" d={d} />
              </g>
            );
          })}
        </svg>
        {/* One slice of the width per point, so the pointer reads the nearest one. */}
        <div className="linechart__hits">
          {r.groups.map((g, k) => (
            <span key={g.key} {...read.item(k)} />
          ))}
        </div>
        {read.at != null && <i className="linechart__rule" style={{ '--x': `${x(read.at)}%` } as CSSProperties} />}
        {(n <= 40 || read.at != null) &&
          lines.map((l) =>
            l.points.map((pv, k) => (n <= 40 || k === read.at ? <i key={`${l.key}${k}`} className="linechart__dot" {...l.paint} data-on={k === read.at || undefined} style={{ left: `${x(k)}%`, top: `${y(pv)}%`, ...i(k) }} /> : null)),
          )}
      </div>
      <div className="linechart__x" aria-hidden="true">
        {r.groups.map((g, k) =>
          shown(k) ? (
            <span key={g.key} data-thin={(k / every) % 2 !== 0 || undefined} data-edge={x(k) < 8 ? 'start' : x(k) > 92 ? 'end' : undefined} style={{ left: `${x(k)}%` }}>
              {label(g)}
            </span>
          ) : null,
        )}
      </div>
      <ChartTable r={r} label={label} unit={unit} />
      <Legend r={r} />
    </figure>
  );
}

function Columns({ r, label, compact, stacked: asked, apart }: Drawn & { stacked: boolean; apart?: boolean }) {
  const { t } = useI18n();
  const f = useReportFormat();
  const unit = useUnitName()(r.unit);
  const read = useReadout(r.groups.length);
  const split = r.series.length > 0;
  const stacked = asked && split;
  const colored = r.groups.some((g) => g.color);
  const peaks = r.groups.map((g) => (split && !stacked ? Math.max(0, ...(g.cells ?? [])) : g.value));
  const ticks = axis(Math.max(0, ...peaks));
  const top = ticks[ticks.length - 1] || 1;
  const many = r.groups.length > (compact ? 8 : 14);
  const every = Math.max(1, Math.ceil(r.groups.length / (compact ? 6 : 12)));
  const v = (n: number) => f.value(n, r.unit);
  return (
    <figure className="vchart" data-many={many || undefined}>
      <ChartTop unit={unit} read={readOf(r, read.at == null ? undefined : r.groups[read.at], label, v, apart ? null : t('rb.total'))} />
      <div className="vchart__axis" aria-hidden="true">
        {[...ticks].reverse().map((tv) => (
          <span key={tv}>{f.value(tv, r.unit, true)}</span>
        ))}
      </div>
      <div className="vchart__plot" style={{ '--rows': ticks.length - 1 } as CSSProperties} role="img" aria-label={t('rb.chartLabel', { n: f.num(r.groups.length, 0) })} {...read.plot}>
        {r.groups.map((g, k) => (
          <div className="vbar" key={g.key} style={i(k)} {...read.item(k)}>
            {stacked ? (
              <span className="vbar__fill vbar__fill--stack" style={{ height: pct(g.value, top) }}>
                {g.cells?.map((c, si) => (c > 0 ? <i key={si} {...paint(si, r.series[si]?.color)} style={{ flexGrow: c }} /> : null))}
                {!many && g.value > 0 && <b className="vbar__n num">{f.value(g.value, r.unit, true)}</b>}
              </span>
            ) : split ? (
              g.cells?.map((c, si) => <span key={si} className="vbar__fill" {...paint(si, r.series[si]?.color)} style={{ height: pct(c, top) }} />)
            ) : (
              <span className="vbar__fill" {...(colored ? paint(k, g.color) : {})} style={{ height: pct(g.value, top) }}>
                {!many && g.value > 0 && <b className="vbar__n num">{f.value(g.value, r.unit, true)}</b>}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="vchart__x" aria-hidden="true" data-time={r.bucket ? true : undefined}>
        {/* Time labels every few columns; on a narrow card every third one of those (data-thin, CSS). */}
        {r.groups.map((g, k) => (
          <span key={g.key} data-thin={(r.bucket && (k / every) % 3 !== 0) || undefined}>
            {!r.bucket || k % every === 0 ? label(g) : ''}
          </span>
        ))}
      </div>
      <ChartTable r={r} label={label} unit={unit} apart={apart} />
      <Legend r={r} />
    </figure>
  );
}

/**
 * A half ring that fills from the left as the figure nears its goal: green
 * once it is reached. The needle-free version: the filled arc is the reading.
 */
function Gauge({ value, goal, unit, compact }: { value: number; goal: number; unit: ReportUnit; compact?: boolean }) {
  const { t } = useI18n();
  const f = useReportFormat();
  const share = Math.max(0, Math.min(1, value / goal));
  const R = 50;
  const half = Math.PI * R;
  const reached = value >= goal;
  return (
    <div className="gauge" data-compact={compact || undefined} data-reached={reached || undefined}>
      <svg viewBox="0 0 120 68" role="img" aria-label={t('rb.gaugeLabel', { value: f.value(value, unit), goal: f.value(goal, unit) })}>
        <path d="M10 60 A50 50 0 0 1 110 60" className="gauge__track" />
        <path d="M10 60 A50 50 0 0 1 110 60" className="gauge__fill" style={{ strokeDasharray: `${share * half} ${half}` }} />
      </svg>
      <div className="gauge__mid">
        <strong className="num">
          <CountUp value={value} format={(v) => f.value(v, unit, true)} />
        </strong>
        <span className="gauge__goal">{t('rb.gaugeOf', { goal: f.value(goal, unit, true), pct: f.num(Math.round((value / goal) * 100), 0) })}</span>
      </div>
    </div>
  );
}

/** A report's groups as a table, each row's total drawn as a bar behind it. `apart`: the series are never added up, so no total. */
export function GroupTable({ r, label, apart }: { r: Ok; label: (g: ReportGroupRow) => string; apart?: boolean }) {
  const { t } = useI18n();
  const f = useReportFormat();
  // The total of each row also draws its size, so the big ones stand out without reading every number.
  const most = Math.max(1, ...r.groups.map((g) => Math.abs(g.value)));
  return (
    <div className="tablewrap rtable" tabIndex={0}>
      <table className="table">
        <thead>
          <tr>
            <th />
            {r.series.map((s) => (
              <th key={s.key} className="num">
                {s.label}
              </th>
            ))}
            {apart ? null : <th className="num">{r.series.length ? t('rb.total') : ''}</th>}
          </tr>
        </thead>
        <tbody>
          {r.groups.map((g) => (
            <tr key={g.key}>
              <td>{label(g)}</td>
              {r.series.map((s, si) => (
                <td key={s.key} className="num">
                  {g.cells?.[si] ? f.value(g.cells[si], r.unit) : '—'}
                </td>
              ))}
              {apart ? null : (
                <td className="num rtable__sum">
                  <span className="rtable__bar" style={{ width: `${(Math.abs(g.value) / most) * 100}%` }} aria-hidden="true" />
                  <b>{f.value(g.value, r.unit)}</b>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        {/* Column totals add up only for counts and sums; an average of averages would mislead. */}
        {r.series.length > 0 && (r.unit === 'count' || r.unit === 'money' || r.unit === 'hours' || r.unit === 'number') && (
          <tfoot>
            <tr className="rtable__total">
              <th>{t('rb.total')}</th>
              {r.series.map((s, si) => (
                <td key={s.key} className="num">
                  {f.value(r.groups.reduce((n, g) => n + (g.cells?.[si] ?? 0), 0), r.unit)}
                </td>
              ))}
              {apart ? null : (
                <td className="num">
                  <b>{f.value(r.total, r.unit)}</b>
                </td>
              )}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/** How many rows a list or summary draws at first; "Show more" adds twice as many. */
export const PAGE_ROWS = 100;

/** A report's rows as a list, the first hundred at once and more on request; `compact` (a dashboard panel) shows eight. */
export function RowsTable({ r, compact }: { r: Ok; compact?: boolean }) {
  const { t, fmtDate } = useI18n();
  const f = useReportFormat();
  const table = r.table!;
  // A long list draws its first rows and more on request: two thousand rows at once kept a big report from opening in time.
  const [limit, setLimit] = useState(PAGE_ROWS);
  if (!table.rows.length) return <EmptyState compact icon="list" title={t('rb.nothing')} />;
  const rows = table.rows.slice(0, compact ? 8 : limit);
  const left = compact ? 0 : table.rows.length - rows.length;
  const cell = (v: string | number | null, type: string) => {
    if (v == null || v === '') return <span className="muted">—</span>;
    if (type === 'date' && typeof v === 'string') return fmtDate(v);
    if (type === 'money') return f.value(Number(v), 'money');
    if (type === 'minutes') return f.value(Number(v), 'hours');
    if (type === 'days') return f.value(Number(v), 'days');
    return typeof v === 'number' ? f.num(v) : v;
  };
  return (
    <>
      <div className="tablewrap rtable" tabIndex={0}>
        <table className="table">
          <thead>
            <tr>
              {table.columns.map((c) => (
                <th key={c.key} className={['number', 'money', 'minutes', 'days'].includes(c.type) ? 'num' : undefined}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, k) => (
              <tr key={k}>
                {row.map((v, ci) => (
                  <td key={ci} className={['number', 'money', 'minutes', 'days'].includes(table.columns[ci].type) ? 'num' : undefined}>
                    {cell(v, table.columns[ci].type)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(table.more || rows.length < r.matched) && (
        <p className="rtable__more">
          {t('rb.showing', { shown: f.num(rows.length, 0), total: f.num(r.matched, 0) })}
          {left > 0 && (
            <button type="button" className="btn btn--small btn--quiet" onClick={() => setLimit((n) => n + PAGE_ROWS * 2)}>
              {t('rb.showMore', { n: f.num(Math.min(left, PAGE_ROWS * 2), 0) })}
            </button>
          )}
        </p>
      )}
    </>
  );
}
