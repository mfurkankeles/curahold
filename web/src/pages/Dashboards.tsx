// Dashboards: pages of charts, each card a report drawn as a picture (or a
// figure, a gauge, a short list). Reports are the data (rows, groups,
// totals — ReportBuilder.tsx); a dashboard puts several of them side by side
// and can narrow all of them at once to one person or one team.
//
//   /dashboards        the list: the built-in overview, the company's
//                      dashboards and ready-made ones to add
//   /dashboards/:id    one dashboard, with its filter bar and refresh
//   /dashboards/new    a new, empty one (administrators)
//
// A dashboard is stored as a page of kind 'dashboard' (api/src/routes/pages.ts);
// its cards are filled for the person looking (GET /pages/:id/data).
import { useCallback, useEffect, useState } from 'react';
import { labelOf } from '../../../shared/src/fields';
import type { Page } from '../../../shared/src/pages';
import { DASHBOARD_TEMPLATES } from '../../../shared/src/reports';
import { ChartGlyph } from '../components/Charts';
import { EmptyState, SkeletonCards } from '../components/Empty';
import { FavoriteButton } from '../components/Favorites';
import { Icon, PageIcon } from '../components/icons';
import { ApiFailure, get, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { nameIt, navigate } from '../lib/router';
import { useStore } from '../lib/store';
import { draftOf, PageEditor, Tile, type Data, type Draft } from './Home';
import { ReportTabs } from './ReportBuilder';

const link = (to: string) => (e: React.MouseEvent) => {
  e.preventDefault();
  navigate(to);
};

// ------------------------------------------------------------------ the list

export function DashboardsPage() {
  const { t, locale } = useI18n();
  const { can, me, toast } = useStore();
  const admin = can('org.manage') && !me.previewBy;
  const [pages, setPages] = useState<Page[] | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  useEffect(() => {
    void get<{ pages: Page[] }>('/pages?kind=dashboard').then((r) => setPages(r.pages), () => setPages([]));
  }, []);
  const add = async (key: string) => {
    setAdding(key);
    try {
      const r = await post<{ page: Page }>('/pages/from-template', { template: key });
      navigate(`/dashboards/${r.page.id}`);
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
      setAdding(null);
    }
  };
  return (
    <>
      <header className="topbar">
        <div className="topbar__titles topbar__titles--icon">
          <PageIcon name="layout" />
          <h1 className="topbar__title">{t('nav.dashboards')}</h1>
          <p className="topbar__sub">{t('rb.dashLead')}</p>
        </div>
        <div className="topbar__spacer" />
        {admin && (
          <button className="btn btn--primary" onClick={() => navigate('/dashboards/new')}>
            <Icon name="plus" size={16} /> {t('rb.dashNew')}
          </button>
        )}
      </header>
      <ReportTabs active="dashboards" />
      <div className="page reports">
        <h2 className="reports__h reports__h--first">
          <Icon name="layout" size={18} /> {t('rb.dashYours')}
        </h2>
        <div className="gallery gallery--reports">
          {/* Always there: the overview of work, customers, deals and targets. */}
          <a className="rcard" href="/reports" onClick={link('/reports')}>
            <span className="rcard__icon">
              <Icon name="gauge" size={18} />
            </span>
            <span className="rcard__text">
              <span className="rcard__name">{t('dash.overview')}</span>
              <span className="rcard__sub">{t('dash.overviewSub')}</span>
            </span>
            <span className="badge">{t('dash.builtIn')}</span>
          </a>
          {pages?.map((p) => (
            <a key={p.id} className="rcard" href={`/dashboards/${p.id}`} onClick={link(`/dashboards/${p.id}`)}>
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
        <h2 className="reports__h">
          <Icon name="bookmark" size={18} /> {t('rb.dashReady')}
        </h2>
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
                    <Icon name="plus" size={16} />
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

// ------------------------------------------------------------- one dashboard

/** "" everything this person may see · "me" · "p:<id>" one person · "t:<id>" one team. */
type ViewAs = string;
const queryOf = (v: ViewAs) => (v === 'me' ? '?person=me' : v.startsWith('p:') ? `?person=${v.slice(2)}` : v.startsWith('t:') ? `?team=${v.slice(2)}` : '');

export function DashboardPage({ id, create }: { id: string | null; create?: boolean }) {
  const { t, locale } = useI18n();
  const { can, me, people, teams } = useStore();
  const admin = can('org.manage') && !me.previewBy;
  const [pages, setPages] = useState<Page[] | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [asOf, setAsOf] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewAs, setViewAs] = useState<ViewAs>('');
  const [draft, setDraft] = useState<Draft | null>(null);

  const loadPages = useCallback(() => get<{ pages: Page[] }>('/pages?kind=dashboard').then((r) => setPages(r.pages), () => setPages([])), []);
  useEffect(() => {
    void loadPages();
  }, [loadPages]);
  useEffect(() => {
    if (create && admin) setDraft({ id: null, kind: 'dashboard', name: t('dash.newName'), cards: [], homeFor: [], sharedWith: [], filters: { person: true, team: true } });
  }, [create, admin]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = pages?.find((p) => p.id === id) ?? null;
  useEffect(() => nameIt(`/dashboards/${id}`, current?.name), [id, current?.name]);
  const load = useCallback(async () => {
    if (!current) return;
    setBusy(true);
    try {
      setData((await get<{ data: Data }>(`/pages/${current.id}/data${queryOf(viewAs)}`)).data);
      setAsOf(new Date());
    } finally {
      setBusy(false);
    }
  }, [current?.id, current?.updatedAt, viewAs]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setData(null);
    void load();
  }, [load]);

  if (draft)
    return (
      <PageEditor
        draft={draft}
        onCancel={() => {
          setDraft(null);
          if (create) navigate('/dashboards');
        }}
        onSaved={async (saved) => {
          setDraft(null);
          await loadPages();
          navigate(`/dashboards/${saved}`, true);
        }}
        onDeleted={async () => {
          setDraft(null);
          navigate('/dashboards', true);
        }}
      />
    );
  if (!pages)
    return (
      <div className="page" style={{ paddingTop: 24 }}>
        <SkeletonCards count={4} label={t('common.loading')} />
      </div>
    );
  if (!current)
    return (
      <div className="page" style={{ paddingTop: 24 }}>
        <EmptyState icon="layout" title={t('dash.notFound')}>
          <button className="btn" onClick={() => navigate('/dashboards')}>
            {t('nav.dashboards')}
          </button>
        </EmptyState>
      </div>
    );

  const filters = current.filters ?? {};
  const time = asOf?.toLocaleTimeString(locale === 'tr' ? 'tr-TR' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
  const shown = current.cards.filter((c) => data?.[c.id]?.kind !== 'hidden');
  return (
    <>
      <header className="topbar dash-top">
        <div className="topbar__titles">
          <h1 className="topbar__title">{current.name}</h1>
          {time && <p className="topbar__sub">{t('dash.asOf', { time })}</p>}
        </div>
        <FavoriteButton kind="dashboard" id={current.id} name={current.name} to={`/dashboards/${current.id}`} />
        <span className="topbar__spacer" />
        <div className="toolbar">
          {(filters.person || filters.team) && (
            <label className="dash-viewas">
              <span className="sr-only">{t('dash.viewAs')}</span>
              <Icon name="filter" size={15} />
              <select className="select" value={viewAs} aria-label={t('dash.viewAs')} onChange={(e) => setViewAs(e.target.value)}>
                <option value="">{t('dash.viewAll')}</option>
                {filters.person && <option value="me">{t('dash.viewMe')}</option>}
                {filters.person && (
                  <optgroup label={t('dash.people')}>
                    {people
                      .filter((p) => p.status === 'active' && p.id !== me.user.id)
                      .map((p) => (
                        <option key={p.id} value={`p:${p.id}`}>
                          {p.name}
                        </option>
                      ))}
                  </optgroup>
                )}
                {filters.team && teams.length > 0 && (
                  <optgroup label={t('dash.teams')}>
                    {teams.map((tm) => (
                      <option key={tm.id} value={`t:${tm.id}`}>
                        {tm.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
          )}
          <button className="btn btn--quiet" disabled={busy} onClick={() => void load()} title={t('dash.refresh')}>
            <Icon name="refresh" size={15} /> {t('dash.refresh')}
          </button>
          {admin && (
            <button className="btn" onClick={() => setDraft(draftOf(current))}>
              {t('dash.edit')}
            </button>
          )}
        </div>
      </header>
      <ReportTabs active="dashboards" />
      <div className="page" aria-busy={busy}>
        {current.cards.length === 0 ? (
          <EmptyState icon="layout" title={t('home.emptyPage')}>
            {admin && (
              <button className="btn btn--primary" onClick={() => setDraft(draftOf(current))}>
                <Icon name="plus" size={16} />
                {t('home.addCard')}
              </button>
            )}
          </EmptyState>
        ) : (
          <div className="panes dash__grid">
            {shown.map((card) => (
              <Tile key={card.id} card={card} data={data?.[card.id]} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
