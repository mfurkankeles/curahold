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
import { useCallback, useEffect, useRef, useState } from 'react';
import { labelOf } from '../../../shared/src/fields';
import type { Card, Page } from '../../../shared/src/pages';
import { DASHBOARD_TEMPLATES } from '../../../shared/src/reports';
import { ChartGlyph } from '../components/ChartGlyph';
import { EmptyState, ErrorState, LoadError, NotAllowed, SkeletonCards } from '../components/Empty';
import { FilterGroup, FilterSheet, usePhone } from '../components/FilterSheet';
import { MenuButton, type MenuItem } from '../components/Menus';
import { useUndo } from '../lib/undo';
import { FavoriteButton } from '../components/Favorites';
import { Icon, PageIcon } from '../components/icons';
import { ApiFailure, del, get, patch, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { nameIt, navigate, navigateFresh } from '../lib/router';
import { useTrashToast } from '../lib/trash';
import { Confirm } from '../components/ui';
import { TRASH_DAYS } from '../../../shared/src/model';
import { useStore } from '../lib/store';
import { draftOf, PageEditor, Tile, useCardTitle, type Data, type Draft } from './Home';
import { ReportTabs } from './ReportBuilder';
import { formatClock, formatNumber } from '../lib/format';

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
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [adding, setAdding] = useState<string | null>(null);
  useEffect(() => {
    setFailed(null);
    void get<{ pages: Page[] }>('/pages?kind=dashboard').then(setPagesOf, (e) => setFailed(e instanceof ApiFailure ? e.body.message : ''));
    function setPagesOf(r: { pages: Page[] }) {
      setPages(r.pages);
    }
  }, [attempt]);
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
  if (!pages && failed !== null)
    return (
      <div className="page u-pt-24">
        <ErrorState body={failed} onRetry={() => setAttempt((n) => n + 1)} />
      </div>
    );
  if (!pages || pages.length > 0)
    return (
      <div className="page u-pt-24">
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
                <span className="muted">{t('rb.dashCards', { n: formatNumber(d.cards.length, locale) })}</span>
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
  const { can, me, people, teams, toast } = useStore();
  const admin = can('org.manage') && !me.previewBy;
  const phone = usePhone();
  const title = useCardTitle();
  const offer = useUndo();
  const [pages, setPages] = useState<Page[] | null>(null);
  const [pagesFailed, setPagesFailed] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [asOf, setAsOf] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewAs, setViewAs] = useState<ViewAs>('');
  const [draft, setDraft] = useState<Draft | null>(null);

  const loadPages = useCallback(
    () =>
      get<{ pages: Page[] }>('/pages?kind=dashboard').then(
        (r) => {
          setPages(r.pages);
          setPagesFailed(null);
        },
        (e) => setPagesFailed(e instanceof ApiFailure ? e.body.message : ''),
      ),
    [],
  );
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
    setFailed(null);
    try {
      setData((await get<{ data: Data }>(`/pages/${current.id}/data${queryOf(viewAs)}`)).data);
      setAsOf(new Date());
    } catch (e) {
      setFailed(e instanceof ApiFailure ? e.body.message : '');
    } finally {
      setBusy(false);
    }
  }, [current?.id, current?.updatedAt, viewAs]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setData(null);
    void load();
  }, [load]);

  // ------------------------------------------------------------ moving cards
  // By dragging a card's handle, or with the arrow keys on it. The page is saved a moment after
  // the last move, and the toast offers the order from before (lib/undo.ts).
  const [arranging, setArranging] = useState(false);
  const [order, setOrder] = useState<Card[] | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [said, setSaid] = useState('');
  const before = useRef<Card[] | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const refocus = useRef<string | null>(null);
  const cards = order ?? current?.cards ?? [];
  useEffect(() => {
    setOrder(null);
    setArranging(false);
  }, [current?.id]);
  useEffect(() => {
    if (!refocus.current) return;
    document.querySelector<HTMLElement>(`[data-grip="${refocus.current}"]`)?.focus();
    refocus.current = null;
  }, [order]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const keep = (pageId: string, list: Card[]) => setPages((ps) => ps?.map((p) => (p.id === pageId ? { ...p, cards: list } : p)) ?? ps);
  const moveTo = (from: number, to: number): Card[] => {
    const list = [...cards];
    const [c] = list.splice(from, 1);
    list.splice(to, 0, c);
    if (!before.current) before.current = cards;
    setOrder(list);
    return list;
  };
  const commit = (list: Card[]) => {
    if (!current || !before.current) return;
    const pageId = current.id;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const was = before.current;
      before.current = null;
      if (!was) return;
      try {
        await patch(`/pages/${pageId}`, { cards: list });
        keep(pageId, list);
        offer(t('dash.moved'), async () => {
          await patch(`/pages/${pageId}`, { cards: was });
          keep(pageId, was);
          setOrder((o) => (o ? was : o));
        });
      } catch (e) {
        toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
        setOrder(was);
      }
    }, 500);
  };
  const grip = (card: Card, at: number) => (
    <button
      type="button"
      className="dash-grip"
      data-grip={card.id}
      aria-label={t('dash.moveCard', { card: title(card) })}
      aria-describedby="dash-arrange-hint"
      onKeyDown={(e) => {
        const back = document.documentElement.dir === 'rtl';
        let to = at;
        if (e.key === 'ArrowUp' || e.key === (back ? 'ArrowRight' : 'ArrowLeft')) to = at - 1;
        else if (e.key === 'ArrowDown' || e.key === (back ? 'ArrowLeft' : 'ArrowRight')) to = at + 1;
        else if (e.key === 'Home') to = 0;
        else if (e.key === 'End') to = cards.length - 1;
        else return;
        e.preventDefault();
        if (to < 0 || to >= cards.length || to === at) return;
        refocus.current = card.id;
        const list = moveTo(at, to);
        setSaid(t('dash.place', { card: title(card), n: formatNumber(to + 1, locale), total: formatNumber(cards.length, locale) }));
        commit(list);
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(card.id);
      }}
      onPointerMove={(e) => {
        if (dragging !== card.id) return;
        const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-card]')?.dataset.card;
        if (!over || over === card.id) return;
        moveTo(at, cards.findIndex((c) => c.id === over));
      }}
      onPointerUp={() => {
        if (dragging !== card.id) return;
        setDragging(null);
        setSaid(t('dash.place', { card: title(card), n: formatNumber(at + 1, locale), total: formatNumber(cards.length, locale) }));
        commit(cards);
      }}
      onPointerCancel={() => setDragging(null)}
    >
      <Icon name="grip" size={18} />
    </button>
  );

  if (create && !admin)
    return (
      <div className="page u-pt-24">
        <NotAllowed />
      </div>
    );
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
  if (!pages && pagesFailed !== null)
    return (
      <div className="page u-pt-24">
        <ErrorState body={pagesFailed} onRetry={() => void loadPages()} />
      </div>
    );
  if (!pages)
    return (
      <div className="page u-pt-24">
        <SkeletonCards count={4} label={t('common.loading')} />
      </div>
    );
  if (!current)
    return (
      <div className="page u-pt-24">
        <EmptyState icon="layout" title={t('dash.notFound')}>
          <button className="btn" onClick={() => navigate('/dashboards')}>
            {t('nav.dashboards')}
          </button>
        </EmptyState>
      </div>
    );

  const filters = current.filters ?? {};
  const time = asOf ? formatClock(asOf, locale) : undefined;
  const shown = cards.filter((c) => data?.[c.id]?.kind !== 'hidden');
  const more: (MenuItem | 'sep')[] = [
    ...(phone ? [{ key: 'refresh', label: t('dash.refresh'), icon: 'refresh' as const, onSelect: () => void load() }] : []),
    ...(admin && phone ? [{ key: 'edit', label: t('dash.edit'), icon: 'edit' as const, onSelect: () => setDraft(draftOf(current)) }] : []),
    ...(admin && current.cards.length > 1 ? [{ key: 'arrange', label: t('dash.arrange'), icon: 'grip' as const, onSelect: () => setArranging(true) }] : []),
    ...(admin ? [...(phone || current.cards.length > 1 ? ['sep' as const] : []), { key: 'delete', label: t('dash.delete'), icon: 'trash' as const, danger: true, onSelect: () => setRemoving(true) }] : []),
  ];
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
        <div className="toolbar dash-tools">
          {(filters.person || filters.team) && (
            <FilterSheet count={viewAs ? 1 : 0} onClear={() => setViewAs('')} title={t('dash.viewAs')}>
              <FilterGroup label={t('dash.viewAs')}>
                <label className="dash-viewas">
                  {!phone && <Icon name="filter" size={15} />}
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
              </FilterGroup>
            </FilterSheet>
          )}
          {!phone && (
            <button className="btn btn--quiet" disabled={busy} onClick={() => void load()}>
              <Icon name="refresh" size={15} /> {t('dash.refresh')}
            </button>
          )}
          {admin && !phone && (
            <button className="btn" onClick={() => setDraft(draftOf(current))}>
              <Icon name="edit" size={15} />
              {t('dash.edit')}
            </button>
          )}
          {more.length > 0 && (
            <MenuButton
              label={t('rb.more')}
              buttonClass="btn btn--quiet btn--icon"
              place="down-end"
              button={
                <>
                  <Icon name="more" size={16} />
                  <span className="sr-only">{t('rb.more')}</span>
                </>
              }
              items={more}
            />
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
        {arranging && (
          <div className="dash-arrange">
            <p id="dash-arrange-hint" className="dash-arrange__hint">
              {t('dash.arrangeHint')}
            </p>
            <button className="btn btn--primary btn--small" onClick={() => setArranging(false)}>
              {t('dash.arrangeDone')}
            </button>
          </div>
        )}
        <p className="sr-only" role="status">
          {said}
        </p>
        {failed !== null && <LoadError message={failed} onRetry={() => void load()} />}
        {current.cards.length === 0 ? (
          <EmptyState icon="layout" title={t('home.emptyPage')}>
            {admin && (
              <button className="btn btn--primary" onClick={() => setDraft(draftOf(current))}>
                <Icon name="plus" size={16} />
                {t('home.addCard')}
              </button>
            )}
          </EmptyState>
        ) : failed !== null && !data ? null : (
          <div className="panes dash__grid" data-arranging={arranging || undefined}>
            {shown.map((card) => (
              <div key={card.id} className="dash-card" data-card={card.id} data-dragging={dragging === card.id || undefined}>
                <Tile card={card} data={data?.[card.id]} tools={arranging ? grip(card, cards.indexOf(card)) : undefined} />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
