// The backlog: the board's work that is in no sprint yet, in the order it will be done,
// and the place a sprint is planned. Pick items (mouse or keyboard), see what they do to
// the sprint's capacity as you go, send them in, start the sprint. Type, points and epic
// change in the row; epics are not sprint work, so they sit above the list as a filter
// with what their stories add up to.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { FIBONACCI, ISSUE_TYPES, type Board, type IssueType, type Sprint, type Task } from '../../../shared/src/model';
import { ApiFailure, del, get, put } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { setQuery } from '../lib/router';
import { useSaver } from '../lib/saver';
import { useShell } from '../lib/shell';
import { useStore } from '../lib/store';
import { positionBetween, saveTask } from '../lib/tasks';
import { useUndo } from '../lib/undo';
import { useFormat } from '../lib/useFormat';
import { EmptyState, LoadError, SkeletonRows } from './Empty';
import { FilterGroup, FilterSheet } from './FilterSheet';
import { Icon } from './icons';
import { IssueBadge, savePm, useEpics, type PmChanges, type PmEpic } from './Pm';
import { pointsOf, teamVelocity, useSprints } from './pmData';
import { modKey } from './Shortcuts';
import { Confirm } from './ui';
import '../surfaces/product.css';

/** Key caps as printed on keyboards (not translated, like ⌘ and Ctrl). */
const CAP = { enter: 'Enter', alt: 'Alt' };

const TONE: Record<IssueType, string> = { epic: 'amber', story: 'green', task: 'slate', bug: 'red', subtask: 'slate', spike: 'amber' };

/** How full a sprint is against the team's pace: what is in it, what is about to go in, and the limit. */
export function CapacityMeter({ planned, adding = 0, limit }: { planned: number; adding?: number; limit: number | null }) {
  const { t } = useI18n();
  const f = useFormat();
  const total = planned + adding;
  const scale = Math.max(1, total, limit ? limit * 1.25 : 0);
  const over = limit != null && total > limit;
  const pct = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;
  const n = (v: number) => f.number(v, { digits: v % 1 ? 1 : 0 });
  return (
    <div className="pm-cap" data-over={over || undefined}>
      <span className="pm-cap__bar" aria-hidden="true">
        <span className="pm-cap__planned" style={{ '--w': pct(planned) } as CSSProperties} />
        <span className="pm-cap__adding" style={{ '--w': pct(adding) } as CSSProperties} />
        {limit != null && <i className="pm-cap__limit" style={{ '--x': pct(limit) } as CSSProperties} />}
      </span>
      <span className="pm-cap__text num">
        {limit != null ? t('pm.capacity.of', { n: n(total), limit: n(limit) }) : t('pm.capacity.first', { n: n(total) })}
        {over && <strong className="pm-cap__over"> {t('pm.capacity.over', { n: n(total - limit!) })}</strong>}
      </span>
    </div>
  );
}

type EpicFilter = 'all' | 'none' | string;

