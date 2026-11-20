// The sprint's burndown and its facts: axes, the ideal line resting on the weekend,
// what is actually left, the scope as a step when work is added or taken out, and
// today. Plain SVG for the lines; labels, dots and markers are HTML placed with
// custom properties, so they keep their size, read in the person's language and
// mirror right-to-left with the page.
import { useEffect, useState, type CSSProperties } from 'react';
import { burndownSeries, type BurndownSeries } from '../../../shared/src/burndown';
import type { SprintBurndown, SprintSummary } from '../../../shared/src/model';
import { get } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useFormat } from '../lib/useFormat';
import { ISSUE_TYPES } from '../../../shared/src/model';
import '../surfaces/product.css';

/** The burndown of one sprint, read again when `refreshKey` changes. */
export function useBurndown(sprintId: string | null, refreshKey: number) {
  const [data, setData] = useState<SprintBurndown | null>(null);
  useEffect(() => {
    if (!sprintId) return;
    let live = true;
    get<{ burndown: SprintBurndown }>(`/sprints/${sprintId}/burndown`)
      .then((r) => live && setData(r.burndown))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [sprintId, refreshKey]);
  return data && data.sprintId === sprintId ? data : null;
}

/** A round top for the y axis: 5, 10, 20, 25, 40, 50 … */
function niceTop(v: number): number {
  const step = v <= 10 ? 2 : v <= 25 ? 5 : v <= 60 ? 10 : v <= 150 ? 25 : 10 ** Math.floor(Math.log10(v));
  return Math.max(step, Math.ceil(v / step) * step);
}

/** How many working days are left after today, up to the planned end. */
export function workingDaysLeft(s: BurndownSeries, today: string): number {
  return s.days.filter((d, i) => i <= s.endIndex && d.day > today && !d.weekend).length;
}

/** A sprint's burndown: points left per day against the ideal line. */
export function BurndownChart({ data }: { data: SprintBurndown }) {
  const { t } = useI18n();
  const f = useFormat();
  const s = burndownSeries(data);
  const n = s.days.length;
  if (!n) return null;
  const top = niceTop(s.top);
  const x = (i: number) => ((i + 0.5) / n) * 100;
  const y = (v: number) => 100 - (v / top) * 100;
  const pts = (k: 'ideal' | 'remaining') =>
    s.days
      .map((d, i) => (d[k] == null ? null : `${x(i).toFixed(2)},${y(d[k]!).toFixed(2)}`))
      .filter(Boolean)
      .join(' ');
  // The scope as a step: flat until the day it changed, then straight up (or down).
  let scope = '';
  let last: number | null = null;
  s.days.forEach((d, i) => {
    if (d.scope == null) return;
    if (last === null) scope = `M${x(Math.max(0, i - 0.5)).toFixed(2)},${y(s.start).toFixed(2)} L${x(i).toFixed(2)},${y(s.start).toFixed(2)}`;
    scope += ` L${x(i).toFixed(2)},${y(last ?? s.start).toFixed(2)} L${x(i).toFixed(2)},${y(d.scope).toFixed(2)}`;
    last = d.scope;
  });
  const today = s.todayIndex >= 0 ? s.days[s.todayIndex] : null;
  const pts1 = (v: number) => t('pm.points.short', { n: f.number(v, { digits: v % 1 ? 1 : 0 }) });
  const signed = (v: number) => `${v > 0 ? '+' : '−'}${f.number(Math.abs(v), { digits: v % 1 ? 1 : 0 })}`;
  const remaining = s.remaining ?? s.start;
  const idealNow = today ? today.ideal : null;
  const summary = [
    t('pm.burndown.label', { remaining: f.number(remaining), total: f.number(last ?? s.start) }),
    idealNow != null ? t('pm.burndown.idealNow', { n: f.number(idealNow, { digits: idealNow % 1 ? 1 : 0 }) }) : '',
    s.added ? t('pm.burndown.added', { n: f.number(s.added) }) : '',
    s.removed ? t('pm.burndown.removed', { n: f.number(s.removed) }) : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <figure className="pm-bd">
      <figcaption className="pm-bd__head">
        <span className="pm-bd__title">{t('pm.burndown')}</span>
        <span className="pm-bd__now num">{t('pm.burndown.left', { n: f.number(remaining) })}</span>
        <ul className="pm-bd__key" aria-hidden="true">
          <li>
            <i className="pm-bd__swatch pm-bd__swatch--ideal" />
            {t('pm.burndown.ideal')}
          </li>
          <li>
            <i className="pm-bd__swatch pm-bd__swatch--actual" />
            {t('pm.burndown.actual')}
          </li>
          <li>
            <i className="pm-bd__swatch pm-bd__swatch--scope" />
            {t('pm.burndown.scope')}
          </li>
        </ul>
      </figcaption>
      <p className="sr-only">{summary}</p>
      <div className="pm-bd__frame" aria-hidden="true">
        <div className="pm-bd__y">
          {[top, top / 2, 0].map((v) => (
            <span key={v} className="num" style={{ '--y': `${y(v)}%` } as CSSProperties}>
              {f.number(v, { digits: v % 1 ? 1 : 0 })}
            </span>
          ))}
        </div>
        <div className="pm-bd__plot">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            {s.days.map((d, i) => (d.weekend ? <rect key={d.day} className="pm-bd__weekend" x={(i / n) * 100} y={0} width={100 / n} height={100} /> : null))}
            {[0, 50, 100].map((v) => (
              <line key={v} className="pm-bd__grid" x1={0} x2={100} y1={v} y2={v} vectorEffect="non-scaling-stroke" />
            ))}
            {today && <line className="pm-bd__todayline" x1={x(s.todayIndex)} x2={x(s.todayIndex)} y1={0} y2={100} vectorEffect="non-scaling-stroke" />}
            <polyline className="pm-bd__ideal" points={pts('ideal')} vectorEffect="non-scaling-stroke" />
            {scope && <path className="pm-bd__scope" d={scope} vectorEffect="non-scaling-stroke" />}
            <polyline className="pm-bd__actual" points={pts('remaining')} vectorEffect="non-scaling-stroke" />
          </svg>
          {s.days.map((d, i) =>
            d.read && d.remaining != null ? (
              <i key={d.day} className="pm-bd__dot" data-today={d.today || undefined} style={{ '--x': `${x(i)}%`, '--y': `${y(d.remaining)}%` } as CSSProperties} title={`${f.date(d.day)} · ${pts1(d.remaining)}`} />
            ) : null,
          )}
          {s.days.map((d, i) =>
            d.change && d.scope != null ? (
              <span key={`c${d.day}`} className="pm-bd__change num" data-down={d.change < 0 || undefined} style={{ '--x': `${x(i)}%`, '--y': `${y(Math.max(d.scope, d.scope - d.change))}%` } as CSSProperties}>
                <bdi dir="ltr">{signed(d.change)}</bdi>
              </span>
            ) : null,
          )}
          {today && (
            <span className="pm-bd__today" style={{ '--x': `${x(s.todayIndex)}%` } as CSSProperties}>
              {t('pm.burndown.today')}
            </span>
          )}
        </div>
        <div className="pm-bd__x">
          {s.days.map((d, i) => (
            <span key={d.day} className="num" data-weekend={d.weekend || undefined} data-today={d.today || undefined} data-edge={i === 0 || i === n - 1 || undefined}>
              {f.number(Number(d.day.slice(8, 10)))}
            </span>
          ))}
        </div>
      </div>
      <div className="pm-bd__foot muted">
        <span>{f.date(s.days[0].day, { day: 'numeric', month: 'short' })}</span>
        <span>{f.date(s.days[n - 1].day, { day: 'numeric', month: 'short' })}</span>
      </div>
    </figure>
  );
}

/** The sprint's figures beside its burndown: points done, items, scope added, what is unestimated, days left. */
export function SprintFacts({ summary, burndown }: { summary: SprintSummary; burndown: SprintBurndown | null }) {
  const { t } = useI18n();
  const f = useFormat();
  const s = burndown ? burndownSeries(burndown) : null;
  const left = s && burndown?.today ? workingDaysLeft(s, burndown.today) : null;
  const pct = summary.totalPoints > 0 ? Math.min(100, Math.round((summary.donePoints / summary.totalPoints) * 100)) : 0;
  const facts: [string, string, string?][] = [
    [t('pm.points.total'), f.number(summary.totalPoints)],
    [t('pm.points.done'), f.number(summary.donePoints), 'done'],
    [t('pm.summary.items'), `${f.number(summary.doneCount)} / ${f.number(summary.itemCount)}`],
    [t('pm.points.unestimated'), f.number(summary.unestimated), summary.unestimated ? 'soon' : undefined],
  ];
  if (s) facts.push([t('pm.burndown.scopeChange'), [s.added ? `+${f.number(s.added)}` : '', s.removed ? `−${f.number(s.removed)}` : ''].filter(Boolean).join(' / ') || f.number(0), s.added ? 'soon' : undefined]);
  if (left != null && burndown?.endsOn && !burndown.closedOn) facts.push([t('pm.sprint.workDaysLeft'), f.number(left)]);
  return (
    <section className="pm-summary" aria-label={t('pm.summary.title')}>
      <div className="pm-summary__lead">
        <strong className="num">{f.percent(pct)}</strong>
        <span className="muted">{t('pm.summary.progress', { done: f.number(summary.donePoints), total: f.number(summary.totalPoints) })}</span>
      </div>
      <span className="pm-bar" role="progressbar" aria-label={t('pm.points.done')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <span style={{ '--w': `${pct}%` } as CSSProperties} />
      </span>
      <dl className="pm-facts">
        {facts.map(([label, value, tone]) => (
          <div key={label} className="pm-fact" data-tone={tone}>
            <dt>{label}</dt>
            <dd className="num">
              <bdi dir="ltr">{value}</bdi>
            </dd>
          </div>
        ))}
      </dl>
      <div className="pm-types">
        {ISSUE_TYPES.filter((k) => summary.byType[k]?.count).map((k) => (
          <span key={k} className="schip" data-tone="slate">
            {t(`pm.type.${k}`)} {f.number(summary.byType[k].done)}/{f.number(summary.byType[k].count)} · {t('pm.points.short', { n: f.number(summary.byType[k].points) })}
          </span>
        ))}
      </div>
    </section>
  );
}
