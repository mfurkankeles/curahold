// Backlog and sprints of a board: plan work into a sprint, run the active one on
// the board's own stages, close it, and read how much was finished.
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { Board, Sprint, SprintSummary, Task } from '../../../shared/src/model';
import { KanbanView } from '../pages/BoardPage';
import { ApiFailure, del, get, post, put, patch } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { usePresence } from '../lib/live';
import { setQuery } from '../lib/router';
import { useSaver } from '../lib/saver';
import { useStore } from '../lib/store';
import { positionBetween, saveTask } from '../lib/tasks';
import { EmptyState, LoadError, SkeletonRows } from './Empty';
import { Icon } from './icons';
import { CardEditContext, CardFields, IssueBadge, PointsChip, savePm, useEpics, type CardChanges } from './Pm';
import { BurndownChart, SprintFacts, useBurndown } from './Burndown';
import { closedInOrder, finishedPoints, pointsOf, teamVelocity, useSprints } from './pmData';
import { CapacityMeter } from './Backlog';
import { ReleaseNotes } from './ReleaseNotes';
import { useUndo } from '../lib/undo';
import { useFormat } from '../lib/useFormat';
import '../surfaces/product.css';
import { Presence } from './Presence';
import { Confirm, Dialog } from './ui';
import { DateField } from './DateField';
import { FlowReport } from './Flow';

export { BacklogView } from './Backlog';

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

