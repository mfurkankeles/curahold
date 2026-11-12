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
  /** e.g. "Undo" — the toast stays a little longer when it has one. */
  action?: { label: string; run: () => void | Promise<void> };
}

interface Store {
  me: Me;
  people: Person[];
  teams: Team[];
  boards: Board[];
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

export function StoreProvider({ initialMe, children }: { initialMe: Me; children: ReactNode }) {
  const [me, setMe] = useState(initialMe);
  const [people, setPeople] = useState<Person[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const reloadBoards = useCallback(async () => {
    setBoards((await get<{ boards: Board[] }>('/boards')).boards);
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
    setToasts((list) => [...list, { id, text, tone, action }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), action ? 10000 : tone === 'error' ? 6000 : 3500);
  }, []);

  const value = useMemo<Store>(() => {
    const byId = new Map(people.map((p) => [p.id, p]));
    return {
      me,
      people,
      teams,
      boards,
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
  }, [me, people, teams, boards, reloadBoards, reloadPeople, reloadMe, toast, dismiss, toasts]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error('StoreProvider missing');
  return v;
}
