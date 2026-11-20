// Outbound calls on a self-hosted install: webhooks, chat webhooks, CRMs and
// every other connector reach public addresses only. Each host name is resolved and
// every address checked before the call; a name that points at this machine or
// a private network is refused, and so is a redirect to one (each hop checked).
//
// The hosted service runs on Workers, whose network does not reach private
// addresses; there the address checks in the routes (privateHost) are enough.
// Residual risk: a name that changes its answer between the check and the
// connection (DNS rebinding) — the self-hosting guide recommends an egress
// firewall as the second line. OUTBOUND_ALLOW_HOSTS lists internal hosts that
// may be called (an identity provider or CRM inside the company);
// OUTBOUND_ALLOW_PRIVATE=1 turns the check off.

export type Resolve = (host: string) => Promise<string[]>;

function v4Private(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return (
    a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0 && p[2] === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224
  );
}

/** Is this resolved address this machine, a private network, link-local, or otherwise not public? */
export function privateAddress(raw: string): boolean {
  const ip = raw.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return v4Private(ip);
  if (!ip.includes(':')) return true;
  // IPv4 inside IPv6 (::ffff:10.0.0.1, ::10.0.0.1, 64:ff9b::10.0.0.1)
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(ip)?.[1];
  if (v4) return v4Private(v4);
  if (ip === '::' || ip === '::1') return true;
  const first = parseInt(ip.split(':')[0] || '0', 16);
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true; // multicast
  if (ip.startsWith('::ffff:') || ip.startsWith('64:ff9b:')) return true; // mapped forms written in hex
  return false;
}

const hostOf = (input: RequestInfo | URL): URL => new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);

/** Thrown when an outside call would reach a private, local or otherwise forbidden address. */
export class BlockedAddress extends TypeError {
  constructor(host: string) {
    super(`outbound call to ${host} refused: it is not a public address`);
  }
}

/**
 * Refuses an outside call whose host is, or resolves to, a private or local address, unless the host is in `allow`
 * (OUTBOUND_ALLOW_*). Stops server-side request forgery through webhooks and connector addresses.
 */
export async function checkOutbound(url: URL, resolve: Resolve, allow: ReadonlySet<string>): Promise<void> {
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (allow.has(host)) return;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) {
    if (privateAddress(host)) throw new BlockedAddress(host);
    return;
  }
  const addresses = await resolve(host).catch(() => [] as string[]);
  if (!addresses.length || addresses.some(privateAddress)) throw new BlockedAddress(host);
}

const MAX_HOPS = 5;

/** A fetch that checks every address it is about to call, redirects included. */
export function guardedFetch(base: typeof fetch, resolve: Resolve, allow: ReadonlySet<string> = new Set()): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    let url = hostOf(input);
    await checkOutbound(url, resolve, allow);
    const follow = !init?.redirect || init.redirect === 'follow';
    if (!follow) return base(input, init);
    let req: RequestInfo | URL = input;
    let opts: RequestInit = { ...init, redirect: 'manual' };
    for (let hop = 0; ; hop++) {
      const res = await base(req, opts);
      const loc = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
      if (!loc) return res;
      if (hop >= MAX_HOPS) throw new TypeError('too many redirects');
      url = new URL(loc, url);
      await checkOutbound(url, resolve, allow);
      // 303 (and 301/302 after a POST, as browsers do) continue as GET without a body.
      const asGet = res.status === 303 || ((res.status === 301 || res.status === 302) && (opts.method ?? 'GET').toUpperCase() === 'POST');
      opts = asGet ? { ...opts, method: 'GET', body: undefined } : opts;
      req = url.href;
    }
  }) as typeof fetch;
}
