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
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { PRIORITIES, type Board, type Column, type Repeat, type Task } from '../../../shared/src/model';
import { ExportMenu } from '../components/Export';
import { BoardSettings } from '../components/BoardSettings';
import { Avatars, DueLabel, IconCheck, IconComment, railState } from '../components/ui';
import { ApiFailure, get, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { setQuery } from '../lib/router';
import { useStore } from '../lib/store';
import { positionBetween, saveTask } from '../lib/tasks';

export function BoardPage({ boardId, view, refreshKey }: { boardId: string; view: 'board' | 'list'; refreshKey: number }) {
  const { t, words } = useI18n();
  const { boards, me, canWrite, toast, person } = useStore();
  const board = boards.find((b) => b.id === boardId);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [mine, setMine] = useState(false);
  const [search, setSearch] = useState('');
  const [settings, setSettings] = useState(false);
  const [composing, setComposing] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => setSelected(new Set()), [boardId, view]);
  // "New task" from the search box lands here with ?new=1.
  useEffect(() => {
    if (board && canWrite && new URLSearchParams(location.search).get('new') === '1') {
      setComposing(board.columns[0].key);
      setQuery('new', null);
    }
  }, [board, canWrite]);

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
    const timer = setInterval(load, 30_000);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [load, refreshKey]);

  const doneKeys = useMemo(() => new Set(board?.columns.filter((c) => c.done).map((c) => c.key)), [board]);
  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    return (tasks ?? []).filter(
      (x) =>
        (!mine || x.assigneeIds.includes(me.user.id)) &&
        (!q || x.title.toLocaleLowerCase().includes(q) || (x.accountName ?? '').toLocaleLowerCase().includes(q)),
    );
  }, [tasks, mine, search, me.user.id]);

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

  return (
    <>
      <header className="topbar">
        <div style={{ minWidth: 0 }}>
          <h1 className="topbar__title">{board.name}</h1>
        </div>
        <div className="topbar__spacer" />
        <div className="toolbar">
          <input className="input search" type="search" placeholder={t('board.searchPlaceholder')} aria-label={t('common.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="seg" role="group">
            <button aria-pressed={!mine} onClick={() => setMine(false)}>
              {t('board.filter.everyone')}
            </button>
            <button aria-pressed={mine} onClick={() => setMine(true)}>
              {t('board.filter.mine')}
            </button>
          </div>
          <div className="seg" role="group">
            <button aria-pressed={view === 'board'} onClick={() => setQuery('view', null)}>
              {t('board.view.board')}
            </button>
            <button aria-pressed={view === 'list'} onClick={() => setQuery('view', 'list')}>
              {t('board.view.list')}
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
          {board.canManage && (
            <button className="btn" onClick={() => setSettings(true)}>
              {t('board.settings')}
            </button>
          )}
          {canWrite && (
            <button className="btn btn--primary" onClick={() => setComposing(board.columns[0].key)}>
              {t('board.newTask')}
            </button>
          )}
        </div>
      </header>
      {tasks === null ? (
        <div className="empty">{t('common.loading')}</div>
      ) : view === 'list' ? (
        <div className="page">
          {canWrite && selected.size > 0 && <BulkBar board={board} ids={[...selected]} onDone={() => { setSelected(new Set()); void load(); }} />}
          <ListView board={board} tasks={visible} isDone={(x) => doneKeys.has(x.status)} selected={canWrite ? selected : undefined} onSelect={setSelected} />
          {composing && <QuickAdd board={board} status={composing} onDone={(tk) => { if (tk) setTasks((l) => [...(l ?? []), tk]); setComposing(null); }} />}
        </div>
      ) : (
        <KanbanView board={board} tasks={visible} doneKeys={doneKeys} onMove={move} canWrite={canWrite} composing={composing} setComposing={setComposing} onAdded={(tk) => setTasks((l) => [...(l ?? []), tk])} />
      )}
      {settings && <BoardSettings board={board} onClose={() => setSettings(false)} />}
    </>
  );
}

function KanbanView({ board, tasks, doneKeys, onMove, canWrite, composing, setComposing, onAdded }: { board: Board; tasks: Task[]; doneKeys: Set<string>; onMove: (t: Task, status: string, beforeId: string | null) => void; canWrite: boolean; composing: string | null; setComposing: (k: string | null) => void; onAdded: (t: Task) => void }) {
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
          <KanbanColumn key={col.key} col={col} tasks={byCol.get(col.key) ?? []} doneKeys={doneKeys} canWrite={canWrite} composing={composing === col.key} onCompose={() => setComposing(col.key)} onComposed={(tk) => { if (tk) onAdded(tk); setComposing(null); }} board={board} />
        ))}
      </div>
      <DragOverlay>{active ? <CardBody task={active} done={doneKeys.has(active.status)} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({ col, tasks, doneKeys, canWrite, composing, onCompose, onComposed, board }: { col: Column; tasks: Task[]; doneKeys: Set<string>; canWrite: boolean; composing: boolean; onCompose: () => void; onComposed: (t: Task | null) => void; board: Board }) {
  const { t } = useI18n();
  const { setNodeRef, isOver } = useDroppable({ id: `col:${col.key}` });
  return (
    <section className="column" ref={setNodeRef} data-over={isOver} aria-label={col.name}>
      <div className="column__head">
        <span className="column__name">{col.name}</span>
        <span className="column__count num">{tasks.length}</span>
      </div>
      <div className="column__list">
        {tasks.length === 0 && !composing && <div className="column__empty">{t('board.emptyColumn')}</div>}
        {tasks.map((x) => (
          <DraggableCard key={x.id} task={x} done={doneKeys.has(x.status)} />
        ))}
        {composing && <QuickAdd board={board} status={col.key} onDone={onComposed} />}
      </div>
      {canWrite && !composing && (
        <button className="btn btn--quiet btn--small column__add" onClick={onCompose}>
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
    <div ref={ref} {...drag.attributes} {...drag.listeners} data-dragging={drag.isDragging} style={{ outline: drop.isOver && !drag.isDragging ? '2px solid var(--tend)' : undefined, borderRadius: 6 }}>
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
      <div className="card__title">{task.title}</div>
      {task.accountName && <div className="card__account">{task.accountName}</div>}
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

function QuickAdd({ board, status, onDone }: { board: Board; status: string; onDone: (t: Task | null) => void }) {
  const { t } = useI18n();
  const { toast } = useStore();
  const [title, setTitle] = useState('');
  const busy = useRef(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy.current) return;
    busy.current = true;
    try {
      const r = await post<{ task: Task }>('/tasks', { boardId: board.id, title: title.trim(), status });
      setTitle('');
      onDone(r.task);
    } catch (err) {
      toast(err instanceof ApiFailure ? err.body.message : t('errors.server'), 'error');
    } finally {
      busy.current = false;
    }
  }
  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 6 }}>
      <input className="input" autoFocus placeholder={t('board.taskTitlePlaceholder')} value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && onDone(null)} aria-label={t('task.title')} />
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn--primary btn--small" disabled={!title.trim()}>
          {t('common.add')}
        </button>
        <button type="button" className="btn btn--quiet btn--small" onClick={() => onDone(null)}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}

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
  if (!tasks.length) return <div className="empty">{t('board.emptyColumn')}</div>;
  return (
    <table className="table">
      <thead>
        <tr>
          <th className="rail-cell" aria-hidden="true" />
          {selected && onSelect && (
            <th className="check-cell">
              <input type="checkbox" aria-label={t('board.selectAll')} checked={tasks.length > 0 && tasks.every((x) => selected.has(x.id))} onChange={(e) => onSelect(e.target.checked ? new Set(tasks.map((x) => x.id)) : new Set())} />
            </th>
          )}
          <th>{t('task.title')}</th>
          {showBoard && <th className="hide-phone">{t('task.board')}</th>}
          <th>{t('task.status')}</th>
          <th className="hide-phone">{words.one}</th>
          <th>{t('task.due')}</th>
          <th className="hide-phone">{t('task.assignees')}</th>
        </tr>
      </thead>
      <tbody>
        {tasks.map((x) => {
          const done = isDone(x);
          return (
            <tr key={x.id} data-due={railState(x.dueDate, done)}>
              <td className="rail-cell">
                <span />
              </td>
              {selected && onSelect && (
                <td className="check-cell">
                  <input
                    type="checkbox"
                    aria-label={t('board.select', { title: x.title })}
                    checked={selected.has(x.id)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(x.id);
                      else next.delete(x.id);
                      onSelect(next);
                    }}
                  />
                </td>
              )}
              <td>
                <button className="rowlink" onClick={() => setQuery('task', x.id)}>
                  {x.title}
                </button>
                {x.repeat && <span className="repeat-mark" title={repeatText(t, x.repeat)} aria-label={repeatText(t, x.repeat)}>↻</span>}
              </td>
              {showBoard && <td className="hide-phone muted">{showBoard(x)}</td>}
              <td>{colName(x)}</td>
              <td className="hide-phone">{x.accountName ?? ''}</td>
              <td>
                <DueLabel due={x.dueDate} done={done} />
              </td>
              <td className="hide-phone">
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
