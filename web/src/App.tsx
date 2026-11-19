import { setCompanyZone } from './lib/time';
import { ReauthDialog } from './components/Reauth';
import { lazy, Suspense, useCallback, useEffect, useState, type ComponentType } from 'react';
import type { Locale } from '../../shared/src/i18n';
import type { Me, OrgPublic } from '../../shared/src/model';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Shell } from './components/Shell';
import { ApiFailure, endPreview, get, onAuthLost, patch, post, previewAs, setApiLocale } from './lib/api';
import { installDiagnostics } from './lib/diagnostics';

// Errors, failed requests and recent pages, kept in memory for a help request.
installDiagnostics();
import { I18nProvider, loadLocale, startLocale, storeLocale, storedLocale, useI18n } from './lib/i18n';
import { match, navigate, useLocation } from './lib/router';
import { StoreProvider } from './lib/store';
import { useLive } from './lib/live';
import { TASKS_CHANGED } from './lib/shell';
import { ConsentBanner } from './components/ConsentBanner';
import { rememberReturn, takeReturn } from './lib/returnTo';
import { PageFallback, RouteFallback } from './components/RouteFallback';

// Code-splitting: every screen is its own chunk, so the first one carries only
// what it needs. The screen the address points at starts loading with the app
// itself (preloadRoute, below), alongside the sign-in check, so no request
// waits on another. Pages use named exports; `page` maps one onto `default`.
type Loader<M> = () => Promise<M>;
const once = <M,>(load: Loader<M>): Loader<M> => {
  let p: Promise<M> | null = null;
  return () => (p ??= load().catch((e) => ((p = null), Promise.reject(e))));
};
const page = <M extends Record<K, ComponentType<any>>, K extends keyof M>(load: Loader<M>, name: K) => lazy(() => load().then((m) => ({ default: m[name] })));
const load = {
  home: once(() => import(/* first-screen */ './pages/Home')),
  myTasks: once(() => import('./pages/MyTasks')),
  board: once(() => import('./pages/BoardPage')),
  accounts: once(() => import('./pages/Accounts')),
  records: once(() => import('./components/Records')),
  reports: once(() => import('./pages/Reports')),
  reportBuilder: once(() => import('./pages/ReportBuilder')),
  auth: once(() => import('./pages/Auth')),
  developer: once(() => import('./components/Developer')),
  taskPanel: once(() => import('./components/TaskPanel')),
  recordPanel: once(() => import('./components/RecordPanel')),
};
const HomePage = page(load.home, 'HomePage');
const MyTasks = page(load.myTasks, 'MyTasks');
const BoardPage = page(load.board, 'BoardPage');
const AccountsPage = page(load.accounts, 'AccountsPage');
const AccountPage = page(load.accounts, 'AccountPage');
const RecordsPage = page(load.records, 'RecordsPage');
const ReportsPage = page(load.reports, 'ReportsPage');
const ReportsListPage = page(load.reportBuilder, 'ReportsListPage');
const ReportBuilderPage = page(load.reportBuilder, 'ReportBuilderPage');
const LoginPage = page(load.auth, 'LoginPage');
const JoinPage = page(load.auth, 'JoinPage');
const VerifyPage = page(load.auth, 'VerifyPage');
const OrgNotFound = page(load.auth, 'OrgNotFound');
const ConnectAiPage = page(load.developer, 'ConnectAiPage');
const TaskPanel = page(load.taskPanel, 'TaskPanel');
const RecordPanel = page(load.recordPanel, 'RecordPanel');

/** Starts fetching the chunks the screen at `path` will need (no waiting). */
function preloadRoute(path: string, search: string) {
  const want: Loader<unknown>[] = [];
  if (path === '/' || path === '/login' || path === '/auth/verify' || path === '/join') want.push(load.auth);
  if (path === '/' || path === '/login' || path === '/home' || path.startsWith('/pages/')) want.push(load.home);
  else if (path.startsWith('/b/')) want.push(load.board);
  else if (path.startsWith('/accounts')) want.push(load.accounts);
  else if (path.startsWith('/records/')) want.push(load.records);
  else if (path === '/reports') want.push(load.reports);
  else if (path === '/my') want.push(load.myTasks);
  if (/[?&]task=/.test(search)) want.push(load.taskPanel);
  if (/[?&]record=/.test(search)) want.push(load.recordPanel);
  for (const l of want) void l().catch(() => undefined);
}
if (typeof location !== 'undefined') preloadRoute(location.pathname, location.search);

