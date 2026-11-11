// Zoho CRM (API v6). Zoho runs separate data centres; the sign-in callback
// says which one the customer is on, and every later call goes there.
import type { ObjectHint, RemoteField, RemoteFieldType, RemoteObject } from '../../../../shared/src/sync';
import { call, CrmError, oneShotCtx, refreshGrant, type CrmAdapter, type CrmCtx } from './types';

const SCOPES = 'ZohoCRM.modules.ALL,ZohoCRM.settings.ALL,ZohoCRM.users.READ,ZohoCRM.org.READ';
const STANDARD = ['Accounts', 'Contacts', 'Deals', 'Cases', 'Tasks', 'Leads', 'Quotes', 'Sales_Orders', 'Invoices'];
const HINTS: Record<string, ObjectHint> = { Accounts: 'account', Contacts: 'contact', Deals: 'opportunity', Tasks: 'task' };

/** Only Zoho's own sign-in hosts are accepted from the callback. */
export function zohoAccountsServer(raw: string | undefined): string | null {
  if (!raw) return 'https://accounts.zoho.com';
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && /^accounts\.zoho\.(com|eu|in|com\.au|jp|ca|sa|uk|com\.cn)$/.test(u.hostname) ? `https://${u.hostname}` : null;
  } catch {
    return null;
  }
}

const api = (ctx: CrmCtx) => `${String(ctx.config.apiDomain).replace(/\/$/, '')}/crm/v6`;
const z = (ctx: CrmCtx, url: string, init: Parameters<typeof call>[2] = {}) => call(ctx, url, init, 'zoho');

function typeOf(f: any): RemoteFieldType | null {
  switch (f.data_type) {
    case 'text':
    case 'autonumber':
      return 'text';
    case 'textarea':
      return 'textarea';
    case 'email':
      return 'email';
    case 'phone':
      return 'phone';
    case 'website':
      return 'url';
    case 'picklist':
      return 'select';
    case 'multiselectpicklist':
      return 'multiselect';
    case 'integer':
    case 'bigint':
    case 'double':
    case 'decimal':
      return 'number';
    case 'currency':
      return 'money';
    case 'percent':
      return 'percent';
    case 'date':
      return 'date';
    case 'datetime':
      return 'datetime';
    case 'boolean':
      return 'bool';
    case 'lookup':
      return 'ref';
    case 'ownerlookup':
      return 'user';
    default:
      return null;
  }
}

function flatten(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' && x ? (x as any).name ?? (x as any).id : x)).join('; ');
  if (typeof v === 'object') return (v as any).id ?? null;
  return v;
}

function encode(values: Record<string, unknown>, fields: RemoteField[]) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    const f = fields.find((x) => x.name === k);
    if (!f) continue;
    if (v === null || v === '') out[k] = null;
    else if (f.type === 'user' || f.type === 'ref') out[k] = { id: String(v) };
    else if (f.type === 'multiselect') out[k] = String(v).split(/;\s*/).filter(Boolean);
    else out[k] = v;
  }
  return out;
}

function check(j: any): any {
  const r = j?.data?.[0];
  if (r && r.status === 'error') throw new CrmError(r.message ?? r.code ?? 'Zoho rejected the change', 400);
  return r;
}

