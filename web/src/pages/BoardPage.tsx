import { FavoriteButton } from '../components/Favorites';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as KeyEvent } from 'react';
import { PRIORITIES, type Board, type Column, type Repeat, type Task, type ViewFilters } from '../../../shared/src/model';
import { labelOf } from '../../../shared/src/fields';
import { FilterBar, matchFilters } from '../components/BoardFilters';
import { RequestForm } from '../components/RequestForm';
import { BoardArchive } from '../components/BoardArchive';
import { ExportMenu } from '../components/Export';
import { TaskImporter } from '../components/TaskImporter';
import { BoardSettings } from '../components/BoardSettings';
import { IssueBadge, pmOn, PointsChip } from '../components/Pm';
import { BacklogView, SprintsView } from '../components/Sprints';
import { EmptyState, LoadError, SkeletonCards, SkeletonRows } from '../components/Empty';
import { Icon, PageIcon } from '../components/icons';
import { Tick } from '../components/Tick';
import { Avatars, DueLabel, IconCheck, IconComment, railState } from '../components/ui';
import { ApiFailure, get, post } from '../lib/api';
import { useLiveScope } from '../lib/live';
import { useI18n } from '../lib/i18n';
import { navigate, setQuery } from '../lib/router';
import { usePageDefaults, useShell } from '../lib/shell';
import { useStore } from '../lib/store';
import { positionBetween, saveTask } from '../lib/tasks';
import { useWindow } from '../lib/windowing';
import { DateField } from '../components/DateField';
import { usePhone } from '../components/FilterSheet';
import { useServerUndo, useUndo } from '../lib/undo';
import '../surfaces/employee-work.css';
import { seedTask } from '../components/taskSeed';

