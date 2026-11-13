import { FavoriteButton } from '../components/Favorites';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PRIORITIES, type Board, type Column, type Repeat, type Task, type ViewFilters } from '../../../shared/src/model';
import { labelOf } from '../../../shared/src/fields';
import { FilterBar, matchFilters } from '../components/BoardFilters';
import { RequestForm } from '../components/RequestForm';
import { BoardArchive } from '../components/BoardArchive';
import { ExportMenu } from '../components/Export';
import { TaskImporter } from '../components/TaskImporter';
import { BoardSettings } from '../components/BoardSettings';
import { IssueBadge, isPmBoard, PointsChip } from '../components/Pm';
import { BacklogView, SprintsView } from '../components/Sprints';
import { EmptyState, SkeletonCards, SkeletonRows } from '../components/Empty';
import { Icon, PageIcon } from '../components/icons';
import { Tick } from '../components/Tick';
import { Avatars, DueLabel, IconCheck, IconComment, railState } from '../components/ui';
import { ApiFailure, get, post } from '../lib/api';
import { useLiveScope } from '../lib/live';
import { useI18n } from '../lib/i18n';
import { setQuery } from '../lib/router';
import { usePageDefaults, useShell } from '../lib/shell';
import { useStore } from '../lib/store';
import { positionBetween, saveTask } from '../lib/tasks';

