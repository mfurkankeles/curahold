// Microsoft Dynamics 365 (Dataverse Web API). The administrator gives the
// environment address first (e.g. https://contoso.crm4.dynamics.com);
// sign-in asks for access to that environment only.
import type { ObjectHint, RemoteField, RemoteFieldType, RemoteObject } from '../../../../shared/src/sync';
import { call, CrmError, oneShotCtx, refreshGrant, type CrmAdapter, type CrmCtx } from './types';

const LOGIN = 'https://login.microsoftonline.com/organizations/oauth2/v2.0';
const STANDARD = ['account', 'contact', 'opportunity', 'incident', 'task', 'lead', 'contract', 'quote', 'salesorder', 'invoice'];
const HINTS: Record<string, ObjectHint> = { account: 'account', contact: 'contact', opportunity: 'opportunity', incident: 'ticket', task: 'task' };
const SKIP = new Set(['createdon', 'modifiedon', 'versionnumber', 'importsequencenumber', 'overriddencreatedon', 'timezoneruleversionnumber', 'utcconversiontimezonecode']);

export function orgUrlOf(raw: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
    if (u.protocol !== 'https:' || !/\.(crm\d*\.dynamics\.com|crm\.microsoftdynamics\.(de|us)|crm\.dynamics\.cn)$/i.test(u.hostname)) return null;
    return `https://${u.hostname.toLowerCase()}`;
  } catch {
    return null;
  }
}

const api = (ctx: CrmCtx) => `${ctx.config.orgUrl}/api/data/v9.2`;
const label = (l: any) => l?.UserLocalizedLabel?.Label ?? l?.LocalizedLabels?.[0]?.Label ?? null;

const meta = new Map<string, { set: string; pk: string }>();
async function entity(ctx: CrmCtx, logical: string) {
  const k = `${ctx.config.orgUrl}|${logical}`;
  let m = meta.get(k);
  if (!m) {
    const j = await call(ctx, `${api(ctx)}/EntityDefinitions(LogicalName='${logical}')?$select=EntitySetName,PrimaryIdAttribute`);
    m = { set: j.EntitySetName, pk: j.PrimaryIdAttribute };
    meta.set(k, m);
  }
  return m;
}

function typeOf(a: any): RemoteFieldType | null {
  switch (a.AttributeType) {
    case 'String':
      return /email/.test(a.LogicalName) ? 'email' : /url$|website/.test(a.LogicalName) ? 'url' : /telephone|phone|fax/.test(a.LogicalName) ? 'phone' : 'text';
    case 'Memo':
      return 'textarea';
    case 'Integer':
    case 'BigInt':
    case 'Decimal':
    case 'Double':
      return 'number';
    case 'Money':
      return 'money';
    case 'DateTime':
      return 'datetime';
    case 'Boolean':
      return 'bool';
    case 'Picklist':
    case 'State':
    case 'Status':
      return 'select';
    case 'Lookup':
    case 'Customer':
      return 'ref';
    case 'Owner':
      return 'user';
    case 'Uniqueidentifier':
      return 'id';
    default:
      return null;
  }
}

async function optionSets(ctx: CrmCtx, logical: string): Promise<Map<string, { value: string; label: string }[]>> {
  const out = new Map<string, { value: string; label: string }[]>();
  for (const cast of ['PicklistAttributeMetadata', 'StatusAttributeMetadata', 'StateAttributeMetadata']) {
    const j = await call(ctx, `${api(ctx)}/EntityDefinitions(LogicalName='${logical}')/Attributes/Microsoft.Dynamics.CRM.${cast}?$select=LogicalName&$expand=OptionSet($select=Options)`);
    for (const a of j?.value ?? []) {
      const opts = (a.OptionSet?.Options ?? []).map((o: any) => ({ value: String(o.Value), label: label(o.Label) ?? String(o.Value) }));
      out.set(a.LogicalName, opts);
    }
  }
  return out;
}

async function relations(ctx: CrmCtx, logical: string): Promise<Map<string, Record<string, string>>> {
  const j = await call(ctx, `${api(ctx)}/EntityDefinitions(LogicalName='${logical}')/ManyToOneRelationships?$select=ReferencingAttribute,ReferencedEntity,ReferencingEntityNavigationPropertyName`);
  const out = new Map<string, Record<string, string>>();
  for (const r of j?.value ?? []) {
    const m = out.get(r.ReferencingAttribute) ?? {};
    m[r.ReferencedEntity] = r.ReferencingEntityNavigationPropertyName;
    out.set(r.ReferencingAttribute, m);
  }
  return out;
}

