// Salesforce: REST API with SOQL. Changes are read by SystemModstamp,
// deletions from the getDeleted endpoint (last 30 days), owners are Users.
import type { ObjectHint, RemoteField, RemoteFieldType, RemoteObject } from '../../../../shared/src/sync';
import { call, codeGrant, CrmError, isoSeconds, oneShotCtx, refreshGrant, type CrmAdapter, type CrmCtx } from './types';

const V = 'v62.0';
const LOGIN = 'https://login.salesforce.com';
const SANDBOX = 'https://test.salesforce.com';

/** Standard objects worth offering; custom objects (…__c) are always offered. */
const STANDARD = ['Account', 'Contact', 'Opportunity', 'Case', 'Task', 'Lead', 'Contract', 'Asset', 'Order', 'Quote', 'Entitlement', 'ServiceContract', 'Campaign'];
const HINTS: Record<string, ObjectHint> = { Account: 'account', Contact: 'contact', Opportunity: 'opportunity', Task: 'task' };

const base = (ctx: CrmCtx) => `${String(ctx.config.instanceUrl).replace(/\/$/, '')}/services/data/${V}`;

function typeOf(f: any): RemoteFieldType | null {
  switch (f.type) {
    case 'id':
      return 'id';
    case 'string':
    case 'encryptedstring':
    case 'combobox':
      return 'text';
    case 'textarea':
      return 'textarea';
    case 'picklist':
      return 'select';
    case 'multipicklist':
      return 'multiselect';
    case 'boolean':
      return 'bool';
    case 'int':
    case 'double':
    case 'long':
      return 'number';
    case 'currency':
      return 'money';
    case 'percent':
      return 'percent';
    case 'date':
      return 'date';
    case 'datetime':
      return 'datetime';
    case 'email':
      return 'email';
    case 'url':
      return 'url';
    case 'phone':
      return 'phone';
    case 'reference':
      return (f.referenceTo ?? []).length === 1 && f.referenceTo[0] === 'User' ? 'user' : 'ref';
    default:
      return null; // address, location, base64, time…: not synced
  }
}

function encode(values: Record<string, unknown>, fields: RemoteField[]) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    const f = fields.find((x) => x.name === k);
    if (!f) continue;
    out[k] = v === '' ? null : v;
  }
  return out;
}

