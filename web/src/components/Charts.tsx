// Draws a report's result: one figure, bars, columns, a line, a ring, or a
// table. Plain HTML and SVG (no chart library): the shapes are simple, they
// take the palette's colours, and they grow in when the data lands.
import { useMemo, type CSSProperties } from 'react';
import type { OptionColor } from '../../../shared/src/model';
import type { Bucket, ChartKind, ReportGroupRow, ReportResult, ReportUnit } from '../../../shared/src/reports';
import { useI18n } from '../lib/i18n';
import { useStore } from '../lib/store';
import { CountUp } from './CountUp';
import { EmptyState } from './Empty';

type Ok = Extract<ReportResult, { kind: 'ok' }>;
/** Colours for parts that have none of their own, in an order that keeps neighbours apart. */
const CYCLE: OptionColor[] = ['sky', 'honey', 'plum', 'sea', 'coral', 'leaf', 'rose', 'stone'];
const colorAt = (i: number, own?: OptionColor | null): OptionColor => own ?? CYCLE[i % CYCLE.length];

export function useReportFormat() {
  const { t, locale } = useI18n();
  const { me } = useStore();
  const tag = locale === 'tr' ? 'tr-TR' : 'en-GB';
  return useMemo(() => {
    const num = (v: number, digits = 1) => new Intl.NumberFormat(tag, { maximumFractionDigits: digits }).format(v);
    const value = (v: number, unit: ReportUnit, compact = false): string => {
      if (unit === 'money') {
        try {
          const big = compact && Math.abs(v) >= 10000;
          return new Intl.NumberFormat(tag, { style: 'currency', currencyDisplay: 'narrowSymbol', currency: me.org.currency, maximumFractionDigits: big ? 1 : 0, notation: big ? 'compact' : 'standard' }).format(v);
        } catch {
          return num(v, 0);
        }
      }
      if (unit === 'hours') return t('rb.unit.hours', { n: num(v) });
      if (unit === 'days') return t('rb.unit.days', { n: num(v) });
      if (compact && Math.abs(v) >= 10000) return new Intl.NumberFormat(tag, { notation: 'compact', maximumFractionDigits: 1 }).format(v);
      return num(v, unit === 'count' ? 0 : 1);
    };
    const bucket = (key: string, b: Bucket | null): string => {
      if (!b || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return key;
      const d = new Date(`${key}T00:00:00Z`);
      const opt = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString(tag, { timeZone: 'UTC', ...o });
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

export function ReportChart({ result, chart, compact }: { result: ReportResult; chart: ChartKind; compact?: boolean }) {
  const { t } = useI18n();
  const f = useReportFormat();
  if (result.kind === 'missing') return <p className="pane__note">{t('rb.missing', { what: result.what.replace(/^\$/, '') })}</p>;
  const r = result;
  const label = (g: ReportGroupRow) => (r.bucket ? f.bucket(g.key, r.bucket) : g.label);

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

  const split = r.series.length > 0;
  const colored = r.groups.some((g) => g.color);
  const legend = split ? (
    <ul className="chartkey">
      {r.series.map((s, k) => (
        <li key={s.key}>
          <i data-color={colorAt(k, s.color)} /> {s.label}
        </li>
      ))}
    </ul>
  ) : null;

  if (chart === 'donut') {
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
              const arc = <circle key={g.key} cx="60" cy="60" r={R} className="donut__arc" data-color={colorAt(k, g.color)} style={{ strokeDasharray: `${Math.max(0, len - 1.5)} ${C}`, strokeDashoffset: -at, ...i(k) }} />;
              at += len;
              return arc;
            })}
          </svg>
          <div className="donut__mid">
            <strong className="num">{f.value(r.total, r.unit, true)}</strong>
          </div>
        </div>
        <ul className="donut__key">
          {r.groups.map((g, k) => (
            <li key={g.key}>
              <i data-color={colorAt(k, g.color)} />
              <span className="donut__label">{label(g)}</span>
              <b className="num">{f.value(g.value, r.unit, true)}</b>
              <span className="donut__pct num">{Math.round((Math.max(0, g.value) / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (chart === 'bar') {
    const max = Math.max(1e-9, ...r.groups.map((g) => g.value));
    return (
      <div className="hbars">
        <ul>
          {r.groups.map((g, k) => (
            <li className="hbar" key={g.key} title={`${label(g)}: ${f.value(g.value, r.unit)}`}>
              <span className="hbar__label">{label(g)}</span>
              <span className="hbar__track">
                <span className="hbar__fill" data-color={split ? undefined : colored ? colorAt(k, g.color) : undefined} style={{ width: pct(g.value, max) }}>
                  {split && g.cells?.map((v, si) => (v > 0 ? <i key={si} data-color={colorAt(si, r.series[si]?.color)} style={{ flexGrow: v }} title={`${r.series[si]?.label}: ${f.value(v, r.unit)}`} /> : null))}
                </span>
              </span>
              <b className="hbar__value num">{f.value(g.value, r.unit, true)}</b>
            </li>
          ))}
        </ul>
        {legend}
      </div>
    );
  }

  if (chart === 'line') {
    const lines = split ? r.series.map((s, si) => ({ key: s.key, label: s.label, color: colorAt(si, s.color), points: r.groups.map((g) => g.cells?.[si] ?? 0) })) : [{ key: 'v', label: '', color: null as OptionColor | null, points: r.groups.map((g) => g.value) }];
    const ticks = axis(Math.max(0, ...lines.flatMap((l) => l.points)));
    const top = ticks[ticks.length - 1] || 1;
    const n = r.groups.length;
    const x = (k: number) => (n <= 1 ? 50 : (k / (n - 1)) * 100);
    const y = (v: number) => 100 - (v / top) * 100;
    const every = Math.max(1, Math.ceil(n / (compact ? 4 : 8)));
    return (
      <div className="linechart">
        <div className="vchart__body">
          <div className="vchart__axis" aria-hidden="true">
            {[...ticks].reverse().map((v) => (
              <span key={v}>{f.value(v, r.unit, true)}</span>
            ))}
          </div>
          <div className="linechart__plot" style={{ '--rows': ticks.length - 1 } as CSSProperties}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={r.groups.map((g) => `${label(g)}: ${f.value(g.value, r.unit)}`).join(', ')}>
              {lines.map((l) => {
                const d = l.points.map((v, k) => `${k ? 'L' : 'M'}${x(k).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
                return (
                  <g key={l.key} data-color={l.color ?? undefined}>
                    {!split && <path className="linechart__area" d={`${d} L${x(n - 1)},100 L${x(0)},100 Z`} />}
                    <path className="linechart__path" d={d} />
                  </g>
                );
              })}
            </svg>
            {n <= 40 &&
              lines.map((l) =>
                l.points.map((v, k) => <i key={`${l.key}${k}`} className="linechart__dot" data-color={l.color ?? undefined} style={{ left: `${x(k)}%`, top: `${y(v)}%`, ...i(k) }} title={`${label(r.groups[k])}${l.label ? ` · ${l.label}` : ''}: ${f.value(v, r.unit)}`} />),
              )}
          </div>
        </div>
        <div className="linechart__x" aria-hidden="true">
          {r.groups.map((g, k) => (k % every === 0 || k === n - 1 ? <span key={g.key} style={{ left: `${x(k)}%` }}>{label(g)}</span> : null))}
        </div>
        {legend}
      </div>
    );
  }

  // column, stacked
  const stacked = chart === 'stacked' && split;
  const peaks = r.groups.map((g) => (split && !stacked ? Math.max(0, ...(g.cells ?? [])) : g.value));
  const ticks = axis(Math.max(0, ...peaks));
  const top = ticks[ticks.length - 1] || 1;
  const many = r.groups.length > (compact ? 8 : 14);
  const every = Math.max(1, Math.ceil(r.groups.length / (compact ? 6 : 12)));
  return (
    <div className="vchart" data-many={many || undefined}>
      <div className="vchart__body">
        <div className="vchart__axis" aria-hidden="true">
          {[...ticks].reverse().map((v) => (
            <span key={v}>{f.value(v, r.unit, true)}</span>
          ))}
        </div>
        <div className="vchart__plot" style={{ '--rows': ticks.length - 1 } as CSSProperties}>
          {r.groups.map((g, k) => (
            <div className="vbar" key={g.key} style={i(k)} title={`${label(g)}: ${f.value(g.value, r.unit)}`}>
              {stacked ? (
                <span className="vbar__fill vbar__fill--stack" style={{ height: pct(g.value, top) }}>
                  {g.cells?.map((v, si) => (v > 0 ? <i key={si} data-color={colorAt(si, r.series[si]?.color)} style={{ flexGrow: v }} title={`${r.series[si]?.label}: ${f.value(v, r.unit)}`} /> : null))}
                  {!many && g.value > 0 && <b className="vbar__n num">{f.value(g.value, r.unit, true)}</b>}
                </span>
              ) : split ? (
                g.cells?.map((v, si) => <span key={si} className="vbar__fill" data-color={colorAt(si, r.series[si]?.color)} style={{ height: pct(v, top) }} title={`${r.series[si]?.label}: ${f.value(v, r.unit)}`} />)
              ) : (
                <span className="vbar__fill" data-color={colored ? colorAt(k, g.color) : undefined} style={{ height: pct(g.value, top) }}>
                  {!many && g.value > 0 && <b className="vbar__n num">{f.value(g.value, r.unit, true)}</b>}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="vchart__x" aria-hidden="true">
        {r.groups.map((g, k) => (
          <span key={g.key}>{!r.bucket || k % every === 0 || k === r.groups.length - 1 ? label(g) : ''}</span>
        ))}
      </div>
      {legend}
    </div>
  );
}

function GroupTable({ r, label }: { r: Ok; label: (g: ReportGroupRow) => string }) {
  const { t } = useI18n();
  const f = useReportFormat();
  return (
    <div className="tablewrap rtable">
      <table className="table">
        <thead>
          <tr>
            <th />
            {r.series.map((s) => (
              <th key={s.key} className="num">
                {s.label}
              </th>
            ))}
            <th className="num">{r.series.length ? t('rb.total') : ''}</th>
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
              <td className="num">
                <b>{f.value(g.value, r.unit)}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RowsTable({ r, compact }: { r: Ok; compact?: boolean }) {
  const { t, fmtDate } = useI18n();
  const f = useReportFormat();
  const table = r.table!;
  if (!table.rows.length) return <EmptyState compact icon="list" title={t('rb.nothing')} />;
  const rows = compact ? table.rows.slice(0, 8) : table.rows;
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
      <div className="tablewrap rtable">
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
      {(table.more || rows.length < r.matched) && <p className="rtable__more">{t('rb.showing', { shown: rows.length, total: f.num(r.matched, 0) })}</p>}
    </>
  );
}

/** A small picture of a chart kind, for pickers and the gallery. */
export function ChartGlyph({ kind, size = 28 }: { kind: ChartKind; size?: number }) {
  const s = { width: size, height: size, viewBox: '0 0 28 28', fill: 'none', 'aria-hidden': true } as const;
  if (kind === 'bar')
    return (
      <svg {...s} className="glyph">
        <rect x="4" y="5" width="18" height="4" rx="2" className="glyph__a" />
        <rect x="4" y="12" width="12" height="4" rx="2" className="glyph__b" />
        <rect x="4" y="19" width="7" height="4" rx="2" className="glyph__c" />
      </svg>
    );
  if (kind === 'column')
    return (
      <svg {...s} className="glyph">
        <rect x="5" y="14" width="4" height="9" rx="2" className="glyph__c" />
        <rect x="12" y="6" width="4" height="17" rx="2" className="glyph__a" />
        <rect x="19" y="10" width="4" height="13" rx="2" className="glyph__b" />
      </svg>
    );
  if (kind === 'stacked')
    return (
      <svg {...s} className="glyph">
        <rect x="5" y="15" width="4" height="8" rx="1.5" className="glyph__a" />
        <rect x="5" y="9" width="4" height="5" rx="1.5" className="glyph__c" />
        <rect x="12" y="13" width="4" height="10" rx="1.5" className="glyph__a" />
        <rect x="12" y="5" width="4" height="7" rx="1.5" className="glyph__c" />
        <rect x="19" y="17" width="4" height="6" rx="1.5" className="glyph__a" />
        <rect x="19" y="11" width="4" height="5" rx="1.5" className="glyph__c" />
      </svg>
    );
  if (kind === 'line')
    return (
      <svg {...s} className="glyph">
        <path d="M4 20l6-7 5 4 9-11" className="glyph__line" />
        <circle cx="10" cy="13" r="1.8" className="glyph__a" />
        <circle cx="15" cy="17" r="1.8" className="glyph__a" />
      </svg>
    );
  if (kind === 'donut')
    return (
      <svg {...s} className="glyph">
        <circle cx="14" cy="14" r="8" className="glyph__ring" />
        <path d="M14 6a8 8 0 0 1 7.6 10.5" className="glyph__arc" />
      </svg>
    );
  if (kind === 'number')
    return (
      <svg {...s} className="glyph">
        <rect x="4" y="8" width="20" height="8" rx="3" className="glyph__a" />
        <rect x="4" y="19" width="11" height="3" rx="1.5" className="glyph__c" />
      </svg>
    );
  return (
    <svg {...s} className="glyph">
      <rect x="4" y="5" width="20" height="4" rx="1.5" className="glyph__a" />
      <rect x="4" y="12" width="20" height="3" rx="1.5" className="glyph__c" />
      <rect x="4" y="18" width="20" height="3" rx="1.5" className="glyph__c" />
    </svg>
  );
}
