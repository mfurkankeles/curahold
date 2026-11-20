// Unsaved changes. A settings form says it has some (and how to save or drop
// them); the settings area then shows one bar with Save and Discard, asks before
// moving to another screen, and the browser asks before the tab is closed or
// reloaded. Only one form registers at a time: the topic on show.
import { useEffect, useRef, useSyncExternalStore } from 'react';

export interface UnsavedForm {
  /** Saves; resolves true when it worked (the form then is no longer dirty). */
  save: () => Promise<boolean>;
  /** Puts the form back to what is saved. */
  discard: () => void;
}

let current: UnsavedForm | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));

const onUnload = (e: BeforeUnloadEvent) => {
  e.preventDefault();
  e.returnValue = '';
};

/** A form with changes not yet saved: `dirty` true registers it, false or unmount lets it go. */
export function useUnsaved(dirty: boolean, form: UnsavedForm) {
  // The latest save and discard, without registering again on every keystroke.
  const latest = useRef(form);
  latest.current = form;
  useEffect(() => {
    if (!dirty) return;
    const entry: UnsavedForm = { save: () => latest.current.save(), discard: () => latest.current.discard() };
    current = entry;
    emit();
    window.addEventListener('beforeunload', onUnload);
    return () => {
      if (current === entry) current = null;
      emit();
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [dirty]);
}

/** The form with unsaved changes, if any (for the bar and the leave check). */
export function useUnsavedForm(): UnsavedForm | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

/** Whether a screen has unsaved changes (navigation asks first). */
export const hasUnsaved = () => current !== null;

/** Drops the registration (after "Leave without saving"): the form is going away anyway. */
export function forgetUnsaved() {
  current = null;
  window.removeEventListener('beforeunload', onUnload);
  emit();
}
