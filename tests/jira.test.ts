// Jira Cloud, two-way: rich text, the adapter against a stub shaped like Jira's own answers (sign-in, token, JQL,
// transitions, sprints), and the whole thing end to end — a Jira project's epics, issues and sprints come over as
// project tasks, a status moved here goes out as a workflow transition, and nothing echoes back.
import { beforeAll, describe, expect, it } from 'vitest';
import { adfToText, textToAdf } from '../api/src/lib/adf';
import { issueRow, issueTypeKey, jira, jiraDefaultSync, jqlTime, pickSprint, transitionTo } from '../api/src/sync/adapters/jira';
import { CRM_ADAPTERS } from '../api/src/sync/adapters';
import { CrmError, type CrmCtx } from '../api/src/sync/adapters/types';
import { columnCategory, stageKey } from '../api/src/sync/engine';
import { pmColumns } from '../shared/src/templates';
import { Client, login, setup, type Env } from './helpers';

type Call = { method: string; url: string; auth: string | null; body: any };
type Route = [RegExp, (call: Call) => unknown];

const BASE = 'https://acme-dev.atlassian.net';
function stub(config: Record<string, any>, routes: Route[], mode: 'basic' | 'oauth' = 'basic') {
  const calls: Call[] = [];
  const ctx: CrmCtx = {
    config: { mode, base: BASE, siteUrl: BASE, projects: ['CURA'], ...config },
    now: () => new Date('2026-11-14T10:00:00Z'),
    token: async () => (mode === 'basic' ? 'Basic dGVzdA==' : 'access-1'),
    refresh: async () => 'access-2',
    fetch: (async (u: string, init: RequestInit = {}) => {
      const call: Call = { method: init.method ?? 'GET', url: String(u), auth: new Headers(init.headers).get('authorization'), body: init.body ? JSON.parse(String(init.body)) : null };
      calls.push(call);
      for (const [re, fn] of routes) {
        if (!re.test(`${call.method} ${call.url.replace(BASE, '')}`)) continue;
        const out = fn(call);
        return out instanceof Response ? out : Response.json(out);
      }
      return new Response('{"errorMessages":["no route"]}', { status: 404 });
    }) as typeof fetch,
  };
  return { ctx, calls };
}

const FIELDS = [
  { id: 'customfield_10016', name: 'Story point estimate', schema: { custom: 'com.atlassian.jira.plugin.system.customfieldtypes:float' } },
  { id: 'customfield_10020', name: 'Sprint', schema: { custom: 'com.pyxis.greenhopper.jira:gh-sprint' } },
  { id: 'customfield_10014', name: 'Epic Link', schema: { custom: 'com.pyxis.greenhopper.jira:gh-epic-link' } },
  { id: 'customfield_10011', name: 'Epic Name', schema: { custom: 'com.pyxis.greenhopper.jira:gh-epic-label' } },
];
const TYPES = [
  { id: '10000', name: 'Epic', hierarchyLevel: 1 },
  { id: '10001', name: 'Story', hierarchyLevel: 0 },
  { id: '10002', name: 'Task', hierarchyLevel: 0 },
  { id: '10003', name: 'Bug', hierarchyLevel: 0 },
  { id: '10004', name: 'Sub-task', hierarchyLevel: -1, subtask: true },
];
const common: Route[] = [
  [/GET \/rest\/api\/3\/field$/, () => FIELDS],
  [/GET \/rest\/api\/3\/issuetype$/, () => TYPES],
  [/GET \/rest\/api\/3\/myself$/, () => ({ accountId: 'acc-ada', timeZone: 'Europe/Istanbul' })],
  [/GET \/rest\/api\/3\/status$/, () => [{ name: 'To Do' }, { name: 'In Progress' }, { name: 'In Review' }, { name: 'Done' }, { name: 'To Do' }]],
];

describe('Jira rich text (ADF)', () => {
  it('reads paragraphs, marks, lists, code and links as light markdown', () => {
    const doc = {
      type: 'doc',
      version: 1,
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Goal' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Pay ' }, { type: 'text', text: 'fast', marks: [{ type: 'strong' }] }, { type: 'text', text: ' with ' }, { type: 'text', text: 'docs', marks: [{ type: 'link', attrs: { href: 'https://x.example/d' } }] }, { type: 'hardBreak' }, { type: 'text', text: 'second line' }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }, { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'nested' }] }] }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }] }] },
        { type: 'codeBlock', attrs: { language: 'ts' }, content: [{ type: 'text', text: 'const a = 1;' }] },
        { type: 'panel', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'careful' }] }] },
        { type: 'paragraph', content: [{ type: 'mention', attrs: { text: '@Mert' } }, { type: 'text', text: ' see ' }, { type: 'inlineCard', attrs: { url: 'https://x.example/c' } }] },
      ],
    };
    expect(adfToText(doc)).toBe(['## Goal', 'Pay **fast** with [docs](https://x.example/d)\nsecond line', '- one\n  1. nested\n- two', '```ts\nconst a = 1;\n```', '> careful', '@Mert see https://x.example/c'].join('\n\n'));
    expect(adfToText(null)).toBe('');
    expect(adfToText('already text')).toBe('already text');
  });

  it('writes light markdown back as ADF, and reading that again gives the same text', () => {
    const md = ['# Title', 'A **bold** and *slanted* and `code` and ~~gone~~ [link](https://x.example)\nline two', '- a\n- b\n  - deep', '3. three\n4. four', '> quoted', '```\nraw **not bold**\n```', '---', 'end'].join('\n\n');
    const adf = textToAdf(md);
    expect(adf).toMatchObject({ type: 'doc', version: 1 });
    expect(adf.content.map((n) => n.type)).toEqual(['heading', 'paragraph', 'bulletList', 'orderedList', 'blockquote', 'codeBlock', 'rule', 'paragraph']);
    expect(adf.content[3].attrs).toEqual({ order: 3 });
    expect(adf.content[5].content![0].text).toBe('raw **not bold**');
    expect(adfToText(adf)).toBe(md);
    expect(textToAdf('').content).toEqual([]);
  });
});

