// Reports people build: the list of kept and ready-made reports, the ready
// dashboards, and the builder itself (what to look at → narrow → group →
// figure → chart), with the result drawn as you go.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { labelOf } from '../../../shared/src/fields';
import type { Page } from '../../../shared/src/pages';
import {
  BUCKETS,
  DASHBOARD_TEMPLATES,
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
  type ReportResult,
  type ReportSource,
  type ReportSourceInfo,
  type SavedReport,
} from '../../../shared/src/reports';
import { AccountPicker } from '../components/AccountPicker';
import { ChartGlyph, ReportChart, useReportFormat } from '../components/Charts';
import { EmptyState } from '../components/Empty';
import { Icon } from '../components/icons';
import { Confirm, Dialog, PeoplePicker } from '../components/ui';
import { ApiFailure, del, get, patch, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { useStore } from '../lib/store';

interface CatalogData {
  sources: ReportSourceInfo[];
  deals: string | null;
}

function useCatalog() {
  const [cat, setCat] = useState<CatalogData | null>(null);
  useEffect(() => {
    void get<CatalogData>('/reports/catalog').then(setCat);
  }, []);
  return cat;
}

export function ReportTabs({ active }: { active: 'overview' | 'reports' | 'dashboards' }) {
  const { t } = useI18n();
  const tab = (key: typeof active, to: string, label: string) => (
    <a
      className="tab"
      href={to}
      aria-selected={active === key}
      onClick={(e) => {
        e.preventDefault();
        navigate(to);
      }}
    >
      {label}
    </a>
  );
  return (
    <nav className="tabs report-tabs" aria-label={t('nav.reports')}>
      {tab('overview', '/reports', t('rb.tab.overview'))}
      {tab('reports', '/reports/all', t('rb.tab.reports'))}
      {tab('dashboards', '/reports/dashboards', t('rb.tab.dashboards'))}
    </nav>
  );
}

// ------------------------------------------------------------------ list

export function ReportsListPage() {
  const { t, locale } = useI18n();
  const { canWrite, person } = useStore();
  const cat = useCatalog();
  const [saved, setSaved] = useState<SavedReport[] | null>(null);
  useEffect(() => {
    void get<{ reports: SavedReport[] }>('/reports/saved').then((r) => setSaved(r.reports));
  }, []);
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
        <div className="topbar__titles">
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
        {saved && saved.length === 0 && (
          <div className="sheet" style={{ marginBottom: 16 }}>
            <EmptyState compact icon="chart" title={t('rb.noneTitle')} body={t('rb.noneBody')}>
              {canWrite && (
                <button className="btn btn--primary" onClick={() => navigate('/reports/new')}>
                  {t('rb.new')}
                </button>
              )}
            </EmptyState>
          </div>
        )}
        {mine.length > 0 && (
          <>
            <h2 className="reports__h reports__h--first">{t('rb.mine')}</h2>
            <div className="gallery gallery--reports">{mine.map(card)}</div>
          </>
        )}
        {shared.length > 0 && (
          <>
            <h2 className="reports__h">{t('rb.sharedWithYou')}</h2>
            <div className="gallery gallery--reports">{shared.map(card)}</div>
          </>
        )}
        <h2 className="reports__h">{t('rb.library')}</h2>
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

// ------------------------------------------------------------- dashboards

export function DashboardsPage() {
  const { t, locale } = useI18n();
  const { can, me, toast } = useStore();
  const admin = can('org.manage') && !me.previewBy;
  const [pages, setPages] = useState<Page[] | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  useEffect(() => {
    void get<{ pages: Page[] }>('/pages').then((r) => setPages(r.pages));
  }, []);
  const add = async (key: string) => {
    setAdding(key);
    try {
      const r = await post<{ page: Page }>('/pages/from-template', { template: key });
      navigate(`/pages/${r.page.id}`);
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
      setAdding(null);
    }
  };
  return (
    <>
      <header className="topbar">
        <div className="topbar__titles">
          <h1 className="topbar__title">{t('nav.reports')}</h1>
          <p className="topbar__sub">{t('rb.dashLead')}</p>
        </div>
        <div className="topbar__spacer" />
        {admin && (
          <button className="btn btn--primary" onClick={() => navigate('/pages/new')}>
            <Icon name="plus" size={16} /> {t('rb.dashNew')}
          </button>
        )}
      </header>
      <ReportTabs active="dashboards" />
      <div className="page reports">
        {pages && pages.length > 0 && (
          <>
            <h2 className="reports__h reports__h--first">{t('rb.dashYours')}</h2>
            <div className="gallery gallery--reports">
              {pages.map((p) => (
                <a
                  key={p.id}
                  className="rcard"
                  href={`/pages/${p.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(`/pages/${p.id}`);
                  }}
                >
                  <span className="rcard__icon">
                    <Icon name="layout" size={18} />
                  </span>
                  <span className="rcard__text">
                    <span className="rcard__name">{p.name}</span>
                    <span className="rcard__sub">{t('rb.dashCards', { n: p.cards.length })}</span>
                  </span>
                </a>
              ))}
            </div>
          </>
        )}
        <h2 className="reports__h">{t('rb.dashReady')}</h2>
        <p className="reports__lead">{admin ? t('rb.dashReadyLead') : t('rb.dashReadyLeadMember')}</p>
        <div className="gallery gallery--dash">
          {DASHBOARD_TEMPLATES.map((d) => (
            <article key={d.key} className="gallery__item dashcard">
              <div className="dashcard__look" aria-hidden="true">
                {d.look.map((k, i) => (
                  <span key={i}>
                    <ChartGlyph kind={k} size={34} />
                  </span>
                ))}
              </div>
              <h3 className="dashcard__name">{labelOf(d.name, locale)}</h3>
              <p className="dashcard__help">{labelOf(d.help, locale)}</p>
              <div className="dashcard__foot">
                <span className="muted">{t('rb.dashCards', { n: d.cards.length })}</span>
                {admin && (
                  <button className="btn btn--small btn--primary" disabled={adding !== null} onClick={() => void add(d.key)}>
                    {adding === d.key ? t('common.loading') : t('rb.dashAdd')}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </>
  );
}

// ----------------------------------------------------------------- builder

const CHART_CHOICES: Record<0 | 1 | 2, ChartKind[]> = { 0: ['table', 'number'], 1: ['bar', 'column', 'line', 'donut', 'table'], 2: ['stacked', 'column', 'line', 'bar', 'table'] };
const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function ReportBuilderPage({ id, from }: { id: string | null; from: string | null }) {
  const { t, locale } = useI18n();
  const { canWrite, can, me, toast, people, boards, teams } = useStore();
  const f = useReportFormat();
  const cat = useCatalog();
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

  // Start: a kept report, one from the library (made this company's own first), or a blank one.
  useEffect(() => {
    let off = false;
    setResult(null);
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
        } catch {
          if (!off) setGone(true);
        }
        return;
      }
      setSaved(null);
      setShared(false);
      const lib = from ? libraryReport(from) : null;
      if (lib) {
        setName(labelOf(lib.name, locale));
        const r = await post<{ result: ReportResult; def?: ReportDef }>('/reports/run', { def: lib.def, resolve: true });
        if (off) return;
        setDef(r.def ?? lib.def);
        setResult(r.result);
      } else {
        setName('');
        setDef(blankDef('tasks'));
      }
      setDirty(!!lib);
    })();
    return () => {
      off = true;
    };
  }, [id, from]); // eslint-disable-line react-hooks/exhaustive-deps

  const source = useMemo(() => cat?.sources.find((s) => s.key === (def?.source === 'deals' ? cat.deals : def?.source)), [cat, def?.source]);
  const fieldOf = useCallback((k: string | undefined) => source?.fields.find((x) => x.key === k), [source]);
  const problem = def && cat ? defProblem(def, source) : 'loading';

  // Draw as it is built: a moment after the last change, and only what is asked last.
  const ticket = useRef(0);
  useEffect(() => {
    if (!def || !cat || problem) return;
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

  const change = (patchDef: Partial<ReportDef>) => {
    setDef((d) => (d ? { ...d, ...patchDef } : d));
    setDirty(true);
  };

  if (gone)
    return (
      <div className="page" style={{ paddingTop: 24 }}>
        <EmptyState icon="chart" title={t('rb.goneTitle')} body={t('rb.goneBody')}>
          <button className="btn" onClick={() => navigate('/reports/all')}>
            {t('rb.back')}
          </button>
        </EmptyState>
      </div>
    );
  if (!def || !cat || !source)
    return (
      <div className="page" style={{ paddingTop: 24 }}>
        <div className="pane__wait" style={{ height: 240, borderRadius: 12 }} />
      </div>
    );

  const L = (x: { label: ReportField['label'] }) => labelOf(x.label, locale);
  const groupable = source.fields.filter((x) => x.group);
  const measures = source.fields.filter((x) => x.measure);
  const chart = fitChart(def);
  const shape = Math.min(2, def.groups.length) as 0 | 1 | 2;
  const canEdit = canWrite && (!saved || saved.mine || (saved.shared && admin));
  const columns = def.columns?.length ? def.columns : source.fields.slice(0, 6).map((x) => x.key);

  const setSource = (key: ReportSource) => {
    setDef(blankDef(key));
    setDirty(true);
  };
  const setGroup = (at: 0 | 1, key: string) => {
    const groups = [...def.groups];
    if (!key) groups.splice(at, 2 - at);
    else groups[at] = { field: key, ...(fieldOf(key)?.type === 'date' ? { bucket: groups[at]?.bucket ?? 'month' } : {}) };
    const next = { ...def, groups: groups.filter(Boolean) };
    change({ groups: next.groups, chart: fitChart({ ...next, chart: next.groups.length === 1 && def.groups.length === 0 ? 'bar' : def.chart }) });
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

  const exportCsv = () => {
    if (!result || result.kind !== 'ok') return;
    const lines: string[] = [];
    if (result.table) {
      lines.push(result.table.columns.map((c) => csvCell(c.label)).join(';'));
      for (const row of result.table.rows) lines.push(row.map(csvCell).join(';'));
    } else {
      lines.push(['', ...result.series.map((s) => s.label), result.series.length ? t('rb.total') : t(`rb.fn.${def.measure.fn}` as any)].map(csvCell).join(';'));
      for (const g of result.groups) lines.push([result.bucket ? g.key : g.label, ...(g.cells ?? []), g.value].map(csvCell).join(';'));
    }
    const blob = new Blob([`﻿${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(name.trim() || t('rb.untitled')).replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'report'}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

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
    if (fd.type === 'text') return <input className="input" value={String(x.value ?? '')} placeholder={t('rb.textHint')} onChange={(e) => setFilter(at, { ...x, value: e.target.value })} />;
    if (fd.type === 'date') {
      if (x.op === 'this' || x.op === 'last')
        return (
          <select className="select" value={x.period ?? 'month'} onChange={(e) => setFilter(at, { ...x, period: e.target.value as any })}>
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {t(`rb.period.${p}` as any)}
              </option>
            ))}
          </select>
        );
      if (x.op === 'before' || x.op === 'after') return <input className="input" type="date" value={x.date ?? ''} onChange={(e) => setFilter(at, { ...x, date: e.target.value || undefined })} />;
      return (
        <label className="rb-days">
          <input className="input" type="number" min={1} max={3650} value={Number(x.value ?? 30)} onChange={(e) => setFilter(at, { ...x, value: Number(e.target.value) })} />
          <span>{t('rb.days')}</span>
        </label>
      );
    }
    return <input className="input" type="number" value={x.value === undefined ? '' : Number(x.value)} onChange={(e) => setFilter(at, { ...x, value: e.target.value === '' ? undefined : Number(e.target.value) })} />;
  };

  const summary =
    result?.kind === 'ok'
      ? [t('rb.fromRows', { n: f.num(result.matched, 0) }), def.measure.fn !== 'count' || def.groups.length ? `${t(`rb.fn.${def.measure.fn}` as any)}${def.measure.fn !== 'count' && fieldOf(def.measure.field) ? ` · ${L(fieldOf(def.measure.field)!)}` : ''}: ${f.value(result.total, result.unit)}` : null].filter(Boolean).join(' · ')
      : '';

  return (
    <>
      <header className="topbar rb-top">
        <button className="btn btn--quiet btn--icon" aria-label={t('rb.back')} title={t('rb.back')} onClick={() => navigate('/reports/all')}>
          <Icon name="chevronLeft" size={18} />
        </button>
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
        <div className="topbar__spacer" />
        <div className="toolbar">
          {result?.kind === 'ok' && (
            <button className="btn btn--quiet" onClick={exportCsv}>
              <Icon name="download" size={16} /> {t('rb.export')}
            </button>
          )}
          {admin && saved && !dirty && (
            <button className="btn" onClick={() => setPlacing(true)}>
              <Icon name="layout" size={16} /> {t('rb.toDash')}
            </button>
          )}
          {saved && canWrite && (
            <button className="btn btn--quiet" disabled={busy} onClick={() => void save(true)}>
              {t('rb.saveCopy')}
            </button>
          )}
          {saved && canEdit && (
            <button className="btn btn--quiet btn--icon" aria-label={t('common.delete')} title={t('common.delete')} onClick={() => setRemoving(true)}>
              <Icon name="trash" size={16} />
            </button>
          )}
          {canEdit && (
            <button className="btn btn--primary" disabled={busy || !!problem || (!dirty && !!saved)} onClick={() => void save(false)}>
              {saved ? t('common.save') : t('rb.keep')}
            </button>
          )}
        </div>
      </header>
      <div className="page">
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
              <span className="rb-step__n">3</span> {t('rb.step.group')}
            </h2>
            {([0, 1] as const).map((at) =>
              at === 1 && !def.groups[0] ? null : (
                <div className="rb-row" key={at}>
                  <label className="field">
                    <span className="field__label">{at === 0 ? t('rb.groupBy') : t('rb.thenBy')}</span>
                    <select className="select" value={def.groups[at]?.field ?? ''} onChange={(e) => setGroup(at, e.target.value)}>
                      <option value="">{at === 0 ? t('rb.noGroup') : t('rb.noSplit')}</option>
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
                        {t('rb.topN', { n })}
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
            <div className="rb-charts" role="group" aria-label={t('rb.step.chart')}>
              {CHART_CHOICES[shape].map((k) => (
                <button key={k} type="button" className="rb-chart" aria-pressed={chart === k} onClick={() => change({ chart: k })}>
                  <ChartGlyph kind={k} />
                  <span>{t(`rb.chart.${k}` as any)}</span>
                </button>
              ))}
            </div>
            {shape === 0 && chart === 'table' && (
              <div className="field" style={{ marginTop: 12 }}>
                <span className="field__label">{t('rb.columns')}</span>
                <div className="rb-chips">
                  {source.fields.map((o) => {
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
              <h2 className="sheet__title">{name.trim() || t('rb.untitled')}</h2>
              <p className="sheet__hint">{summary || (problem && problem !== 'loading' ? t('rb.problem') : ' ')}</p>
            </div>
            {running && <span className="rb__running">{t('rb.running')}</span>}
          </header>
          <div className="rb__chart" data-chart={chart}>
            {result ? <ReportChart result={result} chart={chart} /> : <div className="pane__wait" style={{ height: 260, borderRadius: 12 }} />}
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
            await del(`/reports/saved/${saved.id}`);
            navigate('/reports/all');
          }}
        />
      )}
      {placing && saved && <PlaceOnDashboard report={saved} onClose={() => setPlacing(false)} />}
    </>
  );
}

/** Adds a kept report to one of the company's dashboards. */
function PlaceOnDashboard({ report, onClose }: { report: SavedReport; onClose: () => void }) {
  const { t } = useI18n();
  const { toast } = useStore();
  const [pages, setPages] = useState<Page[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void get<{ pages: Page[] }>('/pages').then((r) => setPages(r.pages));
  }, []);
  const place = async (p: Page) => {
    if (p.cards.length >= 24) return toast(t('rb.dashFull'), 'error');
    setBusy(true);
    try {
      const cardId = `r${Date.now().toString(36)}`;
      await patch(`/pages/${p.id}`, { cards: [...p.cards, { id: cardId, type: 'report', size: report.def.groups.length ? 'half' : fitChart(report.def) === 'number' ? 'third' : 'full', reportId: report.id }] });
      // A card on a shared page is for everyone who opens the page.
      if (!report.shared) await patch(`/reports/saved/${report.id}`, { shared: true }).catch(() => undefined);
      toast(t('rb.placed', { page: p.name }), 'info', { label: t('rb.open'), run: async () => navigate(`/pages/${p.id}`) });
      onClose();
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
      setBusy(false);
    }
  };
  return (
    <Dialog title={t('rb.toDashTitle')} onClose={onClose}>
      {!report.shared && <p className="field__hint" style={{ marginTop: 0 }}>{t('rb.toDashShares')}</p>}
      {!pages ? (
        <div className="pane__wait" style={{ height: 80 }} />
      ) : pages.length === 0 ? (
        <EmptyState compact icon="layout" title={t('rb.dashNone')}>
          <button className="btn btn--primary" onClick={() => navigate('/reports/dashboards')}>
            {t('rb.tab.dashboards')}
          </button>
        </EmptyState>
      ) : (
        <ul className="library">
          {pages.map((p) => (
            <li key={p.id}>
              <button className="library__item" disabled={busy} onClick={() => void place(p)}>
                <span className="library__name">{p.name}</span>
                <span className="library__help">{t('rb.dashCards', { n: p.cards.length })}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
