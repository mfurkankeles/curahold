// The product team's numbers: the burndown day by day (ideal line on working days,
// scope change as a step, today), velocity from what a sprint really finished, and
// both staying right across weekends, time zones and daylight-saving changes.
import { beforeAll, describe, expect, it } from 'vitest';
import { burndownSeries, isoWeekday, velocityOf, weekendOf } from '../shared/src/burndown';
import { addDays, localDate } from '../shared/src/days';
import type { Sprint, SprintBurndown, Task } from '../shared/src/model';
import { pmColumns } from '../shared/src/templates';
import { snapshotActiveSprints } from '../api/src/lib/burndown';
import { login, setup, type Client, type Env } from './helpers';

const bd = (over: Partial<SprintBurndown>): SprintBurndown => ({ sprintId: 's', startsOn: null, endsOn: null, startPoints: 0, points: [], ...over });
const pt = (day: string, totalPoints: number, remainingPoints: number) => ({ day, totalPoints, remainingPoints, totalCount: 0, remainingCount: 0 });

describe('burndown series (pure)', () => {
  it('knows the weekend of a language', () => {
    expect(weekendOf('tr')).toEqual([6, 7]);
    expect(weekendOf('ar')).toEqual([5, 6]);
    expect(weekendOf('not a tag')).toEqual([6, 7]);
    expect(isoWeekday('2026-11-16')).toBe(1); // a Monday
    expect(isoWeekday('2026-11-22')).toBe(7);
  });

  it('rests the ideal line on the weekend and reaches zero on the last working day', () => {
    // Monday 2 Nov → Sunday 15 Nov 2026: ten working days after the start day's moment.
    const s = burndownSeries(bd({ startsOn: '2026-11-02', endsOn: '2026-11-15', startPoints: 40, points: [pt('2026-11-02', 40, 40)], weekend: [6, 7] }), '2026-11-02');
    expect(s.days).toHaveLength(14);
    const at = (d: string) => s.days.find((x) => x.day === d)!;
    expect(at('2026-11-02').ideal).toBe(40);
    // Friday 6 → Saturday 7 → Sunday 8: flat over the weekend.
    expect(at('2026-11-07').ideal).toBe(at('2026-11-06').ideal);
    expect(at('2026-11-08').ideal).toBe(at('2026-11-06').ideal);
    expect(at('2026-11-07').weekend && at('2026-11-08').weekend && !at('2026-11-09').weekend).toBe(true);
    // Nine working days after Monday 2 Nov up to Friday 13: 40/9 a day, zero on Friday, zero over the last weekend.
    expect(at('2026-11-03').ideal).toBeCloseTo(40 - 40 / 9, 1);
    expect(at('2026-11-13').ideal).toBe(0);
    expect(at('2026-11-15').ideal).toBe(0);
    // Today is the first day; nothing after it is drawn as actual.
    expect(s.todayIndex).toBe(0);
    expect(s.days.slice(1).every((x) => x.remaining === null && x.scope === null)).toBe(true);
  });

  it('follows the company’s own weekend (Friday and Saturday)', () => {
    const s = burndownSeries(bd({ startsOn: '2026-11-01', endsOn: '2026-11-12', startPoints: 20, points: [], weekend: weekendOf('ar') }), '2026-11-01');
    const at = (d: string) => s.days.find((x) => x.day === d)!;
    expect(at('2026-11-06').weekend && at('2026-11-07').weekend).toBe(true); // Friday, Saturday
    expect(at('2026-11-08').weekend).toBe(false); // Sunday is a working day
    expect(at('2026-11-07').ideal).toBe(at('2026-11-05').ideal);
  });

  it('crosses daylight-saving changes without losing or doubling a day', () => {
    // Europe ends summer time on 25 Oct 2026, the United States on 1 Nov 2026.
    const s = burndownSeries(bd({ startsOn: '2026-10-19', endsOn: '2026-11-08', startPoints: 30, points: [], weekend: [6, 7] }), '2026-10-30');
    expect(s.days).toHaveLength(21);
    for (let i = 1; i < s.days.length; i++) expect(s.days[i].day).toBe(addDays(s.days[i - 1].day, 1));
    expect(s.days.filter((d) => d.weekend)).toHaveLength(6);
    // The company's day is read in its own zone, either side of the change.
    expect(localDate(new Date('2026-10-24T22:30:00Z'), 'Europe/Berlin')).toBe('2026-10-25'); // 00:30 summer time
    expect(localDate(new Date('2026-10-25T22:30:00Z'), 'Europe/Berlin')).toBe('2026-10-25'); // 23:30 winter time
    expect(localDate(new Date('2026-11-01T04:30:00Z'), 'America/New_York')).toBe('2026-11-01'); // 00:30 summer time
    expect(localDate(new Date('2026-11-02T04:30:00Z'), 'America/New_York')).toBe('2026-11-01'); // 23:30 winter time
    expect(localDate(new Date('2026-11-16T21:30:00Z'), 'Europe/Istanbul')).toBe('2026-11-17');
  });

  it('shows scope added after the start as a step, and carries a missing day forward', () => {
    const s = burndownSeries(
      bd({
        startsOn: '2026-11-09',
        endsOn: '2026-11-20',
        startPoints: 35,
        weekend: [6, 7],
        points: [pt('2026-11-09', 35, 35), pt('2026-11-10', 35, 32), pt('2026-11-12', 40, 37), pt('2026-11-13', 38, 30)],
      }),
      '2026-11-13',
    );
    const at = (d: string) => s.days.find((x) => x.day === d)!;
    expect(at('2026-11-11')).toMatchObject({ scope: 35, remaining: 32, change: 0 }); // no reading that day: the last one holds
    expect(at('2026-11-12')).toMatchObject({ scope: 40, change: 5 });
    expect(at('2026-11-13')).toMatchObject({ scope: 38, change: -2, today: true });
    expect([s.added, s.removed, s.remaining, s.top]).toEqual([5, 2, 30, 40]);
    expect(at('2026-11-16').remaining).toBeNull();
  });

  it('counts scope added on the first day after the start', () => {
    const s = burndownSeries(bd({ startsOn: '2026-11-09', endsOn: '2026-11-20', startPoints: 10, points: [pt('2026-11-09', 13, 13)] }), '2026-11-09');
    expect(s.days[0].change).toBe(3);
    expect(s.added).toBe(3);
  });

  it('averages the last three closed sprints', () => {
    expect(velocityOf([10, 18, 22, 18])).toEqual({ last: [18, 22, 18], average: 19.33 });
    expect(velocityOf([])).toEqual({ last: [], average: null });
  });
});