export function BoardPage({ boardId, view, refreshKey }: { boardId: string; view: 'board' | 'list' | 'archive' | 'backlog' | 'sprints'; refreshKey: number }) {
  const { t, words } = useI18n();
  const { boards, me, canWrite, toast, person } = useStore();
  const board = boards.find((b) => b.id === boardId);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [filters, setFilters] = useState<ViewFilters>({});
  const [asking, setAsking] = useState(false);
  useEffect(() => setFilters({}), [boardId]);
  const [importing, setImporting] = useState(false);
  const [settings, setSettings] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { quickAdd } = useShell();
  usePageDefaults(board ? { boardId: board.id, status: board.columns[0].key } : null);
  useEffect(() => setSelected(new Set()), [boardId, view]);
  // "New task" from the search box lands here with ?new=1.
  useEffect(() => {
    if (board && canWrite && new URLSearchParams(location.search).get('new') === '1') {
      setQuery('new', null);
      quickAdd({ boardId: board.id, status: board.columns[0].key });
    }
  }, [board, canWrite, quickAdd]);

  const load = useCallback(async () => {
    try {
      setTasks((await get<{ tasks: Task[] }>(`/boards/${boardId}/tasks`)).tasks);
    } catch (e) {
      if (e instanceof ApiFailure && e.status === 404) setTasks([]);
    }
  }, [boardId]);

  useEffect(() => {
    setTasks(null);
    void load();
  }, [load, refreshKey]);
  // Someone else moved or added a card on this board: it follows, quietly.
  useLiveScope('board', boardId, () => void load());

  const doneKeys = useMemo(() => new Set(board?.columns.filter((c) => c.done).map((c) => c.key)), [board]);
  const visible = useMemo(() => (tasks ?? []).filter((x) => matchFilters(x, filters, me.user.id, doneKeys.has(x.status))), [tasks, filters, me.user.id, doneKeys]);

  const move = useCallback(
    async (task: Task, status: string, beforeId: string | null) => {
      const inCol = (tasks ?? []).filter((x) => x.status === status && x.id !== task.id).sort((a, b) => a.position - b.position);
      const idx = beforeId ? inCol.findIndex((x) => x.id === beforeId) : inCol.length;
      const at = idx < 0 ? inCol.length : idx;
      const position = positionBetween(inCol[at - 1]?.position, inCol[at]?.position);
      if (task.status === status && Math.abs(task.position - position) < 1e-9) return;
      const previous = tasks;
      setTasks((list) => (list ?? []).map((x) => (x.id === task.id ? { ...x, status, position } : x)));
      try {
        const r = await saveTask(task, { status, position });
        setTasks((list) => (list ?? []).map((x) => (x.id === task.id ? { ...x, ...r.task } : x)));
        if (r.conflicts.length) toast(t('task.conflictLost'), 'error');
        const col = board?.columns.find((c) => c.key === status);
        if (col && status !== task.status) toast(t('board.moved', { column: col.name }));
      } catch (e) {
        setTasks(previous);
        toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
      }
    },
    [tasks, board, toast, t],
  );

  if (!board) return <div className="empty">{t('errors.not_found')}</div>;
  const pmView = view === 'backlog' || view === 'sprints';
  const pmTabs = isPmBoard(board) || pmView;

  return (
    <>
      <header className="topbar">
        <div style={{ minWidth: 0 }}>
          <h1 className="topbar__title topbar__title--icon">
          <PageIcon name="board" />
          <span>{board.name}</span>
        </h1>
        </div>
        <FavoriteButton kind="board" id={board.id} name={board.name} to={`/b/${board.id}`} />
        <div className="topbar__spacer" />
        <div className="toolbar">
          {view !== 'archive' && !pmView && <FilterBar board={board} filters={filters} onChange={setFilters} />}
          <div className="seg" role="group">
            <button aria-pressed={view === 'board'} onClick={() => setQuery('view', null)}>
              {t('board.view.board')}
            </button>
            <button aria-pressed={view === 'list'} onClick={() => setQuery('view', 'list')}>
              {t('board.view.list')}
            </button>
            {pmTabs && (
              <>
                <button aria-pressed={view === 'backlog'} onClick={() => setQuery('view', 'backlog')}>
                  {t('pm.backlog')}
                </button>
                <button aria-pressed={view === 'sprints'} onClick={() => setQuery('view', 'sprints')}>
                  {t('pm.sprints')}
                </button>
              </>
            )}
            <button aria-pressed={view === 'archive'} onClick={() => setQuery('view', 'archive')}>
              {t('board.view.archive')}
            </button>
          </div>
          {view === 'list' && (
            <ExportMenu
              disabled={!visible.length}
              make={() => ({
                name: board.name,
                headers: [t('task.title'), t('task.status'), words.one, t('task.due'), t('task.assignees'), t('task.priority'), t('task.repeat')],
                rows: visible.map((x) => [
                  x.title,
                  board.columns.find((col) => col.key === x.status)?.name ?? x.status,
                  x.accountName ?? '',
                  x.dueDate ?? '',
                  x.assigneeIds.map((id) => person(id)?.name ?? '').filter(Boolean).join(', '),
                  t(`task.priority.${x.priority}`),
                  x.repeat ? repeatText(t, x.repeat) : '',
                ]),
              })}
            />
          )}
          {view !== 'archive' && board.form?.on && canWrite && (
            <button className="btn" onClick={() => setAsking(true)}>
              <Icon name="form" size={16} />
              <span className="hide-phone">{t('boardForm.open')}</span>
            </button>
          )}
          {view !== 'archive' && canWrite && (
            <button className="btn btn--icon hide-phone" onClick={() => setImporting(true)} aria-label={t('timport.title')} title={t('timport.title')}>
              <Icon name="upload" size={16} />
            </button>
          )}
          {board.canManage && (
            <button className="btn btn--icon" onClick={() => setSettings(true)} aria-label={t('board.settings')} title={t('board.settings')}>
              <Icon name="sliders" size={16} />
            </button>
          )}
          {view !== 'archive' && canWrite && (
            <button className="btn btn--primary" onClick={() => quickAdd({ boardId: board.id, status: board.columns[0].key })}>
              <Icon name="plus" size={16} />
              {t('board.newTask')}
            </button>
          )}
        </div>
      </header>
      {view !== 'archive' && !pmView && tasks !== null && tasks.length === 0 && canWrite && (
        <div className="boardhint">
          <Icon name="zap" size={16} />
          <span>{t('board.firstHint')}</span>
          <button className="btn btn--small" onClick={() => quickAdd({ boardId: board.id, status: board.columns[0].key })}>
            {t('board.newTask')}
          </button>
          <button className="btn btn--small btn--quiet" onClick={() => setImporting(true)}>
            <Icon name="upload" size={14} /> {t('timport.fromFile')}
          </button>
        </div>
      )}
      {view === 'archive' ? (
        <BoardArchive board={board} onRestored={() => void load()} />
      ) : view === 'backlog' ? (
        <BacklogView board={board} refreshKey={refreshKey} />
      ) : view === 'sprints' ? (
        <SprintsView board={board} refreshKey={refreshKey} />
      ) : tasks === null ? (
        view === 'list' ? (
          <div className="page">
            <SkeletonRows label={t('common.loading')} />
          </div>
        ) : (
          <div className="board">
            <SkeletonCards columns count={Math.min(board.columns.length, 4)} label={t('common.loading')} />
          </div>
        )
      ) : view === 'list' ? (
        <div className="page">
          {canWrite && selected.size > 0 && <BulkBar board={board} ids={[...selected]} onDone={() => { setSelected(new Set()); void load(); }} />}
          <ListView board={board} tasks={visible} isDone={(x) => doneKeys.has(x.status)} selected={canWrite ? selected : undefined} onSelect={setSelected} />
        </div>
      ) : (
        <KanbanView board={board} tasks={visible} doneKeys={doneKeys} onMove={move} canWrite={canWrite} onAdd={(status) => quickAdd({ boardId: board.id, status })} />
      )}
      {view !== 'archive' && !pmView && tasks !== null && tasks.length > 0 && visible.length === 0 && (
        <div className="boardhint">
          <Icon name="filter" size={16} />
          <span>{t('filters.noneMatch', { n: tasks.length })}</span>
          <button className="btn btn--small" onClick={() => setFilters({})}>
            {t('filters.clear')}
          </button>
        </div>
      )}
      {settings && <BoardSettings board={board} onClose={() => setSettings(false)} />}
      {importing && <TaskImporter board={board} onClose={() => setImporting(false)} onDone={() => void load()} />}
      {asking && <RequestForm board={board} onClose={() => setAsking(false)} onSent={() => void load()} />}
    </>
  );
}

