// Narrow a board down — by person, urgency, due date or the board's own
// choice fields — and keep a set of filters as a named view, for yourself
// or for everyone on the board.
import { useEffect, useRef, useState } from 'react';
import { labelOf } from '../../../shared/src/fields';
import { PRIORITIES, type Board, type SavedView, type Task, type ViewFilters } from '../../../shared/src/model';
import { ApiFailure, del, get, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useStore } from '../lib/store';
import { addDays, todayIso } from '../lib/time';
import { Icon } from './icons';
import { useDismiss } from './Menus';

const DUE = ['late', 'today', 'week', 'later', 'none'] as const;

export function matchFilters(x: Task, f: ViewFilters, me: string, done: boolean): boolean {
  const q = (f.q ?? '').trim().toLocaleLowerCase();
  if (q && !x.title.toLocaleLowerCase().includes(q) && !(x.accountName ?? '').toLocaleLowerCase().includes(q)) return false;
  if (f.assignees?.length && !f.assignees.some((a) => (a === 'none' ? x.assigneeIds.length === 0 : x.assigneeIds.includes(a === 'me' ? me : a)))) return false;
  if (f.priority?.length && !f.priority.includes(x.priority)) return false;
  if (f.due?.length) {
    const today = todayIso();
    const bucket = !x.dueDate ? 'none' : done ? null : x.dueDate < today ? 'late' : x.dueDate === today ? 'today' : x.dueDate <= addDays(today, 7) ? 'week' : 'later';
    if (!bucket || !f.due.includes(bucket)) return false;
  }
  for (const [k, vals] of Object.entries(f.fields ?? {})) {
    if (vals.length && !vals.includes(String(x.fields?.[k] ?? ''))) return false;
  }
  return true;
}

export const filterCount = (f: ViewFilters) => (f.assignees?.length ? 1 : 0) + (f.priority?.length ? 1 : 0) + (f.due?.length ? 1 : 0) + Object.values(f.fields ?? {}).filter((v) => v.length).length;

function toggle<T>(list: T[] | undefined, v: T): T[] {
  const cur = list ?? [];
  return cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
}

