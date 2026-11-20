// Saved views: one component for every list — a board, the customer list, a
// records list, My tasks and the timeline. A view keeps how a list is shown (its
// filter, order, columns and layout) under a name; it is its maker's own or shared
// with the whole company; it opens by its link (?saved=<id>, in a new tab too);
// and a deleted one comes back with Undo for 10 seconds (lib/deleteLater).
// On a desktop it is a "Views" button with a popover; inside the phone filter
// sheet it is a group of its own.
import { useEffect, useRef, useState } from 'react';
import type { ViewScope } from '../../../shared/src/model';
import { ApiFailure, del, get, patch, post } from '../lib/api';
import { useDeleteLater } from '../lib/deleteLater';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { useStore } from '../lib/store';
import { FilterGroup, usePhone } from './FilterSheet';
import { Icon } from './icons';
import { useDismiss } from './Menus';
import '../surfaces/exports-views.css';
import { useLeave } from '../lib/leave';

type State = Record<string, unknown>;
interface View {
  id: string;
  scope: ViewScope;
  name: string;
  filters: State;
  shared: boolean;
  mine: boolean;
}

/** The same view, whatever the order of its keys and whether an empty value is written out. */
function canon(s: State): string {
  const keep = Object.keys(s)
    .filter((k) => {
      const v = s[k];
      return !(v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && v !== null && !Object.keys(v).length));
    })
    .sort();
  return JSON.stringify(keep.map((k) => [k, s[k]]));
}

/** The address with ?saved= set (or taken away), replacing this history entry. */
function markLink(id: string | null) {
  const p = new URLSearchParams(location.search);
  if ((p.get('saved') ?? null) === id) return;
  if (id) p.set('saved', id);
  else p.delete('saved');
  const qs = p.toString();
  navigate(location.pathname + (qs ? `?${qs}` : ''), true);
}

export interface SavedViewsCtl {
  scope: ViewScope;
  views: View[];
  active: View | null;
  apply: (v: View) => void;
  save: (name: string, shared: boolean) => Promise<boolean>;
  share: (v: View) => Promise<void>;
  copy: (v: View) => Promise<void>;
  remove: (v: View) => void;
}

/**
 * A list's saved views. Called by the list itself (so a link to a view opens it even while the
 * phone filter sheet, where the views are shown, is closed); <SavedViews ctl> shows them.
 */
