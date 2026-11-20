// Odoo CRM (Odoo Online, Odoo.sh or self-hosted), two-way: companies and their people (res.partner) and
// opportunities (crm.lead of type "opportunity"). Connected exactly like Odoo accounting: the company's address,
// a login and an API key made in Odoo (Preferences → Account Security), and the database name where the server
// holds more than one. Odoo 19+ answers on the External JSON-2 API (POST /json/2/<model>/<method>, the key as a
// bearer token, X-Odoo-Database); older versions on JSON-RPC, which Odoo removes in version 20. Odoo Online needs
// the Custom plan for API access (Odoo's rule). Odoo publishes no request limit; the engine's pacing applies.
//
// Rows are read newest change first (write_date desc) with an offset, so a row changed mid-read moves to the front
// and is at worst read twice. Lost opportunities are archived in Odoo (active = false), so reads ask for archived
// rows too; an opportunity counts as won at probability 100 (Odoo sets it when the stage is a "won" stage).
import type { ObjectHint, RemoteField, RemoteFieldType, RemoteObject, RemoteUser } from '../../../../shared/src/sync';
import { odoo, odooConnect } from './accounting/odoo';
import { isoOf } from './accounting/common';
import { CrmError, type CrmAdapter, type CrmCtx, type Page, type RemoteRow } from './types';

const LIMIT = 100;
const COMPANY = '__company';
const STATUS: RemoteField = { name: 'status', label: 'Status (open, won, lost)', type: 'select', options: ['open', 'won', 'lost'].map((v) => ({ value: v, label: v })), updatable: false, createable: false };

const OBJECTS: { name: string; label: string; plural: string; hint: ObjectHint; model: string; domain: unknown[] }[] = [
  { name: 'companies', label: 'Company', plural: 'Companies', hint: 'account', model: 'res.partner', domain: [['is_company', '=', true]] },
  { name: 'contacts', label: 'Contact', plural: 'Contacts', hint: 'contact', model: 'res.partner', domain: [['is_company', '=', false], ['type', '=', 'contact']] },
  { name: 'opportunities', label: 'Opportunity', plural: 'Opportunities', hint: 'opportunity', model: 'crm.lead', domain: [['type', '=', 'opportunity']] },
];
const objectOf = (name: string) => {
  const o = OBJECTS.find((x) => x.name === name);
  if (!o) throw new CrmError(`Unknown Odoo object ${name}`);
  return o;
};

const f = (name: string, label: string, type: RemoteFieldType, extra: Partial<RemoteField> = {}): RemoteField => ({ name, label, type, updatable: type !== 'id', createable: type !== 'id', ...extra });
const STANDARD: Record<string, RemoteField[]> = {
  companies: [f('id', 'ID', 'id'), f('name', 'Name', 'text', { required: true }), f('website', 'Website', 'url'), f('email', 'Email', 'email'), f('phone', 'Phone', 'phone'), f('vat', 'Tax ID', 'text'), f('user_id', 'Salesperson', 'user')],
  contacts: [f('id', 'ID', 'id'), f('name', 'Name', 'text', { required: true }), f('function', 'Job position', 'text'), f('email', 'Email', 'email'), f('phone', 'Phone', 'phone'), f(COMPANY, 'Company', 'ref', { refTo: ['companies'] }), f('user_id', 'Salesperson', 'user')],
  opportunities: [
    f('id', 'ID', 'id'),
    f('name', 'Opportunity', 'text', { required: true }),
    f('expected_revenue', 'Expected revenue', 'money'),
    f('date_deadline', 'Expected closing', 'date'),
    f('stage_id', 'Stage', 'select'),
    f('probability', 'Probability', 'number'),
    f(COMPANY, 'Customer', 'ref', { refTo: ['companies'] }),
    f('user_id', 'Salesperson', 'user'),
    { ...STATUS },
  ],
};
/** Custom fields made in Odoo Studio (x_…) of a simple type come along too. */
const ODOO_TYPES: Record<string, RemoteFieldType> = { char: 'text', text: 'textarea', html: 'textarea', integer: 'number', float: 'number', monetary: 'money', boolean: 'bool', date: 'date', datetime: 'datetime', selection: 'select' };

/** Odoo's "[id, name]" for a link to another record, or false. */
const refId = (v: unknown): string | null => (Array.isArray(v) && v.length ? String(v[0]) : null);
/** Odoo writes false for an empty field. */
const plainOf = (v: unknown) => (v === false || v === '' || v === undefined ? null : v);
const odooTime = (iso: string) => iso.slice(0, 19).replace('T', ' ');

function readFields(object: string, fields: RemoteField[]): string[] {
  const out = new Set(['id', 'write_date']);
  for (const x of fields) {
    if (x.name === COMPANY) out.add(object === 'contacts' ? 'parent_id' : 'partner_id');
    else if (x.name === STATUS.name) ['probability', 'active'].forEach((k) => out.add(k));
    else out.add(x.name);
  }
  return [...out];
}

function encode(object: string, values: Record<string, unknown>, fields: RemoteField[]) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    const field = fields.find((x) => x.name === k);
    if (!field || field.type === 'id' || k === STATUS.name) continue;
    const empty = v === null || v === undefined || v === '';
    if (k === COMPANY) out[object === 'contacts' ? 'parent_id' : 'partner_id'] = empty ? false : Number(v);
    else if (field.type === 'user' || k === 'stage_id') out[k] = empty ? false : Number(v);
    else if (field.type === 'money' || field.type === 'number') out[k] = empty ? 0 : Number(v);
    else out[k] = empty ? false : v;
  }
  return out;
}

const isJsonRpc = (ctx: CrmCtx) => ctx.config.transport === 'jsonrpc';

