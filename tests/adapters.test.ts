// Each CRM adapter against a stub of its service: the requests it builds
// and how it reads the answers. Real services are not called.
import { describe, expect, it } from 'vitest';
import { dynamics } from '../api/src/sync/adapters/dynamics';
import { hubspot } from '../api/src/sync/adapters/hubspot';
import { pipedrive } from '../api/src/sync/adapters/pipedrive';
import { salesforce } from '../api/src/sync/adapters/salesforce';
import { colLetter, googleSheetId, gsheets } from '../api/src/sync/adapters/sheets';
import type { CrmCtx } from '../api/src/sync/adapters/types';
import { zoho, zohoAccountsServer } from '../api/src/sync/adapters/zoho';

type Call = { method: string; url: string; body: any; headers: Headers };

function stub(routes: [RegExp, (c: Call) => unknown][], config: Record<string, any>) {
  const calls: Call[] = [];
  let token = 'tok-1';
  const ctx: CrmCtx = {
    config,
    now: () => new Date('2026-11-11T10:00:00Z'),
    token: async () => token,
    refresh: async () => (token = 'tok-2'),
    fetch: (async (u: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      const call: Call = { method: init.method ?? 'GET', url: String(u), body: init.body ? JSON.parse(String(init.body)) : null, headers };
      calls.push(call);
      if (headers.get('authorization')?.includes('tok-expired')) return new Response('{}', { status: 401 });
      for (const [re, fn] of routes) {
        if (re.test(`${call.method} ${call.url}`)) {
          const out = fn(call);
          if (out instanceof Response) return out;
          return out === null ? new Response(null, { status: 204 }) : Response.json(out);
        }
      }
      return new Response(`no route for ${call.method} ${call.url}`, { status: 404 });
    }) as typeof fetch,
  };
  return { ctx, calls };
}

describe('Salesforce', () => {
  const { ctx, calls } = stub(
    [
      [/GET .*\/sobjects$/, () => ({ sobjects: [{ name: 'Account', label: 'Account', labelPlural: 'Accounts', queryable: true, retrieveable: true }, { name: 'Risk__c', label: 'Risk', labelPlural: 'Risks', queryable: true, retrieveable: true, custom: true }, { name: 'AccountShare', label: 'x', queryable: true, retrieveable: true }] })],
      [
        /GET .*\/sobjects\/Account\/describe$/,
        () => ({
          fields: [
            { name: 'Id', label: 'Account ID', type: 'id' },
            { name: 'Name', label: 'Account Name', type: 'string', updateable: true, createable: true, nillable: false },
            { name: 'OwnerId', label: 'Owner', type: 'reference', referenceTo: ['User'], updateable: true },
            { name: 'Rating', label: 'Rating', type: 'picklist', updateable: true, picklistValues: [{ value: 'Hot', label: 'Hot', active: true }, { value: 'Old', label: 'Old', active: false }] },
            { name: 'BillingAddress', label: 'Address', type: 'address' },
            { name: 'Score__c', label: 'Score', type: 'double', calculated: true, updateable: false },
          ],
        }),
      ],
      [/GET .*\/query\?q=SELECT\+Id%2C\+Name|GET .*\/query\?q=SELECT%20Id/, () => ({ done: false, nextRecordsUrl: '/services/data/v62.0/query/01g-2000', records: [{ attributes: { type: 'Account' }, Id: '001A', Name: 'Atlas', SystemModstamp: '2026-11-10T08:00:00.000+0000' }] })],
      [/GET .*\/query\/01g-2000$/, () => ({ done: true, records: [] })],
      [/PATCH .*\/sobjects\/Account\/001A$/, () => null],
      [/POST .*\/sobjects\/Account$/, () => ({ id: '001NEW', success: true })],
    ],
    { instanceUrl: 'https://acme.my.salesforce.com' },
  );
  it('offers standard and custom objects, maps field types, reads with SOQL and writes back', async () => {
    expect((await salesforce.objects(ctx)).map((o) => o.name)).toEqual(['Account', 'Risk__c']);
    const fields = await salesforce.fields(ctx, 'Account');
    expect(fields.map((f) => [f.name, f.type, f.updatable])).toEqual([
      ['Id', 'id', false],
      ['Name', 'text', true],
      ['OwnerId', 'user', true],
      ['Rating', 'select', true],
      ['Score__c', 'number', false],
    ]);
    expect(fields.find((f) => f.name === 'Rating')!.options).toEqual([{ value: 'Hot', label: 'Hot' }]);
    const page = await salesforce.list(ctx, 'Account', { since: '2026-11-10T00:00:00.000Z', cursor: null, fields: fields.slice(1, 2) });
    const soql = decodeURIComponent(calls.at(-1)!.url.split('q=')[1]).replace(/\+/g, ' ');
    expect(soql).toBe('SELECT Id, SystemModstamp, Name FROM Account WHERE SystemModstamp >= 2026-11-10T00:00:00Z ORDER BY SystemModstamp ASC');
    expect(page.rows[0]).toMatchObject({ id: '001A', values: { Name: 'Atlas' } });
    expect(page.rows[0].values).not.toHaveProperty('attributes');
    expect(page.next).toBe('/services/data/v62.0/query/01g-2000');
    expect((await salesforce.list(ctx, 'Account', { since: null, cursor: page.next, fields: [] })).next).toBeNull();
    await salesforce.update(ctx, 'Account', '001A', { Name: 'Atlas Group', Rating: '' }, fields);
    expect(calls.at(-1)).toMatchObject({ method: 'PATCH', body: { Name: 'Atlas Group', Rating: null } });
    expect(calls.at(-1)!.headers.get('authorization')).toBe('Bearer tok-1');
    expect(await salesforce.create(ctx, 'Account', { Name: 'New' }, fields)).toBe('001NEW');
    expect(salesforce.url(ctx.config, 'Account', '001A')).toBe('https://acme.my.salesforce.com/lightning/r/Account/001A/view');
  });
});

