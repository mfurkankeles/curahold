// How a sync conflict note in a task's history reads (api/src/sync/conflicts.ts writes them):
// which side the connection's rule kept, and the value that lost, so it can be put back by hand.
import type { MessageKey } from '../../../shared/src/i18n/en';

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;
type Field = { field: string; kept: unknown; lost: unknown };

const LABEL: Record<string, MessageKey> = {
  title: 'task.title',
  description: 'task.description',
  due: 'task.due',
  assignee: 'task.assignees',
  stage: 'task.status',
  done: 'task.status',
  issue_type: 'pm.type.label',
  story_points: 'pm.points',
  epic: 'pm.epic',
  sprint: 'pm.sprint',
  account: 'sync.conflict.account',
};

/** A sync conflict as a sentence in the reader's language (which app, which field, which value won). */
export function syncConflictText(d: Record<string, any>, t: T, fmtDate: (day: string) => string, num: (n: number) => string): string {
  const app = String(d.app ?? '');
  if (d.case === 'deleted_there') return t('sync.conflict.deletedThere', { app });
  if (d.case === 'archived_here') return t('sync.conflict.archivedHere', { app });
  const value = (f: Field): string => {
    const v = f.lost;
    if (v == null || v === '') return t('task.history.none');
    if (f.field === 'due') return fmtDate(String(v));
    if (f.field === 'issue_type') return t(`pm.type.${v}` as MessageKey);
    if (f.field === 'story_points') return num(Number(v));
    if (f.field === 'done') return v ? t('sync.conflict.done') : t('sync.conflict.open');
    return t('sync.conflict.value', { v: String(v) });
  };
  const lost = ((d.fields ?? []) as Field[]).map((f) => `${LABEL[f.field] ? t(LABEL[f.field]) : f.field}: ${value(f)}`).join(' · ');
  return d.kept === 'here' ? t('sync.conflict.keptHere', { app, lost }) : t('sync.conflict.keptThere', { app, lost });
}