export const odoocrm: CrmAdapter = {
  provider: 'odoocrm',
  tabular: false,
  keyed: {
    async connect(fetcher, values) {
      const made = await odooConnect(fetcher, values);
      // The CRM app must be installed: a database without it has no crm.lead model.
      const ctx = { fetch: fetcher, now: () => new Date(), config: made.config, token: async () => String(made.secret.accessToken), refresh: async () => String(made.secret.accessToken) };
      try {
        await odoo(ctx, 'crm.lead', 'search_count', { domain: [] });
      } catch (e) {
        if (e instanceof CrmError && !e.auth) throw new CrmError('The CRM app is not installed in this Odoo (Apps → CRM → Activate)', 400);
        throw e;
      }
      return { ...made, label: `${made.label} · CRM` };
    },
  },
  async refresh(_ctx, secret) {
    if (!secret.accessToken) throw new CrmError('Reconnect Odoo', 401, undefined, true);
    return secret;
  },

  async objects() {
    return OBJECTS.map<RemoteObject>((o) => ({ name: o.name, label: o.label, labelPlural: o.plural, custom: false, hint: o.hint }));
  },

  async fields(ctx, object) {
    const o = objectOf(object);
    const out = STANDARD[object].map((x) => ({ ...x }));
    const all = (await odoo(ctx, o.model, 'fields_get', { attributes: ['string', 'type', 'readonly', 'selection', 'required'] })) ?? {};
    if (object === 'opportunities') {
      const stages: any[] = (await odoo(ctx, 'crm.stage', 'search_read', { domain: [], fields: ['id', 'name'], order: 'sequence asc' })) ?? [];
      out.find((x) => x.name === 'stage_id')!.options = stages.map((s) => ({ value: String(s.id), label: String(s.name) }));
    }
    for (const [name, d] of Object.entries<any>(all)) {
      const type = ODOO_TYPES[d?.type];
      if (!name.startsWith('x_') || !type) continue;
      out.push({ name, label: String(d.string ?? name), type, updatable: !d.readonly, createable: !d.readonly, ...(Array.isArray(d.selection) ? { options: d.selection.map(([v, l]: [string, string]) => ({ value: String(v), label: String(l) })) } : {}) });
    }
    return out;
  },

  async users(ctx) {
    const list: any[] = (await odoo(ctx, 'res.users', 'search_read', { domain: [['share', '=', false]], fields: ['id', 'name', 'login', 'email'], limit: 500 })) ?? [];
    return list.map<RemoteUser>((u) => ({ id: String(u.id), name: String(u.name ?? u.login), email: String(u.email || u.login || '').toLowerCase() || null }));
  },

  async list(ctx, object, opts): Promise<Page> {
    const o = objectOf(object);
    const offset = Number(opts.cursor ?? 0) || 0;
    const domain = [...o.domain, ...(opts.since ? [['write_date', '>=', odooTime(opts.since)]] : [])];
    const rows: any[] =
      (await odoo(ctx, o.model, 'search_read', { domain, fields: readFields(object, opts.fields), order: 'write_date desc, id desc', limit: LIMIT, offset, context: { active_test: object !== 'opportunities' } })) ?? [];
    const out: RemoteRow[] = rows.map((r) => {
      const values: Record<string, unknown> = {};
      for (const x of opts.fields) {
        if (x.name === COMPANY) values[COMPANY] = refId(object === 'contacts' ? r.parent_id : r.partner_id);
        else if (x.name === STATUS.name) values.status = Number(r.probability) >= 100 ? 'won' : r.active === false ? 'lost' : 'open';
        else if (x.type === 'user' || x.name === 'stage_id') values[x.name] = refId(r[x.name]);
        else if (x.type === 'money' || x.type === 'number') values[x.name] = r[x.name] === false || r[x.name] === null || r[x.name] === undefined ? null : Number(r[x.name]);
        else values[x.name] = plainOf(r[x.name]);
      }
      return { id: String(r.id), modifiedAt: isoOf(r.write_date), values };
    });
    return { rows: out, next: rows.length === LIMIT ? String(offset + LIMIT) : null };
  },

  async deleted(ctx, object, since) {
    // An archived company or person is gone for Curahold too; opportunities are archived when lost, so not those.
    if (object === 'opportunities') return [];
    const o = objectOf(object);
    const rows: any[] = (await odoo(ctx, o.model, 'search_read', { domain: [...o.domain, ['active', '=', false], ['write_date', '>=', odooTime(since)]], fields: ['id'], limit: 500, context: { active_test: false } })) ?? [];
    return rows.map((r) => String(r.id));
  },

  async update(ctx, object, id, values, fields) {
    const o = objectOf(object);
    const vals = encode(object, values, fields);
    if (!Object.keys(vals).length) return;
    await odoo(ctx, o.model, 'write', isJsonRpc(ctx) ? { domain: [Number(id)], vals } : { ids: [Number(id)], vals });
  },

  async create(ctx, object, values, fields) {
    const o = objectOf(object);
    const vals = { ...encode(object, values, fields), ...(object === 'companies' ? { is_company: true } : object === 'opportunities' ? { type: 'opportunity' } : {}) };
    const made = await odoo(ctx, o.model, 'create', { vals_list: [vals] });
    const id = Array.isArray(made) ? made[0] : made;
    if (!id) throw new CrmError('Odoo did not return the new record');
    return String(id);
  },

  url(config, object, id) {
    const model = OBJECTS.find((x) => x.name === object)?.model;
    // The classic form address: every version opens it (17+ redirect it to their own).
    return model && config.url ? `${config.url}/web#id=${encodeURIComponent(id)}&model=${model}&view_type=form` : null;
  },
};