async function dateOnly(ctx: CrmCtx, logical: string): Promise<Set<string>> {
  const j = await call(ctx, `${api(ctx)}/EntityDefinitions(LogicalName='${logical}')/Attributes/Microsoft.Dynamics.CRM.DateTimeAttributeMetadata?$select=LogicalName,Format`);
  return new Set((j?.value ?? []).filter((a: any) => a.Format === 'DateOnly').map((a: any) => a.LogicalName));
}

async function encode(ctx: CrmCtx, values: Record<string, unknown>, fields: RemoteField[]) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    const f = fields.find((x) => x.name === k);
    if (!f) continue;
    if (f.type === 'user') {
      if (v) out['ownerid@odata.bind'] = `/systemusers(${v})`;
      continue;
    }
    if (f.type === 'ref') {
      const navs = (f.extra?.navs ?? {}) as Record<string, string>;
      const target = navs.account ? 'account' : Object.keys(navs)[0];
      if (!target) continue;
      const nav = navs[target];
      if (v) out[`${nav}@odata.bind`] = `/${(await entity(ctx, target)).set}(${v})`;
      else out[`${nav}@odata.bind`] = null;
      continue;
    }
    out[k] = f.type === 'select' && v !== null && v !== '' ? Number(v) : v === '' ? null : v;
  }
  return out;
}

