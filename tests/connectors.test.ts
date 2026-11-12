// Messaging connectors against stand-ins for Slack, Microsoft Teams and
// Google Chat (no network): connecting, delivery, buttons, commands,
// request verification, credentials at rest, and company isolation.
import { beforeAll, describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { hmacHex } from '../api/src/lib/crypto';
import { signRs256 } from '../api/src/lib/jwt';
import { Client, login, setup, type Env } from './helpers';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function rsaKey(kid: string) {
  const kp = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const jwk = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid };
  const der = new Uint8Array((await crypto.subtle.exportKey('pkcs8', kp.privateKey)) as ArrayBuffer);
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----`;
  return { jwk, pem, kid };
}

const unsignedJwt = (claims: object) => `${btoa(JSON.stringify({ alg: 'none' }))}.${btoa(JSON.stringify(claims)).replace(/=+$/, '')}.x`;

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: any;
}

let env: Env;
let ada: Client;
let mert: Client;
const calls: Call[] = [];
let teamsKey: Awaited<ReturnType<typeof rsaKey>>;
let chatKey: Awaited<ReturnType<typeof rsaKey>>;
let saKey: Awaited<ReturnType<typeof rsaKey>>;
const SERVICE = 'https://smba.trafficmanager.net/emea';
let webhookStatus = 200;

function parseBody(init?: RequestInit) {
  const b = init?.body;
  if (b instanceof URLSearchParams) return Object.fromEntries(b);
  if (typeof b !== 'string') return b ?? null;
  try {
    return JSON.parse(b);
  } catch {
    return Object.fromEntries(new URLSearchParams(b));
  }
}

async function router(url: string, init?: RequestInit): Promise<Response> {
  const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
  const call = { url, method: init?.method ?? 'GET', headers, body: parseBody(init) };
  calls.push(call);
  const u = new URL(url);
  // ----- Slack
  if (u.host === 'slack.com') {
    const m = u.pathname.replace('/api/', '');
    if (m === 'oauth.v2.access') return json({ ok: true, access_token: 'xoxb-secret-token', team: { id: 'T001', name: 'Demo Slack' }, bot_user_id: 'UBOT', app_id: 'A1' });
    if (m === 'users.list')
      return json({
        ok: true,
        members: [
          { id: 'U_LENA', profile: { email: 'lena@demo.example', real_name: 'Lena Fischer' } },
          { id: 'U_MERT', profile: { email: 'mert@demo.example', real_name: 'Mert Aksoy' } },
          { id: 'U_NEW', profile: { email: 'newbie@demo.example', real_name: 'New Colleague' } },
          { id: 'U_GUEST', profile: { email: 'guest@agency.example', real_name: 'Agency Guest' } },
          { id: 'UBOT2', is_bot: true, profile: {} },
        ],
      });
    if (m === 'usergroups.list') return json({ ok: true, usergroups: [{ name: 'CS Squad', users: ['U_LENA', 'U_NEW'] }] });
    if (m === 'users.lookupByEmail') return json({ ok: false, error: 'users_not_found' });
    if (m === 'users.info') return json({ ok: true, user: { id: u.searchParams.get('user'), profile: { email: 'zeynep@demo.example' } } });
    if (m === 'conversations.list') return json({ ok: true, channels: [{ id: 'C_CS', name: 'cs-team' }] });
    if (m === 'chat.postMessage') return json({ ok: true, ts: '1.1' });
    return json({ ok: false, error: 'unknown_method' });
  }
  if (u.host === 'hooks.slack.com' && u.pathname.startsWith('/actions/')) return new Response('ok');
  if (u.host === 'hooks.slack.com' || u.host === 'discord.com' || u.host === 'integrations.zoom.us' || u.host === 'automation.example') {
    return new Response('ok', { status: webhookStatus });
  }
  // ----- Microsoft
  if (u.host === 'login.microsoftonline.com') {
    if (u.pathname.startsWith('/organizations/')) {
      return json({ id_token: unsignedJwt({ tid: 'tenant-1', aud: 'ms-client', exp: Date.now() / 1000 + 600, email: 'ada@demo.example' }), refresh_token: 'ms-refresh' });
    }
    return json({ access_token: 'bot-token', expires_in: 3600 });
  }
  if (u.host === 'login.botframework.com') return json({ keys: [teamsKey.jwk] });
  if (u.host === 'smba.trafficmanager.net') {
    if (u.pathname.includes('/members/')) return json({ id: 'u-29', email: 'lena@demo.example', name: 'Lena Fischer', aadObjectId: 'aad-lena' });
    return json({ id: 'activity-1' });
  }
  if (u.host === 'graph.microsoft.com') return json({ value: [{ id: 'g1', displayName: 'Graph Person', mail: 'graph.person@demo.example', accountEnabled: true }] });
  // ----- Google
  if (u.host === 'www.googleapis.com') return json({ keys: [chatKey.jwk] });
  if (u.host === 'oauth2.googleapis.com') {
    if (call.body?.grant_type === 'authorization_code') {
      return json({ id_token: unsignedJwt({ hd: 'demo.example', aud: 'google-client', exp: Date.now() / 1000 + 600, email: 'ada@demo.example' }), refresh_token: 'g-refresh' });
    }
    return json({ access_token: 'chat-token', expires_in: 3600 });
  }
  if (u.host === 'chat.googleapis.com') return json({ name: 'spaces/DM1/messages/1' });
  return new Response('no stub', { status: 500 });
}

beforeAll(async () => {
  teamsKey = await rsaKey('teams-k1');
  chatKey = await rsaKey('chat-k1');
  saKey = await rsaKey('sa-k1');
  env = await setup({
    oauth: { google: { clientId: 'google-client', clientSecret: 'google-secret' }, microsoft: { clientId: 'ms-client', clientSecret: 'ms-secret' } },
    connectors: {
      slack: { clientId: 'slack-client', clientSecret: 'slack-secret', signingSecret: 'slack-signing-secret' },
      teams: { appId: 'bot-app-id', appPassword: 'bot-pass', tenantId: 'curahold-tenant' },
      gchat: { projectNumber: '123456789', serviceAccountEmail: 'curahold@project.iam.gserviceaccount.com', privateKey: saKey.pem },
    },
  });
  env.fetchHolder.impl = router;
  ada = await login(env, 'acme', 'ada@demo.example');
  mert = await login(env, 'acme', 'mert@demo.example');
});

async function connect(provider: string, who = ada) {
  const start = await who.req('GET', `/api/connect/${provider}/start`);
  expect(start.status).toBe(302);
  const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
  const cb = await new Client(env, 'app').req('GET', `/api/connect/callback?code=the-code&state=${encodeURIComponent(state)}`);
  return cb.headers.get('location')!;
}

async function slackPost(body: string, contentType = 'application/x-www-form-urlencoded', secret = 'slack-signing-secret') {
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = `v0=${await hmacHex(secret, `v0:${ts}:${body}`)}`;
  return env.app.request(`https://app.curahold.test/api/hooks/slack`, {
    method: 'POST',
    headers: { 'content-type': contentType, 'x-slack-request-timestamp': ts, 'x-slack-signature': sig },
    body,
  });
}