describe('Jira adapter: reading', () => {
  it('knows issue types, the sprint an issue is "in" and what JQL wants for a date', () => {
    expect([issueTypeKey('Epic'), issueTypeKey('Épopée', false, 1), issueTypeKey('User Story'), issueTypeKey('Bug'), issueTypeKey('Sub-task', true), issueTypeKey('Spike'), issueTypeKey('Improvement')]).toEqual(['epic', 'epic', 'story', 'bug', 'subtask', 'spike', 'task']);
    expect(pickSprint([{ id: 1, state: 'closed', completeDate: '2026-10-01' }, { id: 3, state: 'future' }, { id: 2, state: 'active' }])).toBe('2');
    expect(pickSprint([{ id: 5, state: 'future' }, { id: 4, state: 'future' }])).toBe('4');
    expect(pickSprint([{ id: 1, state: 'closed', completeDate: '2026-09-01' }, { id: 2, state: 'closed', completeDate: '2026-10-01' }])).toBe('2');
    expect(pickSprint(null)).toBeNull();
    // 10:00 UTC is 13:00 in Istanbul; one minute back.
    expect(jqlTime('2026-11-14T10:00:00.000Z', 'Europe/Istanbul')).toBe('2026/11/14 12:59');
    expect(jqlTime('2026-11-14T00:00:30.000Z', 'America/New_York')).toBe('2026/11/13 18:59');
  });

  it('asks for what changed since the last run in the user’s time zone, and pages with the token', async () => {
    const issue = (n: number) => ({ id: String(2000 + n), key: `CURA-${n}`, fields: { summary: `Item ${n}`, status: { name: 'To Do', statusCategory: { key: 'new' } }, issuetype: { name: 'Story' }, updated: '2026-11-14T09:30:00.000+0300' } });
    const { ctx, calls } = stub({}, [
      ...common,
      [/POST \/rest\/api\/3\/search\/jql$/, (c) => (c.body.nextPageToken ? { issues: [issue(2)], isLast: true } : { issues: [issue(1)], nextPageToken: 'tok-2', isLast: false })],
    ]);
    const fields = await jira.fields(ctx, 'issues');
    const first = await jira.list(ctx, 'issues', { since: '2026-11-14T10:00:00.000Z', cursor: null, fields });
    const search = calls.find((c) => c.url.endsWith('/search/jql'))!;
    expect(search.body.jql).toBe('project in ("CURA") AND issuetype not in (10000) AND updated >= "2026/11/14 12:59" ORDER BY updated ASC, id ASC');
    expect(search.body.fields).toEqual(expect.arrayContaining(['summary', 'description', 'parent', 'customfield_10016', 'customfield_10020', 'customfield_10014']));
    expect(first.next).toBe('tok-2');
    expect(first.rows[0]).toMatchObject({ id: '2001', modifiedAt: '2026-11-14T06:30:00.000Z' });
    const second = await jira.list(ctx, 'issues', { since: null, cursor: 'tok-2', fields });
    expect(second.next).toBeNull();
    expect(calls.filter((c) => c.url.endsWith('/search/jql')).at(-1)!.body).toMatchObject({ nextPageToken: 'tok-2' });
    expect(calls.filter((c) => c.url.endsWith('/search/jql')).at(-1)!.body.jql).not.toContain('updated >=');
    await jira.list(ctx, 'epics', { since: null, cursor: null, fields });
    expect(calls.filter((c) => c.url.endsWith('/search/jql')).at(-1)!.body.jql).toContain('issuetype in (10000)');
    // The site's facts (fields, issue types, time zone) are asked for once.
    expect(calls.filter((c) => c.url.endsWith('/rest/api/3/field'))).toHaveLength(1);
    const none = stub({ projects: [] }, common);
    await expect(jira.list(none.ctx, 'issues', { since: null, cursor: null, fields: [] })).rejects.toThrow(/projects/);
  });

  it('maps an issue: epic by parent or by Epic Link, points, sprint, ADF description, status category', async () => {
    const { ctx } = stub({}, common);
    const facts = { storyPoints: 'customfield_10016', sprint: 'customfield_10020', epicLink: 'customfield_10014', epicName: null, epicTypes: ['10000'], timeZone: 'UTC', at: 0 };
    const row = issueRow(
      ctx,
      {
        id: '77',
        key: 'CURA-7',
        fields: {
          summary: ' Pay with card ',
          description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Details' }] }] },
          status: { name: 'In Review', statusCategory: { key: 'indeterminate' } },
          issuetype: { name: 'Story' },
          assignee: { accountId: 'acc-mert' },
          duedate: '2026-12-01',
          customfield_10016: 5,
          customfield_10020: [{ id: 9, state: 'closed' }, { id: 10, state: 'active' }],
          parent: { id: '1001', key: 'CURA-1', fields: { issuetype: { name: 'Epic', hierarchyLevel: 1 } } },
          updated: '2026-11-14T10:00:00.000+0000',
        },
      },
      facts,
    );
    expect(row.values).toMatchObject({ id: '77', key: 'CURA-7', summary: 'Pay with card', description: 'Details', status: 'In Review', __statusCategory: 'indeterminate', issuetype: 'story', assignee: 'acc-mert', duedate: '2026-12-01', story_points: 5, epic: '1001', sprint: '10', link: `${BASE}/browse/CURA-7` });
    // A subtask's parent is a story, not an epic; the older "Epic Link" gives a key that is resolved to an id.
    const sub = issueRow(ctx, { id: '78', key: 'CURA-8', fields: { summary: 'x', issuetype: { name: 'Sub-task', subtask: true }, parent: { id: '77', key: 'CURA-7', fields: { issuetype: { name: 'Story' } } } } }, facts);
    expect(sub.values).toMatchObject({ epic: null, issuetype: 'subtask' });
    const legacy = issueRow(ctx, { id: '79', key: 'CURA-9', fields: { summary: 'y', issuetype: { name: 'Task' }, customfield_10014: 'CURA-1' } }, facts, new Map([['CURA-1', '1001']]));
    expect(legacy.values.epic).toBe('1001');
  });

  it('reads sprints from the scrum boards of the projects, skipping boards without sprints', async () => {
    const { ctx, calls } = stub({}, [
      [/GET \/rest\/agile\/1\.0\/board\?projectKeyOrId=CURA/, () => ({ values: [{ id: 7 }, { id: 8 }] })],
      [/GET \/rest\/agile\/1\.0\/board\/7\/sprint\?startAt=0/, () => ({ isLast: true, values: [{ id: 101, name: 'Sprint 1', state: 'active', startDate: '2026-11-09T06:00:00.000Z', endDate: '2026-11-23T06:00:00.000Z', goal: 'Ship it' }] })],
      [/GET \/rest\/agile\/1\.0\/board\/8\/sprint/, () => new Response('{"errorMessages":["The board does not support sprints"]}', { status: 400 })],
    ]);
    const first = await jira.list(ctx, 'sprints', { since: null, cursor: null, fields: [] });
    expect(first.rows).toEqual([{ id: '101', modifiedAt: null, values: { id: '101', name: 'Sprint 1', goal: 'Ship it', state: 'active', startDate: '2026-11-09T06:00:00.000Z', endDate: '2026-11-23T06:00:00.000Z', completeDate: null } }]);
    expect(first.next).toBe('1:0');
    expect(await jira.list(ctx, 'sprints', { since: null, cursor: first.next, fields: [] })).toEqual({ rows: [], next: null });
    expect(calls.length).toBeGreaterThan(2);
  });
});

