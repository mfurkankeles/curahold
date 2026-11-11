// App-wide state for a signed-in person: who they are, the people and teams
// of the company, the boards they can see, and a small toast channel.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Board, Me, Person, Team } from '../../../shared/src/model';
import { get } from './api';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error';
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
  toast: (text: string, tone?: Toast['tone']) => void;
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
    setMe(await get<Me>('/me'));
  }, []);

  useEffect(() => {
    void reloadBoards();
    void reloadPeople();
  }, [reloadBoards, reloadPeople]);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = ++toastSeq;
    setToasts((list) => [...list, { id, text, tone }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3500);
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
      canWrite: me.user.seat === 'full',
      reloadBoards,
      reloadPeople,
      reloadMe,
      toast,
      toasts,
    };
  }, [me, people, teams, boards, reloadBoards, reloadPeople, reloadMe, toast, toasts]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error('StoreProvider missing');
  return v;
}
