import { useCallback, useEffect, useState } from 'react';
import type { Locale } from '../../shared/src/i18n';
import type { Me, OrgPublic } from '../../shared/src/model';
import { Shell } from './components/Shell';
import { TaskPanel } from './components/TaskPanel';
import { ApiFailure, get, onAuthLost, patch, setApiLocale } from './lib/api';
import { browserLocale, I18nProvider, storeLocale, storedLocale, useI18n } from './lib/i18n';
import { match, navigate, useLocation } from './lib/router';
import { StoreProvider } from './lib/store';
import { LoginPage, OrgNotFound, VerifyPage } from './pages/Auth';
import { BoardPage } from './pages/BoardPage';
import { CalendarPage } from './pages/Calendar';
import { DevicesPage } from './pages/Devices';
import { MyTasks } from './pages/MyTasks';
import { SettingsPage } from './pages/Settings';

type Boot =
  | { kind: 'loading' }
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
    let org: OrgPublic;
    try {
      org = await get<OrgPublic>('/org');
    } catch (e) {
      setBoot(e instanceof ApiFailure && e.status === 404 ? { kind: 'no-org' } : { kind: 'error' });
      return;
    }
    if (!storedLocale()) setLocale(org.locale);
    if (location.pathname === '/auth/verify') {
      setBoot({ kind: 'signed-out', org, notice });
      return;
    }
    try {
      const me = await get<Me>('/me');
      if (me.user.locale) setLocale(me.user.locale);
      setBoot({ kind: 'signed-in', org, me });
      if (location.pathname === '/' || location.pathname === '/login') navigate('/my', true);
    } catch (e) {
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
      {boot.kind === 'no-org' && <OrgNotFound />}
      {boot.kind === 'error' && <ErrorNote onRetry={() => start()} />}
      {boot.kind === 'signed-out' &&
        (loc.path === '/auth/verify' ? (
          <VerifyPage
            org={boot.org}
            onLocale={changeLocale}
            onSignedIn={() => {
              navigate('/my', true);
              void start();
            }}
          />
        ) : (
          <SignedOut org={boot.org} notice={boot.notice} onLocale={changeLocale} />
        ))}
      {boot.kind === 'signed-in' && (
        <StoreProvider initialMe={boot.me}>
          <Shell onLocale={changeLocale}>
            <Routes />
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

function Routes() {
  const { path, search } = useLocation();
  const [refreshKey, setRefreshKey] = useState(0);
  const params = new URLSearchParams(search);
  const taskId = params.get('task');
  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);

  let page: React.ReactNode = null;
  const b = match('/b/:id', path);
  const s = match('/settings/:tab', path);
  if (b) page = <BoardPage boardId={b.id} view={params.get('view') === 'list' ? 'list' : 'board'} refreshKey={refreshKey} />;
  else if (path === '/calendar') page = <CalendarPage refreshKey={refreshKey} />;
  else if (path === '/devices') page = <DevicesPage />;
  else if (path === '/settings' || s) page = <SettingsPage tab={(s?.tab as any) ?? 'company'} />;
  else page = <MyTasks refreshKey={refreshKey} />;

  return (
    <>
      {page}
      {taskId && <TaskPanel key={taskId} taskId={taskId} onChanged={bump} />}
    </>
  );
}
