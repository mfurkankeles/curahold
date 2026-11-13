// The product's cookie/consent banner. Shown until the person makes a choice;
// afterwards it collapses to a small "Privacy choices" control that re-opens the
// manage panel, so a choice can always be changed. Every visible word comes from
// the consent strings (never hard-coded), and the banner mounts once at the app
// root — see the hook reported for App.tsx.
import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n';
import { CONSENT_STRINGS, type ConsentStrings } from '../lib/consentStrings';
import {
  acceptAll,
  chooseConsent,
  emitConsent,
  loadConsent,
  rejectAll,
  saveConsent,
  type ConsentState,
} from '../lib/consent';

type View = 'hidden' | 'banner' | 'manage';

export function ConsentBanner() {
  const { locale } = useI18n();
  const s: ConsentStrings = CONSENT_STRINGS[locale] ?? CONSENT_STRINGS.en!;
  const [view, setView] = useState<View>('hidden');
  const [state, setState] = useState<ConsentState>(() => loadConsent());
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const current = loadConsent();
    setState(current);
    setView(current.decided ? 'hidden' : 'banner');
  }, []);

  const apply = (next: ConsentState) => {
    saveConsent(next);
    setState(next);
    emitConsent(next);
    setView('hidden');
  };
  const openManage = () => {
    setAnalytics(state.analytics);
    setMarketing(state.marketing);
    setView('manage');
  };

  if (view === 'hidden') {
    return (
      <button type="button" className="consent-reopen" aria-label={s.reopenAria} onClick={openManage}>
        {s.reopen}
      </button>
    );
  }

  if (view === 'manage') {
    return (
      <div className="consent-scrim" role="presentation">
        <div className="consent-dialog" role="dialog" aria-modal="true" aria-label={s.manageTitle}>
          <h2 className="consent-dialog__title">{s.manageTitle}</h2>
          <p className="consent-dialog__lead">{s.body}</p>
          <ul className="consent-cats">
            <li className="consent-cat">
              <div className="consent-cat__head">
                <span className="consent-cat__name">{s.necessaryTitle}</span>
                <span className="consent-cat__badge">{s.alwaysOn}</span>
              </div>
              <p className="consent-cat__body">{s.necessaryBody}</p>
            </li>
            <li className="consent-cat">
              <label className="consent-cat__head">
                <span className="consent-cat__name">{s.analyticsTitle}</span>
                <input type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} />
              </label>
              <p className="consent-cat__body">{s.analyticsBody}</p>
            </li>
            <li className="consent-cat">
              <label className="consent-cat__head">
                <span className="consent-cat__name">{s.marketingTitle}</span>
                <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
              </label>
              <p className="consent-cat__body">{s.marketingBody}</p>
            </li>
          </ul>
          <div className="consent-actions">
            <button type="button" className="btn btn--quiet" onClick={() => apply(rejectAll())}>
              {s.rejectAll}
            </button>
            <button type="button" className="btn" onClick={() => apply(chooseConsent({ analytics, marketing }))}>
              {s.save}
            </button>
            <button type="button" className="btn btn--primary" onClick={() => apply(acceptAll())}>
              {s.acceptAll}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="consent-banner" role="region" aria-label={s.bannerAria}>
      <div className="consent-banner__text">
        <strong className="consent-banner__title">{s.title}</strong>
        <p className="consent-banner__body">{s.body}</p>
      </div>
      <div className="consent-actions">
        <button type="button" className="btn btn--quiet" onClick={openManage}>
          {s.manage}
        </button>
        <button type="button" className="btn" onClick={() => apply(rejectAll())}>
          {s.rejectAll}
        </button>
        <button type="button" className="btn btn--primary" onClick={() => apply(acceptAll())}>
          {s.acceptAll}
        </button>
      </div>
    </div>
  );
}
