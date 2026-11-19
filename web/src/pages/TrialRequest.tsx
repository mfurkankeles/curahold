// "Try it free" on the central address: a request for a free trial, decided by
// Curahold's owner — not an instant company. Five short steps (work e-mail with a
// one-time code, about you, the company, the trial wanted, consent), answers
// kept on this device until sent, consent blocks chosen by the country picked
// and the country the connection comes from (shared/src/compliance/trialConsent.ts).
//
// The earlier instant sign-up is still here behind SIGNUP_MODE=instant: the
// server says which path is on (GET /trial/config) and the old screens load then.
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { bcp47Of, helpLanguageOf, LOCALE_INFO, LOCALES, type Locale, type MessageKey } from '../../../shared/src/i18n';
import {
  COMPANY_SIZES,
  CONTACT_TIMES,
  COUNTRIES,
  CUSTOMER_COUNTS,
  HEARD_FROM,
  INDUSTRIES,
  PROBLEMS,
  TIMELINES,
  TOOL_KINDS,
  TRIAL_FORM,
} from '../../../shared/src/trialForm';
import { trialConsent, type TrialConsentBlock } from '../../../shared/src/compliance/trialConsent';
import { TRIAL_DEFAULTS, TRIAL_DEPARTMENTS, type TrialDepartment } from '../../../shared/src/trialRequest';
import { Mark } from '../components/ui';
import { ApiFailure, get, post } from '../lib/api';
import { docsHref, docsLink } from '../lib/docs';
import { useI18n } from '../lib/i18n';
import { useLocation } from '../lib/router';
import '../surfaces/trial.css';
import { useHumanCheck } from '../lib/humanCheck';
import { LegalNotice } from '../components/LegalNotice';

const LegacySignup = lazy(() => import('./Signup').then((m) => ({ default: m.SignupApp })));

interface Config {
  mode: 'request' | 'instant';
  ipCountry: string | null;
  stamp: string;
  /** Cloudflare Turnstile's site key when it is on (lib/humanCheck.tsx). */
  turnstile?: string | null;
}

/** Which screen the central address shows: the trial request, or the earlier instant sign-up. */
export function TrialEntry({ onLocale }: { onLocale: (l: Locale) => void }) {
  const { path } = useLocation();
  const [config, setConfig] = useState<Config | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    get<Config>('/trial/config').then(setConfig, () => setFailed(true));
  }, []);
  if (path === '/signup/unsubscribe') return <Unsubscribe onLocale={onLocale} />;
  // An old e-mail link of the instant sign-up still works while that path is on.
  if (config?.mode === 'instant' || (failed && path === '/signup/verify')) {
    return (
      <Suspense fallback={null}>
        <LegacySignup onLocale={onLocale} turnstile={config?.turnstile} />
      </Suspense>
    );
  }
  return <TrialRequest onLocale={onLocale} config={config} failed={failed} />;
}

// ------------------------------------------------------------------ the draft

