// The calendar: what falls on which day, and whose days someone may ask for.
import { beforeAll, describe, expect, it } from 'vitest';
import type { CalendarItem, CalendarReach } from '../shared/src/model';
import { Client, login, setup, type Env } from './helpers';

let env: Env;
let ada: Client;
let mert: Client;
let zeynep: Client;

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const cal = async (c: Client, who: string, from = day(-10), to = day(200)) => {
  const r = await c.get(`/api/calendar?from=${from}&to=${to}&who=${encodeURIComponent(who)}`);
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  return r.json.items as CalendarItem[];
};

beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
  mert = await login(env, 'acme', 'mert@demo.example');
  zeynep = await login(env, 'acme', 'zeynep@demo.example');
});

describe('what the calendar shows', () => {
  it('needs a stretch of days it can answer for', async () => {
    expect((await ada.get('/api/calendar')).status).toBe(400);
    expect((await ada.get(`/api/calendar?from=${day(3)}&to=${day(1)}`)).status).toBe(400);
    expect((await ada.get(`/api/calendar?from=${day(0)}&to=${day(500)}`)).status).toBe(400);
    expect((await ada.get(`/api/calendar?from=${day(0)}&to=${day(7)}&who=nobody`)).status).toBe(400);
    expect((await ada.get(`/api/calendar?from=${day(0)}&to=${day(366)}`)).status).toBe(200);
  });

  it('one’s own days: tasks by due date and the renewals of one’s customers', async () => {
    const mine = await cal(zeynep, 'me');
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((x) => x.personIds.includes(env.a.ids.zeynep))).toBe(true);
    const tasks = mine.filter((x) => x.kind === 'task');
    expect(tasks.map((x) => x.title)).toEqual(expect.arrayContaining(['Prepare the quarterly business review', 'Look into the usage drop']));
    expect(tasks.find((x) => x.title === 'Look into the usage drop')).toMatchObject({ date: day(-2), done: false, accountName: 'Velto Mobility' });
    // Her two customers renew inside the window; nobody else's do in "my calendar".
    expect(mine.filter((x) => x.kind === 'renewal').map((x) => x.title).sort()).toEqual(['Quillfield Retail', 'Velto Mobility']);
    // Outside the window nothing is sent.
    expect((await cal(zeynep, 'me', day(400), day(420))).filter((x) => x.kind !== 'reviewDue')).toEqual([]);
  });

  it('everyone’s days are what this person can already see', async () => {
    const all = await cal(zeynep, 'all');
    expect(all.length).toBeGreaterThan((await cal(zeynep, 'me')).length);
    expect(all.some((x) => x.personIds.includes(env.a.ids.omar))).toBe(true);
    // A private board she is not on stays out, for her and for everyone.
    expect(all.some((x) => x.title === 'Review the budget draft')).toBe(false);
    expect((await cal(ada, 'me')).some((x) => x.title === 'Review the budget draft')).toBe(true);
  });

  it('a meeting that was held sits on its day for the people who were there', async () => {
    const acc = env.a.accounts['Quillfield Retail'] ?? Object.values(env.a.accounts)[0];
    const held = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const made = await zeynep.post(`/api/accounts/${acc}/meetings`, { kind: 'meeting', title: 'Kickoff with the new team', happenedAt: held, minutes: 45, userIds: [env.a.ids.mert] });
    expect(made.status, JSON.stringify(made.json)).toBe(201);
    const hers = (await cal(zeynep, 'me')).find((x) => x.kind === 'meeting' && x.title === 'Kickoff with the new team');
    expect(hers).toMatchObject({ minutes: 45 });
    expect(hers!.personIds).toEqual(expect.arrayContaining([env.a.ids.zeynep, env.a.ids.mert]));
    expect((await cal(mert, 'me')).some((x) => x.id === hers!.id)).toBe(true);
  });
});