const DONE_SHOWN = 6;

export function KanbanView({ board, tasks, doneKeys, onMove, canWrite, onAdd }: { board: Board; tasks: Task[]; doneKeys: Set<string>; onMove: (t: Task, status: string, beforeId: string | null) => void; canWrite: boolean; onAdd?: (status: string) => void }) {
  const [active, setActive] = useState<Task | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const byCol = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const c of board.columns) m.set(c.key, []);
    for (const x of tasks) (m.get(x.status) ?? m.get(board.columns[0].key))!.push(x);
    for (const list of m.values()) list.sort((a, b) => a.position - b.position);
    return m;
  }, [board, tasks]);

  const onStart = (e: DragStartEvent) => setActive(tasks.find((x) => x.id === e.active.id) ?? null);
  const onEnd = (e: DragEndEvent) => {
    setActive(null);
    const task = tasks.find((x) => x.id === e.active.id);
    const over = e.over?.id ? String(e.over.id) : null;
    if (!task || !over) return;
    if (over.startsWith('col:')) onMove(task, over.slice(4), null);
    else if (over.startsWith('card:')) {
      const target = tasks.find((x) => x.id === over.slice(5));
      if (target && target.id !== task.id) onMove(task, target.status, target.id);
    }
  };

  return (
    <DndContext sensors={canWrite ? sensors : []} onDragStart={onStart} onDragEnd={onEnd} onDragCancel={() => setActive(null)}>
      <div className="board">
        {board.columns.map((col) => (
          <KanbanColumn key={col.key} col={col} tasks={byCol.get(col.key) ?? []} doneKeys={doneKeys} canWrite={canWrite} onAdd={onAdd ? () => onAdd(col.key) : undefined} />
        ))}
      </div>
      <DragOverlay>{active ? <CardBody task={active} done={doneKeys.has(active.status)} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({ col, tasks, doneKeys, canWrite, onAdd }: { col: Column; tasks: Task[]; doneKeys: Set<string>; canWrite: boolean; onAdd?: () => void }) {
  const { t } = useI18n();
  const { setNodeRef, isOver } = useDroppable({ id: `col:${col.key}` });
  // A finished column grows for ever: newest first, the older ones one click away.
  const finished = doneKeys.has(col.key);
  const [all, setAll] = useState(false);
  const ordered = useMemo(() => (finished ? [...tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : tasks), [finished, tasks]);
  const shown = finished && !all && ordered.length > DONE_SHOWN + 2 ? ordered.slice(0, DONE_SHOWN) : ordered;
  return (
    <section className="column" ref={setNodeRef} data-over={isOver} aria-label={col.name}>
      <div className="column__head">
        <span className="column__name">{col.name}</span>
        <span className="column__count num">{tasks.length}</span>
      </div>
      <div className="column__list">
        {tasks.length === 0 && <div className="column__empty">{t('board.emptyColumn')}</div>}
        {shown.map((x) => (
          <DraggableCard key={x.id} task={x} done={doneKeys.has(x.status)} />
        ))}
        {finished && ordered.length > DONE_SHOWN + 2 && (
          <button className="btn btn--quiet btn--small column__more" onClick={() => setAll((v) => !v)}>
            {all ? t('board.doneLess') : t('board.doneMore', { n: ordered.length - DONE_SHOWN })}
          </button>
        )}
      </div>
      {canWrite && onAdd && (
        // Opens the New task dialog on this column, asking for the details.
        <button className="btn btn--quiet btn--small column__add" onClick={onAdd}>
          <Icon name="plus" size={15} />
          {t('board.addTask')}
        </button>
      )}
    </section>
  );
}

function DraggableCard({ task, done }: { task: Task; done: boolean }) {
  const drag = useDraggable({ id: task.id });
  const drop = useDroppable({ id: `card:${task.id}` });
  const ref = (el: HTMLElement | null) => {
    drag.setNodeRef(el);
    drop.setNodeRef(el);
  };
  return (
    <div ref={ref} {...drag.attributes} {...drag.listeners} data-dragging={drag.isDragging} style={{ outline: drop.isOver && !drag.isDragging ? '2px solid var(--brand)' : undefined, borderRadius: 6 }}>
      <CardBody task={task} done={done} />
    </div>
  );
}

function CardBody({ task, done, overlay }: { task: Task; done: boolean; overlay?: boolean }) {
  const { t } = useI18n();
  const { person } = useStore();
  return (
    <article
      className={`card${overlay ? ' card--overlay' : ''}`}
      data-due={railState(task.dueDate, done)}
      onClick={() => setQuery('task', task.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') setQuery('task', task.id);
      }}
      aria-label={`${t('task.open')}: ${task.title}`}
    >
      <div className="card__top">
        {!overlay && <Tick task={task} done={done} />}
        <div className="card__title">{task.title}</div>
      </div>
      {task.accountName && <div className="card__account">{task.accountName}</div>}
      <CardChips task={task} />
      <div className="card__meta">
        <DueLabel due={task.dueDate} done={done} />
        {(task.priority === 'urgent' || task.priority === 'high') && <span className={`prio prio--${task.priority}`}>{t(`task.priority.${task.priority}`)}</span>}
        {!!task.subtaskCount && (
          <span className="card__stat" title={t('task.subtasks')}>
            <IconCheck /> {task.subtaskDone}/{task.subtaskCount}
          </span>
        )}
        {!!task.commentCount && (
          <span className="card__stat" title={t('task.comments')}>
            <IconComment /> {task.commentCount}
          </span>
        )}
        <Avatars people={task.assigneeIds.map((id) => person(id))} />
      </div>
    </article>
  );
}

/** On a card: "waiting" when another task holds it up, and the board's choice fields as coloured chips. */
function CardChips({ task }: { task: Task }) {
  const { t, locale } = useI18n();
  const { boards } = useStore();
  const defs = boards.find((b) => b.id === task.boardId)?.taskFields ?? [];
  const chips = defs
    .filter((f) => f.type === 'select' && task.fields?.[f.key])
    .slice(0, 2)
    .map((f) => ({ f, o: f.options?.find((o) => o.key === task.fields![f.key]) }))
    .filter((x) => x.o);
  const pm = !!task.issueType && (task.issueType !== 'task' || task.storyPoints != null);
  if (!chips.length && !task.blockedBy && !pm) return null;
  return (
    <div className="card__chips">
      {pm && <IssueBadge type={task.issueType!} />}
      <PointsChip points={task.storyPoints} />
      {!!task.blockedBy && (
        <span className="schip" data-tone="amber" title={t('task.waitingShort', { n: task.blockedBy })}>
          <Icon name="hourglass" size={12} /> {t('task.waitingShort', { n: task.blockedBy })}
        </span>
      )}
      {chips.map(({ f, o }) => (
        <span key={f.key} className="optchip" data-color={o!.color ?? 'stone'}>
          {labelOf(o!.label, locale)}
        </span>
      ))}
    </div>
  );
}

/** Adding at the bottom of a column: one line, read the same way as quick add (date, @person, #customer, !priority). */
export function ListView({
  board,
  tasks,
  isDone,
  showBoard,
  selected,
  onSelect,
}: {
  board?: Board;
  tasks: Task[];
  isDone: (t: Task) => boolean;
  showBoard?: (t: Task) => string;
  selected?: Set<string>;
  onSelect?: (s: Set<string>) => void;
}) {
  const { t, words } = useI18n();
  const { person, boards } = useStore();
  const colName = (task: Task) => (board ?? boards.find((b) => b.id === task.boardId))?.columns.find((c) => c.key === task.status)?.name ?? task.status;
  if (!tasks.length) return <EmptyState compact icon="list" title={t('board.listEmpty')} />;
  const pick = !!(selected && onSelect);
  return (
    <table className="table tasklist" data-board={showBoard ? 'yes' : undefined} data-pick={pick || undefined}>
      <colgroup>
        <col className="tasklist__railcol" />
        {pick && <col className="tasklist__checkcol" />}
        <col />
        {showBoard && <col className="tasklist__boardcol" />}
        <col className="tasklist__statuscol" />
        <col className="tasklist__accountcol" />
        <col className="tasklist__duecol" />
        <col className="tasklist__whocol" />
      </colgroup>
      <thead>
        <tr>
          <th className="rail-cell" aria-hidden="true" />
          {pick && (
            <th className="check-cell">
              <input type="checkbox" aria-label={t('board.selectAll')} checked={tasks.length > 0 && tasks.every((x) => selected!.has(x.id))} onChange={(e) => onSelect!(e.target.checked ? new Set(tasks.map((x) => x.id)) : new Set())} />
            </th>
          )}
          <th>{t('task.title')}</th>
          {showBoard && <th>{t('task.board')}</th>}
          <th>{t('task.status')}</th>
          <th>{words.one}</th>
          <th>{t('task.due')}</th>
          <th>{t('task.assignees')}</th>
        </tr>
      </thead>
      <tbody>
        {tasks.map((x) => {
          const done = isDone(x);
          return (
            <tr key={x.id} data-due={railState(x.dueDate, done)} className="tasklist__row" onClick={(e) => !(e.target as HTMLElement).closest('input, button, a') && setQuery('task', x.id)}>
              <td className="rail-cell">
                <span />
              </td>
              {pick && (
                <td className="check-cell">
                  <input
                    type="checkbox"
                    aria-label={t('board.select', { title: x.title })}
                    checked={selected!.has(x.id)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(x.id);
                      else next.delete(x.id);
                      onSelect!(next);
                    }}
                  />
                </td>
              )}
              <td className="tasklist__title">
                <Tick task={x} done={done} />
                <button className="rowlink" data-done={done || undefined} onClick={() => setQuery('task', x.id)}>
                  {x.title}
                </button>
                {x.repeat && <span className="repeat-mark" title={repeatText(t, x.repeat)} aria-label={repeatText(t, x.repeat)}>↻</span>}
                {(x.priority === 'urgent' || x.priority === 'high') && <span className={`prio prio--${x.priority} tasklist__prio`}>{t(`task.priority.${x.priority}`)}</span>}
              </td>
              {showBoard && <td className="tasklist__board muted">{showBoard(x)}</td>}
              <td className="tasklist__status">{colName(x)}</td>
              <td className="tasklist__account">{x.accountName ?? ''}</td>
              <td className="tasklist__due">
                <DueLabel due={x.dueDate} done={done} />
              </td>
              <td className="tasklist__who">
                <Avatars people={x.assigneeIds.map((id) => person(id))} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** "Every 2 weeks" in words. */
export function repeatText(t: (k: any, v?: any) => string, r: Repeat) {
  return t(`repeat.${r.unit}${r.every === 1 ? '1' : 'N'}`, { n: r.every }) + (r.from === 'done' ? ` ${t('repeat.afterDone')}` : '');
}

/** Change the chosen tasks at once: column, a person, due date, priority, archive — with undo. */
function BulkBar({ board, ids, onDone }: { board: Board; ids: string[]; onDone: () => void }) {
  const { t } = useI18n();
  const { people, toast } = useStore();
  const [busy, setBusy] = useState(false);
  const apply = async (change: Record<string, unknown>, msg: string) => {
    setBusy(true);
    try {
      const r = await post<{ updated: number; undoId: string | null }>('/tasks/bulk', { ids, ...change });
      toast(t(msg as any, { n: r.updated }), 'info', r.undoId ? { label: t('undo.button'), run: async () => { await post(`/undo/${r.undoId}`); toast(t('undo.done')); onDone(); } } : undefined);
      onDone();
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(false);
    }
  };
  const active = people.filter((p) => p.status === 'active' && p.seat === 'full');
  return (
    <div className="bulkbar" role="region" aria-label={t('board.bulk')}>
      <strong>{t('board.selected', { n: ids.length })}</strong>
      <select className="select" disabled={busy} value="" aria-label={t('board.bulk.move')} onChange={(e) => e.target.value && apply({ status: e.target.value }, 'board.bulk.moved')}>
        <option value="">{t('board.bulk.move')}</option>
        {board.columns.map((c) => (
          <option key={c.key} value={c.key}>{c.name}</option>
        ))}
      </select>
      <select className="select" disabled={busy} value="" aria-label={t('board.bulk.assign')} onChange={(e) => e.target.value && apply({ addAssignee: e.target.value }, 'board.bulk.changed')}>
        <option value="">{t('board.bulk.assign')}</option>
        {active.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <label className="bulkbar__date">
        <span>{t('board.bulk.due')}</span>
        <input className="input" type="date" disabled={busy} onChange={(e) => e.target.value && apply({ dueDate: e.target.value }, 'board.bulk.changed')} />
      </label>
      <select className="select" disabled={busy} value="" aria-label={t('task.priority')} onChange={(e) => e.target.value && apply({ priority: e.target.value }, 'board.bulk.changed')}>
        <option value="">{t('task.priority')}</option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>{t(`task.priority.${p}`)}</option>
        ))}
      </select>
      <button className="btn btn--small btn--quiet" disabled={busy} onClick={() => apply({ archived: true }, 'board.bulk.archived')}>
        {t('board.bulk.archive')}
      </button>
    </div>
  );
}
