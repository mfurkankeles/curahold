// Delete with Undo, for things the server cannot bring back (a team, a company
// domain): the thing leaves the screen at once and the toast offers Undo for
// 10 seconds; only then is the delete sent. Undo simply puts it back on screen.
// If the page is closed in those seconds, nothing is deleted — the safe side.
import { useCallback } from 'react';
import { ApiFailure } from './api';
import { useI18n } from './i18n';
import { useStore } from './store';
import { UNDO_MS, useUndo } from './undo';

/**
 * Delete with Undo for things the server cannot bring back: gone from the screen at once, sent only after the
 * 10-second Undo window; closing the page in that time deletes nothing (the safe side).
 */
export function useDeleteLater() {
  const offer = useUndo();
  const { toast } = useStore();
  const { t } = useI18n();
  return useCallback(
    (text: string, { hide, unhide, commit, after }: { hide: () => void; unhide: () => void; commit: () => Promise<unknown>; after?: () => unknown }) => {
      hide();
      let undone = false;
      const timer = setTimeout(() => {
        if (undone) return;
        commit()
          .then(() => after?.())
          .catch((e) => {
            unhide();
            toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
          });
      }, UNDO_MS);
      offer(text, () => {
        undone = true;
        clearTimeout(timer);
        unhide();
      });
    },
    [offer, toast, t],
  );
}
