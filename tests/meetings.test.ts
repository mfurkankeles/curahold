// Meetings: a meeting, a business review or a call logged on a customer, with
// who was there (their people and ours), the notes and the next steps — which
// become tasks that remember the meeting. Another company never sees any of it.
import { beforeAll, describe, expect, it } from 'vitest';
import { Client, login, setup, type Env } from './helpers';

let env: Env;
let ada: Client; // administrator
let lena: Client; // member
let sofia: Client; // viewer seat
let other: Client; // someone at another company
let accountId: string;
let contactId: string;

beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
  sofia = await login(env, 'acme', 'sofia@demo.example');
  other = await login(env, 'beta', 'ada@demo.example');
  accountId = env.a.accounts['Fjordnet Telecom'];
  const type = (await ada.post('/api/record-types', { kind: 'contact' })).json.type;
  contactId = (await ada.post('/api/records', { typeId: type.id, accountId, name: 'Jonas Berg' })).json.record.id;
});

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

describe('logging a meeting', () => {
  it('keeps who was there and opens its next steps as tasks on the customer', async () => {
    const r = await lena.post(`/api/accounts/${accountId}/meetings`, {
      kind: 'review',
      title: 'Q4 business review',
      body: 'Usage is up; they want a second team on board.',
      happenedAt: daysAgo(2),
      minutes: 60,
      contactIds: [contactId],
      userIds: [env.a.ids.lena, env.a.ids.ada],
      boardId: env.a.boards.csBoard,
      nextSteps: [
        { title: 'Send the second-team quote', assigneeIds: [env.a.ids.lena], dueDate: '2099-01-15' },
        // A viewer cannot be given work: the step is made, without them.
        { title: 'Book the training', assigneeIds: [env.a.ids.sofia] },
      ],
    });
    expect(r.status).toBe(201);
    const m = r.json.meeting;
    expect(m.kind).toBe('review');
    expect(m.title).toBe('Q4 business review');
    expect(m.minutes).toBe(60);
    expect(m.contactIds).toEqual([contactId]);
    expect(m.userIds.sort()).toEqual([env.a.ids.lena, env.a.ids.ada].sort());
    expect(m.nextSteps.map((s: { title: string }) => s.title)).toEqual(['Send the second-team quote', 'Book the training']);
    expect(m.nextSteps[1].assigneeIds).toEqual([]);

    // The tasks are real tasks: on the board, on the customer, remembering the meeting.
    const rows = await env.db.system((q) => q.query(`select title, account_id, activity_id, due_date::text as due, assignee_ids from tasks where activity_id = $1 order by position`, [m.id]));
    expect(rows).toHaveLength(2);
    expect(rows[0].account_id).toBe(accountId);
    expect(rows[0].due).toBe('2099-01-15');
    expect(rows[0].assignee_ids).toEqual([env.a.ids.lena]);

    // A business review counts for the review rhythm.
    const acc = (await lena.get(`/api/accounts/${accountId}`)).json.account;
    expect(acc.lastReviewAt?.slice(0, 10)).toBe(daysAgo(2).slice(0, 10));
  });

  it('needs a title, notes or a next step; a date in the future is refused', async () => {
    expect((await lena.post(`/api/accounts/${accountId}/meetings`, { kind: 'meeting' })).status).toBe(400);
    expect((await lena.post(`/api/accounts/${accountId}/meetings`, { kind: 'call', title: 'Check-in', happenedAt: new Date(Date.now() + 3 * 86_400_000).toISOString() })).status).toBe(400);
    // Notes may be empty for a meeting (not for a note).
    expect((await lena.post(`/api/accounts/${accountId}/meetings`, { kind: 'call', title: 'Quick check-in' })).status).toBe(201);
    expect((await lena.post(`/api/accounts/${accountId}/activities`, { kind: 'note', body: '' })).status).toBe(400);
  });

  it('names only this customer’s people and this company’s people', async () => {
    const elsewhere = env.a.accounts['Velto Mobility'];
    expect((await lena.post(`/api/accounts/${elsewhere}/meetings`, { title: 'x', contactIds: [contactId] })).status).toBe(400);
    expect((await lena.post(`/api/accounts/${accountId}/meetings`, { title: 'x', userIds: [env.b.ids.ada] })).status).toBe(400);
    // Next steps need a board to go to.
    expect((await lena.post(`/api/accounts/${accountId}/meetings`, { title: 'x', nextSteps: [{ title: 'y' }] })).status).toBe(400);
  });

  it('a viewer reads meetings but cannot log one', async () => {
    expect((await sofia.post(`/api/accounts/${accountId}/meetings`, { title: 'x' })).status).toBe(403);
    expect((await sofia.get(`/api/accounts/${accountId}/meetings`)).status).toBe(200);
  });
});

