import { useEffect, useMemo, useState } from 'react';
import type { Task } from '../../../shared/src/model';
import { EmptyState, SkeletonRows } from '../components/Empty';
import { Icon } from '../components/icons';
import { get } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { usePageDefaults, useShell } from '../lib/shell';
import { useStore } from '../lib/store';
import { addDays, todayIso } from '../lib/time';
import { ListView } from './BoardPage';

/** Looks like a text box; opens quick add, and whatever key started it lands there too. */
export function AddBar({ label, onOpen }: { label: string; onOpen: (text?: string) => void }) {
  return (
    <button
      type="button"
      className="addbar"
      onClick={() => onOpen()}
      onKeyDown={(e) => {
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && e.key !== ' ') {
          e.preventDefault();
          onOpen(e.key);
        }
      }}
    >
      <span className="addbar__plus" aria-hidden="true">
        <Icon name="plus" size={16} />
      </span>
      <span className="addbar__text">{label}</span>
      <kbd className="keycap">N</kbd>
    </button>
  );
}

export function MyTasks({ refreshKey }: { refreshKey: number }) {
  const { t } = useI18n();
  const { boards, me, canWrite } = useStore();
  const { quickAdd } = useShell();
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
  const late = groups.find((g) => g.key === 'late')?.list.length ?? 0;
  const today = groups.find((g) => g.key === 'today')?.list.length ?? 0;
  const open = groups.reduce((n, g) => n + g.list.length, 0);
  const add = (text?: string) => quickAdd({ assigneeIds: [me.user.id], text });
  usePageDefaults({ assigneeIds: [me.user.id] });

  return (
    <>
      <header className="topbar">
        <div className="topbar__titles">
          <h1 className="topbar__title">{t('myTasks.title')}</h1>
          {tasks && open > 0 && (
            <p className="topbar__sub">
              {late > 0 && <span className="due due--late">{t('myTasks.lateN', { n: late })}</span>}
              {late > 0 && today > 0 && ' · '}
              {today > 0 && <span className="due due--today">{t('myTasks.todayN', { n: today })}</span>}
              {(late > 0 || today > 0) && ' · '}
              {t('myTasks.openN', { n: open })}
            </p>
          )}
        </div>
        <div className="topbar__spacer" />
        {canWrite && (
          <button className="btn btn--primary hide-phone" onClick={() => add()}>
            <Icon name="plus" size={16} />
            {t('myTasks.add')}
          </button>
        )}
      </header>
      <div className="page">
        {canWrite && <AddBar label={t('myTasks.addBar')} onOpen={add} />}
        {tasks === null && <SkeletonRows rows={6} label={t('common.loading')} />}
        {tasks && groups.length === 0 && (
          <EmptyState icon="checkCircle" tone="done" title={t('myTasks.emptyTitle')} body={t('myTasks.emptyBody')}>
            {canWrite && (
              <button className="btn btn--primary" onClick={() => add()}>
                <Icon name="plus" size={16} />
                {t('myTasks.add')}
              </button>
            )}
          </EmptyState>
        )}
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
