// CRMs connected with a key the administrator brings (Bitrix24, Freshsales,
// Zendesk Sell): each adapter against a stub shaped like the service's own
// documented answers, then one of them end to end through the API — connect,
// map, first run, a change there, a change here.
import { beforeAll, describe, expect, it } from 'vitest';
import { bitrix24, bitrixWebhook, freshsales, freshsalesAlias, zendesksell } from '../api/src/sync/adapters/keyed';
import { CrmError, type CrmCtx } from '../api/src/sync/adapters/types';
import type { RemoteField } from '../shared/src/sync';
import { Client, login, setup, type Env } from './helpers';

type Call = { method: string; url: string; auth: string | null; body: any };
type Route = [RegExp, (call: Call) => unknown];

function ctxFor(config: Record<string, any>, token: string, routes: Route[]) {
  const calls: Call[] = [];
  const ctx: CrmCtx = {
    config,
    now: () => new Date('2026-11-12T10:00:00Z'),
    token: async () => token,
    refresh: async () => token,
    fetch: (async (u: string, init: RequestInit = {}) => {
      const call: Call = { method: init.method ?? 'GET', url: String(u), auth: new Headers(init.headers).get('authorization'), body: init.body ? JSON.parse(String(init.body)) : null };
      calls.push(call);
      for (const [re, fn] of routes) {
        if (!re.test(`${call.method} ${call.url}`)) continue;
        const out = fn(call);
        return out instanceof Response ? out : Response.json(out);
      }
      return new Response('no route', { status: 404 });
    }) as typeof fetch,
  };
  return { ctx, calls };
}
const field = (name: string, type: RemoteField['type'], extra: Partial<RemoteField> = {}): RemoteField => ({ name, label: name, type, updatable: true, createable: true, ...extra });
const HOOK = 'https://quillfield.bitrix24.com/rest/1/abcd1234efgh';

