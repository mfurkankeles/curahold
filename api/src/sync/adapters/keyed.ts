// CRMs connected with what an administrator brings from the CRM itself (an
// inbound webhook address, an API key, an access token): Bitrix24, Freshsales
// and Zendesk Sell. Nothing has to be registered or approved on Curahold's
// side, so they work from the first day; like the other CRMs they are two-way
// (companies, people and deals come over, changes go back).
//
// Each service is talked to as its own documentation describes:
//   Bitrix24      POST <webhook>/<method>.json, 50 rows a page, `start`
//   Freshsales    <bundle alias>/api/…, "Token token=<key>", rows through a view
//   Zendesk Sell  api.getbase.com/v2/…, Bearer token, rows wrapped in {data}
//
// All three are read newest change first, page by page. A row that changes
// while it is being read moves to the front, so the worst that happens is a
// row read twice; reading oldest first would let a row slip between two pages
// and never be seen again.
import type { ObjectHint, RemoteField, RemoteFieldType, RemoteObject, RemoteUser } from '../../../../shared/src/sync';
import { privateHost } from '../../connectors/messaging/webhook';
import { CrmError, errorText, type CrmAdapter, type CrmCtx, type Page, type RemoteRow } from './types';

type Ctx = Pick<CrmCtx, 'fetch' | 'token'> & { config?: Record<string, any> };

async function request(ctx: Ctx, url: string, init: RequestInit & { json?: unknown } = {}, authorize = true): Promise<any> {
  const headers = new Headers(init.headers);
  if (authorize) headers.set('authorization', await ctx.token());
  headers.set('accept', 'application/json');
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(init.json);
  }
  const res = await ctx.fetch(url, { ...init, headers, body });
  if (res.status === 429 || res.status === 503) {
    const after = Number(res.headers.get('retry-after') ?? 60);
    throw new CrmError(await errorText(res), res.status, Number.isFinite(after) ? after : 60);
  }
  if (res.status === 401 || res.status === 403) throw new CrmError(await errorText(res), res.status, undefined, res.status === 401);
  if (!res.ok) throw new CrmError(await errorText(res), res.status);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const iso = (v: unknown) => {
  if (v === null || v === undefined || v === '') return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const blank = (v: unknown) => (v === '' || v === undefined ? null : v);
const idOrNull = (v: unknown) => (v === null || v === undefined || v === '' || String(v) === '0' ? null : String(v));
const objectsOf = (list: { name: string; label: string; plural: string; hint: ObjectHint }[]) => list.map<RemoteObject>((o) => ({ name: o.name, label: o.label, labelPlural: o.plural, custom: false, hint: o.hint }));
const never = async (): Promise<never> => {
  throw new CrmError('The key no longer works; connect again with a new one', 401, undefined, true);
};
/** The company a person or a deal belongs to, under one name whatever the service calls it. */
const COMPANY = '__company';
/** Open, won or lost, worked out from the stage, for services whose deals do not say it themselves. */
const STATUS: RemoteField = { name: 'status', label: 'Status (open, won, lost)', type: 'select', options: ['open', 'won', 'lost'].map((v) => ({ value: v, label: v })), updatable: false, createable: false };

/** Asked once per run, however many pages need it. */
const memo = new WeakMap<object, Map<string, Promise<unknown>>>();
function once<T>(ctx: object, key: string, load: () => Promise<T>): Promise<T> {
  let m = memo.get(ctx);
  if (!m) memo.set(ctx, (m = new Map()));
  if (!m.has(key)) m.set(key, load());
  return m.get(key) as Promise<T>;
}

// ------------------------------------------------------------------ Bitrix24

const B24 = [
  { name: 'company', label: 'Company', plural: 'Companies', hint: 'account' as ObjectHint },
  { name: 'contact', label: 'Contact', plural: 'Contacts', hint: 'contact' as ObjectHint },
  { name: 'deal', label: 'Deal', plural: 'Deals', hint: 'opportunity' as ObjectHint },
];
const B24_PAGE = 50;
const B24_MULTI: Record<string, RemoteFieldType> = { EMAIL: 'email', PHONE: 'phone', WEB: 'url' };
/** P: in progress, S: success, F: failure. */
const B24_SEMANTIC = 'STAGE_SEMANTIC_ID';

function b24Object(name: string) {
  if (!B24.some((o) => o.name === name)) throw new CrmError(`Unknown Bitrix24 object ${name}`);
  return name;
}
/** Every call is a POST to the inbound webhook; errors come back as { error, error_description }. */
async function b24(ctx: Ctx, method: string, params: Record<string, unknown> = {}): Promise<any> {
  const base = String(await ctx.token()).replace(/\/+$/, '');
  const j = await request(ctx, `${base}/${method}.json`, { method: 'POST', json: params }, false);
  // An error can come back with a 200 too, and its code may be empty with only the description filled in.
  if (j && typeof j === 'object' && j.result === undefined && (j.error || j.error_description)) throw new CrmError(String(j.error_description || j.error).slice(0, 300), 400);
  return j;
}
function b24Type(key: string, f: any): RemoteFieldType | null {
  if (key === 'ID') return 'id';
  if (B24_MULTI[key]) return B24_MULTI[key];
  switch (f.type) {
    case 'string':
      return 'text';
    case 'text':
      return 'textarea';
    case 'integer':
    case 'double':
      return 'number';
    case 'money':
      return 'money';
    case 'date':
      return 'date';
    case 'datetime':
      return 'datetime';
    case 'char':
    case 'boolean':
      return 'bool';
    case 'enumeration':
      return f.isMultiple ? 'multiselect' : 'select';
    case 'crm_status':
      return 'select';
    case 'user':
      return 'user';
    case 'crm_company':
    case 'crm_contact':
      return f.isMultiple ? null : 'ref';
    case 'url':
      return 'url';
    default:
      return null;
  }
}

/** The address an administrator pastes: https://<portal>/rest/<user id>/<code>/, with or without a method after it. */
export function bitrixWebhook(raw: string): { base: string; host: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new CrmError('Paste the inbound webhook address from Bitrix24 (it starts with https:// and has /rest/ in it)', 400);
  }
  const m = /^\/rest\/(\d+)\/([A-Za-z0-9]{8,})(?:\/[\w.]*)?\/?$/.exec(url.pathname);
  if (url.protocol !== 'https:' || url.username || url.password || !m || privateHost(url.hostname)) {
    throw new CrmError('That is not an inbound webhook address: it looks like https://yourcompany.bitrix24.com/rest/1/xxxxxxxx/', 400);
  }
  return { base: `${url.origin}/rest/${m[1]}/${m[2]}`, host: url.host.toLowerCase() };
}

