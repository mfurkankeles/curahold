// The way back, and where this screen sits. Shown above a screen that was
// reached by following something on another screen, and above every screen
// that lives under another one (a customer under Customers, a report under
// Reports). A screen chosen from the main menu shows nothing: the menu is
// its way around.
import { useI18n } from '../lib/i18n';
import { match, nameOf, navigateFresh, panelBack, screenBack, screenOf, useLocation } from '../lib/router';
import { useStore } from '../lib/store';
import { typeLabel, type RecordType } from '../../../shared/src/records';
import { Icon } from './icons';

/** The screen above this one, when it has one. */
export function parentOf(url: string): string | null {
  const [path, qs = ''] = url.split('?');
  const p = new URLSearchParams(qs);
  if (match('/accounts/:id', path)) return '/accounts';
  if (path === '/team' && p.get('person')) return '/team';
  if (path.startsWith('/b/') && p.get('view') === 'archive') return path;
  if (match('/reports/r/:id', path) || path === '/reports/new') return '/reports/all';
  // Dashboards are side by side (the switcher moves between them); only a new one being made has somewhere to go back to.
  if (path === '/dashboards/new') return '/dashboards';
  if (path === '/pages/new') return '/home';
  const sub = match('/settings/:tab/:sub', path);
  if (sub) return `/settings/${sub.tab}`;
  if (['/trash', '/devices', '/profile', '/connect-ai'].includes(path)) return '/home';
  return null;
}

/** What a place is called, for the way back and the path. */
export function usePlaceName(types: RecordType[] | null) {
  const { t, words, locale } = useI18n();
  const { boards, person } = useStore();
  return (url: string): string | null => {
    const [path, qs = ''] = url.split('?');
    const p = new URLSearchParams(qs);
    if (path === '/accounts') {
      const view = p.get('view');
      return view === 'renewals' ? t('nav.renewals') : view === 'reviews' ? t('nav.reviews') : view === 'products' ? t('nav.products') : words.other;
    }
    if (path === '/team') return (p.get('person') && person(p.get('person'))?.name) || t('nav.team');
    const b = match('/b/:id', path);
    if (b) {
      const name = boards.find((x) => x.id === b.id)?.name ?? null;
      return name && p.get('view') === 'archive' ? t('nav.archiveOf', { board: name }) : name;
    }
    const rec = match('/records/:type', path);
    if (rec) {
      const ty = types?.find((x) => x.key === rec.type);
      return ty ? typeLabel(ty, locale) : null;
    }
    if (path === '/settings' || path.startsWith('/settings/')) return nameOf(path) ?? t('nav.settings');
    const fixed: Record<string, string> = {
      '/home': t('nav.home'),
      '/my': t('nav.myTasks'),
      '/inbox': t('nav.inbox'),
      '/calendar': t('nav.calendar'),
      '/timeline': t('nav.timeline'),
      '/reports': t('nav.reports'),
      '/reports/all': t('rb.tab.reports'),
      '/reports/dashboards': t('nav.dashboards'),
      '/dashboards': t('nav.dashboards'),
      '/trash': t('trash.title'),
      '/devices': t('nav.devices'),
      '/profile': t('nav.profile'),
    };
    return nameOf(path) ?? fixed[path] ?? null;
  };
}

export function BackBar({ types }: { types: RecordType[] | null }) {
  const { t } = useI18n();
  const { path, search } = useLocation();
  const name = usePlaceName(types);
  const here = path + search;
  const back = screenBack();
  const parent = parentOf(here);
  if (!back && !parent) return null;

  // The screens above this one, outermost first.
  const above: string[] = [];
  for (let up = parent; up && above.length < 4; up = parentOf(up)) above.unshift(up);
  const to = back?.url ?? parent!;
  const place = name(to);
  // The path earns its room when it says more than the way back already does.
  const showPath = above.length > 1 || (above.length === 1 && !!back && screenOf(back.url) !== screenOf(above[0]));
  const own = nameOf(path);

  return (
    <nav className="backbar" aria-label={t('nav.trail')}>
      <button className="backbar__back" title={place ? t('nav.backTo', { place }) : t('common.back')} onClick={() => (back ? back.go() : navigateFresh(parent!))}>
        <Icon name="arrowLeft" size={16} />
        <span>{place ?? t('common.back')}</span>
      </button>
      {showPath && (
        <ol className="backbar__path">
          {above.map((u) => (
            <li key={u}>
              <a
                href={u}
                onClick={(e) => {
                  e.preventDefault();
                  navigateFresh(u);
                }}
              >
                {name(u) ?? u}
              </a>
            </li>
          ))}
          {own && (
            <li aria-current="page">
              <span>{own}</span>
            </li>
          )}
        </ol>
      )}
    </nav>
  );
}

/**
 * Inside a panel: back to the task or record that was open just before this
 * one. `up` is where to go when there was none (a subtask opened by its own link
 * still leads to its task).
 */
export function PanelBack({ up }: { up?: { title: string; go: () => void } | null }) {
  const { t } = useI18n();
  useLocation();
  const back = panelBack();
  if (!back && !up) return null;
  const title = back ? nameOf(back.was) : up!.title;
  const label = title ? t('panel.backTo', { title }) : t('common.back');
  return (
    <button className="btn btn--quiet btn--small panel__back" title={label} aria-label={label} onClick={() => (back ? back.go() : up!.go())}>
      <Icon name="arrowLeft" size={16} />
      <span className="panel__backname">{title ?? t('common.back')}</span>
    </button>
  );
}
