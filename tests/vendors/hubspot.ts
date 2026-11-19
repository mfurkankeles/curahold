// HubSpot CRM API v3 as documented: OAuth (app.hubspot.com/oauth/authorize, /oauth/v1/token with rotating
// refresh tokens, /oauth/v1/access-tokens/<token> for hub_id), objects with ?after= cursor pages, the search
// endpoint for "changed since", v4 associations, errors as { status, message, correlationId, category }.
// Rate limit: 429 with X-HubSpot-RateLimit-* headers and category RATE_LIMITS.
import { allow, gate, json, tokenEndpoint, type Ctl, type MockReq, type VendorMock } from './kit';

const PAGE = 2;
let db: Record<string, any[]> = {};
let assoc = new Map<string, string>(); // `${object}:${id}` → company id
let seq = 500;
const PROPS: Record<string, any[]> = {
  companies: [
    { name: 'name', label: 'Company name', type: 'string', fieldType: 'text' },
    { name: 'domain', label: 'Company domain name', type: 'string', fieldType: 'text' },
    { name: 'hubspot_owner_id', label: 'Company owner', type: 'enumeration', fieldType: 'select', referencedObjectType: 'OWNER', options: [] },
    { name: 'hs_lastmodifieddate', label: 'Last modified date', type: 'datetime', fieldType: 'date', modificationMetadata: { readOnlyValue: true } },
  ],
  contacts: [
    { name: 'firstname', label: 'First name', type: 'string', fieldType: 'text' },
    { name: 'lastname', label: 'Last name', type: 'string', fieldType: 'text' },
    { name: 'email', label: 'Email', type: 'string', fieldType: 'text' },
    { name: 'lastmodifieddate', label: 'Last modified date', type: 'datetime', fieldType: 'date', modificationMetadata: { readOnlyValue: true } },
  ],
  deals: [
    { name: 'dealname', label: 'Deal name', type: 'string', fieldType: 'text' },
    { name: 'amount', label: 'Amount', type: 'number', fieldType: 'number' },
    { name: 'closedate', label: 'Close date', type: 'datetime', fieldType: 'date' },
    { name: 'dealstage', label: 'Deal stage', type: 'enumeration', fieldType: 'select', options: [{ value: 'appointmentscheduled', label: 'Appointment scheduled' }, { value: 'closedwon', label: 'Closed won' }] },
    { name: 'hs_lastmodifieddate', label: 'Last modified date', type: 'datetime', fieldType: 'date', modificationMetadata: { readOnlyValue: true } },
  ],
};
const modProp = (o: string) => (o === 'contacts' ? 'lastmodifieddate' : 'hs_lastmodifieddate');
const err = (status: number, category: string, message: string) => json({ status: 'error', message, correlationId: 'mock-corr-1', category }, status);
const unauthorized = () => err(401, 'EXPIRED_AUTHENTICATION', 'The OAuth token used to make this call expired.');
const limited = () =>
  json({ status: 'error', message: 'You have reached your secondly limit.', errorType: 'RATE_LIMIT', correlationId: 'mock-corr-2', policyName: 'SECONDLY', category: 'RATE_LIMITS' }, 429, {
    'x-hubspot-ratelimit-max': '190',
    'x-hubspot-ratelimit-remaining': '0',
    'x-hubspot-ratelimit-interval-milliseconds': '10000',
    'retry-after': '10',
  });

const out = (o: string, r: any, props: string[]) => ({ id: r.id, properties: Object.fromEntries(props.map((p) => [p, r[p] ?? null])), createdAt: r.createdAt, updatedAt: r[modProp(o)], archived: false });

