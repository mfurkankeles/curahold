// Pipedrive: organizations, people, deals and activities (API v1). Changes
// since the last run come from the "recents" feed; custom fields are keyed
// by Pipedrive's own field hashes.
import type { ObjectHint, RemoteField, RemoteFieldType, RemoteObject } from '../../../../shared/src/sync';
import { call, codeGrant, CrmError, oneShotCtx, refreshGrant, type CrmAdapter, type CrmCtx } from './types';

const TOKEN = 'https://oauth.pipedrive.com/oauth/token';
const OBJECTS: { name: string; singular: string; fields: string; label: string; plural: string; hint: ObjectHint }[] = [
  { name: 'organizations', singular: 'organization', fields: 'organizationFields', label: 'Organization', plural: 'Organizations', hint: 'account' },
  { name: 'persons', singular: 'person', fields: 'personFields', label: 'Person', plural: 'People', hint: 'contact' },
  { name: 'deals', singular: 'deal', fields: 'dealFields', label: 'Deal', plural: 'Deals', hint: 'opportunity' },
  { name: 'activities', singular: 'activity', fields: 'activityFields', label: 'Activity', plural: 'Activities', hint: 'task' },
];
const EDITABLE = new Set(['name', 'owner_id', 'org_id', 'person_id', 'title', 'value', 'currency', 'expected_close_date', 'status', 'stage_id', 'email', 'phone', 'subject', 'due_date', 'done', 'user_id', 'note', 'label', 'address', 'probability', 'public_description']);
const MULTI = new Set(['email', 'phone']);

const obj = (name: string) => {
  const o = OBJECTS.find((x) => x.name === name);
  if (!o) throw new CrmError(`Unknown Pipedrive object ${name}`);
  return o;
};
const base = (ctx: CrmCtx) => `${String(ctx.config.apiDomain).replace(/\/$/, '')}/api/v1`;

function typeOf(f: any): RemoteFieldType | null {
  if (f.key === 'id') return 'id';
  if (f.key === 'done') return 'bool';
  if (MULTI.has(f.key)) return f.key === 'email' ? 'email' : 'phone';
  switch (f.field_type) {
    case 'varchar':
    case 'varchar_auto':
    case 'address':
    case 'varchar_options':
      return 'text';
    case 'text':
      return 'textarea';
    case 'double':
    case 'int':
      return 'number';
    case 'monetary':
      return 'money';
    case 'date':
      return 'date';
    case 'enum':
    case 'status':
    case 'stage':
    case 'visible_to':
      return 'select';
    case 'set':
      return 'multiselect';
    case 'user':
      return 'user';
    case 'org':
    case 'people':
      return 'ref';
    case 'phone':
      return 'phone';
    case 'boolean':
      return 'bool';
    default:
      return null;
  }
}

/** Pipedrive nests ids ({value, name}, {id, name}) and lists emails; flatten to what the mapping needs. */
function flatten(key: string, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (MULTI.has(key) && Array.isArray(v)) {
    const primary = v.find((x: any) => x?.primary) ?? v[0];
    return primary?.value || null;
  }
  if (typeof v === 'object' && !Array.isArray(v)) {
    const o = v as any;
    return o.value ?? o.id ?? null;
  }
  return v;
}

function encode(values: Record<string, unknown>, fields: RemoteField[]) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    const f = fields.find((x) => x.name === k);
    if (!f) continue;
    if (v === null || v === '') out[k] = null;
    else if (f.type === 'bool') out[k] = v ? 1 : 0;
    else if (f.type === 'user' || f.type === 'ref' || (f.type === 'select' && /^\d+$/.test(String(v)))) out[k] = Number(v);
    else out[k] = v;
  }
  return out;
}

const toIso = (s: unknown) => (typeof s === 'string' && s ? `${s.replace(' ', 'T')}Z` : null);

