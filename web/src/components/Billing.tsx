// Billing, in Settings → Billing (administrators), and the line across the top
// of the app that says when the trial is ending, a payment failed or there is
// no plan. Prices and what each plan includes come from shared/src/billing.ts.
//
// Choosing a plan the first time opens Paddle's checkout (Paddle.js) over the
// page; Paddle then tells the server by webhook, and this page notices.
// Invoices, the payment method and cancelling are in Paddle's own portal.
import { useCallback, useEffect, useState } from 'react';
import { PRICE_CURRENCY, type Access, type Interval, type PlanDef, type PlanKey } from '../../../shared/src/billing';
import { ApiFailure, get, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { useStore } from '../lib/store';
import { Icon } from './icons';
import { Confirm } from './ui';

interface BillingInfo {
  enabled: boolean;
  access: Access;
  plans: PlanDef[];
  seats: number;
  subscription: { status: string; plan: PlanKey; interval: Interval; seats: number; periodEnd: string | null; cancelAtPeriodEnd: boolean } | null;
  checkout?: { env: 'sandbox' | 'live'; clientToken: string; prices: Record<PlanKey, Record<Interval, string>>; orgId: string; customData: Record<string, string>; email: string };
}

/** What each plan brings, in the order shown. Business has everything in Team, plus these. */
const TEAM_POINTS = ['billing.point.boards', 'billing.point.customers', 'billing.point.meetings', 'billing.point.reports', 'billing.point.chat'] as const;
const BUSINESS_POINTS = ['billing.point.crm', 'billing.point.portal', 'billing.point.playbooks'] as const;

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

export function BillingSettings() {
  const { t, fmtDate, locale } = useI18n();
  const { toast, reloadMe } = useStore();
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const [interval, setInterval_] = useState<Interval>('year');
  const [busy, setBusy] = useState<string | null>(null);
  const [switching, setSwitching] = useState<PlanKey | null>(null);

  const load = useCallback(async () => {
    const r = await get<BillingInfo>('/billing');
    setInfo(r);
    if (r.subscription?.interval) setInterval_(r.subscription.interval);
    return r;
  }, []);
  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);

  if (!info) return null;
  if (!info.enabled) {
    return (
      <section className="sheet">
        <h2 className="section__head">{t('billing.title')}</h2>
        <p className="muted">{t('billing.off')}</p>
      </section>
    );
  }

  const money = (n: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: PRICE_CURRENCY, maximumFractionDigits: 0 }).format(n);
  const seats = Math.max(1, info.seats);
  const sub = info.subscription;
  const live = !!sub && ['active', 'trialing', 'past_due'].includes(sub.status);

  /** After checkout, Paddle's webhook arrives within seconds: look until the subscription shows. */
  const waitForSubscription = async () => {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const r = await load().catch(() => null);
      if (r?.subscription) {
        await reloadMe();
        toast(t('billing.welcome'));
        return;
      }
    }
    toast(t('billing.slow'), 'info');
  };

  const checkout = async (plan: PlanKey) => {
    const c = info.checkout;
    if (!c) return;
    setBusy(plan);
    try {
      const P = await loadPaddle(c.env, c.clientToken, (e) => {
        if (e.name === 'checkout.completed') void waitForSubscription();
      });
      P.Checkout.open({
        items: [{ priceId: c.prices[plan][interval], quantity: seats }],
        customer: { email: c.email },
        // How the webhook finds the company: the server's own signed value, never one made here.
        customData: c.customData,
        settings: { locale: locale === 'tr' ? 'tr' : 'en' },
      });
    } catch {
      toast(t('billing.paddleDown'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const change = async (plan: PlanKey) => {
    setBusy(plan);
    try {
      await post('/billing/change', { plan, interval });
      await load();
      await reloadMe();
      toast(t('billing.changed'));
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(null);
      setSwitching(null);
    }
  };

  const portal = async () => {
    setBusy('portal');
    try {
      const { url } = await post<{ url: string }>('/billing/portal');
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const a = info.access;
  const when = (d: string | null) => (d ? fmtDate(d.slice(0, 10), { day: 'numeric', month: 'long', year: 'numeric' }) : '');
  const statusLine =
    a.state === 'trial'
      ? t('billing.state.trial', { n: a.daysLeft ?? 0, date: when(a.trialEndsAt) })
      : a.state === 'active'
        ? t('billing.state.active', { plan: t(`billing.plan.${a.plan}`), interval: t(`billing.interval.${a.interval ?? 'month'}`), seats: sub?.seats ?? seats, date: when(a.periodEnd) })
        : a.state === 'past_due'
          ? t('billing.state.pastDue')
          : a.state === 'ending'
            ? t('billing.state.ending', { date: when(a.periodEnd) })
            : t('billing.state.locked');

  return (
    <div className="billing">
      <section className="sheet billing__status" data-state={a.state}>
        <Icon name={a.state === 'locked' || a.state === 'past_due' ? 'alert' : a.state === 'trial' ? 'clock' : 'checkCircle'} size={20} />
        <div>
          <h2 className="billing__title">{t('billing.title')}</h2>
          <p>{statusLine}</p>
        </div>
        {sub && (
          <button className="btn" disabled={busy === 'portal'} onClick={portal}>
            {t('billing.portal')} <Icon name="external" size={14} />
          </button>
        )}
      </section>

      <div className="billing__toolbar">
        <div className="seg" role="group" aria-label={t('billing.intervalLabel')}>
          {(['month', 'year'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={interval === k} onClick={() => setInterval_(k)}>
              {t(`billing.interval.${k}`)}
              {k === 'year' && <span className="billing__save">{t('billing.save')}</span>}
            </button>
          ))}
        </div>
        <span className="muted">{t('billing.seats', { n: seats })}</span>
      </div>

      <div className="billing__plans">
        {info.plans.map((p) => {
          const current = live && sub!.plan === p.key && sub!.interval === interval;
          const each = p.price[interval];
          return (
            <section key={p.key} className="sheet billing__plan" data-current={current || undefined} data-plan={p.key}>
              <h3 className="billing__planname">{t(`billing.plan.${p.key}`)}</h3>
              <p className="billing__price">
                <span className="billing__amount num">{money(each)}</span> <span className="muted">{t('billing.perSeat')}</span>
              </p>
              <p className="billing__total muted">
                {t(interval === 'year' ? 'billing.totalYear' : 'billing.totalMonth', { total: money(each * seats * (interval === 'year' ? 12 : 1)), n: seats })}
              </p>
              <ul className="billing__points">
                {p.key === 'business' && <li className="billing__everything">{t('billing.point.everythingTeam')}</li>}
                {(p.key === 'team' ? TEAM_POINTS : BUSINESS_POINTS).map((k) => (
                  <li key={k}>
                    <Icon name="check" size={14} /> {t(k)}
                  </li>
                ))}
              </ul>
              {current ? (
                <span className="billing__current">{t('billing.current')}</span>
              ) : live ? (
                <button className="btn" disabled={!!busy} onClick={() => setSwitching(p.key)}>
                  {t('billing.switch')}
                </button>
              ) : (
                <button className={`btn ${p.key === 'business' ? 'btn--primary' : ''}`} disabled={!!busy || !info.checkout} onClick={() => void checkout(p.key)}>
                  {busy === p.key ? t('common.loading') : t('billing.choose', { plan: t(`billing.plan.${p.key}`) })}
                </button>
              )}
            </section>
          );
        })}
      </div>
      <p className="billing__fine muted">{t('billing.fine')}</p>

      {switching && (
        <Confirm
          title={t('billing.switchTitle', { plan: t(`billing.plan.${switching}`) })}
          body={t('billing.switchBody')}
          confirmLabel={t('billing.switch')}
          onClose={() => setSwitching(null)}
          onConfirm={() => change(switching)}
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
          {a.state === 'past_due' || a.state === 'ending' ? t('billing.bar.manage') : t('billing.bar.choose')}
        </button>
      )}
    </div>
  );
}
