// Curahold's own support desk, on its own host (desk.<domain>): the queues on
// the left, the requests of the chosen queue beside them, and the request
// that is open on the right — the conversation, the company it comes from and
// the team's own notes. Only people on Curahold's staff list can sign in.
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { LOCALE_INFO, LOCALES, normalizeLocale, type Locale, type MessageKey } from '../../../shared/src/i18n';
import type { ConsoleToday } from '../../../shared/src/console';
import type { PlatformCustomer, PlatformCustomerDetail } from '../../../shared/src/platform';
import type { ReplayMeta } from '../../../shared/src/replay';
import { EmptyState, LoadError, OfflineBar, SkeletonCards, SkeletonRows } from '../components/Empty';
import { TotpSecret } from '../components/SecondStep';
import { Icon, type IconName } from '../components/icons';
import { useI18n } from '../lib/i18n';
import { relativeTime } from '../lib/time';
import { THEMES, useTheme, type ThemePref } from '../lib/theme';
import { TodayView } from './ConsoleToday';
import { CustomerDrawer, CustomerList } from './PlatformConsole';
import {
  ActivitySection,
  ApprovalsSection,
  ChecklistSection,
  OverviewSection,
  OwnerBar,
  PauseAllButton,
  PlanSection,
  RequestsSection,
  RevenueSection,
  SupportOverviewSection,
  SystemSection,
  TrialsSection,
  useOwnerBar,
  useOwnerWords,
  type OwnerGo,
  type OwnerSection,
} from './OwnerConsole';
import { OWNER_LOCALES } from '../../../shared/src/i18n/owner';
import { officeWord, type OfficeKey } from '../../../shared/src/i18n/ownerOffice';
import { RouteFallback } from '../components/RouteFallback';
import { Dialog } from '../components/ui';
import { ChatSection, MeetingsSection, TeamSection, useTeamWords, type TeamGo } from './OwnerTeam';
import '../surfaces/console.css';
import { formatDate } from '../lib/format';

// rrweb's player is heavy: load it only when the team watches a recording.
const ReplayPlayer = lazy(() => import('../components/ReplayPlayer'));
// The 3D Office carries three.js and its people: only the owner who opens it downloads them.
const OwnerOffice = lazy(() => import('./OwnerOffice'));

type Status = 'received' | 'answered' | 'solved';
interface Row {
  ref: string;
  subject: string;
  impact: string | null;
  status: Status;
  lastMessageAt: string;
  neededBy: string | null;
  company: { slug: string; name: string };
  from: { name: string | null; email: string | null };
  owner: string | null;
  notes: number;
}
interface Message {
  id: string;
  author: 'user' | 'support';
  name: string | null;
  body: string;
  internal: boolean;
  via: string;
  createdAt: string;
}
interface Detail extends Omit<Row, 'company' | 'from' | 'notes' | 'lastMessageAt'> {
  description: string;
  steps: string | null;
  pageUrl: string | null;
  createdAt: string;
  company: { slug: string; name: string; url: string; plan: string | null; people: number; since: string; trialEndsAt: string | null };
  from: { name: string | null; email: string | null; role: string | null };
  files: { name: string; size: number; url: string }[];
  access: { level: 'view' | 'edit'; until: string } | null;
  others: { ref: string; subject: string; status: Status }[];
  replays: ReplayMeta[];
  messages: Message[];
}
interface Me {
  staff: { email: string; name: string };
  /** The platform owner in his own session: the owner sections are his. */
  owner?: boolean;
  counts: { received: number; answered: number; solved: number; mine: number; unclaimed: number };
}

