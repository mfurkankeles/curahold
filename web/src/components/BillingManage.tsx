// The canonical, table-backed side of billing (api/src/routes/subscriptions.ts):
//   - SubscriptionPanel: where the plan stands, the monthly exit right (leave at
//     the end of the period, resume before it ends), and the billing-contact
//     details. Shown in Settings → Billing, for administrators.
//   - TrialBanner: a slim line for the trial's days-left or a pending exit.
//
// This complements the existing components in Billing.tsx (which drive first-time
// Paddle.js checkout and the plan snapshot); it reads and writes the
// subscriptions table through the new billing routes.
//
// The billing.manage.*, billing.exit.*, billing.profile.* and billing.banner.*
// keys are new and reported for the coordinator to add to shared/src/i18n/en.ts
// + tr.ts. The `as MessageKey` casts keep typechecking green until the keys land
// (they stay visible to the i18n key scanner, so the coordinator's run lists any
// still missing).
import { useCallback, useEffect, useState } from 'react';
import type { MessageKey } from '../../../shared/src/i18n';
import type { Subscription } from '../../../shared/src/billing';
import { ApiFailure, get, patch, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { useStore } from '../lib/store';
import { Icon } from './icons';
import { Confirm } from './ui';

interface SubInfo {
  enabled: boolean;
  subscription: Subscription | null;
  profile: { taxNumber: string | null; billingEmail: string | null };
}

const LIVE = ['active', 'trialing', 'past_due', 'paused'];

export function SubscriptionPanel() {
  const { t, fmtDate } = useI18n();
  const { toast, reloadMe } = useStore();
  const [info, setInfo] = useState<SubInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [tax, setTax] = useState('');
  const [mail, setMail] = useState('');

  const load = useCallback(async () => {
    const r = await get<SubInfo>('/billing/subscription');
    setInfo(r);
    setTax(r.profile.taxNumber ?? '');
    setMail(r.profile.billingEmail ?? '');
  }, []);
  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);

  if (!info) return null;
  if (!info.enabled) {
    return (
      <section className="sheet">
        <h2 className="section__head">{t('billing.manage.title' as MessageKey)}</h2>
        <p className="muted">{t('billing.off')}</p>
      </section>
    );
  }

  const sub = info.subscription;
  const when = (d: string | null) => (d ? fmtDate(d.slice(0, 10), { day: 'numeric', month: 'long', year: 'numeric' }) : '');
  const planName = sub ? t(`billing.plan.${sub.plan}` as MessageKey) : '';
  const statusLine = !sub
    ? t('billing.manage.statusNone' as MessageKey)
    : sub.cancelAtPeriodEnd
      ? t('billing.manage.statusEnding' as MessageKey, { date: when(sub.currentPeriodEnd) })
      : sub.status === 'trialing'
        ? t('billing.manage.statusTrial' as MessageKey, { n: sub.daysLeft ?? 0 })
        : sub.status === 'past_due'
          ? t('billing.manage.statusPastDue' as MessageKey)
          : sub.status === 'paused'
            ? t('billing.manage.statusPaused' as MessageKey)
            : sub.status === 'canceled'
              ? t('billing.manage.statusCanceled' as MessageKey)
              : t('billing.manage.statusActive' as MessageKey, { plan: planName });

  const act = async (what: 'cancel' | 'resume') => {
    setBusy(what);
    try {
      await post(`/billing/${what}`);
      await load();
      await reloadMe();
      toast(t((what === 'cancel' ? 'billing.exit.left' : 'billing.exit.resumed') as MessageKey));
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(null);
      setConfirmExit(false);
    }
  };

  const saveProfile = async () => {
    setBusy('profile');
    try {
      await patch('/billing/profile', { taxNumber: tax.trim() || null, billingEmail: mail.trim() || null });
      toast(t('billing.profile.saved' as MessageKey));
      await load();
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const live = !!sub && LIVE.includes(sub.status);
  const canExit = live && !sub!.cancelAtPeriodEnd;
  const canResume = !!sub && sub.cancelAtPeriodEnd;

  return (
    <div className="billing-manage">
      <section className="sheet billing__status" data-state={sub?.status ?? 'none'}>
        <Icon name={sub?.cancelAtPeriodEnd || sub?.status === 'past_due' ? 'alert' : sub?.status === 'trialing' ? 'clock' : 'checkCircle'} size={20} />
        <div>
          <h2 className="billing__title">{t('billing.manage.title' as MessageKey)}</h2>
          <p>{statusLine}</p>
        </div>
      </section>

      <section className="sheet">
        <p className="muted">{t('billing.exit.note' as MessageKey)}</p>
        <div className="billing-manage__actions">
          {canExit && (
            <button className="btn" disabled={!!busy} onClick={() => setConfirmExit(true)}>
              {t('billing.exit.leave' as MessageKey)}
            </button>
          )}
          {canResume && (
            <>
              <span className="muted">{t('billing.exit.resumeNote' as MessageKey, { date: when(sub!.currentPeriodEnd) })}</span>
              <button className="btn btn--primary" disabled={!!busy} onClick={() => void act('resume')}>
                {busy === 'resume' ? t('common.loading') : t('billing.exit.resume' as MessageKey)}
              </button>
            </>
          )}
        </div>
      </section>

      <section className="sheet billing-manage__profile">
        <h3 className="section__head">{t('billing.profile.title' as MessageKey)}</h3>
        <label className="field">
          <span className="field__label">{t('billing.profile.taxNumber' as MessageKey)}</span>
          <input className="input" value={tax} onChange={(e) => setTax(e.target.value)} placeholder={t('billing.profile.taxNumberPlaceholder' as MessageKey)} maxLength={60} />
        </label>
        <label className="field">
          <span className="field__label">{t('billing.profile.billingEmail' as MessageKey)}</span>
          <input className="input" type="email" value={mail} onChange={(e) => setMail(e.target.value)} placeholder={t('billing.profile.billingEmailPlaceholder' as MessageKey)} maxLength={200} />
        </label>
        <div className="billing-manage__actions">
          <button className="btn btn--primary" disabled={busy === 'profile'} onClick={() => void saveProfile()}>
            {busy === 'profile' ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </section>

      {confirmExit && (
        <Confirm
          title={t('billing.exit.confirmTitle' as MessageKey)}
          body={t('billing.exit.confirmBody' as MessageKey, { date: when(sub?.currentPeriodEnd ?? null) })}
          confirmLabel={t('billing.exit.leave' as MessageKey)}
          onClose={() => setConfirmExit(false)}
          onConfirm={() => act('cancel')}
        />
      )}
    </div>
  );
}

/** A slim banner: trial days left, or a plan ending at period end. Null when neither applies. */
export function TrialBanner() {
  const { t, fmtDate } = useI18n();
  const { can } = useStore();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    void get<SubInfo>('/billing/subscription')
      .then((r) => {
        setEnabled(r.enabled);
        setSub(r.subscription);
      })
      .catch(() => undefined);
  }, []);

  if (!enabled || !sub) return null;
  const trial = sub.status === 'trialing' && !sub.cancelAtPeriodEnd;
  const ending = sub.cancelAtPeriodEnd;
  if (!trial && !ending) return null;
  const text = ending
    ? t('billing.banner.ending' as MessageKey, { date: sub.currentPeriodEnd ? fmtDate(sub.currentPeriodEnd.slice(0, 10), { day: 'numeric', month: 'long' }) : '' })
    : t('billing.banner.trial' as MessageKey, { n: sub.daysLeft ?? 0 });

  return (
    <div className="billingbar" role="status" data-state={ending ? 'ending' : 'trial'}>
      <Icon name={ending ? 'alert' : 'clock'} size={16} />
      <span>{text}</span>
      {can('org.manage') && (
        <button className="btn btn--small" onClick={() => navigate('/settings/billing')}>
          {t('billing.banner.manage' as MessageKey)}
        </button>
      )}
    </div>
  );
}
