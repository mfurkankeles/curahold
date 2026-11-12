// After a delete: say where the thing went and offer to take it back.
import { useCallback } from 'react';
import type { TrashRestored } from '../../../shared/src/model';
import { ApiFailure, post } from './api';
import { useI18n } from './i18n';
import { useStore } from './store';

/** Where a thing lives once it is back from the trash (null: nowhere to open). */
export function placeOf(r: Pick<TrashRestored, 'kind' | 'ids' | 'where'>): string | null {
  const id = r.ids[0];
  if (r.ids.length !== 1) return r.kind === 'account' ? '/accounts' : r.where.boardId ? `/b/${r.where.boardId}` : null;
  switch (r.kind) {
    case 'account':
      return `/accounts/${id}`;
    case 'task':
      return r.where.boardId ? `/b/${r.where.boardId}?task=${id}` : null;
    case 'record':
      return r.where.accountId ? `/accounts/${r.where.accountId}?record=${id}` : null;
    case 'activity':
      return r.where.accountId ? `/accounts/${r.where.accountId}` : null;
    case 'page':
      return `/pages/${id}`;
    case 'report':
      return `/reports/r/${id}`;
    case 'automation':
      return '/settings/automations';
    default:
      return null;
  }
}

/**
 * Returns a function to call with the answer of a delete. It shows "Moved to
 * the trash" with an Undo that puts the thing back and then runs `back` (reload
 * the list, or go to the thing again).
 */
export function useTrashToast() {
  const { t } = useI18n();
  const { toast } = useStore();
  return useCallback(
    (answer: { trashId?: string | null } | null | undefined, back?: () => unknown) => {
      const id = answer?.trashId;
      if (!id) return;
      toast(t('trash.moved'), 'info', {
        label: t('undo.button'),
        run: async () => {
          try {
            await post(`/trash/${id}/restore`);
            toast(t('undo.done'));
            await back?.();
          } catch (e) {
            toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
          }
        },
      });
    },
    [t, toast],
  );
}