describe('Bitrix24', () => {
  it('takes the inbound webhook address as pasted, and nothing that is not one', () => {
    expect(bitrixWebhook(`${HOOK}/`)).toEqual({ base: HOOK, host: 'quillfield.bitrix24.com' });
    expect(bitrixWebhook(` ${HOOK}/crm.company.list.json `).base).toBe(HOOK);
    expect(bitrixWebhook('https://crm.quillfield.example/rest/42/zzzzzzzz99/profile').base).toBe('https://crm.quillfield.example/rest/42/zzzzzzzz99');
    for (const bad of ['', 'quillfield.bitrix24.com', 'http://quillfield.bitrix24.com/rest/1/abcd1234efgh/', 'https://quillfield.bitrix24.com/', 'https://quillfield.bitrix24.com/rest/1/short/', 'https://localhost/rest/1/abcd1234efgh/', 'https://10.0.0.8/rest/1/abcd1234efgh/', 'https://192.168.1.4/rest/1/abcd1234efgh/', 'https://user:pw@quillfield.bitrix24.com/rest/1/abcd1234efgh/', 'https://quillfield.bitrix24.com/rest/1/abcd1234efgh/a/b']) {
      expect(() => bitrixWebhook(bad), bad).toThrow(CrmError);
    }
  });

  it('checks the webhook before connecting, and keeps the address as the secret', async () => {
    const seen: string[] = [];
    const fetcher = (async (u: string) => {
      seen.push(String(u));
      return Response.json({ result: { ID: { type: 'integer' } } });
    }) as typeof fetch;
    const made = await bitrix24.keyed!.connect(fetcher, { webhook: `${HOOK}/` }, new Date());
    expect(seen).toEqual([`${HOOK}/crm.company.fields.json`]);
    expect(made).toMatchObject({ secret: { accessToken: HOOK }, config: { host: 'quillfield.bitrix24.com' }, label: 'quillfield.bitrix24.com', instanceId: 'quillfield.bitrix24.com' });
    // The address never lands in the readable settings.
    expect(JSON.stringify(made.config)).not.toContain('abcd1234efgh');
    const denied = (async () => Response.json({ error: 'insufficient_scope', error_description: 'The request requires higher privileges than provided by the webhook token' }, { status: 401 })) as unknown as typeof fetch;
    await expect(bitrix24.keyed!.connect(denied, { webhook: HOOK }, new Date())).rejects.toMatchObject({ status: 401, auth: true });
  });

  it('describes fields: choices, stages by name, lists read as one value, open/won/lost', async () => {
    const { ctx, calls } = ctxFor({ host: 'quillfield.bitrix24.com' }, HOOK, [
      [/crm\.deal\.fields/, () => ({ result: {
        ID: { type: 'integer', isReadOnly: true, title: 'ID' },
        TITLE: { type: 'string', isRequired: true, title: 'Name' },
        STAGE_ID: { type: 'crm_status', statusType: 'DEAL_STAGE', title: 'Stage' },
        STAGE_SEMANTIC_ID: { type: 'string', isReadOnly: true, title: 'Stage group' },
        OPPORTUNITY: { type: 'double', title: 'Amount' },
        CLOSEDATE: { type: 'date', title: 'Close date' },
        CLOSED: { type: 'char', title: 'Closed' },
        COMPANY_ID: { type: 'crm_company', title: 'Company' },
        CONTACT_IDS: { type: 'crm_contact', isMultiple: true, title: 'Contacts' },
        ASSIGNED_BY_ID: { type: 'user', title: 'Responsible' },
        DATE_MODIFY: { type: 'datetime', isReadOnly: true, title: 'Changed' },
        UF_CRM_TIER: { type: 'enumeration', title: 'UF_CRM_TIER', formLabel: 'Tier', items: [{ ID: '31', VALUE: 'Gold' }, { ID: '32', VALUE: 'Silver' }] },
        UF_CRM_FILE: { type: 'file', title: 'File' },
      } })],
      [/crm\.status\.list/, () => ({ result: [{ STATUS_ID: 'NEW', NAME: 'New' }, { STATUS_ID: 'WON', NAME: 'Deal won' }] })],
      [/crm\.contact\.fields/, () => ({ result: { EMAIL: { type: 'crm_multifield', title: 'E-mail' }, NAME: { type: 'string', title: 'First name' } } })],
    ]);
    const deal = await bitrix24.fields(ctx, 'deal');
    const by = Object.fromEntries(deal.map((f) => [f.name, f]));
    expect(Object.keys(by)).toEqual(['ID', 'TITLE', 'STAGE_ID', 'status', 'OPPORTUNITY', 'CLOSEDATE', 'CLOSED', 'COMPANY_ID', 'ASSIGNED_BY_ID', 'DATE_MODIFY', 'UF_CRM_TIER']);
    expect(by.ID).toMatchObject({ type: 'id', updatable: false });
    expect(by.TITLE).toMatchObject({ type: 'text', required: true, updatable: true });
    expect(by.STAGE_ID).toMatchObject({ type: 'select', options: [{ value: 'NEW', label: 'New' }, { value: 'WON', label: 'Deal won' }] });
    expect(by.status).toMatchObject({ type: 'select', updatable: false, createable: false });
    expect(by.COMPANY_ID).toMatchObject({ type: 'ref', refTo: ['company'] });
    expect(by.ASSIGNED_BY_ID.type).toBe('user');
    expect(by.CLOSED.type).toBe('bool');
    expect(by.UF_CRM_TIER).toMatchObject({ label: 'Tier', type: 'select', options: [{ value: '31', label: 'Gold' }, { value: '32', label: 'Silver' }] });
    expect(by.DATE_MODIFY.updatable).toBe(false);
    expect(calls.filter((c) => /crm\.status\.list/.test(c.url))[0].body).toEqual({ filter: { ENTITY_ID: 'DEAL_STAGE' }, order: { SORT: 'ASC' } });
    const contact = await bitrix24.fields(ctx, 'contact');
    // Written when a contact is made there, never changed after: the other side keeps a list.
    expect(contact.find((f) => f.name === 'EMAIL')).toMatchObject({ type: 'email', updatable: false, createable: true });
    await expect(bitrix24.fields(ctx, 'invoice')).rejects.toThrow(/Unknown Bitrix24 object/);
  });

  it('reads newest change first, a page at a time, and only what changed since', async () => {
    const page1 = Array.from({ length: 50 }, (_, i) => ({ ID: String(900 - i), TITLE: `Deal ${900 - i}`, DATE_MODIFY: '2026-11-10T12:00:00+03:00', STAGE_SEMANTIC_ID: i === 0 ? 'S' : i === 1 ? 'F' : 'P', COMPANY_ID: i === 0 ? '7' : '0', ASSIGNED_BY_ID: '3', CLOSED: i < 2 ? 'Y' : 'N', OPPORTUNITY: '1500.50' }));
    const { ctx, calls } = ctxFor({ host: 'quillfield.bitrix24.com' }, HOOK, [
      [/crm\.deal\.list/, (c) => (c.body.start === 0 ? { result: page1, next: 50, total: 51 } : { result: [{ ID: '1', TITLE: 'Oldest', DATE_MODIFY: '2026-11-01T09:00:00+03:00', STAGE_SEMANTIC_ID: 'P' }], total: 51 })],
      [/crm\.contact\.list/, () => ({ result: [{ ID: '5', NAME: 'Selin', EMAIL: [{ ID: '1', VALUE: 'selin@quillfield.example', VALUE_TYPE: 'WORK' }, { ID: '2', VALUE: 'other@quillfield.example' }], PHONE: [] }], total: 1 })],
      [/crm\.company\.list/, () => ({ result: Array.from({ length: 50 }, (_, i) => ({ ID: String(i + 1), DATE_MODIFY: '2026-11-10T12:00:00+03:00' })), total: 120 })],
    ]);
    const fields = [field('TITLE', 'text'), field('status', 'select'), field('COMPANY_ID', 'ref'), field('ASSIGNED_BY_ID', 'user'), field('CLOSED', 'bool'), field('OPPORTUNITY', 'number')];
    const first = await bitrix24.list(ctx, 'deal', { since: '2026-11-05T00:00:00.000Z', cursor: null, fields });
    expect(calls[0].url).toBe(`${HOOK}/crm.deal.list.json`);
    expect(calls[0].auth).toBeNull();
    expect(calls[0].body).toEqual({ order: { DATE_MODIFY: 'DESC', ID: 'DESC' }, filter: { '>=DATE_MODIFY': '2026-11-05T00:00:00.000Z' }, select: ['ID', 'DATE_MODIFY', 'TITLE', 'STAGE_SEMANTIC_ID', 'COMPANY_ID', 'ASSIGNED_BY_ID', 'CLOSED', 'OPPORTUNITY'], start: 0 });
    expect(first.next).toBe('50');
    expect(first.rows[0]).toEqual({ id: '900', modifiedAt: '2026-11-10T09:00:00.000Z', values: { TITLE: 'Deal 900', status: 'won', COMPANY_ID: '7', ASSIGNED_BY_ID: '3', CLOSED: true, OPPORTUNITY: '1500.50' } });
    expect(first.rows[1].values).toMatchObject({ status: 'lost', COMPANY_ID: null, CLOSED: true });
    expect(first.rows[2].values).toMatchObject({ status: 'open', CLOSED: false });
    const second = await bitrix24.list(ctx, 'deal', { since: null, cursor: first.next, fields });
    expect(calls[1].body).toMatchObject({ filter: {}, start: 50 });
    expect(second).toMatchObject({ next: null, rows: [{ id: '1', modifiedAt: '2026-11-01T06:00:00.000Z' }] });
    const people = await bitrix24.list(ctx, 'contact', { since: null, cursor: null, fields: [field('NAME', 'text'), field('EMAIL', 'email'), field('PHONE', 'phone')] });
    expect(people.rows[0].values).toEqual({ NAME: 'Selin', EMAIL: 'selin@quillfield.example', PHONE: null });
    // An answer without "next" still goes on while the total says there is more.
    expect((await bitrix24.list(ctx, 'company', { since: null, cursor: null, fields: [] })).next).toBe('50');
    expect((await bitrix24.list(ctx, 'company', { since: null, cursor: '100', fields: [] })).next).toBeNull();
  });

  it('writes changes back the way Bitrix24 stores them', async () => {
    const { ctx, calls } = ctxFor({ host: 'quillfield.bitrix24.com' }, HOOK, [
      [/crm\.contact\.add/, () => ({ result: 77 })],
      [/crm\.deal\.update/, () => ({ result: true })],
      [/crm\.company\.update/, () => ({ error: '', error_description: 'Access denied.' })],
    ]);
    const cf = [field('NAME', 'text'), field('EMAIL', 'email', { updatable: false }), field('COMPANY_ID', 'ref'), field('ID', 'id')];
    expect(await bitrix24.create(ctx, 'contact', { NAME: 'Selin', EMAIL: 'selin@quillfield.example', COMPANY_ID: '7', ID: 'x', UNKNOWN: 1 }, cf)).toBe('77');
    expect(calls[0].body).toEqual({ fields: { NAME: 'Selin', EMAIL: [{ VALUE: 'selin@quillfield.example', VALUE_TYPE: 'WORK' }], COMPANY_ID: '7' } });
    await bitrix24.update(ctx, 'deal', '900', { CLOSED: true, CLOSEDATE: null, status: 'won' }, [field('CLOSED', 'bool'), field('CLOSEDATE', 'date'), field('status', 'select')]);
    expect(calls[1].url).toBe(`${HOOK}/crm.deal.update.json`);
    expect(calls[1].body).toEqual({ id: '900', fields: { CLOSED: 'Y', CLOSEDATE: '' } });
    // Bitrix24 can answer 200 with an error inside.
    await expect(bitrix24.update(ctx, 'company', '1', { TITLE: 'x' }, [field('TITLE', 'text')])).rejects.toThrow('Access denied.');
    expect(bitrix24.url({ host: 'quillfield.bitrix24.com' }, 'deal', '900')).toBe('https://quillfield.bitrix24.com/crm/deal/details/900/');
    expect(bitrix24.url({}, 'deal', '900')).toBeNull();
  });

  it('matches owners when the webhook may read users, and carries on when it may not', async () => {
    const ok = ctxFor({}, HOOK, [[/user\.get/, (c) => (c.body.start === 0 ? { result: [{ ID: '3', NAME: 'Ada', LAST_NAME: 'Yıldız', EMAIL: 'Ada@Demo.example' }], next: 50 } : { result: [{ ID: '4', EMAIL: 'lena@demo.example' }] })]]);
    expect(await bitrix24.users(ok.ctx)).toEqual([{ id: '3', name: 'Ada Yıldız', email: 'ada@demo.example' }, { id: '4', name: 'lena@demo.example', email: 'lena@demo.example' }]);
    const no = ctxFor({}, HOOK, [[/user\.get/, () => Response.json({ error: 'insufficient_scope', error_description: 'no users' }, { status: 403 })]]);
    expect(await bitrix24.users(no.ctx)).toEqual([]);
    const gone = ctxFor({}, HOOK, [[/user\.get/, () => Response.json({ error: 'NO_AUTH_FOUND' }, { status: 401 })]]);
    await expect(bitrix24.users(gone.ctx)).rejects.toMatchObject({ auth: true });
    const busy = ctxFor({}, HOOK, [[/user\.get/, () => Response.json({ error: 'QUERY_LIMIT_EXCEEDED' }, { status: 503 })]]);
    await expect(bitrix24.users(busy.ctx)).rejects.toMatchObject({ status: 503, retryAfter: 60 });
  });
});

