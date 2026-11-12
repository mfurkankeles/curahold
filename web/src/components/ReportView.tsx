// A report's result laid out the way the report asks (the three layouts a
// CRM report has):
//   tabular  — a plain list of rows, with the chosen columns;
//   summary  — the rows under their groups (and inner groups), each group
//              with how many rows it has and its subtotal, the total at the end;
//   matrix   — a grid: the first grouping down, the second across, totals
//              on both edges.
// Summary and matrix can show a chart above the table. A chart is what a
// dashboard shows of a report (see Home.tsx → Tile), drawn by Charts.tsx.
import { useMemo, useState } from 'react';
import { foldTop, type ChartKind, type ReportDef, type ReportFormat, type ReportResult } from '../../../shared/src/reports';
import { useI18n } from '../lib/i18n';
import { GroupTable, ReportChart, RowsTable, useReportFormat } from './Charts';
import { EmptyState } from './Empty';
import { Icon } from './icons';

type Ok = Extract<ReportResult, { kind: 'ok' }>;

/** The layout a report uses: its own choice, or the one its shape implies. */
export const formatOf = (def: ReportDef): ReportFormat => def.format ?? (def.groups.length >= 2 && def.chart === 'table' ? 'matrix' : def.groups.length ? 'summary' : 'tabular');

export function ReportView({ result, def, chart }: { result: ReportResult; def: ReportDef; chart: ChartKind }) {
  const { t } = useI18n();
  const format = formatOf(def);
  if (result.kind === 'missing') return <ReportChart result={result} chart={chart} />;
  // A plain figure (or a gauge): nothing to lay out.
  if (format === 'tabular' && (chart === 'number' || chart === 'gauge')) return <ReportChart result={result} chart={chart} goal={def.goal} />;
  if (format === 'tabular') return result.table ? <RowsTable r={result} /> : <ReportChart result={result} chart="table" />;
  if (!result.groups.length || result.matched === 0) return <EmptyState compact icon="chart" title={t('rb.nothing')} />;

  // Above the table: the chart, with the groups past the top few folded into "Other".
  const drawn = def.showChart !== false && chart !== 'table' ? foldTop({ ...result, table: null }, def.top ?? 12, t('rb.other')) : null;
  return (
    <div className="rview">
      {drawn && (
        <div className="rview__chart" data-chart={chart}>
          <ReportChart result={drawn} chart={chart} />
        </div>
      )}
      {format === 'matrix' ? <GroupTable r={result} label={(g) => g.label} /> : <SummaryTable r={result} />}
    </div>
  );
}

/** Rows under their groups, each group with its count and subtotal. A group's head folds it. */
function SummaryTable({ r }: { r: Ok }) {
  const { t, fmtDate } = useI18n();
  const f = useReportFormat();
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const table = r.table;
  const label = (g: { key: string; label: string }) => (r.bucket ? f.bucket(g.key, r.bucket) : g.label);
  const two = r.series.length > 0;

  // The rows of each group (and inner group), in the order the server sent them.
  const byGroup = useMemo(() => {
    const out = new Map<string, Map<string, (string | number | null)[][]>>();
    table?.rows.forEach((row, i) => {
      const [k0 = '', k1 = ''] = table.keys?.[i] ?? [];
      const inner = out.get(k0) ?? new Map<string, (string | number | null)[][]>();
      inner.set(two ? k1 : '', [...(inner.get(two ? k1 : '') ?? []), row]);
      out.set(k0, inner);
    });
    return out;
  }, [table, two]);

  // Groups with no rows of their own here (folded into "Other" by the server) still show their figures.
  const cols = table?.columns ?? [];
  const span = Math.max(1, cols.length);
  const isNum = (type: string) => ['number', 'money', 'minutes', 'days'].includes(type);
  const cell = (v: string | number | null, type: string) => {
    if (v == null || v === '') return <span className="muted">—</span>;
    if (type === 'date' && typeof v === 'string') return fmtDate(v);
    if (type === 'money') return f.value(Number(v), 'money');
    if (type === 'minutes') return f.value(Number(v), 'hours');
    if (type === 'days') return f.value(Number(v), 'days');
    return typeof v === 'number' ? f.num(v) : v;
  };
  const toggle = (key: string) =>
    setFolded((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const rowsOf = (list: (string | number | null)[][] | undefined, key: string) =>
    (list ?? []).map((row, i) => (
      <tr key={`${key}:${i}`} className="rsum__row">
        {row.map((v, ci) => (
          <td key={ci} className={isNum(cols[ci]?.type ?? '') ? 'num' : undefined}>
            {cell(v, cols[ci]?.type ?? 'text')}
          </td>
        ))}
      </tr>
    ));

  return (
    <>
      <div className="tablewrap rtable">
        <table className="table rsum">
          {cols.length > 0 && (
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c.key} className={isNum(c.type) ? 'num' : undefined}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {r.groups.map((g) => {
              const open = !folded.has(g.key);
              const inner = byGroup.get(g.key);
              return (
                <GroupRows key={g.key}>
                  <tr className="rsum__group">
                    <th colSpan={span}>
                      <button className="rsum__toggle" aria-expanded={open} onClick={() => toggle(g.key)}>
                        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} />
                        <span className="rsum__label">{label(g)}</span>
                        <span className="rsum__count">{t('rb.rowsN', { n: f.num(g.count ?? 0, 0) })}</span>
                        <span className="rsum__value num">{f.value(g.value, r.unit)}</span>
                      </button>
                    </th>
                  </tr>
                  {open &&
                    (two
                      ? r.series.map((s, si) =>
                          g.counts?.[si] ? (
                            <GroupRows key={s.key}>
                              <tr className="rsum__sub">
                                <th colSpan={span}>
                                  <span className="rsum__label">{s.label}</span>
                                  <span className="rsum__count">{t('rb.rowsN', { n: f.num(g.counts[si], 0) })}</span>
                                  <span className="rsum__value num">{f.value(g.cells?.[si] ?? 0, r.unit)}</span>
                                </th>
                              </tr>
                              {rowsOf(inner?.get(s.key), `${g.key}:${s.key}`)}
                            </GroupRows>
                          ) : null,
                        )
                      : rowsOf(inner?.get(''), g.key))}
                </GroupRows>
              );
            })}
            <tr className="rsum__total">
              <th colSpan={span}>
                <span className="rsum__label">{t('rb.total')}</span>
                <span className="rsum__count">{t('rb.rowsN', { n: f.num(r.matched, 0) })}</span>
                <span className="rsum__value num">{f.value(r.total, r.unit)}</span>
              </th>
            </tr>
          </tbody>
        </table>
      </div>
      {table?.more && <p className="rtable__more">{t('rb.showing', { shown: table.rows.length, total: f.num(r.matched, 0) })}</p>}
    </>
  );
}

/** Several table rows that belong together (a group's head and its rows). */
function GroupRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
