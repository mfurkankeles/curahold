// Cycle time and throughput (shared/src/flow.ts, GET /boards/:id/flow): right on the company's clock —
// its weekend left out, its time zone deciding which week a late finish belongs to, a daylight-saving
// day as long as it really was — and worked out from the board's own status history.
import { beforeAll, describe, expect, it } from 'vitest';
import { boardFlow, firstDayOf, median, percentile, weekOf, workingMs } from '../shared/src/flow';
import { localDate } from '../shared/src/days';
import { pmColumns } from '../shared/src/templates';
import { login, setup, type Client, type Env } from './helpers';

const H = 3_600_000;

describe('flow arithmetic', () => {
  it('leaves the company weekend out, in its own time zone', () => {
    // Friday 17:00 to Monday 10:00 in Istanbul: 7 hours on Friday, 10 on Monday.
    expect(workingMs(Date.parse('2026-11-13T14:00:00Z'), Date.parse('2026-11-16T07:00:00Z'), 'Europe/Istanbul', [6, 7]) / H).toBe(17);
    // The same span with a Friday–Saturday weekend: Sunday and Monday morning count, Friday evening does not.
    expect(workingMs(Date.parse('2026-11-13T14:00:00Z'), Date.parse('2026-11-16T07:00:00Z'), 'Europe/Istanbul', [5, 6]) / H).toBe(34);
  });

  it('counts a daylight-saving day as the 23 hours it had', () => {
    // Berlin, Saturday 28 March 12:00 to Monday 30 March 12:00 2026: the clocks went forward on Sunday.
    const start = Date.parse('2026-03-28T11:00:00Z');
    const end = Date.parse('2026-03-30T10:00:00Z');
    expect(workingMs(start, end, 'Europe/Berlin', []) / H).toBe(47);
    expect(workingMs(start, end, 'Europe/Berlin', [6, 7]) / H).toBe(12);
  });

  it('puts a finish just after midnight in the company’s new week; the week starts on its own first day', () => {
    expect(firstDayOf('tr')).toBe(1);
    expect(weekOf('2026-11-16', 1)).toBe('2026-11-16');
    expect(weekOf('2026-11-15', 1)).toBe('2026-11-09');
    expect(weekOf('2026-11-15', 7)).toBe('2026-11-15');
    const flow = boardFlow({
      boardId: 'b',
      tasks: [{ id: 't', issueType: 'story', storyPoints: 3, createdAt: '2026-11-10T08:00:00Z', createdIn: 'in_progress', doneAt: '2026-11-15T21:30:00Z' }],
      moves: [],
      started: new Set(['in_progress']),
      today: '2026-11-16',
      timeZone: 'Europe/Istanbul',
      weekend: [6, 7],
      firstDay: 1,
      weeks: 4,
    });
    // 00:30 on Monday in Istanbul, though still Sunday in UTC.
    expect(flow.throughput.map((w) => [w.week, w.count])).toEqual([['2026-10-26', 0], ['2026-11-02', 0], ['2026-11-09', 0], ['2026-11-16', 1]]);
  });

  it('median and the 85th percentile by nearest rank', () => {
    const s = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(median(s)).toBe(5.5);
    expect(percentile(s, 0.85)).toBe(9);
    expect(median([4])).toBe(4);
    expect(percentile([], 0.85)).toBe(0);
  });
});

describe('GET /boards/:id/flow', () => {
  let env: Env;
  let ada: Client;
  let board: string;

  beforeAll(async () => {
    env = await setup();
    ada = await login(env, 'acme', env.a.adminEmail);
    await env.db.system((q) => q.query(`update orgs set timezone = 'Europe/Istanbul', locale = 'tr' where slug = 'acme'`));
    board = (await ada.post('/api/boards', { name: 'Flow', visibility: 'org', columns: pmColumns('en') })).json.board.id;
  });

  it('starts the clock at the first working stage, stops it at done, and skips work that never started', async () => {
    const make = async (title: string, moves: string[]) => {
      let task = (await ada.post('/api/tasks', { boardId: board, title, status: 'backlog' })).json.task;
      for (const status of moves) task = (await ada.patch(`/api/tasks/${task.id}`, { baseVersion: task.version, status })).json.task;
      return task;
    };
    const a = await make('Started Monday, done Wednesday', ['in_progress', 'code_review', 'done']);
    const b = await make('Straight to done', ['done']);
    const bug = (await ada.post('/api/tasks', { boardId: board, title: 'A bug made in progress', status: 'in_progress' })).json.task;
    const pm = await ada.patch(`/api/tasks/${bug.id}/pm`, { baseVersion: bug.version, issueType: 'bug' });
    expect(pm.status).toBe(200);
    await ada.patch(`/api/tasks/${bug.id}`, { baseVersion: pm.json.task.version, status: 'done' });
    // Put the history on real days: last Monday 09:00 to Wednesday 09:00 Istanbul (two working days).
    const monday = new Date(Date.parse(`${weekOf(localDate(new Date(), 'Europe/Istanbul'), 1)}T06:00:00Z`) - 7 * 24 * H);
    const at = (h: number) => new Date(monday.getTime() + h * H);
    await env.db.system(async (q) => {
      await q.query(`update task_events set created_at = $2 where task_id = $1 and kind = 'status' and data->>'to' = 'in_progress'`, [a.id, at(0)]);
      await q.query(`update task_events set created_at = $2 where task_id = $1 and kind = 'status' and data->>'to' = 'code_review'`, [a.id, at(24)]);
      await q.query(`update task_events set created_at = $2 where task_id = $1 and kind = 'status' and data->>'to' = 'done'`, [a.id, at(48)]);
      await q.query(`update tasks set created_at = $2, done_at = $3 where id = $1`, [a.id, at(-24), at(48)]);
      await q.query(`update tasks set created_at = $2, done_at = $3 where id = $1`, [bug.id, at(2), at(5)]);
      await q.query(`update tasks set done_at = $2 where id = $1`, [b.id, at(6)]);
    });
    const r = await ada.get(`/api/boards/${board}/flow`);
    expect(r.status).toBe(200);
    const flow = r.json.flow;
    expect(flow).toMatchObject({ weeks: 12, firstDay: 1, weekend: [6, 7], finished: 3, unstarted: 1 });
    expect(flow.cycle).toEqual([
      { type: 'task', count: 1, median: 2, p85: 2 },
      { type: 'bug', count: 1, median: 0.1, p85: 0.1 },
    ]);
    expect(flow.throughput.at(-2)).toMatchObject({ week: weekOf(localDate(at(0), 'Europe/Istanbul'), 1), count: 3 });
    // A board with product management switched off has no flow to read.
    await ada.put(`/api/boards/${board}/pm`, { enabled: false });
    expect((await ada.get(`/api/boards/${board}/flow`)).status).toBe(404);
  });
});
