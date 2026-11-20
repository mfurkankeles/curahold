// The product's cookie/consent notice. It exists only when a measurement id is
// configured (see hasMeasurement) — with none, nothing non-essential can load, so
// there is nothing to ask and nothing is rendered. When something is configured
// it is a compact, non-modal notice that never covers a primary action: a card
// above the bottom tab bar on a phone, a small corner card on a desktop. The
// choices can be re-opened any time from the profile page (PrivacyLine), so no
// floating button stays on screen. Every visible word comes from the consent
// strings, and the notice mounts once at the app root.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n';
import { CONSENT_STRINGS, type ConsentStrings } from '../lib/consentStrings';
import { categoriesInUse, envConfig, hasMeasurement } from '../lib/analytics';
import { bannerText, consentEvent, sha256Hex } from '../../../shared/src/consent/core';
import { sendConsentEvent } from '../../../shared/src/consent/browser';
import { post } from '../lib/api';
import {
  acceptAll,
  chooseConsent,
  emitConsent,
  loadConsent,
  onConsentOpen,
  openConsentChoices,
  rejectAll,
  saveConsent,
  type ConsentState,
} from '../lib/consent';
import { Icon } from './icons';

const useStrings = (): ConsentStrings => {
  const { locale } = useI18n();
  return CONSENT_STRINGS[locale] ?? CONSENT_STRINGS.en!;
};

/** The quiet line on a person's own profile page: re-opens the choices, or says there are none. */
export function PrivacyLine() {
  const s = useStrings();
  if (!hasMeasurement(envConfig())) return <p className="consent-line">{s.noneNote}</p>;
  return (
    <p className="consent-line">
      <button type="button" className="consent-line__btn" aria-label={s.reopenAria} onClick={openConsentChoices}>
        {s.reopen}
      </button>
    </p>
  );
}

type View = 'hidden' | 'banner' | 'manage';

/**
 * The consent banner and choices dialog. Nothing optional loads before a choice; the choice is recorded as evidence (ADR 0014).
 */
export function ConsentBanner({ signedIn = false }: { signedIn?: boolean }) {
  const s = useStrings();
  const { locale } = useI18n();
  const inUse = categoriesInUse(envConfig());
  const active = inUse.analytics || inUse.marketing;
  const [view, setView] = useState<View>('hidden');
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    setView(loadConsent().decided ? 'hidden' : 'banner');
  }, [active]);

  const openManage = () => {
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const current = loadConsent();
    setAnalytics(current.analytics);
    setMarketing(current.marketing);
    setView('manage');
  };
  useEffect(() => (active ? onConsentOpen(openManage) : undefined), [active]);

  // The phone's helper button stands above the notice (see consent.css), so the notice
  // publishes its own height while it is on screen.
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (view === 'banner' && card.current) {
      root.style.setProperty('--consent-h', `${card.current.offsetHeight}px`);
      root.dataset.consent = '';
    }
    return () => {
      root.style.removeProperty('--consent-h');
      delete root.dataset.consent;
    };
  }, [view, s]);

  // The panel is a real dialog: focus moves in, Tab stays inside, Escape closes it
  // without making a choice, and focus goes back to where it came from.
  useEffect(() => {
    if (view !== 'manage') return;
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setView(loadConsent().decided ? 'hidden' : 'banner');
        return;
      }
      if (e.key !== 'Tab' || !dialog.current) return;
      const items = Array.from(dialog.current.querySelectorAll<HTMLElement>('button, input')).filter((el) => !el.hasAttribute('disabled'));
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const at = document.activeElement;
      if (e.shiftKey && (at === first || at === dialog.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && at === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      returnTo.current?.focus?.();
    };
  }, [view]);

  if (!active || view === 'hidden') return null;

  const apply = (choose: (previous: ConsentState) => ConsentState) => {
    const next = choose(loadConsent());
    // A category not in use on this build is never recorded as granted.
    next.analytics &&= inUse.analytics;
    next.marketing &&= inUse.marketing;
    saveConsent(next);
    emitConsent(next);
    setView('hidden');
    // The record (version, hash of the words shown, country from the edge): best effort.
    void sha256Hex(bannerText(s as unknown as Record<string, string>, inUse)).then((textHash) => {
      const event = consentEvent(next, { inUse, textHash, locale, surface: 'app' });
      if (signedIn) void post('/consent', { ...event, source: 'app' }).catch(() => undefined);
      else sendConsentEvent('/api/consent-event', event);
    });
  };

  if (view === 'manage') {
    return (
      <div className="consent-scrim" role="presentation">
        <div ref={dialog} tabIndex={-1} className="consent-dialog" role="dialog" aria-modal="true" aria-labelledby="consent-dlg-title">
          <h2 id="consent-dlg-title" className="consent-dialog__title">{s.manageTitle}</h2>
          <p className="consent-dialog__lead">{s.body}</p>
          <ul className="consent-cats">
            <li className="consent-cat">
              <div className="consent-cat__head">
                <span className="consent-cat__name">{s.necessaryTitle}</span>
                <span className="consent-cat__badge">{s.alwaysOn}</span>
              </div>
              <p className="consent-cat__body">{s.necessaryBody}</p>
            </li>
            {inUse.analytics && (
            <li className="consent-cat">
              <label className="consent-cat__head">
                <span className="consent-cat__name">{s.analyticsTitle}</span>
                <input type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} />
              </label>
              <p className="consent-cat__body">{s.analyticsBody}</p>
            </li>
            )}
            {inUse.marketing && (
            <li className="consent-cat">
              <label className="consent-cat__head">
                <span className="consent-cat__name">{s.marketingTitle}</span>
                <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
              </label>
              <p className="consent-cat__body">{s.marketingBody}</p>
            </li>
            )}
          </ul>
          <div className="consent-actions">
            <button type="button" className="btn" onClick={() => apply((p) => rejectAll(undefined, p))}>
              <Icon name="close" size={16} />
              {s.rejectAll}
            </button>
            <button type="button" className="btn" onClick={() => apply((p) => chooseConsent({ analytics, marketing }, undefined, p))}>
              <Icon name="check" size={16} />
              {s.save}
            </button>
            <button type="button" className="btn" onClick={() => apply((p) => acceptAll(undefined, p))}>
              <Icon name="check" size={16} />
              {s.acceptAll}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={card} className="consent-banner" data-tabbar={signedIn || undefined} role="region" aria-labelledby="consent-title">
      <div className="consent-banner__text">
        <strong id="consent-title" className="consent-banner__title">{s.title}</strong>
        <p className="consent-banner__body">{s.body}</p>
      </div>
      <div className="consent-actions">
        <button type="button" className="btn btn--quiet" onClick={openManage}>
          <Icon name="sliders" size={16} />
          {s.manage}
        </button>
        <button type="button" className="btn" onClick={() => apply((p) => rejectAll(undefined, p))}>
          <Icon name="close" size={16} />
          {s.rejectAll}
        </button>
        <button type="button" className="btn" onClick={() => apply((p) => acceptAll(undefined, p))}>
          <Icon name="check" size={16} />
          {s.acceptAll}
        </button>
      </div>
    </div>
  );
}
