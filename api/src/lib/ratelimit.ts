// Request limits: how much one address, one person and one company may ask of
// Curahold in a short time, with tighter budgets of their own for the doors an
// attacker leans on (signing in, invitations, portal links, search, export and
// the AI connector).
//
// Design (no running cost, nothing new to operate):
// - Token buckets held in memory. On Cloudflare Workers each isolate keeps its
//   own (isolates share no memory), so a limit there is "per isolate": a burst
//   from one place lands on one or a few isolates and is cut; a patient attacker
//   spread over many colos gets more. Self-hosted, one Node process sees every
//   request and the limit is exact.
// - Where a number must hold exactly whatever the isolate (emails sent on the
//   company's behalf), the database counts instead: sign-in links per address
//   (routes/auth.ts), portal codes (portal_* functions), help requests, and
//   invitations per company per hour (app_invites_last_hour, migration 0050).
// - Over budget: 429, a Retry-After header in seconds, and a plain sentence in
//   the person's language. Nothing is deducted for a refused request.
//
// Alternatives weighed (SECURITY.md has the full note): Cloudflare's Rate
// Limiting rules (exact at the edge, but the free plan allows one rule and the
// person or company is not known there), the Workers rate-limit binding
// (per colo, still per-isolate-like, would tie the code to Cloudflare), a
// Durable Object per company (exact, but a paid request on every API call),
// and a database counter on every request (exact, one more write per request).
import type { Context } from 'hono';
import { bcp47Of, normalizeLocale, translate, type Locale } from '../../../shared/src/i18n';

export interface Budget {
  /** How many requests may come at once. */
  cap: number;
  /** How quickly the allowance comes back, in requests per second. */
  perSec: number;
}

/**
 * The budgets. A person opening pages, typing in search and dragging cards
 * stays far inside them (the heaviest page asks for about 20 things at once and
 * the app then waits 10 s between live checks); a script hammering the API does
 * not. Changing one here changes it everywhere; tests/ratelimit.test.ts holds
 * both sides.
 */
export const BUDGETS = {
  /** Everything from one network address: an office behind one router counts as one. */
  ip: { cap: 600, perSec: 20 },
  /** Every API call one person makes (browser, API key and AI connector together). */
  person: { cap: 300, perSec: 10 },
  /** Changes by one person. */
  write: { cap: 120, perSec: 4 },
  /** Everything one company's people and keys ask, together. */
  company: { cap: 6000, perSec: 200 },
  /** Sign-in, sign-up, code and token steps from one address. */
  signin: { cap: 20, perSec: 1 / 6 },
  /** The same steps for one company, from anywhere. */
  signinCompany: { cap: 200, perSec: 2 },
  /** Invitations (people and portal contacts) one person sends. */
  invite: { cap: 30, perSec: 1 / 60 },
  /** Invitations for one company. */
  inviteCompany: { cap: 100, perSec: 1 / 30 },
  /** Search (Ctrl K and the AI connector's search). */
  search: { cap: 60, perSec: 2 },
  /** Exports: deep pages of a list, personal-data and audit exports. */
  export: { cap: 30, perSec: 1 / 4 },
  /** The AI connector, per connection. */
  mcp: { cap: 60, perSec: 1 },
  /** The AI connector, per company. */
  mcpCompany: { cap: 300, perSec: 5 },
} satisfies Record<string, Budget>;
export type BudgetName = keyof typeof BUDGETS;

/** Invitations one company may send in an hour, counted in the database (exact everywhere). */
export const INVITES_PER_HOUR = 200;

interface Bucket {
  tokens: number;
  at: number;
}

/** In-memory token buckets, bounded so a flood of new keys cannot grow memory without end. */
export class Limiter {
  private buckets = new Map<string, Bucket>();
  constructor(
    private maxKeys = 50_000,
    private clock: () => number = () => Date.now(),
  ) {}

  /** Takes one request from the bucket; 0 when allowed, else the seconds to wait. */
  take(key: string, b: Budget, scale = 1): number {
    const cap = b.cap * scale;
    const rate = b.perSec * scale;
    const now = this.clock();
    let s = this.buckets.get(key);
    if (s) {
      s.tokens = Math.min(cap, s.tokens + ((now - s.at) / 1000) * rate);
      s.at = now;
      // Most recently used last: the oldest is the first to go when full.
      this.buckets.delete(key);
    } else {
      s = { tokens: cap, at: now };
      if (this.buckets.size >= this.maxKeys) this.buckets.delete(this.buckets.keys().next().value as string);
    }
    this.buckets.set(key, s);
    if (s.tokens >= 1) {
      s.tokens -= 1;
      return 0;
    }
    return Math.max(1, Math.ceil((1 - s.tokens) / rate));
  }

  get size() {
    return this.buckets.size;
  }
}

