// Self-hosted outbound calls: names are resolved and checked before connecting,
// redirects too (api/src/lib/outbound.ts).
import { describe, expect, it } from 'vitest';
import { guardedFetch, privateAddress } from '../api/src/lib/outbound';
import { outboundFetch } from '../api/src/selfhost';

const DNS: Record<string, string[]> = {
  'hooks.example.com': ['93.184.216.34'],
  'rebind.example.com': ['10.0.0.5'],
  'mixed.example.com': ['93.184.216.34', '127.0.0.1'],
  'six.example.com': ['2606:2800:220:1:248:1893:25c8:1946'],
  'meta.example.com': ['169.254.169.254'],
  'ula.example.com': ['fd00::1'],
  'mapped.example.com': ['::ffff:192.168.1.1'],
};
const resolve = async (h: string) => DNS[h] ?? [];

function stub() {
  const calls: string[] = [];
  const base = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    if (url.includes('/hop-private')) return new Response(null, { status: 302, headers: { location: 'https://rebind.example.com/x' } });
    if (url.includes('/hop-public')) return new Response(null, { status: 302, headers: { location: '/landed' } });
    return new Response('ok');
  }) as typeof fetch;
  return { calls, base };
}

describe('outbound address checks (self-host)', () => {
  it('knows private, local and link-local addresses, v4 and v6', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', '224.0.0.1'])
      expect(privateAddress(ip), ip).toBe(true);
    for (const ip of ['93.184.216.34', '8.8.8.8', '2606:2800:220:1:248:1893:25c8:1946']) expect(privateAddress(ip), ip).toBe(false);
  });

  it('refuses a name that resolves to a private address, before any connection', async () => {
    const { calls, base } = stub();
    const f = guardedFetch(base, resolve);
    expect((await f('https://hooks.example.com/a', { method: 'POST' })).status).toBe(200);
    expect((await f('https://six.example.com/a')).status).toBe(200);
    for (const h of ['rebind', 'mixed', 'meta', 'ula', 'mapped', 'unknown']) await expect(f(`https://${h}.example.com/a`)).rejects.toThrow(/refused/);
    await expect(f('https://127.0.0.1/a')).rejects.toThrow(/refused/);
    expect(calls).toEqual(['https://hooks.example.com/a', 'https://six.example.com/a']);
  });

  it('checks every redirect, and leaves manual redirects to the caller', async () => {
    const { calls, base } = stub();
    const f = guardedFetch(base, resolve);
    await expect(f('https://hooks.example.com/hop-private')).rejects.toThrow(/refused/);
    expect((await f('https://hooks.example.com/hop-public')).status).toBe(200);
    expect(calls.at(-1)).toBe('https://hooks.example.com/landed');
    expect((await f('https://hooks.example.com/hop-private', { redirect: 'manual' })).status).toBe(302);
  });

  it('lets listed internal hosts and the install itself through; can be switched off', async () => {
    const f = outboundFetch({ PUBLIC_URL: 'https://curahold.corp.example', OUTBOUND_ALLOW_HOSTS: 'sso.corp.example' });
    expect(typeof f).toBe('function');
    expect(outboundFetch({ OUTBOUND_ALLOW_PRIVATE: '1' })).toBeUndefined();
    const { base } = stub();
    const g = guardedFetch(base, resolve, new Set(['rebind.example.com']));
    expect((await g('https://rebind.example.com/a')).status).toBe(200);
  });
});