export const bitrix24: CrmAdapter = {
  provider: 'bitrix24',
  tabular: false,
  keyed: {
    async connect(fetcher, values) {
      const { base, host } = bitrixWebhook(values.webhook ?? '');
      // Asking for the company fields proves the webhook works and may read the CRM.
      await b24({ fetch: fetcher, token: async () => base }, 'crm.company.fields');
      return { secret: { accessToken: base }, config: { host }, label: host, instanceId: host };
    },
  },
  refresh: never,

  async objects() {
    return objectsOf(B24);
  },

  async fields(ctx, object) {
    const j = await b24(ctx, `crm.${b24Object(object)}.fields`);
    const out: RemoteField[] = [];
    const statuses = new Map<string, { value: string; label: string }[]>();
    for (const [key, f] of Object.entries<any>(j?.result ?? {})) {
      if (key === B24_SEMANTIC) {
        out.push({ ...STATUS });
        continue;
      }
      const type = b24Type(key, f);
      if (!type) continue;
      let options: { value: string; label: string }[] | undefined;
      if (f.type === 'enumeration') options = (f.items ?? []).map((x: any) => ({ value: String(x.ID), label: String(x.VALUE) }));
      else if (f.type === 'crm_status' && f.statusType) {
        if (!statuses.has(f.statusType)) {
          const s = await b24(ctx, 'crm.status.list', { filter: { ENTITY_ID: f.statusType }, order: { SORT: 'ASC' } });
          statuses.set(f.statusType, (s?.result ?? []).map((x: any) => ({ value: String(x.STATUS_ID), label: String(x.NAME) })));
        }
        options = statuses.get(f.statusType);
      }
      // E-mail, phone and web are lists on the other side: read as their first entry, written only on a new record.
      const multi = !!B24_MULTI[key];
      const writable = type !== 'id' && !f.isReadOnly;
      out.push({
        name: key,
        label: String(f.formLabel ?? f.listLabel ?? f.title ?? key),
        type,
        options,
        refTo: f.type === 'crm_company' ? ['company'] : f.type === 'crm_contact' ? ['contact'] : undefined,
        updatable: writable && !multi && !f.isImmutable,
        createable: writable,
        required: !!f.isRequired,
      });
    }
    return out;
  },

  async users(ctx) {
    const out: RemoteUser[] = [];
    try {
      for (let start: number | null = 0; start !== null && out.length < 2000; ) {
        const j: any = await b24(ctx, 'user.get', { filter: { ACTIVE: true }, start });
        for (const u of j?.result ?? []) out.push({ id: String(u.ID), name: [u.NAME, u.LAST_NAME].filter(Boolean).join(' ') || String(u.EMAIL ?? u.ID), email: u.EMAIL ? String(u.EMAIL).toLowerCase() : null });
        start = typeof j?.next === 'number' ? j.next : null;
      }
    } catch (e) {
      // A webhook without the "users" permission: owners simply cannot be matched.
      if (!(e instanceof CrmError) || e.status >= 500 || e.auth) throw e;
    }
    return out;
  },

  async list(ctx, object, opts): Promise<Page> {
    const start = Number(opts.cursor ?? 0) || 0;
    const names = opts.fields.map((f) => (f.name === STATUS.name ? B24_SEMANTIC : f.name));
    const j = await b24(ctx, `crm.${b24Object(object)}.list`, {
      order: { DATE_MODIFY: 'DESC', ID: 'DESC' },
      filter: opts.since ? { '>=DATE_MODIFY': new Date(opts.since).toISOString() } : {},
      select: [...new Set(['ID', 'DATE_MODIFY', ...names])],
      start,
    });
    const list = (j?.result ?? []) as any[];
    const rows = list.map((r): RemoteRow => {
      const values: Record<string, unknown> = {};
      for (const f of opts.fields) {
        const v = r[f.name];
        if (f.name === STATUS.name) values.status = r[B24_SEMANTIC] === 'S' ? 'won' : r[B24_SEMANTIC] === 'F' ? 'lost' : 'open';
        else if (B24_MULTI[f.name]) values[f.name] = Array.isArray(v) && v.length ? (v[0]?.VALUE ?? null) : null;
        else if (f.type === 'bool') values[f.name] = v === 'Y' || v === true || v === '1' || v === 1;
        else if (f.type === 'ref' || f.type === 'user') values[f.name] = idOrNull(v);
        else values[f.name] = blank(v);
      }
      return { id: String(r.ID), modifiedAt: iso(r.DATE_MODIFY), values };
    });
    const total = Number(j?.total);
    const more = typeof j?.next === 'number' ? j.next : list.length >= B24_PAGE && Number.isFinite(total) && total > start + list.length ? start + list.length : null;
    return { rows, next: more === null ? null : String(more) };
  },

  async update(ctx, object, id, values, fields) {
    await b24(ctx, `crm.${b24Object(object)}.update`, { id, fields: b24Encode(values, fields) });
  },

  async create(ctx, object, values, fields) {
    const j = await b24(ctx, `crm.${b24Object(object)}.add`, { fields: b24Encode(values, fields) });
    if (!j?.result) throw new CrmError('Bitrix24 did not return an id');
    return String(j.result);
  },

  url(config, object, id) {
    return config.host && B24.some((o) => o.name === object) ? `https://${config.host}/crm/${object}/details/${encodeURIComponent(id)}/` : null;
  },
};

