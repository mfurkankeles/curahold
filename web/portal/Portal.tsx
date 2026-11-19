// The customer portal: what a customer's people see of the work a company
// does for them. Their requests and the replies written for them, a way to
// open a new one, and nothing else. It talks only to /papi on its own domain.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { bcp47Of, LOCALE_INFO, LOCALES, normalizeLocale, translate, type Locale, type MessageKey, type Vars } from '../../shared/src/i18n/core';
import { loadLocale, useShownLocale } from './i18n';
import { formatBytes, formatDate, formatDateTime } from '../src/lib/format';
import { brandPalette, PORTAL_FILE_ENDINGS, PORTAL_FILE_MB, PORTAL_MAX_FILES, type PortalAccount, type PortalFile, type PortalBoard, type PortalMe, type PortalOrg, type PortalTask, type PortalTaskDetail } from '../../shared/src/portal';
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { intentOf, type AssistReply } from '../../shared/src/assist';
import { PortalOnboarding, OnboardingBanner } from './Onboarding';

// ------------------------------------------------------------------ api

export class Failure extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

let apiLocale: Locale = 'en';
export async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'x-curahold-portal': '1', 'x-curahold-locale': apiLocale };
  if (body !== undefined) headers['content-type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`/papi${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' });
  } catch {
    throw new Failure(0, 'network', '');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Failure(res.status, data?.error ?? 'server', data?.message ?? res.statusText);
  return data as T;
}

/** The same, as a form: the fields in "data" and the chosen files (none: plain JSON). */
export function callWith<T>(method: string, path: string, body: unknown, files: File[]): Promise<T> {
  if (!files.length) return call<T>(method, path, body);
  const form = new FormData();
  form.set('data', JSON.stringify(body));
  for (const f of files) form.append('files', f, f.name);
  return fetch(`/papi${path}`, { method, headers: { 'x-curahold-portal': '1', 'x-curahold-locale': apiLocale }, body: form, credentials: 'same-origin' }).then(
    async (res) => {
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Failure(res.status, data?.error ?? 'server', data?.message ?? res.statusText);
      return data as T;
    },
    () => {
      throw new Failure(0, 'network', '');
    },
  );
}

// --------------------------------------------------------------- router

function go(to: string, replace = false) {
  if (replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  window.dispatchEvent(new Event('app:portal-nav'));
  window.scrollTo(0, 0);
}
function usePath() {
  const [path, setPath] = useState(() => location.pathname + location.search);
  useEffect(() => {
    const on = () => setPath(location.pathname + location.search);
    window.addEventListener('popstate', on);
    window.addEventListener('app:portal-nav', on);
    return () => {
      window.removeEventListener('popstate', on);
      window.removeEventListener('app:portal-nav', on);
    };
  }, []);
  return path;
}
export const link = (to: string) => ({
  href: to,
  onClick: (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    go(to);
  },
});

// ------------------------------------------------------------------ i18n

const STORE = 'app_portal_locale';
function storedLocale(): Locale | null {
  try {
    const v = localStorage.getItem(STORE);
    return v && (LOCALES as string[]).includes(v) ? (v as Locale) : null;
  } catch {
    return null;
  }
}
/** The first of the browser's languages the portal speaks ("zh-TW" reads Traditional Chinese); English otherwise. */
function browserLocale(): Locale {
  for (const tag of navigator.languages?.length ? navigator.languages : [navigator.language]) {
    const t = (tag ?? '').toLowerCase();
    if (t.startsWith('zh')) return /HANT|TW|HK|MO/.test(t.toUpperCase()) ? 'zh-Hant' : 'zh-Hans';
    const l = normalizeLocale(t.split('-')[0], 'en');
    if (l !== 'en' || t.startsWith('en')) return l;
  }
  return 'en';
}

export interface Ctx {
  t: (k: MessageKey, v?: Vars) => string;
  locale: Locale;
  when: (iso: string) => string;
}

// ------------------------------------------------------------------- app

type Boot =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'error' }
  | { kind: 'out'; org: PortalOrg; note?: string }
  | { kind: 'confirm'; org: PortalOrg; token: string }
  | { kind: 'reset'; org: PortalOrg; token: string }
  | { kind: 'in'; org: PortalOrg; me: PortalMe };

export function PortalApp() {
  // The company's colour, drawn into both themes with readable text on it (shared/src/portal.ts).
  const [color, setColor] = useState<string | null>(null);
  const vars = useMemo(() => {
    const { light: l, dark: d } = brandPalette(color);
    return { '--b-fill': l.fill, '--b-on': l.onFill, '--b-ink': l.ink, '--b-wash': l.wash, '--bd-fill': d.fill, '--bd-on': d.onFill, '--bd-ink': d.ink, '--bd-wash': d.wash } as CSSProperties;
  }, [color]);
  return (
    <div className="p-root" style={vars}>
      <Portal onBrand={setColor} />
    </div>
  );
}

// ---------------------------------------------------------------- pieces

