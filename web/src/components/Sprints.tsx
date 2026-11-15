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
import { IssueBadge, PointsChip, useEpics } from './Pm';
import { BurndownChart, SprintFacts, useBurndown } from './Burndown';
import { useSprints } from './pmData';
import '../surfaces/product.css';
import { Presence } from './Presence';
import { Confirm, Dialog } from './ui';
import { DateField } from './DateField';

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

function Bar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <span className="pm-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
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
  const { canWrite, toast } = useStore();
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
          {s.goal && <p className="muted u-m-0-0-8">{s.goal}</p>}
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
              className="btn btn--quiet btn--small u-ms-auto"
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
  const { epics } = useEpics(board.id, true, refreshKey);
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
                    <span style={{ '--w': `${(velocity[i] / peak) * 100}%` } as CSSProperties} />
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
                <span className="muted u-ms-auto">
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
