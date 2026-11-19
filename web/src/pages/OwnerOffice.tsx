// The owner's 3D Office — the AI team's command centre. Desktop first: the
// office in the middle, rooms and the org chart on the left (a click glides
// the camera there), the selected agent on the right (card, chat with its
// whole history, memory) without covering the office, approvals, alerts, live
// meetings and usage along the top, keyboard for everything. The phone keeps
// every feature: the office full screen, the panel as a sheet from the bottom.
//
// Agents only propose: every decision here goes through the existing approval
// queue (/api/desk/office/approvals). Chats are real model conversations
// (/api/desk/team/threads); nothing here is scripted. The 3D scene never holds
// a photo: a seat's own photo (agents.avatar, owner-only storage) shows only in
// the 2D card; without one, the card shows the seat's figure as a portrait.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { normalizeLocale } from '../../../shared/src/i18n';
import { officeWord, type OfficeKey } from '../../../shared/src/i18n/ownerOffice';
import { teamWord, type TeamKey } from '../../../shared/src/i18n/ownerTeam';
import type { Approval, Meeting } from '../../../shared/src/office';
import type { TeamOrg, TeamSeat, ThreadRow } from '../../../shared/src/team/api';
import { Icon, type IconName } from '../components/icons';
import { formatDate, formatNumber } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { relativeTime } from '../lib/time';
import { useTheme } from '../lib/theme';
import { ROOMS, roomOfTeam, type Room } from '../office/layout';
import { OfficeScene, type SceneStats } from '../office/scene';
import { searchPeople, type Findable } from '../office/search';
import { ApprovalCard } from './OwnerConsole';
import { Avatar, CallMeeting, MeetingDetail, MemoryPanel, Messages, SeatPanel, Status, type TeamGo } from './OwnerTeam';
import '../surfaces/team.css';
import '../surfaces/owner.css';
import '../surfaces/office.css';

const FIGURES = new URL('../office/assets/figures.glb', import.meta.url).href;

