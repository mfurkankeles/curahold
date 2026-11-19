// Two more ways to look at the team (Team → Weeks, Team → Customers):
// person × week — open tasks by the week they are due, how many are promises
// to a customer, and their story points — and one page with every customer's
// open work, requests and tickets.
import { useEffect, useMemo, useState } from 'react';
import { EmptyState, LoadError, SkeletonRows } from '../components/Empty';
import { Avatar } from '../components/ui';
import { loadLevel as levelOf } from '../../../shared/src/reports';
import { get } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { useStore } from '../lib/store';
import '../surfaces/adopt.css';

interface Cell {
  tasks: number;
  promises: number;
  points: number;
}
interface Workload {
  weeks: string[];
  people: { userId: string; late: Cell; none: Cell; later: Cell; weeks: Cell[] }[];
}
interface Portfolio {
  customers: { id: string; name: string; ownerId: string | null; open: number; overdue: number; requests: number; tickets: number; nextDue: string | null }[];
  total: number;
}


function useLoad<T>(url: string, refreshKey: number) {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setFailed(false);
    void get<T>(url).then(
      (r) => live && setData(r),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [url, refreshKey, attempt]);
  return { data, failed, retry: () => setAttempt((n) => n + 1) };
}

export function WeeksView({ team, refreshKey }: { team: string; refreshKey: number }) {
  const { t, locale, fmtDate } = useI18n();
  const { people, person } = useStore();
  const { data, failed, retry } = useLoad<Workload>(`/reports/workload?weeks=6${team ? `&team=${team}` : ''}`, refreshKey);
  const rows = useMemo(() => {
    if (!data) return [];
    const by = new Map(data.people.map((p) => [p.userId, p]));
    return people
      .filter((p) => p.status === 'active' && p.seat === 'full' && by.has(p.id))
      .map((p) => {
        const w = by.get(p.id)!;
        const filled = w.weeks.filter((c) => c.tasks > 0);
        const usual = filled.length ? filled.reduce((n, c) => n + c.tasks, 0) / filled.length : 0;
        return { p, w, usual };
      })
      .sort((a, b) => b.w.late.tasks - a.w.late.tasks || b.w.weeks[0].tasks - a.w.weeks[0].tasks || a.p.name.localeCompare(b.p.name, locale));
  }, [data, people, locale]);
  if (!data) return failed ? <LoadError onRetry={retry} /> : <SkeletonRows rows={6} label={t('common.loading')} />;
  if (!rows.length) return <EmptyState icon="calendar" title={t('weeks.none')} />;
  const box = (id: string, c: Cell, level: number, label: string) => (
    <button
      type="button"
      className="weeks__box"
      data-level={level}
      disabled={c.tasks === 0}
      aria-label={`${label}: ${t('weeks.cellLabel', { tasks: c.tasks, promises: c.promises, points: c.points })}`}
      onClick={() => navigate(`/team?person=${id}`)}
    >
      <span className="weeks__n num">{c.tasks || '·'}</span>
      {c.tasks > 0 && (
        <span className="weeks__sub">
          {c.promises > 0 && (
            <span data-k="promise" className="num">
              {c.promises}
            </span>
          )}
          {c.points > 0 && <span className="num">{t('weeks.pts', { n: c.points })}</span>}
        </span>
      )}
    </button>
  );
  return (
    <>
      <div className="table-wrap">
        <table className="table weeks">
          <thead>
            <tr>
              <th>{t('team.person')}</th>
              <th className="num">{t('weeks.late')}</th>
              {data.weeks.map((w, i) => (
                <th key={w} className={i === 0 ? 'weeks__now' : undefined}>
                  {i === 0 ? t('weeks.thisWeek') : fmtDate(w, { day: 'numeric', month: 'short' })}
                </th>
              ))}
              <th className="hide-phone">{t('weeks.noDate')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, w, usual }) => (
              <tr key={p.id}>
                <td>
                  <span className="owner">
                    <Avatar person={person(p.id)} /> {p.name}
                  </span>
                </td>
                <td className="weeks__cell">{box(p.id, w.late, w.late.tasks ? 4 : 0, t('weeks.late'))}</td>
                {w.weeks.map((c, i) => (
                  <td key={data.weeks[i]} className="weeks__cell">
                    {box(p.id, c, levelOf(c.tasks, usual), i === 0 ? t('weeks.thisWeek') : fmtDate(data.weeks[i], { day: 'numeric', month: 'long' }))}
                  </td>
                ))}
                <td className="weeks__cell hide-phone">{box(p.id, w.none, w.none.tasks ? 1 : 0, t('weeks.noDate'))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="weeks__legend">
        <span>{t('weeks.legendTasks')}</span>
        <span>
          <span className="weeks__sub">
            <span data-k="promise">{t('weeks.legendPromises')}</span>
          </span>
        </span>
        <span>{t('weeks.legendPoints')}</span>
        <span>
          <i data-level="1" />
          {t('weeks.light')}
        </span>
        <span>
          <i data-level="2" />
          {t('weeks.usual')}
        </span>
        <span>
          <i data-level="3" />
          {t('weeks.heavy')}
        </span>
        <span>
          <i data-level="4" />
          {t('weeks.over')}
        </span>
      </div>
    </>
  );
}

type SortKey = 'attention' | 'name' | 'open' | 'overdue' | 'requests' | 'tickets';

export function PortfolioView({ team, refreshKey }: { team: string; refreshKey: number }) {
  const { t, locale, fmtDate, words } = useI18n();
  const { person } = useStore();
  const [scope, setScope] = useState<'all' | 'mine'>('all');
  const [sort, setSort] = useState<SortKey>('attention');
  const { data, failed, retry } = useLoad<Portfolio>(`/reports/portfolio?scope=${scope}${team ? `&team=${team}` : ''}`, refreshKey);
  const rows = useMemo(() => {
    const list = [...(data?.customers ?? [])];
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, locale));
    else if (sort !== 'attention') list.sort((a, b) => b[sort] - a[sort] || a.name.localeCompare(b.name, locale));
    return list;
  }, [data, sort, locale]);
  const sum = (k: 'open' | 'overdue' | 'requests' | 'tickets') => rows.reduce((n, r) => n + r[k], 0);
  const head = (k: SortKey, label: string, num = true) => (
    <th className={num ? 'num' : undefined} aria-sort={sort === k ? 'descending' : undefined}>
      <button type="button" onClick={() => setSort(sort === k ? 'attention' : k)}>
        {label}
      </button>
    </th>
  );
  const open = (id: string) => navigate(`/accounts/${id}`);
  return (
    <>
      <div className="portfolio__bar">
        <div className="seg" role="group" aria-label={t('portfolio.scope')}>
          {(['all', 'mine'] as const).map((s) => (
            <button key={s} type="button" aria-pressed={scope === s} onClick={() => setScope(s)}>
              {t(`portfolio.scope.${s}`)}
            </button>
          ))}
        </div>
        {data && <span className="field__hint">{t('portfolio.count', { n: rows.length, total: data.total })}</span>}
      </div>
      {!data ? (
        failed ? (
          <LoadError onRetry={retry} />
        ) : (
          <SkeletonRows rows={8} label={t('common.loading')} />
        )
      ) : !rows.length ? (
        <EmptyState icon="building" title={t('portfolio.none')} />
      ) : (
        <div className="table-wrap">
          <table className="table portfolio">
            <thead>
              <tr>
                {head('name', words.one, false)}
                {head('open', t('portfolio.open'))}
                {head('overdue', t('reports.overdue'))}
                {head('requests', t('portfolio.requests'))}
                {head('tickets', t('portfolio.tickets'))}
                <th className="hide-phone">{t('portfolio.nextDue')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="rowlink-row" onClick={() => open(r.id)}>
                  <td>
                    <a
                      className="rowlink portfolio__name"
                      href={`/accounts/${r.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        open(r.id);
                      }}
                    >
                      <span>{r.name}</span>
                      {r.ownerId && <small>{person(r.ownerId)?.name}</small>}
                    </a>
                  </td>
                  <td className="num">{r.open || '—'}</td>
                  <td className={`num${r.overdue ? ' portfolio__bad' : ' muted'}`}>{r.overdue || '—'}</td>
                  <td className={`num${r.requests ? '' : ' muted'}`}>{r.requests || '—'}</td>
                  <td className={`num${r.tickets ? '' : ' muted'}`}>{r.tickets || '—'}</td>
                  <td className="hide-phone">{r.nextDue ? fmtDate(r.nextDue, { day: 'numeric', month: 'short' }) : '—'}</td>
                </tr>
              ))}
              <tr className="portfolio__totals">
                <td>{t('portfolio.total')}</td>
                <td className="num">{sum('open')}</td>
                <td className="num">{sum('overdue')}</td>
                <td className="num">{sum('requests')}</td>
                <td className="num">{sum('tickets')}</td>
                <td className="hide-phone" />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
