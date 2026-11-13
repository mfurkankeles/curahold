// Google BigQuery as a source: a warehouse import. The administrator brings a
// service-account key (a Google Cloud service account with "BigQuery Job User"
// and "BigQuery Data Viewer") and a query; every row the query returns becomes
// one item in Curahold (a customer, a usage or health row…), found again by an
// id column the administrator names. Only reads: nothing made or changed in
// Curahold is written to the warehouse, and only SELECT / WITH queries run.
//
// Auth is Google's service-account flow: a short-lived JWT signed with the
// key's private key (RS256) is exchanged for an access token. The key is
// sealed with the rest of the connection's secret. The token address in the key
// file is ignored on purpose; the token always comes from Google's own address.
//
// Reading: jobs.query with a row limit per page, then getQueryResults for the
// next pages. With a "modified" column the query is wrapped so only rows changed
// since the last run come back (ordered oldest first); without one, every run
// reads the whole result, so keep the query narrow and cost-limited: each job
// is capped by maximumBytesBilled (10 GB unless the connection says otherwise).
import type { RemoteField, RemoteFieldType, RemoteObject } from '../../../../shared/src/sync';
import { base64url } from '../../lib/crypto';
import { CrmError, call, errorText, type CrmAdapter, type CrmCtx, type CrmSecret, type Page, type RemoteRow } from './types';

const API = 'https://bigquery.googleapis.com/bigquery/v2';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/bigquery.readonly';
const PAGE = 500;
const DEFAULT_MAX_BYTES = 10_000_000_000;
/** The one object this connection offers: the query. */
export const QUERY_OBJECT = 'query';
const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,299}$/;

export interface ServiceAccount {
  clientEmail: string;
  privateKey: string;
  projectId: string;
}

/** What the administrator pasted: the service-account key file's JSON. */
export function parseServiceAccount(text: string): ServiceAccount {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    throw new CrmError('Paste the whole service-account key file (JSON)');
  }
  if (j?.type !== 'service_account' || typeof j.client_email !== 'string' || typeof j.private_key !== 'string' || typeof j.project_id !== 'string') {
    throw new CrmError('That is not a service-account key: it needs type, project_id, client_email and private_key');
  }
  if (!/^[a-z][a-z0-9-]{4,60}[a-z0-9]$/.test(j.project_id)) throw new CrmError('The key names a project that does not look like a Google Cloud project id');
  return { clientEmail: j.client_email, privateKey: j.private_key, projectId: j.project_id };
}

/** Only a read: one SELECT (or WITH … SELECT) statement. BigQuery enforces rights too; this keeps scripts and DDL out. */
export function checkQuery(raw: string): string {
  const sql = raw.trim().replace(/;+\s*$/, '');
  if (!sql) throw new CrmError('Enter the query to read');
  if (sql.length > 8000) throw new CrmError('The query is too long (8,000 characters at most)');
  if (!/^(with|select)\b/i.test(sql)) throw new CrmError('The query must start with SELECT or WITH');
  // A second statement (script) would be run as one; a ";" inside a string is rare enough to ask for a view instead.
  if (sql.includes(';')) throw new CrmError('Run one statement only: no ";" inside the query');
  const bare = sql.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`[^`]*`|--[^\n]*|\/\*[\s\S]*?\*\//g, ' ');
  if (/\b(insert|update|delete|merge|drop|create|alter|truncate|grant|revoke|call|execute|export|load)\b/i.test(bare)) throw new CrmError('Only reading queries are allowed');
  return sql;
}

const pemBytes = (pem: string) => Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));

/** Signs the one-hour assertion Google exchanges for an access token. */
async function assertion(sa: ServiceAccount, now: Date): Promise<string> {
  const enc = new TextEncoder();
  const iat = Math.floor(now.getTime() / 1000);
  const head = base64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = base64url(enc.encode(JSON.stringify({ iss: sa.clientEmail, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 })));
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey('pkcs8', pemBytes(sa.privateKey), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  } catch {
    throw new CrmError('The private key in that file cannot be read', 0, undefined, true);
  }
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(`${head}.${claims}`)));
  return `${head}.${claims}.${base64url(sig)}`;
}

async function mintToken(fetcher: typeof fetch, sa: ServiceAccount, now: Date): Promise<CrmSecret> {
  const res = await fetcher(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: await assertion(sa, now) }),
  });
  if (!res.ok) {
    // invalid_grant: the key was deleted or disabled, or the account is gone. Only a new key helps.
    throw new CrmError(`Reconnect BigQuery: ${await errorText(res)} (invalid_grant)`, res.status, undefined, true);
  }
  const j: any = await res.json();
  if (!j.access_token) throw new CrmError('Reconnect BigQuery: Google sent no access token', res.status, undefined, true);
  return { accessToken: j.access_token, expiresAt: now.getTime() + Number(j.expires_in ?? 3600) * 1000 };
}

// ------------------------------------------------------------- query pieces

const quote = (name: string) => `\`${name}\``;