function b24Encode(values: Record<string, unknown>, fields: RemoteField[]) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    const f = fields.find((x) => x.name === k);
    if (!f || f.type === 'id' || k === STATUS.name) continue;
    if (B24_MULTI[k]) {
      if (v) out[k] = [{ VALUE: String(v), VALUE_TYPE: 'WORK' }];
    } else if (f.type === 'bool') out[k] = v ? 'Y' : 'N';
    else out[k] = v === null || v === undefined ? '' : v;
  }
  return out;
}

// ---------------------------------------------------------------- Freshsales

const FS = [
  { name: 'sales_accounts', one: 'sales_account', label: 'Account', plural: 'Accounts', hint: 'account' as ObjectHint, page: 'accounts' },
  { name: 'contacts', one: 'contact', label: 'Contact', plural: 'Contacts', hint: 'contact' as ObjectHint, page: 'contacts' },
  { name: 'deals', one: 'deal', label: 'Deal', plural: 'Deals', hint: 'opportunity' as ObjectHint, page: 'deals' },
];
const FS_HOST = /\.(myfreshworks\.com|freshworks\.com|freshsales\.io)$/;
/** Kept by Freshsales itself. */
const FS_COMPUTED = /^(id|created_at|updated_at|last_|recent_|open_deals|won_deals|lead_score|customer_fit|display_name|avatar|is_deleted)/;
const fsObject = (name: string) => {
  const o = FS.find((x) => x.name === name);
  if (!o) throw new CrmError(`Unknown Freshsales object ${name}`);
  return o;
};
const fsBase = (ctx: Ctx) => `https://${ctx.config!.alias}/api`;
function fsType(f: any): RemoteFieldType | null {
  const name = String(f.name ?? '');
  const t = String(f.type ?? '').toLowerCase();
  if (name === 'id') return 'id';
  if (name === 'owner_id') return 'user';
  if (name === 'sales_account_id') return 'ref';
  if (/multi/.test(t)) return 'multiselect';
  if (/dropdown|radio|select/.test(t)) return 'select';
  if (/checkbox|bool/.test(t)) return 'bool';
  if (/date/.test(t)) return /time/.test(t) ? 'datetime' : 'date';
  if (/number|decimal|integer|currency/.test(t)) return /amount|revenue|value/.test(name) ? 'money' : 'number';
  if (/email/.test(t) || name === 'email') return 'email';
  if (/phone/.test(t) || /phone|mobile|_number$/.test(name)) return 'phone';
  if (/url/.test(t) || name === 'website') return 'url';
  if (/paragraph|textarea/.test(t)) return 'textarea';
  if (/text|string/.test(t)) return 'text';
  return null;
}