describe('Jira adapter: writing', () => {
  const transitions = {
    transitions: [
      { id: '11', to: { name: 'In Progress', statusCategory: { key: 'indeterminate' } } },
      { id: '21', to: { name: 'In Review', statusCategory: { key: 'indeterminate' } } },
      { id: '31', to: { name: 'Done', statusCategory: { key: 'done' } } },
    ],
  };
  const issueNow = (name: string, key: string) => ({ fields: { status: { name, statusCategory: { key } } } });

  it('moves status through a transition, never a field write: by name, else by kind of status, else nothing', async () => {
    const t1 = stub({}, [[/GET \/rest\/api\/3\/issue\/5\?fields=status/, () => issueNow('To Do', 'new')], [/GET .*\/transitions$/, () => transitions], [/POST .*\/transitions$/, () => null]]);
    await transitionTo(t1.ctx, '5', { name: 'Done', category: 'done' });
    expect(t1.calls.at(-1)).toMatchObject({ method: 'POST', body: { transition: { id: '31' } } });
    // "Code review" is no status there; of the in-progress kind, "In Review" shares a word with it.
    await transitionTo(t1.ctx, '5', { name: 'Code review', category: 'indeterminate' });
    expect(t1.calls.at(-1)!.body).toEqual({ transition: { id: '21' } });
    // Already in the wanted status, or already of the wanted kind with no status by that name: no call.
    const t2 = stub({}, [[/GET \/rest\/api\/3\/issue\/5\?fields=status/, () => issueNow('In Review', 'indeterminate')], [/GET .*\/transitions$/, () => transitions]]);
    await transitionTo(t2.ctx, '5', { name: 'In review', category: 'indeterminate' });
    await transitionTo(t2.ctx, '5', { name: 'QA', category: 'indeterminate' });
    expect(t2.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    await expect(transitionTo(t2.ctx, '5', { name: 'Shipped', category: 'new' })).rejects.toThrow(/no transition from "In Review" to "Shipped"/);
    // A plain name works too.
    await transitionTo(t1.ctx, '5', 'In Progress');
    expect(t1.calls.at(-1)!.body).toEqual({ transition: { id: '11' } });
  });

  it('updates the fields it can write (ADF description, accountId, points, epic as parent), moves sprints, then transitions', async () => {
    const { ctx, calls } = stub({}, [
      ...common,
      [/PUT \/rest\/api\/3\/issue\/5$/, () => null],
      [/GET \/rest\/api\/3\/issue\/5\?fields=status/, () => issueNow('To Do', 'new')],
      [/GET .*\/transitions$/, () => transitions],
      [/POST .*\/transitions$/, () => null],
      [/POST \/rest\/agile\/1\.0\/sprint\/101\/issue$/, () => null],
      [/POST \/rest\/agile\/1\.0\/backlog\/issue$/, () => null],
    ]);
    await jira.update(ctx, 'issues', '5', { summary: ' New title ', description: '**hi**', assignee: 'acc-mert', duedate: '2026-12-01T00:00:00Z', story_points: 8, epic: '1001', status: { name: 'Done', category: 'done' }, sprint: '101' }, []);
    const writes = calls.filter((c) => c.method !== 'GET').map((c) => [c.method, c.url.replace(BASE, ''), c.body]);
    expect(writes[0][0]).toBe('PUT');
    expect((writes[0][2] as any).fields).toMatchObject({ summary: 'New title', assignee: { accountId: 'acc-mert' }, duedate: '2026-12-01', customfield_10016: 8 });
    expect((writes[0][2] as any).fields.description).toMatchObject({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi', marks: [{ type: 'strong' }] }] }] });
    expect(writes.slice(1)).toEqual([
      ['PUT', '/rest/api/3/issue/5', { fields: { parent: { id: '1001' } } }],
      ['POST', '/rest/api/3/issue/5/transitions', { transition: { id: '31' } }],
      ['POST', '/rest/agile/1.0/sprint/101/issue', { issues: ['5'] }],
    ]);
    calls.length = 0;
    await jira.update(ctx, 'issues', '5', { sprint: null, assignee: null }, []);
    expect(calls.filter((c) => c.method !== 'GET').map((c) => [c.url.replace(BASE, ''), c.body])).toEqual([
      ['/rest/api/3/issue/5', { fields: { assignee: null } }],
      ['/rest/agile/1.0/backlog/issue', { issues: ['5'] }],
    ]);
  });

  it('sets an epic through "Epic Link" when the project has no parent field', async () => {
    let first = true;
    const { ctx, calls } = stub({}, [
      ...common,
      [/PUT \/rest\/api\/3\/issue\/5$/, () => (first && !(first = false) ? new Response('{"errors":{"parent":"Field parent cannot be set"}}', { status: 400 }) : null)],
      [/GET \/rest\/api\/3\/issue\/1001\?fields=summary/, () => ({ id: '1001', key: 'CURA-1' })],
    ]);
    await jira.update(ctx, 'issues', '5', { epic: '1001' }, []);
    expect(calls.filter((c) => c.method === 'PUT').map((c) => c.body)).toEqual([{ fields: { parent: { id: '1001' } } }, { fields: { customfield_10014: 'CURA-1' } }]);
  });

  it('creates an epic or an issue with the project’s own issue type, then moves it into place', async () => {
    const project = { issueTypes: TYPES };
    const { ctx, calls } = stub({}, [
      ...common,
      [/GET \/rest\/api\/3\/project\/CURA$/, () => project],
      [/POST \/rest\/api\/3\/issue$/, () => ({ id: '900', key: 'CURA-90' })],
      [/GET \/rest\/api\/3\/issue\/900\?fields=status/, () => issueNow('To Do', 'new')],
      [/GET \/rest\/api\/3\/issue\/900\/transitions$/, () => transitions],
      [/POST \/rest\/api\/3\/issue\/900\/transitions$/, () => null],
      [/POST \/rest\/agile\/1\.0\/sprint\/101\/issue$/, () => null],
    ]);
    expect(await jira.create(ctx, 'epics', { summary: 'Checkout', description: 'why', status: { name: 'In Progress', category: 'indeterminate' } }, [])).toBe('900');
    const epic = calls.find((c) => c.method === 'POST' && c.url.endsWith('/rest/api/3/issue'))!.body.fields;
    expect(epic).toMatchObject({ project: { key: 'CURA' }, issuetype: { id: '10000' }, summary: 'Checkout', customfield_10011: 'Checkout' });
    calls.length = 0;
    await jira.create(ctx, 'issues', { summary: 'Pay', issuetype: 'bug', epic: '1001', story_points: 3, sprint: '101' }, []);
    const bug = calls.find((c) => c.method === 'POST' && c.url.endsWith('/rest/api/3/issue'))!.body.fields;
    expect(bug).toMatchObject({ issuetype: { id: '10003' }, parent: { id: '1001' }, customfield_10016: 3 });
    expect(calls.at(-1)!.url).toContain('/sprint/101/issue');
    // Curahold's "spike" has no twin here: a plain task.
    calls.length = 0;
    await jira.create(ctx, 'issues', { summary: 'Look into it', issuetype: 'spike' }, []);
    expect(calls.find((c) => c.method === 'POST')!.body.fields.issuetype).toEqual({ id: '10002' });
  });

  it('updates and creates sprints; a started sprint needs its dates; a state it is already in is not sent', async () => {
    const { ctx, calls } = stub({ jiraBoardId: 7 }, [
      [/GET \/rest\/agile\/1\.0\/sprint\/101$/, () => ({ id: 101, state: 'future', startDate: '2026-11-09T06:00:00.000Z' })],
      [/POST \/rest\/agile\/1\.0\/sprint\/101$/, () => ({})],
      [/POST \/rest\/agile\/1\.0\/sprint$/, () => ({ id: 103 })],
    ]);
    await jira.update(ctx, 'sprints', '101', { name: 'Sprint One', goal: 'Ship', state: 'active', endDate: '2026-11-23T00:00:00Z' }, []);
    expect(calls.at(-1)!.body).toMatchObject({ name: 'Sprint One', goal: 'Ship', state: 'active', startDate: '2026-11-09T06:00:00.000Z', endDate: '2026-11-23T00:00:00.000Z' });
    calls.length = 0;
    await jira.update(ctx, 'sprints', '101', { state: 'future' }, []);
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    expect(await jira.create(ctx, 'sprints', { name: 'Sprint 3', goal: 'g', startDate: '2026-12-01' }, [])).toBe('103');
    expect(calls.at(-1)!.body).toMatchObject({ name: 'Sprint 3', originBoardId: 7, goal: 'g', startDate: '2026-12-01T09:00:00.000Z' });
  });

  it('renews an expired token once; basic auth has nothing to renew; limits and refusals say so', async () => {
    let n = 0;
    const o = stub({}, [[/GET \/rest\/api\/3\/myself$/, (c) => (c.auth === 'Bearer access-1' && !n++ ? new Response('{}', { status: 401 }) : { accountId: 'x' })]], 'oauth');
    await jira.users({ ...o.ctx, config: { ...o.ctx.config, projects: [] } });
    const me = await (await import('../api/src/sync/adapters/jira')).jx(o.ctx, '/rest/api/3/myself');
    expect(me).toEqual({ accountId: 'x' });
    expect(o.calls.map((c) => c.auth)).toEqual(['Bearer access-1', 'Bearer access-2']);
    const b = stub({}, [[/myself/, () => new Response('{"message":"Unauthorized"}', { status: 401 })]]);
    await expect((await import('../api/src/sync/adapters/jira')).jx(b.ctx, '/rest/api/3/myself')).rejects.toMatchObject({ status: 401, auth: true });
    const slow = stub({}, [[/myself/, () => new Response('{"errorMessages":["Rate limit"]}', { status: 429, headers: { 'retry-after': '9' } })]]);
    await expect((await import('../api/src/sync/adapters/jira')).jx(slow.ctx, '/rest/api/3/myself')).rejects.toMatchObject({ status: 429, retryAfter: 9, message: 'Rate limit' });
    await expect(jira.refresh({ fetch: fetch, now: () => new Date(), config: { mode: 'basic' } }, { accessToken: 'Basic x' }, { clientId: '', clientSecret: '' })).rejects.toMatchObject({ auth: true });
  });
});

describe('Jira sign-in', () => {
  it('sends the administrator to Atlassian with offline access, and exchanges the code for a site', async () => {
    const url = new URL(jira.oauth!.authorizeUrl({ clientId: 'cid', clientSecret: 's' }, 'https://app.curahold.test/api/connect/callback', 'state-1', {}));
    expect(url.origin + url.pathname).toBe('https://auth.atlassian.com/authorize');
    expect(url.searchParams.get('audience')).toBe('api.atlassian.com');
    expect(url.searchParams.get('scope')).toBe('read:jira-work write:jira-work read:jira-user offline_access');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBe('state-1');
    const seen: { url: string; body?: any; auth?: string | null }[] = [];
    const fetcher = (async (u: string, init: RequestInit = {}) => {
      seen.push({ url: String(u), body: init.body ? JSON.parse(String(init.body)) : undefined, auth: new Headers(init.headers).get('authorization') });
      if (String(u).endsWith('/oauth/token')) return Response.json({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 });
      return Response.json([{ id: 'cloud-9', url: 'https://acme-dev.atlassian.net', name: 'acme-dev', scopes: ['read:jira-work'] }]);
    }) as typeof fetch;
    const made = await jira.oauth!.exchange(fetcher, { clientId: 'cid', clientSecret: 'sec' }, 'the-code', 'https://app.curahold.test/api/connect/callback', {}, new Date('2026-11-14T10:00:00Z'));
    expect(seen[0]).toMatchObject({ url: 'https://auth.atlassian.com/oauth/token', body: { grant_type: 'authorization_code', client_id: 'cid', client_secret: 'sec', code: 'the-code' } });
    expect(seen[1]).toMatchObject({ url: 'https://api.atlassian.com/oauth/token/accessible-resources', auth: 'Bearer at' });
    expect(made).toMatchObject({
      secret: { accessToken: 'at', refreshToken: 'rt', expiresAt: Date.parse('2026-11-14T11:00:00Z') },
      config: { mode: 'oauth', cloudId: 'cloud-9', siteUrl: 'https://acme-dev.atlassian.net', base: 'https://api.atlassian.com/ex/jira/cloud-9' },
      label: 'acme-dev.atlassian.net',
      instanceId: 'cloud-9',
    });
  });

  it('renews with the rotating refresh token and keeps the new one', async () => {
    const fetcher = (async (_u: string, init: RequestInit = {}) => {
      expect(JSON.parse(String(init.body))).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'rt-1', client_id: 'cid' });
      return Response.json({ access_token: 'at-2', refresh_token: 'rt-2', expires_in: 3600 });
    }) as typeof fetch;
    const next = await jira.refresh({ fetch: fetcher, now: () => new Date('2026-11-14T10:00:00Z'), config: { mode: 'oauth' } }, { refreshToken: 'rt-1' }, { clientId: 'cid', clientSecret: 's' });
    expect(next).toEqual({ accessToken: 'at-2', refreshToken: 'rt-2', expiresAt: Date.parse('2026-11-14T11:00:00Z') });
  });

  it('falls back to an API token: email + token + site, one connection per site whichever way it is reached', async () => {
    const fetcher = (async (u: string, init: RequestInit = {}) => {
      if (String(u) === 'https://acme-dev.atlassian.net/rest/api/3/myself') {
        expect(new Headers(init.headers).get('authorization')).toBe(`Basic ${btoa('ada@acme.example:tok-123')}`);
        return Response.json({ accountId: 'acc-ada' });
      }
      if (String(u) === 'https://acme-dev.atlassian.net/_edge/tenant_info') return Response.json({ cloudId: 'cloud-9' });
      return new Response('?', { status: 404 });
    }) as typeof fetch;
    const made = await jira.keyed!.connect(fetcher, { site: 'https://Acme-Dev.atlassian.net/', email: 'ada@acme.example', token: 'tok-123' }, new Date());
    expect(made).toMatchObject({ secret: { accessToken: `Basic ${btoa('ada@acme.example:tok-123')}` }, config: { mode: 'basic', site: 'acme-dev', email: 'ada@acme.example', base: 'https://acme-dev.atlassian.net' }, label: 'acme-dev.atlassian.net', instanceId: 'cloud-9' });
    expect(JSON.stringify(made.config)).not.toContain('tok-123');
    await expect(jira.keyed!.connect(fetcher, { site: 'not a site!', email: 'a@b.c', token: 'x' }, new Date())).rejects.toThrow(CrmError);
    const refused = (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch;
    await expect(jira.keyed!.connect(refused, { site: 'acme-dev', email: 'a@b.c', token: 'x' }, new Date())).rejects.toMatchObject({ status: 401, auth: true });
  });

  it('is registered next to the others, two-way; the sign-in is only offered where it is registered', () => {
    expect(CRM_ADAPTERS.jira).toBe(jira);
    expect(jira.readOnly).toBeFalsy();
    expect(jira.tabular).toBe(false);
    expect(jira.oauth && jira.keyed).toBeTruthy();
  });
});

describe('stages: Jira statuses and board columns', () => {
  const cols = pmColumns('en');
  const board = { columns: cols };
  it('matches by name, keeps a column of the same kind, else takes the first of that kind', () => {
    expect(cols.map((c) => columnCategory(cols, c))).toEqual(['new', 'new', 'indeterminate', 'indeterminate', 'indeterminate', 'indeterminate', 'done', 'indeterminate', 'indeterminate']);
    expect(stageKey(board, 'backlog', { name: 'In Progress', category: 'indeterminate' })).toBe('in_progress');
    expect(stageKey(board, 'backlog', { name: 'Done', category: 'done' })).toBe('done');
    expect(stageKey(board, null, { name: 'To Do', category: 'new' })).toBe('backlog');
    // "In Review" is no column; the task is already somewhere "in progress"-like: it stays.
    expect(stageKey(board, 'qa', { name: 'In Review', category: 'indeterminate' })).toBe('qa');
    expect(stageKey(board, 'backlog', { name: 'In Review', category: 'indeterminate' })).toBe('in_progress');
    expect(stageKey(board, 'done', { name: 'Reopened', category: 'new' })).toBe('backlog');
    expect(stageKey(null, 'x', { name: 'Done', category: 'done' })).toBeNull();
  });
});

describe('Jira end to end', () => {
  let env: Env;
  let ada: Client;
  let connId: string;
  let board: string;
  const calls: { method: string; url: string; body: any }[] = [];
  const at = (iso: string) => iso;
  const status = (name: string) => ({ name, statusCategory: { key: name === 'Done' ? 'done' : name === 'To Do' ? 'new' : 'indeterminate' } });
  const store = {
    issues: [
      { id: '1001', key: 'CURA-1', fields: { summary: 'Checkout redesign', description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Make paying easy' }] }] }, status: status('In Progress'), issuetype: { name: 'Epic', hierarchyLevel: 1 }, assignee: { accountId: 'acc-mert' }, duedate: null, created: at('2026-11-01T09:00:00.000Z'), updated: at('2026-11-10T09:00:00.000Z'), parent: null, customfield_10016: null, customfield_10020: null } },
      { id: '1002', key: 'CURA-2', fields: { summary: 'Pay with card', description: null, status: status('To Do'), issuetype: { name: 'Story' }, assignee: null, duedate: '2026-12-05', created: at('2026-11-02T09:00:00.000Z'), updated: at('2026-11-10T09:00:00.000Z'), parent: { id: '1001', key: 'CURA-1', fields: { issuetype: { name: 'Epic', hierarchyLevel: 1 } } }, customfield_10016: 5, customfield_10020: [{ id: 101, name: 'Sprint 1', state: 'active' }] } },
      { id: '1003', key: 'CURA-3', fields: { summary: 'Fix totals', description: null, status: status('Done'), issuetype: { name: 'Bug' }, assignee: null, duedate: null, created: at('2026-11-03T09:00:00.000Z'), updated: at('2026-11-10T09:00:00.000Z'), parent: null, customfield_10016: 2, customfield_10020: [{ id: 100, name: 'Sprint 0', state: 'closed', completeDate: '2026-11-08T00:00:00.000Z' }] } },
    ] as any[],
    sprints: [
      { id: 100, name: 'Sprint 0', state: 'closed', startDate: '2026-10-26T06:00:00.000Z', endDate: '2026-11-08T06:00:00.000Z', completeDate: '2026-11-08T06:00:00.000Z', goal: '' },
      { id: 101, name: 'Sprint 1', state: 'active', startDate: '2026-11-09T06:00:00.000Z', endDate: '2026-11-23T06:00:00.000Z', goal: 'Ship checkout' },
      { id: 102, name: 'Sprint 2', state: 'future', startDate: null, endDate: null, goal: '' },
    ] as any[],
  };
  const transitions = [
    { id: '11', to: status('In Progress') },
    { id: '21', to: status('In Review') },
    { id: '31', to: status('Done') },
  ];
  const jiraStub = async (url: string, init?: RequestInit): Promise<Response> => {
    if (!url.startsWith(BASE)) return new Response('not here', { status: 404 });
    const path = url.slice(BASE.length);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const json = (v: unknown, status = 200) => Response.json(v, { status });
    if (method !== 'GET' && path !== '/rest/api/3/search/jql') calls.push({ method, url: path, body });
    if (path === '/_edge/tenant_info') return json({ cloudId: 'cloud-9' });
    if (path === '/rest/api/3/myself') return json({ accountId: 'acc-ada', timeZone: 'Europe/Istanbul' });
    if (path === '/rest/api/3/field') return json(FIELDS);
    if (path === '/rest/api/3/issuetype') return json(TYPES);
    if (path === '/rest/api/3/status') return json([{ name: 'To Do' }, { name: 'In Progress' }, { name: 'In Review' }, { name: 'Done' }]);
    if (path.startsWith('/rest/api/3/project/search')) return json({ values: [{ key: 'CURA', name: 'Curahold' }, { key: 'OPS', name: 'Operations' }], isLast: true });
    if (path === '/rest/api/3/project/CURA') return json({ issueTypes: TYPES });
    if (path.startsWith('/rest/api/3/user/assignable/multiProjectSearch')) return json([{ accountId: 'acc-mert', displayName: 'Mert', emailAddress: 'mert@demo.example', accountType: 'atlassian', active: true }, { accountId: 'acc-ada', displayName: 'Ada', emailAddress: 'ada@demo.example', accountType: 'atlassian', active: true }]);
    if (path.startsWith('/rest/agile/1.0/board?')) return json({ values: [{ id: 7 }] });
    if (/^\/rest\/agile\/1\.0\/board\/7\/sprint/.test(path)) return json({ isLast: true, values: store.sprints });
    if (path === '/rest/api/3/search/jql') {
      const jql: string = body.jql;
      const epics = /issuetype in \(10000\)/.test(jql);
      const m = /updated >= "(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})"/.exec(jql);
      const from = m ? Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+03:00`) : 0;
      return json({ issues: store.issues.filter((i) => (i.fields.issuetype.hierarchyLevel === 1) === epics && Date.parse(i.fields.updated) >= from), isLast: true });
    }
    let m = /^\/rest\/api\/3\/issue\/(\d+)\?fields=status$/.exec(path);
    if (m) return json({ fields: { status: store.issues.find((i) => i.id === m![1])!.fields.status } });
    m = /^\/rest\/api\/3\/issue\/(\d+)\/transitions$/.exec(path);
    if (m && method === 'GET') return json({ transitions });
    if (m && method === 'POST') {
      const to = transitions.find((t) => t.id === body.transition.id)!.to;
      const issue = store.issues.find((i) => i.id === m![1])!;
      issue.fields.status = to;
      issue.fields.updated = env.deps.now().toISOString();
      return new Response(null, { status: 204 });
    }
    m = /^\/rest\/api\/3\/issue\/(\d+)$/.exec(path);
    if (m && method === 'PUT') {
      const issue = store.issues.find((i) => i.id === m![1])!;
      Object.assign(issue.fields, body.fields);
      issue.fields.updated = env.deps.now().toISOString();
      return new Response(null, { status: 204 });
    }
    if (path === '/rest/api/3/issue' && method === 'POST') {
      const id = String(2000 + store.issues.length);
      const type = TYPES.find((t) => t.id === body.fields.issuetype.id)!;
      store.issues.push({ id, key: `CURA-${id}`, fields: { ...body.fields, description: body.fields.description ?? null, status: status('To Do'), issuetype: type, created: env.deps.now().toISOString(), updated: env.deps.now().toISOString() } });
      return json({ id, key: `CURA-${id}` }, 201);
    }
    m = /^\/rest\/agile\/1\.0\/sprint\/(\d+)\/issue$/.exec(path);
    if (m && method === 'POST') {
      const sp = store.sprints.find((s) => String(s.id) === m![1])!;
      for (const k of body.issues) {
        const issue = store.issues.find((i) => i.id === k)!;
        issue.fields.customfield_10020 = [sp];
        issue.fields.updated = env.deps.now().toISOString();
      }
      return new Response(null, { status: 204 });
    }
    if (path === '/rest/agile/1.0/sprint' && method === 'POST') {
      const sp = { id: 110 + store.sprints.length, name: body.name, state: 'future', startDate: body.startDate ?? null, endDate: body.endDate ?? null, goal: body.goal ?? '' };
      store.sprints.push(sp);
      return json(sp, 201);
    }
    m = /^\/rest\/agile\/1\.0\/sprint\/(\d+)$/.exec(path);
    if (m && method === 'POST') {
      Object.assign(store.sprints.find((s) => String(s.id) === m![1])!, body);
      return json({});
    }
    return json({ errorMessages: [`no route ${method} ${path}`] }, 404);
  };

  const tasks = async () => (await ada.get(`/api/boards/${board}/tasks`)).json.tasks as any[];
  const sprints = async () => (await ada.get(`/api/boards/${board}/sprints`)).json.sprints as any[];
  const runSync = async () => (await ada.post(`/api/connections/${connId}/sync/run`, {})).json.run;
  const pending = async () => env.db.system((q) => q.query<{ n: number }>('select count(*)::int as n from sync_changes where connection_id = $1', [connId])).then((r) => r[0].n);

  beforeAll(async () => {
    env = await setup();
    ada = await login(env, 'acme', 'ada@demo.example');
    env.fetchHolder.impl = jiraStub;
    const b = await ada.post('/api/boards', { name: 'Product', visibility: 'org', columns: pmColumns('en') });
    expect(b.status).toBe(201);
    board = b.json.board.id;
  });

  it('is offered with the API token on every server (sign-in only where registered)', async () => {
    const p = (await ada.get('/api/connections')).json.providers.find((x: any) => x.id === 'jira');
    expect(p).toMatchObject({ kind: 'source', twoWay: true, available: true, setup: 'key' });
  });

  it('connects with an API token, lists projects, and refuses a mapping to a board that is not there', async () => {
    const made = await ada.post('/api/connections/key', { provider: 'jira', values: { site: 'acme-dev', email: 'ada@acme.example', token: 'tok-123' } });
    expect(made.status, JSON.stringify(made.json)).toBe(201);
    connId = made.json.id;
    const [row] = await env.db.system((q) => q.query('select config::text as config, secret::text as secret from connections where id = $1', [connId]));
    expect(`${row.config} ${row.secret}`).not.toContain('tok-123');
    const d = (await ada.get(`/api/connections/${connId}/sync`)).json;
    expect(d.connection).toMatchObject({ provider: 'jira', label: 'acme-dev.atlassian.net', readOnly: false, reconnect: 'key', mode: 'basic', prefill: { site: 'acme-dev', email: 'ada@acme.example' } });
    const choose = (await ada.get(`/api/connections/${connId}/jira`)).json;
    expect(choose.projects).toEqual([{ key: 'CURA', name: 'Curahold' }, { key: 'OPS', name: 'Operations' }]);
    expect((await ada.put(`/api/connections/${connId}/jira`, { projects: ['CURA'], boardId: '00000000-0000-4000-8000-000000000000' })).status).toBe(400);
    expect((await ada.put(`/api/connections/${connId}/jira`, { projects: [], boardId: board })).status).toBe(400);
    const lena = await login(env, 'acme', 'lena@demo.example');
    expect((await lena.get(`/api/connections/${connId}/jira`)).status).toBe(403);
    // The same site again renews the key instead of adding a second connection.
    const again = await ada.post('/api/connections/key', { provider: 'jira', values: { site: 'acme-dev', email: 'ada@acme.example', token: 'tok-456' } });
    expect(again.json.id).toBe(connId);
  });

  it('first run brings epics, issues and sprints over as tasks on the board', async () => {
    const saved = await ada.put(`/api/connections/${connId}/jira`, { projects: ['cura'], boardId: board });
    expect(saved.status, JSON.stringify(saved.json)).toBe(200);
    expect(saved.json).toMatchObject({ projects: ['CURA'], boards: 1 });
    const run = (await ada.post(`/api/connections/${connId}/sync/run`, {})).json.run;
    expect(run, JSON.stringify(run.errors)).toMatchObject({ status: 'ok', mode: 'full' });
    expect(run.stats).toMatchObject({ epics: { created: 1 }, issues: { created: 2 }, sprints: { created: 3 } });
    const list = await tasks();
    const byTitle = Object.fromEntries(list.map((t) => [t.title, t]));
    expect(byTitle['Checkout redesign']).toMatchObject({ issueType: 'epic', status: 'in_progress', description: 'Make paying easy', assigneeIds: [env.a.ids.mert], epicId: null });
    const sp = Object.fromEntries((await sprints()).map((s) => [s.name, s]));
    expect(sp['Sprint 1']).toMatchObject({ state: 'active', goal: 'Ship checkout', startsOn: '2026-11-09', endsOn: '2026-11-23' });
    expect(sp['Sprint 0'].state).toBe('closed');
    expect(sp['Sprint 2'].state).toBe('future');
    // To Do has no column of that name; the first "not started" one takes it. A story in an epic and a sprint, with points.
    expect(byTitle['Pay with card']).toMatchObject({ issueType: 'story', status: 'backlog', storyPoints: 5, epicId: byTitle['Checkout redesign'].id, sprintId: sp['Sprint 1'].id, dueDate: '2026-12-05' });
    expect(byTitle['Fix totals']).toMatchObject({ issueType: 'bug', status: 'done', storyPoints: 2, sprintId: sp['Sprint 0'].id });
    // What came in is not sent back.
    expect(await pending()).toBe(0);
    expect(calls).toEqual([]);
  });

  it('a status moved here goes out as a workflow transition, with the other project fields', async () => {
    const story = (await tasks()).find((t) => t.title === 'Pay with card');
    const moved = await ada.patch(`/api/tasks/${story.id}`, { baseVersion: story.version, status: 'code_review' });
    expect(moved.status).toBe(200);
    await env.settle();
    expect(calls.map((c) => [c.method, c.url, c.body])).toEqual([['POST', '/rest/api/3/issue/1002/transitions', { transition: { id: '21' } }]]);
    expect(store.issues[1].fields.status.name).toBe('In Review');
    calls.length = 0;
    // Points, epic and sprint are set by the project-management routes; the database queues them for the next run.
    const fresh = (await ada.get(`/api/tasks/${story.id}`)).json.task;
    const pm = await ada.patch(`/api/tasks/${story.id}/pm`, { baseVersion: fresh.version, storyPoints: 8 });
    expect(pm.status, JSON.stringify(pm.json)).toBe(200);
    const s2 = (await sprints()).find((s) => s.name === 'Sprint 2');
    expect((await ada.put(`/api/sprints/${s2.id}/items`, { taskIds: [story.id] })).status).toBe(200);
    expect(await pending()).toBe(1);
    env.clock.now = new Date(Date.now() + 60_000);
    const run = await runSync();
    expect(run, JSON.stringify(run.errors)).toMatchObject({ status: 'ok', mode: 'incremental' });
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ['PUT', '/rest/api/3/issue/1002'],
      ['POST', '/rest/agile/1.0/sprint/102/issue'],
    ]);
    expect(calls[0].body.fields).toEqual({ customfield_10016: 8 });
    expect(store.issues[1].fields.customfield_10020[0].id).toBe(102);
    expect(await pending()).toBe(0);
  });

  it('a change there arrives here: edits, a status, a new epic link; the task keeps its own column when the kind agrees', async () => {
    env.clock.now = new Date(Date.now() + 120_000);
    Object.assign(store.issues[1].fields, { summary: 'Pay with a card', updated: env.clock.now.toISOString() });
    store.issues[1].fields.status = status('In Review');
    Object.assign(store.issues[2].fields, { status: status('In Progress'), updated: env.clock.now.toISOString() });
    const run = await runSync();
    expect(run.stats.issues.updated).toBe(2);
    const list = await tasks();
    // "In Review" is no column; the story already sits in code review, which is the same kind: it stays there.
    expect(list.find((t) => t.title === 'Pay with a card')).toMatchObject({ status: 'code_review', storyPoints: 8 });
    expect(list.find((t) => t.title === 'Fix totals')!.status).toBe('in_progress');
    expect(await pending()).toBe(0);
    expect(calls.length).toBe(2);
  });

  it('a task made here becomes an issue there, a sprint made here a sprint there, in the right order', async () => {
    calls.length = 0;
    const sp = await ada.post(`/api/boards/${board}/sprints`, { name: 'Sprint 3', goal: 'Polish', startsOn: '2026-12-07', endsOn: '2026-12-18' });
    expect(sp.status).toBe(201);
    const made = await ada.post('/api/tasks', { boardId: board, title: 'Write release notes', description: 'Plain text' });
    expect(made.status).toBe(201);
    const t = made.json.task;
    await ada.put(`/api/sprints/${sp.json.sprint.id}/items`, { taskIds: [t.id] });
    await ada.patch(`/api/tasks/${t.id}/pm`, { baseVersion: (await ada.get(`/api/tasks/${t.id}`)).json.task.version, issueType: 'story', storyPoints: 3 });
    await env.settle();
    env.clock.now = new Date(Date.now() + 180_000);
    const run = await runSync();
    expect(run, JSON.stringify(run.errors)).toMatchObject({ status: 'ok' });
    // The sprint first, then the issue, then it joins the sprint there.
    const order = calls.map((c) => `${c.method} ${c.url}`);
    expect(order[0]).toBe('POST /rest/agile/1.0/sprint');
    expect(calls[0].body).toMatchObject({ name: 'Sprint 3', goal: 'Polish', originBoardId: 7 });
    const create = calls.find((c) => c.url === '/rest/api/3/issue')!;
    expect(create.body.fields).toMatchObject({ project: { key: 'CURA' }, summary: 'Write release notes' });
    expect(order.some((o) => /^POST \/rest\/agile\/1\.0\/sprint\/\d+\/issue$/.test(o))).toBe(true);
    const issue = store.issues.at(-1)!;
    expect(issue.fields.customfield_10020[0].name).toBe('Sprint 3');
    // Linked: the next run does not make it twice.
    calls.length = 0;
    env.clock.now = new Date(Date.now() + 240_000);
    await runSync();
    expect(calls.filter((c) => c.url === '/rest/api/3/issue')).toEqual([]);
    expect(store.issues.filter((i) => i.fields.summary === 'Write release notes')).toHaveLength(1);
  });

  it('a default mapping covers exactly what is synced, and an epic made here goes to the epics', () => {
    const maps = jiraDefaultSync('board-1');
    expect(maps.map((m) => [m.remote, m.target, m.issueTypes ?? null])).toEqual([
      ['epics', 'task', ['epic']],
      ['issues', 'task', ['story', 'task', 'bug', 'subtask', 'spike']],
      ['sprints', 'sprint', null],
    ]);
    expect(maps[1].fields.map((f) => `${f.remote}>${f.local}`)).toEqual(['summary>title', 'description>description', 'status>stage', 'issuetype>issue_type', 'assignee>assignee', 'duedate>due', 'story_points>story_points', 'epic>epic', 'sprint>sprint']);
  });
});
