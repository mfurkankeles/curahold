import { useState, type ReactNode } from 'react';
import type { Locale } from '../../../shared/src/i18n';
import { post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate, useLocation } from '../lib/router';
import { useStore } from '../lib/store';
import { ADMIN_PERMS, SETUP_STEPS } from '../../../shared/src/model';
import { Bell } from './Bell';
import { BoardSettings } from './BoardSettings';
import { Avatar, Mark } from './ui';

export function Shell({ children, onLocale }: { children: ReactNode; onLocale: (l: Locale) => void }) {
  const { t, locale, words } = useI18n();
  const { me, boards, canWrite, person, toasts, can } = useStore();
  const { path } = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [newBoard, setNewBoard] = useState(false);
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
        <div className="sidebar__nav">
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
        <button className="btn btn--quiet menu-toggle" style={{ margin: '10px 0 0 10px', width: 'max-content' }} aria-label={t('nav.boards')} onClick={() => setNavOpen(true)}>
          ☰
        </button>
        {children}
      </div>
      {newBoard && <BoardSettings onClose={() => setNewBoard(false)} />}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((x) => (
          <div key={x.id} className={`toast${x.tone === 'error' ? ' toast--error' : ''}`}>
            {x.text}
          </div>
        ))}
      </div>
    </div>
  );
}
