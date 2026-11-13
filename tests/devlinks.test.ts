// GitHub and GitLab webhooks link branches, pull requests and commits to tasks by the task's key (CURA-1a2b3c4d),
// record their state and checks, and never reach another company.
import { beforeAll, describe, expect, it } from 'vitest';
import { hmacHex } from '../api/src/lib/crypto';
import { parseGithub, parseGitlab, taskRefs, worstChecks } from '../api/src/lib/devlinks';
import { devKey } from '../shared/src/sync';
import { BASE, Client, login, setup, type Env } from './helpers';

describe('finding a task in a name', () => {
  it('takes CURA- keys and whole ids, any case, once each, and not look-alikes', () => {
    const id = '1a2b3c4d-1111-4222-8333-444455556666';
    expect(taskRefs('feature/CURA-1A2B3C4D-pay', `fixes ${id}`, 'cura-1a2b3c4d again')).toEqual(['1a2b3c4d', id]);
    expect(taskRefs('XCURA-1a2b3c4d', 'CURA-1a2b3c4', 'CURA-1a2b3c4dz', null, '')).toEqual([]);
  });
  it('reads the shapes of both hosts and rolls checks up', () => {
    const gh = parseGithub('push', { ref: 'refs/heads/CURA-1a2b3c4d-x', after: 'abc', repository: { full_name: 'acme/web', html_url: 'https://github.com/acme/web' }, pusher: { name: 'ada' }, commits: [{ id: 'abc', message: 'CURA-1a2b3c4d: fix\n\nlong' }] });
    expect(gh.links.map((l) => [l.kind, l.ref, l.state])).toEqual([['branch', 'CURA-1a2b3c4d-x', 'open'], ['commit', 'abc', null]]);
    expect(parseGithub('push', { ref: 'refs/heads/b', deleted: true, repository: { full_name: 'a/b' } }).links[0].state).toBe('closed');
    expect(parseGitlab({ object_kind: 'pipeline', project: { path_with_namespace: 'g/p' }, object_attributes: { sha: 's', status: 'failed' } }).checks).toEqual([{ provider: 'gitlab', repo: 'g/p', sha: 's', checks: 'failing' }]);
    expect(parseGithub('unknown', {}).links).toEqual([]);
    expect(worstChecks(['passing', 'pending'])).toBe('pending');
    expect(worstChecks(['passing', 'failing', 'pending'])).toBe('failing');
    expect(worstChecks([])).toBe('none');
  });
});

