// HubSpot: CRM v3 objects and properties. Changes come from the search API
// sorted by last-modified; the link to a company is an association, offered
// as a virtual "__company" field so it maps like any other.
import type { ObjectHint, RemoteField, RemoteFieldType, RemoteObject } from '../../../../shared/src/sync';
import { call, codeGrant, CrmError, oneShotCtx, refreshGrant, type CrmAdapter, type CrmCtx } from './types';

const API = 'https://api.hubapi.com';
const TOKEN = `${API}/oauth/v1/token`;
export const HUBSPOT_SCOPES = ['oauth', 'crm.objects.companies.read', 'crm.objects.companies.write', 'crm.objects.owners.read'];
export const HUBSPOT_OPTIONAL = [
  'crm.objects.contacts.read',
  'crm.objects.contacts.write',
  'crm.objects.deals.read',
  'crm.objects.deals.write',
  'tickets',
  'crm.objects.custom.read',
  'crm.objects.custom.write',
  'crm.schemas.custom.read',
  'crm.objects.tasks.read',
  'crm.objects.tasks.write',
];

const STANDARD: { name: string; typeId: string; label: string; plural: string; hint: ObjectHint }[] = [
  { name: 'companies', typeId: '0-2', label: 'Company', plural: 'Companies', hint: 'account' },
  { name: 'contacts', typeId: '0-1', label: 'Contact', plural: 'Contacts', hint: 'contact' },
  { name: 'deals', typeId: '0-3', label: 'Deal', plural: 'Deals', hint: 'opportunity' },
  { name: 'tickets', typeId: '0-5', label: 'Ticket', plural: 'Tickets', hint: null },
  { name: 'tasks', typeId: '0-27', label: 'Task', plural: 'Tasks', hint: 'task' },
];
const modifiedProp = (object: string) => (object === 'contacts' ? 'lastmodifieddate' : 'hs_lastmodifieddate');
export const COMPANY_LINK = '__company';

function typeOf(p: any): RemoteFieldType {
  if (p.name === 'hubspot_owner_id' || p.referencedObjectType === 'OWNER') return 'user';
  if (p.type === 'bool' || p.fieldType === 'booleancheckbox') return 'bool';
  if (p.type === 'enumeration') return p.fieldType === 'checkbox' ? 'multiselect' : 'select';
  if (p.type === 'number') return p.showCurrencySymbol || p.name === 'amount' ? 'money' : 'number';
  if (p.type === 'date') return 'date';
  if (p.type === 'datetime') return 'datetime';
  if (p.fieldType === 'textarea' || p.fieldType === 'html') return 'textarea';
  if (p.fieldType === 'phonenumber') return 'phone';
  if (p.name === 'email') return 'email';
  if (p.name === 'website' || p.name === 'domain') return 'url';
  return 'text';
}

function encode(values: Record<string, unknown>) {
  const props: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (k === COMPANY_LINK) continue;
    props[k] = v === null || v === undefined ? '' : typeof v === 'boolean' ? String(v) : v;
  }
  return props;
}

async function associate(ctx: CrmCtx, object: string, id: string, companyId: unknown) {
  if (!companyId) return;
  await call(ctx, `${API}/crm/v4/objects/${object}/${id}/associations/default/companies/${encodeURIComponent(String(companyId))}`, { method: 'PUT' });
}

async function companiesOf(ctx: CrmCtx, object: string, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ids.length || object === 'companies') return out;
  const j = await call(ctx, `${API}/crm/v4/associations/${object}/companies/batch/read`, { method: 'POST', json: { inputs: ids.map((id) => ({ id })) } });
  for (const r of j?.results ?? []) {
    const to = r.to?.[0]?.toObjectId;
    if (to) out.set(String(r.from?.id), String(to));
  }
  return out;
}

