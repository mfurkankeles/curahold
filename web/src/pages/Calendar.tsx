import { useEffect, useMemo, useState } from 'react';
import type { Task } from '../../../shared/src/model';
import { get } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { setQuery } from '../lib/router';
import { useStore } from '../lib/store';
import { useShell } from '../lib/shell';
import { Icon, PageIcon } from '../components/icons';
import { dueState, todayIso } from '../lib/time';

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function CalendarPage({ refreshKey }: { refreshKey: number }) {
  const { t, locale, fmtDate } = useI18n();
  const { boards, canWrite } = useStore();
  const { quickAdd } = useShell();
  const [month, setMonth] = useState(() => {
    const n = new Date();
    return new Date(Date.UTC(n.getFullYear(), n.getMonth(), 1));
  });
  const [mine, setMine] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Weeks start on Monday — the norm in Türkiye and most of Europe.
  const days = useMemo(() => {
    const first = new Date(month);
    const offset = (first.getUTCDay() + 6) % 7;
    const start = new Date(first);
    start.setUTCDate(1 - offset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      return d;
    });
  }, [month]);

  useEffect(() => {
    const from = iso(days[0]);
    const to = iso(days[days.length - 1]);
    get<{ tasks: Task[] }>(`/tasks?from=${from}&to=${to}${mine ? '&assignee=me' : ''}`).then((r) => setTasks(r.tasks));
  }, [days, mine, refreshKey]);

  const doneKeys = useMemo(() => {
    const s = new Set<string>();
    for (const b of boards) for (const c of b.columns) if (c.done) s.add(`${b.id}:${c.key}`);
    return s;
  }, [boards]);
  const byDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const x of tasks) if (x.dueDate) m.set(x.dueDate, [...(m.get(x.dueDate) ?? []), x]);
    return m;
  }, [tasks]);

  const today = todayIso();
  const tag = locale === 'tr' ? 'tr-TR' : 'en-GB';
  const weekdays = days.slice(0, 7).map((d) => new Intl.DateTimeFormat(tag, { weekday: 'short', timeZone: 'UTC' }).format(d));
  const title = new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(month);
  const shift = (n: number) => setMonth((m) => new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + n, 1)));

  return (
    <>
      <header className="topbar">
        <h1 className="topbar__title topbar__title--icon">
          <PageIcon name="calendar" />
          <span>{title}</span>
        </h1>
        <div className="topbar__spacer" />
        <div className="toolbar">
          <div className="seg" role="group">
            <button aria-pressed={!mine} onClick={() => setMine(false)}>
              {t('board.filter.everyone')}
            </button>
            <button aria-pressed={mine} onClick={() => setMine(true)}>
              {t('board.filter.mine')}
            </button>
          </div>
          <button className="btn btn--icon" onClick={() => shift(-1)} aria-label={t('calendar.prev')}>
            <Icon name="chevronLeft" size={16} />
          </button>
          <button className="btn" onClick={() => { const n = new Date(); setMonth(new Date(Date.UTC(n.getFullYear(), n.getMonth(), 1))); }}>
            {t('calendar.today')}
          </button>
          <button className="btn btn--icon" onClick={() => shift(1)} aria-label={t('calendar.next')}>
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
      </header>
      <div className="page">
        <div className="cal" role="grid" aria-label={t('calendar.title')}>
          {weekdays.map((w) => (
            <div className="cal__dow" key={w} role="columnheader">
              {w}
            </div>
          ))}
          {days.map((d) => {
            const key = iso(d);
            const list = byDay.get(key) ?? [];
            const open = expanded === key;
            const shown = open ? list : list.slice(0, 3);
            return (
              <div className="cal__day" key={key} role="gridcell" data-out={d.getUTCMonth() !== month.getUTCMonth()} data-today={key === today} aria-label={fmtDate(key, { day: 'numeric', month: 'long' })}>
                <span className="cal__top">
                  <span className="cal__date">{d.getUTCDate()}</span>
                  {canWrite && (
                    <button className="cal__add" aria-label={t('calendar.addOn', { date: fmtDate(key, { day: 'numeric', month: 'long' }) })} title={t('calendar.addOn', { date: fmtDate(key, { day: 'numeric', month: 'long' }) })} onClick={() => quickAdd({ dueDate: key })}>
                      <Icon name="plus" size={14} />
                    </button>
                  )}
                </span>
                {shown.map((x) => (
                  <button key={x.id} className="chip" data-due={dueState(x.dueDate, doneKeys.has(`${x.boardId}:${x.status}`), today)} onClick={() => setQuery('task', x.id)} title={x.title}>
                    {x.title}
                  </button>
                ))}
                {list.length > 3 && !open && (
                  <button className="cal__more" onClick={() => setExpanded(key)}>
                    {t('calendar.more', { n: list.length - 3 })}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