describe('HubSpot', () => {
  const { ctx, calls } = stub(
    [
      [/GET .*\/crm\/v3\/schemas$/, () => new Response('{"message":"needs enterprise"}', { status: 403 })],
      [/GET .*\/crm\/v3\/properties\/contacts/, () => ({ results: [{ name: 'email', label: 'Email', type: 'string', fieldType: 'text' }, { name: 'hubspot_owner_id', label: 'Owner', type: 'enumeration', fieldType: 'select' }, { name: 'lifecyclestage', label: 'Stage', type: 'enumeration', fieldType: 'radio', options: [{ value: 'lead', label: 'Lead' }] }, { name: 'hs_calc', label: 'x', type: 'number', calculated: true }] })],
      [/POST .*\/crm\/v3\/objects\/contacts\/search$/, () => ({ results: [{ id: '51', properties: { email: 'a@b.example' }, updatedAt: '2026-11-10T09:00:00Z' }], paging: { next: { after: '100' } } })],
      [/POST .*\/crm\/v4\/associations\/contacts\/companies\/batch\/read$/, () => ({ results: [{ from: { id: '51' }, to: [{ toObjectId: 9001 }] }] })],
      [/PATCH .*\/crm\/v3\/objects\/contacts\/51$/, () => ({ id: '51' })],
      [/PUT .*\/crm\/v4\/objects\/contacts\/51\/associations\/default\/companies\/9002$/, () => ({})],
    ],
    { portalId: '777' },
  );
  it('works without custom objects, reads changes with their company, writes the association', async () => {
    expect((await hubspot.objects(ctx)).map((o) => o.name)).toEqual(['companies', 'contacts', 'deals', 'tickets', 'tasks']);
    const fields = await hubspot.fields(ctx, 'contacts');
    expect(fields.map((f) => [f.name, f.type])).toEqual([
      ['hs_object_id', 'id'],
      ['email', 'email'],
      ['hubspot_owner_id', 'user'],
      ['lifecyclestage', 'select'],
      ['hs_calc', 'number'],
      ['__company', 'ref'],
    ]);
    const wanted = fields.filter((f) => ['email', '__company'].includes(f.name));
    const page = await hubspot.list(ctx, 'contacts', { since: '2026-11-10T00:00:00Z', cursor: null, fields: wanted });
    const search = calls.find((c) => c.url.endsWith('/contacts/search'))!;
    expect(search.body.filterGroups[0].filters[0]).toEqual({ propertyName: 'lastmodifieddate', operator: 'GTE', value: String(Date.parse('2026-11-10T00:00:00Z')) });
    expect(search.body.properties).toEqual(['email']);
    expect(page.rows[0].values).toEqual({ email: 'a@b.example', __company: '9001' });
    expect(page.next).toBe('100');
    await hubspot.update(ctx, 'contacts', '51', { email: null, __company: '9002' }, fields);
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ properties: { email: '' } });
    expect(calls.at(-1)!.method).toBe('PUT');
    expect(hubspot.url(ctx.config, 'contacts', '51')).toBe('https://app.hubspot.com/contacts/777/record/0-1/51');
  });
});

