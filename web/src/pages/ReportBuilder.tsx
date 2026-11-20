// Reports people build: the list of kept and ready-made reports, and the
// builder itself (what to look at → narrow → lay out and group → figure →
// chart), with the result drawn as you go. Dashboards (pages of charts made
// from these reports) are in Dashboards.tsx.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { labelOf } from '../../../shared/src/fields';
import type { Page } from '../../../shared/src/pages';
import {
  BUCKETS,
  FORMATS,
  MEASURE_FNS,
  PERIODS,
  REPORT_LIBRARY,
  blankDef,
  defProblem,
  fitChart,
  libraryReport,
  opsFor,
  type ChartKind,
  type FilterOp,
  type ReportDef,
  type ReportField,
  type ReportFilter,
  type ReportFormat,
  type ReportResult,
  type ReportSource,
  type ReportSourceInfo,
  type SavedReport,
} from '../../../shared/src/reports';
import { AccountPicker } from '../components/AccountPicker';
import { useReportFormat } from '../components/Charts';
import { ChartGlyph } from '../components/ChartGlyph';
import { formatOf, ReportView } from '../components/ReportView';
import { EmptyState, ErrorState, LoadError, SkeletonCards, useAfter } from '../components/Empty';
import { FavoriteButton } from '../components/Favorites';
import { Icon, PageIcon, type IconName } from '../components/icons';
import { Confirm, Dialog, PeoplePicker } from '../components/ui';
import { MenuButton, type MenuItem } from '../components/Menus';
import { ExportMenu, useExport } from '../components/Export';
import { usePhone } from '../components/FilterSheet';
import { typingIn } from '../lib/undo';
import type { ExportRequest } from '../lib/export';
import { ApiFailure, del, get, patch, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { nameIt, navigate, navigateFresh } from '../lib/router';
import { useStore } from '../lib/store';
import { useTrashToast } from '../lib/trash';
import { DateField } from '../components/DateField';

interface CatalogData {
  sources: ReportSourceInfo[];
  deals: string | null;
}

/** What can be reported on; `failed` when it could not be read (with `retry`). */
function useCatalog() {
  const [cat, setCat] = useState<CatalogData | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setFailed(null);
    void get<CatalogData>('/reports/catalog').then(setCat, (e) => setFailed(e instanceof ApiFailure ? e.body.message : ''));
  }, [attempt]);
  return { cat, failed, retry: () => setAttempt((n) => n + 1) };
}

/** The example an empty list offers: one ready-made report, opened in the builder. */
const EXAMPLE = 'customers_by_health';

/** The tabs across the reports area (overview, reports, dashboards). */
export function ReportTabs({ active }: { active: 'overview' | 'reports' | 'dashboards' }) {
  const { t } = useI18n();
  const tab = (key: typeof active, to: string, label: string, icon: IconName) => (
    <a
      className="tab"
      href={to}
      aria-current={active === key ? 'page' : undefined}
      onClick={(e) => {
        e.preventDefault();
        navigateFresh(to);
      }}
    >
      <Icon name={icon} size={16} className="icon--lead" />
      {label}
    </a>
  );
  return (
    <nav className="tabs report-tabs" aria-label={t('nav.reports')}>
      {tab('overview', '/reports', t('rb.tab.overview'), 'gauge')}
      {tab('reports', '/reports/all', t('rb.tab.reports'), 'chart')}
      {tab('dashboards', '/dashboards', t('rb.tab.dashboards'), 'layout')}
    </nav>
  );
}

// ------------------------------------------------------------------ list

