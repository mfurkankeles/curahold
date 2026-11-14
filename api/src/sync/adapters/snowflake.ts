// Snowflake as a source: a data-warehouse import, mirroring the BigQuery
// adapter. The administrator brings a Snowflake user set up for key-pair
// authentication (a private key, with its public key registered on the user)
// and a query; every row the query returns becomes one item in Curahold (a
// customer, a usage or health row…), found again by an id column the
// administrator names. Only reads: nothing made or changed in Curahold is
// written to the warehouse, and only SELECT / WITH statements run.
//
// Auth is Snowflake's key-pair flow: a short-lived JWT (RS256), signed with the
// private key and naming the public key's fingerprint, is sent as the bearer
// token with the KEYPAIR_JWT token type. No token exchange and no password; the
// key is sealed with the rest of the connection's secret. The fingerprint is
// derived from the private key here, so the administrator pastes only the key.
//
// Reading: the SQL API's /statements endpoint with a row limit per page, then
// the same statement's later partitions for the next pages. With a "modified"
// column the query is wrapped so only rows changed since the last run come back
// (ordered oldest first), bound as a parameter; without one, every run reads the
// whole result, so keep the query narrow. Each statement is capped by a row
// limit (ROWS_PER_RESULTSET) so a runaway query cannot flood a run.
import type { RemoteField, RemoteFieldType, RemoteObject } from '../../../../shared/src/sync';
import { base64url } from '../../lib/crypto';
import { checkQuery } from './bigquery';
import { CrmError, call, type CrmAdapter, type CrmCtx, type CrmSecret, type Page, type RemoteRow } from './types';

const DEFAULT_MAX_ROWS = 100_000;
/** The one object this connection offers: the query. */
export const QUERY_OBJECT = 'query';
const IDENT = /^[A-Za-z_][A-Za-z0-9_$]{0,254}$/;
/** An account identifier like "ab12345", "ab12345.eu-west-1" or "myorg-myaccount": host keeps it, the JWT uses the first label uppercased. */
const ACCOUNT = /^[A-Za-z0-9][A-Za-z0-9._-]{1,120}[A-Za-z0-9]$/;
const USER = /^[A-Za-z0-9][A-Za-z0-9._@-]{0,120}$/;
const JWT_TTL_MS = 59 * 60_000;

export interface KeyPair {
  account: string;
  user: string;
  privateKey: string;
}

/** The host for a Snowflake account identifier. Underscores in the first label are hyphens in the host. */
export function snowflakeHost(account: string): string {
  const acc = account.trim().toLowerCase().replace(/\.snowflakecomputing\.com.*$/, '').replace(/^https?:\/\//, '');
  if (!ACCOUNT.test(acc)) throw new CrmError('Enter the Snowflake account, e.g. ab12345.eu-west-1', 0, undefined, true);
  return `https://${acc.replace(/_/g, '-')}.snowflakecomputing.com`;
}

/** The fully-qualified "<ACCOUNT>.<USER>" the JWT subject and issuer use: uppercased, the account's first label only. */
export function qualifiedName(account: string, user: string): string {
  const acc = account.trim().toUpperCase().split('.')[0];
  return `${acc}.${user.trim().toUpperCase()}`;
}

const pemBytes = (pem: string) => Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  try {
    return await crypto.subtle.importKey('pkcs8', pemBytes(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, true, ['sign']);
  } catch {
    throw new CrmError('The private key cannot be read: paste the PKCS#8 PEM (-----BEGIN PRIVATE KEY-----)', 0, undefined, true);
  }
}

/** The public-key fingerprint Snowflake knows the user by: "SHA256:<base64>" of the DER public key, derived from the private key. */
export async function keyFingerprint(privateKey: CryptoKey): Promise<string> {
  const jwk = await crypto.subtle.exportKey('jwk', privateKey);
  const pub = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, true, ['verify']);
  const spki = await crypto.subtle.exportKey('spki', pub);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', spki));
  let bin = '';
  for (const b of digest) bin += String.fromCharCode(b);
  return `SHA256:${btoa(bin)}`;
}

