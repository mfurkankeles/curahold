import { useEffect, useMemo, useState } from 'react';
import type { Task } from '../../../shared/src/model';
import { get } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useStore } from '../lib/store';
import { addDays, todayIso } from '../lib/time';
import { ListView } from './BoardPage';

export function MyTasks({ refreshKey }: { refreshKey: number }) {
  const { t } = useI18n();
  const { boards } = useStore();
  const [tasks, setTasks] = useState<Task[] | null>(null);

  useEffect(() => {
    get<{ tasks: Task[] }>('/tasks?assignee=me').then((r) => setTasks(r.tasks));
  }, [refreshKey]);

  const doneKeys = useMemo(() => {
    const s = new Set<string>();
    for (const b of boards) for (const c of b.columns) if (c.done) s.add(`${b.id}:${c.key}`);
    return s;
  }, [boards]);
  const isDone = (x: Task) => doneKeys.has(`${x.boardId}:${x.status}`);
  const boardName = (x: Task) => boards.find((b) => b.id === x.boardId)?.name ?? '';

  const groups = useMemo(() => {
    const today = todayIso();
    const week = addDays(today, 7);
    const open = (tasks ?? []).filter((x) => !isDone(x));
    return [
      { key: 'late', label: t('myTasks.group.overdue'), list: open.filter((x) => x.dueDate && x.dueDate < today) },
      { key: 'today', label: t('myTasks.group.today'), list: open.filter((x) => x.dueDate === today) },
      { key: 'soon', label: t('myTasks.group.week'), list: open.filter((x) => x.dueDate && x.dueDate > today && x.dueDate <= week) },
      { key: 'later', label: t('myTasks.group.later'), list: open.filter((x) => x.dueDate && x.dueDate > week) },
      { key: 'none', label: t('myTasks.group.noDate'), list: open.filter((x) => !x.dueDate) },
    ].filter((g) => g.list.length);
  }, [tasks, doneKeys, t]);

  return (
    <>
      <header className="topbar">
        <h1 className="topbar__title">{t('myTasks.title')}</h1>
      </header>
      <div className="page">
        {tasks === null && <div className="empty">{t('common.loading')}</div>}
        {tasks && groups.length === 0 && <div className="empty">{t('myTasks.empty')}</div>}
        {groups.map((g) => (
          <section className="group" data-due={g.key} key={g.key}>
            <h2 className="group__head">
              {g.label} <small className="num">{g.list.length}</small>
            </h2>
            <ListView tasks={g.list} isDone={isDone} showBoard={boardName} />
          </section>
        ))}
      </div>
    </>
  );
}
