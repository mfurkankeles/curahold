// Vendor mocks: pretend third-party services that follow each vendor's public API contract closely
// enough for a customer-style run (sign-in, token refresh, pagination, rate-limit headers, error
// shapes), so every integration can be connected, synced, broken and reconnected without a real
// account. One file per vendor; each registers a VendorMock in ./index.ts. A new vendor plugs in by
// adding its file and one line in the registry.
//
// The mocks answer through the app's injected fetch (deps.fetch), routed by host name. They are used
// by tests/integrations-onboarding.test.ts (regression) and scripts/integrations/onboard.ts (timed runs).

export type Fault =
  /** The next authorised call answers 401 once (an access token that expired early): the app must refresh and carry on. */
  | 'expired'
  /** Sign-in withdrawn on the vendor's side: every call answers 401 and the refresh is refused. */
  | 'revoked'
  /** The next call answers 429 with the vendor's own rate-limit headers. */
  | 'ratelimit'
  /** The next write answers 400 with the vendor's own "bad field" error. */
  | 'badfield';

export interface MockReq {
  method: string;
  url: URL;
  headers: Headers;
  /** Parsed JSON or form body (form bodies become a plain object); null when empty. */
  body: any;
  raw: string;
}

export interface Ctl {
  /** Takes a pending fault of this kind (true once per armed fault). */
  take(kind: Fault): boolean;
  /** Is the sign-in withdrawn? */
  revoked(): boolean;
  /** The current moment of the run. */
  now(): Date;
  /** Issues a token pair (access + refresh) for an authorisation code or a refresh, through the shared token book. */
  tokens: TokenBook;
}

export interface VendorMock {
  /** Curahold's provider id (shared/src/sync CrmProvider), or a family id for our own surfaces. */
  id: string;
  /** Hosts this vendor answers for. */
  hosts: RegExp;
  /** What a non-technical admin types or pastes to connect with a key (absent: OAuth sign-in). */
  keyValues?: Record<string, string>;
  /** Extra query for the sign-in start (Dynamics address, sandbox…). */
  startQuery?: Record<string, string>;
  handle(req: MockReq, ctl: Ctl): Promise<Response> | Response;
  /** The vendor's own consent page answer: where the browser goes after "Allow" (code + state on the redirect). */
  consent?(authorizeUrl: URL, ctl: Ctl): string;
  /** Somebody renames the second sample customer on the vendor's side (returns its remote id). */
  remoteEdit?(ctl: Ctl, name: string): { id: string };
  /** What a write from Curahold changed there, for the "both ways" check. */
  remoteRow?(object: string, id: string): Record<string, unknown> | undefined;
  /** Fresh sample data (invented names only). */
  reset(): void;
}