describe('the customer’s meetings', () => {
  it('lists them newest first, with counts by kind and how the next steps are doing', async () => {
    await lena.post(`/api/accounts/${accountId}/meetings`, { kind: 'meeting', title: 'Kick-off', happenedAt: daysAgo(30) });
    const page = (await ada.get(`/api/accounts/${accountId}/meetings`)).json;
    const titles = page.meetings.map((m: { title: string }) => m.title);
    expect(titles[0]).toBe('Quick check-in');
    expect(titles.indexOf('Q4 business review')).toBeLessThan(titles.indexOf('Kick-off'));
    expect(page.counts).toEqual({ meeting: 1, review: 1, call: 1 });

    // Finishing a next step shows on the meeting.
    const review = page.meetings.find((m: { kind: string }) => m.kind === 'review');
    const step = review.nextSteps[0];
    expect((await lena.patch(`/api/tasks/${step.id}`, { baseVersion: 1, status: 'done' })).status).toBe(200);
    const again = (await ada.get(`/api/accounts/${accountId}/meetings?kind=review`)).json;
    expect(again.meetings).toHaveLength(1);
    expect(again.meetings[0].nextSteps[0].done).toBe(true);
  });

  it('edits a meeting and adds next steps to it later', async () => {
    const m = (await ada.get(`/api/accounts/${accountId}/meetings?kind=meeting`)).json.meetings[0];
    const r = await lena.patch(`/api/activities/${m.id}`, { title: 'Kick-off with IT', minutes: 45, body: '', userIds: [env.a.ids.lena] });
    expect(r.status).toBe(200);
    expect(r.json.activity.title).toBe('Kick-off with IT');
    expect(r.json.activity.minutes).toBe(45);
    const s = await lena.post(`/api/activities/${m.id}/next-steps`, { boardId: env.a.boards.csBoard, steps: [{ title: 'Send the SSO guide' }] });
    expect(s.status).toBe(201);
    expect(s.json.nextSteps[0].title).toBe('Send the SSO guide');
  });

  it('another company sees none of it', async () => {
    expect((await other.get(`/api/accounts/${accountId}/meetings`)).status).toBe(404);
    const m = (await ada.get(`/api/accounts/${accountId}/meetings`)).json.meetings[0];
    expect((await other.patch(`/api/activities/${m.id}`, { title: 'mine now' })).status).toBe(404);
    expect((await other.post(`/api/activities/${m.id}/next-steps`, { boardId: env.b.boards.csBoard, steps: [{ title: 'x' }] })).status).toBe(404);
  });

  it('deleting a meeting keeps its next steps as tasks', async () => {
    const m = (await ada.get(`/api/accounts/${accountId}/meetings?kind=review`)).json.meetings[0];
    expect((await ada.del(`/api/activities/${m.id}`)).status).toBe(200);
    const rows = await env.db.system((q) => q.query(`select activity_id from tasks where title = 'Send the second-team quote'`));
    expect(rows).toHaveLength(1);
    expect(rows[0].activity_id).toBeNull();
  });
});
