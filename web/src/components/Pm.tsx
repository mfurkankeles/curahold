// Product / project management pieces shared by the task panel, the cards and
// the backlog and sprint screens: issue type, story points and epic.
import { createContext, useCallback, useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { FIBONACCI, ISSUE_TYPES, type Board, type Column, type IssueType, type Person, type Task } from '../../../shared/src/model';
import { ApiFailure, get, patch } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { setQuery } from '../lib/router';
import { useStore } from '../lib/store';
import { useFormat } from '../lib/useFormat';
import { Icon } from './icons';
import { Avatars } from './ui';
import '../surfaces/product.css';

/** A board that was made from the product-development workflow (it has its Backlog and QA stages). */
export const isPmBoard = (board: Pick<Board, 'columns'> | undefined) => !!board && board.columns.some((c) => c.key === 'backlog') && board.columns.some((c) => c.key === 'qa');

/** Whether product management is on for a board: its own switch wins, else whether it has the PM stages. */
export const pmOn = (board: Pick<Board, 'columns' | 'pmEnabled'> | undefined): boolean => board?.pmEnabled ?? isPmBoard(board);

const TONE: Record<IssueType, string> = { epic: 'amber', story: 'green', task: 'slate', bug: 'red', subtask: 'slate', spike: 'amber' };

/** A product task's issue type badge (story, bug, epic...). */
export function IssueBadge({ type }: { type: IssueType }) {
  const { t } = useI18n();
  return (
    <span className="schip pm-type" data-tone={TONE[type]} title={t('pm.type.label')}>
      {t(`pm.type.${type}`)}
    </span>
  );
}

/** A task's story points chip. */
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
  /** The points of its stories, and how many of them are done. */
  childPoints?: number;
  childDonePoints?: number;
}

