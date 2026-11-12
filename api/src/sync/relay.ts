// Salesforce asks partner apps to renew their tokens from addresses it knows
// in advance. A Worker has no fixed address of its own, so when a relay is set
// up (tools/relay, on a small server with one), Salesforce's token requests —
// and nothing else — go through it. Without a relay everything goes direct.
import { fetchOf, type Deps } from '../context';

export interface Relay {
  url: string;
  key: string;
}

/** The one address worth relaying: Salesforce's token endpoint, on its login hosts or a company's own domain. */
export function isSalesforceToken(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && !u.username && !u.port && /(^|\.)salesforce\.com$/.test(u.hostname) && u.pathname === '/services/oauth2/token' && !u.search;
  } catch {
    return false;
  }
}

export function viaRelay(fetcher: typeof fetch, relay: Relay | undefined): typeof fetch {
  if (!relay) return fetcher;
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (!isSalesforceToken(url)) return fetcher(input, init);
    const headers = new Headers(init?.headers);
    headers.set('x-relay-key', relay.key);
    headers.set('x-relay-target', url);
    return fetcher(relay.url, { ...init, headers });
  }) as typeof fetch;
}

/** The way out for a CRM's requests: through the relay where that CRM needs one. */
export function crmFetch(deps: Deps, provider: string): typeof fetch {
  return provider === 'salesforce' ? viaRelay(fetchOf(deps), deps.config.connectors.salesforceRelay) : fetchOf(deps);
}
