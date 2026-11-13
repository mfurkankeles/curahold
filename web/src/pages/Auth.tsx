// Sign-in screens: email link, Google / Microsoft, and the new-device code.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LOCALE_INFO, LOCALES, type Locale } from '../../../shared/src/i18n';
import type { OrgPublic } from '../../../shared/src/model';
import { Mark } from '../components/ui';
import { ApiFailure, post } from '../lib/api';
import { deviceLabel, getDeviceId } from '../lib/device';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';

function errorText(e: unknown, t: ReturnType<typeof useI18n>['t']) {
  if (e instanceof ApiFailure) return e.status === 0 ? t('errors.network') : e.body.message || t('errors.server');
  return t('errors.server');
}

function LangSwitch({ onLocale }: { onLocale: (l: Locale) => void }) {
  const { locale, t } = useI18n();
  return (
    <div className="auth__langs">
      <select className="select" aria-label={t('nav.language')} value={locale} onChange={(e) => onLocale(e.target.value as Locale)}>
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_INFO[l].name}
          </option>
        ))}
      </select>
    </div>
  );
}

function AuthFrame({ org, children, onLocale }: { org: OrgPublic; children: React.ReactNode; onLocale: (l: Locale) => void }) {
  // The side panel shows the product's one visual idea — time as colour —
  // as a quiet stack of task rails, with the company's own name.
  const rails: [string, number][] = [
    ['var(--calm)', 72],
    ['var(--soon)', 54],
    ['var(--today)', 64],
    ['var(--late)', 38],
    ['var(--done)', 80],
  ];
  return (
    <div className="auth">
      <aside className="auth__side" aria-hidden="true">
        <div className="auth__brand">
          <Mark /> Curahold
        </div>
        <div className="auth__lines">
          {rails.map(([color, width]) => (
            <div className="auth__rail" key={color}>
              <span style={{ background: color }} />
              <i style={{ width: `${width}%` }} />
            </div>
          ))}
          {org.logoUrl && (
            <span className="orglogo orglogo--large">
              <img src={org.logoUrl} alt="" />
            </span>
          )}
          <strong className="auth__org">{org.name}</strong>
        </div>
        <small style={{ color: '#9cc3bb' }}>{location.host}</small>
      </aside>
      <main className="auth__main">
        <div className="auth__card">
          <LangSwitch onLocale={onLocale} />
          {org.logoUrl && (
            <span className="orglogo orglogo--card">
              <img src={org.logoUrl} alt={org.name} />
            </span>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}

export function LoginPage({ org, onLocale, notice }: { org: OrgPublic; onLocale: (l: Locale) => void; notice?: string | null }) {
  const { t } = useI18n();
  const params = new URLSearchParams(location.search);
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [sent, setSent] = useState<{ email: string; devToken?: string; devJoinToken?: string } | null>(null);
  const [error, setError] = useState<string | null>(() => {
    const code = params.get('error');
    if (!code) return null;
    const provider = params.get('provider') === 'microsoft' ? 'Microsoft' : 'Google';
    const key = `errors.${code}` as any;
    return t(key, { provider, email: params.get('email') ?? '' });
  });
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ ok: true; devToken?: string; devJoinToken?: string }>('/auth/start', { email });
      setSent({ email, devToken: r.devToken, devJoinToken: r.devJoinToken });
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  }

  const oauth = (p: 'google' | 'microsoft') => {
    location.href = `/api/auth/oauth/${p}/start?device=${encodeURIComponent(getDeviceId())}`;
  };

  if (sent) {
    return (
      <AuthFrame org={org} onLocale={onLocale}>
        <h1 className="auth__title">{t('auth.checkInbox')}</h1>
        <p className="auth__sub">{t('auth.linkSent', { email: sent.email, org: org.name })}</p>
        {org.joinRequests && <p className="field__hint">{t('auth.linkSentJoin')}</p>}
        {sent.devToken && (
          <a className="btn" href={`/auth/verify#token=${sent.devToken}`}>
            {t('auth.devLink')}
          </a>
        )}
        {sent.devJoinToken && (
          <a className="btn" href={`/join#token=${sent.devJoinToken}`}>
            {t('auth.devLink')}
          </a>
        )}
        <button className="btn btn--quiet" onClick={() => setSent(null)}>
          {t('auth.useAnother')}
        </button>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame org={org} onLocale={onLocale}>
      <div>
        <h1 className="auth__title">{t('auth.signInTo', { org: org.name })}</h1>
      </div>
      <p className="auth__sub">{t('auth.subtitle')}</p>
      {notice && <div className="notice">{notice}</div>}
      {error && <div className="notice notice--error" role="alert">{error}</div>}
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <label className="field">
          <span className="field__label">{t('auth.email')}</span>
          <input className="input" type="email" required autoComplete="email" placeholder={t('auth.emailPlaceholder')} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button className="btn btn--primary" disabled={busy}>
          {t('auth.sendLink')}
        </button>
      </form>
      {(org.loginMethods.google || org.loginMethods.microsoft) && <div className="auth__or">{t('auth.or')}</div>}
      {org.loginMethods.google && (
        <button className="btn" onClick={() => oauth('google')}>
          {t('auth.google')}
        </button>
      )}
      {org.loginMethods.microsoft && (
        <button className="btn" onClick={() => oauth('microsoft')}>
          {t('auth.microsoft')}
        </button>
      )}
      <p className="field__hint">{org.joinRequests ? t('auth.noAccountJoin') : t('auth.noAccountInvite')}</p>
    </AuthFrame>
  );
}

/** The link from "ask to join": name (and a note), then either a request for an admin or straight in. */
export function JoinPage({ org, onLocale, onJoined }: { org: OrgPublic; onLocale: (l: Locale) => void; onJoined: () => void }) {
  const { t } = useI18n();
  const [token] = useState(() => {
    const tok = new URLSearchParams(location.hash.slice(1)).get('token') ?? '';
    history.replaceState(null, '', '/join');
    return tok;
  });
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [state, setState] = useState<'form' | 'pending'>('form');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await post<{ status: 'ok' | 'pending' }>('/join', { token, name: name.trim(), note: note.trim() || undefined, deviceId: getDeviceId(), deviceLabel: deviceLabel() });
      if (r.status === 'ok') onJoined();
      else setState('pending');
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  }
  if (state === 'pending') {
    return (
      <AuthFrame org={org} onLocale={onLocale}>
        <h1 className="auth__title">{t('join.sentTitle')}</h1>
        <p className="auth__sub">{t('join.sentBody', { org: org.name })}</p>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame org={org} onLocale={onLocale}>
      <h1 className="auth__title">{t('join.title', { org: org.name })}</h1>
      <p className="auth__sub">{t('join.sub')}</p>
      {!token && <div className="notice notice--error">{t('errors.invalid_token')}</div>}
      {error && <div className="notice notice--error" role="alert">{error}</div>}
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <label className="field">
          <span className="field__label">{t('join.name')}</span>
          <input className="input" required autoComplete="name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">
            {t('join.note')} <span className="muted">({t('common.optional')})</span>
          </span>
          <textarea className="textarea" rows={2} maxLength={500} value={note} placeholder={t('join.notePlaceholder')} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button className="btn btn--primary" disabled={busy || !token || !name.trim()}>
          {t('join.send')}
        </button>
      </form>
    </AuthFrame>
  );
}

export function VerifyPage({ org, onLocale, onSignedIn }: { org: OrgPublic; onLocale: (l: Locale) => void; onSignedIn: (notice?: string) => void }) {
  const { t } = useI18n();
  const [state, setState] = useState<'working' | 'code' | 'error'>('working');
  const [error, setError] = useState('');
  const [challenge, setChallenge] = useState<{ challenge: string; email: string; devCode?: string } | null>(null);
  const [code, setCode] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const hash = new URLSearchParams(location.hash.slice(1));
    const token = hash.get('token');
    history.replaceState(null, '', '/auth/verify'); // keep the token out of history
    if (!token) {
      setState('error');
      setError(t('errors.invalid_token'));
      return;
    }
    post<{ status: 'ok' | 'device_code'; challenge?: string; email?: string; devCode?: string; evictedDevices?: number }>('/auth/verify', {
      token,
      deviceId: getDeviceId(),
      deviceLabel: deviceLabel(),
    })
      .then((r) => {
        if (r.status === 'device_code') {
          setChallenge({ challenge: r.challenge!, email: r.email!, devCode: r.devCode });
          setState('code');
        } else onSignedIn(hash.get('m') === 'signup' ? 'signup' : undefined);
      })
      .catch((e) => {
        setState('error');
        setError(errorText(e, t));
      });
  }, [onSignedIn, t]);

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    try {
      await post('/auth/device', { challenge: challenge!.challenge, code, deviceId: getDeviceId(), deviceLabel: deviceLabel() });
      onSignedIn();
    } catch (err) {
      setError(errorText(err, t));
    }
  }

  return (
    <AuthFrame org={org} onLocale={onLocale}>
      {state === 'working' && <p className="auth__sub">{t('auth.signingIn')}</p>}
      {state === 'error' && (
        <>
          <div className="notice notice--error" role="alert">{error}</div>
          <button className="btn btn--primary" onClick={() => navigate('/login')}>
            {t('common.back')}
          </button>
        </>
      )}
      {state === 'code' && challenge && (
        <form onSubmit={submitCode} style={{ display: 'grid', gap: 14 }}>
          <h1 className="auth__title">{t('auth.deviceTitle')}</h1>
          <p className="auth__sub">{t('auth.deviceBody', { email: challenge.email })}</p>
          {error && <div className="notice notice--error" role="alert">{error}</div>}
          <label className="field">
            <span className="field__label">{t('auth.deviceCode')}</span>
            <input className="input code-input" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </label>
          {import.meta.env.DEV && challenge.devCode && <span className="field__hint">dev: {challenge.devCode}</span>}
          <button className="btn btn--primary">{t('auth.deviceConfirm')}</button>
        </form>
      )}
    </AuthFrame>
  );
}

export function OrgNotFound() {
  const { t } = useI18n();
  return (
    <div className="center-note">
      <div style={{ display: 'grid', gap: 10, justifyItems: 'center', maxWidth: 440 }}>
        <Mark size={40} />
        <h1 className="auth__title">{t('auth.orgNotFound')}</h1>
        <p className="muted">{t('auth.orgNotFoundHint')}</p>
      </div>
    </div>
  );
}
