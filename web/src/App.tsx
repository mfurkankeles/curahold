import { useCallback, useEffect, useState } from 'react';
import type { Locale } from '../../shared/src/i18n';
import type { Me, OrgPublic } from '../../shared/src/model';
import { Shell } from './components/Shell';
import { TaskPanel } from './components/TaskPanel';
import { ApiFailure, endPreview, get, onAuthLost, patch, previewAs, setApiLocale } from './lib/api';
import { browserLocale, I18nProvider, storeLocale, storedLocale, useI18n } from './lib/i18n';
import { match, navigate, useLocation } from './lib/router';
import { StoreProvider } from './lib/store';
import { AccountPage, AccountsPage } from './pages/Accounts';
import { JoinPage, LoginPage, OrgNotFound, VerifyPage } from './pages/Auth';
import { PersonalPage } from './pages/Personal';
import { SetupPage } from './pages/Setup';
import { SignupApp } from './pages/Signup';
import { BoardPage } from './pages/BoardPage';
import { CalendarPage } from './pages/Calendar';
import { DevicesPage } from './pages/Devices';
import { MyTasks } from './pages/MyTasks';
import { SettingsPage } from './pages/Settings';
import { RecordsPage } from './components/Records';
import { HomePage } from './pages/Home';

// app.<domain> is the central address: company sign-up lives there.
const isCentral = () => location.hostname.split('.')[0] === 'app';

type Boot =
  | { kind: 'loading' }
  | { kind: 'central' }
  | { kind: 'no-org' }
  | { kind: 'error' }
  | { kind: 'signed-out'; org: OrgPublic; notice?: string | null }
  | { kind: 'signed-in'; org: OrgPublic; me: Me };

export function App() {
  const [boot, setBoot] = useState<Boot>({ kind: 'loading' });
  const [locale, setLocale] = useState<Locale>(() => storedLocale() ?? browserLocale());
  const loc = useLocation();

  useEffect(() => setApiLocale(locale), [locale]);

  const start = useCallback(async (notice?: string | null) => {
    if (isCentral()) {
      setBoot({ kind: 'central' });
      if (!location.pathname.startsWith('/signup')) navigate('/signup', true);
      return;
    }
    let org: OrgPublic;
    try {
      org = await get<OrgPublic>('/org');
    } catch (e) {
      setBoot(e instanceof ApiFailure && e.status === 404 ? { kind: 'no-org' } : { kind: 'error' });
      return;
    }
    if (!storedLocale()) setLocale(org.locale);
    // The company's logo as the tab icon, when it has one.
    if (org.logoUrl) {
      const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]') ?? document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'icon' }));
      icon.href = org.logoUrl;
    }
    if (location.pathname === '/auth/verify' || location.pathname === '/join') {
      setBoot({ kind: 'signed-out', org, notice });
      return;
    }
    try {
      const me = await get<Me>('/me');
      if (me.user.locale) setLocale(me.user.locale);
      setBoot({ kind: 'signed-in', org, me });
      // First things first: an unfinished company setup for its admin,
      // otherwise a new person's own one-minute setup.
      const home = location.pathname === '/' || location.pathname === '/login';
      if (me.previewBy) {
        if (home) navigate('/home', true);
      } else if (notice === 'signup' || (home && me.user.perms.includes('org.manage') && !me.org.setup.finishedAt)) navigate('/setup', true);
      else if (!me.user.onboardedAt && !location.pathname.startsWith('/setup')) navigate('/welcome', true);
      else if (home) navigate('/home', true);
    } catch (e) {
      // A preview that can no longer be shown (the person left, the right was taken away) ends quietly.
      if (previewAs()) {
        endPreview(location.pathname);
        return;
      }
      const evicted = e instanceof ApiFailure && e.code === 'session_evicted';
      setBoot({ kind: 'signed-out', org, notice: evicted ? 'evicted' : notice });
      if (location.pathname !== '/login') navigate('/login', true);
    }
  }, []);

  useEffect(() => {
    void start();
  }, [start]);

  // A 401 anywhere (device limit, expired session) returns to the sign-in page
  // with the reason, instead of failing silently.
  useEffect(
    () =>
      onAuthLost((code) => {
        setBoot((b) => (b.kind === 'signed-in' ? { kind: 'loading' } : b));
        navigate('/login', true);
        void start(code === 'session_evicted' ? 'evicted' : 'expired');
      }),
    [start],
  );

  const changeLocale = useCallback(
    (l: Locale) => {
      setLocale(l);
      storeLocale(l);
      if (boot.kind === 'signed-in') void patch('/me', { locale: l }).catch(() => undefined);
    },
    [boot.kind],
  );

  const terms = boot.kind === 'signed-in' ? boot.me.org.terms : null;
  return (
    <I18nProvider locale={locale} terms={terms}>
      {boot.kind === 'loading' && <div className="center-note muted" />}
      {boot.kind === 'central' && <SignupApp onLocale={changeLocale} />}
      {boot.kind === 'no-org' && <OrgNotFound />}
      {boot.kind === 'error' && <ErrorNote onRetry={() => start()} />}
      {boot.kind === 'signed-out' &&
        (loc.path === '/auth/verify' ? (
          <VerifyPage
            org={boot.org}
            onLocale={changeLocale}
            onSignedIn={(how) => {
              navigate('/home', true);
              void start(how ?? null);
            }}
          />
        ) : loc.path === '/join' ? (
          <JoinPage
            org={boot.org}
            onLocale={changeLocale}
            onJoined={() => {
              navigate('/welcome', true);
              void start();
            }}
          />
        ) : (
          <SignedOut org={boot.org} notice={boot.notice} onLocale={changeLocale} />
        ))}
      {boot.kind === 'signed-in' && (
        <StoreProvider initialMe={boot.me}>
          <Shell onLocale={changeLocale}>
            <Routes onLocale={changeLocale} />
          </Shell>
        </StoreProvider>
      )}
    </I18nProvider>
  );
}

