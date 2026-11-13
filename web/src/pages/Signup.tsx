// Self-serve sign-up on the central address (app.curahold.com): confirm a
// work email, name the company, pick its address and a starting template —
// then straight into the company, signed in, with the setup wizard open.
import { docsHref, docsLink } from '../lib/docs';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LOCALE_INFO, LOCALES, type Locale, type MessageKey } from '../../../shared/src/i18n';
import { pick, TEMPLATES, TEMPLATE_KEYS, type TemplateKey } from '../../../shared/src/templates';
import { Mark } from '../components/ui';
import { ApiFailure, get, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate, useLocation } from '../lib/router';
import { CURRENCIES } from './Settings';

const TIMEZONES = ['Europe/Istanbul', 'Europe/London', 'Europe/Berlin', 'Europe/Amsterdam', 'Europe/Paris', 'Europe/Madrid', 'Europe/Warsaw', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Singapore', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'UTC'];
const browserTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};
const currencyFor = (tz: string, locale: Locale) =>
  tz === 'Europe/Istanbul' || locale === 'tr' ? 'TRY' : tz === 'Europe/London' ? 'GBP' : tz.startsWith('Europe/') ? 'EUR' : tz === 'Asia/Dubai' ? 'AED' : tz === 'Asia/Riyadh' ? 'SAR' : 'USD';

function Frame({ children, onLocale }: { children: React.ReactNode; onLocale: (l: Locale) => void }) {
  const { t, locale } = useI18n();
  const steps: [string, MessageKey][] = [
    ['var(--done)', 'signup.rail.company'],
    ['var(--calm)', 'signup.rail.chat'],
    ['var(--calm)', 'signup.rail.accounts'],
    ['var(--calm)', 'signup.rail.people'],
    ['var(--calm)', 'signup.rail.rules'],
  ];
  return (
    <div className="auth">
      <aside className="auth__side">
        <div className="auth__brand">
          <Mark /> Curahold
        </div>
        <div className="auth__lines signup__rail">
          <strong className="auth__org">{t('signup.sideTitle')}</strong>
          {steps.map(([color, key], i) => (
            <div className="auth__rail" key={key}>
              <span style={{ background: color }} />
              <em>{t(key)}</em>
              <small>{[2, 3, 4, 4, 2][i]}′</small>
            </div>
          ))}
        </div>
        <small style={{ color: '#9cc3bb' }}>{t('signup.sideFoot')}</small>
      </aside>
      <main className="auth__main">
        <div className="auth__card">
          <div className="auth__langs">
            <select className="select" aria-label={t('nav.language')} value={locale} onChange={(e) => onLocale(e.target.value as Locale)}>
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_INFO[l].name}
                </option>
              ))}
            </select>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

const errorText = (e: unknown, t: (k: MessageKey, v?: any) => string) =>
  e instanceof ApiFailure ? (e.status === 0 ? t('errors.network') : e.body.message || t('errors.server')) : t('errors.server');

export function SignupApp({ onLocale }: { onLocale: (l: Locale) => void }) {
  const { path } = useLocation();
  return path === '/signup/verify' ? <Details onLocale={onLocale} /> : <Start onLocale={onLocale} />;
}

function Start({ onLocale }: { onLocale: (l: Locale) => void }) {
  const { t, locale } = useI18n();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<{ devToken?: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setSent(await post('/signup/start', { email: email.trim(), locale }));
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Frame onLocale={onLocale}>
      {sent ? (
        <>
          <h1 className="auth__title">{t('auth.checkInbox')}</h1>
          <p className="auth__sub">{t('signup.sent', { email })}</p>
          {sent.devToken && (
            <a className="btn" href={`/signup/verify#token=${sent.devToken}`}>
              {t('auth.devLink')}
            </a>
          )}
          <button className="btn btn--quiet" onClick={() => setSent(null)}>
            {t('auth.useAnother')}
          </button>
        </>
      ) : (
        <>
          <h1 className="auth__title">{t('signup.title')}</h1>
          <p className="auth__sub">{t('signup.sub')}</p>
          {error && <div className="notice notice--error" role="alert">{error}</div>}
          <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
            <label className="field">
              <span className="field__label">{t('auth.email')}</span>
              <input className="input" type="email" required autoComplete="email" placeholder={t('auth.emailPlaceholder')} value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <button className="btn btn--primary" disabled={busy}>
              {t('signup.start')}
            </button>
          </form>
          <p className="field__hint">{t('signup.noCard')}</p>
          <p className="field__hint">{t('signup.privacy')}</p>
          {/* The terms and privacy policy, in the help pages' Legal section. */}
          <p className="field__hint">
            {t('signup.agree')}{' '}
            <a href={docsHref(`${locale}/legal-terms`)} {...docsLink}>
              {t('legal.terms')}
            </a>{' '}
            {t('legal.and')}{' '}
            <a href={docsHref(`${locale}/legal-privacy`)} {...docsLink}>
              {t('legal.privacy')}
            </a>
            .
          </p>
        </>
      )}
    </Frame>
  );
}

interface Verified {
  ticket: string;
  email: string;
  domain: string | null;
  suggestedName: string;
  suggestedSlug: string;
  existing: { name: string; url: string; joinRequests: boolean }[];
}