export const hubspot: CrmAdapter = {
  provider: 'hubspot',
  tabular: false,
  oauth: {
    authorizeUrl(client, redirectUri, state) {
      const u = new URL('https://app.hubspot.com/oauth/authorize');
      u.searchParams.set('client_id', client.clientId);
      u.searchParams.set('redirect_uri', redirectUri);
      u.searchParams.set('scope', HUBSPOT_SCOPES.join(' '));
      u.searchParams.set('optional_scope', HUBSPOT_OPTIONAL.join(' '));
      u.searchParams.set('state', state);
      return u.toString();
    },
    async exchange(fetcher, client, code, redirectUri, _opts, now) {
      const j = await codeGrant(fetcher, TOKEN, client, code, redirectUri, now);
      const info = await call(oneShotCtx(fetcher, now, j.access_token, {}), `${API}/oauth/v1/access-tokens/${encodeURIComponent(j.access_token)}`);
      const portalId = String(info?.hub_id ?? '');
      if (!portalId) throw new CrmError('HubSpot did not say which account this is');
      return {
        secret: { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: j.expiresAt },
        config: { portalId, domain: info?.hub_domain ?? null },
        label: info?.hub_domain ?? `HubSpot ${portalId}`,
        instanceId: portalId,
      };
    },
  },

  async refresh(ctx, secret, client) {
    if (!secret.refreshToken) throw new CrmError('Reconnect HubSpot', 401, undefined, true);
    return refreshGrant(ctx.fetch, TOKEN, client, secret.refreshToken, ctx.now());
  },

  async objects(ctx) {
    const out: RemoteObject[] = STANDARD.map((s) => ({ name: s.name, label: s.label, labelPlural: s.plural, custom: false, hint: s.hint }));
    try {
      const j = await call(ctx, `${API}/crm/v3/schemas`);
      for (const s of j?.results ?? []) {
        out.push({ name: s.objectTypeId, label: s.labels?.singular ?? s.name, labelPlural: s.labels?.plural ?? s.name, custom: true, hint: null });
      }
    } catch (e) {
      // Custom objects are an Enterprise feature; without them the standard objects still sync.
      if (!(e instanceof CrmError) || (e.status !== 403 && e.status !== 404)) throw e;
    }
    return out;
  },

  async fields(ctx, object) {
    const j = await call(ctx, `${API}/crm/v3/properties/${encodeURIComponent(object)}?archived=false`);
    const out: RemoteField[] = [{ name: 'hs_object_id', label: 'Record ID', type: 'id', updatable: false }];
    for (const p of j?.results ?? []) {
      if (p.hidden || p.name === 'hs_object_id') continue;
      const type = typeOf(p);
      out.push({
        name: p.name,
        label: p.label,
        type,
        options: (type === 'select' || type === 'multiselect') && p.options?.length ? p.options.filter((o: any) => !o.hidden).map((o: any) => ({ value: o.value, label: o.label })) : undefined,
        updatable: !p.modificationMetadata?.readOnlyValue && !p.calculated,
        createable: !p.modificationMetadata?.readOnlyValue && !p.calculated,
      });
    }
    if (object !== 'companies') out.push({ name: COMPANY_LINK, label: 'Company', type: 'ref', refTo: ['companies'], updatable: true, createable: true });
    return out;
  },

  async users(ctx) {
    const out = [];
    let after: string | null = null;
    do {
      const j: any = await call(ctx, `${API}/crm/v3/owners?limit=500${after ? `&after=${encodeURIComponent(after)}` : ''}`);
      for (const o of j?.results ?? []) {
        if (o.archived) continue;
        out.push({ id: String(o.id), name: [o.firstName, o.lastName].filter(Boolean).join(' ') || o.email || String(o.id), email: o.email ? String(o.email).toLowerCase() : null });
      }
      after = j?.paging?.next?.after ?? null;
    } while (after);
    return out;
  },

  async list(ctx, object, opts) {
    const props = opts.fields.map((f) => f.name).filter((n) => n !== COMPANY_LINK);
    const wantsCompany = opts.fields.some((f) => f.name === COMPANY_LINK);
    let results: any[];
    let next: string | null;
    if (opts.since) {
      const after = opts.cursor ? Number(opts.cursor) : 0;
      const j = await call(ctx, `${API}/crm/v3/objects/${encodeURIComponent(object)}/search`, {
        method: 'POST',
        json: {
          filterGroups: [{ filters: [{ propertyName: modifiedProp(object), operator: 'GTE', value: String(new Date(opts.since).getTime()) }] }],
          sorts: [{ propertyName: modifiedProp(object), direction: 'ASCENDING' }],
          properties: props,
          limit: 100,
          after,
        },
      });
      results = j?.results ?? [];
      const n = j?.paging?.next?.after;
      // Search stops at 10,000 hits; the next run carries on from the last change seen.
      next = n && Number(n) < 9900 ? String(n) : null;
      if (wantsCompany && results.length) {
        const links = await companiesOf(ctx, object, results.map((r) => String(r.id)));
        for (const r of results) r.__company = links.get(String(r.id)) ?? null;
      }
    } else {
      const u = new URL(`${API}/crm/v3/objects/${encodeURIComponent(object)}`);
      u.searchParams.set('limit', '100');
      if (props.length) u.searchParams.set('properties', props.join(','));
      if (wantsCompany) u.searchParams.set('associations', 'companies');
      if (opts.cursor) u.searchParams.set('after', opts.cursor);
      const j = await call(ctx, u.toString());
      results = j?.results ?? [];
      for (const r of results) r.__company = r.associations?.companies?.results?.[0]?.id ?? null;
      next = j?.paging?.next?.after ?? null;
    }
    return {
      rows: results.map((r) => ({
        id: String(r.id),
        modifiedAt: r.updatedAt ?? null,
        values: { ...(r.properties ?? {}), ...(wantsCompany ? { [COMPANY_LINK]: r.__company ?? null } : {}) },
      })),
      next,
    };
  },

  async update(ctx, object, id, values) {
    const props = encode(values);
    if (Object.keys(props).length) await call(ctx, `${API}/crm/v3/objects/${encodeURIComponent(object)}/${encodeURIComponent(id)}`, { method: 'PATCH', json: { properties: props } });
    if (COMPANY_LINK in values) await associate(ctx, object, id, values[COMPANY_LINK]);
  },

  async create(ctx, object, values) {
    const j = await call(ctx, `${API}/crm/v3/objects/${encodeURIComponent(object)}`, { method: 'POST', json: { properties: encode(values) } });
    const id = j?.id ? String(j.id) : '';
    if (!id) throw new CrmError('HubSpot did not return an id');
    if (COMPANY_LINK in values) await associate(ctx, object, id, values[COMPANY_LINK]);
    return id;
  },

  url(config, object, id) {
    const typeId = STANDARD.find((s) => s.name === object)?.typeId ?? (/^2-\d+$/.test(object) ? object : null);
    return config.portalId && typeId ? `https://app.hubspot.com/contacts/${config.portalId}/record/${typeId}/${id}` : null;
  },
};