const PersonalPage = lazy(() => import('./pages/Personal').then((m) => ({ default: m.PersonalPage })));
const SetupPage = lazy(() => import('./pages/Setup').then((m) => ({ default: m.SetupPage })));
const AgreementsGate = lazy(() => import('./pages/Agreements').then((m) => ({ default: m.AgreementsGate })));
// The central address: the trial request form (or, behind SIGNUP_MODE=instant, the earlier instant sign-up).
const SignupApp = lazy(() => import('./pages/TrialRequest').then((m) => ({ default: m.TrialEntry })));
const CalendarPage = lazy(() => import('./pages/Calendar').then((m) => ({ default: m.CalendarPage })));
const DevicesPage = lazy(() => import('./pages/Devices').then((m) => ({ default: m.DevicesPage })));
const TrashPage = lazy(() => import('./pages/Trash').then((m) => ({ default: m.TrashPage })));
const SettingsPage = lazy(() => import('./pages/Settings').then((m) => ({ default: m.SettingsPage })));
const InboxPage = lazy(() => import('./pages/Inbox').then((m) => ({ default: m.InboxPage })));
const MetricsPage = lazy(() => import('./pages/Metrics').then((m) => ({ default: m.MetricsPage })));
const PlatformConsolePage = lazy(() => import('./pages/PlatformConsole').then((m) => ({ default: m.PlatformConsolePage })));
const FounderPagesPage = lazy(() => import('./pages/FounderPages').then((m) => ({ default: m.FounderPagesPage })));
const DashboardPage = lazy(() => import('./pages/Dashboards').then((m) => ({ default: m.DashboardPage })));
const DashboardsPage = lazy(() => import('./pages/Dashboards').then((m) => ({ default: m.DashboardsPage })));
const TeamPage = lazy(() => import('./pages/Team').then((m) => ({ default: m.TeamPage })));
const ImportPage = lazy(() => import('./pages/ImportPage').then((m) => ({ default: m.ImportPage })));
const SetupHealthPage = lazy(() => import('./pages/SetupHealth').then((m) => ({ default: m.SetupHealthPage })));
const SetupTestPage = lazy(() => import('./pages/SetupTest').then((m) => ({ default: m.SetupTestPage })));
const TimelinePage = lazy(() => import('./pages/Timeline').then((m) => ({ default: m.TimelinePage })));

// Curahold's own support desk: loaded only at the central address, only when asked for.
const DeskApp = lazy(() => import('./pages/Desk'));

// app.<domain> is the central address: company sign-up lives there.
const isCentral = () => location.hostname.split('.')[0] === 'app';
// desk.<domain> is Curahold's own support desk, on a host of its own.
const isDesk = () => location.hostname.split('.')[0] === 'desk';

type Boot =
  | { kind: 'loading' }
  | { kind: 'central' }
  | { kind: 'desk' }
  | { kind: 'no-org' }
  | { kind: 'error' }
  | { kind: 'signed-out'; org: OrgPublic; notice?: string | null }
  | { kind: 'signed-in'; org: OrgPublic; me: Me };