describe('Freshsales', () => {
  const AUTH = 'Token token=k-123';
  it('understands the address however it is typed, and refuses other sites', () => {
    expect(freshsalesAlias('Quillfield')).toEqual({ alias: 'quillfield.myfreshworks.com/crm/sales', host: 'quillfield.myfreshworks.com' });
    expect(freshsalesAlias('https://quillfield.myfreshworks.com/crm/sales/').alias).toBe('quillfield.myfreshworks.com/crm/sales');
    expect(freshsalesAlias('quillfield.myfreshworks.com/crm/sales/api').alias).toBe('quillfield.myfreshworks.com/crm/sales');
    expect(freshsalesAlias('quillfield.freshsales.io').alias).toBe('quillfield.freshsales.io');
    for (const bad of ['', 'quillfield.example', 'quillfield.myfreshworks.com.evil.example', 'evil.example/x.myfreshworks.com', 'a b', 'user@quillfield.myfreshworks.com', 'quillfield.myfreshworks.com/crm/../x', 'quillfield.myfreshworks.com:8443']) {
      expect(() => freshsalesAlias(bad), bad).toThrow(CrmError);
    }
  });

  it('connects with the API key in the header Freshsales expects', async () => {
    const seen: Call[] = [];
    const fetcher = (async (u: string, init: RequestInit = {}) => {
      seen.push({ method: 'GET', url: String(u), auth: new Headers(init.headers).get('authorization'), body: null });
      return Response.json({ users: [] });
    }) as typeof fetch;
    const made = await freshsales.keyed!.connect(fetcher, { domain: 'quillfield', token: ' k-123 ' }, new Date());
    expect(seen).toEqual([{ method: 'GET', url: 'https://quillfield.myfreshworks.com/crm/sales/api/selector/owners', auth: AUTH, body: null }]);
    expect(made).toMatchObject({ secret: { accessToken: AUTH }, config: { alias: 'quillfield.myfreshworks.com/crm/sales' }, label: 'quillfield.myfreshworks.com', instanceId: 'quillfield.myfreshworks.com' });
    await expect(freshsales.keyed!.connect(fetcher, { domain: 'quillfield', token: '' }, new Date())).rejects.toThrow(/API key/);
  });

  it('describes fields: built-in choices by id, a person’s main account as one field', async () => {
    const { ctx } = ctxFor({ alias: 'quillfield.myfreshworks.com/crm/sales' }, AUTH, [
      [/settings\/deals\/fields/, () => ({ fields: [
        { name: 'name', label: 'Name', type: 'text', required: true },
        { name: 'amount', label: 'Deal value', type: 'number', required: true },
        { name: 'deal_stage_id', label: 'Stage', type: 'dropdown', choices: [{ id: 11, value: 'New' }, { id: 12, value: 'Won', choice_type: 1 }] },
        { name: 'owner_id', label: 'Sales owner', type: 'auto_complete' },
        { name: 'expected_close', label: 'Expected close', type: 'date' },
        { name: 'cf_region', label: 'Region', type: 'dropdown', choices: [{ id: 5, value: 'North' }] },
        { name: 'updated_at', label: 'Updated', type: 'date_time' },
        { name: 'territory_lookup', label: 'Territory', type: 'auto_complete' },
      ] })],
      [/settings\/contacts\/fields/, () => ({ fields: [{ name: 'first_name', label: 'First name', type: 'text' }, { name: 'sales_accounts', label: 'Accounts', type: 'auto_complete' }, { name: 'work_number', label: 'Work', type: 'text' }] })],
    ]);
    const by = Object.fromEntries((await freshsales.fields(ctx, 'deals')).map((f) => [f.name, f]));
    expect(Object.keys(by)).toEqual(['id', 'name', 'amount', 'deal_stage_id', 'owner_id', 'expected_close', 'cf_region', 'updated_at', 'sales_account_id']);
    expect(by.amount.type).toBe('money');
    expect(by.deal_stage_id.options).toEqual([{ value: '11', label: 'New' }, { value: '12', label: 'Won' }]);
    expect(by.cf_region.options).toEqual([{ value: 'North', label: 'North' }]);
    expect(by.owner_id.type).toBe('user');
    expect(by.updated_at).toMatchObject({ type: 'datetime', updatable: false });
    expect(by.sales_account_id).toMatchObject({ type: 'ref', refTo: ['sales_accounts'] });
    const contact = await freshsales.fields(ctx, 'contacts');
    expect(contact.map((f) => f.name)).toEqual(['id', 'first_name', 'work_number', '__company']);
    expect(contact.find((f) => f.name === 'work_number')!.type).toBe('phone');
  });

  it('reads through the "All" view, newest first, and stops where the last run ended', async () => {
    const { ctx, calls } = ctxFor({ alias: 'quillfield.myfreshworks.com/crm/sales' }, AUTH, [
      [/contacts\/filters/, () => ({ filters: [{ id: 3, name: 'My Contacts' }, { id: 9, name: 'All Contacts' }] })],
      [/contacts\/view\/9\?page=1/, () => ({ contacts: [
        { id: 51, first_name: 'Selin', updated_at: '2026-11-11T08:00:00Z', owner_id: 4, custom_field: { cf_tier: 'Gold' }, sales_accounts: [{ id: 70 }, { id: 71, is_primary: true }] },
        { id: 50, first_name: 'Old', updated_at: '2026-11-01T08:00:00Z' },
      ], meta: { total_pages: 3, total: 60 } })],
      [/contacts\/view\/9\?page=2/, () => ({ contacts: [{ id: 49, first_name: 'Mila', updated_at: '2026-10-01T08:00:00Z', sales_account_id: 70 }], meta: { total: 60 } })],
      [/contacts\/view\/9\?page=3/, () => ({ contacts: [], meta: { total: 60 } })],
      [/deals\/filters/, () => ({ filters: [{ id: 1, name: 'Open Deals' }] })],
    ]);
    const fields = [field('first_name', 'text'), field('owner_id', 'user'), field('cf_tier', 'select'), field('__company', 'ref')];
    const inc = await freshsales.list(ctx, 'contacts', { since: '2026-11-05T00:00:00Z', cursor: null, fields });
    expect(calls[1].url).toBe('https://quillfield.myfreshworks.com/crm/sales/api/contacts/view/9?page=1&sort=updated_at&sort_type=desc&include=sales_accounts');
    expect(calls[1].auth).toBe(AUTH);
    expect(inc).toEqual({ rows: [{ id: '51', modifiedAt: '2026-11-11T08:00:00.000Z', values: { first_name: 'Selin', owner_id: '4', cf_tier: 'Gold', __company: '71' } }], next: null });
    const full = await freshsales.list(ctx, 'contacts', { since: null, cursor: null, fields });
    expect(full.rows.map((r) => r.id)).toEqual(['51', '50']);
    expect(full.next).toBe('9:2');
    const two = await freshsales.list(ctx, 'contacts', { since: null, cursor: full.next, fields });
    expect(two.rows[0].values.__company).toBe('70');
    // No page count in this answer: one more page is asked for, and it comes back empty.
    expect(two.next).toBe('9:3');
    expect(await freshsales.list(ctx, 'contacts', { since: null, cursor: two.next, fields })).toEqual({ rows: [], next: null });
    // Reading some other view would bring part of the list without saying so.
    await expect(freshsales.list(ctx, 'deals', { since: null, cursor: null, fields: [] })).rejects.toThrow(/All deals/);
  });

  it('writes with the envelope, custom fields and the main account the way Freshsales takes them', async () => {
    const { ctx, calls } = ctxFor({ alias: 'quillfield.myfreshworks.com/crm/sales' }, AUTH, [
      [/POST .*\/api\/contacts$/, () => ({ contact: { id: 88 } })],
      [/PUT .*\/api\/deals\/12$/, () => ({ deal: { id: 12 } })],
    ]);
    const id = await freshsales.create(ctx, 'contacts', { first_name: 'Selin', owner_id: '4', cf_tier: 'Gold', __company: '71', id: '1' }, [field('first_name', 'text'), field('owner_id', 'user'), field('cf_tier', 'select'), field('__company', 'ref'), field('id', 'id')]);
    expect(id).toBe('88');
    expect(calls[0].body).toEqual({ contact: { first_name: 'Selin', owner_id: 4, sales_accounts: [{ id: 71, is_primary: true }], custom_field: { cf_tier: 'Gold' } } });
    await freshsales.update(ctx, 'deals', '12', { deal_stage_id: '12', sales_account_id: '70', expected_close: null }, [field('deal_stage_id', 'select'), field('sales_account_id', 'ref'), field('expected_close', 'date')]);
    expect(calls[1].body).toEqual({ deal: { deal_stage_id: 12, sales_account_id: 70, expected_close: null } });
    expect(freshsales.url({ alias: 'quillfield.myfreshworks.com/crm/sales' }, 'sales_accounts', '70')).toBe('https://quillfield.myfreshworks.com/crm/sales/accounts/70');
  });
});

