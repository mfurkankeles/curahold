// Favorites: what a person stars — a customer, a record, a board, a report,
// a dashboard — kept one click away at the top of their menu (Shell.tsx).
// The list is the person's own, saved in their preferences with PATCH /me;
// nothing about it is shared. Names are kept as they were when starred and
// refreshed whenever the star is pressed again.
import { useCallback } from 'react';
import { MAX_FAVORITES, type Favorite } from '../../../shared/src/model';
import { patch } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useStore } from '../lib/store';
import { Icon, type IconName } from './icons';

export const FAVORITE_ICON: Record<Favorite['kind'], IconName> = { account: 'building', record: 'funnel', board: 'board', report: 'chart', dashboard: 'layout' };

export function useFavorites() {
  const { me, reloadMe, toast } = useStore();
  const { t } = useI18n();
  const list = me.user.prefs.favorites ?? [];
  const has = useCallback((id: string) => list.some((f) => f.id === id), [list]);
  const toggle = useCallback(
    async (f: Favorite) => {
      // Newest first; starring a full list lets the oldest go.
      const next = list.some((x) => x.id === f.id) ? list.filter((x) => x.id !== f.id) : [f, ...list].slice(0, MAX_FAVORITES);
      try {
        await patch('/me', { prefs: { favorites: next } });
        await reloadMe();
        toast(next.length > list.length ? t('fav.added', { name: f.name }) : t('fav.removed', { name: f.name }));
      } catch {
        toast(t('errors.server'), 'error');
      }
    },
    [list, reloadMe, toast, t],
  );
  return { list, has, toggle };
}

/** The star beside a page's title. */
export function FavoriteButton(f: Favorite) {
  const { t } = useI18n();
  const { has, toggle } = useFavorites();
  const on = has(f.id);
  const label = on ? t('fav.unstar', { name: f.name }) : t('fav.star', { name: f.name });
  return (
    <button type="button" className="btn btn--quiet btn--icon favstar" aria-pressed={on} aria-label={label} title={label} onClick={() => void toggle(f)}>
      <Icon name="star" size={17} />
    </button>
  );
}
