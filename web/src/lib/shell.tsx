// What any screen can ask the frame around it to open: quick add, search,
// the shortcuts sheet, help, a new board, a note on a customer.
import { createContext, useContext, useEffect, useState } from 'react';

export interface QuickDefaults {
  boardId?: string;
  status?: string;
  accountId?: string | null;
  accountName?: string | null;
  /** People the task goes to unless the line names others too ("me" from My tasks). */
  assigneeIds?: string[];
  /** A day picked on the calendar. */
  dueDate?: string;
  /** Start the line with this text (e.g. "@me" from My tasks). */
  text?: string;
}

export interface ShellActions {
  quickAdd: (d?: QuickDefaults) => void;
  search: () => void;
  shortcuts: () => void;
  help: () => void;
  newBoard: () => void;
  logTouch: (accountId?: string | null, accountName?: string | null) => void;
}

const noop = () => undefined;
export const ShellCtx = createContext<ShellActions>({ quickAdd: noop, search: noop, shortcuts: noop, help: noop, newBoard: noop, logTouch: noop });
export const useShell = () => useContext(ShellCtx);

/** Tasks were made or changed somewhere else on the screen: lists reload. */
export const TASKS_CHANGED = 'tw:tasks-changed';
export const tasksChanged = () => window.dispatchEvent(new Event(TASKS_CHANGED));

/** True while the person is typing somewhere (a single key is then just a letter). */
export function typing(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

/** A dialog or the task panel is open: page-level shortcuts stay out of its way. */
export const somethingOpen = () => !!document.querySelector('[aria-modal="true"], .panel');

/** True on a phone-sized screen (the layout switches at the same width as the styles). */
export function useNarrow(query = '(max-width: 860px)') {
  const get = () => typeof matchMedia === 'function' && matchMedia(query).matches;
  const [on, setOn] = useState(get);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const m = matchMedia(query);
    const f = () => setOn(m.matches);
    m.addEventListener?.('change', f);
    return () => m.removeEventListener?.('change', f);
  }, [query]);
  return on;
}

// What the screen in front of the person suggests for a new task: My tasks → for me,
// a board → on that board, a customer → for that customer. N and "+ New" start from it.
let pageDefaults: QuickDefaults = {};
export const currentPageDefaults = () => pageDefaults;
export function usePageDefaults(d: QuickDefaults | null) {
  const key = d ? JSON.stringify(d) : '';
  useEffect(() => {
    if (!key) return;
    const mine = JSON.parse(key) as QuickDefaults;
    pageDefaults = mine;
    return () => {
      if (pageDefaults === mine) pageDefaults = {};
    };
  }, [key]);
}
