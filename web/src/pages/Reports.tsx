// Reports: how the work and the customers are doing, on one page. Numbers
// are worked out when the page opens, inside what the person may see.
import { useEffect, useMemo, useState } from 'react';
import { labelOf } from '../../../shared/src/fields';
import type { Account } from '../../../shared/src/model';
import type { AppRecord } from '../../../shared/src/records';
import { useRecordTypes } from '../components/AccountFields';
import { bandOf, keyFields } from '../components/AccountViews';
import { EmptyState, SkeletonCards } from '../components/Empty';
import { Icon } from '../components/icons';
import { Stat } from '../components/Pipeline';
import { TargetsPanel } from '../components/Rhythm';
import { Avatar } from '../components/ui';
import { get } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { useStore } from '../lib/store';
import { useFieldFormat } from './Accounts';

export interface WorkReport {
  totals: { open: number; overdue: number; dueWeek: number; unassigned: number; done30: number; created30: number; cycleDays: number | null; onTime: number | null };
  weeks: { week: string; created: number; done: number }[];
  people: { userId: string; open: number; overdue: number; dueWeek: number; done30: number }[];
  boards: { boardId: string; open: number; overdue: number }[];
  statuses: { status: string; n: number }[];
  hours: { userId: string; minutes: number }[];
}

export const hoursText = (minutes: number, locale: string) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hu = locale === 'tr' ? 'sa' : 'h';
  const mu = locale === 'tr' ? 'dk' : 'm';
  return h && m ? `${h} ${hu} ${m} ${mu}` : h ? `${h} ${hu}` : `${m} ${mu}`;
};

/** Two bars per week: what came in, what got done. */
function WeekChart({ weeks }: { weeks: WorkReport['weeks'] }) {
  const { t, fmtDate } = useI18n();
  const max = Math.max(1, ...weeks.flatMap((w) => [w.created, w.done]));
  return (
    <figure className="chart">
      <div className="chart__plot" role="img" aria-label={t('reports.flowTitle')}>
        {weeks.map((w, i) => (
          <div key={w.week} className="chart__col" title={`${fmtDate(w.week)}: ${t('reports.created')} ${w.created}, ${t('reports.done')} ${w.done}`}>
            <div className="chart__bars">
              <span className="chart__bar chart__bar--in" style={{ height: `${(w.created / max) * 100}%` }}>
                {w.created > 0 && <b className="num">{w.created}</b>}
              </span>
              <span className="chart__bar chart__bar--out" style={{ height: `${(w.done / max) * 100}%` }}>
                {w.done > 0 && <b className="num">{w.done}</b>}
              </span>
            </div>
            <span className="chart__tick">{i % 2 === 0 || i === weeks.length - 1 ? fmtDate(w.week) : ''}</span>
          </div>
        ))}
      </div>
      <figcaption className="chart__legend">
        <span>
          <i className="chart__key chart__key--in" /> {t('reports.created')}
        </span>
        <span>
          <i className="chart__key chart__key--out" /> {t('reports.done')}
        </span>
      </figcaption>
    </figure>
  );
}