export const dynamics: CrmAdapter = {
  provider: 'dynamics',
  tabular: false,
  oauth: {
    authorizeUrl(client, redirectUri, state, opts) {
      const u = new URL(`${LOGIN}/authorize`);
      u.searchParams.set('client_id', client.clientId);
      u.searchParams.set('response_type', 'code');
      u.searchParams.set('redirect_uri', redirectUri);
      u.searchParams.set('scope', `${opts.orgUrl}/user_impersonation offline_access openid`);
      u.searchParams.set('prompt', 'select_account');
      u.searchParams.set('state', state);
      return u.toString();
    },
    async exchange(fetcher, client, code, redirectUri, opts, now) {
      const orgUrl = orgUrlOf(opts.orgUrl ?? '');
      if (!orgUrl) throw new CrmError('Unknown Dynamics address');
      const res = await fetcher(`${LOGIN}/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: client.clientId, client_secret: client.clientSecret, scope: `${orgUrl}/user_impersonation offline_access` }),
      });
      if (!res.ok) throw new CrmError(`Sign-in failed (${res.status})`, res.status, undefined, true);
      const j: any = await res.json();
      const config = { orgUrl };
      let name = new URL(orgUrl).hostname.split('.')[0];
      try {
        const o = await call(oneShotCtx(fetcher, now, j.access_token, config), `${orgUrl}/api/data/v9.2/organizations?$select=name`);
        name = o?.value?.[0]?.name ?? name;
      } catch {
        // cosmetic
      }
      return {
        secret: { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: j.expires_in ? now.getTime() + j.expires_in * 1000 : undefined },
        config,
        label: name,
        instanceId: new URL(orgUrl).hostname,
      };
    },
  },
  // Unlike the others, Dynamics needs the scope on the refresh call too.
  async refresh(ctx, secret, client) {
    if (!secret.refreshToken) throw new CrmError('Reconnect Dynamics 365', 401, undefined, true);
    return refreshGrant(ctx.fetch, `${LOGIN}/token`, client, secret.refreshToken, ctx.now(), { scope: `${ctx.config.orgUrl}/user_impersonation offline_access` });
  },

  async objects(ctx) {
    const j = await call(ctx, `${api(ctx)}/EntityDefinitions?$select=LogicalName,EntitySetName,DisplayName,DisplayCollectionName,IsCustomEntity,IsValidForAdvancedFind`);
    const out: RemoteObject[] = [];
    for (const e of j?.value ?? []) {
      if (!e.EntitySetName || !e.IsValidForAdvancedFind) continue;
      if (!e.IsCustomEntity && !STANDARD.includes(e.LogicalName)) continue;
      const l = label(e.DisplayName) ?? e.LogicalName;
      out.push({ name: e.LogicalName, label: l, labelPlural: label(e.DisplayCollectionName) ?? l, custom: !!e.IsCustomEntity, hint: HINTS[e.LogicalName] ?? null });
      meta.set(`${ctx.config.orgUrl}|${e.LogicalName}`, { set: e.EntitySetName, pk: `${e.LogicalName}id` });
    }
    return out.sort((a, b) => (a.custom ? 1 : 0) - (b.custom ? 1 : 0) || STANDARD.indexOf(a.name) - STANDARD.indexOf(b.name) || a.label.localeCompare(b.label));
  },

  async fields(ctx, object) {
    const [j, opts, rels, dates] = await Promise.all([
      call(ctx, `${api(ctx)}/EntityDefinitions(LogicalName='${object}')/Attributes?$select=LogicalName,DisplayName,AttributeType,IsValidForUpdate,IsValidForCreate,IsValidForRead,AttributeOf,RequiredLevel`),
      optionSets(ctx, object),
      relations(ctx, object),
      dateOnly(ctx, object),
    ]);
    const { pk } = await entity(ctx, object);
    const out: RemoteField[] = [];
    for (const a of j?.value ?? []) {
      if (a.AttributeOf || a.IsValidForRead === false || SKIP.has(a.LogicalName)) continue;
      let type = typeOf(a);
      if (!type || (type === 'id' && a.LogicalName !== pk)) continue;
      if (type === 'datetime' && dates.has(a.LogicalName)) type = 'date';
      const navs = rels.get(a.LogicalName);
      if (type === 'ref' && !navs) continue;
      out.push({
        name: a.LogicalName,
        label: label(a.DisplayName) ?? a.LogicalName,
        type,
        options: opts.get(a.LogicalName),
        refTo: navs ? Object.keys(navs) : undefined,
        updatable: !!a.IsValidForUpdate && type !== 'id',
        createable: !!a.IsValidForCreate,
        required: a.RequiredLevel?.Value === 'ApplicationRequired',
        extra: navs ? { navs } : undefined,
      });
    }
    return out;
  },

  async users(ctx) {
    const out = [];
    let next: string | null = `${api(ctx)}/systemusers?$select=systemuserid,fullname,internalemailaddress&$filter=isdisabled eq false and accessmode eq 0`;
    while (next) {
      const j: any = await call(ctx, next, { headers: { prefer: 'odata.maxpagesize=500' } });
      for (const u of j?.value ?? []) out.push({ id: u.systemuserid, name: u.fullname, email: u.internalemailaddress ? String(u.internalemailaddress).toLowerCase() : null });
      next = j?.['@odata.nextLink'] ?? null;
    }
    return out;
  },

  async list(ctx, object, opts) {
    const { set, pk } = await entity(ctx, object);
    let url = opts.cursor;
    if (!url) {
      const cols = [...new Set([pk, 'modifiedon', ...opts.fields.map((f) => (f.type === 'ref' || f.type === 'user' ? `_${f.name}_value` : f.name))])];
      // OData wants %20, not +, between words.
      const q = [`$select=${cols.join(',')}`];
      if (opts.since) q.push(`$filter=${encodeURIComponent(`modifiedon ge ${new Date(opts.since).toISOString()}`)}`);
      q.push(`$orderby=${encodeURIComponent('modifiedon asc')}`);
      url = `${api(ctx)}/${set}?${q.join('&')}`;
    }
    const j = await call(ctx, url, { headers: { prefer: 'odata.maxpagesize=500' } });
    return {
      rows: (j?.value ?? []).map((r: any) => {
        const values: Record<string, unknown> = {};
        for (const f of opts.fields) values[f.name] = f.type === 'ref' || f.type === 'user' ? (r[`_${f.name}_value`] ?? null) : (r[f.name] ?? null);
        if (values[pk] === undefined) values[pk] = r[pk];
        return { id: String(r[pk]), modifiedAt: r.modifiedon ?? null, values };
      }),
      next: j?.['@odata.nextLink'] ?? null,
    };
  },

  async update(ctx, object, id, values, fields) {
    const { set } = await entity(ctx, object);
    await call(ctx, `${api(ctx)}/${set}(${id})`, { method: 'PATCH', headers: { 'if-match': '*' }, json: await encode(ctx, values, fields) });
  },

  async create(ctx, object, values, fields) {
    const { set, pk } = await entity(ctx, object);
    const j = await call(ctx, `${api(ctx)}/${set}?$select=${pk}`, { method: 'POST', headers: { prefer: 'return=representation' }, json: await encode(ctx, values, fields) });
    if (!j?.[pk]) throw new CrmError('Dynamics did not return an id');
    return String(j[pk]);
  },

  url(config, object, id) {
    return config.orgUrl ? `${config.orgUrl}/main.aspx?etn=${encodeURIComponent(object)}&id=${encodeURIComponent(id)}&pagetype=entityrecord` : null;
  },
};
