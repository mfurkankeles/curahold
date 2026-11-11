import { useState, type ReactNode } from 'react';
import type { Locale } from '../../../shared/src/i18n';
import { post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate, useLocation } from '../lib/router';
import { useStore } from '../lib/store';
import { BoardSettings } from './BoardSettings';
import { Avatar, Mark } from './ui';

export function Shell({ children, onLocale }: { children: ReactNode; onLocale: (l: Locale) => void }) {
  const { t, locale } = useI18n();
  const { me, boards, canWrite, person, toasts } = useStore();
  const { path } = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [newBoard, setNewBoard] = useState(false);
  const isAdmin = me.user.perms.some((p) => ['org.manage', 'users.manage', 'teams.manage', 'audit.view', 'privacy.manage'].includes(p));

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
          <Mark />
          <div style={{ minWidth: 0 }}>
            <div className="sidebar__orgname">{me.org.name}</div>
            <div className="sidebar__orgaddr">{location.host}</div>
          </div>
        </div>
        <div className="sidebar__nav">
          {link('/my', t('nav.myTasks'), path === '/my')}
          {link('/calendar', t('nav.calendar'), path === '/calendar')}
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
          {link('/devices', t('nav.devices'), path === '/devices')}
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
