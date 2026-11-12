// "Today" follows the company's clock, not the server's (UTC): what counts as
// overdue, the day a finished task is stamped with, the day of a health point.
// Also the daylight-saving edges of the day helper.
import { beforeAll, describe, expect, it } from 'vitest';
import { addDays, localDate, localHour } from '../shared/src/days';
import { login, setup, type Env } from './helpers';

describe('the day helper', () => {
  it('gives the local day on both sides of midnight', () => {
    // 21:30 UTC is 00:30 the next day in Istanbul (UTC+3, no daylight saving).
    expect(localDate(new Date('2026-03-29T21:30:00Z'), 'Europe/Istanbul')).toBe('2026-03-30');
    expect(localDate(new Date('2026-03-29T20:30:00Z'), 'Europe/Istanbul')).toBe('2026-03-29');
    expect(localDate(new Date('2026-03-29T21:30:00Z'), 'UTC')).toBe('2026-03-29');
    // Behind UTC: still the day before in New York.
    expect(localDate(new Date('2026-03-30T03:30:00Z'), 'America/New_York')).toBe('2026-03-29');
  });

  it('follows daylight saving in both directions', () => {
    // Berlin: clocks go forward on 29 March 2026 (UTC+1 → UTC+2) and back on 25 October.
    expect(localDate(new Date('2026-03-28T22:59:00Z'), 'Europe/Berlin')).toBe('2026-03-28');
    expect(localDate(new Date('2026-03-28T23:00:00Z'), 'Europe/Berlin')).toBe('2026-03-29');
    expect(localDate(new Date('2026-03-29T21:59:00Z'), 'Europe/Berlin')).toBe('2026-03-29');
    expect(localDate(new Date('2026-03-29T22:00:00Z'), 'Europe/Berlin')).toBe('2026-03-30');
    expect(localDate(new Date('2026-10-24T22:00:00Z'), 'Europe/Berlin')).toBe('2026-10-25');
    expect(localDate(new Date('2026-10-25T22:59:00Z'), 'Europe/Berlin')).toBe('2026-10-25');
    expect(localDate(new Date('2026-10-25T23:00:00Z'), 'Europe/Berlin')).toBe('2026-10-26');
    // The hour that happens twice in autumn and the one that never happens in spring.
    expect(localHour(new Date('2026-03-29T01:30:00Z'), 'Europe/Berlin')).toBe(3);
    expect(localHour(new Date('2026-10-25T00:30:00Z'), 'Europe/Berlin')).toBe(2);
    expect(localHour(new Date('2026-10-25T01:30:00Z'), 'Europe/Berlin')).toBe(2);
  });

  it('adds days by the calendar, so a 23 or 25 hour day is still one day', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 2)).toBe('2028-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('does not fall over on a time zone it does not know', () => {
    expect(localDate(new Date('2026-03-29T21:30:00Z'), 'Nowhere/Atlantis')).toBe('2026-03-29');
    expect(localDate(new Date('2026-03-29T21:30:00Z'), null)).toBe('2026-03-29');
  });
});

describe('the company day on the server', () => {
  let env: Env;
  beforeAll(async () => {
    env = await setup();
    await env.db.system((q) => q.query(`update orgs set timezone = case slug when 'acme' then 'Europe/Istanbul' else 'Europe/London' end`));
  });

  it('counts overdue work by the company time zone, at half past midnight', async () => {
    // 21:30 UTC on the 29th: already the 30th in Istanbul, still the 29th in London.
    env.clock.now = new Date('2026-03-29T21:30:00Z');
    const overdueOf = async (slug: 'acme' | 'beta', boardId: string) => {
      const ada = await login(env, slug, 'ada@demo.example');
      const before = (await ada.get('/api/reports/work')).json.totals.overdue as number;
      await ada.post('/api/tasks', { boardId, title: 'Due on the 29th', dueDate: '2026-03-29' });
      await ada.post('/api/tasks', { boardId, title: 'Due on the 30th', dueDate: '2026-03-30' });
      return ((await ada.get('/api/reports/work')).json.totals.overdue as number) - before;
    };
    expect(await overdueOf('acme', env.a.boards.csBoard)).toBe(1);
    expect(await overdueOf('beta', env.b.boards.csBoard)).toBe(0);
    env.clock.now = null;
  });

  it('answers app_today() from the company time zone when nothing set it', async () => {
    // UTC+14: for ten hours of every UTC day this island is already on tomorrow.
    await env.db.system((q) => q.query(`update orgs set timezone = 'Pacific/Kiritimati' where id = $1`, [env.b.orgId]));
    const [row] = await env.db.tenant({ orgId: env.b.orgId, userId: null }, (q) =>
      q.query<{ today: string; local: string }>(`select app_today()::text as today, (now() at time zone 'Pacific/Kiritimati')::date::text as local`),
    );
    expect(row.today).toBe(row.local);
    const [set] = await env.db.tenant({ orgId: env.b.orgId, userId: null, today: '2031-01-02' }, (q) => q.query<{ today: string }>(`select app_today()::text as today`));
    expect(set.today).toBe('2031-01-02');
  });

  it('has no query left that asks the server for its own day', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(`${dir}/${f}`).isDirectory() ? walk(`${dir}/${f}`) : [`${dir}/${f}`]));
    const serverDay = new RegExp(['current', 'date'].join('_') + '|now\\(\\)::date', 'i');
    const found = walk('api/src').filter((f) => f.endsWith('.ts') && serverDay.test(readFileSync(f, 'utf8')));
    expect(found).toEqual([]);
  });
});
