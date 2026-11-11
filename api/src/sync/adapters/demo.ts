// A pretend CRM held in memory, for tests, local development and the live
// demo. Behaves like a real one: changes carry timestamps, writes land, and
// it has a custom object (risk records) next to the standard ones. All
// names are made up. Never offered on a production server.
import type { RemoteField, RemoteObject, RemoteUser } from '../../../../shared/src/sync';
import { CrmError, type CrmAdapter } from './types';

interface Item {
  values: Record<string, unknown>;
  modifiedAt: string;
}
export interface DemoStore {
  objects: Record<string, Map<string, Item>>;
  users: RemoteUser[];
  seq: number;
  /** Calls made, for tests. */
  calls: string[];
}

const stores = new Map<string, DemoStore>();

const OBJECTS: RemoteObject[] = [
  { name: 'Account', label: 'Account', labelPlural: 'Accounts', custom: false, hint: 'account' },
  { name: 'Contact', label: 'Contact', labelPlural: 'Contacts', custom: false, hint: 'contact' },
  { name: 'Opportunity', label: 'Opportunity', labelPlural: 'Opportunities', custom: false, hint: 'opportunity' },
  { name: 'Risk__c', label: 'Risk', labelPlural: 'Risks', custom: true, hint: null },
  { name: 'Task', label: 'Task', labelPlural: 'Tasks', custom: false, hint: 'task' },
];

const f = (name: string, label: string, type: RemoteField['type'], more: Partial<RemoteField> = {}): RemoteField => ({ name, label, type, updatable: true, createable: true, ...more });
const opts = (...v: string[]) => v.map((x) => ({ value: x, label: x }));

