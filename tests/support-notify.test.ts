// When Curahold support answers a help request, the person who asked (and
// everyone kept in the loop) hears it in the app — the bell/inbox — as well as
// by email. A note the team keeps to itself, and a reply from the company, do
// not raise an in-app notice.
import { beforeAll, describe, expect, it } from 'vitest';
import { BASE, Client, login, setup, type Env } from './helpers';

const STAFF_KEY = 'staff-key-staff-key-staff-key-9876';
const DESK = 'desk@curahold.test';

let env: Env;
let zeynep: Client; // asks for help
let lena: Client; // kept in the loop
let lenaId: string;

/** Curahold's desk answers or notes a request, with the shared staff key (tooling). */
async function desk(ref: string, over: Record<string, unknown>) {
  const r = await env.app.request(`https://app.${BASE}/api/desk/requests/${ref}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-curahold-staff-key': STAFF_KEY },
    body: JSON.stringify({ staff: 'Deniz', ...over }),
  });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
}

const helpNotes = async (c: Client) => ((await c.get('/api/notifications')).json.notifications as any[]).filter((n) => n.kind === 'help');

beforeAll(async () => {
  env = await setup({ staffKey: STAFF_KEY, support: { email: DESK } });
  zeynep = await login(env, 'acme', 'zeynep@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
  lenaId = (await lena.get('/api/me')).json.user.id;
});

describe('support’s answer reaches the in-app bell/inbox', () => {
  it('the person who asked, and a colleague kept in the loop, both get a help notice', async () => {
    const ask = await zeynep.post('/api/help', {
      category: 'question',
      subject: 'How do I import renewals?',
      description: 'I have a sheet with renewal dates and want them on the customers.',
      followers: [lenaId],
    });
    expect(ask.status, JSON.stringify(ask.json)).toBe(201);
    await env.settle();
    const ref = ask.json.request.ref as string;
    const before = (await zeynep.get('/api/notifications')).json.unread as number;

    const a = await desk(ref, { body: 'Open Customers → Import and pick the renewal column.' });
    expect(a.status, JSON.stringify(a.json)).toBe(201);
    await env.settle();

    const mine = await helpNotes(zeynep);
    expect(mine.length).toBe(1);
    expect(mine[0]).toMatchObject({ kind: 'help' });
    // The subject rides in the body; the URL opens the person's own requests.
    expect(mine[0].body).toContain('import renewals');
    expect(mine[0].url).toMatch(/#help$/);
    expect((await zeynep.get('/api/notifications')).json.unread).toBeGreaterThan(before);

    // The colleague kept in the loop hears it too.
    const hers = await helpNotes(lena);
    expect(hers.length).toBe(1);
    expect(hers[0].body).toContain('import renewals');
  });

  it('a note the team keeps to itself raises no in-app notice', async () => {
    const ask = await zeynep.post('/api/help', { category: 'bug', subject: 'A button does nothing', description: 'The export button on the renewals view does not respond to a click.' });
    await env.settle();
    const ref = ask.json.request.ref as string;
    const before = (await helpNotes(zeynep)).length;

    const n = await desk(ref, { body: 'Check their plan tier before replying.', internal: true });
    expect(n.status).toBe(201);
    await env.settle();
    expect((await helpNotes(zeynep)).length).toBe(before);
  });

  it('the person’s own reply does not notify themselves (the desk hears it by email)', async () => {
    const ask = await zeynep.post('/api/help', { category: 'question', subject: 'Where are archived boards?', description: 'I archived a board last week and cannot find where archived boards live now.' });
    await env.settle();
    const id = ask.json.request.id as string;
    const before = (await helpNotes(zeynep)).length;

    const sentBefore = env.email.sent.length;
    const r = await zeynep.post(`/api/help/${id}/messages`, { body: 'Actually, found it — never mind.' });
    expect(r.status).toBe(201);
    await env.settle();
    // No new in-app help notice for herself…
    expect((await helpNotes(zeynep)).length).toBe(before);
    // …but the desk was told by email.
    expect(env.email.sent.slice(sentBefore).some((m) => m.to === DESK)).toBe(true);
  });
});
