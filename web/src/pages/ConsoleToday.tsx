// The console's first screen: how the business is today, and who needs the
// team — at a glance, on a phone too. The numbers come from the server's
// /api/desk/today; the console reloads them when its live room says something moved.
import type { MessageKey } from '../../../shared/src/i18n';
import type { ConsoleAttention, ConsoleToday } from '../../../shared/src/console';
import { EmptyState } from '../components/Empty';
import { Icon, type IconName } from '../components/icons';
import { formatClock, formatDate, formatMoney, formatMonth, formatNumber, formatPercent } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { relativeTime } from '../lib/time';

const VB_W = 300;
const VB_H = 80;

/** How MRR built up month by month: one quiet line, the last point marked. */
function Trend({ points, label }: { points: { t: string; v: number }[]; label: string }) {
  if (points.length < 2) return null;
  const max = Math.max(1, ...points.map((p) => p.v));
  const x = (i: number) => (i / (points.length - 1)) * VB_W;
  const y = (v: number) => VB_H - 6 - (v / max) * (VB_H - 12);
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const last = points.length - 1;
  return (
    <svg className="ctoday__trend" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <polygon className="ctoday__trend-area" points={`0,${VB_H} ${line} ${VB_W},${VB_H}`} />
      <polyline className="ctoday__trend-line" points={line} vectorEffect="non-scaling-stroke" />
      <circle className="ctoday__trend-dot" cx={x(last)} cy={y(points[last].v)} r={3} />
    </svg>
  );
}

const KIND_ICON: Record<ConsoleAttention['kind'], IconName> = { request: 'lifebuoy', payment: 'alert', trial: 'hourglass' };

