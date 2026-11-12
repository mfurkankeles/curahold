// Rhythm on screen: targets against the pipeline, when the next business
// review is due, and the settings for both (and for the nudges).
import { useMemo, useState } from 'react';
import type { Account, AccountField } from '../../../shared/src/model';
import type { AppRecord, RecordType } from '../../../shared/src/records';
import { DEFAULT_RHYTHM, TARGET_KINDS, TARGET_PERIODS, reviewDue, targetReport, type DealLike, type Period, type ReviewDue, type Rhythm, type TargetKind, type TargetRow } from '../../../shared/src/rhythm';
import { labelOf } from '../../../shared/src/fields';
import { ApiFailure, put } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { useShell } from '../lib/shell';
import { useStore } from '../lib/store';
import { todayIso } from '../lib/time';
import { useFieldFormat } from '../pages/Accounts';
import { EmptyState } from './Empty';
import { Icon } from './icons';
import { Avatar } from './ui';

export const useRhythm = (): Rhythm => useStore().me.org.rhythm ?? DEFAULT_RHYTHM;

/** Deals as the target sums need them: an open deal counts by how far along its stage is. */
export function dealsOf(type: RecordType, records: AppRecord[]): { deals: DealLike[]; hasKinds: boolean; money: AccountField | undefined } {
  const money = type.fields.find((f) => f.key === 'amount' && f.type === 'money') ?? type.fields.find((f) => f.type === 'money');
  const date = type.fields.find((f) => f.key === 'close_date') ?? type.fields.find((f) => f.type === 'date');
  const stage = type.fields.find((f) => f.key === 'stage' && f.type === 'select');
  const hasKinds = type.fields.some((f) => f.key === 'kind' && f.type === 'select');
  const stages = stage?.options ?? [];
  const deals = records
    .filter((r) => !r.archivedAt)
    .map((r) => {
      const at = stages.findIndex((o) => o.key === r.fields[stage?.key ?? '']);
      const status = r.fields.status == null ? null : String(r.fields.status);
      const planned = date ? r.fields[date.key] : null;
      return {
        ownerId: r.ownerId,
        amount: money ? Number(r.fields[money.key]) || 0 : 0,
        status,
        kind: r.fields.kind == null ? null : String(r.fields.kind),
        // A won deal with no date closed when it was last changed.
        closeDate: typeof planned === 'string' && planned ? planned : status === 'won' ? r.updatedAt.slice(0, 10) : null,
        weight: at < 0 ? 0 : (at + 1) / (stages.length + 1),
      };
    });
  return { deals, hasKinds, money };
}

function usePeriodLabel() {
  const { t, locale } = useI18n();
  return (p: Period) => {
    if (p.kind === 'year') return p.key;
    if (p.kind === 'quarter') return t('targets.quarter', { year: p.key.slice(0, 4), n: p.key.slice(-1) });
    return new Date(`${p.start}T00:00:00Z`).toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  };
}

const TONE: Record<TargetRow['state'], 'green' | 'amber' | 'red'> = { reached: 'green', ahead: 'green', on: 'amber', behind: 'red' };

