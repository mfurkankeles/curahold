// What every CRM or spreadsheet adapter provides to the sync engine. The
// engine never talks to a provider directly: it asks for objects, fields,
// users and pages of rows, and hands back values to write.
import type { CrmProvider, RemoteField, RemoteObject, RemoteUser } from '../../../../shared/src/sync';

export interface CrmSecret {
  accessToken?: string;
  refreshToken?: string;
  /** ms since epoch */
  expiresAt?: number;
  [k: string]: unknown;
}

export interface CrmCtx {
  fetch: typeof fetch;
  now: () => Date;
  /** Non-secret connection settings: instance URL, API domain, file id… */
  config: Record<string, any>;
  /** A valid access token, refreshed when it is about to expire. */
  token(): Promise<string>;
  /** Refreshes after the provider rejected the token. */
  refresh(): Promise<string>;
}

export interface RemoteRow {
  id: string;
  modifiedAt?: string | null;
  values: Record<string, unknown>;
}

export interface Page {
  rows: RemoteRow[];
  /** Opaque token for the next page; null when this was the last one. */
  next: string | null;
}

export interface ListOptions {
  /** Only rows changed at or after this moment (ISO). Ignored by spreadsheets. */
  since: string | null;
  cursor: string | null;
  fields: RemoteField[];
  /** Spreadsheets: the column that identifies a row. */
  key?: string;
}

export interface Connected {
  secret: CrmSecret;
  config: Record<string, unknown>;
  label: string;
  /** The CRM instance this is (org id, portal id…), to recognise a reconnect. */
  instanceId: string;
}

export interface OAuthSpec {
  /**
   * Sign in with a one-time proof (PKCE): `opts.code_challenge` is sent with the sign-in request and
   * `opts.code_verifier` with the exchange, so a code that leaks on its way back is useless to anyone else.
   */
  pkce?: boolean;
  /** `opts`: what the administrator typed first (Dynamics address, Salesforce sandbox) plus callback extras. */
  authorizeUrl(client: OAuthClient, redirectUri: string, state: string, opts: Record<string, string>): string;
  exchange(fetcher: typeof fetch, client: OAuthClient, code: string, redirectUri: string, opts: Record<string, string>, now: Date): Promise<Connected>;
}

export interface CrmAdapter {
  provider: CrmProvider;
  oauth?: OAuthSpec;
  /** Connected with what the administrator typed (address, API key) instead of a sign-in page. */
  keyed?: { connect(fetcher: typeof fetch, values: Record<string, string>, now: Date): Promise<Connected> };
  /** Only reads: nothing made or changed in Curahold is written back. */
  readOnly?: boolean;
  /** Spreadsheets read everything each time; CRMs read changes since the last run. */
  tabular: boolean;
  refresh(ctx: Omit<CrmCtx, 'token' | 'refresh'>, secret: CrmSecret, client: OAuthClient): Promise<CrmSecret>;
  objects(ctx: CrmCtx): Promise<RemoteObject[]>;
  fields(ctx: CrmCtx, object: string): Promise<RemoteField[]>;
  users(ctx: CrmCtx): Promise<RemoteUser[]>;
  list(ctx: CrmCtx, object: string, opts: ListOptions): Promise<Page>;
  /** Ids removed on the other side since `since`, when the service reports them. */
  deleted?(ctx: CrmCtx, object: string, since: string): Promise<string[]>;
  update(ctx: CrmCtx, object: string, id: string, values: Record<string, unknown>, fields: RemoteField[], key?: string): Promise<void>;
  create(ctx: CrmCtx, object: string, values: Record<string, unknown>, fields: RemoteField[], key?: string): Promise<string>;
  /** Where to open the item in the service, if it has a page for it. */
  url(config: Record<string, any>, object: string, id: string): string | null;
  /** Support tools: answer a ticket (to the customer, or as a note only the team sees). */
  reply?(ctx: CrmCtx, id: string, input: ReplyInput): Promise<void>;
}

export interface ReplyInput {
  body: string;
  /** A private note for the team: not sent to the customer. */
  internal?: boolean;
}

export interface OAuthClient {
  clientId: string;
  clientSecret: string;
}

export class CrmError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    /** Seconds to wait before retrying (rate limits). */
    readonly retryAfter?: number,
    /** Credentials no longer work: someone has to reconnect. */
    readonly auth = false,
  ) {
    super(message);
  }
}

/** Pulls the provider's own error text out of a failed response. */
export async function errorText(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  try {
    const j = JSON.parse(text);
    const first = Array.isArray(j) ? j[0] : j;
    const msg =
      first?.message ??
      first?.error?.message ??
      first?.error_description ??
      first?.errors?.[0]?.message ??
      first?.data?.[0]?.message ??
      (typeof first?.error === 'string' ? first.error : null) ??
      first?.errorCode ??
      first?.code;
    if (msg) return String(msg).slice(0, 300);
  } catch {
    // not JSON
  }
  return (text || res.statusText || `HTTP ${res.status}`).slice(0, 300);
}

