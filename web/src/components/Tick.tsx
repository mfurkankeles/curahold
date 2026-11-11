// The round tick in front of a task: one click and it is done (with undo).
import { useState } from 'react';
import type { Task } from '../../../shared/src/model';
import { ApiFailure } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { tasksChanged } from '../lib/shell';
import { useStore } from '../lib/store';
import { doneTarget, saveTask } from '../lib/tasks';
import { Icon } from './icons';

export function useToggleDone() {
  const { t } = useI18n();
  const { boards, toast } = useStore();
  return async (task: Task, after?: (t: Task) => void) => {
    const board = boards.find((b) => b.id === task.boardId);
    const target = doneTarget(board, task);
    if (!target) return;
    try {
      const r = await saveTask(task, { status: target.status });
      after?.(r.task);
      tasksChanged();
      toast(target.done ? t('task.completed', { title: task.title }) : t('task.reopened', { title: task.title }), 'info', {
        label: t('undo.button'),
        run: async () => {
          await saveTask(r.task, { status: task.status }).catch(() => undefined);
          tasksChanged();
        },
      });
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    }
  };
}

export function Tick({ task, done, onToggled }: { task: Task; done: boolean; onToggled?: (t: Task) => void }) {
  const { t } = useI18n();
  const { boards, canWrite } = useStore();
  const toggle = useToggleDone();
  const [pop, setPop] = useState(false);
  const board = boards.find((b) => b.id === task.boardId);
  if (!canWrite || !board?.columns.some((c) => c.done)) return null;
  return (
    <button
      type="button"
      className="tick"
      data-done={done || undefined}
      data-pop={pop || undefined}
      aria-pressed={done}
      aria-label={done ? t('task.reopenNamed', { title: task.title }) : t('task.completeNamed', { title: task.title })}
      title={done ? t('task.reopen') : t('task.complete')}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (!done) setPop(true);
        void toggle(task, onToggled);
      }}
      onAnimationEnd={() => setPop(false)}
    >
      <Icon name="check" size={13} />
    </button>
  );
}