describe('sprint start, close and velocity (API)', () => {
  let env: Env;
  let ada: Client;
  let board: string;
  const mk = async (title: string, points: number) => {
    const t = (await ada.post('/api/tasks', { boardId: board, title })).json.task as Task;
    return (await ada.patch(`/api/tasks/${t.id}/pm`, { baseVersion: t.version, issueType: 'story', storyPoints: points })).json.task as Task;
  };
  const finish = async (t: Task, status = 'done') => {
    const cur = (await ada.get(`/api/tasks/${t.id}`)).json.task as Task;
    expect((await ada.patch(`/api/tasks/${t.id}`, { baseVersion: cur.version, status })).status).toBe(200);
  };

  beforeAll(async () => {
    env = await setup();
    ada = await login(env, 'acme', env.a.adminEmail);
    board = (await ada.post('/api/boards', { name: 'Product', visibility: 'org', columns: pmColumns('en') })).json.board.id;
  });

  it('keeps the committed scope, shows what was added, and freezes the velocity at close', async () => {
    env.clock.now = new Date('2026-11-02T09:00:00Z');
    const s = (await ada.post(`/api/boards/${board}/sprints`, { name: 'Sprint 1', startsOn: '2026-11-02', endsOn: '2026-11-13' })).json.sprint as Sprint;
    const a = await mk('A', 5);
    const b = await mk('B', 3);
    const c = await mk('C', 8);
    await ada.put(`/api/sprints/${s.id}/items`, { taskIds: [a.id, b.id] });
    const started = (await ada.put(`/api/sprints/${s.id}/state`, { state: 'active' })).json.sprint as Sprint;
    expect(started).toMatchObject({ startedOn: '2026-11-02', startPoints: 8, startCount: 2 });
    await snapshotActiveSprints(env.deps, env.clock.now);

    // Wednesday: C (8 points) joins the running sprint, A is finished.
    env.clock.now = new Date('2026-11-04T09:00:00Z');
    await ada.put(`/api/sprints/${s.id}/items`, { taskIds: [c.id] });
    await finish(a);
    let b1 = (await ada.get(`/api/sprints/${s.id}/burndown`)).json.burndown as SprintBurndown;
    expect(b1).toMatchObject({ startPoints: 8, startedOn: '2026-11-02', today: '2026-11-04', weekend: [6, 7] });
    let series = burndownSeries(b1);
    expect(series.added).toBe(8);
    expect(series.days.find((d) => d.day === '2026-11-04')).toMatchObject({ scope: 16, remaining: 11, change: 8 });

    // The list carries live totals for planning.
    const listed = ((await ada.get(`/api/boards/${board}/sprints`)).json.sprints as Sprint[]).find((x) => x.id === s.id)!;
    expect(listed.totals).toEqual({ points: 16, donePoints: 5, items: 3, doneItems: 1 });

    // Friday: close with B and C unfinished; they go back to the backlog.
    env.clock.now = new Date('2026-11-06T15:00:00Z');
    const closed = (await ada.put(`/api/sprints/${s.id}/state`, { state: 'closed', moveIncompleteTo: null })).json.sprint as Sprint;
    expect(closed).toMatchObject({ closedOn: '2026-11-06', donePoints: 5, doneCount: 1 });

    // Its burndown ends where it closed: no live point from after the work moved away.
    b1 = (await ada.get(`/api/sprints/${s.id}/burndown`)).json.burndown as SprintBurndown;
    expect(b1.points.at(-1)).toMatchObject({ day: '2026-11-06', totalPoints: 16, remainingPoints: 11 });
    env.clock.now = new Date('2026-11-09T09:00:00Z');
    b1 = (await ada.get(`/api/sprints/${s.id}/burndown`)).json.burndown as SprintBurndown;
    expect(b1.points.at(-1)!.day).toBe('2026-11-06');
    series = burndownSeries(b1);
    expect(series.remaining).toBe(11);

    // Reopening a finished story later does not rewrite the closed sprint's velocity.
    await finish(a, 'in_progress');
    const again = ((await ada.get(`/api/boards/${board}/sprints`)).json.sprints as Sprint[]).find((x) => x.id === s.id)!;
    expect(again.donePoints).toBe(5);
    env.clock.now = null;
  });

  it('records the snapshot on the company’s own day across a daylight-saving change', async () => {
    const [org] = await env.db.system((q) => q.query<{ id: string; timezone: string }>(`select id, timezone from orgs where slug = 'acme'`));
    await env.db.system((q) => q.query(`update orgs set timezone = 'Europe/Berlin' where id = $1`, [org.id]));
    try {
      env.clock.now = new Date('2026-10-23T09:00:00Z');
      const s = (await ada.post(`/api/boards/${board}/sprints`, { name: 'Sprint DST', startsOn: '2026-10-23', endsOn: '2026-10-30' })).json.sprint as Sprint;
      await ada.put(`/api/sprints/${s.id}/items`, { taskIds: [(await mk('D', 2)).id] });
      await ada.put(`/api/sprints/${s.id}/state`, { state: 'active' });
      // 00:30 on Sunday 25 Oct in Berlin (still summer time, UTC+2), then 23:30 the same Sunday (winter time, UTC+1).
      await snapshotActiveSprints(env.deps, new Date('2026-10-24T22:30:00Z'));
      await snapshotActiveSprints(env.deps, new Date('2026-10-25T22:30:00Z'));
      await snapshotActiveSprints(env.deps, new Date('2026-10-25T23:30:00Z')); // 00:30 Monday
      const days = await env.db.system((q) => q.query<{ d: string }>(`select to_char(day, 'YYYY-MM-DD') as d from sprint_burndowns where sprint_id = $1 order by day`, [s.id]));
      expect(days.map((r) => r.d)).toEqual(['2026-10-25', '2026-10-26']);
      await ada.put(`/api/sprints/${s.id}/state`, { state: 'closed' });
    } finally {
      await env.db.system((q) => q.query(`update orgs set timezone = $2 where id = $1`, [org.id, org.timezone]));
      env.clock.now = null;
    }
  });
});
