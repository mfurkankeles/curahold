// The frame around every screen: where you are, where you can go, and the
// one button that adds anything. On a phone the same things sit in a bar at
// the bottom, within reach of a thumb.
import { FAVORITE_ICON } from './Favorites';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Locale } from '../../../shared/src/i18n';
import { ADMIN_PERMS, SETUP_STEPS } from '../../../shared/src/model';
import { endPreview, get, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { newsUnseen, type NewsAction } from '../lib/news';
import { navigate, useLocation } from '../lib/router';
import { ShellCtx, TASKS_CHANGED, currentPageDefaults, useNarrow, type QuickDefaults, type ShellActions } from '../lib/shell';
import { LIVE, startLive, useLive } from '../lib/live';
import { forgetOffline, useInstall, useOnline } from '../lib/pwa';
import { useStore } from '../lib/store';
import { useTheme, type ThemePref } from '../lib/theme';
import { Bell } from './Bell';
import { BoardSettings } from './BoardSettings';
import { HelpDialog } from './Help';
import { Icon, type IconName } from './icons';
import { MenuButton, MenuChoices } from './Menus';
import { QuickAdd } from './QuickAdd';
import { SearchPalette, useSearchKey } from './Search';
import { LogTouch, WhatsNew } from './ShellDialogs';
import { ShortcutsDialog, modKey, useShortcuts } from './Shortcuts';
import { Avatar, Dialog, Mark } from './ui';
import { useRecordTypes } from './AccountFields';
import { typeLabel } from '../../../shared/src/records';

/** Unread notifications, for the number beside "Inbox". */
function useUnread() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const load = () => void get<{ unread: number }>('/notifications/count').then((r) => setN(r.unread), () => undefined);
    load();
    window.addEventListener('tw:inbox-changed', load);
    return () => window.removeEventListener('tw:inbox-changed', load);
  }, []);
  // Someone else's doing: the number arrives with the pulse.
  useLive('unread', (p) => setN(p.unread));
  return n;
}

/** Late and due-today tasks of mine, for the number beside "My tasks". */
function useMyCounts() {
  const [n, setN] = useState({ late: 0, today: 0 });
  useEffect(() => {
    const load = () => void get<{ late: number; today: number }>('/tasks/counts').then(setN, () => undefined);
    load();
    // Midnight moves "today" without anything changing on the server.
    const id = setInterval(load, 3_600_000);
    window.addEventListener(TASKS_CHANGED, load);
    const live = (e: Event) => {
      if ((e as CustomEvent<{ kinds: string[] }>).detail.kinds.includes('tasks')) load();
    };
    window.addEventListener(LIVE, live);
    window.addEventListener('focus', load);
    return () => {
      clearInterval(id);
      window.removeEventListener(LIVE, live);
      window.removeEventListener(TASKS_CHANGED, load);
      window.removeEventListener('focus', load);
    };
  }, []);
  return n;
}

