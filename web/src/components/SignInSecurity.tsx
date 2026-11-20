// The person's own sign-in security: authenticator app, passkeys and recovery
// codes (on the Devices page, under where they are signed in).
import { useEffect, useState, type FormEvent } from 'react';
import type { MySecurity } from '../../../shared/src/identity';
import { ApiFailure, del, get, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { addPasskey, passkeysHere } from '../lib/passkey';
import { useSaver } from '../lib/saver';
import { relativeTime } from '../lib/time';
import { LoadError, SkeletonRows } from './Empty';
import { RecoveryCodes, TotpSecret } from './SecondStep';
import { Icon } from './icons';

/** The person's own sign-in security: authenticator app, passkeys, recovery codes. */
export function SignInSecurity() {
  const { t } = useI18n();
  const save = useSaver();
  const [data, setData] = useState<MySecurity | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const load = () => {
    setFailed(null);
    return get<MySecurity>('/me/security').then(setData, (e) => setFailed(e instanceof ApiFailure ? e.body.message : t('errors.loadFailed')));
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirmApp(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const r = await post<{ recoveryCodes: string[] }>('/me/security/totp/confirm', { code });
      setSetup(null);
      setCode('');
      setCodes(r.recoveryCodes);
      void load();
    } catch (err) {
      setError(err instanceof ApiFailure ? err.body.message : t('errors.server'));
    }
  }

  return (
    <section aria-labelledby="sec-title">
      <h2 className="sheet__title" id="sec-title">{t('sec.title')}</h2>
      <p className="sheet__hint">{t('sec.hint')}</p>
      {!data && !failed && <SkeletonRows rows={3} label={t('common.loading')} />}
      {failed && <LoadError message={failed} onRetry={() => void load()} />}
      {data?.required && <div className="notice">{t('sec.required')}</div>}
      {codes && <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />}
      {data && !codes && (
        <ul className="keylist">
          <li className="keyrow">
            <div className="keyrow__main">
              <strong>{t('sec.app')}</strong>
              <div className="muted">{data.totp ? t('sec.app.on') : t('sec.app.off')}</div>
            </div>
            {data.totp ? (
              <button
                className="btn btn--small"
                onClick={async () => {
                  if (await save(() => del('/me/security/totp'))) void load();
                }}
              >
                <Icon name="trash" size={16} />
                {t('sec.app.remove')}
              </button>
            ) : (
              !setup && (
                <button className="btn btn--small btn--primary" onClick={() => void save(async () => setSetup(await post('/me/security/totp', {})), false)}>
                  <Icon name="sliders" size={16} />
                  {t('sec.app.setup')}
                </button>
              )
            )}
          </li>
          {setup && (
            <li className="keyrow">
              <form className="signup-form keyrow__main" onSubmit={confirmApp}>
                <p className="sheet__hint">{t('sec.enroll.scan')}</p>
                <TotpSecret {...setup} />
                {error && <div className="notice notice--error" role="alert">{error}</div>}
                <label className="field">
                  <span className="field__label">{t('sec.second.code')}</span>
                  <input className="input code-input" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
                </label>
                <div className="toolbar">
                  <button className="btn btn--primary"><Icon name="check" size={16} /> {t('common.confirm')}</button>
                  <button type="button" className="btn btn--quiet" onClick={() => setSetup(null)}>
                    <Icon name="close" size={16} />
                    {t('common.cancel')}
                  </button>
                </div>
              </form>
            </li>
          )}
          <li className="keyrow">
            <div className="keyrow__main">
              <strong>{t('sec.passkeys')}</strong>
              <div className="muted">{passkeysHere() ? t('sec.passkeys.hint') : t('sec.passkeys.unsupported')}</div>
            </div>
            {passkeysHere() && (
              <button
                className="btn btn--small"
                onClick={async () => {
                  let added = false;
                  if (await save(async () => (added = await addPasskey()), false)) {
                    if (!added) setError(t('sec.cancelled'));
                    void load();
                  }
                }}
              >
                <Icon name="plus" size={16} />
                {t('sec.passkeys.add')}
              </button>
            )}
          </li>
          {data.passkeys.map((k) => (
            <li className="keyrow" key={k.id}>
              <div className="keyrow__main">
                <div>{k.name || t('sec.passkeys')}</div>
                <div className="muted">{k.lastUsedAt ? t('sec.passkeys.lastUsed', { when: relativeTime(k.lastUsedAt, t) }) : t('sec.passkeys.never')}</div>
              </div>
              <button
                className="btn btn--small"
                onClick={async () => {
                  if (await save(() => del(`/me/security/passkeys/${k.id}`))) void load();
                }}
              >
                <Icon name="trash" size={16} />
                {t('common.delete')}
              </button>
            </li>
          ))}
          {(data.totp || data.passkeys.length > 0) && (
            <li className="keyrow">
              <div className="keyrow__main">
                <strong>{t('sec.recovery')}</strong>
                <div className="muted">{t('sec.recovery.left', { n: data.recoveryLeft })}</div>
              </div>
              <button className="btn btn--small" onClick={() => void save(async () => setCodes((await post<{ recoveryCodes: string[] }>('/me/security/recovery-codes', {})).recoveryCodes), false)}>
                <Icon name="refresh" size={16} />
                {t('sec.recovery.renew')}
              </button>
            </li>
          )}
        </ul>
      )}
      {error && !setup && <p className="field__hint">{error}</p>}
    </section>
  );
}