/** "acme", "acme.myfreshworks.com" or the whole bundle alias "acme.myfreshworks.com/crm/sales". */
export function freshsalesAlias(raw: string): { alias: string; host: string } {
  let alias = raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '').replace(/\/api$/, '');
  if (!alias || /[\s?#@:]/.test(alias)) throw new CrmError('Enter your Freshsales address, e.g. yourcompany.myfreshworks.com', 400);
  if (!alias.includes('.')) alias = `${alias}.myfreshworks.com`;
  const [host, ...path] = alias.split('/');
  if (!FS_HOST.test(host) || !/^[a-z0-9.-]+$/.test(host) || path.some((p) => !/^[a-z0-9_-]+$/.test(p))) throw new CrmError('That is not a Freshsales address: it ends with myfreshworks.com', 400);
  if (!path.length && /\.(myfreshworks|freshworks)\.com$/.test(host)) alias = `${host}/crm/sales`;
  return { alias, host };
}

export const freshsales: CrmAdapter = {
  provider: 'freshsales',
  tabular: false,
  keyed: {
    async connect(fetcher, values) {
      const { alias, host } = freshsalesAlias(values.domain ?? '');
      const key = (values.token ?? '').trim();
      if (!key) throw new CrmError('Enter your Freshsales API key', 400);
      const auth = `Token token=${key}`;
      await request({ fetch: fetcher, token: async () => auth }, `https://${alias}/api/selector/owners`);
      return { secret: { accessToken: auth }, config: { alias }, label: host, instanceId: host };
    },
  },
  refresh: never,

  async objects() {
    return objectsOf(FS);
  },

  async fields(ctx, object) {
    const o = fsObject(object);
    const j = await request(ctx, `${fsBase(ctx)}/settings/${o.name}/fields`);
    const out: RemoteField[] = [{ name: 'id', label: 'ID', type: 'id', updatable: false }];
    for (const f of j?.fields ?? []) {
      const name = String(f.name ?? '');
      // A person's accounts are a list on the other side; the main one is offered below as one field.
      if (object === 'contacts' && /^sales_account/.test(name)) continue;
      const type = fsType(f);
      if (!type || type === 'id') continue;
      // Built-in choices ("…_id") are stored by their id, a company's own choice fields by their text.
      const byId = /_id$/.test(name);
      const options = Array.isArray(f.choices) && f.choices.length ? f.choices.map((c: any) => ({ value: String(byId ? c.id : (c.value ?? c.id)), label: String(c.value ?? c.id) })) : undefined;
      const writable = !FS_COMPUTED.test(name) && f.editable !== false && f.read_only !== true;
      out.push({ name, label: String(f.label ?? name), type, options, refTo: name === 'sales_account_id' ? ['sales_accounts'] : undefined, updatable: writable, createable: writable, required: !!f.required });
    }
    if (object === 'contacts') out.push({ name: COMPANY, label: 'Account', type: 'ref', refTo: ['sales_accounts'], updatable: true, createable: true });
    // A deal's customer is not always among its "settings" fields, but every deal has one.
    if (object === 'deals' && !out.some((f) => f.name === 'sales_account_id')) out.push({ name: 'sales_account_id', label: 'Account', type: 'ref', refTo: ['sales_accounts'], updatable: true, createable: true });
    return out;
  },

  async users(ctx) {
    const j = await request(ctx, `${fsBase(ctx)}/selector/owners`);
    return (j?.users ?? []).filter((u: any) => u.is_active !== false).map((u: any): RemoteUser => ({ id: String(u.id), name: String(u.display_name ?? u.email ?? u.id), email: u.email ? String(u.email).toLowerCase() : null }));
  },

  /**
   * Rows come through the "All …" view, newest change first. The cursor carries
   * the view and the page; with `since`, reading stops at the first row older
   * than it.
   */
  async list(ctx, object, opts): Promise<Page> {
    const o = fsObject(object);
    let [view, page] = (opts.cursor ?? '').split(':');
    if (!view) {
      const f = await request(ctx, `${fsBase(ctx)}/${o.name}/filters`);
      const pick = ((f?.filters ?? []) as { id: number | string; name?: string }[]).find((x) => /^all\b/i.test(String(x.name ?? '')));
      // Any other view would bring only part of the list without saying so.
      if (!pick) throw new CrmError(`Freshsales has no "All ${o.plural.toLowerCase()}" view to read from`, 400);
      view = String(pick.id);
      page = '1';
    }
    const n = Number(page) || 1;
    const include = object === 'contacts' && opts.fields.some((f) => f.name === COMPANY) ? '&include=sales_accounts' : '';
    const j = await request(ctx, `${fsBase(ctx)}/${o.name}/view/${encodeURIComponent(view)}?page=${n}&sort=updated_at&sort_type=desc${include}`);
    const list = (j?.[o.name] ?? []) as any[];
    const since = opts.since ? new Date(opts.since).getTime() : null;
    let reachedOld = false;
    const rows: RemoteRow[] = [];
    for (const r of list) {
      const at = iso(r.updated_at);
      if (since !== null && at && new Date(at).getTime() < since) {
        reachedOld = true;
        break;
      }
      const values: Record<string, unknown> = {};
      for (const f of opts.fields) {
        if (f.name === COMPANY) {
          const mine = Array.isArray(r.sales_accounts) ? (r.sales_accounts.find((a: any) => a?.is_primary) ?? r.sales_accounts[0]) : null;
          values[COMPANY] = idOrNull(mine?.id ?? r.sales_account_id);
          continue;
        }
        const v = f.name.startsWith('cf_') ? r.custom_field?.[f.name] : r[f.name];
        values[f.name] = f.type === 'user' || f.type === 'ref' || (f.type === 'select' && /_id$/.test(f.name)) ? idOrNull(v) : blank(v);
      }
      rows.push({ id: String(r.id), modifiedAt: at, values });
    }
    // Some lists say how many pages there are; the others end with an empty page.
    const pages = Number(j?.meta?.total_pages);
    const more = !reachedOld && list.length > 0 && (Number.isFinite(pages) && pages > 0 ? n < pages : true);
    return { rows, next: more ? `${view}:${n + 1}` : null };
  },

  async update(ctx, object, id, values, fields) {
    const o = fsObject(object);
    await request(ctx, `${fsBase(ctx)}/${o.name}/${encodeURIComponent(id)}`, { method: 'PUT', json: { [o.one]: fsEncode(values, fields) } });
  },

  async create(ctx, object, values, fields) {
    const o = fsObject(object);
    const j = await request(ctx, `${fsBase(ctx)}/${o.name}`, { method: 'POST', json: { [o.one]: fsEncode(values, fields) } });
    const id = j?.[o.one]?.id;
    if (!id) throw new CrmError('Freshsales did not return an id');
    return String(id);
  },

  url(config, object, id) {
    const o = FS.find((x) => x.name === object);
    return config.alias && o ? `https://${config.alias}/${o.page}/${encodeURIComponent(id)}` : null;
  },
};

const numeric = (v: unknown) => v !== null && v !== undefined && v !== '' && /^\d+$/.test(String(v));

function fsEncode(values: Record<string, unknown>, fields: RemoteField[]) {
  const out: Record<string, unknown> = {};
  const custom: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    const f = fields.find((x) => x.name === k);
    if (!f || f.type === 'id') continue;
    if (k === COMPANY) {
      if (numeric(v)) out.sales_accounts = [{ id: Number(v), is_primary: true }];
      continue;
    }
    const value = (f.type === 'user' || f.type === 'ref' || /_id$/.test(k)) && numeric(v) ? Number(v) : (v ?? null);
    if (k.startsWith('cf_')) custom[k] = value;
    else out[k] = value;
  }
  if (Object.keys(custom).length) out.custom_field = custom;
  return out;
}

