// The platform owner's business metrics: the whole business across every
// company, on one screen, only for the owner. It polls the server so the
// numbers stay current while the screen is open. The figures are only ever as
// real as the data behind them — a badge says live or demo.
import { useEffect, useRef, useState } from 'react';
import { EmptyState, LoadError, SkeletonRows } from '../components/Empty';
import { ApiFailure, get } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useMoney } from '../lib/money';
import { useStore } from '../lib/store';
import type { MessageKey } from '../../../shared/src/i18n';
import type { MetricPoint, PlatformMetrics } from '../../../shared/src/metrics';
import type { CSSProperties } from 'react';
import type { PlatformAccess } from '../../../shared/src/platform';
import { ConsoleElsewhere } from './PlatformConsole';
import { ConsoleChart, periodOf } from './ConsoleChart';
import { formatClock, formatNumber, formatPercent } from '../lib/format';
import '../surfaces/console.css';

const REFRESH_MS = 45_000;

/** Not the owner here: on the hosted service, Curahold's team finds the numbers in its console. */
function NotHere() {
  const { t } = useI18n();
  const [access, setAccess] = useState<PlatformAccess | null>(null);
  useEffect(() => {
    let live = true;
    get<PlatformAccess>('/platform/access')
      .then((a) => live && setAccess(a))
      .catch(() => live && setAccess({ owner: false, staff: false, platform: false }));
    return () => {
      live = false;
    };
  }, []);
  return <ConsoleElsewhere access={access} denied={t('metrics.denied')} />;
}

