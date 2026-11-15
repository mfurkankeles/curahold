// Live refresh. The pages always learn what changed from one question to the
// server — "has anything I can see changed?" (/api/pulse, answered under the
// person's own rights) — and are told only when the answer moved.
//
// When to ask: the live channel (one WebSocket per tab, api/src/live) says
// "change number N touched board X" the moment someone commits, and the
// question goes out at once. The channel carries no data, only those signals
// and who is looking at what. Where it cannot open (a network that blocks it,
// an older server), or while it is reconnecting, the page asks on a timer as
// before: every 10 s while used, 90 s when idle, never when hidden.
import { useEffect, useRef, useState } from 'react';
import { get, post } from './api';

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
/** With the channel open, the timer only checks that nothing slipped through. */
const SAFETY_MS = 120_000;
/** Many changes in a row elsewhere in the company: ask at most this often. Changes on what this page watches: at once. */
const SPREAD_MS = 1500;

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
  if (channel.ready) return SAFETY_MS;
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

/** When the channel last told a scope's pages directly: its pulse stamp moving just after is the same change. */
const firedAt: Record<ScopeKind, Map<string, number>> = { board: new Map(), account: new Map() };
function fireScope(kind: ScopeKind, id: string) {
  if (!watched[kind].has(id)) return;
  firedAt[kind].set(id, Date.now());
  window.dispatchEvent(new CustomEvent(LIVE_SCOPE, { detail: { kind, id } }));
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
      const told = Date.now() - (firedAt[kind].get(id) ?? 0) < 3000;
      if (prev !== undefined && stamp !== prev && !told) window.dispatchEvent(new CustomEvent(LIVE_SCOPE, { detail: { kind, id } }));
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
  // baselines as they are and catch the change on the next ask (soon, when the channel said so).
  if (busy()) {
    if (channel.ready) setTimeout(() => void ask(), 800);
    return;
  }
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

/** Ask now, or — for changes elsewhere in the company — no more often than SPREAD_MS. */
let spreadTimer: ReturnType<typeof setTimeout> | null = null;
function askSoon(urgent: boolean) {
  if (!running) return;
  if (document.hidden) {
    lastAsk = 0; // asked as soon as the page is in front of someone again (nudge)
    return;
  }
  const wait = urgent ? 0 : Math.max(0, lastAsk + SPREAD_MS - Date.now());
  if (spreadTimer) {
    if (!urgent) return;
    clearTimeout(spreadTimer);
  }
  spreadTimer = setTimeout(() => {
    spreadTimer = null;
    void ask();
  }, wait);
}

// ------------------------------------------------------------ the channel

type Msg =
  | { t: 'hi'; n: number }
  | { t: 'c'; f: number; n: number; k?: string[]; b?: string[]; a?: string[] }
  | { t: 'reset'; n: number }
  | { t: 'p'; on: string; who: [string, 0 | 1][] };

export const LIVE_PRESENCE = 'app:live-presence';
export type Who = [string, 0 | 1][];

const channel = {
  ws: null as WebSocket | null,
  /** Open and greeted: the timer can rest. */
  ready: false,
  /** The last change number heard; sent back after a lost connection. */
  n: null as number | null,
  tries: 0,
  retry: null as ReturnType<typeof setTimeout> | null,
  ping: null as ReturnType<typeof setInterval> | null,
  /** The scopes the open ticket allows, as sent. */
  sent: '',
  rewatch: null as ReturnType<typeof setTimeout> | null,
};
/** Places this tab is at (the newest wins: a task opened over a customer), typing or not. */
const here: { on: string; typing: boolean }[] = [];
const presence = new Map<string, Who>();

/** A test (or support) can turn the channel off: localStorage app_live_channel = "off". */
function channelOff() {
  try {
    return localStorage.getItem('app_live_channel') === 'off' || typeof WebSocket === 'undefined';
  } catch {
    return typeof WebSocket === 'undefined';
  }
}

function scopes(): string[] {
  const w = new Set<string>();
  for (const id of watched.board.keys()) w.add(`b:${id}`);
  for (const id of watched.account.keys()) w.add(`a:${id}`);
  for (const h of here) w.add(h.on);
  return [...w].sort().slice(0, 24);
}

async function ticket() {
  const w = scopes();
  const r = await post<{ k: string; n: number }>('/live/ticket', { w });
  return { ...r, w: w.join(',') };
}

function sendHere() {
  const ws = channel.ws;
  if (!channel.ready || !ws || ws.readyState !== WebSocket.OPEN) return;
  const top = here[here.length - 1];
  ws.send(JSON.stringify({ t: 'h', on: top?.on ?? null, y: top?.typing ? 1 : 0 }));
}

function onMessage(m: Msg) {
  if (m.t === 'hi') {
    channel.n = m.n;
    channel.ready = true;
    channel.tries = 0;
    sendHere();
    // Pages that started following something while the socket was opening: their scopes now.
    if (scopes().join(',') !== channel.sent) rewatch();
    schedule();
    // Whatever happened between the last ask and the ticket: look once.
    askSoon(false);
    return;
  }
  if (m.t === 'c') {
    // A gap between what we had and what this starts from: something was missed, so look.
    const gap = channel.n !== null && m.f !== channel.n;
    channel.n = m.n;
    // What this page watches: told at once, without waiting for the pulse; the pulse that follows does not tell it twice.
    if (!busy()) {
      for (const id of m.b ?? []) fireScope('board', id);
      for (const id of m.a ?? []) fireScope('account', id);
    }
    const mine = !!(m.b?.length || m.a?.length || m.k?.includes('unread'));
    if (gap || mine) askSoon(true);
    else if (m.k?.length) askSoon(false);
    return;
  }
  if (m.t === 'reset') {
    channel.n = m.n;
    askSoon(true);
    return;
  }
  if (m.t === 'p') {
    presence.set(m.on, m.who);
    window.dispatchEvent(new CustomEvent(LIVE_PRESENCE, { detail: { on: m.on, who: m.who } }));
  }
}

function closeChannel() {
  const ws = channel.ws;
  channel.ws = null;
  channel.ready = false;
  if (channel.ping) clearInterval(channel.ping);
  channel.ping = null;
  if (ws) {
    ws.onclose = null;
    ws.onmessage = null;
    try {
      ws.close(1000);
    } catch {
      /* closed */
    }
  }
}

function reconnectLater(now = false) {
  if (channel.retry || !running || channelOff()) return;
  // 0.5 s, 1, 2, 4… up to 30 s, with jitter so a restarted server is not met by everyone at once.
  const wait = now ? 0 : Math.min(30_000, 500 * 2 ** channel.tries) * (0.75 + Math.random() * 0.5);
  channel.tries++;
  channel.retry = setTimeout(() => {
    channel.retry = null;
    void openChannel();
  }, wait);
}

async function openChannel() {
  if (!running || channel.ws || channelOff()) return;
  if (navigator.onLine === false) return; // 'online' brings it back
  let k: Awaited<ReturnType<typeof ticket>>;
  try {
    k = await ticket();
  } catch {
    reconnectLater();
    return;
  }
  if (!running || channel.ws) return;
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/live?k=${encodeURIComponent(k.k)}&n=${channel.n ?? k.n}`;
  let ws: WebSocket;
  try {
    ws = new WebSocket(url);
  } catch {
    reconnectLater();
    return;
  }
  channel.ws = ws;
  channel.sent = k.w;
  if (channel.n === null) channel.n = k.n;
  ws.onmessage = (e) => {
    if (e.data === 'pong' || typeof e.data !== 'string') return;
    try {
      onMessage(JSON.parse(e.data) as Msg);
    } catch {
      /* not ours */
    }
  };
  ws.onclose = (e) => {
    const was = channel.ready;
    channel.ws = null;
    channel.ready = false;
    if (channel.ping) clearInterval(channel.ping);
    channel.ping = null;
    for (const on of presence.keys()) window.dispatchEvent(new CustomEvent(LIVE_PRESENCE, { detail: { on, who: [] } }));
    presence.clear();
    // Back to the timer until the channel is there again; anything missed meanwhile comes with the next ask.
    schedule();
    if (was) askSoon(false);
    // An old ticket: a new one at once (once); anything else: back off.
    reconnectLater(e.code === 4401 && channel.tries === 0);
  };
  // Proxies close quiet sockets: a word every 45 s (answered by the server without waking it).
  channel.ping = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.send('ping');
  }, 45_000);
}

/** What the open pages follow changed: a fresh ticket for the open socket. */
function rewatch() {
  if (channel.rewatch) clearTimeout(channel.rewatch);
  channel.rewatch = setTimeout(async () => {
    channel.rewatch = null;
    const ws = channel.ws;
    if (!ws || !channel.ready) return; // the next connection takes the new scopes
    if (scopes().join(',') === channel.sent) return sendHere();
    try {
      const k = await ticket();
      if (channel.ws !== ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ t: 'w', k: k.k }));
      channel.sent = k.w;
      sendHere();
    } catch {
      /* the next connection takes them */
    }
  }, 60);
}

/** Started once, by the frame of the app. */
export function startLive(): () => void {
  if (running) return () => undefined;
  running = true;
  last = null;
  void ask().then(schedule);
  void openChannel();
  const online = () => {
    channel.tries = 0;
    reconnectLater(true);
  };
  window.addEventListener('online', online);
  document.addEventListener('visibilitychange', nudge);
  window.addEventListener('focus', nudge);
  window.addEventListener('online', nudge);
  window.addEventListener('pointerdown', noteInput, { passive: true });
  window.addEventListener('keydown', noteInput, { passive: true });
  return () => {
    running = false;
    if (timer) clearTimeout(timer);
    if (channel.retry) clearTimeout(channel.retry);
    channel.retry = null;
    closeChannel();
    window.removeEventListener('online', online);
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
    // Its stamp's baseline now, while the page loads it: a change a moment later is then not taken for the baseline.
    askSoon(true);
    rewatch();
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
        rewatch();
      } else watched[kind].set(id, n);
    };
  }, [kind, id]);
}

/**
 * Who else is looking at one task, customer or sprint (`t:` / `a:` / `p:` and
 * its id), and who is typing there. Being on the page counts this tab as
 * there; `typing()` says so for a few seconds. Person ids only: names come
 * from the people list the app already has.
 */
export function usePresence(on: string | null): { who: Who; typing: () => void } {
  const [who, setWho] = useState<Who>(() => (on ? (presence.get(on) ?? []) : []));
  const entry = useRef<{ on: string; typing: boolean } | null>(null);
  const quiet = useRef<ReturnType<typeof setTimeout> | null>(null);
  const said = useRef(0);
  useEffect(() => {
    if (!on) return;
    const mine = { on, typing: false };
    entry.current = mine;
    here.push(mine);
    setWho(presence.get(on) ?? []);
    rewatch();
    const tell = (e: Event) => {
      const d = (e as CustomEvent<{ on: string; who: Who }>).detail;
      if (d.on === on) setWho(d.who);
    };
    window.addEventListener(LIVE_PRESENCE, tell);
    return () => {
      window.removeEventListener(LIVE_PRESENCE, tell);
      if (quiet.current) clearTimeout(quiet.current);
      const i = here.indexOf(mine);
      if (i >= 0) here.splice(i, 1);
      entry.current = null;
      presence.delete(on);
      rewatch();
    };
  }, [on]);
  const typing = useRef(() => {
    const e = entry.current;
    if (!e) return;
    if (quiet.current) clearTimeout(quiet.current);
    quiet.current = setTimeout(() => {
      e.typing = false;
      said.current = 0;
      sendHere();
    }, 4000);
    // Said at most every 3 s while the keys keep going.
    if (!e.typing || Date.now() - said.current > 3000) {
      e.typing = true;
      said.current = Date.now();
      sendHere();
    }
  }).current;
  return { who, typing };
}
