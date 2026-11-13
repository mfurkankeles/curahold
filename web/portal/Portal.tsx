// The customer portal: what a customer's people see of the work a company
// does for them. Their requests and the replies written for them, a way to
// open a new one, and nothing else. It talks only to /papi on its own domain.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { translate, type Locale, type MessageKey, type Vars } from '../../shared/src/i18n';
import type { PortalAccount, PortalBoard, PortalMe, PortalOrg, PortalTask, PortalTaskDetail } from '../../shared/src/portal';
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';

// ------------------------------------------------------------------ api

class Failure extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

let apiLocale: Locale = 'en';
async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
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
const link = (to: string) => ({
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
    return v === 'tr' || v === 'en' ? v : null;
  } catch {
    return null;
  }
}

interface Ctx {
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
  return (
    <div className="p-root">
      <Portal />
    </div>
  );
}

function Portal() {
  const [boot, setBoot] = useState<Boot>({ kind: 'loading' });
  const [locale, setLocale] = useState<Locale>(() => storedLocale() ?? (/^tr\b/i.test(navigator.language) ? 'tr' : 'en'));
  apiLocale = locale;
  const ctx = useMemo<Ctx>(
    () => ({
      locale,
      t: (k, v) => translate(locale, k, v),
      when: (iso) => new Date(iso).toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
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
    if (!storedLocale()) setLocale(org.locale);
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
      if (hash.get('confirm')) return setBoot({ kind: 'confirm', org, token: hash.get('confirm')! });
      if (hash.get('reset')) return setBoot({ kind: 'reset', org, token: hash.get('reset')! });
      try {
        if (!token) throw new Error('no token');
        const r = await call<{ locale: Locale | null }>('POST', '/auth/verify', { token });
        if (r.locale && !storedLocale()) setLocale(r.locale);
      } catch {
        setBoot({ kind: 'out', org, note: 'link' });
        return;
      }
    }
    try {
      const me = await call<PortalMe>('GET', '/me');
      if (me.user.locale && !storedLocale()) setLocale(me.user.locale);
      setBoot({ kind: 'in', org, me });
    } catch {
      setBoot({ kind: 'out', org, note });
    }
  }, []);
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
  if (boot.kind === 'loading') return <div className="p-center" aria-busy="true" />;
  if (boot.kind === 'missing' || boot.kind === 'error')
    return (
      <div className="p-center">
        <p className="p-muted">{t(boot.kind === 'missing' ? 'portal.missing' : 'errors.server')}</p>
      </div>
    );

  const lang = (
    <button className="p-link" onClick={() => changeLocale(locale === 'tr' ? 'en' : 'tr')}>
      {locale === 'tr' ? t('portal.english') : t('portal.turkish')}
    </button>
  );

  if (boot.kind === 'out') return <SignIn ctx={ctx} org={boot.org} note={boot.note} lang={lang} onIn={() => void start()} />;
  if (boot.kind === 'confirm' || boot.kind === 'reset')
    return <OneStep ctx={ctx} org={boot.org} kind={boot.kind} token={boot.token} lang={lang} onIn={() => void start()} onBack={(n) => setBoot({ kind: 'out', org: boot.org, note: n })} />;

  const { org, me } = boot;
  return (
    <div className="p-shell">
      <header className="p-top">
        <a className="p-brand" {...link('/')}>
          {org.logoUrl ? <img src={org.logoUrl} alt="" /> : <span className="p-brand__mark" aria-hidden="true">{org.name.slice(0, 1)}</span>}
          <span>
            <strong>{org.name}</strong>
            <small>{t('portal.for', { account: me.account.name })}</small>
          </span>
        </a>
        <div className="p-top__me">
          <a className="p-link" {...link('/account')}>
            {me.user.name}
          </a>
          {lang}
          <button
            className="p-link"
            onClick={async () => {
              await call('POST', '/auth/logout').catch(() => undefined);
              void start('out');
            }}
          >
            {t('portal.signOut')}
          </button>
        </div>
      </header>
      <main className="p-main">
        <Route ctx={ctx} me={me} path={path} onSignedOut={signedOut} />
      </main>
      <footer className="p-foot">{t('portal.footer', { company: org.name })}</footer>
    </div>
  );
}

function Route({ ctx, me, path, onSignedOut }: { ctx: Ctx; me: PortalMe; path: string; onSignedOut: (n?: string) => void }) {
  const url = new URL(path, location.origin);
  const task = /^\/t\/([0-9a-f-]{36})$/i.exec(url.pathname)?.[1];
  const boardId = url.searchParams.get('board');
  const board = me.boards.find((b) => b.id === boardId) ?? me.boards[0];
  if (!board) return <Empty>{ctx.t('portal.noBoards')}</Empty>;
  if (task) return <TaskPage key={task} ctx={ctx} id={task} onSignedOut={onSignedOut} />;
  if (url.pathname === '/account') return <AccountPage ctx={ctx} onSignedOut={onSignedOut} />;
  if (url.pathname === '/new') return <NewRequest ctx={ctx} me={me} board={board} onSignedOut={onSignedOut} />;
  return <List ctx={ctx} me={me} board={board} onSignedOut={onSignedOut} />;
}

