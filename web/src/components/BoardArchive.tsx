// A board's archive: what was put away by hand, and finished work that has
// aged off the board. Anything here can be brought back.
import { useCallback, useEffect, useState } from 'react';
import type { Board, Task } from '../../../shared/src/model';
import { ApiFailure, get, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useStore } from '../lib/store';
import { EmptyState, SkeletonRows } from './Empty';
import { Icon } from './icons';
import { Avatar } from './ui';

type Archived = Task & { archivedAt: string | null; accountName: string | null };

export function BoardArchive({ board, onRestored }: { board: Board; onRestored: () => void }) {
  const { t, fmtDate } = useI18n();
  const { person, canWrite, toast } = useStore();
  const [q, setQ] = useState('');
  const [data, setData] = useState<{ tasks: Archived[]; total: number; more: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    async (offset = 0) => {
      const p = new URLSearchParams({ archived: '1', offset: String(offset) });
      if (q.trim()) p.set('q', q.trim());
      const r = await get<{ tasks: Archived[]; total: number; more: boolean }>(`/boards/${board.id}/tasks?${p}`);
      setData((d) => (offset && d ? { ...r, tasks: [...d.tasks, ...r.tasks] } : r));
    },
    [board.id, q],
  );
  useEffect(() => {
    const id = setTimeout(() => void load().catch(() => setData({ tasks: [], total: 0, more: false })), 200);
    return () => clearTimeout(id);
  }, [load]);

  const restore = async (task: Archived) => {
    setBusy(task.id);
    try {
      await post('/tasks/bulk', { ids: [task.id], archived: false });
      setData((d) => (d ? { ...d, total: Math.max(0, d.total - 1), tasks: d.tasks.filter((x) => x.id !== task.id) } : d));
      toast(t('archive.restored', { title: task.title }));
      onRestored();
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const keep = board.archiveDays;
  return (
    <div className="page">
      <div className="viewbar">
        <input className="input" style={{ maxWidth: 320 }} value={q} placeholder={t('archive.search')} aria-label={t('archive.search')} onChange={(e) => setQ(e.target.value)} />
        <p className="viewbar__lead">{keep ? t('archive.leadAuto', { n: keep }) : t('archive.leadManual')}</p>
      </div>
      {!data ? (
        <SkeletonRows rows={6} label={t('common.loading')} />
      ) : data.tasks.length === 0 ? (
        <div className="sheet">
          <EmptyState compact icon="checkCircle" tone="done" title={q.trim() ? t('archive.noMatch') : t('archive.empty')} body={q.trim() ? undefined : keep ? t('archive.emptyBodyAuto', { n: keep }) : t('archive.emptyBody')} />
        </div>
      ) : (
        <div className="sheet" style={{ padding: 0 }}>
          <table className="table archive-table">
            <thead>
              <tr>
                <th>{t('task.title')}</th>
                <th className="hide-phone">{t('task.status')}</th>
                <th className="hide-phone">{t('task.assignees')}</th>
                <th>{t('archive.when')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.tasks.map((x) => (
                <tr key={x.id}>
                  <td>
                    <span className="archive-table__title">{x.title}</span>
                    {x.accountName && <span className="muted"> · {x.accountName}</span>}
                  </td>
                  <td className="hide-phone muted">{board.columns.find((c) => c.key === x.status)?.name ?? x.status}</td>
                  <td className="hide-phone">
                    <span className="avatars">
                      {x.assigneeIds.slice(0, 3).map((id) => (
                        <Avatar key={id} person={person(id)} />
                      ))}
                    </span>
                  </td>
                  <td className="num muted">{x.archivedAt ? fmtDate(x.archivedAt.slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</td>
                  <td style={{ textAlign: 'end' }}>
                    {canWrite && (
                      <button className="btn btn--small" disabled={busy === x.id} onClick={() => void restore(x)}>
                        <Icon name="undo" size={14} /> {t('archive.restore')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.more && (
            <div style={{ padding: 12, textAlign: 'center' }}>
              <button className="btn btn--quiet" onClick={() => void load(data.tasks.length)}>
                {t('archive.more', { n: data.total - data.tasks.length })}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