export function useSavedViews<S extends State>({ scope, boardId, state, onApply }: { scope: ViewScope; boardId?: string; /** How the list is shown now: what "Save" keeps. */ state: S; onApply: (s: S) => void }): SavedViewsCtl {
  const { t } = useI18n();
  const { toast, canWrite } = useStore();
  const later = useDeleteLater();
  const [views, setViews] = useState<View[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<View | null>(null);
  const query = scope === 'board' ? `board=${boardId ?? ''}` : `scope=${encodeURIComponent(scope)}`;
  const load = () => get<{ views: View[] }>(`/views?${query}`).then((r) => setViews(r.views), () => undefined);
  useEffect(() => {
    void load();
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  // Opened by its link: the view is read once and put on the list.
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('saved');
    if (!id) return;
    get<{ view: View }>(`/views/${id}`).then(
      (r) => {
        if (r.view.scope !== scope) return;
        setActive(r.view);
        onApply(r.view.filters as S);
      },
      () => {
        markLink(null);
        toast(t('views.gone'), 'error');
      },
    );
  }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps

  // Changed since it was opened: no longer that view, and the address says so.
  const now = canon(state);
  useEffect(() => {
    if (active && canon(active.filters) !== now) {
      setActive(null);
      markLink(null);
    }
  }, [now]); // eslint-disable-line react-hooks/exhaustive-deps

  const fail = (e: unknown) => toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
  return {
    scope,
    views: views.filter((v) => !hidden.has(v.id)),
    active,
    apply: (v) => {
      setActive(v);
      markLink(v.id);
      onApply(v.filters as S);
    },
    save: async (name, shared) => {
      try {
        const r = await post<{ view: View }>('/views', { scope, ...(scope === 'board' ? { boardId } : {}), name, filters: state, shared: shared && canWrite });
        toast(t('views.saved', { name }));
        setActive(r.view);
        markLink(r.view.id);
        await load();
        return true;
      } catch (e) {
        fail(e);
        return false;
      }
    },
    share: async (v) => {
      try {
        await patch(`/views/${v.id}`, { shared: !v.shared });
        toast(t(v.shared ? 'views.nowPrivate' : 'views.nowShared', { name: v.name }));
        await load();
      } catch (e) {
        fail(e);
      }
    },
    copy: async (v) => {
      const link = `${location.origin}${location.pathname}?saved=${v.id}`;
      try {
        await navigator.clipboard.writeText(link);
        toast(t('views.linkCopied', { name: v.name }));
      } catch {
        markLink(v.id);
        toast(t('views.linkInAddress', { name: v.name }));
      }
    },
    remove: (v) => {
      if (active?.id === v.id) {
        setActive(null);
        markLink(null);
      }
      later(t('views.removed', { name: v.name }), {
        hide: () => setHidden((h) => new Set(h).add(v.id)),
        unhide: () =>
          setHidden((h) => {
            const next = new Set(h);
            next.delete(v.id);
            return next;
          }),
        commit: () => del(`/views/${v.id}`),
        after: () => void load(),
      });
    },
  };
}

/** The views of a list: a "Views" popover on a desktop, a group of its own in the phone filter sheet. */
export function SavedViews({ ctl, canSave = true }: { ctl: SavedViewsCtl; /** Whether there is anything to keep yet (a filter on, an order or layout chosen). */ canSave?: boolean }) {
  const leavePop = useLeave<HTMLDivElement>();
  const { t } = useI18n();
  const { canWrite } = useStore();
  const phone = usePhone();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  // The popover opens towards the side with room: from the button's start, or back from its end.
  const [place, setPlace] = useState<'start' | 'end'>('start');
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const { scope, active } = ctl;
  const toggle = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r && !open) {
      const rtl = getComputedStyle(ref.current!).direction === 'rtl';
      const room = rtl ? r.right : window.innerWidth - r.left;
      setPlace(room >= Math.min(372, window.innerWidth - 24) ? 'start' : 'end');
    }
    setOpen(!open);
  };
  const apply = (v: View) => {
    ctl.apply(v);
    setOpen(false);
  };
  const save = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    if (await ctl.save(n, shared)) {
      setName('');
      setShared(false);
      // Saved: the button now carries the view's name.
      setOpen(false);
    }
    setBusy(false);
  };
  const { copy, share, remove } = ctl;
  const list = ctl.views;
  const body = (
    <div className="savedviews__body">
      {list.length === 0 && <p className="popmenu__note">{t('views.none')}</p>}
      {list.length > 0 && (
        <ul className="savedviews__list">
          {list.map((v) => (
            <li key={v.id} className="viewrow" data-active={active?.id === v.id || undefined}>
              <button type="button" className="popmenu__item" aria-current={active?.id === v.id || undefined} onClick={() => apply(v)}>
                <Icon name={v.shared ? 'people' : 'bookmark'} size={16} />
                <span className="popmenu__label">{v.name}</span>
                {v.shared && <span className="sr-only">{t('views.sharedTag')}</span>}
              </button>
              <button type="button" className="btn btn--quiet btn--icon btn--small" aria-label={t('views.copyLink', { name: v.name })} title={t('views.copyLink', { name: v.name })} onClick={() => void copy(v)}>
                <Icon name="link" size={14} />
              </button>
              {v.mine && canWrite && (
                <button
                  type="button"
                  className="btn btn--quiet btn--icon btn--small"
                  aria-pressed={v.shared}
                  aria-label={t(v.shared ? 'views.shareOff' : 'views.shareOn', { name: v.name })}
                  title={t(v.shared ? 'views.shareOff' : 'views.shareOn', { name: v.name })}
                  onClick={() => void share(v)}
                >
                  <Icon name="people" size={14} />
                </button>
              )}
              {v.mine && (
                <button type="button" className="btn btn--quiet btn--icon btn--small" aria-label={t('views.remove', { name: v.name })} title={t('common.delete')} onClick={() => remove(v)}>
                  <Icon name="trash" size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="popmenu__sep" role="separator" />
      <div className="viewsave">
        <span className="filterpop__label">{canSave ? t('views.saveList') : t('views.saveHint')}</span>
        <div className="popmenu__form">
          <input
            className="input"
            value={name}
            placeholder={t('views.name')}
            aria-label={t('views.name')}
            maxLength={80}
            disabled={!canSave}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void save()}
          />
          <button type="button" className="btn btn--primary btn--small" disabled={!canSave || !name.trim() || busy} onClick={() => void save()}>
            <Icon name="check" size={16} />
            {t('common.save')}
          </button>
        </div>
        {canWrite && (
          <label className="checkbox small">
            <input type="checkbox" checked={shared} disabled={!canSave} onChange={(e) => setShared(e.target.checked)} />
            <span>{scope === 'board' ? t('views.share') : t('views.shareCompany')}</span>
          </label>
        )}
      </div>
    </div>
  );

  // In the phone filter sheet: a group of its own, open.
  if (phone) return <FilterGroup label={active ? t('views.current', { name: active.name }) : t('views.title')}>{body}</FilterGroup>;
  // In a full toolbar: the bookmark and how many there are; the open view's name once one is open.
  return (
    <div className="menuwrap savedviews" ref={ref}>
      <button
        type="button"
        className="btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={t('views.title')}
        data-on={active ? true : undefined}
        onClick={toggle}
      >
        <Icon name="bookmark" size={16} />
        {/* The name read out is what is shown, with "Saved views" in front for a screen reader. */}
        <span className="sr-only">{t('views.title')}</span>
        {active && <span className="savedviews__label">{active.name}</span>}
        {!active && list.length > 0 && <span className="fcount fcount--quiet num">{list.length}</span>}
      </button>
      {open && (
        <div ref={leavePop} className="popmenu filterpop" role="dialog" aria-label={t('views.title')} data-place={place}>
          {body}
        </div>
      )}
    </div>
  );
}