export function FilterBar({ board, filters, onChange }: { board: Board; filters: ViewFilters; onChange: (f: ViewFilters) => void }) {
  const { t, locale } = useI18n();
  const { people, me, toast, canWrite } = useStore();
  const [open, setOpen] = useState<null | 'filter' | 'views'>(null);
  const [views, setViews] = useState<SavedView[]>([]);
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, !!open, () => setOpen(null));
  const loadViews = () => get<{ views: SavedView[] }>(`/views?board=${board.id}`).then((r) => setViews(r.views), () => undefined);
  useEffect(() => {
    void loadViews();
  }, [board.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = filterCount(filters);
  const selects = board.taskFields.filter((f) => f.type === 'select' && f.options?.length);
  const members = people.filter((p) => p.seat === 'full' && p.status === 'active');
  const chip = (on: boolean, label: string, click: () => void, key: string) => (
    <button key={key} type="button" className="fchip" aria-pressed={on} onClick={click}>
      {label}
    </button>
  );
  const save = async () => {
    if (!name.trim()) return;
    try {
      await post('/views', { boardId: board.id, name: name.trim(), filters: { ...filters, q: undefined }, shared });
      setName('');
      setShared(false);
      toast(t('views.saved', { name: name.trim() }));
      await loadViews();
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    }
  };
  return (
    <div className="filterbar" ref={ref}>
      <input className="input search" type="search" placeholder={t('board.searchPlaceholder')} aria-label={t('common.search')} value={filters.q ?? ''} onChange={(e) => onChange({ ...filters, q: e.target.value })} />
      <div className="seg" role="group">
        <button aria-pressed={!filters.assignees?.length} onClick={() => onChange({ ...filters, assignees: [] })}>
          {t('board.filter.everyone')}
        </button>
        <button aria-pressed={filters.assignees?.length === 1 && filters.assignees[0] === 'me'} onClick={() => onChange({ ...filters, assignees: ['me'] })}>
          {t('board.filter.mine')}
        </button>
      </div>
      <div className="menuwrap">
        <button className="btn" aria-haspopup="dialog" aria-expanded={open === 'filter'} data-on={n > 0 || undefined} onClick={() => setOpen(open === 'filter' ? null : 'filter')}>
          <Icon name="filter" size={16} />
          {t('filters.button')}
          {n > 0 && <span className="fcount num">{n}</span>}
        </button>
        {open === 'filter' && (
          <div className="popmenu filterpop" role="dialog" aria-label={t('filters.button')}>
            <div className="filterpop__group">
              <span className="filterpop__label">{t('task.assignees')}</span>
              <div className="filterpop__chips">
                {chip(!!filters.assignees?.includes('me'), t('filters.me'), () => onChange({ ...filters, assignees: toggle(filters.assignees, 'me') }), 'me')}
                {chip(!!filters.assignees?.includes('none'), t('task.unassigned'), () => onChange({ ...filters, assignees: toggle(filters.assignees, 'none') }), 'none')}
                {members.filter((p) => p.id !== me.user.id).map((p) => chip(!!filters.assignees?.includes(p.id), p.name, () => onChange({ ...filters, assignees: toggle(filters.assignees, p.id) }), p.id))}
              </div>
            </div>
            <div className="filterpop__group">
              <span className="filterpop__label">{t('task.due')}</span>
              <div className="filterpop__chips">{DUE.map((d) => chip(!!filters.due?.includes(d), t(`filters.due.${d}` as any), () => onChange({ ...filters, due: toggle(filters.due, d) }), d))}</div>
            </div>
            <div className="filterpop__group">
              <span className="filterpop__label">{t('task.priority')}</span>
              <div className="filterpop__chips">{[...PRIORITIES].reverse().map((p) => chip(!!filters.priority?.includes(p), t(`task.priority.${p}`), () => onChange({ ...filters, priority: toggle(filters.priority, p) }), p))}</div>
            </div>
            {selects.map((f) => (
              <div key={f.key} className="filterpop__group">
                <span className="filterpop__label">{labelOf(f.label, locale)}</span>
                <div className="filterpop__chips">
                  {f.options!.map((o) => chip(!!filters.fields?.[f.key]?.includes(o.key), labelOf(o.label, locale), () => onChange({ ...filters, fields: { ...(filters.fields ?? {}), [f.key]: toggle(filters.fields?.[f.key], o.key) } }), o.key))}
                </div>
              </div>
            ))}
            <div className="filterpop__foot">
              <button className="linkbtn" disabled={!n} onClick={() => onChange({ q: filters.q })}>
                {t('filters.clear')}
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="menuwrap">
        <button className="btn" aria-haspopup="menu" aria-expanded={open === 'views'} onClick={() => setOpen(open === 'views' ? null : 'views')}>
          <Icon name="bookmark" size={16} />
          <span className="hide-phone">{t('views.button')}</span>
          {views.length > 0 && <span className="fcount fcount--quiet num">{views.length}</span>}
        </button>
        {open === 'views' && (
          <div className="popmenu filterpop" role="menu" aria-label={t('views.button')}>
            {views.length === 0 && <span className="popmenu__note">{t('views.none')}</span>}
            {views.map((v) => (
              <div key={v.id} className="viewrow">
                <button
                  role="menuitem"
                  className="popmenu__item"
                  onClick={() => {
                    onChange({ ...v.filters, q: '' });
                    setOpen(null);
                  }}
                >
                  <Icon name={v.shared ? 'people' : 'bookmark'} size={16} />
                  <span className="popmenu__label">{v.name}</span>
                </button>
                {v.mine && (
                  <button
                    className="btn btn--quiet btn--icon btn--small"
                    aria-label={t('views.remove', { name: v.name })}
                    title={t('common.delete')}
                    onClick={async () => {
                      await del(`/views/${v.id}`).catch(() => undefined);
                      await loadViews();
                    }}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                )}
              </div>
            ))}
            <div className="popmenu__sep" role="separator" />
            <div className="viewsave">
              <span className="filterpop__label">{n ? t('views.saveThese') : t('views.saveHint')}</span>
              <div className="popmenu__form">
                <input className="input" value={name} placeholder={t('views.name')} aria-label={t('views.name')} maxLength={80} disabled={!n} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void save()} />
                <button className="btn btn--primary btn--small" disabled={!n || !name.trim()} onClick={save}>
                  {t('common.save')}
                </button>
              </div>
              {canWrite && (
                <label className="checkbox small">
                  <input type="checkbox" checked={shared} disabled={!n} onChange={(e) => setShared(e.target.checked)} />
                  <span>{t('views.share')}</span>
                </label>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