export function TodayView({ data, onRequest, onCompany }: { data: ConsoleToday; onRequest: (ref: string) => void; onCompany: (orgId: string) => void }) {
  const { t, locale } = useI18n();
  const n = (v: number) => formatNumber(v, locale);
  const pct = (v: number | null) => (v === null ? '—' : formatPercent(v * 100, locale));
  const usd = (v: number) => formatMoney(v, data.currency, locale, { compact: v >= 1_000_000 });
  const { revenue: r, customers: c, support: s } = data;

  const tile = (key: string, label: string, value: string, sub: string, lead?: boolean) => (
    <div className="ctile" data-lead={lead ? '' : undefined} key={key}>
      <dt className="ctile__label">{label}</dt>
      <dd className="ctile__value">{value}</dd>
      <dd className="ctile__sub">{sub}</dd>
    </div>
  );

  const row = (a: ConsoleAttention, i: number) => {
    const open = () => (a.kind === 'request' ? onRequest(a.ref) : onCompany(a.orgId));
    const what =
      a.kind === 'request'
        ? a.title
        : a.kind === 'payment'
          ? t('console.need.payment' as MessageKey, { company: a.company })
          : t('console.need.trial' as MessageKey, { company: a.company });
    const meta =
      a.kind === 'request'
        ? [a.company, a.at ? relativeTime(a.at, t) : null].filter(Boolean).join(' · ')
        : a.kind === 'trial' && a.at
          ? t('console.need.trialEnds' as MessageKey, { date: formatDate(a.at, locale, { day: 'numeric', month: 'short' }) })
          : a.at
            ? t('console.need.since' as MessageKey, { date: formatDate(a.at, locale, { day: 'numeric', month: 'short' }) })
            : '';
    return (
      <li key={`${a.kind}:${i}`}>
        <button type="button" className="cneed" data-kind={a.kind} onClick={open}>
          <span className="cneed__icon" aria-hidden="true">
            <Icon name={KIND_ICON[a.kind]} size={16} />
          </span>
          <span className="cneed__main">
            <span className="cneed__what">{what}</span>
            <span className="cneed__meta">{meta}</span>
            {a.kind === 'request' && a.blocking ? <span className="flag flag--late">{t('desk.blocking')}</span> : null}
          </span>
          <Icon name="chevronRight" size={16} className="cneed__go" />
        </button>
      </li>
    );
  };

  return (
    <div className="ctoday">
      <header className="ctoday__head">
        <div>
          <h1 className="ctoday__title">{t('console.today' as MessageKey)}</h1>
          <p className="ctoday__date">{formatDate(data.asOf, locale, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <p className="ctoday__live" data-mode={data.mode}>
          <span className="ctoday__dot" aria-hidden="true" />
          {t(data.mode === 'live' ? 'metrics.live' : 'metrics.demo')} · {t('metrics.asOf', { time: formatClock(data.asOf, locale) })}
        </p>
      </header>
      {data.mode === 'demo' ? <p className="ctoday__note">{t('metrics.demoNote')}</p> : null}

      <dl className="ctiles" aria-label={t('console.business' as MessageKey)}>
        {tile('mrr', t('metrics.mrr'), usd(r.mrr), r.mrrNew30 > 0 ? t('console.mrrNew' as MessageKey, { amount: usd(r.mrrNew30) }) : t('console.arrIs' as MessageKey, { amount: usd(r.arr) }), true)}
        {tile('arr', t('metrics.arr'), usd(r.arr), t('console.paying' as MessageKey, { n: n(c.paying) }))}
        {tile('trial', t('console.trialToPaid' as MessageKey), pct(data.trialToPaid.rate), data.trialToPaid.ended ? t('console.ofTrials' as MessageKey, { paid: n(data.trialToPaid.paid), ended: n(data.trialToPaid.ended), days: data.trialToPaid.days }) : t('console.noTrials' as MessageKey, { days: data.trialToPaid.days }))}
        {tile('act', t('console.activation' as MessageKey), pct(data.activation.rate), data.activation.started ? t('console.ofNew' as MessageKey, { activated: n(data.activation.activated), started: n(data.activation.started), days: data.activation.days }) : t('console.noNew' as MessageKey, { days: data.activation.days }))}
        {tile('churn', t('console.churn' as MessageKey), n(data.churn.companies), t('console.churnSub' as MessageKey, { rate: pct(data.churn.rate), days: data.churn.days }))}
      </dl>

      <div className="ctoday__cols">
        <section className="ccard ccard--need" aria-labelledby="cneed-h">
          <h2 className="ccard__title" id="cneed-h">
            {t('console.needsYou' as MessageKey)}
            {data.attention.length ? <span className="ccard__count">{n(data.attention.length)}</span> : null}
          </h2>
          {data.attention.length === 0 ? (
            <EmptyState icon="checkCircle" tone="done" compact title={t('console.needsNone' as MessageKey)} body={t('console.needsNoneBody' as MessageKey)} />
          ) : (
            <ul className="cneeds">{data.attention.map(row)}</ul>
          )}
        </section>

        <section className="ccard" aria-labelledby="cbiz-h">
          <h2 className="ccard__title" id="cbiz-h">{t('metrics.customers')}</h2>
          <dl className="cfacts">
            <div><dt>{t('metrics.orgs')}</dt><dd>{n(c.total)}</dd></div>
            <div><dt>{t('metrics.paying')}</dt><dd>{n(c.paying)}</dd></div>
            <div><dt>{t('metrics.trialing')}</dt><dd>{n(c.trialing)}</dd></div>
            <div><dt>{t('console.pastDue' as MessageKey)}</dt><dd>{n(c.pastDue)}</dd></div>
          </dl>
          <h2 className="ccard__title">{t('desk.title')}</h2>
          <dl className="cfacts">
            <div><dt>{t('desk.queue.received')}</dt><dd>{n(s.waiting)}</dd></div>
            <div><dt>{t('desk.queue.unclaimed')}</dt><dd>{n(s.unclaimed)}</dd></div>
            <div><dt>{t('desk.blocking')}</dt><dd>{n(s.blocking)}</dd></div>
            <div><dt>{t('desk.queue.mine')}</dt><dd>{n(s.mine)}</dd></div>
          </dl>
          {r.trend.length > 1 ? (
            <>
              <h2 className="ccard__title">{t('metrics.buildup')}</h2>
              <Trend points={r.trend} label={t('metrics.buildup')} />
              <p className="ctoday__axis" aria-hidden="true">
                <span>{formatMonth(r.trend[0].t, locale, { short: true, year: true })}</span>
                <span>{formatMonth(r.trend[r.trend.length - 1].t, locale, { short: true, year: true })}</span>
              </p>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