class DeskError extends Error {
  constructor(readonly status: number) {
    super(String(status));
  }
}
/** Every change carries a header a form on another site could not set. */
async function desk<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/desk${path}`, { method, headers: { 'x-curahold-desk': '1', ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) throw new DeskError(res.status);
  return (await res.json()) as T;
}

const QUEUES: { key: string; query: string; icon: IconName; count?: keyof Me['counts'] }[] = [
  { key: 'received', query: 'status=received', icon: 'inbox', count: 'received' },
  { key: 'unclaimed', query: 'status=received&unclaimed=1', icon: 'flag', count: 'unclaimed' },
  { key: 'mine', query: 'mine=1', icon: 'user', count: 'mine' },
  { key: 'answered', query: 'status=answered', icon: 'hourglass', count: 'answered' },
  { key: 'solved', query: 'status=solved', icon: 'checkCircle' },
  { key: 'all', query: '', icon: 'list' },
];
const SIGNED_AS = 'desk_signed_as';
const day = (iso: string, locale: string) => formatDate(iso, normalizeLocale(locale), { day: 'numeric', month: 'short', year: 'numeric' });
const shortName = (email: string) => email.split('@')[0];
/** A plan by its name; one this screen has no word for shows as it is stored. */
const planName = (plan: string, t: (k: MessageKey) => string) => (plan === 'trial' ? t('desk.plan.trial') : plan === 'team' || plan === 'business' ? t(`billing.plan.${plan}`) : plan);

/** Any of the nine languages; the choice is kept on this device like everywhere else. */
function Languages({ onLocale, only }: { onLocale: (l: Locale) => void; only?: Locale[] }) {
  const { locale, t } = useI18n();
  return (
    <label className="console__pick desk__langs">
      <Icon name="globe" size={16} />
      <select className="input" value={locale} onChange={(e) => onLocale(e.target.value as Locale)} aria-label={t('nav.language')}>
        {(only ?? LOCALES).map((l) => (
          <option key={l} value={l} lang={l}>
            {LOCALE_INFO[l].name}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function DeskApp({ onLocale }: { onLocale: (l: Locale) => void }) {
  const { t } = useI18n();
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMe(await desk<Me>('GET', '/me'));
    } catch {
      setMe(null);
    }
  }, []);
  useEffect(() => void load(), [load]);
  useEffect(() => {
    document.title = `${t('console.name' as MessageKey)} · Curahold`;
  }, [t]);

  if (me === undefined) return <div className="center-note muted" />;
  if (me === null) return <SignIn notice={notice} onIn={load} onLocale={onLocale} />;
  return (
    <Console
      me={me}
      onLocale={onLocale}
      refreshCounts={load}
      onOut={async (expired) => {
        if (!expired) await desk('POST', '/sign-out').catch(() => undefined);
        setNotice(expired ? t('desk.signedOut') : null);
        setMe(null);
      }}
    />
  );
}

function SignIn({ notice, onIn, onLocale }: { notice: string | null; onIn: () => void; onLocale: (l: Locale) => void }) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  // Third step: the authenticator app (set up the first time).
  const [second, setSecond] = useState<{ ticket: string; enroll: boolean; secret?: string; uri?: string } | null>(null);
  const [app, setApp] = useState('');

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await desk<{ devCode?: string }>('POST', '/sign-in', { email });
      setDevCode(r.devCode ?? null);
      setSent(true);
      setWrong(false);
    } catch {
      setWrong(true);
    }
    setBusy(false);
  };
  const enter = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (second) {
        await desk('POST', '/sign-in/second', { ticket: second.ticket, code: app });
        onIn();
        return;
      }
      const r = await desk<{ second?: { ticket: string; enroll: boolean; secret?: string; uri?: string } }>('POST', '/sign-in/verify', { email, code });
      if (r.second) {
        setSecond(r.second);
        setWrong(false);
        setBusy(false);
      } else onIn();
    } catch {
      setWrong(true);
      setBusy(false);
    }
  };
  return (
    <main className="desk-signin">
      <form className="desk-signin__card" onSubmit={sent ? enter : send}>
        <div className="desk-signin__top">
          <span className="desk-signin__mark" aria-hidden="true">
            <Icon name="lifebuoy" size={24} />
          </span>
          <Languages onLocale={onLocale} />
        </div>
        <h1>{t('console.signin.title')}</h1>
        <p className="muted">{notice ?? t('desk.signin.lead')}</p>
        <label className="field">
          <span className="field__label">{t('desk.signin.email')}</span>
          <input className="input" type="email" autoComplete="username" required autoFocus disabled={sent} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {second && (
          <>
            <p className="field__hint">{second.enroll ? t('desk.signin.appSetup') : t('desk.signin.app')}</p>
            {second.enroll && second.secret && second.uri && <TotpSecret secret={second.secret} uri={second.uri} />}
            <label className="field">
              <span className="field__label">{t('sec.second.code')}</span>
              <input className="input desk-signin__code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus value={app} onChange={(e) => setApp(e.target.value.replace(/\D/g, ''))} />
            </label>
          </>
        )}
        {sent && !second && (
          <>
            <p className="field__hint">{t('desk.signin.sent')}</p>
            <label className="field">
              <span className="field__label">{t('desk.signin.code')}</span>
              <input className="input desk-signin__code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            </label>
            {import.meta.env.DEV && devCode && (
              <button type="button" className="btn btn--small desk-signin__dev" onClick={() => setCode(devCode)}>
                {devCode}
              </button>
            )}
          </>
        )}
        {wrong && <p className="desk-signin__wrong">{t(sent ? 'desk.signin.wrong' : 'desk.error')}</p>}
        <button className="btn btn--primary" disabled={busy}>
          <Icon name={sent ? 'arrowRight' : 'mail'} size={16} />
          {t(sent ? 'desk.signin.enter' : 'desk.signin.send')}
        </button>
        {sent && (
          <button
            type="button"
            className="btn btn--quiet"
            onClick={() => {
              setSent(false);
              setCode('');
              setSecond(null);
              setApp('');
              setWrong(false);
            }}
          >
            {t('desk.signin.again')}
          </button>
        )}
      </form>
    </main>
  );
}

type Section = 'today' | 'customers' | 'support' | Exclude<OwnerSection, 'today'> | 'team' | 'chats' | 'meetings' | 'office';
interface Where {
  section: Section;
  /** the open trial request (requests) */
  q?: string | null;
  /** the open request (support) */
  r?: string | null;
  /** the open company (customers) */
  c?: string | null;
}
/** The address says where the console is: / today, /customers(?c=), /support(?r=). An old desk link (/?r=) opens the request. */
/** The owner's own sections, by address (owner sections answer 403 to anyone else, so others never get here). */
const OWNER_PATHS: Record<string, Section> = {
  '/revenue': 'revenue',
  '/trials': 'trials',
  '/requests': 'requests',
  '/approvals': 'approvals',
  '/plan': 'plan',
  '/checklist': 'checklist',
  '/support-overview': 'supportview',
  '/system': 'system',
  '/activity': 'activity',
  // The AI team (OwnerTeam.tsx): ?q= is the open seat, the chat's seat, the open meeting.
  '/team': 'team',
  '/chats': 'chats',
  '/meetings': 'meetings',
  // The 3D Office (OwnerOffice.tsx, its own chunk): ?q= is the selected seat.
  '/office': 'office',
};
const PATH_OF = Object.fromEntries(Object.entries(OWNER_PATHS).map(([k, v]) => [v, k])) as Record<string, string>;
function readWhere(): Where {
  const p = new URLSearchParams(location.search);
  const r = p.get('r');
  const own = OWNER_PATHS[location.pathname];
  if (own) return { section: own, q: p.get('q') };
  if (location.pathname.startsWith('/customers')) return { section: 'customers', c: p.get('c') };
  if (location.pathname.startsWith('/support') || r) return { section: 'support', r };
  return { section: 'today' };
}
const urlOf = (w: Where) =>
  w.section === 'today'
    ? '/'
    : w.section === 'customers'
      ? `/customers${w.c ? `?c=${w.c}` : ''}`
      : w.section === 'support'
        ? `/support${w.r ? `?r=${w.r}` : ''}`
        : `${PATH_OF[w.section]}${w.q ? `?q=${encodeURIComponent(w.q)}` : ''}`;

/** While the live room is there: a look now and then for what no request carries (a trial reaching its last week). */
const BACKSTOP_MS = 60_000;
/** While it is not (a dropped connection, a server without it): asking, as before. */
const FALLBACK_MS = 5_000;

/**
 * The console's heartbeat: its live room (/api/desk/live) says within a moment
 * that something it shows has changed, with a short fingerprint and never a
 * figure. The number returned moves exactly then, and each section reloads.
 * A hidden tab notes it and reloads when it is in view again. Without the
 * room, the console asks for the fingerprint every few seconds instead.
 */
function useConsoleLive(failed: (e: unknown) => void): number {
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    let live = true;
    let last = '';
    let missed = false;
    let ws: WebSocket | null = null;
    let tries = 0;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let ping: ReturnType<typeof setInterval> | null = null;
    const seen = () => document.visibilityState === 'visible';
    const moved = (v: string) => {
      if (live && last && v !== last) {
        if (seen()) setBeat((b) => b + 1);
        else missed = true;
      }
      last = v;
    };
    const ask = async () => {
      if (!seen()) return;
      try {
        moved((await desk<{ v: string }>('GET', '/pulse')).v);
      } catch (e) {
        if (live) failed(e);
      }
    };
    const every = (ms: number) => {
      if (timer) clearInterval(timer);
      timer = setInterval(ask, ms);
    };
    const later = () => {
      if (!live || retry || ws) return;
      // 0.5 s, 1, 2, 4… up to 30 s, with jitter so a restarted server is not met by every console at once.
      const wait = Math.min(30_000, 500 * 2 ** tries++) * (0.75 + Math.random() * 0.5);
      retry = setTimeout(() => {
        retry = null;
        void open();
      }, wait);
    };
    const open = async () => {
      if (!live || ws || navigator.onLine === false) return;
      let k: string;
      try {
        k = (await desk<{ k: string }>('POST', '/live/ticket')).k;
      } catch (e) {
        if (live) failed(e);
        later();
        return;
      }
      if (!live || ws) return;
      const sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/desk/live?k=${encodeURIComponent(k)}`);
      ws = sock;
      sock.onmessage = (e) => {
        if (typeof e.data !== 'string' || e.data === 'pong') return;
        try {
          const m = JSON.parse(e.data) as { t?: string; v?: unknown };
          if ((m.t !== 'hi' && m.t !== 'c') || typeof m.v !== 'string') return;
          if (m.t === 'hi') {
            tries = 0;
            every(BACKSTOP_MS);
          }
          moved(m.v);
        } catch {
          /* not ours */
        }
      };
      sock.onclose = () => {
        if (ws === sock) ws = null;
        if (ping) clearInterval(ping);
        ping = null;
        if (!live) return;
        every(FALLBACK_MS);
        later();
      };
      // Proxies close quiet sockets: a word every 45 s, answered without waking the server's room.
      if (ping) clearInterval(ping);
      ping = setInterval(() => sock.readyState === WebSocket.OPEN && sock.send('ping'), 45_000);
    };
    const back = () => {
      if (!seen()) return;
      if (missed) {
        missed = false;
        setBeat((b) => b + 1);
      }
      void ask();
    };
    const online = () => {
      tries = 0;
      if (retry) clearTimeout(retry);
      retry = null;
      void open();
    };
    void ask();
    every(FALLBACK_MS);
    void open();
    document.addEventListener('visibilitychange', back);
    window.addEventListener('online', online);
    return () => {
      live = false;
      if (timer) clearInterval(timer);
      if (ping) clearInterval(ping);
      if (retry) clearTimeout(retry);
      document.removeEventListener('visibilitychange', back);
      window.removeEventListener('online', online);
      const sock = ws;
      ws = null;
      if (sock) {
        sock.onclose = null;
        sock.onmessage = null;
        sock.close(1000);
      }
    };
  }, [failed]);
  return beat;
}

