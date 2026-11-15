// "Confirm it's you": shown when a dangerous change (roles, API keys, SSO,
// exports, removing someone, sign-in security) needs a fresh confirmation.
// Mounted once; lib/api.ts sends the change again after a confirmation.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiFailure, onReauth, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { passkeyAnswer, passkeysHere } from '../lib/passkey';
import { Dialog } from './ui';

type Options = { methods: ('totp' | 'passkey' | 'recovery' | 'email')[]; passkey?: { challengeId: string; options: unknown } };

export function ReauthDialog() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<Options | null>(null);
  const [mode, setMode] = useState<'totp' | 'recovery' | 'email' | 'none'>('totp');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const settle = useRef<((ok: boolean) => void) | null>(null);

  useEffect(() => {
    onReauth(
      () =>
        new Promise<boolean>((resolve) => {
          settle.current?.(false);
          settle.current = resolve;
          setOpts(null);
          setCode('');
          setError('');
          setSent(false);
          setOpen(true);
          post<Options>('/me/confirm/options', {}).then(
            (o) => {
              setOpts(o);
              setMode(o.methods.includes('totp') ? 'totp' : o.methods.includes('email') ? 'email' : o.methods.includes('recovery') ? 'recovery' : 'none');
            },
            (e) => setError(e instanceof ApiFailure ? e.body.message : t('errors.server')),
          );
        }),
    );
    return () => onReauth(null);
  }, [t]);

  function close(ok: boolean) {
    setOpen(false);
    settle.current?.(ok);
    settle.current = null;
  }
  async function confirm(body: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      await post('/me/confirm', body);
      close(true);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.body.message : t('errors.server'));
    } finally {
      setBusy(false);
    }
  }
  async function usePasskey() {
    const fresh = await post<Options>('/me/confirm/options', {}).catch(() => null);
    const a = fresh?.passkey ? await passkeyAnswer(fresh.passkey as { challengeId: string; options: unknown }) : null;
    if (!a) setError(t('sec.cancelled'));
    else await confirm({ passkey: a });
  }
  async function sendEmail() {
    setError('');
    try {
      await post('/me/confirm/email', {});
      setSent(true);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.body.message : t('errors.server'));
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    void confirm(mode === 'totp' ? { code } : mode === 'email' ? { emailCode: code } : { recoveryCode: code });
  }

  if (!open) return null;
  const has = (m: Options['methods'][number]) => !!opts?.methods.includes(m);
  const codeShown = mode === 'totp' || mode === 'recovery' || (mode === 'email' && sent);
  return (
    <Dialog title={t('sec.confirm.title')} onClose={() => close(false)}>
      <form className="signup-form" onSubmit={submit}>
        <p className="sheet__hint">{t('sec.confirm.body')}</p>
        {error && <div className="notice notice--error" role="alert">{error}</div>}
        {opts && mode === 'email' && !sent && (
          <>
            <p>{t('sec.confirm.emailBody')}</p>
            <button type="button" className="btn btn--primary" onClick={() => void sendEmail()}>
              {t('sec.confirm.sendEmail')}
            </button>
          </>
        )}
        {opts && mode === 'email' && sent && <p className="field__hint">{t('sec.confirm.emailSent')}</p>}
        {opts && codeShown && (
          <>
            <label className="field">
              <span className="field__label">{mode === 'recovery' ? t('sec.second.recoveryCode') : t('sec.second.code')}</span>
              {mode === 'recovery' ? (
                <input className="input" autoComplete="off" spellCheck={false} maxLength={20} required value={code} onChange={(e) => setCode(e.target.value)} />
              ) : (
                <input className="input code-input" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
              )}
            </label>
            <button className="btn btn--primary" disabled={busy}>
              {t('common.confirm')}
            </button>
          </>
        )}
        {has('passkey') && passkeysHere() && (
          <button type="button" className="btn" onClick={() => void usePasskey()}>
            {t('sec.second.usePasskey')}
          </button>
        )}
        {has('recovery') && has('totp') && (
          <button
            type="button"
            className="btn btn--quiet"
            onClick={() => {
              setCode('');
              setMode(mode === 'totp' ? 'recovery' : 'totp');
            }}
          >
            {mode === 'totp' ? t('sec.second.useRecovery') : t('sec.second.useCode')}
          </button>
        )}
      </form>
    </Dialog>
  );
}
