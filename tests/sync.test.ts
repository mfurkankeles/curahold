import { beforeAll, describe, expect, it } from 'vitest';
import { demoStore, demoTouch } from '../api/src/sync/adapters/demo';
import { runScheduledSyncs } from '../api/src/sync/engine';
import { Client, login, setup, type Env } from './helpers';

let env: Env;
let ada: Client;
let lena: Client;
let mert: Client;
let sofia: Client;
let beta: Client;
beforeAll(async () => {
  env = await setup({ connectors: { demoCrm: true } });
  ada = await login(env, 'acme', 'ada@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
  mert = await login(env, 'acme', 'mert@demo.example');
  sofia = await login(env, 'acme', 'sofia@demo.example');
  beta = await login(env, 'beta', 'ada@demo.example');
});

describe('roles: who can do what', () => {
  it('lists roles with people and explains one person', async () => {
    const r = (await ada.get('/api/admin/access')).json;
    expect(r.roles.map((x: any) => x.key)).toEqual(expect.arrayContaining(['admin', 'manager', 'member', 'viewer']));
    expect(r.roles.find((x: any) => x.key === 'admin').perms).toContain('connections.manage');
    const lenaAccess = (await ada.get(`/api/admin/users/${env.a.ids.lena}/access`)).json;
    expect(lenaAccess.access.roleKey).toBe('member');
    expect(lenaAccess.access.perms).toEqual(['accounts.view_all']);
    expect(lenaAccess.access.boards.length).toBeGreaterThan(0);
    expect(lenaAccess.access.boards.every((b: any) => ['view', 'edit', 'manage'].includes(b.level))).toBe(true);
    const sofiaAccess = (await ada.get(`/api/admin/users/${env.a.ids.sofia}/access`)).json;
    expect(sofiaAccess.access.boards.every((b: any) => b.level === 'view')).toBe(true);
    expect((await lena.get('/api/admin/access')).status).toBe(403);
  });

  it('deletes a role in use by moving its people first', async () => {
    const roles = (await ada.get('/api/admin/roles')).json.roles;
    const member = roles.find((r: any) => r.key === 'member');
    const made = (await ada.post('/api/admin/roles', { key: 'support-lead', name: 'Support lead', perms: ['teams.manage'] })).json.role;
    expect((await ada.patch(`/api/admin/users/${env.a.ids.omar}`, { roleId: made.id })).status).toBe(200);
    expect((await ada.del(`/api/admin/roles/${made.id}`)).status).toBe(409);
    expect((await ada.del(`/api/admin/roles/${made.id}?moveTo=${member.id}`)).status).toBe(200);
    const omar = (await ada.get(`/api/admin/users/${env.a.ids.omar}/access`)).json.access;
    expect(omar.roleId).toBe(member.id);
  });
});

describe('records under accounts', () => {
  let oppType: any;
  let account: any;
  it('creates the built-in opportunity type once, with its fields', async () => {
    const r = await mert.post('/api/record-types', { kind: 'opportunity' });
    expect(r.status).toBe(201);
    oppType = r.json.type;
    expect(oppType.fields.map((f: any) => f.key)).toEqual(['amount', 'close_date', 'stage', 'status', 'kind']);
    expect((await mert.post('/api/record-types', { kind: 'opportunity' })).json.type.id).toBe(oppType.id);
    expect((await lena.post('/api/record-types', { kind: 'contact' })).status).toBe(403);
  });

  it('rolls opportunities up into account fields', async () => {
    const fields = (await ada.get('/api/me')).json.org.accountFields;
    const withRollups = [
      ...fields,
      { key: 'open_pipeline', label: { en: 'Open pipeline' }, type: 'money', rollup: { type: 'opportunity', fn: 'sum', field: 'amount', where: { field: 'status', option: 'open' } } },
      { key: 'next_close', label: { en: 'Next close' }, type: 'date', rollup: { type: 'opportunity', fn: 'min', field: 'close_date', where: { field: 'status', option: 'open' } } },
    ];
    expect((await ada.req('PUT', '/api/account-fields', { fields: withRollups })).status).toBe(200);
    account = (await lena.get('/api/accounts?q=Quillfield')).json.accounts[0];
    const a = await lena.post('/api/records', { typeId: oppType.id, accountId: account.id, name: 'Renewal 2027', fields: { amount: '40,000', close_date: '2027-02-01', status: 'open' } });
    expect(a.status).toBe(201);
    await lena.post('/api/records', { typeId: oppType.id, accountId: account.id, name: 'Upsell', fields: { amount: 10000, close_date: '2026-12-15', status: 'open' } });
    await lena.post('/api/records', { typeId: oppType.id, accountId: account.id, name: 'Old deal', fields: { amount: 99000, close_date: '2026-01-01', status: 'won' } });
    const after = (await lena.get(`/api/accounts/${account.id}`)).json.account;
    expect(after.fields.open_pipeline).toBe(50000);
    expect(after.fields.next_close).toBe('2026-12-15');
    // Rolled-up values are Curahold's to work out.
    expect((await lena.patch(`/api/accounts/${account.id}`, { fields: { open_pipeline: 1 } })).status).toBe(400);
    await lena.patch(`/api/records/${a.json.record.id}`, { fields: { status: 'lost' } });
    expect((await lena.get(`/api/accounts/${account.id}`)).json.account.fields.open_pipeline).toBe(10000);
  });

  it('lists records by type and account; viewers read only; other companies see nothing', async () => {
    const list = (await sofia.get(`/api/records?type=opportunity&account=${account.id}`)).json;
    expect(list.total).toBe(3);
    expect(list.records[0].accountName).toBe('Quillfield Retail');
    expect((await sofia.post('/api/records', { typeId: oppType.id, name: 'x' })).status).toBe(403);
    expect((await beta.get('/api/records?type=opportunity')).status).toBe(404);
    expect((await beta.get(`/api/records/${list.records[0].id}`)).status).toBe(404);
    expect((await mert.del(`/api/record-types/${oppType.id}`)).status).toBe(409);
  });
});


describe('stakeholders and the org chart', () => {
  let contactType: any;
  let quill: any;
  let boss: any;
  it('a contact keeps first and last name, LinkedIn, decision role and stance', async () => {
    contactType = (await mert.post('/api/record-types', { kind: 'contact' })).json.type;
    expect(contactType.fields.map((f: any) => f.key)).toEqual(['first_name', 'last_name', 'title', 'email', 'phone', 'linkedin', 'decision', 'stance']);
    quill = (await lena.get('/api/accounts?q=Quillfield')).json.accounts[0];
    const r = await lena.post('/api/records', {
      typeId: contactType.id,
      accountId: quill.id,
      fields: { first_name: 'Derya', last_name: 'Kılıç', title: 'CMO', email: 'Derya@Quill.example', linkedin: 'linkedin.com/in/derya-example', decision: 'Karar verici', stance: 'champion' },
    });
    expect(r.status).toBe(201);
    boss = r.json.record;
    expect(boss.name).toBe('Derya Kılıç');
    expect(boss.fields).toMatchObject({ email: 'derya@quill.example', linkedin: 'https://linkedin.com/in/derya-example', decision: 'decision_maker', stance: 'champion' });
    expect((await lena.post('/api/records', { typeId: contactType.id, accountId: quill.id, fields: { stance: 'friendly' } })).status).toBe(400);
    const renamed = (await lena.patch(`/api/records/${boss.id}`, { fields: { last_name: 'Kılıç Aydın' } })).json.record;
    expect(renamed.name).toBe('Derya Kılıç Aydın');
  });

  it('reports-to builds the org chart; loops and other accounts are refused', async () => {
    const a = (await lena.post('/api/records', { typeId: contactType.id, accountId: quill.id, parentId: boss.id, fields: { first_name: 'Can', last_name: 'Er', stance: 'blocker' } })).json.record;
    const b = (await lena.post('/api/records', { typeId: contactType.id, accountId: quill.id, parentId: a.id, fields: { first_name: 'Ece', last_name: 'Su' } })).json.record;
    expect(a.parentId).toBe(boss.id);
    expect((await lena.patch(`/api/records/${boss.id}`, { parentId: b.id })).json.error).toBe('org_loop');
    expect((await lena.patch(`/api/records/${boss.id}`, { parentId: boss.id })).status).toBe(400);
    const other = (await lena.get('/api/accounts?q=Harborline')).json.accounts[0];
    const stranger = (await lena.post('/api/records', { typeId: contactType.id, accountId: other.id, fields: { first_name: 'Ali', last_name: 'Kaya' } })).json.record;
    expect((await lena.patch(`/api/records/${b.id}`, { parentId: stranger.id })).status).toBe(400);
    // Moving someone to another account takes them out of the old chart.
    const moved = (await lena.patch(`/api/records/${a.id}`, { accountId: other.id })).json.record;
    expect(moved.parentId).toBeNull();
    expect((await lena.get(`/api/records/${b.id}`)).json.record.parentId).toBeNull();
    const list = (await lena.get(`/api/records?type=contact&account=${quill.id}`)).json.records;
    expect(list.map((x: any) => x.name).sort()).toEqual(['Derya Kılıç Aydın', 'Ece Su']);
  });

  it('counts blockers and champions per account', async () => {
    const fields = (await ada.get('/api/me')).json.org.accountFields;
    const next = [
      ...fields,
      { key: 'blockers', label: { en: 'Blockers' }, type: 'number', rollup: { type: 'contact', fn: 'count', where: { field: 'stance', option: 'blocker' } } },
      { key: 'champions', label: { en: 'Champions' }, type: 'number', rollup: { type: 'contact', fn: 'count', where: { field: 'stance', option: 'champion' } } },
    ];
    expect((await ada.req('PUT', '/api/account-fields', { fields: next })).status).toBe(200);
    const q = (await lena.get(`/api/accounts/${quill.id}`)).json.account;
    expect(q.fields).toMatchObject({ champions: 1, blockers: 0 });
  });
});

describe('two-way sync with a CRM', () => {
  let connId: string;
  let demoId: string;
  it('is offered only where configured, and needs the connections permission', async () => {
    const list = (await ada.get('/api/connections')).json;
    expect(list.providers.filter((p: any) => p.kind === 'source').map((p: any) => p.id)).toEqual(['salesforce', 'hubspot', 'dynamics', 'pipedrive', 'zoho', 'gsheets', 'excel', 'demo', 'zendesk', 'freshdesk', 'intercom', 'jsm']);
    // Support tools need nothing on the server: the administrator brings a key.
    expect(list.providers.filter((p: any) => p.setup === 'key').every((p: any) => p.available && !p.twoWay)).toBe(true);
    expect(list.providers.find((p: any) => p.id === 'salesforce').available).toBe(false);
    expect(list.providers.find((p: any) => p.id === 'gsheets').available).toBe(true);
    expect((await mert.post('/api/connections/demo')).status).toBe(403);
  });

  it('stands in for a named CRM in the try-it demo, and says so in its name', async () => {
    const r = await ada.post('/api/connections/demo', { as: 'salesforce' });
    expect(r.status).toBe(201);
    const [row] = await env.db.system((q) => q.query('select label, provider, config from connections where id = $1', [r.json.id]));
    expect(row.label).toBe('Salesforce (demo)');
    expect(row.provider).toBe('demo');
    expect(row.config.as).toBe('salesforce');
    expect((await ada.post('/api/connections/demo', { as: 'not-a-crm' })).status).toBe(400);
    await ada.req('DELETE', `/api/connections/${r.json.id}`);
  });

  it('connects, suggests a mapping and previews without changing anything', async () => {
    const r = await ada.post('/api/connections/demo');
    expect(r.status).toBe(201);
    connId = r.json.id;
    const detail = (await ada.get(`/api/connections/${connId}/sync`)).json;
    expect(detail.connection.provider).toBe('demo');
    const conn = (await env.db.system((q) => q.query('select config from connections where id = $1', [connId])))[0];
    demoId = conn.config.demoId;
    const objects = (await ada.get(`/api/connections/${connId}/objects`)).json.objects;
    expect(objects.map((o: any) => o.name)).toEqual(['Account', 'Contact', 'Opportunity', 'Risk__c', 'Task']);
    const acc = (await ada.get(`/api/connections/${connId}/objects/Account/fields?kind=account`)).json;
    expect(acc.suggested).toEqual(expect.arrayContaining([{ remote: 'Name', local: 'name', dir: 'both' }, { remote: 'OwnerId', local: 'owner', dir: 'both' }]));
    const risk = (await ada.get(`/api/connections/${connId}/objects/Risk__c/fields?kind=custom`)).json;
    expect(risk.suggested).toEqual(expect.arrayContaining([{ remote: 'Account__c', local: 'account', dir: 'both' }, { remote: 'Severity__c', local: 'new', dir: 'both' }]));

    const board = (await ada.get('/api/boards')).json.boards[0];
    const put = await ada.req('PUT', `/api/connections/${connId}/sync`, {
      objects: [
        { remote: 'Account', label: 'Accounts', target: 'account', enabled: true, create: true, fields: [...acc.suggested, { remote: 'Industry', local: 'new', dir: 'both' }, { remote: 'Renewal_Date__c', local: 'new', dir: 'both' }, { remote: 'Partner__c', local: 'new', dir: 'pull' }] },
        { remote: 'Contact', label: 'Contacts', target: 'record', typeKey: '__new', kind: 'contact', enabled: true, create: false, fields: (await ada.get(`/api/connections/${connId}/objects/Contact/fields?kind=contact`)).json.suggested },
        { remote: 'Opportunity', label: 'Opportunities', target: 'record', typeKey: 'opportunity', enabled: true, create: false, fields: (await ada.get(`/api/connections/${connId}/objects/Opportunity/fields?kind=opportunity&typeKey=opportunity`)).json.suggested },
        { remote: 'Risk__c', label: 'Risks', target: 'record', typeKey: '__new', kind: 'custom', enabled: true, create: true, fields: risk.suggested },
        { remote: 'Task', label: 'Tasks', target: 'task', boardId: board.id, enabled: true, create: true, fields: (await ada.get(`/api/connections/${connId}/objects/Task/fields?kind=task`)).json.suggested },
      ],
      conflict: 'latest',
    });
    expect(put.status).toBe(200);
    const fields = (await ada.get('/api/me')).json.org.accountFields;
    expect(fields.find((f: any) => f.label.en === 'Industry')).toMatchObject({ type: 'select' });
    expect(fields.find((f: any) => f.label.en === 'Strategic partner').options.map((o: any) => o.key)).toEqual(['yes', 'no']);
    const types = (await ada.get('/api/record-types')).json.types.map((t: any) => t.key);
    expect(types).toEqual(expect.arrayContaining(['opportunity', 'contact', 'risks']));

    const before = (await ada.get('/api/accounts')).json.total;
    const preview = (await ada.post(`/api/connections/${connId}/preview`)).json;
    expect(preview.objects.find((o: any) => o.remote === 'Account').total).toBe(12);
    expect(preview.owners.find((o: any) => o.email === 'ada@demo.example').userId).toBe(env.a.ids.ada);
    expect((await ada.get('/api/accounts')).json.total).toBe(before);
  });

  it('first run brings everything in, linked to accounts and owners', async () => {
    const r = await ada.post(`/api/connections/${connId}/sync/run`, {});
    expect(r.status).toBe(200);
    expect(r.json.run.status).toBe('ok');
    expect(r.json.run.mode).toBe('full');
    expect(r.json.run.stats.Account.created).toBe(12);
    const atlas = (await ada.get('/api/accounts?q=Atlas')).json.accounts[0];
    expect(atlas.ownerId).toBe(env.a.ids.ada);
    expect(atlas.source).toBe('demo');
    const one = (await ada.get(`/api/accounts/${atlas.id}`)).json.account;
    expect(one.links[0]).toMatchObject({ provider: 'demo', remoteId: '001D0001' });
    const contacts = (await ada.get(`/api/records?type=contact&account=${atlas.id}`)).json.records;
    expect(contacts.map((c: any) => c.name)).toEqual(['Deniz Aydın']);
    expect(contacts[0].fields.email).toBe('deniz.aydin@atlaslogistics.example');
    const opps = (await ada.get(`/api/records?type=opportunity&account=${atlas.id}`)).json.records;
    expect(opps.length).toBe(1);
    expect(opps[0].fields.status).toBe('open');
    const risks = (await ada.get(`/api/records?type=risks&account=${atlas.id}`)).json.records;
    expect(risks[0].fields).toMatchObject({ severity: 'high', status: 'open' });
    // Rolled up from the synced opportunities.
    expect(one.fields.open_pipeline).toBe(opps[0].fields.amount);
    const list = (await ada.get('/api/connections')).json.connections.find((c: any) => c.id === connId);
    expect(list.sync).toMatchObject({ objects: 5, pending: 0 });
    expect(list.sync.lastRun.status).toBe('ok');
  });

  it('a second run with nothing new changes nothing', async () => {
    env.clock.now = new Date(Date.now() + 60_000);
    const r = (await ada.post(`/api/connections/${connId}/sync/run`, {})).json.run;
    expect(r.mode).toBe('incremental');
    const total = Object.values(r.stats as Record<string, any>).reduce((n, s) => n + s.created + s.updated, 0);
    expect(total).toBe(0);
  });

  it('changes made here go to the CRM, and changes there come here', async () => {
    const atlas = (await lena.get('/api/accounts?q=Atlas')).json.accounts[0];
    const fields = (await ada.get('/api/me')).json.org.accountFields;
    const industry = fields.find((f: any) => f.label.en === 'Industry');
    const retail = industry.options.find((o: any) => o.value === 'Retail').key;
    await lena.patch(`/api/accounts/${atlas.id}`, { name: 'Atlas Logistics Group', ownerId: env.a.ids.mert, fields: { [industry.key]: retail } });
    await env.settle();
    const store = demoStore(demoId);
    const remote = store.objects.Account.get('001D0001')!.values;
    expect(remote.Name).toBe('Atlas Logistics Group');
    expect(remote.Industry).toBe('Retail');
    expect(remote.OwnerId).toBe(store.users.find((u) => u.email === 'mert@demo.example')!.id);

    env.clock.now = new Date(Date.now() + 120_000);
    demoTouch(demoId, 'Account', '001D0002', { Name: 'Bluebay Holidays', Industry: 'Software' }, env.clock.now);
    const r = (await ada.post(`/api/connections/${connId}/sync/run`, {})).json.run;
    expect(r.stats.Account.updated).toBe(1);
    const blue = (await lena.get('/api/accounts?q=Bluebay')).json.accounts[0];
    expect(blue.name).toBe('Bluebay Holidays');
    // Our own write came back unchanged and was not counted as a change.
    expect((await lena.get(`/api/accounts/${atlas.id}`)).json.account.name).toBe('Atlas Logistics Group');
  });

  it('new values for a choice field become new options', async () => {
    env.clock.now = new Date(Date.now() + 180_000);
    demoTouch(demoId, 'Account', '001D0003', { Industry: 'Aerospace' }, env.clock.now);
    await ada.post(`/api/connections/${connId}/sync/run`, {});
    const industry = (await ada.get('/api/me')).json.org.accountFields.find((f: any) => f.label.en === 'Industry');
    expect(industry.options.some((o: any) => o.value === 'Aerospace')).toBe(true);
  });

  it('both sides changed the same field: the newer change wins', async () => {
    const pera = (await lena.get('/api/accounts?q=Pera')).json.accounts[0];
    const remoteId = '001D0005';
    // Edit here, but the CRM is unreachable for a moment, so the change waits…
    const realUpdate = (await import('../api/src/sync/adapters/demo')).demo.update;
    const { demo } = await import('../api/src/sync/adapters/demo');
    demo.update = async () => {
      throw new Error('CRM down');
    };
    env.clock.now = new Date(Date.now() + 240_000);
    await lena.patch(`/api/accounts/${pera.id}`, { name: 'Pera Software (here)' });
    await env.settle();
    demo.update = realUpdate;
    const problems = (await ada.get(`/api/connections/${connId}/problems`)).json.problems;
    expect(problems[0]).toMatchObject({ entity: 'account', name: 'Pera Software (here)', attempts: 1 });
    // …and later someone renames it in the CRM too.
    env.clock.now = new Date(Date.now() + 300_000);
    demoTouch(demoId, 'Account', remoteId, { Name: 'Pera Software (there)' }, env.clock.now);
    await ada.post(`/api/connections/${connId}/sync/run`, {});
    expect((await lena.get(`/api/accounts/${pera.id}`)).json.account.name).toBe('Pera Software (there)');
  });

  it('tasks move both ways; done in Curahold completes the CRM task', async () => {
    const board = (await ada.get('/api/boards')).json.boards[0];
    const atlas = (await lena.get('/api/accounts?q=Atlas')).json.accounts[0];
    const t = await lena.post('/api/tasks', { boardId: board.id, title: 'Quarterly review call', accountId: atlas.id, assigneeIds: [env.a.ids.lena], dueDate: '2026-12-01' });
    expect(t.status).toBe(201);
    await env.settle();
    const store = demoStore(demoId);
    const created = [...store.objects.Task.entries()].find(([, v]) => v.values.Subject === 'Quarterly review call');
    expect(created).toBeTruthy();
    expect(created![1].values).toMatchObject({ WhatId: '001D0001', ActivityDate: '2026-12-01', Status: 'Not Started' });
    const done = board.columns.find((c: any) => c.done).key;
    await lena.patch(`/api/tasks/${t.json.task.id}`, { baseVersion: t.json.task.version, status: done });
    await env.settle();
    expect(store.objects.Task.get(created![0])!.values.Status).toBe('Completed');
  });

  it('a record deleted in the CRM is archived on the next full read; a bad read archives nothing', async () => {
    const store = demoStore(demoId);
    store.objects.Contact.delete('003D0012');
    env.clock.now = new Date(Date.now() + 360_000);
    const r = (await ada.post(`/api/connections/${connId}/sync/run`, { full: true })).json.run;
    expect(r.stats.Contact.archived).toBe(1);
    const saved = new Map(store.objects.Account);
    store.objects.Account.clear();
    const bad = (await ada.post(`/api/connections/${connId}/sync/run`, { full: true })).json.run;
    expect(bad.stats.Account?.archived ?? 0).toBe(0);
    expect(bad.errors.some((e: any) => /nothing was archived/.test(e.message))).toBe(true);
    for (const [k, v] of saved) store.objects.Account.set(k, v);
  });


  it('stakeholders come over with who reports to whom, stance and decision role; changes go back', async () => {
    const blue = (await ada.get('/api/accounts?q=Bluebay')).json.accounts[0];
    const people = (await ada.get(`/api/records?type=contact&account=${blue.id}`)).json.records;
    const jordan = people.find((p: any) => p.name === 'Jordan Blake');
    const second = people.find((p: any) => p.name !== 'Jordan Blake');
    expect(second.parentId).toBe(jordan.id);
    expect(jordan.fields).toMatchObject({ first_name: 'Jordan', last_name: 'Blake', decision: 'influencer', stance: 'supporter' });
    expect(jordan.fields.linkedin).toMatch(/^https:\/\/www\.linkedin\.com\/in\/jordan-blake/);
    // Moved to the top of the chart here → no manager in the CRM either.
    const ver = await lena.patch(`/api/records/${second.id}`, { parentId: null, fields: { stance: 'blocker' } });
    expect(ver.status).toBe(200);
    await env.settle();
    const remote = demoStore(demoId).objects.Contact.get('003E0001')!.values;
    expect(remote.ReportsToId).toBeNull();
    expect(remote.Stance__c).toBe('Blocker');
    // And back: a new manager set in the CRM comes here.
    env.clock.now = new Date(Date.now() + 200_000);
    demoTouch(demoId, 'Contact', '003E0001', { ReportsToId: '003D0002' }, env.clock.now);
    await ada.post(`/api/connections/${connId}/sync/run`, {});
    expect((await lena.get(`/api/records/${second.id}`)).json.record.parentId).toBe(jordan.id);
  });

  it('runs hourly on its own, and keeps companies apart', async () => {
    env.clock.now = new Date(Date.now() + 2 * 3_600_000);
    expect(await runScheduledSyncs(env.deps, env.clock.now)).toBe(1);
    expect((await ada.get(`/api/connections/${connId}/runs`)).json.runs.length).toBeGreaterThan(5);
    expect((await beta.get(`/api/connections/${connId}/sync`)).status).toBe(404);
    expect((await beta.get(`/api/connections/${connId}/runs`)).status).toBe(404);
    const leaked = await env.db.tenant({ orgId: env.b.orgId, userId: env.b.ids.ada }, (q) => q.query('select count(*)::int as n from sync_links'));
    expect(leaked[0].n).toBe(0);
    const lenaLinks = await env.db.tenant({ orgId: env.a.orgId, userId: env.a.ids.lena }, (q) => q.query('select count(*)::int as n from sync_runs'));
    expect(lenaLinks[0].n).toBe(0);
    env.clock.now = null;
  });

  it('a customer deleted here is left alone by the sync, and followed again once it is back from the trash', async () => {
    const link = async () =>
      (await env.db.system((q) => q.query(`select entity_id, ignored from sync_links where org_id = $1 and entity = 'account' and remote_id = '001D0007'`, [env.a.orgId])))[0];
    const id = (await link()).entity_id as string;
    const name = (await ada.get(`/api/accounts/${id}`)).json.account.name as string;
    const total = (await ada.get('/api/accounts')).json.total;
    const gone = await ada.del(`/api/accounts/${id}`);
    expect(gone.status).toBe(200);
    expect(await link()).toMatchObject({ entity_id: null, ignored: true });
    // The CRM row changes while the customer is in the trash: nothing is brought back by that.
    env.clock.now = new Date(Date.now() + 5 * 3_600_000);
    demoTouch(demoId, 'Account', '001D0007', { Name: `${name} (renamed there)` }, env.clock.now);
    const quiet = (await ada.post(`/api/connections/${connId}/sync/run`, {})).json.run;
    expect(quiet.stats.Account?.created ?? 0).toBe(0);
    expect((await ada.get('/api/accounts')).json.total).toBe(total - 1);

    expect((await ada.post(`/api/trash/${gone.json.trashId}/restore`)).status).toBe(200);
    expect(await link()).toMatchObject({ entity_id: id, ignored: false });
    env.clock.now = new Date(Date.now() + 6 * 3_600_000);
    demoTouch(demoId, 'Account', '001D0007', { Name: `${name} Group` }, env.clock.now);
    await ada.post(`/api/connections/${connId}/sync/run`, {});
    expect((await ada.get(`/api/accounts/${id}`)).json.account.name).toBe(`${name} Group`);
    env.clock.now = null;
  });
});