function Bar({ done, total, label }: { done: number; total: number; label: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <span className="pm-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <span style={{ '--w': `${pct}%` } as CSSProperties} />
    </span>
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
          <button className="btn btn--primary btn--small" aria-label={t('pm.sprint.new')} onClick={() => setEditing('new')}>
            <Icon name="plus" size={15} />
            <span className="hide-phone">{t('pm.sprint.new')}</span>
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
          <DateField value={startsOn} max={endsOn || undefined} label={t('pm.sprint.startsOn')} onChange={setStartsOn} />
          <Icon name="arrowRight" size={14} />
          <DateField value={endsOn} min={startsOn || undefined} label={t('pm.sprint.endsOn')} onChange={setEndsOn} />
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

function ActiveSprint({ board, sprint, sprints, refreshKey, onChanged, onList }: { board: Board; sprint: Sprint | null; sprints: Sprint[]; refreshKey: number; onChanged: () => void; onList: () => void }) {
  const { t } = useI18n();
  const { canWrite, toast, people } = useStore();
  const [items, setItems] = useState<Task[] | null>(null);
  const [closing, setClosing] = useState(false);
  const [bump, setBump] = useState(0);
  const sprintId = sprint?.id ?? null;
  const here = usePresence(sprintId ? `p:${sprintId}` : null);
  const doneKeys = useMemo(() => new Set(board.columns.filter((c) => c.done).map((c) => c.key)), [board]);
  const summary = useSummary(sprintId, refreshKey + bump);
  const burndown = useBurndown(sprintId, refreshKey + bump);

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

  // Type, points and owner changed on the card: shown at once, put back and said if the server refuses.
  const assignable = useMemo(() => people.filter((p) => p.seat === 'full' && (p.status === 'active' || p.status === 'invited')), [people]);
  const editCard = useCallback(
    async (task: Task, c: CardChanges) => {
      setItems((list) => (list ?? []).map((x) => (x.id === task.id ? { ...x, ...c } : x)));
      try {
        let saved: Task;
        if (c.assigneeIds) {
          const r = await saveTask(task, { assigneeIds: c.assigneeIds });
          if (r.conflicts.length) toast(t('task.conflictLost'), 'error');
          saved = r.task;
        } else saved = await savePm(task, c);
        setItems((list) => (list ?? []).map((x) => (x.id === task.id ? { ...x, ...saved } : x)));
        if (c.storyPoints !== undefined) setBump((n) => n + 1);
      } catch (e) {
        setItems((list) => (list ?? []).map((x) => (x.id === task.id ? task : x)));
        toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
      }
    },
    [toast, t],
  );
  const cardEdit = useCallback((task: Task) => <CardFields task={task} people={assignable} canWrite={canWrite} onEdit={(c) => void editCard(task, c)} />, [assignable, canWrite, editCard]);

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
        <Presence who={here.who} />
        {canWrite && (
          <button className="btn btn--small" onClick={() => setClosing(true)}>
            {t('pm.sprint.complete')}
          </button>
        )}
      </div>
      {sprint.goal && <p className="muted u-m-0-0-12">{sprint.goal}</p>}
      {summary && (
        <div className="pm-overview">
          <div className="pm-overview__grid">
            {summary.itemCount > 0 && burndown && <BurndownChart data={burndown} />}
            <SprintFacts summary={summary} burndown={burndown} />
          </div>
        </div>
      )}
      {items === null ? (
        <SkeletonRows label={t('common.loading')} />
      ) : items.length === 0 ? (
        <EmptyState compact icon="list" title={t('pm.sprint.itemsEmpty')} />
      ) : (
        <CardEditContext.Provider value={cardEdit}>
          <KanbanView board={board} tasks={items} doneKeys={doneKeys} onMove={onMove} canWrite={canWrite} />
        </CardEditContext.Provider>
      )}
      {closing && <CloseSprint sprint={sprint} sprints={sprints} doneKeys={doneKeys} onClose={() => setClosing(false)} onDone={onChanged} />}
    </>
  );
}

function CloseSprint({ sprint, sprints, doneKeys, onClose, onDone }: { sprint: Sprint; sprints: Sprint[]; doneKeys: Set<string>; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const f = useFormat();
  const save = useSaver();
  const summary = useSummary(sprint.id, 0);
  const others = sprints.filter((s) => s.id !== sprint.id && s.state !== 'closed');
  // Unfinished work goes on to the next planned sprint by default, else back to the backlog.
  const [to, setTo] = useState(() => others.find((s) => s.state === 'future')?.id ?? '');
  const [items, setItems] = useState<Task[] | null>(null);
  useEffect(() => {
    get<{ tasks: Task[] }>(`/sprints/${sprint.id}/items`)
      .then((r) => setItems(r.tasks))
      .catch(() => setItems([]));
  }, [sprint.id]);
  const open = (items ?? []).filter((x) => !doneKeys.has(x.status));
  const left = summary ? summary.itemCount - summary.doneCount : open.length;
  return (
    <Confirm
      title={t('pm.sprint.completeTitle', { name: sprint.name })}
      body={summary ? t('pm.sprint.completeBody', { done: f.number(summary.doneCount), total: f.number(summary.itemCount), left: f.number(left) }) : t('common.loading')}
      confirmLabel={t('pm.sprint.complete')}
      onClose={onClose}
      onConfirm={async () => {
        const ok = await save(() => put(`/sprints/${sprint.id}/state`, { state: 'closed', moveIncompleteTo: to || null }), t('pm.sprint.closedToast', { name: sprint.name }));
        if (ok) onDone();
      }}
    >
      {left > 0 && (
        <>
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
          {open.length > 0 && (
            <div className="pm-carry">
              <p className="pm-carry__head muted num">{t('pm.sprint.carry', { n: f.number(open.length), points: t('pm.points.short', { n: f.number(pointsOf(open)) }) })}</p>
              <ul className="pm-carry__list" tabIndex={0} aria-label={t('pm.sprint.carryList')}>
                {open.map((x) => (
                  <li key={x.id}>
                    <IssueBadge type={x.issueType ?? 'task'} />
                    <span className="pm-carry__title">{x.title}</span>
                    <PointsChip points={x.storyPoints} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Confirm>
  );
}

function SprintList({ board, sprints, refreshKey, onChanged, onEdit }: { board: Board; sprints: Sprint[]; refreshKey: number; onChanged: () => void; onEdit: (s: Sprint) => void }) {
  void refreshKey;
  const { t } = useI18n();
  const { canWrite } = useStore();
  const save = useSaver();
  const [starting, setStarting] = useState<Sprint | null>(null);
  const [closing, setClosing] = useState<Sprint | null>(null);
  const [removing, setRemoving] = useState<Sprint | null>(null);
  const [notes, setNotes] = useState<Sprint | null>(null);
  const doneKeys = useMemo(() => new Set(board.columns.filter((c) => c.done).map((c) => c.key)), [board]);
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
                {s.state === 'closed' && (
                  <button className="btn btn--small" onClick={() => setNotes(s)}>
                    <Icon name="list" size={14} />
                    {t('pm.notes.button')}
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
          {s.goal && <p className="muted u-m-0-0-8">{s.goal}</p>}
          <SprintBrief sprint={s} sprints={sprints} />
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
      {closing && <CloseSprint sprint={closing} sprints={sprints} doneKeys={doneKeys} onClose={() => setClosing(null)} onDone={onChanged} />}
      {notes && <ReleaseNotes sprint={notes} doneKeys={doneKeys} onClose={() => setNotes(null)} />}
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

/** One line under a sprint: points done of total; a planned sprint shows how full it is against the team's pace. */
function SprintBrief({ sprint, sprints }: { sprint: Sprint; sprints: Sprint[] }) {
  const { t } = useI18n();
  const f = useFormat();
  const tot = sprint.totals;
  if (!tot) return null;
  if (sprint.state === 'future') {
    return (
      <div className="pm-brief pm-brief--plan">
        <CapacityMeter planned={tot.points} limit={teamVelocity(sprints).average} />
        <span className="muted num">{t('pm.sprint.items', { n: f.number(tot.items) })}</span>
      </div>
    );
  }
  const done = sprint.state === 'closed' ? finishedPoints(sprint) : tot.donePoints;
  return (
    <div className="pm-brief">
      <Bar done={done} total={tot.points} label={t('pm.points.doneOf', { name: sprint.name })} />
      <span className="muted num">
        {t('pm.summary.progress', { done: f.number(done), total: f.number(tot.points) })} · {t('pm.sprint.items', { n: f.number(tot.items) })}
      </span>
    </div>
  );
}

function SprintItems({ sprint, editable, onChanged }: { sprint: Sprint; editable: boolean; onChanged: () => void }) {
  const { t } = useI18n();
  const save = useSaver();
  const offer = useUndo();
  const [items, setItems] = useState<Task[] | null>(null);
  const load = useCallback(async () => {
    try {
      setItems((await get<{ tasks: Task[] }>(`/sprints/${sprint.id}/items`)).tasks);
    } catch {
      setItems([]);
    }
  }, [sprint.id]);
  useEffect(() => void load(), [load]);
  if (items === null) return <SkeletonRows rows={2} label={t('common.loading')} />;
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
              className="btn btn--quiet btn--small u-ms-auto"
              onClick={async () => {
                if (await save(() => del(`/sprints/${sprint.id}/items/${x.id}`), false)) {
                  void load();
                  onChanged();
                  offer(
                    t('pm.removed'),
                    () => put(`/sprints/${sprint.id}/items`, { taskIds: [x.id] }),
                    () => (void load(), onChanged()),
                  );
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

/** Sprints in order with their progress, the team's velocity, and the epics with what their stories add up to. */
function Roadmap({ board, sprints, refreshKey }: { board: Board; sprints: Sprint[]; refreshKey: number }) {
  const { t } = useI18n();
  const f = useFormat();
  const { epics } = useEpics(board.id, true, refreshKey);
  const ordered = [...sprints].sort((a, b) => a.position - b.position);
  const closed = closedInOrder(sprints);
  const velocity = closed.map(finishedPoints);
  const { average, last } = teamVelocity(sprints);
  const peak = Math.max(1, ...velocity);
  const n = (v: number) => f.number(v, { digits: v % 1 ? 1 : 0 });

  return (
    <div className="pm-roadmap">
      <section>
        <h3 className="section__head">
          <span>{t('pm.velocity')}</span>
        </h3>
        <p className="field__hint">{t('pm.velocity.hint')}</p>
        {closed.length === 0 ? (
          <p className="muted">{t('pm.velocity.none')}</p>
        ) : (
          <>
            <dl className="pm-facts pm-facts--wide">
              <div className="pm-fact" data-tone="done">
                <dt>{t('pm.velocity.last')}</dt>
                <dd className="num">{n(velocity[velocity.length - 1])}</dd>
              </div>
              <div className="pm-fact">
                <dt>{t('pm.velocity.average3', { n: n(last.length) })}</dt>
                <dd className="num">{average == null ? '–' : n(average)}</dd>
              </div>
            </dl>
            <ul className="pm-velocity">
              {closed.map((s, i) => (
                <li key={s.id}>
                  <span className="pm-velocity__name">{s.name}</span>
                  <span className="pm-bar">
                    <span style={{ '--w': `${(velocity[i] / peak) * 100}%` } as CSSProperties} />
                  </span>
                  <span className="num">{n(velocity[i])}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <FlowReport boardId={board.id} refreshKey={refreshKey} />
      <section>
        <h3 className="section__head">
          <span>{t('pm.sprints')}</span>
        </h3>
        {ordered.length === 0 ? (
          <p className="muted">{t('pm.sprint.empty')}</p>
        ) : (
          <ul className="pm-timeline">
            {ordered.map((s) => (
              <li key={s.id} data-state={s.state}>
                <div>
                  <strong>{s.name}</strong> <StateChip state={s.state} /> <SprintDates sprint={s} />
                </div>
                <SprintBrief sprint={s} sprints={sprints} />
              </li>
            ))}
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
          <ul className="pm-items pm-epiclist">
            {epics.map((e) => (
              <li key={e.id}>
                <IssueBadge type="epic" />
                <button className="rowlink" onClick={() => setQuery('task', e.id)}>
                  {e.title}
                </button>
                <span className="pm-epiclist__bar">
                  <Bar done={e.childDonePoints ?? 0} total={e.childPoints ?? 0} label={t('pm.points.doneOf', { name: e.title })} />
                </span>
                <span className="muted num pm-epiclist__nums">
                  {t('pm.summary.progress', { done: n(e.childDonePoints ?? 0), total: n(e.childPoints ?? 0) })} · {t('pm.sprint.items', { n: n(e.childCount) })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
