// The round tick in front of a task: one click and it is done (with undo). The tick shows at once;
// if the server refuses, it turns back (a 200 ms roll-back) and the error says why.
import { useEffect, useState } from 'react';
import type { Task } from '../../../shared/src/model';
import { ApiFailure } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { tasksChanged } from '../lib/shell';
import { useStore } from '../lib/store';
import { doneTarget, saveTask } from '../lib/tasks';
import { Icon } from './icons';
import { useUndo } from '../lib/undo';

/** Marks a task done or open again; resolves true when saved, false when refused (the error is shown). */
export function useToggleDone() {
  const { t } = useI18n();
  const { boards, toast } = useStore();
  const offer = useUndo();
  return async (task: Task, after?: (t: Task) => void): Promise<boolean> => {
    const board = boards.find((b) => b.id === task.boardId);
    const target = doneTarget(board, task);
    if (!target) return false;
    try {
      const r = await saveTask(task, { status: target.status });
      after?.(r.task);
      tasksChanged();
      offer(target.done ? t('task.completed', { title: task.title }) : t('task.reopened', { title: task.title }), () => saveTask(r.task, { status: task.status }), tasksChanged);
      return true;
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
      return false;
    }
  };
}

export function Tick({ task, done, onToggled }: { task: Task; done: boolean; onToggled?: (t: Task) => void }) {
  const { t } = useI18n();
  const { boards, canWrite } = useStore();
  const toggle = useToggleDone();
  const [pop, setPop] = useState(false);
  // What the tick shows before the server has answered (null: what the task says).
  const [ahead, setAhead] = useState<boolean | null>(null);
  const [back, setBack] = useState(false);
  useEffect(() => setAhead(null), [done]);
  const shown = ahead ?? done;
  const board = boards.find((b) => b.id === task.boardId);
  if (!canWrite || !board?.columns.some((c) => c.done)) return null;
  return (
    <button
      type="button"
      className="tick"
      data-done={shown || undefined}
      data-pop={pop || undefined}
      data-back={back || undefined}
      aria-pressed={shown}
      aria-label={shown ? t('task.reopenNamed', { title: task.title }) : t('task.completeNamed', { title: task.title })}
      title={shown ? t('task.reopen') : t('task.complete')}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (!shown) setPop(true);
        setAhead(!shown);
        void toggle(task, onToggled).then((ok) => {
          if (ok) return;
          setAhead(null);
          setBack(true);
        });
      }}
      onAnimationEnd={() => (setPop(false), setBack(false))}
    >
      <Icon name="check" size={13} />
    </button>
  );
}
