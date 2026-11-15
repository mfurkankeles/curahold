// Every customer company on one list, and one company's account in a drawer.
// Used twice: inside the product (/platform, for a self-hosted install's
// operator and for development) and in Curahold's own console on its own host
// (desk.<domain>), where the same list is the Customers section. The data
// endpoints are owner/staff-gated on the server; this screen only shows.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MessageKey } from '../../../shared/src/i18n';
import type { PlatformAccess, PlatformCustomer, PlatformCustomerDetail, PlatformOverview, SubStatus } from '../../../shared/src/platform';
import { EmptyState, LoadError, SkeletonRows } from '../components/Empty';
import { FilterGroup, FilterSheet } from '../components/FilterSheet';
import { Icon } from '../components/icons';
import { useFocusTrap } from '../components/ui';
import { get } from '../lib/api';
import { formatDate, formatMoney, formatNumber } from '../lib/format';
import { useI18n } from '../lib/i18n';
import '../surfaces/console.css';

/** Billing lifecycle → the tone of the dot beside it. */
const STATUS_TONE: Record<SubStatus, string> = { active: 'ok', trialing: 'info', past_due: 'warn', paused: 'warn', canceled: 'off', none: 'off' };
const STATUSES: SubStatus[] = ['active', 'trialing', 'past_due', 'paused', 'canceled', 'none'];

export function StatusDot({ status }: { status: SubStatus }) {
  const { t } = useI18n();
  return (
    <span className="pf-status" data-tone={STATUS_TONE[status]}>
      <span className="pf-status__dot" aria-hidden="true" />
      {t(`platform.status.${status}` as MessageKey)}
    </span>
  );
}

function PlanLabel({ plan }: { plan: string | null }) {
  const { t } = useI18n();
  if (!plan) return <>—</>;
  if (plan === 'team' || plan === 'business') return <>{t(`billing.plan.${plan}` as MessageKey)}</>;
  return <>{plan}</>;
}

