// Sign-in screens: email link, Google / Microsoft, passkey, the new-device code and the second step.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LOCALE_INFO, LOCALES, type Locale } from '../../../shared/src/i18n';
import type { OrgPublic } from '../../../shared/src/model';
import { Mark } from '../components/ui';
import { LegalNotice } from '../components/LegalNotice';
import { SsoSignIn, useSsoInfo } from '../components/SsoSignIn';
import { ApiFailure, post } from '../lib/api';
import { deviceLabel, getDeviceId } from '../lib/device';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import type { SecondStepNeeded } from '../../../shared/src/identity';
import { SecondStepForm } from '../components/SecondStep';
import { passkeysHere, signInWithPasskey } from '../lib/passkey';
import { Icon } from '../components/icons';

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
  // Their colours and lengths are in styles.css (.auth__lines .auth__rail:nth-child…).
  const rails = ['calm', 'soon', 'today', 'late', 'done'];
  const { t } = useI18n();
  return (
    <div className="auth">
      <aside className="auth__side" aria-hidden="true">
        <div className="auth__brand">
          <Mark /> Curahold
        </div>
        <div className="auth__lines">
          {rails.map((state) => (
            <div className="auth__rail" key={state} data-state={state}>
              <span />
              <i />
            </div>
          ))}
          {org.logoUrl && (
            <span className="orglogo orglogo--large">
              <img src={org.logoUrl} alt="" />
            </span>
          )}
          <strong className="auth__org">{org.name}</strong>
        </div>
        <small className="auth__foot">{location.host}</small>
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
        <LegalNotice t={t} />
      </main>
    </div>
  );
}

/** The company's sign-in page: email link, Google, Microsoft, passkey or SSO, as the company allows. */
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
    // `cap`: the seat limit a refused single sign-on ran into (api/src/routes/sso.ts refusedWhy).
    return t(key, { provider, email: params.get('email') ?? '', cap: params.get('cap') ?? '' });
  });
  const [busy, setBusy] = useState(false);
  // A company that requires SSO: its provider is the way in; the emailed link is only for its backup administrators.
  const sso = useSsoInfo(org.slug);
  const ssoOnly = !!sso?.enforced;
  const [backup, setBackup] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ ok: true; devToken?: string; devJoinToken?: string }>('/auth/start', ssoOnly ? { email, backup: true } : { email });
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
        <p className="auth__sub">{ssoOnly ? t('auth.backup.sent', { email: sent.email, org: org.name }) : t('auth.linkSent', { email: sent.email, org: org.name })}</p>
        {org.joinRequests && !ssoOnly && <p className="field__hint">{t('auth.linkSentJoin')}</p>}
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
          <Icon name="mail" size={16} />
          {t('auth.useAnother')}
        </button>
      </AuthFrame>
    );
  }

  const emailForm = (
    <form onSubmit={submit} className="u-display-grid u-gap-12">
      <label className="field">
        <span className="field__label">{t('auth.email')}</span>
        <input className="input" type="email" required autoComplete="email" placeholder={t('auth.emailPlaceholder')} value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <button className="btn btn--primary" disabled={busy}>
        <Icon name="send" size={16} />
        {t('auth.sendLink')}
      </button>
    </form>
  );

  // The ways in depend on the answer (a few milliseconds): nothing that would change under the person's finger.
  if (sso === undefined) {
    return (
      <AuthFrame org={org} onLocale={onLocale}>
        <div>
          <h1 className="auth__title">{t('auth.signInTo', { org: org.name })}</h1>
        </div>
      </AuthFrame>
    );
  }

  if (ssoOnly) {
    return (
      <AuthFrame org={org} onLocale={onLocale}>
        <div>
          <h1 className="auth__title">{backup ? t('auth.backup.title') : t('auth.signInTo', { org: org.name })}</h1>
        </div>
        <p className="auth__sub">{backup ? t('auth.backup.sub') : t('sso.required')}</p>
        {notice && <div className="notice">{notice}</div>}
        {error && <div className="notice notice--error" role="alert">{error}</div>}
        {backup ? emailForm : <SsoSignIn org={org} info={sso} primary />}
        <button type="button" className="btn btn--quiet" onClick={() => (setBackup(!backup), setError(null))}>
          <Icon name="eye" size={16} />
          {backup ? t('auth.backup.back') : t('auth.backup.open')}
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
      {emailForm}
      {(org.loginMethods.google || org.loginMethods.microsoft || passkeysHere()) && <div className="auth__or">{t('auth.or')}</div>}
      {passkeysHere() && (
        <button
          className="btn"
          disabled={busy}
          onClick={async () => {
            setError(null);
            try {
              if (await signInWithPasskey()) location.href = '/home';
            } catch (err) {
              setError(errorText(err, t));
            }
          }}
        >
          <Icon name="key" size={16} />
          {t('sec.passkeySignIn')}
        </button>
      )}
      {org.loginMethods.google && (
        <button className="btn" onClick={() => oauth('google')}>
          <Icon name="key" size={16} />
          {t('auth.google')}
        </button>
      )}
      {org.loginMethods.microsoft && (
        <button className="btn" onClick={() => oauth('microsoft')}>
          <Icon name="key" size={16} />
          {t('auth.microsoft')}
        </button>
      )}
      {/* Enterprise SSO (SAML / OIDC), shown only when the company has it on. */}
      <SsoSignIn org={org} info={sso} />
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
  const [second, setSecond] = useState<SecondStepNeeded | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await post<{ status: 'ok' | 'pending' } | SecondStepNeeded>('/join', { token, name: name.trim(), note: note.trim() || undefined, deviceId: getDeviceId(), deviceLabel: deviceLabel() });
      if (r.status === 'second_step') setSecond(r);
      else if (r.status === 'ok') onJoined();
      else setState('pending');
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  }
  if (second) {
    return (
      <AuthFrame org={org} onLocale={onLocale}>
        <SecondStepForm step={second} orgName={org.name} onDone={onJoined} />
      </AuthFrame>
    );
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
      <form onSubmit={submit} className="u-display-grid u-gap-12">
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
          <Icon name="send" size={16} />
          {t('join.send')}
        </button>
      </form>
    </AuthFrame>
  );
}