describe('Zendesk Sell', () => {
  const AUTH = 'Bearer tok-0123456789abcdefghij';
  const stages = { items: [{ data: { id: 1, name: 'Incoming', category: 'incoming' } }, { data: { id: 2, name: 'Signed', category: 'won' } }, { data: { id: 3, name: 'No fit', category: 'unqualified' } }] };

  it('connects with an access token and learns which account it is', async () => {
    const fetcher = (async (u: string, init: RequestInit = {}) => {
      expect(String(u)).toBe('https://api.getbase.com/v2/accounts/self');
      expect(new Headers(init.headers).get('authorization')).toBe(AUTH);
      return Response.json({ data: { id: 4412, name: 'Quillfield' } });
    }) as typeof fetch;
    expect(await zendesksell.keyed!.connect(fetcher, { token: 'tok-0123456789abcdefghij' }, new Date())).toMatchObject({ secret: { accessToken: AUTH }, label: 'Quillfield', instanceId: '4412' });
    await expect(zendesksell.keyed!.connect(fetcher, { token: 'short' }, new Date())).rejects.toThrow(/access token/);
  });

  it('describes companies, people and deals, with the account’s own fields and stages', async () => {
    const { ctx, calls } = ctxFor({}, AUTH, [
      [/\/stages/, () => stages],
      [/deal\/custom_fields/, () => ({ items: [{ data: { name: 'Region', type: 'list', choices: [{ id: 1, name: 'North' }] } }, { data: { name: 'Site', type: 'address' } }] })],
      [/contact\/custom_fields/, () => ({ items: [{ data: { name: 'Tier', type: 'string', for_organisation: true, for_contact: false } }] })],
    ]);
    const deals = await zendesksell.fields(ctx, 'deals');
    expect(deals.find((f) => f.name === 'stage_id')!.options).toEqual([{ value: '1', label: 'Incoming' }, { value: '2', label: 'Signed' }, { value: '3', label: 'No fit' }]);
    expect(deals.find((f) => f.name === 'custom:Region')).toMatchObject({ type: 'select', options: [{ value: 'North', label: 'North' }] });
    expect(deals.some((f) => f.name === 'custom:Site')).toBe(false);
    expect(deals.find((f) => f.name === '__company')).toMatchObject({ type: 'ref', refTo: ['organizations'], required: true });
    expect(deals.find((f) => f.name === 'status')).toMatchObject({ updatable: false });
    expect((await zendesksell.fields(ctx, 'organizations')).some((f) => f.name === 'custom:Tier')).toBe(true);
    expect((await zendesksell.fields(ctx, 'people')).some((f) => f.name === 'custom:Tier')).toBe(false);
    // The stages are asked for once, however often they are needed.
    await zendesksell.fields(ctx, 'deals');
    expect(calls.filter((c) => /\/stages/.test(c.url))).toHaveLength(1);
  });

  it('reads newest change first; companies and people share one list on the other side', async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ data: { id: 1000 - i, name: `Org ${i}`, updated_at: '2026-11-10T10:00:00Z' } }));
    const { ctx, calls } = ctxFor({}, AUTH, [
      [/\/stages/, () => stages],
      [/contacts\?page=1&.*is_organization=true/, () => ({ items: full, meta: { type: 'collection', count: 100, links: { self: 'x' } } })],
      [/contacts\?page=2&.*is_organization=true/, () => ({ items: [] })],
      [/contacts\?page=1&.*is_organization=false/, () => ({ items: [{ data: { id: 9, first_name: 'Selin', contact_id: 1000, owner_id: 5, custom_fields: { Tier: 'Gold' }, updated_at: '2026-11-11T10:00:00Z' } }, { data: { id: 8, first_name: 'Old', updated_at: '2026-11-01T10:00:00Z' } }] })],
      [/deals\?page=1/, () => ({ items: [
        { data: { id: 31, name: 'Renewal', value: '1200.50', stage_id: 2, contact_id: 9, organization_id: 1000, hot: true, updated_at: '2026-11-11T10:00:00Z' } },
        { data: { id: 32, name: 'Pilot', value: 800, stage_id: 3, contact_id: 1000, organization_id: null, updated_at: '2026-11-11T09:00:00Z' } },
        { data: { id: 33, name: 'New', value: null, stage_id: 1, contact_id: null, updated_at: '2026-11-11T08:00:00Z' } },
      ] })],
    ]);
    const orgs = await zendesksell.list(ctx, 'organizations', { since: null, cursor: null, fields: [field('name', 'text')] });
    expect(calls[0].url).toBe('https://api.getbase.com/v2/contacts?page=1&per_page=100&sort_by=updated_at:desc&is_organization=true');
    expect(orgs.rows).toHaveLength(100);
    // A full page means there may be more, whatever the answer's links say.
    expect(orgs.next).toBe('2');
    expect(await zendesksell.list(ctx, 'organizations', { since: null, cursor: '2', fields: [] })).toEqual({ rows: [], next: null });
    const people = await zendesksell.list(ctx, 'people', { since: '2026-11-05T00:00:00Z', cursor: null, fields: [field('first_name', 'text'), field('__company', 'ref'), field('owner_id', 'user'), field('custom:Tier', 'text')] });
    expect(people).toEqual({ rows: [{ id: '9', modifiedAt: '2026-11-11T10:00:00.000Z', values: { first_name: 'Selin', __company: '1000', owner_id: '5', 'custom:Tier': 'Gold' } }], next: null });
    const deals = await zendesksell.list(ctx, 'deals', { since: null, cursor: null, fields: [field('name', 'text'), field('value', 'money'), field('stage_id', 'select'), field('__company', 'ref'), field('status', 'select'), field('hot', 'bool')] });
    expect(calls.at(-1)!.url).not.toContain('is_organization');
    expect(deals.rows.map((r) => r.values)).toEqual([
      { name: 'Renewal', value: 1200.5, stage_id: '2', __company: '1000', status: 'won', hot: true },
      { name: 'Pilot', value: 800, stage_id: '3', __company: '1000', status: 'lost', hot: null },
      { name: 'New', value: null, stage_id: '1', __company: null, status: 'open', hot: null },
    ]);
  });

  it('writes inside {data}; a new person or company says which it is; money goes as text', async () => {
    const { ctx, calls } = ctxFor({}, AUTH, [
      [/POST .*\/v2\/contacts$/, () => ({ data: { id: 501 } })],
      [/POST .*\/v2\/deals$/, () => ({ data: { id: 601 } })],
      [/PUT .*\/v2\/deals\/601$/, () => ({ data: { id: 601 } })],
    ]);
    const people = [field('first_name', 'text'), field('last_name', 'text'), field('__company', 'ref'), field('owner_id', 'user'), field('custom:Tier', 'text')];
    expect(await zendesksell.create(ctx, 'people', { first_name: 'Selin', last_name: 'Ak', __company: '1000', owner_id: '5', 'custom:Tier': 'Gold' }, people)).toBe('501');
    expect(calls[0].body).toEqual({ data: { first_name: 'Selin', last_name: 'Ak', contact_id: 1000, owner_id: 5, custom_fields: { Tier: 'Gold' }, is_organization: false } });
    await zendesksell.create(ctx, 'organizations', { name: 'Quillfield' }, [field('name', 'text')]);
    expect(calls[1].body).toEqual({ data: { name: 'Quillfield', is_organization: true } });
    const deal = [field('name', 'text'), field('value', 'money'), field('stage_id', 'select'), field('__company', 'ref'), field('status', 'select'), field('estimated_close_date', 'date')];
    expect(await zendesksell.create(ctx, 'deals', { name: 'Renewal', value: 1200.5, stage_id: '2', __company: '1000', status: 'won' }, deal)).toBe('601');
    expect(calls[2].body).toEqual({ data: { name: 'Renewal', value: '1200.50', stage_id: 2, contact_id: 1000 } });
    await zendesksell.update(ctx, 'deals', '601', { value: null, estimated_close_date: '2026-12-31' }, deal);
    expect(calls[3]).toMatchObject({ method: 'PUT', body: { data: { value: null, estimated_close_date: '2026-12-31' } } });
    expect(zendesksell.url({}, 'deals', '601')).toBe('https://app.futuresimple.com/sales/deals/601');
    expect(zendesksell.url({}, 'people', '9')).toBe('https://app.futuresimple.com/crm/contacts/9');
  });

  it('says so when the service asks to slow down or the token stopped working', async () => {
    const slow = ctxFor({}, AUTH, [[/users/, () => new Response('{"errors":[{"error":{"message":"Too many requests"}}]}', { status: 429, headers: { 'retry-after': '7' } })]]);
    await expect(zendesksell.users(slow.ctx)).rejects.toMatchObject({ status: 429, retryAfter: 7 });
    const out = ctxFor({}, AUTH, [[/users/, () => new Response('{"errors":[]}', { status: 401 })]]);
    await expect(zendesksell.users(out.ctx)).rejects.toMatchObject({ status: 401, auth: true });
  });
});