export const pipedrive: CrmAdapter = {
  provider: 'pipedrive',
  tabular: false,
  oauth: {
    authorizeUrl(client, redirectUri, state) {
      const u = new URL('https://oauth.pipedrive.com/oauth/authorize');
      u.searchParams.set('client_id', client.clientId);
      u.searchParams.set('redirect_uri', redirectUri);
      u.searchParams.set('state', state);
      return u.toString();
    },
    async exchange(fetcher, client, code, redirectUri, _opts, now) {
      const j = await codeGrant(fetcher, TOKEN, client, code, redirectUri, now, true);
      const config = { apiDomain: j.api_domain };
      const me = await call(oneShotCtx(fetcher, now, j.access_token, config), `${String(j.api_domain).replace(/\/$/, '')}/api/v1/users/me`);
      const companyId = String(me?.data?.company_id ?? '');
      return {
        secret: { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: j.expiresAt },
        config: { ...config, companyId },
        label: me?.data?.company_name ?? 'Pipedrive',
        instanceId: companyId || String(j.api_domain),
      };
    },
  },

  async refresh(ctx, secret, client) {
    if (!secret.refreshToken) throw new CrmError('Reconnect Pipedrive', 401, undefined, true);
    return refreshGrant(ctx.fetch, TOKEN, client, secret.refreshToken, ctx.now(), {}, true);
  },

  async objects() {
    return OBJECTS.map<RemoteObject>((o) => ({ name: o.name, label: o.label, labelPlural: o.plural, custom: false, hint: o.hint }));
  },

  async fields(ctx, object) {
    const o = obj(object);
    const j = await call(ctx, `${base(ctx)}/${o.fields}?limit=500`);
    let stages: { value: string; label: string }[] | undefined;
    if (object === 'deals') {
      const s = await call(ctx, `${base(ctx)}/stages`);
      stages = (s?.data ?? []).map((x: any) => ({ value: String(x.id), label: x.pipeline_name ? `${x.pipeline_name} · ${x.name}` : x.name }));
    }
    const out: RemoteField[] = [];
    for (const f of j?.data ?? []) {
      const type = typeOf(f);
      if (!type) continue;
      const options =
        f.key === 'stage_id' ? stages : f.options?.length ? f.options.map((x: any) => ({ value: String(x.id), label: String(x.label) })) : undefined;
      const updatable = type !== 'id' && (!!f.edit_flag || EDITABLE.has(f.key));
      out.push({
        name: f.key,
        label: f.name,
        type,
        options,
        refTo: f.field_type === 'org' ? ['organizations'] : f.field_type === 'people' ? ['persons'] : undefined,
        updatable,
        createable: updatable,
        required: !!f.mandatory_flag,
      });
    }
    return out;
  },

  async users(ctx) {
    const j = await call(ctx, `${base(ctx)}/users`);
    return (j?.data ?? []).filter((u: any) => u.active_flag !== false).map((u: any) => ({ id: String(u.id), name: u.name, email: u.email ? String(u.email).toLowerCase() : null }));
  },

  async list(ctx, object, opts) {
    const o = obj(object);
    const start = Number(opts.cursor ?? 0);
    let items: any[];
    let more: any;
    if (opts.since) {
      const since = new Date(opts.since).toISOString().replace('T', ' ').slice(0, 19);
      const j = await call(ctx, `${base(ctx)}/recents?since_timestamp=${encodeURIComponent(since)}&items=${o.singular}&start=${start}&limit=500`);
      items = (j?.data ?? []).filter((x: any) => x.item === o.singular && x.data).map((x: any) => x.data);
      more = j?.additional_data?.pagination;
    } else {
      const j = await call(ctx, `${base(ctx)}/${object}?start=${start}&limit=500&sort=${encodeURIComponent('update_time ASC')}`);
      items = j?.data ?? [];
      more = j?.additional_data?.pagination;
    }
    return {
      rows: items
        .filter((r) => r.active_flag !== false && r.deleted !== true)
        .map((r) => {
          const values: Record<string, unknown> = {};
          for (const f of opts.fields) values[f.name] = flatten(f.name, r[f.name]);
          return { id: String(r.id), modifiedAt: toIso(r.update_time), values };
        }),
      next: more?.more_items_in_collection ? String(more.next_start ?? start + 500) : null,
    };
  },

  async update(ctx, object, id, values, fields) {
    await call(ctx, `${base(ctx)}/${object}/${encodeURIComponent(id)}`, { method: 'PUT', json: encode(values, fields) });
  },

  async create(ctx, object, values, fields) {
    const j = await call(ctx, `${base(ctx)}/${object}`, { method: 'POST', json: encode(values, fields) });
    if (!j?.data?.id) throw new CrmError('Pipedrive did not return an id');
    return String(j.data.id);
  },

  url(config, object, id) {
    const o = OBJECTS.find((x) => x.name === object);
    if (!config.apiDomain || !o || object === 'activities') return null;
    return `${String(config.apiDomain).replace(/\/$/, '')}/${o.singular}/${id}`;
  },
};