async function newTask(title: string, assignee: string, boardId = env.a.boards.csBoard) {
  const r = await mert.post('/api/tasks', { boardId, title, assigneeIds: [assignee], dueDate: '2030-01-10' });
  expect(r.status).toBe(201);
  await env.settle();
  return r.json.task;
}

describe('Slack', () => {
  it('connects with OAuth; the token is sealed and never returned', async () => {
    const back = await connect('slack');
    expect(back).toBe('https://acme.curahold.test/settings/connections?connected=slack');
    const list = await ada.get('/api/connections');
    const slack = list.json.connections.find((c: any) => c.provider === 'slack');
    expect(slack).toMatchObject({ label: 'Demo Slack', status: 'active', twoWay: true });
    expect(JSON.stringify(list.json)).not.toContain('xoxb-secret-token');
    const [row] = await env.db.system((q) => q.query(`select secret from connections where provider = 'slack'`));
    expect(row.secret).toMatch(/^v1\./);
    expect(row.secret).not.toContain('xoxb');
    // People were matched by email on install.
    expect(slack.linkedPeople).toBe(2);
    // The request role cannot read the sealed column at all.
    await expect(env.db.tenant({ orgId: env.a.orgId, userId: env.a.ids.ada }, (q) => q.query('select secret from connections'))).rejects.toThrow();
  });

  it('a workspace belongs to one company only', async () => {
    const otherAdmin = await login(env, 'beta', 'ada@demo.example');
    const back = await connect('slack', otherAdmin);
    expect(back).toContain('error=connection_taken');
  });

  it('assignments arrive as a direct message with Done / Tomorrow / Open — not by email', async () => {
    calls.length = 0;
    const before = env.email.sent.filter((m) => m.to === 'lena@demo.example').length;
    const t = await newTask('Send the onboarding plan', env.a.ids.lena);
    const post = calls.find((c) => c.url.endsWith('chat.postMessage'))!;
    expect(post.body.channel).toBe('U_LENA');
    expect(post.headers.authorization).toBe('Bearer xoxb-secret-token');
    const actions = post.body.blocks.find((b: any) => b.type === 'actions').elements;
    expect(actions.map((a: any) => a.action_id)).toEqual(['app_done', 'app_snooze', 'app_open']);
    expect(actions[0].value).toBe(t.id);
    expect(env.email.sent.filter((m) => m.to === 'lena@demo.example').length).toBe(before);
    const [n] = await env.db.system((q) => q.query(`select via, state from notifications where task_id = $1`, [t.id]));
    expect(n).toEqual({ via: 'slack', state: 'sent' });
  });

  it('the Done button finishes the task as that person and replaces the buttons', async () => {
    const t = await newTask('Book the review call', env.a.ids.lena);
    calls.length = 0;
    const payload = {
      type: 'block_actions',
      team: { id: 'T001' },
      user: { id: 'U_LENA' },
      actions: [{ action_id: 'app_done', value: t.id }],
      response_url: 'https://hooks.slack.com/actions/T001/1/abc',
      message: { blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'x' } }, { type: 'actions', elements: [] }] },
    };
    const res = await slackPost(`payload=${encodeURIComponent(JSON.stringify(payload))}`);
    expect(res.status).toBe(200);
    const task = (await mert.get(`/api/tasks/${t.id}`)).json.task;
    expect(task.status).toBe('done');
    const reply = calls.find((c) => c.url.startsWith('https://hooks.slack.com/actions/'))!;
    expect(reply.body.replace_original).toBe(true);
    expect(reply.body.blocks.some((b: any) => b.type === 'actions')).toBe(false);
    const [log] = await env.db.system((q) => q.query(`select actor_id, meta from audit_log where entity_id = $1 and action = 'task.updated'`, [t.id]));
    expect(log.actor_id).toBe(env.a.ids.lena);
    expect(log.meta.via).toBe('chat');
  });

  it('rejects requests without a valid signature', async () => {
    const res = await slackPost('payload=%7B%7D', 'application/x-www-form-urlencoded', 'wrong-secret');
    expect(res.status).toBe(401);
  });

  it('/curahold creates a task; an unknown chat user is matched by email the first time', async () => {
    const body = new URLSearchParams({ team_id: 'T001', user_id: 'U_ZEYNEP', command: '/curahold', text: 'Prepare the price comparison' }).toString();
    const res = await slackPost(body);
    const out = (await res.json()) as any;
    expect(out.response_type).toBe('ephemeral');
    expect(out.text).toContain('Task created: Prepare the price comparison');
    const [task] = await env.db.system((q) => q.query(`select assignee_ids, created_by from tasks where title = 'Prepare the price comparison'`));
    expect(task.assignee_ids).toEqual([env.a.ids.zeynep]);
    const [ident] = await env.db.system((q) => q.query(`select user_id from chat_identities where external_id = 'U_ZEYNEP'`));
    expect(ident.user_id).toBe(env.a.ids.zeynep);
  });

  it('a button cannot reach another company’s task', async () => {
    const beta = await login(env, 'beta', 'mert@demo.example');
    const other = (await beta.post('/api/tasks', { boardId: env.b.boards.csBoard, title: 'Beta only' })).json.task;
    const payload = { type: 'block_actions', team: { id: 'T001' }, user: { id: 'U_LENA' }, actions: [{ action_id: 'app_done', value: other.id }], response_url: 'https://hooks.slack.com/actions/x' };
    calls.length = 0;
    await slackPost(`payload=${encodeURIComponent(JSON.stringify(payload))}`);
    expect((await beta.get(`/api/tasks/${other.id}`)).json.task.status).toBe('todo');
    expect(calls.find((c) => c.url.startsWith('https://hooks.slack.com/actions/'))!.body.text).toContain('could not find that task');
  });

  it('offers the directory and groups for inviting people (own domain only)', async () => {
    const slack = (await ada.get('/api/connections')).json.connections.find((c: any) => c.provider === 'slack');
    const dir = (await ada.get(`/api/connections/${slack.id}/directory`)).json;
    expect(dir.people.map((p: any) => p.email)).toContain('newbie@demo.example');
    const sug = (await ada.get('/api/setup/people')).json;
    const emails = sug.people.map((p: any) => p.email);
    expect(emails).toContain('newbie@demo.example');
    expect(emails).not.toContain('guest@agency.example');
    expect(sug.people.find((p: any) => p.email === 'lena@demo.example').member).toBe(true);
    expect(sug.groups).toEqual([{ name: 'CS Squad', emails: ['lena@demo.example', 'newbie@demo.example'], source: 'slack' }]);
    expect((await ada.get(`/api/connections/${slack.id}/channels`)).json.channels).toEqual([{ id: 'C_CS', name: '#cs-team' }]);
  });
});

