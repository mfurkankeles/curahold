// Dynamics 365 (Dataverse Web API v9.2) as documented: Microsoft identity platform sign-in with the org's
// user_impersonation scope, EntityDefinitions metadata (attributes, option sets, many-to-one relationships,
// DateOnly formats), OData pages with @odata.nextLink under `Prefer: odata.maxpagesize`, lookups read as
// _x_value and written with @odata.bind, errors as { error: { code, message } }; service protection limits
// answer 429 with Retry-After.
import { allow, gate, json, tokenEndpoint, type Ctl, type MockReq, type VendorMock } from './kit';

const ORG = 'https://quillfield.crm4.dynamics.com';
const BASE = '/api/data/v9.2';
const PAGE = 2;
let db: Record<string, any[]> = {};
let seq = 100;
const L = (s: string) => ({ UserLocalizedLabel: { Label: s } });
const ENT: Record<string, { set: string; pk: string; label: string; plural: string; attrs: any[]; rels: any[]; picks: Record<string, any[]>; dateOnly: string[] }> = {
  account: {
    set: 'accounts', pk: 'accountid', label: 'Account', plural: 'Accounts', rels: [{ ReferencingAttribute: 'ownerid', ReferencedEntity: 'systemuser', ReferencingEntityNavigationPropertyName: 'ownerid' }], picks: {}, dateOnly: [],
    attrs: [
      { LogicalName: 'accountid', DisplayName: L('Account'), AttributeType: 'Uniqueidentifier', IsValidForUpdate: false, IsValidForCreate: true },
      { LogicalName: 'name', DisplayName: L('Account Name'), AttributeType: 'String', IsValidForUpdate: true, IsValidForCreate: true, RequiredLevel: { Value: 'ApplicationRequired' } },
      { LogicalName: 'websiteurl', DisplayName: L('Website'), AttributeType: 'String', IsValidForUpdate: true, IsValidForCreate: true },
      { LogicalName: 'ownerid', DisplayName: L('Owner'), AttributeType: 'Owner', IsValidForUpdate: true, IsValidForCreate: true },
      { LogicalName: 'modifiedon', DisplayName: L('Modified On'), AttributeType: 'DateTime', IsValidForUpdate: false, IsValidForCreate: false },
    ],
  },
  contact: {
    set: 'contacts', pk: 'contactid', label: 'Contact', plural: 'Contacts', rels: [{ ReferencingAttribute: 'parentcustomerid', ReferencedEntity: 'account', ReferencingEntityNavigationPropertyName: 'parentcustomerid_account' }], picks: {}, dateOnly: [],
    attrs: [
      { LogicalName: 'contactid', DisplayName: L('Contact'), AttributeType: 'Uniqueidentifier', IsValidForUpdate: false, IsValidForCreate: true },
      { LogicalName: 'fullname', DisplayName: L('Full Name'), AttributeType: 'String', IsValidForUpdate: false, IsValidForCreate: false },
      { LogicalName: 'firstname', DisplayName: L('First Name'), AttributeType: 'String', IsValidForUpdate: true, IsValidForCreate: true },
      { LogicalName: 'lastname', DisplayName: L('Last Name'), AttributeType: 'String', IsValidForUpdate: true, IsValidForCreate: true },
      { LogicalName: 'emailaddress1', DisplayName: L('Email'), AttributeType: 'String', IsValidForUpdate: true, IsValidForCreate: true },
      { LogicalName: 'parentcustomerid', DisplayName: L('Company Name'), AttributeType: 'Customer', IsValidForUpdate: true, IsValidForCreate: true },
    ],
  },
  opportunity: {
    set: 'opportunities', pk: 'opportunityid', label: 'Opportunity', plural: 'Opportunities', rels: [{ ReferencingAttribute: 'parentaccountid', ReferencedEntity: 'account', ReferencingEntityNavigationPropertyName: 'parentaccountid' }], dateOnly: ['estimatedclosedate'],
    picks: { statecode: [{ Value: 0, Label: L('Open') }, { Value: 1, Label: L('Won') }, { Value: 2, Label: L('Lost') }] },
    attrs: [
      { LogicalName: 'opportunityid', DisplayName: L('Opportunity'), AttributeType: 'Uniqueidentifier', IsValidForUpdate: false, IsValidForCreate: true },
      { LogicalName: 'name', DisplayName: L('Topic'), AttributeType: 'String', IsValidForUpdate: true, IsValidForCreate: true },
      { LogicalName: 'estimatedvalue', DisplayName: L('Est. Revenue'), AttributeType: 'Money', IsValidForUpdate: true, IsValidForCreate: true },
      { LogicalName: 'estimatedclosedate', DisplayName: L('Est. Close Date'), AttributeType: 'DateTime', IsValidForUpdate: true, IsValidForCreate: true },
      { LogicalName: 'statecode', DisplayName: L('Status'), AttributeType: 'State', IsValidForUpdate: true, IsValidForCreate: false },
      { LogicalName: 'parentaccountid', DisplayName: L('Account'), AttributeType: 'Lookup', IsValidForUpdate: true, IsValidForCreate: true },
    ],
  },
};
const err = (status: number, code: string, message: string, headers: Record<string, string> = {}) => json({ error: { code, message } }, status, headers);
const unauthorized = () => new Response(null, { status: 401, headers: { 'www-authenticate': 'Bearer error="invalid_token", error_description="The access token has expired"' } });
const limited = () => err(429, '0x80072322', 'Number of requests exceeded the limit of 6000 over time window of 300 seconds.', { 'retry-after': '20' });
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** A record as the Web API returns it: lookups as _x_value. */
function shape(logical: string, r: any, select: string[]) {
  const out: Record<string, unknown> = {};
  for (const c of select) {
    const m = /^_(\w+)_value$/.exec(c);
    out[c] = m ? (r[m[1]] ?? null) : r[c] ?? null;
  }
  if (logical === 'contact' && select.includes('fullname')) out.fullname = [r.firstname, r.lastname].filter(Boolean).join(' ');
  return out;
}