describe('dev links over the webhooks', () => {
  let env: Env;
  let ada: Client;
  let other: Client;
  let taskId: string;
  let key: string;
  let board: string;
  const repo = { full_name: 'acme/web', html_url: 'https://github.com/acme/web' };
  const sign = async (secret: string, raw: string) => `sha256=${await hmacHex(secret, raw)}`;
  const secrets: Record<string, string> = {};
  const hook = async (slug: string, provider: 'github' | 'gitlab', payload: unknown, headers: Record<string, string> = {}, secret = secrets[provider] ?? 'unset') => {
    const raw = JSON.stringify(payload);
    const h: Record<string, string> = { 'content-type': 'application/json', ...headers };
    if (provider === 'github') h['x-hub-signature-256'] = await sign(secret, raw);
    else h['x-gitlab-token'] = secret;
    const res = await env.app.request(`https://${slug}.${BASE}/api/inbound/dev/${provider}`, { method: 'POST', headers: h, body: raw });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  const gh = (event: string, payload: unknown, extra: Record<string, string> = {}) => hook('acme', 'github', payload, { 'x-github-event': event, ...extra });
  const dev = async () => (await ada.get(`/api/tasks/${taskId}/dev`)).json;

  beforeAll(async () => {
    env = await setup();
    ada = await login(env, 'acme', 'ada@demo.example');
    other = await login(env, 'beta', 'ada@demo.example').catch(() => ada);
    board = Object.values(env.a.boards)[0] as string;
    const made = await ada.post('/api/tasks', { boardId: board, title: 'Pay with card' });
    taskId = made.json.task.id;
    key = devKey(taskId);
  });

  it('has a key shaped CURA- and the first 8 hex of the id', () => {
    expect(key).toBe(`CURA-${taskId.replace(/-/g, '').slice(0, 8)}`);
  });

  it('is off until an administrator turns it on, and only they can see the secret', async () => {
    expect((await gh('push', {})).status).toBe(404);
    const lena = await login(env, 'acme', 'lena@demo.example');
    expect((await lena.get('/api/dev-hooks')).status).toBe(403);
    expect((await lena.post('/api/dev-hooks/github')).status).toBe(403);
    expect((await ada.post('/api/dev-hooks/bitbucket')).status).toBe(404);
    const on = await ada.post('/api/dev-hooks/github');
    expect(on.status).toBe(201);
    expect(on.json.hook).toMatchObject({ provider: 'github', enabled: true, url: `https://acme.${BASE}/api/inbound/dev/github` });
    secrets.github = on.json.hook.secret;
    expect(secrets.github).toMatch(/^[0-9a-f]{40}$/);
    secrets.gitlab = (await ada.post('/api/dev-hooks/gitlab')).json.hook.secret;
    const list = (await ada.get('/api/dev-hooks')).json.hooks;
    expect(list.map((h: any) => [h.provider, h.enabled, h.secret])).toEqual([['github', true, secrets.github], ['gitlab', true, secrets.gitlab]]);
  });

  it('refuses a wrong signature, a wrong token and another company’s secret; accepts a ping', async () => {
    expect((await gh('push', { ref: 'refs/heads/x', repository: repo }, {})).status).toBe(200);
    expect((await hook('acme', 'github', {}, { 'x-github-event': 'push' }, 'f'.repeat(40))).status).toBe(401);
    expect((await hook('acme', 'gitlab', {}, {}, 'wrong')).status).toBe(401);
    expect((await hook('beta', 'github', {}, { 'x-github-event': 'push' })).status).toBe(404);
    expect(await gh('ping', { zen: 'hi' })).toMatchObject({ status: 200, json: { pong: true } });
    const bad = await env.app.request(`https://acme.${BASE}/api/inbound/dev/github`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-github-event': 'push', 'x-hub-signature-256': await sign(secrets.github, 'not json') }, body: 'not json' });
    expect(bad.status).toBe(400);
  });

  it('links a branch, its commits and a pull request by the key, and keeps their state and checks', async () => {
    const push = await gh('push', { ref: `refs/heads/feature/${key}-pay`, after: 'c0ffee1', repository: repo, pusher: { name: 'ada' }, commits: [{ id: 'c0ffee1', message: `${key} add card form\n\nbody`, url: 'https://github.com/acme/web/commit/c0ffee1', author: { name: 'Ada' } }, { id: 'c0ffee2', message: 'unrelated' }] });
    expect(push.json).toEqual({ ok: true, linked: 2 });
    const pr = (state: string, merged = false) => ({ action: state, pull_request: { number: 42, title: `Pay with card (${key})`, state, merged, html_url: 'https://github.com/acme/web/pull/42', user: { login: 'ada' }, head: { ref: 'feature/pay', sha: 'c0ffee1' }, body: '' }, repository: repo });
    expect((await gh('pull_request', pr('open'))).json.linked).toBe(1);
    let d = await dev();
    expect(d.key).toBe(key);
    expect(d.links.map((l: any) => [l.kind, l.state])).toEqual([['pr', 'open'], ['branch', 'open'], ['commit', null]]);
    expect(d.summary).toMatchObject({ branches: 1, prs: 1, commits: 1, open: 2, merged: 0, checks: 'none' });
    // Checks arrive by the head commit.
    await gh('check_suite', { check_suite: { head_sha: 'c0ffee1', status: 'completed', conclusion: 'failure' }, repository: repo });
    d = await dev();
    expect(d.links.find((l: any) => l.kind === 'pr').checks).toBe('failing');
    expect(d.summary.checks).toBe('failing');
    await gh('status', { sha: 'c0ffee1', state: 'success', repository: repo });
    expect((await dev()).summary.checks).toBe('passing');
    // Merged; the same pull request, not a second one.
    await gh('pull_request', pr('closed', true));
    d = await dev();
    expect(d.links.filter((l: any) => l.kind === 'pr')).toHaveLength(1);
    expect(d.summary).toMatchObject({ prs: 1, merged: 1, checks: 'none' });
    expect(d.links.find((l: any) => l.kind === 'pr')).toMatchObject({ state: 'merged', title: `Pay with card (${key})`, url: 'https://github.com/acme/web/pull/42', author: 'ada' });
    // The branch is deleted after the merge.
    await gh('delete', { ref: `feature/${key}-pay`, ref_type: 'branch', repository: repo });
    expect((await dev()).links.find((l: any) => l.kind === 'branch').state).toBe('closed');
  });

  it('links GitLab merge requests and pipelines the same way, with its token', async () => {
    const gl = (p: unknown) => hook('acme', 'gitlab', p);
    const project = { path_with_namespace: 'group/sub/app', web_url: 'https://gitlab.com/group/sub/app' };
    expect((await gl({ object_kind: 'merge_request', project, user: { username: 'mert' }, object_attributes: { iid: 7, title: 'Tidy', source_branch: `${key.toLowerCase()}-tidy`, state: 'opened', url: 'https://gitlab.com/group/sub/app/-/merge_requests/7', last_commit: { id: 'beef' } } })).json.linked).toBe(1);
    await gl({ object_kind: 'pipeline', project, object_attributes: { sha: 'beef', status: 'running' } });
    const l = (await dev()).links.find((x: any) => x.provider === 'gitlab');
    expect(l).toMatchObject({ kind: 'pr', repo: 'group/sub/app', ref: '7', state: 'open', checks: 'pending' });
    await gl({ object_kind: 'merge_request', project, object_attributes: { iid: 7, title: 'Tidy', source_branch: `${key}-tidy`, state: 'merged', last_commit: { id: 'beef' } } });
    expect((await dev()).links.find((x: any) => x.provider === 'gitlab').state).toBe('merged');
  });

  it('links nothing it cannot tell: an unknown key, a short prefix', async () => {
    const before = (await dev()).links.length;
    expect((await gh('push', { ref: 'refs/heads/CURA-deadbeef-nothing', after: 'a1', repository: repo })).json.linked).toBe(0);
    expect((await gh('push', { ref: 'refs/heads/CURA-1234567-short', after: 'a2', repository: repo })).json.linked).toBe(0);
    expect((await dev()).links.length).toBe(before);
  });

  it('shows the board a summary per task, and a stranger sees nothing of it', async () => {
    const sum = (await ada.get(`/api/boards/${board}/dev-links`)).json.summaries;
    expect(sum[taskId]).toMatchObject({ prs: 2, branches: 1, commits: 1 });
    expect(Object.keys(sum)).toEqual([taskId]);
    if (other !== ada) {
      expect((await other.get(`/api/tasks/${taskId}/dev`)).status).toBe(404);
      expect((await other.get(`/api/boards/${board}/dev-links`)).status).toBe(404);
    }
  });

  it('unlinks one link, and a rotated secret retires the old one; off means off', async () => {
    const d = await dev();
    const commit = d.links.find((l: any) => l.kind === 'commit');
    expect((await ada.del(`/api/dev-links/${commit.id}`)).status).toBe(200);
    expect((await ada.del(`/api/dev-links/${commit.id}`)).status).toBe(404);
    expect((await dev()).links.some((l: any) => l.kind === 'commit')).toBe(false);
    const old = secrets.github;
    const next = (await ada.post('/api/dev-hooks/github')).json.hook.secret;
    expect(next).not.toBe(old);
    expect((await hook('acme', 'github', {}, { 'x-github-event': 'push' }, old)).status).toBe(401);
    secrets.github = next;
    expect((await gh('ping', {})).status).toBe(200);
    expect((await ada.del('/api/dev-hooks/github')).status).toBe(200);
    expect((await gh('ping', {})).status).toBe(404);
    // Links already made stay.
    expect((await dev()).links.length).toBeGreaterThan(0);
  });
});