type ToolKind = (typeof TOOL_KINDS)[number];
interface Draft {
  email: string;
  freeMailNote: string;
  name: string;
  title: string;
  phone: string;
  linkedinUrl: string;
  language: Locale | '';
  contactTime: string;
  company: string;
  website: string;
  country: string;
  city: string;
  industry: string;
  companySize: string;
  customersManaged: string;
  departments: TrialDepartment[];
  seats: string;
  split: boolean;
  seatsByDepartment: Partial<Record<TrialDepartment, string>>;
  problems: string[];
  problemText: string;
  tools: Record<ToolKind | 'other', string>;
  timeline: string;
  heardFrom: string;
  consents: string[];
}
const EMPTY: Draft = {
  email: '',
  freeMailNote: '',
  name: '',
  title: '',
  phone: '',
  linkedinUrl: '',
  language: '',
  contactTime: '',
  company: '',
  website: '',
  country: '',
  city: '',
  industry: '',
  companySize: '',
  customersManaged: '',
  departments: [],
  seats: '5',
  split: false,
  seatsByDepartment: {},
  problems: [],
  problemText: '',
  tools: { crm: '', tasks: '', accounting: '', bi: '', other: '' },
  timeline: '',
  heardFrom: '',
  consents: [],
};
// The answers stay on this device until they are sent (functional storage; cleared on sending).
const DRAFT_KEY = 'curahold.trial.draft';
// The proof of the address lives as long as the browser tab (two hours at most, signed by the server).
const TICKET_KEY = 'curahold.trial.ticket';
const readDraft = (): Draft => {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
    return d && typeof d === 'object' ? { ...EMPTY, ...d, tools: { ...EMPTY.tools, ...(d.tools ?? {}) }, consents: [] } : EMPTY;
  } catch {
    return EMPTY;
  }
};
const readTicket = (): { ticket: string; email: string; freeMail: boolean } | null => {
  try {
    return JSON.parse(sessionStorage.getItem(TICKET_KEY) ?? 'null');
  } catch {
    return null;
  }
};

// A language spoken mostly in one country suggests that country when the connection does not say.
const HOME_COUNTRY: Partial<Record<Locale, string>> = { tr: 'TR', ja: 'JP', ko: 'KR', 'zh-Hans': 'CN', 'zh-Hant': 'TW', he: 'IL' };

const STEPS: MessageKey[] = ['trial.step.email', 'trial.step.you', 'trial.step.company', 'trial.step.use', 'trial.step.consent'];
type Errors = Record<string, string>;