/** The board's epics, for the picker and the roadmap; read again when `refreshKey` changes (a task was made an epic). */
export function useEpics(boardId: string | undefined, enabled = true, refreshKey = 0) {
  const [epics, setEpics] = useState<PmEpic[] | null>(null);
  const load = useCallback(async () => {
    if (!boardId || !enabled) return;
    try {
      setEpics((await get<{ epics: PmEpic[] }>(`/boards/${boardId}/epics`)).epics);
    } catch {
      setEpics([]);
    }
  }, [boardId, enabled]);
  useEffect(() => void load(), [load, refreshKey]);
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
      <select className="select" value={type} disabled={!editable} aria-label={t('pm.type.label')} onChange={(e) => run({ issueType: e.target.value as IssueType })}>
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

/**
 * Above a product board on a phone or tablet, where one column fills the screen: every column by
 * name and count, the one in view marked. Tapping a name brings its column in; swiping the board
 * moves the mark. Sits right before the board (`.board`) and finds it there.
 */
export function ColumnStrip({ columns, counts }: { columns: Column[]; counts: Record<string, number> }) {
  const { t } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const [current, setCurrent] = useState(columns[0]?.key ?? '');
  const board = () => ref.current?.nextElementSibling as HTMLElement | null;
  useEffect(() => {
    const el = board();
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const seen = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set((e.target as HTMLElement).getAttribute('aria-label') ?? '', e.intersectionRatio);
        let best = '';
        let most = 0;
        for (const c of columns) {
          const r = seen.get(c.name) ?? 0;
          if (r > most + 0.01) {
            best = c.key;
            most = r;
          }
        }
        if (best) setCurrent(best);
      },
      { root: el, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    el.querySelectorAll(':scope > .column').forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [columns]);
  // Keep the marked name in sight inside the strip, sideways only (never scroll the page).
  useEffect(() => {
    const strip = ref.current;
    const btn = strip?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!strip || !btn) return;
    const rtl = getComputedStyle(strip).direction === 'rtl';
    const edge = rtl ? strip.scrollWidth - strip.clientWidth + strip.scrollLeft : strip.scrollLeft;
    if (btn.offsetLeft >= edge && btn.offsetLeft + btn.offsetWidth <= edge + strip.clientWidth) return;
    const want = Math.max(0, btn.offsetLeft - (strip.clientWidth - btn.offsetWidth) / 2);
    strip.scrollLeft = rtl ? want - (strip.scrollWidth - strip.clientWidth) : want;
  }, [current]);
  const go = (i: number) => {
    const col = board()?.querySelectorAll<HTMLElement>(':scope > .column')[i];
    if (!col) return;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    col.scrollIntoView({ block: 'nearest', inline: 'start', behavior: smooth ? 'smooth' : 'auto' });
    setCurrent(columns[i].key);
  };
  return (
    <nav ref={ref} className="pm-strip" aria-label={t('pm.board.columns')}>
      {columns.map((c, i) => (
        <button key={c.key} type="button" className="pm-strip__item" aria-current={c.key === current || undefined} onClick={() => go(i)}>
          <span className="pm-strip__name">{c.name}</span>
          <span className="pm-strip__count num">{counts[c.key] ?? 0}</span>
        </button>
      ))}
    </nav>
  );
}

// ------------------------------------------------------------------ sprint cards, changed in place

/**
 * A board that lets its cards be changed in place gives the cards this: they draw it where they
 * show type and points, and leave out their own avatars (the owner is in it).
 */
export type CardEdit = (task: Task) => ReactNode;
export const CardEditContext = createContext<CardEdit | null>(null);

export type CardChanges = PmChanges & { assigneeIds?: string[] };

/** A click, key or drag start inside the card's controls stays there: it neither opens nor picks up the card. */
const keep = { onClick: (e: SyntheticEvent) => e.stopPropagation(), onKeyDown: (e: SyntheticEvent) => e.stopPropagation(), onMouseDown: (e: SyntheticEvent) => e.stopPropagation(), onTouchStart: (e: SyntheticEvent) => e.stopPropagation(), onPointerDown: (e: SyntheticEvent) => e.stopPropagation() };

/** Type, points and owner on a sprint card: each one click (or tap) away, as in the backlog rows. */
export function CardFields({ task, people, canWrite, onEdit }: { task: Task; people: Person[]; canWrite: boolean; onEdit: (c: CardChanges) => void }) {
  const { t } = useI18n();
  const f = useFormat();
  const { person } = useStore();
  const type = task.issueType ?? 'task';
  const known = task.storyPoints == null || (FIBONACCI as readonly number[]).includes(task.storyPoints);
  const name = (field: string) => t('pm.inline.label', { field, title: task.title });
  const owner = task.assigneeIds[0] ?? '';
  const ownerGone = !!owner && !people.some((p) => p.id === owner);
  return (
    <span className="pm-cardedit" {...keep}>
      <select className="pm-inline pm-inline--type" data-tone={TONE[type]} value={type} disabled={!canWrite} aria-label={name(t('pm.type.label'))} onChange={(e) => onEdit({ issueType: e.target.value as IssueType })}>
        {ISSUE_TYPES.map((k) => (
          <option key={k} value={k}>
            {t(`pm.type.${k}`)}
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
      <span className="pm-owner" data-empty={!owner || undefined}>
        {owner ? <Avatars people={task.assigneeIds.map((id) => person(id))} max={2} /> : <Icon name="userPlus" size={15} />}
        <select
          className="pm-owner__pick"
          value={owner}
          disabled={!canWrite}
          aria-label={owner ? t('pm.card.ownerOf', { title: task.title, name: person(owner)?.name ?? t('common.unknownUser') }) : t('pm.card.noOwnerOf', { title: task.title })}
          onChange={(e) => {
            const v = e.target.value;
            const rest = task.assigneeIds.slice(1).filter((x) => x !== v);
            onEdit({ assigneeIds: v ? [v, ...rest] : rest });
          }}
        >
          <option value="">{t('pm.card.noOwner')}</option>
          {ownerGone && <option value={owner}>{person(owner)?.name ?? t('common.unknownUser')}</option>}
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </span>
    </span>
  );
}