/** Signs the one-hour JWT Snowflake accepts as the bearer token. */
export async function mintJwt(key: KeyPair, now: Date): Promise<CrmSecret> {
  if (!USER.test(key.user.trim())) throw new CrmError('Enter the Snowflake user name', 0, undefined, true);
  const privateKey = await importPrivateKey(key.privateKey);
  const fp = await keyFingerprint(privateKey);
  const qn = qualifiedName(key.account, key.user);
  const enc = new TextEncoder();
  const iat = Math.floor(now.getTime() / 1000);
  const head = base64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = base64url(enc.encode(JSON.stringify({ iss: `${qn}.${fp}`, sub: qn, iat, exp: iat + 3600 })));
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, enc.encode(`${head}.${claims}`)));
  return { accessToken: `${head}.${claims}.${base64url(sig)}`, expiresAt: now.getTime() + JWT_TTL_MS };
}

// ------------------------------------------------------------- query pieces

/** The statement actually sent: the administrator's query, narrowed to what changed when there is a modified column. */
export function statement(config: Record<string, any>, since: string | null): { sql: string; bindings: Record<string, { type: string; value: string }> | undefined } {
  const base = checkQuery(String(config.query ?? ''));
  const mod = config.modifiedColumn ? String(config.modifiedColumn) : '';
  if (!mod) return { sql: base, bindings: undefined };
  if (!IDENT.test(mod)) throw new CrmError('The modified column must be a plain column name');
  const where = since ? ` WHERE ${mod} >= ?` : '';
  return {
    sql: `SELECT * FROM (${base}) AS curahold_q${where} ORDER BY ${mod} ASC`,
    bindings: since ? { '1': { type: 'TEXT', value: since } } : undefined,
  };
}

/** A Snowflake column type → Curahold's field kind (arrays, objects, variants and binaries are left out). */
function typeOf(name: string, type: string): RemoteFieldType | null {
  switch (String(type).toUpperCase()) {
    case 'TEXT':
    case 'STRING':
    case 'VARCHAR':
      return /e[-_]?mail/i.test(name) ? 'email' : 'text';
    case 'FIXED':
    case 'NUMBER':
    case 'INTEGER':
    case 'REAL':
    case 'FLOAT':
    case 'DOUBLE':
      return 'number';
    case 'BOOLEAN':
      return 'bool';
    case 'DATE':
      return 'date';
    case 'TIMESTAMP_NTZ':
    case 'TIMESTAMP_LTZ':
    case 'TIMESTAMP_TZ':
    case 'TIMESTAMP':
    case 'DATETIME':
      return 'datetime';
    default:
      return null; // ARRAY, OBJECT, VARIANT, BINARY, GEOGRAPHY…
  }
}

/** The SQL API returns every cell as a string (or null). Turn it into the real value for its type. */
function cell(type: string, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  const s = String(v);
  switch (String(type).toUpperCase()) {
    case 'FIXED':
    case 'NUMBER':
    case 'INTEGER':
    case 'REAL':
    case 'FLOAT':
    case 'DOUBLE': {
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    }
    case 'BOOLEAN':
      return s === 'true' || s === '1';
    // The SQL API gives timestamps as seconds since the epoch, with a fraction.
    case 'TIMESTAMP_NTZ':
    case 'TIMESTAMP_LTZ':
    case 'TIMESTAMP_TZ':
    case 'TIMESTAMP':
    case 'DATETIME': {
      const d = /^-?\d+(\.\d+)?$/.test(s) ? new Date(Math.round(Number(s) * 1000)) : new Date(s);
      return Number.isNaN(d.getTime()) ? s : d.toISOString();
    }
    default:
      return s;
  }
}

interface RowType {
  name: string;
  type: string;
}
interface StatementAnswer {
  resultSetMetaData?: { numRows?: number; format?: string; rowType?: RowType[]; partitionInfo?: { rowCount?: number }[] };
  data?: unknown[][];
  statementHandle?: string;
  code?: string;
  message?: string;
}