function SignedOut({ org, notice, onLocale }: { org: OrgPublic; notice?: string | null; onLocale: (l: Locale) => void }) {
  const { t } = useI18n();
  const text = notice === 'evicted' ? t('auth.evicted', { max: org.maxDevices }) : notice === 'expired' ? t('auth.expired') : null;
  return <LoginPage org={org} onLocale={onLocale} notice={text} />;
}

function ErrorNote({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="center-note">
      <div style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
        <p>{t('errors.network')}</p>
        <button className="btn" onClick={onRetry}>
          {t('common.retry')}
        </button>
      </div>
    </div>
  );
}

function Routes({ onLocale }: { onLocale: (l: Locale) => void }) {
  const { path, search } = useLocation();
  const [refreshKey, setRefreshKey] = useState(0);
  const params = new URLSearchParams(search);
  const taskId = params.get('task');
  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);

  let page: React.ReactNode = null;
  const b = match('/b/:id', path);
  const s = match('/settings/:tab', path);
  const ss = match('/settings/:tab/:sub', path);
  const rec = match('/records/:type', path);
  const a = match('/accounts/:id', path);
  const setupStep = match('/setup/:step', path);
  const pg = match('/pages/:id', path);
  if (path === '/setup' || setupStep) page = <SetupPage step={setupStep?.step ?? null} />;
  else if (path === '/welcome') page = <PersonalPage mode="welcome" onLocale={onLocale} />;
  else if (path === '/profile') page = <PersonalPage mode="profile" onLocale={onLocale} />;
  else if (path === '/accounts') page = <AccountsPage key={refreshKey} />;
  else if (a) page = <AccountPage id={a.id} key={`${a.id}:${refreshKey}`} />;
  else if (b) page = <BoardPage boardId={b.id} view={params.get('view') === 'list' ? 'list' : 'board'} refreshKey={refreshKey} />;
  else if (path === '/calendar') page = <CalendarPage refreshKey={refreshKey} />;
  else if (path === '/devices') page = <DevicesPage />;
  else if (ss) page = <SettingsPage tab={ss.tab as any} sub={ss.sub} />;
  else if (path === '/settings' || s) page = <SettingsPage tab={(s?.tab as any) ?? 'company'} />;
  else if (rec) page = <RecordsPage typeKey={rec.type} key={rec.type} />;
  else if (path === '/home' || pg) page = <HomePage pageId={pg?.id ?? null} key={pg?.id ?? 'home'} />;
  else page = <MyTasks refreshKey={refreshKey} />;

  return (
    <>
      {page}
      {taskId && <TaskPanel key={taskId} taskId={taskId} onChanged={bump} />}
    </>
  );
}