export const hubspotMock: VendorMock = {
  id: 'hubspot',
  hosts: /^(app\.hubspot\.com|api\.hubapi\.com)$/,
  reset() {
    const t = (m: number) => new Date(Date.parse('2026-11-18T08:00:00Z') + m * 60_000).toISOString();
    db = {
      companies: [
        { id: '9001', name: 'Pinecrest Foods', domain: 'pinecrest.example', hubspot_owner_id: '77', hs_lastmodifieddate: t(1), createdAt: t(0) },
        { id: '9002', name: 'Orbital Freight', domain: 'orbital.example', hubspot_owner_id: '78', hs_lastmodifieddate: t(2), createdAt: t(0) },
        { id: '9003', name: 'Larkspur Clinics', domain: null, hubspot_owner_id: null, hs_lastmodifieddate: t(3), createdAt: t(0) },
      ],
      contacts: [{ id: '8001', firstname: 'Selin', lastname: 'Akar', email: 'selin@pinecrest.example', lastmodifieddate: t(4), createdAt: t(0) }],
      deals: [{ id: '7001', dealname: 'Pinecrest renewal', amount: '24000', closedate: '2026-12-15T00:00:00Z', dealstage: 'appointmentscheduled', hs_lastmodifieddate: t(5), createdAt: t(0) }],
    };
    assoc = new Map([['contacts:8001', '9001'], ['deals:7001', '9001']]);
  },
  consent: (u, ctl) => allow('hubspot', u, ctl),
  remoteEdit(ctl, name) {
    const r = db.companies[1];
    r.name = name;
    r.hs_lastmodifieddate = ctl.now().toISOString();
    return { id: r.id };
  },
  remoteRow: (object, id) => db[object]?.find((r) => r.id === id),
  async handle(req: MockReq, ctl: Ctl) {
    const p = req.url.pathname;
    if (p === '/oauth/v1/token') return tokenEndpoint('hubspot', req, ctl);
    const at = /^\/oauth\/v1\/access-tokens\/(.+)$/.exec(p);
    if (at) return ctl.tokens.valid('hubspot', `Bearer ${decodeURIComponent(at[1])}`) ? json({ token: at[1], hub_id: 24680, hub_domain: 'quillfield.example', user: 'ada@demo.example', scopes: ['crm.objects.companies.read'] }) : err(404, 'OBJECT_NOT_FOUND', 'Token not found');
    const stop = gate('hubspot', req, ctl, { unauthorized, limited });
    if (stop) return stop;
    if (p === '/crm/v3/schemas') return json({ results: [] });
    const props = /^\/crm\/v3\/properties\/(\w+)$/.exec(p);
    if (props) return PROPS[props[1]] ? json({ results: PROPS[props[1]] }) : err(400, 'VALIDATION_ERROR', `Unable to infer object type from: ${props[1]}`);
    if (p === '/crm/v3/owners') return json({ results: [{ id: '77', email: 'ada@demo.example', firstName: 'Ada', lastName: 'Demo', archived: false }, { id: '78', email: 'nobody@elsewhere.example', firstName: 'No', lastName: 'Body', archived: false }] });
    const search = /^\/crm\/v3\/objects\/(\w+)\/search$/.exec(p);
    if (search && req.method === 'POST') {
      const o = search[1];
      const f = req.body.filterGroups?.[0]?.filters?.[0];
      const since = f ? Number(f.value) : 0;
      const rows = (db[o] ?? []).filter((r) => Date.parse(r[modProp(o)]) >= since).sort((a, b) => Date.parse(a[modProp(o)]) - Date.parse(b[modProp(o)]));
      const after = Number(req.body.after ?? 0);
      const slice = rows.slice(after, after + PAGE);
      return json({ total: rows.length, results: slice.map((r) => out(o, r, req.body.properties ?? [])), ...(after + PAGE < rows.length ? { paging: { next: { after: String(after + PAGE) } } } : {}) });
    }
    const batch = /^\/crm\/v4\/associations\/(\w+)\/companies\/batch\/read$/.exec(p);
    if (batch) return json({ status: 'COMPLETE', results: req.body.inputs.filter((i: any) => assoc.has(`${batch[1]}:${i.id}`)).map((i: any) => ({ from: { id: i.id }, to: [{ toObjectId: Number(assoc.get(`${batch[1]}:${i.id}`)), associationTypes: [] }] })) });
    const link = /^\/crm\/v4\/objects\/(\w+)\/(\w+)\/associations\/default\/companies\/(\w+)$/.exec(p);
    if (link) {
      assoc.set(`${link[1]}:${link[2]}`, link[3]);
      return json({ status: 'COMPLETE', results: [] });
    }
    const list = /^\/crm\/v3\/objects\/(\w+)(?:\/(\w+))?$/.exec(p);
    if (list) {
      const [, o, id] = list;
      if (!db[o]) return err(400, 'VALIDATION_ERROR', `Unable to infer object type from: ${o}`);
      if (req.method === 'GET' && !id) {
        const want = (req.url.searchParams.get('properties') ?? '').split(',').filter(Boolean);
        const after = Number(req.url.searchParams.get('after') ?? 0);
        const slice = db[o].slice(after, after + PAGE);
        const withCo = req.url.searchParams.get('associations') === 'companies';
        return json({
          results: slice.map((r) => ({ ...out(o, r, want), ...(withCo && assoc.has(`${o}:${r.id}`) ? { associations: { companies: { results: [{ id: assoc.get(`${o}:${r.id}`), type: `${o.slice(0, -1)}_to_company` }] } } } : {}) })),
          ...(after + PAGE < db[o].length ? { paging: { next: { after: String(after + PAGE), link: `https://api.hubapi.com/crm/v3/objects/${o}?after=${after + PAGE}` } } } : {}),
        });
      }
      if (req.method === 'PATCH' || req.method === 'POST') {
        if (ctl.take('badfield')) return err(400, 'VALIDATION_ERROR', 'Property values were not valid: [{"isValid":false,"message":"domain is not a valid domain","error":"INVALID_DOMAIN","name":"domain"}]');
        const bad = Object.keys(req.body.properties ?? {}).find((k) => !PROPS[o].some((x) => x.name === k && !x.modificationMetadata?.readOnlyValue));
        if (bad) return err(400, 'VALIDATION_ERROR', `Property values were not valid: [{"isValid":false,"message":"Property \\"${bad}\\" does not exist","error":"PROPERTY_DOESNT_EXIST","name":"${bad}"}]`);
        const stamp = ctl.now().toISOString();
        if (req.method === 'PATCH') {
          const row = db[o].find((r) => r.id === id);
          if (!row) return err(404, 'OBJECT_NOT_FOUND', 'resource not found');
          Object.assign(row, req.body.properties, { [modProp(o)]: stamp });
          return json(out(o, row, Object.keys(req.body.properties)));
        }
        const row = { id: String(++seq), ...req.body.properties, [modProp(o)]: stamp, createdAt: stamp };
        db[o].push(row);
        return json(out(o, row, Object.keys(req.body.properties)), 201);
      }
    }
    return err(404, 'OBJECT_NOT_FOUND', 'resource not found');
  },
};