export const dynamicsMock: VendorMock = {
  id: 'dynamics',
  hosts: /^(login\.microsoftonline\.com|quillfield\.crm4\.dynamics\.com)$/,
  startQuery: { orgUrl: ORG },
  reset() {
    const t = '2026-11-18T08:00:00Z';
    db = {
      account: [
        { accountid: uid(1), name: 'Pinecrest Foods', websiteurl: 'https://pinecrest.example', ownerid: uid(901), modifiedon: t },
        { accountid: uid(2), name: 'Orbital Freight', websiteurl: null, ownerid: uid(902), modifiedon: t },
      ],
      contact: [{ contactid: uid(21), firstname: 'Selin', lastname: 'Akar', emailaddress1: 'selin@pinecrest.example', parentcustomerid: uid(1), modifiedon: t }],
      opportunity: [{ opportunityid: uid(31), name: 'Pinecrest renewal', estimatedvalue: 24000, estimatedclosedate: '2026-12-15', statecode: 0, parentaccountid: uid(1), modifiedon: t }],
    };
  },
  consent: (u, ctl) => allow('dynamics', u, ctl),
  remoteEdit(ctl, name) {
    const r = db.account[1];
    r.name = name;
    r.modifiedon = ctl.now().toISOString();
    return { id: r.accountid };
  },
  remoteRow: (object, id) => db[object]?.find((r) => r[ENT[object].pk] === id),
  async handle(req: MockReq, ctl: Ctl) {
    const p = decodeURIComponent(req.url.pathname);
    // One Microsoft sign-in serves Dynamics, Excel and Outlook: its token endpoint takes any of their codes.
    if (req.url.host === 'login.microsoftonline.com') return p.endsWith('/oauth2/v2.0/token') ? tokenEndpoint('*', req, ctl) : err(404, 'NotFound', 'not found');
    const stop = gate('dynamics', req, ctl, { unauthorized, limited });
    if (stop) return stop;
    if (!p.startsWith(BASE)) return err(404, '0x80060888', 'Resource not found for the segment.');
    const path = p.slice(BASE.length + 1);
    const q = req.url.searchParams;
    if (path === 'organizations') return json({ value: [{ name: 'Quillfield Ltd' }] });
    if (path === 'systemusers') return json({ value: [{ systemuserid: uid(901), fullname: 'Ada Demo', internalemailaddress: 'ada@demo.example' }, { systemuserid: uid(902), fullname: 'Nobody', internalemailaddress: 'nobody@elsewhere.example' }] });
    if (path === 'EntityDefinitions') return json({ value: Object.entries(ENT).map(([k, e]) => ({ LogicalName: k, EntitySetName: e.set, DisplayName: L(e.label), DisplayCollectionName: L(e.plural), IsCustomEntity: false, IsValidForAdvancedFind: true })) });
    const def = /^EntityDefinitions\(LogicalName='(\w+)'\)(?:\/(.+))?$/.exec(path);
    if (def) {
      const e = ENT[def[1]];
      if (!e) return err(404, '0x80060888', `Could not find an entity with name ${def[1]}`);
      const sub = def[2] ?? '';
      if (!sub) return json({ EntitySetName: e.set, PrimaryIdAttribute: e.pk });
      if (sub === 'Attributes') return json({ value: e.attrs });
      if (sub === 'ManyToOneRelationships') return json({ value: e.rels });
      if (sub === 'Attributes/Microsoft.Dynamics.CRM.DateTimeAttributeMetadata') return json({ value: e.dateOnly.map((n) => ({ LogicalName: n, Format: 'DateOnly' })) });
      const pick = /^Attributes\/Microsoft\.Dynamics\.CRM\.(\w+)AttributeMetadata$/.exec(sub);
      if (pick) return json({ value: Object.entries(e.picks).filter(([n]) => (pick[1] === 'State' ? n === 'statecode' : pick[1] === 'Status' ? n === 'statuscode' : !['statecode', 'statuscode'].includes(n))).map(([n, opts]) => ({ LogicalName: n, OptionSet: { Options: opts } })) });
      return err(400, '0x80060888', `Unsupported metadata segment ${sub}`);
    }
    const one = /^(\w+)(?:\(([0-9a-f-]+)\))?$/.exec(path);
    const logical = one && Object.keys(ENT).find((k) => ENT[k].set === one[1]);
    if (!one || !logical) return err(404, '0x80060888', `Resource not found for the segment '${path}'.`);
    const e = ENT[logical];
    if (req.method === 'GET') {
      const select = (q.get('$select') ?? '').split(',').filter(Boolean);
      const unknown = select.find((c) => !/^_\w+_value$/.test(c) && c !== 'modifiedon' && !e.attrs.some((a) => a.LogicalName === c));
      if (unknown) return err(400, '0x80060888', `Could not find a property named '${unknown}' on type 'Microsoft.Dynamics.CRM.${logical}'.`);
      const f = /modifiedon ge (\S+)/.exec(q.get('$filter') ?? '');
      const rows = db[logical].filter((r) => !f || Date.parse(r.modifiedon) >= Date.parse(f[1])).sort((a, b) => Date.parse(a.modifiedon) - Date.parse(b.modifiedon));
      const from = Number(q.get('$skiptoken') ?? 0);
      const next = from + PAGE < rows.length ? `${ORG}${BASE}/${e.set}?$select=${select.join(',')}${f ? `&$filter=${encodeURIComponent(`modifiedon ge ${f[1]}`)}` : ''}&$skiptoken=${from + PAGE}` : null;
      return json({ '@odata.context': `${ORG}${BASE}/$metadata#${e.set}`, value: rows.slice(from, from + PAGE).map((r) => shape(logical, r, select)), ...(next ? { '@odata.nextLink': next } : {}) });
    }
    if (ctl.take('badfield')) return err(400, '0x80044331', 'A validation error occurred. The length of the \'websiteurl\' attribute exceeded the maximum allowed length.');
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(req.body ?? {})) {
      const bind = /^(\w+)@odata\.bind$/.exec(k);
      if (bind) {
        const attr = e.rels.find((r) => r.ReferencingEntityNavigationPropertyName === bind[1])?.ReferencingAttribute ?? bind[1];
        body[attr] = v ? /\(([0-9a-f-]+)\)/.exec(String(v))?.[1] ?? null : null;
      } else if (!e.attrs.some((a) => a.LogicalName === k && a.IsValidForUpdate)) return err(400, '0x80060888', `Invalid property '${k}' was found in entity 'Microsoft.Dynamics.CRM.${logical}'.`);
      else body[k] = v;
    }
    if (req.method === 'PATCH') {
      const row = db[logical].find((r) => r[e.pk] === one[2]);
      if (!row) return err(404, '0x80040217', `${logical} With Id = ${one[2]} Does Not Exist`);
      Object.assign(row, body, { modifiedon: ctl.now().toISOString() });
      return new Response(null, { status: 204 });
    }
    if (req.method === 'POST') {
      const row: Record<string, any> = { [e.pk]: uid(5000 + ++seq), ...body, modifiedon: ctl.now().toISOString() };
      db[logical].push(row);
      return json({ [e.pk]: row[e.pk] }, 201);
    }
    return err(405, '0x8006088a', 'method not allowed');
  },
};