/** The statement actually sent: the administrator's query, narrowed to what changed when there is a modified column. */
export function statement(config: Record<string, any>, since: string | null): { query: string; params: any[] } {
  const base = checkQuery(String(config.query ?? ''));
  const mod = config.modifiedColumn ? String(config.modifiedColumn) : '';
  if (!mod) return { query: base, params: [] };
  if (!IDENT.test(mod)) throw new CrmError('The modified column must be a plain column name');
  const where = since ? ` WHERE TIMESTAMP(${quote(mod)}) >= @since` : '';
  return {
    query: `SELECT * FROM (${base}) AS curahold_q${where} ORDER BY ${quote(mod)} ASC`,
    params: since ? [{ name: 'since', parameterType: { type: 'TIMESTAMP' }, parameterValue: { value: since } }] : [],
  };
}

function typeOf(f: any): RemoteFieldType | null {
  if (f.mode === 'REPEATED') return null;
  switch (String(f.type).toUpperCase()) {
    case 'STRING':
    case 'JSON':
      return /e[-_]?mail/i.test(f.name) ? 'email' : 'text';
    case 'INT64':
    case 'INTEGER':
    case 'FLOAT':
    case 'FLOAT64':
    case 'NUMERIC':
    case 'BIGNUMERIC':
      return 'number';
    case 'BOOL':
    case 'BOOLEAN':
      return 'bool';
    case 'DATE':
      return 'date';
    case 'DATETIME':
    case 'TIMESTAMP':
      return 'datetime';
    default:
      return null; // RECORD, GEOGRAPHY, BYTES, INTERVAL…: not synced
  }
}