export function BacklogView({ board, refreshKey, viewSwitch }: { board: Board; refreshKey: number; viewSwitch?: ReactNode }) {
  const { t, locale } = useI18n();
  const f = useFormat();
  const { canWrite, toast } = useStore();
  const { quickAdd } = useShell();
  const save = useSaver();
  const offer = useUndo();
  const [bump, setBump] = useState(0);
  const { epics } = useEpics(board.id, true, refreshKey + bump);
  const { sprints, reload: reloadSprints } = useSprints(board.id, refreshKey + bump);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState('');
  const [epic, setEpic] = useState<EpicFilter>('all');
  const [q, setQ] = useState('');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<Task | null>(null);
  const [starting, setStarting] = useState<Sprint | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const open = useMemo(() => (sprints ?? []).filter((s) => s.state !== 'closed'), [sprints]);
  const velocity = useMemo(() => teamVelocity(sprints), [sprints]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  const load = useCallback(async () => {
    try {
      const r = await get<{ tasks: Task[] }>(`/boards/${board.id}/backlog?open=1`);
      setTasks(r.tasks);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [board.id]);
  useEffect(() => void load(), [load, refreshKey]);
  // The preselected sprint: the next planned one, else the active one.
  useEffect(() => {
    if (!target || !open.some((s) => s.id === target)) setTarget((open.find((s) => s.state === 'future') ?? open[0])?.id ?? '');
  }, [open, target]);

  // Epics are not sprint work: they are the filter above the list, not rows in it.
  const items = useMemo(() => (tasks ?? []).filter((x) => x.issueType !== 'epic'), [tasks]);
  const needle = q.trim().toLocaleLowerCase(locale);
  const shown = useMemo(
    () => items.filter((x) => (epic === 'all' || (epic === 'none' ? !x.epicId : x.epicId === epic)) && (!needle || x.title.toLocaleLowerCase(locale).includes(needle))),
    [items, epic, needle, locale],
  );
  const picked = items.filter((x) => selected.has(x.id));
  const sprint = open.find((s) => s.id === target) ?? null;
  const n = (v: number) => f.number(v, { digits: v % 1 ? 1 : 0 });

  const changed = () => {
    setBump((b) => b + 1);
    void load();
  };

  const addTo = async (ids: string[], sprintId = target) => {
    const into = open.find((s) => s.id === sprintId);
    if (!into || !ids.length) return;
    const ok = await save(() => put(`/sprints/${into.id}/items`, { taskIds: ids }), false);
    if (!ok) return;
    setSelected(new Set());
    changed();
    offer(
      t('pm.backlog.added', { n: n(ids.length), sprint: into.name }),
      () => Promise.all(ids.map((id) => del(`/sprints/${into.id}/items/${id}`))),
      changed,
    );
  };

  // Move a task so it sits just before `beforeId` (or at the end), with the same fractional step the board uses.
  const reorder = async (task: Task, beforeId: string | null, undoable = true) => {
    const list = (tasks ?? []).filter((x) => x.id !== task.id);
    const idx = beforeId ? list.findIndex((x) => x.id === beforeId) : list.length;
    const at = idx < 0 ? list.length : idx;
    const position = positionBetween(list[at - 1]?.position, list[at]?.position);
    if (Math.abs(task.position - position) < 1e-9) return;
    const previous = tasks;
    const was = task.position;
    setTasks([...list.slice(0, at), { ...task, position }, ...list.slice(at)].sort((a, b) => a.position - b.position));
    try {
      const r = await saveTask(task, { position });
      setTasks((cur) => (cur ?? []).map((x) => (x.id === task.id ? { ...x, ...r.task } : x)).sort((a, b) => a.position - b.position));
      if (undoable)
        offer(t('pm.backlog.moved', { title: task.title }), async () => {
          const r2 = await saveTask({ ...task, ...r.task }, { position: was });
          setTasks((cur) => (cur ?? []).map((x) => (x.id === task.id ? { ...x, ...r2.task } : x)).sort((a, b) => a.position - b.position));
        });
    } catch (e) {
      setTasks(previous);
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    }
  };

  /** Up or down among the rows on screen (the filter is respected). */
  const move = (task: Task, dir: -1 | 1) => {
    const i = shown.findIndex((x) => x.id === task.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= shown.length) return;
    void reorder(task, dir < 0 ? shown[j].id : (shown[j + 1]?.id ?? null));
  };

  // Type, points and epic, changed in the row: shown at once, put back and said if the server refuses.
  const edit = async (task: Task, changes: PmChanges) => {
    const before = task;
    setTasks((cur) => (cur ?? []).map((x) => (x.id === task.id ? { ...x, ...changes } : x)));
    try {
      const saved = await savePm(task, changes);
      setTasks((cur) => (cur ?? []).map((x) => (x.id === task.id ? saved : x)));
      if (changes.issueType === 'epic' || before.issueType === 'epic') setBump((b) => b + 1);
    } catch (e) {
      setTasks((cur) => (cur ?? []).map((x) => (x.id === task.id ? before : x)));
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    }
  };

  const toggle = (id: string, on?: boolean) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (on ?? !next.has(id)) next.add(id);
      else next.delete(id);
      return next;
    });

  const focusRow = (id: string | undefined) => {
    if (!id) return;
    setFocusId(id);
    listRef.current?.querySelector<HTMLInputElement>(`[data-row="${id}"] .pm-row__check`)?.focus();
  };

  // The planning keys, on a row's checkbox: arrows walk, Space picks, Enter opens,
  // Alt+arrows reorder, Ctrl/⌘+Enter sends what is picked (or this row) to the sprint.
  const onRowKey = (e: KeyboardEvent<HTMLInputElement>, task: Task) => {
    const i = shown.findIndex((x) => x.id === task.id);
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.altKey) {
      e.preventDefault();
      move(task, e.key === 'ArrowUp' ? -1 : 1);
      requestAnimationFrame(() => focusRow(task.id));
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusRow(shown[Math.max(0, Math.min(shown.length - 1, i + (e.key === 'ArrowUp' ? -1 : 1)))]?.id);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      focusRow((e.key === 'Home' ? shown[0] : shown[shown.length - 1])?.id);
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void addTo(selected.size ? [...selected] : [task.id]);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      setQuery('task', task.id);
    }
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const task = (tasks ?? []).find((x) => x.id === String(e.active.id));
    const over = e.over?.id ? String(e.over.id) : null;
    if (!task || !over) return;
    if (over.startsWith('sprint:')) void addTo([task.id], over.slice(7));
    else if (over === 'backlog-end') void reorder(task, null);
    else if (over.startsWith('row:') && over.slice(4) !== task.id) void reorder(task, over.slice(4));
  };

  if (failed && tasks === null) return <div className="page"><LoadError onRetry={() => void load()} /></div>;
  if (tasks === null) return <div className="page"><SkeletonRows label={t('common.loading')} /></div>;
  const tabStop = shown.some((x) => x.id === focusId) ? focusId : shown[0]?.id;
  const epicPoints = (id: EpicFilter) => pointsOf(items.filter((x) => (id === 'all' ? true : id === 'none' ? !x.epicId : x.epicId === id)));
  const usedEpics = (epics ?? []).filter((e) => items.some((x) => x.epicId === e.id));

  return (
    <DndContext
      sensors={canWrite ? sensors : []}
      onDragStart={(e: DragStartEvent) => setDragging((tasks ?? []).find((x) => x.id === String(e.active.id)) ?? null)}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="page pm-backlog-page">
        {canWrite && (
          <section className="pm-plan" aria-label={t('pm.plan.title')}>
            {open.length ? (
              <>
                <div className="pm-plan__target">
                  <span className="pm-plan__label" aria-hidden="true">
                    {t('pm.plan.into')}
                  </span>
                  <select className="select" value={target} aria-label={t('pm.plan.into')} onChange={(e) => setTarget(e.target.value)}>
                    {open.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} · {t(`pm.sprint.${s.state}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="pm-plan__cap">
                  <span className="pm-plan__label">{velocity.average != null ? t('pm.capacity.velocity', { n: n(velocity.average) }) : t('pm.capacity.title')}</span>
                  <CapacityMeter planned={sprint?.totals?.points ?? 0} adding={pointsOf(picked)} limit={velocity.average} />
                </div>
                <div className="pm-plan__go">
                  <span className="pm-plan__picked num" aria-live="polite">
                    {picked.length ? t('pm.plan.picked', { n: n(picked.length), points: t('pm.points.short', { n: n(pointsOf(picked)) }) }) : t('pm.plan.pickHint')}
                  </span>
                  <button className="btn btn--primary btn--small" disabled={!picked.length || !target} onClick={() => addTo([...selected])}>
                    {t('pm.addToSprint')}
                  </button>
                  {sprint?.state === 'future' && !open.some((s) => s.state === 'active') && (sprint.totals?.items ?? 0) > 0 && (
                    <button className="btn btn--small" onClick={() => setStarting(sprint)}>
                      <Icon name="play" size={14} />
                      {t('pm.sprint.start')}
                    </button>
                  )}
                </div>
                {dragging ? (
                  <span className="pm-dropzones">
                    <span className="pm-dropzones__hint">{t('pm.backlog.dropSprint')}</span>
                    {open.map((s) => (
                      <SprintDropZone key={s.id} sprint={s} />
                    ))}
                  </span>
                ) : (
                  <p className="pm-plan__keys hide-phone">
                    <kbd>↑</kbd>
                    <kbd>↓</kbd> {t('pm.plan.keyWalk')} · <kbd>{t('pm.plan.keySpace')}</kbd> {t('pm.plan.keyPick')} · <kbd>{modKey()}</kbd>+<kbd>{CAP.enter}</kbd> {t('pm.addToSprint')} · <kbd>{CAP.alt}</kbd>+<kbd>↑</kbd>
                    <kbd>↓</kbd> {t('pm.plan.keyOrder')}
                  </p>
                )}
              </>
            ) : (
              <p className="pm-plan__empty muted">{t('pm.backlog.noSprints')}</p>
            )}
          </section>
        )}

        {(items.length > 0 || viewSwitch) && (
          <div className="pm-tools">
            <FilterSheet
              title={t('pm.backlog')}
              count={epic === 'all' ? 0 : 1}
              onClear={() => setEpic('all')}
              search={<input className="input search pm-search" type="search" value={q} placeholder={t('pm.backlog.search')} aria-label={t('pm.backlog.search')} onChange={(e) => setQ(e.target.value)} />}
            >
              {viewSwitch && <FilterGroup label={t('filters.view')}>{viewSwitch}</FilterGroup>}
              {usedEpics.length > 0 && (
                <FilterGroup label={t('pm.epics.filter')}>
          <div className="pm-epics" role="group" aria-label={t('pm.epics.filter')}>
            {(['all', ...usedEpics.map((e) => e.id), 'none'] as EpicFilter[]).map((id) => {
              const e: PmEpic | undefined = usedEpics.find((x) => x.id === id);
              const label = id === 'all' ? t('pm.epics.all') : id === 'none' ? t('pm.epic.none') : e!.title;
              if (id === 'none' && !items.some((x) => !x.epicId)) return null;
              return (
                <button key={id} type="button" className="pm-epic" aria-pressed={epic === id} onClick={() => setEpic(id)}>
                  {e && <Icon name="bookmark" size={13} />}
                  <span className="pm-epic__name">{label}</span>
                  <span className="pm-epic__pts num">{t('pm.points.short', { n: n(epicPoints(id)) })}</span>
                </button>
              );
            })}
          </div>
                </FilterGroup>
              )}
            </FilterSheet>
          </div>
        )}

        <div className="pm-backlog__sum">
          {canWrite && shown.length > 0 && (
            <label className="checkbox">
              <input
                type="checkbox"
                checked={shown.every((x) => selected.has(x.id))}
                onChange={(e) => setSelected(e.target.checked ? new Set([...selected, ...shown.map((x) => x.id)]) : new Set([...selected].filter((id) => !shown.some((x) => x.id === id))))}
              />
              <span>{t('board.selectAll')}</span>
            </label>
          )}
          <span className="muted num">{t('pm.backlog.sum', { n: n(shown.length), points: t('pm.points.short', { n: n(pointsOf(shown)) }) })}</span>
        </div>

        {items.length === 0 ? (
          <EmptyState icon="list" title={t('pm.backlog.empty')} body={t('pm.backlog.emptyBody')}>
            {canWrite && (
              <button className="btn btn--primary" onClick={() => quickAdd({ boardId: board.id, status: board.columns[0].key })}>
                <Icon name="plus" size={16} />
                {t('board.newTask')}
              </button>
            )}
          </EmptyState>
        ) : shown.length === 0 ? (
          <EmptyState compact icon="filter" title={t('pm.backlog.epicEmpty')}>
            <button className="btn" onClick={() => (setEpic('all'), setQ(''))}>
              {t('pm.epics.all')}
            </button>
          </EmptyState>
        ) : (
          <ul ref={listRef} className="pm-backlog" data-dragging={dragging ? 'yes' : undefined} data-write={canWrite || undefined}>
            <li className="pm-row pm-row--head" aria-hidden="true">
              <span />
              <span />
              <span className="pm-row__h pm-row__h--title">{t('task.title')}</span>
              <span className="pm-row__h pm-row__h--epic">{t('pm.epic')}</span>
              <span className="pm-row__h pm-row__h--pts">{t('pm.points')}</span>
            </li>
            {shown.map((x, i) => (
              <BacklogRow
                key={x.id}
                task={x}
                first={i === 0}
                last={i === shown.length - 1}
                canWrite={canWrite}
                selected={selected.has(x.id)}
                tabStop={x.id === tabStop}
                epics={epics}
                onToggle={(on) => toggle(x.id, on)}
                onFocus={() => setFocusId(x.id)}
                onKey={(e) => onRowKey(e, x)}
                onMove={(dir) => move(x, dir)}
                onEdit={(c) => void edit(x, c)}
              />
            ))}
          </ul>
        )}
        {canWrite && shown.length > 0 && dragging && <BacklogEnd />}
      </div>
      <DragOverlay>
        {dragging ? (
          <div className="pm-backlog__ghost">
            <IssueBadge type={dragging.issueType ?? 'task'} /> {dragging.title}
          </div>
        ) : null}
      </DragOverlay>
      {starting && (
        <Confirm
          title={t('pm.sprint.startTitle', { name: starting.name })}
          body={t('pm.sprint.startBody')}
          confirmLabel={t('pm.sprint.start')}
          onClose={() => setStarting(null)}
          onConfirm={async () => {
            if (await save(() => put(`/sprints/${starting.id}/state`, { state: 'active' }), t('pm.sprint.started', { name: starting.name }))) {
              void reloadSprints();
              changed();
            }
          }}
        />
      )}
    </DndContext>
  );
}

/** One backlog row: picked with its box (the keyboard's stop), dragged by its grip, edited in place. */
function BacklogRow({
  task,
  first,
  last,
  canWrite,
  selected,
  tabStop,
  epics,
  onToggle,
  onFocus,
  onKey,
  onMove,
  onEdit,
}: {
  task: Task;
  first: boolean;
  last: boolean;
  canWrite: boolean;
  selected: boolean;
  tabStop: boolean;
  epics: PmEpic[] | null;
  onToggle: (on: boolean) => void;
  onFocus: () => void;
  onKey: (e: KeyboardEvent<HTMLInputElement>) => void;
  onMove: (dir: -1 | 1) => void;
  onEdit: (c: PmChanges) => void;
}) {
  const { t } = useI18n();
  const f = useFormat();
  const drag = useDraggable({ id: task.id, disabled: !canWrite });
  const drop = useDroppable({ id: `row:${task.id}` });
  const ref = (el: HTMLLIElement | null) => {
    drag.setNodeRef(el);
    drop.setNodeRef(el);
  };
  const type = task.issueType ?? 'task';
  const known = task.storyPoints == null || (FIBONACCI as readonly number[]).includes(task.storyPoints);
  const name = (field: string) => t('pm.inline.label', { field, title: task.title });
  return (
    <li
      ref={ref}
      className="pm-row"
      data-row={task.id}
      data-selected={selected || undefined}
      data-dragging={drag.isDragging || undefined}
      data-over={drop.isOver && !drag.isDragging ? 'yes' : undefined}
    >
      {canWrite ? (
        <button className="btn btn--quiet btn--icon btn--small pm-grip" aria-label={t('pm.reorder')} title={t('pm.reorder')} {...drag.attributes} {...drag.listeners} tabIndex={-1}>
          <Icon name="grip" size={14} />
        </button>
      ) : (
        <span />
      )}
      {canWrite ? (
        <label className="pm-row__pick">
        <input
          type="checkbox"
          className="pm-row__check"
          aria-label={t('board.select', { title: task.title })}
          tabIndex={tabStop ? 0 : -1}
          checked={selected}
          onChange={(e) => onToggle(e.target.checked)}
          onFocus={onFocus}
          onKeyDown={onKey}
        />
        </label>
      ) : (
        <span />
      )}
      <span className="pm-row__title">
        <button className="rowlink" onClick={() => setQuery('task', task.id)}>
          {task.title}
        </button>
      </span>
      <span className="pm-row__props">
        <select className="pm-inline pm-inline--type" data-tone={TONE[type]} value={type} disabled={!canWrite} aria-label={name(t('pm.type.label'))} onChange={(e) => onEdit({ issueType: e.target.value as IssueType })}>
          {ISSUE_TYPES.map((k) => (
            <option key={k} value={k}>
              {t(`pm.type.${k}`)}
            </option>
          ))}
        </select>
        <select className="pm-inline pm-inline--epic" value={task.epicId ?? ''} disabled={!canWrite || epics === null} aria-label={name(t('pm.epic'))} onChange={(e) => onEdit({ epicId: e.target.value || null })}>
          <option value="">{t('pm.epic.none')}</option>
          {(epics ?? []).map((x) => (
            <option key={x.id} value={x.id}>
              {x.title}
            </option>
          ))}
        </select>
        <select
          className="pm-inline pm-inline--pts num"
          data-empty={task.storyPoints == null || undefined}
          value={task.storyPoints ?? ''}
          disabled={!canWrite}
          aria-label={name(t('pm.points'))}
          onChange={(e) => onEdit({ storyPoints: e.target.value === '' ? null : Number(e.target.value) })}
        >
          <option value="">{t('pm.points.none')}</option>
          {!known && <option value={task.storyPoints!}>{t('pm.points.short', { n: f.number(task.storyPoints!, { digits: 1 }) })}</option>}
          {FIBONACCI.map((v) => (
            <option key={v} value={v}>
              {t('pm.points.short', { n: f.number(v) })}
            </option>
          ))}
        </select>
      </span>
      {canWrite && (
        <span className="pm-row__moves">
          <button className="btn btn--quiet btn--icon btn--small" disabled={first} aria-label={t('pm.moveUp')} title={t('pm.moveUp')} onClick={() => onMove(-1)} tabIndex={-1}>
            <Icon name="chevronDown" size={14} className="pm-flip" />
          </button>
          <button className="btn btn--quiet btn--icon btn--small" disabled={last} aria-label={t('pm.moveDown')} title={t('pm.moveDown')} onClick={() => onMove(1)} tabIndex={-1}>
            <Icon name="chevronDown" size={14} />
          </button>
        </span>
      )}
    </li>
  );
}

/** A sprint shown as a drop target while a backlog item is being dragged. */
function SprintDropZone({ sprint }: { sprint: Sprint }) {
  const { setNodeRef, isOver } = useDroppable({ id: `sprint:${sprint.id}` });
  return (
    <span ref={setNodeRef} className="pm-dropzone" data-over={isOver || undefined}>
      {sprint.name}
    </span>
  );
}

/** A drop target below the last row, to drop an item at the end of the backlog. */
function BacklogEnd() {
  const { setNodeRef, isOver } = useDroppable({ id: 'backlog-end' });
  return <div ref={setNodeRef} className="pm-backlog__end" data-over={isOver || undefined} aria-hidden="true" />;
}
