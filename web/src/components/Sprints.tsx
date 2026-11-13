// Backlog and sprints of a board: plan work into a sprint, run the active one on
// the board's own stages, close it, and read how much was finished.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Board, Sprint, SprintSummary, Task } from '../../../shared/src/model';
import { ISSUE_TYPES } from '../../../shared/src/model';
import { KanbanView } from '../pages/BoardPage';
import { ApiFailure, del, get, post, put, patch } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { setQuery } from '../lib/router';
import { useSaver } from '../lib/saver';
import { useStore } from '../lib/store';
import { positionBetween, saveTask } from '../lib/tasks';
import { EmptyState, LoadError, SkeletonRows } from './Empty';
import { Icon } from './icons';
import { IssueBadge, PointsChip, useEpics } from './Pm';
import { Confirm, Dialog } from './ui';

const sum = (xs: Task[]) => xs.reduce((n, x) => n + (x.storyPoints ?? 0), 0);

/** The board's sprints (not archived), and a way to reload them. */
function useSprints(boardId: string, refreshKey: number) {
  const [sprints, setSprints] = useState<Sprint[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    try {
      setSprints((await get<{ sprints: Sprint[] }>(`/boards/${boardId}/sprints`)).sprints);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [boardId]);
  useEffect(() => void load(), [load, refreshKey]);
  return { sprints, failed, reload: load };
}

function SprintDates({ sprint }: { sprint: Sprint }) {
  const { fmtDate } = useI18n();
  if (!sprint.startsOn && !sprint.endsOn) return null;
  const f = (d: string | null) => (d ? fmtDate(d.slice(0, 10), { day: 'numeric', month: 'short' }) : '…');
  return <span className="muted num">{`${f(sprint.startsOn)} – ${f(sprint.endsOn)}`}</span>;
}

function StateChip({ state }: { state: Sprint['state'] }) {
  const { t } = useI18n();
  return (
    <span className="schip" data-tone={state === 'active' ? 'green' : state === 'closed' ? 'slate' : 'amber'}>
      {t(`pm.sprint.${state}`)}
    </span>
  );
}

function Bar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <span className="pm-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

// ------------------------------------------------------------------ backlog

export function BacklogView({ board, refreshKey }: { board: Board; refreshKey: number }) {
  const { t } = useI18n();
  const { canWrite, toast } = useStore();
  const save = useSaver();
  const { epics } = useEpics(board.id);
  const { sprints } = useSprints(board.id, refreshKey);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState('');
  const open = useMemo(() => (sprints ?? []).filter((s) => s.state !== 'closed'), [sprints]);

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
  // The preselected sprint: the active one, else the first planned.
  useEffect(() => {
    if (!target || !open.some((s) => s.id === target)) setTarget((open.find((s) => s.state === 'active') ?? open[0])?.id ?? '');
  }, [open, target]);

  const addTo = async (ids: string[]) => {
    const sprint = open.find((s) => s.id === target);
    if (!sprint || !ids.length) return;
    const ok = await save(() => put(`/sprints/${sprint.id}/items`, { taskIds: ids }), t('pm.backlog.added', { n: ids.length, sprint: sprint.name }));
    if (ok) {
      setSelected(new Set());
      void load();
    }
  };

  const move = async (task: Task, dir: -1 | 1) => {
    const list = tasks ?? [];
    const i = list.findIndex((x) => x.id === task.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    // Between the neighbours on the far side of the one it passes.
    const position = dir < 0 ? positionBetween(list[j - 1]?.position, list[j].position) : positionBetween(list[j].position, list[j + 1]?.position);
    const previous = tasks;
    setTasks(list.map((x) => (x.id === task.id ? { ...x, position } : x)).sort((a, b) => a.position - b.position));
    try {
      const r = await saveTask(task, { position });
      setTasks((cur) => (cur ?? []).map((x) => (x.id === task.id ? { ...x, ...r.task } : x)).sort((a, b) => a.position - b.position));
    } catch (e) {
      setTasks(previous);
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    }
  };

  if (failed && tasks === null) return <div className="page"><LoadError onRetry={() => void load()} /></div>;
  if (tasks === null) return <div className="page"><SkeletonRows label={t('common.loading')} /></div>;
  const epicName = (id: string | null | undefined) => (id ? epics?.find((e) => e.id === id)?.title : undefined);

  return (
    <div className="page">
      <p className="muted" style={{ marginTop: 0 }}>
        {t('pm.backlog.hint')} <span className="num">{t('pm.points.short', { n: sum(tasks) })}</span>
      </p>
      {canWrite && (
        <div className="bulkbar" role="region" aria-label={t('pm.addToSprint')}>
          <strong>{selected.size ? t('board.selected', { n: selected.size }) : t('pm.addToSprint')}</strong>
          {open.length ? (
            <>
              <select className="select" value={target} aria-label={t('pm.sprint')} onChange={(e) => setTarget(e.target.value)}>
                {open.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({t(`pm.sprint.${s.state}`)})
                  </option>
                ))}
              </select>
              <button className="btn btn--primary btn--small" disabled={!selected.size || !target} onClick={() => addTo([...selected])}>
                {t('pm.addToSprint')}
              </button>
            </>
          ) : (
            <span className="muted">{t('pm.backlog.noSprints')}</span>
          )}
        </div>
      )}
      {tasks.length === 0 ? (
        <EmptyState compact icon="list" title={t('pm.backlog.empty')} />
      ) : (
        <table className="table tasklist pm-backlog">
          <thead>
            <tr>
              {canWrite && (
                <th className="check-cell">
                  <input type="checkbox" aria-label={t('board.selectAll')} checked={tasks.every((x) => selected.has(x.id))} onChange={(e) => setSelected(e.target.checked ? new Set(tasks.map((x) => x.id)) : new Set())} />
                </th>
              )}
              <th>{t('task.title')}</th>
              <th>{t('pm.epic')}</th>
              <th>{t('pm.points')}</th>
              {canWrite && <th aria-hidden="true" />}
            </tr>
          </thead>
          <tbody>
            {tasks.map((x, i) => (
              <tr key={x.id} className="tasklist__row" onClick={(e) => !(e.target as HTMLElement).closest('input, button, a, select') && setQuery('task', x.id)}>
                {canWrite && (
                  <td className="check-cell">
                    <input
                      type="checkbox"
                      aria-label={t('board.select', { title: x.title })}
                      checked={selected.has(x.id)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(x.id);
                        else next.delete(x.id);
                        setSelected(next);
                      }}
                    />
                  </td>
                )}
                <td className="tasklist__title">
                  <IssueBadge type={x.issueType ?? 'task'} />
                  <button className="rowlink" onClick={() => setQuery('task', x.id)}>
                    {x.title}
                  </button>
                </td>
                <td className="muted">{epicName(x.epicId)}</td>
                <td>
                  <PointsChip points={x.storyPoints} />
                </td>
                {canWrite && (
                  <td className="pm-rowactions">
                    <button className="btn btn--quiet btn--icon btn--small" disabled={i === 0} aria-label={t('pm.moveUp')} title={t('pm.moveUp')} onClick={() => move(x, -1)}>
                      <Icon name="chevronDown" size={14} className="pm-flip" />
                    </button>
                    <button className="btn btn--quiet btn--icon btn--small" disabled={i === tasks.length - 1} aria-label={t('pm.moveDown')} title={t('pm.moveDown')} onClick={() => move(x, 1)}>
                      <Icon name="chevronDown" size={14} />
                    </button>
                    <button className="btn btn--quiet btn--small" disabled={!target} onClick={() => addTo([x.id])}>
                      {t('pm.addToSprint')}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ sprints

type Tab = 'board' | 'list' | 'roadmap';

export function SprintsView({ board, refreshKey }: { board: Board; refreshKey: number }) {
  const { t } = useI18n();
  const { canWrite } = useStore();
  const { sprints, failed, reload } = useSprints(board.id, refreshKey);
  const [tab, setTab] = useState<Tab>('board');
  const [editing, setEditing] = useState<Sprint | 'new' | null>(null);
  const [version, setVersion] = useState(0);
  const changed = () => {
    setVersion((v) => v + 1);
    void reload();
  };

  if (failed && sprints === null) return <div className="page"><LoadError onRetry={() => void reload()} /></div>;
  if (sprints === null) return <div className="page"><SkeletonRows label={t('common.loading')} /></div>;
  const active = sprints.find((s) => s.state === 'active') ?? null;

  return (
    <div className="page pm-page">
      <div className="pm-bar-row">
        <div className="seg" role="group">
          {(['board', 'list', 'roadmap'] as const).map((k) => (
            <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>
              {t(`pm.tab.${k}`)}
            </button>
          ))}
        </div>
        <div className="topbar__spacer" />
        {canWrite && (
          <button className="btn btn--primary btn--small" onClick={() => setEditing('new')}>
            <Icon name="plus" size={15} /> {t('pm.sprint.new')}
          </button>
        )}
      </div>
      {tab === 'board' && <ActiveSprint board={board} sprint={active} sprints={sprints} refreshKey={refreshKey + version} onChanged={changed} onList={() => setTab('list')} />}
      {tab === 'list' && <SprintList board={board} sprints={sprints} refreshKey={refreshKey + version} onChanged={changed} onEdit={setEditing} />}
      {tab === 'roadmap' && <Roadmap board={board} sprints={sprints} refreshKey={refreshKey + version} />}
      {editing && <SprintForm boardId={board.id} sprint={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={changed} />}
    </div>
  );
}

function SprintForm({ boardId, sprint, onClose, onSaved }: { boardId: string; sprint: Sprint | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const save = useSaver();
  const [name, setName] = useState(sprint?.name ?? '');
  const [goal, setGoal] = useState(sprint?.goal ?? '');
  const [startsOn, setStartsOn] = useState(sprint?.startsOn?.slice(0, 10) ?? '');
  const [endsOn, setEndsOn] = useState(sprint?.endsOn?.slice(0, 10) ?? '');
  const [busy, setBusy] = useState(false);
  const bad = !!startsOn && !!endsOn && startsOn > endsOn;
  return (
    <Dialog
      title={sprint ? t('pm.sprint.edit') : t('pm.sprint.new')}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--quiet" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn--primary"
            disabled={busy || !name.trim() || bad}
            onClick={async () => {
              setBusy(true);
              const body = { name: name.trim(), goal, startsOn: startsOn || null, endsOn: endsOn || null };
              const ok = await save(() => (sprint ? patch(`/sprints/${sprint.id}`, body) : post(`/boards/${boardId}/sprints`, body)));
              setBusy(false);
              if (ok) {
                onSaved();
                onClose();
              }
            }}
          >
            {sprint ? t('common.save') : t('common.create')}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">{t('pm.sprint.name')}</span>
        <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">{t('pm.sprint.goal')}</span>
        <textarea className="input" rows={3} maxLength={2000} value={goal} onChange={(e) => setGoal(e.target.value)} />
      </label>
      <div className="field">
        <span className="field__label">{t('pm.sprint.dates')}</span>
        <span className="daterange">
          <input className="input num" type="date" value={startsOn} max={endsOn || undefined} aria-label={t('pm.sprint.startsOn')} onChange={(e) => setStartsOn(e.target.value)} />
          <Icon name="arrowRight" size={14} />
          <input className="input num" type="date" value={endsOn} min={startsOn || undefined} aria-label={t('pm.sprint.endsOn')} onChange={(e) => setEndsOn(e.target.value)} />
        </span>
      </div>
    </Dialog>
  );
}

function useSummary(sprintId: string | null, refreshKey: number) {
  const [summary, setSummary] = useState<SprintSummary | null>(null);
  useEffect(() => {
    setSummary(null);
    if (!sprintId) return;
    let live = true;
    get<{ summary: SprintSummary }>(`/sprints/${sprintId}/summary`)
      .then((r) => live && setSummary(r.summary))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [sprintId, refreshKey]);
  return summary;
}

function SummaryStrip({ summary }: { summary: SprintSummary | null }) {
  const { t } = useI18n();
  if (!summary) return null;
  return (
    <div className="pm-summary">
      <div className="statstrip">
        <div className="stat">
          <span className="muted">{t('pm.points.total')}</span>
          <strong className="num">{summary.totalPoints}</strong>
        </div>
        <div className="stat" data-tone="done">
          <span className="muted">{t('pm.points.done')}</span>
          <strong className="num">{summary.donePoints}</strong>
        </div>
        <div className="stat">
          <span className="muted">{t('pm.summary.items')}</span>
          <strong className="num">{`${summary.doneCount} / ${summary.itemCount}`}</strong>
        </div>
        <div className="stat" data-tone={summary.unestimated ? 'soon' : undefined}>
          <span className="muted">{t('pm.points.unestimated')}</span>
          <strong className="num">{summary.unestimated}</strong>
        </div>
      </div>
      <Bar done={summary.donePoints} total={summary.totalPoints} />
      <div className="card__chips" style={{ marginTop: 8 }}>
        {ISSUE_TYPES.filter((k) => summary.byType[k]?.count).map((k) => (
          <span key={k} className="schip" data-tone="slate">
            {t(`pm.type.${k}`)} {summary.byType[k].done}/{summary.byType[k].count} · {t('pm.points.short', { n: summary.byType[k].points })}
          </span>
        ))}
      </div>
    </div>
  );
}

function ActiveSprint({ board, sprint, sprints, refreshKey, onChanged, onList }: { board: Board; sprint: Sprint | null; sprints: Sprint[]; refreshKey: number; onChanged: () => void; onList: () => void }) {
  const { t } = useI18n();
  const { canWrite, toast } = useStore();
  const [items, setItems] = useState<Task[] | null>(null);
  const [closing, setClosing] = useState(false);
  const [bump, setBump] = useState(0);
  const sprintId = sprint?.id ?? null;
  const doneKeys = useMemo(() => new Set(board.columns.filter((c) => c.done).map((c) => c.key)), [board]);
  const summary = useSummary(sprintId, refreshKey + bump);

  const load = useCallback(async () => {
    if (!sprintId) return;
    try {
      setItems((await get<{ tasks: Task[] }>(`/sprints/${sprintId}/items`)).tasks);
    } catch {
      setItems([]);
    }
  }, [sprintId]);
  useEffect(() => {
    setItems(null);
    void load();
  }, [load, refreshKey]);

  const onMove = useCallback(
    async (task: Task, status: string, beforeId: string | null) => {
      const inCol = (items ?? []).filter((x) => x.status === status && x.id !== task.id).sort((a, b) => a.position - b.position);
      const idx = beforeId ? inCol.findIndex((x) => x.id === beforeId) : inCol.length;
      const at = idx < 0 ? inCol.length : idx;
      const position = positionBetween(inCol[at - 1]?.position, inCol[at]?.position);
      if (task.status === status && Math.abs(task.position - position) < 1e-9) return;
      const previous = items;
      setItems((list) => (list ?? []).map((x) => (x.id === task.id ? { ...x, status, position } : x)));
      try {
        const r = await saveTask(task, { status, position });
        setItems((list) => (list ?? []).map((x) => (x.id === task.id ? { ...x, ...r.task } : x)));
        if (r.conflicts.length) toast(t('task.conflictLost'), 'error');
        setBump((n) => n + 1);
      } catch (e) {
        setItems(previous);
        toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
      }
    },
    [items, toast, t],
  );

  if (!sprint) {
    return (
      <EmptyState compact icon="play" title={t('pm.sprint.noActive')} body={t('pm.sprint.noActiveBody')}>
        <button className="btn" onClick={onList}>
          {t('pm.sprints')}
        </button>
      </EmptyState>
    );
  }
  return (
    <>
      <div className="pm-head">
        <h2 className="pm-head__title">
          {sprint.name} <StateChip state={sprint.state} /> <SprintDates sprint={sprint} />
        </h2>
        {canWrite && (
          <button className="btn btn--small" onClick={() => setClosing(true)}>
            {t('pm.sprint.complete')}
          </button>
        )}
      </div>
      {sprint.goal && <p className="muted" style={{ margin: '0 0 12px' }}>{sprint.goal}</p>}
      <SummaryStrip summary={summary} />
      {items === null ? (
        <SkeletonRows label={t('common.loading')} />
      ) : items.length === 0 ? (
        <EmptyState compact icon="list" title={t('pm.sprint.itemsEmpty')} />
      ) : (
        <KanbanView board={board} tasks={items} doneKeys={doneKeys} onMove={onMove} canWrite={canWrite} />
      )}
      {closing && <CloseSprint sprint={sprint} sprints={sprints} onClose={() => setClosing(false)} onDone={onChanged} />}
    </>
  );
}

function CloseSprint({ sprint, sprints, onClose, onDone }: { sprint: Sprint; sprints: Sprint[]; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const save = useSaver();
  const summary = useSummary(sprint.id, 0);
  const [to, setTo] = useState('');
  const others = sprints.filter((s) => s.id !== sprint.id && s.state !== 'closed');
  const left = summary ? summary.itemCount - summary.doneCount : 0;
  return (
    <Confirm
      title={t('pm.sprint.completeTitle', { name: sprint.name })}
      body={summary ? t('pm.sprint.completeBody', { done: summary.doneCount, total: summary.itemCount, left }) : t('common.loading')}
      confirmLabel={t('pm.sprint.complete')}
      onClose={onClose}
      onConfirm={async () => {
        const ok = await save(() => put(`/sprints/${sprint.id}/state`, { state: 'closed', moveIncompleteTo: to || null }));
        if (ok) onDone();
      }}
    >
      {left > 0 && (
        <label className="field">
          <span className="field__label">{t('pm.sprint.moveTo')}</span>
          <select className="select" value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">{t('pm.backlog')}</option>
            {others.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </Confirm>
  );
}

function SprintList({ board, sprints, refreshKey, onChanged, onEdit }: { board: Board; sprints: Sprint[]; refreshKey: number; onChanged: () => void; onEdit: (s: Sprint) => void }) {
  void board;
  const { t } = useI18n();
  const { canWrite } = useStore();
  const save = useSaver();
  const [starting, setStarting] = useState<Sprint | null>(null);
  const [closing, setClosing] = useState<Sprint | null>(null);
  const [removing, setRemoving] = useState<Sprint | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  if (!sprints.length) return <EmptyState compact icon="play" title={t('pm.sprint.empty')} body={t('pm.sprint.emptyBody')} />;
  const order = { active: 0, future: 1, closed: 2 } as const;
  const sorted = [...sprints].sort((a, b) => order[a.state] - order[b.state] || a.position - b.position);
  return (
    <div className="pm-sprints">
      {sorted.map((s) => (
        <section key={s.id} className="pm-sprint" data-state={s.state}>
          <div className="pm-head">
            <h3 className="pm-head__title">
              <button className="rowlink" onClick={() => setOpenId(openId === s.id ? null : s.id)} aria-expanded={openId === s.id}>
                {s.name}
              </button>{' '}
              <StateChip state={s.state} /> <SprintDates sprint={s} />
            </h3>
            {canWrite && (
              <span className="pm-rowactions">
                {s.state === 'future' && (
                  <button className="btn btn--small" onClick={() => setStarting(s)}>
                    {t('pm.sprint.start')}
                  </button>
                )}
                {s.state === 'active' && (
                  <button className="btn btn--small" onClick={() => setClosing(s)}>
                    {t('pm.sprint.complete')}
                  </button>
                )}
                {s.state !== 'closed' && (
                  <button className="btn btn--quiet btn--icon btn--small" aria-label={t('pm.sprint.edit')} title={t('pm.sprint.edit')} onClick={() => onEdit(s)}>
                    <Icon name="edit" size={15} />
                  </button>
                )}
                <button className="btn btn--quiet btn--icon btn--small" aria-label={t('pm.sprint.delete')} title={t('pm.sprint.delete')} onClick={() => setRemoving(s)}>
                  <Icon name="trash" size={15} />
                </button>
              </span>
            )}
          </div>
          {s.goal && <p className="muted" style={{ margin: '0 0 8px' }}>{s.goal}</p>}
          <SprintBrief sprint={s} refreshKey={refreshKey} />
          {openId === s.id && <SprintItems sprint={s} editable={canWrite && s.state !== 'closed'} onChanged={onChanged} />}
        </section>
      ))}
      {starting && (
        <Confirm
          title={t('pm.sprint.startTitle', { name: starting.name })}
          body={t('pm.sprint.startBody')}
          confirmLabel={t('pm.sprint.start')}
          onClose={() => setStarting(null)}
          onConfirm={async () => {
            if (await save(() => put(`/sprints/${starting.id}/state`, { state: 'active' }))) onChanged();
          }}
        />
      )}
      {closing && <CloseSprint sprint={closing} sprints={sprints} onClose={() => setClosing(null)} onDone={onChanged} />}
      {removing && (
        <Confirm
          title={t('pm.sprint.deleteTitle', { name: removing.name })}
          body={t('pm.sprint.deleteBody')}
          confirmLabel={t('pm.sprint.delete')}
          danger
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            if (await save(() => del(`/sprints/${removing.id}`))) onChanged();
          }}
        />
      )}
    </div>
  );
}

/** One line under a sprint: points done of total, as a thin bar. */
function SprintBrief({ sprint, refreshKey }: { sprint: Sprint; refreshKey: number }) {
  const { t } = useI18n();
  const summary = useSummary(sprint.id, refreshKey);
  if (!summary) return null;
  return (
    <div className="pm-brief">
      <Bar done={summary.donePoints} total={summary.totalPoints} />
      <span className="muted num">
        {t('pm.summary.progress', { done: summary.donePoints, total: summary.totalPoints })} · {t('pm.sprint.items', { n: summary.itemCount })}
      </span>
    </div>
  );
}

function SprintItems({ sprint, editable, onChanged }: { sprint: Sprint; editable: boolean; onChanged: () => void }) {
  const { t } = useI18n();
  const save = useSaver();
  const [items, setItems] = useState<Task[] | null>(null);
  const load = useCallback(async () => {
    try {
      setItems((await get<{ tasks: Task[] }>(`/sprints/${sprint.id}/items`)).tasks);
    } catch {
      setItems([]);
    }
  }, [sprint.id]);
  useEffect(() => void load(), [load]);
  if (items === null) return <p className="muted">{t('common.loading')}</p>;
  if (!items.length) return <p className="muted">{t('pm.sprint.itemsEmpty')}</p>;
  return (
    <ul className="pm-items">
      {items.map((x) => (
        <li key={x.id}>
          <IssueBadge type={x.issueType ?? 'task'} />
          <button className="rowlink" onClick={() => setQuery('task', x.id)}>
            {x.title}
          </button>
          <PointsChip points={x.storyPoints} />
          {editable && (
            <button
              className="btn btn--quiet btn--small"
              style={{ marginInlineStart: 'auto' }}
              onClick={async () => {
                if (await save(() => del(`/sprints/${sprint.id}/items/${x.id}`), t('pm.removed'))) {
                  void load();
                  onChanged();
                }
              }}
            >
              {t('pm.removeFromSprint')}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ roadmap

/** Sprints in order with their progress, velocity of the closed ones, and the epics. */
function Roadmap({ board, sprints, refreshKey }: { board: Board; sprints: Sprint[]; refreshKey: number }) {
  const { t } = useI18n();
  const { epics } = useEpics(board.id);
  const [sums, setSums] = useState<Map<string, SprintSummary> | null>(null);
  useEffect(() => {
    let live = true;
    setSums(null);
    void Promise.all(
      sprints.map((s) =>
        get<{ summary: SprintSummary }>(`/sprints/${s.id}/summary`)
          .then((r) => [s.id, r.summary] as const)
          .catch(() => null),
      ),
    ).then((rows) => live && setSums(new Map(rows.filter((r): r is readonly [string, SprintSummary] => !!r))));
    return () => {
      live = false;
    };
  }, [sprints, refreshKey]);

  const ordered = [...sprints].sort((a, b) => a.position - b.position);
  const closed = ordered.filter((s) => s.state === 'closed' && sums?.get(s.id));
  const velocity = closed.map((s) => sums!.get(s.id)!.donePoints);
  const average = velocity.length ? Math.round((velocity.reduce((a, b) => a + b, 0) / velocity.length) * 10) / 10 : null;
  const peak = Math.max(1, ...velocity);

  return (
    <div className="pm-roadmap">
      <section>
        <h3 className="section__head">
          <span>{t('pm.velocity')}</span>
        </h3>
        <p className="field__hint">{t('pm.velocity.hint')}</p>
        {sums === null ? (
          <SkeletonRows rows={2} label={t('common.loading')} />
        ) : closed.length === 0 ? (
          <p className="muted">{t('pm.velocity.none')}</p>
        ) : (
          <>
            <div className="statstrip">
              <div className="stat" data-tone="done">
                <span className="muted">{t('pm.velocity.last')}</span>
                <strong className="num">{velocity[velocity.length - 1]}</strong>
              </div>
              <div className="stat">
                <span className="muted">{t('pm.velocity.average')}</span>
                <strong className="num">{average}</strong>
              </div>
            </div>
            <ul className="pm-velocity">
              {closed.map((s, i) => (
                <li key={s.id}>
                  <span className="pm-velocity__name">{s.name}</span>
                  <span className="pm-bar">
                    <span style={{ width: `${(velocity[i] / peak) * 100}%` }} />
                  </span>
                  <span className="num">{velocity[i]}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <section>
        <h3 className="section__head">
          <span>{t('pm.sprints')}</span>
        </h3>
        {ordered.length === 0 ? (
          <p className="muted">{t('pm.sprint.empty')}</p>
        ) : (
          <ul className="pm-timeline">
            {ordered.map((s) => {
              const sm = sums?.get(s.id);
              return (
                <li key={s.id} data-state={s.state}>
                  <div>
                    <strong>{s.name}</strong> <StateChip state={s.state} /> <SprintDates sprint={s} />
                  </div>
                  {sm && (
                    <div className="pm-brief">
                      <Bar done={sm.donePoints} total={sm.totalPoints} />
                      <span className="muted num">{t('pm.summary.progress', { done: sm.donePoints, total: sm.totalPoints })}</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section>
        <h3 className="section__head">
          <span>{t('pm.epics')}</span>
        </h3>
        {epics === null ? (
          <SkeletonRows rows={2} label={t('common.loading')} />
        ) : epics.length === 0 ? (
          <p className="muted">{t('pm.epics.empty')}</p>
        ) : (
          <ul className="pm-items">
            {epics.map((e) => (
              <li key={e.id}>
                <IssueBadge type="epic" />
                <button className="rowlink" onClick={() => setQuery('task', e.id)}>
                  {e.title}
                </button>
                <span className="muted" style={{ marginInlineStart: 'auto' }}>
                  {t('pm.sprint.items', { n: e.childCount })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