const maxRows = (ctx: Pick<CrmCtx, 'config'>) => Math.min(Number(ctx.config.maxRows) || DEFAULT_MAX_ROWS, 1_000_000);
const apiBase = (ctx: Pick<CrmCtx, 'config'>) => `${snowflakeHost(String(ctx.config.account ?? ''))}/api/v2`;

/** Runs a statement and waits for it to finish. The JWT is the bearer; the token type header tells Snowflake it is key-pair. */
async function runStatement(ctx: CrmCtx, sql: string, bindings: Record<string, { type: string; value: string }> | undefined, rows: number): Promise<StatementAnswer> {
  const body: Record<string, unknown> = {
    statement: sql,
    timeout: 40,
    resultSetMetaData: { format: 'json' },
    parameters: { ROWS_PER_RESULTSET: String(rows), MULTI_STATEMENT_COUNT: '1' },
    ...(ctx.config.warehouse ? { warehouse: String(ctx.config.warehouse) } : {}),
    ...(ctx.config.role ? { role: String(ctx.config.role) } : {}),
    ...(bindings ? { bindings } : {}),
  };
  const head = { 'X-Snowflake-Authorization-Token-Type': 'KEYPAIR_JWT' };
  const j: StatementAnswer = await call(ctx, `${apiBase(ctx)}/statements?requestId=${crypto.randomUUID()}`, { method: 'POST', json: body, headers: head });
  if (j?.statementHandle && j?.data === undefined && j?.resultSetMetaData === undefined) {
    // 202-style: still running. Ask for the result a few times (the run's own time limit stops us beyond that).
    for (let i = 0; i < 6; i++) {
      const r: StatementAnswer = await call(ctx, `${apiBase(ctx)}/statements/${encodeURIComponent(j.statementHandle)}`, { headers: head });
      if (r?.data !== undefined || r?.resultSetMetaData?.rowType) return r;
    }
    throw new CrmError('The query is still running; it will be tried again on the next run', 503, 300);
  }
  return j ?? {};
}

/** The columns a query returns, without reading any rows. */
async function schemaOf(ctx: CrmCtx): Promise<RowType[]> {
  const { sql, bindings } = statement(ctx.config, null);
  const j = await runStatement(ctx, `SELECT * FROM (${sql}) AS curahold_s LIMIT 0`, bindings, 1);
  return j.resultSetMetaData?.rowType ?? [];
}