describe('Dynamics 365', () => {
  const base = 'https://contoso.crm4.dynamics.com/api/data/v9.2';
  const { ctx, calls } = stub(
    [
      [/EntityDefinitions\(LogicalName='contact'\)\?\$select=EntitySetName/, () => ({ EntitySetName: 'contacts', PrimaryIdAttribute: 'contactid' })],
      [/EntityDefinitions\(LogicalName='account'\)\?\$select=EntitySetName/, () => ({ EntitySetName: 'accounts', PrimaryIdAttribute: 'accountid' })],
      [/EntityDefinitions\(LogicalName='contact'\)\/Attributes\?/, () => ({ value: [{ LogicalName: 'contactid', AttributeType: 'Uniqueidentifier', IsValidForRead: true }, { LogicalName: 'fullname', AttributeType: 'String', DisplayName: { UserLocalizedLabel: { Label: 'Full Name' } }, IsValidForUpdate: false, IsValidForRead: true }, { LogicalName: 'emailaddress1', AttributeType: 'String', IsValidForUpdate: true, IsValidForRead: true }, { LogicalName: 'parentcustomerid', AttributeType: 'Customer', IsValidForUpdate: true, IsValidForRead: true }, { LogicalName: 'ownerid', AttributeType: 'Owner', IsValidForUpdate: true, IsValidForRead: true }, { LogicalName: 'preferredcontactmethodcode', AttributeType: 'Picklist', IsValidForUpdate: true, IsValidForRead: true }, { LogicalName: 'birthdate', AttributeType: 'DateTime', IsValidForUpdate: true, IsValidForRead: true }] })],
      [/Microsoft\.Dynamics\.CRM\.PicklistAttributeMetadata/, () => ({ value: [{ LogicalName: 'preferredcontactmethodcode', OptionSet: { Options: [{ Value: 1, Label: { UserLocalizedLabel: { Label: 'Any' } } }, { Value: 2, Label: { UserLocalizedLabel: { Label: 'Email' } } }] } }] })],
      [/Microsoft\.Dynamics\.CRM\.(Status|State)AttributeMetadata/, () => ({ value: [] })],
      [/DateTimeAttributeMetadata/, () => ({ value: [{ LogicalName: 'birthdate', Format: 'DateOnly' }] })],
      [/ManyToOneRelationships/, () => ({ value: [{ ReferencingAttribute: 'parentcustomerid', ReferencedEntity: 'account', ReferencingEntityNavigationPropertyName: 'parentcustomerid_account' }, { ReferencingAttribute: 'parentcustomerid', ReferencedEntity: 'contact', ReferencingEntityNavigationPropertyName: 'parentcustomerid_contact' }, { ReferencingAttribute: 'ownerid', ReferencedEntity: 'systemuser', ReferencingEntityNavigationPropertyName: 'ownerid' }] })],
      [/GET .*\/contacts\?/, () => ({ value: [{ contactid: 'c-1', fullname: 'Deniz', _parentcustomerid_value: 'a-1', _ownerid_value: 'u-1', modifiedon: '2026-11-10T09:00:00Z' }], '@odata.nextLink': `${base}/contacts?$skiptoken=2` })],
      [/PATCH .*\/contacts\(c-1\)$/, () => null],
    ],
    { orgUrl: 'https://contoso.crm4.dynamics.com' },
  );
  it('reads metadata, lookups by their _value, and binds them on write', async () => {
    const fields = await dynamics.fields(ctx, 'contact');
    expect(fields.map((f) => [f.name, f.type])).toEqual([
      ['contactid', 'id'],
      ['fullname', 'text'],
      ['emailaddress1', 'email'],
      ['parentcustomerid', 'ref'],
      ['ownerid', 'user'],
      ['preferredcontactmethodcode', 'select'],
      ['birthdate', 'date'],
    ]);
    const page = await dynamics.list(ctx, 'contact', { since: '2026-11-10T00:00:00.000Z', cursor: null, fields: fields.filter((f) => ['fullname', 'parentcustomerid', 'ownerid'].includes(f.name)) });
    const url = calls.find((c) => c.url.startsWith(`${base}/contacts?`))!.url;
    expect(url).toContain('$select=contactid,modifiedon,fullname,_parentcustomerid_value,_ownerid_value');
    expect(url).toContain('$filter=modifiedon%20ge%202026-11-10T00%3A00%3A00.000Z');
    expect(page.rows[0]).toMatchObject({ id: 'c-1', values: { fullname: 'Deniz', parentcustomerid: 'a-1', ownerid: 'u-1' } });
    expect(page.next).toContain('$skiptoken=2');
    await dynamics.update(ctx, 'contact', 'c-1', { parentcustomerid: 'a-2', ownerid: 'u-2', preferredcontactmethodcode: '2', emailaddress1: '' }, fields);
    const w = calls.at(-1)!;
    expect(w.headers.get('if-match')).toBe('*');
    expect(w.body).toEqual({ 'parentcustomerid_account@odata.bind': '/accounts(a-2)', 'ownerid@odata.bind': '/systemusers(u-2)', preferredcontactmethodcode: 2, emailaddress1: null });
  });
});

