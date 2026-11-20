// Billing, in Settings → Billing (administrators), and the line across the top
// of the app that says when the trial is ending, a payment failed or there is
// no plan. One screen on one API (GET /billing, api/src/routes/billing.ts — the
// one billing path, docs/ADR/0019): where the company stands, leaving and
// resuming, the plans with what they include and their limits, usage against
// those limits, and the billing details printed on invoices.
//
// Plans, prices, limits and regions are data (shared/src/plans.json), so the
// owner's final price list shows here without a code change. Choosing a plan the
// first time opens Paddle's checkout (Paddle.js) over the page with the server's
// signed company id; Paddle then tells the server by webhook, and this page
// notices. Invoices and the payment method are in Paddle's own portal.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Access, Caps, Interval, PlanDef, PlanKey, Subscription } from '../../../shared/src/billing';
import { bcp47Of, type Locale, type MessageKey } from '../../../shared/src/i18n';
import { ApiFailure, get, patch, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { useStore } from '../lib/store';
import { useUnsaved } from '../lib/unsaved';
import { formatMoney } from '../lib/format';
import { Icon } from './icons';
import { Confirm } from './ui';
import { ALL_COUNTRIES } from '../../../shared/src/trialForm';
import { NEVER_OFFERED } from '../../../shared/src/compliance/consentTexts';
import '../surfaces/admin.css';

interface Regional {
  collect: string;
  amount: number;
  currency: string;
  shown: number | null;
}
type CapKind = 'seats' | 'storage' | 'connectors' | 'ai';

interface BillingInfo {
  enabled: boolean;
  access: Access;
  plans: (PlanDef & { regional: Record<Interval, Regional> })[];
  catalogue: { version: string; status: 'draft' | 'final'; currency: string; trialMonths: number; graceDays: number };
  region: { key: string; currency: string; collect: string; tax: { name: string; rate: number | null; b2b: boolean } } | null;
  seats: number;
  usage: Record<CapKind, { used: number; cap: number | null }>;
  subscription: Subscription | null;
  profile: { taxNumber: string | null; billingEmail: string | null; country?: string | null };
  checkout?: { env: 'sandbox' | 'live'; clientToken: string; email: string };
}
interface CheckoutHandle {
  env: 'sandbox' | 'live';
  clientToken: string;
  priceId: string;
  quantity: number;
  customData: Record<string, string>;
  email: string;
}

/** What each plan brings beyond the one before it: every plan has the base points; features add their own. */
const BASE_POINTS = ['billing.point.boards', 'billing.point.customers', 'billing.point.meetings', 'billing.point.reports', 'billing.point.chat'] as const;
const FEATURE_POINT: Record<string, MessageKey> = { crm_sync: 'billing.point.crm', portal: 'billing.point.portal', playbooks: 'billing.point.playbooks' };
const LIVE = ['active', 'trialing', 'past_due', 'paused'];

/** Paddle.js, loaded the first time someone checks out (never before: nothing is sent to Paddle until then). */
let paddle: Promise<any> | null = null;
function loadPaddle(env: 'sandbox' | 'live', token: string, onEvent: (e: { name?: string }) => void): Promise<any> {
  paddle ??= new Promise<any>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    s.async = true;
    s.onload = () => resolve((window as any).Paddle);
    s.onerror = () => {
      paddle = null;
      reject(new Error('paddle'));
    };
    document.head.appendChild(s);
  }).then((P) => {
    if (env === 'sandbox') P.Environment.set('sandbox');
    P.Initialize({ token, eventCallback: onEvent });
    return P;
  });
  return paddle;
}

const PADDLE_LOCALE: Partial<Record<Locale, string>> = { en: 'en', tr: 'tr', ar: 'ar', ja: 'ja', ko: 'ko', 'zh-Hans': 'zh-Hans', 'zh-Hant': 'zh-TW' };

/** A plan's name: the dictionary's when it has one, else the catalogue's (a plan the owner added). */
function usePlanName() {
  const { t } = useI18n();
  return (key: PlanKey, fallback?: string) => {
    const k = `billing.plan.${key}` as MessageKey;
    const s = t(k);
    return s && s !== k ? s : (fallback ?? key);
  };
}

