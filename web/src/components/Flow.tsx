// Cycle time and throughput of a product board (GET /boards/:id/flow), on the Roadmap tab:
// how long work takes once it starts, per work type, and how much is finished each week.
// Drawn with the reports' own charts, so axes, units, reading values by keys and the
// table for screen readers come with them.
import { useCallback, useEffect, useState } from 'react';
import type { BoardFlow } from '../../../shared/src/flow';
import type { ReportResult } from '../../../shared/src/reports';
import { get } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useFormat } from '../lib/useFormat';
import { ReportChart } from './Charts';
import { LoadError, SkeletonRows } from './Empty';
import '../surfaces/product.css';

/** A board's flow figures (cycle time, throughput, ageing), with refresh. */
export function useFlow(boardId: string, refreshKey: number) {
  const [flow, setFlow] = useState<BoardFlow | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    setFailed(false);
    try {
      setFlow((await get<{ flow: BoardFlow }>(`/boards/${boardId}/flow`)).flow);
    } catch {
      setFailed(true);
    }
  }, [boardId]);
  useEffect(() => void load(), [load, refreshKey]);
  return { flow, failed, reload: load };
}

/** A board's flow report. */
export function FlowReport({ boardId, refreshKey }: { boardId: string; refreshKey: number }) {
  const { t } = useI18n();
  const f = useFormat();
  const { flow, failed, reload } = useFlow(boardId, refreshKey);
  const days = (v: number) => t('rb.unit.days', { n: f.number(v, { digits: 1 }) });
  return (
    <section className="pm-flow" aria-labelledby="pm-flow-title">
      <h3 className="section__head" id="pm-flow-title">
        <span>{t('pm.flow')}</span>
      </h3>
      <p className="field__hint">{t('pm.flow.hint', { n: f.number(flow?.weeks ?? 12) })}</p>
      {failed && !flow ? (
        <LoadError onRetry={() => void reload()} />
      ) : !flow ? (
        <SkeletonRows rows={3} label={t('common.loading')} />
      ) : flow.finished === 0 ? (
        <p className="muted">{t('pm.flow.none', { n: f.number(flow.weeks) })}</p>
      ) : (
        <>
          <dl className="pm-facts pm-facts--wide">
            <div className="pm-fact" data-tone="done">
              <dt>{t('pm.flow.median')}</dt>
              <dd className="num">{flow.all ? days(flow.all.median) : '–'}</dd>
            </div>
            <div className="pm-fact">
              <dt>{t('pm.flow.p85')}</dt>
              <dd className="num">{flow.all ? days(flow.all.p85) : '–'}</dd>
            </div>
            <div className="pm-fact">
              <dt>{t('pm.flow.finished', { n: f.number(flow.weeks) })}</dt>
              <dd className="num">{f.number(flow.finished)}</dd>
            </div>
          </dl>
          {flow.unstarted > 0 && <p className="field__hint">{t('pm.flow.unstarted', { n: f.number(flow.unstarted) })}</p>}
          <div className="pm-flow__charts">
            {flow.cycle.length > 0 && (
              <figure className="pm-flow__chart">
                <figcaption className="pm-flow__title">{t('pm.flow.byType')}</figcaption>
                <ReportChart result={cycleResult(flow, t)} chart="column" apart />
              </figure>
            )}
            <figure className="pm-flow__chart">
              <figcaption className="pm-flow__title">{t('pm.flow.weekly')}</figcaption>
              <ReportChart result={throughputResult(flow)} chart="column" />
            </figure>
          </div>
        </>
      )}
    </section>
  );
}

type T = ReturnType<typeof useI18n>['t'];

/** Median and 85th percentile side by side, per work type (never added up). */
function cycleResult(flow: BoardFlow, t: T): ReportResult {
  return {
    kind: 'ok',
    unit: 'days',
    total: flow.all?.p85 ?? 0,
    matched: flow.all?.count ?? 0,
    // Under a column the type's plain name: a gloss in brackets ("Research (spike)") would not fit a phone.
    groups: flow.cycle.map((c) => ({ key: c.type, label: t(`pm.type.${c.type}`).replace(/\s*[(（][^)）]*[)）]\s*$/, ''), value: c.p85, count: c.count, cells: [c.median, c.p85] })),
    series: [
      { key: 'median', label: t('pm.flow.medianShort'), color: 'sea' },
      { key: 'p85', label: t('pm.flow.p85Short'), color: 'honey' },
    ],
    bucket: null,
    table: null,
  };
}

/** Items finished per week, the current week last. */
function throughputResult(flow: BoardFlow): ReportResult {
  return {
    kind: 'ok',
    unit: 'count',
    total: flow.finished,
    matched: flow.finished,
    groups: flow.throughput.map((w) => ({ key: w.week, label: w.week, value: w.count, count: w.count })),
    series: [],
    bucket: 'week',
    table: null,
  };
}