/** A BigQuery cell ({v: "…"}) as a plain value. */
function cell(type: string, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  switch (type.toUpperCase()) {
    case 'INT64':
    case 'INTEGER': {
      const n = Number(v);
      return Number.isSafeInteger(n) ? n : String(v);
    }
    case 'FLOAT':
    case 'FLOAT64':
    case 'NUMERIC':
    case 'BIGNUMERIC': {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    case 'BOOL':
    case 'BOOLEAN':
      return String(v) === 'true';
    // Timestamps arrive as seconds since the epoch with a fraction.
    case 'TIMESTAMP': {
      const d = new Date(Number(v) * 1000);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    case 'DATETIME': {
      const d = new Date(`${String(v)}Z`);
      return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
    }
    default:
      return typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
}

const project = (ctx: Pick<CrmCtx, 'config'>) => {
  const p = String(ctx.config.projectId ?? '');
  if (!/^[a-z][a-z0-9-]{4,60}[a-z0-9]$/.test(p)) throw new CrmError('This connection has no project; connect again', 0, undefined, true);
  return encodeURIComponent(p);
};
const location = (ctx: Pick<CrmCtx, 'config'>) => (ctx.config.location ? { location: String(ctx.config.location) } : {});
const maxBytes = (ctx: Pick<CrmCtx, 'config'>) => String(Math.min(Number(ctx.config.maxBytes) || DEFAULT_MAX_BYTES, 1_000_000_000_000));

interface QueryAnswer {
  jobComplete?: boolean;
  jobReference?: { jobId: string; location?: string };
  schema?: { fields: any[] };
  rows?: { f: { v: unknown }[] }[];
  pageToken?: string;
  errors?: { message: string }[];
}

/** Runs a statement (or only checks it: no bytes are read and nothing is billed) and waits for it to finish. */
async function runQuery(ctx: CrmCtx, query: string, params: any[], opts: { dryRun?: boolean; maxResults?: number } = {}): Promise<QueryAnswer> {
  const j: QueryAnswer = await call(ctx, `${API}/projects/${project(ctx)}/queries`, {
    method: 'POST',
    json: {
      query,
      useLegacySql: false,
      dryRun: !!opts.dryRun,
      maxResults: opts.maxResults ?? PAGE,
      timeoutMs: 20_000,
      maximumBytesBilled: maxBytes(ctx),
      ...(params.length ? { parameterMode: 'NAMED', queryParameters: params } : {}),
      ...location(ctx),
    },
  });
  if (opts.dryRun || j?.jobComplete !== false) return j ?? {};
  // Still running after the first wait: ask for the result a few more times (the run's own time limit stops us beyond that).
  const ref = j.jobReference!;
  for (let i = 0; i < 6; i++) {
    const r: QueryAnswer = await call(ctx, `${API}/projects/${project(ctx)}/queries/${encodeURIComponent(ref.jobId)}?${new URLSearchParams({ maxResults: String(opts.maxResults ?? PAGE), timeoutMs: '20000', ...(ref.location ? { location: ref.location } : {}) })}`);
    if (r?.jobComplete !== false) return r;
  }
  throw new CrmError('The query is still running; it will be tried again on the next run', 503, 300);
}

/** The columns a query returns, without running it. */
async function schemaOf(ctx: CrmCtx): Promise<any[]> {
  const { query, params } = statement(ctx.config, null);
  const j = await runQuery(ctx, query, params, { dryRun: true });
  if (j.schema?.fields?.length) return j.schema.fields;
  // Some answers to a dry run carry no schema: read zero rows instead.
  const z = await runQuery(ctx, `SELECT * FROM (${query}) AS curahold_s LIMIT 0`, params, { maxResults: 1 });
  return z.schema?.fields ?? [];
}

const toRow = (ctx: CrmCtx, schema: any[], r: { f: { v: unknown }[] }): RemoteRow | null => {
  const values: Record<string, unknown> = {};
  schema.forEach((f, i) => {
    if (typeOf(f)) values[f.name] = cell(f.type, r.f?.[i]?.v);
  });
  const idCol = String(ctx.config.idColumn ?? '');
  const raw = values[idCol];
  if (raw === null || raw === undefined || String(raw).trim() === '') return null;
  const mod = ctx.config.modifiedColumn ? values[String(ctx.config.modifiedColumn)] : null;
  const at = typeof mod === 'string' && !Number.isNaN(Date.parse(mod)) ? new Date(mod).toISOString() : null;
  return { id: String(raw).trim(), modifiedAt: at, values };
};

// ------------------------------------------------------------------ adapter

const refuse = async (): Promise<never> => {
  throw new CrmError('BigQuery is only read: nothing is written back to the warehouse');
};

export const bigquery: CrmAdapter = {
  provider: 'bigquery',
  tabular: false,
  readOnly: true,
  keyed: {
    async connect(fetcher, values, now) {
      const sa = parseServiceAccount(values.serviceAccount ?? '');
      const name = (values.name ?? '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'default';
      const idColumn = (values.idColumn ?? '').trim();
      const modifiedColumn = (values.modifiedColumn ?? '').trim();
      if (!IDENT.test(idColumn)) throw new CrmError('Name the column that identifies a row (a customer id, for example)');
      if (modifiedColumn && !IDENT.test(modifiedColumn)) throw new CrmError('The modified column must be a plain column name');
      const loc = (values.location ?? '').trim();
      if (loc && !/^[A-Za-z0-9-]{2,40}$/.test(loc)) throw new CrmError('The location looks like US, EU or europe-west1');
      const query = checkQuery(values.query ?? '');
      const secret = { ...(await mintToken(fetcher, sa, now)), clientEmail: sa.clientEmail, privateKey: sa.privateKey, projectId: sa.projectId };
      const config = { projectId: sa.projectId, clientEmail: sa.clientEmail, query, idColumn, modifiedColumn: modifiedColumn || null, location: loc || null, name };
      // Check the query and its columns now, with the new token, so a typo is caught before the mapping screens.
      const ctx: CrmCtx = { fetch: fetcher, now: () => now, config, token: async () => secret.accessToken!, refresh: async () => secret.accessToken! };
      let fields: any[];
      try {
        fields = await schemaOf(ctx);
      } catch (e) {
        if (e instanceof CrmError && e.status === 403) throw new CrmError(`${e.message} (the service account needs BigQuery Job User on the project and Data Viewer on the data)`, 403);
        throw e;
      }
      if (!fields.some((f) => f.name === idColumn && typeOf(f))) throw new CrmError(`The query has no column called "${idColumn}"`);
      if (modifiedColumn && !fields.some((f) => f.name === modifiedColumn && typeOf(f))) throw new CrmError(`The query has no column called "${modifiedColumn}"`);
      return { secret, config, label: `BigQuery · ${name}`, instanceId: `${sa.projectId}:${name}` };
    },
  },

  /** A new access token from the key kept in the secret. */
  async refresh(ctx, secret) {
    if (!secret.privateKey || !secret.clientEmail) throw new CrmError('Reconnect BigQuery with the service-account key', 401, undefined, true);
    const next = await mintToken(ctx.fetch, { clientEmail: String(secret.clientEmail), privateKey: String(secret.privateKey), projectId: String(secret.projectId ?? ctx.config.projectId) }, ctx.now());
    return next;
  },

  async objects(ctx): Promise<RemoteObject[]> {
    const label = String(ctx.config.name ?? 'query');
    return [{ name: QUERY_OBJECT, label, labelPlural: label, custom: true, hint: null }];
  },

  async fields(ctx): Promise<RemoteField[]> {
    return (await schemaOf(ctx))
      .map((f): RemoteField | null => {
        const type = typeOf(f);
        return type ? { name: f.name, label: f.name, type: f.name === ctx.config.idColumn ? 'id' : type, updatable: false } : null;
      })
      .filter((f): f is RemoteField => !!f);
  },

  async users() {
    return [];
  },

  async list(ctx, _object, opts): Promise<Page> {
    let ans: QueryAnswer;
    if (opts.cursor) {
      // "<job id>|<location>|<page token>": the next page of the job started on an earlier call.
      const [jobId, loc, pageToken] = opts.cursor.split('|');
      ans = await call(ctx, `${API}/projects/${project(ctx)}/queries/${encodeURIComponent(jobId)}?${new URLSearchParams({ maxResults: String(PAGE), pageToken, ...(loc ? { location: loc } : {}) })}`);
    } else {
      const { query, params } = statement(ctx.config, ctx.config.modifiedColumn ? opts.since : null);
      ans = await runQuery(ctx, query, params);
    }
    const schema = ans.schema?.fields ?? [];
    const rows = (ans.rows ?? []).map((r) => toRow(ctx, schema, r)).filter((r): r is RemoteRow => !!r);
    const ref = ans.jobReference;
    return { rows, next: ans.pageToken && ref ? `${ref.jobId}|${ref.location ?? ''}|${ans.pageToken}` : null };
  },

  update: refuse,
  create: refuse,
  url() {
    return null;
  },
};