const toRow = (ctx: CrmCtx, schema: RowType[], r: unknown[]): RemoteRow | null => {
  const values: Record<string, unknown> = {};
  schema.forEach((f, i) => {
    if (typeOf(f.name, f.type)) values[f.name] = cell(f.type, r[i]);
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
  throw new CrmError('Snowflake is only read: nothing is written back to the warehouse');
};

export const snowflake: CrmAdapter = {
  provider: 'snowflake',
  tabular: false,
  readOnly: true,
  keyed: {
    async connect(fetcher, values, now) {
      const account = (values.account ?? '').trim();
      const user = (values.user ?? '').trim();
      snowflakeHost(account); // validates the account identifier
      if (!USER.test(user)) throw new CrmError('Enter the Snowflake user name');
      const name = (values.name ?? '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'default';
      const idColumn = (values.idColumn ?? '').trim();
      const modifiedColumn = (values.modifiedColumn ?? '').trim();
      if (!IDENT.test(idColumn)) throw new CrmError('Name the column that identifies a row (a customer id, for example)');
      if (modifiedColumn && !IDENT.test(modifiedColumn)) throw new CrmError('The modified column must be a plain column name');
      const warehouse = (values.warehouse ?? '').trim();
      const role = (values.role ?? '').trim();
      if (warehouse && !IDENT.test(warehouse)) throw new CrmError('The warehouse must be a plain name');
      if (role && !IDENT.test(role)) throw new CrmError('The role must be a plain name');
      const query = checkQuery(values.query ?? '');
      const secret = { ...(await mintJwt({ account, user, privateKey: values.privateKey ?? '' }, now)), account, user, privateKey: values.privateKey ?? '' };
      const config = { account, user, query, idColumn, modifiedColumn: modifiedColumn || null, warehouse: warehouse || null, role: role || null, name };
      // Check the query and its columns now, with the new token, so a typo is caught before the mapping screens.
      const ctx: CrmCtx = { fetch: fetcher, now: () => now, config, token: async () => secret.accessToken!, refresh: async () => secret.accessToken! };
      let fields: RowType[];
      try {
        fields = await schemaOf(ctx);
      } catch (e) {
        if (e instanceof CrmError && e.status === 403)
          throw new CrmError(`${e.message} (the key must be registered on the user with ALTER USER … SET RSA_PUBLIC_KEY, and the role must be able to read the data)`, 403);
        throw e;
      }
      if (!fields.some((f) => f.name === idColumn && typeOf(f.name, f.type))) throw new CrmError(`The query has no column called "${idColumn}"`);
      if (modifiedColumn && !fields.some((f) => f.name === modifiedColumn && typeOf(f.name, f.type))) throw new CrmError(`The query has no column called "${modifiedColumn}"`);
      return { secret, config, label: `Snowflake · ${name}`, instanceId: `${qualifiedName(account, user)}:${name}` };
    },
  },

  /** A new JWT from the key kept in the secret. */
  async refresh(ctx, secret) {
    if (!secret.privateKey || !secret.account || !secret.user) throw new CrmError('Reconnect Snowflake with the private key', 401, undefined, true);
    return mintJwt({ account: String(secret.account), user: String(secret.user), privateKey: String(secret.privateKey) }, ctx.now());
  },

  async objects(ctx): Promise<RemoteObject[]> {
    const label = String(ctx.config.name ?? 'query');
    return [{ name: QUERY_OBJECT, label, labelPlural: label, custom: true, hint: null }];
  },

  async fields(ctx): Promise<RemoteField[]> {
    return (await schemaOf(ctx))
      .map((f): RemoteField | null => {
        const type = typeOf(f.name, f.type);
        return type ? { name: f.name, label: f.name, type: f.name === ctx.config.idColumn ? 'id' : type, updatable: false } : null;
      })
      .filter((f): f is RemoteField => !!f);
  },

  async users() {
    return [];
  },

  async list(ctx, _object, opts): Promise<Page> {
    if (opts.cursor) {
      // "<handle>|<partition>": the next partition of the statement started on an earlier call.
      const [handle, part] = opts.cursor.split('|');
      const head = { 'X-Snowflake-Authorization-Token-Type': 'KEYPAIR_JWT' };
      const ans: StatementAnswer = await call(ctx, `${apiBase(ctx)}/statements/${encodeURIComponent(handle)}?partition=${encodeURIComponent(part)}`, { headers: head });
      const schema = ans.resultSetMetaData?.rowType ?? [];
      const rows = (ans.data ?? []).map((r) => toRow(ctx, schema, r)).filter((r): r is RemoteRow => !!r);
      const next = Number(part) + 1;
      const parts = ans.resultSetMetaData?.partitionInfo?.length ?? 1;
      return { rows, next: next < parts ? `${handle}|${next}` : null };
    }
    const { sql, bindings } = statement(ctx.config, ctx.config.modifiedColumn ? opts.since : null);
    const ans = await runStatement(ctx, sql, bindings, maxRows(ctx));
    const schema = ans.resultSetMetaData?.rowType ?? [];
    const rows = (ans.data ?? []).map((r) => toRow(ctx, schema, r)).filter((r): r is RemoteRow => !!r);
    const parts = ans.resultSetMetaData?.partitionInfo?.length ?? 1;
    return { rows, next: ans.statementHandle && parts > 1 ? `${ans.statementHandle}|1` : null };
  },

  update: refuse,
  create: refuse,
  url() {
    return null;
  },
};
