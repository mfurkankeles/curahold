// Dashboards: pages of charts, each card a report drawn as a picture (or a
// figure, a gauge, a short list). Reports are the data (rows, groups,
// totals — ReportBuilder.tsx); a dashboard puts several of them side by side
// and can narrow all of them at once to one person or one team.
//
//   /dashboards        opens the dashboard looked at last (or the first); a
//                      company with none sees the ready-made ones to add
//   /dashboards/:id    one dashboard, filled: the switcher to the others,
//                      its filter bar, refresh, edit and delete
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
import { ApiFailure, del, get, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { nameIt, navigate, navigateFresh } from '../lib/router';
import { useTrashToast } from '../lib/trash';
import { Confirm } from '../components/ui';
import { TRASH_DAYS } from '../../../shared/src/model';
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
  // Dashboards opens on a dashboard, filled: the one looked at last on this device, or the first.
  // This page itself (the ready-made ones to add) only shows when the company has none left.
  useEffect(() => {
    if (!pages?.length) return;
    const open = pages.find((p) => p.id === lastDashboard()) ?? pages[0];
    navigate(`/dashboards/${open.id}`, true);
  }, [pages]);
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
  if (!pages || pages.length > 0)
    return (
      <div className="page" style={{ paddingTop: 24 }}>
        <SkeletonCards count={4} label={t('common.loading')} />
      </div>
    );
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
        <EmptyState compact icon="layout" title={t('rb.dashNone')}>
          <a className="btn" href="/reports" onClick={link('/reports')}>
            <Icon name="gauge" size={16} /> {t('dash.overview')}
          </a>
        </EmptyState>
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

const LAST = 'app_dash_last';
function lastDashboard(): string | null {
  try {
    return localStorage.getItem(LAST);
  } catch {
    return null;
  }
}

/** From one dashboard to another, and (for an administrator) a new one: blank, or a ready-made one not added yet. */
function DashPicker({ pages, current, admin, onAdded }: { pages: Page[]; current: string; admin: boolean; onAdded: () => Promise<unknown> }) {
  const { t, locale } = useI18n();
  const { toast } = useStore();
  const [adding, setAdding] = useState(false);
  const missing = DASHBOARD_TEMPLATES.filter((d) => !pages.some((p) => p.template === d.key));
  const add = async (key: string) => {
    setAdding(true);
    try {
      const r = await post<{ page: Page }>('/pages/from-template', { template: key });
      await onAdded();
      navigateFresh(`/dashboards/${r.page.id}`);
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setAdding(false);
    }
  };
  return (
    <nav className="dashpick" aria-label={t('nav.dashboards')}>
      <div className="dashpick__list">
        {pages.map((p) => (
          <a
            key={p.id}
            className="dashpick__item"
            href={`/dashboards/${p.id}`}
            aria-current={p.id === current ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault();
              navigateFresh(`/dashboards/${p.id}`);
            }}
          >
            {p.name}
          </a>
        ))}
      </div>
      {admin && (
        <details className="fieldsmenu dashpick__more">
          <summary className="btn btn--quiet btn--small" aria-label={t('dash.add')} title={t('dash.add')}>
            <Icon name="plus" size={16} />
            <span className="hide-phone">{t('dash.add')}</span>
          </summary>
          <div className="fieldsmenu__pop" role="group" aria-label={t('dash.add')}>
            <button className="dashpick__add" onClick={() => navigate('/dashboards/new')}>
              <Icon name="plus" size={16} />
              <span>
                <strong>{t('rb.dashNew')}</strong>
                <small>{t('dash.addBlankHint')}</small>
              </span>
            </button>
            {missing.length > 0 && <p className="fieldsmenu__h">{t('rb.dashReady')}</p>}
            {missing.map((d) => (
              <button key={d.key} className="dashpick__add" disabled={adding} onClick={() => void add(d.key)}>
                <Icon name="layout" size={16} />
                <span>
                  <strong>{labelOf(d.name, locale)}</strong>
                  <small>{labelOf(d.help, locale)}</small>
                </span>
              </button>
            ))}
          </div>
        </details>
      )}
    </nav>
  );
}

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
  // Next time, Dashboards opens on this one.
  useEffect(() => {
    if (!current) return;
    try {
      localStorage.setItem(LAST, current.id);
    } catch {
      /* per-device convenience */
    }
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [removing, setRemoving] = useState(false);
  const trashed = useTrashToast();
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
        <div className="topbar__titles topbar__titles--icon">
          <PageIcon name="layout" />
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
              <Icon name="edit" size={15} />
              {t('dash.edit')}
            </button>
          )}
          {admin && (
            <button className="btn btn--quiet dash-top__delete" aria-label={t('dash.delete')} title={t('dash.delete')} onClick={() => setRemoving(true)}>
              <Icon name="trash" size={16} />
              <span className="hide-phone">{t('common.delete')}</span>
            </button>
          )}
        </div>
      </header>
      <ReportTabs active="dashboards" />
      <DashPicker pages={pages} current={current.id} admin={admin} onAdded={loadPages} />
      {removing && (
        <Confirm
          title={t('dash.deleteTitle', { name: current.name })}
          body={t('dash.deleteBody', { days: TRASH_DAYS })}
          confirmLabel={t('dash.delete')}
          danger
          onClose={() => setRemoving(false)}
          onConfirm={async () => {
            const gone = current.id;
            trashed(await del(`/pages/${gone}`), () => {
              void loadPages();
              navigate(`/dashboards/${gone}`);
            });
            setRemoving(false);
            await loadPages();
            navigate('/dashboards', true);
          }}
        />
      )}
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