export function BoardPage({ boardId, view, refreshKey }: { boardId: string; view: 'board' | 'list' | 'archive' | 'backlog' | 'sprints'; refreshKey: number }) {
  const { t, words } = useI18n();
  const phone = usePhone();
  const offerUndo = useUndo();
  const { boards, me, canWrite, toast, person } = useStore();
  const board = boards.find((b) => b.id === boardId);
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

  const listMode = view === 'list';
  const colKeys = useMemo(() => board?.columns.map((c) => c.key) ?? [], [board]);
  const { tasks, setTasks, win, setWin, load, more, failed } = useBoardTasks(boardId, listMode, filters, refreshKey, colKeys);
  // Someone else moved or added a card on this board: it follows, quietly.
  useLiveScope('board', boardId, () => void load(true));

  const doneKeys = useMemo(() => new Set(board?.columns.filter((c) => c.done).map((c) => c.key)), [board]);
  // A board read whole is filtered here, at once; a big one was filtered by the server.
  const visible = useMemo(() => (win ? (tasks ?? []) : (tasks ?? []).filter((x) => matchFilters(x, filters, me.user.id, doneKeys.has(x.status)))), [win, tasks, filters, me.user.id, doneKeys]);

  const move = useCallback(
    async (task: Task, status: string, beforeId: string | null) => {
      const inCol = (tasks ?? []).filter((x) => x.status === status && x.id !== task.id).sort((a, b) => a.position - b.position);
      const idx = beforeId ? inCol.findIndex((x) => x.id === beforeId) : inCol.length;
      const at = idx < 0 ? inCol.length : idx;
      // Dropped below the last card drawn of a column that has more: it goes before the next one not yet read.
      const next = inCol[at]?.position ?? (win?.cols?.[status]?.after ?? undefined);
      const position = positionBetween(inCol[at - 1]?.position, next);
      if (task.status === status && Math.abs(task.position - position) < 1e-9) return;
      const previous = tasks;
      const previousWin = win;
      setTasks((list) => (list ?? []).map((x) => (x.id === task.id ? { ...x, status, position } : x)));
      const from = colKeys.includes(task.status) ? task.status : colKeys[0];
      if (win?.cols && status !== from) setWin(shiftCount(win, from, status));
      try {
        const r = await saveTask(task, { status, position });
        setTasks((list) => (list ?? []).map((x) => (x.id === task.id ? { ...x, ...r.task } : x)));
        if (r.conflicts.length) toast(t('task.conflictLost'), 'error');
        const col = board?.columns.find((c) => c.key === status);
        if (col && status !== task.status) offerUndo(t('board.moved', { column: col.name }), () => saveTask(r.task, { status: task.status, position: task.position }), load);
      } catch (e) {
        setTasks(previous);
        setWin(previousWin);
        toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
      }
    },
    [tasks, win, setTasks, setWin, colKeys, board, toast, t, offerUndo, load],
  );

  // Gone, or private and not shared with this person: the same answer, so a link tells nothing it should not.
  if (!board)
    return (
      <div className="page">
        <EmptyState icon="board" tone="calm" title={t('board.unavailable')} body={t('board.unavailableBody')}>
          <button className="btn" onClick={() => navigate('/home')}>
            {t('states.notAllowed.home')}
          </button>
        </EmptyState>
      </div>
    );
  // Product-management features follow the board's switch; when off, its backlog
  // and sprint views fall back to the ordinary board so a stale link still works.
  const pm = pmOn(board);
  const pmView = (view === 'backlog' || view === 'sprints') && pm;
  const pmTabs = pm;

  // The view switch: inline on a desktop, inside the filter sheet on a phone.
  const viewSwitch = (
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
  );
  const exportMenu = (
    <ExportMenu
              disabled={!visible.length}
              make={async () => ({
                name: board.name,
                headers: [t('task.title'), t('task.status'), words.one, t('task.due'), t('task.assignees'), t('task.priority'), t('task.repeat')],
                // A big board is exported whole (with the same filter), not only the rows read so far.
                rows: (win ? (await get<{ tasks: Task[] }>(`/boards/${board.id}/tasks`)).tasks.filter((x) => matchFilters(x, filters, me.user.id, doneKeys.has(x.status))) : visible).map((x) => [
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
  );
  const formButton = view !== 'archive' && board.form?.on && canWrite && (
    <button className="btn" onClick={() => setAsking(true)} title={t('boardForm.open')}>
      <Icon name="form" size={16} />
      <span className={phone ? 'sr-only' : undefined}>{t('boardForm.open')}</span>
    </button>
  );
  const settingsButton = board.canManage && (
    <button className="btn btn--icon" onClick={() => setSettings(true)} aria-label={t('board.settings')} title={t('board.settings')}>
      <Icon name="sliders" size={16} />
    </button>
  );
  return (
    <>
      <header className="topbar">
        <div className="u-min-width-0">
          <h1 className="topbar__title topbar__title--icon">
          <PageIcon name="board" />
          <span>{board.name}</span>
        </h1>
        </div>
        <FavoriteButton kind="board" id={board.id} name={board.name} to={`/b/${board.id}`} />
        <div className="topbar__spacer" />
        {/* On a phone the board's own tools sit on the title's line, so the first card comes up;
            a new task is the bottom bar's + and each column's "Add task". */}
        {phone && (
          <div className="ew-boardtools">
            {view === 'list' && exportMenu}
            {formButton}
            {settingsButton}
          </div>
        )}
        <div className="toolbar">
          {view !== 'archive' && !pmView && <FilterBar board={board} filters={filters} onChange={setFilters} viewSwitch={phone ? viewSwitch : undefined} />}
          {(!phone || view === 'archive' || pmView) && viewSwitch}
          {!phone && view === 'list' && exportMenu}
          {!phone && formButton}
          {view !== 'archive' && canWrite && (
            <button className="btn btn--icon hide-phone" onClick={() => setImporting(true)} aria-label={t('timport.title')} title={t('timport.title')}>
              <Icon name="upload" size={16} />
            </button>
          )}
          {!phone && settingsButton}
          {view !== 'archive' && canWrite && (
            <button className="btn btn--primary hide-phone" onClick={() => quickAdd({ boardId: board.id, status: board.columns[0].key })}>
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
      ) : pmView && view === 'backlog' ? (
        <BacklogView board={board} refreshKey={refreshKey} />
      ) : pmView && view === 'sprints' ? (
        <SprintsView board={board} refreshKey={refreshKey} />
      ) : tasks === null && failed ? (
        <div className="page">
          <LoadError onRetry={() => void load(false)} />
        </div>
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
          {canWrite && selected.size > 0 && (
            <BulkBar
              board={board}
              ids={[...selected]}
              total={win?.more ? (win.total ?? win.all) : undefined}
              onSelectAll={async () => {
                // A long list is read a page at a time: "all" is asked of the server, with the same filter.
                const ids: string[] = [];
                for (let offset = 0; ids.length < BULK_MAX; ) {
                  const r = await get<Page>(`/boards/${board.id}/tasks?limit=${BULK_MAX}&offset=${offset}${filterParam(filters)}`);
                  ids.push(...r.tasks.map((x) => x.id));
                  if (!r.more || !r.tasks.length) break;
                  offset += r.tasks.length;
                }
                setSelected(new Set(ids.slice(0, BULK_MAX)));
              }}
              onDone={() => {
                setSelected(new Set());
                void load();
              }}
            />
          )}
          <ListView board={board} tasks={visible} onMore={win?.more ? () => more(null) : undefined} isDone={(x) => doneKeys.has(x.status)} selected={canWrite ? selected : undefined} onSelect={setSelected} />
        </div>
      ) : (
        <KanbanView board={board} tasks={visible} cols={win?.cols} onMore={more} doneKeys={doneKeys} onMove={move} canWrite={canWrite} onAdd={(status) => quickAdd({ boardId: board.id, status })} />
      )}
      {view !== 'archive' && !pmView && tasks !== null && (win ? win.all : tasks.length) > 0 && visible.length === 0 && (
        <div className="boardhint">
          <Icon name="filter" size={16} />
          <span>{t('filters.noneMatch', { n: win ? win.all : tasks.length })}</span>
          <button className="btn btn--small" onClick={() => setFilters({})}>
            {t('filters.clear')}
          </button>
        </div>
      )}
      {settings && <BoardSettings board={board} onClose={() => setSettings(false)} />}
      {importing && <TaskImporter board={board} onClose={() => setImporting(false)} onDone={() => void load(true)} />}
      {asking && <RequestForm board={board} onClose={() => setAsking(false)} onSent={() => void load(true)} />}
    </>
  );
}

// ------------------------------------------------------------------ a big board, a window at a time

/** A column of a board read in windows: its true count, whether more is to come, and where the next card sits. */
export interface ColWindow {
  key: string;
  total: number;
  more: boolean;
  after: number | null;
}
/** How a big board was read; null when it was read whole (and is filtered in the browser). */
export interface BoardWindow {
  all: number;
  cols?: Record<string, ColWindow>;
  total?: number;
  more?: boolean;
}

// Cards read per column (and rows per list page) at a time. A board under this is read whole, as before.
const PER = 100;
const PAGE = 200;

const shiftCount = (w: BoardWindow, from: string, to: string): BoardWindow => {
  const cols = { ...w.cols };
  if (cols[from]) cols[from] = { ...cols[from], total: Math.max(0, cols[from].total - 1) };
  if (cols[to]) cols[to] = { ...cols[to], total: cols[to].total + 1 };
  return { ...w, cols };
};
const hasFilter = (f: ViewFilters) => !!(f.q?.trim() || f.assignees?.length || f.priority?.length || f.due?.length || Object.values(f.fields ?? {}).some((v) => v.length));
const filterParam = (f: ViewFilters) => {
  if (!hasFilter(f)) return '';
  const { q, assignees, priority, due, fields } = f;
  return `&filters=${encodeURIComponent(JSON.stringify({ q: q?.trim() || undefined, assignees, priority, due, fields }))}`;
};

type Page = { tasks: Task[]; all: number; columns?: ColWindow[]; total?: number; more?: boolean };

/**
 * The cards of a board. A board that fits in one window is read whole and filtered here, exactly as
 * before; a bigger one is read a window per column (or a page of the list), filtered by the server,
 * and read further as its columns are scrolled.
 */
function useBoardTasks(boardId: string, list: boolean, filters: ViewFilters, refreshKey: number, keys: string[]) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [win, setWin] = useState<BoardWindow | null>(null);
  // A first read that failed says so (with Try again) instead of a skeleton for ever.
  const [failed, setFailed] = useState(false);
  const big = useRef(false);
  const state = useRef({ tasks, win });
  state.current = { tasks, win };
  const busy = useRef(new Set<string>());
  const seq = useRef(0);
  const fRef = useRef(filters);
  fRef.current = filters;
  // The column a card shows in: its own, or the first when its column has gone.
  const kRef = useRef(keys);
  kRef.current = keys;
  const colOf = (x: Task) => (kRef.current.includes(x.status) ? x.status : kRef.current[0]);

  const load = useCallback(
    async (keep = true) => {
      const n = ++seq.current;
      const cur = keep ? state.current.tasks ?? [] : [];
      const f = big.current ? filterParam(fRef.current) : '';
      try {
        let url: string;
        if (list) url = `/boards/${boardId}/tasks?limit=${Math.min(500, Math.max(PAGE, cur.length))}${f}`;
        else {
          const most = Math.max(0, ...Object.values(cur.reduce<Record<string, number>>((m, x) => ((m[colOf(x)] = (m[colOf(x)] ?? 0) + 1), m), {})));
          url = `/boards/${boardId}/tasks?per=${Math.min(500, Math.max(PER, most))}${f}`;
        }
        const r = await get<Page>(url);
        if (n !== seq.current) return;
        const partial = list ? !!r.more : !!r.columns?.some((c) => c.more);
        // Found to be big only now, with a filter already set: read it again, filtered.
        if (partial && !big.current && hasFilter(fRef.current)) {
          big.current = true;
          return void load(false);
        }
        big.current = big.current || partial;
        setTasks(r.tasks);
        setFailed(false);
        setWin(big.current ? { all: r.all, total: r.total, more: r.more, cols: r.columns ? Object.fromEntries(r.columns.map((c) => [c.key, c])) : undefined } : null);
      } catch (e) {
        if (n === seq.current && e instanceof ApiFailure && e.status === 404) setTasks([]);
        else if (n === seq.current) setFailed(true);
      }
    },
    [boardId, list],
  );

  // A new board (or view): from the top.
  useEffect(() => {
    big.current = false;
    busy.current.clear();
    setTasks(null);
    setWin(null);
    void load(false);
  }, [load, refreshKey]);
  // A big board asks the server again when the filter changes (typing settles first).
  const fKey = JSON.stringify(filters);
  useEffect(() => {
    if (!big.current) return;
    const h = setTimeout(() => void load(false), 180);
    return () => clearTimeout(h);
  }, [fKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /** The next window of one column (status) or of the list (null). */
  const more = useCallback(
    async (status: string | null) => {
      const key = status ?? '';
      const { tasks: have, win: w } = state.current;
      if (!have || !w || busy.current.has(key)) return;
      if (status ? !w.cols?.[status]?.more : !w.more) return;
      busy.current.add(key);
      const n = seq.current;
      const f = filterParam(fRef.current);
      try {
        const offset = status ? have.filter((x) => colOf(x) === status).length : have.length;
        const r = await get<Page>(status ? `/boards/${boardId}/tasks?per=${PER}&status=${encodeURIComponent(status)}&offset=${offset}${f}` : `/boards/${boardId}/tasks?limit=${PAGE}&offset=${offset}${f}`);
        if (n !== seq.current) return;
        setTasks((list) => {
          const seen = new Set((list ?? []).map((x) => x.id));
          return [...(list ?? []), ...r.tasks.filter((x) => !seen.has(x.id))];
        });
        setWin((cur) => (!cur ? cur : status ? { ...cur, cols: { ...cur.cols, ...(r.columns ? { [status]: r.columns[0] } : {}) } } : { ...cur, total: r.total, more: r.more }));
      } finally {
        busy.current.delete(key);
      }
    },
    [boardId],
  );

  return { tasks, setTasks, win, setWin, load, more, failed };
}

const DONE_SHOWN = 6;
/** The most tasks one bulk change takes (the server's limit). */
const BULK_MAX = 500;

export function KanbanView({
  board,
  tasks,
  cols,
  onMore,
  doneKeys,
  onMove,
  canWrite,
  onAdd,
}: {
  board: Board;
  tasks: Task[];
  cols?: Record<string, ColWindow>;
  onMore?: (status: string) => void;
  doneKeys: Set<string>;
  onMove: (t: Task, status: string, beforeId: string | null) => void;
  canWrite: boolean;
  onAdd?: (status: string) => void;
}) {
  const [active, setActive] = useState<Task | null>(null);
  // A mouse drags at once; a finger holds a moment first, so a swipe still scrolls the columns.
  // Space picks a card up from the keyboard (Enter opens it).
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] } }),
  );
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

  // From the keyboard: arrows go from card to card (left and right follow the reading direction),
  // Shift with left or right moves the card to the next column.
  const shift = (task: Task, dir: number) => {
    const keys = board.columns.map((c) => c.key);
    const to = keys[keys.indexOf(task.status) + dir];
    if (!canWrite || !to) return;
    onMove(task, to, null);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-card="${task.id}"]`)?.focus());
  };
  const nav = (e: KeyEvent<HTMLDivElement>) => {
    const card = e.target as HTMLElement;
    if (active || !card.dataset.card || e.ctrlKey || e.metaKey || e.altKey) return;
    const rtl = getComputedStyle(card).direction === 'rtl';
    const side = e.key === 'ArrowRight' ? (rtl ? -1 : 1) : e.key === 'ArrowLeft' ? (rtl ? 1 : -1) : 0;
    const task = tasks.find((x) => x.id === card.dataset.card);
    if (side && e.shiftKey && task) {
      e.preventDefault();
      shift(task, side);
      return;
    }
    const col = card.closest('.column');
    const cols = [...e.currentTarget.querySelectorAll<HTMLElement>('.column')];
    const list = [...(col?.querySelectorAll<HTMLElement>('[data-card]') ?? [])];
    const i = list.indexOf(card);
    let next: HTMLElement | undefined;
    if (e.key === 'ArrowDown') next = list[i + 1];
    else if (e.key === 'ArrowUp') next = list[i - 1];
    else if (side && col) {
      const other = [...(cols[cols.indexOf(col as HTMLElement) + side]?.querySelectorAll<HTMLElement>('[data-card]') ?? [])];
      next = other[Math.min(i, other.length - 1)];
    }
    if (next) {
      e.preventDefault();
      next.focus();
      next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  };

  return (
    <DndContext sensors={canWrite ? sensors : []} onDragStart={onStart} onDragEnd={onEnd} onDragCancel={() => setActive(null)}>
      <div className="board" onKeyDown={nav}>
        {board.columns.map((col) => (
          <KanbanColumn
            key={col.key}
            col={col}
            tasks={byCol.get(col.key) ?? []}
            win={cols?.[col.key]}
            onMore={onMore ? () => onMore(col.key) : undefined}
            doneKeys={doneKeys}
            canWrite={canWrite}
            onAdd={onAdd ? () => onAdd(col.key) : undefined}
          />
        ))}
      </div>
      <DragOverlay>{active ? <CardBody task={active} done={doneKeys.has(active.status)} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

// Columns longer than this draw only the cards in sight.
const WINDOW_FROM = 40;

function KanbanColumn({ col, tasks, win, onMore, doneKeys, canWrite, onAdd }: { col: Column; tasks: Task[]; win?: ColWindow; onMore?: () => void; doneKeys: Set<string>; canWrite: boolean; onAdd?: () => void }) {
  const { t } = useI18n();
  const { setNodeRef, isOver } = useDroppable({ id: `col:${col.key}` });
  // A finished column grows for ever: newest first, the older ones one click away.
  const finished = doneKeys.has(col.key);
  const [all, setAll] = useState(false);
  const ordered = useMemo(() => (finished ? [...tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : tasks), [finished, tasks]);
  // The true count: on a big board most cards are not read yet.
  const total = win ? win.total : tasks.length;
  const shown = finished && !all && total > DONE_SHOWN + 2 ? ordered.slice(0, DONE_SHOWN) : ordered;
  const windowed = shown.length > WINDOW_FROM;
  const w = useWindow<HTMLDivElement, HTMLDivElement>(shown.length, windowed, 96);
  const reading = !!win?.more && (!finished || all || total <= DONE_SHOWN + 2);
  // Near the end of what is read: read the next window.
  useEffect(() => {
    if (reading && onMore && w.end >= shown.length - 8) onMore();
  }, [reading, onMore, w.end, shown.length]);
  return (
    <section className="column" ref={setNodeRef} data-over={isOver} aria-label={col.name}>
      <div className="column__head">
        <span className="column__name">{col.name}</span>
        <span className="column__count num">{total}</span>
      </div>
      <div className="column__list">
        {total === 0 && <div className="column__empty">{t('board.emptyColumn')}</div>}
        {windowed && <div ref={w.topRef} className="vspacer" aria-hidden="true" style={{ height: w.before }} />}
        {shown.slice(w.start, w.end).map((x) => (
          <DraggableCard key={x.id} task={x} done={doneKeys.has(x.status)} />
        ))}
        {windowed && <div ref={w.bottomRef} className="vspacer" aria-hidden="true" style={{ height: w.after }} />}
        {reading && <div className="column__reading" role="status">{t('common.loading')}</div>}
        {finished && total > DONE_SHOWN + 2 && (
          <button className="btn btn--quiet btn--small column__more" onClick={() => setAll((v) => !v)}>
            {all ? t('board.doneLess') : t('board.doneMore', { n: total - DONE_SHOWN })}
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
  const onKeyDown = (e: KeyEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === 'Enter') {
        e.preventDefault();
        seedTask(task);
        setQuery('task', task.id);
        return;
      }
      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        e.currentTarget.querySelector<HTMLElement>('.tick')?.click();
        return;
      }
    }
    drag.listeners?.onKeyDown?.(e);
  };
  const drop = useDroppable({ id: `card:${task.id}` });
  const ref = (el: HTMLElement | null) => {
    drag.setNodeRef(el);
    drop.setNodeRef(el);
  };
  return (
    <div ref={ref} {...drag.attributes} role="group" {...drag.listeners} onKeyDown={onKeyDown} data-card={task.id} aria-label={task.title} className="dragcard" data-dragging={drag.isDragging} data-over={(drop.isOver && !drag.isDragging) || undefined}>
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
      onClick={() => (seedTask(task), setQuery('task', task.id))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (seedTask(task), setQuery('task', task.id));
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
  onMore,
  isDone,
  showBoard,
  selected,
  onSelect,
}: {
  board?: Board;
  tasks: Task[];
  /** Reads the next page; given while there is more. */
  onMore?: () => void;
  isDone: (t: Task) => boolean;
  showBoard?: (t: Task) => string;
  selected?: Set<string>;
  onSelect?: (s: Set<string>) => void;
}) {
  const { t, words } = useI18n();
  const { person, boards } = useStore();
  const colName = (task: Task) => (board ?? boards.find((b) => b.id === task.boardId))?.columns.find((c) => c.key === task.status)?.name ?? task.status;
  const pick = !!(selected && onSelect);
  const cells = 6 + (pick ? 1 : 0) + (showBoard ? 1 : 0);
  // A long list draws only the rows in sight.
  const windowed = tasks.length > 80;
  const w = useWindow<HTMLTableRowElement, HTMLTableRowElement>(tasks.length, windowed, 45);
  useEffect(() => {
    if (onMore && w.end >= tasks.length - 20) onMore();
  }, [onMore, w.end, tasks.length]);
  if (!tasks.length) return <EmptyState compact icon="list" title={t('board.listEmpty')} />;
  return (
    <table
      className="table tasklist"
      data-board={showBoard ? 'yes' : undefined}
      data-pick={pick || undefined}
      onKeyDown={(e) => {
        // Up and down go from task to task; D finishes the one in focus.
        const at = (e.target as HTMLElement).closest('.tasklist__row');
        if (!at || e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement).tagName === 'INPUT') return;
        const rows = [...e.currentTarget.querySelectorAll<HTMLElement>('.tasklist__row')];
        const next = e.key === 'ArrowDown' ? rows[rows.indexOf(at as HTMLElement) + 1] : e.key === 'ArrowUp' ? rows[rows.indexOf(at as HTMLElement) - 1] : undefined;
        if (next) {
          e.preventDefault();
          next.querySelector<HTMLElement>('.rowlink')?.focus();
        } else if (e.key === 'd' || e.key === 'D') {
          e.preventDefault();
          at.querySelector<HTMLElement>('.tick')?.click();
        }
      }}
    >
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
              <input
                type="checkbox"
                aria-label={t('board.selectAll')}
                checked={tasks.length > 0 && tasks.every((x) => selected!.has(x.id))}
                onChange={(e) => {
                  // This list's rows join (or leave) what is already chosen: several lists can share one choice.
                  const next = new Set(selected);
                  for (const x of tasks) (e.target.checked ? next.add(x.id) : next.delete(x.id));
                  onSelect!(next);
                }}
              />
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
        {windowed && (
          <tr ref={w.topRef} className="vspacer" aria-hidden="true">
            <td colSpan={cells} style={{ height: w.before }} />
          </tr>
        )}
        {tasks.slice(w.start, w.end).map((x) => {
          const done = isDone(x);
          return (
            <tr key={x.id} data-due={railState(x.dueDate, done)} className="tasklist__row" onClick={(e) => !(e.target as HTMLElement).closest('input, button, a') && (seedTask(x), setQuery('task', x.id))}>
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
                {/* One line that gives the title the room left; a button in a cut cell would vanish whole into "…". */}
                <span className="tasklist__line">
                  <Tick task={x} done={done} />
                  <button className="rowlink" data-done={done || undefined} onClick={() => (seedTask(x), setQuery('task', x.id))}>
                    {x.title}
                  </button>
                  {x.repeat && <span className="repeat-mark" title={repeatText(t, x.repeat)} aria-label={repeatText(t, x.repeat)}>↻</span>}
                  {(x.priority === 'urgent' || x.priority === 'high') && <span className={`prio prio--${x.priority} tasklist__prio`}>{t(`task.priority.${x.priority}`)}</span>}
                </span>
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
        {windowed && (
          <tr ref={w.bottomRef} className="vspacer" aria-hidden="true">
            <td colSpan={cells} style={{ height: w.after }} />
          </tr>
        )}
        {onMore && (
          <tr className="tasklist__reading">
            <td colSpan={cells} role="status">
              {t('common.loading')}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

/** "Every 2 weeks" in words. */
export function repeatText(t: (k: any, v?: any) => string, r: Repeat) {
  return t(`repeat.${r.unit}${r.every === 1 ? '1' : 'N'}`, { n: r.every }) + (r.from === 'done' ? ` ${t('repeat.afterDone')}` : '');
}

/** Change the chosen tasks at once: column, a person, due date, priority, archive — with undo. */
export function BulkBar({ board, ids, total, onSelectAll, onDone }: { /** Without a board (tasks from many): no column to move to. */ board?: Board; ids: string[]; /** How many match when more are there than are read. */ total?: number; onSelectAll?: () => Promise<void>; onDone: () => void }) {
  const { t } = useI18n();
  const { people, toast } = useStore();
  const undoable = useServerUndo();
  const [busy, setBusy] = useState(false);
  const apply = async (change: Record<string, unknown>, msg: string) => {
    setBusy(true);
    try {
      const r = await post<{ updated: number; undoId: string | null }>('/tasks/bulk', { ids, ...change });
      undoable(t(msg as any, { n: r.updated }), r.undoId, onDone);
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
      {onSelectAll && total !== undefined && total > ids.length && ids.length < BULK_MAX && (
        <button className="linkbtn" disabled={busy} onClick={() => (setBusy(true), void onSelectAll().finally(() => setBusy(false)))}>
          {total > BULK_MAX ? t('board.selectFirstN', { n: BULK_MAX, total }) : t('board.selectAllN', { n: total })}
        </button>
      )}
      {board && (
        <select className="select" disabled={busy} value="" aria-label={t('board.bulk.move')} onChange={(e) => e.target.value && apply({ status: e.target.value }, 'board.bulk.moved')}>
          <option value="">{t('board.bulk.move')}</option>
          {board.columns.map((c) => (
            <option key={c.key} value={c.key}>{c.name}</option>
          ))}
        </select>
      )}
      <select className="select" disabled={busy} value="" aria-label={t('board.bulk.assign')} onChange={(e) => e.target.value && apply({ addAssignee: e.target.value }, 'board.bulk.changed')}>
        <option value="">{t('board.bulk.assign')}</option>
        {active.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <label className="bulkbar__date">
        <span>{t('board.bulk.due')}</span>
        <DateField value="" disabled={busy} label={t('board.bulk.due')} onChange={(v) => v && apply({ dueDate: v }, 'board.bulk.changed')} />
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