export function Shell({ children, onLocale }: { children: ReactNode; onLocale: (l: Locale) => void }) {
  const { t, locale, words } = useI18n();
  const { me, boards, canWrite, person, toasts, can, dismiss } = useStore();
  const { path, search } = useLocation();
  const narrow = useNarrow();
  const [navOpen, setNavOpen] = useState(false);
  const [newBoard, setNewBoard] = useState(false);
  const [searching, setSearching] = useState(false);
  // "#help" (the link in a help request's receipt) opens the person's requests.
  const [help, setHelp] = useState<null | 'new' | 'mine'>(() => (location.hash === '#help' ? 'mine' : null));
  const [quick, setQuick] = useState<QuickDefaults | null>(null);
  const [keys, setKeys] = useState(false);
  const [news, setNews] = useState(false);
  const [fresh, setFresh] = useState(newsUnseen);
  const [touch, setTouch] = useState<{ accountId?: string | null; accountName?: string | null; kind?: 'note' | 'call' | 'meeting' | 'email' | 'review' } | null>(null);
  const [theme, setTheme] = useTheme();
  const counts = useMyCounts();
  const { types: recordTypes, load: reloadTypes } = useRecordTypes();
  const unread = useUnread();
  // Sections of the menu fold away; which ones is remembered on this device.
  const [folded, setFolded] = useState<string[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem('tw_nav_folded') ?? '[]');
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  });
  const fold = (key: string) => {
    const next = folded.includes(key) ? folded.filter((k) => k !== key) : [...folded, key];
    setFolded(next);
    try {
      localStorage.setItem('tw_nav_folded', JSON.stringify(next));
    } catch {
      /* per-device convenience */
    }
  };
  useEffect(() => {
    if (location.hash === '#help') history.replaceState(null, '', location.pathname + location.search);
  }, []);
  useEffect(() => setNavOpen(false), [path]);
  useEffect(() => {
    if (path.startsWith('/records') || path.startsWith('/accounts')) void reloadTypes();
  }, [path, reloadTypes]);
  // Little <details> menus close on a click elsewhere or on Escape, like the other menus.
  useEffect(() => {
    const shut = (keep?: Node) => document.querySelectorAll('details.fieldsmenu[open]').forEach((d) => (!keep || !d.contains(keep)) && d.removeAttribute('open'));
    const onDown = (e: MouseEvent) => shut(e.target as Node);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && shut();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const actions = useMemo<ShellActions>(
    () => ({
      quickAdd: (d) => setQuick(d ?? { ...currentPageDefaults() }),
      search: () => setSearching(true),
      shortcuts: () => setKeys(true),
      help: () => setHelp('new'),
      newBoard: () => setNewBoard(true),
      logTouch: (accountId, accountName, kind) => setTouch({ accountId, accountName, kind }),
    }),
    [],
  );
  useSearchKey(useCallback(() => setSearching(true), []));
  useShortcuts(actions, canWrite);

  const until = (iso: string) => new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const isAdmin = me.user.perms.some((p) => ADMIN_PERMS.includes(p));
  const setupLeft = can('org.manage') && !me.org.setup.finishedAt ? SETUP_STEPS.filter((s) => !(me.org.setup.done ?? []).includes(s)).length : 0;
  const helpOk = !me.previewBy && !me.supportBy;
  const due = counts.late + counts.today;
  const dueTitle = counts.late ? t('nav.dueTitle', { late: counts.late, today: counts.today }) : counts.today ? t('nav.todayTitle', { n: counts.today }) : undefined;

  const go = (to: string) => {
    navigate(to);
    setNavOpen(false);
  };
  const runNews = (a: NewsAction) => (a.kind === 'quickAdd' ? actions.quickAdd() : a.kind === 'shortcuts' ? actions.shortcuts() : navigate(a.to));

  const favorites = me.user.prefs.favorites ?? [];
  const accountsView = path === '/accounts' ? new URLSearchParams(search).get('view') : null;
  const renewalsOn = accountsView === 'renewals';
  const reviewsOn = accountsView === 'reviews';
  const here = {
    home: path === '/home' || path.startsWith('/pages/'),
    my: path === '/my',
    inbox: path === '/inbox',
    calendar: path === '/calendar',
    accounts: path.startsWith('/accounts') && !renewalsOn && !reviewsOn,
    crm: path.startsWith('/accounts') || path.startsWith('/records'),
  };
  const KIND_ICON: Record<string, IconName> = { contact: 'idcard', opportunity: 'funnel', ticket: 'lifebuoy', custom: 'layout' };
  const section = (key: string, label: string, body: ReactNode, action?: ReactNode) => (
    <div className="navsec" data-folded={folded.includes(key) || undefined}>
      <div className="sidebar__heading">
        <button className="navsec__toggle" aria-expanded={!folded.includes(key)} onClick={() => fold(key)}>
          <Icon name="chevronDown" size={14} />
          <span>{label}</span>
        </button>
        {action}
      </div>
      {!folded.includes(key) && <div className="sidebar__nav">{body}</div>}
    </div>
  );
  const count = (n: number | undefined) => (n ? <span className="navlink__n num">{n > 999 ? '999+' : n}</span> : undefined);
  const link = (to: string, label: string, current: boolean, icon?: IconName, extra?: ReactNode, cls = 'navlink') => (
    <a
      key={to}
      href={to}
      className={cls}
      aria-current={current ? 'page' : undefined}
      onClick={(e) => {
        e.preventDefault();
        go(to);
      }}
    >
      {icon && <Icon name={icon} size={18} />}
      <span className="navlink__label">{label}</span>
      {extra}
    </a>
  );
  const dueBadge = due > 0 && (
    <span className="navlink__count" data-tone={counts.late ? 'late' : 'today'} title={dueTitle} aria-label={dueTitle}>
      {due > 99 ? '99+' : due}
    </span>
  );

  const createItems = [
    { key: 'task', label: t('create.task'), icon: 'checkCircle' as const, hint: 'N', onSelect: () => actions.quickAdd() },
    { key: 'account', label: t('create.account', { account: words.one }), icon: 'building' as const, onSelect: () => navigate('/accounts?new=1') },
    { key: 'touch', label: t('create.touch'), icon: 'phone' as const, onSelect: () => actions.logTouch() },
    { key: 'board', label: t('create.board'), icon: 'board' as const, onSelect: () => actions.newBoard() },
  ];
  const signOut = async () => {
    await post('/auth/logout').catch(() => undefined);
    await forgetOffline();
    location.href = '/login';
  };
  // Live refresh runs while the frame is on screen.
  useEffect(() => startLive(), []);
  const online = useOnline();
  const app = useInstall();
  const [installHelp, setInstallHelp] = useState(false);
  const meMenu = (
    <MenuButton
      label={t('menu.me')}
      place={narrow ? 'down' : 'up'}
      className="sidebar__memenu"
      buttonClass="sidebar__me"
      button={
        <>
          <Avatar person={person(me.user.id) ?? { ...me.user }} />
          <span className="sidebar__mewho">
            <span className="sidebar__mename">{me.user.name}</span>
            {!canWrite && <span className="sidebar__readonly">{me.previewBy ? t('nav.previewing') : t('nav.readOnly')}</span>}
          </span>
          {fresh && <span className="sidebar__dot" aria-label={t('news.fresh')} />}
          <Icon name="chevronDown" size={16} className="sidebar__chev" />
        </>
      }
      header={
        <div className="popmenu__who">
          <strong>{me.user.name}</strong>
          <span className="muted">{me.user.email}</span>
        </div>
      }
      items={[
        { key: 'profile', label: t('menu.profile'), icon: 'user', onSelect: () => go('/profile') },
        { key: 'devices', label: t('nav.devices'), icon: 'monitor', onSelect: () => go('/devices') },
        'sep',
        {
          key: 'theme',
          node: (
            <MenuChoices<ThemePref>
              label={t('menu.theme')}
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'light', label: t('menu.theme.light'), icon: 'sun' },
                { value: 'dark', label: t('menu.theme.dark'), icon: 'moon' },
                { value: 'system', label: t('menu.theme.system'), icon: 'monitor' },
              ]}
            />
          ),
        },
        {
          key: 'lang',
          node: (
            <MenuChoices<Locale>
              label={t('nav.language')}
              value={locale}
              onChange={onLocale}
              options={[
                { value: 'tr', label: 'Türkçe' },
                { value: 'en', label: 'English' },
              ]}
            />
          ),
        },
        'sep',
        { key: 'keys', label: t('menu.shortcuts'), icon: 'keyboard', hint: '?', onSelect: () => setKeys(true) },
        {
          key: 'news',
          label: t('news.title'),
          icon: 'megaphone',
          dot: fresh,
          onSelect: () => {
            setNews(true);
            setFresh(false);
          },
        },
        ...(helpOk ? [{ key: 'help', label: t('menu.help'), icon: 'help' as const, onSelect: () => setHelp('new') }] : []),
        ...(app.canPrompt ? [{ key: 'install', label: t('pwa.install'), icon: 'download' as const, onSelect: () => void app.install() }] : []),
        ...(app.byHand ? [{ key: 'install', label: t('pwa.install'), icon: 'download' as const, onSelect: () => setInstallHelp(true) }] : []),
        // The try-it demo has "Start over" in its own bar instead.
        ...(!me.previewBy && !import.meta.env.TW_DEMO ? ['sep' as const, { key: 'out', label: t('auth.signOut'), icon: 'logout' as const, onSelect: signOut }] : []),
      ]}
    />
  );

  return (
    <ShellCtx.Provider value={actions}>
      <div className="shell" data-nav={navOpen ? 'open' : 'closed'}>
        {narrow && (
          <header className="mbar">
            <button className="mbar__btn" aria-label={t('nav.menu')} aria-expanded={navOpen} onClick={() => setNavOpen(true)}>
              <Icon name="menu" size={20} />
            </button>
            <span className="mbar__org">
              {me.org.logoUrl ? (
                <span className="orglogo">
                  <img src={me.org.logoUrl} alt="" />
                </span>
              ) : (
                <Mark size={24} />
              )}
              <span className="mbar__name">{me.org.name}</span>
            </span>
            <button className="mbar__btn" aria-label={t('search.open')} onClick={() => setSearching(true)}>
              <Icon name="search" size={20} />
            </button>
            <Bell />
          </header>
        )}
        <nav className="sidebar" aria-label="Tendwell">
          <div className="sidebar__org">
            {me.org.logoUrl ? (
              <span className="orglogo">
                <img src={me.org.logoUrl} alt="" />
              </span>
            ) : (
              <Mark />
            )}
            <div className="sidebar__orgtext">
              <div className="sidebar__orgname">{me.org.name}</div>
              <div className="sidebar__orgaddr">{location.host}</div>
            </div>
            {!narrow && <Bell />}
            {narrow && (
              <button className="mbar__btn sidebar__close" aria-label={t('common.close')} onClick={() => setNavOpen(false)}>
                <Icon name="close" size={18} />
              </button>
            )}
          </div>
          <div className="sidebar__actions">
            {canWrite && (
              <MenuButton
                label={t('create.label')}
                className="sidebar__create"
                buttonClass="btn sidebar__new"
                title={t('create.title')}
                button={
                  <>
                    <Icon name="plus" size={18} />
                    <span>{t('create.button')}</span>
                  </>
                }
                items={createItems}
              />
            )}
            <button className="sidebar__search" onClick={() => setSearching(true)} aria-label={t('search.open')}>
              <Icon name="search" size={16} />
              <span>{t('search.open')}</span>
              <kbd>{modKey()} K</kbd>
            </button>
          </div>
          {setupLeft > 0 && (
            <a
              className="setup-chip"
              href="/setup"
              aria-current={path.startsWith('/setup') ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault();
                go('/setup');
              }}
            >
              <span>{t('nav.finishSetup')}</span>
              <span className="setup-chip__meter" aria-hidden="true">
                {SETUP_STEPS.map((s) => (
                  <i key={s} data-done={(me.org.setup.done ?? []).includes(s) ? 'true' : undefined} />
                ))}
              </span>
              <span className="sr-only">{t('nav.setupLeft', { n: setupLeft })}</span>
            </a>
          )}
          <div className="sidebar__scroll">
            <div className="sidebar__nav">
              {link('/home', t('nav.home'), here.home, 'home')}
              {link('/my', t('nav.myTasks'), here.my, 'checkCircle', dueBadge)}
              {link('/inbox', t('nav.inbox'), here.inbox, 'inbox', unread > 0 ? <span className="navlink__count" data-tone="today">{unread > 99 ? '99+' : unread}</span> : undefined)}
              {link('/calendar', t('nav.calendar'), here.calendar, 'calendar')}
            </div>
            {favorites.length > 0 &&
              section(
                'favorites',
                t('nav.favorites'),
                <>{favorites.map((f) => link(f.to, f.name, `${path}${search}` === f.to || path === f.to, FAVORITE_ICON[f.kind]))}</>,
              )}
            {section(
              'crm',
              words.other,
              <>
                {link('/accounts', t('nav.allAccounts', { accounts: words.other }), here.accounts, 'building')}
                {(recordTypes ?? []).map((ty) => link(`/records/${ty.key}`, typeLabel(ty, locale), path === `/records/${ty.key}`, KIND_ICON[ty.kind] ?? 'layout', count(ty.count)))}
                {link('/accounts?view=renewals', t('nav.renewals'), renewalsOn, 'refresh')}
                {(me.org.rhythm?.reviewDays ?? 0) > 0 && link('/accounts?view=reviews', t('nav.reviews'), reviewsOn, 'handshake')}
              </>,
            )}
            {section(
              'work',
              t('nav.work'),
              <>
                {boards.length === 0 && canWrite && (
                  <button className="sidebar__firstboard" onClick={() => setNewBoard(true)}>
                    <Icon name="plus" size={16} />
                    {t('nav.firstBoard')}
                  </button>
                )}
                {boards.map((b) =>
                  link(`/b/${b.id}`, b.name, path === `/b/${b.id}`, undefined, b.portal ? <Icon name="globe" size={14} className="navlink__portal" label={t('nav.boardShared')} /> : undefined, 'navlink navlink--board'),
                )}
                {link('/timeline', t('nav.timeline'), path === '/timeline', 'timeline')}
              </>,
              canWrite ? (
                <button className="sidebar__add" onClick={() => setNewBoard(true)} aria-label={t('nav.newBoard')} title={t('nav.newBoard')}>
                  <Icon name="plus" size={16} />
                </button>
              ) : undefined,
            )}
            {section(
              'insight',
              t('nav.insight'),
              <>
                {link('/reports', t('nav.reports'), path === '/reports' || (path.startsWith('/reports/') && path !== '/reports/dashboards'), 'chart')}
                {link('/dashboards', t('nav.dashboards'), path.startsWith('/dashboards') || path === '/reports/dashboards', 'layout')}
                {link('/team', t('nav.team'), path === '/team', 'people')}
              </>,
            )}
          </div>
          <div className="sidebar__foot">
            {isAdmin && link('/settings', t('nav.settings'), path.startsWith('/settings'), 'sliders')}
            {meMenu}
          </div>
        </nav>
        {navOpen && <div className="shell__scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />}
        <div className="main">
          {!online && (
            <div className="offlinebar" role="status">
              <Icon name="alert" size={16} />
              <span>{t('pwa.offline')}</span>
            </div>
          )}
          {me.previewBy && (
            <div className="previewbar" role="status">
              <span className="previewbar__eye" aria-hidden="true" />
              <span className="previewbar__text">{t('preview.bar', { name: me.user.name })}</span>
              <button className="btn btn--small previewbar__exit" onClick={() => endPreview()}>
                {t('preview.exit')}
              </button>
            </div>
          )}
          {me.supportBy && (
            <div className="previewbar supportbar" role="status">
              <span className="previewbar__eye" aria-hidden="true" />
              <span className="previewbar__text">
                {t(me.supportBy.level === 'edit' ? 'support.bar.edit' : 'support.bar.view', { staff: me.supportBy.staff, name: me.user.name, until: until(me.supportBy.until) })}
              </span>
              <button
                className="btn btn--small previewbar__exit"
                onClick={async () => {
                  await post('/support/leave').catch(() => undefined);
                  location.href = '/login';
                }}
              >
                {t('support.bar.leave')}
              </button>
            </div>
          )}
          {me.supportOpen && !me.previewBy && (
            <div className="openbar" role="status">
              <span>{t(me.supportOpen.level === 'edit' ? 'support.open.barEdit' : 'support.open.bar', { until: until(me.supportOpen.until) })}</span>
              <button className="btn btn--small btn--quiet" onClick={() => setHelp('mine')}>
                {t('support.open.manage')}
              </button>
            </div>
          )}
          {children}
        </div>
        {narrow && (
          <nav className="tabbar" aria-label={t('nav.quick')}>
            {link('/home', t('nav.home'), here.home, 'home', undefined, 'tabbar__item')}
            {link('/my', t('nav.myTasksShort'), here.my, 'checkCircle', dueBadge, 'tabbar__item')}
            {canWrite ? (
              <button className="tabbar__add" aria-label={t('create.task')} onClick={() => actions.quickAdd()}>
                <Icon name="plus" size={24} />
              </button>
            ) : (
              <span className="tabbar__gap" />
            )}
            {link('/accounts', words.other, here.crm, 'building', undefined, 'tabbar__item')}
            {link('/calendar', t('nav.calendar'), here.calendar, 'calendar', undefined, 'tabbar__item')}
          </nav>
        )}
        {newBoard && <BoardSettings onClose={() => setNewBoard(false)} />}
        {help && <HelpDialog start={help} onClose={() => setHelp(null)} />}
        {searching && <SearchPalette onClose={() => setSearching(false)} onNewBoard={() => setNewBoard(true)} />}
        {quick && <QuickAdd defaults={quick} onClose={() => setQuick(null)} />}
        {keys && <ShortcutsDialog onClose={() => setKeys(false)} />}
        {news && <WhatsNew onClose={() => setNews(false)} onAction={runNews} />}
        {installHelp && (
          <Dialog title={t('pwa.install')} onClose={() => setInstallHelp(false)} footer={<button className="btn btn--primary" onClick={() => setInstallHelp(false)}>{t('common.close')}</button>}>
            <ol className="installsteps">
              <li>{t('pwa.ios1')}</li>
              <li>{t('pwa.ios2')}</li>
              <li>{t('pwa.ios3')}</li>
            </ol>
          </Dialog>
        )}
        {touch && <LogTouch accountId={touch.accountId} accountName={touch.accountName} kind={touch.kind} onClose={() => setTouch(null)} />}
        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((x) => (
            <div key={x.id} className={`toast${x.tone === 'error' ? ' toast--error' : ''}`}>
              <Icon name={x.tone === 'error' ? 'alert' : 'checkCircle'} size={18} className="toast__icon" />
              <span className="toast__text">{x.text}</span>
              {x.action && (
                <button
                  className="toast__action"
                  onClick={async () => {
                    dismiss(x.id);
                    await x.action!.run();
                  }}
                >
                  {x.action.label}
                </button>
              )}
              <button className="toast__close" aria-label={t('common.close')} onClick={() => dismiss(x.id)}>
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </ShellCtx.Provider>
  );
}