/** A section's data, loaded again on each heartbeat; a first load that fails says so, a later one keeps what is shown. */
function useConsoleData<T>(path: string, beat: number, failed: (e: unknown) => void): { data: T | null; error: boolean; retry: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    desk<T>('GET', path)
      .then((d) => {
        if (!live) return;
        setData(d);
        setError(false);
      })
      .catch((e) => {
        failed(e);
        if (live) setError(true);
      });
    return () => {
      live = false;
    };
  }, [path, beat, attempt, failed]);
  return { data, error, retry: () => setAttempt((a) => a + 1) };
}

function TodaySection({ beat, failed, go }: { beat: number; failed: (e: unknown) => void; go: (w: Where) => void }) {
  const { t } = useI18n();
  const { data, error, retry } = useConsoleData<ConsoleToday>('/today', beat, failed);
  if (!data) return <div className="console__page">{error ? <LoadError onRetry={retry} /> : <SkeletonCards count={5} label={t('common.loading')} />}</div>;
  return (
    <div className="console__page">
      <TodayView data={data} onRequest={(r) => go({ section: 'support', r })} onCompany={(c) => go({ section: 'customers', c })} />
    </div>
  );
}

function CustomersSection({ beat, failed, open, go, privacy }: { beat: number; failed: (e: unknown) => void; open: string | null; go: (w: Where, replace?: boolean) => void; privacy?: string }) {
  const { t } = useI18n();
  const { data, error, retry } = useConsoleData<{ customers: PlatformCustomer[] }>('/customers', beat, failed);
  const loadOne = useCallback((id: string) => desk<PlatformCustomerDetail>('GET', `/customers/${id}`), []);
  const close = useCallback(() => go({ section: 'customers' }, true), [go]);
  return (
    <div className="console__page">
      <header className="pf__head">
        <div>
          <h1 className="pf__title">{t('metrics.customers')}</h1>
          <p className="pf__sub">{privacy ?? t('platform.subtitle' as MessageKey)}</p>
        </div>
      </header>
      {!data ? (
        error ? <LoadError onRetry={retry} /> : <SkeletonRows rows={8} label={t('common.loading')} />
      ) : data.customers.length === 0 ? (
        <EmptyState icon="building" title={t('platform.empty' as MessageKey)} />
      ) : (
        <CustomerList customers={data.customers} onOpen={(c) => go({ section: 'customers', c })} />
      )}
      {open && <CustomerDrawer orgId={open} load={loadOne} onClose={close} />}
    </div>
  );
}