describe('Pipedrive', () => {
  const { ctx, calls } = stub(
    [
      [/GET .*\/personFields/, () => ({ data: [{ key: 'id', name: 'ID', field_type: 'int' }, { key: 'name', name: 'Name', field_type: 'varchar' }, { key: 'email', name: 'Email', field_type: 'varchar' }, { key: 'org_id', name: 'Organization', field_type: 'org' }, { key: 'abc123', name: 'Tier', field_type: 'enum', edit_flag: true, options: [{ id: 7, label: 'Gold' }] }] })],
      [/GET .*\/recents\?/, () => ({ data: [{ item: 'person', id: 5, data: { id: 5, name: 'Selin', email: [{ value: 'w@x.example', primary: false }, { value: 's@x.example', primary: true }], org_id: { value: 12, name: 'Atlas' }, abc123: 7, update_time: '2026-11-10 09:00:00' } }], additional_data: { pagination: { more_items_in_collection: false } } })],
      [/PUT .*\/persons\/5$/, () => ({ data: { id: 5 } })],
    ],
    { apiDomain: 'https://acme.pipedrive.com' },
  );
  it('flattens nested ids and primary email, reads recents, writes numbers', async () => {
    const fields = await pipedrive.fields(ctx, 'persons');
    expect(fields.map((f) => [f.name, f.type, f.updatable])).toEqual([
      ['id', 'id', false],
      ['name', 'text', true],
      ['email', 'email', true],
      ['org_id', 'ref', true],
      ['abc123', 'select', true],
    ]);
    const page = await pipedrive.list(ctx, 'persons', { since: '2026-11-10T00:00:00.000Z', cursor: null, fields: fields.slice(1) });
    expect(decodeURIComponent(calls.at(-1)!.url)).toContain('since_timestamp=2026-11-10 00:00:00&items=person');
    expect(page.rows[0]).toEqual({ id: '5', modifiedAt: '2026-11-10T09:00:00Z', values: { name: 'Selin', email: 's@x.example', org_id: 12, abc123: 7 } });
    await pipedrive.update(ctx, 'persons', '5', { org_id: '13', abc123: '7', name: 'Selin K.' }, fields);
    expect(calls.at(-1)!.body).toEqual({ org_id: 13, abc123: 7, name: 'Selin K.' });
  });
});