const FIELDS: Record<string, RemoteField[]> = {
  Account: [
    f('Id', 'Account ID', 'id', { updatable: false, createable: false }),
    f('Name', 'Account Name', 'text', { required: true }),
    f('OwnerId', 'Account Owner', 'user'),
    f('Industry', 'Industry', 'select', { options: opts('Retail', 'Travel', 'Finance', 'Health', 'Energy', 'Manufacturing', 'Software') }),
    f('Website', 'Website', 'url'),
    f('AnnualRevenue', 'Annual Revenue', 'money'),
    f('Renewal_Date__c', 'Renewal Date', 'date'),
    f('Health__c', 'Health', 'select', { options: opts('Good', 'Watch', 'At risk') }),
    f('Description', 'Description', 'textarea'),
    f('Rating', 'Rating', 'select', { options: opts('Hot', 'Warm', 'Cold') }),
    f('Partner__c', 'Strategic partner', 'bool'),
  ],
  Contact: [
    f('Id', 'Contact ID', 'id', { updatable: false, createable: false }),
    f('Name', 'Full Name', 'text', { required: true }),
    f('AccountId', 'Account', 'ref', { refTo: ['Account'] }),
    f('Email', 'Email', 'email'),
    f('Phone', 'Phone', 'phone'),
    f('Title', 'Title', 'text'),
    f('OwnerId', 'Contact Owner', 'user'),
  ],
  Opportunity: [
    f('Id', 'Opportunity ID', 'id', { updatable: false, createable: false }),
    f('Name', 'Opportunity Name', 'text', { required: true }),
    f('AccountId', 'Account', 'ref', { refTo: ['Account'] }),
    f('Amount', 'Amount', 'money'),
    f('CloseDate', 'Close Date', 'date'),
    f('StageName', 'Stage', 'select', { options: opts('Prospecting', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost') }),
    f('IsClosed', 'Closed', 'bool', { updatable: false }),
    f('IsWon', 'Won', 'bool', { updatable: false }),
    f('Type', 'Type', 'select', { options: opts('New Business', 'Renewal', 'Upsell') }),
    f('OwnerId', 'Opportunity Owner', 'user'),
  ],
  Risk__c: [
    f('Id', 'Risk ID', 'id', { updatable: false, createable: false }),
    f('Name', 'Risk', 'text', { required: true }),
    f('Account__c', 'Account', 'ref', { refTo: ['Account'] }),
    f('Severity__c', 'Severity', 'select', { options: opts('Low', 'Medium', 'High', 'Critical') }),
    f('Status__c', 'Status', 'select', { options: opts('Open', 'Mitigating', 'Closed') }),
    f('Due_Date__c', 'Due date', 'date'),
    f('Reason__c', 'Reason', 'select', { options: opts('Budget', 'Low usage', 'Champion left', 'Competitor', 'Product gap') }),
    f('Notes__c', 'Notes', 'textarea'),
    f('OwnerId', 'Owner', 'user'),
  ],
  Task: [
    f('Id', 'Task ID', 'id', { updatable: false, createable: false }),
    f('Subject', 'Subject', 'text', { required: true }),
    f('WhatId', 'Related to', 'ref', { refTo: ['Account'] }),
    f('ActivityDate', 'Due Date', 'date'),
    f('Status', 'Status', 'select', { options: opts('Not Started', 'In Progress', 'Completed') }),
    f('Description', 'Comments', 'textarea'),
    f('OwnerId', 'Assigned To', 'user'),
  ],
};

const COMPANIES = ['Atlas Logistics', 'Bluebay Travel', 'Northpeak Construction', 'Lumen Cosmetics', 'Pera Software', 'Cedar Foods', 'Anka Energy', 'Aegean Textiles', 'Nova Health', 'Starling Furniture', 'Taurus Motors', 'Bora Finance'];
const INDUSTRY = ['Manufacturing', 'Travel', 'Manufacturing', 'Retail', 'Software', 'Retail', 'Energy', 'Manufacturing', 'Health', 'Retail', 'Manufacturing', 'Finance'];
const PEOPLE = ['Deniz Aydın', 'Jordan Blake', 'Selin Kara', 'Priya Nair', 'Emre Tunç', 'Hannah Moore', 'Cem Yalın', 'Lucas Ferreira', 'Zeynep Er', 'Noah Fischer', 'Elif Şahin', 'Maya Cohen'];

const ascii = (s: string) =>
  s
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '');

const DEFAULT_USERS: RemoteUser[] = [
  { id: 'U1', name: 'Demo Admin', email: null },
  { id: 'U2', name: 'Demo Manager', email: null },
];

function seed(id: string, users: RemoteUser[]): DemoStore {
  const t0 = Date.UTC(2026, 9, 1, 9, 0, 0);
  const at = (i: number) => new Date(t0 + i * 60_000).toISOString();
  const s: DemoStore = { objects: Object.fromEntries(OBJECTS.map((o) => [o.name, new Map()])), users, seq: 1000, calls: [] };
  const owner = (i: number) => users[i % users.length]?.id ?? null;
  COMPANIES.forEach((name, i) => {
    const acc = `001D${String(i + 1).padStart(4, '0')}`;
    const month = ((i * 5) % 12) + 1;
    s.objects.Account.set(acc, {
      modifiedAt: at(i),
      values: {
        Id: acc,
        Name: name,
        OwnerId: owner(i),
        Industry: INDUSTRY[i],
        Website: `https://www.${name.toLowerCase().replace(/[^a-z]+/g, '')}.example`,
        AnnualRevenue: 250_000 + i * 137_500,
        Renewal_Date__c: `2027-${String(month).padStart(2, '0')}-15`,
        Health__c: i % 5 === 0 ? 'At risk' : i % 3 === 0 ? 'Watch' : 'Good',
        Description: null,
        Rating: ['Hot', 'Warm', 'Cold'][i % 3],
        Partner__c: i % 4 === 0,
      },
    });
    const con = `003D${String(i + 1).padStart(4, '0')}`;
    const [first, last] = PEOPLE[i].split(' ');
    s.objects.Contact.set(con, {
      modifiedAt: at(i),
      values: { Id: con, Name: PEOPLE[i], AccountId: acc, Email: `${ascii(first)}.${ascii(last)}@${ascii(name)}.example`, Phone: null, Title: ['Head of CRM', 'Marketing Director', 'E-commerce Lead'][i % 3], OwnerId: owner(i) },
    });
    for (let k = 0; k < (i % 3) + 1; k++) {
      const opp = `006D${String(i * 3 + k + 1).padStart(4, '0')}`;
      const stage = ['Proposal', 'Negotiation', 'Closed Won', 'Prospecting', 'Closed Lost'][(i + k) % 5];
      s.objects.Opportunity.set(opp, {
        modifiedAt: at(i),
        values: {
          Id: opp,
          Name: `${name} — ${['Renewal', 'Upsell', 'New module'][k]}`,
          AccountId: acc,
          Amount: 20_000 + ((i * 7 + k * 3) % 10) * 7_500,
          CloseDate: `2026-${String(((i + k) % 2) + 11).padStart(2, '0')}-${String(10 + k * 5).padStart(2, '0')}`,
          StageName: stage,
          IsClosed: stage.startsWith('Closed'),
          IsWon: stage === 'Closed Won',
          Type: ['Renewal', 'Upsell', 'New Business'][k],
          OwnerId: owner(i),
        },
      });
    }
    if (i % 4 === 0 || i % 5 === 0) {
      const risk = `a0RD${String(i + 1).padStart(4, '0')}`;
      s.objects.Risk__c.set(risk, {
        modifiedAt: at(i),
        values: { Id: risk, Name: `${name}: ${['budget review', 'usage dropped', 'sponsor changed'][i % 3]}`, Account__c: acc, Severity__c: ['High', 'Medium', 'Critical'][i % 3], Status__c: 'Open', Due_Date__c: `2026-12-${String(5 + i).padStart(2, '0')}`, Reason__c: ['Budget', 'Low usage', 'Champion left'][i % 3], Notes__c: null, OwnerId: owner(i) },
      });
    }
  });
  stores.set(id, s);
  return s;
}

export function demoStore(id: string, users: RemoteUser[] = DEFAULT_USERS): DemoStore {
  return stores.get(id) ?? seed(id, users);
}

/** Test helper: change something "in the CRM". */
export function demoTouch(id: string, object: string, remoteId: string, values: Record<string, unknown>, at: Date) {
  const s = demoStore(id);
  const item = s.objects[object].get(remoteId);
  if (!item) throw new Error(`no ${object} ${remoteId}`);
  item.values = { ...item.values, ...values };
  item.modifiedAt = at.toISOString();
}

const store = (config: Record<string, any>) => demoStore(String(config.demoId ?? 'demo'), config.users?.length ? config.users : DEFAULT_USERS);

export const demo: CrmAdapter = {
  provider: 'demo',
  tabular: false,
  async refresh(_ctx, secret) {
    return secret;
  },
  async objects(ctx) {
    store(ctx.config).calls.push('objects');
    return OBJECTS;
  },
  async fields(_ctx, object) {
    const list = FIELDS[object];
    if (!list) throw new CrmError(`Unknown object ${object}`, 404);
    return list;
  },
  async users(ctx) {
    return store(ctx.config).users;
  },
  async list(ctx, object, opts) {
    const s = store(ctx.config);
    s.calls.push(`list:${object}:${opts.since ? 'since' : 'all'}`);
    const all = [...(s.objects[object] ?? new Map()).entries()]
      .filter(([, v]) => !opts.since || v.modifiedAt >= opts.since)
      .sort((a, b) => a[1].modifiedAt.localeCompare(b[1].modifiedAt) || a[0].localeCompare(b[0]));
    const start = Number(opts.cursor ?? 0);
    const page = all.slice(start, start + 50);
    return {
      rows: page.map(([id, v]) => ({ id, modifiedAt: v.modifiedAt, values: Object.fromEntries(opts.fields.map((f) => [f.name, v.values[f.name] ?? null])) })),
      next: start + 50 < all.length ? String(start + 50) : null,
    };
  },
  async update(ctx, object, id, values) {
    const s = store(ctx.config);
    s.calls.push(`update:${object}:${id}`);
    const item = s.objects[object]?.get(id);
    if (!item) throw new CrmError('Not found', 404);
    item.values = { ...item.values, ...values };
    if (object === 'Opportunity' && 'StageName' in values) {
      item.values.IsClosed = String(values.StageName).startsWith('Closed');
      item.values.IsWon = values.StageName === 'Closed Won';
    }
    item.modifiedAt = ctx.now().toISOString();
  },
  async create(ctx, object, values) {
    const s = store(ctx.config);
    const id = `${object.slice(0, 3).toUpperCase()}N${++s.seq}`;
    s.calls.push(`create:${object}:${id}`);
    s.objects[object].set(id, { values: { ...values, Id: id }, modifiedAt: ctx.now().toISOString() });
    return id;
  },
  url() {
    return null;
  },
};
