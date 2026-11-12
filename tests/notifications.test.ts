import { beforeAll, describe, expect, it } from 'vitest';
import { runScheduled } from '../api/src/lib/scheduler';
import { Client, login, setup, type Env } from './helpers';

let env: Env;
let mert: Client;
let lena: Client;
beforeAll(async () => {
  env = await setup();
  mert = await login(env, 'acme', 'mert@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
});

const mails = (to: string) => env.email.sent.filter((m) => m.to === to);

describe('notifications without any chat app', () => {
  it('an assignment goes by email (in the person’s language) and to the in-app list', async () => {
    const before = mails('lena@demo.example').length;
    const t = (await mert.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Draft the success plan', assigneeIds: [env.a.ids.lena] })).json.task;
    await env.settle();
    const m = mails('lena@demo.example').slice(before);
    expect(m.length).toBe(1);
    expect(m[0].subject).toBe('Mert Aksoy gave you a task');
    expect(m[0].text).toContain('Draft the success plan');
    expect(m[0].text).toContain(`/b/${env.a.boards.csBoard}?task=${t.id}`);
    const inbox = (await lena.get('/api/notifications')).json;
    expect(inbox.unread).toBeGreaterThan(0);
    expect(inbox.notifications[0]).toMatchObject({ kind: 'assigned', taskId: t.id, title: 'Mert Aksoy gave you a task' });
    await lena.post('/api/notifications/read', { all: true });
    expect((await lena.get('/api/notifications')).json.unread).toBe(0);
  });

  it('nobody is told about their own action', async () => {
    const before = mails('mert@demo.example').length;
    await mert.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Note to self', assigneeIds: [env.a.ids.mert] });
    await env.settle();
    expect(mails('mert@demo.example').length).toBe(before);
  });

  it('mentions email; plain comments stay in the app', async () => {
    const t = (await mert.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Kickoff deck', assigneeIds: [env.a.ids.lena] })).json.task;
    await env.settle();
    const before = mails('lena@demo.example').length;
    await mert.post(`/api/tasks/${t.id}/comments`, { body: 'Uploaded the draft' });
    await env.settle();
    expect(mails('lena@demo.example').length).toBe(before);
    await mert.post(`/api/tasks/${t.id}/comments`, { body: `@[Lena Fischer](${env.a.ids.lena}) please check slide 4` });
    await env.settle();
    const last = mails('lena@demo.example').slice(before);
    expect(last.map((m) => m.subject)).toEqual(['Mert Aksoy mentioned you']);
    expect(last[0].text).toContain('@Lena Fischer please check slide 4');
  });

  it('respects “only in the app” and per-kind switches', async () => {
    await lena.patch('/api/me', { prefs: { channel: 'none' } });
    const before = mails('lena@demo.example').length;
    await mert.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Quiet one', assigneeIds: [env.a.ids.lena] });
    await env.settle();
    expect(mails('lena@demo.example').length).toBe(before);
    await lena.patch('/api/me', { prefs: { channel: 'auto', events: { assigned: false } } });
    await mert.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Quiet two', assigneeIds: [env.a.ids.lena] });
    await env.settle();
    expect(mails('lena@demo.example').length).toBe(before);
    const prefs = (await lena.get('/api/me')).json.user.prefs;
    expect(prefs).toMatchObject({ channel: 'auto', events: { assigned: false, mentioned: true }, digestHour: 8 });
    await lena.patch('/api/me', { prefs: { events: { assigned: true } } });
  });
});

describe('morning digest', () => {
  it('arrives at 08:00 company time with overdue and today, once per day', async () => {
    // 05:00 UTC is 08:00 in Istanbul.
    const morning = new Date('2030-03-04T05:00:00Z');
    const zeynep = await login(env, 'acme', 'zeynep@demo.example');
    await zeynep.patch('/api/me', { prefs: { channel: 'email' } });
    await mert.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Late follow-up', assigneeIds: [env.a.ids.zeynep], dueDate: '2030-03-01' });
    await mert.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Today call', assigneeIds: [env.a.ids.zeynep], dueDate: '2030-03-04' });
    await env.settle();
    const before = mails('zeynep@demo.example').length;
    await runScheduled(env.deps, new Date('2030-03-04T04:00:00Z')); // 07:00 local — not yet
    expect(mails('zeynep@demo.example').length).toBe(before);
    await runScheduled(env.deps, morning);
    await runScheduled(env.deps, morning);
    // (The other test company has a Zeynep at the same address; only Acme's counts here.
    // 4 March 2030 is a Monday, so the weekly summary comes too, as its own message.)
    const got = mails('zeynep@demo.example').slice(before).filter((m) => m.text.includes('acme.curahold.test') && !m.subject.startsWith('Your week'));
    expect(got.length).toBe(1);
    expect(got[0].subject).toBe('Your tasks for today');
    expect(got[0].text).toMatch(/Overdue \(\d+\)[\s\S]*Late follow-up/);
    expect(got[0].text).toMatch(/Due today \(1\)\n• Today call/);
  });
});

describe('calendar feed', () => {
  it('a secret address serves the person’s open tasks as all-day events', async () => {
    await mert.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Renewal call, Quillfield', assigneeIds: [env.a.ids.lena], dueDate: new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10) });
    const { url } = (await lena.post('/api/me/calendar', {})).json;
    expect(url).toMatch(/^https:\/\/acme\.curahold\.test\/api\/calendar\/[\w-]+\.ics$/);
    const res = await env.app.request(url);
    expect(res.headers.get('content-type')).toContain('text/calendar');
    const ics = await res.text();
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('SUMMARY:Renewal call\\, Quillfield');
    expect(ics).toMatch(/DTSTART;VALUE=DATE:\d{8}/);
    // Only Lena's: Mert's private notes never appear.
    expect(ics).not.toContain('Note to self');
    // Another company's address does not know the token; a new token retires the old one.
    expect((await env.app.request(url.replace('acme.', 'beta.'))).status).toBe(404);
    await lena.post('/api/me/calendar', {});
    expect((await env.app.request(url)).status).toBe(404);
    await lena.del('/api/me/calendar');
    expect((await lena.get('/api/me/calendar')).json.enabled).toBe(false);
  });
});