class OfficeError extends Error {
  constructor(readonly status: number) {
    super(String(status));
  }
}
async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/desk${path}`, {
    method,
    headers: { 'x-curahold-desk': '1', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new OfficeError(res.status);
  return json as T;
}

/** Loaded now, on every heartbeat, and every 10 s while the tab is visible (the office is live). */
function useLive<T>(path: string, beat: number, failed: (e: unknown) => void) {
  const [data, setData] = useState<T | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    api<T>('GET', path)
      .then((d) => live && setData(d))
      .catch(failed);
    return () => {
      live = false;
    };
  }, [path, beat, n, failed]);
  useEffect(() => {
    const t = window.setInterval(() => document.visibilityState === 'visible' && setN((x) => x + 1), 10_000);
    return () => window.clearInterval(t);
  }, []);
  return { data, reload: () => setN((x) => x + 1) };
}

function useMedia(q: string) {
  const [on, setOn] = useState(() => typeof matchMedia === 'function' && matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const f = () => setOn(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, [q]);
  return on;
}

function useWords() {
  const { locale, t } = useI18n();
  const l = normalizeLocale(locale);
  const ow = useCallback((k: OfficeKey, v?: Record<string, string | number>) => officeWord(l, k, v), [l]);
  const teamW = useCallback((k: TeamKey, v?: Record<string, string | number>) => teamWord(l, k, v), [l]);
  return { ow, teamW, locale: l, t };
}

type Mode =
  { kind: 'now' } | { kind: 'person'; tab: 'chat' | 'card' | 'memory' } | { kind: 'approvals'; i: number } | { kind: 'meeting'; id: string } | { kind: 'call' };
type Task = { seat: string; title: string; status: string };
const ACTIVITIES = ['working', 'meeting', 'waiting-approval', 'queued', 'idle', 'paused', 'dormant'] as const;
const FPS_KEY = 'office.fps';
const VIEW_KEY = 'office.view';

const roomName = (r: Room | { id: string; kind: string; team?: string }, teamW: (k: TeamKey) => string, ow: (k: OfficeKey) => string) =>
  r.kind === 'team' && r.team ? teamW(`teamName.${r.team}` as TeamKey) : ow(`room.${r.id}` as OfficeKey);

export default function OwnerOffice({
  beat,
  failed,
  open,
  onOpen,
  onExit,
  teamGo,
}: {
  beat: number;
  failed: (e: unknown) => void;
  open: string | null;
  onOpen: (seat: string | null) => void;
  onExit: () => void;
  teamGo: TeamGo;
}) {
  const { ow, teamW, locale, t } = useWords();
  const org = useLive<TeamOrg>('/team/org', beat, failed);
  const meetings = useLive<{ meetings: Meeting[] }>('/office/meetings', beat, failed);
  const approvals = useLive<{ approvals: Approval[] }>('/office/approvals?status=open', beat, failed);
  const tasks = useLive<{ tasks: Task[] }>('/office/tasks', beat, failed);
  const phone = useMedia('(max-width: 860px)');
  const reduced = useMedia('(prefers-reduced-motion: reduce)');
  const [themePref, setTheme] = useTheme();
  const [night, setNight] = useState(() => document.documentElement.dataset.theme === 'dark');
  const [view, setView] = useState<'3d' | '2d'>(() => (localStorage.getItem(VIEW_KEY) === '2d' ? '2d' : '3d'));
  const [gl, setGl] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [mode, setMode] = useState<Mode>(open ? { kind: 'person', tab: 'chat' } : { kind: 'now' });
  const [selected, setSelected] = useState<string | null>(open);
  const [docked, setDocked] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [sheet, setSheet] = useState<'peek' | 'open'>(open ? 'open' : 'peek');
  const [stats, setStats] = useState<SceneStats | null>(null);
  const [portraits, setPortraits] = useState<Record<string, string>>({});
  const showFps = useMemo(() => {
    const q = new URLSearchParams(location.search).get('fps');
    try {
      if (q === '1') localStorage.setItem(FPS_KEY, '1');
      if (q === '0') localStorage.removeItem(FPS_KEY);
      return localStorage.getItem(FPS_KEY) === '1';
    } catch {
      return q === '1';
    }
  }, []);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const scene = useRef<OfficeScene | null>(null);
  const labels = useRef(new Map<string, HTMLElement>());

  const seats = useMemo(() => org.data?.seats ?? [], [org.data]);
  const bySeat = useMemo(() => new Map(seats.map((s) => [s.seat, s])), [seats]);
  const onFloor = useMemo(() => seats.filter((s) => s.team !== 'advisory'), [seats]);
  const advisors = useMemo(() => seats.filter((s) => s.team === 'advisory'), [seats]);
  const body = useMemo(() => new Map(onFloor.map((s, i) => [s.seat, i % 12])), [onFloor]);
  const live = useMemo(() => (meetings.data?.meetings ?? []).filter((m) => m.status === 'live'), [meetings.data]);
  const pending = approvals.data?.approvals ?? [];
  const tasksOf = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const x of tasks.data?.tasks ?? [])
      if (x.status === 'running' || x.status === 'queued' || x.status === 'blocked') m.set(x.seat, [...(m.get(x.seat) ?? []), x]);
    return m;
  }, [tasks.data]);
  const nameOf = useCallback((s: string) => bySeat.get(s)?.name ?? (s === 'owner' ? teamW('chat.you') : s), [bySeat, teamW]);
  const sel = selected ? (bySeat.get(selected) ?? null) : null;
  const modelOn = !!org.data?.model.available;

  // ------------------------------------------------------------ the scene
  const handlers = useRef({ pick: (_: string | null) => {}, room: (_: string) => {} });
  useEffect(() => {
    if (view !== '3d' || !canvas.current || !overlay.current) return;
    let sc: OfficeScene;
    setGl('loading');
    try {
      sc = new OfficeScene({
        canvas: canvas.current,
        overlay: overlay.current,
        figuresUrl: FIGURES,
        reducedMotion: reduced,
        phone,
        onPick: (s) => handlers.current.pick(s),
        onRoom: (r) => handlers.current.room(r),
        onStats: showFps ? setStats : undefined,
      });
    } catch {
      setGl('failed');
      return;
    }
    scene.current = sc;
    let gone = false;
    sc.init().then(
      () => !gone && setGl('ready'),
      () => !gone && setGl('failed'),
    );
    return () => {
      gone = true;
      sc.dispose();
      scene.current = null;
    };
    // The scene is made once per view; motion and phone changes rebuild it.
  }, [view, reduced, phone, showFps]);

  useEffect(() => {
    const sc = scene.current;
    if (gl !== 'ready' || !sc) return;
    const room = live[0]?.attendees ?? [];
    sc.setSeats(
      onFloor.map((s) => ({ seat: s.seat, team: s.team, activity: s.activity, body: body.get(s.seat) ?? 0 })),
      room,
    );
  }, [gl, onFloor, body, live]);

  // Labels: React draws them once per data change; the scene moves them.
  useLayoutEffect(() => {
    const sc = scene.current;
    if (gl !== 'ready' || !sc) return;
    sc.setAnchors([...labels.current.entries()].map(([key, el]) => ({ key: key.slice(2), kind: key.startsWith('r:') ? 'room' : 'seat', el })));
  }, [gl, onFloor, live, locale]);

  // Day and night follow the app's theme.
  useEffect(() => {
    const mo = new MutationObserver(() => {
      setNight(document.documentElement.dataset.theme === 'dark');
      scene.current?.retheme();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);

  // The phone's sheet covers the bottom of the office: the camera centres above it.
  useEffect(() => {
    const sc = scene.current;
    if (!sc || gl !== 'ready') return;
    sc.setInsets({ bottom: phone ? (sheet === 'open' ? Math.round(window.innerHeight * 0.58) : 148) : 0, top: phone ? 52 : 0 });
  }, [phone, sheet, gl]);

  // ------------------------------------------------------------ choosing
  const choose = useCallback(
    (seat: string | null, opts: { glide?: boolean; tab?: 'chat' | 'card' | 'memory' } = {}) => {
      setSelected(seat);
      onOpen(seat);
      scene.current?.select(seat);
      if (seat) {
        setMode({ kind: 'person', tab: opts.tab ?? 'chat' });
        setSheet('open');
        if (opts.glide !== false) scene.current?.focusSeat(seat);
      } else setMode({ kind: 'now' });
    },
    [onOpen],
  );
  const goRoom = useCallback(
    (id: string) => {
      scene.current?.focusRoom(id);
      if (id === 'meeting' && live[0]) setMode({ kind: 'meeting', id: live[0].id });
    },
    [live],
  );
  handlers.current = {
    pick: (s) => choose(s, { glide: false }),
    room: (r) => goRoom(r),
  };
  useEffect(() => {
    if (open && open !== selected && bySeat.has(open)) choose(open);
    // Only when the address changes (back / forward).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (gl === 'ready' && selected) {
      scene.current?.select(selected);
      scene.current?.focusSeat(selected);
    }
    // First frame only: open the seat from the address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);
  useEffect(() => {
    if (!sel || gl !== 'ready' || portraits[sel.seat] || sel.agent?.avatar) return;
    const url = scene.current?.portrait(sel.seat, body.get(sel.seat) ?? 0, sel.team);
    if (url) setPortraits((p) => ({ ...p, [sel.seat]: url }));
  }, [sel, gl, portraits, body]);

  // ------------------------------------------------------------ keyboard
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
      if (e.key === 'Escape') {
        if (searching) return setSearching(false);
        if (keysOpen) return setKeysOpen(false);
        if (typing) return;
        if (mode.kind !== 'now') {
          e.preventDefault();
          if (mode.kind === 'person') choose(null);
          else setMode(selected ? { kind: 'person', tab: 'chat' } : { kind: 'now' });
          return;
        }
        if (phone && sheet === 'open') return setSheet('peek');
        return scene.current?.fitAll();
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const sc = scene.current;
      const k = e.key;
      const act: Record<string, () => void> = {
        '/': () => setSearching(true),
        a: () => (setMode({ kind: 'approvals', i: 0 }), setSheet('open')),
        m: () => (setMode(live[0] ? { kind: 'meeting', id: live[0].id } : { kind: 'now' }), live[0] && sc?.focusRoom('meeting'), setSheet('open')),
        '?': () => setKeysOpen((x) => !x),
        v: () => switchView(view === '3d' ? '2d' : '3d'),
        q: () => sc?.rotate(-1),
        e: () => sc?.rotate(1),
        '+': () => sc?.zoom(0.75),
        '=': () => sc?.zoom(0.75),
        '-': () => sc?.zoom(1 / 0.75),
        '0': () => sc?.fitAll(),
        f: () => sc?.fitAll(),
        ArrowLeft: () => sc?.panScreen(-1, 0),
        ArrowRight: () => sc?.panScreen(1, 0),
        ArrowUp: () => sc?.panScreen(0, -1),
        ArrowDown: () => sc?.panScreen(0, 1),
      };
      const n = Number(k);
      const fn = act[k] ?? act[k.toLowerCase()] ?? (n >= 1 && n <= 9 && ROOMS[n - 1] ? () => goRoom(ROOMS[n - 1].id) : null);
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  const switchView = (v: '3d' | '2d') => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* this visit only */
    }
  };
  const dock = (seat: string) => setDocked((d) => (d.includes(seat) ? d.filter((x) => x !== seat) : [...d.slice(-2), seat]));

  // ------------------------------------------------------------ search
  const findable: Findable[] = useMemo(
    () =>
      seats.map((s) => ({
        seat: s.seat,
        name: s.name,
        title: s.title,
        titleTr: s.titleTr,
        team: s.team,
        teamName: teamW(`teamName.${s.team}` as TeamKey),
        tasks: (tasksOf.get(s.seat) ?? []).map((x) => x.title),
      })),
    [seats, tasksOf, teamW],
  );

  const counts = useMemo(() => {
    const c = Object.fromEntries(ACTIVITIES.map((a) => [a, 0])) as Record<(typeof ACTIVITIES)[number], number>;
    for (const s of onFloor) c[s.activity]++;
    return c;
  }, [onFloor]);
  const u = org.data?.week;
  const share = u && u.budget > 0 ? Math.min(1, u.tokens / u.budget) : 0;
  const glFailed = view === '3d' && gl === 'failed';
  const show2d = view === '2d' || glFailed;
  const peopleIn = (r: Room) => onFloor.filter((s) => roomOfTeam(s.team)?.id === r.id);

  // ------------------------------------------------------------ pieces
  const rail = (
    <nav className="of-rail" aria-label={ow('rail.rooms')}>
      <h2 className="of-h">{ow('rail.rooms')}</h2>
      <ul className="of-rooms">
        {ROOMS.map((r, i) => {
          const ps =
            r.kind === 'team'
              ? peopleIn(r)
              : r.kind === 'lounge'
                ? advisors
                : r.kind === 'meeting'
                  ? onFloor.filter((s) => live[0]?.attendees.includes(s.seat))
                  : [];
          const busy = ps.filter((s) => s.activity === 'working').length;
          return (
            <li key={r.id}>
              <button type="button" className="of-room" data-team={r.team ?? r.kind} onClick={() => goRoom(r.id)} aria-keyshortcuts={String(i + 1)}>
                <i aria-hidden="true" />
                <span className="of-room__name">{roomName(r, teamW, ow)}</span>
                {r.kind === 'meeting' && live[0] ? <b className="of-live">{ow('room.live')}</b> : null}
                <span className="of-room__meta">
                  {ps.length ? (busy ? `${formatNumber(busy, locale)}/${formatNumber(ps.length, locale)}` : formatNumber(ps.length, locale)) : ''}
                </span>
                <kbd>{i + 1}</kbd>
              </button>
            </li>
          );
        })}
      </ul>
      <h2 className="of-h">{ow('rail.org')}</h2>
      <OrgTree seats={seats} selected={selected} onPick={(s) => choose(s)} />
    </nav>
  );

  const top = (
    <header className="of-top">
      <button type="button" className="btn btn--quiet btn--small of-back" onClick={onExit} aria-label={ow('back')} title={ow('back')}>
        <Icon name="arrowLeft" size={16} />
        <span className="of-brand">
          <strong>Curahold</strong>
          <span>{ow('title')}</span>
        </span>
      </button>
      <button type="button" className="of-search" onClick={() => setSearching(true)} aria-keyshortcuts="/">
        <Icon name="search" size={16} />
        <span>{ow('search.placeholder')}</span>
        <kbd>/</kbd>
      </button>
      <div className="of-chips">
        {live[0] ? (
          <button
            type="button"
            className="of-chip"
            data-tone="live"
            onClick={() => (setMode({ kind: 'meeting', id: live[0].id }), goRoom('meeting'), setSheet('open'))}
            aria-keyshortcuts="m"
          >
            <i className="of-pulse" aria-hidden="true" />
            <span>{ow('bar.live', { title: live[0].title })}</span>
          </button>
        ) : null}
        <button
          type="button"
          className="of-chip"
          data-tone={pending.length ? 'soon' : undefined}
          onClick={() => (setMode({ kind: 'approvals', i: 0 }), setSheet('open'))}
          aria-keyshortcuts="a"
        >
          <Icon name="checkCircle" size={14} />
          <span>{ow('bar.approvals', { n: formatNumber(pending.length, locale) })}</span>
          <kbd>A</kbd>
        </button>
        <button
          type="button"
          className="of-chip of-chip--alerts"
          data-tone={org.data?.alerts.length ? 'late' : undefined}
          onClick={() => (setMode({ kind: 'now' }), setSheet('open'))}
        >
          <Icon name="bell" size={14} />
          <span>{org.data?.alerts.length ? ow('bar.alerts', { n: formatNumber(org.data.alerts.length, locale) }) : ow('bar.noAlerts')}</span>
        </button>
        {u ? (
          <span className="of-meter" title={ow('bar.usageTitle')}>
            <span>
              {ow('bar.usage', {
                tokens: formatNumber(u.tokens, locale, { compact: true }),
                budget: u.budget ? formatNumber(u.budget, locale, { compact: true }) : '—',
              })}
            </span>
            <span className="ocmeter" aria-hidden="true">
              <i style={{ '--w': `${Math.round(share * 100)}%` } as CSSProperties} data-high={share >= 0.8 ? '' : undefined} />
            </span>
          </span>
        ) : null}
      </div>
      <div className="of-tools">
        <div className="of-seg" role="group" aria-label={ow('bar.viewLabel')}>
          <button type="button" aria-pressed={!show2d} onClick={() => switchView('3d')} disabled={glFailed} aria-keyshortcuts="v">
            {ow('bar.view3d')}
          </button>
          <button type="button" aria-pressed={show2d} onClick={() => switchView('2d')} aria-keyshortcuts="v">
            {ow('bar.view2d')}
          </button>
        </div>
        <button
          type="button"
          className="btn btn--icon btn--quiet btn--small"
          onClick={() => setTheme(night ? 'light' : 'dark')}
          aria-label={night ? ow('bar.day') : ow('bar.night')}
          title={night ? ow('bar.day') : ow('bar.night')}
          data-pref={themePref}
        >
          <Icon name={night ? 'sun' : 'moon'} size={16} />
        </button>
        <button
          type="button"
          className="btn btn--icon btn--quiet btn--small of-keysbtn"
          onClick={() => setKeysOpen((x) => !x)}
          aria-label={ow('bar.keys')}
          title={ow('bar.keys')}
          aria-expanded={keysOpen}
          aria-keyshortcuts="?"
        >
          <Icon name="keyboard" size={16} />
        </button>
      </div>
    </header>
  );

  const panelBody = (): ReactNode => {
    if (mode.kind === 'person' && sel)
      return (
        <PersonPanel
          seat={sel}
          tab={mode.tab}
          onTab={(tab) => setMode({ kind: 'person', tab })}
          onClose={() => choose(null)}
          onWhere={() => scene.current?.focusSeat(sel.seat)}
          docked={docked.includes(sel.seat)}
          onDock={() => dock(sel.seat)}
          portrait={sel.agent?.avatar ? null : (portraits[sel.seat] ?? null)}
          tasks={tasksOf.get(sel.seat) ?? []}
          failed={failed}
          modelOn={modelOn}
          pauses={org.data?.pauses ?? []}
          onChanged={org.reload}
          teamGo={teamGo}
        />
      );
    if (mode.kind === 'approvals')
      return (
        <section className="of-sec of-sec--fill" aria-labelledby="of-ap">
          <PanelHead id="of-ap" title={ow('ap.title')} onBack={() => setMode({ kind: 'now' })} back={ow('person.back')}>
            {pending.length > 1 ? (
              <span className="of-pager">
                <button
                  type="button"
                  className="btn btn--icon btn--small btn--quiet"
                  disabled={mode.i <= 0}
                  onClick={() => setMode({ kind: 'approvals', i: mode.i - 1 })}
                  aria-label={ow('ap.prev')}
                >
                  <Icon name="chevronLeft" size={16} />
                </button>
                {ow('ap.counter', { i: formatNumber(Math.min(mode.i, pending.length - 1) + 1, locale), n: formatNumber(pending.length, locale) })}
                <button
                  type="button"
                  className="btn btn--icon btn--small btn--quiet"
                  disabled={mode.i >= pending.length - 1}
                  onClick={() => setMode({ kind: 'approvals', i: mode.i + 1 })}
                  aria-label={ow('ap.next')}
                >
                  <Icon name="chevronRight" size={16} />
                </button>
              </span>
            ) : null}
          </PanelHead>
          {pending.length ? (
            <div className="of-apcard">
              <ApprovalCard
                key={pending[Math.min(mode.i, pending.length - 1)].id}
                a={pending[Math.min(mode.i, pending.length - 1)]}
                who={(s) => [nameOf(s), bySeat.get(s)?.title].filter(Boolean).join(' · ')}
                failed={failed}
                onDone={() => (approvals.reload(), org.reload())}
                go={() => setMode({ kind: 'now' })}
              />
            </div>
          ) : (
            <p className="of-empty">{ow('now.noApprovals')}</p>
          )}
          <p className="of-rule">
            <Icon name="lock" size={14} /> {ow('now.rule')}
          </p>
        </section>
      );
    if (mode.kind === 'meeting')
      return (
        <section className="of-sec of-sec--fill of-meeting">
          <PanelHead title={ow('meet.liveTitle')} onBack={() => setMode({ kind: 'now' })} back={ow('person.back')} />
          <MeetingDetail key={mode.id} id={mode.id} nameOf={nameOf} failed={failed} onBack={() => setMode({ kind: 'now' })} />
        </section>
      );
    if (mode.kind === 'call')
      return (
        <section className="of-sec of-sec--fill">
          <PanelHead title={ow('now.call')} onBack={() => setMode({ kind: 'now' })} back={ow('person.back')} />
          <CallMeeting
            seats={seats.filter((s) => s.state !== 'dormant')}
            onCancel={() => setMode({ kind: 'now' })}
            onDone={(id) => (meetings.reload(), setMode({ kind: 'meeting', id }))}
            failed={failed}
          />
        </section>
      );
    return (
      <div className="of-now">
        <h2 className="of-title">{ow('now.title')}</h2>
        <ul className="of-legend" aria-label={ow('legend.label')}>
          {ACTIVITIES.filter((a) => counts[a]).map((a) => (
            <li key={a} data-activity={a}>
              <i aria-hidden="true" />
              {formatNumber(counts[a], locale)} {teamW(`activity.${a}` as TeamKey)}
            </li>
          ))}
        </ul>
        <section className="of-sec" aria-labelledby="of-m">
          <header className="of-sechead">
            <h3 id="of-m">{ow('now.meetings')}</h3>
            <button type="button" className="btn btn--small" onClick={() => setMode({ kind: 'call' })}>
              <Icon name="plus" size={14} /> {ow('now.call')}
            </button>
          </header>
          {(meetings.data?.meetings ?? []).filter((m) => m.status === 'live' || m.status === 'scheduled').length ? (
            <ul className="of-list">
              {(meetings.data?.meetings ?? [])
                .filter((m) => m.status === 'live' || m.status === 'scheduled')
                .slice(0, 4)
                .map((m) => (
                  <li key={m.id}>
                    <button type="button" onClick={() => (setMode({ kind: 'meeting', id: m.id }), m.status === 'live' && scene.current?.focusRoom('meeting'))}>
                      <span className="tm-chip" data-tone={m.status === 'live' ? 'late' : undefined}>
                        {m.status === 'live' ? <i className="of-pulse" aria-hidden="true" /> : null}
                        {teamW(`meet.status.${m.status}` as TeamKey)}
                      </span>
                      <strong>{m.title}</strong>
                      <small>{m.attendees.map(nameOf).join(', ')}</small>
                    </button>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="of-empty">{ow('now.noMeetings')}</p>
          )}
        </section>
        <section className="of-sec" aria-labelledby="of-a">
          <header className="of-sechead">
            <h3 id="of-a">{ow('now.approvals')}</h3>
            {pending.length ? (
              <button type="button" className="btn btn--small btn--quiet" onClick={() => setMode({ kind: 'approvals', i: 0 })}>
                {ow('now.allApprovals')}
              </button>
            ) : null}
          </header>
          {pending.length ? (
            <ul className="of-list">
              {pending.slice(0, 4).map((a, i) => (
                <li key={a.id}>
                  <button type="button" onClick={() => setMode({ kind: 'approvals', i })}>
                    <span className="tm-chip" data-tone={a.risk === 'high' ? 'late' : 'soon'}>
                      {a.ref}
                    </span>
                    <strong>{a.title}</strong>
                    <small>
                      {ow('now.by', { name: nameOf(a.proposedBy) })} · {relativeTime(a.createdAt, t)}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="of-empty">{ow('now.noApprovals')}</p>
          )}
        </section>
        {org.data?.alerts.length ? (
          <section className="of-sec" aria-labelledby="of-al">
            <header className="of-sechead">
              <h3 id="of-al">{ow('now.alerts')}</h3>
            </header>
            <ul className="of-alerts">
              {org.data.alerts.slice(0, 5).map((x) => (
                <li key={x.id}>
                  <Icon name="alert" size={14} />
                  <span>{x.body}</span>
                  <small>{formatDate(x.at, locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <p className="of-rule">
          <Icon name="lock" size={14} /> {ow('now.rule')}
        </p>
        {phone ? (
          <section className="of-sec of-phoneorg">
            <h3>{ow('sheet.rooms')}</h3>
            {rail}
          </section>
        ) : null}
      </div>
    );
  };

  return (
    <div className="of" data-phone={phone ? '' : undefined} data-sheet={sheet} data-view={show2d ? '2d' : '3d'}>
      {top}
      {phone ? null : rail}
      <main className="of-stage" ref={stage} aria-label={ow('stage', { n: onFloor.length })}>
        {show2d ? (
          <PlanView
            seats={onFloor}
            advisors={advisors}
            live={live[0] ?? null}
            selected={selected}
            onPick={(s) => choose(s, { glide: false })}
            onRoom={goRoom}
          />
        ) : (
          <>
            <canvas ref={canvas} className="of-canvas" aria-hidden="true" />
            <div className="of-overlay" ref={overlay} data-zoom="office">
              {gl === 'ready'
                ? [
                    ...ROOMS.map((r) => (
                      <button
                        key={`r:${r.id}`}
                        ref={(el) => (el ? labels.current.set(`r:${r.id}`, el) : labels.current.delete(`r:${r.id}`))}
                        type="button"
                        tabIndex={-1}
                        className="of-sign"
                        data-team={r.team ?? r.kind}
                        data-live={r.kind === 'meeting' && live[0] ? '' : undefined}
                        onClick={() => goRoom(r.id)}
                      >
                        <span>{roomName(r, teamW, ow)}</span>
                        {r.kind === 'meeting' && live[0] ? (
                          <b className="of-live">{ow('room.live')}</b>
                        ) : r.kind === 'team' ? (
                          <small>{formatNumber(peopleIn(r).length, locale)}</small>
                        ) : null}
                      </button>
                    )),
                    ...onFloor.map((s) => (
                      <button
                        key={`s:${s.seat}`}
                        ref={(el) => (el ? labels.current.set(`s:${s.seat}`, el) : labels.current.delete(`s:${s.seat}`))}
                        type="button"
                        tabIndex={-1}
                        className="of-tag"
                        data-activity={s.activity}
                        onClick={() => choose(s.seat)}
                      >
                        <span className="of-tag__ai">{teamW('ai')}</span>
                        <span className="of-tag__name">{s.name}</span>
                        <span className="of-tag__title">{s.title}</span>
                        {s.activity === 'waiting-approval' ? (
                          <b className="of-tag__flag" data-tone="soon">
                            !
                          </b>
                        ) : s.activity === 'dormant' || s.activity === 'paused' ? (
                          <b className="of-tag__flag">z</b>
                        ) : null}
                      </button>
                    )),
                  ]
                : null}
            </div>
            {gl === 'loading' ? (
              <p className="of-loading" role="status">
                <Icon name="building" size={18} /> {ow('loading')}
              </p>
            ) : null}
            {phone ? (
              <div className="of-roomchips" role="group" aria-label={ow('rail.rooms')}>
                {ROOMS.map((r) => (
                  <button key={r.id} type="button" className="of-room" data-team={r.team ?? r.kind} onClick={() => goRoom(r.id)}>
                    <i aria-hidden="true" />
                    {roomName(r, teamW, ow)}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="of-controls" role="group">
              <CtlButton icon="undo" label={ow('ctl.left')} keys="q" onClick={() => scene.current?.rotate(-1)} />
              <CtlButton icon="repeat" label={ow('ctl.right')} keys="e" onClick={() => scene.current?.rotate(1)} />
              <CtlButton icon="plus" label={ow('ctl.zoomIn')} keys="+" onClick={() => scene.current?.zoom(0.75)} />
              <CtlButton icon="chevronDown" label={ow('ctl.zoomOut')} keys="-" onClick={() => scene.current?.zoom(1 / 0.75)} />
              <CtlButton icon="home" label={ow('ctl.fit')} keys="0" onClick={() => scene.current?.fitAll()} />
            </div>
          </>
        )}
        {glFailed ? <p className="of-note">{ow('noGl')}</p> : reduced && !show2d ? <p className="of-note">{ow('still')}</p> : null}
        {showFps && stats ? (
          <dl className="of-fps" aria-label={ow('fps.title')}>
            <dt>{ow('fps.rate')}</dt>
            <dd>{stats.fps}</dd>
            <dt>{ow('fps.p95')}</dt>
            <dd>{ow('fps.ms', { ms: stats.p95.toFixed(1) })}</dd>
            <dt>{ow('fps.calls')}</dt>
            <dd>{stats.calls}</dd>
            <dt>{ow('fps.tris')}</dt>
            <dd>{formatNumber(stats.triangles, locale, { compact: true })}</dd>
            <dt>{ow('fps.dpr')}</dt>
            <dd>{stats.ratio}</dd>
            <dt>{ow('fps.mode')}</dt>
            <dd>
              {stats.mode} q{stats.quality}
            </dd>
          </dl>
        ) : null}
        {!phone && docked.length ? (
          <div className="of-docks">
            {docked.map((s) => {
              const seat = bySeat.get(s);
              return seat ? (
                <section key={s} className="of-dock" aria-label={seat.name}>
                  <header>
                    <Avatar seat={seat} size="s" />
                    <strong>{seat.name}</strong>
                    <button
                      type="button"
                      className="btn btn--icon btn--quiet btn--small"
                      onClick={() => dock(s)}
                      aria-label={ow('person.undock')}
                      title={ow('person.undock')}
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </header>
                  <SeatChat seat={seat} failed={failed} modelOn={modelOn} onMem={() => choose(s, { tab: 'memory' })} />
                </section>
              ) : null;
            })}
          </div>
        ) : null}
        {searching ? (
          <Search
            people={findable}
            bySeat={bySeat}
            tasksOf={tasksOf}
            onClose={() => setSearching(false)}
            onPick={(s) => (setSearching(false), choose(s), scene.current?.highlight([]))}
            onHits={(hs) => scene.current?.highlight(hs)}
          />
        ) : null}
        {keysOpen ? <Keys onClose={() => setKeysOpen(false)} /> : null}
      </main>
      <aside className="of-panel" aria-label={sel ? sel.name : ow('now.title')}>
        {phone ? (
          <button
            type="button"
            className="of-handle"
            onClick={() => setSheet(sheet === 'open' ? 'peek' : 'open')}
            aria-expanded={sheet === 'open'}
            aria-label={sheet === 'open' ? ow('sheet.close') : ow('sheet.open')}
          >
            <i aria-hidden="true" />
          </button>
        ) : null}
        {panelBody()}
      </aside>
    </div>
  );
}

function CtlButton({ icon, label, keys, onClick }: { icon: IconName; label: string; keys: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="btn btn--icon btn--small of-ctl"
      onClick={onClick}
      aria-label={label}
      title={`${label} (${keys})`}
      aria-keyshortcuts={keys}
      data-icon={icon}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}

function PanelHead({ id, title, onBack, back, children }: { id?: string; title: string; onBack: () => void; back: string; children?: ReactNode }) {
  return (
    <header className="of-panelhead">
      <button type="button" className="btn btn--quiet btn--small" onClick={onBack}>
        <Icon name="arrowLeft" size={16} /> {back}
      </button>
      <h2 id={id}>{title}</h2>
      {children}
    </header>
  );
}

// ------------------------------------------------------------ the org chart (left rail)
function OrgTree({ seats, selected, onPick }: { seats: TeamSeat[]; selected: string | null; onPick: (s: string) => void }) {
  const { ow, teamW, locale } = useWords();
  const active = seats.filter((s) => s.state !== 'dormant' && s.team !== 'advisory');
  const dormant = seats.filter((s) => s.state === 'dormant');
  const advisors = seats.filter((s) => s.team === 'advisory');
  const ids = new Set(active.map((s) => s.seat));
  // Someone whose manager is not on the floor (dormant, a person) hangs under the CEO.
  const kids = (boss: string | null) => active.filter((s) => (boss === null ? s.reportsTo === null || !ids.has(s.reportsTo) : s.reportsTo === boss));
  const row = (s: TeamSeat) => (
    <button type="button" className="of-person" aria-current={s.seat === selected ? 'true' : undefined} onClick={() => onPick(s.seat)}>
      <Avatar seat={s} size="s" />
      <span>
        <strong>{s.name}</strong>
        <small>{s.title}</small>
      </span>
      <i className="tm-dot" data-activity={s.activity} title={teamW(`activity.${s.activity}` as TeamKey)} />
    </button>
  );
  const branch = (boss: string | null, depth: number): ReactNode => {
    const ks = kids(boss);
    if (!ks.length) return null;
    return (
      <ul className="of-tree" data-depth={depth}>
        {ks.map((s) => (
          <li key={s.seat}>
            {row(s)}
            {depth < 4 ? branch(s.seat, depth + 1) : null}
          </li>
        ))}
      </ul>
    );
  };
  return (
    <div className="of-org">
      <p className="of-ceo">
        <Icon name="user" size={14} /> {teamW('ceo')}
      </p>
      {branch(null, 0)}
      {dormant.length ? (
        <details className="of-more">
          <summary>{ow('rail.dormant', { n: formatNumber(dormant.length, locale) })}</summary>
          <ul className="of-tree">
            {dormant.map((s) => (
              <li key={s.seat}>{row(s)}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {advisors.length ? (
        <details className="of-more">
          <summary>{ow('rail.advisors', { n: formatNumber(advisors.length, locale) })}</summary>
          <ul className="of-tree">
            {advisors.map((s) => (
              <li key={s.seat}>{row(s)}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------ the selected person
function PersonPanel(p: {
  seat: TeamSeat;
  tab: 'chat' | 'card' | 'memory';
  onTab: (t: 'chat' | 'card' | 'memory') => void;
  onClose: () => void;
  onWhere: () => void;
  docked: boolean;
  onDock: () => void;
  portrait: string | null;
  tasks: Task[];
  failed: (e: unknown) => void;
  modelOn: boolean;
  pauses: TeamOrg['pauses'];
  onChanged: () => void;
  teamGo: TeamGo;
}) {
  const { ow, teamW } = useWords();
  const s = p.seat;
  const photo = s.agent?.avatar ?? p.portrait;
  const tabs = [
    ['chat', ow('person.chat')],
    ['card', ow('person.card')],
    ['memory', ow('person.memory')],
  ] as const;
  const running = p.tasks.filter((x) => x.status === 'running');
  return (
    <section className="of-person-panel" aria-labelledby="of-pname">
      <header className="of-phead">
        <span className="of-portrait" data-team={s.team}>
          {photo ? <img src={photo} alt="" /> : <Avatar seat={s} size="l" />}
          <b className="tm-av__ai">{teamW('ai')}</b>
        </span>
        <div className="of-pinfo">
          <h2 id="of-pname">{s.name}</h2>
          <p className="of-ptitle">
            {s.title}
            {s.level ? ` · ${s.level}` : ''}
          </p>
          <p className="of-ptr">{s.titleTr}</p>
          <p className="of-pmeta">
            <Status seat={s} />
            <span className="tm-dot" data-activity={s.activity}>
              {teamW(`activity.${s.activity}` as TeamKey)}
            </span>
          </p>
        </div>
        <div className="of-pactions">
          <button type="button" className="btn btn--icon btn--quiet btn--small" onClick={p.onWhere} aria-label={ow('person.where')} title={ow('person.where')}>
            <Icon name="pin" size={16} />
          </button>
          <button
            type="button"
            className="btn btn--icon btn--quiet btn--small of-dockbtn"
            onClick={p.onDock}
            aria-pressed={p.docked}
            aria-label={ow('person.dock')}
            title={ow('person.dock')}
          >
            <Icon name="columns" size={16} />
          </button>
          <button type="button" className="btn btn--icon btn--quiet btn--small" onClick={p.onClose} aria-label={ow('person.close')} title={ow('person.close')}>
            <Icon name="close" size={16} />
          </button>
        </div>
      </header>
      {running.length ? (
        <p className="of-pnow">
          <Icon name="keyboard" size={14} /> <span>{ow('person.now')}:</span> <strong>{running[0].title}</strong>
        </p>
      ) : null}
      {s.state === 'dormant' && s.wakeTrigger ? <p className="of-pnote">{ow('person.dormant', { trigger: s.wakeTrigger })}</p> : null}
      {!s.agent?.avatar ? <p className="of-pnote of-pnote--quiet">{ow('person.photoNote')}</p> : null}
      <div className="of-tabs" role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={p.tab === k} onClick={() => p.onTab(k)}>
            {label}
          </button>
        ))}
      </div>
      <div className="of-tabbody" role="tabpanel">
        {p.tab === 'chat' ? (
          s.filledBy === 'human' ? (
            <p className="of-empty">{ow('person.human')}</p>
          ) : (
            <SeatChat seat={s} failed={p.failed} modelOn={p.modelOn} onMem={() => p.onTab('memory')} />
          )
        ) : null}
        {p.tab === 'card' ? (
          <SeatPanel
            seat={s}
            onClose={p.onClose}
            onChanged={p.onChanged}
            go={(to) => (to.section === 'chats' && to.q === s.seat ? p.onTab('chat') : p.teamGo(to))}
            failed={p.failed}
            pauses={p.pauses}
          />
        ) : null}
        {p.tab === 'memory' ? <MemoryPanel seat={s} failed={p.failed} /> : null}
      </div>
    </section>
  );
}

/** One seat's chats: the newest thread open, the others a pick away, a new one a click away. Real model replies only. */
function SeatChat({ seat, failed, modelOn, onMem }: { seat: TeamSeat; failed: (e: unknown) => void; modelOn: boolean; onMem: () => void }) {
  const { ow, locale } = useWords();
  const [threads, setThreads] = useState<ThreadRow[] | null>(null);
  const [thread, setThread] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    api<{ threads: ThreadRow[] }>('GET', `/team/seats/${seat.seat}/threads`)
      .then((r) => {
        if (!live) return;
        setThreads(r.threads);
        setThread((t) => t ?? r.threads[0]?.id ?? null);
      })
      .catch(failed);
    return () => {
      live = false;
    };
  }, [seat.seat, n, failed]);
  const newThread = async () => {
    try {
      const r = await api<{ thread: ThreadRow }>('POST', `/team/seats/${seat.seat}/threads`);
      setThread(r.thread.id);
      setN((x) => x + 1);
    } catch (e) {
      failed(e);
    }
  };
  const remove = async () => {
    if (!thread) return;
    await api('DELETE', `/team/threads/${thread}`).catch(failed);
    setThread(null);
    setN((x) => x + 1);
  };
  return (
    <div className="of-chat">
      <div className="of-threads">
        {threads?.length ? (
          <select
            className="input"
            value={thread ?? ''}
            onChange={(e) => setThread(e.target.value || null)}
            aria-label={ow('person.threads', { name: seat.name })}
          >
            {(threads ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {(t.title || ow('person.untitled')) + ' · ' + formatDate(t.lastAt, locale, { day: 'numeric', month: 'short' })}
              </option>
            ))}
          </select>
        ) : null}
        <button type="button" className="btn btn--small" onClick={newThread}>
          <Icon name="plus" size={14} /> {ow('person.newThread')}
        </button>
      </div>
      <Messages
        key={thread ?? 'none'}
        seat={seat}
        thread={thread}
        onNeedThread={newThread}
        onDelete={remove}
        onSent={() => setN((x) => x + 1)}
        failed={failed}
        modelOn={modelOn}
        mem={false}
        onMem={onMem}
      />
    </div>
  );
}

// ------------------------------------------------------------ search (button and "/")
function Search({
  people,
  bySeat,
  tasksOf,
  onClose,
  onPick,
  onHits,
}: {
  people: Findable[];
  bySeat: Map<string, TeamSeat>;
  tasksOf: Map<string, Task[]>;
  onClose: () => void;
  onPick: (s: string) => void;
  onHits: (s: string[]) => void;
}) {
  const { ow, teamW } = useWords();
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const hits = useMemo(() => searchPeople(people, q), [people, q]);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    onHits(hits.map((h) => h.seat));
    setI(0);
    // Highlight follows the hits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hits]);
  useEffect(() => () => onHits([]), [onHits]);
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') (e.preventDefault(), setI((x) => Math.min(hits.length - 1, x + 1)));
    else if (e.key === 'ArrowUp') (e.preventDefault(), setI((x) => Math.max(0, x - 1)));
    else if (e.key === 'Enter' && hits[i]) (e.preventDefault(), onPick(hits[i].seat));
    else if (e.key === 'Escape') (e.preventDefault(), onClose());
  };
  return (
    <div className="of-search-pop" role="dialog" aria-modal="true" aria-label={ow('search.label')} onKeyDown={key}>
      <button type="button" className="of-scrim" aria-label={ow('person.close')} tabIndex={-1} onClick={onClose} />
      <div className="of-search-box">
        <label className="of-search-field">
          <Icon name="search" size={18} />
          <input
            ref={input}
            className="input"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={ow('search.placeholder')}
            aria-label={ow('search.label')}
            role="combobox"
            aria-expanded={hits.length > 0}
            aria-controls="of-hits"
            aria-activedescendant={hits[i] ? `of-hit-${hits[i].seat}` : undefined}
            autoComplete="off"
          />
        </label>
        {q.trim() ? (
          hits.length ? (
            <ul id="of-hits" role="listbox" className="of-hits">
              {hits.map((h, k) => {
                const s = bySeat.get(h.seat);
                if (!s) return null;
                const now = h.task ?? tasksOf.get(s.seat)?.find((x) => x.status === 'running')?.title;
                return (
                  <li key={h.seat} id={`of-hit-${h.seat}`} role="option" aria-selected={k === i} onMouseEnter={() => setI(k)} onClick={() => onPick(h.seat)}>
                    <Avatar seat={s} size="s" />
                    <span className="of-hit__main">
                      <strong>{s.name}</strong>
                      <small>
                        {s.title} · {teamW(`teamName.${s.team}` as TeamKey)}
                      </small>
                      {now ? <small className="of-hit__task">{ow('search.now', { task: now })}</small> : null}
                    </span>
                    <span className="tm-dot" data-activity={s.activity}>
                      {teamW(`activity.${s.activity}` as TeamKey)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="of-empty">{ow('search.none', { q: q.trim() })}</p>
          )
        ) : null}
        <p className="of-hint">{ow('search.hint')}</p>
      </div>
    </div>
  );
}

function Keys({ onClose }: { onClose: () => void }) {
  const { ow } = useWords();
  const rows: [string, OfficeKey][] = [
    ['/', 'keys.search'],
    ['A', 'keys.approvals'],
    ['M', 'keys.meetings'],
    ['Esc', 'keys.close'],
    ['Q E', 'keys.turn'],
    ['+ −', 'keys.zoom'],
    ['0', 'keys.fit'],
    ['← → ↑ ↓', 'keys.pan'],
    ['1–9', 'keys.rooms'],
    ['V', 'keys.view'],
  ];
  return (
    <div className="of-keys" role="dialog" aria-label={ow('bar.keys')}>
      <header>
        <h2>{ow('bar.keys')}</h2>
        <button type="button" className="btn btn--icon btn--quiet btn--small" onClick={onClose} aria-label={ow('person.close')}>
          <Icon name="close" size={14} />
        </button>
      </header>
      <dl>
        {rows.map(([k, w]) => (
          <div key={w}>
            <dt>
              <kbd>{k}</kbd>
            </dt>
            <dd>{ow(w)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ------------------------------------------------------------ the plan (2D: no WebGL, or chosen)
function PlanView({
  seats,
  advisors,
  live,
  selected,
  onPick,
  onRoom,
}: {
  seats: TeamSeat[];
  advisors: TeamSeat[];
  live: Meeting | null;
  selected: string | null;
  onPick: (s: string) => void;
  onRoom: (r: string) => void;
}) {
  const { ow, teamW, locale } = useWords();
  return (
    <div className="of-plan">
      {ROOMS.map((r) => {
        const ps =
          r.kind === 'team'
            ? seats.filter((s) => roomOfTeam(s.team)?.id === r.id)
            : r.kind === 'meeting' && live
              ? seats.filter((s) => live.attendees.includes(s.seat))
              : r.kind === 'lounge'
                ? advisors
                : [];
        return (
          <section key={r.id} className="of-planroom" data-team={r.team ?? r.kind} data-kind={r.kind} aria-label={roomName(r, teamW, ow)}>
            <header>
              <button
                type="button"
                className="of-sign"
                data-team={r.team ?? r.kind}
                data-live={r.kind === 'meeting' && live ? '' : undefined}
                onClick={() => onRoom(r.id)}
              >
                <span>{roomName(r, teamW, ow)}</span>
                {r.kind === 'meeting' && live ? (
                  <b className="of-live">{ow('room.live')}</b>
                ) : ps.length ? (
                  <small>{formatNumber(ps.length, locale)}</small>
                ) : null}
              </button>
              {r.kind === 'meeting' && live ? <span className="of-planmeet">{live.title}</span> : null}
            </header>
            {ps.length ? (
              <ul>
                {ps.map((s) => (
                  <li key={s.seat}>
                    <button
                      type="button"
                      className="of-person"
                      aria-current={s.seat === selected ? 'true' : undefined}
                      data-activity={s.activity}
                      onClick={() => onPick(s.seat)}
                    >
                      <Avatar seat={s} size="s" />
                      <span>
                        <strong>{s.name}</strong>
                        <small>{s.title}</small>
                      </span>
                      <i className="tm-dot" data-activity={s.activity} title={teamW(`activity.${s.activity}` as TeamKey)} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