/** Finishes a sign-in from an emailed link on this device. */
export function VerifyPage({ org, onLocale, onSignedIn }: { org: OrgPublic; onLocale: (l: Locale) => void; onSignedIn: (notice?: string) => void }) {
  const { t } = useI18n();
  const [state, setState] = useState<'working' | 'code' | 'second' | 'error'>('working');
  const [second, setSecond] = useState<SecondStepNeeded | null>(null);
  const [notice, setNotice] = useState<string | undefined>(undefined);
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
    const after = hash.get('m') === 'signup' ? 'signup' : undefined;
    setNotice(after);
    post<{ status: 'ok' | 'device_code'; challenge?: string; email?: string; devCode?: string; evictedDevices?: number } | SecondStepNeeded>('/auth/verify', {
      token,
      deviceId: getDeviceId(),
      deviceLabel: deviceLabel(),
    })
      .then((r) => {
        if (r.status === 'second_step') {
          setSecond(r);
          setState('second');
        } else if (r.status === 'device_code') {
          setChallenge({ challenge: r.challenge!, email: r.email!, devCode: r.devCode });
          setState('code');
        } else onSignedIn(after);
      })
      .catch((e) => {
        setState('error');
        setError(errorText(e, t));
      });
  }, [onSignedIn, t]);

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    try {
      const r = await post<{ status: 'ok' } | SecondStepNeeded>('/auth/device', { challenge: challenge!.challenge, code, deviceId: getDeviceId(), deviceLabel: deviceLabel() });
      if (r.status === 'second_step') {
        setError('');
        setSecond(r);
        setState('second');
      } else onSignedIn();
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
            <Icon name="arrowLeft" size={16} />
            {t('common.back')}
          </button>
        </>
      )}
      {state === 'second' && second && <SecondStepForm step={second} orgName={org.name} onDone={() => onSignedIn(notice)} />}
      {state === 'code' && challenge && (
        <form onSubmit={submitCode} className="u-display-grid u-gap-12">
          <h1 className="auth__title">{t('auth.deviceTitle')}</h1>
          <p className="auth__sub">{t('auth.deviceBody', { email: challenge.email })}</p>
          {error && <div className="notice notice--error" role="alert">{error}</div>}
          <label className="field">
            <span className="field__label">{t('auth.deviceCode')}</span>
            <input className="input code-input" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </label>
          {import.meta.env.DEV && challenge.devCode && <span className="field__hint">dev: {challenge.devCode}</span>}
          <button className="btn btn--primary"><Icon name="check" size={16} /> {t('auth.deviceConfirm')}</button>
        </form>
      )}
    </AuthFrame>
  );
}

/** The page for an address that is no company. */
export function OrgNotFound() {
  const { t } = useI18n();
  return (
    <div className="center-note">
      <div className="u-display-grid u-gap-8 u-justify-items-center u-max-width-440">
        <Mark size={40} />
        <h1 className="auth__title">{t('auth.orgNotFound')}</h1>
        <p className="muted">{t('auth.orgNotFoundHint')}</p>
      </div>
    </div>
  );
}