const PATHS = {
  plus: 'M12 5v14M5 12h14',
  back: 'M15 18l-6-6 6-6',
  alert: 'M12 8v5M12 16.5v.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  offline: 'M2 8.8a15 15 0 0 1 4.2-2.7M22 8.8A15 15 0 0 0 10.6 5M5 12.6a10 10 0 0 1 5.2-2.5M19 12.6a10 10 0 0 0-2-1.3M8.5 16.4a5 5 0 0 1 7 0M12 20h.01M3 3l18 18',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1Z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3',
  chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  out: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v6l4 2',
  x: 'M18 6 6 18M6 6l12 12',
  clip: 'm21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6',
  check: 'M20 6 9 17l-5-5',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20',
  down: 'm6 9 6 6 6-6',
} as const;
export function Ico({ name, flip }: { name: keyof typeof PATHS; flip?: boolean }) {
  return (
    <svg className={flip ? 'p-ico p-ico--flip' : 'p-ico'} viewBox="0 0 24 24" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

/** One of the five states: empty (an invitation), error (what happened, what to do), not found. `page`: it is the whole page (its title is the h1). */
export function State({ icon, title, body, tone, flat, page, children }: { icon: keyof typeof PATHS; title: string; body?: string; tone?: 'error'; flat?: boolean; page?: boolean; children?: ReactNode }) {
  const Title = page ? 'h1' : 'h2';
  return (
    <div className={flat ? 'p-state p-state--flat' : 'p-state'} data-tone={tone} role={tone === 'error' ? 'alert' : undefined}>
      <span className="p-state__ico">
        <Ico name={icon} />
      </span>
      <Title>{title}</Title>
      {body && <p>{body}</p>}
      {children}
    </div>
  );
}

/** Loading: nothing for 300 ms, then the shape of what is coming, at its size. */
function Wait({ label, kind }: { label: string; kind: 'list' | 'task' }) {
  return (
    <div className="p-wait" role="status" aria-label={label}>
      {kind === 'list' ? (
        <>
          <span className="p-bone p-bone--item" />
          <span className="p-bone p-bone--item" />
          <span className="p-bone p-bone--item" />
        </>
      ) : (
        <>
          <span className="p-bone p-bone--title" />
          <span className="p-bone p-bone--line" />
          <span className="p-bone p-bone--block" />
        </>
      )}
    </div>
  );
}

function useOnline() {
  const [on, setOn] = useState(() => navigator.onLine !== false);
  useEffect(() => {
    const up = () => setOn(true);
    const down = () => setOn(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return on;
}

/** Runs `send`; when the connection is gone, keeps the work and sends it again the moment it is back. */
function useSend(onSignedOut: (n?: string) => void, t: Ctx['t']) {
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const retry = useRef<(() => void) | null>(null);
  useEffect(() => {
    const on = () => retry.current?.();
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, []);
  const run = useCallback(
    async (send: () => Promise<void>) => {
      setBusy(true);
      setProblem(null);
      try {
        await send();
        setWaiting(false);
        retry.current = null;
      } catch (err) {
        if (err instanceof Failure && err.status === 401) return onSignedOut('expired');
        if (err instanceof Failure && err.status === 0) {
          setWaiting(true);
          retry.current = () => void run(send);
        } else setProblem(err instanceof Failure && err.message ? err.message : t('errors.server'));
      } finally {
        setBusy(false);
      }
    },
    [onSignedOut, t],
  );
  return { busy: busy || waiting, waiting, problem, run };
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...w][0])
    .join('')
    .toLocaleUpperCase();

/** The person, in the corner: their account, their language and signing out, behind one button. */
function MeMenu({ ctx, me, lang, onSignOut }: { ctx: Ctx; me: PortalMe; lang: ReactNode; onSignOut: () => void }) {
  const { t } = ctx;
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: Event) => !box.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      box.current?.querySelector<HTMLElement>('.p-me__btn')?.focus();
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  const account = link('/account');
  return (
    <div className="p-me p-top__me" ref={box}>
      <button className="p-me__btn" aria-expanded={open} aria-controls="p-me-pop" aria-describedby="p-me-hint" onClick={() => setOpen(!open)}>
        <span className="p-avatar" aria-hidden="true">
          {initials(me.user.name)}
        </span>
        <span className="p-me__name">{me.user.name}</span>
      </button>
      <span id="p-me-hint" hidden>
        {t('portal.menuFor')}
      </span>
      {open && (
        <div className="p-me__pop" id="p-me-pop">
          <div className="p-me__who">
            <strong>{me.user.name}</strong>
            <span>{me.user.email}</span>
          </div>
          <a className="p-me__item" href={account.href} onClick={(e) => (setOpen(false), account.onClick(e))}>
            <Ico name="user" />
            {t('portal.account')}
          </a>
          <label className="p-me__lang">
            <span>{t('nav.language')}</span>
            {lang}
          </label>
          <button className="p-me__item" onClick={onSignOut}>
            <Ico name="out" flip />
            {t('portal.signOut')}
          </button>
        </div>
      )}
    </div>
  );
}

const ACCEPT = PORTAL_FILE_ENDINGS.map((e) => `.${e}`).join(',');

/** Files to send with a request or a reply: chosen, checked here first (the server checks again), removable. */
export function FilePick({ ctx, files, setFiles }: { ctx: Ctx; files: File[]; setFiles: (f: File[]) => void }) {
  const { t } = ctx;
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const add = (list: FileList | null) => {
    setProblem(null);
    const next = [...files];
    for (const f of Array.from(list ?? [])) {
      const end = /\.([a-z0-9]+)$/i.exec(f.name)?.[1]?.toLowerCase() ?? '';
      if (!(PORTAL_FILE_ENDINGS as readonly string[]).includes(end)) setProblem(t('errors.portal_file_type', { name: f.name }));
      else if (f.size > PORTAL_FILE_MB * 1024 * 1024) setProblem(t('portal.fileTooBig', { name: f.name, mb: PORTAL_FILE_MB }));
      else if (next.length >= PORTAL_MAX_FILES) setProblem(t('errors.portal_too_many_files', { n: PORTAL_MAX_FILES }));
      else next.push(f);
    }
    setFiles(next);
    if (input.current) input.current.value = '';
  };
  return (
    <div className="p-pick">
      {files.length > 0 && (
        <ul className="p-files p-files--chosen" aria-label={t('portal.filesChosen')}>
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              <Ico name="file" />
              <span className="p-files__name" dir="auto">{f.name}</span>
              <span className="p-files__size">{formatBytes(f.size, ctx.locale)}</span>
              <button type="button" className="p-files__x" aria-label={t('portal.removeFile', { name: f.name })} onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                <Ico name="x" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="p-btn p-btn--quiet p-pick__btn">
        <Ico name="clip" />
        {t('portal.attach')}
        <input ref={input} className="p-sr" type="file" multiple accept={ACCEPT} onChange={(e) => add(e.target.files)} />
      </label>
      {problem && <Problem text={problem} />}
    </div>
  );
}

/** Files already sent: each a download (never opened in the page). */
export function Files({ ctx, files }: { ctx: Ctx; files: Pick<PortalFile, 'id' | 'name' | 'size'>[] }) {
  if (!files.length) return null;
  return (
    <ul className="p-files" aria-label={ctx.t('portal.files')}>
      {files.map((f) => (
        <li key={f.id}>
          <a href={`/papi/files/${f.id}`} download={f.name}>
            <Ico name="file" />
            <span className="p-files__name" dir="auto">{f.name}</span>
            <span className="p-files__size">{formatBytes(f.size, ctx.locale)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function Foot({ ctx, org }: { ctx: Ctx; org: PortalOrg }) {
  return (
    <footer className="p-foot">
      <span>{ctx.t('portal.footerPlain', { company: org.name })}</span>
      {org.brand?.poweredBy !== false && <span className="p-foot__by">{ctx.t('portal.poweredBy')}</span>}
    </footer>
  );
}

function Portal({ onBrand }: { onBrand: (color: string | null) => void }) {
  const [boot, setBoot] = useState<Boot>({ kind: 'loading' });
  const [wanted, setLocale] = useState<Locale>(() => storedLocale() ?? browserLocale());
  // Drawn in the wanted language once its dictionary is here (see ./i18n).
  const shown = useShownLocale(wanted);
  const locale = shown ?? wanted;
  apiLocale = wanted;
  // The page reads in its language's own direction: right-to-left for Arabic, Hebrew and Persian.
  useEffect(() => {
    document.documentElement.lang = bcp47Of(locale);
    document.documentElement.dir = LOCALE_INFO[locale].dir;
  }, [locale]);
  const ctx = useMemo<Ctx>(
    () => ({
      locale,
      t: (k, v) => translate(locale, k, v),
      when: (iso) => formatDateTime(iso, locale),
    }),
    [locale],
  );
  const path = usePath();

  const start = useCallback(async (note?: string) => {
    let org: PortalOrg;
    try {
      org = await call<PortalOrg>('GET', '/org');
    } catch (e) {
      setBoot(e instanceof Failure && e.status === 404 ? { kind: 'missing' } : { kind: 'error' });
      return;
    }
    onBrand(org.brand?.color ?? null);
    if (!storedLocale()) setLocale(org.locale);
    // Each screen below waits for its language, so it never opens in a passing one.
    let target: Locale = storedLocale() ?? org.locale;
    void loadLocale(target);
    document.title = org.name;
    // Back from Google/Microsoft with a problem: say what it was.
    const error = new URLSearchParams(location.search).get('error');
    if (error) {
      history.replaceState(null, '', '/');
      note ??= error;
    }
    // The one-time link from the email: trade it for a session, and keep it out of the address bar.
    if (location.pathname === '/auth') {
      const hash = new URLSearchParams(location.hash.slice(1));
      const token = hash.get('token');
      history.replaceState(null, '', '/');
      // A first Microsoft sign-in is confirmed with a code; a reset link asks for a new password.
      if (hash.get('confirm') || hash.get('reset')) await loadLocale(target);
      if (hash.get('confirm')) return setBoot({ kind: 'confirm', org, token: hash.get('confirm')! });
      if (hash.get('reset')) return setBoot({ kind: 'reset', org, token: hash.get('reset')! });
      try {
        if (!token) throw new Error('no token');
        const r = await call<{ locale: Locale | null }>('POST', '/auth/verify', { token });
        if (r.locale && !storedLocale()) setLocale((target = r.locale));
      } catch {
        await loadLocale(target);
        setBoot({ kind: 'out', org, note: 'link' });
        return;
      }
    }
    try {
      const me = await call<PortalMe>('GET', '/me');
      if (me.user.locale && !storedLocale()) target = me.user.locale;
      await loadLocale(target);
      setLocale(target);
      setBoot({ kind: 'in', org, me });
    } catch {
      await loadLocale(target);
      setBoot({ kind: 'out', org, note });
    }
  }, [onBrand]);
  useEffect(() => void start(), [start]);

  const changeLocale = (l: Locale) => {
    try {
      localStorage.setItem(STORE, l);
    } catch {
      /* private mode */
    }
    setLocale(l);
  };
  const signedOut = (note?: string) => void start(note ?? 'expired');

  const { t } = ctx;
  if (boot.kind === 'loading' || !shown) return <div className="p-center" aria-busy="true" />;
  if (boot.kind === 'missing' || boot.kind === 'error')
    return (
      <div className="p-center">
        {boot.kind === 'missing' ? (
          <State page icon="search" title={t('portal.missingTitle')} body={t('portal.missing')} />
        ) : (
          <State page icon="alert" tone="error" title={t('portal.errorTitle')} body={t('portal.errorBody')}>
            <button className="p-btn p-btn--primary" onClick={() => (setBoot({ kind: 'loading' }), void start())}>
              {t('common.retry')}
            </button>
          </State>
        )}
      </div>
    );

  // A quiet "globe + language" control under the sign-in card, not a bare field at the foot of the page.
  const lang = (
    <span className="p-langpick">
      <Ico name="globe" />
      <select className="p-langpick__select" aria-label={t('nav.language')} value={locale} onChange={(e) => changeLocale(e.target.value as Locale)}>
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={bcp47Of(l)}>
            {LOCALE_INFO[l].name}
          </option>
        ))}
      </select>
      <Ico name="down" />
    </span>
  );

  if (boot.kind === 'out') return <SignIn ctx={ctx} org={boot.org} note={boot.note} lang={lang} onIn={() => void start()} />;
  if (boot.kind === 'confirm' || boot.kind === 'reset')
    return <OneStep ctx={ctx} org={boot.org} kind={boot.kind} token={boot.token} lang={lang} onIn={() => void start()} onBack={(n) => setBoot({ kind: 'out', org: boot.org, note: n })} />;

  const { org, me } = boot;
  return (
    <div className="p-shell">
      <header className="p-top">
        <div className="p-wrap p-top__in">
          <a className="p-brand" {...link('/')}>
            {org.logoUrl ? (
              <img src={org.logoUrl} alt={org.name} />
            ) : (
              <span className="p-mark" aria-hidden="true">
                {[...org.name][0]}
              </span>
            )}
            <span className="p-brand__text">
              {!org.logoUrl && <strong>{org.name}</strong>}
              <small>{t('portal.for', { account: me.account.name })}</small>
            </span>
          </a>
          <MeMenu
            ctx={ctx}
            me={me}
            lang={lang}
            onSignOut={async () => {
              await call('POST', '/auth/logout').catch(() => undefined);
              void start('out');
            }}
          />
        </div>
      </header>
      <Offline ctx={ctx} />
      <main className="p-main">
        <Route ctx={ctx} org={org} me={me} path={path} onSignedOut={signedOut} />
      </main>
      <Foot ctx={ctx} org={org} />
    </div>
  );
}

function Offline({ ctx }: { ctx: Ctx }) {
  const online = useOnline();
  // Always in the page (an empty row while online), so a screen reader hears it when it fills.
  return (
    <div className="p-offline" role="status" data-on={online ? undefined : ''}>
      {!online && (
        <div className="p-wrap">
          <Ico name="offline" />
          <span>{ctx.t('portal.offline')}</span>
        </div>
      )}
    </div>
  );
}

function Route({ ctx, org, me, path, onSignedOut }: { ctx: Ctx; org: PortalOrg; me: PortalMe; path: string; onSignedOut: (n?: string) => void }) {
  const url = new URL(path, location.origin);
  const task = /^\/t\/([0-9a-f-]{36})$/i.exec(url.pathname)?.[1];
  const boardId = url.searchParams.get('board');
  const board = me.boards.find((b) => b.id === boardId) ?? me.boards[0];
  if (url.pathname === '/account') return <AccountPage ctx={ctx} onSignedOut={onSignedOut} />;
  if (url.pathname === '/onboarding') return <PortalOnboarding ctx={ctx} org={org} me={me} onSignedOut={onSignedOut} />;
  if (!board)
    return (
      <>
        <OnboardingBanner ctx={ctx} />
        <div className="p-wrap p-page">
          <State page icon="inbox" title={ctx.t('portal.noBoardsTitle')} body={ctx.t('portal.noBoards')} />
        </div>
      </>
    );
  if (task) return <TaskPage key={task} ctx={ctx} org={org} id={task} onSignedOut={onSignedOut} />;
  if (url.pathname === '/new') return <NewRequest ctx={ctx} me={me} board={board} onSignedOut={onSignedOut} />;
  return <List ctx={ctx} org={org} me={me} board={board} onSignedOut={onSignedOut} />;
}

// --------------------------------------------------------------- sign in

function Brand({ org }: { org: PortalOrg }) {
  return org.logoUrl ? (
    <img className="p-signin__logo" src={org.logoUrl} alt={org.name} />
  ) : (
    <div className="p-mark p-mark--big" aria-hidden="true">
      {[...org.name][0]}
    </div>
  );
}

/** The page around signing in: the company's colour behind a single card, the language, the foot. */
function SignInPage({ ctx, org, lang, children }: { ctx: Ctx; org: PortalOrg; lang: ReactNode; children: ReactNode }) {
  return (
    <div className="p-signin-page">
      <main className="p-center">
        <div className="p-signin-stack">
          {children}
          <nav className="p-lang" aria-label={ctx.t('nav.language')}>
            {lang}
          </nav>
        </div>
      </main>
      <Foot ctx={ctx} org={org} />
    </div>
  );
}

const DEMO = import.meta.env.APP_DEMO === true;
const passkeysHere = () => !DEMO && browserSupportsWebAuthn();
const failure = (e: unknown, t: Ctx['t']) => (e instanceof Failure ? e.message : t('errors.server'));

/** The ways in this company allows: Google, Microsoft, a passkey, an email code, a password. */
function SignIn({ ctx, org, note, lang, onIn }: { ctx: Ctx; org: PortalOrg; note?: string; lang: ReactNode; onIn: () => void }) {
  const { t } = ctx;
  const m = org.signIn;
  const [tab, setTab] = useState<'email' | 'password'>(m.email ? 'email' : 'password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'ask' | 'code' | 'forgot'>('ask');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    try {
      await fn();
    } catch (err) {
      setProblem(failure(err, t));
    } finally {
      setBusy(false);
    }
  };
  const notices: Record<string, MessageKey> = { link: 'portal.linkUsed', expired: 'portal.expired', no_access: 'portal.noAccess', oauth_failed: 'portal.providerFailed', method_off: 'portal.methodOff' };
  const notice = note && notices[note] ? t(notices[note]) : null;
  const passkey = m.passkey && passkeysHere();
  const providers = (['google', 'microsoft'] as const).filter((p) => m[p]);

  return (
    <SignInPage ctx={ctx} org={org} lang={lang}>
      <div className="p-card p-signin">
        <Brand org={org} />
        <h1>{t('portal.signInTitle', { company: org.name })}</h1>
        {notice && <p className="p-note">{notice}</p>}
        {(providers.length > 0 || passkey) && step === 'ask' && (
          <div className="p-ways">
            {providers.map((p) => (
              <a key={p} className="p-btn p-btn--way" href={`/papi/auth/oauth/${p}/start`}>
                {t(p === 'google' ? 'portal.withGoogle' : 'portal.withMicrosoft')}
              </a>
            ))}
            {passkey && (
              <button
                className="p-btn p-btn--way"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const o = await call<{ challengeId: string; options: any }>('POST', '/auth/passkey/options', {});
                    const response = await startAuthentication({ optionsJSON: o.options }).catch(() => null);
                    if (!response) throw new Failure(400, 'cancelled', t('portal.passkeyCancelled'));
                    await call('POST', '/auth/passkey', { challengeId: o.challengeId, response });
                    onIn();
                  })
                }
              >
                {t('portal.withPasskey')}
              </button>
            )}
          </div>
        )}
        {(m.email || m.password) && (providers.length > 0 || passkey) && step === 'ask' && <div className="p-or">{t('portal.or')}</div>}
        {m.email && m.password && step === 'ask' && (
          <div className="p-tabs p-tabs--full" role="group" aria-label={t('portal.signInHow')}>
            <button aria-pressed={tab === 'email'} onClick={() => setTab('email')}>
              {t('portal.byEmail')}
            </button>
            <button aria-pressed={tab === 'password'} onClick={() => setTab('password')}>
              {t('portal.byPassword')}
            </button>
          </div>
        )}

        {step === 'ask' && tab === 'email' && m.email && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await call('POST', '/auth/start', { email });
                setStep('code');
              });
            }}
          >
            <p className="p-signin__lead">{t('portal.signInLead', { company: org.name })}</p>
            <label className="p-field">
              <span>{t('portal.email')}</span>
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {problem && <Problem text={problem} />}
            <button className="p-btn p-btn--primary p-btn--block" disabled={busy || !email}>
              {t('portal.sendCode')}
            </button>
          </form>
        )}

        {step === 'code' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await call('POST', '/auth/code', { email, code });
                onIn();
              });
            }}
          >
            <p role="status">{t('portal.checkInbox', { email })}</p>
            <label className="p-field">
              <span>{t('portal.code')}</span>
              <input className="p-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            </label>
            {problem && <Problem text={problem} />}
            <button className="p-btn p-btn--primary p-btn--block" disabled={busy || code.length !== 6}>
              {t('portal.signIn')}
            </button>
            <button type="button" className="p-link" onClick={() => (setStep('ask'), setCode(''), setProblem(null))}>
              {t('portal.otherAddress')}
            </button>
          </form>
        )}

        {step === 'ask' && tab === 'password' && m.password && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await call('POST', '/auth/password', { email, password });
                onIn();
              });
            }}
          >
            <label className="p-field">
              <span>{t('portal.email')}</span>
              <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="p-field">
              <span>{t('portal.password')}</span>
              <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {problem && <Problem text={problem} />}
            <button className="p-btn p-btn--primary p-btn--block" disabled={busy || !email || !password}>
              {t('portal.signIn')}
            </button>
            <button type="button" className="p-link" onClick={() => (setStep('forgot'), setProblem(null))}>
              {t('portal.forgot')}
            </button>
          </form>
        )}

        {step === 'forgot' && (
          <ForgotPassword ctx={ctx} email={email} setEmail={setEmail} onBack={() => setStep('ask')} />
        )}
      </div>
    </SignInPage>
  );
}