/** Rows of labelled bars; an optional darker part (overdue inside open). */
export function BarRows({ rows, max }: { rows: { key: string; label: React.ReactNode; value: number; part?: number; text?: string; onClick?: () => void; color?: string }[]; max?: number }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="barrows">
      {rows.map((r) => {
        const body = (
          <>
            <span className="barrows__label">{r.label}</span>
            <span className="barrows__track">
              <span className="barrows__fill" data-color={r.color} style={{ width: `${Math.max((r.value / top) * 100, r.value ? 2 : 0)}%` }}>
                {!!r.part && <span className="barrows__part" style={{ width: `${Math.min(100, (r.part / Math.max(r.value, 1)) * 100)}%` }} />}
              </span>
            </span>
            <span className="barrows__value num">{r.text ?? r.value}</span>
          </>
        );
        return (
          <li key={r.key}>
            {r.onClick ? (
              <button className="barrows__row" onClick={r.onClick}>
                {body}
              </button>
            ) : (
              <div className="barrows__row">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function ReportsPage() {
  const { t, locale, words } = useI18n();
  const { boards, person, me } = useStore();
  const fmt = useFieldFormat();
  const [board, setBoard] = useState('');
  const [work, setWork] = useState<WorkReport | null>(null);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [deals, setDeals] = useState<AppRecord[] | null>(null);
  const { types } = useRecordTypes();
  const opp = types?.find((x) => x.kind === 'opportunity') ?? null;
  useEffect(() => {
    setWork(null);
    void get<WorkReport>(`/reports/work${board ? `?board=${board}` : ''}`).then(setWork, () => undefined);
  }, [board]);
  useEffect(() => {
    void get<{ accounts: Account[] }>('/accounts?limit=500&signals=1').then((r) => setAccounts(r.accounts), () => setAccounts([]));
  }, []);
  useEffect(() => {
    if (opp) void get<{ records: AppRecord[] }>(`/records?type=${opp.key}&limit=500`).then((r) => setDeals(r.records), () => setDeals([]));
  }, [opp?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const { renewal, value } = keyFields(me.org.accountFields);
  const cash = (n: number) => (value ? fmt(value, n) : String(n));
  const customers = useMemo(() => {
    const list = accounts ?? [];
    const bands = { good: 0, watch: 0, risk: 0, none: 0 };
    let atRisk = 0;
    for (const a of list) {
      const b = bandOf(a, me.org.health);
      bands[b ?? 'none'] += 1;
      if (b === 'risk' && value) atRisk += Number(a.fields[value.key]) || 0;
    }
    const months: { key: string; n: number; total: number }[] = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() + i, 1));
      months.push({ key: d.toISOString().slice(0, 7), n: 0, total: 0 });
    }
    if (renewal) {
      for (const a of list) {
        const m = months.find((x) => x.key === String(a.fields[renewal.key] ?? '').slice(0, 7));
        if (m) {
          m.n += 1;
          m.total += value ? Number(a.fields[value.key]) || 0 : 0;
        }
      }
    }
    const quiet = list.filter((a) => !a.lastTouchAt || Date.now() - Date.parse(a.lastTouchAt) > 30 * 86_400_000).length;
    return { bands, months, atRisk, quiet, total: list.length };
  }, [accounts, me.org.health, renewal, value]);

  const stage = opp?.fields.find((f) => f.key === 'stage');
  const amount = opp?.fields.find((f) => f.key === 'amount');
  const pipeline = useMemo(() => {
    if (!deals || !stage || !amount) return null;
    const open = deals.filter((d) => (d.fields.status ?? 'open') === 'open');
    const rows = (stage.options ?? []).map((o) => {
      const list = open.filter((d) => d.fields.stage === o.key);
      return { key: o.key, label: labelOf(o.label, locale), color: o.color, value: list.reduce((n, d) => n + (Number(d.fields.amount) || 0), 0), count: list.length };
    });
    const won = deals.filter((d) => d.fields.status === 'won');
    const lost = deals.filter((d) => d.fields.status === 'lost');
    const sum = (l: AppRecord[]) => l.reduce((n, d) => n + (Number(d.fields.amount) || 0), 0);
    const closed = won.length + lost.length;
    return { rows, open: sum(open), won: sum(won), winRate: closed ? Math.round((won.length / closed) * 100) : null, expansion: sum(won.filter((d) => d.fields.kind === 'expansion')) };
  }, [deals, stage, amount, locale]);

  const monthName = (k: string) => new Date(`${k}-01T00:00:00Z`).toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-GB', { month: 'short', timeZone: 'UTC' });
  const cols = board ? boards.find((b) => b.id === board)?.columns ?? [] : [];
  return (
    <>
      <header className="topbar">
        <div className="topbar__titles">
          <h1 className="topbar__title">{t('nav.reports')}</h1>
          <p className="topbar__sub">{t('reports.lead')}</p>
        </div>
        <div className="topbar__spacer" />
        <select className="select" style={{ width: 'auto' }} value={board} aria-label={t('task.board')} onChange={(e) => setBoard(e.target.value)}>
          <option value="">{t('reports.allBoards')}</option>
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </header>
      <div className="page reports">
        {!work ? (
          <SkeletonCards count={4} label={t('common.loading')} />
        ) : (
          <>
            <div className="statstrip">
              <Stat label={t('reports.open')} value={String(work.totals.open)} sub={t('reports.unassignedN', { n: work.totals.unassigned })} />
              <Stat label={t('reports.overdue')} value={String(work.totals.overdue)} tone={work.totals.overdue ? 'late' : 'done'} sub={t('reports.dueWeekN', { n: work.totals.dueWeek })} />
              <Stat label={t('reports.done30')} value={String(work.totals.done30)} tone="done" sub={t('reports.created30N', { n: work.totals.created30 })} />
              <Stat label={t('reports.onTime')} value={work.totals.onTime == null ? '—' : locale === 'tr' ? `%${work.totals.onTime}` : `${work.totals.onTime}%`} sub={work.totals.cycleDays == null ? t('reports.noCycle') : work.totals.cycleDays < 1 ? t('reports.cycle0') : t('reports.cycle', { n: work.totals.cycleDays })} tone={work.totals.onTime != null && work.totals.onTime < 70 ? 'soon' : undefined} />
            </div>
            <div className="reports__grid">
              <section className="sheet reports__wide">
                <h2 className="sheet__title">{t('reports.flowTitle')}</h2>
                <p className="sheet__hint">{t('reports.flowHint')}</p>
                {work.weeks.some((w) => w.created || w.done) ? <WeekChart weeks={work.weeks} /> : <EmptyState compact icon="chart" title={t('reports.noData')} />}
              </section>
              <section className="sheet">
                <h2 className="sheet__title">{t('reports.byPerson')}</h2>
                <p className="sheet__hint">{t('reports.byPersonHint')}</p>
                {work.people.length ? (
                  <BarRows
                    rows={work.people.slice(0, 10).map((p) => ({
                      key: p.userId,
                      label: (
                        <span className="owner">
                          <Avatar person={person(p.userId)} /> {person(p.userId)?.name ?? '—'}
                        </span>
                      ),
                      value: p.open,
                      part: p.overdue,
                      text: p.overdue ? `${p.open} · ${t('reports.lateShort', { n: p.overdue })}` : String(p.open),
                      onClick: () => navigate(`/team?person=${p.userId}`),
                    }))}
                  />
                ) : (
                  <EmptyState compact icon="people" title={t('reports.noData')} />
                )}
              </section>
              {board ? (
                <section className="sheet">
                  <h2 className="sheet__title">{t('reports.byStatus')}</h2>
                  <p className="sheet__hint">{t('reports.byStatusHint')}</p>
                  <BarRows rows={cols.map((col) => ({ key: col.key, label: col.name, value: work.statuses.find((s) => s.status === col.key)?.n ?? 0, color: col.done ? 'leaf' : undefined }))} />
                </section>
              ) : (
                <section className="sheet">
                  <h2 className="sheet__title">{t('reports.byBoard')}</h2>
                  <p className="sheet__hint">{t('reports.byBoardHint')}</p>
                  {work.boards.length ? (
                    <BarRows
                      rows={work.boards.map((b) => ({
                        key: b.boardId,
                        label: boards.find((x) => x.id === b.boardId)?.name ?? '—',
                        value: b.open,
                        part: b.overdue,
                        text: b.overdue ? `${b.open} · ${t('reports.lateShort', { n: b.overdue })}` : String(b.open),
                        onClick: () => setBoard(b.boardId),
                      }))}
                    />
                  ) : (
                    <EmptyState compact icon="board" title={t('reports.noData')} />
                  )}
                </section>
              )}
              {work.hours.length > 0 && (
                <section className="sheet">
                  <h2 className="sheet__title">{t('reports.hours')}</h2>
                  <p className="sheet__hint">{t('reports.hoursHint')}</p>
                  <BarRows rows={work.hours.slice(0, 10).map((h) => ({ key: h.userId, label: person(h.userId)?.name ?? '—', value: h.minutes, text: hoursText(h.minutes, locale), color: 'sky' }))} />
                </section>
              )}
            </div>
          </>
        )}

        <h2 className="reports__h">
          <Icon name="building" size={18} /> {words.other}
        </h2>
        {!accounts ? (
          <SkeletonCards count={3} label={t('common.loading')} />
        ) : customers.total === 0 ? (
          <div className="sheet">
            <EmptyState compact icon="building" title={t('accounts.emptyTitle')} />
          </div>
        ) : (
          <div className="reports__grid">
            {opp && deals && <TargetsPanel type={opp} records={deals} />}
            <section className="sheet">
              <h2 className="sheet__title">{t('reports.health')}</h2>
              <p className="sheet__hint">{customers.atRisk > 0 ? t('reports.healthRisk', { value: cash(customers.atRisk) }) : t('reports.healthHint')}</p>
              <div className="healthbar" role="img" aria-label={t('reports.health')}>
                {(['good', 'watch', 'risk', 'none'] as const).map((b) => (customers.bands[b] ? <span key={b} data-band={b} style={{ flexGrow: customers.bands[b] }} title={`${t(`reports.band.${b}` as any)}: ${customers.bands[b]}`} /> : null))}
              </div>
              <ul className="healthkey">
                {(['good', 'watch', 'risk', 'none'] as const).map((b) => (
                  <li key={b}>
                    <i data-band={b} /> {t(`reports.band.${b}` as any)} <strong className="num">{customers.bands[b]}</strong>
                  </li>
                ))}
              </ul>
              <p className="sheet__hint" style={{ margin: '10px 0 0' }}>
                {customers.quiet ? t('reports.quietN', { n: customers.quiet }) : t('reports.quietNone')}
              </p>
            </section>
            {renewal && (
              <section className="sheet">
                <h2 className="sheet__title">{t('nav.renewals')}</h2>
                <p className="sheet__hint">{t('reports.renewalsHint')}</p>
                <BarRows
                  rows={customers.months.map((m) => ({ key: m.key, label: monthName(m.key), value: value ? m.total : m.n, text: value ? `${m.n} · ${cash(m.total)}` : String(m.n), color: 'honey', onClick: () => navigate('/accounts?view=renewals') }))}
                />
              </section>
            )}
            {pipeline && (
              <section className="sheet">
                <h2 className="sheet__title">{t('reports.pipeline')}</h2>
                <p className="sheet__hint">
                  {t('reports.pipelineHint', { open: amount ? fmt(amount, pipeline.open) : pipeline.open, won: amount ? fmt(amount, pipeline.won) : pipeline.won })}
                  {pipeline.winRate != null && <> {t('reports.winRate', { n: pipeline.winRate })}</>}
                </p>
                <BarRows rows={pipeline.rows.map((r) => ({ key: r.key, label: r.label, value: r.value, text: `${r.count} · ${amount ? fmt(amount, r.value) : r.value}`, color: r.color, onClick: () => navigate(`/records/${opp!.key}`) }))} />
                {pipeline.expansion > 0 && amount && <p className="sheet__hint" style={{ margin: '10px 0 0' }}>{t('reports.expansionWon', { value: fmt(amount, pipeline.expansion) })}</p>}
              </section>
            )}
          </div>
        )}
      </div>
    </>
  );
}