describe('Microsoft Teams', () => {
  const activity = (over: Record<string, unknown>) => ({
    serviceUrl: SERVICE,
    channelData: { tenant: { id: 'tenant-1' } },
    conversation: { id: 'a:personal-conv', conversationType: 'personal' },
    from: { id: 'u-29', aadObjectId: 'aad-lena' },
    recipient: { id: 'bot-1' },
    ...over,
  });
  const botJwt = (aud = 'bot-app-id', serviceurl = SERVICE) =>
    signRs256({ iss: 'https://api.botframework.com', aud, exp: Math.floor(Date.now() / 1000) + 600, serviceurl }, teamsKey.pem, teamsKey.kid);
  const teamsPost = async (body: unknown, token?: string) =>
    env.app.request('https://app.curahold.test/api/hooks/teams', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token !== '' ? { authorization: `Bearer ${token ?? (await botJwt())}` } : {}) },
      body: JSON.stringify(body),
    });

  it('connects by Microsoft 365 sign-in, which gives the tenant', async () => {
    const back = await connect('teams');
    expect(back).toContain('connected=teams');
    const conn = (await ada.get('/api/connections')).json.connections.find((c: any) => c.provider === 'teams');
    expect(conn).toMatchObject({ label: 'demo.example', twoWay: true });
  });

  it('refuses activities that are not signed by the Bot Framework for this bot', async () => {
    expect((await teamsPost(activity({ type: 'message', text: 'hi' }), '')).status).toBe(401);
    expect((await teamsPost(activity({ type: 'message', text: 'hi' }), await botJwt('someone-else'))).status).toBe(401);
    expect((await teamsPost(activity({ type: 'message', text: 'hi' }), await botJwt('bot-app-id', 'https://evil.example'))).status).toBe(401);
  });

  it('installing the app links the person and says hello', async () => {
    calls.length = 0;
    const r = await teamsPost(activity({ type: 'conversationUpdate', membersAdded: [{ id: 'bot-1' }] }));
    expect(r.status).toBe(200);
    const hello = calls.find((c) => c.method === 'POST' && c.url.startsWith(SERVICE) && c.url.endsWith('/activities'))!;
    expect(hello.body.text).toContain('Hi Lena Fischer');
    const [ident] = await env.db.system((q) => q.query(`select user_id, data from chat_identities where external_id = 'aad-lena'`));
    expect(ident.user_id).toBe(env.a.ids.lena);
    expect(ident.data.conversationId).toBe('a:personal-conv');
  });

  it('a person who prefers Teams gets an Adaptive Card; Done updates the card', async () => {
    const lena = await login(env, 'acme', 'lena@demo.example');
    const teams = (await lena.get('/api/me/delivery')).json.options.find((o: any) => o.provider === 'teams');
    expect(teams.linked).toBe(true);
    await lena.patch('/api/me', { prefs: { channel: teams.id } });
    calls.length = 0;
    const t = await newTask('Review the health score', env.a.ids.lena);
    const sent = calls.find((c) => c.url === `${SERVICE}/v3/conversations/a%3Apersonal-conv/activities`)!;
    const card = sent.body.attachments[0];
    expect(card.contentType).toBe('application/vnd.microsoft.card.adaptive');
    expect(card.content.actions[0]).toMatchObject({ type: 'Action.Submit', data: { act: 'done', taskId: t.id } });

    calls.length = 0;
    await teamsPost(activity({ type: 'message', value: { act: 'done', taskId: t.id }, replyToId: 'card-1' }));
    expect((await mert.get(`/api/tasks/${t.id}`)).json.task.status).toBe('done');
    expect(calls.find((c) => c.method === 'PUT' && c.url.endsWith('/activities/card-1'))).toBeTruthy();
    await lena.patch('/api/me', { prefs: { channel: 'auto' } });
  });

  it('"new …" in a chat with the bot creates a task', async () => {
    calls.length = 0;
    await teamsPost(activity({ type: 'message', text: 'new Ask for the logo files' }));
    const reply = calls.find((c) => c.method === 'POST' && c.url.endsWith('/activities'))!;
    expect(reply.body.text).toContain('Task created: Ask for the logo files');
  });

  it('a tenant nobody connected gets a pointer, not data', async () => {
    calls.length = 0;
    await teamsPost(activity({ type: 'message', text: 'new X', channelData: { tenant: { id: 'unknown-tenant' } } }));
    expect(calls.find((c) => c.url.endsWith('/activities'))!.body.text).toContain('not connected to Curahold yet');
  });

  it('builds the app package for the Teams admin center', async () => {
    const res = await ada.req('GET', '/api/connections/teams/package');
    expect(res.headers.get('content-type')).toBe('application/zip');
    const files = unzipSync(new Uint8Array(await (await env.app.request('https://acme.curahold.test/api/connections/teams/package', { headers: { cookie: ada.cookie } })).arrayBuffer()));
    const manifest = JSON.parse(strFromU8(files['manifest.json']));
    expect(manifest.bots[0].botId).toBe('bot-app-id');
    expect(files['color.png'].slice(1, 4)).toEqual(new Uint8Array([80, 78, 71]));
  });
});