export function ReportsListPage() {
  const { t, locale } = useI18n();
  const { canWrite, person } = useStore();
  const { cat } = useCatalog();
  const [saved, setSaved] = useState<SavedReport[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setFailed(null);
    void get<{ reports: SavedReport[] }>('/reports/saved').then(
      (r) => setSaved(r.reports),
      (e) => setFailed(e instanceof ApiFailure ? e.body.message : ''),
    );
  }, [attempt]);
  const example = libraryReport(EXAMPLE);
  const sourceName = (s: ReportSource) => {
    const key = s === 'deals' ? cat?.deals : s;
    return labelOf(cat?.sources.find((x) => x.key === key)?.name, locale);
  };
  const mine = saved?.filter((r) => r.mine) ?? [];
  const shared = saved?.filter((r) => !r.mine) ?? [];
  const card = (r: SavedReport) => (
    <a
      key={r.id}
      className="rcard"
      href={`/reports/r/${r.id}`}
      onClick={(e) => {
        e.preventDefault();
        navigate(`/reports/r/${r.id}`);
      }}
    >
      <ChartGlyph kind={fitChart(r.def)} />
      <span className="rcard__text">
        <span className="rcard__name">{r.name}</span>
        <span className="rcard__sub">
          {sourceName(r.def.source)}
          {!r.mine && r.createdBy ? ` · ${person(r.createdBy)?.name ?? ''}` : ''}
        </span>
      </span>
      {r.shared && <span className="badge">{t('rb.shared')}</span>}
    </a>
  );
  return (
    <>
      <header className="topbar">
        <div className="topbar__titles topbar__titles--icon">
          <PageIcon name="chart" />
          <h1 className="topbar__title">{t('nav.reports')}</h1>
          <p className="topbar__sub">{t('rb.listLead')}</p>
        </div>
        <div className="topbar__spacer" />
        {canWrite && (
          <button className="btn btn--primary" onClick={() => navigate('/reports/new')}>
            <Icon name="plus" size={16} /> {t('rb.new')}
          </button>
        )}
      </header>
      <ReportTabs active="reports" />
      <div className="page reports">
        {failed !== null && !saved && <LoadError message={failed} onRetry={() => setAttempt((n) => n + 1)} />}
        {!saved && failed === null && <SkeletonCards count={2} label={t('common.loading')} />}
        {saved && saved.length === 0 && (
          <div className="sheet u-mb-16">
            {/* An invitation: what a report is, and one to open right now. */}
            <EmptyState compact icon="chart" title={t('rb.noneTitle')} body={t('rb.noneBody')}>
              {example && (
                <a
                  className="btn btn--primary"
                  href={`/reports/new?from=${EXAMPLE}`}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(`/reports/new?from=${EXAMPLE}`);
                  }}
                >
                  <ChartGlyph kind={fitChart(example.def)} size={20} />
                  {t('rb.tryExample', { name: labelOf(example.name, locale) })}
                </a>
              )}
              {canWrite && (
                <button className="btn" onClick={() => navigate('/reports/new')}>
                  <Icon name="plus" size={16} />
                  {t('rb.new')}
                </button>
              )}
            </EmptyState>
          </div>
        )}
        {mine.length > 0 && (
          <>
            <h2 className="reports__h reports__h--first">
          <Icon name="user" size={18} /> {t('rb.mine')}
        </h2>
            <div className="gallery gallery--reports">{mine.map(card)}</div>
          </>
        )}
        {shared.length > 0 && (
          <>
            <h2 className="reports__h">
          <Icon name="people" size={18} /> {t('rb.sharedWithYou')}
        </h2>
            <div className="gallery gallery--reports">{shared.map(card)}</div>
          </>
        )}
        <h2 className="reports__h">
          <Icon name="bookmark" size={18} /> {t('rb.library')}
        </h2>
        <p className="reports__lead">{t('rb.libraryLead')}</p>
        <div className="gallery gallery--reports">
          {REPORT_LIBRARY.map((r) => (
            <a
              key={r.key}
              className="rcard"
              href={`/reports/new?from=${r.key}`}
              onClick={(e) => {
                e.preventDefault();
                navigate(`/reports/new?from=${r.key}`);
              }}
            >
              <ChartGlyph kind={fitChart(r.def)} />
              <span className="rcard__text">
                <span className="rcard__name">{labelOf(r.name, locale)}</span>
                <span className="rcard__sub">{labelOf(r.help, locale)}</span>
              </span>
            </a>
          ))}
        </div>
      </div>
    </>
  );
}

// ----------------------------------------------------------------- builder

/** The charts that fit a report's shape: a list or one figure; one grouping; two. */
const CHART_CHOICES: Record<0 | 1 | 2, ChartKind[]> = { 0: ['table', 'number', 'gauge'], 1: ['bar', 'column', 'line', 'donut'], 2: ['stacked', 'column', 'line', 'bar'] };

/**
 * The report builder: source, filters, groups, measure and chart, with save and share. Split plan: docs/HANDOVER.md.
 */
