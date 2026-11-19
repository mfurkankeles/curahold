// The one step between an approved trial and work: the company's administrator
// reads and accepts the terms of service and the data processing agreement, with
// one click on one sentence (the server keeps the version, the sentence's hash,
// who, when and from where). Anyone else in the company waits for that.
import { useEffect, useState } from 'react';
import { helpLanguageOf, LOCALE_INFO, LOCALES, type Locale } from '../../../shared/src/i18n';
import type { Me } from '../../../shared/src/model';
import { AGREEMENTS, CONSENT_DRAFT, type AgreementDoc } from '../../../shared/src/trialForm';
import { Mark } from '../components/ui';
import { ApiFailure, get, post } from '../lib/api';
import { docsHref, docsLink } from '../lib/docs';
import { useI18n } from '../lib/i18n';
import '../surfaces/trial.css';

interface Due {
  doc: AgreementDoc;
  version: string;
}

export function AgreementsGate({ me, onLocale, onAccepted }: { me: Me; onLocale: (l: Locale) => void; onAccepted: () => void }) {
  const { t, locale } = useI18n();
  const admin = me.user.perms.includes('org.manage');
  const [due, setDue] = useState<Due[] | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    get<{ due: Due[] }>('/agreements').then(
      (r) => setDue(r.due),
      () => setError(t('errors.server')),
    );
  }, [t]);
  async function accept() {
    if (!due?.length) return onAccepted();
    setBusy(true);
    setError('');
    try {
      await post('/agreements/accept', { locale, docs: [...new Set(due.map((d) => d.doc))] });
      onAccepted();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.body.message || t('errors.server') : t('errors.server'));
      setBusy(false);
    }
  }
  const name = (doc: AgreementDoc) => (doc === 'terms' ? t('agreements.terms') : t('agreements.dpa'));
  return (
    <div className="auth trial">
      <aside className="auth__side">
        <div className="auth__brand">
          <Mark /> Curahold
        </div>
        <strong className="auth__org">{me.org.name}</strong>
        <small className="auth__foot">{t('trial.side.foot')}</small>
      </aside>
      <main className="auth__main">
        <div className="auth__card trial__card">
          <div className="auth__langs">
            <select className="select" aria-label={t('nav.language')} value={locale} onChange={(e) => onLocale(e.target.value as Locale)}>
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_INFO[l].name}
                </option>
              ))}
            </select>
          </div>
          <h1 className="auth__title">{t('agreements.title')}</h1>
          {!admin ? (
            <>
              <p className="auth__sub">{t('agreements.waiting', { org: me.org.name })}</p>
              <button className="btn" onClick={() => void post('/auth/logout').finally(() => location.assign('/login'))}>
                {t('auth.signOut')}
              </button>
            </>
          ) : (
            <>
              <p className="auth__sub">{t('agreements.lead', { org: me.org.name })}</p>
              {error && (
                <div className="notice notice--error" role="alert">
                  {error}
                </div>
              )}
              <ul className="agree__docs">
                {(due ?? []).map((d) => (
                  <li key={`${d.doc}@${d.version}`}>
                    <span>
                      {name(d.doc)}
                      <small>{t('agreements.version', { version: d.version })}</small>
                    </span>
                    <a className="btn btn--small" href={docsHref(`${helpLanguageOf(locale)}/${AGREEMENTS[d.doc].docs}`)} {...docsLink}>
                      {t('agreements.open')}
                    </a>
                  </li>
                ))}
              </ul>
              {CONSENT_DRAFT && <p className="field__hint">{t('agreements.draft')}</p>}
              <label className="check">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                <span>{t('agreements.statement', { terms: AGREEMENTS.terms.version, dpa: AGREEMENTS.dpa.version })}</span>
              </label>
              <button className="btn btn--primary" disabled={!agree || busy || due === null} onClick={() => void accept()}>
                {t('agreements.accept')}
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
