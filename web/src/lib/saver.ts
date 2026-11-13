// Runs one request and says so when it fails: a failed delete or save is never silent.
// Resolves true on success (with "Saved" unless `ok` is false), false after an error toast.
import { useCallback } from 'react';
import { ApiFailure } from './api';
import { useI18n } from './i18n';
import { useStore } from './store';

export function useSaver() {
  const { t } = useI18n();
  const { toast } = useStore();
  return useCallback(
    async (fn: () => Promise<unknown>, ok: boolean | string = true) => {
      try {
        await fn();
        if (ok) toast(typeof ok === 'string' ? ok : t('common.saved'));
        return true;
      } catch (e) {
        toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
        return false;
      }
    },
    [toast, t],
  );
}