/** Access and refresh tokens, codes and their PKCE challenges, shared by every OAuth mock. */
export class TokenBook {
  private codes = new Map<string, { challenge?: string; vendor: string; extra?: Record<string, string> }>();
  private access = new Map<string, { vendor: string; exp: number }>();
  private refresh = new Map<string, string>();
  private n = 0;
  constructor(private clock: () => Date) {}
  code(vendor: string, challenge?: string, extra?: Record<string, string>) {
    const c = `code-${vendor}-${++this.n}`;
    this.codes.set(c, { challenge, vendor, extra });
    return c;
  }
  /** authorization_code grant; PKCE checked when a challenge was sent. Returns null for an unknown or reused code. */
  async redeem(vendor: string, code: string, verifier?: string) {
    const c = this.codes.get(code);
    if (!c || c.vendor !== vendor) return null;
    this.codes.delete(code);
    if (c.challenge) {
      if (!verifier) return null;
      const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
      const b64 = btoa(String.fromCharCode(...d)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      if (b64 !== c.challenge) return null;
    }
    return { ...this.issue(vendor), extra: c.extra };
  }
  issue(vendor: string, ttl = 3600) {
    const a = `at-${vendor}-${++this.n}`;
    const r = `rt-${vendor}-${this.n}`;
    this.access.set(a, { vendor, exp: this.clock().getTime() + ttl * 1000 });
    this.refresh.set(r, vendor);
    return { access_token: a, refresh_token: r, expires_in: ttl, token_type: 'Bearer' };
  }
  /** refresh_token grant, rotating the refresh token (the old one stops working). */
  rotate(vendor: string, token: string) {
    if (this.refresh.get(token) !== vendor) return null;
    this.refresh.delete(token);
    return this.issue(vendor);
  }
  valid(vendor: string, bearer: string | null) {
    const t = bearer?.replace(/^(Bearer|Zoho-oauthtoken)\s+/i, '') ?? '';
    const a = this.access.get(t);
    return !!a && a.vendor === vendor && a.exp > this.clock().getTime();
  }
  /** Ends every access token of a vendor early (refresh tokens keep working). */
  forget(vendor: string) {
    for (const [k, v] of this.access) if (v.vendor === vendor) this.access.delete(k);
  }
}

export interface CallLog {
  vendor: string;
  method: string;
  url: string;
  status: number;
  ms: number;
}

export interface VendorWorld {
  fetch: typeof fetch;
  calls: CallLog[];
  /** Arms a fault for a vendor (times: how many calls it hits; revoked lasts until cleared). */
  arm(vendor: string, kind: Fault, times?: number): void;
  clear(vendor: string): void;
  ctl(vendor: string): Ctl;
  mock(vendor: string): VendorMock;
  tokens: TokenBook;
}

/**
 * A fetch that answers for every registered vendor, with a realistic latency per call
 * (default 0 in tests; the timed runner uses the per-vendor figure stated in its report).
 * Anything not registered answers 502, so an unmocked call is seen at once and never leaves the machine.
 */
export function vendorWorld(mocks: VendorMock[], opts: { latencyMs?: (vendor: string) => number; now?: () => Date } = {}): VendorWorld {
  const now = opts.now ?? (() => new Date());
  const tokens = new TokenBook(now);
  const faults = new Map<string, Map<Fault, number>>();
  const calls: CallLog[] = [];
  const ctlFor = (vendor: string): Ctl => ({
    take(kind) {
      const f = faults.get(vendor);
      const left = f?.get(kind) ?? 0;
      if (left <= 0) return false;
      f!.set(kind, left - 1);
      return true;
    },
    revoked: () => (faults.get(vendor)?.get('revoked') ?? 0) > 0,
    now,
    tokens,
  });
  const fetcher = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const req = input instanceof Request ? input : null;
    const url = new URL(req ? req.url : String(input));
    const mock = mocks.find((m) => m.hosts.test(url.host));
    const started = Date.now();
    if (!mock) {
      calls.push({ vendor: '?', method: init.method ?? 'GET', url: url.toString(), status: 502, ms: 0 });
      return new Response(`no vendor mock for ${url.host}`, { status: 502 });
    }
    const delay = opts.latencyMs?.(mock.id) ?? 0;
    if (delay) await new Promise((r) => setTimeout(r, delay));
    const raw = init.body instanceof URLSearchParams ? init.body.toString() : typeof init.body === 'string' ? init.body : init.body ? await new Response(init.body).text() : '';
    const headers = new Headers(init.headers);
    let body: any = null;
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = Object.fromEntries(new URLSearchParams(raw));
      }
    }
    const res = await mock.handle({ method: (init.method ?? 'GET').toUpperCase(), url, headers, body, raw }, ctlFor(mock.id));
    calls.push({ vendor: mock.id, method: init.method ?? 'GET', url: url.toString(), status: res.status, ms: Date.now() - started });
    return res;
  }) as typeof fetch;
  return {
    fetch: fetcher,
    calls,
    tokens,
    arm(vendor, kind, times = 1) {
      const f = faults.get(vendor) ?? new Map<Fault, number>();
      f.set(kind, kind === 'revoked' ? Number.MAX_SAFE_INTEGER : (f.get(kind) ?? 0) + times);
      faults.set(vendor, f);
    },
    clear(vendor) {
      faults.delete(vendor);
    },
    ctl: ctlFor,
    mock(vendor) {
      const m = mocks.find((x) => x.id === vendor);
      if (!m) throw new Error(`no mock ${vendor}`);
      return m;
    },
  };
}

// ---------------------------------------------------------------- helpers for vendor files

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(data, { status, headers });

/** Standard OAuth token endpoint (form or JSON body): authorization_code with optional PKCE, refresh_token with rotation. */
export async function tokenEndpoint(vendor: string, req: MockReq, ctl: Ctl, extra: (issued: Record<string, unknown>) => Record<string, unknown> = () => ({})) {
  const b = req.body ?? {};
  if (b.grant_type === 'authorization_code') {
    const t = await ctl.tokens.redeem(vendor, b.code, b.code_verifier);
    if (!t) return json({ error: 'invalid_grant', error_description: 'authorization code is invalid or expired' }, 400);
    const { extra: _e, ...tok } = t;
    return json({ ...tok, ...extra(tok) });
  }
  if (b.grant_type === 'refresh_token') {
    if (ctl.revoked()) return json({ error: 'invalid_grant', error_description: 'expired access/refresh token' }, 400);
    const t = ctl.tokens.rotate(vendor, b.refresh_token);
    if (!t) return json({ error: 'invalid_grant', error_description: 'refresh token is invalid' }, 400);
    return json({ ...t, ...extra(t) });
  }
  return json({ error: 'unsupported_grant_type' }, 400);
}

/**
 * Checks the bearer token and applies armed faults in the order a vendor would hit them.
 * Returns a Response to send back (the vendor's own error shape), or null to go on.
 */
export function gate(vendor: string, req: MockReq, ctl: Ctl, shapes: { unauthorized: () => Response; limited: () => Response }, opts: { key?: (auth: string | null) => boolean } = {}) {
  const auth = req.headers.get('authorization');
  if (ctl.revoked()) return shapes.unauthorized();
  const ok = opts.key ? opts.key(auth) : ctl.tokens.valid(vendor, auth);
  if (!ok) return shapes.unauthorized();
  if (ctl.take('expired')) {
    ctl.tokens.forget(vendor);
    return shapes.unauthorized();
  }
  if (ctl.take('ratelimit')) return shapes.limited();
  return null;
}

/** The consent page's "Allow": back to the app's callback with a fresh code and the state it was given. */
export function allow(vendor: string, u: URL, ctl: Ctl, extra: Record<string, string> = {}) {
  const back = new URL(u.searchParams.get('redirect_uri')!);
  back.searchParams.set('code', ctl.tokens.code(vendor, u.searchParams.get('code_challenge') ?? undefined));
  back.searchParams.set('state', u.searchParams.get('state')!);
  for (const [k, v] of Object.entries(extra)) back.searchParams.set(k, v);
  return back.toString();
}

export const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, '.000+0000');