describe('Google Chat', () => {
  const chatJwt = (aud = '123456789') =>
    signRs256({ iss: 'chat@system.gserviceaccount.com', aud, exp: Math.floor(Date.now() / 1000) + 600 }, chatKey.pem, chatKey.kid);
  const chatPost = async (body: unknown, token?: string) => {
    const res = await env.app.request('https://app.curahold.test/api/hooks/gchat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token ?? (await chatJwt())}` },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: res.status === 200 ? ((await res.json()) as any) : null };
  };
  const user = { name: 'users/111', email: 'omar@demo.example', displayName: 'Omar Haddad' };

  it('connects with a Google Workspace account (its domain)', async () => {
    const back = await connect('gchat');
    expect(back).toContain('connected=gchat');
  });

  it('checks the token Google signs for this project', async () => {
    expect((await chatPost({ type: 'MESSAGE', user }, await chatJwt('another-project'))).status).toBe(401);
  });

  it('adding the app in a direct message links the person', async () => {
    const r = await chatPost({ type: 'ADDED_TO_SPACE', user, space: { name: 'spaces/DM1', type: 'DM' } });
    expect(r.json.text).toContain('Hi Omar Haddad');
  });

  it('delivers a card with buttons; clicking Done finishes the task', async () => {
    const omar = await login(env, 'acme', 'omar@demo.example');
    const gchat = (await omar.get('/api/me/delivery')).json.options.find((o: any) => o.provider === 'gchat');
    await omar.patch('/api/me', { prefs: { channel: gchat.id } });
    calls.length = 0;
    const t = await newTask('Send the renewal quote', env.a.ids.omar, env.a.boards.renewals);
    const sent = calls.find((c) => c.url === 'https://chat.googleapis.com/v1/spaces/DM1/messages')!;
    expect(sent.headers.authorization).toBe('Bearer chat-token');
    const buttons = sent.body.cardsV2[0].card.sections[0].widgets.find((w: any) => w.buttonList).buttonList.buttons;
    expect(buttons[0].onClick.action).toEqual({ function: 'app_done', parameters: [{ key: 'taskId', value: t.id }] });
    // The service account signed its own token request.
    const tokenCall = calls.find((c) => c.url === 'https://oauth2.googleapis.com/token')!;
    expect(tokenCall.body.grant_type).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');

    const click = await chatPost({ type: 'CARD_CLICKED', user, space: { name: 'spaces/DM1', type: 'DM' }, action: { actionMethodName: 'app_done', parameters: [{ key: 'taskId', value: t.id }] } });
    expect(click.json.actionResponse).toEqual({ type: 'UPDATE_MESSAGE' });
    expect((await mert.get(`/api/tasks/${t.id}`)).json.task.status).toBe('done');
  });

  it('a slash command creates a task', async () => {
    const r = await chatPost({ type: 'MESSAGE', user, space: { name: 'spaces/DM1', type: 'DM' }, message: { slashCommand: { commandId: '1' }, argumentText: 'Call about the invoice' } });
    expect(r.json.text).toContain('Task created: Call about the invoice');
  });
});

describe('webhooks (one-way) and board posts', () => {
  it('only accepts real service addresses, never private ones', async () => {
    const bad = [
      { flavor: 'slack', url: 'https://evil.example/hook' },
      { flavor: 'json', url: 'http://automation.example/hook' },
      { flavor: 'json', url: 'https://localhost/hook' },
      { flavor: 'json', url: 'https://10.0.0.5/hook' },
      { flavor: 'json', url: 'https://169.254.169.254/latest' },
      { flavor: 'discord', url: 'https://discord.com/not-a-webhook' },
    ];
    for (const b of bad) expect((await ada.post('/api/connections/webhook', { ...b, label: 'x' })).status, b.url).toBe(400);
    expect((await mert.post('/api/connections/webhook', { flavor: 'json', url: 'https://automation.example/h', label: 'x' })).status).toBe(403);
  });

  it('a board posts new and finished tasks to a Slack-style webhook, Discord and a signed JSON hook', async () => {
    const mk = async (flavor: string, url: string, extra = {}) => (await ada.post('/api/connections/webhook', { flavor, url, label: flavor, ...extra })).json.id;
    const slackHook = await mk('slack', 'https://hooks.slack.com/services/T/B/XYZ');
    const discord = await mk('discord', 'https://discord.com/api/webhooks/1/abc');
    const signed = await mk('json', 'https://automation.example/hook', { signingSecret: 'shh' });
    const r = await mert.patch(`/api/boards/${env.a.boards.csBoard}`, {
      notify: [
        { connectionId: slackHook, channel: null, events: ['created', 'done'] },
        { connectionId: discord, channel: null, events: ['created'] },
        { connectionId: signed, channel: null, events: ['done'] },
      ],
    });
    expect(r.status).toBe(200);
    calls.length = 0;
    const t = await newTask('Ship the welcome pack', env.a.ids.zeynep);
    const slackPostCall = calls.find((c) => c.url === 'https://hooks.slack.com/services/T/B/XYZ')!;
    expect(slackPostCall.body.text).toContain('Ship the welcome pack');
    expect(calls.find((c) => c.url.startsWith('https://discord.com'))!.body.content).toContain('**New task on CS — General**');

    calls.length = 0;
    const cur = (await mert.get(`/api/tasks/${t.id}`)).json.task;
    await mert.patch(`/api/tasks/${t.id}`, { baseVersion: cur.version, status: 'done' });
    await env.settle();
    const hook = calls.find((c) => c.url === 'https://automation.example/hook')!;
    const raw = JSON.stringify(hook.body);
    expect(hook.headers['x-curahold-signature']).toBe(`sha256=${await hmacHex('shh', raw)}`);
    expect(hook.body.title).toBe('Finished on CS — General');
    expect(calls.some((c) => c.url.startsWith('https://discord.com'))).toBe(false); // only "created" there
    await mert.patch(`/api/boards/${env.a.boards.csBoard}`, { notify: [] });
  });

  it('Zoom gets its token header and the full format', async () => {
    const id = (await ada.post('/api/connections/webhook', { flavor: 'zoom', url: 'https://integrations.zoom.us/chat/webhooks/incomingwebhook/abc', label: 'Zoom', token: 'zoom-token' })).json.id;
    calls.length = 0;
    expect((await ada.post(`/api/connections/${id}/test`, {})).status).toBe(200);
    const z = calls.find((c) => c.url.startsWith('https://integrations.zoom.us'))!;
    expect(z.url).toContain('format=full');
    expect(z.headers.authorization).toBe('zoom-token');
    expect(z.body.content.head.text).toBe('Test message from Curahold');
  });

  it('a dead webhook is marked so the admin sees it', async () => {
    const id = (await ada.post('/api/connections/webhook', { flavor: 'json', url: 'https://automation.example/gone', label: 'Gone' })).json.id;
    webhookStatus = 404;
    const r = await ada.post(`/api/connections/${id}/test`, {});
    webhookStatus = 200;
    expect(r.json.error).toBe('connection_failed');
    const conn = (await ada.get('/api/connections')).json.connections.find((c: any) => c.id === id);
    expect(conn.status).toBe('error');
    expect(conn.lastError).toContain('404');
    // Pause and remove.
    expect((await ada.patch(`/api/connections/${id}`, { paused: true })).status).toBe(200);
    expect((await ada.del(`/api/connections/${id}`)).status).toBe(200);
  });
});