const errorText = (e: unknown, t: (k: MessageKey, v?: Record<string, string | number>) => string) =>
  e instanceof ApiFailure ? (e.status === 0 ? t('errors.network') : e.body.message || t('errors.server')) : t('errors.server');

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE = /^\+?[0-9 ()./-]{6,30}$/;
const LINKEDIN = /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/\S+$/i;
const WEBSITE = /^(https?:\/\/)?[^\s/$.?#][^\s]*\.[^\s]{2,}$/i;

function Frame({ step, onLocale, children }: { step: number; onLocale: (l: Locale) => void; children: ReactNode }) {
  const { t, locale } = useI18n();
  return (
    <div className="auth trial">
      <aside className="auth__side">
        <div className="auth__brand">
          <Mark /> Curahold
        </div>
        <div className="auth__lines">
          <strong className="auth__org">{t('trial.side.title')}</strong>
          <ol className="trial__rail">
            {STEPS.map((key, i) => (
              <li key={key} data-state={i < step ? 'done' : i === step ? 'now' : 'next'} aria-current={i === step ? 'step' : undefined}>
                <span aria-hidden="true">{i + 1}</span>
                {t(key)}
              </li>
            ))}
          </ol>
        </div>
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
          {children}
        </div>
        <LegalNotice t={t} />
      </main>
    </div>
  );
}

/** A labelled control with its hint and its error, tied together for screen readers. */
function Field({
  id,
  label,
  optional,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="field" data-invalid={error ? '' : undefined}>
      <label className="field__label" htmlFor={id}>
        {label}
        {optional && <span className="trial__opt"> · {t('trial.optional')}</span>}
      </label>
      {children}
      {hint && (
        <span className="field__hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="trial__error" id={`${id}-error`}>
          {error}
        </span>
      )}
    </div>
  );
}
const described = (id: string, hint: boolean, error?: string) => ({
  id,
  'aria-invalid': error ? true : undefined,
  'aria-describedby': [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined,
});

function TrialRequest({ onLocale, config, failed }: { onLocale: (l: Locale) => void; config: Config | null; failed: boolean }) {
  const { t, locale } = useI18n();
  const [d, setD] = useState<Draft>(readDraft);
  const [step, setStep] = useState(() => (readTicket() ? 1 : 0));
  const [proof, setProof] = useState(readTicket);
  const [codeSent, setCodeSent] = useState<{ freeMail: boolean; devCode?: string } | null>(null);
  const [code, setCode] = useState('');
  const [hp, setHp] = useState('');
  // Fill time and, when on, Cloudflare's check before the code e-mail goes out (this form has its own honeypot below).
  const human = useHumanCheck(config?.turnstile, { label: t('trial.hp'), locale, honeypot: false });
  const [errors, setErrors] = useState<Errors>({});
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ ref: string; email: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  // Keep the answers on this device while they are being written.
  useEffect(() => {
    if (done) return;
    const keep = { ...d, consents: undefined };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(keep));
    } catch {
      /* storage full or off: the form still works */
    }
  }, [d, done]);
  // The country: the one the connection comes from, or the one the language suggests.
  useEffect(() => {
    if (d.country || !config) return;
    const guess = config.ipCountry ?? HOME_COUNTRY[locale] ?? '';
    if (COUNTRIES.includes(guess)) setD((x) => ({ ...x, country: guess }));
  }, [config, locale, d.country]);
  // A new step: its heading takes the focus, so a screen reader starts there.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    heading.current?.focus();
  }, [step, done]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const countryNames = useMemo(() => {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([bcp47Of(locale)], { type: 'region' });
    } catch {
      names = null;
    }
    return COUNTRIES.map((c) => ({ code: c, name: names?.of(c) ?? c })).sort((a, b) => a.name.localeCompare(b.name, bcp47Of(locale)));
  }, [locale]);
  const blocks = useMemo(() => trialConsent(d.country, config?.ipCountry ?? null, locale).blocks, [d.country, config?.ipCountry, locale]);
  const totalSeats = d.split ? d.departments.reduce((n, dep) => n + (Number(d.seatsByDepartment[dep]) || 0), 0) : Number(d.seats) || 0;

  function check(s: number): Errors {
    const e: Errors = {};
    const need = (k: string, v: string) => {
      if (!v.trim()) e[k] = t('trial.err.required');
    };
    if (s === 0 && proof?.freeMail) need('freeMailNote', d.freeMailNote);
    if (s === 1) {
      need('name', d.name);
      if (d.phone.trim() && !PHONE.test(d.phone.trim())) e.phone = t('trial.err.phone');
      if (d.linkedinUrl.trim() && !LINKEDIN.test(d.linkedinUrl.trim())) e.linkedinUrl = t('trial.err.linkedin');
    }
    if (s === 2) {
      need('company', d.company);
      need('country', d.country);
      if (d.website.trim() && !WEBSITE.test(d.website.trim())) e.website = t('trial.err.website');
    }
    if (s === 3) {
      if (!d.departments.length) e.departments = t('trial.err.departments');
      if (!(totalSeats >= 1 && totalSeats <= TRIAL_FORM.maxSeats && Number.isInteger(totalSeats))) e.seats = t('trial.err.seats', { max: TRIAL_FORM.maxSeats });
    }
    if (s === 4) for (const b of blocks) if (b.required && !d.consents.includes(b.key)) e[`consent-${b.key}`] = t('trial.err.consent');
    return e;
  }
  /** Check the step; on a problem, say so above the form and move to the first field that needs a look. */
  function passes(s: number) {
    const e = check(s);
    setErrors(e);
    const keys = Object.keys(e);
    if (keys.length) {
      requestAnimationFrame(() => document.getElementById(`trial-${keys[0]}`)?.focus());
      return false;
    }
    return true;
  }

  async function sendCode(ev?: FormEvent) {
    ev?.preventDefault();
    setProblem('');
    if (!EMAIL.test(d.email.trim())) {
      setErrors({ email: t('trial.err.email') });
      document.getElementById('trial-email')?.focus();
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      setCodeSent(await post('/trial/code', { email: d.email.trim(), locale, ...human.proof(), ...(hp ? { hp } : {}) }));
      setCode('');
      requestAnimationFrame(() => document.getElementById('trial-code')?.focus());
    } catch (err) {
      setProblem(errorText(err, t));
    } finally {
      human.reset();
      setBusy(false);
    }
  }
  async function verifyCode(ev: FormEvent) {
    ev.preventDefault();
    setProblem('');
    setBusy(true);
    try {
      const v = await post<{ ticket: string; freeMail: boolean }>('/trial/verify', { email: d.email.trim(), code: code.trim() });
      const p = { ticket: v.ticket, email: d.email.trim().toLowerCase(), freeMail: v.freeMail };
      sessionStorage.setItem(TICKET_KEY, JSON.stringify(p));
      setProof(p);
      setCodeSent(null);
      if (!v.freeMail) setStep(1);
    } catch (err) {
      setProblem(err instanceof ApiFailure && err.code === 'invalid_token' ? t('trial.code.wrong') : errorText(err, t));
    } finally {
      setBusy(false);
    }
  }
  function forget() {
    sessionStorage.removeItem(TICKET_KEY);
    setProof(null);
    setCodeSent(null);
    setStep(0);
  }
  function next(ev: FormEvent) {
    ev.preventDefault();
    setProblem('');
    if (!passes(step)) return;
    if (step < 4) setStep(step + 1);
    else void submit();
  }
  async function submit() {
    if (!proof || !config) return;
    setBusy(true);
    try {
      const seatsByDepartment = d.split
        ? Object.fromEntries(d.departments.map((dep) => [dep, Number(d.seatsByDepartment[dep]) || 0]).filter(([, n]) => (n as number) > 0))
        : {};
      const utm = Object.fromEntries([...new URLSearchParams(location.search)].filter(([k, v]) => /^utm_[a-z]{2,10}$/.test(k) && v.length <= 120));
      const source = new URLSearchParams(location.search).get('from');
      const r = await post<{ ref: string }>('/trial/submit', {
        ticket: proof.ticket,
        stamp: config.stamp,
        ...(hp ? { hp } : {}),
        uiLocale: locale,
        name: d.name,
        phone: d.phone,
        title: d.title,
        linkedinUrl: d.linkedinUrl,
        company: d.company,
        website: d.website,
        country: d.country,
        city: d.city,
        industry: d.industry || null,
        companySize: d.companySize || null,
        seats: totalSeats,
        seatsByDepartment,
        departments: d.departments,
        problems: d.problems,
        problemText: d.problemText,
        tools: d.tools,
        customersManaged: d.customersManaged || null,
        timeline: d.timeline || null,
        heardFrom: d.heardFrom || null,
        language: d.language || locale,
        contactTime: d.contactTime || null,
        source: source && /^[a-z0-9-]{1,30}$/.test(source) ? source : null,
        utm,
        consents: d.consents,
        freeMailNote: proof.freeMail ? d.freeMailNote : null,
      });
      localStorage.removeItem(DRAFT_KEY);
      sessionStorage.removeItem(TICKET_KEY);
      setDone({ ref: r.ref, email: proof.email });
    } catch (err) {
      if (err instanceof ApiFailure && err.code === 'invalid_token') {
        // The proof of the address ran out: prove it again, the answers stay.
        forget();
        setProblem(t('trial.code.wrong'));
      } else setProblem(errorText(err, t));
    } finally {
      setBusy(false);
    }
  }

  const sel = (id: keyof Draft, label: string, values: readonly string[], labelOf: (v: string) => string, optional = true) => (
    <Field id={`trial-${id}`} label={label} optional={optional} error={errors[id]}>
      <select className="select" {...described(`trial-${id}`, false, errors[id])} value={d[id] as string} onChange={(e) => set(id, e.target.value as never)}>
        <option value="">{t('trial.choose')}</option>
        {values.map((v) => (
          <option key={v} value={v}>
            {labelOf(v)}
          </option>
        ))}
      </select>
    </Field>
  );
  const input = (id: keyof Draft, label: string, opts: { optional?: boolean; hint?: string; type?: string; autoComplete?: string; dir?: 'ltr' } = {}) => (
    <Field id={`trial-${id}`} label={label} optional={opts.optional} hint={opts.hint} error={errors[id]}>
      <input
        className="input"
        type={opts.type ?? 'text'}
        dir={opts.dir}
        autoComplete={opts.autoComplete}
        required={!opts.optional}
        {...described(`trial-${id}`, !!opts.hint, errors[id])}
        value={d[id] as string}
        onChange={(e) => set(id, e.target.value as never)}
      />
    </Field>
  );
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const summary = Object.values(errors);

  if (done) {
    return (
      <Frame step={5} onLocale={onLocale}>
        <h1 className="auth__title" ref={heading} tabIndex={-1}>
          {t('trial.done.title')}
        </h1>
        <p className="auth__sub" role="status">
          {t('trial.done.text', { ref: done.ref, email: done.email })}
        </p>
        <a className="btn" href="/demo/">
          {t('trial.done.demo')}
        </a>
      </Frame>
    );
  }

  return (
    <Frame step={step} onLocale={onLocale}>
      <p className="trial__progress">{t('trial.progress', { n: step + 1, total: STEPS.length })}</p>
      <h1 className="auth__title" ref={heading} tabIndex={-1}>
        {step === 0 ? t('trial.title') : t(STEPS[step])}
      </h1>
      {step === 0 && <p className="auth__sub">{t('trial.lead')}</p>}
      {failed && (
        <div className="notice notice--error" role="alert">
          {t('errors.network')}
        </div>
      )}
      {problem && (
        <div className="notice notice--error" role="alert">
          {problem}
        </div>
      )}
      {summary.length > 1 && (
        <div className="notice notice--error" role="alert">
          {t('trial.err.summary')}
          <ul className="trial__list">
            {summary.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      {/* People never see or reach this field; a robot filling every input does. */}
      <div className="trial__hp" aria-hidden="true">
        <label>
          {t('trial.hp')}
          <input tabIndex={-1} autoComplete="off" name="company_fax" value={hp} onChange={(e) => setHp(e.target.value)} />
        </label>
      </div>

      {step === 0 && !proof && !codeSent && (
        <form className="trial__form" onSubmit={sendCode} noValidate>
          {input('email', t('trial.email.label'), { type: 'email', autoComplete: 'email', dir: 'ltr' })}
          {human.field}
          <button className="btn btn--primary" disabled={busy || !config}>
            {t('trial.email.send')}
          </button>
        </form>
      )}
      {step === 0 && !proof && codeSent && (
        <form className="trial__form" onSubmit={verifyCode} noValidate>
          <p className="field__hint" role="status">
            {t('trial.code.sent', { email: d.email.trim(), minutes: TRIAL_FORM.codeMinutes })}
          </p>
          <Field id="trial-code" label={t('trial.code.label')}>
            <input
              className="input trial__code"
              id="trial-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              dir="ltr"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
          {codeSent.devCode && <p className="field__hint">dev: {codeSent.devCode}</p>}
          <button className="btn btn--primary" disabled={busy || code.length !== 6}>
            {t('trial.code.verify')}
          </button>
          <div className="trial__row">
            <button type="button" className="btn btn--quiet" onClick={() => void sendCode()} disabled={busy}>
              {t('trial.code.again')}
            </button>
            <button type="button" className="btn btn--quiet" onClick={forget}>
              {t('trial.code.change')}
            </button>
          </div>
        </form>
      )}
      {step === 0 && proof && (
        <form className="trial__form" onSubmit={next} noValidate>
          <p className="trial__ok" role="status">
            {t('trial.code.verified', { email: proof.email })}
          </p>
          {proof.freeMail && (
            <div className="notice">
              <strong>{t('trial.free.title')}</strong>
              <p className="trial__para">{t('trial.free.text')}</p>
              <Field id="trial-freeMailNote" label={t('trial.free.label')} error={errors.freeMailNote}>
                <textarea
                  className="input"
                  rows={2}
                  maxLength={300}
                  {...described('trial-freeMailNote', false, errors.freeMailNote)}
                  value={d.freeMailNote}
                  onChange={(e) => set('freeMailNote', e.target.value)}
                />
              </Field>
            </div>
          )}
          <div className="trial__row">
            <button type="button" className="btn btn--quiet" onClick={forget}>
              {t('trial.code.change')}
            </button>
            <button className="btn btn--primary">{t('trial.next')}</button>
          </div>
        </form>
      )}

      {step > 0 && (
        <form className="trial__form" onSubmit={next} noValidate>
          {step === 1 && (
            <>
              {input('name', t('trial.f.name'), { autoComplete: 'name' })}
              {input('title', t('trial.f.title'), { optional: true, autoComplete: 'organization-title' })}
              {input('phone', t('trial.f.phone'), { optional: true, type: 'tel', autoComplete: 'tel', hint: t('trial.hint.phone'), dir: 'ltr' })}
              {input('linkedinUrl', t('trial.f.linkedin'), { optional: true, type: 'url', hint: t('trial.hint.linkedin'), dir: 'ltr' })}
              <div className="trial__pair">
                {sel('language', t('trial.f.language'), LOCALES, (l) => LOCALE_INFO[l as Locale].name)}
                {sel('contactTime', t('trial.f.contactTime'), CONTACT_TIMES, (v) => t(`trial.contact.${v}` as MessageKey))}
              </div>
            </>
          )}
          {step === 2 && (
            <>
              {input('company', t('trial.f.company'), { autoComplete: 'organization' })}
              {input('website', t('trial.f.website'), { optional: true, type: 'url', autoComplete: 'url', dir: 'ltr' })}
              <div className="trial__pair">
                {sel(
                  'country',
                  t('trial.f.country'),
                  countryNames.map((c) => c.code),
                  (c) => countryNames.find((x) => x.code === c)?.name ?? c,
                  false,
                )}
                {input('city', t('trial.f.city'), { optional: true, autoComplete: 'address-level2' })}
              </div>
              {sel('industry', t('trial.f.industry'), INDUSTRIES, (v) => t(`trial.industry.${v}` as MessageKey))}
              <div className="trial__pair">
                {sel('companySize', t('trial.f.size'), COMPANY_SIZES, (v) => t('trial.size.people', { range: v }))}
                {sel('customersManaged', t('trial.f.customers'), CUSTOMER_COUNTS, (v) => t('trial.customers.count', { range: v }))}
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <fieldset className="trial__set" aria-describedby={errors.departments ? 'trial-departments-error' : undefined}>
                <legend className="field__label">{t('trial.f.departments')}</legend>
                <div className="trial__chips">
                  {TRIAL_DEPARTMENTS.map((dep, i) => (
                    <label key={dep} className="chiptoggle" data-on={d.departments.includes(dep) ? '' : undefined}>
                      <input
                        type="checkbox"
                        id={i === 0 ? 'trial-departments' : undefined}
                        checked={d.departments.includes(dep)}
                        onChange={() => set('departments', toggle(d.departments, dep) as TrialDepartment[])}
                      />
                      {t(`trial.dept.${dep}` as MessageKey)}
                    </label>
                  ))}
                </div>
                {errors.departments && (
                  <span className="trial__error" id="trial-departments-error">
                    {errors.departments}
                  </span>
                )}
              </fieldset>
              {!d.split &&
                input('seats', t('trial.f.seats'), {
                  type: 'number',
                  hint: `${t('trial.hint.seats', { cap: TRIAL_DEFAULTS.seatCap })} ${t('trial.hint.viewers')}`,
                })}
              {d.departments.length > 1 && (
                <label className="checkbox">
                  <input type="checkbox" checked={d.split} onChange={(e) => set('split', e.target.checked)} />
                  {t('trial.f.split')}
                </label>
              )}
              {d.split && (
                <fieldset className="trial__set">
                  <legend className="field__label">
                    {t('trial.f.seats')}: {totalSeats}
                  </legend>
                  <div className="trial__pair">
                    {d.departments.map((dep) => (
                      <Field key={dep} id={`trial-seats-${dep}`} label={t(`trial.dept.${dep}` as MessageKey)}>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          id={`trial-seats-${dep}`}
                          value={d.seatsByDepartment[dep] ?? ''}
                          onChange={(e) => set('seatsByDepartment', { ...d.seatsByDepartment, [dep]: e.target.value })}
                        />
                      </Field>
                    ))}
                  </div>
                  {errors.seats && (
                    <span className="trial__error" id="trial-seats">
                      {errors.seats}
                    </span>
                  )}
                </fieldset>
              )}
              <fieldset className="trial__set">
                <legend className="field__label">
                  {t('trial.f.problems')}
                  <span className="trial__opt"> · {t('trial.optional')}</span>
                </legend>
                <div className="trial__chips">
                  {PROBLEMS.map((p) => (
                    <label key={p} className="chiptoggle" data-on={d.problems.includes(p) ? '' : undefined}>
                      <input type="checkbox" checked={d.problems.includes(p)} onChange={() => set('problems', toggle(d.problems, p))} />
                      {t(`trial.problem.${p}` as MessageKey)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Field id="trial-problemText" label={t('trial.f.problemText')} optional>
                <textarea
                  className="input"
                  id="trial-problemText"
                  rows={2}
                  maxLength={1000}
                  value={d.problemText}
                  onChange={(e) => set('problemText', e.target.value)}
                />
              </Field>
              <fieldset className="trial__set">
                <legend className="field__label">
                  {t('trial.f.tools')}
                  <span className="trial__opt"> · {t('trial.optional')}</span>
                  <span className="field__hint">{t('trial.hint.tools')}</span>
                </legend>
                <div className="trial__pair">
                  {[...TOOL_KINDS, 'other' as const].map((k) => (
                    <Field key={k} id={`trial-tools-${k}`} label={t(`trial.tools.${k}` as MessageKey)}>
                      <input
                        className="input"
                        {...described(`trial-tools-${k}`, false)}
                        maxLength={200}
                        value={d.tools[k]}
                        onChange={(e) => set('tools', { ...d.tools, [k]: e.target.value })}
                      />
                    </Field>
                  ))}
                </div>
              </fieldset>
              <div className="trial__pair">
                {sel('timeline', t('trial.f.timeline'), TIMELINES, (v) => t(`trial.timeline.${v}` as MessageKey))}
                {sel('heardFrom', t('trial.f.heard'), HEARD_FROM, (v) => t(`trial.heard.${v}` as MessageKey))}
              </div>
            </>
          )}
          {step === 4 && <Consents blocks={blocks} chosen={d.consents} errors={errors} onChange={(c) => set('consents', c)} />}
          <p className="field__hint">{t('trial.saved')}</p>
          <div className="trial__row">
            <button type="button" className="btn btn--quiet" onClick={() => (setErrors({}), setStep(step - 1))}>
              {t('trial.back')}
            </button>
            <button className="btn btn--primary" disabled={busy}>
              {step === 4 ? (busy ? t('trial.sending') : t('trial.send')) : t('trial.next')}
            </button>
          </div>
        </form>
      )}
    </Frame>
  );
}

/** The notices (read, never ticked), the consents the law asks for, then marketing — separate and optional. */
function Consents({ blocks, chosen, errors, onChange }: { blocks: TrialConsentBlock[]; chosen: string[]; errors: Errors; onChange: (c: string[]) => void }) {
  const { t, locale } = useI18n();
  // Each notice opens its page in the help centre's Legal section (Türkiye: its own aydınlatma metni).
  const page = (b: TrialConsentBlock) => docsHref(`${helpLanguageOf(locale)}/${b.page}`);
  const flip = (key: string) => onChange(chosen.includes(key) ? chosen.filter((k) => k !== key) : [...chosen, key]);
  // A text not yet in the interface language comes in its country's language with English next to it.
  const words = (b: TrialConsentBlock) =>
    b.shown.map((s, i) => (
      <span key={s.lang} lang={bcp47Of(s.lang)} dir="auto" className={i ? 'trial__also' : undefined}>
        {i > 0 && ' '}
        {s.text}
      </span>
    ));
  const notices = blocks.filter((b) => b.kind === 'notice');
  const capacity = notices.find((b) => b.key === 'ALL.A');
  const marketing = blocks.filter((b) => b.kind === 'marketing');
  return (
    <div className="trial__consents">
      <h2 className="trial__h2">{t('trial.consent.title')}</h2>
      {notices
        .filter((b) => b !== capacity)
        .map((b) => (
          <p key={b.key} className="trial__notice" data-block={b.key} data-version={b.version}>
            {words(b)}{' '}
            <a href={page(b)} {...docsLink}>
              {t('trial.consent.read')}
            </a>
          </p>
        ))}
      {blocks
        .filter((b) => b.kind === 'consent')
        .map((b) => {
          const id = `trial-consent-${b.key}`;
          const err = errors[`consent-${b.key}`];
          return (
            <div key={b.key} className="trial__consent" data-block={b.key} data-version={b.version}>
              <label className="check">
                <input type="checkbox" {...described(id, false, err)} checked={chosen.includes(b.key)} onChange={() => flip(b.key)} />
                <span>
                  {words(b)} {b.required && <em className="trial__opt">({t('trial.consent.required')})</em>}
                </span>
              </label>
              {err && (
                <span className="trial__error" id={`${id}-error`}>
                  {err}
                </span>
              )}
            </div>
          );
        })}
      {capacity && (
        <p className="trial__capacity" data-block={capacity.key} data-version={capacity.version}>
          {words(capacity)}
        </p>
      )}
      {marketing.length > 0 && (
        <fieldset className="trial__set">
          <legend className="field__hint">{t('trial.consent.marketingNote')}</legend>
          {marketing.map((b) => (
            <label key={b.key} className="check" data-block={b.key} data-version={b.version}>
              <input type="checkbox" checked={chosen.includes(b.key)} onChange={() => flip(b.key)} />
              <span>{words(b)}</span>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}

/** The link in every e-mail: marketing permission taken back with one button (not on opening, so a mail scanner cannot do it). */
function Unsubscribe({ onLocale }: { onLocale: (l: Locale) => void }) {
  const { t, locale } = useI18n();
  const [state, setState] = useState<'ask' | 'done' | 'bad'>('ask');
  const token = new URLSearchParams(location.hash.slice(1)).get('t');
  async function stop() {
    try {
      await post('/trial/unsubscribe', { t: token, locale });
      setState('done');
    } catch {
      setState('bad');
    }
  }
  return (
    <Frame step={-1} onLocale={onLocale}>
      <h1 className="auth__title">{t('trial.unsubscribe.title')}</h1>
      {state === 'ask' && token && (
        <button className="btn btn--primary" onClick={() => void stop()}>
          {t('trial.unsubscribe.button')}
        </button>
      )}
      {state === 'done' && <p role="status">{t('trial.unsubscribe.done')}</p>}
      {(state === 'bad' || !token) && <p role="alert">{t('trial.unsubscribe.bad')}</p>}
    </Frame>
  );
}