/** The one limiter of this isolate or process (a Worker builds the app per request; buckets must outlive that). */
export const sharedLimiter = new Limiter();

// ---------------------------------------------------------------- classes of route

const SIGNIN = [
  /^\/api\/auth\/(start|verify|device)$/,
  /^\/api\/join$/,
  /^\/api\/signup\/(start|verify|complete)$/,
  /^\/api\/desk\/sign-in(\/verify)?$/,
  /^\/api\/support\/enter(-link)?$/,
  /^\/api\/sso\/[^/]+\/(start|saml\/acs|oidc\/callback)$/,
  /^\/api\/auth\/oauth\/[^/]+\/start$/,
  /^\/oauth\/(token|register|authorize)$/,
  /^\/papi\/auth\/(start|verify|code|password|passkey|passkey\/options|forgot|reset)$/,
  /^\/papi\/auth\/oauth\/[^/]+\/start$/,
];
const INVITE = [/^\/api\/admin\/users$/, /^\/api\/setup\/people$/, /^\/api\/portal\/users(\/[^/]+\/resend)?$/, /^\/api\/admin\/join-requests\/[^/]+\/approve$/];
const EXPORTS = [/^\/api\/admin\/users\/[^/]+\/export$/, /^\/api\/admin\/audit$/, /^\/api\/me\/export$/];

export const isSignIn = (method: string, path: string) =>
  (method === 'POST' || /\/(start|authorize|callback)$/.test(path)) && SIGNIN.some((r) => r.test(path));
export const isInvite = (method: string, path: string) => method === 'POST' && INVITE.some((r) => r.test(path));
export const isSearch = (method: string, path: string) => method === 'GET' && path === '/api/search';
/** An export reads the whole of something: a named export, or a list read past its first pages. */
export const isExport = (method: string, path: string, url: URL) =>
  method === 'GET' && (EXPORTS.some((r) => r.test(path)) || Number(url.searchParams.get('offset') ?? 0) >= 1000);
export const isWrite = (method: string) => method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';

// ---------------------------------------------------------------- who is asking

export type ClientIpMode = 'cf' | 'proxy' | 'socket';

/**
 * The caller's network address, as far as it can be trusted:
 * - 'cf': Cloudflare's own header (a client cannot set it through Cloudflare);
 * - 'proxy': self-hosted behind the reverse proxy the install guide requires: the
 *   last address in X-Forwarded-For (the one the proxy added), else the socket;
 * - 'socket': the connection itself (local development).
 * Unknown (tests, an entry that does not say): null, and no address limit applies.
 */
export function clientIp(c: Context, mode: ClientIpMode | undefined): string | null {
  if (!mode) return null;
  if (mode === 'cf') return c.req.header('cf-connecting-ip') ?? null;
  const socket = (c.env as any)?.incoming?.socket?.remoteAddress as string | undefined;
  if (mode === 'proxy') {
    const xff = c.req.header('x-forwarded-for');
    const last = xff?.split(',').map((s) => s.trim()).filter(Boolean).pop();
    return last ?? socket ?? null;
  }
  return socket ?? null;
}

// ---------------------------------------------------------------- the answer

/** "40 seconds", "3 minutes", "23 hours" in the person's language (a daily limit waits hours, not 1,440 minutes). */
export function waitText(locale: Locale, seconds: number) {
  const tag = bcp47Of(locale);
  try {
    return seconds >= 90 * 60
      ? new Intl.NumberFormat(tag, { style: 'unit', unit: 'hour', unitDisplay: 'long' }).format(Math.ceil(seconds / 3600))
      : seconds >= 90
      ? new Intl.NumberFormat(tag, { style: 'unit', unit: 'minute', unitDisplay: 'long' }).format(Math.ceil(seconds / 60))
      : new Intl.NumberFormat(tag, { style: 'unit', unit: 'second', unitDisplay: 'long' }).format(seconds);
  } catch {
    return `${seconds} s`;
  }
}

/** 429 with Retry-After and a sentence a person can act on. */
export function limited(c: Context, seconds: number, locale?: Locale) {
  const want = c.req.header('x-curahold-locale');
  const loc = locale ?? (want ? normalizeLocale(want) : 'en');
  return c.json(
    { error: 'too_many_requests', message: translate(loc, 'errors.rate_limited', { wait: waitText(loc, seconds) }), retryAfter: seconds },
    429,
    { 'retry-after': String(seconds) },
  );
}

/** Runs several buckets; the first one that is empty decides the wait. */
export function takeAll(limiter: Limiter, scale: number, checks: [key: string, budget: BudgetName][]): number {
  for (const [key, name] of checks) {
    const wait = limiter.take(key, BUDGETS[name], scale);
    if (wait) return wait;
  }
  return 0;
}
