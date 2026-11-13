// The platform owner's super-admin console: every customer company on one
// screen (overview tiles + a customers table), with a drawer for one company's
// full detail. For the business operator only — the page itself asks the server
// whether the viewer is owner/staff (GET /platform/access) and shows nothing but
// a notice otherwise. The data endpoints are owner-gated too, so this is a
// convenience, not the real gate. All reads are cross-company and read-only.
import { useCallback, useEffect, useState } from 'react';
import { EmptyState, LoadError, SkeletonRows } from '../components/Empty';
import { Icon } from '../components/icons';
import { get } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useMoney } from '../lib/money';
import type { MessageKey } from '../../../shared/src/i18n';
import type { PlatformAccess, PlatformCustomer, PlatformCustomerDetail, PlatformOverview, SubStatus } from '../../../shared/src/platform';

/** Billing lifecycle → the dot colour beside it. */
const STATUS_TONE: Record<SubStatus, string> = {
  active: 'ok',
  trialing: 'info',
  past_due: 'warn',
  paused: 'warn',
  canceled: 'off',
  none: 'off',
};

function StatusDot({ status }: { status: SubStatus }) {
  const { t } = useI18n();
  const label = t(`platform.status.${status}` as MessageKey);
  return (
    <span className="pf-status" data-tone={STATUS_TONE[status]}>
      <span className="pf-status__dot" aria-hidden="true" />
      {label}
    </span>
  );
}

function PlanLabel({ plan }: { plan: string | null }) {
  const { t } = useI18n();
  if (!plan) return <>—</>;
  if (plan === 'team' || plan === 'business') return <>{t(`billing.plan.${plan}` as MessageKey)}</>;
  return <>{plan}</>;
}

