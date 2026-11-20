// The second step of signing in (authenticator app, passkey or recovery code),
// setting one up when the company requires it, and showing recovery codes once.
import { useState, type FormEvent } from 'react';
import type { SecondStepNeeded } from '../../../shared/src/identity';
import { ApiFailure, post } from '../lib/api';
import { getDeviceId } from '../lib/device';
import { useI18n } from '../lib/i18n';
import { passkeyAnswer, passkeysHere } from '../lib/passkey';
import { Icon } from './icons';

type T = ReturnType<typeof useI18n>['t'];
const failure = (e: unknown, t: T) => (e instanceof ApiFailure ? e.body.message || t('errors.server') : t('errors.server'));

/** Ten one-time codes, shown once, with a way to copy them. */
export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <div className="signup-form">
      <h2 className="sheet__title">{t('sec.codes.title')}</h2>
      <p className="sheet__hint">{t('sec.codes.body')}</p>
      <ul className="keylist" aria-label={t('sec.recovery')}>
        {codes.map((c) => (
          <li className="keyrow" key={c}>
            <code>{c}</code>
          </li>
        ))}
      </ul>
      <div className="toolbar">
        <button
          type="button"
          className="btn"
          onClick={() => {
            void navigator.clipboard?.writeText(codes.join('\n')).then(() => setCopied(true), () => undefined);
          }}
        >
          <Icon name="copy" size={16} />
          {copied ? t('sec.codes.copied') : t('sec.codes.copy')}
        </button>
        <button type="button" className="btn btn--primary" onClick={onDone}>
          <Icon name="check" size={16} />
          {t('sec.codes.done')}
        </button>
      </div>
    </div>
  );
}

/** A secret to add to an authenticator app: typed in, or opened straight in the app on a phone. */
export function TotpSecret({ secret, uri }: { secret: string; uri: string }) {
  const { t } = useI18n();
  return (
    <div className="signup-form">
      <div className="field">
        <span className="field__label">{t('sec.enroll.key')}</span>
        <ul className="keylist">
          <li className="keyrow">
            <code className="keyrow__main" data-secret={secret}>
              {secret.replace(/(.{4})/g, '$1 ').trim()}
            </code>
          </li>
        </ul>
      </div>
      <a className="btn" href={uri}>
        {t('sec.enroll.open')}
      </a>
    </div>
  );
}

/** The second sign-in step: authenticator code, passkey or recovery code, or setting one up when required. */
export function SecondStepForm({ step, orgName, onDone }: { step: SecondStepNeeded; orgName: string; onDone: () => void }) {
  const { t } = useI18n();
  const passkey = step.methods.includes('passkey') && passkeysHere();
  const [mode, setMode] = useState<'totp' | 'recovery'>(step.methods.includes('totp') || step.enroll ? 'totp' : 'recovery');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const base = { token: step.token, deviceId: getDeviceId() };

  async function finish(extra: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      const r = await post<{ status: 'ok'; recoveryCodes?: string[] }>('/auth/second', { ...base, ...extra });
      if (r.recoveryCodes) setCodes(r.recoveryCodes);
      else onDone();
    } catch (e) {
      setError(failure(e, t));
    } finally {
      setBusy(false);
    }
  }
  async function usePasskey() {
    setError('');
    try {
      const a = await passkeyAnswer(await post('/auth/second/passkey', base));
      if (!a) setError(t('sec.cancelled'));
      else await finish({ passkey: a });
    } catch (e) {
      setError(failure(e, t));
    }
  }
  async function startSetup() {
    setError('');
    try {
      setSetup(await post('/auth/second/setup', base));
    } catch (e) {
      setError(failure(e, t));
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    void finish(mode === 'totp' ? { code } : { recoveryCode: code });
  }

  if (codes) return <RecoveryCodes codes={codes} onDone={onDone} />;
  // Only a passkey: one button.
  if (!step.enroll && !step.methods.some((m) => m !== 'passkey')) {
    return (
      <div className="signup-form">
        <h1 className="auth__title">{t('sec.second.title')}</h1>
        <p className="auth__sub">{t('sec.second.passkeyBody')}</p>
        {error && <div className="notice notice--error" role="alert">{error}</div>}
        <button className="btn btn--primary" disabled={!passkey} onClick={() => void usePasskey()}>
          <Icon name="key" size={16} />
          {t('sec.second.usePasskey')}
        </button>
        {!passkey && <p className="field__hint">{t('sec.passkeys.unsupported')}</p>}
      </div>
    );
  }
  if (step.enroll && !setup) {
    return (
      <div className="signup-form">
        <h1 className="auth__title">{t('sec.enroll.title')}</h1>
        <p className="auth__sub">{t('sec.enroll.body', { org: orgName })}</p>
        {error && <div className="notice notice--error" role="alert">{error}</div>}
        <button className="btn btn--primary" onClick={() => void startSetup()}>
          <Icon name="sliders" size={16} />
          {t('sec.app.setup')}
        </button>
      </div>
    );
  }
  return (
    <form className="signup-form" onSubmit={submit}>
      <h1 className="auth__title">{step.enroll ? t('sec.enroll.title') : t('sec.second.title')}</h1>
      <p className="auth__sub">{setup ? t('sec.enroll.scan') : mode === 'totp' ? t('sec.second.body') : t('sec.second.recoveryBody')}</p>
      {setup && <TotpSecret {...setup} />}
      {error && <div className="notice notice--error" role="alert">{error}</div>}
      <label className="field">
        <span className="field__label">{mode === 'totp' ? t('sec.second.code') : t('sec.second.recoveryCode')}</span>
        {mode === 'totp' ? (
          <input className="input code-input" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        ) : (
          <input className="input" autoComplete="off" spellCheck={false} maxLength={20} required value={code} onChange={(e) => setCode(e.target.value)} />
        )}
      </label>
      <button className="btn btn--primary" disabled={busy}>
        <Icon name="arrowRight" size={16} />
        {t('sec.second.continue')}
      </button>
      {passkey && (
        <button type="button" className="btn" onClick={() => void usePasskey()}>
          <Icon name="key" size={16} />
          {t('sec.second.usePasskey')}
        </button>
      )}
      {!step.enroll && step.methods.includes('recovery') && (
        <button
          type="button"
          className="btn btn--quiet"
          onClick={() => {
            setCode('');
            setMode(mode === 'totp' ? 'recovery' : 'totp');
          }}
        >
          <Icon name="key" size={16} />
          {mode === 'totp' ? t('sec.second.useRecovery') : t('sec.second.useCode')}
        </button>
      )}
    </form>
  );
}
