import { useEffect, useState, type ReactNode } from 'react';
import type { Locale } from '../../../shared/src/i18n';
import { endPreview, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate, useLocation } from '../lib/router';
import { useStore } from '../lib/store';
import { ADMIN_PERMS, SETUP_STEPS } from '../../../shared/src/model';
import { Bell } from './Bell';
import { SearchPalette, useSearchKey } from './Search';
import { BoardSettings } from './BoardSettings';
import { Avatar, Mark } from './ui';
import { HelpDialog } from './Help';

export function Shell({ children, onLocale }: { children: ReactNode; onLocale: (l: Locale) => void }) {
  const { t, locale, words } = useI18n();
  const { me, boards, canWrite, person, toasts, can, dismiss } = useStore();
  const { path } = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [newBoard, setNewBoard] = useState(false);
  const [searching, setSearching] = useState(false);
  // "#help" (the link in a help request's receipt) opens the person's requests.
  const [help, setHelp] = useState<null | 'new' | 'mine'>(() => (location.hash === '#help' ? 'mine' : null));
  useEffect(() => {
    if (location.hash === '#help') history.replaceState(null, '', location.pathname + location.search);
  }, []);
  useSearchKey(() => setSearching(true));
  const until = (iso: string) => new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const isAdmin = me.user.perms.some((p) => ADMIN_PERMS.includes(p));
  const setupLeft = can('org.manage') && !me.org.setup.finishedAt ? SETUP_STEPS.filter((s) => !(me.org.setup.done ?? []).includes(s)).length : 0;

  const go = (to: string) => {
    navigate(to);
    setNavOpen(false);
  };
  const link = (to: string, label: string, current: boolean, extra?: ReactNode) => (
    <a
      href={to}
      className="navlink"
      aria-current={current ? 'page' : undefined}
      onClick={(e) => {
        e.preventDefault();
        go(to);
      }}
    >
      {extra}
      <span>{label}</span>
    </a>
  );

  return (
    <div className="shell" data-nav={navOpen ? 'open' : 'closed'} onClick={(e) => navOpen && e.target === e.currentTarget && setNavOpen(false)}>
      <nav className="sidebar" aria-label="Tendwell">
        <div className="sidebar__org">
          {me.org.logoUrl ? (
            <span className="orglogo">
              <img src={me.org.logoUrl} alt="" />
            </span>
          ) : (
            <Mark />
          )}
          <div style={{ minWidth: 0 }}>
            <div className="sidebar__orgname">{me.org.name}</div>
            <div className="sidebar__orgaddr">{location.host}</div>
          </div>
          <Bell />
        </div>
        {can('org.manage') && !me.org.setup.finishedAt && (
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
        <button className="sidebar__search" onClick={() => setSearching(true)}>
          <span>{t('search.open')}</span>
          <kbd>{/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K'}</kbd>
        </button>
        <div className="sidebar__nav">
          {link('/home', t('nav.home'), path === '/home' || path.startsWith('/pages/'))}
          {link('/my', t('nav.myTasks'), path === '/my')}
          {link('/calendar', t('nav.calendar'), path === '/calendar')}
          {link('/accounts', words.other, path.startsWith('/accounts'))}
        </div>
        <div className="sidebar__heading">
          <span>{t('nav.boards')}</span>
          {canWrite && (
            <button className="sidebar__add" onClick={() => setNewBoard(true)} aria-label={t('nav.newBoard')} title={t('nav.newBoard')}>
              +
            </button>
          )}
        </div>
        <div className="sidebar__boards">
          {boards.map((b) => link(`/b/${b.id}`, b.name, path === `/b/${b.id}`, <span className="navlink__dot" />))}
        </div>
        <div className="sidebar__foot">
          {isAdmin && link('/settings', t('nav.settings'), path.startsWith('/settings'))}
          {link('/profile', t('nav.profile'), path === '/profile' || path === '/devices')}
          {!me.previewBy && !me.supportBy && (
            <button className="navlink" onClick={() => (setHelp('new'), setNavOpen(false))}>
              <span>{t('nav.help')}</span>
            </button>
          )}
          <button className="navlink" onClick={() => onLocale(locale === 'tr' ? 'en' : 'tr')}>
            <span>{t('nav.language')}: {locale === 'tr' ? 'Türkçe' : 'English'}</span>
          </button>
          <div className="sidebar__me">
            <Avatar person={person(me.user.id) ?? { ...me.user }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="sidebar__mename">{me.user.name}</div>
              {!canWrite && <div className="sidebar__readonly">{t('nav.readOnly')}</div>}
            </div>
            <button
              className="sidebar__add"
              hidden={!!me.previewBy}
              onClick={async () => {
                await post('/auth/logout').catch(() => undefined);
                location.href = '/login';
              }}
            >
              {t('auth.signOut')}
            </button>
          </div>
        </div>
      </nav>
      <div className="main">
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
        <button className="btn btn--quiet menu-toggle" style={{ margin: '10px 0 0 10px', width: 'max-content' }} aria-label={t('nav.boards')} onClick={() => setNavOpen(true)}>
          ☰
        </button>
        {children}
      </div>
      {newBoard && <BoardSettings onClose={() => setNewBoard(false)} />}
      {help && <HelpDialog start={help} onClose={() => setHelp(null)} />}
      {searching && <SearchPalette onClose={() => setSearching(false)} onNewBoard={() => setNewBoard(true)} />}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((x) => (
          <div key={x.id} className={`toast${x.tone === 'error' ? ' toast--error' : ''}`}>
            <span>{x.text}</span>
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
          </div>
        ))}
      </div>
    </div>
  );
}