describe('Zoho CRM', () => {
  const { ctx, calls } = stub(
    [
      [/GET .*\/crm\/v6\/Accounts\?/, () => ({ data: [{ id: '42', Account_Name: 'Atlas', Owner: { id: '9', name: 'Ada' }, Tags: [{ name: 'A' }, { name: 'B' }], Modified_Time: '2026-11-10T09:00:00+00:00' }], info: { more_records: true, next_page_token: 'tok' } })],
      [/PUT .*\/crm\/v6\/Accounts$/, () => ({ data: [{ code: 'SUCCESS', status: 'success' }] })],
      [/POST .*\/crm\/v6\/Accounts$/, () => ({ data: [{ code: 'MANDATORY_NOT_FOUND', status: 'error', message: 'required field not found' }] })],
    ],
    { apiDomain: 'https://www.zohoapis.eu' },
  );
  it('uses the data centre, its own auth header, and reports refused writes', async () => {
    const fields = [
      { name: 'Account_Name', label: 'Name', type: 'text' as const, updatable: true },
      { name: 'Owner', label: 'Owner', type: 'user' as const, updatable: true },
      { name: 'Tags', label: 'Tags', type: 'multiselect' as const, updatable: true },
    ];
    const page = await zoho.list(ctx, 'Accounts', { since: '2026-11-10T00:00:00Z', cursor: null, fields });
    const c = calls[0];
    expect(c.url.startsWith('https://www.zohoapis.eu/crm/v6/Accounts?')).toBe(true);
    expect(c.headers.get('authorization')).toBe('Zoho-oauthtoken tok-1');
    expect(c.headers.get('if-modified-since')).toBe('2026-11-10T00:00:00.000Z');
    expect(page.rows[0].values).toEqual({ id: '42', Account_Name: 'Atlas', Owner: '9', Tags: 'A; B' });
    expect(page.next).toBe('tok');
    await zoho.update(ctx, 'Accounts', '42', { Owner: '10', Tags: 'A; C' }, fields);
    expect(calls.at(-1)!.body).toEqual({ data: [{ id: '42', Owner: { id: '10' }, Tags: ['A', 'C'] }] });
    await expect(zoho.create(ctx, 'Accounts', { Account_Name: 'X' }, fields)).rejects.toThrow('required field not found');
    expect(zoho.url(ctx.config, 'Accounts', '42')).toBe('https://crm.zoho.eu/crm/tab/Accounts/42');
    expect(zohoAccountsServer('https://accounts.zoho.eu')).toBe('https://accounts.zoho.eu');
    expect(zohoAccountsServer('https://evil.example')).toBeNull();
  });
});

describe('Google Sheets', () => {
  const { ctx, calls } = stub(
    [
      [/GET .*values\//, () => ({ range: "'Customers'!A1:D4", values: [['Customer no', 'Name', 'Owner', 'Renewal'], ['C-1', 'Atlas', 'ada@demo.example', '15.01.2027'], ['C-2', 'Bluebay', 'Lena Fischer', ''], ['', 'No key', '', '']] })],
      [/POST .*values:batchUpdate$/, () => ({})],
    ],
    { file: { id: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789' } },
  );
  it('reads rows by a key column and writes single cells back', async () => {
    expect(googleSheetId('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=0')).toBe('1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789');
    expect([colLetter(0), colLetter(25), colLetter(26), colLetter(701)]).toEqual(['A', 'Z', 'AA', 'ZZ']);
    const fields = await gsheets.fields(ctx, 'Customers');
    expect(fields.map((f) => [f.name, f.type])).toEqual([
      ['Customer no', 'text'],
      ['Name', 'text'],
      ['Owner', 'person'],
      ['Renewal', 'date'],
    ]);
    const page = await gsheets.list(ctx, 'Customers', { since: null, cursor: null, fields, key: 'Customer no' });
    expect(page.rows.map((r) => r.id)).toEqual(['C-1', 'C-2']);
    await gsheets.update(ctx, 'Customers', 'C-2', { Name: 'Bluebay Travel', Renewal: '2027-03-01' }, fields, 'Customer no');
    expect(calls.at(-1)!.body).toEqual({
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: "'Customers'!B3", values: [['Bluebay Travel']] },
        { range: "'Customers'!D3", values: [['2027-03-01']] },
      ],
    });
  });
});
