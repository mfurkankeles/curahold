// Live refresh without a socket: while the page is in front of someone, it
// asks the server "has anything I can see changed?" every half minute (less
// often when nobody has touched it for a while, never when it is hidden) and
// tells the pages only when the answer moved. One tiny request instead of
// every page reloading its own list on a timer.
import { useEffect, useRef } from 'react';
import { get } from './api';

export interface Pulse {
  tasks: number;
  records: number;
  unread: number;
}
export type LiveKind = 'tasks' | 'records' | 'unread';

export const LIVE = 'tw:live';
const ACTIVE_MS = 30_000;
const IDLE_MS = 90_000;
const IDLE_AFTER = 180_000;

let last: Pulse | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastAsk = 0;
let lastInput = Date.now();
let running = false;

/** A test (or support) can make it quicker: localStorage tw_live_ms. */
function everyMs() {
  try {
    const v = Number(localStorage.getItem('tw_live_ms'));
    if (v >= 500) return v;
  } catch {
    /* default */
  }
  return Date.now() - lastInput > IDLE_AFTER ? IDLE_MS : ACTIVE_MS;
}

const busy = () => !!document.querySelector('.card--overlay');

function tell(kinds: LiveKind[], pulse: Pulse) {
  window.dispatchEvent(new CustomEvent(LIVE, { detail: { kinds, pulse } }));
}

async function ask() {
  if (!running || document.hidden || navigator.onLine === false) return;
  lastAsk = Date.now();
  let now: Pulse;
  try {
    now = await get<Pulse>('/pulse');
  } catch {
    return;
  }
  const before = last;
  if (!before) {
    last = now;
    tell(['unread'], now);
    return;
  }
  const kinds: LiveKind[] = [];
  if (now.tasks !== before.tasks) kinds.push('tasks');
  if (now.records !== before.records) kinds.push('records');
  if (now.unread !== before.unread) kinds.push('unread');
  if (!kinds.length) return;
  // Mid-drag is the wrong moment to move things under someone's hand: ask again shortly.
  if (busy()) return;
  last = now;
  tell(kinds, now);
}

function schedule() {
  if (timer) clearTimeout(timer);
  if (!running) return;
  timer = setTimeout(async () => {
    await ask();
    schedule();
  }, everyMs());
}

/** Back in front of someone, or back online: ask now rather than waiting out the timer. */
function nudge() {
  if (!running || document.hidden) return;
  if (Date.now() - lastAsk > 3000) void ask().then(schedule);
}

const noteInput = () => {
  lastInput = Date.now();
};

/** Started once, by the frame of the app. */
export function startLive(): () => void {
  if (running) return () => undefined;
  running = true;
  last = null;
  void ask().then(schedule);
  document.addEventListener('visibilitychange', nudge);
  window.addEventListener('focus', nudge);
  window.addEventListener('online', nudge);
  window.addEventListener('pointerdown', noteInput, { passive: true });
  window.addEventListener('keydown', noteInput, { passive: true });
  return () => {
    running = false;
    if (timer) clearTimeout(timer);
    document.removeEventListener('visibilitychange', nudge);
    window.removeEventListener('focus', nudge);
    window.removeEventListener('online', nudge);
    window.removeEventListener('pointerdown', noteInput);
    window.removeEventListener('keydown', noteInput);
  };
}

/** Run `fn` when something of this kind changed on the server (someone else's work, another tab, a rule). */
export function useLive(kind: LiveKind | LiveKind[], fn: (pulse: Pulse) => void) {
  const ref = useRef(fn);
  ref.current = fn;
  const want = Array.isArray(kind) ? kind.join(',') : kind;
  useEffect(() => {
    const kinds = want.split(',');
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ kinds: LiveKind[]; pulse: Pulse }>).detail;
      if (d.kinds.some((k) => kinds.includes(k))) ref.current(d.pulse);
    };
    window.addEventListener(LIVE, on);
    return () => window.removeEventListener(LIVE, on);
  }, [want]);
}