/** Language and appearance, the address signed in with, and the way out. */
function Account({ me, onLocale, onOut }: { me: Me; onLocale: (l: Locale) => void; onOut: () => void }) {
  const { t } = useI18n();
  const [theme, setTheme] = useTheme();
  return (
    <div className="console__account">
      <Languages onLocale={onLocale} only={me.owner ? OWNER_LOCALES : undefined} />
      <label className="console__pick">
        <span className="sr-only">{t('menu.theme')}</span>
        <Icon name={theme === 'dark' ? 'moon' : 'sun'} size={16} />
        <select className="input" value={theme} onChange={(e) => setTheme(e.target.value as ThemePref)} aria-label={t('menu.theme')}>
          {THEMES.map((x) => (
            <option key={x} value={x}>
              {t(`menu.theme.${x}` as MessageKey)}
            </option>
          ))}
        </select>
      </label>
      <span className="console__email">{me.staff.email}</span>
      <button type="button" className="btn btn--quiet btn--small" onClick={onOut}>
        <Icon name="logout" size={14} />
        {t('desk.signout')}
      </button>
    </div>
  );
}

function Console({ me, refreshCounts, onOut, onLocale }: { me: Me; refreshCounts: () => void; onOut: (expired: boolean) => void; onLocale: (l: Locale) => void }) {
  const { t, locale } = useI18n();
  const { o } = useOwnerWords();
  const [where, setWhere] = useState<Where>(readWhere);
  const [queue, setQueue] = useState('received');
  const owner = !!me.owner;
  const failed = useCallback((e: unknown) => ((e instanceof DeskError || (e as { status?: number })?.status) && [401, 403].includes((e as { status: number }).status) ? onOut(true) : undefined), [onOut]);
  const beat = useConsoleLive(failed);
  useEffect(() => {
    if (beat) refreshCounts();
  }, [beat, refreshCounts]);
  useEffect(() => {
    const pop = () => setWhere(readWhere());
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  // The owner console speaks Turkish or English only (his choice); another language reads English.
  useEffect(() => {
    if (owner && !OWNER_LOCALES.includes(locale)) onLocale('en');
  }, [owner, locale, onLocale]);
  const go = useCallback((w: Where, replace = false) => {
    if (replace) history.replaceState(null, '', urlOf(w));
    else history.pushState(null, '', urlOf(w));
    setWhere(w);
    if (!replace) document.getElementById('console-main')?.focus({ preventScroll: true });
  }, []);
  const { w: teamWords, locale: teamLocale } = useTeamWords();
  const officeWords = (k: OfficeKey) => officeWord(teamLocale, k);
  const teamGo: TeamGo = useCallback((to) => go({ section: to.section, q: to.q ?? null }), [go]);
  const ownerGo: OwnerGo = useCallback((to) => go({ section: to.section as Section, c: to.c ?? null, r: to.r ?? null, q: to.q ?? null }, to.section === where.section && to.section === 'requests'), [go, where.section]);
  // Keys for the command layout: A approvals, R requests, C checklist, O overview (not while typing).
  useEffect(() => {
    if (!owner) return;
    const keys: Record<string, Section> = { a: 'approvals', r: 'requests', c: 'checklist', o: 'today', p: 'plan', g: 'office' };
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      // A section that answered the key itself (the approval queue's A and R) has the last word.
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || !el || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable) return;
      // The Office has its own keys (A there opens its approval panel).
      if (location.pathname === '/office') return;
      const to = keys[e.key.toLowerCase()];
      if (to) {
        e.preventDefault();
        go({ section: to });
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [owner, go]);
  const link = (section: Section, icon: IconName, label: string, count?: number) => (
    <a
      href={urlOf({ section })}
      className="console__tab"
      aria-current={where.section === section ? 'page' : undefined}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        go({ section });
      }}
    >
      <Icon name={icon} size={18} />
      <span>{label}</span>
      {count ? <span className="desk__count">{count}</span> : null}
    </a>
  );
  const pickQueue = (key: string) => {
    setQueue(key);
    if (where.section !== 'support') go({ section: 'support' });
  };
  const name = owner ? o('console.title') : t('console.name' as MessageKey);

  // The Office takes the whole window (its own rail, panel and bars).
  if (owner && where.section === 'office')
    return (
      <Suspense fallback={<RouteFallback />}>
        <OwnerOffice beat={beat} failed={failed} open={where.q ?? null} onOpen={(q) => go({ section: 'office', q }, true)} onExit={() => go({ section: 'today' })} teamGo={teamGo} />
      </Suspense>
    );

  return (
    <div className="console" data-section={where.section} data-owner={owner ? '' : undefined}>
      <a className="skip-link" href="#console-main">
        {t('docs.skip')}
      </a>
      <aside className="console__rail">
        <div className="console__brand">
          <span className="desk__mark" aria-hidden="true">
            <Icon name={owner ? 'gauge' : 'lifebuoy'} size={18} />
          </span>
          <span className="console__brandname">
            <strong>Curahold</strong>
            <span>{name}</span>
          </span>
        </div>
        {owner ? (
          <nav className="console__nav console__nav--owner" aria-label={name}>
            <p className="console__group">{o('nav.group.business')}</p>
            {link('today', 'gauge', o('nav.overview'))}
            {link('customers', 'building', o('nav.customers'))}
            {link('revenue', 'coins', o('nav.revenue'))}
            {link('trials', 'hourglass', o('nav.trials'))}
            <p className="console__group">{o('nav.group.decide')}</p>
            {link('requests', 'form', o('nav.requests'))}
            {link('approvals', 'checkCircle', o('nav.approvals'))}
            {link('plan', 'target', o('nav.plan'))}
            {link('checklist', 'list', o('nav.checklist'))}
            <p className="console__group">{o('nav.group.run')}</p>
            {link('supportview', 'lifebuoy', o('nav.support'), me.counts.received)}
            {link('system', 'shield', o('nav.system'))}
            {link('activity', 'history', o('nav.activity'))}
            <p className="console__group">{teamWords('nav.group')}</p>
            {link('office', 'building', officeWords('nav.office'))}
            {link('team', 'people', teamWords('nav.team'))}
            {link('chats', 'comment', teamWords('nav.chats'))}
            {link('meetings', 'calendar', teamWords('nav.meetings'))}
          </nav>
        ) : (
          <nav className="console__nav" aria-label={name}>
            {link('today', 'chart', t('console.today' as MessageKey))}
            {link('customers', 'building', t('metrics.customers'))}
            {link('support', 'lifebuoy', t('console.support' as MessageKey), me.counts.received)}
          </nav>
        )}
        {owner ? <OwnerTabs where={where.section} go={(section) => go({ section })} beat={beat} failed={failed} supportCount={me.counts.received} link={link} /> : null}
        {owner && where.section !== 'support' ? null : <Queues me={me} queue={queue} onQueue={pickQueue} className="console__queues" current={where.section === 'support'} />}
        {owner ? <p className="console__keys">{o('keys.hint')}</p> : null}
        <details className="console__me">
          <summary>
            <Icon name="user" size={18} />
            <span className="console__metext">{me.staff.name}</span>
          </summary>
          <Account me={me} onLocale={onLocale} onOut={() => onOut(false)} />
        </details>
      </aside>
      <main className="console__main" id="console-main" tabIndex={-1}>
        <OfflineBar />
        {owner && where.section !== 'support' ? <OwnerBar beat={beat} failed={failed} go={ownerGo} /> : null}
        {where.section === 'today' && (owner ? <OverviewSection beat={beat} failed={failed} go={ownerGo} /> : <TodaySection beat={beat} failed={failed} go={go} />)}
        {where.section === 'customers' && <CustomersSection beat={beat} failed={failed} open={where.c ?? null} go={go} privacy={owner ? o('privacy.line') : undefined} />}
        {where.section === 'support' && (
          <Support me={me} queue={queue} onQueue={setQueue} open={where.r ?? null} choose={(r) => go({ section: 'support', r }, !!r === !!where.r)} beat={beat} refreshCounts={refreshCounts} failed={failed} />
        )}
        {owner && where.section === 'revenue' && <RevenueSection beat={beat} failed={failed} go={ownerGo} />}
        {owner && where.section === 'trials' && <TrialsSection beat={beat} failed={failed} go={ownerGo} />}
        {owner && where.section === 'requests' && <RequestsSection beat={beat} failed={failed} open={where.q ?? null} go={ownerGo} />}
        {owner && where.section === 'approvals' && <ApprovalsSection beat={beat} failed={failed} go={ownerGo} />}
        {owner && where.section === 'plan' && <PlanSection beat={beat} failed={failed} />}
        {owner && where.section === 'checklist' && <ChecklistSection beat={beat} failed={failed} />}
        {owner && where.section === 'supportview' && <SupportOverviewSection beat={beat} failed={failed} go={ownerGo} />}
        {owner && where.section === 'system' && <SystemSection beat={beat} failed={failed} go={ownerGo} />}
        {owner && where.section === 'activity' && <ActivitySection beat={beat} failed={failed} go={ownerGo} />}
        {owner && where.section === 'team' && <TeamSection beat={beat} failed={failed} go={teamGo} open={where.q ?? null} />}
        {owner && where.section === 'chats' && <ChatSection beat={beat} failed={failed} go={teamGo} seatId={where.q ?? null} />}
        {owner && where.section === 'meetings' && <MeetingsSection beat={beat} failed={failed} go={teamGo} open={where.q ?? null} />}
      </main>
    </div>
  );
}

/**
 * The owner's sections on a phone: four tabs under the thumb (Overview, Approvals, Requests, Support, with what
 * waits on each) and "More" for everything else, in a sheet with the same groups as the desktop rail and the
 * switch that pauses every agent. Nothing scrolls sideways at 390 px. Hidden on a desktop (CSS).
 */
function OwnerTabs({
  where,
  go,
  beat,
  failed,
  supportCount,
  link,
}: {
  where: Section;
  go: (s: Section) => void;
  beat: number;
  failed: (e: unknown) => void;
  supportCount: number;
  link: (section: Section, icon: IconName, label: string, count?: number) => JSX.Element;
}) {
  const { o } = useOwnerWords();
  const { t } = useI18n();
  const { w: teamWords, locale } = useTeamWords();
  const bar = useOwnerBar(beat, failed);
  const [more, setMore] = useState(false);
  const MAIN: Section[] = ['today', 'approvals', 'requests', 'supportview'];
  const inMore = !MAIN.includes(where);
  const pick = (s: Section) => {
    setMore(false);
    go(s);
  };
  const row = (section: Section, icon: IconName, label: string) => (
    <li key={section}>
      <button type="button" className="console__moreitem" aria-current={where === section ? 'page' : undefined} onClick={() => pick(section)}>
        <Icon name={icon} size={18} />
        <span>{label}</span>
        <Icon name="chevronRight" size={16} className="console__morego" />
      </button>
    </li>
  );
  return (
    <nav className="console__tabbar" aria-label={o('nav.tabs')}>
      {link('today', 'gauge', o('nav.overview'))}
      {link('approvals', 'checkCircle', o('nav.approvals'), bar.data?.approvalsPending)}
      {link('requests', 'form', o('nav.requests'), bar.data?.requestsNew)}
      {link('supportview', 'lifebuoy', o('nav.support'), supportCount)}
      <button type="button" className="console__tab console__tab--more" aria-haspopup="dialog" aria-expanded={more} data-on={inMore || undefined} onClick={() => setMore(true)}>
        <Icon name="menu" size={18} />
        <span>{o('nav.more')}</span>
      </button>
      {more ? (
        <Dialog
          title={o('nav.moreTitle')}
          onClose={() => setMore(false)}
          footer={
            <button type="button" className="btn console__moreclose" onClick={() => setMore(false)}>
              <Icon name="close" size={16} />
              {t('common.close')}
            </button>
          }
        >
          <div className="console__more" lang={locale}>
            <p className="console__group">{o('nav.group.business')}</p>
            <ul>
              {row('customers', 'building', o('nav.customers'))}
              {row('revenue', 'coins', o('nav.revenue'))}
              {row('trials', 'hourglass', o('nav.trials'))}
            </ul>
            <p className="console__group">{o('nav.group.decide')}</p>
            <ul>
              {row('plan', 'target', o('nav.plan'))}
              {row('checklist', 'list', o('nav.checklist'))}
            </ul>
            <p className="console__group">{o('nav.group.run')}</p>
            <ul>
              {row('system', 'shield', o('nav.system'))}
              {row('activity', 'history', o('nav.activity'))}
            </ul>
            <p className="console__group">{teamWords('nav.group')}</p>
            <ul>
              {row('office', 'building', officeWord(locale, 'nav.office'))}
              {row('team', 'people', teamWords('nav.team'))}
              {row('chats', 'comment', teamWords('nav.chats'))}
              {row('meetings', 'calendar', teamWords('nav.meetings'))}
            </ul>
            <p className="console__group">{o('nav.agents')}</p>
            <PauseAllButton beat={beat} failed={failed} onChanged={bar.reload} />
            <p className="console__group">{o('privacy.show')}</p>
            <p className="console__privacy">
              <Icon name="lock" size={14} />
              <span>{o('privacy.line')}</span>
            </p>
          </div>
        </Dialog>
      ) : null}
    </nav>
  );
}

/** The queues: in the rail on a desktop, a strip over the list on a phone. */
function Queues({ me, queue, onQueue, className, current }: { me: Me; queue: string; onQueue: (k: string) => void; className: string; current: boolean }) {
  const { t } = useI18n();
  return (
    <div className={className} role="group" aria-label={t('console.queues' as MessageKey)}>
      {QUEUES.map((x) => (
        <button key={x.key} type="button" className="desk__queue" aria-pressed={current && queue === x.key} onClick={() => onQueue(x.key)}>
          <Icon name={x.icon} size={16} />
          <span>{t(`desk.queue.${x.key}` as MessageKey)}</span>
          {x.count && me.counts[x.count] > 0 && <span className="desk__count">{me.counts[x.count]}</span>}
        </button>
      ))}
    </div>
  );
}

function Support({ me, queue, onQueue, open, choose, beat, refreshCounts, failed }: { me: Me; queue: string; onQueue: (k: string) => void; open: string | null; choose: (ref: string | null) => void; beat: number; refreshCounts: () => void; failed: (e: unknown) => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    const base = QUEUES.find((x) => x.key === queue)!.query;
    try {
      const r = await desk<{ requests: Row[] }>('GET', `/requests?${base}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`);
      setRows(r.requests);
      setError(false);
    } catch (e) {
      setError(true);
      failed(e);
    }
  }, [queue, q, failed]);
  useEffect(() => {
    const id = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(id);
  }, [load, q, beat]);
  const changed = () => {
    void load();
    refreshCounts();
  };

  return (
    <div className="desk" data-open={open ? '' : undefined}>
      <section className="desk__list" aria-label={t(`desk.queue.${queue}` as MessageKey)}>
        <Queues me={me} queue={queue} onQueue={onQueue} className="desk__strip" current />
        <label className="desk__search">
          <Icon name="search" size={16} />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('desk.search')} aria-label={t('desk.search')} />
        </label>
        {error && !rows ? <LoadError onRetry={() => void load()} /> : null}
        {!rows && !error ? <SkeletonRows rows={5} label={t('common.loading')} /> : null}
        {rows && rows.length === 0 && <EmptyState icon="inbox" tone="done" compact title={t('desk.empty')} body={t('desk.emptyBody')} />}
        <ul className="desk__rows">
          {(rows ?? []).map((r) => (
            <li key={r.ref}>
              <button className="desk__row" aria-current={open === r.ref || undefined} onClick={() => choose(r.ref)}>
                <span className="desk__rowtop">
                  <span className="desk__dot" data-status={r.status} aria-hidden="true" />
                  <span className="sr-only">{t(`desk.status.${r.status}` as MessageKey)}</span>
                  <strong>{r.subject}</strong>
                </span>
                <span className="desk__rowmeta">
                  {r.company.name} · {r.from.name ?? r.from.email ?? '—'} · {relativeTime(r.lastMessageAt, t)}
                </span>
                <span className="desk__rowtags">
                  {r.impact === 'blocking' && <span className="flag flag--late">{t('desk.blocking')}</span>}
                  {r.neededBy && <span className="flag flag--soon">{t('desk.neededBy', { date: r.neededBy })}</span>}
                  {r.owner && <span className="badge">{r.owner === me.staff.email ? t('desk.queue.mine') : shortName(r.owner)}</span>}
                  {r.notes > 0 && <span className="badge desk__notes">{t('desk.notes', { n: r.notes })}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="desk__detail" aria-label={t('desk.pick')}>
        {open ? <Request key={open} reference={open} me={me} onBack={() => choose(null)} onChanged={changed} onOpen={choose} failed={failed} /> : <EmptyState icon="lifebuoy" title={t('desk.pick')} body={t('desk.pickBody')} />}
      </section>
    </div>
  );
}

function Request({ reference, me, onBack, onChanged, onOpen, failed }: { reference: string; me: Me; onBack: () => void; onChanged: () => void; onOpen: (ref: string) => void; failed: (e: unknown) => void }) {
  const { t, locale } = useI18n();
  const [d, setD] = useState<Detail | null>(null);
  const [mode, setMode] = useState<'public' | 'internal'>('public');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [signedAs, setSignedAs] = useState(() => {
    try {
      return localStorage.getItem(SIGNED_AS) ?? me.staff.name;
    } catch {
      return me.staff.name;
    }
  });
  const [watching, setWatching] = useState<ReplayMeta | null>(null);
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setD((await desk<{ request: Detail }>('GET', `/requests/${reference}`)).request);
    } catch (e) {
      failed(e);
    }
  }, [reference, failed]);
  useEffect(() => void load(), [load]);
  // In braces on purpose: newer browsers hand back a promise from scrollIntoView, and an effect must not return one.
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [d?.messages.length]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(false);
    try {
      await fn();
      await load();
      onChanged();
    } catch (e) {
      setError(true);
      failed(e);
    }
    setBusy(false);
  };
  const send = (solved: boolean) =>
    act(async () => {
      const name = signedAs.trim().length >= 2 ? signedAs.trim() : me.staff.name;
      try {
        localStorage.setItem(SIGNED_AS, name);
      } catch {
        /* private mode */
      }
      await desk('POST', `/requests/${reference}/messages`, { body: text, staff: name, internal: mode === 'internal', ...(solved && mode === 'public' ? { status: 'solved' } : {}) });
      setText('');
    });
  const enter = () =>
    act(async () => {
      const r = await desk<{ url: string }>('POST', `/requests/${reference}/enter-link`);
      window.open(r.url, '_blank', 'noopener');
    });

  if (!d) return <div className="center-note muted" />;
  const mine = d.owner === me.staff.email;
  return (
    <div className="deskreq">
      <header className="deskreq__head">
        <button className="btn btn--quiet btn--small deskreq__back" onClick={onBack}>
          <Icon name="arrowLeft" size={16} />
          {t('desk.back')}
        </button>
        <div className="deskreq__title">
          <span className="muted">{d.ref}</span>
          <h1>{d.subject}</h1>
        </div>
        <div className="deskreq__tools">
          <span className="desk__status" data-status={d.status}>
            {t(`desk.status.${d.status}` as MessageKey)}
          </span>
          <button className="btn btn--small" disabled={busy} onClick={() => act(() => desk('PUT', `/requests/${reference}/owner`, { mine: !mine }))}>
            <Icon name={mine ? 'undo' : 'user'} size={14} />
            {t(mine ? 'desk.release' : 'desk.take')}
          </button>
          <button className="btn btn--small" disabled={busy} onClick={() => act(() => desk('PUT', `/requests/${reference}/status`, { status: d.status === 'solved' ? 'received' : 'solved' }))}>
            <Icon name={d.status === 'solved' ? 'refresh' : 'check'} size={14} />
            {t(d.status === 'solved' ? 'desk.reopen' : 'desk.markSolved')}
          </button>
        </div>
      </header>

      <div className="deskreq__body">
        <div className="deskreq__thread">
          <p className="deskreq__owner muted">{mine ? t('desk.ownerYou') : d.owner ? t('desk.owner', { name: shortName(d.owner) }) : t('desk.nobody')}</p>
          <article className="deskmsg" data-by="user">
            <header>
              <strong>{d.from.name ?? d.from.email ?? '—'}</strong>
              <span className="muted">{day(d.createdAt, locale)}</span>
            </header>
            <h2>{t('desk.asked')}</h2>
            <p className="deskmsg__text">{d.description}</p>
            {d.steps && (
              <>
                <h2>{t('desk.steps')}</h2>
                <p className="deskmsg__text">{d.steps}</p>
              </>
            )}
            {d.pageUrl && (
              <p className="muted">
                {t('desk.page')}: <code>{d.pageUrl}</code>
              </p>
            )}
            {d.files.length > 0 && (
              <ul className="deskreq__files" aria-label={t('desk.files')}>
                {d.files.map((f) => (
                  <li key={f.url}>
                    <a href={f.url} target="_blank" rel="noreferrer">
                      <Icon name="paperclip" size={14} />
                      {f.name}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </article>
          {d.messages.map((m) => (
            <article key={m.id} className="deskmsg" data-by={m.internal ? 'note' : m.author}>
              <header>
                <strong>{m.name ?? (m.author === 'support' ? 'Curahold' : '—')}</strong>
                {m.internal && <span className="badge deskmsg__tag">{t('desk.internalTag')}</span>}
                <span className="muted">
                  {relativeTime(m.createdAt, t)}
                  {m.via === 'email' ? ` · ${t('desk.via.email')}` : ''}
                </span>
              </header>
              <p className="deskmsg__text">{m.body}</p>
            </article>
          ))}
          <div ref={end} />

          <form
            className="deskreply"
            data-mode={mode}
            onSubmit={(e) => {
              e.preventDefault();
              void send(false);
            }}
          >
            <div className="seg" role="radiogroup">
              <button type="button" role="radio" aria-checked={mode === 'public'} onClick={() => setMode('public')}>
                <Icon name="send" size={14} />
                {t('desk.reply.public')}
              </button>
              <button type="button" role="radio" aria-checked={mode === 'internal'} onClick={() => setMode('internal')}>
                <Icon name="lock" size={14} />
                {t('desk.reply.internal')}
              </button>
            </div>
            <textarea className="input deskreply__text" rows={5} required value={text} onChange={(e) => setText(e.target.value)} placeholder={t(mode === 'public' ? 'desk.reply.placeholder' : 'desk.reply.notePlaceholder')} aria-label={t(mode === 'public' ? 'desk.reply.public' : 'desk.reply.internal')} />
            <p className="field__hint">{t(mode === 'public' ? 'desk.reply.publicHint' : 'desk.reply.internalHint')}</p>
            {error && <p className="desk-signin__wrong">{t('desk.error')}</p>}
            <div className="deskreply__foot">
              <label className="deskreply__name">
                <span className="muted">{t('desk.reply.name')}</span>
                <input className="input" value={signedAs} maxLength={80} onChange={(e) => setSignedAs(e.target.value)} />
              </label>
              {mode === 'public' && (
                <button type="button" className="btn" disabled={busy || !text.trim()} onClick={() => send(true)}>
                  <Icon name="check" size={16} />
                  {t('desk.reply.sendSolved')}
                </button>
              )}
              <button className="btn btn--primary" disabled={busy || !text.trim()}>
                <Icon name={mode === 'public' ? 'send' : 'lock'} size={16} />
                {t(mode === 'public' ? 'desk.reply.send' : 'desk.reply.saveNote')}
              </button>
            </div>
          </form>
        </div>

        <aside className="deskreq__side">
          <section>
            <h2>{t('desk.company')}</h2>
            <p>
              <strong>{d.company.name}</strong>
              {d.company.plan ? <span className="badge">{planName(d.company.plan, t)}</span> : null}
            </p>
            <p className="muted">
              {t('desk.company.people', { n: d.company.people })} · {t('desk.company.since', { date: day(d.company.since, locale) })}
            </p>
            {d.company.trialEndsAt && <p className="muted">{t('desk.company.trial', { date: day(d.company.trialEndsAt, locale) })}</p>}
            <a className="btn btn--small" href={d.company.url} target="_blank" rel="noreferrer">
              <Icon name="external" size={14} />
              {t('desk.company.open')}
            </a>
          </section>
          <section>
            <h2>{t('desk.from')}</h2>
            <p>
              <strong>{d.from.name ?? '—'}</strong>
              {d.from.role ? <span className="badge">{d.from.role}</span> : null}
            </p>
            <p className="muted">{d.from.email}</p>
            {d.impact === 'blocking' && <span className="flag flag--late">{t('desk.blocking')}</span>}
            {d.neededBy && <span className="flag flag--soon">{t('desk.neededBy', { date: d.neededBy })}</span>}
          </section>
          <section className="deskreq__access" data-on={d.access ? '' : undefined}>
            <p>{d.access ? t(d.access.level === 'edit' ? 'desk.access.edit' : 'desk.access.view', { when: day(d.access.until, locale) }) : t('desk.access.none')}</p>
            {d.access && (
              <>
                <button className="btn btn--small" disabled={busy} onClick={enter}>
                  <Icon name="eye" size={14} />
                  {t('desk.access.enter')}
                </button>
                <p className="field__hint">{t('desk.access.note')}</p>
              </>
            )}
          </section>
          {d.replays.length > 0 && (
            <section className="deskreq__replays">
              <h2>{t('desk.replay.title')}</h2>
              <ul className="deskreq__reclist">
                {d.replays.map((r) => {
                  const mins = Math.max(1, Math.round((new Date(r.lastAt).getTime() - new Date(r.startedAt).getTime()) / 60000));
                  return (
                    <li key={r.id}>
                      <button className="deskrec" onClick={() => setWatching(r)}>
                        <Icon name="play" size={14} />
                        <span className="deskrec__main">
                          <span className="deskrec__top">
                            {relativeTime(r.lastAt, t)}
                            {r.hadError && <span className="flag flag--late">{t('desk.replay.error')}</span>}
                          </span>
                          <span className="muted">{t('desk.replay.length', { mins })}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="field__hint">{t('desk.replay.note')}</p>
            </section>
          )}
          {d.others.length > 0 && (
            <section>
              <h2>{t('desk.others')}</h2>
              <ul className="deskreq__others">
                {d.others.map((o) => (
                  <li key={o.ref}>
                    <button className="linklike" onClick={() => onOpen(o.ref)}>
                      <span className="desk__dot" data-status={o.status} aria-hidden="true" />
                      <span className="sr-only">{t(`desk.status.${o.status}` as MessageKey)}</span>
                      {o.subject}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
      {watching && (
        <Suspense fallback={null}>
          <ReplayPlayer reference={reference} replay={watching} onClose={() => setWatching(null)} />
        </Suspense>
      )}
    </div>
  );
}
