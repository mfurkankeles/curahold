// Undo: the one way a change is taken back. A delete, a move, a bulk change or a
// settings change says what it did in a toast with "Undo" for 10 seconds; Ctrl+Z
// (⌘Z) takes back the latest one while it shows, unless the focus is in a text field
// (there Ctrl+Z belongs to the text). The toast area is a polite live region, so a
// screen reader hears what happened and that it can be undone.
import { useCallback } from 'react';
import { ApiFailure, post } from './api';
import { useI18n } from './i18n';
import { useStore } from './store';

/** How long a change can be taken back from its toast (store.tsx keeps a toast with an action this long). */
export const UNDO_MS = 10_000;

/**
 * Returns `offer(text, takeBack, after?)`: shows `text` with Undo; Undo runs `takeBack`,
 * says "Put back", then runs `after` (reload what is on screen). A failure is said, never silent.
 */
export function useUndo() {
  const { t } = useI18n();
  const { toast } = useStore();
  return useCallback(
    (text: string, takeBack: () => unknown, after?: () => unknown) =>
      toast(text, 'info', {
        label: t('undo.button'),
        undo: true,
        run: async () => {
          try {
            await takeBack();
            toast(t('undo.done'));
            await after?.();
          } catch (e) {
            toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
          }
        },
      }),
    [t, toast],
  );
}

/** For a change the server can take back itself (it answers with an `undoId`): Undo posts /undo/:id. */
export function useServerUndo() {
  const offer = useUndo();
  const { toast } = useStore();
  return useCallback(
    (text: string, undoId: string | null | undefined, after?: () => unknown) => (undoId ? offer(text, () => post(`/undo/${undoId}`), after) : toast(text)),
    [offer, toast],
  );
}

/** Whether Ctrl+Z here belongs to a text being typed rather than to the last change. */
export function typingIn(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}
