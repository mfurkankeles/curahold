// Planned meetings: the future side of a customer's meetings. Plan one, see it
// on the calendar, change it, mark it held (which logs it on the timeline and
// links the two), postpone or cancel it. Nothing is deleted. A company can
// save its own meeting types. Another company sees none of it.
import { beforeAll, describe, expect, it } from 'vitest';
import { Client, login, setup, type Env } from './helpers';

let env: Env;
let ada: Client; // administrator
let lena: Client; // member
let other: Client; // another company
let accountId: string;

beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
  other = await login(env, 'beta', 'ada@demo.example');
  accountId = env.a.accounts['Fjordnet Telecom'];
});

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
const day = (iso: string) => iso.slice(0, 10);

describe('planning a meeting', () => {
  it('keeps it off the timeline until it is held, and lists it as upcoming', async () => {
    const r = await lena.post(`/api/accounts/${accountId}/planned`, {
      kind: 'review',
      title: 'Q1 business review',
      agenda: 'Goals, usage and the renewal.',
      startsAt: inDays(7),
      minutes: 60,
      userIds: [env.a.ids.lena, env.a.ids.ada],
      repeat: 'quarterly',
    });
    expect(r.status).toBe(201);
    expect(r.json.planned.status).toBe('planned');
    expect(r.json.planned.repeat).toBe('quarterly');

    const page = await lena.get(`/api/accounts/${accountId}/planned`);
    expect(page.json.upcoming.some((m: any) => m.id === r.json.planned.id)).toBe(true);

    // Not on the timeline — it has not happened.
    const tl = await lena.get(`/api/accounts/${accountId}/timeline`);
    expect(JSON.stringify(tl.json).includes('Q1 business review')).toBe(false);
  });

  it('shows on the calendar as a planned meeting', async () => {
    const cal = await lena.get(`/api/calendar?from=${day(inDays(-1))}&to=${day(inDays(30))}&who=all`);
    const mine = cal.json.items.filter((i: any) => i.kind === 'planned');
    expect(mine.some((i: any) => i.title === 'Q1 business review' && i.meetingKind === 'review')).toBe(true);
  });

  it('can be changed while it is still to come', async () => {
    const made = await lena.post(`/api/accounts/${accountId}/planned`, { title: 'Draft', startsAt: inDays(3) });
    const r = await lena.patch(`/api/planned/${made.json.planned.id}`, { title: 'Kickoff', minutes: 30 });
    expect(r.status).toBe(200);
    expect(r.json.planned.title).toBe('Kickoff');
    expect(r.json.planned.minutes).toBe(30);
  });
});

describe('the life of a planned meeting', () => {
  it('held: writes the logged meeting, links them, and rolls a repeat forward', async () => {
    const made = await lena.post(`/api/accounts/${accountId}/planned`, {
      kind: 'meeting',
      title: 'Monthly sync',
      agenda: 'Status and open items.',
      startsAt: inDays(1),
      repeat: 'monthly',
    });
    const held = await lena.post(`/api/planned/${made.json.planned.id}/hold`, { body: 'Good call; usage climbing.' });
    expect(held.status).toBe(201);
    expect(held.json.planned.status).toBe('held');
    expect(held.json.planned.activityId).toBe(held.json.meeting.id);
    // The logged meeting is on the timeline now.
    const meetings = await lena.get(`/api/accounts/${accountId}/meetings`);
    expect(meetings.json.meetings.some((m: any) => m.id === held.json.meeting.id && m.title === 'Monthly sync')).toBe(true);
    // A monthly meeting rolls forward to the next one.
    expect(held.json.next).toBeTruthy();
    expect(held.json.next.status).toBe('planned');
    expect(new Date(held.json.next.startsAt).getTime()).toBeGreaterThan(new Date(made.json.planned.startsAt).getTime());
  });

  it('held once: holding it again is refused', async () => {
    const made = await lena.post(`/api/accounts/${accountId}/planned`, { title: 'One-off', startsAt: inDays(1) });
    await lena.post(`/api/planned/${made.json.planned.id}/hold`, {});
    const again = await lena.post(`/api/planned/${made.json.planned.id}/hold`, {});
    expect(again.status).toBe(400);
  });

  it('postponed: kept with a reason, and can be rescheduled to a new day', async () => {
    const made = await lena.post(`/api/accounts/${accountId}/planned`, { title: 'Slips', startsAt: inDays(2) });
    const r = await lena.post(`/api/planned/${made.json.planned.id}/postpone`, { reason: 'Sponsor travelling', startsAt: inDays(9) });
    expect(r.json.planned.status).toBe('postponed');
    expect(r.json.planned.reason).toBe('Sponsor travelling');
    expect(r.json.next.status).toBe('planned');
  });

  it('cancelled: kept with a reason, nothing deleted', async () => {
    const made = await lena.post(`/api/accounts/${accountId}/planned`, { title: 'Dropped', startsAt: inDays(2) });
    const r = await lena.post(`/api/planned/${made.json.planned.id}/cancel`, { reason: 'No longer needed' });
    expect(r.json.planned.status).toBe('cancelled');
    const page = await lena.get(`/api/accounts/${accountId}/planned`);
    expect(page.json.past.some((m: any) => m.id === made.json.planned.id && m.status === 'cancelled')).toBe(true);
    expect(page.json.upcoming.some((m: any) => m.id === made.json.planned.id)).toBe(false);
  });
});

describe('meeting types', () => {
  it('an administrator saves them; anyone can read them', async () => {
    const saved = await ada.put('/api/meeting-types', { types: [{ id: 'qbr', label: 'QBR', kind: 'review', minutes: 60, prompt: 'Goals · Usage · Risks' }] });
    expect(saved.status).toBe(200);
    const got = await lena.get('/api/meeting-types');
    expect(got.json.types[0].label).toBe('QBR');
    expect(got.json.types[0].prompt).toBe('Goals · Usage · Risks');
  });

  it('a member cannot save them', async () => {
    const r = await lena.put('/api/meeting-types', { types: [] });
    expect(r.status).toBe(403);
  });
});

describe('another company', () => {
  it('cannot read or plan on a customer that is not theirs', async () => {
    expect((await other.get(`/api/accounts/${accountId}/planned`)).status).toBe(404);
    expect((await other.post(`/api/accounts/${accountId}/planned`, { title: 'X', startsAt: inDays(1) })).status).toBe(404);
  });
});