function Details({ onLocale }: { onLocale: (l: Locale) => void }) {
  const { t, locale } = useI18n();
  const [v, setV] = useState<Verified | null>(null);
  const [fatal, setFatal] = useState('');
  const [company, setCompany] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState<{ available: boolean; reason?: string } | null>(null);
  const [name, setName] = useState('');
  const [tz, setTz] = useState(browserTz());
  const [currency, setCurrency] = useState(currencyFor(browserTz(), locale));
  const [currencyTouched, setCurrencyTouched] = useState(false);
  useEffect(() => {
    if (!currencyTouched) setCurrency(currencyFor(tz, locale));
  }, [tz, locale, currencyTouched]);
  const [template, setTemplate] = useState<TemplateKey>('customer_success');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const base = location.host.replace(/^app\./, '');

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(location.hash.slice(1)).get('token') ?? '';
    history.replaceState(null, '', '/signup/verify');
    post<Verified>('/signup/verify', { token })
      .then((r) => {
        setV(r);
        setCompany(r.suggestedName);
        setSlug(r.suggestedSlug);
      })
      .catch((e) => setFatal(errorText(e, t)));
  }, [t]);

  useEffect(() => {
    if (!slug) {
      setSlugState(null);
      return;
    }
    const id = setTimeout(() => {
      get<{ available: boolean; reason?: string }>(`/signup/slug?slug=${encodeURIComponent(slug)}`)
        .then(setSlugState)
        .catch(() => setSlugState(null));
    }, 250);
    return () => clearTimeout(id);
  }, [slug]);

  const slugify = (s: string) =>
    s
      .toLocaleLowerCase('tr-TR')
      .replace(/ı/g, 'i')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!v) return;
    setBusy(true);
    setError('');
    try {
      const r = await post<{ url: string }>('/signup/complete', { ticket: v.ticket, company: company.trim(), slug, name: name.trim(), locale, timezone: tz, currency, template });
      location.href = r.url;
    } catch (err) {
      setError(errorText(err, t));
      setBusy(false);
    }
  }

  if (fatal) {
    return (
      <Frame onLocale={onLocale}>
        <div className="notice notice--error" role="alert">{fatal}</div>
        <button className="btn btn--primary" onClick={() => navigate('/signup')}>
          {t('signup.again')}
        </button>
      </Frame>
    );
  }
  if (!v) {
    return (
      <Frame onLocale={onLocale}>
        <p className="auth__sub">{t('common.loading')}</p>
      </Frame>
    );
  }
  const zones = TIMEZONES.includes(tz) ? TIMEZONES : [tz, ...TIMEZONES];
  const slugMsg = !slugState ? '' : slugState.available ? t('signup.slugFree') : t(`signup.slug.${slugState.reason ?? 'format'}` as MessageKey);
  return (
    <Frame onLocale={onLocale}>
      <h1 className="auth__title">{t('signup.detailsTitle')}</h1>
      <p className="auth__sub">{t('signup.verified', { email: v.email })}</p>
      {v.existing.length > 0 && (
        <div className="notice">
          {v.existing.map((o) => (
            <p key={o.url} style={{ margin: 0 }}>
              {t('signup.colleagues', { name: o.name })}{' '}
              <a href={`${o.url}/login?email=${encodeURIComponent(v.email)}`}>{o.joinRequests ? t('signup.askToJoin') : t('signup.openIt')}</a>
            </p>
          ))}
        </div>
      )}
      {error && <div className="notice notice--error" role="alert">{error}</div>}
      <form onSubmit={submit} className="signup-form">
        <label className="field">
          <span className="field__label">{t('signup.company')}</span>
          <input
            className="input"
            required
            maxLength={120}
            value={company}
            onChange={(e) => {
              setCompany(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
          />
        </label>
        <label className="field">
          <span className="field__label">{t('signup.address')}</span>
          <span className="slug-input">
            <input
              className="input"
              required
              value={slug}
              aria-describedby="slug-msg"
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugify(e.target.value));
              }}
            />
            <span className="slug-input__suffix">.{base}</span>
          </span>
          <span id="slug-msg" className={slugState && !slugState.available ? 'error-text' : 'field__hint'}>
            {slugMsg || t('signup.addressHint')}
          </span>
        </label>
        <label className="field">
          <span className="field__label">{t('signup.yourName')}</span>
          <input className="input" required autoComplete="name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="form__row">
          <label className="field">
            <span className="field__label">{t('settings.company.timezone')}</span>
            <select className="select" value={tz} onChange={(e) => setTz(e.target.value)}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">{t('settings.company.currency')}</span>
            <select className="select" value={currency} onChange={(e) => { setCurrency(e.target.value); setCurrencyTouched(true); }}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="templates">
          <legend className="field__label">{t('signup.template')}</legend>
          {TEMPLATE_KEYS.map((k) => (
            <label key={k} className="choice" data-on={template === k ? 'true' : undefined}>
              <input type="radio" name="template" checked={template === k} onChange={() => setTemplate(k)} />
              <span>
                <strong>{pick(TEMPLATES[k].name, locale)}</strong>
                <span className="muted">{pick(TEMPLATES[k].description, locale)}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <button className="btn btn--primary" disabled={busy || !slugState?.available || !company.trim() || !name.trim()}>
          {busy ? t('signup.creating') : t('signup.create')}
        </button>
        <p className="field__hint">{t('signup.trial')}</p>
      </form>
    </Frame>
  );
}
