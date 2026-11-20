// "▲ +3 on the month before": how a figure moved since the period before it, under a KPI tile or a report's one
// figure. The arrow, the signed amount and the period are all in words and icon; colour only repeats them, and only
// when the screen says which way is better (`good`) — a report's own figure does not know, so it stays neutral.
// The previous value comes from the server (api/src/lib/reportEngine.ts previousOf, routes/reports.ts work totals).
import type { MessageKey } from '../../../shared/src/i18n';
import { useI18n } from '../lib/i18n';
import { Icon } from './icons';

/** The period a figure is compared with. */
export type ChangePeriod = { period: 'week' | 'month' | 'quarter' | 'year' } | { period: 'days'; days: number };

/** The change from `before` to `now` over `period`, formatted with `show`; `good` says which way is better news. */
export function Change({ now, before, show, good, ...p }: { now: number; before: number; show: (v: number) => string; good?: 'up' | 'down' } & ChangePeriod) {
  const { t } = useI18n();
  const period = p.period === 'days' ? t('change.period.days', { n: p.days }) : t(`change.period.${p.period}` as MessageKey);
  const diff = Math.round((now - before) * 10) / 10;
  if (diff === 0)
    return (
      <span className="change" data-dir="same">
        <Icon name="dot" size={14} />
        <span>{t('change.same', { period })}</span>
      </span>
    );
  const up = diff > 0;
  const better = good ? up === (good === 'up') : undefined;
  return (
    <span className="change" data-dir={up ? 'up' : 'down'} data-good={better === undefined ? undefined : better ? 'yes' : 'no'}>
      <Icon name={up ? 'chevronUp' : 'chevronDown'} size={14} />
      <span>{t('change.by', { delta: `${up ? '+' : '−'}${show(Math.abs(diff))}`, period })}</span>
      {better !== undefined && <span className="sr-only">{`, ${t(better ? 'change.better' : 'change.worse')}`}</span>}
    </span>
  );
}
