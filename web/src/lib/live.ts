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
  /** Per-scope stamps for what the open pages are watching now. */
  boards?: Record<string, number>;
  accounts?: Record<string, number>;
}
export type LiveKind = 'tasks' | 'records' | 'unread';
export type ScopeKind = 'board' | 'account';

export const LIVE = 'app:live';
export const LIVE_SCOPE = 'app:live-scope';
const ACTIVE_MS = 10_000;
const IDLE_MS = 90_000;
const IDLE_AFTER = 180_000;

let last: Pulse | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastAsk = 0;
let lastInput = Date.now();
let running = false;

// What the open pages are watching (a board, a company), with how many of them,
// and the last stamp seen for each, so a scope follows only its own changes.
const watched: Record<ScopeKind, Map<string, number>> = { board: new Map(), account: new Map() };
const stamps: Record<ScopeKind, Record<string, number>> = { board: {}, account: {} };
const PARAM: Record<ScopeKind, 'boards' | 'accounts'> = { board: 'boards', account: 'accounts' };

/** A test (or support) can make it quicker: localStorage app_live_ms. */
function everyMs() {
  try {
    const v = Number(localStorage.getItem('app_live_ms'));
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

/** `?boards=…&accounts=…` for whatever the open pages are watching. */
function scopeQuery() {
  const p = new URLSearchParams();
  for (const kind of ['board', 'account'] as const) {
    const ids = [...watched[kind].keys()];
    if (ids.length) p.set(PARAM[kind], ids.join(','));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** A scope whose stamp moved since we last saw it tells its own pages to refetch. */
function tellScopes(now: Pulse) {
  for (const kind of ['board', 'account'] as const) {
    const map = kind === 'board' ? now.boards : now.accounts;
    if (!map) continue;
    for (const [id, stamp] of Object.entries(map)) {
      const seen = stamps[kind];
      const prev = seen[id];
      seen[id] = stamp;
      // First sighting sets the baseline, like the global pulse: it does not fire.
      if (prev !== undefined && stamp !== prev) window.dispatchEvent(new CustomEvent(LIVE_SCOPE, { detail: { kind, id } }));
    }
  }
}

async function ask() {
  if (!running || document.hidden || navigator.onLine === false) return;
  lastAsk = Date.now();
  let now: Pulse;
  try {
    now = await get<Pulse>(`/pulse${scopeQuery()}`);
  } catch {
    return;
  }
  // Mid-drag is the wrong moment to move things under someone's hand: leave the
  // baselines as they are and catch the change on the next ask.
  if (busy()) return;
  tellScopes(now);
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
  last = now;
  if (kinds.length) tell(kinds, now);
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

/**
 * Run `fn` when one board or one company changed on the server — its own cards,
 * or anything under it — without following every change in the company. While
 * the page is open the poller carries this scope; when it closes it stops.
 */
export function useLiveScope(kind: ScopeKind, id: string | null | undefined, fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!id) return;
    watched[kind].set(id, (watched[kind].get(id) ?? 0) + 1);
    nudge(); // start getting this scope's stamp without waiting out the timer
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ kind: ScopeKind; id: string }>).detail;
      if (d.kind === kind && d.id === id) ref.current();
    };
    window.addEventListener(LIVE_SCOPE, on);
    return () => {
      window.removeEventListener(LIVE_SCOPE, on);
      const n = (watched[kind].get(id) ?? 1) - 1;
      if (n <= 0) {
        watched[kind].delete(id);
        delete stamps[kind][id];
      } else watched[kind].set(id, n);
    };
  }, [kind, id]);
}