export function PlatformConsolePage() {
  const { t, locale, fmtDate } = useI18n();
  const money = useMoney();
  const [access, setAccess] = useState<PlatformAccess | null>(null);
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [customers, setCustomers] = useState<PlatformCustomer[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setFailed(false);
    get<PlatformAccess>('/platform/access')
      .then((a) => {
        if (!live) return;
        setAccess(a);
        if (!a.platform) return;
        return Promise.all([get<PlatformOverview>('/platform/overview'), get<{ customers: PlatformCustomer[] }>('/platform/customers')]).then(([o, cs]) => {
          if (!live) return;
          setOverview(o);
          setCustomers(cs.customers);
        });
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setFailed(false);
    setAccess(null);
    setOverview(null);
    setCustomers(null);
    setAttempt((n) => n + 1);
  }, []);

  const nf = new Intl.NumberFormat(locale);
  const n = (v: number) => nf.format(Math.round(v));
  const usd = (v: number, cur: string) => money.format(v, cur, v >= 10_000);
  const date = (v: string | null) => (v ? fmtDate(v, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

  if (failed && !access) return <div className="pf"><LoadError onRetry={retry} /></div>;
  if (!access) return <div className="pf"><SkeletonRows rows={6} label={t('common.loading')} /></div>;
  if (!access.platform) {
    return (
      <div className="pf">
        <EmptyState icon="lock" title={t('platform.denied' as MessageKey)} />
      </div>
    );
  }

  const tile = (label: string, value: string, lead?: boolean) => (
    <div className={`pf-tile${lead ? ' pf-tile--lead' : ''}`}>
      <div className="pf-tile__label">{label}</div>
      <div className="pf-tile__value">{value}</div>
    </div>
  );

  const o = overview;
  return (
    <div className="pf">
      <header className="pf__head">
        <div>
          <h1 className="pf__title">{t('platform.title' as MessageKey)}</h1>
          <p className="pf__sub">{t('platform.subtitle' as MessageKey)}</p>
        </div>
      </header>

      {o && !o.billingSchema ? <p className="pf__note">{t('platform.legacyNote' as MessageKey)}</p> : null}

      {!o || !customers ? (
        <SkeletonRows rows={6} label={t('common.loading')} />
      ) : (
        <>
          <section className="pf-sec" aria-label={t('platform.overview' as MessageKey)}>
            <div className="pf-tiles">
              {tile(t('platform.tile.customers' as MessageKey), n(o.totals.customers), true)}
              {tile(t('platform.tile.active' as MessageKey), n(o.totals.active))}
              {tile(t('platform.tile.trialing' as MessageKey), n(o.totals.trialing))}
              {tile(t('platform.tile.pastDue' as MessageKey), n(o.totals.pastDue))}
              {tile(t('platform.tile.canceled' as MessageKey), n(o.totals.canceled))}
              {tile(t('platform.tile.mrr' as MessageKey), usd(o.mrr, o.currency))}
              {tile(t('platform.tile.arr' as MessageKey), usd(o.arr, o.currency))}
            </div>
          </section>

          <section className="pf-sec">
            <h2 className="pf-sec__title">{t('platform.customers' as MessageKey)}</h2>
            {customers.length === 0 ? (
              <EmptyState icon="building" title={t('platform.empty' as MessageKey)} compact />
            ) : (
              <div className="pf-table" role="table">
                <div className="pf-row pf-row--head" role="row">
                  <span role="columnheader">{t('platform.col.customer' as MessageKey)}</span>
                  <span role="columnheader">{t('platform.col.plan' as MessageKey)}</span>
                  <span role="columnheader">{t('platform.col.status' as MessageKey)}</span>
                  <span role="columnheader">{t('platform.col.people' as MessageKey)}</span>
                  <span role="columnheader">{t('platform.col.trial' as MessageKey)}</span>
                  <span role="columnheader">{t('platform.col.invoice' as MessageKey)}</span>
                </div>
                {customers.map((cu) => (
                  <button key={cu.orgId} className="pf-row" role="row" onClick={() => setOpenId(cu.orgId)}>
                    <span role="cell" className="pf-cell--name">
                      <span className="pf-name">{cu.name}</span>
                      <span className="pf-slug">{cu.slug}</span>
                    </span>
                    <span role="cell"><PlanLabel plan={cu.plan} /></span>
                    <span role="cell"><StatusDot status={cu.status} /></span>
                    <span role="cell">{t('platform.peopleCount' as MessageKey, { users: n(cu.users), seats: n(cu.seats) })}</span>
                    <span role="cell">{date(cu.trialEndsAt)}</span>
                    <span role="cell">{cu.latestInvoiceStatus ?? '—'}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {openId && <CustomerDrawer orgId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function CustomerDrawer({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const { t, fmtDate } = useI18n();
  const money = useMoney();
  const [detail, setDetail] = useState<PlatformCustomerDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setFailed(false);
    setDetail(null);
    get<PlatformCustomerDetail>(`/platform/customers/${orgId}`)
      .then((d) => live && setDetail(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [orgId, attempt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const date = (v: string | null) => (v ? fmtDate(v, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const c = detail?.customer;
  const sub = detail?.subscription;

  const row = (label: string, value: React.ReactNode) => (
    <div className="pf-dl__row">
      <span className="pf-dl__k">{label}</span>
      <span className="pf-dl__v">{value}</span>
    </div>
  );

  return (
    <div className="pf-drawer" role="dialog" aria-modal="true" aria-label={t('platform.detail' as MessageKey)}>
      <div className="pf-drawer__scrim" onClick={onClose} aria-hidden="true" />
      <div className="pf-drawer__panel">
        <header className="pf-drawer__head">
          <h2 className="pf-drawer__title">{c ? c.name : t('common.loading')}</h2>
          <button className="pf-drawer__close" aria-label={t('common.close')} onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </header>

        {failed ? (
          <LoadError onRetry={() => setAttempt((x) => x + 1)} />
        ) : !detail || !c ? (
          <SkeletonRows rows={5} label={t('common.loading')} />
        ) : (
          <div className="pf-drawer__body">
            <section className="pf-dl">
              <h3 className="pf-dl__h">{t('platform.detail.subscription' as MessageKey)}</h3>
              {row(t('platform.sub.plan' as MessageKey), <PlanLabel plan={c.plan} />)}
              {row(t('platform.sub.status' as MessageKey), <StatusDot status={c.status} />)}
              {row(t('platform.sub.trialEnds' as MessageKey), date(c.trialEndsAt))}
              {row(t('platform.sub.periodEnd' as MessageKey), date(c.currentPeriodEnd))}
              {row(t('platform.sub.cancels' as MessageKey), t(c.cancelAtPeriodEnd ? 'common.yes' : 'common.no'))}
              {sub ? row(t('platform.sub.provider' as MessageKey), sub.provider ?? '—') : null}
              {row(t('platform.tax' as MessageKey), c.taxNumber ?? '—')}
              {row(t('platform.billingEmail' as MessageKey), c.billingEmail ?? '—')}
            </section>

            <section className="pf-dl">
              <h3 className="pf-dl__h">{t('platform.detail.counts' as MessageKey)}</h3>
              {row(t('platform.count.members' as MessageKey), String(detail.counts.members))}
              {row(t('platform.count.boards' as MessageKey), String(detail.counts.boards))}
              {row(t('platform.count.accounts' as MessageKey), String(detail.counts.accounts))}
              {row(t('platform.count.tasks' as MessageKey), String(detail.counts.tasks))}
              {row(t('platform.count.records' as MessageKey), String(detail.counts.records))}
            </section>

            <section className="pf-dl">
              <h3 className="pf-dl__h">{t('platform.detail.settings' as MessageKey)}</h3>
              {row(t('platform.set.locale' as MessageKey), detail.settings.locale)}
              {row(t('platform.set.timezone' as MessageKey), detail.settings.timezone)}
              {row(t('platform.set.currency' as MessageKey), detail.settings.currency)}
              {row(t('platform.set.template' as MessageKey), detail.settings.template || '—')}
              {row(t('platform.set.domains' as MessageKey), detail.settings.domains.join(', ') || '—')}
            </section>

            <section className="pf-dl">
              <h3 className="pf-dl__h">{t('platform.detail.invoices' as MessageKey)}</h3>
              {detail.invoices.length === 0 ? (
                <p className="pf-dl__empty">{t('platform.detail.noInvoices' as MessageKey)}</p>
              ) : (
                detail.invoices.map((inv, i) => (
                  <div className="pf-dl__row" key={inv.providerInvoiceId ?? i}>
                    <span className="pf-dl__k">{inv.issuedAt ? date(inv.issuedAt) : '—'}</span>
                    <span className="pf-dl__v">
                      {money.format(inv.amountCents / 100, inv.currency, false)} · {inv.status}
                    </span>
                  </div>
                ))
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
