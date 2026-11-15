// Reading a board's sprints and what the team's pace is, shared by the backlog,
// the sprint screens and the roadmap.
import { useCallback, useEffect, useState } from 'react';
import { velocityOf } from '../../../shared/src/burndown';
import type { Sprint, Task } from '../../../shared/src/model';
import { get } from '../lib/api';

/** The board's sprints (not archived), each with its live totals, and a way to reload them. */
export function useSprints(boardId: string, refreshKey: number) {
  const [sprints, setSprints] = useState<Sprint[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    try {
      setSprints((await get<{ sprints: Sprint[] }>(`/boards/${boardId}/sprints`)).sprints);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [boardId]);
  useEffect(() => void load(), [load, refreshKey]);
  return { sprints, failed, reload: load };
}

/** What a closed sprint finished: the figure kept at its close, else (older sprints) what is done in it now. */
export const finishedPoints = (s: Sprint) => s.donePoints ?? s.totals?.donePoints ?? 0;

/** Closed sprints from the oldest to the latest. */
export function closedInOrder(sprints: Sprint[]): Sprint[] {
  const when = (s: Sprint) => s.closedOn ?? s.endsOn ?? s.updatedAt.slice(0, 10);
  return sprints.filter((s) => s.state === 'closed').sort((a, b) => when(a).localeCompare(when(b)) || a.position - b.position);
}

/** The team's velocity: points finished in each of the last three closed sprints and their average (the planning limit). */
export function teamVelocity(sprints: Sprint[] | null) {
  return velocityOf(closedInOrder(sprints ?? []).map(finishedPoints), 3);
}

/** Story points of some tasks added up (unestimated count as nothing). */
export const pointsOf = (xs: Task[]) => xs.reduce((n, x) => n + (x.storyPoints ?? 0), 0);