export function ReportBuilderPage({ id, from }: { id: string | null; from: string | null }) {
  const { t, locale } = useI18n();
  const { canWrite, can, me, toast, people, boards, teams } = useStore();
  const trashed = useTrashToast();
  const f = useReportFormat();
  const { cat, failed: catFailed, retry: catRetry } = useCatalog();
  const phone = usePhone();
  const exporter = useExport();
  const admin = can('org.manage') && !me.previewBy;
  const [saved, setSaved] = useState<SavedReport | null>(null);
  const [def, setDef] = useState<ReportDef | null>(null);
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [running, setRunning] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [accountNames, setAccountNames] = useState<Record<string, string>>({});
  const [loadFailed, setLoadFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // What the report was before each change, newest last: Undo (and Ctrl/⌘Z) steps back through it.
  const history = useRef<ReportDef[]>([]);
  const [steps, setSteps] = useState(0);
  useEffect(() => nameIt(id ? `/reports/r/${id}` : '/reports/new', name), [id, name]);

  // Start: a kept report, one from the library (made this company's own first), or a blank one.
  useEffect(() => {
    let off = false;
    setResult(null);
    setLoadFailed(null);
    setGone(false);
    history.current = [];
    setSteps(0);
    (async () => {
      if (id) {
        try {
          const r = await get<{ report: SavedReport }>(`/reports/saved/${id}`);
          if (off) return;
          setSaved(r.report);
          setDef(r.report.def);
          setName(r.report.name);
          setShared(r.report.shared);
          setDirty(false);
        } catch (e) {
          if (off) return;
          // Gone (deleted, or kept private by its maker) is not the same as a load that failed.
          if (e instanceof ApiFailure && (e.status === 404 || e.status === 403)) setGone(true);
          else setLoadFailed(e instanceof ApiFailure ? e.body.message : '');
        }
        return;
      }
      setSaved(null);
      setShared(false);
      const lib = from ? libraryReport(from) : null;
      if (lib) {
        setName(labelOf(lib.name, locale));
        try {
          const r = await post<{ result: ReportResult; def?: ReportDef }>('/reports/run', { def: lib.def, resolve: true });
            if (off) return;
          const made = r.def ?? lib.def;
          ranFor.current = made;
          setDef(made);
          setResult(r.result);
        } catch {
          // The builder still opens; the preview runs (and says what is wrong) as it is drawn.
          if (!off) setDef(lib.def);
        }
      } else {
        setName('');
        setDef(blankDef('tasks'));
      }
      setDirty(!!lib);
    })();
    return () => {
      off = true;
    };
  }, [id, from, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const source = useMemo(() => cat?.sources.find((s) => s.key === (def?.source === 'deals' ? cat.deals : def?.source)), [cat, def?.source]);
  const fieldOf = useCallback((k: string | undefined) => source?.fields.find((x) => x.key === k), [source]);
  const problem = def && cat ? defProblem(def, source) : 'loading';

  // Draw as it is built: a moment after the last change, and only what is asked last.
  const ticket = useRef(0);
  // The definition whose result is already on screen (a library report arrives run): not run again.
  const ranFor = useRef<ReportDef | null>(null);
  useEffect(() => {
    if (!def || !cat || problem || def === ranFor.current) return;
    const mine = ++ticket.current;
    setRunning(true);
    const timer = setTimeout(async () => {
      try {
        const r = await post<{ result: ReportResult }>('/reports/run', { def: { ...def, chart: fitChart(def) } });
        if (mine === ticket.current) setResult(r.result);
      } catch (e) {
        if (mine === ticket.current) toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
      } finally {
        if (mine === ticket.current) setRunning(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [def, cat, problem]); // eslint-disable-line react-hooks/exhaustive-deps

  const remember = () => {
    if (!def) return;
    history.current = [...history.current.slice(-49), def];
    setSteps(history.current.length);
  };
  const change = (patchDef: Partial<ReportDef>) => {
    if (!def) return;
    remember();
    setDef({ ...def, ...patchDef });
    setDirty(true);
  };
  const undo = () => {
    const back = history.current.pop();
    if (!back) return;
    setSteps(history.current.length);
    setDef(back);
    setDirty(true);
  };
  const undoRef = useRef(undo);
  undoRef.current = undo;
  useEffect(() => {
    // After the toast's own Ctrl+Z (Shell.tsx), which wins while an Undo toast shows.
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.key.toLowerCase() !== 'z' || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || typingIn(e.target) || !history.current.length) return;
      e.preventDefault();
      undoRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (gone)
    return (
      <div className="page u-pt-24">
        <EmptyState icon="chart" title={t('rb.goneTitle')} body={t('rb.goneBody')}>
          <button className="btn" onClick={() => navigate('/reports/all')}>
            <Icon name="arrowLeft" size={16} />
            {t('rb.back')}
          </button>
        </EmptyState>
      </div>
    );
  if (loadFailed !== null || (catFailed !== null && !cat))
    return (
      <div className="page u-pt-24">
        <ErrorState
          title={t('rb.loadFailed')}
          body={loadFailed || catFailed}
          onRetry={() => {
            if (loadFailed !== null) setAttempt((n) => n + 1);
            else catRetry();
          }}
        />
      </div>
    );
  if (!def || !cat || !source) return <BuilderWait />;

  const L = (x: { label: ReportField['label'] }) => labelOf(x.label, locale);
  const groupable = source.fields.filter((x) => x.group);
  const measures = source.fields.filter((x) => x.measure);
  const chart = fitChart(def);
  const shape = Math.min(2, def.groups.length) as 0 | 1 | 2;
  const canEdit = canWrite && (!saved || saved.mine || (saved.shared && admin));
  const columns = def.columns?.length ? def.columns : source.fields.slice(0, 6).map((x) => x.key);

  const setSource = (key: ReportSource) => {
    remember();
    setDef(blankDef(key));
    setDirty(true);
  };
  const setGroup = (at: 0 | 1, key: string) => {
    const groups = [...def.groups];
    if (!key) groups.splice(at, 2 - at);
    else groups[at] = { field: key, ...(fieldOf(key)?.type === 'date' ? { bucket: groups[at]?.bucket ?? 'month' } : {}) };
    const next = { ...def, groups: groups.filter(Boolean) };
    // No grouping left: a list. One left in a grid: a summary.
    const fm: ReportFormat = next.groups.length === 0 ? 'tabular' : next.groups.length === 1 && format === 'matrix' ? 'summary' : format === 'tabular' ? 'summary' : format;
    change({ groups: next.groups, format: fm, chart: fitChart({ ...next, chart: next.groups.length === 1 && def.groups.length === 0 ? 'bar' : def.chart }) });
  };
  // The layout decides the grouping: a list has none, a summary one or two, a grid two.
  const groupOf = (key: string) => ({ field: key, ...(fieldOf(key)?.type === 'date' ? { bucket: 'month' as const } : {}) });
  const format = formatOf(def);
  const setFormat = (fm: ReportFormat) => {
    const g0 = def.groups[0] ?? (groupable[0] ? groupOf(groupable[0].key) : undefined);
    if (fm === 'tabular') return change({ format: fm, groups: [], chart: def.chart === 'number' || def.chart === 'gauge' ? def.chart : 'table', showChart: false });
    if (!g0) return;
    if (fm === 'summary') return change({ format: fm, groups: def.groups.length ? def.groups : [g0], chart: CHART_CHOICES[1].includes(def.chart) ? def.chart : 'bar', showChart: def.showChart ?? true });
    const other = groupable.find((o) => o.key !== g0.field);
    const g1 = def.groups[1] ?? (other ? groupOf(other.key) : undefined);
    change({ format: fm, groups: g1 ? [g0, g1] : [g0], chart: CHART_CHOICES[2].includes(def.chart) ? def.chart : 'stacked', showChart: def.showChart ?? true });
  };
  const setFilter = (at: number, x: ReportFilter | null) => {
    const filters = [...def.filters];
    if (x) filters[at] = x;
    else filters.splice(at, 1);
    change({ filters });
  };
  const newFilter = (key: string): ReportFilter => {
    const type = fieldOf(key)?.type ?? 'text';
    const op = opsFor(type)[0];
    return { field: key, op, ...(op === 'last_days' ? { value: 30 } : {}) };
  };

  const save = async (asNew = false) => {
    const title = name.trim() || t('rb.untitled');
    setBusy(true);
    try {
      const body = { name: title, def: { ...def, chart }, shared };
      if (saved && !asNew) {
        const r = await patch<{ report: SavedReport }>(`/reports/saved/${saved.id}`, body);
        setSaved(r.report);
        setDirty(false);
        toast(t('rb.saved'), 'info');
      } else {
        const r = await post<{ report: SavedReport }>('/reports/saved', { ...body, name: asNew && saved ? t('rb.copyOf', { name: title }) : title, shared: asNew ? false : shared });
        toast(t('rb.saved'), 'info');
        navigate(`/reports/r/${r.report.id}`, true);
      }
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(false);
    }
  };

  // The file has what the preview shows: in a summary, each row also says which group it is in.
  // The server runs the report as it stands now and makes the file (POST /exports).
  const exportAsk = (): ExportRequest => ({ source: 'report', name: name.trim() || t('rb.untitled'), def });
  const canExport = result?.kind === 'ok' && can('data.export');
  // One main action (Save); the rest wait in "More" — on a phone, Export and "Add to dashboard" too.
  const more: MenuItem[] = [
    ...(phone && canExport
      ? [
          { key: 'xlsx', label: t('export.xlsx'), icon: 'download' as const, onSelect: () => void exporter.run(exportAsk, 'xlsx') },
          { key: 'csv', label: t('export.csv'), icon: 'download' as const, onSelect: () => void exporter.run(exportAsk, 'csv') },
        ]
      : []),
    ...(phone && admin && saved && !dirty ? [{ key: 'dash', label: t('rb.toDash'), icon: 'layout' as const, onSelect: () => setPlacing(true) }] : []),
    ...(saved && canWrite ? [{ key: 'copy', label: t('rb.saveCopy'), icon: 'copy' as const, onSelect: () => void save(true) }] : []),
    ...(saved && canEdit ? [{ key: 'delete', label: t('common.delete'), icon: 'trash' as const, danger: true, onSelect: () => setRemoving(true) }] : []),
  ];

  const opLabel = (op: FilterOp) => t(`rb.op.${op}` as any);
  const valueControl = (x: ReportFilter, at: number): ReactNode => {
    const fd = fieldOf(x.field);
    if (!fd || x.op === 'empty' || x.op === 'not_empty' || x.op === 'yes' || x.op === 'no') return null;
    const values = x.values ?? [];
    const toggle = (v: string) => setFilter(at, { ...x, values: values.includes(v) ? values.filter((k) => k !== v) : [...values, v] });
    const chips = (opts: { key: string; label: string }[]) => (
      <div className="rb-chips">
        {opts.map((o) => (
          <button key={o.key} type="button" className="rb-chip" aria-pressed={values.includes(o.key)} onClick={() => toggle(o.key)}>
            {o.label}
          </button>
        ))}
      </div>
    );
    if (fd.type === 'choice') return chips((fd.options ?? []).map((o) => ({ key: o.key, label: labelOf(o.label, locale) })));
    if (fd.type === 'person')
      return (
        <div className="rb-people">
          <button type="button" className="rb-chip" aria-pressed={values.includes('me')} onClick={() => toggle('me')}>
            {t('rb.me')}
          </button>
          <PeoplePicker people={people} value={values.filter((v) => v !== 'me')} onChange={(ids) => setFilter(at, { ...x, values: [...(values.includes('me') ? ['me'] : []), ...ids] })} label={L(fd)} max={20} />
        </div>
      );
    if (fd.type === 'ref') {
      if (fd.key === 'board') return chips(boards.map((b) => ({ key: b.id, label: b.name })));
      if (fd.key === 'team') return chips(teams.map((tm) => ({ key: tm.id, label: tm.name })));
      return (
        <div className="rb-people">
          {values.map((v) => (
            <button key={v} type="button" className="rb-chip" aria-pressed="true" onClick={() => toggle(v)} title={t('common.remove')}>
              {accountNames[v] ?? t('rb.oneCustomer')} ×
            </button>
          ))}
          <AccountPicker
            value={null}
            name={null}
            onChange={(aid, an) => {
              if (!aid) return;
              if (an) setAccountNames((m) => ({ ...m, [aid]: an }));
              if (!values.includes(aid)) setFilter(at, { ...x, values: [...values, aid] });
            }}
          />
        </div>
      );
    }
    if (fd.type === 'text') return <input className="input" value={String(x.value ?? '')} placeholder={t('rb.textHint')} aria-label={t('rb.textHint')} onChange={(e) => setFilter(at, { ...x, value: e.target.value })} />;
    if (fd.type === 'date') {
      if (x.op === 'this' || x.op === 'last')
        return (
          <select className="select" value={x.period ?? 'month'} aria-label={t('rb.periodOf')} onChange={(e) => setFilter(at, { ...x, period: e.target.value as any })}>
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {t(`rb.period.${p}` as any)}
              </option>
            ))}
          </select>
        );
      if (x.op === 'before' || x.op === 'after') return <DateField value={x.date ?? ''} label={t('rb.value')} onChange={(v) => setFilter(at, { ...x, date: v || undefined })} />;
      return (
        <label className="rb-days">
          <input className="input" type="number" min={1} max={3650} value={Number(x.value ?? 30)} onChange={(e) => setFilter(at, { ...x, value: Number(e.target.value) })} />
          <span>{t('rb.days')}</span>
        </label>
      );
    }
    return <input className="input" type="number" aria-label={t('rb.value')} value={x.value === undefined ? '' : Number(x.value)} onChange={(e) => setFilter(at, { ...x, value: e.target.value === '' ? undefined : Number(e.target.value) })} />;
  };

  const summary =
    result?.kind === 'ok'
      ? [t('rb.fromRows', { n: f.num(result.matched, 0) }), def.measure.fn !== 'count' || def.groups.length ? `${t(`rb.fn.${def.measure.fn}` as any)}${def.measure.fn !== 'count' && fieldOf(def.measure.field) ? ` · ${L(fieldOf(def.measure.field)!)}` : ''}: ${f.value(result.total, result.unit)}` : null].filter(Boolean).join(' · ')
      : '';

  return (
    <>
      <header className="topbar rb-top">
        <input
          className="rb-name"
          value={name}
          maxLength={120}
          placeholder={t('rb.untitled')}
          aria-label={t('rb.name')}
          readOnly={!canEdit}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
        />
        {saved && <FavoriteButton kind="report" id={saved.id} name={saved.name} to={`/reports/r/${saved.id}`} />}
        <div className="topbar__spacer" />
        <div className="toolbar rb-tools">
          {steps > 0 && canEdit && (
            <button className="btn btn--quiet btn--icon" aria-label={t('rb.undo')} title={`${t('rb.undo')} (Ctrl+Z)`} onClick={undo}>
              <Icon name="undo" size={16} />
            </button>
          )}
          {!phone && canExport && <ExportMenu ask={exportAsk} quiet />}
          {!phone && admin && saved && !dirty && (
            <button className="btn" onClick={() => setPlacing(true)}>
              <Icon name="layout" size={16} /> {t('rb.toDash')}
            </button>
          )}
          {more.length > 0 && (
            <MenuButton
              label={t('rb.more')}
              buttonClass="btn btn--quiet btn--icon"
              place={phone ? 'down' : 'down-end'}
              button={
                <>
                  <Icon name="more" size={16} />
                  <span className="sr-only">{t('rb.more')}</span>
                </>
              }
              items={more}
            />
          )}
          {canEdit && (
            <button className="btn btn--primary" disabled={busy || !!problem || (!dirty && !!saved)} onClick={() => void save(false)}>
              <Icon name="check" size={16} />
              {saved ? t('common.save') : t('rb.keep')}
            </button>
          )}
        </div>
      </header>
      <div className="page">
        {!canWrite && <p className="notice rb-note">{t('rb.viewerNote')}</p>}
        <div className="rb">
        <div className="rb__rail">
          <section className="sheet rb-step">
            <h2 className="rb-step__title">
              <span className="rb-step__n">1</span> {t('rb.step.source')}
            </h2>
            <div className="rb-sources">
              {cat.sources.map((s) => (
                <button key={s.key} type="button" className="rb-source" aria-pressed={s.key === source.key} onClick={() => s.key !== source.key && setSource(s.key)}>
                  {labelOf(s.name, locale)}
                </button>
              ))}
            </div>
          </section>

          <section className="sheet rb-step">
            <h2 className="rb-step__title">
              <span className="rb-step__n">2</span> {t('rb.step.filter')}
            </h2>
            {def.filters.length === 0 && <p className="rb-step__hint">{t('rb.filterNone')}</p>}
            {def.filters.map((x, at) => {
              const fd = fieldOf(x.field);
              return (
                <div className="rb-filter" key={at}>
                  <div className="rb-filter__top">
                    <select className="select" value={x.field} aria-label={t('rb.field')} onChange={(e) => setFilter(at, newFilter(e.target.value))}>
                      {source.fields.map((o) => (
                        <option key={o.key} value={o.key}>
                          {L(o)}
                        </option>
                      ))}
                    </select>
                    <select
                      className="select"
                      value={x.op}
                      aria-label={t('rb.condition')}
                      onChange={(e) => {
                        const op = e.target.value as FilterOp;
                        setFilter(at, { field: x.field, op, values: x.values, value: op === 'last_days' || op === 'next_days' ? Number(x.value) || 30 : x.value, period: x.period, date: x.date });
                      }}
                    >
                      {opsFor(fd?.type ?? 'text').map((op) => (
                        <option key={op} value={op}>
                          {opLabel(op)}
                        </option>
                      ))}
                    </select>
                    <button className="btn btn--quiet btn--icon" aria-label={t('common.remove')} title={t('common.remove')} onClick={() => setFilter(at, null)}>
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                  {valueControl(x, at)}
                </div>
              );
            })}
            {def.filters.length < 12 && (
              <button className="btn btn--small" onClick={() => setFilter(def.filters.length, newFilter(source.fields[0].key))}>
                <Icon name="plus" size={14} /> {t('rb.addFilter')}
              </button>
            )}
          </section>

          <section className="sheet rb-step">
            <h2 className="rb-step__title">
              <span className="rb-step__n">3</span> {t('rb.step.layout')}
            </h2>
            <div className="field">
              <div className="seg rb-format" role="radiogroup" aria-label={t('rb.step.layout')}>
                {FORMATS.map((fm) => (
                  <button key={fm} type="button" role="radio" aria-checked={format === fm} disabled={fm !== 'tabular' && !groupable.length} onClick={() => setFormat(fm)}>
                    {t(`rb.format.${fm}` as const)}
                  </button>
                ))}
              </div>
              <span className="field__hint">{t(`rb.formatHint.${format}` as const)}</span>
            </div>
            {format !== 'tabular' && ([0, 1] as const).map((at) =>
              at === 1 && !def.groups[0] ? null : (
                <div className="rb-row" key={at}>
                  <label className="field">
                    <span className="field__label">{format === 'matrix' ? (at === 0 ? t('rb.rowsBy') : t('rb.columnsBy')) : at === 0 ? t('rb.groupBy') : t('rb.thenBy')}</span>
                    <select className="select" value={def.groups[at]?.field ?? ''} onChange={(e) => setGroup(at, e.target.value)}>
                      {!(format === 'matrix' && at === 1) && <option value="">{at === 0 ? t('rb.noGroup') : t('rb.noSplit')}</option>}
                      {groupable
                        .filter((o) => at === 0 || o.key !== def.groups[0]?.field)
                        .map((o) => (
                          <option key={o.key} value={o.key}>
                            {L(o)}
                          </option>
                        ))}
                    </select>
                  </label>
                  {fieldOf(def.groups[at]?.field)?.type === 'date' && (
                    <label className="field">
                      <span className="field__label">{t('rb.every')}</span>
                      <select className="select" value={def.groups[at]?.bucket ?? 'month'} onChange={(e) => change({ groups: def.groups.map((g, k) => (k === at ? { ...g, bucket: e.target.value as any } : g)) })}>
                        {BUCKETS.map((b) => (
                          <option key={b} value={b}>
                            {t(`rb.bucket.${b}` as any)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              ),
            )}
          </section>

          <section className="sheet rb-step">
            <h2 className="rb-step__title">
              <span className="rb-step__n">4</span> {t('rb.step.measure')}
            </h2>
            <div className="rb-row">
              <label className="field">
                <span className="field__label">{t('rb.show')}</span>
                <select
                  className="select"
                  value={def.measure.fn}
                  onChange={(e) => {
                    const fn = e.target.value as (typeof MEASURE_FNS)[number];
                    change({ measure: fn === 'count' ? { fn } : { fn, field: def.measure.field && fieldOf(def.measure.field)?.measure ? def.measure.field : measures[0]?.key } });
                  }}
                >
                  {MEASURE_FNS.filter((fn) => fn === 'count' || measures.length > 0).map((fn) => (
                    <option key={fn} value={fn}>
                      {t(`rb.fn.${fn}` as any)}
                    </option>
                  ))}
                </select>
              </label>
              {def.measure.fn !== 'count' && (
                <label className="field">
                  <span className="field__label">{t('rb.of')}</span>
                  <select className="select" value={def.measure.field ?? ''} onChange={(e) => change({ measure: { fn: def.measure.fn, field: e.target.value } })}>
                    {measures.map((o) => (
                      <option key={o.key} value={o.key}>
                        {L(o)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {def.groups.length > 0 && fieldOf(def.groups[0].field)?.type !== 'date' && (
              <div className="rb-row">
                <label className="field">
                  <span className="field__label">{t('rb.top')}</span>
                  <select className="select" value={def.top ?? 12} onChange={(e) => change({ top: Number(e.target.value) })}>
                    {[5, 10, 12, 20, 50].map((n) => (
                      <option key={n} value={n}>
                        {t('rb.topN', { n: f.num(n, 0) })}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">{t('rb.order')}</span>
                  <select className="select" value={def.sort ?? 'value'} onChange={(e) => change({ sort: e.target.value as any })}>
                    <option value="value">{t('rb.order.value')}</option>
                    <option value="label">{t('rb.order.label')}</option>
                  </select>
                </label>
              </div>
            )}
          </section>

          <section className="sheet rb-step">
            <h2 className="rb-step__title">
              <span className="rb-step__n">5</span> {t('rb.step.chart')}
            </h2>
            {format !== 'tabular' && (
              <label className="rb-share u-mt-0 u-mb-8">
                <input type="checkbox" checked={def.showChart !== false} onChange={(e) => change({ showChart: e.target.checked })} />
                <span>
                  <b>{t('rb.showChart')}</b>
                  <span className="field__hint">{t('rb.showChartHint')}</span>
                </span>
              </label>
            )}
            {(format === 'tabular' || def.showChart !== false) && (
              <div className="rb-charts" role="group" aria-label={t('rb.step.chart')}>
                {CHART_CHOICES[shape].map((k) => (
                  <button key={k} type="button" className="rb-chart" aria-pressed={chart === k} onClick={() => change({ chart: k })}>
                    <ChartGlyph kind={k} />
                    <span>{t(`rb.chart.${k}` as any)}</span>
                  </button>
                ))}
              </div>
            )}
            {shape === 0 && chart === 'gauge' && (
              <label className="field u-mt-12 u-max-width-260">
                <span className="field__label">{t('rb.goal')}</span>
                <input className="input num" type="number" min={1} value={def.goal ?? ''} placeholder={t('rb.goalHint')} onChange={(e) => change({ goal: e.target.value === '' ? undefined : Math.max(1, Number(e.target.value)) })} />
              </label>
            )}
            {((shape === 0 && chart === 'table') || format === 'summary') && (
              <div className="field u-mt-12">
                <span className="field__label">{format === 'summary' ? t('rb.rowColumns') : t('rb.columns')}</span>
                <div className="rb-chips">
                  {source.fields.filter((o) => !def.groups.some((g) => g.field === o.key)).map((o) => {
                    const on = columns.includes(o.key);
                    return (
                      <button key={o.key} type="button" className="rb-chip" aria-pressed={on} disabled={!on && columns.length >= 8} onClick={() => change({ columns: on ? columns.filter((k) => k !== o.key) : [...columns, o.key] })}>
                        {L(o)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {canEdit && (
              <label className="rb-share">
                <input
                  type="checkbox"
                  checked={shared}
                  onChange={(e) => {
                    setShared(e.target.checked);
                    setDirty(true);
                  }}
                />
                <span>
                  <b>{t('rb.share')}</b>
                  <span className="field__hint">{t('rb.shareHint')}</span>
                </span>
              </label>
            )}
          </section>
        </div>

        <section className="sheet rb__view" aria-busy={running} aria-live="polite">
          <header className="rb__viewhead">
            <div>
              <h2 className="sheet__title">
            <Icon name="chart" size={18} className="icon--lead" />
            {name.trim() || t('rb.untitled')}
          </h2>
              <p className="sheet__hint">{summary || (problem && problem !== 'loading' ? t('rb.problem') : ' ')}</p>
            </div>
            {running && <span className="rb__running">{t('rb.running')}</span>}
          </header>
          <div className="rb__chart" data-chart={chart}>
            {result ? <ReportView result={result} def={def} chart={chart} /> : <div className="pane__wait pane__wait--big u-height-260" />}
          </div>
        </section>
        </div>
      </div>

      {removing && saved && (
        <Confirm
          title={t('rb.deleteTitle', { name: saved.name })}
          body={t('rb.deleteBody')}
          confirmLabel={t('common.delete')}
          danger
          onClose={() => setRemoving(false)}
          onConfirm={async () => {
            const reportId = saved.id;
            trashed(await del(`/reports/saved/${reportId}`), () => navigate(`/reports/r/${reportId}`));
            navigate('/reports/all');
          }}
        />
      )}
      {placing && saved && <PlaceOnDashboard report={saved} onClose={() => setPlacing(false)} />}
    </>
  );
}

/** The builder's shape while it loads (after --wait): its five steps and the preview, so nothing moves when they land. */
function BuilderWait() {
  const { t } = useI18n();
  const shown = useAfter(300);
  return (
    <div className="page u-pt-24">
      <div className="rb" role="status" aria-label={t('common.loading')}>
        {shown && (
          <>
            <div className="rb__rail">
              {[0, 1, 2, 3, 4].map((k) => (
                <div key={k} className="pane__wait u-height-160" />
              ))}
            </div>
            <div className="pane__wait rb-wait__view" />
          </>
        )}
      </div>
    </div>
  );
}

/** Adds a kept report to one of the company's dashboards. */
function PlaceOnDashboard({ report, onClose }: { report: SavedReport; onClose: () => void }) {
  const { t } = useI18n();
  const { toast } = useStore();
  const f = useReportFormat();
  const [pages, setPages] = useState<Page[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setFailed(null);
    void get<{ pages: Page[] }>('/pages?kind=dashboard').then(
      (r) => setPages(r.pages),
      (e) => setFailed(e instanceof ApiFailure ? e.body.message : ''),
    );
  }, [attempt]);
  const place = async (p: Page) => {
    if (p.cards.length >= 24) return toast(t('rb.dashFull'), 'error');
    setBusy(true);
    try {
      const cardId = `r${Date.now().toString(36)}`;
      await patch(`/pages/${p.id}`, { cards: [...p.cards, { id: cardId, type: 'report', size: report.def.groups.length ? 'half' : fitChart(report.def) === 'number' ? 'third' : 'full', reportId: report.id }] });
      // A card on a shared page is for everyone who opens the page.
      if (!report.shared) await patch(`/reports/saved/${report.id}`, { shared: true }).catch(() => undefined);
      toast(t('rb.placed', { page: p.name }), 'info', { label: t('rb.open'), run: async () => navigate(`/dashboards/${p.id}`) });
      onClose();
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
      setBusy(false);
    }
  };
  return (
    <Dialog title={t('rb.toDashTitle')} onClose={onClose}>
      {!report.shared && <p className="field__hint u-mt-0">{t('rb.toDashShares')}</p>}
      {!pages && failed !== null ? (
        <LoadError message={failed} onRetry={() => setAttempt((n) => n + 1)} />
      ) : !pages ? (
        <div className="pane__wait u-height-80" />
      ) : pages.length === 0 ? (
        <EmptyState compact icon="layout" title={t('rb.dashNone')}>
          <button className="btn btn--primary" onClick={() => navigate('/dashboards')}>
            <Icon name="layout" size={16} />
            {t('rb.tab.dashboards')}
          </button>
        </EmptyState>
      ) : (
        <ul className="library">
          {pages.map((p) => (
            <li key={p.id}>
              <button className="library__item" disabled={busy} onClick={() => void place(p)}>
                <span className="library__name">{p.name}</span>
                <span className="library__help">{t('rb.dashCards', { n: f.num(p.cards.length, 0) })}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