function Problem({ text }: { text: string }) {
  return (
    <p className="p-note p-note--error" role="alert">
      {text}
    </p>
  );
}

function ForgotPassword({ ctx, email, setEmail, onBack }: { ctx: Ctx; email: string; setEmail: (v: string) => void; onBack: () => void }) {
  const { t } = ctx;
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  if (sent)
    return (
      <div className="p-form-plain">
        <p role="status">{t('portal.resetSent', { email })}</p>
        <button type="button" className="p-link" onClick={onBack}>
          {t('portal.backToSignIn')}
        </button>
      </div>
    );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await call('POST', '/auth/forgot', { email }).catch(() => undefined);
        setBusy(false);
        setSent(true);
      }}
    >
      <p className="p-muted">{t('portal.forgotLead')}</p>
      <label className="p-field">
        <span>{t('portal.email')}</span>
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <button className="p-btn p-btn--primary" disabled={busy || !email}>
        {t('portal.sendReset')}
      </button>
      <button type="button" className="p-link" onClick={onBack}>
        {t('portal.backToSignIn')}
      </button>
    </form>
  );
}

/** One step from an email: the code that confirms a first Microsoft sign-in, or a new password. */
function OneStep({ ctx, org, kind, token, lang, onIn, onBack }: { ctx: Ctx; org: PortalOrg; kind: 'confirm' | 'reset'; token: string; lang: ReactNode; onIn: () => void; onBack: (note?: string) => void }) {
  const { t } = ctx;
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      if (kind === 'confirm') await call('POST', '/auth/verify', { token, code: value });
      else await call('POST', '/auth/reset', { token, password: value });
      onIn();
    } catch (err) {
      if (err instanceof Failure && err.code === 'invalid_token') return onBack('link');
      setProblem(failure(err, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <SignInPage ctx={ctx} org={org} lang={lang}>
      <form className="p-card p-signin" onSubmit={submit}>
        <Brand org={org} />
        <h1>{t(kind === 'confirm' ? 'portal.confirmTitle' : 'portal.resetTitle')}</h1>
        <p className="p-muted">{t(kind === 'confirm' ? 'portal.confirmLead' : 'portal.resetLead')}</p>
        <div className="p-form-plain">
          {kind === 'confirm' ? (
            <label className="p-field">
              <span>{t('portal.code')}</span>
              <input className="p-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))} />
            </label>
          ) : (
            <label className="p-field">
              <span>{t('portal.newPassword')}</span>
              <input type="password" autoComplete="new-password" minLength={10} value={value} onChange={(e) => setValue(e.target.value)} />
              <small className="p-muted">{t('portal.passwordRule')}</small>
            </label>
          )}
          {problem && <Problem text={problem} />}
          <button className="p-btn p-btn--primary" disabled={busy || (kind === 'confirm' ? value.length !== 6 : value.length < 10)}>
            {t(kind === 'confirm' ? 'portal.confirm' : 'portal.savePassword')}
          </button>
        </div>
      </form>
    </SignInPage>
  );
}

// --------------------------------------------------------------- account

/** Asks before something that cannot be taken back at once: a small modal that keeps Tab inside and closes on Esc. */
function Ask({ ctx, title, body, label, onYes, onClose }: { ctx: Ctx; title: string; body: string; label: string; onYes: () => void; onClose: () => void }) {
  const { t } = ctx;
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
      if (e.key !== 'Tab' || !box.current) return;
      const items = Array.from(box.current.querySelectorAll<HTMLElement>('button:not([disabled])'));
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, []);
  return (
    <div className="p-modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="p-card p-modal__box" role="alertdialog" aria-modal="true" aria-labelledby="p-ask-title" aria-describedby="p-ask-body" ref={box}>
        <h2 id="p-ask-title">{title}</h2>
        <p id="p-ask-body" className="p-muted">
          {body}
        </p>
        <div className="p-modal__foot">
          <button className="p-btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="p-btn p-btn--danger"
            onClick={() => {
              onClose();
              onYes();
            }}
          >
            {label}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The person's own ways in: passkeys, a password, linked accounts, and signing out everywhere. */
function AccountPage({ ctx, onSignedOut }: { ctx: Ctx; onSignedOut: (n?: string) => void }) {
  const { t, when } = ctx;
  const { data, failed, reload } = useLoad(() => call<PortalAccount>('GET', '/account'), [], onSignedOut);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [ask, setAsk] = useState<{ title: string; body: string; label: string; run: () => void } | null>(null);
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setProblem(null);
    setDone(null);
    try {
      await fn();
      setDone(ok);
      reload();
    } catch (err) {
      setProblem(failure(err, t));
    } finally {
      setBusy(false);
    }
  };
  if (failed)
    return (
      <div className="p-wrap p-page p-narrow">
        <LoadFailed page ctx={ctx} failure={failed} onRetry={reload} />
      </div>
    );
  if (!data)
    return (
      <div className="p-wrap p-page p-narrow">
        <Wait label={t('common.loading')} kind="task" />
      </div>
    );
  const m = data.methods;
  // Ways to sign in that would still work if one passkey or linked account went away.
  const waysLeft = (drop: { passkey?: string; identity?: string }) =>
    (m.email ? 1 : 0) +
    (m.password && data.password.set ? 1 : 0) +
    (m.passkey ? data.passkeys.filter((k) => k.id !== drop.passkey).length : 0) +
    data.identities.filter((i) => i.provider !== drop.identity && m[i.provider]).length;
  return (
    <div className="p-wrap p-page p-narrow">
      <a className="p-back" {...link('/')}>
        <Ico name="back" flip />
        {t('portal.back')}
      </a>
    <div className="p-card p-account">
      <h1>{t('portal.account')}</h1>
      <p className="p-muted">{data.email}</p>
      {done && (
        <p className="p-note p-note--ok" role="status">
          {done}
        </p>
      )}
      {problem && <Problem text={problem} />}

      {m.passkey && (
        <section>
          <h2>{t('portal.passkeys')}</h2>
          <p className="p-muted">{t('portal.passkeysLead')}</p>
          <ul className="p-rows">
            {data.passkeys.map((k) => (
              <li key={k.id}>
                <span>
                  <strong>{k.name}</strong>
                  <small className="p-muted"> · {t('portal.added', { when: when(k.createdAt) })}</small>
                </span>
                <button className="p-link" disabled={busy} onClick={() =>
                    waysLeft({ passkey: k.id }) === 0
                      ? setProblem(t('portal.lastMethod'))
                      : setAsk({ title: t('portal.removePasskeyTitle', { name: k.name }), body: t('portal.removePasskeyBody'), label: t('portal.remove'), run: () => void act(() => call('DELETE', `/account/passkeys/${k.id}`), t('portal.passkeyRemoved')) })
                  }
                >
                  {t('portal.remove')}
                </button>
              </li>
            ))}
          </ul>
          {passkeysHere() ? (
            <button
              className="p-btn"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  const o = await call<{ challengeId: string; options: any }>('POST', '/account/passkeys/options', {});
                  const response = await startRegistration({ optionsJSON: o.options }).catch(() => null);
                  if (!response) throw new Failure(400, 'cancelled', t('portal.passkeyCancelled'));
                  await call('POST', '/account/passkeys', { challengeId: o.challengeId, response });
                }, t('portal.passkeyAdded'))
              }
            >
              {t('portal.addPasskey')}
            </button>
          ) : (
            <p className="p-muted">{t('portal.passkeyUnsupported')}</p>
          )}
        </section>
      )}

      {m.password && (
        <section>
          <h2>{t('portal.password')}</h2>
          <p className="p-muted">{data.password.set ? t('portal.passwordSetAt', { when: when(data.password.setAt!) }) : t('portal.passwordNone')}</p>
          <form
            className="p-form-plain"
            onSubmit={(e) => {
              e.preventDefault();
              void act(() => call('PUT', '/account/password', { current: current || undefined, password: next }), t('portal.passwordSaved')).then(() => {
                setCurrent('');
                setNext('');
              });
            }}
          >
            {data.password.set && (
              <label className="p-field">
                <span>{t('portal.currentPassword')}</span>
                <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
              </label>
            )}
            <label className="p-field">
              <span>{t('portal.newPassword')}</span>
              <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
              <small className="p-muted">{t('portal.passwordRule')}</small>
            </label>
            <button className="p-btn" disabled={busy || next.length < 10}>
              {t('portal.savePassword')}
            </button>
          </form>
        </section>
      )}

      {data.identities.length > 0 && (
        <section>
          <h2>{t('portal.linked')}</h2>
          <ul className="p-rows">
            {data.identities.map((i) => (
              <li key={i.provider}>
                <span>
                  <strong>{t(`portal.method.${i.provider}` as MessageKey)}</strong>
                  <small className="p-muted"> · {i.email}</small>
                </span>
                <button className="p-link" disabled={busy} onClick={() =>
                    waysLeft({ identity: i.provider }) === 0
                      ? setProblem(t('portal.lastMethod'))
                      : setAsk({
                          title: t('portal.unlinkTitle', { method: t(`portal.method.${i.provider}` as MessageKey) }),
                          body: t('portal.unlinkBody', { email: i.email }),
                          label: t('portal.unlink'),
                          run: () => void act(() => call('DELETE', `/account/identities/${i.provider}`), t('portal.unlinked')),
                        })
                  }
                >
                  {t('portal.unlink')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2>{t('portal.devices')}</h2>
        <p className="p-muted">{t('portal.devicesLead')}</p>
        <button
          className="p-btn"
          disabled={busy}
          onClick={async () => {
            await call('POST', '/account/signout-all', {}).catch(() => undefined);
            go('/', true);
            onSignedOut('out');
          }}
        >
          {t('portal.signOutAll')}
        </button>
      </section>
      {ask && <Ask ctx={ctx} title={ask.title} body={ask.body} label={ask.label} onYes={ask.run} onClose={() => setAsk(null)} />}
    </div>
    </div>
  );
}

// ------------------------------------------------------------------ list

export function useLoad<T>(load: () => Promise<T>, deps: unknown[], onSignedOut: (n?: string) => void) {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState<Failure | null>(null);
  const reload = useCallback(() => {
    setFailed(null);
    load().then(setData, (e) => {
      if (e instanceof Failure && e.status === 401) onSignedOut('expired');
      else setFailed(e instanceof Failure ? e : new Failure(500, 'server', ''));
    });
  }, deps);
  useEffect(reload, [reload]);
  return { data, failed, reload, setData };
}

/** A load that failed: not there (or not theirs), or something to try again. */
function LoadFailed({ ctx, failure, onRetry, company, page }: { ctx: Ctx; failure: Failure; onRetry: () => void; company?: string; page?: boolean }) {
  const { t } = ctx;
  if (failure.status === 404 || failure.status === 403)
    return (
      <State page={page} icon="search" title={t('portal.notFoundTitle')} body={t('portal.notFound')}>
        <a className="p-btn p-btn--primary" {...link('/')}>
          {t('portal.seeRequests')}
        </a>
      </State>
    );
  return (
    <State page={page} icon={failure.status === 0 ? 'offline' : 'alert'} tone="error" title={t('portal.loadFailedTitle')} body={t('portal.loadFailedBody', { company: company ?? '' })}>
      <button className="p-btn p-btn--primary" onClick={onRetry}>
        {t('common.retry')}
      </button>
    </State>
  );
}

/** The company's own word for the column, or the portal's plain word for the step; never the team's column name. */
function Status({ ctx, board, status }: { ctx: Ctx; board: PortalBoard; status: string }) {
  const col = board.columns.find((c) => c.key === status);
  const step = col?.step ?? (col?.done ? 'done' : 'doing');
  return (
    <span className="p-status" data-done={col?.done || undefined} data-step={step}>
      {col?.name || ctx.t(`portal.step.${step}`)}
    </span>
  );
}

const SEEN = 'app_portal_welcomed';
/** The first visit: once per person on this device, until they say they have it. */
function useWelcome(id: string) {
  const [show, setShow] = useState(() => {
    try {
      return !(localStorage.getItem(SEEN) ?? '').split(',').includes(id);
    } catch {
      return false;
    }
  });
  const done = () => {
    try {
      localStorage.setItem(SEEN, [...(localStorage.getItem(SEEN) ?? '').split(',').filter(Boolean).slice(-9), id].join(','));
    } catch {
      /* private mode */
    }
    setShow(false);
  };
  return { show, done };
}

/** How it works, in three steps: on the side of a wide screen, and once at the top of a phone. */
function How({ ctx, org, me, onClose }: { ctx: Ctx; org: PortalOrg; me: PortalMe; onClose?: () => void }) {
  const { t } = ctx;
  return (
    <section className={onClose ? 'p-card p-how p-welcome' : 'p-card p-how'} aria-labelledby={onClose ? 'p-how-w' : 'p-how'}>
      {onClose ? (
        <div className="p-welcome__head">
          <h2 id="p-how-w">{t('portal.welcome', { name: me.user.name.split(/\s+/)[0] })}</h2>
          <button className="p-btn p-btn--quiet" onClick={onClose}>
            {t('portal.gotIt')}
          </button>
        </div>
      ) : (
        <h2 id="p-how">{t('portal.howTitle')}</h2>
      )}
      {onClose && <p>{t('portal.welcomeLead', { company: org.name, account: me.account.name })}</p>}
      <ol>
        <li>
          <span>
            <strong>{t('portal.how1')}</strong>
            {t('portal.how1b')}
          </span>
        </li>
        <li>
          <span>
            <strong>{t('portal.how2')}</strong>
            {t('portal.how2b')}
          </span>
        </li>
        <li>
          <span>
            <strong>{t('portal.how3')}</strong>
            {t('portal.how3b')}
          </span>
        </li>
      </ol>
      <p className="p-how__mail">{t('portal.howMail', { email: me.user.email })}</p>
    </section>
  );
}

function List({ ctx, org, me, board, onSignedOut }: { ctx: Ctx; org: PortalOrg; me: PortalMe; board: PortalBoard; onSignedOut: (n?: string) => void }) {
  const { t, when } = ctx;
  const [show, setShow] = useState<'open' | 'done'>('open');
  const welcome = useWelcome(me.user.id);
  const { data, failed, reload } = useLoad(() => call<{ tasks: PortalTask[] }>('GET', `/boards/${board.id}/tasks`).then((r) => r.tasks), [board.id], onSignedOut);
  const done = new Set(board.columns.filter((c) => c.done).map((c) => c.key));
  const all = data ?? [];
  const list = all.filter((x) => (show === 'done') === done.has(x.status));
  const openCount = all.filter((x) => !done.has(x.status)).length;
  const first = data !== null && all.length === 0;
  const newLink = link(`/new?board=${board.id}`);
  return (
    <>
      <OnboardingBanner ctx={ctx} />
      <section className="p-hero">
        <div className="p-wrap">
          <span className="p-hero__kicker">{me.account.name}</span>
          <div className="p-hero__row p-head">
            <h1>{t('portal.requests')}</h1>
            {!first && (
              <a className="p-btn p-btn--primary" {...newLink}>
                <Ico name="plus" />
                {t('portal.new')}
              </a>
            )}
          </div>
          <p>{t('portal.requestsLead', { company: me.account.name })}</p>
        </div>
        {me.boards.length > 1 && (
          <div className="p-wrap">
            <nav className="p-boards" aria-label={t('portal.boards')}>
              {me.boards.map((b) => (
                <a key={b.id} aria-current={b.id === board.id ? 'page' : undefined} {...link(`/?board=${b.id}`)}>
                  {b.name}
                </a>
              ))}
            </nav>
          </div>
        )}
      </section>
      <div className="p-wrap p-page p-page--aside">
        <div className="p-page__main">
          {failed ? (
            <LoadFailed ctx={ctx} failure={failed} onRetry={reload} company={org.name} />
          ) : !data ? (
            <Wait label={t('common.loading')} kind="list" />
          ) : first ? (
            <State icon="inbox" title={t('portal.firstTitle', { company: org.name })} body={t('portal.firstBody')}>
              <a className="p-btn p-btn--primary" {...newLink}>
                <Ico name="plus" />
                {t('portal.firstAction')}
              </a>
            </State>
          ) : (
            <>
              <div className="p-tabs" role="group" aria-label={t('portal.requests')}>
                <button aria-pressed={show === 'open'} onClick={() => setShow('open')}>
                  {t('portal.openTab')}
                  <span className="p-count">{openCount}</span>
                </button>
                <button aria-pressed={show === 'done'} onClick={() => setShow('done')}>
                  {t('portal.closed')}
                  <span className="p-count">{all.length - openCount}</span>
                </button>
              </div>
              {list.length === 0 ? (
                <State flat icon={show === 'open' ? 'check' : 'inbox'} title={show === 'open' ? t('portal.noOpenTitle') : t('portal.noClosedTitle')} body={show === 'open' ? t('portal.noOpen') : t('portal.noClosed')} />
              ) : (
                <ul className="p-list">
                  {list.map((x) => (
                    <li key={x.id}>
                      <a className="p-item" {...link(`/t/${x.id}`)}>
                        <span className="p-item__title" dir="auto">{x.title}</span>
                        <span className="p-item__side">
                          {x.lastFromTeam && !done.has(x.status) && <span className="p-fresh">{t('portal.newReply')}</span>}
                          <Status ctx={ctx} board={board} status={x.status} />
                        </span>
                        <span className="p-item__meta">
                          <span>{x.openedBy ? t('portal.openedBy', { name: x.openedBy }) : t('portal.fromTeam')}</span>
                          <span>
                            <Ico name="clock" />
                            {t('portal.updated', { when: when(x.updatedAt) })}
                          </span>
                          {x.replies > 0 && (
                            <span>
                              <Ico name="chat" />
                              {t('portal.replies', { n: x.replies })}
                            </span>
                          )}
                          {x.dueDate && <span>{t('portal.due', { when: formatDate(x.dueDate, ctx.locale, { day: 'numeric', month: 'short' }) })}</span>}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {welcome.show && !first && !failed && data && (
            <div className="p-welcome-wrap">
              <How ctx={ctx} org={org} me={me} onClose={welcome.done} />
            </div>
          )}
          {/* On a phone the side column is not shown: the questions box comes under the list. */}
          <div className="p-ask-narrow">
            <PortalAsk ctx={ctx} />
          </div>
        </div>
        <aside className="p-page__aside p-page__aside--wide">
          <How ctx={ctx} org={org} me={me} />
          <PortalAsk ctx={ctx} />
        </aside>
      </div>
    </>
  );
}

/** Whether this company's server answers portal questions with a model (asked once). */
let portalAssistOn: Promise<boolean> | null = null;

/**
 * Questions about using the portal and one's own requests, answered by the
 * assistant every Curahold chatbot shares (POST /papi/assist). It reads only
 * what this person sees here. Shown only where the server has a model.
 */
function PortalAsk({ ctx }: { ctx: Ctx }) {
  const { t } = ctx;
  const [on, setOn] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ side: 'customer' | 'bot'; text: string; options?: { id: string; label: string }[] }[]>([]);
  useEffect(() => {
    let live = true;
    void (portalAssistOn ??= call<{ available: boolean }>('GET', '/assist/status').then((r) => !!r.available, () => false)).then((v) => live && setOn(v));
    return () => {
      live = false;
    };
  }, []);
  if (!on) return null;
  const send = async (q: string, intent?: string) => {
    if (!q.trim() || busy) return;
    const history = log.filter((m) => !m.options).map((m) => ({ role: m.side === 'customer' ? ('user' as const) : ('assistant' as const), content: m.text })).slice(-6);
    setLog((l) => [...l, { side: 'customer', text: q }]);
    setText('');
    setBusy(true);
    try {
      const { reply } = await call<{ reply: AssistReply }>('POST', '/assist', { question: q, history, ...(intentOf(intent) ? { intent } : {}) });
      // Without a model the company's internal docs would answer: not for customers. Point to a new request instead.
      const said = reply.engine === 'docs' || reply.kind === 'not_covered' ? t('assist.portal.none') : reply.text;
      setLog((l) => [...l, { side: 'bot', text: said, options: reply.kind === 'clarify' ? reply.options : undefined }]);
    } catch {
      setLog((l) => [...l, { side: 'bot', text: t('assist.portal.none') }]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="p-card p-ask" aria-labelledby="p-ask">
      <h2 id="p-ask">{t('assist.portal.title')}</h2>
      <p className="p-muted">{t('assist.portal.hello')}</p>
      {log.length > 0 && (
        <div className="p-thread" role="log" aria-live="polite">
          {log.map((m, i) => (
            <div key={i} className="p-msg" data-side={m.side === 'customer' ? 'customer' : undefined}>
              <div className="p-msg__body" dir="auto">
                {m.text.replace(/\*\*/g, '')}
              </div>
              {m.options && (
                <div className="p-actions">
                  {m.options.map((o) => (
                    <button key={o.id} type="button" className="p-btn" disabled={busy} onClick={() => void send(o.label, o.id)}>
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <form
        className="p-form-plain"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <label className="p-field">
          <span className="p-sr">{t('assist.portal.title')}</span>
          <input dir="auto" value={text} maxLength={300} placeholder={t('assist.portal.placeholder')} onChange={(e) => setText(e.target.value)} />
        </label>
        <button className="p-btn p-btn--primary" type="submit" disabled={busy || !text.trim()}>
          {busy ? t('ask.loading') : t('ask.send')}
        </button>
      </form>
      <p className="p-muted">{t('assist.private')}</p>
    </section>
  );
}

// ------------------------------------------------------------------- new

function NewRequest({ ctx, me, board, onSignedOut }: { ctx: Ctx; me: PortalMe; board: PortalBoard; onSignedOut: (n?: string) => void }) {
  const { t } = ctx;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [short, setShort] = useState(false);
  const { busy, waiting, problem, run } = useSend(onSignedOut, t);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 3) return setShort(true);
    setShort(false);
    const since = Date.now() - 60_000;
    let tries = 0;
    void run(async () => {
      // Sent again after the connection came back: if the first try did arrive, open that one.
      if (tries++ > 0) {
        const list = (await call<{ tasks: PortalTask[] }>('GET', `/boards/${board.id}/tasks`)).tasks;
        const there = list.find((x) => x.mine && x.title === title.trim() && Date.parse(x.createdAt) > since);
        if (there) return go(`/t/${there.id}`, true);
      }
      const r = await callWith<{ task: PortalTask }>('POST', `/boards/${board.id}/tasks`, { title, description }, files);
      go(`/t/${r.task.id}`, true);
    });
  };
  return (
    <div className="p-wrap p-page p-narrow">
      <a className="p-back" {...link(`/?board=${board.id}`)}>
        <Ico name="back" flip />
        {t('portal.back')}
      </a>
      <form className="p-form" onSubmit={submit} noValidate>
        <div className="p-form__head">
          <h1>{t('portal.newTitle')}</h1>
          <p className="p-muted">{t('portal.newLead', { account: me.account.name })}</p>
        </div>
        <div className="p-card p-form__card">
          <label className="p-field">
            <span>{t('portal.title')}</span>
            <input value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} placeholder={t('portal.titlePlaceholder')} aria-invalid={short || undefined} aria-describedby={short ? 'p-new-short' : undefined} />
            {short && (
              <small id="p-new-short" className="p-note p-note--error">
                {t('portal.needTitle')}
              </small>
            )}
          </label>
          <label className="p-field">
            <span>{t('portal.details')}</span>
            <textarea rows={7} value={description} maxLength={20000} onChange={(e) => setDescription(e.target.value)} placeholder={t('portal.detailsPlaceholder')} />
          </label>
          <FilePick ctx={ctx} files={files} setFiles={setFiles} />
          {problem && <Problem text={problem} />}
          {waiting && (
            <p className="p-note" role="status">
              {t('portal.notSentYet')}
            </p>
          )}
          <div className="p-actions">
            <span className="p-muted">{t('portal.sendHint')}</span>
            <button className="p-btn p-btn--primary" disabled={busy}>
              {t('portal.send')}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ------------------------------------------------------------------ task

function TaskPage({ ctx, org, id, onSignedOut }: { ctx: Ctx; org: PortalOrg; id: string; onSignedOut: (n?: string) => void }) {
  const { t, when } = ctx;
  const { data, failed, setData, reload } = useLoad(() => call<{ task: PortalTaskDetail }>('GET', `/tasks/${id}`).then((r) => r.task), [id], onSignedOut);
  const [reply, setReply] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const { busy, waiting, problem, run } = useSend(onSignedOut, t);
  const approving = useSend(onSignedOut, t);
  const replyBox = useRef<HTMLTextAreaElement>(null);
  if (failed)
    return (
      <div className="p-wrap p-page p-narrow">
        <LoadFailed page ctx={ctx} failure={failed} onRetry={reload} company={org.name} />
      </div>
    );
  if (!data)
    return (
      <div className="p-wrap p-page p-narrow">
        <Wait label={t('common.loading')} kind="task" />
      </div>
    );
  const send = (e: FormEvent) => {
    e.preventDefault();
    if (!reply.trim() && !files.length) return;
    const since = Date.now() - 60_000;
    let tries = 0;
    void run(async () => {
      // Sent again after the connection came back: if the first try did arrive, do not post it twice.
      if (tries++ > 0) {
        const now = (await call<{ task: PortalTaskDetail }>('GET', `/tasks/${id}`)).task;
        if (now.comments.some((c) => c.mine && c.body === reply.trim() && Date.parse(c.createdAt) > since)) {
          setData(now);
          setReply('');
          setFiles([]);
          return;
        }
      }
      const r = await callWith<{ task: PortalTaskDetail }>('POST', `/tasks/${id}/comments`, { body: reply }, files);
      setData(r.task);
      setReply('');
      setFiles([]);
    });
  };
  const fields = data.board.fields;
  const own = (data.files ?? []).filter((f) => !f.commentId);
  const finished = !!data.board.columns.find((c) => c.key === data.status)?.done;
  const facts = (
    <>
      <div>
        <dt>{t('portal.opened')}</dt>
        <dd>
          {when(data.createdAt)}
          {data.openedBy ? ` · ${data.openedBy}` : ''}
        </dd>
      </div>
      {fields.includes('due') && data.dueDate && (
        <div>
          <dt>{t('portal.dueLabel')}</dt>
          <dd>{formatDate(data.dueDate, ctx.locale, { day: 'numeric', month: 'long', year: 'numeric' })}</dd>
        </div>
      )}
      {fields.includes('assignee') && data.assignees && data.assignees.length > 0 && (
        <div>
          <dt>{t('portal.workingOn')}</dt>
          <dd>{data.assignees.join(', ')}</dd>
        </div>
      )}
      {fields.includes('priority') && data.priority && (
        <div>
          <dt>{t('portal.priority')}</dt>
          <dd>{t(`task.priority.${data.priority}` as MessageKey)}</dd>
        </div>
      )}
    </>
  );
  return (
    <div className="p-wrap p-page p-page--aside">
      <article className="p-page__main p-task">
        <a className="p-back" {...link(`/?board=${data.boardId}`)}>
          <Ico name="back" flip />
          {t('portal.back')}
        </a>
        <header className="p-task__head">
          <div className="p-task__title">
            <h1 dir="auto">{data.title}</h1>
            <Status ctx={ctx} board={data.board} status={data.status} />
          </div>
          <dl className="p-meta p-meta--inline">{facts}</dl>
        </header>
        {(data.description || own.length > 0) && (
          <div className="p-task__desc">
            {data.description && <p dir="auto">{data.description}</p>}
            <Files ctx={ctx} files={own} />
          </div>
        )}
        {finished && data.approvedAt && (
          <p className="p-note p-note--ok p-approved">
            <Ico name="check" />
            {t('portal.approvedBy', { name: data.approvedBy ?? t('portal.someone'), when: when(data.approvedAt) })}
          </p>
        )}
        {finished && !data.approvedAt && (
          <section className="p-card p-approve" aria-labelledby="p-approve">
            <h2 id="p-approve">{t('portal.approveTitle')}</h2>
            <p>{t('portal.approveBody', { company: org.name })}</p>
            {approving.problem && <Problem text={approving.problem} />}
            <div className="p-approve__do">
              <button
                className="p-btn p-btn--primary"
                disabled={approving.busy}
                onClick={() =>
                  void approving.run(async () => {
                    const r = await call<{ task: PortalTaskDetail }>('POST', `/tasks/${id}/approve`, {});
                    setData(r.task);
                  })
                }
              >
                <Ico name="check" />
                {t('portal.approve')}
              </button>
              <button className="p-btn p-btn--quiet" onClick={() => replyBox.current?.focus()}>
                {t('portal.notYet')}
              </button>
            </div>
          </section>
        )}
        <section className="p-thread" aria-labelledby="p-conv">
          <h2 id="p-conv">{t('portal.conversation')}</h2>
          {data.comments.length === 0 && <p className="p-muted">{t('portal.noReplies')}</p>}
          {data.comments.length > 0 && (
            <ol>
              {data.comments.map((c) => (
                <li key={c.id} className="p-msg" data-side={c.fromCustomer ? 'customer' : 'team'}>
                  <div className="p-msg__who">
                    <strong>{c.author ?? t('portal.someone')}</strong>
                    <span className="p-muted">{when(c.createdAt)}</span>
                  </div>
                  <p className="p-msg__body" dir="auto">{c.body.replace(/@\[([^\]]+)\]\([0-9a-f-]{36}\)/g, '@$1')}</p>
                  <Files ctx={ctx} files={(data.files ?? []).filter((f) => f.commentId === c.id)} />
                </li>
              ))}
            </ol>
          )}
          <form className="p-reply" onSubmit={send}>
            <label className="p-field">
              <span>{t('portal.reply')}</span>
              <textarea ref={replyBox} rows={3} dir="auto" value={reply} maxLength={10000} onChange={(e) => setReply(e.target.value)} />
            </label>
            {problem && <Problem text={problem} />}
            {waiting && (
              <p className="p-note" role="status">
                {t('portal.notSentYet')}
              </p>
            )}
            <div className="p-actions">
              <FilePick ctx={ctx} files={files} setFiles={setFiles} />
              <span className="p-actions__end">
                <button className="p-btn p-btn--primary" disabled={busy || (!reply.trim() && !files.length)}>
                  {t('portal.sendReply')}
                </button>
              </span>
            </div>
          </form>
        </section>
      </article>
      <aside className="p-page__aside p-page__aside--wide">
        <div className="p-card">
          <dl className="p-meta">
            <div>
              <dt>{t('portal.status')}</dt>
              <dd>
                <Status ctx={ctx} board={data.board} status={data.status} />
              </dd>
            </div>
            {facts}
          </dl>
        </div>
      </aside>
    </div>
  );
}