// --------------------------------------------------------------- sign in

function Brand({ org }: { org: PortalOrg }) {
  return org.logoUrl ? (
    <img className="p-signin__logo" src={org.logoUrl} alt={org.name} />
  ) : (
    <div className="p-brand__mark p-brand__mark--big" aria-hidden="true">
      {org.name.slice(0, 1)}
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
    <div className="p-center">
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
          <div className="p-seg p-seg--full" role="group">
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
            <p className="p-muted">{t('portal.signInLead', { company: org.name })}</p>
            <label className="p-field">
              <span>{t('portal.email')}</span>
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {problem && <Problem text={problem} />}
            <button className="p-btn p-btn--primary" disabled={busy || !email}>
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
            <button className="p-btn p-btn--primary" disabled={busy || code.length !== 6}>
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
            <button className="p-btn p-btn--primary" disabled={busy || !email || !password}>
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
        <div className="p-signin__foot">{lang}</div>
      </div>
    </div>
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
    <div className="p-center">
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
        <div className="p-signin__foot">{lang}</div>
      </form>
    </div>
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
  if (failed) return <Problem text={failed} />;
  if (!data) return <p className="p-muted">{t('common.loading')}</p>;
  const m = data.methods;
  // Ways to sign in that would still work if one passkey or linked account went away.
  const waysLeft = (drop: { passkey?: string; identity?: string }) =>
    (m.email ? 1 : 0) +
    (m.password && data.password.set ? 1 : 0) +
    (m.passkey ? data.passkeys.filter((k) => k.id !== drop.passkey).length : 0) +
    data.identities.filter((i) => i.provider !== drop.identity && m[i.provider]).length;
  return (
    <div className="p-card p-account">
      <a className="p-back" {...link('/')}>
        {t('portal.back')}
      </a>
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
  );
}

// ------------------------------------------------------------------ list

function useLoad<T>(load: () => Promise<T>, deps: unknown[], onSignedOut: (n?: string) => void) {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const reload = useCallback(() => {
    load().then(setData, (e) => {
      if (e instanceof Failure && e.status === 401) onSignedOut('expired');
      else setFailed(e instanceof Failure ? e.message : 'error');
    });
  }, deps);
  useEffect(reload, [reload]);
  return { data, failed, reload, setData };
}

function Status({ board, status }: { board: PortalBoard; status: string }) {
  const col = board.columns.find((c) => c.key === status);
  const i = board.columns.findIndex((c) => c.key === status);
  return (
    <span className="p-status" data-done={col?.done || undefined} data-step={col?.done ? 'done' : i <= 0 ? 'new' : 'doing'}>
      {col?.name ?? status}
    </span>
  );
}

function List({ ctx, me, board, onSignedOut }: { ctx: Ctx; me: PortalMe; board: PortalBoard; onSignedOut: (n?: string) => void }) {
  const { t, when } = ctx;
  const [show, setShow] = useState<'open' | 'done'>('open');
  const { data, failed } = useLoad(() => call<{ tasks: PortalTask[] }>('GET', `/boards/${board.id}/tasks`).then((r) => r.tasks), [board.id], onSignedOut);
  const done = new Set(board.columns.filter((c) => c.done).map((c) => c.key));
  const list = (data ?? []).filter((x) => (show === 'done') === done.has(x.status));
  const openCount = (data ?? []).filter((x) => !done.has(x.status)).length;
  return (
    <>
      {me.boards.length > 1 && (
        <nav className="p-tabs" aria-label={t('portal.boards')}>
          {me.boards.map((b) => (
            <a key={b.id} aria-current={b.id === board.id ? 'page' : undefined} {...link(`/?board=${b.id}`)}>
              {b.name}
            </a>
          ))}
        </nav>
      )}
      <div className="p-head">
        <div>
          <h1>{t('portal.requests')}</h1>
          <p className="p-muted">{t('portal.requestsLead', { company: me.account.name })}</p>
        </div>
        <a className="p-btn p-btn--primary" {...link(`/new?board=${board.id}`)}>
          {t('portal.new')}
        </a>
      </div>
      <div className="p-seg" role="group">
        <button aria-pressed={show === 'open'} onClick={() => setShow('open')}>
          {t('portal.open', { n: openCount })}
        </button>
        <button aria-pressed={show === 'done'} onClick={() => setShow('done')}>
          {t('portal.closed')}
        </button>
      </div>
      {failed && <p className="p-note p-note--error">{failed}</p>}
      {!data && !failed && <p className="p-muted">{t('common.loading')}</p>}
      {data && list.length === 0 && <Empty>{show === 'open' ? t('portal.noOpen') : t('portal.noClosed')}</Empty>}
      <ul className="p-list">
        {list.map((x) => (
          <li key={x.id}>
            <a className="p-item" {...link(`/t/${x.id}`)}>
              <span className="p-item__title">{x.title}</span>
              <Status board={board} status={x.status} />
              <span className="p-item__meta">
                {x.openedBy ? t('portal.openedBy', { name: x.openedBy }) : t('portal.fromTeam')}
                {' · '}
                {t('portal.updated', { when: when(x.updatedAt) })}
                {x.replies > 0 && <> · {t('portal.replies', { n: x.replies })}</>}
                {x.dueDate && <> · {t('portal.due', { when: new Date(x.dueDate).toLocaleDateString(ctx.locale === 'tr' ? 'tr-TR' : 'en-GB', { day: 'numeric', month: 'short' }) })}</>}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="p-empty">{children}</div>;
}

// ------------------------------------------------------------------- new

function NewRequest({ ctx, me, board, onSignedOut }: { ctx: Ctx; me: PortalMe; board: PortalBoard; onSignedOut: (n?: string) => void }) {
  const { t } = ctx;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 3) return setProblem(t('portal.needTitle'));
    setBusy(true);
    setProblem(null);
    try {
      const r = await call<{ task: PortalTask }>('POST', `/boards/${board.id}/tasks`, { title, description });
      go(`/t/${r.task.id}`, true);
    } catch (err) {
      if (err instanceof Failure && err.status === 401) return onSignedOut('expired');
      setProblem(err instanceof Failure ? err.message : t('errors.server'));
      setBusy(false);
    }
  };
  return (
    <form className="p-card p-form" onSubmit={submit}>
      <a className="p-back" {...link(`/?board=${board.id}`)}>
        {t('portal.back')}
      </a>
      <h1>{t('portal.newTitle')}</h1>
      <p className="p-muted">{t('portal.newLead', { account: me.account.name })}</p>
      <label className="p-field">
        <span>{t('portal.title')}</span>
        <input value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} placeholder={t('portal.titlePlaceholder')} />
      </label>
      <label className="p-field">
        <span>{t('portal.details')}</span>
        <textarea rows={7} value={description} maxLength={20000} onChange={(e) => setDescription(e.target.value)} placeholder={t('portal.detailsPlaceholder')} />
      </label>
      {problem && (
        <p className="p-note p-note--error" role="alert">
          {problem}
        </p>
      )}
      <div className="p-actions">
        <button className="p-btn p-btn--primary" disabled={busy}>
          {t('portal.send')}
        </button>
        <span className="p-muted">{t('portal.sendHint')}</span>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ task

function TaskPage({ ctx, id, onSignedOut }: { ctx: Ctx; id: string; onSignedOut: (n?: string) => void }) {
  const { t, when } = ctx;
  const { data, failed, setData } = useLoad(() => call<{ task: PortalTaskDetail }>('GET', `/tasks/${id}`).then((r) => r.task), [id], onSignedOut);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  if (failed) return <Empty>{t('portal.notFound')}</Empty>;
  if (!data) return <p className="p-muted">{t('common.loading')}</p>;
  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    setProblem(null);
    try {
      const r = await call<{ task: PortalTaskDetail }>('POST', `/tasks/${id}/comments`, { body: reply });
      setData(r.task);
      setReply('');
    } catch (err) {
      if (err instanceof Failure && err.status === 401) return onSignedOut('expired');
      setProblem(err instanceof Failure ? err.message : t('errors.server'));
    } finally {
      setBusy(false);
    }
  };
  const fields = data.board.fields;
  return (
    <article className="p-card p-task">
      <a className="p-back" {...link(`/?board=${data.boardId}`)}>
        {t('portal.back')}
      </a>
      <div className="p-task__head">
        <h1>{data.title}</h1>
        <Status board={data.board} status={data.status} />
      </div>
      <dl className="p-meta">
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
            <dd>{new Date(data.dueDate).toLocaleDateString(ctx.locale === 'tr' ? 'tr-TR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</dd>
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
      </dl>
      {data.description && <p className="p-task__desc">{data.description}</p>}
      <section className="p-thread" aria-label={t('portal.conversation')}>
        <h2>{t('portal.conversation')}</h2>
        {data.comments.length === 0 && <p className="p-muted">{t('portal.noReplies')}</p>}
        <ol>
          {data.comments.map((c) => (
            <li key={c.id} className="p-msg" data-side={c.fromCustomer ? 'customer' : 'team'}>
              <div className="p-msg__who">
                <strong>{c.author ?? t('portal.someone')}</strong>
                <span className="p-muted">{when(c.createdAt)}</span>
              </div>
              <p>{c.body.replace(/@\[([^\]]+)\]\([0-9a-f-]{36}\)/g, '@$1')}</p>
            </li>
          ))}
        </ol>
        <form className="p-reply" onSubmit={send}>
          <label className="p-field">
            <span>{t('portal.reply')}</span>
            <textarea rows={3} value={reply} maxLength={10000} onChange={(e) => setReply(e.target.value)} />
          </label>
          {problem && (
            <p className="p-note p-note--error" role="alert">
              {problem}
            </p>
          )}
          <div className="p-actions">
            <button className="p-btn p-btn--primary" disabled={busy || !reply.trim()}>
              {t('portal.sendReply')}
            </button>
          </div>
        </form>
      </section>
    </article>
  );
}