// -------------------------------------------------------------- Zendesk Sell

const SELL = 'https://api.getbase.com/v2';
const SELL_APP = 'https://app.futuresimple.com';
const SELL_PAGE = 100;
const ZS = [
  { name: 'organizations', label: 'Company', plural: 'Companies', hint: 'account' as ObjectHint },
  { name: 'people', label: 'Person', plural: 'People', hint: 'contact' as ObjectHint },
  { name: 'deals', label: 'Deal', plural: 'Deals', hint: 'opportunity' as ObjectHint },
];
const zsObject = (name: string) => {
  if (!ZS.some((o) => o.name === name)) throw new CrmError(`Unknown Zendesk Sell object ${name}`);
  return name;
};
const zsPath = (object: string) => (object === 'deals' ? 'deals' : 'contacts');
const std = (name: string, label: string, type: RemoteFieldType, extra: Partial<RemoteField> = {}): RemoteField => ({ name, label, type, updatable: type !== 'id', createable: type !== 'id', ...extra });
const ZS_FIELDS: Record<string, RemoteField[]> = {
  organizations: [
    std('id', 'ID', 'id'),
    std('name', 'Name', 'text', { required: true }),
    std('owner_id', 'Owner', 'user'),
    std('website', 'Website', 'url'),
    std('email', 'Email', 'email'),
    std('phone', 'Phone', 'phone'),
    std('industry', 'Industry', 'text'),
    std('description', 'Description', 'textarea'),
    std('customer_status', 'Customer status', 'select', { options: ['none', 'current', 'past'].map((v) => ({ value: v, label: v })) }),
    std('prospect_status', 'Prospect status', 'select', { options: ['none', 'current', 'lost'].map((v) => ({ value: v, label: v })) }),
  ],
  people: [
    std('id', 'ID', 'id'),
    std('first_name', 'First name', 'text'),
    std('last_name', 'Last name', 'text', { required: true }),
    std('title', 'Title', 'text'),
    std('email', 'Email', 'email'),
    std('phone', 'Phone', 'phone'),
    std('mobile', 'Mobile', 'phone'),
    std('linkedin', 'LinkedIn', 'text'),
    std('owner_id', 'Owner', 'user'),
    std(COMPANY, 'Company', 'ref', { refTo: ['organizations'] }),
    std('description', 'Description', 'textarea'),
  ],
  deals: [
    std('id', 'ID', 'id'),
    std('name', 'Name', 'text', { required: true }),
    std('value', 'Value', 'money'),
    std('currency', 'Currency', 'text'),
    std('owner_id', 'Owner', 'user'),
    std('stage_id', 'Stage', 'select'),
    std(COMPANY, 'Company', 'ref', { refTo: ['organizations'], required: true }),
    std('estimated_close_date', 'Estimated close date', 'date'),
    std('hot', 'Hot', 'bool'),
    { ...STATUS },
  ],
};
const ZS_CUSTOM: Record<string, RemoteFieldType> = { string: 'text', text: 'textarea', number: 'number', list: 'select', multi_select_list: 'multiselect', bool: 'bool', date: 'date', datetime: 'datetime', email: 'email', phone: 'phone', url: 'url' };
const CUSTOM = 'custom:';