export function App() {
  const [boot, setBoot] = useState<Boot>({ kind: 'loading' });
  const [locale, setLocale] = useState<Locale>(() => storedLocale() ?? startLocale());
  const loc = useLocation();

  useEffect(() => setApiLocale(locale), [locale]);

  const start = useCallback(async (notice?: string | null) => {
    if (isDesk()) {
      setBoot({ kind: 'desk' });
      return;
    }
    if (isCentral()) {
      // The desk used to be at app.<domain>/desk: an old link goes on to its own host.
      if (location.pathname.startsWith('/desk')) {
        location.replace(`${location.protocol}//desk.${location.host.split('.').slice(1).join('.')}/${location.search}`);
        return;
      }
      setBoot({ kind: 'central' });
      if (!location.pathname.startsWith('/signup')) navigate('/signup', true);
      return;
    }
    // Who is signed in is asked together with the company, not after it (one
    // round trip less before the first screen). Not on the pages that sign in.
    const early = ['/support/enter', '/auth/verify', '/join'].includes(location.pathname) ? null : get<Me>('/me');
    early?.catch(() => undefined);
    let org: OrgPublic;
    try {
      org = await get<OrgPublic>('/org');
    } catch (e) {
      setBoot(e instanceof ApiFailure && e.status === 404 ? { kind: 'no-org' } : { kind: 'error' });
      return;
    }
    if (!storedLocale()) setLocale(org.locale);
    // The language's dictionary comes while /me is asked; each screen below
    // waits for it so it opens in its own language, never in a passing one.
    const orgLocale = storedLocale() ?? org.locale;
    const ready = (l: Locale) => loadLocale(l).catch(() => undefined);
    void ready(orgLocale);
    // The company's logo as the tab icon, when it has one.
    if (org.logoUrl) {
      const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]') ?? document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'icon' }));
      icon.href = org.logoUrl;
    }
    // Curahold support's one-time entry link: trade it for a support session, keep it out of the history.
    if (location.pathname === '/support/enter') {
      const token = new URLSearchParams(location.hash.slice(1)).get('token');
      history.replaceState(null, '', '/home');
      try {
        if (!token) throw new Error('no token');
        await post('/support/enter', { token });
      } catch {
        await ready(orgLocale);
        setBoot({ kind: 'signed-out', org, notice: 'support' });
        navigate('/login', true);
        return;
      }
    }
    if (location.pathname === '/auth/verify' || location.pathname === '/join') {
      await ready(orgLocale);
      setBoot({ kind: 'signed-out', org, notice });
      return;
    }
    try {
      const me = await (early ?? get<Me>('/me'));
      await ready(me.user.locale ?? orgLocale);
      if (me.user.locale) setLocale(me.user.locale);
      setCompanyZone(me.org.timezone);
      setBoot({ kind: 'signed-in', org, me });
      // Record the page for support, if the company has it on (loads rrweb only then).
      void import(/* no-phrases */ './lib/replay').then((m) => m.startRecording(me)).catch(() => undefined);
      // First things first: an unfinished company setup for its admin,
      // otherwise a new person's own one-minute setup.
      const home = location.pathname === '/' || location.pathname === '/login';
      // Signed in on the way to an app's consent screen: back to it.
      const back = me.previewBy ? null : takeReturn();
      if (back) navigate(back, true);
      else if (me.previewBy) {
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
      if (location.pathname === '/connect-ai') rememberReturn(location.pathname + location.search);
      const evicted = e instanceof ApiFailure && e.code === 'session_evicted';
      const supportEnded = e instanceof ApiFailure && e.code === 'support_ended';
      await ready(orgLocale);
      setBoot({ kind: 'signed-out', org, notice: evicted ? 'evicted' : supportEnded ? 'support' : notice });
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
        void start(code === 'session_evicted' ? 'evicted' : code === 'support_ended' ? 'support' : 'expired');
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
    <I18nProvider locale={locale} terms={terms} hold={boot.kind === 'loading'}>
      {boot.kind === 'loading' && <PageFallback />}
      {boot.kind === 'central' && (
        <Suspense fallback={<PageFallback />}>
          <SignupApp onLocale={changeLocale} />
        </Suspense>
      )}
      {boot.kind === 'desk' && (
        <Suspense fallback={<PageFallback />}>
          <DeskApp onLocale={changeLocale} />
        </Suspense>
      )}
      {boot.kind === 'no-org' && (
        <Suspense fallback={<PageFallback />}>
          <OrgNotFound />
        </Suspense>
      )}
      {boot.kind === 'error' && <ErrorNote onRetry={() => start()} />}
      {boot.kind === 'signed-out' && (
        <Suspense fallback={<PageFallback />}>
        {loc.path === '/auth/verify' ? (
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
        )}
        </Suspense>
      )}
      {boot.kind === 'signed-in' && boot.me.org.agreementsDue && !boot.me.previewBy && (
        // A trial company opens after its administrator accepts the terms and DPA (routes/agreements.ts).
        <Suspense fallback={<PageFallback />}>
          <AgreementsGate me={boot.me} onLocale={changeLocale} onAccepted={() => void start()} />
        </Suspense>
      )}
      {boot.kind === 'signed-in' && (!boot.me.org.agreementsDue || boot.me.previewBy) && (
        <ErrorBoundary whole>
          <StoreProvider initialMe={boot.me}>
            <Shell onLocale={changeLocale}>
              <Routes onLocale={changeLocale} />
            </Shell>
          </StoreProvider>
        </ErrorBoundary>
      )}
      <ConsentBanner signedIn={boot.kind === 'signed-in'} />
    </I18nProvider>
  );
}

function SignedOut({ org, notice, onLocale }: { org: OrgPublic; notice?: string | null; onLocale: (l: Locale) => void }) {
  const { t } = useI18n();
  const text = notice === 'evicted' ? t('auth.evicted', { max: org.maxDevices }) : notice === 'expired' ? t('auth.expired') : notice === 'support' ? t('support.ended') : null;
  return <LoginPage org={org} onLocale={onLocale} notice={text} />;
}

function ErrorNote({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="center-note">
      <div className="u-display-grid u-gap-12 u-justify-items-center">
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
  // A record (an opportunity…) opened over the page; a task opened from it goes on top.
  const recordId = params.get('record');
  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);
  // Tasks added from quick add (or anywhere outside the page): the page shows them.
  useEffect(() => {
    window.addEventListener(TASKS_CHANGED, bump);
    return () => window.removeEventListener(TASKS_CHANGED, bump);
  }, [bump]);
  // Someone else's change: only the pages that reload in place follow it (nothing is remounted under a person's hands).
  const [liveKey, setLiveKey] = useState(0);
  useLive('tasks', () => setLiveKey((k) => k + 1));
  const quiet = refreshKey + liveKey;

  let page: React.ReactNode = null;
  const b = match('/b/:id', path);
  const s = match('/settings/:tab', path);
  const ss = match('/settings/:tab/:sub', path);
  const rec = match('/records/:type', path);
  const a = match('/accounts/:id', path);
  const setupStep = match('/setup/:step', path);
  const pg = path === '/pages/new' ? null : match('/pages/:id', path);
  const rep = match('/reports/r/:id', path);
  const dash = path === '/dashboards/new' ? null : match('/dashboards/:id', path);
  if (path === '/setup-health') page = <SetupHealthPage />;
  else if (path === '/setup-test') page = <SetupTestPage />;
  else if (path === '/setup' || setupStep) page = <SetupPage step={setupStep?.step ?? null} />;
  else if (path === '/welcome') page = <PersonalPage mode="welcome" onLocale={onLocale} />;
  else if (path === '/profile') page = <PersonalPage mode="profile" onLocale={onLocale} />;
  else if (path === '/accounts') page = <AccountsPage key={refreshKey} />;
  else if (a) page = <AccountPage id={a.id} key={`${a.id}:${refreshKey}`} />;
  else if (b) page = <BoardPage boardId={b.id} view={(['list', 'archive', 'backlog', 'sprints'] as const).find((v) => v === params.get('view')) ?? 'board'} refreshKey={refreshKey} />;
  else if (path === '/calendar') page = <CalendarPage refreshKey={quiet} />;
  else if (path === '/inbox') page = <InboxPage />;
  else if (path === '/metrics') page = <MetricsPage />;
  else if (path === '/platform') page = <PlatformConsolePage />;
  else if (path === '/platform/pages') page = <FounderPagesPage />;
  else if (path === '/reports') page = <ReportsPage key={refreshKey} />;
  else if (path === '/reports/all') page = <ReportsListPage />;
  else if (path === '/reports/dashboards' || path === '/dashboards') page = <DashboardsPage />;
  else if (path === '/dashboards/new') page = <DashboardPage id={null} create key="new" />;
  else if (dash) page = <DashboardPage id={dash.id} key={`${dash.id}:${refreshKey}`} />;
  else if (path === '/reports/new') page = <ReportBuilderPage id={null} from={params.get('from')} key={`new:${params.get('from') ?? ''}`} />;
  else if (rep) page = <ReportBuilderPage id={rep.id} from={null} key={rep.id} />;
  else if (path === '/pages/new') page = <HomePage pageId={null} create />;
  else if (path === '/team') page = <TeamPage refreshKey={refreshKey} />;
  else if (path === '/import') page = <ImportPage />;
  else if (path === '/timeline') page = <TimelinePage refreshKey={quiet} />;
  else if (path === '/devices') page = <DevicesPage />;
  else if (path === '/trash') page = <TrashPage />;
  else if (path === '/connect-ai') page = <ConnectAiPage />;
  else if (ss) page = <SettingsPage tab={ss.tab as any} sub={ss.sub} />;
  else if (path === '/settings' || s) page = <SettingsPage tab={(s?.tab as any) ?? null} />;
  else if (rec) page = <RecordsPage typeKey={rec.type} key={rec.type} />;
  else if (path === '/home' || pg) page = <HomePage pageId={pg?.id ?? null} key={pg?.id ?? 'home'} />;
  else page = <MyTasks refreshKey={quiet} />;

  // Each route (and each open panel) has its own boundary: one screen failing leaves the shell and the rest usable.
  return (
    <>
      <ErrorBoundary resetKey={path}>
        <Suspense fallback={<RouteFallback />}>{page}</Suspense>
      </ErrorBoundary>
      <ReauthDialog />
      {recordId && !taskId && (
        <ErrorBoundary resetKey={recordId}>
          <Suspense fallback={null}>
            <RecordPanel key={recordId} recordId={recordId} onChanged={bump} />
          </Suspense>
        </ErrorBoundary>
      )}
      {taskId && (
        <ErrorBoundary resetKey={taskId}>
          <Suspense fallback={null}>
            <TaskPanel key={taskId} taskId={taskId} onChanged={bump} />
          </Suspense>
        </ErrorBoundary>
      )}
    </>
  );
}