export const zoho: CrmAdapter = {
  provider: 'zoho',
  tabular: false,
  oauth: {
    authorizeUrl(client, redirectUri, state) {
      const u = new URL('https://accounts.zoho.com/oauth/v2/auth');
      u.searchParams.set('scope', SCOPES);
      u.searchParams.set('client_id', client.clientId);
      u.searchParams.set('response_type', 'code');
      u.searchParams.set('access_type', 'offline');
      u.searchParams.set('prompt', 'consent');
      u.searchParams.set('redirect_uri', redirectUri);
      u.searchParams.set('state', state);
      return u.toString();
    },
    async exchange(fetcher, client, code, redirectUri, opts, now) {
      const accountsServer = zohoAccountsServer(opts['accounts-server']);
      if (!accountsServer) throw new CrmError('Unknown Zoho data centre');
      const res = await fetcher(`${accountsServer}/oauth/v2/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: client.clientId, client_secret: client.clientSecret }),
      });
      const j: any = await res.json().catch(() => ({}));
      if (!res.ok || !j.access_token) throw new CrmError(j.error ?? `Sign-in failed (${res.status})`, res.status, undefined, true);
      const config = { apiDomain: j.api_domain, accountsServer };
      const org = await call(oneShotCtx(fetcher, now, j.access_token, config), `${String(j.api_domain).replace(/\/$/, '')}/crm/v6/org`, {}, 'zoho');
      const o = org?.org?.[0] ?? {};
      return {
        secret: { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: j.expires_in ? now.getTime() + j.expires_in * 1000 : undefined },
        config: { ...config, orgId: o.id ? String(o.id) : null },
        label: o.company_name ?? 'Zoho CRM',
        instanceId: o.id ? String(o.id) : String(j.api_domain),
      };
    },
  },

  async refresh(ctx, secret, client) {
    if (!secret.refreshToken) throw new CrmError('Reconnect Zoho CRM', 401, undefined, true);
    return refreshGrant(ctx.fetch, `${ctx.config.accountsServer ?? 'https://accounts.zoho.com'}/oauth/v2/token`, client, secret.refreshToken, ctx.now());
  },

  async objects(ctx) {
    const j = await z(ctx, `${api(ctx)}/settings/modules`);
    const out: RemoteObject[] = [];
    for (const m of j?.modules ?? []) {
      const custom = m.generated_type === 'custom';
      if (!m.api_supported || (!custom && !STANDARD.includes(m.api_name))) continue;
      out.push({ name: m.api_name, label: m.singular_label ?? m.api_name, labelPlural: m.plural_label ?? m.api_name, custom, hint: HINTS[m.api_name] ?? null });
    }
    return out.sort((a, b) => (a.custom ? 1 : 0) - (b.custom ? 1 : 0) || STANDARD.indexOf(a.name) - STANDARD.indexOf(b.name));
  },

  async fields(ctx, object) {
    const j = await z(ctx, `${api(ctx)}/settings/fields?module=${encodeURIComponent(object)}`);
    const out: RemoteField[] = [];
    for (const f of j?.fields ?? []) {
      const type = typeOf(f);
      if (!type) continue;
      const updatable = !f.read_only && !f.field_read_only && f.data_type !== 'autonumber' && !f.formula;
      out.push({
        name: f.api_name,
        label: f.field_label ?? f.api_name,
        type,
        options: f.pick_list_values?.length ? f.pick_list_values.filter((p: any) => p.actual_value !== '-None-').map((p: any) => ({ value: p.actual_value, label: p.display_value ?? p.actual_value })) : undefined,
        refTo: f.lookup?.module?.api_name ? [f.lookup.module.api_name] : undefined,
        updatable,
        createable: updatable,
        required: !!f.system_mandatory,
      });
    }
    return out;
  },

  async users(ctx) {
    const out = [];
    for (let page = 1; page < 50; page++) {
      const j = await z(ctx, `${api(ctx)}/users?type=ActiveUsers&per_page=200&page=${page}`);
      for (const u of j?.users ?? []) out.push({ id: String(u.id), name: u.full_name ?? u.email, email: u.email ? String(u.email).toLowerCase() : null });
      if (!j?.info?.more_records) break;
    }
    return out;
  },

  async list(ctx, object, opts) {
    const names = [...new Set(['Modified_Time', ...opts.fields.map((f) => f.name).filter((n) => n !== 'id')])].slice(0, 50);
    const u = new URL(`${api(ctx)}/${encodeURIComponent(object)}`);
    u.searchParams.set('fields', names.join(','));
    u.searchParams.set('per_page', '200');
    u.searchParams.set('sort_by', 'Modified_Time');
    u.searchParams.set('sort_order', 'asc');
    if (opts.cursor) u.searchParams.set('page_token', opts.cursor);
    const headers: Record<string, string> = {};
    if (opts.since) headers['if-modified-since'] = new Date(opts.since).toISOString();
    const j = await z(ctx, u.toString(), { headers });
    return {
      rows: (j?.data ?? []).map((r: any) => {
        const values: Record<string, unknown> = { id: r.id };
        for (const f of opts.fields) values[f.name] = flatten(r[f.name]);
        return { id: String(r.id), modifiedAt: r.Modified_Time ?? null, values };
      }),
      next: j?.info?.more_records ? (j.info.next_page_token ?? null) : null,
    };
  },

  async deleted(ctx, object, since) {
    const j = await z(ctx, `${api(ctx)}/${encodeURIComponent(object)}/deleted?type=all&per_page=200`, { headers: { 'if-modified-since': new Date(since).toISOString() } });
    return (j?.data ?? []).map((d: any) => String(d.id));
  },

  async update(ctx, object, id, values, fields) {
    check(await z(ctx, `${api(ctx)}/${encodeURIComponent(object)}`, { method: 'PUT', json: { data: [{ id, ...encode(values, fields) }] } }));
  },

  async create(ctx, object, values, fields) {
    const r = check(await z(ctx, `${api(ctx)}/${encodeURIComponent(object)}`, { method: 'POST', json: { data: [encode(values, fields)] } }));
    if (!r?.details?.id) throw new CrmError('Zoho did not return an id');
    return String(r.details.id);
  },

  url(config, object, id) {
    const m = /zohoapis\.([a-z.]+)$/.exec(config.apiDomain ? new URL(config.apiDomain).hostname : '');
    return m ? `https://crm.zoho.${m[1]}/crm/tab/${object}/${id}` : null;
  },
};
