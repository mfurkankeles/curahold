// My tasks: everything assigned to the person across boards they can open, grouped by due state (today in the
// company's time zone, lib/time.ts).
import { useEffect, useMemo, useState } from 'react';
import { PRIORITIES, type Priority, type Task } from '../../../shared/src/model';
import { EmptyState, LoadError, SkeletonRows } from '../components/Empty';
import { FilterGroup, FilterSheet } from '../components/FilterSheet';
import { SavedViews, useSavedViews } from '../components/SavedViews';
import { Icon, PageIcon, type IconName } from '../components/icons';
import { get } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { usePageDefaults, useShell } from '../lib/shell';
import { useStore } from '../lib/store';
import { addDays, todayIso } from '../lib/time';
import { BulkBar, ListView } from './BoardPage';
import '../surfaces/employee-work.css';

/** Looks like a text box; opens quick add, and whatever key started it lands there too. */
export function AddBar({ label, short, onOpen }: { label: string; /** A shorter hint for a phone. */ short?: string; onOpen: (text?: string) => void }) {
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
      <span className={short ? 'addbar__text ew-desk' : 'addbar__text'}>{label}</span>
      {short && <span className="addbar__text ew-phone">{short}</span>}
      <kbd className="keycap">N</kbd>
    </button>
  );
}

/** When a group of tasks is due, as a picture. */
const GROUP_ICON: Record<string, IconName> = { late: 'alert', today: 'calendar', soon: 'clock', later: 'hourglass', none: 'dot' };

/** The person's tasks across boards, by due date. */
export function MyTasks({ refreshKey }: { refreshKey: number }) {
  const { t } = useI18n();
  const { boards, me, canWrite } = useStore();
  const { quickAdd } = useShell();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [again, setAgain] = useState(0);
  const [failed, setFailed] = useState(false);
  // A search, a board and a priority narrow the list; a saved view keeps them (components/SavedViews.tsx).
  const [q, setQ] = useState('');
  const [board, setBoard] = useState('');
  const [priority, setPriority] = useState<Priority | ''>('');
  const narrowed = (board ? 1 : 0) + (priority ? 1 : 0);
  const savedViews = useSavedViews({
    scope: 'my_tasks',
    state: { q: q.trim(), board, priority },
    onApply: (v) => {
      setQ(typeof v.q === 'string' ? v.q : '');
      setBoard(typeof v.board === 'string' && boards.some((b) => b.id === v.board) ? v.board : '');
      setPriority(typeof v.priority === 'string' && (PRIORITIES as readonly string[]).includes(v.priority) ? (v.priority as Priority) : '');
    },
  });

  useEffect(() => {
    get<{ tasks: Task[] }>('/tasks?assignee=me').then(
      (r) => {
        setTasks(r.tasks);
        setFailed(false);
      },
      () => setFailed(true),
    );
  }, [refreshKey, again]);

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
    const text = q.trim().toLocaleLowerCase();
    const open = (tasks ?? []).filter(
      (x) =>
        !isDone(x) &&
        (!board || x.boardId === board) &&
        (!priority || x.priority === priority) &&
        (!text || x.title.toLocaleLowerCase().includes(text) || (x.accountName ?? '').toLocaleLowerCase().includes(text)),
    );
    return [
      { key: 'late', label: t('myTasks.group.overdue'), list: open.filter((x) => x.dueDate && x.dueDate < today) },
      { key: 'today', label: t('myTasks.group.today'), list: open.filter((x) => x.dueDate === today) },
      { key: 'soon', label: t('myTasks.group.week'), list: open.filter((x) => x.dueDate && x.dueDate > today && x.dueDate <= week) },
      { key: 'later', label: t('myTasks.group.later'), list: open.filter((x) => x.dueDate && x.dueDate > week) },
      { key: 'none', label: t('myTasks.group.noDate'), list: open.filter((x) => !x.dueDate) },
    ].filter((g) => g.list.length);
  }, [tasks, doneKeys, t, q, board, priority]);
  const late = groups.find((g) => g.key === 'late')?.list.length ?? 0;
  const today = groups.find((g) => g.key === 'today')?.list.length ?? 0;
  const open = groups.reduce((n, g) => n + g.list.length, 0);
  const add = (text?: string) => quickAdd({ assigneeIds: [me.user.id], text });
  usePageDefaults({ assigneeIds: [me.user.id] });

  return (
    <>
      <header className="topbar">
        <div className="topbar__titles topbar__titles--icon">
          <PageIcon name="checkCircle" />
          <h1 className="topbar__title">{t('myTasks.title')}</h1>
          {/* The line's room is kept while the tasks load, so the page below does not jump. */}
          {!tasks && <p className="topbar__sub" aria-hidden="true">&nbsp;</p>}
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
        {canWrite && <AddBar label={t('myTasks.addBar')} short={t('myTasks.addBarShort')} onOpen={add} />}
        {tasks && tasks.length > 0 && (
          <div className="toolbar u-mb-12">
            <FilterSheet
              count={narrowed}
              onClear={() => (setBoard(''), setPriority(''))}
              search={<input className="input search" type="search" value={q} placeholder={t('board.searchPlaceholder')} aria-label={t('common.search')} onChange={(e) => setQ(e.target.value)} />}
            >
              <FilterGroup label={t('task.board')}>
                <select className="select u-width-auto" value={board} aria-label={t('task.board')} onChange={(e) => setBoard(e.target.value)}>
                  <option value="">{t('reports.allBoards')}</option>
                  {boards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </FilterGroup>
              <FilterGroup label={t('task.priority')}>
                <select className="select u-width-auto" value={priority} aria-label={t('task.priority')} onChange={(e) => setPriority(e.target.value as Priority | '')}>
                  <option value="">{t('myTasks.anyPriority')}</option>
                  {[...PRIORITIES].reverse().map((p) => (
                    <option key={p} value={p}>
                      {t(`task.priority.${p}`)}
                    </option>
                  ))}
                </select>
              </FilterGroup>
              <SavedViews ctl={savedViews} canSave={!!(q.trim() || board || priority)} />
            </FilterSheet>
          </div>
        )}
        {canWrite && selected.size > 0 && (
          <BulkBar
            ids={[...selected]}
            onDone={() => {
              setSelected(new Set());
              setAgain((n) => n + 1);
            }}
          />
        )}
        {tasks === null &&
          (failed ? (
            <LoadError
              onRetry={() => {
                setFailed(false);
                setAgain((n) => n + 1);
              }}
            />
          ) : (
            <SkeletonRows rows={6} label={t('common.loading')} />
          ))}
        {tasks && groups.length === 0 && (q.trim() || narrowed > 0) && (
          <EmptyState icon="filter" title={t('accounts.noMatch')}>
            <button className="btn" onClick={() => (setQ(''), setBoard(''), setPriority(''))}>
              <Icon name="close" size={16} />
              {t('filters.clear')}
            </button>
          </EmptyState>
        )}
        {tasks && groups.length === 0 && !q.trim() && narrowed === 0 && (
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
              <Icon name={GROUP_ICON[g.key] ?? 'dot'} size={17} className="icon--lead" />
              {g.label} <small className="num">{g.list.length}</small>
            </h2>
            <ListView tasks={g.list} isDone={isDone} showBoard={boardName} selected={canWrite ? selected : undefined} onSelect={setSelected} />
          </section>
        ))}
      </div>
    </>
  );
}
