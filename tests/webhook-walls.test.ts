// Outgoing webhooks carry only what the person who set them up may see (security audit M4): a private board, another
// department's board, or anything after that person has left stays out, as on the screens and under row security.
import { beforeAll, describe, expect, it } from 'vitest';
import { deliverWebhooks } from '../api/src/lib/webhooks';
import { Client, login, setup, type Env } from './helpers';

let env: Env;
let ada: Client; // administrator: sees every board
let omar: Client; // may manage connections, may not see every board
const sent: { url: string; body: any }[] = [];

beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
  const [ops] = await env.db.system((q) =>
    q.query(`insert into roles (org_id, key, name, perms) values ($1, 'ops_hooks', 'Ops', '{connections.manage}') returning id`, [env.a.orgId]),
  );
  await env.db.system((q) => q.query(`update users set role_id = $2 where org_id = $1 and email = 'omar@demo.example'`, [env.a.orgId, ops.id]));
  omar = await login(env, 'acme', 'omar@demo.example');
  env.fetchHolder.impl = async (url, init) => {
    sent.push({ url, body: JSON.parse(String(init?.body ?? '{}')) });
    return new Response('ok');
  };
  expect((await omar.post('/api/dev/webhooks', { url: 'https://ops.example.com/hook', events: ['task.created', 'comment.created'] })).status).toBe(201);
  expect((await ada.post('/api/dev/webhooks', { url: 'https://admin.example.com/hook', events: ['task.created', 'comment.created'] })).status).toBe(201);
});

const deliver = async () => {
  await env.settle();
  while ((await deliverWebhooks(env.deps, 50)) > 0);
};
const titlesTo = (host: string) => sent.filter((s) => s.url.startsWith(`https://${host}.`) && s.body.event === 'task.created').map((s) => s.body.data.title);

describe('webhooks keep to board visibility', () => {
  it('a task on a private board reaches only the hook of someone who can see it', async () => {
    const board = (await ada.post('/api/boards', { name: 'Ada only', visibility: 'private' })).json.board;
    expect((await omar.get('/api/boards')).json.boards.map((b: any) => b.id)).not.toContain(board.id);
    const task = (await ada.post('/api/tasks', { boardId: board.id, title: 'Private plan' })).json.task;
    await ada.post(`/api/tasks/${task.id}/comments`, { body: 'Private remark' });
    await deliver();
    expect(titlesTo('admin')).toContain('Private plan');
    expect(titlesTo('ops')).not.toContain('Private plan');
    const comments = (host: string) => sent.filter((s) => s.url.startsWith(`https://${host}.`) && s.body.event === 'comment.created').map((s) => s.body.data.body);
    expect(comments('admin')).toContain('Private remark');
    expect(comments('ops')).not.toContain('Private remark');
    // Nothing is left waiting for the hook that was skipped.
    const [pending] = await env.db.system((q) => q.query<{ n: number }>(`select count(*)::int as n from webhook_events where org_id = $1 and state = 'pending'`, [env.a.orgId]));
    expect(pending.n).toBe(0);
  });

  it('a task the creator can see still reaches them', async () => {
    const board = (await ada.post('/api/boards', { name: 'Shared with Omar', visibility: 'private' })).json.board;
    await env.db.system((q) => q.query(`insert into board_members (org_id, board_id, user_id) values ($1, $2, $3)`, [env.a.orgId, board.id, env.a.ids.omar]));
    expect((await omar.get('/api/boards')).json.boards.map((b: any) => b.id)).toContain(board.id);
    await ada.post('/api/tasks', { boardId: board.id, title: 'Open plan' });
    await deliver();
    expect(titlesTo('ops')).toContain('Open plan');
  });

  it('a hook whose creator has left sends nothing', async () => {
    await env.db.system((q) => q.query(`update users set status = 'disabled' where org_id = $1 and email = 'omar@demo.example'`, [env.a.orgId]));
    const board = (await ada.post('/api/boards', { name: 'Shared too', visibility: 'private' })).json.board;
    await env.db.system((q) => q.query(`insert into board_members (org_id, board_id, user_id) values ($1, $2, $3)`, [env.a.orgId, board.id, env.a.ids.omar]));
    await ada.post('/api/tasks', { boardId: board.id, title: 'After leaving' });
    await deliver();
    expect(titlesTo('admin')).toContain('After leaving');
    expect(titlesTo('ops')).not.toContain('After leaving');
  });
});
