// Team: who is carrying what, and one person at a glance for a 1:1 —
// what they finished, what is late, what is coming and who they look after.
import { useEffect, useMemo, useState } from 'react';
import { EmptyState, SkeletonRows } from '../components/Empty';
import { Icon } from '../components/icons';
import { Stat } from '../components/Pipeline';
import { Avatar, DueLabel } from '../components/ui';
import { get } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate, setQuery, useLocation } from '../lib/router';
import { useShell } from '../lib/shell';
import { useStore } from '../lib/store';
import { addDays, dueState, relativeTime, todayIso } from '../lib/time';
import { hoursText, type WorkReport } from './Reports';

interface PersonReport {
  tasks: { id: string; title: string; boardId: string; status: string; dueDate: string | null; priority: string; done: boolean; doneAt: string | null; updatedAt: string; accountId: string | null; accountName: string | null }[];
  touches30: number;
  lastTouchAt: string | null;
  accounts: number;
  minutes30: number;
}

export function TeamPage({ refreshKey }: { refreshKey: number }) {
  const { t, locale } = useI18n();
  const { people, teams, person } = useStore();
  const { search } = useLocation();
  const picked = new URLSearchParams(search).get('person');
  const [work, setWork] = useState<WorkReport | null>(null);
  const [team, setTeam] = useState('');
  useEffect(() => {
    void get<WorkReport>('/reports/work').then(setWork, () => undefined);
  }, [refreshKey]);
  const rows = useMemo(() => {
    const stats = new Map((work?.people ?? []).map((p) => [p.userId, p]));
    const hours = new Map((work?.hours ?? []).map((h) => [h.userId, h.minutes]));
    const inTeam = team ? new Set(teams.find((x) => x.id === team)?.memberIds ?? []) : null;
    return people
      .filter((p) => p.status === 'active' && p.seat === 'full' && (!inTeam || inTeam.has(p.id)))
      .map((p) => ({ p, s: stats.get(p.id) ?? { userId: p.id, open: 0, overdue: 0, dueWeek: 0, done30: 0 }, minutes: hours.get(p.id) ?? 0 }))
      .sort((a, b) => b.s.overdue - a.s.overdue || b.s.open - a.s.open || a.p.name.localeCompare(b.p.name, locale));
  }, [work, people, teams, team, locale]);
  const max = Math.max(1, ...rows.map((r) => r.s.open));
  const avg = rows.length ? rows.reduce((n, r) => n + r.s.open, 0) / rows.length : 0;

  if (picked) return <PersonView id={picked} refreshKey={refreshKey} />;
  return (
    <>
      <header className="topbar">
        <div className="topbar__titles">
          <h1 className="topbar__title">{t('nav.team')}</h1>
          <p className="topbar__sub">{t('team.lead')}</p>
        </div>
        <div className="topbar__spacer" />
        {teams.length > 0 && (
          <select className="select" style={{ width: 'auto' }} value={team} aria-label={t('team.pick')} onChange={(e) => setTeam(e.target.value)}>
            <option value="">{t('team.everyone')}</option>
            {teams.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        )}
      </header>
      <div className="page">
        {!work ? (
          <SkeletonRows rows={6} label={t('common.loading')} />
        ) : rows.length === 0 ? (
          <EmptyState icon="people" title={t('team.none')} />
        ) : (
          <div className="table-wrap">
            <table className="table teamtable">
              <thead>
                <tr>
                  <th>{t('team.person')}</th>
                  <th>{t('team.load')}</th>
                  <th className="num">{t('reports.overdue')}</th>
                  <th className="num hide-phone">{t('team.week')}</th>
                  <th className="num hide-phone">{t('team.done30')}</th>
                  <th className="num hide-phone">{t('team.hours')}</th>
                  <th aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, s, minutes }) => (
                  <tr key={p.id} className="rowlink-row" onClick={() => navigate(`/team?person=${p.id}`)}>
                    <td>
                      <a
                        className="owner rowlink"
                        href={`/team?person=${p.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(`/team?person=${p.id}`);
                        }}
                      >
                        <Avatar person={person(p.id)} large /> {p.name}
                      </a>
                    </td>
                    <td className="teamtable__load">
                      <span className="loadbar" data-heavy={s.open > avg * 1.5 && s.open >= 5 ? 'true' : undefined} title={t('team.openN', { n: s.open })}>
                        <span style={{ width: `${(s.open / max) * 100}%` }}>{s.overdue > 0 && <i style={{ width: `${(s.overdue / Math.max(1, s.open)) * 100}%` }} />}</span>
                      </span>
                      <span className="num teamtable__n">{s.open}</span>
                    </td>
                    <td className={`num${s.overdue ? ' due--late' : ' muted'}`}>{s.overdue || '—'}</td>
                    <td className="num hide-phone">{s.dueWeek || '—'}</td>
                    <td className="num hide-phone">{s.done30 || '—'}</td>
                    <td className="num hide-phone">{minutes ? hoursText(minutes, locale) : '—'}</td>
                    <td className="teamtable__go">
                      <Icon name="chevronRight" size={16} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function PersonView({ id, refreshKey }: { id: string; refreshKey: number }) {
  const { t, locale } = useI18n();
  const { person, boards, canWrite } = useStore();
  const { quickAdd } = useShell();
  const [data, setData] = useState<PersonReport | null>(null);
  useEffect(() => {
    setData(null);
    void get<PersonReport>(`/reports/person/${id}`).then(setData, () => setData({ tasks: [], touches30: 0, lastTouchAt: null, accounts: 0, minutes30: 0 }));
  }, [id, refreshKey]);
  const p = person(id);
  const today = todayIso();
  const open = (data?.tasks ?? []).filter((x) => !x.done);
  const late = open.filter((x) => x.dueDate && x.dueDate < today);
  const week = open.filter((x) => x.dueDate && x.dueDate >= today && x.dueDate <= addDays(today, 7));
  const stuck = open.filter((x) => Date.now() - Date.parse(x.updatedAt) > 14 * 86_400_000 && !late.includes(x));
  const done = (data?.tasks ?? []).filter((x) => x.done).sort((a, b) => String(b.doneAt).localeCompare(String(a.doneAt)));
  const boardName = (b: string) => boards.find((x) => x.id === b)?.name ?? '';
  const list = (title: string, items: PersonReport['tasks'], tone: string | undefined, empty: string) => (
    <section className="sheet oneone__list" data-tone={tone}>
      <h2 className="sheet__title">
        {title} <small className="num muted">{items.length}</small>
      </h2>
      {items.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          {empty}
        </p>
      ) : (
        <ul className="plainlist">
          {items.slice(0, 12).map((x) => (
            <li key={x.id}>
              <button className="pane-row" data-due={dueState(x.dueDate, x.done, today)} onClick={() => setQuery('task', x.id)}>
                <span className="pane-row__main">
                  <span className="pane-row__title">{x.title}</span>
                  <span className="pane-row__sub">
                    {x.accountName && <span>{x.accountName}</span>}
                    <span>{boardName(x.boardId)}</span>
                  </span>
                </span>
                <span className="pane-row__end">{x.done && x.doneAt ? relativeTime(x.doneAt, t) : <DueLabel due={x.dueDate} done={x.done} />}</span>
              </button>
            </li>
          ))}
          {items.length > 12 && <li className="muted small">{t('team.moreN', { n: items.length - 12 })}</li>}
        </ul>
      )}
    </section>
  );
  return (
    <>
      <header className="topbar">
        <a
          href="/team"
          className="btn btn--quiet btn--small"
          onClick={(e) => {
            e.preventDefault();
            navigate('/team');
          }}
        >
          <Icon name="chevronLeft" size={16} />
          {t('nav.team')}
        </a>
        <div className="topbar__spacer" />
        {canWrite && p && (
          <button className="btn btn--primary" onClick={() => quickAdd({ assigneeIds: [id] })}>
            <Icon name="plus" size={16} />
            {t('team.give', { name: p.name.split(' ')[0] })}
          </button>
        )}
      </header>
      <div className="page oneone">
        <div className="oneone__who">
          <Avatar person={p} large />
          <div>
            <h1 className="topbar__title">{p?.name ?? t('common.unknownUser')}</h1>
            <p className="topbar__sub">{t('team.oneOnOne')}</p>
          </div>
        </div>
        {!data ? (
          <SkeletonRows rows={5} label={t('common.loading')} />
        ) : (
          <>
            <div className="statstrip">
              <Stat label={t('reports.open')} value={String(open.length)} sub={t('team.weekN', { n: week.length })} />
              <Stat label={t('reports.overdue')} value={String(late.length)} tone={late.length ? 'late' : 'done'} sub={t('team.stuckN', { n: stuck.length })} />
              <Stat label={t('team.done14')} value={String(done.length)} tone="done" sub={data.minutes30 ? t('team.hours30', { time: hoursText(data.minutes30, locale) }) : undefined} />
              <Stat label={t('team.customers')} value={String(data.accounts)} sub={data.lastTouchAt ? t('team.touches', { n: data.touches30, when: relativeTime(data.lastTouchAt, t) }) : t('team.noTouches')} tone={data.accounts > 0 && !data.touches30 ? 'soon' : undefined} />
            </div>
            <div className="reports__grid">
              {list(t('team.late'), late, 'late', t('team.lateNone'))}
              {list(t('team.thisWeek'), week, undefined, t('team.weekNone'))}
              {list(t('team.stuck'), stuck, 'soon', t('team.stuckNone'))}
              {list(t('team.done14'), done, 'done', t('team.doneNone'))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