/** The limits a plan sets, as short lines on its card (none shown for a limit the plan does not have). */
function capLines(caps: Caps, t: ReturnType<typeof useI18n>['t']): string[] {
  const out: string[] = [];
  if (caps.seatsMax != null) out.push(t('billing.cap.seats', { n: caps.seatsMax }));
  else out.push(t('billing.cap.seatsAny'));
  if (caps.connectors != null) out.push(t('billing.cap.connectors', { n: caps.connectors }));
  if (caps.syncEveryMinutes != null) out.push(caps.syncEveryMinutes <= 60 ? t('billing.cap.syncHourly') : t('billing.cap.sync', { n: Math.round(caps.syncEveryMinutes / 60) }));
  if (caps.storageGbPerSeat != null) out.push(t('billing.cap.storage', { n: caps.storageGbPerSeat }));
  if (caps.aiQuestionsPerSeat != null) out.push(t('billing.cap.ai', { n: caps.aiQuestionsPerSeat }));
  return out;
}

/** Settings → Billing: the whole page. */
export function BillingSettings() {
  const { t, fmtDate, locale } = useI18n();
  const { toast, reloadMe } = useStore();
  const planName = usePlanName();
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const [interval, setInterval_] = useState<Interval>('year');
  const [busy, setBusy] = useState<string | null>(null);
  const [switching, setSwitching] = useState<PlanKey | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [tax, setTax] = useState('');
  const [mail, setMail] = useState('');
  const [country, setCountry] = useState('');
  // Countries in the reader's language; the ones Curahold is never offered in are not choices (the API refuses them too).
  const countries = useMemo(() => {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([bcp47Of(locale)], { type: 'region' });
    } catch {
      names = null;
    }
    return ALL_COUNTRIES.filter((c) => !NEVER_OFFERED.includes(c))
      .map((c) => ({ code: c, name: names?.of(c) ?? c }))
      .sort((a, b) => a.name.localeCompare(b.name, bcp47Of(locale)));
  }, [locale]);

  const load = useCallback(async () => {
    const r = await get<BillingInfo>('/billing');
    setInfo(r);
    if (r.subscription?.interval) setInterval_(r.subscription.interval);
    setTax(r.profile.taxNumber ?? '');
    setMail(r.profile.billingEmail ?? '');
    setCountry(r.profile.country ?? '');
    return r;
  }, []);
  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);

  const profileDirty = !!info && (tax !== (info.profile.taxNumber ?? '') || mail !== (info.profile.billingEmail ?? '') || country !== (info.profile.country ?? ''));
  const saveProfile = async (): Promise<boolean> => {
    setBusy('profile');
    try {
      await patch('/billing/profile', { taxNumber: tax.trim() || null, billingEmail: mail.trim() || null, country: country || null });
      toast(t('billing.profile.saved'));
      await load();
      return true;
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
      return false;
    } finally {
      setBusy(null);
    }
  };
  useUnsaved(profileDirty, {
    save: () => saveProfile(),
    discard: () => {
      setTax(info?.profile.taxNumber ?? '');
      setMail(info?.profile.billingEmail ?? '');
      setCountry(info?.profile.country ?? '');
    },
  });

  if (!info) return null;
  if (!info.enabled) {
    return (
      <section className="sheet">
        <h2 className="section__head">{t('billing.title')}</h2>
        <p className="muted">{t('billing.off')}</p>
      </section>
    );
  }

  const seats = Math.max(1, info.seats);
  const sub = info.subscription;
  const paid = !!sub?.providerSubscriptionId && ['active', 'trialing', 'past_due'].includes(sub.status);
  const when = (d: string | null) => (d ? fmtDate(d.slice(0, 10), { day: 'numeric', month: 'long', year: 'numeric' }) : '');
  const failed = (e: unknown) => toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');

  /** After checkout, Paddle's webhook arrives within seconds: look until the subscription shows. */
  const waitForSubscription = async () => {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const r = await load().catch(() => null);
      if (r?.subscription?.providerSubscriptionId) {
        await reloadMe();
        toast(t('billing.welcome'));
        return;
      }
    }
    toast(t('billing.slow'), 'info');
  };

  const checkout = async (plan: PlanKey) => {
    if (!info.checkout) return;
    setBusy(plan);
    try {
      // The server signs the company id; this page never makes one up.
      const { checkout: h } = await post<{ checkout: CheckoutHandle }>('/billing/checkout', { plan, interval });
      const P = await loadPaddle(h.env, h.clientToken, (e) => {
        if (e.name === 'checkout.completed') void waitForSubscription();
      });
      P.Checkout.open({
        items: [{ priceId: h.priceId, quantity: h.quantity }],
        customer: { email: h.email },
        customData: h.customData,
        // Paddle's own code for the language where it has one (zh-Hant is zh-TW there); otherwise it follows the browser.
        settings: PADDLE_LOCALE[locale] ? { locale: PADDLE_LOCALE[locale] } : {},
      });
    } catch (e) {
      if (e instanceof ApiFailure) failed(e);
      else toast(t('billing.paddleDown'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const act = async (what: 'change' | 'portal' | 'cancel' | 'resume', plan?: PlanKey) => {
    setBusy(what);
    try {
      if (what === 'portal') {
        const { url } = await post<{ url: string }>('/billing/portal');
        window.open(url, '_blank', 'noopener');
        return;
      }
      await post(`/billing/${what}`, what === 'change' ? { plan, interval } : undefined);
      await load();
      await reloadMe();
      toast(t(what === 'change' ? 'billing.changed' : what === 'cancel' ? 'billing.exit.left' : 'billing.exit.resumed'));
    } catch (e) {
      failed(e);
    } finally {
      setBusy(null);
      setSwitching(null);
      setConfirmExit(false);
    }
  };

  const a = info.access;
  const statusLine =
    a.state === 'trial'
      ? t('billing.state.trial', { n: a.daysLeft ?? 0, date: when(a.trialEndsAt) })
      : a.state === 'active'
        ? t('billing.state.active', { plan: planName(a.plan), interval: t(`billing.interval.${a.interval ?? 'month'}`), seats: sub?.seats ?? seats, date: when(a.periodEnd) })
        : a.state === 'past_due'
          ? a.daysLeft != null
            ? t('billing.state.pastDueGrace', { n: a.daysLeft })
            : t('billing.state.pastDue')
          : a.state === 'ending'
            ? t('billing.state.ending', { date: when(a.periodEnd) })
            : t('billing.state.locked');
  const canExit = !!sub && LIVE.includes(sub.status) && !!sub.providerSubscriptionId && !sub.cancelAtPeriodEnd;
  const canResume = !!sub && sub.cancelAtPeriodEnd;
  // The cheapest plan's yearly saving, worked out from the price list rather than written into a sentence.
  const cheapest = [...info.plans].sort((x, y) => x.price.month - y.price.month)[0];
  const savePct = cheapest && cheapest.price.month > 0 ? Math.round((1 - cheapest.price.year / cheapest.price.month) * 100) : 0;
  const featured = [...info.plans].sort((x, y) => y.price.month - x.price.month)[0]?.key;
  const region = info.region;

  const usageText = (k: CapKind) => {
    const u = info.usage[k];
    const fmt = (n: number) => (k === 'storage' ? `${Math.round((n / 1024 ** 3) * 10) / 10} GB` : String(n));
    return u.cap == null ? t('billing.usage.noCap', { used: fmt(u.used) }) : t('billing.usage.of', { used: fmt(u.used), cap: fmt(u.cap) });
  };

  return (
    <div className="billing billing-manage">
      <section className="sheet billing__status billing-manage__status" data-state={a.state}>
        <Icon name={a.state === 'locked' || a.state === 'past_due' || canResume ? 'alert' : a.state === 'trial' ? 'clock' : 'checkCircle'} size={20} />
        <div className="billing-manage__body">
          <h2 className="billing__title">{t('billing.title')}</h2>
          <p>{statusLine}</p>
          <div className="billing-manage__actions">
            {sub?.providerCustomerId && (
              <button className="btn" disabled={busy === 'portal'} onClick={() => void act('portal')}>
                {t('billing.portal')} <Icon name="external" size={14} />
              </button>
            )}
            <a
              className="btn"
              href="/settings/people"
              onClick={(e) => {
                e.preventDefault();
                navigate('/settings/people');
              }}
            >
              <Icon name="user" size={16} />
              {t('billing.manageSeats')}
            </a>
            {canExit && (
              <button className="btn btn--quiet" disabled={!!busy} onClick={() => setConfirmExit(true)}>
                <Icon name="logout" size={16} />
                {t('billing.exit.leave')}
              </button>
            )}
            {canResume && (
              <button className="btn btn--primary" disabled={!!busy} onClick={() => void act('resume')}>
                <Icon name="logout" size={16} />
                {busy === 'resume' ? t('common.loading') : t('billing.exit.resume')}
              </button>
            )}
          </div>
          {(canExit || canResume) && <p className="field__hint">{canResume ? t('billing.exit.resumeNote', { date: when(sub!.currentPeriodEnd) }) : t('billing.exit.note')}</p>}
        </div>
      </section>

      <section className="sheet" aria-labelledby="billing-usage">
        <h3 className="sheet__title" id="billing-usage">
          {t('billing.usage.title')}
        </h3>
        <dl className="billing-usage">
          {(['seats', 'connectors', 'storage', 'ai'] as const).map((k) => (
            <div key={k} data-full={info.usage[k].cap != null && info.usage[k].used >= info.usage[k].cap! ? '' : undefined}>
              <dt>{t(`billing.usage.${k}`)}</dt>
              <dd className="num">{usageText(k)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="billing__toolbar">
        <div className="seg" role="group" aria-label={t('billing.intervalLabel')}>
          {(['month', 'year'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={interval === k} onClick={() => setInterval_(k)}>
              {t(`billing.intervalTab.${k}`)}
              {k === 'year' && savePct > 0 && <span className="billing__save">{t('billing.saveN', { n: savePct })}</span>}
            </button>
          ))}
        </div>
        <span className="muted">{t('billing.seats', { n: seats })}</span>
      </div>

      <div className="billing__plans">
        {info.plans.map((p) => {
          const current = paid && sub!.plan === p.key && sub!.interval === interval;
          const r = p.regional[interval];
          const money = (n: number, cur = r.collect) => formatMoney(n, cur, locale);
          const extra = p.features.map((f) => FEATURE_POINT[f]).filter(Boolean);
          return (
            <section key={p.key} className="sheet billing__plan" data-current={current || undefined} data-featured={p.key === featured || undefined}>
              <h3 className="billing__planname">{planName(p.key, p.name)}</h3>
              <p className="billing__price">
                <span className="billing__amount num">{money(r.amount)}</span> <span className="muted">{t('billing.perSeat')}</span>
              </p>
              {r.currency !== r.collect && r.shown != null && <p className="billing__total muted">{t('billing.region.guide', { local: money(r.shown, r.currency), currency: r.collect })}</p>}
              <p className="billing__total muted">
                {t(interval === 'year' ? 'billing.totalYear' : 'billing.totalMonth', { total: money(r.amount * seats * (interval === 'year' ? 12 : 1)), n: seats })}
              </p>
              <ul className="billing__points">
                {extra.length > 0 && <li className="billing__everything">{t('billing.point.everythingTeam')}</li>}
                {(extra.length ? extra : BASE_POINTS).map((k) => (
                  <li key={k}>
                    <Icon name="check" size={14} /> {t(k)}
                  </li>
                ))}
                {capLines(p.caps, t).map((line) => (
                  <li key={line} className="muted">
                    <Icon name="gauge" size={14} /> {line}
                  </li>
                ))}
              </ul>
              {current ? (
                <span className="billing__current">{t('billing.current')}</span>
              ) : paid ? (
                <button className="btn" disabled={!!busy} onClick={() => setSwitching(p.key)}>
                  <Icon name="refresh" size={16} />
                  {t('billing.switch')}
                </button>
              ) : (
                <button className={`btn ${p.key === featured ? 'btn--primary' : ''}`} disabled={!!busy || !info.checkout} onClick={() => void checkout(p.key)}>
                  <Icon name="check" size={16} />
                  {busy === p.key ? t('common.loading') : t('billing.choose', { plan: planName(p.key, p.name) })}
                </button>
              )}
            </section>
          );
        })}
      </div>
      <p className="billing__fine muted">
        {t('billing.fine')}
        {region?.tax.rate != null && <> {t('billing.region.tax', { tax: region.tax.name, rate: Math.round(region.tax.rate * 100) })}</>}
      </p>

      <section className="sheet billing-manage__profile" aria-labelledby="billing-profile">
        <h3 className="sheet__title" id="billing-profile">
          {t('billing.profile.title')}
        </h3>
        <div className="form__row">
          <label className="field">
            <span className="field__label">{t('billing.profile.taxNumber')}</span>
            <input className="input" value={tax} onChange={(e) => setTax(e.target.value)} placeholder={t('billing.profile.taxNumberPlaceholder')} maxLength={60} />
          </label>
          <label className="field">
            <span className="field__label">{t('billing.profile.billingEmail')}</span>
            <input className="input" type="email" value={mail} onChange={(e) => setMail(e.target.value)} placeholder={t('billing.profile.billingEmailPlaceholder')} maxLength={200} />
          </label>
          <label className="field">
            <span className="field__label">{t('billing.profile.country')}</span>
            <select className="select" value={country} onChange={(e) => setCountry(e.target.value)} autoComplete="country">
              <option value="">{t('billing.profile.countryNone')}</option>
              {countries.map((x) => (
                <option key={x.code} value={x.code}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {switching && (
        <Confirm
          title={t('billing.switchTitle', { plan: planName(switching) })}
          body={t('billing.switchBody')}
          confirmLabel={t('billing.switch')}
          onClose={() => setSwitching(null)}
          onConfirm={() => act('change', switching)}
        />
      )}
      {confirmExit && (
        <Confirm
          title={t('billing.exit.confirmTitle')}
          body={t('billing.exit.confirmBody', { date: when(sub?.currentPeriodEnd ?? null) })}
          confirmLabel={t('billing.exit.leave')}
          onClose={() => setConfirmExit(false)}
          onConfirm={() => act('cancel')}
        />
      )}
    </div>
  );
}

/** The line across the top: trial ending, a failed payment, a cancelled plan, or none at all. */
export function BillingBar() {
  const { t, fmtDate } = useI18n();
  const { me, can } = useStore();
  const a = me.org.billing;
  if (!me.org.billingOn || !a) return null;
  const soon = a.state === 'trial' && (a.daysLeft ?? 99) <= 7;
  if (!soon && a.state !== 'past_due' && a.state !== 'ending' && a.state !== 'locked') return null;
  const date = (d: string | null) => (d ? fmtDate(d.slice(0, 10), { day: 'numeric', month: 'long' }) : '');
  const text =
    a.state === 'trial'
      ? t('billing.bar.trial', { n: a.daysLeft ?? 0 })
      : a.state === 'past_due'
        ? t('billing.bar.pastDue')
        : a.state === 'ending'
          ? t('billing.bar.ending', { date: date(a.periodEnd) })
          : t(can('org.manage') ? 'billing.bar.locked' : 'billing.bar.lockedAsk');
  return (
    <div className="billingbar" role="status" data-state={a.state}>
      <Icon name={a.state === 'trial' ? 'clock' : 'alert'} size={16} />
      <span>{text}</span>
      {can('org.manage') && (
        <button className="btn btn--small" onClick={() => navigate('/settings/billing')}>
          <Icon name="check" size={16} />
          {a.state === 'past_due' || a.state === 'ending' ? t('billing.bar.manage') : t('billing.bar.choose')}
        </button>
      )}
    </div>
  );
}