describe('a key-based CRM end to end (Bitrix24)', () => {
  let env: Env;
  let ada: Client;
  let connId: string;
  const calls: { method: string; body: any }[] = [];
  const at = (iso: string) => iso;
  const store = {
    company: [
      { ID: '1', TITLE: 'Pinecrest Foods', ASSIGNED_BY_ID: '10', DATE_MODIFY: at('2026-11-10T09:00:00+00:00') },
      { ID: '2', TITLE: 'Orbital Freight', ASSIGNED_BY_ID: '99', DATE_MODIFY: at('2026-11-09T09:00:00+00:00') },
    ] as any[],
    contact: [{ ID: '21', NAME: 'Selin', LAST_NAME: 'Akar', POST: 'Head of Operations', COMPANY_ID: '1', ASSIGNED_BY_ID: '10', EMAIL: [{ VALUE: 'selin@pinecrest.example' }], DATE_MODIFY: at('2026-11-10T09:00:00+00:00') }] as any[],
    deal: [
      { ID: '31', TITLE: 'Pinecrest renewal', OPPORTUNITY: '24000', CLOSEDATE: '2026-12-15T00:00:00+00:00', STAGE_ID: 'WON', STAGE_SEMANTIC_ID: 'S', COMPANY_ID: '1', ASSIGNED_BY_ID: '10', DATE_MODIFY: at('2026-11-10T09:00:00+00:00') },
      { ID: '32', TITLE: 'Orbital pilot', OPPORTUNITY: '5000', CLOSEDATE: '', STAGE_ID: 'NEW', STAGE_SEMANTIC_ID: 'P', COMPANY_ID: '2', ASSIGNED_BY_ID: '10', DATE_MODIFY: at('2026-11-10T09:00:00+00:00') },
    ] as any[],
  };
  const FIELDS: Record<string, any> = {
    company: { ID: { type: 'integer', isReadOnly: true, title: 'ID' }, TITLE: { type: 'string', isRequired: true, title: 'Company name' }, ASSIGNED_BY_ID: { type: 'user', title: 'Responsible' }, DATE_MODIFY: { type: 'datetime', isReadOnly: true, title: 'Changed' } },
    contact: { ID: { type: 'integer', isReadOnly: true, title: 'ID' }, NAME: { type: 'string', title: 'First name' }, LAST_NAME: { type: 'string', title: 'Last name' }, POST: { type: 'string', title: 'Position' }, EMAIL: { type: 'crm_multifield', title: 'E-mail' }, COMPANY_ID: { type: 'crm_company', title: 'Company' }, ASSIGNED_BY_ID: { type: 'user', title: 'Responsible' } },
    deal: { ID: { type: 'integer', isReadOnly: true, title: 'ID' }, TITLE: { type: 'string', title: 'Name' }, OPPORTUNITY: { type: 'double', title: 'Amount' }, CLOSEDATE: { type: 'date', title: 'Close date' }, STAGE_ID: { type: 'crm_status', statusType: 'DEAL_STAGE', title: 'Stage' }, STAGE_SEMANTIC_ID: { type: 'string', isReadOnly: true, title: 'Stage group' }, COMPANY_ID: { type: 'crm_company', title: 'Company' }, ASSIGNED_BY_ID: { type: 'user', title: 'Responsible' } },
  };
  const bitrix = async (url: string, init?: RequestInit): Promise<Response> => {
    const m = /^https:\/\/pinecrest\.bitrix24\.com\/rest\/1\/hook1234hook\/([\w.]+)\.json$/.exec(url);
    if (!m) return new Response('not here', { status: 404 });
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ method: m[1], body });
    const [, object, verb] = /^crm\.(\w+)\.(\w+)$/.exec(m[1]) ?? [];
    if (m[1] === 'user.get') return Response.json({ result: [{ ID: '10', NAME: 'Ada', EMAIL: 'ada@demo.example' }, { ID: '99', NAME: 'Nobody', EMAIL: 'nobody@elsewhere.example' }] });
    if (m[1] === 'crm.status.list') return Response.json({ result: [{ STATUS_ID: 'NEW', NAME: 'New' }, { STATUS_ID: 'WON', NAME: 'Deal won' }] });
    const rows = (store as Record<string, any[]>)[object];
    if (!rows) return Response.json({ error: 'ERROR_METHOD_NOT_FOUND', error_description: 'Method not found!' }, { status: 404 });
    if (verb === 'fields') return Response.json({ result: FIELDS[object] });
    if (verb === 'list') {
      const from = body.filter?.['>=DATE_MODIFY'] ? Date.parse(body.filter['>=DATE_MODIFY']) : 0;
      const hit = rows.filter((r) => Date.parse(r.DATE_MODIFY) >= from).sort((a, b) => Date.parse(b.DATE_MODIFY) - Date.parse(a.DATE_MODIFY));
      return Response.json({ result: hit.map((r) => Object.fromEntries(body.select.map((k: string) => [k, r[k]]))), total: hit.length });
    }
    if (verb === 'update') {
      Object.assign(rows.find((r) => r.ID === String(body.id)), body.fields, { DATE_MODIFY: env.deps.now().toISOString() });
      return Response.json({ result: true });
    }
    if (verb === 'add') {
      const id = String(100 + rows.length);
      rows.push({ ID: id, ...body.fields, DATE_MODIFY: env.deps.now().toISOString() });
      return Response.json({ result: Number(id) });
    }
    return new Response('?', { status: 400 });
  };

  beforeAll(async () => {
    env = await setup();
    ada = await login(env, 'acme', 'ada@demo.example');
    env.fetchHolder.impl = bitrix;
  });

  it('is offered on every server, two-way, with nothing to set up', async () => {
    const list = (await ada.get('/api/connections')).json.providers.filter((p: any) => p.kind === 'source');
    expect(list.map((p: any) => p.id)).toEqual(['salesforce', 'hubspot', 'dynamics', 'pipedrive', 'zoho', 'bitrix24', 'freshsales', 'zendesksell', 'gsheets', 'excel', 'zendesk', 'freshdesk', 'intercom', 'jsm', 'front', 'bigquery', 'snowflake', 'gmail', 'outlook', 'segment', 'jira']);
    for (const id of ['bitrix24', 'freshsales', 'zendesksell']) expect(list.find((p: any) => p.id === id)).toMatchObject({ twoWay: true, available: true, setup: 'key' });
  });

  it('connects with the webhook address; the address is sealed and a wrong one is refused', async () => {
    expect((await ada.post('/api/connections/key', { provider: 'bitrix24', values: { webhook: 'https://pinecrest.bitrix24.com/rest/1/wrongwrong12/' } })).status).toBeGreaterThanOrEqual(400);
    expect((await ada.post('/api/connections/key', { provider: 'bitrix24', values: { webhook: 'https://127.0.0.1/rest/1/hook1234hook/' } })).status).toBeGreaterThanOrEqual(400);
    const ok = await ada.post('/api/connections/key', { provider: 'bitrix24', values: { webhook: 'https://pinecrest.bitrix24.com/rest/1/hook1234hook/' } });
    expect(ok.status).toBe(201);
    connId = ok.json.id;
    const d = (await ada.get(`/api/connections/${connId}/sync`)).json;
    expect(d.connection).toMatchObject({ provider: 'bitrix24', label: 'pinecrest.bitrix24.com', readOnly: false, tabular: false });
    const [row] = await env.db.system((q) => q.query('select config::text as config, secret::text as secret from connections where id = $1', [connId]));
    expect(`${row.config} ${row.secret}`).not.toContain('hook1234hook');
    // Pasting the same portal again renews the key instead of adding a second connection.
    const again = await ada.post('/api/connections/key', { provider: 'bitrix24', values: { webhook: 'https://pinecrest.bitrix24.com/rest/1/hook1234hook' } });
    expect(again.json.id).toBe(connId);
    const lena = await login(env, 'acme', 'lena@demo.example');
    expect((await lena.post('/api/connections/key', { provider: 'bitrix24', values: {} })).status).toBe(403);
  });

  it('suggests a mapping by what the fields are, whatever Bitrix24 calls them', async () => {
    const pairs = async (object: string, query: string) => (await ada.get(`/api/connections/${connId}/objects/${object}/fields?${query}`)).json.suggested.map((f: any) => `${f.remote}>${f.local}:${f.dir}`);
    expect(await pairs('company', 'kind=account')).toEqual(['TITLE>name:both', 'ASSIGNED_BY_ID>owner:both']);
    expect(await pairs('contact', 'kind=contact')).toEqual(['NAME>f:first_name:both', 'LAST_NAME>f:last_name:both', 'POST>f:title:both', 'EMAIL>f:email:pull', 'COMPANY_ID>account:both', 'ASSIGNED_BY_ID>owner:both']);
    expect(await pairs('deal', 'kind=opportunity')).toEqual(['TITLE>name:both', 'OPPORTUNITY>f:amount:both', 'CLOSEDATE>f:close_date:both', 'STAGE_ID>f:stage:both', 'status>f:status:pull', 'COMPANY_ID>account:both', 'ASSIGNED_BY_ID>owner:both']);
  });

  it('first run brings companies, people and deals over, linked to each other and to owners', async () => {
    const sug = async (object: string, query: string) => (await ada.get(`/api/connections/${connId}/objects/${object}/fields?${query}`)).json.suggested;
    const saved = await ada.put(`/api/connections/${connId}/sync`, {
      objects: [
        { remote: 'company', label: 'Companies', target: 'account', enabled: true, create: true, fields: await sug('company', 'kind=account') },
        { remote: 'contact', label: 'Contacts', target: 'record', typeKey: '__new', kind: 'contact', enabled: true, create: true, fields: await sug('contact', 'kind=contact') },
        { remote: 'deal', label: 'Deals', target: 'record', typeKey: '__new', kind: 'opportunity', enabled: true, create: false, fields: await sug('deal', 'kind=opportunity') },
      ],
      conflict: 'latest',
    });
    expect(saved.status, JSON.stringify(saved.json)).toBe(200);
    const run = await ada.post(`/api/connections/${connId}/sync/run`, {});
    expect(run.status).toBe(200);
    expect(run.json.run, JSON.stringify(run.json.run.errors)).toMatchObject({ status: 'ok', mode: 'full' });
    expect(run.json.run.stats).toMatchObject({ company: { created: 2 }, contact: { created: 1 }, deal: { created: 2 } });
    const pine = (await ada.get('/api/accounts?q=Pinecrest')).json.accounts[0];
    expect(pine).toMatchObject({ name: 'Pinecrest Foods', ownerId: env.a.ids.ada, source: 'bitrix24' });
    const one = (await ada.get(`/api/accounts/${pine.id}`)).json.account;
    expect(one.links[0]).toMatchObject({ provider: 'bitrix24', remoteId: '1', url: 'https://pinecrest.bitrix24.com/crm/company/details/1/' });
    const people = (await ada.get(`/api/records?type=contact&account=${pine.id}`)).json.records;
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({ name: 'Selin Akar', fields: { first_name: 'Selin', last_name: 'Akar', title: 'Head of Operations', email: 'selin@pinecrest.example' } });
    const deals = (await ada.get(`/api/records?type=opportunity&account=${pine.id}`)).json.records;
    expect(deals[0]).toMatchObject({ name: 'Pinecrest renewal', fields: { amount: 24000, close_date: '2026-12-15', status: 'won' } });
    const orbital = (await ada.get('/api/accounts?q=Orbital')).json.accounts[0];
    // Nobody here has that owner's email: the customer comes over without an owner rather than with a wrong one.
    expect(orbital.ownerId).toBeNull();
    expect((await ada.get(`/api/records?type=opportunity&account=${orbital.id}`)).json.records[0].fields.status).toBe('open');
  });

  it('later runs ask only for what changed, and a change there arrives here', async () => {
    env.clock.now = new Date(Date.now() + 60_000);
    calls.length = 0;
    const quiet = (await ada.post(`/api/connections/${connId}/sync/run`, {})).json.run;
    expect(quiet.mode).toBe('incremental');
    expect(Object.values(quiet.stats as Record<string, any>).reduce((n, s) => n + s.created + s.updated, 0)).toBe(0);
    const lists = calls.filter((c) => /^crm\.(company|contact|deal)\.list$/.test(c.method));
    expect(lists.map((c) => c.method)).toEqual(['crm.company.list', 'crm.contact.list', 'crm.deal.list']);
    expect(lists.every((c) => typeof c.body.filter['>=DATE_MODIFY'] === 'string' && c.body.order.DATE_MODIFY === 'DESC')).toBe(true);

    env.clock.now = new Date(Date.now() + 120_000);
    Object.assign(store.deal[1], { STAGE_ID: 'WON', STAGE_SEMANTIC_ID: 'S', OPPORTUNITY: '6500', DATE_MODIFY: env.clock.now.toISOString() });
    const next = (await ada.post(`/api/connections/${connId}/sync/run`, {})).json.run;
    expect(next.stats.deal.updated).toBe(1);
    const orbital = (await ada.get('/api/accounts?q=Orbital')).json.accounts[0];
    expect((await ada.get(`/api/records?type=opportunity&account=${orbital.id}`)).json.records[0].fields).toMatchObject({ amount: 6500, status: 'won' });
  });

  it('a change made here goes back, and a customer made here is made there', async () => {
    calls.length = 0;
    const pine = (await ada.get('/api/accounts?q=Pinecrest')).json.accounts[0];
    await ada.patch(`/api/accounts/${pine.id}`, { name: 'Pinecrest Foods Group' });
    await env.settle();
    expect(calls.find((c) => c.method === 'crm.company.update')!.body).toEqual({ id: '1', fields: { TITLE: 'Pinecrest Foods Group' } });
    expect(store.company[0].TITLE).toBe('Pinecrest Foods Group');
    const made = await ada.post('/api/accounts', { name: 'Larkspur Clinics' });
    expect(made.status).toBe(201);
    await env.settle();
    expect(calls.find((c) => c.method === 'crm.company.add')!.body.fields).toMatchObject({ TITLE: 'Larkspur Clinics' });
    expect(store.company.some((c) => c.TITLE === 'Larkspur Clinics')).toBe(true);
  });
});