/** The companies, searchable and narrowed by billing standing; a row opens the company. */
export function CustomerList({ customers, onOpen }: { customers: PlatformCustomer[]; onOpen: (orgId: string) => void }) {
  const { t, locale } = useI18n();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<SubStatus | ''>('');
  const shown = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase(locale);
    return customers.filter((c) => (!status || c.status === status) && (!needle || c.name.toLocaleLowerCase(locale).includes(needle) || c.slug.includes(needle)));
  }, [customers, q, status, locale]);
  const day = (v: string | null) => (v ? formatDate(v, locale, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

  return (
    <>
      <div className="pf-tools">
        <FilterSheet
          count={status ? 1 : 0}
          onClear={() => setStatus('')}
          search={
            <label className="pf-search">
              <Icon name="search" size={16} />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('console.searchCompanies' as MessageKey)} aria-label={t('console.searchCompanies' as MessageKey)} />
            </label>
          }
        >
          <FilterGroup label={t('platform.col.status' as MessageKey)}>
            <select className="input pf-filter" value={status} onChange={(e) => setStatus(e.target.value as SubStatus | '')} aria-label={t('platform.col.status' as MessageKey)}>
              <option value="">{t('console.allStatuses' as MessageKey)}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`platform.status.${s}` as MessageKey)}
                </option>
              ))}
            </select>
          </FilterGroup>
        </FilterSheet>
      </div>
      {shown.length === 0 ? (
        <EmptyState icon="search" compact title={t('console.noMatch' as MessageKey)} />
      ) : (
        <table className="pf-table">
          <thead>
            <tr>
              <th scope="col">{t('platform.col.customer' as MessageKey)}</th>
              <th scope="col">{t('platform.col.plan' as MessageKey)}</th>
              <th scope="col">{t('platform.col.status' as MessageKey)}</th>
              <th scope="col" className="pf-wide">{t('platform.col.people' as MessageKey)}</th>
              <th scope="col" className="pf-wide">{t('platform.col.trial' as MessageKey)}</th>
              <th scope="col" className="pf-wide">{t('platform.col.invoice' as MessageKey)}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((cu) => (
              <tr key={cu.orgId} onClick={() => onOpen(cu.orgId)}>
                <th scope="row">
                  <button type="button" className="pf-open" onClick={(e) => (e.stopPropagation(), onOpen(cu.orgId))}>
                    <span className="pf-name">{cu.name}</span>
                    <span className="pf-slug">{cu.slug}</span>
                  </button>
                </th>
                <td><PlanLabel plan={cu.plan} /></td>
                <td><StatusDot status={cu.status} /></td>
                <td className="pf-wide pf-num">{t('platform.peopleCount' as MessageKey, { users: formatNumber(cu.users, locale), seats: formatNumber(cu.seats, locale) })}</td>
                <td className="pf-wide pf-num">{day(cu.trialEndsAt)}</td>
                <td className="pf-wide">{cu.latestInvoiceStatus ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

/** One company's account, over the list. Escape, the close button or the shade closes it. */
export function CustomerDrawer({ orgId, load, onClose }: { orgId: string; load: (orgId: string) => Promise<PlatformCustomerDetail>; onClose: () => void }) {
  const { t, locale } = useI18n();
  const [detail, setDetail] = useState<PlatformCustomerDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  useFocusTrap(panel);

  useEffect(() => {
    let live = true;
    setFailed(false);
    setDetail(null);
    load(orgId)
      .then((d) => live && setDetail(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [orgId, attempt, load]);

  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      back?.focus?.();
    };
  }, [onClose]);

  const day = (v: string | null) => (v ? formatDate(v, locale, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const n = (v: number) => formatNumber(v, locale);
  const c = detail?.customer;
  const row = (label: string, value: React.ReactNode) => (
    <div className="pf-dl__row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );

  return (
    <div className="pf-drawer" role="dialog" aria-modal="true" aria-labelledby="pf-drawer-title">
      <div className="pf-drawer__scrim" onClick={onClose} aria-hidden="true" />
      <div className="pf-drawer__panel" ref={panel} tabIndex={-1}>
        <header className="pf-drawer__head">
          <div className="pf-drawer__heading">
            <h2 className="pf-drawer__title" id="pf-drawer-title">{c ? c.name : t('platform.detail' as MessageKey)}</h2>
            {c ? <StatusDot status={c.status} /> : null}
          </div>
          <button type="button" className="btn btn--quiet btn--icon pf-drawer__close" aria-label={t('common.close')} onClick={onClose}>
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
              <dl>
              {row(t('platform.sub.plan' as MessageKey), <PlanLabel plan={c.plan} />)}
              {row(t('platform.sub.trialEnds' as MessageKey), day(c.trialEndsAt))}
              {row(t('platform.sub.periodEnd' as MessageKey), day(c.currentPeriodEnd))}
              {row(t('platform.sub.cancels' as MessageKey), t(c.cancelAtPeriodEnd ? 'common.yes' : 'common.no'))}
              {detail.subscription ? row(t('platform.sub.provider' as MessageKey), detail.subscription.provider ?? '—') : null}
              {row(t('platform.tax' as MessageKey), c.taxNumber ?? '—')}
              {row(t('platform.billingEmail' as MessageKey), c.billingEmail ?? '—')}
            </dl></section>
            <section className="pf-dl">
              <h3 className="pf-dl__h">{t('platform.detail.counts' as MessageKey)}</h3>
              <dl>
              {row(t('platform.count.members' as MessageKey), n(detail.counts.members))}
              {row(t('platform.count.boards' as MessageKey), n(detail.counts.boards))}
              {row(t('platform.count.accounts' as MessageKey), n(detail.counts.accounts))}
              {row(t('platform.count.tasks' as MessageKey), n(detail.counts.tasks))}
              {row(t('platform.count.records' as MessageKey), n(detail.counts.records))}
            </dl></section>
            <section className="pf-dl">
              <h3 className="pf-dl__h">{t('platform.detail.settings' as MessageKey)}</h3>
              <dl>
              {row(t('platform.set.locale' as MessageKey), detail.settings.locale)}
              {row(t('platform.set.timezone' as MessageKey), detail.settings.timezone)}
              {row(t('platform.set.currency' as MessageKey), detail.settings.currency)}
              {row(t('platform.set.template' as MessageKey), detail.settings.template || '—')}
              {row(t('platform.set.domains' as MessageKey), detail.settings.domains.join(', ') || '—')}
            </dl></section>
            <section className="pf-dl">
              <h3 className="pf-dl__h">{t('platform.detail.invoices' as MessageKey)}</h3>
              <dl>
              {detail.invoices.length === 0 ? (
                <div className="pf-dl__row"><dt>—</dt><dd className="pf-dl__empty">{t('platform.detail.noInvoices' as MessageKey)}</dd></div>
              ) : (
                detail.invoices.map((inv, i) => (
                  <div className="pf-dl__row" key={inv.providerInvoiceId ?? i}>
                    <dt>{day(inv.issuedAt)}</dt>
                    <dd>
                      {formatMoney(inv.amountCents / 100, inv.currency, locale)} · {inv.status}
                    </dd>
                  </div>
                ))
              )}
            </dl></section>
            <p className="pf-drawer__note">{t('console.accountLogged' as MessageKey)}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** The in-product page: overview tiles, the list, and a way to Curahold's own console when there is one. */
export function PlatformConsolePage() {
  const { t, locale } = useI18n();
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
        if (!a.platform || a.secondStepNeeded) return;
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
    setAccess(null);
    setOverview(null);
    setCustomers(null);
    setAttempt((x) => x + 1);
  }, []);
  const loadOne = useCallback((id: string) => get<PlatformCustomerDetail>(`/platform/customers/${id}`), []);
  const close = useCallback(() => setOpenId(null), []);

  if (failed) return <div className="pf"><LoadError onRetry={retry} /></div>;
  if (!access) return <div className="pf"><SkeletonRows rows={6} label={t('common.loading')} /></div>;
  if (access.secondStepNeeded) return <div className="pf"><EmptyState icon="lock" title={t('errors.staff_second_step')} /></div>;
  if (!access.platform) return <div className="pf"><EmptyState icon="lock" title={t('platform.denied' as MessageKey)} /></div>;

  const n = (v: number) => formatNumber(v, locale);
  const usd = (v: number, cur: string) => formatMoney(v, cur, locale, { compact: v >= 10_000 });
  const o = overview;
  const tile = (label: string, value: string, lead?: boolean) => (
    <div className="ctile" data-lead={lead ? '' : undefined}>
      <dt className="ctile__label">{label}</dt>
      <dd className="ctile__value">{value}</dd>
    </div>
  );

  return (
    <div className="pf">
      <header className="pf__head">
        <div>
          <h1 className="pf__title">{t('platform.title' as MessageKey)}</h1>
          <p className="pf__sub">{t('platform.subtitle' as MessageKey)}</p>
        </div>
        {access.consoleUrl ? (
          <a className="btn btn--primary" href={access.consoleUrl} target="_blank" rel="noreferrer">
            <Icon name="external" size={16} />
            {t('console.open' as MessageKey)}
          </a>
        ) : null}
      </header>
      {o && !o.billingSchema ? <p className="pf__note">{t('platform.legacyNote' as MessageKey)}</p> : null}
      {!o || !customers ? (
        <SkeletonRows rows={6} label={t('common.loading')} />
      ) : (
        <>
          <dl className="ctiles" aria-label={t('platform.overview' as MessageKey)}>
            {tile(t('platform.tile.mrr' as MessageKey), usd(o.mrr, o.currency), true)}
            {tile(t('platform.tile.arr' as MessageKey), usd(o.arr, o.currency))}
            {tile(t('platform.tile.customers' as MessageKey), n(o.totals.customers))}
            {tile(t('platform.tile.active' as MessageKey), n(o.totals.active))}
            {tile(t('platform.tile.trialing' as MessageKey), n(o.totals.trialing))}
            {tile(t('platform.tile.pastDue' as MessageKey), n(o.totals.pastDue))}
            {tile(t('platform.tile.canceled' as MessageKey), n(o.totals.canceled))}
          </dl>
          <section className="pf-sec" aria-labelledby="pf-customers">
            <h2 className="pf-sec__title" id="pf-customers">{t('platform.customers' as MessageKey)}</h2>
            {customers.length === 0 ? <EmptyState icon="building" title={t('platform.empty' as MessageKey)} compact /> : <CustomerList customers={customers} onOpen={setOpenId} />}
          </section>
        </>
      )}
      {openId && <CustomerDrawer orgId={openId} load={loadOne} onClose={close} />}
    </div>
  );
}