export const salesforce: CrmAdapter = {
  provider: 'salesforce',
  tabular: false,
  oauth: {
    authorizeUrl(client, redirectUri, state, opts) {
      const u = new URL(`${opts.sandbox === '1' ? SANDBOX : LOGIN}/services/oauth2/authorize`);
      u.searchParams.set('response_type', 'code');
      u.searchParams.set('client_id', client.clientId);
      u.searchParams.set('redirect_uri', redirectUri);
      u.searchParams.set('scope', 'api refresh_token');
      u.searchParams.set('prompt', 'consent');
      u.searchParams.set('state', state);
      return u.toString();
    },
    async exchange(fetcher, client, code, redirectUri, opts, now) {
      const loginUrl = opts.sandbox === '1' ? SANDBOX : LOGIN;
      const j = await codeGrant(fetcher, `${loginUrl}/services/oauth2/token`, client, code, redirectUri, now);
      const orgId = String(j.id ?? '').split('/').slice(-2, -1)[0] || 'salesforce';
      const config = { instanceUrl: j.instance_url, loginUrl, orgId };
      let label = 'Salesforce';
      try {
        const r = await call(oneShotCtx(fetcher, now, j.access_token, config), `${j.instance_url}/services/data/${V}/query?q=${encodeURIComponent('SELECT Name FROM Organization')}`);
        label = r?.records?.[0]?.Name ?? label;
      } catch {
        // the label is cosmetic
      }
      return { secret: { accessToken: j.access_token, refreshToken: j.refresh_token }, config, label, instanceId: orgId };
    },
  },

  async refresh(ctx, secret, client) {
    if (!secret.refreshToken) throw new CrmError('Reconnect Salesforce', 401, undefined, true);
    const next = await refreshGrant(ctx.fetch, `${ctx.config.loginUrl ?? LOGIN}/services/oauth2/token`, client, secret.refreshToken, ctx.now());
    if (next.instanceUrl) ctx.config.instanceUrl = next.instanceUrl;
    return next;
  },

  async objects(ctx) {
    const j = await call(ctx, `${base(ctx)}/sobjects`);
    const out: RemoteObject[] = [];
    for (const o of j.sobjects ?? []) {
      const custom = /__c$/.test(o.name);
      if (!o.queryable || !o.retrieveable || o.deprecatedAndHidden) continue;
      if (!custom && !STANDARD.includes(o.name)) continue;
      out.push({ name: o.name, label: o.label, labelPlural: o.labelPlural ?? o.label, custom, hint: HINTS[o.name] ?? null });
    }
    const rank = (o: RemoteObject) => (o.custom ? 1000 : STANDARD.indexOf(o.name));
    return out.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
  },

  async fields(ctx, object) {
    const j = await call(ctx, `${base(ctx)}/sobjects/${encodeURIComponent(object)}/describe`);
    const out: RemoteField[] = [];
    for (const f of j.fields ?? []) {
      const type = typeOf(f);
      if (!type) continue;
      out.push({
        name: f.name,
        label: f.label,
        type,
        options: f.picklistValues?.length ? f.picklistValues.filter((p: any) => p.active !== false).map((p: any) => ({ value: p.value, label: p.label ?? p.value })) : undefined,
        refTo: f.referenceTo?.length ? f.referenceTo : undefined,
        updatable: !!f.updateable && !f.calculated,
        createable: !!f.createable,
        required: !f.nillable && !!f.createable && !f.defaultedOnCreate,
      });
    }
    return out;
  },

  async users(ctx) {
    const q = `SELECT Id, Name, Email FROM User WHERE IsActive = true AND UserType = 'Standard'`;
    const out = [];
    let next: string | null = `${base(ctx)}/query?q=${encodeURIComponent(q)}`;
    while (next) {
      const j: any = await call(ctx, next);
      for (const u of j.records ?? []) out.push({ id: u.Id, name: u.Name, email: u.Email ? String(u.Email).toLowerCase() : null });
      next = j.nextRecordsUrl ? `${String(ctx.config.instanceUrl).replace(/\/$/, '')}${j.nextRecordsUrl}` : null;
    }
    return out;
  },

  async list(ctx, object, opts) {
    let url: string;
    if (opts.cursor) url = `${String(ctx.config.instanceUrl).replace(/\/$/, '')}${opts.cursor}`;
    else {
      const names = [...new Set(['Id', 'SystemModstamp', ...opts.fields.map((f) => f.name)])];
      const where = opts.since ? ` WHERE SystemModstamp >= ${isoSeconds(opts.since)}` : '';
      url = `${base(ctx)}/query?q=${encodeURIComponent(`SELECT ${names.join(', ')} FROM ${object}${where} ORDER BY SystemModstamp ASC`)}`;
    }
    const j = await call(ctx, url);
    return {
      rows: (j.records ?? []).map((r: any) => {
        const { attributes: _a, ...values } = r;
        return { id: r.Id, modifiedAt: r.SystemModstamp ?? null, values };
      }),
      next: j.done === false && j.nextRecordsUrl ? j.nextRecordsUrl : null,
    };
  },

  async deleted(ctx, object, since) {
    const start = new Date(since);
    const now = ctx.now();
    // The service keeps deletions for 30 days; older gaps are caught by the nightly full read.
    if (now.getTime() - start.getTime() > 29 * 86_400_000) return [];
    const j = await call(ctx, `${base(ctx)}/sobjects/${encodeURIComponent(object)}/deleted/?start=${encodeURIComponent(isoSeconds(start.toISOString()))}&end=${encodeURIComponent(isoSeconds(now.toISOString()))}`);
    return (j?.deletedRecords ?? []).map((d: any) => d.id);
  },

  async update(ctx, object, id, values, fields) {
    await call(ctx, `${base(ctx)}/sobjects/${encodeURIComponent(object)}/${encodeURIComponent(id)}`, { method: 'PATCH', json: encode(values, fields) });
  },

  async create(ctx, object, values, fields) {
    const j = await call(ctx, `${base(ctx)}/sobjects/${encodeURIComponent(object)}`, { method: 'POST', json: encode(values, fields) });
    if (!j?.id) throw new CrmError('Salesforce did not return an id');
    return j.id;
  },

  url(config, object, id) {
    return config.instanceUrl ? `${String(config.instanceUrl).replace(/\/$/, '')}/lightning/r/${object}/${id}/view` : null;
  },
};
