// The platform owner's business metrics: the whole business across every
// company, on one screen, only for the owner. It polls the server so the
// numbers stay current while the screen is open. The figures are only ever as
// real as the data behind them — a badge says live or demo.
import { useEffect, useRef, useState } from 'react';
import { get } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useMoney } from '../lib/money';
import { useStore } from '../lib/store';
import type { MessageKey } from '../../../shared/src/i18n';
import type { MetricPoint, PlatformMetrics } from '../../../shared/src/metrics';

const REFRESH_MS = 45_000;
const VB_W = 300;
const VB_H = 120;

/** A filled line over a short series. Labels are left to the surrounding card. */
function LineChart({ points }: { points: MetricPoint[] }) {
  if (points.length < 2) return <Empty />;
  const xs = points.map((_, i) => (i / (points.length - 1)) * VB_W);
  const max = Math.max(1, ...points.map((p) => p.v));
  const y = (v: number) => VB_H - 8 - (v / max) * (VB_H - 16);
  const line = points.map((p, i) => `${xs[i].toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = `0,${VB_H} ${line} ${VB_W},${VB_H}`;
  const last = points.length - 1;
  return (
    <svg className="mchart" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" aria-hidden="true">
      <polygon className="mchart__area" points={area} />
      <polyline className="mchart__line" points={line} vectorEffect="non-scaling-stroke" />
      <circle className="mchart__dot" cx={xs[last]} cy={y(points[last].v)} r={3} />
    </svg>
  );
}

/** Vertical bars over a short series. */
function BarChart({ points }: { points: MetricPoint[] }) {
  if (!points.length) return <Empty />;
  const max = Math.max(1, ...points.map((p) => p.v));
  const gap = 4;
  const w = (VB_W - gap * (points.length - 1)) / points.length;
  return (
    <svg className="mchart" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" aria-hidden="true">
      {points.map((p, i) => {
        const h = (p.v / max) * (VB_H - 12);
        return <rect key={i} className="mchart__bar" x={i * (w + gap)} y={VB_H - h} width={w} height={Math.max(1, h)} rx={2} />;
      })}
    </svg>
  );
}

function Empty() {
  const { t } = useI18n();
  return (
    <svg className="mchart" viewBox={`0 0 ${VB_W} ${VB_H}`} aria-hidden="true">
      <text className="mchart__empty" x={VB_W / 2} y={VB_H / 2} textAnchor="middle" dominantBaseline="middle">
        {t('metrics.empty')}
      </text>
    </svg>
  );
}

export function MetricsPage() {
  const { t, locale } = useI18n();
  const money = useMoney();
  const { me } = useStore();
  const owner = !!me.owner;
  const [m, setM] = useState<PlatformMetrics | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (!owner) return;
    let live = true;
    const load = () =>
      get<PlatformMetrics>('/metrics')
        .then((d) => live && (setM(d), (loaded.current = true)))
        .catch(() => undefined);
    load();
    const id = window.setInterval(() => document.visibilityState === 'visible' && load(), REFRESH_MS);
    const onVis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      live = false;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [owner]);

  if (!owner) return <div className="metrics"><p className="metrics__denied">{t('metrics.denied')}</p></div>;

  const nf = new Intl.NumberFormat(locale);
  const n = (v: number) => nf.format(Math.round(v));
  const usd = (v: number) => money.format(v, 'USD', v >= 10_000);
  const pct = (v: number) => `${Math.round(v * 100)}%`;

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
          {m ? <span className="metrics__time">{t('metrics.asOf', { time: new Date(m.asOf).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) })}</span> : null}
        </div>
      </div>
      {m?.mode === 'demo' ? <p className="metrics__note">{t('metrics.demoNote')}</p> : null}

      {/* Revenue */}
      <section className="metrics__sec">
        <h2>{t('metrics.revenue')}</h2>
        <div className="mtiles">
          {tile(t('metrics.mrr'), usd(r?.mrr ?? 0), undefined, true)}
          {tile(t('metrics.arr'), usd(r?.arr ?? 0))}
          {tile(t('metrics.payingOrgs'), n(r?.payingOrgs ?? 0))}
          {tile(t('metrics.arpa'), usd(r?.arpa ?? 0))}
          {tile(t('metrics.newPaying'), n(r?.newPaying30 ?? 0))}
        </div>
        <div className="mcards">
          <div className="mcard">
            <p className="mcard__title">{t('metrics.buildup')}</p>
            <LineChart points={r?.buildup ?? []} />
          </div>
          <div className="mcard">
            <p className="mcard__title">{t('metrics.byPlan')}</p>
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
        <div className="mtiles">
          {tile(t('metrics.orgs'), n(cu?.orgs ?? 0), undefined, true)}
          {tile(t('metrics.paying'), n(cu?.paying ?? 0))}
          {tile(t('metrics.trialing'), n(cu?.trialing ?? 0))}
          {tile(t('metrics.churned'), n(cu?.churned ?? 0))}
          {tile(t('metrics.conversion'), pct(cu?.conversion ?? 0))}
        </div>
        <div className="mcards">
          <div className="mcard">
            <p className="mcard__title">{t('metrics.funnel')}</p>
            <div className="mfunnel">
              {(cu?.funnel ?? []).map((f) => (
                <div className="mfunnel__row" key={f.stage}>
                  <span className="mfunnel__label">{t(`metrics.funnel.${f.stage}` as MessageKey)}</span>
                  <span className="mfunnel__track"><span className="mfunnel__fill" style={{ width: `${(f.n / funnelMax) * 100}%` }} /></span>
                  <span className="mfunnel__n">{n(f.n)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mcard">
            <p className="mcard__title">{t('metrics.newOrgs')}</p>
            <BarChart points={cu?.newOrgs ?? []} />
          </div>
          <div className="mcard">
            <p className="mcard__title">{t('metrics.topOrgs')}</p>
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
        <div className="mtiles">
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
          <div className="mcard">
            <p className="mcard__title">{t('metrics.dauTrend')}</p>
            <LineChart points={en?.dauTrend ?? []} />
          </div>
        </div>
      </section>

      {/* Product usage */}
      <section className="metrics__sec">
        <h2>{t('metrics.usage')}</h2>
        <div className="mtiles">
          {tile(t('metrics.tasks'), n(us?.tasks ?? 0), undefined, true)}
          {tile(t('metrics.boards'), n(us?.boards ?? 0))}
          {tile(t('metrics.meetings'), n(us?.meetings ?? 0))}
          {tile(t('metrics.records'), n(us?.records ?? 0))}
          {tile(t('metrics.comments'), n(us?.comments ?? 0))}
          {tile(t('metrics.hours'), n((us?.minutes ?? 0) / 60))}
          {tile(t('metrics.perOrg'), n(us?.tasksPerOrg ?? 0))}
        </div>
        <div className="mcards">
          <div className="mcard">
            <p className="mcard__title">{t('metrics.created')}</p>
            <BarChart points={us?.created ?? []} />
          </div>
        </div>
      </section>
    </div>
  );
}
