// A help request as a conversation: both sides answer on it, in the product
// or by email; support's own notes never reach the company.
import { beforeAll, describe, expect, it } from 'vitest';
import { cleanReply, noteCommand } from '../api/src/lib/helpThread';
import { BASE, Client, login, setup, type Env } from './helpers';

const STAFF_KEY = 'staff-key-staff-key-staff-key-1234';
const MAIL_KEY = 'mail-key-mail-key-mail-key-123456';
const DESK = 'desk@curahold.test';
const STAFF = 'deniz@curahold.test';

let env: Env;
let ada: Client;
let zeynep: Client;
let lena: Client;
let omar: Client;

async function central(method: string, path: string, body?: unknown, key: Record<string, string> = { 'x-curahold-staff-key': STAFF_KEY }) {
  const r = await env.app.request(`https://app.${BASE}${path}`, { method, headers: { 'content-type': 'application/json', ...key }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
}
const mail = (m: Record<string, unknown>) => central('POST', '/api/desk/mail', m, { 'x-curahold-mail-key': MAIL_KEY });

async function ask(c: Client, over: Record<string, unknown> = {}) {
  const r = await c.post('/api/help', { category: 'question', subject: 'How do I import renewals?', description: 'I have a sheet with renewal dates and want them on the customers.', ...over });
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  await env.settle();
  return r.json.request as { id: string; ref: string };
}
const thread = async (c: Client, id: string) => (await c.get(`/api/help/${id}`)).json.request;
const tokenOf = async (id: string) => (await env.db.system((q) => q.query<{ reply_token: string }>('select reply_token from help_requests where id = $1', [id])))[0].reply_token;

beforeAll(async () => {
  env = await setup({ staffKey: STAFF_KEY, support: { email: DESK, replyDomain: 'reply.curahold.test', mailKey: MAIL_KEY, staff: [STAFF] } });
  ada = await login(env, 'acme', 'ada@demo.example');
  zeynep = await login(env, 'acme', 'zeynep@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
  omar = await login(env, 'acme', 'omar@demo.example');
});

describe('what an emailed answer is cut down to', () => {
  it('keeps what was written above the quoted part', () => {
    expect(cleanReply('Thanks, that worked.\n\n— Write your reply above this line —\n\nDeniz from Curahold support answered…')).toBe('Thanks, that worked.');
    expect(cleanReply('Oldu, teşekkürler.\n\n— Cevabını bu çizginin üstüne yaz —\n\neski metin')).toBe('Oldu, teşekkürler.');
    expect(cleanReply('It still fails.\r\n\r\nOn Thu, 12 Nov 2026 at 10:02, Curahold <x@y.test> wrote:\r\n> Try again')).toBe('It still fails.');
    expect(cleanReply('Hâlâ olmuyor.\n\n12 Kas 2026 Per 10:02 tarihinde Curahold <x@y.test> şunu yazdı:\n> Yeniden dene')).toBe('Hâlâ olmuyor.');
    expect(cleanReply('Line one\n> a quote inside\nLine two\n\n> trailing\n> quote')).toBe('Line one\n> a quote inside\nLine two');
    expect(cleanReply('> only a quote')).toBe('');
  });

  it('reads the note command only at the very start', () => {
    expect(noteCommand('#note Check their plan first')).toEqual({ internal: true, text: 'Check their plan first' });
    expect(noteCommand('#not\nPlanına bak')).toEqual({ internal: true, text: 'Planına bak' });
    expect(noteCommand('See #note below')).toEqual({ internal: false, text: 'See #note below' });
  });
});

describe('the conversation, from the company’s side', () => {
  it('a request starts with the turn on support, and the desk gets a reply address for it', async () => {
    const r = await ask(zeynep);
    const t = await thread(zeynep, r.id);
    expect(t).toMatchObject({ ref: r.ref, status: 'received', messages: [], canReply: true, unread: false });
    expect((await tokenOf(r.id)).length).toBeGreaterThanOrEqual(16);
  });

  it('support answers: the person gets an email they can reply to, and the turn is theirs', async () => {
    const r = await ask(zeynep);
    const sent = env.email.sent.length;
    const a = await central('POST', `/api/desk/requests/${r.ref}/messages`, { body: 'Use Customers → Import and pick the renewal column.', staff: 'Deniz' });
    expect(a.status, JSON.stringify(a.json)).toBe(201);
    await env.settle();
    const out = env.email.sent.slice(sent);
    expect(out).toHaveLength(1);
    expect(out[0].to).toBe('zeynep@demo.example');
    expect(out[0].subject).toBe(`Re: [${r.ref}] How do I import renewals?`);
    expect(out[0].replyTo).toBe(`reply+${await tokenOf(r.id)}@reply.curahold.test`);
    expect(out[0].text).toContain('Use Customers → Import');
    expect(out[0].text.startsWith('— Write your reply above this line —')).toBe(true);

    // Her list shows it waits for her, unread; opening it marks it read.
    const before = (await zeynep.get('/api/help')).json.requests.find((x: any) => x.id === r.id);
    expect(before).toMatchObject({ status: 'answered', unread: true });
    const t = await thread(zeynep, r.id);
    expect(t.messages).toHaveLength(1);
    expect(t.messages[0]).toMatchObject({ author: 'support', staff: 'Deniz', via: 'desk' });
    expect((await zeynep.get('/api/help')).json.requests.find((x: any) => x.id === r.id).unread).toBe(false);
  });

  it('she answers in the product: the turn goes back and the desk hears', async () => {
    const r = await ask(zeynep);
    await central('POST', `/api/desk/requests/${r.ref}/messages`, { body: 'Which file type is it?', staff: 'Deniz' });
    await env.settle();
    const sent = env.email.sent.length;
    const m = await zeynep.post(`/api/help/${r.id}/messages`, { body: 'It is a CSV from our old tool.' });
    expect(m.status).toBe(201);
    await env.settle();
    expect((await thread(zeynep, r.id)).status).toBe('received');
    const out = env.email.sent.slice(sent);
    expect(out).toHaveLength(1);
    expect(out[0].to).toBe(DESK);
    expect(out[0].text).toContain('It is a CSV from our old tool.');
    expect(out[0].text).toContain('Zeynep Tunç');
  });

  it('solved by the person; a later message opens it again', async () => {
    const r = await ask(zeynep);
    expect((await zeynep.post(`/api/help/${r.id}/solve`)).status).toBe(200);
    expect((await thread(zeynep, r.id)).status).toBe('solved');
    await zeynep.post(`/api/help/${r.id}/messages`, { body: 'It came back today.' });
    expect((await thread(zeynep, r.id)).status).toBe('received');
  });

  it('nobody else in the company reads or answers it, unless kept in the loop', async () => {
    const r = await ask(zeynep);
    expect((await lena.get(`/api/help/${r.id}`)).status).toBe(404);
    expect((await lena.post(`/api/help/${r.id}/messages`, { body: 'Me too' })).status).toBe(404);
    expect((await lena.post(`/api/help/${r.id}/solve`)).status).toBe(404);
    expect((await lena.get('/api/help')).json.requests.some((x: any) => x.id === r.id)).toBe(false);
    // Only the asker says who follows; people outside the company cannot be named.
    expect((await lena.put(`/api/help/${r.id}/followers`, { userIds: [env.a.ids.lena] })).status).toBe(404);
    const set = await zeynep.put(`/api/help/${r.id}/followers`, { userIds: [env.a.ids.lena, env.b.ids.ada, env.a.ids.zeynep] });
    expect(set.json.followers).toEqual([env.a.ids.lena]);
    // Now Lena reads it, sees it in her list, answers, and hears support's reply.
    expect((await lena.get('/api/help')).json.requests.some((x: any) => x.id === r.id)).toBe(true);
    expect((await thread(lena, r.id)).canReply).toBe(true);
    expect((await lena.post(`/api/help/${r.id}/messages`, { body: 'Same on my side.' })).status).toBe(201);
    await env.settle();
    const sent = env.email.sent.length;
    await central('POST', `/api/desk/requests/${r.ref}/messages`, { body: 'Fixed for both of you.', staff: 'Deniz', status: 'solved' });
    await env.settle();
    expect(env.email.sent.slice(sent).map((m) => m.to).sort()).toEqual(['lena@demo.example', 'zeynep@demo.example']);
    expect((await thread(zeynep, r.id)).status).toBe('solved');
    // An administrator sees the request, but is not on it: reading yes, answering no.
    expect((await thread(ada, r.id)).canReply).toBe(false);
    expect((await ada.post(`/api/help/${r.id}/messages`, { body: 'As admin' })).status).toBe(403);
  });

  it('colleagues can be named when asking, with the day an answer is needed', async () => {
    const r = await ask(zeynep, { followers: [env.a.ids.omar], neededBy: '2027-01-15' });
    const t = await thread(omar, r.id);
    expect(t).toMatchObject({ followers: [env.a.ids.omar], neededBy: '2027-01-15', canReply: true });
  });
});

describe('support’s own notes', () => {
  it('are kept on the request, sent to the desk, and never shown or sent to the company', async () => {
    const r = await ask(zeynep);
    const sent = env.email.sent.length;
    const n = await central('POST', `/api/desk/requests/${r.ref}/messages`, { body: 'Their plan has no import limit; check the file encoding.', staff: 'Deniz', internal: true });
    expect(n.status).toBe(201);
    expect(n.json.message.internal).toBe(true);
    await env.settle();
    const out = env.email.sent.slice(sent);
    expect(out.map((m) => m.to)).toEqual([DESK]);
    expect(out[0].text).toContain('NOTE (not sent to the customer)');
    // The company side: nothing changed. Not the thread, not the status, not "unread".
    const t = await thread(zeynep, r.id);
    expect(t.messages).toEqual([]);
    expect(t.status).toBe('received');
    expect((await thread(ada, r.id)).messages).toEqual([]);
    // Not through the database either: the application's role cannot read a note, as anyone.
    const seen = await env.db.tenant({ orgId: env.a.orgId, userId: env.a.ids.ada }, (q) => q.query('select id from help_messages where request_id = $1', [r.id]));
    expect(seen).toEqual([]);
    // The desk sees it among the conversation.
    const desk = await central('GET', `/api/desk/requests/${r.ref}`);
    expect(desk.json.request.messages).toHaveLength(1);
    expect(desk.json.request.messages[0]).toMatchObject({ internal: true, name: 'Deniz' });
  });

  it('a company cannot write a note or speak as support', async () => {
    const r = await ask(zeynep);
    await expect(
      env.db.tenant({ orgId: env.a.orgId, userId: env.a.ids.zeynep }, (q) =>
        q.query(`insert into help_messages (org_id, request_id, author, staff, body) values ($1, $2, 'support', 'Curahold', 'You are upgraded for free')`, [env.a.orgId, r.id]),
      ),
    ).rejects.toThrow();
    await expect(
      env.db.tenant({ orgId: env.a.orgId, userId: env.a.ids.zeynep }, (q) =>
        q.query(`insert into help_messages (org_id, request_id, author, user_id, body, internal) values ($1, $2, 'user', $3, 'x', true)`, [env.a.orgId, r.id, env.a.ids.zeynep]),
      ),
    ).rejects.toThrow();
  });
});

describe('a raw email', () => {
  it('is read into who sent it, what it answers and what was written', async () => {
    const { readRawMail } = await import('../api/src/lib/helpThread');
    const raw = [
      'From: =?UTF-8?B?WmV5bmVwIFR1bsOn?= <zeynep@demo.example>',
      'To: Curahold <reply+AAAAAAAAAAAAAAAAAAAAAAAA@reply.curahold.test>',
      'Subject: Re: [CH-000001] Import',
      'Message-ID: <m1@mail.demo.example>',
      'In-Reply-To: <help-11111111-1111-4111-8111-111111111111@curahold.test>',
      'Authentication-Results: mx.example; dkim=pass; dmarc=pass header.from=demo.example',
      'MIME-Version: 1.0',
      'Content-Type: multipart/alternative; boundary="b1"',
      '',
      '--b1',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      'Oldu, te=C5=9Fekk=C3=BCrler.',
      '',
      '--b1',
      'Content-Type: text/html; charset=UTF-8',
      '',
      '<p>Oldu, teşekkürler.</p>',
      '--b1--',
      '',
    ].join('\r\n');
    const m = await readRawMail(raw);
    expect(m).toMatchObject({
      from: 'Zeynep Tunç <zeynep@demo.example>',
      to: ['reply+AAAAAAAAAAAAAAAAAAAAAAAA@reply.curahold.test'],
      messageId: '<m1@mail.demo.example>',
      inReplyTo: '<help-11111111-1111-4111-8111-111111111111@curahold.test>',
      authenticated: true,
    });
    expect(m.text.trim()).toBe('Oldu, teşekkürler.');
  });
});

describe('the desk', () => {
  it('opens only with the staff key', async () => {
    const r = await ask(zeynep);
    for (const key of [{}, { 'x-curahold-staff-key': 'wrong-wrong-wrong-wrong-wrong-wrong' }, { 'x-curahold-mail-key': MAIL_KEY }]) {
      expect((await central('GET', '/api/desk/requests', undefined, key as any)).status).toBe(403);
      expect((await central('GET', `/api/desk/requests/${r.ref}`, undefined, key as any)).status).toBe(403);
      expect((await central('POST', `/api/desk/requests/${r.ref}/messages`, { body: 'x', staff: 'Someone' }, key as any)).status).toBe(403);
    }
    // A signed-in administrator of a company is not the desk.
    expect((await ada.get('/api/desk/requests')).status).toBe(403);
  });

  it('lists what waits for support first, across companies', async () => {
    const theirs = await login(env, 'beta', 'ada@demo.example');
    const b = await ask(theirs, { subject: 'Faturamı göremiyorum', category: 'billing' });
    const list = (await central('GET', '/api/desk/requests')).json.requests as any[];
    expect(list.find((x) => x.ref === b.ref)).toMatchObject({ company: { slug: 'beta' }, status: 'received', from: { email: 'ada@demo.example' } });
    const statuses = list.map((x) => x.status);
    expect(statuses.indexOf('received')).toBeLessThanOrEqual(statuses.lastIndexOf('received'));
    expect(statuses.lastIndexOf('received')).toBeLessThan(statuses.includes('solved') ? statuses.indexOf('solved') : Infinity);
    expect(((await central('GET', '/api/desk/requests?status=solved')).json.requests as any[]).every((x) => x.status === 'solved')).toBe(true);
    expect(((await central('GET', `/api/desk/requests?q=${b.ref}`)).json.requests as any[]).map((x) => x.ref)).toEqual([b.ref]);
    expect((await central('GET', '/api/desk/requests/CH-999999')).status).toBe(404);
  });
});

describe('answers that arrive by email', () => {
  it('the door opens only with its key', async () => {
    expect((await central('POST', '/api/desk/mail', { from: 'a@b.test', to: ['x@y.test'], text: 'hi' }, {})).status).toBe(403);
    expect((await central('POST', '/api/desk/mail', { from: 'a@b.test', to: ['x@y.test'], text: 'hi' }, { 'x-curahold-staff-key': STAFF_KEY })).status).toBe(403);
  });

  it('the person’s reply lands on the request through the address it was sent to', async () => {
    const r = await ask(zeynep);
    await central('POST', `/api/desk/requests/${r.ref}/messages`, { body: 'Which column holds the date?', staff: 'Deniz' });
    await env.settle();
    const to = `reply+${await tokenOf(r.id)}@reply.curahold.test`;
    const got = await mail({
      from: 'Zeynep Tunç <Zeynep@Demo.example>',
      to: [to],
      subject: `Re: [${r.ref}] How do I import renewals?`,
      text: 'Column D.\n\nOn Thu, 12 Nov 2026 at 10:02, Curahold <support@curahold.test> wrote:\n> Which column holds the date?',
      messageId: '<abc-1@mail.demo.example>',
    });
    expect(got.json).toEqual({ taken: true, ref: r.ref, internal: false, author: 'user' });
    await env.settle();
    const t = await thread(zeynep, r.id);
    expect(t.status).toBe('received');
    expect(t.messages[t.messages.length - 1]).toMatchObject({ author: 'user', userId: env.a.ids.zeynep, body: 'Column D.', via: 'email' });
    // The same email delivered twice is kept once.
    expect((await mail({ from: 'zeynep@demo.example', to: [to], text: 'Column D.', messageId: '<abc-1@mail.demo.example>' })).json).toEqual({ taken: false, reason: 'repeat' });
    expect((await thread(zeynep, r.id)).messages).toHaveLength(t.messages.length);
  });

  it('without the address, the message it answers finds the request', async () => {
    const r = await ask(zeynep);
    const a = await central('POST', `/api/desk/requests/${r.ref}/messages`, { body: 'Try the import again now.', staff: 'Deniz' });
    await env.settle();
    const sentAs = env.email.sent[env.email.sent.length - 1].headers!['Message-ID'];
    expect(sentAs).toContain(a.json.message.id);
    const got = await mail({ from: 'zeynep@demo.example', to: ['support@somewhere.test'], text: 'Works now, thank you.', inReplyTo: sentAs });
    expect(got.json).toMatchObject({ taken: true, ref: r.ref });
  });

  it('support answers by email, and leaves a note with #note', async () => {
    const r = await ask(zeynep);
    const to = `reply+${await tokenOf(r.id)}@reply.curahold.test`;
    const sent = env.email.sent.length;
    // A "From" line is easy to forge: mail saying it is from Curahold's own people is taken only when its sender was checked.
    expect((await mail({ from: `Deniz Kaya <${STAFF}>`, to: [to], text: 'You are upgraded for free.' })).json).toEqual({ taken: false, reason: 'unknown_sender' });
    expect((await mail({ from: `Deniz Kaya <${STAFF}>`, to: [to], text: 'Please send the file you are importing.', authenticated: true })).json).toEqual({ taken: true, ref: r.ref, internal: false, author: 'support' });
    expect((await mail({ from: STAFF, to: [to], text: '#note\nThey are on the trial plan.', authenticated: true })).json).toEqual({ taken: true, ref: r.ref, internal: true, author: 'support' });
    await env.settle();
    const t = await thread(zeynep, r.id);
    expect(t.messages.map((m: any) => m.body)).toEqual(['Please send the file you are importing.']);
    expect(t.messages[0]).toMatchObject({ author: 'support', staff: 'Deniz Kaya', via: 'email' });
    expect(t.status).toBe('answered');
    const out = env.email.sent.slice(sent);
    expect(out.filter((m) => m.to === 'zeynep@demo.example')).toHaveLength(1);
    expect(out.filter((m) => m.to === 'zeynep@demo.example')[0].text).not.toContain('trial plan');
  });

  it('mail from anyone else, for no request, or with nothing in it is not taken', async () => {
    const r = await ask(zeynep);
    const to = `reply+${await tokenOf(r.id)}@reply.curahold.test`;
    // A colleague who is not on the request, a stranger, and another company's person with the same name.
    expect((await mail({ from: 'lena@demo.example', to: [to], text: 'Let me in' })).json).toEqual({ taken: false, reason: 'unknown_sender' });
    expect((await mail({ from: 'someone@elsewhere.test', to: [to], text: 'Let me in' })).json).toEqual({ taken: false, reason: 'unknown_sender' });
    expect((await mail({ from: 'zeynep@demo.example', to: ['reply+AAAAAAAAAAAAAAAAAAAAAAAA@reply.curahold.test'], text: 'Hello' })).json).toEqual({ taken: false, reason: 'unknown_request' });
    expect((await mail({ from: 'zeynep@demo.example', to: [to], text: '> only what was quoted' })).json).toEqual({ taken: false, reason: 'empty' });
    // From a customer, "#note" is only text: it is a reply like any other, shown to them.
    expect((await mail({ from: 'zeynep@demo.example', to: [to], text: '#note is this private?' })).json).toMatchObject({ taken: true, internal: false, author: 'user' });
    expect((await thread(zeynep, r.id)).messages.map((m: any) => m.body)).toEqual(['#note is this private?']);
  });
});