function TargetBar({ row, cash, label }: { row: TargetRow; cash: (n: number) => string; label: string }) {
  const { t } = useI18n();
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / Math.max(row.target, 1)) * 100))}%`;
  const note =
    row.state === 'reached'
      ? t('targets.note.reached', { over: cash(row.won - row.target) })
      : row.state === 'ahead'
        ? t('targets.note.ahead', { expected: cash(Math.round(row.expected)) })
        : row.state === 'on'
          ? t('targets.note.on', { forecast: cash(Math.round(row.forecast)) })
          : t('targets.note.behind', { gap: cash(Math.round(row.gap)), week: cash(Math.round(row.perWeek)) });
  return (
    <div className="target" data-state={row.state}>
      <div className="target__head">
        <strong>{label}</strong>
        <span className="schip" data-tone={TONE[row.state]}>
          {t(`targets.state.${row.state}` as any)}
        </span>
        <span className="target__nums num">
          <b>{cash(row.won)}</b> / {cash(row.target)}
        </span>
      </div>
      <div className="target__track" role="img" aria-label={`${label}: ${cash(row.won)} / ${cash(row.target)}`}>
        <span className="target__open" style={{ width: pct(row.forecast) }} title={t('targets.forecast', { value: cash(Math.round(row.forecast)) })} />
        <span className="target__won" style={{ width: pct(row.won) }} />
        {row.state !== 'reached' && <i className="target__pace" style={{ left: pct(row.expected) }} title={t('targets.paceMark', { value: cash(Math.round(row.expected)) })} />}
      </div>
      <p className="target__note">{note}</p>
    </div>
  );
}

/**
 * This period's targets against what is won and what is still open.
 * `compact` is the one-line version above the pipeline.
 */
export function TargetsPanel({ type, records, compact }: { type: RecordType; records: AppRecord[]; compact?: boolean }) {
  const { t, locale } = useI18n();
  const { can, person } = useStore();
  const fmt = useFieldFormat();
  const rhythm = useRhythm();
  const periodLabel = usePeriodLabel();
  const { deals, hasKinds, money } = useMemo(() => dealsOf(type, records), [type, records]);
  const report = useMemo(() => targetReport(rhythm, deals, todayIso(), hasKinds), [rhythm, deals, hasKinds]);
  const cash = (n: number) => (money ? fmt(money, n) || '0' : String(n));
  const kindLabel = (k: TargetKind | 'all') => {
    if (k === 'all') return t('targets.all');
    const o = type.fields.find((f) => f.key === 'kind')?.options?.find((x) => x.key === k);
    return o ? labelOf(o.label, locale) : t(`targets.kind.${k}` as any);
  };
  const manage = can('accounts.manage') || can('org.manage');
  const settings = () => navigate('/settings/rhythm');
  if (!money) return null;

  if (!report.rows.length) {
    if (compact || !manage) return null;
    return (
      <section className="sheet reports__wide">
        <EmptyState compact icon="target" title={t('targets.emptyTitle')} body={t('targets.emptyBody')}>
          <button className="btn btn--primary" onClick={settings}>
            {t('targets.set')}
          </button>
        </EmptyState>
      </section>
    );
  }

  if (compact) {
    const row = report.rows[report.rows.length - 1];
    return (
      <a
        className="targetline"
        data-state={row.state}
        href="/reports"
        title={t('targets.open')}
        onClick={(e) => {
          e.preventDefault();
          navigate('/reports');
        }}
      >
        <Icon name="target" size={16} />
        <span className="targetline__label">
          {periodLabel(report.period)} · {kindLabel(row.kind)}
        </span>
        <span className="targetline__track" role="img" aria-label={`${cash(row.won)} / ${cash(row.target)}`}>
          <span className="target__open" style={{ width: `${Math.min(100, (row.forecast / row.target) * 100)}%` }} />
          <span className="target__won" style={{ width: `${Math.min(100, (row.won / row.target) * 100)}%` }} />
          {row.state !== 'reached' && <i className="target__pace" style={{ left: `${Math.min(100, (row.expected / row.target) * 100)}%` }} />}
        </span>
        <span className="num targetline__nums">
          <b>{cash(row.won)}</b> / {cash(row.target)}
        </span>
        <span className="schip" data-tone={TONE[row.state]}>
          {t(`targets.state.${row.state}` as any)}
        </span>
      </a>
    );
  }

  return (
    <section className="sheet reports__wide targets">
      <div className="targets__top">
        <div>
          <h2 className="sheet__title">{t('targets.title', { period: periodLabel(report.period) })}</h2>
          <p className="sheet__hint">{t('targets.hint', { pct: Math.round(report.period.elapsed * 100), days: report.period.daysLeft })}</p>
        </div>
        {manage && (
          <button className="btn btn--small" onClick={settings}>
            {t('targets.change')}
          </button>
        )}
      </div>
      <div className="targets__grid">
        <div className="targets__rows">
          {report.rows.map((r) => (
            <TargetBar key={r.kind} row={r} cash={cash} label={kindLabel(r.kind)} />
          ))}
          <p className="targets__key">
            <span>
              <i className="targets__sw targets__sw--won" /> {t('targets.key.won')}
            </span>
            <span>
              <i className="targets__sw targets__sw--open" /> {t('targets.key.open')}
            </span>
            <span>
              <i className="targets__sw targets__sw--pace" /> {t('targets.key.pace')}
            </span>
          </p>
        </div>
        <div className="targets__who">
          <h3 className="targets__sub">{t('targets.who')}</h3>
          {report.owners.length ? (
            <ol className="targets__owners">
              {report.owners.slice(0, 6).map((o) => (
                <li key={o.ownerId}>
                  <span className="owner">
                    <Avatar person={person(o.ownerId)} /> {person(o.ownerId)?.name ?? '—'}
                  </span>
                  <span className="num">
                    <b>{cash(o.won)}</b> <span className="muted">· {t('pipeline.deals', { n: o.deals })}</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">{t('targets.nobodyYet')}</p>
          )}
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------- reviews

const REVIEW_CHOICES = [30, 60, 90, 180, 365];

function useReviewText() {
  const { t, fmtDate } = useI18n();
  return (r: ReviewDue) => {
    if (r.state === 'none' || !r.due || r.days === null) return t('reviews.none');
    const when = fmtDate(r.due, { day: 'numeric', month: 'short' });
    if (r.days < 0) return t('reviews.late', { n: -r.days, date: when });
    if (r.days === 0) return t('reviews.today');
    return t('reviews.in', { n: r.days, date: when });
  };
}

/** On a customer's page: its review rhythm, when the next one is due, and "done". */
export function ReviewField({ account, onSave }: { account: Account; onSave: (body: { reviewDays: number | null }) => void }) {
  const { t, fmtDate } = useI18n();
  const { canWrite } = useStore();
  const shell = useShell();
  const rhythm = useRhythm();
  const text = useReviewText();
  const due = reviewDue(account, rhythm.reviewDays, todayIso());
  const choices = [...new Set([...REVIEW_CHOICES, ...(due.own && due.every ? [due.every] : [])])].sort((a, b) => a - b);
  return (
    <div className="field review">
      <span className="field__label">{t('reviews.label')}</span>
      <select
        className="select"
        value={account.reviewDays === null || account.reviewDays === undefined ? '' : String(account.reviewDays)}
        disabled={!canWrite}
        aria-label={t('reviews.label')}
        onChange={(e) => onSave({ reviewDays: e.target.value === '' ? null : Number(e.target.value) })}
      >
        <option value="">{rhythm.reviewDays ? t('reviews.company', { n: rhythm.reviewDays }) : t('reviews.companyNone')}</option>
        {choices.map((n) => (
          <option key={n} value={n}>
            {t('reviews.every', { n })}
          </option>
        ))}
        <option value="0">{t('reviews.never')}</option>
      </select>
      <p className="review__when" data-state={due.state}>
        {text(due)}
        {due.last && <span className="muted"> · {t('reviews.last', { date: fmtDate(due.last, { day: 'numeric', month: 'short' }) })}</span>}
      </p>
      {canWrite && due.state !== 'none' && (
        <button className="btn btn--small" onClick={() => shell.logTouch(account.id, account.name, 'review')}>
          <Icon name="check" size={14} /> {t('reviews.log')}
        </button>
      )}
    </div>
  );
}

/** Every customer with a rhythm, soonest (or latest) first. */
export function ReviewsView({ rows }: { rows: { a: Account }[] }) {
  const { t, fmtDate } = useI18n();
  const { person, can, canWrite } = useStore();
  const shell = useShell();
  const rhythm = useRhythm();
  const text = useReviewText();
  const today = todayIso();
  const list = rows.map((r) => ({ a: r.a, due: reviewDue(r.a, rhythm.reviewDays, today) })).filter((r) => r.due.state !== 'none');
  if (!list.length) {
    return (
      <div className="sheet">
        <EmptyState compact icon="handshake" title={t('reviews.emptyTitle')} body={t('reviews.emptyBody')}>
          {(can('accounts.manage') || can('org.manage')) && (
            <button className="btn btn--primary" onClick={() => navigate('/settings/rhythm')}>
              {t('reviews.setRhythm')}
            </button>
          )}
        </EmptyState>
      </div>
    );
  }
  list.sort((x, y) => x.due.days! - y.due.days!);
  const groups: { key: 'overdue' | 'soon' | 'later'; list: typeof list }[] = [
    { key: 'overdue', list: list.filter((r) => r.due.days! < 0) },
    { key: 'soon', list: list.filter((r) => r.due.days! >= 0 && r.due.days! <= 30) },
    { key: 'later', list: list.filter((r) => r.due.days! > 30) },
  ];
  return (
    <div className="renewals">
      {groups
        .filter((g) => g.list.length)
        .map((g) => (
          <section key={g.key} className="sheet renewals__month" data-past={g.key === 'overdue' || undefined}>
            <header className="renewals__head">
              <h3>{t(`reviews.group.${g.key}` as any)}</h3>
              <span className="muted">{t('reviews.count', { n: g.list.length })}</span>
            </header>
            <table className="table table--reviews">
              <tbody>
                {g.list.map(({ a, due }) => (
                  <tr key={a.id} className="rowlink-row" onClick={() => navigate(`/accounts/${a.id}`)}>
                    <td>
                      <a
                        className="rowlink"
                        href={`/accounts/${a.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(`/accounts/${a.id}`);
                        }}
                      >
                        {a.name}
                      </a>
                    </td>
                    <td className="hide-phone">{person(a.ownerId)?.name ?? <span className="muted">{t('accounts.noOwner')}</span>}</td>
                    <td>
                      <span className="review__when" data-state={due.state}>
                        {text(due)}
                      </span>
                    </td>
                    <td className="muted hide-phone">{due.last ? t('reviews.last', { date: fmtDate(due.last, { day: 'numeric', month: 'short', year: 'numeric' }) }) : t('reviews.neverDone')}</td>
                    <td className="muted num hide-phone">{t('reviews.everyShort', { n: due.every })}</td>
                    <td style={{ textAlign: 'right' }}>
                      {canWrite && (
                        <button
                          className="btn btn--small"
                          title={t('reviews.log')}
                          onClick={(e) => {
                            e.stopPropagation();
                            shell.logTouch(a.id, a.name, 'review');
                          }}
                        >
                          {t('reviews.logShort')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
    </div>
  );
}

// ------------------------------------------------------------- settings

export function RhythmSettings() {
  const { t, locale } = useI18n();
  const { me, reloadMe, toast } = useStore();
  const [r, setR] = useState<Rhythm>(me.org.rhythm ?? DEFAULT_RHYTHM);
  const grouped = new Intl.NumberFormat(locale === 'tr' ? 'tr-TR' : 'en-GB');
  const [busy, setBusy] = useState(false);
  const num = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.round(Number(v.replace(/[^\d]/g, '')) || 0)) || null);
  const save = async () => {
    setBusy(true);
    try {
      await put('/rhythm', r);
      await reloadMe();
      toast(t('common.saved'));
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(false);
    }
  };
  const days = (label: string, value: number, choices: number[], onChange: (n: number) => void, unit: 'rhythm.days' | 'rhythm.daysLate' = 'rhythm.days', hint?: string) => (
    <label className="field rhythm__pick">
      <span className="field__label">{label}</span>
      <select className="select" value={value} onChange={(e) => onChange(Number(e.target.value))}>
        <option value={0}>{t('rhythm.off')}</option>
        {[...new Set([...choices, ...(value ? [value] : [])])]
          .sort((a, b) => a - b)
          .map((n) => (
            <option key={n} value={n}>
              {t(unit, { n })}
            </option>
          ))}
      </select>
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );
  return (
    <div className="rhythm">
      <section className="sheet">
        <h2 className="sheet__title">{t('rhythm.targets')}</h2>
        <p className="sheet__hint">{t('rhythm.targetsHint', { currency: me.org.currency })}</p>
        <label className="field rhythm__pick">
          <span className="field__label">{t('rhythm.period')}</span>
          <select className="select" value={r.targets.period} onChange={(e) => setR({ ...r, targets: { ...r.targets, period: e.target.value as Rhythm['targets']['period'] } })}>
            {TARGET_PERIODS.map((p) => (
              <option key={p} value={p}>
                {t(`rhythm.period.${p}` as any)}
              </option>
            ))}
          </select>
        </label>
        <div className="rhythm__amounts">
          {TARGET_KINDS.map((k) => (
            <label className="field" key={k}>
              <span className="field__label">{t(`targets.kind.${k}` as any)}</span>
              <input
                className="input num"
                inputMode="numeric"
                placeholder={t('rhythm.noTarget')}
                value={r.targets[k] == null ? '' : grouped.format(r.targets[k]!)}
                onChange={(e) => setR({ ...r, targets: { ...r.targets, [k]: num(e.target.value) } })}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="sheet">
        <h2 className="sheet__title">{t('rhythm.reviews')}</h2>
        <p className="sheet__hint">{t('rhythm.reviewsHint')}</p>
        {days(t('rhythm.reviewEvery'), r.reviewDays, REVIEW_CHOICES, (n) => setR({ ...r, reviewDays: n }))}
      </section>

      <section className="sheet">
        <h2 className="sheet__title">{t('rhythm.nudges')}</h2>
        <p className="sheet__hint">{t('rhythm.nudgesHint')}</p>
        {days(t('rhythm.stale'), r.staleDays, [7, 14, 21, 30], (n) => setR({ ...r, staleDays: n }), 'rhythm.days', t('rhythm.staleHint'))}
        {days(t('rhythm.escalate'), r.escalateDays, [2, 3, 5, 7], (n) => setR({ ...r, escalateDays: n }), 'rhythm.daysLate', t('rhythm.escalateHint'))}
      </section>

      <div className="toolbar">
        <button className="btn btn--primary" disabled={busy} onClick={save}>
          {busy ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </div>
  );
}