const zsStages = (ctx: Ctx) =>
  once(ctx, 'sell:stages', async () => {
    const s = await request(ctx, `${SELL}/stages?per_page=${SELL_PAGE}`);
    return ((s?.items ?? []) as any[]).map((x) => ({ id: String(x.data.id), name: String(x.data.name), category: String(x.data.category ?? '') }));
  });

export const zendesksell: CrmAdapter = {
  provider: 'zendesksell',
  tabular: false,
  keyed: {
    async connect(fetcher, values) {
      const token = (values.token ?? '').trim();
      if (token.length < 20 || /\s/.test(token)) throw new CrmError('Paste a Zendesk Sell access token', 400);
      const auth = `Bearer ${token}`;
      const j = await request({ fetch: fetcher, token: async () => auth }, `${SELL}/accounts/self`);
      const id = String(j?.data?.id ?? '');
      if (!id) throw new CrmError('Zendesk Sell did not say which account this is', 400);
      return { secret: { accessToken: auth }, config: {}, label: String(j.data.name ?? 'Zendesk Sell'), instanceId: id };
    },
  },
  refresh: never,

  async objects() {
    return objectsOf(ZS);
  },

  async fields(ctx, object) {
    const out = ZS_FIELDS[zsObject(object)].map((f) => ({ ...f }));
    if (object === 'deals') out.find((f) => f.name === 'stage_id')!.options = (await zsStages(ctx)).map((s) => ({ value: s.id, label: s.name }));
    const c = await request(ctx, `${SELL}/${object === 'deals' ? 'deal' : 'contact'}/custom_fields`);
    for (const item of c?.items ?? []) {
      const f = item.data ?? {};
      if (object === 'organizations' && f.for_organisation === false) continue;
      if (object === 'people' && f.for_contact === false) continue;
      const type = ZS_CUSTOM[String(f.type)];
      if (!type) continue;
      out.push({ name: `${CUSTOM}${f.name}`, label: String(f.name), type, options: Array.isArray(f.choices) ? f.choices.map((x: any) => ({ value: String(x.name), label: String(x.name) })) : undefined, updatable: true, createable: true });
    }
    return out;
  },

  async users(ctx) {
    const j = await request(ctx, `${SELL}/users?per_page=${SELL_PAGE}&status=active`);
    return (j?.items ?? []).map((x: any): RemoteUser => ({ id: String(x.data.id), name: String(x.data.name ?? x.data.email ?? x.data.id), email: x.data.email ? String(x.data.email).toLowerCase() : null }));
  },

  /** Newest change first; with `since`, reading stops at the first row older than it. */
  async list(ctx, object, opts): Promise<Page> {
    zsObject(object);
    const page = Number(opts.cursor ?? 1) || 1;
    const which = object === 'deals' ? '' : `&is_organization=${object === 'organizations'}`;
    const j = await request(ctx, `${SELL}/${zsPath(object)}?page=${page}&per_page=${SELL_PAGE}&sort_by=updated_at:desc${which}`);
    const items = (j?.items ?? []) as any[];
    const stages = object === 'deals' && opts.fields.some((f) => f.name === STATUS.name) ? new Map((await zsStages(ctx)).map((s) => [s.id, s.category])) : null;
    const since = opts.since ? new Date(opts.since).getTime() : null;
    let reachedOld = false;
    const rows: RemoteRow[] = [];
    for (const item of items) {
      const r = item.data ?? {};
      const at = iso(r.updated_at);
      if (since !== null && at && new Date(at).getTime() < since) {
        reachedOld = true;
        break;
      }
      const values: Record<string, unknown> = {};
      for (const f of opts.fields) {
        if (f.name === COMPANY) values[COMPANY] = idOrNull(object === 'deals' ? (r.organization_id ?? r.contact_id) : r.contact_id);
        else if (f.name === STATUS.name) {
          const category = stages?.get(String(r.stage_id)) ?? '';
          values.status = category === 'won' ? 'won' : category === 'lost' || category === 'unqualified' ? 'lost' : 'open';
        } else {
          const v = f.name.startsWith(CUSTOM) ? r.custom_fields?.[f.name.slice(CUSTOM.length)] : r[f.name];
          if (f.type === 'user' || f.name === 'stage_id') values[f.name] = idOrNull(v);
          else if (f.type === 'money') values[f.name] = v === null || v === undefined || v === '' ? null : Number(v);
          else values[f.name] = blank(v);
        }
      }
      rows.push({ id: String(r.id), modifiedAt: at, values });
    }
    return { rows, next: !reachedOld && items.length >= SELL_PAGE ? String(page + 1) : null };
  },

  async update(ctx, object, id, values, fields) {
    await request(ctx, `${SELL}/${zsPath(zsObject(object))}/${encodeURIComponent(id)}`, { method: 'PUT', json: { data: zsEncode(values, fields) } });
  },

  async create(ctx, object, values, fields) {
    const data = zsEncode(values, fields);
    if (object !== 'deals') data.is_organization = object === 'organizations';
    const j = await request(ctx, `${SELL}/${zsPath(zsObject(object))}`, { method: 'POST', json: { data } });
    if (!j?.data?.id) throw new CrmError('Zendesk Sell did not return an id');
    return String(j.data.id);
  },

  url(_config, object, id) {
    return object === 'deals' ? `${SELL_APP}/sales/deals/${encodeURIComponent(id)}` : ZS.some((o) => o.name === object) ? `${SELL_APP}/crm/contacts/${encodeURIComponent(id)}` : null;
  },
};

function zsEncode(values: Record<string, unknown>, fields: RemoteField[]) {
  const out: Record<string, unknown> = {};
  const custom: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    const f = fields.find((x) => x.name === k);
    if (!f || f.type === 'id' || k === STATUS.name) continue;
    const empty = v === null || v === undefined || v === '';
    let value: unknown = empty ? null : v;
    if ((f.type === 'user' || f.type === 'ref' || k === 'stage_id') && numeric(v)) value = Number(v);
    // Sell takes money as text with two decimals.
    else if (f.type === 'money' && !empty && Number.isFinite(Number(v))) value = Number(v).toFixed(2);
    if (k === COMPANY) out.contact_id = value;
    else if (k.startsWith(CUSTOM)) custom[k.slice(CUSTOM.length)] = value;
    else out[k] = value;
  }
  if (Object.keys(custom).length) out.custom_fields = custom;
  return out;
}
