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

export function SavedViews<S extends State>({
  scope,
  boardId,
  state,
  onApply,
  canSave = true,
}: {
  scope: ViewScope;
  boardId?: string;
  /** How the list is shown now: what "Save" keeps. */
  state: S;
  onApply: (s: S) => void;
  /** Whether there is anything to keep yet (a filter on, an order or layout chosen). */
  canSave?: boolean;
}) {
  const { t } = useI18n();
  const { toast, canWrite } = useStore();
  const phone = usePhone();
  const later = useDeleteLater();
  const [views, setViews] = useState<View[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<View | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
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
  const apply = (v: View) => {
    setActive(v);
    markLink(v.id);
    onApply(v.filters as S);
    setOpen(false);
  };
  const save = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    try {
      const r = await post<{ view: View }>('/views', { scope, ...(scope === 'board' ? { boardId } : {}), name: n, filters: state, shared: shared && canWrite });
      setName('');
      setShared(false);
      toast(t('views.saved', { name: n }));
      setActive(r.view);
      markLink(r.view.id);
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const share = async (v: View) => {
    try {
      await patch(`/views/${v.id}`, { shared: !v.shared });
      toast(t(v.shared ? 'views.nowPrivate' : 'views.nowShared', { name: v.name }));
      await load();
    } catch (e) {
      fail(e);
    }
  };
  const copy = async (v: View) => {
    const link = `${location.origin}${location.pathname}?saved=${v.id}`;
    try {
      await navigator.clipboard.writeText(link);
      toast(t('views.linkCopied', { name: v.name }));
    } catch {
      markLink(v.id);
      toast(t('views.linkInAddress', { name: v.name }));
    }
  };
  const remove = (v: View) => {
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
  };

  const list = views.filter((v) => !hidden.has(v.id));
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
  if (phone) return <FilterGroup label={active ? t('views.current', { name: active.name }) : t('views.button')}>{body}</FilterGroup>;
  return (
    <div className="menuwrap savedviews" ref={ref}>
      <button type="button" className="btn" aria-haspopup="dialog" aria-expanded={open} data-on={active ? true : undefined} onClick={() => setOpen(!open)}>
        <Icon name="bookmark" size={16} />
        <span className="savedviews__label">{active ? active.name : t('views.button')}</span>
        {!active && list.length > 0 && <span className="fcount fcount--quiet num">{list.length}</span>}
      </button>
      {open && (
        <div className="popmenu filterpop" role="dialog" aria-label={t('views.button')}>
          {body}
        </div>
      )}
    </div>
  );
}