/**
 * JSON request with the connection's token. Retries once after refreshing
 * an expired token; turns rate limits into a CrmError the engine can wait on.
 */
export async function call(ctx: CrmCtx, url: string, init: RequestInit & { json?: unknown } = {}, auth: 'bearer' | 'zoho' = 'bearer'): Promise<any> {
  const send = async (token: string) => {
    const headers = new Headers(init.headers);
    headers.set('authorization', auth === 'zoho' ? `Zoho-oauthtoken ${token}` : `Bearer ${token}`);
    if (!headers.has('accept')) headers.set('accept', 'application/json');
    let bodyInit = init.body;
    if (init.json !== undefined) {
      headers.set('content-type', 'application/json');
      bodyInit = JSON.stringify(init.json);
    }
    return ctx.fetch(url, { ...init, headers, body: bodyInit });
  };
  let res = await send(await ctx.token());
  if (res.status === 401) res = await send(await ctx.refresh());
  if (res.status === 429 || res.status === 503) {
    const after = Number(res.headers.get('retry-after') ?? 60);
    throw new CrmError(await errorText(res), res.status, Number.isFinite(after) ? after : 60);
  }
  if (res.status === 401 || res.status === 403) throw new CrmError(await errorText(res), res.status, undefined, res.status === 401);
  if (!res.ok) throw new CrmError(await errorText(res), res.status);
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** Standard OAuth refresh-token grant (form-encoded). */
export async function refreshGrant(
  fetcher: typeof fetch,
  tokenUrl: string,
  client: OAuthClient,
  refreshToken: string,
  now: Date,
  extra: Record<string, string> = {},
  basicAuth = false,
): Promise<CrmSecret> {
  const form = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, ...extra });
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' };
  if (basicAuth) headers.authorization = `Basic ${btoa(`${client.clientId}:${client.clientSecret}`)}`;
  else {
    form.set('client_id', client.clientId);
    form.set('client_secret', client.clientSecret);
  }
  const res = await fetcher(tokenUrl, { method: 'POST', headers, body: form });
  if (!res.ok) throw new CrmError(await errorText(res), res.status, undefined, true);
  const j: any = await res.json();
  if (!j.access_token) throw new CrmError('No access token in the refresh response', res.status, undefined, true);
  return {
    accessToken: j.access_token,
    // Some services rotate refresh tokens; keep the old one when they don't.
    refreshToken: j.refresh_token ?? refreshToken,
    expiresAt: j.expires_in ? now.getTime() + Number(j.expires_in) * 1000 : undefined,
    ...(j.instance_url ? { instanceUrl: j.instance_url } : {}),
    ...(j.api_domain ? { apiDomain: j.api_domain } : {}),
  };
}

/** Plain value out of whatever a provider returns for a field. */
export function plain(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' && x ? (x as any).name ?? (x as any).label ?? (x as any).value ?? '' : x)).join('; ');
  if (typeof v === 'object') {
    const o = v as any;
    return o.id ?? o.value ?? o.name ?? null;
  }
  return v;
}

/** Standard OAuth authorization-code grant (form-encoded). */
export async function codeGrant(
  fetcher: typeof fetch,
  tokenUrl: string,
  client: OAuthClient,
  code: string,
  redirectUri: string,
  now: Date,
  basicAuth = false,
  extra: Record<string, string> = {},
): Promise<any> {
  const form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, ...extra });
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' };
  if (basicAuth) headers.authorization = `Basic ${btoa(`${client.clientId}:${client.clientSecret}`)}`;
  else {
    form.set('client_id', client.clientId);
    form.set('client_secret', client.clientSecret);
  }
  const res = await fetcher(tokenUrl, { method: 'POST', headers, body: form });
  if (!res.ok) throw new CrmError(await errorText(res), res.status, undefined, true);
  const j: any = await res.json();
  if (!j.access_token) throw new CrmError('No access token in the response', res.status, undefined, true);
  j.expiresAt = j.expires_in ? now.getTime() + Number(j.expires_in) * 1000 : undefined;
  return j;
}

/** Bare-bones context for calls made right after sign-in, before a connection exists. */
export function oneShotCtx(fetcher: typeof fetch, now: Date, token: string, config: Record<string, any>): CrmCtx {
  return { fetch: fetcher, now: () => now, config, token: async () => token, refresh: async () => token };
}

export const isoSeconds = (iso: string) => iso.replace(/\.\d{3}Z$/, 'Z');
