// Rhythm on screen: targets against the pipeline, when the next business
// review is due, and the settings for both (and for the nudges).
import { useMoney } from '../lib/money';
import { useMemo, useState } from 'react';
import type { Account, AccountField } from '../../../shared/src/model';
import { typeLabel, type AppRecord, type RecordType } from '../../../shared/src/records';
import { DEFAULT_RHYTHM, TARGET_KINDS, TARGET_PERIODS, reviewDue, targetReport, type DealLike, type Period, type ReviewDue, type Rhythm, type TargetKind, type TargetRow } from '../../../shared/src/rhythm';
import { labelOf } from '../../../shared/src/fields';
import { ApiFailure, put } from '../lib/api';
import { useI18n, type I18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { useShell } from '../lib/shell';
import { useStore } from '../lib/store';
import { todayIso } from '../lib/time';
import { useFieldFormat } from '../pages/Accounts';
import { useRecordTypes } from './AccountFields';
import { keyFields } from './AccountViews';
import { Switch } from './Automations';
import { EmptyState } from './Empty';
import { Icon } from './icons';
import { usePlaybooks } from './Plans';
import { Avatar } from './ui';

/** "1 deal", "4 deals" (Turkish says "1 fırsat", "4 fırsat"). */
export const dealsN = (t: I18n['t'], n: number) => (n === 1 ? t('pipeline.deal1') : t('pipeline.deals', { n }));

export const useRhythm = (): Rhythm => useStore().me.org.rhythm ?? DEFAULT_RHYTHM;

/** Deals as the target sums need them: an open deal counts by how far along its stage is. */
export function dealsOf(type: RecordType, records: AppRecord[], toBase: (amount: number, currency?: string | null) => number = (a) => a): { deals: DealLike[]; hasKinds: boolean; money: AccountField | undefined } {
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
        amount: money ? toBase(Number(r.fields[money.key]) || 0, r.currency) : 0,
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
  const cur = useMoney();
  const { deals, hasKinds, money } = useMemo(() => dealsOf(type, records, cur.toBase), [type, records, cur]);
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
            <Icon name="target" size={16} />
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
          <h2 className="sheet__title">
            <Icon name="target" size={18} className="icon--lead" />
            {t('targets.title', { period: periodLabel(report.period) })}
          </h2>
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
                    <b>{cash(o.won)}</b> <span className="muted">· {dealsN(t, o.deals)}</span>
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

/** "Due in 6 days (18 Nov)", "3 days late"… for a review due. */
export function useReviewText() {
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
  // The company holds no business reviews (Settings → Targets and rhythm).
  if (!rhythm.reviewDays) return null;
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
      {/* What this list is: a meeting with each customer every so often (a QBR). */}
      <p className="reviews__intro">
        <Icon name="handshake" size={16} />
        <span>{t('reviews.intro')}</span>
      </p>
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
                    <td className="muted hide-phone review__history">
                      {due.last ? t('reviews.last', { date: fmtDate(due.last, { day: 'numeric', month: 'short', year: 'numeric' }) }) : t('reviews.neverDone')} · {t('reviews.everyShort', { n: due.every })}
                    </td>
                    <td className="table__action">
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

/** How far ahead a renewal can start; six months (180 days) is the usual. */
const RENEWAL_CHOICES = [30, 60, 90, 120, 180, 270, 365];

/** Does the company hold business reviews at all? Off hides them everywhere. */
export const useReviewsOn = () => useRhythm().reviewDays > 0;

type TargetMode = 'none' | 'total' | 'kinds';
const modeOf = (r: Rhythm): TargetMode => (Object.keys(r.targets.amounts).length ? 'kinds' : r.targets.total ? 'total' : 'none');

/**
 * Settings → Targets and rhythm. Each part is the company's own choice:
 *  - targets: none, one for all deals, or one per type of deal (each type on or off);
 *  - business reviews: held or not, and how often;
 *  - renewals: started by Curahold or not, how far ahead, with which playbook;
 *  - nudges: when Curahold speaks up about work that has gone still.
 * Saved together with one PUT /rhythm (api/src/routes/reports.ts).
 */
export function RhythmSettings() {
  const { t, locale } = useI18n();
  const { me, reloadMe, toast } = useStore();
  const { types } = useRecordTypes();
  const { plans } = usePlaybooks();
  const [r, setR] = useState<Rhythm>(me.org.rhythm ?? DEFAULT_RHYTHM);
  const [mode, setMode] = useState<TargetMode>(() => modeOf(me.org.rhythm ?? DEFAULT_RHYTHM));
  // Types switched on but not given an amount yet still show their box.
  const [kindsOn, setKindsOn] = useState<string[]>(() => Object.keys((me.org.rhythm ?? DEFAULT_RHYTHM).targets.amounts));
  const [busy, setBusy] = useState(false);
  const grouped = new Intl.NumberFormat(locale === 'tr' ? 'tr-TR' : 'en-GB');
  const num = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.round(Number(v.replace(/[^\d]/g, '')) || 0)) || null);
  const show = (n: number | null | undefined) => (n == null ? '' : grouped.format(n));

  // The kinds of deal come from the opportunities' own "Type" choices; the usual three otherwise.
  const deals = types?.find((x) => x.kind === 'opportunity') ?? null;
  const kindField = deals?.fields.find((f) => f.key === 'kind' && f.type === 'select');
  const kinds: { key: string; label: string }[] = kindField?.options?.length
    ? kindField.options.map((o) => ({ key: o.key, label: labelOf(o.label, locale) }))
    : TARGET_KINDS.map((k) => ({ key: k, label: t(`targets.kind.${k}` as const) }));
  const sum = kindsOn.reduce((n, k) => n + (r.targets.amounts[k] ?? 0), 0);
  const { renewal: renewalField } = keyFields(me.org.accountFields);
  const renewalPlans = [...(plans ?? [])].sort((a, b) => Number(b.anchor === 'renewal') - Number(a.anchor === 'renewal'));

  const setAmount = (k: string, v: number | null) => {
    const amounts = { ...r.targets.amounts };
    if (v) amounts[k] = v;
    else delete amounts[k];
    setR({ ...r, targets: { ...r.targets, amounts } });
  };
  const toggleKind = (k: string, on: boolean) => {
    setKindsOn(on ? [...kindsOn, k] : kindsOn.filter((x) => x !== k));
    if (!on) setAmount(k, null);
  };

  const save = async () => {
    // Only what the chosen way of setting targets uses is kept.
    const amounts = mode === 'kinds' ? Object.fromEntries(Object.entries(r.targets.amounts).filter(([k, v]) => kindsOn.includes(k) && v > 0)) : {};
    const total = mode === 'total' ? r.targets.total : null;
    setBusy(true);
    try {
      await put('/rhythm', { ...r, targets: { period: r.targets.period, amounts, total } });
      await reloadMe();
      toast(t('common.saved'));
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const days = (label: string, value: number, choices: number[], onChange: (n: number) => void, opts: { unit?: 'rhythm.days' | 'rhythm.daysLate' | 'rhythm.daysAhead'; hint?: string; off?: boolean } = {}) => (
    <label className="field rhythm__pick">
      <span className="field__label">{label}</span>
      <select className="select" value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {opts.off !== false && <option value={0}>{t('rhythm.off')}</option>}
        {[...new Set([...choices, ...(value ? [value] : [])])]
          .sort((a, b) => a - b)
          .map((n) => (
            <option key={n} value={n}>
              {t(opts.unit ?? 'rhythm.days', { n })}
            </option>
          ))}
      </select>
      {opts.hint && <span className="field__hint">{opts.hint}</span>}
    </label>
  );
  const settingsLink = (to: string, label: string) => (
    <a
      href={to}
      onClick={(e) => {
        e.preventDefault();
        navigate(to);
      }}
    >
      {label}
    </a>
  );

  return (
    <div className="rhythm">
      <section className="sheet">
        <h2 className="sheet__title">
            <Icon name="target" size={18} className="icon--lead" />
            {t('rhythm.targets')}
          </h2>
        <p className="sheet__hint">{t('rhythm.targetsHint2', { currency: me.org.currency })}</p>
        <div className="field">
          <span className="field__label" id="target-mode">
            {t('rhythm.targetMode')}
          </span>
          <div className="seg" role="radiogroup" aria-labelledby="target-mode">
            {(['none', 'total', 'kinds'] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}>
                {t(`rhythm.mode.${m}` as const)}
              </button>
            ))}
          </div>
        </div>
        {mode !== 'none' && (
          <label className="field rhythm__pick">
            <span className="field__label">{t('rhythm.period')}</span>
            <select className="select" value={r.targets.period} onChange={(e) => setR({ ...r, targets: { ...r.targets, period: e.target.value as Rhythm['targets']['period'] } })}>
              {TARGET_PERIODS.map((p) => (
                <option key={p} value={p}>
                  {t(`rhythm.period.${p}` as const)}
                </option>
              ))}
            </select>
          </label>
        )}
        {mode === 'total' && (
          <label className="field rhythm__pick">
            <span className="field__label">{t('rhythm.totalTarget')}</span>
            <span className="moneyin">
              <input className="input num" inputMode="numeric" placeholder={t('rhythm.noTarget')} value={show(r.targets.total)} onChange={(e) => setR({ ...r, targets: { ...r.targets, total: num(e.target.value) } })} />
              <span className="moneyin__cur">{me.org.currency}</span>
            </span>
          </label>
        )}
        {mode === 'kinds' && (
          <>
            {!kindField && <p className="field__hint">{deals ? t('rhythm.kindsDefault') : t('rhythm.noDeals')}</p>}
            <ul className="rhythm__kinds">
              {kinds.map((k) => {
                const on = kindsOn.includes(k.key);
                return (
                  <li key={k.key} data-on={on || undefined}>
                    <Switch on={on} label={t('rhythm.kindOn', { kind: k.label })} onChange={(v) => toggleKind(k.key, v)} />
                    <span className="rhythm__kind">{k.label}</span>
                    {on ? (
                      <span className="moneyin">
                        <input className="input num" inputMode="numeric" autoFocus={!r.targets.amounts[k.key]} aria-label={t('rhythm.kindAmount', { kind: k.label })} placeholder="0" value={show(r.targets.amounts[k.key])} onChange={(e) => setAmount(k.key, num(e.target.value))} />
                        <span className="moneyin__cur">{me.org.currency}</span>
                      </span>
                    ) : (
                      <span className="muted small">{t('rhythm.noTarget')}</span>
                    )}
                  </li>
                );
              })}
            </ul>
            {kindsOn.length > 1 && sum > 0 && <p className="rhythm__sum">{t('rhythm.kindsSum', { value: `${grouped.format(sum)} ${me.org.currency}` })}</p>}
          </>
        )}
      </section>

      <section className="sheet">
        <div className="rhythm__head">
          <div>
            <h2 className="sheet__title">
            <Icon name="handshake" size={18} className="icon--lead" />
            {t('rhythm.reviews')}
          </h2>
            <p className="sheet__hint">{r.reviewDays ? t('rhythm.reviewsHint') : t('rhythm.reviewsOffHint')}</p>
          </div>
          <Switch on={r.reviewDays > 0} label={t('rhythm.reviewsOn')} onChange={(v) => setR({ ...r, reviewDays: v ? 90 : 0 })} />
        </div>
        {r.reviewDays > 0 && days(t('rhythm.reviewEvery'), r.reviewDays, REVIEW_CHOICES, (n) => setR({ ...r, reviewDays: n }), { off: false })}
      </section>

      <section className="sheet">
        <div className="rhythm__head">
          <div>
            <h2 className="sheet__title">
            <Icon name="refresh" size={18} className="icon--lead" />
            {t('rhythm.renewals')}
          </h2>
            <p className="sheet__hint">{renewalField ? t('rhythm.renewalsHint') : t('rhythm.renewalsNoField')}</p>
          </div>
          <Switch on={r.renewal.days > 0} disabled={!renewalField} label={t('rhythm.renewalsOn')} onChange={(v) => setR({ ...r, renewal: { ...r.renewal, days: v ? 180 : 0 } })} />
        </div>
        {!renewalField && <p className="field__hint">{settingsLink('/settings/fields', t('rhythm.addRenewalField'))}</p>}
        {r.renewal.days > 0 && (
          <div className="rhythm__renewal">
            {days(t('rhythm.renewalStart'), r.renewal.days, RENEWAL_CHOICES, (n) => setR({ ...r, renewal: { ...r.renewal, days: n } }), { unit: 'rhythm.daysAhead', off: false })}
            <label className="field rhythm__pick">
              <span className="field__label">{t('rhythm.renewalPlaybook')}</span>
              <select className="select" value={r.renewal.planId ?? ''} onChange={(e) => setR({ ...r, renewal: { ...r.renewal, planId: e.target.value || null } })}>
                <option value="">{t('rhythm.renewalOneTask')}</option>
                {renewalPlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {t('plans.tasksN', { n: p.tasks.length })}
                  </option>
                ))}
              </select>
              <span className="field__hint">{settingsLink('/settings/playbooks', plans?.some((p) => p.anchor === 'renewal') ? t('rhythm.editPlaybooks') : t('rhythm.writeRenewalPlaybook'))}</span>
            </label>
            {deals && (
              <label className="check">
                <input type="checkbox" checked={r.renewal.opportunity} onChange={(e) => setR({ ...r, renewal: { ...r.renewal, opportunity: e.target.checked } })} />
                <span>
                  {t('rhythm.renewalDeal', { type: typeLabel(deals, locale, false).toLocaleLowerCase(locale === 'tr' ? 'tr-TR' : 'en-GB') })}
                  <span className="field__hint">{t('rhythm.renewalDealHint')}</span>
                </span>
              </label>
            )}
          </div>
        )}
      </section>

      <section className="sheet">
        <h2 className="sheet__title">
            <Icon name="bell" size={18} className="icon--lead" />
            {t('rhythm.nudges')}
          </h2>
        <p className="sheet__hint">{t('rhythm.nudgesHint')}</p>
        {days(t('rhythm.stale'), r.staleDays, [7, 14, 21, 30], (n) => setR({ ...r, staleDays: n }), { hint: t('rhythm.staleHint') })}
        {days(t('rhythm.escalate'), r.escalateDays, [2, 3, 5, 7], (n) => setR({ ...r, escalateDays: n }), { unit: 'rhythm.daysLate', hint: t('rhythm.escalateHint') })}
      </section>

      <div className="toolbar rhythm__save">
        <button className="btn btn--primary" disabled={busy} onClick={save}>
          {busy ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </div>
  );
}
