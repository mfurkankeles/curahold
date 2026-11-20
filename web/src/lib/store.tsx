// App-wide state for a signed-in person: who they are, the people and teams
// of the company, the boards they can see, and a small toast channel.
import { setCompanyZone } from './time';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Board, Me, Person, Team } from '../../../shared/src/model';
import { get } from './api';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error';
  /** How long it shows, in ms; null: until closed (an error). Counting pauses under the pointer or the focus (Shell.tsx). */
  life: number | null;
  /** e.g. "Undo" — the toast stays a little longer when it has one. */
  action?: { label: string; run: () => void | Promise<void>; /** An Undo (lib/undo.ts): Ctrl+Z runs it while the toast shows. */ undo?: boolean };
}

interface Store {
  me: Me;
  people: Person[];
  teams: Team[];
  boards: Board[];
  /** False until the first board list has arrived (an empty list is not "no boards" yet). */
  boardsLoaded: boolean;
  person: (id: string | null) => Person | undefined;
  can: (perm: string) => boolean;
  canWrite: boolean;
  reloadBoards: () => Promise<void>;
  reloadPeople: () => Promise<void>;
  reloadMe: () => Promise<void>;
  toast: (text: string, tone?: Toast['tone'], action?: Toast['action']) => void;
  dismiss: (id: number) => void;
  toasts: Toast[];
}

const Ctx = createContext<Store | null>(null);
let toastSeq = 0;
/** Toast lifetimes (docs/design/tokens.md "Undo"): long enough to read, short enough not to pile up. */
export const TOAST_MS = 4000;
/** A toast with an action (Undo) stays longer, so there is time to reach it. */
export const TOAST_ACTION_MS = 7000;
/** At most this many toasts on screen; the oldest gives way. */
const TOAST_MAX = 3;

export function StoreProvider({ initialMe, children }: { initialMe: Me; children: ReactNode }) {
  const [me, setMe] = useState(initialMe);
  const [people, setPeople] = useState<Person[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardsLoaded, setBoardsLoaded] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const reloadBoards = useCallback(async () => {
    try {
      setBoards((await get<{ boards: Board[] }>('/boards')).boards);
    } finally {
      setBoardsLoaded(true);
    }
  }, []);
  const reloadPeople = useCallback(async () => {
    const r = await get<{ people: Person[]; teams: Team[] }>('/people');
    setPeople(r.people);
    setTeams(r.teams);
  }, []);
  const reloadMe = useCallback(async () => {
    const next = await get<Me>('/me');
    setCompanyZone(next.org.timezone);
    setMe(next);
  }, []);

  useEffect(() => {
    void reloadBoards();
    void reloadPeople();
  }, [reloadBoards, reloadPeople]);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((x) => x.id !== id)), []);
  const toast = useCallback((text: string, tone: Toast['tone'] = 'info', action?: Toast['action']) => {
    const id = ++toastSeq;
    // An error stays until closed: it may need reading twice, or acting on.
    const life = tone === 'error' ? null : action ? TOAST_ACTION_MS : TOAST_MS;
    setToasts((list) => [...list, { id, text, tone, action, life }].slice(-TOAST_MAX));
  }, []);

  const value = useMemo<Store>(() => {
    const byId = new Map(people.map((p) => [p.id, p]));
    return {
      me,
      people,
      teams,
      boards,
      boardsLoaded,
      person: (id) => (id ? byId.get(id) : undefined),
      can: (perm) => me.user.perms.includes(perm as any),
      // Looking as someone else is always read only.
      canWrite: me.user.seat === 'full' && !me.previewBy,
      reloadBoards,
      reloadPeople,
      reloadMe,
      toast,
      dismiss,
      toasts,
    };
  }, [me, people, teams, boards, boardsLoaded, reloadBoards, reloadPeople, reloadMe, toast, dismiss, toasts]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error('StoreProvider missing');
  return v;
}