describe('whose calendar someone may open', () => {
  it('administrators and team leads were given the permission, members were not', async () => {
    const roles = await env.db.system((q) => q.query<{ key: string; perms: string[] }>(`select r.key, r.perms from roles r join orgs o on o.id = r.org_id where o.slug = 'acme'`));
    const has = (key: string) => roles.find((r) => r.key === key)!.perms.includes('calendar.view_team');
    expect([has('admin'), has('manager'), has('member'), has('viewer')]).toEqual([true, true, false, false]);
  });

  it('without the permission: one’s own and everyone’s, nobody else’s', async () => {
    const reach = (await zeynep.get('/api/calendars')).json as CalendarReach;
    expect(reach).toEqual({ can: false, everyone: false, teams: [], personIds: [] });
    expect((await zeynep.get(`/api/calendar?from=${day(0)}&to=${day(7)}&who=p:${env.a.ids.lena}`)).status).toBe(403);
    const team = (await mert.get('/api/calendars')).json.teams[0].id;
    expect((await zeynep.get(`/api/calendar?from=${day(0)}&to=${day(7)}&who=t:${team}`)).status).toBe(403);
    // Her own id is still her own calendar.
    expect((await zeynep.get(`/api/calendar?from=${day(0)}&to=${day(7)}&who=p:${env.a.ids.zeynep}`)).status).toBe(200);
  });

  it('a team lead reaches the people on their teams, one by one or together', async () => {
    const reach = (await mert.get('/api/calendars')).json as CalendarReach;
    expect(reach.can).toBe(true);
    expect(reach.everyone).toBe(false);
    expect(reach.teams.map((t) => t.name)).toEqual(['Customer Success']);
    expect([...reach.personIds].sort()).toEqual([env.a.ids.zeynep, env.a.ids.lena].sort());

    const hers = await cal(mert, `p:${env.a.ids.lena}`);
    expect(hers.length).toBeGreaterThan(0);
    expect(hers.every((x) => x.personIds.includes(env.a.ids.lena))).toBe(true);

    const team = await cal(mert, `t:${reach.teams[0].id}`);
    const members = new Set(reach.teams[0].memberIds);
    expect(team.every((x) => x.personIds.some((id) => members.has(id)))).toBe(true);
    expect(team.length).toBeGreaterThan(hers.length);

    // Someone on no team of his is not there to be asked for.
    expect((await mert.get(`/api/calendar?from=${day(0)}&to=${day(7)}&who=p:${env.a.ids.omar}`)).status).toBe(404);
    expect((await mert.get(`/api/calendar?from=${day(0)}&to=${day(7)}&who=t:${crypto.randomUUID()}`)).status).toBe(404);
  });

  it('an administrator reaches anyone', async () => {
    const reach = (await ada.get('/api/calendars')).json as CalendarReach;
    expect(reach.everyone).toBe(true);
    expect(reach.personIds).toEqual(expect.arrayContaining([env.a.ids.omar, env.a.ids.sofia]));
    expect(reach.personIds).not.toContain(env.a.ids.ada);
    const his = await cal(ada, `p:${env.a.ids.omar}`);
    expect(his.some((x) => x.title === 'Send the renewal proposal')).toBe(true);
  });

  it('narrowing to someone shows only what the asker may already see', async () => {
    // A role with the calendar permission and nothing else, for Omar, who leads the team Ada is on.
    const role = (await ada.post('/api/admin/roles', { key: 'calendar_only', name: 'Calendar only', perms: ['calendar.view_team', 'accounts.view_all'] })).json.role;
    expect((await ada.patch(`/api/admin/users/${env.a.ids.omar}`, { roleId: role.id })).status).toBe(200);
    const omar = await login(env, 'acme', 'omar@demo.example');
    const reach = (await omar.get('/api/calendars')).json as CalendarReach;
    expect(reach.teams.map((t) => t.name)).toEqual(['Account Management']);
    const hers = await cal(omar, `p:${env.a.ids.ada}`);
    // Her task on a board he can open is there; the one on her private board is not.
    expect(hers.some((x) => x.title === 'Get the price increase approved')).toBe(true);
    expect(hers.some((x) => x.title === 'Review the budget draft')).toBe(false);
  });

  it('another company’s people and teams cannot be asked for', async () => {
    const theirs = await login(env, 'beta', 'ada@demo.example');
    expect((await theirs.get(`/api/calendar?from=${day(0)}&to=${day(7)}&who=p:${env.a.ids.zeynep}`)).status).toBe(404);
    const team = (await mert.get('/api/calendars')).json.teams[0].id;
    expect((await theirs.get(`/api/calendar?from=${day(0)}&to=${day(7)}&who=t:${team}`)).status).toBe(404);
  });
});
