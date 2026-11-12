import { describe, expect, it } from 'vitest';
import { Client, setup } from './helpers';

async function newCompany() {
  const env = await setup();
  const central = new Client(env, 'app');
  const s = await central.post('/api/signup/start', { email: 'dana@harbor-co.example', locale: 'en' });
  const v = await central.post('/api/signup/verify', { token: s.json.devToken });
  const done = await central.post('/api/signup/complete', {
    ticket: v.json.ticket, company: 'Harbor Co', slug: 'harbor-co', name: 'Dana Reyes', locale: 'en', timezone: 'Europe/London', currency: 'GBP', template: 'account_management',
  });
  const admin = new Client(env, 'harbor-co');
  await admin.post('/api/auth/verify', { token: /token=([^&]+)/.exec(done.json.url)![1], deviceId: admin.device });
  return { env, admin };
}

describe('setup wizard, start to finish', () => {
  it('a new company goes from empty to invited team in one pass', async () => {
    const { env, admin } = await newCompany();
    const me = (await admin.get('/api/me')).json;
    expect(me.org.setup).toEqual({});
    expect(me.user.onboardedAt).toBeTruthy(); // the founder skips the personal first-run screen

    expect((await admin.post('/api/setup/step', { step: 'company', done: true })).json.done).toEqual(['company']);
    await admin.patch('/api/admin/org', { terms: { account: { en: { one: 'Client', other: 'Clients' } } } });
    await admin.post('/api/setup/step', { step: 'messaging', done: true });

    // Customers from a spreadsheet; owners do not exist yet.
    const imp = await admin.post('/api/accounts/import', {
      rows: [
        { Client: 'Alder & Finch', Owner: 'max@harbor-co.example', Renewal: '2027-04-01' },
        { Client: 'Birchway', Owner: 'max@harbor-co.example', Renewal: '' },
        { Client: 'Copperleaf', Owner: 'Ivy Chen', Renewal: '2027-08-15' },
      ],
      mapping: { name: 'Client', owner: 'Owner', fields: { renewal_date: 'Renewal' } },
    });
    expect(imp.json.unmatchedOwners).toEqual([
      { email: 'max@harbor-co.example', name: null, count: 2 },
      { email: null, name: 'Ivy Chen', count: 1 },
    ]);
    expect((await admin.get('/api/me')).json.org.setup.ownerHints.length).toBe(2);
    await admin.post('/api/setup/step', { step: 'accounts', done: true });

    // Suggestions: owners from the file (with how many clients each), template team.
    const sug = (await admin.get('/api/setup/people')).json;
    expect(sug.people).toEqual([{ email: 'max@harbor-co.example', name: 'max', sources: ['file'], member: false, accounts: 2 }]);
    expect(sug.nameOnly).toEqual([{ name: 'Ivy Chen', accounts: 1 }]);
    expect(sug.teams).toEqual(['Account Management']);

    const added = await admin.post('/api/setup/people', {
      people: [
        { email: 'max@harbor-co.example', name: 'Max Field', role: 'member', teams: ['Account Management'] },
        { email: 'ivy@harbor-co.example', name: 'Ivy Chen', role: 'manager', teams: ['Account Management'] },
        { email: 'olga@harbor-co.example', name: 'Olga Viewer', role: 'viewer', teams: [] },
      ],
      teams: [{ name: 'Account Management', leadEmail: 'ivy@harbor-co.example' }],
    });
    expect(added.json).toEqual({ created: 3, teamsCreated: 1 });
    const accounts = (await admin.get('/api/accounts')).json.accounts;
    const people = (await admin.get('/api/people')).json;
    const id = (email: string) => people.people.find((p: any) => p.email === email).id;
    expect(accounts.find((a: any) => a.name === 'Birchway').ownerId).toBe(id('max@harbor-co.example'));
    expect(accounts.find((a: any) => a.name === 'Copperleaf').ownerId).toBe(id('ivy@harbor-co.example')); // matched by name
    expect(people.people.find((p: any) => p.email === 'olga@harbor-co.example').seat).toBe('viewer');
    expect(people.teams[0]).toMatchObject({ name: 'Account Management', leadId: id('ivy@harbor-co.example') });

    // Nobody has been emailed yet; finishing sends the invitations.
    expect(env.email.last('max@harbor-co.example')).toBeUndefined();
    const fin = await admin.post('/api/setup/finish', { sendInvites: true });
    expect(fin.json.invited).toBe(3);
    expect(env.email.last('max@harbor-co.example').subject).toBe('Dana Reyes invited you to Harbor Co on Curahold');
    const after = (await admin.get('/api/me')).json.org.setup;
    expect(after.finishedAt).toBeTruthy();
    expect(after.ownerHints).toBeUndefined();

    // The invited person signs in and does their own short setup.
    const max = new Client(env, 'harbor-co');
    await max.post('/api/auth/verify', { token: fin.json.devTokens[0], deviceId: max.device });
    await max.patch('/api/me', { name: 'Max Field', locale: 'tr', prefs: { channel: 'email', digestHour: 9 }, onboarded: true });
    const m = (await max.get('/api/me')).json.user;
    expect(m).toMatchObject({ locale: 'tr', prefs: { channel: 'email', digestHour: 9 } });
    expect(m.onboardedAt).toBeTruthy();

    // Members cannot drive the wizard.
    expect((await max.post('/api/setup/step', { step: 'company', done: true })).status).toBe(403);
  });
});
