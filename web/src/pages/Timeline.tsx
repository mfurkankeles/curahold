// Timeline: tasks as bars across the coming weeks, from their start (or a
// single day when there is none) to their due date, grouped by board,
// person or customer. The bar carries the same time colours as everywhere.
import { useEffect, useMemo, useState } from 'react';
import type { Task } from '../../../shared/src/model';
import { EmptyState, SkeletonRows } from '../components/Empty';
import { Icon } from '../components/icons';
import { get } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { setQuery } from '../lib/router';
import { usePageDefaults } from '../lib/shell';
import { useStore } from '../lib/store';
import { addDays, dueState, todayIso } from '../lib/time';

const GROUPS = ['board', 'person', 'account'] as const;
type Group = (typeof GROUPS)[number];
const DAYS = 42;
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const mondayOf = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return addDays(iso, -((d.getUTCDay() + 6) % 7));
};

export function TimelinePage({ refreshKey }: { refreshKey: number }) {
  const { t, locale, fmtDate, words } = useI18n();
  const { boards, me, person } = useStore();
  const today = todayIso();
  const [start, setStart] = useState(() => mondayOf(addDays(today, -7)));
  const [group, setGroup] = useState<Group>(() => {
    try {
      const v = localStorage.getItem('app_timeline_group') as Group | null;
      return v && GROUPS.includes(v) ? v : 'board';
    } catch {
      return 'board';
    }
  });
  const [mine, setMine] = useState(false);
  const [board, setBoard] = useState('');
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const end = addDays(start, DAYS - 1);
  usePageDefaults(board ? { boardId: board } : null);
  useEffect(() => {
    const p = new URLSearchParams({ span: '1', from: start, to: end });
    if (mine) p.set('assignee', 'me');
    if (board) p.set('board', board);
    void get<{ tasks: Task[] }>(`/tasks?${p}`).then((r) => setTasks(r.tasks), () => setTasks([]));
  }, [start, end, mine, board, refreshKey]);

  const doneKeys = useMemo(() => {
    const s = new Set<string>();
    for (const b of boards) for (const c of b.columns) if (c.done) s.add(`${b.id}:${c.key}`);
    return s;
  }, [boards]);
  const days = useMemo(() => Array.from({ length: DAYS }, (_, i) => addDays(start, i)), [start]);
  const rows = useMemo(() => {
    const m = new Map<string, { key: string; label: string; list: Task[] }>();
    const put = (key: string, label: string, x: Task) => {
      if (!m.has(key)) m.set(key, { key, label, list: [] });
      m.get(key)!.list.push(x);
    };
    for (const x of tasks ?? []) {
      if (!x.dueDate) continue;
      if (group === 'board') put(x.boardId, boards.find((b) => b.id === x.boardId)?.name ?? '—', x);
      else if (group === 'account') put(x.accountId ?? '', x.accountName ?? t('timeline.noAccount', { account: words.one }), x);
      else if (!x.assigneeIds.length) put('', t('task.unassigned'), x);
      else for (const u of x.assigneeIds) put(u, person(u)?.name ?? '—', x);
    }
    return [...m.values()].sort((a, b) => (a.key === '' ? 1 : b.key === '' ? -1 : a.label.localeCompare(b.label, locale)));
  }, [tasks, group, boards, person, t, words.one, locale]);

  const pick = (g: Group) => {
    setGroup(g);
    try {
      localStorage.setItem('app_timeline_group', g);
    } catch {
      /* per-device convenience */
    }
  };
  const tag = locale === 'tr' ? 'tr-TR' : 'en-GB';
  const months = useMemo(() => {
    const out: { label: string; span: number }[] = [];
    for (const d of days) {
      const label = new Date(`${d}T00:00:00Z`).toLocaleDateString(tag, { month: 'long', year: 'numeric', timeZone: 'UTC' });
      if (out.length && out[out.length - 1].label === label) out[out.length - 1].span += 1;
      else out.push({ label, span: 1 });
    }
    return out;
  }, [days, tag]);
  const todayAt = dayDiff(start, today);

  return (
    <>
      <header className="topbar">
        <div className="topbar__titles">
          <h1 className="topbar__title">{t('nav.timeline')}</h1>
          <p className="topbar__sub">
            {fmtDate(start, { day: 'numeric', month: 'long' })} – {fmtDate(end, { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="topbar__spacer" />
        <div className="toolbar">
          <div className="seg" role="group" aria-label={t('timeline.groupBy')}>
            {GROUPS.map((g) => (
              <button key={g} aria-pressed={group === g} onClick={() => pick(g)}>
                {g === 'board' ? t('task.board') : g === 'person' ? t('team.person') : words.one}
              </button>
            ))}
          </div>
          <div className="seg" role="group">
            <button aria-pressed={!mine} onClick={() => setMine(false)}>
              {t('board.filter.everyone')}
            </button>
            <button aria-pressed={mine} onClick={() => setMine(true)}>
              {t('board.filter.mine')}
            </button>
          </div>
          <select className="select" style={{ width: 'auto' }} value={board} aria-label={t('task.board')} onChange={(e) => setBoard(e.target.value)}>
            <option value="">{t('reports.allBoards')}</option>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <button className="btn btn--icon" onClick={() => setStart(addDays(start, -21))} aria-label={t('calendar.prev')}>
            <Icon name="chevronLeft" size={16} />
          </button>
          <button className="btn" onClick={() => setStart(mondayOf(addDays(today, -7)))}>
            {t('calendar.today')}
          </button>
          <button className="btn btn--icon" onClick={() => setStart(addDays(start, 21))} aria-label={t('calendar.next')}>
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
      </header>
      <div className="page">
        {tasks === null ? (
          <SkeletonRows rows={8} label={t('common.loading')} />
        ) : rows.length === 0 ? (
          <div className="sheet">
            <EmptyState icon="timeline" title={t('timeline.empty')} body={t('timeline.emptyBody')} />
          </div>
        ) : (
          <div className="gantt" style={{ ['--days' as any]: DAYS }}>
            <div className="gantt__head">
              <div className="gantt__corner" />
              <div className="gantt__scale">
                <div className="gantt__months">
                  {months.map((m, i) => (
                    <span key={`${m.label}${i}`} style={{ gridColumn: `span ${m.span}` }}>
                      {m.span >= 5 ? m.label : ''}
                    </span>
                  ))}
                </div>
                <div className="gantt__days">
                  {days.map((d) => {
                    const dt = new Date(`${d}T00:00:00Z`);
                    const wd = dt.getUTCDay();
                    return (
                      <span key={d} data-weekend={wd === 0 || wd === 6 || undefined} data-today={d === today || undefined} data-monday={wd === 1 || undefined}>
                        {wd === 1 || d === today ? dt.getUTCDate() : ''}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
            {rows.map((r) => (
              <section key={r.key || 'none'} className="gantt__group" aria-label={r.label}>
                <div className="gantt__label">
                  <strong>{r.label}</strong>
                  <span className="muted num">{r.list.length}</span>
                </div>
                <div className="gantt__lanes">
                  {todayAt >= 0 && todayAt < DAYS && <span className="gantt__today" style={{ left: `calc(${todayAt + 0.5} * 100% / var(--days))` }} aria-hidden="true" />}
                  {r.list
                    .sort((a, b) => String(a.startDate ?? a.dueDate).localeCompare(String(b.startDate ?? b.dueDate)))
                    .map((x) => {
                      const done = doneKeys.has(`${x.boardId}:${x.status}`);
                      const from = Math.max(0, dayDiff(start, x.startDate && x.startDate <= x.dueDate! ? x.startDate : x.dueDate!));
                      const to = Math.min(DAYS - 1, dayDiff(start, x.dueDate!));
                      if (to < 0 || from > DAYS - 1) return null;
                      const cut = !!x.startDate && dayDiff(start, x.startDate) < 0;
                      return (
                        <div key={`${r.key}:${x.id}`} className="gantt__lane">
                          <button
                            className="gantt__bar"
                            data-due={dueState(x.dueDate, done, today)}
                            data-cut={cut || undefined}
                            data-point={to === from || undefined}
                            data-flip={(to === from && from > DAYS * 0.7) || undefined}
                            data-mine={x.assigneeIds.includes(me.user.id) || undefined}
                            style={{ marginLeft: `calc(${from} * 100% / var(--days))`, width: `calc(${Math.max(1, to - from + 1)} * 100% / var(--days))` }}
                            title={`${x.title} · ${x.startDate ? `${fmtDate(x.startDate)} – ` : ''}${fmtDate(x.dueDate!)}`}
                            onClick={() => setQuery('task', x.id)}
                          >
                            <span>{x.title}</span>
                          </button>
                        </div>
                      );
                    })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