/** Whole-business metrics for the platform owner (GET /api/metrics). */
export function MetricsPage() {
  const { t, locale } = useI18n();
  const money = useMoney();
  const { me } = useStore();
  const owner = !!me.owner;
  const [m, setM] = useState<PlatformMetrics | null>(null);
  const loaded = useRef(false);
  // A first load that fails says so; a later refresh that fails keeps the numbers already shown.
  const [failed, setFailed] = useState(false);
  const [needsStep, setNeedsStep] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!owner) return;
    let live = true;
    const load = () =>
      get<PlatformMetrics>('/metrics')
        .then((d) => live && (setM(d), setFailed(false), (loaded.current = true)))
        .catch((e) => {
          if (!live) return;
          if (e instanceof ApiFailure && e.code === 'staff_second_step') setNeedsStep(true);
          else if (!loaded.current) setFailed(true);
        });
    load();
    const id = window.setInterval(() => document.visibilityState === 'visible' && load(), REFRESH_MS);
    const onVis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      live = false;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [owner, attempt]);

  if (!owner) return <div className="metrics"><NotHere /></div>;
  if (needsStep) return <div className="metrics"><EmptyState icon="lock" title={t('errors.staff_second_step')} /></div>;

  const n = (v: number) => formatNumber(Math.round(v), locale);
  const usd = (v: number) => money.format(v, 'USD', v >= 10_000);
  const pct = (v: number) => formatPercent(v * 100, locale);
  const chart = (title: string, kind: 'line' | 'columns', points: MetricPoint[], cash?: boolean) => (
    <div className="mcard">
      <h3 className="mcard__title">{title}</h3>
      {points.length ? (
        <ConsoleChart
          kind={kind}
          points={points}
          label={title}
          value={(v) => (cash ? usd(v) : n(v))}
          tick={(v, short) => (cash ? money.format(v, 'USD', short) : formatNumber(v, locale, { compact: short }))}
          when={(p) => periodOf(p, locale)}
        />
      ) : (
        <p className="mcard__empty">{t('metrics.empty')}</p>
      )}
    </div>
  );

  const tile = (label: string, value: string, sub?: string, lead?: boolean) => (
    <div className={`mtile${lead ? ' mtile--lead' : ''}`}>
      <div className="mtile__label">{label}</div>
      <div className="mtile__value">{value}</div>
      {sub ? <div className="mtile__sub">{sub}</div> : null}
    </div>
  );

  const r = m?.revenue;
  const cu = m?.customers;
  const en = m?.engagement;
  const us = m?.usage;
  const funnelMax = Math.max(1, ...(cu?.funnel.map((f) => f.n) ?? [1]));

  return (
    <div className="metrics">
      <div className="metrics__head">
        <div>
          <h1 className="metrics__title">{t('metrics.title')}</h1>
          <p className="metrics__sub">{t('metrics.subtitle')}</p>
        </div>
        <div className="metrics__end">
          {m ? <span className="metrics__badge" data-mode={m.mode}>{t(m.mode === 'live' ? 'metrics.live' : 'metrics.demo')}</span> : null}
          {m ? <span className="metrics__time">{t('metrics.asOf', { time: formatClock(m.asOf, locale) })}</span> : null}
        </div>
      </div>
      {m?.mode === 'demo' ? <p className="metrics__note">{t('metrics.demoNote')}</p> : null}

      {!m ? (
        failed ? (
          <LoadError onRetry={() => { setFailed(false); setAttempt((n) => n + 1); }} />
        ) : (
          <SkeletonRows rows={6} label={t('common.loading')} />
        )
      ) : (
        <>

      {/* Revenue */}
      <section className="metrics__sec">
        <h2>{t('metrics.revenue')}</h2>
        <div className="mtiles" data-n={5}>
          {tile(t('metrics.mrr'), usd(r?.mrr ?? 0), undefined, true)}
          {tile(t('metrics.arr'), usd(r?.arr ?? 0))}
          {tile(t('metrics.payingOrgs'), n(r?.payingOrgs ?? 0))}
          {tile(t('metrics.arpa'), usd(r?.arpa ?? 0))}
          {tile(t('metrics.newPaying'), n(r?.newPaying30 ?? 0))}
        </div>
        <div className="mcards">
          {chart(t('metrics.buildup'), 'line', r?.buildup ?? [], true)}
          <div className="mcard">
            <h3 className="mcard__title">{t('metrics.byPlan')}</h3>
            <div className="mlist">
              {(r?.byPlan ?? []).map((p) => (
                <div className="mlist__row" key={p.plan}>
                  <span className="mlist__name">{t(`billing.plan.${p.plan}` as MessageKey)}</span>
                  <span className="mlist__plan">{n(p.orgs)}</span>
                  <span className="mlist__mrr">{usd(p.mrr)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Customers */}
      <section className="metrics__sec">
        <h2>{t('metrics.customers')}</h2>
        <div className="mtiles" data-n={5}>
          {tile(t('metrics.orgs'), n(cu?.orgs ?? 0), undefined, true)}
          {tile(t('metrics.paying'), n(cu?.paying ?? 0))}
          {tile(t('metrics.trialing'), n(cu?.trialing ?? 0))}
          {tile(t('metrics.churned'), n(cu?.churned ?? 0))}
          {tile(t('metrics.conversion'), pct(cu?.conversion ?? 0))}
        </div>
        <div className="mcards">
          <div className="mcard">
            <h3 className="mcard__title">{t('metrics.funnel')}</h3>
            <div className="mfunnel">
              {(cu?.funnel ?? []).map((f) => (
                <div className="mfunnel__row" key={f.stage}>
                  <span className="mfunnel__label">{t(`metrics.funnel.${f.stage}` as MessageKey)}</span>
                  <span className="mfunnel__track"><span className="mfunnel__fill" style={{ '--w': `${(f.n / funnelMax) * 100}%` } as CSSProperties} /></span>
                  <span className="mfunnel__n">{n(f.n)}</span>
                </div>
              ))}
            </div>
          </div>
          {chart(t('metrics.newOrgs'), 'columns', cu?.newOrgs ?? [])}
          <div className="mcard">
            <h3 className="mcard__title">{t('metrics.topOrgs')}</h3>
            <div className="mlist">
              {(cu?.top ?? []).map((o, i) => (
                <div className="mlist__row" key={i}>
                  <span className="mlist__name">{o.name}</span>
                  <span className="mlist__plan">{o.plan}</span>
                  <span className="mlist__mrr">{usd(o.mrr)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Engagement */}
      <section className="metrics__sec">
        <h2>{t('metrics.engagement')}</h2>
        <div className="mtiles" data-n={8}>
          {tile(t('metrics.dau'), n(en?.dau ?? 0), undefined, true)}
          {tile(t('metrics.wau'), n(en?.wau ?? 0))}
          {tile(t('metrics.mau'), n(en?.mau ?? 0))}
          {tile(t('metrics.stickiness'), pct(en?.stickiness ?? 0))}
          {tile(t('metrics.activeUsers'), n(en?.activeUsers ?? 0))}
          {tile(t('metrics.seatsFull'), n(en?.seats.full ?? 0))}
          {tile(t('metrics.seatsViewer'), n(en?.seats.viewer ?? 0))}
          {tile(t('metrics.churn30'), n(en?.churn30 ?? 0))}
        </div>
        <div className="mcards">
          {chart(t('metrics.dauTrend'), 'line', en?.dauTrend ?? [])}
        </div>
      </section>

      {/* Product usage */}
      <section className="metrics__sec">
        <h2>{t('metrics.usage')}</h2>
        <div className="mtiles" data-n={7}>
          {tile(t('metrics.tasks'), n(us?.tasks ?? 0), undefined, true)}
          {tile(t('metrics.boards'), n(us?.boards ?? 0))}
          {tile(t('metrics.meetings'), n(us?.meetings ?? 0))}
          {tile(t('metrics.records'), n(us?.records ?? 0))}
          {tile(t('metrics.comments'), n(us?.comments ?? 0))}
          {tile(t('metrics.hours'), n((us?.minutes ?? 0) / 60))}
          {tile(t('metrics.perOrg'), n(us?.tasksPerOrg ?? 0))}
        </div>
        <div className="mcards">
          {chart(t('metrics.created'), 'columns', us?.created ?? [])}
        </div>
      </section>
        </>
      )}
    </div>
  );
}
