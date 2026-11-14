// Product / project management pieces shared by the task panel, the cards and
// the backlog and sprint screens: issue type, story points and epic.
import { useCallback, useEffect, useState } from 'react';
import { FIBONACCI, ISSUE_TYPES, type Board, type IssueType, type Task } from '../../../shared/src/model';
import { ApiFailure, get, patch } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { setQuery } from '../lib/router';
import { useStore } from '../lib/store';
import { Icon } from './icons';

/** A board that was made from the product-development workflow (it has its Backlog and QA stages). */
export const isPmBoard = (board: Pick<Board, 'columns'> | undefined) => !!board && board.columns.some((c) => c.key === 'backlog') && board.columns.some((c) => c.key === 'qa');

/** Whether product management is on for a board: its own switch wins, else whether it has the PM stages. */
export const pmOn = (board: Pick<Board, 'columns' | 'pmEnabled'> | undefined): boolean => board?.pmEnabled ?? isPmBoard(board);

const TONE: Record<IssueType, string> = { epic: 'amber', story: 'green', task: 'slate', bug: 'red', subtask: 'slate', spike: 'amber' };

export function IssueBadge({ type }: { type: IssueType }) {
  const { t } = useI18n();
  return (
    <span className="schip pm-type" data-tone={TONE[type]} title={t('pm.type.label')}>
      {t(`pm.type.${type}`)}
    </span>
  );
}

export function PointsChip({ points }: { points: number | null | undefined }) {
  const { t } = useI18n();
  if (points == null) return null;
  return (
    <span className="schip pm-points" title={t('pm.points')}>
      {t('pm.points.short', { n: points })}
    </span>
  );
}

export interface PmEpic extends Task {
  childCount: number;
}

/** The board's epics, for the picker and the roadmap. */
export function useEpics(boardId: string | undefined, enabled = true) {
  const [epics, setEpics] = useState<PmEpic[] | null>(null);
  const load = useCallback(async () => {
    if (!boardId || !enabled) return;
    try {
      setEpics((await get<{ epics: PmEpic[] }>(`/boards/${boardId}/epics`)).epics);
    } catch {
      setEpics([]);
    }
  }, [boardId, enabled]);
  useEffect(() => void load(), [load]);
  return { epics, reload: load };
}

export type PmChanges = { issueType?: IssueType; storyPoints?: number | null; epicId?: string | null };

/** PATCH /tasks/:id/pm; when someone saved first, the same values go on top of their version. */
export async function savePm(task: Task, changes: PmChanges): Promise<Task> {
  try {
    return (await patch<{ task: Task }>(`/tasks/${task.id}/pm`, { baseVersion: task.version, ...changes })).task;
  } catch (e) {
    if (!(e instanceof ApiFailure) || e.code !== 'conflict') throw e;
    const current = e.body.current as Task;
    return (await patch<{ task: Task }>(`/tasks/${task.id}/pm`, { baseVersion: current.version, ...changes })).task;
  }
}

/** The Fibonacci scale as a select, with room for another number and for "no estimate". */
export function PointsPicker({ value, disabled, onChange }: { value: number | null | undefined; disabled?: boolean; onChange: (v: number | null) => void }) {
  const { t } = useI18n();
  const known = value == null || (FIBONACCI as readonly number[]).includes(value);
  const [other, setOther] = useState(false);
  const [draft, setDraft] = useState('');
  if (other || !known) {
    const commit = () => {
      const n = Number(draft.replace(',', '.'));
      setOther(false);
      if (draft.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 1000 && n !== value) onChange(n);
    };
    return (
      <input
        className="input input--num num"
        type="number"
        min={0}
        max={1000}
        step="any"
        autoFocus={other}
        disabled={disabled}
        aria-label={t('pm.points')}
        defaultValue={value ?? ''}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    );
  }
  return (
    <select
      className="select"
      value={value ?? ''}
      disabled={disabled}
      aria-label={t('pm.points')}
      onChange={(e) => {
        if (e.target.value === 'other') setOther(true);
        else onChange(e.target.value === '' ? null : Number(e.target.value));
      }}
    >
      <option value="">{t('pm.points.none')}</option>
      {FIBONACCI.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
      <option value="other">{t('pm.points.custom')}</option>
    </select>
  );
}

/** The three PM rows of the task panel (they sit inside its `.props` grid). */
export function PmRows({ task, editable, onSaved }: { task: Task; editable: boolean; onSaved: (t: Task) => void }) {
  const { t } = useI18n();
  const { toast } = useStore();
  const type = task.issueType ?? 'task';
  const { epics } = useEpics(task.boardId);
  const run = async (changes: PmChanges) => {
    try {
      onSaved(await savePm(task, changes));
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    }
  };
  const epic = task.epicId ? epics?.find((x) => x.id === task.epicId) : undefined;
  return (
    <>
      <span className="props__label">
        <Icon name="tag" size={15} className="icon--lead" />
        {t('pm.type.label')}
      </span>
      <select className="select" value={type} disabled={!editable} onChange={(e) => run({ issueType: e.target.value as IssueType })}>
        {ISSUE_TYPES.map((k) => (
          <option key={k} value={k}>
            {t(`pm.type.${k}`)}
          </option>
        ))}
      </select>
      <span className="props__label">
        <Icon name="hash" size={15} className="icon--lead" />
        {t('pm.points')}
      </span>
      <PointsPicker value={task.storyPoints} disabled={!editable} onChange={(storyPoints) => run({ storyPoints })} />
      {type !== 'epic' && (
        <>
          <span className="props__label">
            <Icon name="bookmark" size={15} className="icon--lead" />
            {t('pm.epic.link')}
          </span>
          <span className="props__record">
            <select className="select" value={task.epicId ?? ''} disabled={!editable || epics === null} aria-label={t('pm.epic.link')} onChange={(e) => run({ epicId: e.target.value || null })}>
              <option value="">{t('pm.epic.none')}</option>
              {(epics ?? []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title}
                </option>
              ))}
              {task.epicId && !epic && epics !== null && <option value={task.epicId}>{t('pm.epic')}</option>}
            </select>
            {epic && (
              <button className="btn btn--quiet btn--icon btn--small" title={t('pm.epic.open')} aria-label={t('pm.epic.open')} onClick={() => setQuery('task', epic.id)}>
                <Icon name="external" size={14} />
              </button>
            )}
          </span>
        </>
      )}
    </>
  );
}
