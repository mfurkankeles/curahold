// A release-notes draft from what a sprint finished: new things, fixes and
// improvements, each as a line. The person edits it, then copies it to wherever
// the team publishes. Nothing is sent anywhere from here.
import { useEffect, useState } from 'react';
import type { IssueType, Sprint, Task } from '../../../shared/src/model';
import { get } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useStore } from '../lib/store';
import { useFormat } from '../lib/useFormat';
import { SkeletonRows } from './Empty';
import { Dialog } from './ui';
import '../surfaces/product.css';
import { Icon } from './icons';

type Group = 'new' | 'fixed' | 'improved';
const GROUP: Record<IssueType, Group> = { epic: 'new', story: 'new', bug: 'fixed', task: 'improved', subtask: 'improved', spike: 'improved' };

/** The draft as plain text: a title line, then each group with its lines. */
export function draftNotes(sprint: Sprint, done: Task[], words: Record<Group, string>, dates: string): string {
  const parts = [dates ? `${sprint.name} · ${dates}` : sprint.name];
  for (const g of ['new', 'fixed', 'improved'] as const) {
    const lines = done.filter((x) => GROUP[x.issueType ?? 'task'] === g).map((x) => `- ${x.title}`);
    if (lines.length) parts.push('', words[g], ...lines);
  }
  return parts.join('\n');
}

export function ReleaseNotes({ sprint, doneKeys, onClose }: { sprint: Sprint; doneKeys: Set<string>; onClose: () => void }) {
  const { t } = useI18n();
  const f = useFormat();
  const { toast } = useStore();
  const [text, setText] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  useEffect(() => {
    get<{ tasks: Task[] }>(`/sprints/${sprint.id}/items`)
      .then((r) => {
        const done = r.tasks.filter((x) => doneKeys.has(x.status));
        const day = (d: string | null) => (d ? f.date(d.slice(0, 10), { day: 'numeric', month: 'short' }) : '');
        const dates = sprint.startsOn || sprint.endsOn ? `${day(sprint.startsOn)} – ${day(sprint.closedOn ?? sprint.endsOn)}` : '';
        setCount(done.length);
        setText(draftNotes(sprint, done, { new: t('pm.notes.new'), fixed: t('pm.notes.fixed'), improved: t('pm.notes.improved') }, dates));
      })
      .catch(() => setText(''));
  }, [sprint, doneKeys, t, f]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text ?? '');
      toast(t('pm.notes.copied'));
    } catch {
      toast(t('errors.server'), 'error');
    }
  };
  return (
    <Dialog
      title={t('pm.notes.title', { name: sprint.name })}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--quiet" onClick={onClose}>
            <Icon name="close" size={16} />
            {t('common.close')}
          </button>
          <button className="btn btn--primary" disabled={!text || !count} onClick={() => void copy()}>
            <Icon name="copy" size={16} />
            {t('pm.notes.copy')}
          </button>
        </>
      }
    >
      {text === null ? (
        <SkeletonRows rows={4} label={t('common.loading')} />
      ) : count === 0 ? (
        <p className="muted">{t('pm.notes.empty')}</p>
      ) : (
        <label className="field">
          <span className="field__label">{t('pm.notes.hint')}</span>
          <textarea className="input pm-notes" rows={12} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
      )}
    </Dialog>
  );
}
