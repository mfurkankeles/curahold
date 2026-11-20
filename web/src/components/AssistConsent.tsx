// The AI assistant's consent notice (shared/src/assistConsent.ts,
// api/src/assistant/consent.ts): shown at the start of a CuraAI session
// before any question reaches the server. Nothing is ticked in advance;
// Accept and Decline weigh the same; "Not now" (or Esc) asks again next
// session and, meanwhile, questions stay on the device. The server refuses a
// question without a recorded "yes" all the same (consent_required).
//
// Two parts on purpose (KVKK: the aydınlatma and the açık rıza are separate
// acts): first the information, with the full notice linked; then, under
// its own heading, the consent sentence and the two equal buttons. Clicking
// Accept is the distinct affirmative act; reading the notice alone is not.
// The same shape is in the portal (web/portal/Portal.tsx) and the docs chat
// (docs/site/assets/ask.ts).
import { useEffect, useRef, useState } from 'react';
import type { AssistConsentState } from '../../../shared/src/assistConsent';
import { helpLanguageOf } from '../../../shared/src/i18n';
import { get, post } from '../lib/api';
import { formatDate } from '../lib/format';
import { docsHref, docsLink } from '../lib/docs';
import { useI18n } from '../lib/i18n';
import { Icon } from './icons';

/** The notice, then the separate consent with Accept / Decline; Not now closes it. */
export function AssistConsentNotice({ busy, onAnswer, onClose }: { busy: boolean; onAnswer: (granted: boolean) => void; onClose: () => void }) {
  const { t, locale } = useI18n();
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    box.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), onClose());
    const node = box.current;
    node?.addEventListener('keydown', esc);
    return () => node?.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <section ref={box} className="ask__consent" role="dialog" aria-modal="false" aria-labelledby="ask-consent-title" tabIndex={-1} data-test="assist-consent">
      <div className="ask__consent-head">
        <h4 id="ask-consent-title">{t('assistConsent.title')}</h4>
        <button type="button" className="btn btn--quiet ask__consent-btn" onClick={onClose} aria-label={t('assistConsent.close')}>
          <Icon name="close" size={16} />
          <span>{t('assistConsent.close')}</span>
        </button>
      </div>
      <div className="ask__consent-part" role="group" aria-labelledby="ask-consent-notice">
        <h5 id="ask-consent-notice">{t('assistConsent.noticeTitle')}</h5>
        <ul className="ask__consent-list">
          <li>{t('assistConsent.what')}</li>
          <li>{t('assistConsent.why')}</li>
          <li>{t('assistConsent.keep')}</li>
          <li>{t('assistConsent.withdraw')}</li>
        </ul>
        <p>
          <a href={docsHref(`${helpLanguageOf(locale)}/legal-privacy`)} {...docsLink}>
            {t('assistConsent.privacy')}
          </a>
        </p>
      </div>
      <div className="ask__consent-part ask__consent-part--give" role="group" aria-labelledby="ask-consent-give" aria-describedby="ask-consent-text">
        <h5 id="ask-consent-give">{t('assistConsent.consentTitle')}</h5>
        <p id="ask-consent-text">{t('assistConsent.consentText')}</p>
        <div className="ask__consent-actions">
          <button type="button" className="btn ask__consent-btn" disabled={busy} onClick={() => onAnswer(false)}>
            <Icon name="close" size={16} />
            <span>{t('assistConsent.decline')}</span>
          </button>
          <button type="button" className="btn ask__consent-btn" disabled={busy} onClick={() => onAnswer(true)}>
            <Icon name="check" size={16} />
            <span>{t('assistConsent.accept')}</span>
          </button>
        </div>
      </div>
    </section>
  );
}

/**
 * My profile: the person's answer to the assistant's consent notice, with
 * Withdraw (or Give consent).
 */
export function AssistConsentSettings() {
  const { t, locale } = useI18n();
  const [state, setState] = useState<{ available: boolean; consent: AssistConsentState | null } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void get<{ available: boolean; consent: AssistConsentState | null }>('/assist/status').then(setState, () => setState(null));
  }, []);
  // Shown where AI answers are on, and wherever a "yes" is still on record (so it can always be withdrawn).
  if (!state?.consent || (!state.available && state.consent.granted !== true)) return null;
  const c = state.consent;
  const answer = async (granted: boolean) => {
    setBusy(true);
    try {
      const r = await post<{ consent: AssistConsentState }>('/assist/consent', { granted });
      setState({ ...state, consent: r.consent });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="sheet" aria-labelledby="me-ai-consent" data-test="assist-consent-settings">
      <h2 className="sheet__title" id="me-ai-consent">
        <Icon name="lock" size={18} className="icon--lead" />
        {t('assistConsent.settings.title')}
      </h2>
      <p className="sheet__hint">
        {c.granted && c.at ? t('assistConsent.settings.on', { date: formatDate(c.at, locale, { day: 'numeric', month: 'long', year: 'numeric' }) }) : t('assistConsent.settings.off')}
      </p>
      <div>
        <button type="button" className="btn ask__consent-btn" disabled={busy} onClick={() => void answer(!c.granted)}>
          <Icon name={c.granted ? 'close' : 'check'} size={16} />
          <span>{t(c.granted ? 'assistConsent.withdrawAction' : 'assistConsent.settings.give')}</span>
        </button>
      </div>
    </section>
  );
}
